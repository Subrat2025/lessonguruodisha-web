#!/usr/bin/env python3
"""
Backend test for Language Auto-Detection in Assessment Builder
Tests that English-subject books generate English-only assessments
and Odia-subject books generate Odia assessments.
"""

import requests
import time
import re
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test data from review request
ENGLISH_CLASS_ID = "5a07f222-9b73-432b-978c-db00669f2165"  # Class 9
ENGLISH_BOOK_ID = "3958c3b2-7286-44c4-844e-c4ada05bcf75"   # English book
ENGLISH_CHAPTER_ID = "a8092463-fdc2-409c-b173-07907b8eeea7"  # The Priceless Gift

ODIA_CLASS_ID = "39c75179-874e-4c6f-9549-7d82462f42d0"  # Balvatika
ODIA_BOOK_ID = "57e77512-39dc-45ab-a949-1997adb53273"   # Odia book
ODIA_CHAPTER_ID = "39e2c118-ffde-4d18-947d-c4db6142920f"  # ଝୁଲଣା

def has_odia_chars(text):
    """Check if text contains Odia unicode characters (U+0B00 to U+0B7F)"""
    if not text:
        return False
    return bool(re.search(r'[\u0B00-\u0B7F]', text))

def is_pure_english(text):
    """Check if text is pure English (no Odia unicode characters)"""
    if not text:
        return True
    return not has_odia_chars(text)

def login():
    """Login as admin and return token"""
    print("\n=== Test 1: Admin Login ===")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ Login failed: {resp.status_code}")
            print(f"Response: {resp.text}")
            return None
        
        data = resp.json()
        token = data.get("token")
        if not token:
            print(f"❌ No token in response")
            return None
        
        print(f"✅ Login successful")
        return token
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def build_assessment(token, payload):
    """Build an assessment and return the assessment ID"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(f"{BASE_URL}/assessments/build", 
                           json=payload, 
                           headers=headers, 
                           timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ Build failed: {resp.status_code}")
            print(f"Response: {resp.text}")
            return None
        
        data = resp.json()
        # The response has assessment.id, not just id
        assessment = data.get("assessment", {})
        assessment_id = assessment.get("id")
        if not assessment_id:
            print(f"❌ No assessment ID in response")
            print(f"Response: {json.dumps(data, indent=2)}")
            return None
        
        print(f"✅ Build started, ID: {assessment_id}")
        return assessment_id
    except Exception as e:
        print(f"❌ Build error: {e}")
        return None

def poll_assessment(token, assessment_id, max_wait=120):
    """Poll assessment until ready or timeout"""
    print(f"Polling assessment {assessment_id}...")
    start = time.time()
    
    while time.time() - start < max_wait:
        try:
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(f"{BASE_URL}/assessments/{assessment_id}", 
                              headers=headers, 
                              timeout=30)
            
            if resp.status_code != 200:
                print(f"❌ Poll failed: {resp.status_code}")
                return None
            
            data = resp.json()
            status = data.get("status")
            
            if status == "ready":
                elapsed = time.time() - start
                print(f"✅ Assessment ready in {elapsed:.1f}s")
                return data
            elif status == "failed":
                print(f"❌ Assessment generation failed")
                print(f"Error: {data.get('error', 'Unknown error')}")
                return None
            
            # Still generating, wait and retry
            time.sleep(5)
        except Exception as e:
            print(f"❌ Poll error: {e}")
            return None
    
    print(f"❌ Timeout after {max_wait}s")
    return None

def delete_assessment(token, assessment_id):
    """Delete an assessment"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.delete(f"{BASE_URL}/assessments/{assessment_id}", 
                             headers=headers, 
                             timeout=30)
        
        if resp.status_code == 200:
            print(f"✅ Deleted assessment {assessment_id}")
            return True
        else:
            print(f"⚠️ Delete failed: {resp.status_code}")
            return False
    except Exception as e:
        print(f"⚠️ Delete error: {e}")
        return False

def test_case_1_english_subject(token):
    """Case 1: English subject (Class 9 English · The Priceless Gift)"""
    print("\n" + "="*80)
    print("=== Test Case 1: English Subject (Class 9 English · The Priceless Gift) ===")
    print("="*80)
    
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
    
    assessment_id = build_assessment(token, payload)
    if not assessment_id:
        return None
    
    assessment = poll_assessment(token, assessment_id, max_wait=120)
    if not assessment:
        return None
    
    # Verify finalLanguage
    final_language = assessment.get("finalLanguage")
    print(f"\nfinalLanguage: {final_language}")
    
    if final_language != "english":
        print(f"❌ FAIL: Expected finalLanguage='english', got '{final_language}'")
        return assessment_id
    
    print(f"✅ PASS: finalLanguage is 'english'")
    
    # Verify title has no Odia chars
    title = assessment.get("title", "")
    if has_odia_chars(title):
        print(f"❌ FAIL: Title contains Odia characters: {title}")
        return assessment_id
    
    print(f"✅ PASS: Title is pure English: {title}")
    
    # Verify all questions are in English
    sections = assessment.get("sections", [])
    all_english = True
    sample_questions = []
    
    for section in sections:
        questions = section.get("questions", [])
        for q in questions:
            stem = q.get("q", "")
            sample_questions.append(stem)
            
            if has_odia_chars(stem):
                print(f"❌ FAIL: Question stem contains Odia: {stem}")
                all_english = False
            
            # Check options for MCQ
            options = q.get("options", [])
            for opt in options:
                if has_odia_chars(opt):
                    print(f"❌ FAIL: Option contains Odia: {opt}")
                    all_english = False
    
    if all_english:
        print(f"✅ PASS: All questions and options are pure English")
        print(f"\nSample questions:")
        for i, q in enumerate(sample_questions[:2], 1):
            print(f"  {i}. {q}")
    
    return assessment_id

def test_case_2_odia_subject(token):
    """Case 2: Odia subject (Balvatika · ଝୁଲଣା)"""
    print("\n" + "="*80)
    print("=== Test Case 2: Odia Subject (Balvatika · ଝୁଲଣା) ===")
    print("="*80)
    
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
    
    assessment_id = build_assessment(token, payload)
    if not assessment_id:
        return None
    
    assessment = poll_assessment(token, assessment_id, max_wait=120)
    if not assessment:
        return None
    
    # Verify finalLanguage
    final_language = assessment.get("finalLanguage")
    print(f"\nfinalLanguage: {final_language}")
    
    if final_language != "odia":
        print(f"❌ FAIL: Expected finalLanguage='odia', got '{final_language}'")
        return assessment_id
    
    print(f"✅ PASS: finalLanguage is 'odia'")
    
    # Verify all questions contain Odia chars
    sections = assessment.get("sections", [])
    all_have_odia = True
    sample_questions = []
    
    for section in sections:
        questions = section.get("questions", [])
        for q in questions:
            stem = q.get("q", "")
            sample_questions.append(stem)
            
            if not has_odia_chars(stem):
                print(f"❌ FAIL: Question stem has no Odia characters: {stem}")
                all_have_odia = False
    
    if all_have_odia:
        print(f"✅ PASS: All questions contain Odia characters")
        print(f"\nSample questions:")
        for i, q in enumerate(sample_questions[:2], 1):
            print(f"  {i}. {q}")
    
    return assessment_id

def test_case_3_explicit_override(token):
    """Case 3: Explicit override (force Odia on English book)"""
    print("\n" + "="*80)
    print("=== Test Case 3: Explicit Override (Force Odia on English Book) ===")
    print("="*80)
    
    payload = {
        "assessmentType": "practice",
        "classId": ENGLISH_CLASS_ID,
        "bookId": ENGLISH_BOOK_ID,
        "chapterIds": [ENGLISH_CHAPTER_ID],
        "totalMarks": 10,
        "writtenTypes": ["mcq"],
        "language": "odia",  # Explicit override
        "generateImages": False,
        "autoAddPictureSection": False
    }
    
    assessment_id = build_assessment(token, payload)
    if not assessment_id:
        return None
    
    assessment = poll_assessment(token, assessment_id, max_wait=120)
    if not assessment:
        return None
    
    # Verify finalLanguage
    final_language = assessment.get("finalLanguage")
    print(f"\nfinalLanguage: {final_language}")
    
    if final_language != "odia":
        print(f"❌ FAIL: Expected finalLanguage='odia', got '{final_language}'")
        return assessment_id
    
    print(f"✅ PASS: finalLanguage is 'odia' (override worked)")
    
    # Verify questions contain Odia chars
    sections = assessment.get("sections", [])
    has_odia_content = False
    sample_questions = []
    
    for section in sections:
        questions = section.get("questions", [])
        for q in questions:
            stem = q.get("q", "")
            sample_questions.append(stem)
            
            if has_odia_chars(stem):
                has_odia_content = True
    
    if has_odia_content:
        print(f"✅ PASS: Questions contain Odia characters")
        print(f"\nSample questions:")
        for i, q in enumerate(sample_questions[:2], 1):
            print(f"  {i}. {q}")
    else:
        print(f"❌ FAIL: No Odia characters found in questions")
    
    return assessment_id

def test_case_4_coverage_many_types(token):
    """Case 4: Coverage of many written types on English book"""
    print("\n" + "="*80)
    print("=== Test Case 4: Coverage - Many Written Types on English Book ===")
    print("="*80)
    
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
    
    assessment_id = build_assessment(token, payload)
    if not assessment_id:
        return None
    
    assessment = poll_assessment(token, assessment_id, max_wait=150)
    if not assessment:
        return None
    
    # Verify finalLanguage
    final_language = assessment.get("finalLanguage")
    print(f"\nfinalLanguage: {final_language}")
    
    if final_language != "english":
        print(f"❌ FAIL: Expected finalLanguage='english', got '{final_language}'")
        return assessment_id
    
    print(f"✅ PASS: finalLanguage is 'english'")
    
    # Verify all sections are in English
    sections = assessment.get("sections", [])
    all_english = True
    section_results = []
    
    for section in sections:
        section_key = section.get("key", "")
        questions = section.get("questions", [])
        
        if len(questions) == 0:
            print(f"⚠️ Section '{section_key}' has no questions (generation may have failed)")
            section_results.append(f"{section_key}: EMPTY")
            continue
        
        section_english = True
        
        for q in questions:
            # Check question stem
            stem = q.get("q", "")
            if stem and has_odia_chars(stem):
                print(f"❌ FAIL: Section '{section_key}' stem contains Odia: {stem}")
                section_english = False
                all_english = False
            
            # Check options (for MCQ)
            options = q.get("options", [])
            for opt in options:
                if has_odia_chars(opt):
                    print(f"❌ FAIL: Section '{section_key}' option contains Odia: {opt}")
                    section_english = False
                    all_english = False
            
            # Check answer
            answer = q.get("answer", "")
            if answer and has_odia_chars(answer):
                print(f"❌ FAIL: Section '{section_key}' answer contains Odia: {answer}")
                section_english = False
                all_english = False
            
            # Check match columns
            col_a = q.get("columnA", [])
            col_b = q.get("columnB", [])
            for item in col_a + col_b:
                if has_odia_chars(item):
                    print(f"❌ FAIL: Section '{section_key}' match column contains Odia: {item}")
                    section_english = False
                    all_english = False
        
        if section_english:
            section_results.append(f"{section_key}: ✅ PASS ({len(questions)} questions)")
        else:
            section_results.append(f"{section_key}: ❌ FAIL")
    
    print(f"\nSection Results:")
    for result in section_results:
        print(f"  {result}")
    
    if all_english:
        print(f"\n✅ PASS: All sections are pure English")
    else:
        print(f"\n❌ FAIL: Some sections contain Odia characters")
    
    return assessment_id

def test_case_5_regression(token):
    """Case 5: Regression tests"""
    print("\n" + "="*80)
    print("=== Test Case 5: Regression Tests ===")
    print("="*80)
    
    all_passed = True
    
    # Test GET /api/assessments
    print("\nTest 5a: GET /api/assessments")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/assessments", headers=headers, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            print(f"✅ PASS: GET /api/assessments returned {len(items)} items")
        else:
            print(f"❌ FAIL: GET /api/assessments returned {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ FAIL: GET /api/assessments error: {e}")
        all_passed = False
    
    # Test GET /api/assessments/community
    print("\nTest 5b: GET /api/assessments/community")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/assessments/community?limit=5", 
                          headers=headers, 
                          timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            print(f"✅ PASS: GET /api/assessments/community returned {len(items)} items")
        else:
            print(f"❌ FAIL: GET /api/assessments/community returned {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ FAIL: GET /api/assessments/community error: {e}")
        all_passed = False
    
    if all_passed:
        print(f"\n✅ PASS: All regression tests passed")
    else:
        print(f"\n❌ FAIL: Some regression tests failed")
    
    return all_passed

def main():
    print("="*80)
    print("LANGUAGE AUTO-DETECTION BACKEND TEST")
    print("="*80)
    
    # Track assessment IDs for cleanup
    assessment_ids = []
    
    # Run test cases - login fresh for each to avoid session timeout
    try:
        # Case 1: English subject
        token = login()
        if token:
            aid = test_case_1_english_subject(token)
            if aid:
                assessment_ids.append(aid)
        
        # Case 2: Odia subject
        token = login()
        if token:
            aid = test_case_2_odia_subject(token)
            if aid:
                assessment_ids.append(aid)
        
        # Case 3: Explicit override
        token = login()
        if token:
            aid = test_case_3_explicit_override(token)
            if aid:
                assessment_ids.append(aid)
        
        # Case 4: Coverage of many types
        token = login()
        if token:
            aid = test_case_4_coverage_many_types(token)
            if aid:
                assessment_ids.append(aid)
        
        # Case 5: Regression
        token = login()
        if token:
            test_case_5_regression(token)
        
    finally:
        # Cleanup
        if assessment_ids:
            print("\n" + "="*80)
            print("=== Cleanup: Deleting Test Assessments ===")
            print("="*80)
            token = login()  # Fresh token for cleanup
            if token:
                for aid in assessment_ids:
                    delete_assessment(token, aid)
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
