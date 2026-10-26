#!/usr/bin/env python3
"""
MCM Knowledge Test Backend API Testing
Tests all user, admin, and public endpoints for the MCM Knowledge Test feature.
"""

import requests
import json
import sys
from datetime import datetime

# Base URL - using internal localhost as specified
BASE_URL = "http://localhost:3000/api"

# Admin credentials (SINGLE-DEVICE login - log in ONCE, reuse token)
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test results tracking
test_results = []
admin_token = None
created_test_id = None
august_test_id = None
certificate_id = None
attempt_id = None

def log_test(test_num, description, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"Test {test_num}: {status} - {description}"
    if details:
        result += f"\n  Details: {details}"
    print(result)
    test_results.append({
        "test": test_num,
        "description": description,
        "passed": passed,
        "details": details
    })
    return passed

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("MCM KNOWLEDGE TEST - BACKEND API TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    for result in test_results:
        status = "✅" if result["passed"] else "❌"
        print(f"{status} Test {result['test']}: {result['description']}")
        if result["details"] and not result["passed"]:
            print(f"   {result['details']}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total if total > 0 else 0}%)")
    print(f"{'='*80}\n")

# ============================================================================
# TEST 0: Admin Login (SINGLE-DEVICE - log in ONCE, reuse token)
# ============================================================================
def test_0_admin_login():
    """Test 0: Admin login to get token"""
    global admin_token
    
    try:
        print("\n" + "="*80)
        print("TEST 0: ADMIN LOGIN (SINGLE-DEVICE)")
        print("="*80)
        
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get("token")
            if admin_token:
                log_test(0, "Admin login successful", True, f"Token obtained, user: {data.get('user', {}).get('name', 'N/A')}")
                return True
            else:
                log_test(0, "Admin login - no token in response", False, f"Response: {data}")
                return False
        else:
            log_test(0, "Admin login failed", False, f"Status: {response.status_code}, Body: {response.text[:200]}")
            return False
            
    except Exception as e:
        log_test(0, "Admin login exception", False, str(e))
        return False

# ============================================================================
# TEST 1: GET /api/mcm-test/active (with token)
# Should return August 2026 test with 25 questions WITHOUT correctIndex/explanation
# ============================================================================
def test_1_get_active_test():
    """Test 1: GET /api/mcm-test/active - should return August test without answers"""
    global august_test_id
    
    try:
        print("\n" + "="*80)
        print("TEST 1: GET /api/mcm-test/active (authenticated)")
        print("="*80)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/mcm-test/active", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(1, "GET /api/mcm-test/active", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        test = data.get("test")
        
        if not test:
            return log_test(1, "GET /api/mcm-test/active", False, "No 'test' field in response")
        
        # Store August test ID for later
        august_test_id = test.get("id")
        
        # Verify it's August 2026
        month_en = test.get("monthEn", "")
        if "August 2026" not in month_en:
            return log_test(1, "GET /api/mcm-test/active", False, f"Expected August 2026, got: {month_en}")
        
        # Verify 25 questions
        questions = test.get("questions", [])
        if len(questions) != 25:
            return log_test(1, "GET /api/mcm-test/active", False, f"Expected 25 questions, got {len(questions)}")
        
        # Verify questions do NOT contain correctIndex or explanation
        has_correct_index = any("correctIndex" in q for q in questions)
        has_explanation = any("explanation" in q for q in questions)
        
        if has_correct_index or has_explanation:
            return log_test(1, "GET /api/mcm-test/active", False, 
                          f"Questions contain correctIndex={has_correct_index} or explanation={has_explanation} (should be hidden)")
        
        return log_test(1, "GET /api/mcm-test/active", True, 
                       f"August 2026 test with 25 questions, no answers exposed. attempt={data.get('attempt')}")
        
    except Exception as e:
        return log_test(1, "GET /api/mcm-test/active", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 2: Admin GET /api/admin/mcm-tests
# Should list 3 seeded tests with stats
# ============================================================================
def test_2_admin_list_tests():
    """Test 2: Admin GET /api/admin/mcm-tests - list all tests"""
    
    try:
        print("\n" + "="*80)
        print("TEST 2: Admin GET /api/admin/mcm-tests")
        print("="*80)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/mcm-tests", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(2, "Admin GET /api/admin/mcm-tests", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        tests = data.get("tests", [])
        
        if len(tests) < 3:
            return log_test(2, "Admin GET /api/admin/mcm-tests", False, f"Expected at least 3 tests, got {len(tests)}")
        
        # Find the 3 seeded tests (July, Aug, Sep 2026)
        seeded_tests = [t for t in tests if t.get("key") in ["july-2026", "aug-2026", "sep-2026"]]
        
        if len(seeded_tests) != 3:
            return log_test(2, "Admin GET /api/admin/mcm-tests", False, 
                          f"Expected 3 seeded tests (july/aug/sep-2026), found {len(seeded_tests)}")
        
        # Verify each test has required fields
        for test in seeded_tests:
            if not all(k in test for k in ["id", "key", "monthEn", "questionCount", "attempts", "passed", "published"]):
                return log_test(2, "Admin GET /api/admin/mcm-tests", False, 
                              f"Test {test.get('key')} missing required fields")
            
            if test.get("questionCount") != 25:
                return log_test(2, "Admin GET /api/admin/mcm-tests", False, 
                              f"Test {test.get('key')} has {test.get('questionCount')} questions, expected 25")
        
        # Verify August is published
        aug_test = next((t for t in seeded_tests if t.get("key") == "aug-2026"), None)
        if not aug_test:
            return log_test(2, "Admin GET /api/admin/mcm-tests", False, "August 2026 test not found")
        
        if not aug_test.get("published"):
            return log_test(2, "Admin GET /api/admin/mcm-tests", False, "August 2026 test should be published")
        
        details = f"Found 3 seeded tests. Aug published={aug_test.get('published')}, attempts={aug_test.get('attempts')}, passed={aug_test.get('passed')}"
        return log_test(2, "Admin GET /api/admin/mcm-tests", True, details)
        
    except Exception as e:
        return log_test(2, "Admin GET /api/admin/mcm-tests", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 3: Admin GET /api/admin/mcm-tests/:id for August test
# Should return full test WITH correctIndex (admin can see answers)
# ============================================================================
def test_3_admin_get_test_detail():
    """Test 3: Admin GET /api/admin/mcm-tests/:id - should include correctIndex"""
    
    try:
        print("\n" + "="*80)
        print("TEST 3: Admin GET /api/admin/mcm-tests/:id (August test)")
        print("="*80)
        
        if not august_test_id:
            return log_test(3, "Admin GET test detail", False, "August test ID not available from Test 1")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/mcm-tests/{august_test_id}", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(3, "Admin GET test detail", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        test = data.get("test")
        
        if not test:
            return log_test(3, "Admin GET test detail", False, "No 'test' field in response")
        
        questions = test.get("questions", [])
        if len(questions) != 25:
            return log_test(3, "Admin GET test detail", False, f"Expected 25 questions, got {len(questions)}")
        
        # Verify questions DO contain correctIndex (admin view)
        has_correct_index = all("correctIndex" in q for q in questions)
        
        if not has_correct_index:
            return log_test(3, "Admin GET test detail", False, "Admin view should include correctIndex for all questions")
        
        return log_test(3, "Admin GET test detail", True, 
                       f"August test with 25 questions, all have correctIndex (admin can see answers)")
        
    except Exception as e:
        return log_test(3, "Admin GET test detail", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 4: Create a fresh test via POST /api/admin/mcm-tests
# ============================================================================
def test_4_admin_create_test():
    """Test 4: Admin POST /api/admin/mcm-tests - create new test"""
    global created_test_id
    
    try:
        print("\n" + "="*80)
        print("TEST 4: Admin POST /api/admin/mcm-tests (create test)")
        print("="*80)
        
        # Test 4a: Missing title should return 400
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/admin/mcm-tests",
            headers=headers,
            json={"questions": []},
            timeout=30
        )
        
        if response.status_code != 400:
            return log_test(4, "Admin create test (validation)", False, 
                          f"Missing title should return 400, got {response.status_code}")
        
        # Test 4b: Empty questions should return 400
        response = requests.post(
            f"{BASE_URL}/admin/mcm-tests",
            headers=headers,
            json={"title": "Test", "questions": []},
            timeout=30
        )
        
        if response.status_code != 400:
            return log_test(4, "Admin create test (validation)", False, 
                          f"Empty questions should return 400, got {response.status_code}")
        
        # Test 4c: Create valid test
        new_test = {
            "title": "QA Test",
            "monthEn": "QA Month",
            "monthLabel": "QA",
            "order": 999999,
            "durationMinutes": 10,
            "passingPercentage": 50,
            "questions": [
                {
                    "q": "2+2=?",
                    "options": ["3", "4", "5", "6"],
                    "correctIndex": 1,
                    "marks": 1
                },
                {
                    "q": "Cap of India?",
                    "options": ["Mumbai", "Delhi", "Pune", "Goa"],
                    "correctIndex": 1,
                    "marks": 1
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/mcm-tests",
            headers=headers,
            json=new_test,
            timeout=30
        )
        
        if response.status_code != 200:
            return log_test(4, "Admin create test", False, 
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        test = data.get("test")
        
        if not test or not test.get("id"):
            return log_test(4, "Admin create test", False, "No test.id in response")
        
        created_test_id = test.get("id")
        
        # Verify published is false by default
        if test.get("published") != False:
            return log_test(4, "Admin create test", False, f"New test should have published=false, got {test.get('published')}")
        
        return log_test(4, "Admin create test", True, 
                       f"Created test id={created_test_id}, published=false, 2 questions")
        
    except Exception as e:
        return log_test(4, "Admin create test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 5: Publish the new test via POST /api/admin/mcm-tests/:id/publish
# ============================================================================
def test_5_admin_publish_test():
    """Test 5: Admin POST /api/admin/mcm-tests/:id/publish"""
    
    try:
        print("\n" + "="*80)
        print("TEST 5: Admin POST /api/admin/mcm-tests/:id/publish")
        print("="*80)
        
        if not created_test_id:
            return log_test(5, "Admin publish test", False, "Created test ID not available from Test 4")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/admin/mcm-tests/{created_test_id}/publish",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return log_test(5, "Admin publish test", False, 
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        
        if not data.get("ok"):
            return log_test(5, "Admin publish test", False, f"Response ok=false: {data}")
        
        return log_test(5, "Admin publish test", True, f"Test {created_test_id} published successfully")
        
    except Exception as e:
        return log_test(5, "Admin publish test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 6: Verify EXACTLY ONE test is published
# ============================================================================
def test_6_verify_single_published():
    """Test 6: Verify exactly one test is published (the new QA test)"""
    
    try:
        print("\n" + "="*80)
        print("TEST 6: Verify EXACTLY ONE test is published")
        print("="*80)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/mcm-tests", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(6, "Verify single published", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        tests = data.get("tests", [])
        
        published_tests = [t for t in tests if t.get("published") == True]
        
        if len(published_tests) != 1:
            details = f"Expected exactly 1 published test, found {len(published_tests)}: {[t.get('key') or t.get('title') for t in published_tests]}"
            return log_test(6, "Verify single published", False, details)
        
        # Verify it's the QA test
        if published_tests[0].get("id") != created_test_id:
            return log_test(6, "Verify single published", False, 
                          f"Published test is {published_tests[0].get('title')}, expected QA Test")
        
        # Verify August is now unpublished
        aug_test = next((t for t in tests if t.get("key") == "aug-2026"), None)
        if aug_test and aug_test.get("published"):
            return log_test(6, "Verify single published", False, "August test should now be unpublished")
        
        return log_test(6, "Verify single published", True, 
                       f"Exactly 1 published test (QA Test), August now unpublished")
        
    except Exception as e:
        return log_test(6, "Verify single published", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 7: GET /api/mcm-test/active should now return the QA test
# ============================================================================
def test_7_active_is_qa_test():
    """Test 7: GET /api/mcm-test/active should return QA test (2 questions)"""
    
    try:
        print("\n" + "="*80)
        print("TEST 7: GET /api/mcm-test/active (should be QA test now)")
        print("="*80)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/mcm-test/active", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(7, "Active test is QA test", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        test = data.get("test")
        
        if not test:
            return log_test(7, "Active test is QA test", False, "No 'test' field in response")
        
        # Verify it's the QA test
        if test.get("title") != "QA Test":
            return log_test(7, "Active test is QA test", False, 
                          f"Expected 'QA Test', got '{test.get('title')}'")
        
        # Verify 2 questions
        questions = test.get("questions", [])
        if len(questions) != 2:
            return log_test(7, "Active test is QA test", False, f"Expected 2 questions, got {len(questions)}")
        
        return log_test(7, "Active test is QA test", True, 
                       f"QA Test is now active with 2 questions")
        
    except Exception as e:
        return log_test(7, "Active test is QA test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 8: POST /api/mcm-test/submit with answers
# Should score correctly and return certificateId if passed
# ============================================================================
def test_8_submit_test():
    """Test 8: POST /api/mcm-test/submit - score and certificate"""
    global certificate_id, attempt_id
    
    try:
        print("\n" + "="*80)
        print("TEST 8: POST /api/mcm-test/submit")
        print("="*80)
        
        if not created_test_id:
            return log_test(8, "Submit test", False, "Created test ID not available")
        
        # Get the question IDs from active test
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/mcm-test/active", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(8, "Submit test", False, f"Failed to get active test: {response.status_code}")
        
        test = response.json().get("test", {})
        questions = test.get("questions", [])
        
        if len(questions) != 2:
            return log_test(8, "Submit test", False, f"Expected 2 questions, got {len(questions)}")
        
        # Submit answers: q1 correct (index 1), q2 wrong (index 0)
        # This gives 50% (1 out of 2), which should pass (passing is 50%)
        answers = {
            questions[0]["id"]: 1,  # Correct answer for "2+2=?" is "4" (index 1)
            questions[1]["id"]: 0   # Wrong answer for "Cap of India?" (correct is index 1)
        }
        
        response = requests.post(
            f"{BASE_URL}/mcm-test/submit",
            headers=headers,
            json={"testId": created_test_id, "answers": answers},
            timeout=30
        )
        
        if response.status_code != 200:
            return log_test(8, "Submit test", False, 
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        
        # Get result from response
        result = data.get("result", data)  # Handle both direct and nested response
        
        # Verify scoring
        percentage = result.get("percentage")
        if percentage != 50:
            return log_test(8, "Submit test", False, f"Expected 50%, got {percentage}%")
        
        passed = result.get("passed")
        if not passed:
            return log_test(8, "Submit test", False, f"Should pass with 50% (passing is 50%), got passed={passed}")
        
        # Verify certificateId is present (passed)
        certificate_id = result.get("certificateId")
        if not certificate_id:
            return log_test(8, "Submit test", False, "certificateId should be present for passed test")
        
        # Verify review array has correctIndex
        review = result.get("review", [])
        if len(review) != 2:
            return log_test(8, "Submit test", False, f"Expected 2 review items, got {len(review)}")
        
        if not all("correctIndex" in r for r in review):
            return log_test(8, "Submit test", False, "Review should include correctIndex for all questions")
        
        # Store attempt ID for later
        attempt_id = result.get("attemptId")
        
        details = f"Scored 50% (1/2 correct), passed=true, certificateId={certificate_id}, review includes correctIndex"
        return log_test(8, "Submit test", True, details)
        
    except Exception as e:
        return log_test(8, "Submit test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 9: POST /api/mcm-test/submit again should return 409
# ============================================================================
def test_9_submit_again_409():
    """Test 9: POST /api/mcm-test/submit again - should return 409 already attempted"""
    
    try:
        print("\n" + "="*80)
        print("TEST 9: POST /api/mcm-test/submit (again - should be 409)")
        print("="*80)
        
        if not created_test_id:
            return log_test(9, "Submit again 409", False, "Created test ID not available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/mcm-test/submit",
            headers=headers,
            json={"testId": created_test_id, "answers": {}},
            timeout=30
        )
        
        if response.status_code != 409:
            return log_test(9, "Submit again 409", False, 
                          f"Expected 409, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        
        if not data.get("alreadyAttempted"):
            return log_test(9, "Submit again 409", False, 
                          f"Response should have alreadyAttempted=true, got {data}")
        
        return log_test(9, "Submit again 409", True, "Second submit correctly rejected with 409 alreadyAttempted")
        
    except Exception as e:
        return log_test(9, "Submit again 409", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 10: GET /api/mcm-test/history
# ============================================================================
def test_10_get_history():
    """Test 10: GET /api/mcm-test/history - should include QA test attempt"""
    
    try:
        print("\n" + "="*80)
        print("TEST 10: GET /api/mcm-test/history")
        print("="*80)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/mcm-test/history", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(10, "Get history", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        attempts = data.get("attempts", [])
        
        # Find the QA test attempt
        qa_attempt = next((a for a in attempts if a.get("testId") == created_test_id), None)
        
        if not qa_attempt:
            return log_test(10, "Get history", False, f"QA test attempt not found in history (found {len(attempts)} attempts)")
        
        # Verify attempt details
        if qa_attempt.get("percentage") != 50:
            return log_test(10, "Get history", False, f"Expected percentage=50, got {qa_attempt.get('percentage')}")
        
        if not qa_attempt.get("passed"):
            return log_test(10, "Get history", False, f"Expected passed=true, got {qa_attempt.get('passed')}")
        
        if qa_attempt.get("certificateId") != certificate_id:
            return log_test(10, "Get history", False, 
                          f"Expected certificateId={certificate_id}, got {qa_attempt.get('certificateId')}")
        
        return log_test(10, "Get history", True, 
                       f"History includes QA test attempt: 50%, passed=true, certificateId={certificate_id}")
        
    except Exception as e:
        return log_test(10, "Get history", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 11: PUBLIC GET /api/mcm-test/verify/:certId
# ============================================================================
def test_11_public_verify_certificate():
    """Test 11: PUBLIC GET /api/mcm-test/verify/:certId - no auth required"""
    
    try:
        print("\n" + "="*80)
        print("TEST 11: PUBLIC GET /api/mcm-test/verify/:certId")
        print("="*80)
        
        if not certificate_id:
            return log_test(11, "Public verify certificate", False, "Certificate ID not available from Test 8")
        
        # Test 11a: Valid certificate (NO Authorization header)
        response = requests.get(f"{BASE_URL}/mcm-test/verify/{certificate_id}", timeout=30)
        
        if response.status_code != 200:
            return log_test(11, "Public verify certificate", False, 
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        
        if not data.get("valid"):
            return log_test(11, "Public verify certificate", False, f"Expected valid=true, got {data}")
        
        if data.get("percentage") != 50:
            return log_test(11, "Public verify certificate", False, 
                          f"Expected percentage=50, got {data.get('percentage')}")
        
        if not data.get("name"):
            return log_test(11, "Public verify certificate", False, "Expected name field in response")
        
        # Test 11b: Invalid certificate ID
        response = requests.get(f"{BASE_URL}/mcm-test/verify/BOGUS-ID", timeout=30)
        
        if response.status_code != 200:
            return log_test(11, "Public verify certificate", False, 
                          f"Invalid cert should return 200, got {response.status_code}")
        
        data = response.json()
        
        if data.get("valid") != False:
            return log_test(11, "Public verify certificate", False, 
                          f"Invalid cert should have valid=false, got {data}")
        
        return log_test(11, "Public verify certificate", True, 
                       f"Valid cert: valid=true, name present, 50%. Invalid cert: valid=false")
        
    except Exception as e:
        return log_test(11, "Public verify certificate", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 12: GET /api/mcm-test/attempt/:id (own attempt)
# ============================================================================
def test_12_get_attempt():
    """Test 12: GET /api/mcm-test/attempt/:id - own attempt with review"""
    
    try:
        print("\n" + "="*80)
        print("TEST 12: GET /api/mcm-test/attempt/:id")
        print("="*80)
        
        if not attempt_id:
            return log_test(12, "Get attempt", False, "Attempt ID not available from Test 8")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/mcm-test/attempt/{attempt_id}", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(12, "Get attempt", False, 
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        attempt = data.get("attempt")
        
        if not attempt:
            return log_test(12, "Get attempt", False, "No 'attempt' field in response")
        
        # Verify review is present (at top level or in attempt)
        review = data.get("review") or attempt.get("review")
        if not review or len(review) != 2:
            return log_test(12, "Get attempt", False, f"Expected review with 2 items, got {len(review) if review else 0}")
        
        # Verify review has correctIndex
        if not all("correctIndex" in r for r in review):
            return log_test(12, "Get attempt", False, "Review should include correctIndex")
        
        return log_test(12, "Get attempt", True, 
                       f"Attempt retrieved with review (2 questions, correctIndex included)")
        
    except Exception as e:
        return log_test(12, "Get attempt", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 13: Admin GET /api/admin/mcm-tests/:id/stats
# ============================================================================
def test_13_admin_get_stats():
    """Test 13: Admin GET /api/admin/mcm-tests/:id/stats"""
    
    try:
        print("\n" + "="*80)
        print("TEST 13: Admin GET /api/admin/mcm-tests/:id/stats")
        print("="*80)
        
        if not created_test_id:
            return log_test(13, "Admin get stats", False, "Created test ID not available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/mcm-tests/{created_test_id}/stats", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(13, "Admin get stats", False, 
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        data = response.json()
        
        # Verify stats
        if data.get("total", 0) < 1:
            return log_test(13, "Admin get stats", False, f"Expected total>=1, got {data.get('total')}")
        
        if data.get("passed", 0) < 1:
            return log_test(13, "Admin get stats", False, f"Expected passed>=1, got {data.get('passed')}")
        
        return log_test(13, "Admin get stats", True, 
                       f"Stats: total={data.get('total')}, passed={data.get('passed')}, failed={data.get('failed', 0)}")
        
    except Exception as e:
        return log_test(13, "Admin get stats", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 14: AUTH checks - 403 without Authorization header
# ============================================================================
def test_14_auth_checks():
    """Test 14: Auth checks - admin endpoints should return 403 without token"""
    
    try:
        print("\n" + "="*80)
        print("TEST 14: AUTH checks (no Authorization header)")
        print("="*80)
        
        # Test 14a: GET /api/admin/mcm-tests without auth
        response = requests.get(f"{BASE_URL}/admin/mcm-tests", timeout=30)
        
        if response.status_code != 403:
            return log_test(14, "Auth checks", False, 
                          f"GET /admin/mcm-tests without auth should return 403, got {response.status_code}")
        
        # Test 14b: GET /api/mcm-test/active without auth (should be 401)
        response = requests.get(f"{BASE_URL}/mcm-test/active", timeout=30)
        
        if response.status_code not in [401, 403]:
            return log_test(14, "Auth checks", False, 
                          f"GET /mcm-test/active without auth should return 401/403, got {response.status_code}")
        
        return log_test(14, "Auth checks", True, 
                       f"Admin endpoints return 403 without auth, user endpoints return {response.status_code}")
        
    except Exception as e:
        return log_test(14, "Auth checks", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 15: CLEANUP - Archive QA test and re-publish August
# ============================================================================
def test_15_cleanup():
    """Test 15: CLEANUP - Archive QA test and re-publish August"""
    
    try:
        print("\n" + "="*80)
        print("TEST 15: CLEANUP - Archive QA test, re-publish August")
        print("="*80)
        
        if not created_test_id or not august_test_id:
            return log_test(15, "Cleanup", False, "Test IDs not available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Step 1: Archive the QA test
        response = requests.post(
            f"{BASE_URL}/admin/mcm-tests/{created_test_id}/archive",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return log_test(15, "Cleanup", False, 
                          f"Archive failed: {response.status_code}: {response.text[:200]}")
        
        # Step 2: Re-publish August test
        response = requests.post(
            f"{BASE_URL}/admin/mcm-tests/{august_test_id}/publish",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return log_test(15, "Cleanup", False, 
                          f"Re-publish August failed: {response.status_code}: {response.text[:200]}")
        
        # Step 3: Verify active test is August again
        response = requests.get(f"{BASE_URL}/mcm-test/active", headers=headers, timeout=30)
        
        if response.status_code != 200:
            return log_test(15, "Cleanup", False, f"Get active test failed: {response.status_code}")
        
        data = response.json()
        test = data.get("test")
        
        if not test:
            return log_test(15, "Cleanup", False, "No test in active response")
        
        # Verify it's August with 25 questions
        if "August 2026" not in test.get("monthEn", ""):
            return log_test(15, "Cleanup", False, 
                          f"Active test should be August 2026, got {test.get('monthEn')}")
        
        if len(test.get("questions", [])) != 25:
            return log_test(15, "Cleanup", False, 
                          f"August test should have 25 questions, got {len(test.get('questions', []))}")
        
        return log_test(15, "Cleanup", True, 
                       f"QA test archived, August re-published and active with 25 questions")
        
    except Exception as e:
        return log_test(15, "Cleanup", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("MCM KNOWLEDGE TEST - BACKEND API TESTING")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Run tests in sequence
    if not test_0_admin_login():
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        print_summary()
        sys.exit(1)
    
    test_1_get_active_test()
    test_2_admin_list_tests()
    test_3_admin_get_test_detail()
    test_4_admin_create_test()
    test_5_admin_publish_test()
    test_6_verify_single_published()
    test_7_active_is_qa_test()
    test_8_submit_test()
    test_9_submit_again_409()
    test_10_get_history()
    test_11_public_verify_certificate()
    test_12_get_attempt()
    test_13_admin_get_stats()
    test_14_auth_checks()
    test_15_cleanup()
    
    # Print summary
    print_summary()
    
    # Exit with appropriate code
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    if passed == total:
        print("✅ ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"❌ {total - passed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
