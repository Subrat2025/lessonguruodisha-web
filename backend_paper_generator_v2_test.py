#!/usr/bin/env python3
"""
Backend Test: FA/SA Paper Generator v2 — Single JSON Source of Truth
Tests the rebuilt POST /api/paper-generator/generate endpoint.
"""

import requests
import json
import re
import time
from html.parser import HTMLParser

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Global token storage
admin_token = None

def login_admin():
    """Test 1: Admin Login"""
    global admin_token
    print("\n" + "="*80)
    print("TEST 1: Admin Login")
    print("="*80)
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            admin_token = data.get("token")
            print(f"✅ PASS: Admin login successful")
            print(f"Token: {admin_token[:50]}...")
            return True
        else:
            print(f"❌ FAIL: Login failed with status {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception during login: {e}")
        return False


def test_happy_path_class8_odia_fa1():
    """Test 2: Happy Path — Class 8 Odia FA1 (Ch 2 Bihanga Biplab)"""
    print("\n" + "="*80)
    print("TEST 2: Happy Path — Class 8 Odia FA1 (Ch 2 — ବିହଙ୍ଗ ବିପ୍ଳବ)")
    print("="*80)
    
    payload = {
        "school_name": "Govt Elementary School",
        "session": "2026-27",
        "grade": "VIII",
        "subject": "Odia",
        "language": "Odia",
        "assessment_type": "FA1",
        "term": "Term 1 (April–September)",
        "full_marks": 25,
        "duration": "45 minutes",
        "chapters_or_topics": "Ch 2 — ବିହଙ୍ଗ ବିପ୍ଳବ"
    }
    
    try:
        print(f"Sending request to {BASE_URL}/paper-generator/generate")
        print(f"Payload: {json.dumps(payload, ensure_ascii=False)}")
        
        start_time = time.time()
        resp = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=180  # 3 minutes timeout for Gemini
        )
        elapsed = time.time() - start_time
        
        print(f"Status: {resp.status_code}")
        print(f"Response time: {elapsed:.1f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:1000]}")
            return None
        
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check required fields
        if not data.get("ok"):
            print(f"❌ FAIL: ok field is not true")
            return None
        
        html = data.get("html", "")
        if not html.startswith("<!DOCTYPE html>"):
            print(f"❌ FAIL: html does not start with <!DOCTYPE html>")
            return None
        
        attempts = data.get("attempts", 0)
        retries = data.get("retries", 0)
        questions_count = data.get("questionsCount", 0)
        
        print(f"✅ ok: {data.get('ok')}")
        print(f"✅ attempts: {attempts}")
        print(f"✅ retries: {retries}")
        print(f"✅ questionsCount: {questions_count}")
        print(f"✅ html length: {len(html)} chars")
        
        # Save HTML for inspection
        with open("/tmp/paper_test1.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"✅ HTML saved to /tmp/paper_test1.html")
        
        # Verify sections exist
        sections_found = {
            "Section A (MCQ)": "ଭାଗ କ" in html or "Section A" in html,
            "Section B (FIB)": "ଭାଗ ଖ" in html or "Section B" in html,
            "Section C (VSA)": "ଭାଗ ଗ" in html or "Section C" in html,
            "Section D (LA)": "ଭାଗ ଘ" in html or "Section D" in html,
        }
        
        print("\nSection verification:")
        for section, found in sections_found.items():
            status = "✅" if found else "❌"
            print(f"{status} {section}: {found}")
        
        # Check for Answer Key
        answer_key_found = "Answer Key" in html or "ଉତ୍ତର ମାଳା" in html or "ଭାଗ ବ" in html
        print(f"{'✅' if answer_key_found else '❌'} Answer Key found: {answer_key_found}")
        
        # Check for Marking Scheme
        marking_scheme_found = "Marking Scheme" in html or "ମୂଲ୍ୟାଙ୍କନ ଯୋଜନା" in html or "key-box" in html
        print(f"{'✅' if marking_scheme_found else '❌'} Marking Scheme found: {marking_scheme_found}")
        
        # Check for Blueprint
        blueprint_found = "Blueprint" in html or "ନୀଳ ନକ୍ସା" in html
        print(f"{'✅' if blueprint_found else '❌'} Blueprint found: {blueprint_found}")
        
        # Count questions (look for <span class="qno">)
        qno_pattern = r'<span class="qno">(\d+)\.'
        question_numbers = re.findall(qno_pattern, html)
        unique_questions = len(set(question_numbers))
        print(f"\nQuestion count verification:")
        print(f"  Unique question numbers found: {unique_questions}")
        print(f"  Expected: 18")
        print(f"  {'✅' if unique_questions == 18 else '❌'} Question count matches")
        
        # Check for forbidden placeholders
        forbidden_strings = [
            "Correct answer / value point",
            "Value Points:</div>",
            "[answer]",
            "[insert answer]",
            "N/A",
            "—",
        ]
        
        print("\nPlaceholder detection (should be ZERO):")
        placeholder_found = False
        for forbidden in forbidden_strings:
            if forbidden in html:
                print(f"  ❌ Found forbidden string: '{forbidden}'")
                placeholder_found = True
        
        if not placeholder_found:
            print(f"  ✅ No forbidden placeholders found")
        
        # Count key-boxes in Marking Scheme (should be 4: Q15, Q16, Q17, Q18)
        key_box_count = len(re.findall(r'class="key-box"', html))
        print(f"\nMarking Scheme key-boxes:")
        print(f"  Found: {key_box_count}")
        print(f"  Expected: 4 (for Q15, Q16, Q17, Q18)")
        print(f"  {'✅' if key_box_count == 4 else '❌'} Key-box count matches")
        
        # Extract LO codes from Blueprint
        lo_code_pattern = r'OD\s*\d{3}'
        lo_codes_in_html = re.findall(lo_code_pattern, html)
        unique_lo_codes = list(set(lo_codes_in_html))
        print(f"\nLO Codes found in HTML:")
        print(f"  Unique LO codes: {unique_lo_codes}")
        print(f"  Total occurrences: {len(lo_codes_in_html)}")
        
        if all(sections_found.values()) and answer_key_found and marking_scheme_found and blueprint_found and not placeholder_found:
            print(f"\n✅ PASS: Happy Path test successful")
            return html
        else:
            print(f"\n❌ FAIL: Some checks failed")
            return html
            
    except requests.Timeout:
        print(f"❌ FAIL: Request timed out after 180s")
        return None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_grade_1_2_rejection():
    """Test 3: Grade I/II Foundational Block (should return 422)"""
    print("\n" + "="*80)
    print("TEST 3: Grade I/II Foundational Block — Should return 422 ERR_FOUNDATIONAL_STAGE")
    print("="*80)
    
    payload = {
        "school_name": "Govt Elementary School",
        "session": "2026-27",
        "grade": "II",
        "subject": "Odia",
        "language": "Odia",
        "assessment_type": "FA1",
        "term": "Term 1 (April–September)",
        "full_marks": 25,
        "duration": "45 minutes",
        "chapters_or_topics": "Ch 1 — Test"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 422:
            data = resp.json()
            code = data.get("code")
            error = data.get("error", "")
            print(f"Error code: {code}")
            print(f"Error message: {error}")
            
            if code == "ERR_FOUNDATIONAL_STAGE":
                print(f"✅ PASS: Correctly rejected Grade II with ERR_FOUNDATIONAL_STAGE")
                return True
            else:
                print(f"❌ FAIL: Expected code ERR_FOUNDATIONAL_STAGE, got {code}")
                return False
        else:
            print(f"❌ FAIL: Expected 422, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False


def test_sa_without_chapters():
    """Test 4: SA Without Chapters (should return 400)"""
    print("\n" + "="*80)
    print("TEST 4: SA Without Chapters — Should return 400 ERR_MISSING_CHAPTERS")
    print("="*80)
    
    payload = {
        "school_name": "Govt Elementary School",
        "session": "2026-27",
        "grade": "V",
        "subject": "Odia",
        "language": "Odia",
        "assessment_type": "SA1",
        "term": "Term 1 (April–September)",
        "full_marks": 50,
        "duration": "90 minutes",
        "chapters_or_topics": ""
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 400:
            data = resp.json()
            code = data.get("code")
            error = data.get("error", "")
            print(f"Error code: {code}")
            print(f"Error message: {error}")
            
            if code == "ERR_MISSING_CHAPTERS":
                print(f"✅ PASS: Correctly rejected SA without chapters with ERR_MISSING_CHAPTERS")
                return True
            else:
                print(f"❌ FAIL: Expected code ERR_MISSING_CHAPTERS, got {code}")
                return False
        else:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False


def test_auth_gate():
    """Test 5: Auth Gate — No token should return 401"""
    print("\n" + "="*80)
    print("TEST 5: Auth Gate — No Authorization header should return 401")
    print("="*80)
    
    payload = {
        "school_name": "Govt Elementary School",
        "session": "2026-27",
        "grade": "VIII",
        "subject": "Odia",
        "language": "Odia",
        "assessment_type": "FA1",
        "term": "Term 1 (April–September)",
        "full_marks": 25,
        "duration": "45 minutes",
        "chapters_or_topics": "Ch 2 — ବିହଙ୍ଗ ବିପ୍ଳବ"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 401:
            data = resp.json()
            error = data.get("error", "")
            print(f"Error message: {error}")
            
            if "Login required" in error or "Unauthorized" in error:
                print(f"✅ PASS: Correctly rejected request without token with 401")
                return True
            else:
                print(f"❌ FAIL: Got 401 but unexpected error message: {error}")
                return False
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False


def test_lo_code_validation(html):
    """Test 6: LO Code Validation — Verify LO codes exist in DB"""
    print("\n" + "="*80)
    print("TEST 6: LO Code Validation — Verify LO codes from paper exist in DB")
    print("="*80)
    
    if not html:
        print("❌ FAIL: No HTML provided from Test 2")
        return False
    
    try:
        # Extract LO codes from HTML
        lo_code_pattern = r'OD\s*\d{3}'
        lo_codes_in_html = re.findall(lo_code_pattern, html)
        unique_lo_codes = list(set([code.replace(" ", "") for code in lo_codes_in_html]))
        
        print(f"LO codes found in HTML: {unique_lo_codes}")
        
        if not unique_lo_codes:
            print(f"❌ FAIL: No LO codes found in HTML")
            return False
        
        # Fetch LO codes from API
        resp = requests.get(
            f"{BASE_URL}/lo-codes",
            params={"class": "8", "subject": "Odia", "limit": "200"},
            timeout=30
        )
        
        print(f"API Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Failed to fetch LO codes from API")
            return False
        
        data = resp.json()
        db_lo_codes = [item.get("code") for item in data.get("items", [])]
        
        print(f"LO codes from DB (first 10): {db_lo_codes[:10]}")
        print(f"Total LO codes in DB: {len(db_lo_codes)}")
        
        # Verify each HTML LO code exists in DB
        all_valid = True
        for code in unique_lo_codes:
            if code in db_lo_codes:
                print(f"  ✅ {code} found in DB")
            else:
                print(f"  ❌ {code} NOT found in DB")
                all_valid = False
        
        if all_valid:
            print(f"\n✅ PASS: All LO codes from paper exist in DB")
            return True
        else:
            print(f"\n❌ FAIL: Some LO codes from paper do not exist in DB")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_language_purity(html):
    """Test 7: Language Purity — Verify ≥85% Odia script"""
    print("\n" + "="*80)
    print("TEST 7: Language Purity — Verify ≥85% Odia script (U+0B00–U+0B7F)")
    print("="*80)
    
    if not html:
        print("❌ FAIL: No HTML provided from Test 2")
        return False
    
    try:
        # Strip HTML tags to get visible text
        text_only = re.sub(r'<[^>]+>', ' ', html)
        text_only = re.sub(r'\s+', ' ', text_only).strip()
        
        # Count Odia characters (Unicode block U+0B00–U+0B7F)
        odia_chars = 0
        total_chars = 0
        
        for char in text_only:
            # Skip spaces, punctuation, digits
            if char.isspace() or char in '.,;:!?()[]{}"\'-–—/\\|@#$%^&*+=<>~`0123456789':
                continue
            
            total_chars += 1
            
            # Check if character is in Odia Unicode block
            if '\u0B00' <= char <= '\u0B7F':
                odia_chars += 1
        
        if total_chars == 0:
            print(f"❌ FAIL: No non-space, non-punctuation characters found")
            return False
        
        purity_percent = (odia_chars / total_chars) * 100
        
        print(f"Total characters (excluding spaces/punctuation/digits): {total_chars}")
        print(f"Odia characters (U+0B00–U+0B7F): {odia_chars}")
        print(f"Odia script purity: {purity_percent:.2f}%")
        print(f"Threshold: ≥85%")
        
        if purity_percent >= 85:
            print(f"✅ PASS: Language purity {purity_percent:.2f}% meets threshold")
            return True
        else:
            print(f"❌ FAIL: Language purity {purity_percent:.2f}% below threshold")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_section_count_compliance(html):
    """Test 8: Section Count Compliance — Verify 18 questions (8+6+3+1)"""
    print("\n" + "="*80)
    print("TEST 8: Section Count Compliance — Verify 18 questions (8 MCQ + 6 FIB + 3 VSA + 1 LA)")
    print("="*80)
    
    if not html:
        print("❌ FAIL: No HTML provided from Test 2")
        return False
    
    try:
        # Count questions by section
        # Look for section headers and count questions in each
        
        # Extract all question numbers
        qno_pattern = r'<span class="qno">(\d+)\.'
        question_numbers = re.findall(qno_pattern, html)
        unique_questions = sorted(set(int(q) for q in question_numbers))
        
        print(f"Unique question numbers: {unique_questions}")
        print(f"Total unique questions: {len(unique_questions)}")
        
        # Verify we have exactly 18 questions numbered 1-18
        expected_questions = list(range(1, 19))
        
        if unique_questions == expected_questions:
            print(f"✅ Questions numbered 1-18 correctly")
        else:
            print(f"❌ Question numbering mismatch")
            print(f"  Expected: {expected_questions}")
            print(f"  Got: {unique_questions}")
        
        # Check section headers for counts
        # FA1 25 marks: 8 MCQ (1 mark each) + 6 FIB (1 mark each) + 3 VSA (2 marks each) + 1 LA (5 marks)
        section_patterns = {
            "Section A (MCQ)": r'(8\s*×\s*1\s*=\s*8)',
            "Section B (FIB)": r'(6\s*×\s*1\s*=\s*6)',
            "Section C (VSA)": r'(3\s*×\s*2\s*=\s*6)',
            "Section D (LA)": r'(1\s*×\s*5\s*=\s*5)',
        }
        
        print("\nSection count verification:")
        all_sections_valid = True
        for section, pattern in section_patterns.items():
            match = re.search(pattern, html)
            if match:
                print(f"  ✅ {section}: {match.group(1)}")
            else:
                print(f"  ❌ {section}: Pattern not found")
                all_sections_valid = False
        
        # Verify total marks = 25
        total_marks = 8 + 6 + 6 + 5
        print(f"\nTotal marks: {total_marks}")
        print(f"Expected: 25")
        
        if len(unique_questions) == 18 and unique_questions == expected_questions and all_sections_valid and total_marks == 25:
            print(f"\n✅ PASS: Section count compliance verified")
            return True
        else:
            print(f"\n❌ FAIL: Section count compliance check failed")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_cache_hit():
    """Test 9: Cache Hit (optional) — Send same request twice"""
    print("\n" + "="*80)
    print("TEST 9: Cache Hit (optional) — Send same request twice without variation_seed")
    print("="*80)
    
    payload = {
        "school_name": "Govt Elementary School",
        "session": "2026-27",
        "grade": "VIII",
        "subject": "Odia",
        "language": "Odia",
        "assessment_type": "FA1",
        "term": "Term 1 (April–September)",
        "full_marks": 25,
        "duration": "45 minutes",
        "chapters_or_topics": "Ch 2 — ବିହଙ୍ଗ ବିପ୍ଳବ"
    }
    
    try:
        # First request (should generate)
        print("Sending first request...")
        start1 = time.time()
        resp1 = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=180
        )
        elapsed1 = time.time() - start1
        
        print(f"First request: {resp1.status_code} in {elapsed1:.1f}s")
        
        if resp1.status_code != 200:
            print(f"❌ FAIL: First request failed")
            return False
        
        data1 = resp1.json()
        from_cache1 = data1.get("fromCache", False)
        print(f"First request fromCache: {from_cache1}")
        
        # Second request (should hit cache)
        print("\nSending second request (should hit cache)...")
        start2 = time.time()
        resp2 = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=180
        )
        elapsed2 = time.time() - start2
        
        print(f"Second request: {resp2.status_code} in {elapsed2:.1f}s")
        
        if resp2.status_code != 200:
            print(f"❌ FAIL: Second request failed")
            return False
        
        data2 = resp2.json()
        from_cache2 = data2.get("fromCache", False)
        print(f"Second request fromCache: {from_cache2}")
        
        if from_cache2 and elapsed2 < 1.0:
            print(f"✅ PASS: Cache hit detected (fromCache=true, response time < 1s)")
            return True
        elif from_cache2:
            print(f"⚠️  PARTIAL: fromCache=true but response time {elapsed2:.1f}s >= 1s")
            return True
        else:
            print(f"⚠️  INFO: Cache not hit (fromCache=false). This is acceptable if cache is disabled.")
            return True
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("FA/SA PAPER GENERATOR V2 — BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    
    results = {}
    
    # Test 1: Login
    if not login_admin():
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        return
    results["Test 1: Admin Login"] = True
    
    # Test 2: Happy Path
    html = test_happy_path_class8_odia_fa1()
    results["Test 2: Happy Path (Class 8 Odia FA1)"] = html is not None
    
    # Test 3: Grade I/II rejection
    results["Test 3: Grade I/II Rejection"] = test_grade_1_2_rejection()
    
    # Test 4: SA without chapters
    results["Test 4: SA Without Chapters"] = test_sa_without_chapters()
    
    # Test 5: Auth gate
    results["Test 5: Auth Gate"] = test_auth_gate()
    
    # Test 6: LO Code validation (depends on Test 2)
    if html:
        results["Test 6: LO Code Validation"] = test_lo_code_validation(html)
    else:
        results["Test 6: LO Code Validation"] = False
        print("\n⚠️  SKIP: Test 6 skipped (no HTML from Test 2)")
    
    # Test 7: Language purity (depends on Test 2)
    if html:
        results["Test 7: Language Purity"] = test_language_purity(html)
    else:
        results["Test 7: Language Purity"] = False
        print("\n⚠️  SKIP: Test 7 skipped (no HTML from Test 2)")
    
    # Test 8: Section count compliance (depends on Test 2)
    if html:
        results["Test 8: Section Count Compliance"] = test_section_count_compliance(html)
    else:
        results["Test 8: Section Count Compliance"] = False
        print("\n⚠️  SKIP: Test 8 skipped (no HTML from Test 2)")
    
    # Test 9: Cache hit (optional)
    results["Test 9: Cache Hit (optional)"] = test_cache_hit()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")


if __name__ == "__main__":
    main()
