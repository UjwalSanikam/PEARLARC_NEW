"""
Phase 3: Security Guardrails — The Armor (Upgraded with Semantic Classification)
===================================================================================
Three-layer interceptor middleware for the CyberGuard AI FastAPI backend.
Runs BEFORE the RAG pipeline on every /api/chat request.

Layer 1 — Emergency Fraud Detector  (highest priority, bypasses RAG)
Layer 2 — PII Scanner & Redactor    (scrubs sensitive data in-place)
Layer 3 — Semantic Domain Classifier (understands intent via embeddings, not keywords)

New in Phase 3 Upgrade:
- Semantic embeddings for domain classification (replaces hardcoded keyword lists)
- Cosine similarity scoring for nuanced intent detection
- Confidence-based thresholds for better UX
- Cached embeddings for performance

Author: Phase 3 Assignment (Upgraded with Semantic Intelligence)
Tech:   Python 3.11, FastAPI, Pydantic, regex, LangChain Embeddings, scipy.spatial
"""

import re
import json
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import numpy as np
from scipy.spatial.distance import cosine
from langchain_ollama import OllamaEmbeddings

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
    r"\bupi\s*(fraud|scam|hack|attack|stolen|blocked)\b",
    r"\b(someone|they|hacker)\s*(is|are)\s*(stealing|draining|transferring)\b",
    r"\bunauthorized\s*(transaction|transfer|payment|debit)\b",
    r"\b(fraud|scam)\s*(happening|going on|right now|live|active)\b",
    r"\bmoney\s*(stolen|missing|gone|disappeared)\b",
    r"\botp\s*(shared|leaked|stolen|given)\b",
    r"\bsim\s*swap\b",
    r"\b(account|password|email)\s*(hacked|compromised|taken over|locked out)\b",
    r"\b(being|getting)\s*(hacked|scammed|defrauded)\b",
    r"\bneed\s*(help|assistance)\s*(urgently|immediately|now|asap)\b.*\b(fraud|hack|scam)\b",
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
"""

def check_emergency(message: str) -> bool:
    text = message.lower()
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            logger.warning("EMERGENCY trigger matched: %s", pattern)
            return True
    return False

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — PII SCANNER & REDACTOR
# ─────────────────────────────────────────────────────────────────────────────

PII_RULES: list[tuple[str, re.Pattern, str]] = [
    ("AADHAAR", re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"), "[AADHAAR-REDACTED]"),
    ("PAN", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[PAN-REDACTED]"),
    ("EMAIL", re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"), "[EMAIL-REDACTED]"),
    ("PHONE", re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)"), "[PHONE-REDACTED]"),
    ("CARD_NUMBER", re.compile(r"\b(?:\d[ \-]?){13,16}\b"), "[CARD-REDACTED]"),
    ("CVV", re.compile(r"\b(?:cvv|cvc|security\s*code)\s*[:\-]?\s*\d{3,4}\b", re.IGNORECASE), "[CVV-REDACTED]"),
    ("UPI_ID", re.compile(r"\b[a-zA-Z0-9.\-_+]+@[a-zA-Z0-9]+\b"), "[UPI-REDACTED]"),
    ("IFSC", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"), "[IFSC-REDACTED]"),
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
                logger.info("PII detected and redacted: %s (%d instance(s))", label, count)

    return redacted, found

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — SEMANTIC DOMAIN CLASSIFIER (Upgraded)
# ─────────────────────────────────────────────────────────────────────────────

class SemanticDomainClassifier:
    """
    Semantic classifier that understands intent via embeddings instead of keyword matching.
    Uses cosine similarity to determine if a query is cybersecurity-related or out-of-bounds.
    """
    
    def __init__(self, embedding_model_name: str = "nomic-embed-text"):
        """Initialize the semantic classifier with Ollama embeddings."""
        self.embeddings = OllamaEmbeddings(model=embedding_model_name)
        self._embedding_cache = {}
        self._domain_anchors_cache = None
        logger.info("Semantic Domain Classifier initialized with model: %s", embedding_model_name)
    
    def _get_embedding(self, text: str) -> np.ndarray:
        """Get embedding for text with caching."""
        if text in self._embedding_cache:
            return self._embedding_cache[text]
        
        embedding = np.array(self.embeddings.embed_query(text))
        self._embedding_cache[text] = embedding
        return embedding
    
    def _get_domain_anchors(self) -> dict:
        """
        Semantic anchors for each domain.
        These represent the 'center' of each domain's semantic space.
        Updated: Uses representative phrases instead of keywords.
        
        Note: Semantic classifier only determines IN-SCOPE (cybersecurity) vs OUT-OF-SCOPE (OOB).
        Emergency detection is handled by Layer 1 regex patterns (see check_emergency).
        """
        if self._domain_anchors_cache is not None:
            return self._domain_anchors_cache
        
        # Core cybersecurity domain anchors (representative phrases)
        # Includes both preventive questions AND incident response (past/current)
        cyber_anchors = [
            "how do I protect my account from hackers",
            "what is malware and how does ransomware attack my computer",
            "how to detect and prevent phishing scams",
            "what are security best practices for passwords and authentication",
            "how do I secure my banking transactions and UPI payments",
            "what should I do if my identity is stolen or credentials leaked",
            "how to respond to active fraud or cyber attacks",
            "what are firewalls, VPNs, and encryption in cybersecurity",
            "how to recognize social engineering and vishing scams",
            "cybersecurity incident response and data breach management",
        ]
        
        # Out-of-bounds domain anchors (representative phrases)
        oob_anchors = [
            "how to cook a recipe or bake a cake",
            "what are the best movies and TV shows to watch",
            "tips for fitness training and weight loss diet",
            "where to travel for vacation and what hotels to book",
            "what is the capital of France and geography facts",
            "fashion and skincare tips for beauty",
            "sports scores and cricket match updates",
            "music lyrics and concert information",
            "medical advice for health conditions and symptoms",
            "restaurant recommendations and food cuisine reviews",
        ]
        
        # Embed all anchors and compute their mean (center of each domain)
        cyber_embeddings = [self._get_embedding(text) for text in cyber_anchors]
        oob_embeddings = [self._get_embedding(text) for text in oob_anchors]
        
        self._domain_anchors_cache = {
            "cybersecurity": np.mean(cyber_embeddings, axis=0),
            "out_of_bounds": np.mean(oob_embeddings, axis=0),
        }
        
        logger.info("Domain semantic anchors computed and cached")
        return self._domain_anchors_cache
    
    def classify(self, message: str) -> dict:
        """
        Classify a message as cybersecurity (in-scope) or out-of-bounds.
        
        Returns: {
            'is_allowed': bool,
            'primary_domain': str,
            'cyber_similarity': float,
            'oob_similarity': float,
            'confidence': float,
        }
        
        Note: Emergency detection is handled by Layer 1 regex patterns.
        This classifier only determines if a query is in-scope (cybersecurity).
        """
        try:
            # Get message embedding
            message_embedding = self._get_embedding(message)
            
            # Get domain anchors
            anchors = self._get_domain_anchors()
            
            # Compute cosine similarity (1 - cosine_distance)
            # Note: cosine() returns distance, so we subtract from 1 for similarity
            cyber_sim = 1 - cosine(message_embedding, anchors["cybersecurity"])
            oob_sim = 1 - cosine(message_embedding, anchors["out_of_bounds"])
            
            # Classify based on similarities
            # Use a tie-breaker: cyber must be meaningfully higher than OOB to block
            if cyber_sim > oob_sim:
                # Cybersecurity domain (in-scope)
                is_allowed = True
                primary_domain = "cybersecurity"
                confidence = cyber_sim
            elif oob_sim > 0.55:
                # Out-of-bounds domain - only block if OOB similarity is significant
                # AND higher than cyber
                is_allowed = False
                primary_domain = "out_of_bounds"
                confidence = oob_sim
            else:
                # Ambiguous: allow (let RAG handle gracefully)
                is_allowed = True
                primary_domain = "ambiguous"
                confidence = max(cyber_sim, oob_sim)
            
            result = {
                "is_allowed": is_allowed,
                "primary_domain": primary_domain,
                "cyber_similarity": float(cyber_sim),
                "oob_similarity": float(oob_sim),
                "confidence": float(confidence),
            }
            
            logger.debug(
                "Semantic classification: domain=%s, cyber=%.3f, oob=%.3f",
                primary_domain, cyber_sim, oob_sim
            )
            
            return result
        
        except Exception as e:
            logger.error("Error in semantic classification: %s", str(e))
            # Fail open: allow message to proceed on error
            return {
                "is_allowed": True,
                "primary_domain": "error",
                "cyber_similarity": 0.0,
                "oob_similarity": 0.0,
                "confidence": 0.0,
                "error": str(e),
            }

# Initialize the global semantic classifier (lazy-loaded on first use)
_semantic_classifier: Optional[SemanticDomainClassifier] = None

def get_semantic_classifier() -> SemanticDomainClassifier:
    """Get or create the global semantic classifier instance."""
    global _semantic_classifier
    if _semantic_classifier is None:
        _semantic_classifier = SemanticDomainClassifier()
    return _semantic_classifier

DOMAIN_REJECTION_RESPONSE = """\
I'm a specialized **cybersecurity and fraud prevention** assistant.
Your question appears to be outside my area of expertise.

Please ask a security or fraud-related question and I'll be glad to help.
"""

# ─────────────────────────────────────────────────────────────────────────────
# MAIN INTERCEPTOR
# ─────────────────────────────────────────────────────────────────────────────

def run_guardrails(raw_message: str) -> GuardrailResult:
    """
    Run the complete 3-layer security guardrails pipeline.
    
    Order of execution:
    1. Emergency Detector (regex patterns) — highest priority
    2. PII Redactor (regex patterns) — all messages get checked
    3. Semantic Domain Classifier (embeddings) — determines if message is in-scope
    """
    logger.debug("Guardrails processing: %.80s...", raw_message)

    # LAYER 1: Emergency check (regex patterns - fast, specific)
    if check_emergency(raw_message):
        safe_msg, pii_found = detect_and_redact_pii(raw_message)
        logger.warning("EMERGENCY action triggered. PII redacted: %s", pii_found)
        return GuardrailResult(
            action=GuardrailAction.EMERGENCY,
            safe_message=safe_msg,
            response=EMERGENCY_RESPONSE,
            pii_found=pii_found,
        )

    # LAYER 2: PII redaction (regex patterns - deterministic)
    safe_msg, pii_found = detect_and_redact_pii(raw_message)

    # LAYER 3: Semantic domain classification (embeddings - intelligent)
    classifier = get_semantic_classifier()
    classification = classifier.classify(safe_msg)
    
    logger.info(
        "Domain classification: %s (cyber=%.2f, oob=%.2f, conf=%.2f)",
        classification["primary_domain"],
        classification["cyber_similarity"],
        classification["oob_similarity"],
        classification["confidence"],
    )

    # Block out-of-bounds queries
    if not classification["is_allowed"]:
        logger.info("Domain BLOCKED by semantic classifier: %s", classification["primary_domain"])
        return GuardrailResult(
            action=GuardrailAction.BLOCK_OOB,
            safe_message=safe_msg,
            response=DOMAIN_REJECTION_RESPONSE,
            classifier_score=classification,
        )

    # Determine final action for allowed messages
    action = GuardrailAction.PII_REDACTED if pii_found else GuardrailAction.ALLOW
    logger.info("Guardrails PASSED. Action=%s, PII=%s, Classification=%s", 
                action, pii_found, classification["primary_domain"])
    
    return GuardrailResult(
        action=action,
        safe_message=safe_msg,
        pii_found=pii_found,
        classifier_score=classification,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    test_cases = [
        ("BLOCK - Out of scope (food)", "what are some healthy recipes?"),
        ("BLOCK - Out of scope (sports)", "what's the cricket IPL score today?"),
        ("ALLOW - Valid cyber question", "How do I secure my router from hackers?"),
        ("ALLOW - Semantic cyber question", "Someone compromised my banking app, what should I do?"),
        ("EMERGENCY - Active threat (regex)", "My UPI account is being drained right now by someone!"),
    ]
    
    print("\n" + "="*70)
    print("SEMANTIC DOMAIN CLASSIFIER - QUICK TEST")
    print("="*70 + "\n")
    
    for desc, msg in test_cases:
        r = run_guardrails(msg)
        print(f"[{desc}]")
        print(f"  Message: {msg}")
        print(f"  Action: {r.action.value.upper()}")
        if r.classifier_score:
            print(f"  Domain: {r.classifier_score.get('primary_domain', 'N/A')}")
        print()