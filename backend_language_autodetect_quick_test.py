#!/usr/bin/env python3
"""
Quick backend test for Language Auto-Detection in Assessment Builder
Tests the 5 cases from the review request
"""

import requests
import time
import re
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test data
ENGLISH_CLASS_ID = "5a07f222-9b73-432b-978c-db00669f2165"
ENGLISH_BOOK_ID = "3958c3b2-7286-44c4-844e-c4ada05bcf75"
ENGLISH_CHAPTER_ID = "a8092463-fdc2-409c-b173-07907b8eeea7"

ODIA_CLASS_ID = "39c75179-874e-4c6f-9549-7d82462f42d0"
ODIA_BOOK_ID = "57e77512-39dc-45ab-a949-1997adb53273"
ODIA_CHAPTER_ID = "39e2c118-ffde-4d18-947d-c4db6142920f"

def has_odia_chars(text):
    """Check if text contains Odia unicode characters"""
    return bool(re.search(r'[\u0B00-\u0B7F]', str(text)))

def login():
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=30)
    return resp.json().get("token")

def build_and_poll(token, payload, max_wait=120):
    """Build assessment and poll until ready"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # Build
    resp = requests.post(f"{BASE_URL}/assessments/build", json=payload, headers=headers, timeout=30)
    if resp.status_code != 200:
        print(f"❌ Build failed: {resp.status_code}")
        return None
    
    assessment_id = resp.json().get("assessment", {}).get("id")
    if not assessment_id:
        print(f"❌ No assessment ID")
        return None
    
    print(f"Building {assessment_id}...", end="", flush=True)
    
    # Poll
    start = time.time()
    while time.time() - start < max_wait:
        resp = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=headers, timeout=30)
        if resp.status_code != 200:
            print(f" ❌ Poll failed: {resp.status_code}")
            return None
        
        data = resp.json()
        assessment = data.get("assessment", data)
        status = assessment.get("status")
        
        if status == "ready":
            elapsed = time.time() - start
            print(f" ✅ Ready in {elapsed:.1f}s")
            return assessment
        elif status == "failed":
            print(f" ❌ Failed: {assessment.get('error')}")
            return None
        
        time.sleep(5)
    
    print(f" ❌ Timeout")
    return None

def delete_assessment(token, assessment_id):
    """Delete assessment"""
    headers = {"Authorization": f"Bearer {token}"}
    requests.delete(f"{BASE_URL}/assessments/{assessment_id}", headers=headers, timeout=30)

def test_case_1():
    """Case 1: English subject → English output"""
    print("\n" + "="*80)
    print("CASE 1: English Subject (Class 9 English · The Priceless Gift)")
    print("="*80)
    
    token = login()
    payload = {
        "assessmentType": "practice",
        "classId": ENGLISH_CLASS_ID,
        "bookId": ENGLISH_BOOK_ID,
        "chapterIds": [ENGLISH_CHAPTER_ID],
        "totalMarks": 10,
        "writtenTypes": ["mcq"],
        "generateImages": False,
        "autoAddPictureSection": False
    }
    
    assessment = build_and_poll(token, payload)
    if not assessment:
        return None, False
    
    # Verify
    final_lang = assessment.get("finalLanguage")
    title = assessment.get("title", "")
    sections = assessment.get("sections", [])
    
    passed = True
    
    # Check finalLanguage
    if final_lang != "english":
        print(f"❌ FAIL: finalLanguage is '{final_lang}', expected 'english'")
        passed = False
    else:
        print(f"✅ PASS: finalLanguage = 'english'")
    
    # Check title
    if has_odia_chars(title):
        print(f"❌ FAIL: Title has Odia chars: {title}")
        passed = False
    else:
        print(f"✅ PASS: Title is English: {title}")
    
    # Check questions
    all_english = True
    samples = []
    for section in sections:
        for q in section.get("questions", []):
            stem = q.get("q", "")
            samples.append(stem)
            if has_odia_chars(stem):
                print(f"❌ FAIL: Question has Odia: {stem}")
                all_english = False
                passed = False
            for opt in q.get("options", []):
                if has_odia_chars(opt):
                    print(f"❌ FAIL: Option has Odia: {opt}")
                    all_english = False
                    passed = False
    
    if all_english:
        print(f"✅ PASS: All questions/options are English")
        print(f"Sample: {samples[0] if samples else 'N/A'}")
    
    return assessment.get("id"), passed

def test_case_2():
    """Case 2: Odia subject → Odia output"""
    print("\n" + "="*80)
    print("CASE 2: Odia Subject (Balvatika · ଝୁଲଣା)")
    print("="*80)
    
    token = login()
    payload = {
        "assessmentType": "practice",
        "classId": ODIA_CLASS_ID,
        "bookId": ODIA_BOOK_ID,
        "chapterIds": [ODIA_CHAPTER_ID],
        "totalMarks": 10,
        "writtenTypes": ["mcq", "fill"],
        "generateImages": False,
        "autoAddPictureSection": False
    }
    
    assessment = build_and_poll(token, payload)
    if not assessment:
        return None, False
    
    # Verify
    final_lang = assessment.get("finalLanguage")
    sections = assessment.get("sections", [])
    
    passed = True
    
    # Check finalLanguage
    if final_lang != "odia":
        print(f"❌ FAIL: finalLanguage is '{final_lang}', expected 'odia'")
        passed = False
    else:
        print(f"✅ PASS: finalLanguage = 'odia'")
    
    # Check questions have Odia
    all_have_odia = True
    samples = []
    for section in sections:
        for q in section.get("questions", []):
            stem = q.get("q", "")
            samples.append(stem)
            if not has_odia_chars(stem):
                print(f"❌ FAIL: Question has no Odia: {stem}")
                all_have_odia = False
                passed = False
    
    if all_have_odia:
        print(f"✅ PASS: All questions contain Odia")
        print(f"Sample: {samples[0] if samples else 'N/A'}")
    
    return assessment.get("id"), passed

def test_case_3():
    """Case 3: Explicit override (force Odia on English book)"""
    print("\n" + "="*80)
    print("CASE 3: Explicit Override (Force Odia on English Book)")
    print("="*80)
    
    token = login()
    payload = {
        "assessmentType": "practice",
        "classId": ENGLISH_CLASS_ID,
        "bookId": ENGLISH_BOOK_ID,
        "chapterIds": [ENGLISH_CHAPTER_ID],
        "totalMarks": 10,
        "writtenTypes": ["mcq"],
        "language": "odia",  # Override
        "generateImages": False,
        "autoAddPictureSection": False
    }
    
    assessment = build_and_poll(token, payload)
    if not assessment:
        return None, False
    
    # Verify
    final_lang = assessment.get("finalLanguage")
    sections = assessment.get("sections", [])
    
    passed = True
    
    # Check finalLanguage
    if final_lang != "odia":
        print(f"❌ FAIL: finalLanguage is '{final_lang}', expected 'odia'")
        passed = False
    else:
        print(f"✅ PASS: finalLanguage = 'odia' (override worked)")
    
    # Check questions have Odia
    has_odia_content = False
    samples = []
    for section in sections:
        for q in section.get("questions", []):
            stem = q.get("q", "")
            samples.append(stem)
            if has_odia_chars(stem):
                has_odia_content = True
    
    if has_odia_content:
        print(f"✅ PASS: Questions contain Odia")
        print(f"Sample: {samples[0] if samples else 'N/A'}")
    else:
        print(f"❌ FAIL: No Odia found in questions")
        passed = False
    
    return assessment.get("id"), passed

def test_case_4():
    """Case 4: Coverage - many written types on English book"""
    print("\n" + "="*80)
    print("CASE 4: Coverage - Many Written Types on English Book")
    print("="*80)
    
    token = login()
    payload = {
        "assessmentType": "practice",
        "classId": ENGLISH_CLASS_ID,
        "bookId": ENGLISH_BOOK_ID,
        "chapterIds": [ENGLISH_CHAPTER_ID],
        "totalMarks": 30,
        "writtenTypes": ["mcq", "fill", "tf", "oneword", "vsa", "la", "match"],
        "generateImages": False,
        "autoAddPictureSection": False
    }
    
    assessment = build_and_poll(token, payload, max_wait=150)
    if not assessment:
        return None, False
    
    # Verify
    final_lang = assessment.get("finalLanguage")
    sections = assessment.get("sections", [])
    
    passed = True
    
    # Check finalLanguage
    if final_lang != "english":
        print(f"❌ FAIL: finalLanguage is '{final_lang}', expected 'english'")
        passed = False
    else:
        print(f"✅ PASS: finalLanguage = 'english'")
    
    # Check all sections
    for section in sections:
        key = section.get("key")
        questions = section.get("questions", [])
        
        if len(questions) == 0:
            print(f"⚠️  Section '{key}': EMPTY (generation may have failed)")
            continue
        
        section_english = True
        for q in questions:
            # Check stem
            if has_odia_chars(q.get("q", "")):
                section_english = False
            # Check options
            for opt in q.get("options", []):
                if has_odia_chars(opt):
                    section_english = False
            # Check answer
            if has_odia_chars(q.get("answer", "")):
                section_english = False
            # Check match columns
            for item in q.get("columnA", []) + q.get("columnB", []):
                if has_odia_chars(item):
                    section_english = False
        
        if section_english:
            print(f"✅ Section '{key}': {len(questions)} questions, all English")
        else:
            print(f"❌ Section '{key}': Contains Odia characters")
            passed = False
    
    return assessment.get("id"), passed

def test_case_5():
    """Case 5: Regression tests"""
    print("\n" + "="*80)
    print("CASE 5: Regression Tests")
    print("="*80)
    
    token = login()
    headers = {"Authorization": f"Bearer {token}"}
    
    passed = True
    
    # Test GET /api/assessments
    resp = requests.get(f"{BASE_URL}/assessments", headers=headers, timeout=30)
    if resp.status_code == 200:
        items = resp.json().get("items", [])
        print(f"✅ GET /api/assessments: {len(items)} items")
    else:
        print(f"❌ GET /api/assessments: {resp.status_code}")
        passed = False
    
    # Test GET /api/assessments/community
    resp = requests.get(f"{BASE_URL}/assessments/community?limit=5", headers=headers, timeout=30)
    if resp.status_code == 200:
        items = resp.json().get("items", [])
        print(f"✅ GET /api/assessments/community: {len(items)} items")
    else:
        print(f"❌ GET /api/assessments/community: {resp.status_code}")
        passed = False
    
    return None, passed

def main():
    print("="*80)
    print("LANGUAGE AUTO-DETECTION BACKEND TEST")
    print("="*80)
    
    results = []
    assessment_ids = []
    
    # Run all test cases
    aid, passed = test_case_1()
    results.append(("Case 1: English subject", passed))
    if aid: assessment_ids.append(aid)
    
    aid, passed = test_case_2()
    results.append(("Case 2: Odia subject", passed))
    if aid: assessment_ids.append(aid)
    
    aid, passed = test_case_3()
    results.append(("Case 3: Explicit override", passed))
    if aid: assessment_ids.append(aid)
    
    aid, passed = test_case_4()
    results.append(("Case 4: Coverage", passed))
    if aid: assessment_ids.append(aid)
    
    _, passed = test_case_5()
    results.append(("Case 5: Regression", passed))
    
    # Cleanup
    if assessment_ids:
        print("\n" + "="*80)
        print("CLEANUP")
        print("="*80)
        token = login()
        for aid in assessment_ids:
            delete_assessment(token, aid)
            print(f"Deleted {aid}")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(p for _, p in results)
    print("\n" + ("="*80))
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)

if __name__ == "__main__":
    main()
