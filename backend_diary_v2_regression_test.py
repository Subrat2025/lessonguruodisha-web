#!/usr/bin/env python3
"""
Backend Test: Lesson Diary v2 Regression + New Feature Test
============================================================
Tests the Lesson Diary render endpoints after v2 fixes:
1. POST /api/instant-plan/html → returns JSON { html: "..." }
2. POST /api/instant-plan/pdf  → returns application/pdf

Key assertions:
- All 5 Panchapadi steps render (prastabana, anweshana, alochana, prayoga, mulyayana)
- Code DB enrichment works (CG-7, C-7.1, CD 7.1.1)
- Weekday shows (ଗୁରୁବାର)
- Test mode='daily', mode='instant', mode='multigrade'
- Auth required (401 without token)
- Validation (400 when plan missing periods[] and classes[])
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test body with LEGACY Panchapadi keys + timing field
PRIMARY_DAILY_BODY = {
    "mode": "daily",
    "showWatermark": True,
    "plan": {
        "date": "2026-08-27",
        "day": "ଗୁରୁବାର",
        "periods": [
            {
                "periodNum": 1,
                "className": "Shishuvatika",
                "subject": "CD",
                "chapterName": "Water is Life",
                "topic": "Sources of water",
                "loCodes": ["CD 7.1.1", "CD 7.1.2"],
                "tlm": ["Globe", "Chart"],
                "panchapadi": {
                    "prastabana": {
                        "teacherActivity": "Bring a glass of water",
                        "studentActivity": "Answer questions",
                        "timing": "5 min"
                    },
                    "anweshana": {
                        "teacherActivity": "Show globe GLOBEWORD",
                        "studentActivity": "Group discussion",
                        "timing": "12 min"
                    },
                    "alochana": {
                        "teacherActivity": "Textbook ex 1-2 EXWORD",
                        "studentActivity": "Write answers",
                        "timing": "10 min"
                    },
                    "prayoga": {
                        "teacherActivity": "Demonstrate PRAYOGAWORD",
                        "studentActivity": "List water-waste spots",
                        "timing": "10 min"
                    },
                    "mulyayana": {
                        "teacherActivity": "Assess MULYAWORD",
                        "studentActivity": "Homework water diary",
                        "timing": "8 min"
                    }
                }
            }
        ]
    }
}

INSTANT_BODY = {
    "mode": "instant",
    "showWatermark": True,
    "plan": {
        "date": "2026-08-27",
        "day": "ଗୁରୁବାର",
        "periods": [
            {
                "periodNum": 1,
                "className": "Shishuvatika",
                "subject": "CD",
                "chapterName": "Water is Life",
                "topic": "Sources of water",
                "loCodes": ["CD 7.1.1", "CD 7.1.2"],
                "tlm": ["Globe", "Chart"],
                "panchapadi": {
                    "prastabana": {
                        "teacherActivity": "Bring a glass of water",
                        "studentActivity": "Answer questions",
                        "timing": "5 min"
                    },
                    "anweshana": {
                        "teacherActivity": "Show globe GLOBEWORD",
                        "studentActivity": "Group discussion",
                        "timing": "12 min"
                    },
                    "alochana": {
                        "teacherActivity": "Textbook ex 1-2 EXWORD",
                        "studentActivity": "Write answers",
                        "timing": "10 min"
                    },
                    "prayoga": {
                        "teacherActivity": "Demonstrate PRAYOGAWORD",
                        "studentActivity": "List water-waste spots",
                        "timing": "10 min"
                    },
                    "mulyayana": {
                        "teacherActivity": "Assess MULYAWORD",
                        "studentActivity": "Homework water diary",
                        "timing": "8 min"
                    }
                }
            }
        ]
    }
}

MULTIGRADE_BODY = {
    "mode": "multigrade",
    "showWatermark": True,
    "plan": {
        "date": "2026-08-27",
        "day": "ଗୁରୁବାର",
        "periodNumber": 3,
        "classes": [
            {
                "className": "Class 3",
                "subject": "Odia",
                "chapterName": "c1",
                "topic": "t1",
                "loCodes": ["OD 501"],
                "tlm": ["chart"],
                "panchapadi": {
                    "prastabana": {
                        "teacherActivity": "MGADHITI",
                        "studentActivity": "s",
                        "timing": "5 min"
                    },
                    "anweshana": {
                        "teacherActivity": "MGBODHA",
                        "studentActivity": "s",
                        "timing": "5 min"
                    },
                    "alochana": {
                        "teacherActivity": "MGABHYASA",
                        "studentActivity": "s",
                        "timing": "5 min"
                    },
                    "prayoga": {
                        "teacherActivity": "MGPRAYOGA",
                        "studentActivity": "s",
                        "timing": "5 min"
                    },
                    "mulyayana": {
                        "teacherActivity": "MGPRASARA",
                        "studentActivity": "s",
                        "timing": "5 min"
                    }
                }
            }
        ]
    }
}

def test_login():
    """Test 1: Login with admin credentials"""
    print("\n" + "="*80)
    print("Test 1: Admin Login")
    print("="*80)
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ PASS: Login successful, token received (length: {len(token)})")
                return token
            else:
                print("❌ FAIL: No token in response")
                return None
        else:
            print(f"❌ FAIL: Login failed with status {resp.status_code}")
            print(f"Response: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ FAIL: Exception during login: {e}")
        return None

def test_html_no_auth():
    """Test 2: POST /api/instant-plan/html without auth → 401"""
    print("\n" + "="*80)
    print("Test 2: POST /api/instant-plan/html without auth → 401")
    print("="*80)
    try:
        resp = requests.post(f"{BASE_URL}/instant-plan/html", json=PRIMARY_DAILY_BODY, timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 401:
            print("✅ PASS: Correctly returns 401 without auth")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_pdf_no_auth():
    """Test 3: POST /api/instant-plan/pdf without auth → 401"""
    print("\n" + "="*80)
    print("Test 3: POST /api/instant-plan/pdf without auth → 401")
    print("="*80)
    try:
        resp = requests.post(f"{BASE_URL}/instant-plan/pdf", json=PRIMARY_DAILY_BODY, timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 401:
            print("✅ PASS: Correctly returns 401 without auth")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_html_daily_primary(token):
    """Test 4: POST /api/instant-plan/html with mode='daily' - PRIMARY TEST"""
    print("\n" + "="*80)
    print("Test 4: POST /api/instant-plan/html with mode='daily' (PRIMARY TEST)")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(f"{BASE_URL}/instant-plan/html", json=PRIMARY_DAILY_BODY, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        html = data.get("html", "")
        
        if not html:
            print("❌ FAIL: No html field in response")
            return False
        
        print(f"✅ HTML received (length: {len(html)} chars)")
        
        # CRITICAL ASSERTIONS
        failures = []
        
        # 1. All 5 stage texts must be present
        stage_texts = [
            ("Bring a glass of water", "prastabana teacher activity"),
            ("GLOBEWORD", "anweshana teacher activity"),
            ("EXWORD", "alochana teacher activity"),
            ("PRAYOGAWORD", "prayoga teacher activity"),
            ("MULYAWORD", "mulyayana teacher activity")
        ]
        
        for text, desc in stage_texts:
            if text in html:
                print(f"  ✅ Found {desc}: '{text}'")
            else:
                print(f"  ❌ MISSING {desc}: '{text}'")
                failures.append(f"Missing {desc}: '{text}'")
        
        # 2. Code DB enrichment: CG-7, C-7.1, CD 7.1.1
        code_texts = [
            ("CG-7", "Curricular Goal code"),
            ("C-7.1", "Competency code"),
            ("CD 7.1.1", "LO code chip")
        ]
        
        for text, desc in code_texts:
            if text in html:
                print(f"  ✅ Found {desc}: '{text}'")
            else:
                print(f"  ❌ MISSING {desc}: '{text}'")
                failures.append(f"Missing {desc}: '{text}'")
        
        # 3. Weekday
        if "ଗୁରୁବାର" in html:
            print(f"  ✅ Found weekday: 'ଗୁରୁବାର'")
        else:
            print(f"  ❌ MISSING weekday: 'ଗୁରୁବାର'")
            failures.append("Missing weekday: 'ଗୁରୁବାର'")
        
        if failures:
            print(f"\n❌ FAIL: {len(failures)} assertion(s) failed:")
            for f in failures:
                print(f"  - {f}")
            return False
        else:
            print("\n✅ PASS: All assertions passed for mode='daily'")
            return True
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_html_instant(token):
    """Test 5: POST /api/instant-plan/html with mode='instant'"""
    print("\n" + "="*80)
    print("Test 5: POST /api/instant-plan/html with mode='instant'")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(f"{BASE_URL}/instant-plan/html", json=INSTANT_BODY, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        html = data.get("html", "")
        
        if not html:
            print("❌ FAIL: No html field in response")
            return False
        
        print(f"✅ HTML received (length: {len(html)} chars)")
        
        # Check all 5 stage texts
        stage_texts = ["Bring a glass of water", "GLOBEWORD", "EXWORD", "PRAYOGAWORD", "MULYAWORD"]
        failures = []
        
        for text in stage_texts:
            if text not in html:
                failures.append(f"Missing stage text: '{text}'")
        
        if failures:
            print(f"❌ FAIL: {len(failures)} assertion(s) failed")
            for f in failures:
                print(f"  - {f}")
            return False
        else:
            print("✅ PASS: All 5 stage texts present for mode='instant'")
            return True
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_html_multigrade(token):
    """Test 6: POST /api/instant-plan/html with mode='multigrade'"""
    print("\n" + "="*80)
    print("Test 6: POST /api/instant-plan/html with mode='multigrade'")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(f"{BASE_URL}/instant-plan/html", json=MULTIGRADE_BODY, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        html = data.get("html", "")
        
        if not html:
            print("❌ FAIL: No html field in response")
            return False
        
        print(f"✅ HTML received (length: {len(html)} chars)")
        
        # Check all 5 stage texts for multigrade
        stage_texts = ["MGADHITI", "MGBODHA", "MGABHYASA", "MGPRAYOGA", "MGPRASARA"]
        failures = []
        
        for text in stage_texts:
            if text in html:
                print(f"  ✅ Found stage text: '{text}'")
            else:
                print(f"  ❌ MISSING stage text: '{text}'")
                failures.append(f"Missing stage text: '{text}'")
        
        # Check OD 501 LO code
        if "OD 501" in html:
            print(f"  ✅ Found LO code: 'OD 501'")
        else:
            print(f"  ❌ MISSING LO code: 'OD 501'")
            failures.append("Missing LO code: 'OD 501'")
        
        if failures:
            print(f"\n❌ FAIL: {len(failures)} assertion(s) failed")
            for f in failures:
                print(f"  - {f}")
            return False
        else:
            print("\n✅ PASS: All assertions passed for mode='multigrade'")
            return True
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_pdf_daily_primary(token):
    """Test 7: POST /api/instant-plan/pdf with mode='daily' - PRIMARY TEST"""
    print("\n" + "="*80)
    print("Test 7: POST /api/instant-plan/pdf with mode='daily' (PRIMARY TEST)")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(f"{BASE_URL}/instant-plan/pdf", json=PRIMARY_DAILY_BODY, headers=headers, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        content_length = len(resp.content)
        
        print(f"Content-Type: {content_type}")
        print(f"Content-Length: {content_length} bytes")
        
        failures = []
        
        # Check Content-Type
        if "application/pdf" not in content_type:
            print(f"  ❌ FAIL: Expected Content-Type 'application/pdf', got '{content_type}'")
            failures.append(f"Wrong Content-Type: '{content_type}'")
        else:
            print(f"  ✅ Content-Type is application/pdf")
        
        # Check content length > 800
        if content_length <= 800:
            print(f"  ❌ FAIL: PDF too small ({content_length} bytes)")
            failures.append(f"PDF too small: {content_length} bytes")
        else:
            print(f"  ✅ PDF size > 800 bytes")
        
        # Check %PDF magic bytes
        if resp.content[:4] == b'%PDF':
            print(f"  ✅ PDF starts with %PDF magic bytes")
        else:
            print(f"  ❌ FAIL: PDF does not start with %PDF")
            failures.append("PDF does not start with %PDF")
        
        if failures:
            print(f"\n❌ FAIL: {len(failures)} assertion(s) failed")
            for f in failures:
                print(f"  - {f}")
            return False
        else:
            print("\n✅ PASS: PDF generated successfully for mode='daily'")
            return True
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_pdf_multigrade(token):
    """Test 8: POST /api/instant-plan/pdf with mode='multigrade'"""
    print("\n" + "="*80)
    print("Test 8: POST /api/instant-plan/pdf with mode='multigrade'")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(f"{BASE_URL}/instant-plan/pdf", json=MULTIGRADE_BODY, headers=headers, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        content_length = len(resp.content)
        
        print(f"Content-Type: {content_type}")
        print(f"Content-Length: {content_length} bytes")
        
        failures = []
        
        if "application/pdf" not in content_type:
            failures.append(f"Wrong Content-Type: '{content_type}'")
        else:
            print(f"  ✅ Content-Type is application/pdf")
        
        if resp.content[:4] == b'%PDF':
            print(f"  ✅ PDF starts with %PDF magic bytes")
        else:
            failures.append("PDF does not start with %PDF")
        
        if failures:
            print(f"\n❌ FAIL: {len(failures)} assertion(s) failed")
            return False
        else:
            print("\n✅ PASS: PDF generated successfully for mode='multigrade'")
            return True
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_validation_html(token):
    """Test 9: POST /api/instant-plan/html with missing periods[] and classes[] → 400"""
    print("\n" + "="*80)
    print("Test 9: POST /api/instant-plan/html validation (missing periods[] and classes[])")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        invalid_body = {
            "mode": "daily",
            "plan": {
                "date": "2026-08-27"
                # Missing periods[] and classes[]
            }
        }
        resp = requests.post(f"{BASE_URL}/instant-plan/html", json=invalid_body, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 400:
            print("✅ PASS: Correctly returns 400 for missing periods[] and classes[]")
            return True
        else:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_validation_pdf(token):
    """Test 10: POST /api/instant-plan/pdf with missing periods[] and classes[] → 400"""
    print("\n" + "="*80)
    print("Test 10: POST /api/instant-plan/pdf validation (missing periods[] and classes[])")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        invalid_body = {
            "mode": "daily",
            "plan": {
                "date": "2026-08-27"
                # Missing periods[] and classes[]
            }
        }
        resp = requests.post(f"{BASE_URL}/instant-plan/pdf", json=invalid_body, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 400:
            print("✅ PASS: Correctly returns 400 for missing periods[] and classes[]")
            return True
        else:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("LESSON DIARY V2 REGRESSION + NEW FEATURE TEST")
    print("="*80)
    print("Testing POST /api/instant-plan/html and POST /api/instant-plan/pdf")
    print("After v2 fixes: all 5 Panchapadi steps, code DB lookup, weekday rendering")
    print("="*80)
    
    results = []
    
    # Test 1: Login
    token = test_login()
    if not token:
        print("\n❌ CRITICAL FAILURE: Cannot proceed without auth token")
        sys.exit(1)
    results.append(("Login", True))
    
    # Test 2-3: Auth checks
    results.append(("HTML no auth → 401", test_html_no_auth()))
    results.append(("PDF no auth → 401", test_pdf_no_auth()))
    
    # Test 4-6: HTML endpoint with all 3 modes
    results.append(("HTML mode='daily' PRIMARY", test_html_daily_primary(token)))
    results.append(("HTML mode='instant'", test_html_instant(token)))
    results.append(("HTML mode='multigrade'", test_html_multigrade(token)))
    
    # Test 7-8: PDF endpoint
    results.append(("PDF mode='daily' PRIMARY", test_pdf_daily_primary(token)))
    results.append(("PDF mode='multigrade'", test_pdf_multigrade(token)))
    
    # Test 9-10: Validation
    results.append(("HTML validation → 400", test_validation_html(token)))
    results.append(("PDF validation → 400", test_validation_pdf(token)))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Lesson Diary v2 is working correctly.")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. See details above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
