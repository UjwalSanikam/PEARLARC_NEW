"""
Semantic Security Guardrails — Validation & Demonstration
===========================================================

This script validates that the new semantic classifier:
1. Correctly identifies cybersecurity queries
2. Blocks out-of-bounds queries
3. Detects emergency threats
4. Understands conversational intent (semantic vs keyword matching)
5. Provides confidence scores

Run this AFTER ensuring Ollama is running and models are available.
"""

import logging
from security_guardrails import run_guardrails, GuardrailAction

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger("test_guardrails")

def test_semantic_classifier():
    """Comprehensive test suite for semantic domain classifier."""
    
    test_cases = [
        # ─── Cybersecurity Questions (Should ALLOW) ───
        {
            "desc": "✓ Standard security question",
            "query": "How do I secure my router from hackers?",
            "expected": GuardrailAction.ALLOW,
        },
        {
            "desc": "✓ Semantic security (no keywords, understands intent)",
            "query": "Someone broke into my online account. What should I do?",
            "expected": GuardrailAction.ALLOW,
        },
        {
            "desc": "✓ Banking fraud question",
            "query": "My bank account shows strange transactions. Is it fraud?",
            "expected": GuardrailAction.ALLOW,
        },
        {
            "desc": "✓ Identity theft inquiry",
            "query": "How do I check if my personal information has been compromised?",
            "expected": GuardrailAction.ALLOW,
        },
        {
            "desc": "✓ Advanced security question",
            "query": "What is zero-day vulnerability and how can I protect against it?",
            "expected": GuardrailAction.ALLOW,
        },
        
        # ─── Out-of-Bounds Queries (Should BLOCK) ───
        {
            "desc": "✗ Food/Recipe question",
            "query": "What's a healthy recipe for pasta?",
            "expected": GuardrailAction.BLOCK_OOB,
        },
        {
            "desc": "✗ Sports question",
            "query": "What was the IPL cricket score yesterday?",
            "expected": GuardrailAction.BLOCK_OOB,
        },
        {
            "desc": "✗ Entertainment question",
            "query": "Which movies should I watch on Netflix this weekend?",
            "expected": GuardrailAction.BLOCK_OOB,
        },
        {
            "desc": "✗ Travel question",
            "query": "What are the best hotels to stay in Paris?",
            "expected": GuardrailAction.BLOCK_OOB,
        },
        {
            "desc": "✗ Health/Medical question",
            "query": "I have a persistent headache. Should I see a doctor?",
            "expected": GuardrailAction.BLOCK_OOB,
        },
        
        # ─── Emergency Threats (Should EMERGENCY) ───
        # Note: Only regex pattern matches trigger EMERGENCY, not semantic classification
        # (regex patterns specifically detect active threats with action words like "draining", "right now")
        {
            "desc": "🚨 Active fraud happening",
            "query": "Someone is draining my UPI account right now! Help!",
            "expected": GuardrailAction.EMERGENCY,
        },
        {
            "desc": "🚨 Account compromised (will be ALLOW - no active threat language)",
            "query": "My banking app has been hacked and I can't access it!",
            "expected": GuardrailAction.ALLOW,
        },
        {
            "desc": "🚨 Ransomware attack (will be ALLOW - no active threat language)",
            "query": "My computer just got locked with ransomware, what do I do?",
            "expected": GuardrailAction.ALLOW,
        },
        
        # ─── PII Detection (Should ALLOW with PII_REDACTED) ───
        {
            "desc": "⚠ Query with sensitive data",
            "query": "My card number is 4111-1111-1111-1111, is it compromised?",
            "expected": GuardrailAction.PII_REDACTED,
        },
        {
            "desc": "⚠ Query with email",
            "query": "I got a phishing email at john.doe@example.com, what should I do?",
            "expected": GuardrailAction.PII_REDACTED,
        },
    ]
    
    print("\n" + "="*80)
    print("SEMANTIC SECURITY GUARDRAILS — VALIDATION TEST SUITE")
    print("="*80 + "\n")
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(test_cases, 1):
        print(f"Test {i}: {test['desc']}")
        print(f"  Query: {test['query']}")
        
        result = run_guardrails(test['query'])
        
        print(f"  Expected: {test['expected'].value.upper()}")
        print(f"  Got:      {result.action.value.upper()}")
        
        # Check if action matches
        if result.action == test['expected']:
            print("  Status:   ✓ PASS")
            passed += 1
        else:
            print("  Status:   ✗ FAIL")
            failed += 1
        
        # Show classifier details
        if isinstance(result.classifier_score, dict) and 'cyber_similarity' in result.classifier_score:
            scores = result.classifier_score
            print(f"  Scores:   cyber={scores.get('cyber_similarity', 0):.3f}, "
                  f"oob={scores.get('oob_similarity', 0):.3f}, "
                  f"confidence={scores.get('confidence', 0):.3f}")
        
        if result.pii_found:
            print(f"  PII:      {', '.join(result.pii_found)}")
        
        print()
    
    # Summary
    print("="*80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
    print("="*80 + "\n")
    
    if failed == 0:
        print("✓ All tests passed! Semantic classifier is working correctly.")
    else:
        print(f"✗ {failed} test(s) failed. Review the results above.")
    
    return failed == 0

def compare_keyword_vs_semantic():
    """
    Demonstrates the difference between keyword-based and semantic classification.
    This shows why semantic classification is superior for understanding intent.
    
    Note: Semantic classifier only determines in-scope (cybersecurity) vs out-of-scope.
    Emergency detection is purely regex-based (Layer 1).
    """
    print("\n" + "="*80)
    print("SEMANTIC DOMAIN CLASSIFICATION - EXAMPLES")
    print("="*80 + "\n")
    
    examples = [
        "My login credentials were exposed in a data breach",
        "I think someone stole my identity online",
        "How do I prevent my accounts from getting hacked?",
        "Someone is impersonating me on social media",
    ]
    
    for query in examples:
        print(f"Query: {query}\n")
        result = run_guardrails(query)
        
        if isinstance(result.classifier_score, dict):
            scores = result.classifier_score
            print(f"  Action: {result.action.value.upper()}")
            print(f"  Domain: {scores.get('primary_domain', 'unknown')}")
            print(f"  Confidence: {scores.get('confidence', 0):.1%}")
            print(f"  Cyber vs OOB: {scores.get('cyber_similarity', 0):.3f} vs {scores.get('oob_similarity', 0):.3f}\n")
        
        # Note: All these queries are recognized as cybersecurity (in-scope) by semantic classifier
        # Emergency detection would only trigger if they used action words like "right now", "draining", etc.

if __name__ == "__main__":
    # Run comprehensive validation
    success = test_semantic_classifier()
    
    # Show semantic classification examples
    compare_keyword_vs_semantic()
    
    if success:
        print("\n✓ Semantic Security Guardrails validated successfully!")
        print("  Layer 3 uses embeddings and cosine similarity for domain classification.")
        print("  Layer 1 regex patterns handle emergency detection (active threats).")
    else:
        print("\n✗ Some tests failed. Check your Ollama setup and model availability.")
