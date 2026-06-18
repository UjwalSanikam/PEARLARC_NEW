"""
Phase 3: Security Guardrails — Semantic Edition
=================================================
Domain Classifier upgraded from lexical keyword matching to
Semantic Embeddings + Cosine Similarity using sentence-transformers.

Architecture:
  - At startup: embed anchor sentences per domain → compute centroid vector
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
from scipy.spatial.distance import cosine
from langchain_ollama import OllamaEmbeddings

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
    pii_found:        list[str] = field(default_factory=list)
    classifier_score: dict = field(default_factory=dict)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION & PATTERNS
# ─────────────────────────────────────────────────────────────────────────────

EMERGENCY_RESPONSE = (
    "🚨 **EMERGENCY DETECTED** 🚨\n"
    "It appears you are facing an active cyberattack or financial fraud.\n\n"
    "**IMMEDIATE ACTIONS:**\n"
    "1. **Call 1930** immediately (National Cyber Crime Helpline).\n"
    "2. Block your bank accounts/cards by calling your bank's toll-free number.\n"
    "3. Report the incident at **cybercrime.gov.in**.\n"
    "4. Disconnect your device from the internet if you suspect malware."
)

DOMAIN_REJECTION_RESPONSE = (
    "I am a specialized Cybersecurity AI Assistant. I can only answer questions "
    "related to online safety, fraud prevention, and information security. "
    "Please ask a cybersecurity-related question!"
)

PII_PATTERNS = {
    "AADHAAR": r"\b\d{4}\s?\d{4}\s?\d{4}\b",
    "PAN": r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b",
    "EMAIL": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "PHONE": r"\b(?:\+91|91|0)?\s?[6-9]\d{9}\b",
    "CREDIT_CARD": r"\b(?:\d[ -]*?){13,16}\b"
}

EMERGENCY_PATTERNS = [
    r"\b(stolen|lost)\s*(money|funds|wallet)\b",
    r"\b(bank|account|upi)\s*(hacked|compromised|drained)\b",
    r"\b(someone|they|hacker)\s*(is|are)\s*(stealing|draining|transferring)\b",
    r"\b(ransomware|locked)\s*(computer|files|screen)\b",
    r"\b(being|getting)\s*(hacked|scammed|defrauded)\b",
]

# ─────────────────────────────────────────────────────────────────────────────
# SEMANTIC CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

class SemanticDomainClassifier:
    """Classifies user intent mathematically using vector embeddings."""
    
    def __init__(self):
        # We use the fast, local Nomic embedding model
        self.embeddings_model = OllamaEmbeddings(model="nomic-embed-text")
        
        # 1. Define "Anchors" (examples of each category)
        self.anchors = {
            "cybersecurity": [
                "How do I secure my wifi router?",
                "What is two factor authentication?",
                "How to protect against phishing attacks",
                "Explain zero trust architecture",
                "I received an email asking me to verify my bank account, is this phishing?"
                "Password security best practices",
                "How to configure a firewall",
                "Data breach incident response plan"
            ],
            "out_of_bounds": [
                "What is a healthy recipe for dinner?",
                "Who won the cricket match yesterday?",
                "Best places to visit in Paris",
                "How to fix a leaky faucet",
                "Recommend a good sci-fi movie",
                "How to build muscle at the gym"
            ],
            "emergency": [
                "My bank account is being drained right now!",
                "Someone stole my credit card and is buying things",
                "I clicked a bad link and my computer is locked",
                "My identity was stolen online",
                "Help, a hacker is in my email account"
            ]
        }
        
        # 2. Compute the mathematical "center" of each category
        self.centroids = self._compute_anchors()
        logger.info("Semantic Domain Classifier initialized with model: nomic-embed-text")

    def _compute_anchors(self) -> dict:
        """Embeds the anchor sentences and averages them to create a category centroid."""
        centroids = {}
        for domain, sentences in self.anchors.items():
            embeddings = self.embeddings_model.embed_documents(sentences)
            # Average the vectors to find the center of the domain space
            centroids[domain] = np.mean(embeddings, axis=0)
        logger.info("Domain semantic anchors computed and cached")
        return centroids

    def classify(self, message: str) -> dict:
        """Embeds the user message and calculates cosine distance to centroids."""
        # 1. Embed the user's message
        msg_embedding = self.embeddings_model.embed_query(message)
        
        # 2. Calculate similarity (1 - cosine distance)
        # Cosine distance is 0 if identical, 1 if orthogonal. So similarity is 1 - distance.
        cyber_sim = 1 - cosine(msg_embedding, self.centroids["cybersecurity"])
        oob_sim = 1 - cosine(msg_embedding, self.centroids["out_of_bounds"])
        emergency_sim = 1 - cosine(msg_embedding, self.centroids["emergency"])
        
        # 3. Decision Logic
        is_allowed = False
        primary_domain = "unknown"
        confidence = 0.0
        
        # If the emergency intent is high AND distinctly higher than general cyber education
        if emergency_sim > 0.70 and (emergency_sim - cyber_sim) > 0.03:
            is_allowed = True
            primary_domain = "emergency"
            confidence = emergency_sim
        # Otherwise, check if it's more about cyber than out-of-bounds topics
        elif cyber_sim > oob_sim and cyber_sim > 0.40:
            is_allowed = True
            primary_domain = "cybersecurity"
            confidence = cyber_sim
        else:
            is_allowed = False
            primary_domain = "out_of_bounds"
            confidence = oob_sim
            
        logger.info("Domain classification: %s (cyber=%.2f, oob=%.2f, conf=%.2f)", 
                    primary_domain, cyber_sim, oob_sim, confidence)
                    
        return {
            "is_allowed": is_allowed,
            "primary_domain": primary_domain,
            "confidence": float(confidence),
            "cyber_similarity": float(cyber_sim),
            "oob_similarity": float(oob_sim)
        }

# Initialize the classifier globally so it caches the anchors on startup
try:
    semantic_classifier = SemanticDomainClassifier()
except Exception as e:
    logger.error(f"Failed to initialize Semantic Classifier: {e}")
    semantic_classifier = None

# ─────────────────────────────────────────────────────────────────────────────
# MAIN GUARDRAIL PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def run_guardrails(raw_message: str) -> GuardrailResult:
    safe_msg = raw_message
    pii_found = []

    # 1. EMERGENCY LAYER (Regex Fallback - Instant)
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, safe_msg, re.IGNORECASE):
            logger.warning("EMERGENCY trigger matched: %s", pattern)
            return GuardrailResult(
                action=GuardrailAction.EMERGENCY,
                safe_message=safe_msg,
                response=EMERGENCY_RESPONSE,
            )

    # 2. PII REDACTION LAYER
    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, safe_msg)
        if matches:
            safe_msg = re.sub(pattern, f"[{pii_type}_REDACTED]", safe_msg)
            pii_found.append(pii_type)
            logger.info("PII detected and redacted: %s (%d instance(s))", pii_type, len(matches))

    # 3. SEMANTIC DOMAIN LAYER
    if semantic_classifier is None:
        # Fallback if Ollama is down
        classification = {"is_allowed": True, "primary_domain": "fallback", "confidence": 1.0}
    else:
        classification = semantic_classifier.classify(safe_msg)

    # Action routing based on Semantic Domain
    if not classification["is_allowed"]:
        logger.info("Domain BLOCKED by semantic classifier: %s", classification["primary_domain"])
        return GuardrailResult(
            action=GuardrailAction.BLOCK_OOB,
            safe_message=safe_msg,
            response=DOMAIN_REJECTION_RESPONSE,
            classifier_score=classification,
        )

    # --- RESTORED: Trigger Emergency if Semantic Classifier detects a live threat ---
    if classification["primary_domain"] == "emergency":
        logger.warning("EMERGENCY triggered by SEMANTIC intent. PII: %s", pii_found)
        return GuardrailResult(
            action=GuardrailAction.EMERGENCY,
            safe_message=safe_msg,
            response=EMERGENCY_RESPONSE,
            pii_found=pii_found,
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
        ("ALLOW - Emergency threat", "My UPI account is being drained right now by someone!"),
    ]
    
    print("\n" + "="*70)
    print("SEMANTIC DOMAIN CLASSIFIER - QUICK TEST")
    print("="*70 + "\n")
    
    for desc, msg in test_cases:
        print(f"\n[{desc}] -> '{msg}'")
        run_guardrails(msg)