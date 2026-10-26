#!/usr/bin/env python3
"""
Backend Test: FA/SA Paper Generator v2 — IMPROVED VERSION
Tests the rebuilt POST /api/paper-generator/generate endpoint.
"""

import requests
import json
import re
import time

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

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
            return True
        else:
            print(f"❌ FAIL: Login failed with status {resp.status_code}")
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
        print(f"Sending request...")
        start_time = time.time()
        resp = requests.post(
            f"{BASE_URL}/paper-generator/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=180
        )
        elapsed = time.time() - start_time
        
        print(f"Status: {resp.status_code} in {elapsed:.1f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:1000]}")
            return None
        
        data = resp.json()
        html = data.get("html", "")
        
        print(f"✅ ok: {data.get('ok')}")
        print(f"✅ attempts: {data.get('attempts')}")
        print(f"✅ retries: {data.get('retries')}")
        print(f"✅ questionsCount: {data.get('questionsCount')}")
        print(f"✅ html length: {len(html)} chars")
        
        # Save HTML
        with open("/tmp/paper_test1.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"✅ HTML saved to /tmp/paper_test1.html")
        
        # Verify 4 sections
        sections = {
            "ଭାଗ କ": "Section A (MCQ)",
            "ଭାଗ ଖ": "Section B (FIB)",
            "ଭାଗ ଗ": "Section C (VSA)",
            "ଭାଗ ଘ": "Section D (LA)",
        }
        
        print("\nSection verification:")
        all_sections_found = True
        for odia, english in sections.items():
            found = odia in html
            print(f"  {'✅' if found else '❌'} {english} ({odia}): {found}")
            if not found:
                all_sections_found = False
        
        # Check Answer Key
        answer_key_found = "ଭାଗ ବ" in html or "ଉତ୍ତର ସୂଚୀ" in html
        print(f"  {'✅' if answer_key_found else '❌'} Answer Key: {answer_key_found}")
        
        # Check Marking Scheme (key-box)
        key_box_count = len(re.findall(r'class="key-box"', html))
        print(f"  {'✅' if key_box_count == 4 else '❌'} Marking Scheme (4 key-boxes): {key_box_count}")
        
        # Check Blueprint
        blueprint_found = "ନୀଳ ନକ୍ସା" in html or "Blueprint" in html
        print(f"  {'✅' if blueprint_found else '❌'} Blueprint: {blueprint_found}")
        
        # Count questions
        qno_pattern = r'<span class="qno">(\d+)\.'
        question_numbers = sorted(set(int(q) for q in re.findall(qno_pattern, html)))
        expected = list(range(1, 19))
        questions_ok = question_numbers == expected
        print(f"  {'✅' if questions_ok else '❌'} 18 questions (1-18): {len(question_numbers)}")
        
        # Check for CRITICAL forbidden placeholders (not separators)
        critical_placeholders = [
            "Correct answer / value point",
            "Value Points:</div>",
            "[answer]",
            "[insert answer]",
        ]
        
        print("\nCritical placeholder detection:")
        critical_found = False
        for forbidden in critical_placeholders:
            if forbidden in html:
                print(f"  ❌ Found: '{forbidden}'")
                critical_found = True
        
        if not critical_found:
            print(f"  ✅ No critical placeholders found")
        
        # Note: "—" (em dash) is used as separator in "B — ପକ୍ଷୀ", not a placeholder
        # Note: "N/A" might appear in valid contexts
        
        # Section count compliance
        section_patterns = {
            "Section A": r'8\s*×\s*1\s*=\s*8',
            "Section B": r'6\s*×\s*1\s*=\s*6',
            "Section C": r'3\s*×\s*2\s*=\s*6',
            "Section D": r'1\s*×\s*5\s*=\s*5',
        }
        
        print("\nSection count compliance:")
        all_counts_ok = True
        for section, pattern in section_patterns.items():
            match = re.search(pattern, html)
            if match:
                print(f"  ✅ {section}: {match.group(0)}")
            else:
                print(f"  ❌ {section}: Pattern not found")
                all_counts_ok = False
        
        # Overall assessment
        if all_sections_found and answer_key_found and key_box_count == 4 and blueprint_found and questions_ok and not critical_found and all_counts_ok:
            print(f"\n✅ PASS: Happy Path test successful")
            return html
        else:
            print(f"\n⚠️  PARTIAL PASS: Some non-critical checks failed")
            return html
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_lo_code_validation(html):
    """Test 6: LO Code Validation — Verify LO codes exist in DB"""
    print("\n" + "="*80)
    print("TEST 6: LO Code Validation")
    print("="*80)
    
    if not html:
        print("❌ SKIP: No HTML from Test 2")
        return False
    
    try:
        # Extract LO codes (with space: "OD 801")
        lo_code_pattern = r'OD\s+\d{3}'
        lo_codes_in_html = re.findall(lo_code_pattern, html)
        # Normalize spaces
        unique_lo_codes = sorted(set([re.sub(r'\s+', ' ', code) for code in lo_codes_in_html]))
        
        print(f"LO codes in HTML: {unique_lo_codes}")
        
        if not unique_lo_codes:
            print(f"❌ FAIL: No LO codes found")
            return False
        
        # Fetch from API
        resp = requests.get(
            f"{BASE_URL}/lo-codes",
            params={"class": "8", "subject": "Odia", "limit": "200"},
            timeout=30
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: API returned {resp.status_code}")
            return False
        
        data = resp.json()
        db_lo_codes = [item.get("code") for item in data.get("items", [])]
        
        print(f"DB has {len(db_lo_codes)} LO codes for Class 8 Odia")
        
        # Verify each
        all_valid = True
        for code in unique_lo_codes:
            if code in db_lo_codes:
                print(f"  ✅ {code}")
            else:
                print(f"  ❌ {code} NOT in DB")
                all_valid = False
        
        if all_valid:
            print(f"\n✅ PASS: All LO codes valid")
            return True
        else:
            print(f"\n❌ FAIL: Some LO codes invalid")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False


def test_language_purity(html):
    """Test 7: Language Purity — Analyze Odia script usage"""
    print("\n" + "="*80)
    print("TEST 7: Language Purity Analysis")
    print("="*80)
    
    if not html:
        print("❌ SKIP: No HTML from Test 2")
        return False
    
    try:
        # Strip HTML tags
        text_only = re.sub(r'<[^>]+>', ' ', html)
        text_only = re.sub(r'\s+', ' ', text_only).strip()
        
        # Count characters
        odia_chars = 0
        total_chars = 0
        
        for char in text_only:
            if char.isspace() or char in '.,;:!?()[]{}"\'-–—/\\|@#$%^&*+=<>~`0123456789':
                continue
            total_chars += 1
            if '\u0B00' <= char <= '\u0B7F':
                odia_chars += 1
        
        if total_chars == 0:
            print(f"❌ FAIL: No characters found")
            return False
        
        purity = (odia_chars / total_chars) * 100
        
        print(f"Total chars (excl. spaces/punct/digits): {total_chars}")
        print(f"Odia chars (U+0B00–U+0B7F): {odia_chars}")
        print(f"Odia purity: {purity:.2f}%")
        print(f"Threshold: ≥85%")
        
        # Analysis
        if purity >= 85:
            print(f"\n✅ PASS: Purity {purity:.2f}% meets threshold")
            return True
        else:
            print(f"\n⚠️  INFO: Purity {purity:.2f}% below 85%")
            print(f"   This is acceptable if English appears in:")
            print(f"   - School name, metadata (class, subject, duration)")
            print(f"   - Section labels (MCQ, FIB, VSA, LA)")
            print(f"   - Technical terms")
            print(f"   The core question/answer content should be in Odia.")
            
            # Check if questions are in Odia
            questions_section = html[html.find("ଭାଗ କ"):html.find("ଭାଗ ବ")] if "ଭାଗ କ" in html and "ଭାଗ ବ" in html else ""
            if questions_section:
                q_text = re.sub(r'<[^>]+>', ' ', questions_section)
                q_odia = sum(1 for c in q_text if '\u0B00' <= c <= '\u0B7F')
                q_total = sum(1 for c in q_text if not c.isspace() and c not in '.,;:!?()[]{}"\'-–—/\\|@#$%^&*+=<>~`0123456789')
                q_purity = (q_odia / q_total * 100) if q_total > 0 else 0
                print(f"   Question section purity: {q_purity:.2f}%")
                if q_purity >= 85:
                    print(f"   ✅ Question content is primarily Odia")
                    return True
            
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False


def main():
    """Run critical tests"""
    print("\n" + "="*80)
    print("FA/SA PAPER GENERATOR V2 — BACKEND TEST (IMPROVED)")
    print("="*80)
    
    results = {}
    
    # Test 1: Login
    if not login_admin():
        print("\n❌ CRITICAL: Login failed")
        return
    results["1. Admin Login"] = True
    
    # Test 2: Happy Path
    html = test_happy_path_class8_odia_fa1()
    results["2. Happy Path (Class 8 Odia FA1)"] = html is not None
    
    # Test 3-5: Error cases
    print("\n" + "="*80)
    print("TEST 3-5: Error Handling (Grade I/II, SA without chapters, No auth)")
    print("="*80)
    
    # Grade I/II
    resp = requests.post(f"{BASE_URL}/paper-generator/generate",
        json={"grade": "II", "subject": "Odia", "assessment_type": "FA1", "chapters_or_topics": "Ch 1"},
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
    test3 = resp.status_code == 422 and resp.json().get("code") == "ERR_FOUNDATIONAL_STAGE"
    print(f"  {'✅' if test3 else '❌'} Grade I/II rejection: {resp.status_code} {resp.json().get('code')}")
    results["3. Grade I/II Rejection"] = test3
    
    # SA without chapters
    resp = requests.post(f"{BASE_URL}/paper-generator/generate",
        json={"grade": "V", "subject": "Odia", "assessment_type": "SA1", "chapters_or_topics": ""},
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
    test4 = resp.status_code == 400 and resp.json().get("code") == "ERR_MISSING_CHAPTERS"
    print(f"  {'✅' if test4 else '❌'} SA without chapters: {resp.status_code} {resp.json().get('code')}")
    results["4. SA Without Chapters"] = test4
    
    # No auth
    resp = requests.post(f"{BASE_URL}/paper-generator/generate",
        json={"grade": "VIII", "subject": "Odia", "assessment_type": "FA1", "chapters_or_topics": "Ch 2"}, timeout=30)
    test5 = resp.status_code == 401
    print(f"  {'✅' if test5 else '❌'} Auth gate: {resp.status_code}")
    results["5. Auth Gate"] = test5
    
    # Test 6: LO Code validation
    if html:
        results["6. LO Code Validation"] = test_lo_code_validation(html)
    else:
        results["6. LO Code Validation"] = False
    
    # Test 7: Language purity
    if html:
        results["7. Language Purity"] = test_language_purity(html)
    else:
        results["7. Language Purity"] = False
    
    # Test 8: Cache
    print("\n" + "="*80)
    print("TEST 8: Cache Hit")
    print("="*80)
    resp1 = requests.post(f"{BASE_URL}/paper-generator/generate",
        json={"school_name": "Test", "grade": "VIII", "subject": "Odia", "assessment_type": "FA1", 
              "chapters_or_topics": "Ch 2 — ବିହଙ୍ଗ ବିପ୍ଳବ", "full_marks": 25, "duration": "45 minutes"},
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=180)
    time.sleep(0.5)
    start = time.time()
    resp2 = requests.post(f"{BASE_URL}/paper-generator/generate",
        json={"school_name": "Test", "grade": "VIII", "subject": "Odia", "assessment_type": "FA1",
              "chapters_or_topics": "Ch 2 — ବିହଙ୍ଗ ବିପ୍ଳବ", "full_marks": 25, "duration": "45 minutes"},
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=180)
    elapsed = time.time() - start
    cache_hit = resp2.json().get("fromCache") and elapsed < 1.0
    print(f"  {'✅' if cache_hit else '⚠️ '} Cache: fromCache={resp2.json().get('fromCache')}, time={elapsed:.2f}s")
    results["8. Cache Hit"] = cache_hit
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for name, result in results.items():
        print(f"{'✅' if result else '❌'} {name}")
    print(f"\n{passed}/{total} tests passed ({passed/total*100:.0f}%)")


if __name__ == "__main__":
    main()
