"""
Phase 3: Security Guardrails — The Armor
=========================================
Three-layer interceptor middleware for the CyberGuard AI FastAPI backend.
Runs BEFORE the RAG pipeline on every /api/chat request.

Layer 1 — Emergency Fraud Detector  (highest priority, bypasses RAG)
Layer 2 — PII Scanner & Redactor    (scrubs sensitive data in-place)
Layer 3 — Domain Classifier         (blocks out-of-scope queries)

Author: Phase 3 Assignment
Tech:   Python 3.11, FastAPI, Pydantic, regex (no extra installs needed)
        Optional: pip install presidio-analyzer presidio-anonymizer  (richer PII)
"""

import re
import json
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("aegis.guardrails")


# ─────────────────────────────────────────────────────────────────────────────
# SHARED TYPES
# ─────────────────────────────────────────────────────────────────────────────

class GuardrailAction(str, Enum):
    ALLOW          = "allow"           # Passed all checks → send to RAG
    BLOCK_OOB      = "block_oob"       # Out-of-domain → polite rejection
    EMERGENCY      = "emergency"       # Live fraud/attack → bypass RAG with urgent reply
    PII_REDACTED   = "pii_redacted"    # PII found and scrubbed → continue to RAG


@dataclass
class GuardrailResult:
    action:          GuardrailAction
    safe_message:    str                    # The (possibly redacted) message to send to RAG
    response:        Optional[str] = None  # Pre-built reply (set for BLOCK and EMERGENCY)
    pii_found:       list[str]     = field(default_factory=list)
    classifier_score: dict         = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1 — EMERGENCY FRAUD DETECTOR
# ─────────────────────────────────────────────────────────────────────────────

EMERGENCY_PATTERNS = [
    # UPI / payment fraud
    r"\bupi\s*(fraud|scam|hack|attack|stolen|blocked)\b",
    r"\b(someone|they|hacker)\s*(is|are)\s*(stealing|draining|transferring)\b",
    r"\bunauthorized\s*(transaction|transfer|payment|debit)\b",
    r"\b(fraud|scam)\s*(happening|going on|right now|live|active)\b",
    r"\bmoney\s*(stolen|missing|gone|disappeared)\b",
    r"\botp\s*(shared|leaked|stolen|given)\b",
    r"\bsim\s*swap\b",
    # Account takeover
    r"\b(account|password|email)\s*(hacked|compromised|taken over|locked out)\b",
    r"\b(being|getting)\s*(hacked|scammed|defrauded)\b",
    r"\bneed\s*(help|assistance)\s*(urgently|immediately|now|asap)\b.*\b(fraud|hack|scam)\b",
    # Active phishing
    r"\bjust\s*(clicked|opened|downloaded)\s*(a|an|the)?\s*(link|file|attachment|email)\b",
    r"\bransomware\s*(deployed|running|active|locked)\b",
]

EMERGENCY_RESPONSE = """\
 **EMERGENCY — Active Threat Detected**

Take these steps **immediately** (in order):

**Step 1 — Call the helpline**
Dial **1930** (National Cyber Crime Helpline, 24×7, India)
or visit **cybercrime.gov.in** to file a complaint online.

**Step 2 — Block your accounts NOW**
- Open your UPI app → Settings → Block / Freeze account
- Call your bank's 24×7 helpline and say: *"Block all UPI and net banking transactions"*
- For SBI: 1800-11-2211 | HDFC: 1800-202-6161 | ICICI: 1800-1080

**Step 3 — Contain the damage**
- Do NOT share any OTP, PIN, or CVV with anyone — banks never ask
- Do NOT click any link sent via SMS/WhatsApp/email
- Disconnect from the internet if ransomware is active

**Step 4 — Preserve evidence**
- Screenshot every suspicious transaction, message, and call log
- Note the time, amount, and recipient UPI ID / phone number

**Step 5 — Change credentials (after blocking)**
- Reset UPI PIN, net banking password, email password
- Enable 2FA on all linked accounts

---
*Your message was processed securely. Any personal data was redacted before analysis.*
"""

def check_emergency(message: str) -> bool:
    """Return True if the message signals a live / active threat."""
    text = message.lower()
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            logger.warning("EMERGENCY trigger matched: %s", pattern)
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — PII SCANNER & REDACTOR
# ─────────────────────────────────────────────────────────────────────────────
#
# Uses regex for zero-dependency operation.
# Each entry: (label, compiled_regex, replacement_token)
# If you install presidio-analyzer, swap detect_and_redact_pii() below.
#

PII_RULES: list[tuple[str, re.Pattern, str]] = [
    # Aadhaar — 12 digits, optional spaces every 4
    ("AADHAAR",
     re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"),
     "[AADHAAR-REDACTED]"),

    # Indian PAN — ABCDE1234F format
    ("PAN",
     re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
     "[PAN-REDACTED]"),

    # Email addresses
    ("EMAIL",
     re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"),
     "[EMAIL-REDACTED]"),

    # Indian mobile numbers — 10 digits starting with 6-9
    ("PHONE",
     re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)"),
     "[PHONE-REDACTED]"),

    # Credit / Debit card numbers — 13-16 digits, optional separators
    ("CARD_NUMBER",
     re.compile(r"\b(?:\d[ \-]?){13,16}\b"),
     "[CARD-REDACTED]"),

    # CVV — 3-4 digits near the word cvv/cvc/security code
    ("CVV",
     re.compile(r"\b(?:cvv|cvc|security\s*code)\s*[:\-]?\s*\d{3,4}\b", re.IGNORECASE),
     "[CVV-REDACTED]"),

    # UPI IDs — user@bank format
    ("UPI_ID",
     re.compile(r"\b[a-zA-Z0-9.\-_+]+@[a-zA-Z0-9]+\b"),
     "[UPI-REDACTED]"),

    # IFSC codes
    ("IFSC",
     re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
     "[IFSC-REDACTED]"),
]


def detect_and_redact_pii(message: str) -> tuple[str, list[str]]:
    """
    Scan `message` for PII, redact in-place, return (redacted_text, found_types).

    To upgrade to Presidio (richer ML-based detection):
        pip install presidio-analyzer presidio-anonymizer
        Then replace the body of this function with:

        from presidio_analyzer import AnalyzerEngine
        from presidio_anonymizer import AnonymizerEngine
        analyzer  = AnalyzerEngine()
        anonymizer = AnonymizerEngine()
        results = analyzer.analyze(text=message, language="en")
        redacted = anonymizer.anonymize(text=message, analyzer_results=results).text
        found = list({r.entity_type for r in results})
        return redacted, found
    """
    redacted = message
    found: list[str] = []

    for label, pattern, replacement in PII_RULES:
        new_text, count = pattern.subn(replacement, redacted)
        if count > 0:
            redacted = new_text
            if label not in found:
                found.append(label)
                logger.info("PII detected and redacted: %s (%d instance(s))", label, count)

    return redacted, found


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — DOMAIN CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

# High-value cybersecurity & fraud keywords (weighted heavier in scoring)
CYBER_TIER1 = {
    "phishing", "ransomware", "malware", "spyware", "keylogger", "trojan",
    "ddos", "sql injection", "xss", "csrf", "zero-day", "exploit",
    "vulnerability", "penetration test", "pentest", "siem", "firewall",
    "intrusion detection", "ids", "ips", "soc", "cert", "cve",
    "data breach", "credential stuffing", "man in the middle", "mitm",
    "social engineering", "vishing", "smishing", "deepfake",
    "upi fraud", "otp scam", "sim swap", "identity theft", "cyber crime",
}

# Broader security terms (each contributes less)
CYBER_TIER2 = {
    "cybersecurity", "cyber security", "security", "hack", "hacker",
    "password", "encryption", "vpn", "2fa", "mfa", "authentication",
    "authorization", "ssl", "tls", "certificate", "patch", "update",
    "antivirus", "endpoint", "network security", "cloud security",
    "fraud", "scam", "phish", "threat", "attack", "virus", "worm",
    "backdoor", "rootkit", "botnet", "darkweb", "dark web",
    "bank", "upi", "otp", "pin", "account", "card", "transaction",
    "suspicious", "unauthorized", "blocked", "stolen", "leaked",
    "incident", "response", "forensics", "audit", "compliance", "gdpr",
}

# Topics that are clearly out-of-domain
OOB_KEYWORDS = {
    # Food & cooking
    "recipe", "cook", "bake", "ingredient", "restaurant", "food", "cuisine",
    "pasta", "pizza", "burger", "salad", "dessert", "breakfast", "lunch", "dinner",
    # Entertainment
    "movie", "film", "series", "tv show", "netflix", "celebrity", "actor",
    "music", "song", "lyrics", "album", "concert", "dance",
    # Sports
    "cricket", "football", "soccer", "basketball", "tennis", "ipl", "fifa",
    "match", "score", "player", "team", "tournament", "league",
    # Travel & lifestyle
    "hotel", "flight", "travel", "vacation", "weather", "fashion", "shopping",
    "skincare", "makeup", "fitness", "diet", "workout",
    # General knowledge
    "history", "geography", "capital of", "language", "population",
}

DOMAIN_REJECTION_RESPONSE = """\
I'm a specialized **cybersecurity and fraud prevention** assistant.
Your question appears to be outside my area of expertise.

I can help you with topics like:
-  Phishing, malware, ransomware, and social engineering
-  Password security, 2FA, and account protection
-  UPI fraud, OTP scams, and financial cyber threats
-  How to detect and report cyber incidents
- Cybersecurity best practices for individuals and organizations

Please ask a security or fraud-related question and I'll be glad to help.
"""


def compute_domain_scores(message: str) -> dict:
    """
    Returns a score dict:
        cyber_score  — weighted count of cybersecurity matches
        oob_score    — count of out-of-domain keyword matches
    """
    text = message.lower()
    cyber = sum(2 for kw in CYBER_TIER1 if kw in text)
    cyber += sum(1 for kw in CYBER_TIER2 if kw in text)
    oob = sum(1 for kw in OOB_KEYWORDS if kw in text)
    return {"cyber_score": cyber, "oob_score": oob}


def classify_domain(message: str) -> tuple[bool, dict]:
    """
    Returns (is_allowed, scores).
    Logic:
        - Any cyber signal → allow
        - OOB signal with ZERO cyber signal → block
        - Completely ambiguous (no signal either way) → allow (prefer helpfulness)
    """
    scores = compute_domain_scores(message)
    if scores["cyber_score"] > 0:
        return True, scores
    if scores["oob_score"] > 0:
        return False, scores
    # Ambiguous: short greetings, unclear intent → allow; let RAG handle gracefully
    return True, scores


# ─────────────────────────────────────────────────────────────────────────────
# MAIN INTERCEPTOR — RUNS ALL THREE LAYERS IN ORDER
# ─────────────────────────────────────────────────────────────────────────────

def run_guardrails(raw_message: str) -> GuardrailResult:
    """
    Entry point for Phase 3.  Call this at the TOP of your /api/chat handler
    before passing anything to the RAG pipeline.

    Processing order (priority: highest → lowest)
    ┌─────────────────────────────────────────────────────────┐
    │  1. Emergency Fraud Detector  →  EMERGENCY (bypass RAG) │
    │  2. PII Scanner               →  redact in-place        │
    │  3. Domain Classifier         →  BLOCK if OOB           │
    │  4. Pass to RAG               →  ALLOW                  │
    └─────────────────────────────────────────────────────────┘
    """
    logger.debug("Guardrails processing: %.80s...", raw_message)

    # ── Layer 1: Emergency check (on raw message, before redaction)
    if check_emergency(raw_message):
        # Still redact before logging / storing
        safe_msg, pii_found = detect_and_redact_pii(raw_message)
        logger.warning("EMERGENCY action triggered. PII redacted: %s", pii_found)
        return GuardrailResult(
            action=GuardrailAction.EMERGENCY,
            safe_message=safe_msg,
            response=EMERGENCY_RESPONSE,
            pii_found=pii_found,
        )

    # ── Layer 2: PII redaction (always runs if not emergency)
    safe_msg, pii_found = detect_and_redact_pii(raw_message)

    # ── Layer 3: Domain classification (on the safe/redacted message)
    is_allowed, scores = classify_domain(safe_msg)

    if not is_allowed:
        logger.info("Domain BLOCKED. Scores: %s", scores)
        return GuardrailResult(
            action=GuardrailAction.BLOCK_OOB,
            safe_message=safe_msg,
            response=DOMAIN_REJECTION_RESPONSE,
            classifier_score=scores,
        )

    # ── All clear: pass to RAG
    action = GuardrailAction.PII_REDACTED if pii_found else GuardrailAction.ALLOW
    logger.info("Guardrails PASSED. Action=%s, PII=%s, Scores=%s", action, pii_found, scores)
    return GuardrailResult(
        action=action,
        safe_message=safe_msg,
        pii_found=pii_found,
        classifier_score=scores,
    )


# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI INTEGRATION — Drop-in replacement for your existing /api/chat handler
# ─────────────────────────────────────────────────────────────────────────────
#
# Paste this into your main.py (or router file) replacing your current endpoint.
# The only change to existing logic is the `result = run_guardrails(...)` block
# at the top — everything below that is your Phase 2 RAG code unchanged.
#

FASTAPI_INTEGRATION_SNIPPET = '''
# ── main.py ──────────────────────────────────────────────────────────────────
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from security_guardrails import run_guardrails, GuardrailAction

app = FastAPI(title="CyberGuard AI — Phase 3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],   # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply:          str
    action:         str
    pii_redacted:   list[str] = []
    domain_scores:  dict      = {}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # ── Phase 3: Run all guardrails BEFORE touching RAG ──────────────────────
    result = run_guardrails(req.message)

    # Intercept EMERGENCY and BLOCK_OOB — never reach RAG
    if result.action in (GuardrailAction.EMERGENCY, GuardrailAction.BLOCK_OOB):
        return ChatResponse(
            reply=result.response,
            action=result.action.value,
            pii_redacted=result.pii_found,
            domain_scores=result.classifier_score,
        )

    # ── Phase 2: RAG pipeline receives only the SAFE, redacted message ───────
    # Replace the line below with your actual RAG call:
    #   rag_reply = your_rag_chain.invoke(result.safe_message)
    rag_reply = f"[RAG response to: {result.safe_message[:60]}...]"  # stub

    return ChatResponse(
        reply=rag_reply,
        action=result.action.value,
        pii_redacted=result.pii_found,
        domain_scores=result.classifier_score,
    )
'''


# ─────────────────────────────────────────────────────────────────────────────
# QUICK SELF-TEST  (python security_guardrails.py)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s │ %(message)s")

    test_cases = [
        # (description, message)
        ("EMERGENCY — live UPI fraud",
         "Help! Someone is doing UPI fraud on my account right now!"),

        ("EMERGENCY — with PII",
         "My UPI is hacked. My number is 9876543210 and email is raj@gmail.com"),

        ("PII only — Aadhaar + PAN",
         "My Aadhaar is 4321 8765 0011 and PAN is ABCDE1234F. What is phishing?"),

        ("ALLOW — clean cyber query",
         "How do I protect myself from phishing emails?"),

        ("BLOCK — completely OOB",
         "Can you give me a pasta carbonara recipe?"),

        ("ALLOW — ambiguous short",
         "Hello, how are you?"),
    ]

    print("\n" + "═" * 70)
    print("  AEGIS GUARDRAILS — SELF TEST")
    print("═" * 70)

    for desc, msg in test_cases:
        r = run_guardrails(msg)
        pii_str = ", ".join(r.pii_found) if r.pii_found else "none"
        print(f"\n {desc}")
        print(f"   Input  : {msg[:70]}")
        print(f"   Action : {r.action.value.upper()}")
        print(f"   PII    : {pii_str}")
        print(f"   Safe   : {r.safe_message[:70]}")
        if r.response:
            print(f"   Reply↓ : {r.response[:80].strip()}...")