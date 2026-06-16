"""
Phase 3: Security Guardrails — The Armor
=========================================
Three-layer interceptor middleware for the CyberGuard AI FastAPI backend.
Runs BEFORE the RAG pipeline on every /api/chat request.

Layer 1 — Emergency Fraud Detector  (highest priority, bypasses RAG)
Layer 2 — PII Scanner & Redactor    (scrubs sensitive data in-place)
Layer 3 — Domain Classifier         (blocks out-of-scope queries)

Author: Phase 3 Assignment (Reviewed & Fixed)
Tech:   Python 3.11, FastAPI, Pydantic, regex
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
# LAYER 3 — DOMAIN CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

CYBER_TIER1 = {
    "phishing", "ransomware", "malware", "spyware", "keylogger", "trojan",
    "ddos", "sql injection", "xss", "csrf", "zero-day", "exploit",
    "vulnerability", "penetration test", "pentest", "siem", "firewall",
    "intrusion detection", "ids", "ips", "soc", "cert", "cve",
    "data breach", "credential stuffing", "man in the middle", "mitm",
    "social engineering", "vishing", "smishing", "deepfake",
    "upi fraud", "otp scam", "sim swap", "identity theft", "cyber crime",
}

CYBER_TIER2 = {
    "cybersecurity", "cyber security", "security", "hack", "hacker", "hacked",
    "password", "encryption", "vpn", "2fa", "mfa", "authentication",
    "authorization", "ssl", "tls", "certificate", "patch", "update",
    "antivirus", "endpoint", "network", "cloud", "safe", "secure", "router", "wifi",
    "fraud", "scam", "phish", "threat", "attack", "virus", "worm", "internet",
    "backdoor", "rootkit", "botnet", "darkweb", "dark web", "website", "link",
    "bank", "upi", "otp", "pin", "account", "card", "transaction",
    "suspicious", "unauthorized", "blocked", "stolen", "leaked",
    "incident", "response", "forensics", "audit", "compliance", "gdpr",
}

OOB_KEYWORDS = {
    # Food, cooking, and snacks (FIXED)
    "recipe", "cook", "bake", "ingredient", "restaurant", "food", "cuisine",
    "pasta", "pizza", "burger", "salad", "dessert", "breakfast", "lunch", "dinner",
    "chocolate", "candy", "cake", "sweet", "drink", "water", "coffee", "tea", "fruit",
    # Health & Medical (NEW FIX)
    "health", "healthy", "medicine", "doctor", "hospital", "disease", "cancer", "symptom", 
    "pain", "surgery", "treatment", "calories", "nutrition",
    # Entertainment
    "movie", "film", "series", "tv show", "netflix", "celebrity", "actor",
    "music", "song", "lyrics", "album", "concert", "dance",
    # Sports
    "cricket", "football", "soccer", "basketball", "tennis", "ipl", "fifa",
    "match", "score", "player", "team", "tournament", "league",
    # Travel & lifestyle
    "hotel", "flight", "travel", "vacation", "weather", "fashion", "shopping",
    "skincare", "makeup", "fitness", "diet", "workout", "gym",
    # General knowledge
    "history", "geography", "capital of", "language", "population",
}

DOMAIN_REJECTION_RESPONSE = """\
I'm a specialized **cybersecurity and fraud prevention** assistant.
Your question appears to be outside my area of expertise.

Please ask a security or fraud-related question and I'll be glad to help.
"""

def compute_domain_scores(message: str) -> dict:
    """
    FIXED: Now uses regex word boundaries (\b) to ensure partial words don't trigger false positives.
    """
    text = message.lower()
    
    # Calculate scores by looking for whole words only
    cyber = sum(2 for kw in CYBER_TIER1 if re.search(r'\b' + re.escape(kw) + r'\b', text))
    cyber += sum(1 for kw in CYBER_TIER2 if re.search(r'\b' + re.escape(kw) + r'\b', text))
    oob = sum(1 for kw in OOB_KEYWORDS if re.search(r'\b' + re.escape(kw) + r'\b', text))
    
    return {"cyber_score": cyber, "oob_score": oob}

def classify_domain(message: str) -> tuple[bool, dict]:
    scores = compute_domain_scores(message)
    
    # If it has strong cyber signals, allow it
    if scores["cyber_score"] > 0:
        return True, scores
    # If it has no cyber signals but hits out-of-bounds keywords, block it
    if scores["oob_score"] > 0:
        return False, scores
        
    # Ambiguous: short greetings, unclear intent → allow; let RAG handle gracefully
    return True, scores

# ─────────────────────────────────────────────────────────────────────────────
# MAIN INTERCEPTOR
# ─────────────────────────────────────────────────────────────────────────────

def run_guardrails(raw_message: str) -> GuardrailResult:
    logger.debug("Guardrails processing: %.80s...", raw_message)

    if check_emergency(raw_message):
        safe_msg, pii_found = detect_and_redact_pii(raw_message)
        logger.warning("EMERGENCY action triggered. PII redacted: %s", pii_found)
        return GuardrailResult(
            action=GuardrailAction.EMERGENCY,
            safe_message=safe_msg,
            response=EMERGENCY_RESPONSE,
            pii_found=pii_found,
        )

    safe_msg, pii_found = detect_and_redact_pii(raw_message)
    is_allowed, scores = classify_domain(safe_msg)

    if not is_allowed:
        logger.info("Domain BLOCKED. Scores: %s", scores)
        return GuardrailResult(
            action=GuardrailAction.BLOCK_OOB,
            safe_message=safe_msg,
            response=DOMAIN_REJECTION_RESPONSE,
            classifier_score=scores,
        )

    action = GuardrailAction.PII_REDACTED if pii_found else GuardrailAction.ALLOW
    logger.info("Guardrails PASSED. Action=%s, PII=%s, Scores=%s", action, pii_found, scores)
    return GuardrailResult(
        action=action,
        safe_message=safe_msg,
        pii_found=pii_found,
        classifier_score=scores,
    )

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    test_cases = [
        ("BLOCK - The original unblocked query", "is chocolate healthy?"),
        ("ALLOW - Valid cyber question", "How do I secure my router?"),
    ]
    for desc, msg in test_cases:
        r = run_guardrails(msg)
        print(f"{desc}: {r.action.value.upper()}")