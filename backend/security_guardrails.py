# backend/security_guardrails.py
import re
import logging
import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from scipy.spatial.distance import cosine
from langchain_ollama import OllamaEmbeddings

logger = logging.getLogger("aegis.guardrails")

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

EMERGENCY_RESPONSE = "🚨 **EMERGENCY DETECTED** 🚨\n1. Call 1930 immediately.\n2. Block your bank accounts."
DOMAIN_REJECTION_RESPONSE = "I am a specialized Cybersecurity AI Assistant. Please ask a cybersecurity-related question!"

PII_PATTERNS = {
    "AADHAAR": r"\b\d{4}\s?\d{4}\s?\d{4}\b",
    "PAN":     r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b",
    "EMAIL":   r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
}

EMERGENCY_PATTERNS = [
    r"\b(stolen|lost)\s*(money|funds|wallet)\b",
    r"\b(bank|account|upi)\s*(hacked|compromised|drained)\b"
]

class SemanticDomainClassifier:
    def __init__(self):
        self.embeddings_model = OllamaEmbeddings(model="nomic-embed-text")
        self.anchors = {
            "cybersecurity": [
                "How do I secure my home wifi router?",
                "Explain zero trust architecture.",
                "What is a firewall and how do I configure it?",
                "Should I use a VPN on public Wi-Fi?",
                "What is the difference between HTTP and HTTPS?",
                "How to protect against phishing attacks.",
                "What is ransomware and how does it spread?",
                "Can you explain what a Man-in-the-Middle attack is?",
                "Is it safe to plug in a random USB drive?",
                "What is a zero-day vulnerability?",
                "I received an email asking me to verify my bank account by clicking a link — is this phishing?",
                "How can I tell if a bank email with a link is legitimate or a scam?",
                "What is two factor authentication (2FA)?",
                "Password security best practices.",
                "How do password managers work?",
                "Explain role-based access control (RBAC).",
                "What is end-to-end encryption?",
                "How do I securely wipe a hard drive?",
                "Data breach incident response plan.",
                "What are the security requirements for GDPR?",
                "I received a suspicious email asking for my password, is it a scam?",
                "How can I spot a fake website?",
                "What is tailgating in physical security?",
                "How do I set up an authenticator app on my phone?",
                "What are the steps to enable 2FA on my account?",
                "How do I protect my passwords?",
            ],
            "out_of_bounds": [
                "What is a healthy recipe for dinner?",
                "How do I bake a chocolate cake?",
                "Best vegan restaurants near me.",
                "Who won the cricket match yesterday?",
                "What are the rules of basketball?",
                "How to improve my golf swing.",
                "Recommend a good sci-fi movie.",
                "Who played the lead role in Batman?",
                "When is the next Taylor Swift concert?",
                "Tell me a funny joke.",
                "How to build muscle at the gym.",
                "What are the symptoms of the common cold?",
                "How many calories are in an apple?",
                "Tips for better sleep.",
                "What is the capital of France?",
                "When did World War II end?",
                "Who built the Egyptian pyramids?",
                "What is the population of India?",
                "How do I center a div in CSS?",
                "Write a Python script to scrape a website.",
                "What is the best laptop for video editing?",
                "How to reset my printer.",
                "Explain the theory of relativity.",
                "What is the distance from the Earth to the Moon?",
                "How does photosynthesis work?",
                "How to fix a leaky faucet.",
                "Write a poem about the ocean.",
                "Can you translate this sentence to Spanish?",
                "Write a cover letter for a marketing job.",
            ],
            "emergency": [
                "My bank account is being drained right now!",
                "Someone stole my credit card and is buying things.",
                "I just wired money to a scammer, what do I do?",
                "My UPI account shows unauthorized transactions.",
                "I clicked a bad link and my computer is locked.",
                "Help, a hacker is in my email account sending messages.",
                "My screen says all my files are encrypted and demands Bitcoin.",
                "Someone is blackmailing me with private photos.",
                "My identity was stolen online and someone opened a loan.",
            ]
        }
        self.centroids = self._compute_anchors()

    def _compute_anchors(self) -> dict:
        centroids = {}
        for domain, sentences in self.anchors.items():
            embeddings = self.embeddings_model.embed_documents(sentences)
            centroids[domain] = np.mean(embeddings, axis=0)
        return centroids

    def classify(self, message: str) -> dict:
        msg_embedding   = self.embeddings_model.embed_query(message)
        cyber_sim       = 1 - cosine(msg_embedding, self.centroids["cybersecurity"])
        oob_sim         = 1 - cosine(msg_embedding, self.centroids["out_of_bounds"])
        emergency_sim   = 1 - cosine(msg_embedding, self.centroids["emergency"])

        is_allowed     = False
        primary_domain = "unknown"

        if emergency_sim > 0.70 and (emergency_sim - cyber_sim) > 0.03:
            is_allowed, primary_domain = True, "emergency"
        elif cyber_sim > oob_sim and cyber_sim > 0.40:
            is_allowed, primary_domain = True, "cybersecurity"
        else:
            is_allowed, primary_domain = False, "out_of_bounds"

        return {
            "is_allowed":            is_allowed,
            "primary_domain":        primary_domain,
            "cyber_similarity":      float(cyber_sim),
            "oob_similarity":        float(oob_sim),
            "emergency_similarity":  float(emergency_sim),
        }

try:
    semantic_classifier = SemanticDomainClassifier()
except Exception as e:
    logger.warning(f"SemanticDomainClassifier failed to init: {e}")
    semantic_classifier = None


def run_guardrails(raw_message: str, context: str = "") -> GuardrailResult:
    safe_msg  = raw_message
    pii_found = []

    # 1. Emergency regex
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, safe_msg, re.IGNORECASE):
            return GuardrailResult(
                action=GuardrailAction.EMERGENCY,
                safe_message=safe_msg,
                response=EMERGENCY_RESPONSE,
            )

    # 2. PII redaction
    for pii_type, pattern in PII_PATTERNS.items():
        if re.findall(pattern, safe_msg):
            safe_msg = re.sub(pattern, f"[{pii_type}_REDACTED]", safe_msg)
            pii_found.append(pii_type)

    # 3. Semantic domain classification
    if semantic_classifier is None:
        classification = {"is_allowed": True, "primary_domain": "fallback"}
    else:
        classification = semantic_classifier.classify(safe_msg)

        if not classification["is_allowed"] and context:
            # FIX 1: Clean punctuation so words in parenthesis aren't missed
            clean_msg = re.sub(r'[^\w\s]', ' ', safe_msg.lower())
            pointer_words = {"it", "that", "this", "these", "those", "them"}
            is_pronoun = bool(pointer_words.intersection(clean_msg.split()))

            should_retry = is_pronoun
            if not should_retry:
                vec_msg     = semantic_classifier.embeddings_model.embed_query(safe_msg)
                vec_context = semantic_classifier.embeddings_model.embed_query(context)
                followup_sim = 1 - cosine(vec_msg, vec_context)
                
                # FIX 2: Raised threshold from 0.40 to 0.65 to account for "Vector Inflation" 
                # caused by massive text blocks in the new conversational memory context!
                should_retry = followup_sim > 0.65

            if should_retry:
                logger.debug(
                    "[Guardrail] Retrying with context (pronoun=%s)", is_pronoun
                )
                context_class = semantic_classifier.classify(f"{context}. {safe_msg}")
                if context_class["is_allowed"]:
                    classification = context_class

    # 4. Route on final result
# 4. Route on final result
    if not classification["is_allowed"]:
        return GuardrailResult(
            action=GuardrailAction.BLOCK_OOB,
            safe_message=safe_msg,
            response=DOMAIN_REJECTION_RESPONSE,
            classifier_score=classification,
            pii_found=pii_found  # <-- FIX: Tell the OOB block to report the PII!
        )

    if classification["primary_domain"] == "emergency":
        return GuardrailResult(
            action=GuardrailAction.EMERGENCY,
            safe_message=safe_msg,
            response=EMERGENCY_RESPONSE,
            pii_found=pii_found,
            classifier_score=classification,
        )

    return GuardrailResult(
        action=GuardrailAction.PII_REDACTED if pii_found else GuardrailAction.ALLOW,
        safe_message=safe_msg,
        pii_found=pii_found,
        classifier_score=classification,
    )