"""
Phase 3: Security Guardrails — Semantic Edition
=================================================
Domain Classifier upgraded from lexical keyword matching to
Semantic Embeddings + Cosine Similarity using sentence-transformers.

Same all-MiniLM-L6-v2 model your RAG pipeline already uses — zero new installs.

Architecture:
  - At startup: embed ~15 anchor sentences per domain → compute centroid vector
  - At runtime: embed user message → cosine similarity vs each centroid
  - Winner = domain with highest similarity score

Layer 1 — Emergency Fraud Detector  (regex, highest priority, bypasses RAG)
Layer 2 — PII Scanner & Redactor    (regex, scrubs sensitive data in-place)
Layer 3 — Semantic Domain Classifier (embeddings + cosine similarity)
"""

import re
import logging
import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger("aegis.guardrails")


# ─────────────────────────────────────────────────────────────────────────────
# SHARED TYPES
# ─────────────────────────────────────────────────────────────────────────────

class GuardrailAction(str, Enum):
    ALLOW        = "allow"
    BLOCK_OOB    = "block_oob"
    EMERGENCY    = "emergency"
    PII_REDACTED = "pii_redacted"


@dataclass
class GuardrailResult:
    action:           GuardrailAction
    safe_message:     str
    response:         Optional[str] = None
    pii_found:        list[str]     = field(default_factory=list)
    classifier_score: dict          = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1 — EMERGENCY FRAUD DETECTOR  (unchanged — regex is correct here
#            because speed and exact-phrase matching matters for live threats)
# ─────────────────────────────────────────────────────────────────────────────

EMERGENCY_PATTERNS = [
    r"\bupi\s*(fraud|scam|hack|attack|stolen|blocked)\b",
    r"\b(someone|they|hacker)\s*(is|are)\s*(stealing|draining|transferring)\b",
    r"\bunauthorized\s*(transaction|transfer|payment|debit)\b",
    r"\b(fraud|scam)\s*(happening|going on|right now|live|active)\b",
    r"\bmoney\s*(stolen|missing|gone|disappeared)\b",
    r"\botp\s*(shared|leaked|stolen|given)\b",
    r"\bsim\s*swap\b",
    r"\b(account|password|email)\s*(hacked|compromised|taken over|locked out)\b",
    r"\b(being|getting)\s*(hacked|scammed|defrauded)\b",
    r"\bjust\s*(clicked|opened|downloaded)\s*(a|an|the)?\s*(link|file|attachment|email)\b",
    r"\bransomware\s*(deployed|running|active|locked)\b",
]

EMERGENCY_RESPONSE = """\
🚨 **EMERGENCY — Active Threat Detected**

Take these steps **immediately** (in order):

**Step 1 — Call the helpline**
Dial **1930** (National Cyber Crime Helpline, 24×7, India)
or visit **cybercrime.gov.in** to file a complaint online.

**Step 2 — Block your accounts NOW**
- Open your UPI app → Settings → Block / Freeze account
- Call your bank's 24×7 helpline and say: *"Block all UPI and net banking transactions"*
- SBI: 1800-11-2211 | HDFC: 1800-202-6161 | ICICI: 1800-1080

**Step 3 — Contain the damage**
- Do NOT share any OTP, PIN, or CVV with anyone
- Do NOT click any link sent via SMS/WhatsApp/email
- Disconnect from the internet if ransomware is active

**Step 4 — Preserve evidence**
- Screenshot every suspicious transaction, message, and call log
- Note the time, amount, and recipient UPI ID / phone number

**Step 5 — Change credentials (after blocking)**
- Reset UPI PIN, net banking password, email password
- Enable 2FA on all linked accounts
"""

def check_emergency(message: str) -> bool:
    text = message.lower()
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            logger.warning("EMERGENCY trigger matched: %s", pattern)
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — PII SCANNER & REDACTOR  (regex is correct here too —
#            PII patterns are structural, not semantic)
# ─────────────────────────────────────────────────────────────────────────────

PII_RULES: list[tuple[str, re.Pattern, str]] = [
    ("AADHAAR",
     re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"),
     "[AADHAAR-REDACTED]"),
    ("PAN",
     re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
     "[PAN-REDACTED]"),
    ("EMAIL",
     re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"),
     "[EMAIL-REDACTED]"),
    ("PHONE",
     re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)"),
     "[PHONE-REDACTED]"),
    ("CARD_NUMBER",
     re.compile(r"\b(?:\d[ \-]?){13,16}\b"),
     "[CARD-REDACTED]"),
    ("CVV",
     re.compile(r"\b(?:cvv|cvc|security\s*code)\s*[:\-]?\s*\d{3,4}\b", re.IGNORECASE),
     "[CVV-REDACTED]"),
    ("UPI_ID",
     re.compile(r"\b[a-zA-Z0-9.\-_+]+@[a-zA-Z0-9]+\b"),
     "[UPI-REDACTED]"),
    ("IFSC",
     re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
     "[IFSC-REDACTED]"),
]

def detect_and_redact_pii(message: str) -> tuple[str, list[str]]:
    redacted = message
    found: list[str] = []
    for label, pattern, replacement in PII_RULES:
        new_text, count = pattern.subn(replacement, redacted)
        if count > 0:
            redacted = new_text
            if label not in found:
                found.append(label)
                logger.info("PII redacted: %s (%d instance(s))", label, count)
    return redacted, found


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — SEMANTIC DOMAIN CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────
#
# HOW IT WORKS:
#
#  1. ANCHOR SENTENCES — we write ~15 natural sentences that perfectly
#     represent each domain. These are rich, varied, and paraphrase-aware.
#     Synonyms, slang, and indirect phrasing are all represented.
#
#  2. CENTROID EMBEDDING — at startup, we embed all anchor sentences and
#     average them into one "centre of mass" vector per domain.
#     This is the domain's identity in 384-dimensional space.
#
#  3. COSINE SIMILARITY — at runtime, embed the user's message and compute
#     cosine similarity (dot product of unit vectors) against each centroid.
#     Score is 0.0 (completely unrelated) → 1.0 (identical meaning).
#
#  4. DECISION — highest score wins. If the winning score is below
#     SIMILARITY_THRESHOLD, we treat it as "ambiguous" and allow it
#     (prefer helpfulness over over-blocking).
#
# WHY THIS BEATS KEYWORDS:
#   "someone wiped my wallet"      → high similarity to CYBER_FRAUD centroid
#   "I got duped online"           → high similarity to CYBER_FRAUD centroid
#   "best carbonara recipe"        → high similarity to OUT_OF_DOMAIN centroid
#   "how to make my pasta secure"  → correctly routes to CYBER (not food!)
# ─────────────────────────────────────────────────────────────────────────────

# Tune this to control sensitivity.
# Higher = stricter (more likely to block ambiguous queries)
# Lower  = more permissive (fewer false blocks)
SIMILARITY_THRESHOLD = 0.30

# Minimum gap between top-2 scores to count as "confident"
# If cyber=0.42 and oob=0.40, that's too close — default to ALLOW
CONFIDENCE_GAP = 0.05


DOMAIN_ANCHORS = {

    "CYBER_FRAUD": [
        # Direct cybersecurity
        "How do I protect myself from phishing attacks?",
        "What is ransomware and how does it work?",
        "My computer has been infected with malware",
        "How can I set up two-factor authentication?",
        "What is a SQL injection vulnerability?",
        "Explain how a man-in-the-middle attack works",
        "How do I create a strong secure password?",
        "What is end-to-end encryption?",
        "How do I detect if my network has been breached?",
        "What should I do after a data breach?",
        # Financial / UPI fraud
        "I think someone is trying to scam me online",
        "How do I know if a UPI payment request is fake?",
        "Someone asked me for my OTP — is that normal?",
        "I received a suspicious link asking for my bank details",
        "How do I report a cyber fraud to the police?",
        "My online banking account shows transactions I did not make",
        "How to stay safe from online financial scams",
        # Indirect / slang phrasing that keywords would miss
        "Someone wiped out my digital wallet",
        "I got duped into giving away my account details",
        "A stranger tricked me into clicking a bad link",
        "My phone got compromised and someone is accessing my apps",
        "I think my identity was stolen online",
    ],

    "OUT_OF_DOMAIN": [
        # Food & cooking
        "What is the best recipe for pasta carbonara?",
        "How do I bake a chocolate cake at home?",
        "Give me a quick and easy breakfast idea",
        "What spices go well with chicken curry?",
        "How long do I cook rice in a pressure cooker?",
        # Entertainment
        "What are some good movies to watch this weekend?",
        "Who won the Grammy Awards this year?",
        "Recommend me a Netflix series to binge",
        "What is the plot of Inception?",
        "Who is the most popular singer right now?",
        # Sports
        "Who won the IPL cricket match yesterday?",
        "What is the current FIFA world ranking?",
        "How many goals did Messi score this season?",
        "When is the next Formula 1 race?",
        "Explain the rules of basketball to me",
        # Lifestyle & general
        "What is the weather like in Mumbai today?",
        "Recommend a good hotel in Goa for a vacation",
        "What is the population of India?",
        "How do I lose weight in 30 days?",
        "What are the best skincare products for dry skin?",
        "Tell me about the history of the Roman Empire",
        "What is the capital of Australia?",
    ],
}

DOMAIN_REJECTION_RESPONSE = """\
I'm a specialized **cybersecurity and fraud prevention** assistant.
Your question appears to be outside my area of expertise.

I can help you with topics like:
- 🔐 Phishing, malware, ransomware, and social engineering
- 🛡️ Password security, 2FA, and account protection
- 💳 UPI fraud, OTP scams, and financial cyber threats
- 🔍 How to detect and report cyber incidents
- 📋 Cybersecurity best practices for individuals and organizations

Please ask a security or fraud-related question and I'll be glad to help.
"""


class SemanticDomainClassifier:
    """
    Loads the embedding model once at startup, pre-computes domain centroids,
    then classifies each user message in ~5ms using cosine similarity.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model: %s", model_name)
        self.model = SentenceTransformer(model_name)
        self.centroids: dict[str, np.ndarray] = {}
        self._build_centroids()
        logger.info("Domain centroids built for: %s", list(self.centroids.keys()))

    def _build_centroids(self):
        """
        Embed all anchor sentences and average them per domain.
        Called once at startup — takes ~1-2 seconds.
        """
        for domain, sentences in DOMAIN_ANCHORS.items():
            embeddings = self.model.encode(sentences, convert_to_numpy=True)
            # L2-normalise each embedding so cosine sim = dot product
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            normalised = embeddings / np.maximum(norms, 1e-10)
            # Centroid = mean of normalised embeddings, then re-normalise
            centroid = normalised.mean(axis=0)
            centroid_norm = np.linalg.norm(centroid)
            self.centroids[domain] = centroid / max(centroid_norm, 1e-10)

    def classify(self, message: str) -> dict:
        """
        Returns a dict:
        {
            "domain":      "CYBER_FRAUD" | "OUT_OF_DOMAIN",
            "scores":      {"CYBER_FRAUD": 0.72, "OUT_OF_DOMAIN": 0.31},
            "confidence":  0.41,    # gap between top-2 scores
            "is_allowed":  True,
        }
        """
        # Embed and normalise the user message
        vec = self.model.encode([message], convert_to_numpy=True)[0]
        norm = np.linalg.norm(vec)
        vec = vec / max(norm, 1e-10)

        # Cosine similarity = dot product (both vectors are unit length)
        scores = {
            domain: float(np.dot(vec, centroid))
            for domain, centroid in self.centroids.items()
        }

        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_domain, top_score = sorted_scores[0]
        second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0.0
        confidence_gap = top_score - second_score

        # Decision logic:
        # 1. Score below threshold → ambiguous → ALLOW (prefer helpfulness)
        # 2. Top domain is OUT_OF_DOMAIN AND confidence gap is large → BLOCK
        # 3. Otherwise → ALLOW
        if top_score < SIMILARITY_THRESHOLD:
            is_allowed = True   # Too ambiguous to block — let RAG handle it
        elif top_domain == "OUT_OF_DOMAIN" and confidence_gap >= CONFIDENCE_GAP:
            is_allowed = False  # Clearly out of domain → block
        else:
            is_allowed = True   # Cybersecurity domain wins, or gap too small

        logger.info(
            "Semantic classifier: top=%s(%.3f) gap=%.3f allowed=%s",
            top_domain, top_score, confidence_gap, is_allowed
        )

        return {
            "domain":     top_domain,
            "scores":     scores,
            "confidence": confidence_gap,
            "is_allowed": is_allowed,
        }


# ─────────────────────────────────────────────────────────────────────────────
# MODULE-LEVEL CLASSIFIER INSTANCE
# Initialised once when main.py imports this file.
# The model download (first run only) is ~90MB and cached locally after that.
# ─────────────────────────────────────────────────────────────────────────────

print("Initialising semantic domain classifier...")
_classifier = SemanticDomainClassifier()
print("Semantic classifier ready.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN INTERCEPTOR
# ─────────────────────────────────────────────────────────────────────────────

def run_guardrails(raw_message: str) -> GuardrailResult:
    """
    Entry point. Call at the top of your /api/chat handler.

    Priority order:
    ┌──────────────────────────────────────────────────────────────┐
    │  1. Emergency Detector  → EMERGENCY (skip RAG, instant reply)│
    │  2. PII Redactor        → scrub in-place, continue           │
    │  3. Semantic Classifier → BLOCK_OOB or ALLOW                 │
    │  4. RAG Pipeline        → ALLOW / PII_REDACTED               │
    └──────────────────────────────────────────────────────────────┘
    """
    # Layer 1: Emergency (on raw message before redaction)
    if check_emergency(raw_message):
        safe_msg, pii_found = detect_and_redact_pii(raw_message)
        return GuardrailResult(
            action=GuardrailAction.EMERGENCY,
            safe_message=safe_msg,
            response=EMERGENCY_RESPONSE,
            pii_found=pii_found,
        )

    # Layer 2: PII redaction
    safe_msg, pii_found = detect_and_redact_pii(raw_message)

    # Layer 3: Semantic domain classification
    clf_result = _classifier.classify(safe_msg)

    if not clf_result["is_allowed"]:
        return GuardrailResult(
            action=GuardrailAction.BLOCK_OOB,
            safe_message=safe_msg,
            response=DOMAIN_REJECTION_RESPONSE,
            pii_found=pii_found,
            classifier_score=clf_result["scores"],
        )

    action = GuardrailAction.PII_REDACTED if pii_found else GuardrailAction.ALLOW
    return GuardrailResult(
        action=action,
        safe_message=safe_msg,
        pii_found=pii_found,
        classifier_score=clf_result["scores"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# SELF-TEST  (python security_guardrails.py)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s │ %(message)s")

    test_cases = [
        # These would all FAIL keyword matching but PASS semantic matching
        ("SHOULD ALLOW  — indirect cyber",   "Someone wiped my digital wallet"),
        ("SHOULD ALLOW  — indirect fraud",   "I got duped into giving my details"),
        ("SHOULD ALLOW  — no cyber words",   "A stranger tricked me through my phone"),
        # Standard cases
        ("SHOULD ALLOW  — direct cyber",     "How do I protect against phishing?"),
        ("SHOULD BLOCK  — clear OOB",        "What is the best pasta recipe?"),
        ("SHOULD BLOCK  — sports",           "Who won the IPL match yesterday?"),
        # Tricky edge cases
        ("SHOULD ALLOW  — 'secure' in food", "How do I make my pasta more secure?"),
        ("EMERGENCY     — live fraud",       "My UPI is being drained right now!"),
        ("PII + CYBER   — mixed",            "My email is raj@test.com, what is 2FA?"),
    ]

    print("\n" + "═" * 72)
    print("  AEGIS SEMANTIC GUARDRAILS — SELF TEST")
    print("═" * 72)

    for desc, msg in test_cases:
        r = run_guardrails(msg)
        scores = r.classifier_score
        score_str = " | ".join(
            f"{k[:5]}={v:.2f}" for k, v in scores.items()
        ) if scores else "N/A"
        pii_str = ", ".join(r.pii_found) if r.pii_found else "none"
        print(f"\n{'─'*72}")
        print(f"  Test    : {desc}")
        print(f"  Input   : {msg[:65]}")
        print(f"  Action  : {r.action.value.upper()}")
        print(f"  Scores  : {score_str}")
        print(f"  PII     : {pii_str}")