#!/usr/bin/env python3
"""
Comprehensive backend test for Gemini AI integration endpoints.
Tests all AI generation endpoints, quota tracking, save-lesson, and regression.
"""

import requests
import json
import sys
import time

# Backend URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test results
results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   {details}")
    results["tests"].append({"name": name, "passed": passed, "details": details})
    if passed:
        results["passed"] += 1
    else:
        results["failed"] += 1

def test_admin_login():
    """Test 1: Admin login"""
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data:
                log_test("Admin login (9692604577 / <redacted>)", True, f"Token received")
                return data["token"]
            else:
                log_test("Admin login", False, "No token in response")
                return None
        else:
            log_test("Admin login", False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test("Admin login", False, f"Exception: {str(e)}")
        return None

def test_ai_status(token):
    """Test 2: GET /api/admin/ai/status"""
    try:
        response = requests.get(f"{BASE_URL}/admin/ai/status", 
                               headers={"Authorization": f"Bearer {token}"}, 
                               timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["enabled", "model", "used", "limit", "remaining", "date"]
            missing = [f for f in required_fields if f not in data]
            
            if missing:
                log_test("GET /admin/ai/status - response structure", False, f"Missing fields: {missing}")
                return None
            
            if data["enabled"] and data["model"] == "gemini-2.5-flash" and data["limit"] == 1450:
                log_test("GET /admin/ai/status - response structure", True, 
                        f"enabled={data['enabled']}, model={data['model']}, used={data['used']}, limit={data['limit']}, remaining={data['remaining']}")
                return data
            else:
                log_test("GET /admin/ai/status - response structure", False, 
                        f"Unexpected values: enabled={data.get('enabled')}, model={data.get('model')}, limit={data.get('limit')}")
                return None
        else:
            log_test("GET /admin/ai/status", False, f"Status {response.status_code}")
            return None
    except Exception as e:
        log_test("GET /admin/ai/status", False, f"Exception: {str(e)}")
        return None

def test_ai_status_auth():
    """Test 3: GET /api/admin/ai/status without auth"""
    try:
        response = requests.get(f"{BASE_URL}/admin/ai/status", timeout=10)
        
        if response.status_code == 401:
            log_test("GET /admin/ai/status without token - 401", True, "Correctly returns 401")
        elif response.status_code == 403:
            log_test("GET /admin/ai/status without token - 403", True, "Correctly returns 403")
        else:
            log_test("GET /admin/ai/status without token", False, f"Expected 401/403, got {response.status_code}")
    except Exception as e:
        log_test("GET /admin/ai/status without token", False, f"Exception: {str(e)}")

def test_mcqs(token):
    """Test 4: POST /api/admin/ai/mcqs (quick test)"""
    try:
        print("\n⏳ Generating MCQs (may take 5-10 seconds)...")
        response = requests.post(f"{BASE_URL}/admin/ai/mcqs", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "className": "Class 5",
                                    "topic": "Solar System",
                                    "count": 3,
                                    "language": "english"
                                },
                                timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and "data" in data and "questions" in data["data"]:
                questions = data["data"]["questions"]
                if len(questions) >= 3:
                    # Verify structure
                    q = questions[0]
                    if "q" in q and "options" in q and "correctIndex" in q:
                        if len(q["options"]) == 4 and 0 <= q["correctIndex"] <= 3:
                            log_test("POST /admin/ai/mcqs - structure", True, 
                                    f"Generated {len(questions)} MCQs with correct structure")
                            return data["data"]
                        else:
                            log_test("POST /admin/ai/mcqs", False, 
                                    f"Invalid options/correctIndex: {len(q['options'])} options, correctIndex={q['correctIndex']}")
                    else:
                        log_test("POST /admin/ai/mcqs", False, f"Missing required fields in question")
                else:
                    log_test("POST /admin/ai/mcqs", False, f"Expected 3+ questions, got {len(questions)}")
            else:
                log_test("POST /admin/ai/mcqs", False, f"Invalid response structure: {data}")
        else:
            log_test("POST /admin/ai/mcqs", False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test("POST /admin/ai/mcqs", False, f"Exception: {str(e)}")
        return None

def test_mcqs_auth():
    """Test 5: POST /api/admin/ai/mcqs without auth"""
    try:
        response = requests.post(f"{BASE_URL}/admin/ai/mcqs", 
                                json={
                                    "className": "Class 5",
                                    "topic": "Solar System",
                                    "count": 3,
                                    "language": "english"
                                },
                                timeout=10)
        
        if response.status_code in [401, 403]:
            log_test("POST /admin/ai/mcqs without token - 401/403", True, f"Correctly returns {response.status_code}")
        else:
            log_test("POST /admin/ai/mcqs without token", False, f"Expected 401/403, got {response.status_code}")
    except Exception as e:
        log_test("POST /admin/ai/mcqs without token", False, f"Exception: {str(e)}")

def test_mcqs_validation(token):
    """Test 6: POST /api/admin/ai/mcqs without topic - 400"""
    try:
        response = requests.post(f"{BASE_URL}/admin/ai/mcqs", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "className": "Class 5",
                                    "count": 3,
                                    "language": "english"
                                },
                                timeout=10)
        
        if response.status_code == 400:
            log_test("POST /admin/ai/mcqs without topic - 400", True, "Correctly validates required fields")
        else:
            log_test("POST /admin/ai/mcqs without topic", False, f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_test("POST /admin/ai/mcqs without topic", False, f"Exception: {str(e)}")

def test_activities(token):
    """Test 7: POST /api/admin/ai/activities"""
    try:
        print("\n⏳ Generating activities (may take 5-10 seconds)...")
        response = requests.post(f"{BASE_URL}/admin/ai/activities", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "className": "Class 3",
                                    "topic": "Plants",
                                    "count": 2,
                                    "panchapadiStep": "prayoga",
                                    "language": "english"
                                },
                                timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and "data" in data and "activities" in data["data"]:
                activities = data["data"]["activities"]
                if len(activities) >= 2:
                    # Verify structure
                    a = activities[0]
                    if "title" in a and "instructions" in a:
                        log_test("POST /admin/ai/activities - structure", True, 
                                f"Generated {len(activities)} activities with correct structure")
                        return data["data"]
                    else:
                        log_test("POST /admin/ai/activities", False, f"Missing required fields in activity")
                else:
                    log_test("POST /admin/ai/activities", False, f"Expected 2+ activities, got {len(activities)}")
            else:
                log_test("POST /admin/ai/activities", False, f"Invalid response structure")
        else:
            log_test("POST /admin/ai/activities", False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test("POST /admin/ai/activities", False, f"Exception: {str(e)}")
        return None

def test_lesson_plan(token):
    """Test 8: POST /api/admin/ai/lesson-plan (slowest, ~10-15s)"""
    try:
        print("\n⏳ Generating lesson plan (may take 10-20 seconds)...")
        response = requests.post(f"{BASE_URL}/admin/ai/lesson-plan", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "className": "Class 5",
                                    "bookName": "Math",
                                    "chapterName": "Fractions",
                                    "topic": "Introduction to fractions",
                                    "period": 1,
                                    "language": "english"
                                },
                                timeout=40)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and "data" in data:
                lesson_data = data["data"]
                required_fields = ["topic", "learningOutcomes", "tlm", "panchapadi"]
                missing = [f for f in required_fields if f not in lesson_data]
                
                if missing:
                    log_test("POST /admin/ai/lesson-plan", False, f"Missing fields: {missing}")
                    return None
                
                # Verify panchapadi structure
                panchapadi = lesson_data["panchapadi"]
                required_steps = ["prastabana", "anweshana", "alochana", "prayoga", "mulyayana"]
                missing_steps = [s for s in required_steps if s not in panchapadi]
                
                if missing_steps:
                    log_test("POST /admin/ai/lesson-plan", False, f"Missing panchapadi steps: {missing_steps}")
                    return None
                
                # Verify each step has teacherActivity and studentActivity
                all_valid = True
                for step in required_steps:
                    if "teacherActivity" not in panchapadi[step] or "studentActivity" not in panchapadi[step]:
                        log_test("POST /admin/ai/lesson-plan", False, f"Step {step} missing teacherActivity or studentActivity")
                        all_valid = False
                        break
                
                if all_valid:
                    log_test("POST /admin/ai/lesson-plan - structure", True, 
                            f"Generated complete lesson plan with all 5 panchapadi steps")
                    return lesson_data
            else:
                log_test("POST /admin/ai/lesson-plan", False, f"Invalid response structure")
        else:
            log_test("POST /admin/ai/lesson-plan", False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test("POST /admin/ai/lesson-plan", False, f"Exception: {str(e)}")
        return None

def test_worksheet(token):
    """Test 9: POST /api/admin/ai/worksheet"""
    try:
        print("\n⏳ Generating worksheet (may take 5-10 seconds)...")
        response = requests.post(f"{BASE_URL}/admin/ai/worksheet", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "className": "Class 4",
                                    "topic": "Multiplication tables",
                                    "count": 5,
                                    "types": ["mcq", "fill", "short"],
                                    "language": "english"
                                },
                                timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and "data" in data:
                worksheet = data["data"]
                if "title" in worksheet and "questions" in worksheet:
                    questions = worksheet["questions"]
                    if len(questions) >= 5:
                        # Verify structure
                        q = questions[0]
                        if "q" in q and "type" in q:
                            log_test("POST /admin/ai/worksheet - structure", True, 
                                    f"Generated worksheet with {len(questions)} questions")
                            return worksheet
                        else:
                            log_test("POST /admin/ai/worksheet", False, f"Missing required fields in question")
                    else:
                        log_test("POST /admin/ai/worksheet", False, f"Expected 5+ questions, got {len(questions)}")
                else:
                    log_test("POST /admin/ai/worksheet", False, f"Missing title or questions")
            else:
                log_test("POST /admin/ai/worksheet", False, f"Invalid response structure")
        else:
            log_test("POST /admin/ai/worksheet", False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test("POST /admin/ai/worksheet", False, f"Exception: {str(e)}")
        return None

def test_quota_tracking(token, initial_status):
    """Test 10: Verify quota tracking incremented"""
    try:
        response = requests.get(f"{BASE_URL}/admin/ai/status", 
                               headers={"Authorization": f"Bearer {token}"}, 
                               timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            new_used = data.get("used", 0)
            initial_used = initial_status.get("used", 0)
            
            # We made 4 AI calls (mcqs, activities, lesson-plan, worksheet)
            expected_increment = 4
            actual_increment = new_used - initial_used
            
            if actual_increment >= expected_increment:
                log_test("Quota tracking - incremented after AI calls", True, 
                        f"Used count increased from {initial_used} to {new_used} (+{actual_increment})")
            else:
                log_test("Quota tracking", False, 
                        f"Expected increment of at least {expected_increment}, got {actual_increment} (from {initial_used} to {new_used})")
        else:
            log_test("Quota tracking", False, f"Failed to get status: {response.status_code}")
    except Exception as e:
        log_test("Quota tracking", False, f"Exception: {str(e)}")

def test_save_lesson(token, lesson_data):
    """Test 11: POST /api/admin/ai/save-lesson"""
    try:
        # First get class, book, chapter IDs
        classes_resp = requests.get(f"{BASE_URL}/classes", timeout=10)
        if classes_resp.status_code != 200:
            log_test("POST /admin/ai/save-lesson - get classes", False, "Failed to get classes")
            return None
        
        classes = classes_resp.json().get("classes", [])
        if not classes:
            log_test("POST /admin/ai/save-lesson - get classes", False, "No classes found")
            return None
        
        class_id = classes[0]["id"]  # Use first class
        
        # Get books for this class
        books_resp = requests.get(f"{BASE_URL}/books?classId={class_id}", timeout=10)
        if books_resp.status_code != 200:
            log_test("POST /admin/ai/save-lesson - get books", False, "Failed to get books")
            return None
        
        books = books_resp.json().get("books", [])
        if not books:
            log_test("POST /admin/ai/save-lesson - get books", False, "No books found")
            return None
        
        book_id = books[0]["id"]  # Use first book
        
        # Get chapters for this book
        chapters_resp = requests.get(f"{BASE_URL}/chapters?bookId={book_id}", timeout=10)
        if chapters_resp.status_code != 200:
            log_test("POST /admin/ai/save-lesson - get chapters", False, "Failed to get chapters")
            return None
        
        chapters = chapters_resp.json().get("chapters", [])
        if not chapters:
            log_test("POST /admin/ai/save-lesson - get chapters", False, "No chapters found")
            return None
        
        chapter_id = chapters[0]["id"]  # Use first chapter
        
        # Now save the lesson
        response = requests.post(f"{BASE_URL}/admin/ai/save-lesson", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "classId": class_id,
                                    "bookId": book_id,
                                    "chapterId": chapter_id,
                                    "period": 99,  # Use high period number to avoid conflicts
                                    "data": lesson_data
                                },
                                timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and "lessonId" in data:
                lesson_id = data["lessonId"]
                replaced = data.get("replaced", False)
                log_test("POST /admin/ai/save-lesson - save", True, 
                        f"Saved lesson with ID {lesson_id}, replaced={replaced}")
                
                # Verify the lesson can be retrieved
                lesson_resp = requests.get(f"{BASE_URL}/lessons/{lesson_id}", 
                                          headers={"Authorization": f"Bearer {token}"},
                                          timeout=10)
                
                if lesson_resp.status_code == 200:
                    lesson = lesson_resp.json().get("lesson", {})
                    if lesson.get("aiGenerated") and "panchapadi" in lesson and "topic" in lesson:
                        log_test("GET /lessons/:id - verify saved AI lesson", True, 
                                f"Retrieved lesson with aiGenerated=true, topic and panchapadi populated")
                        return lesson_id
                    else:
                        log_test("GET /lessons/:id - verify saved AI lesson", False, 
                                f"Missing aiGenerated, topic, or panchapadi fields")
                else:
                    log_test("GET /lessons/:id - verify saved AI lesson", False, 
                            f"Failed to retrieve lesson: {lesson_resp.status_code}")
            else:
                log_test("POST /admin/ai/save-lesson", False, f"Invalid response: {data}")
        else:
            log_test("POST /admin/ai/save-lesson", False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test("POST /admin/ai/save-lesson", False, f"Exception: {str(e)}")
        return None

def test_regression(token):
    """Test 12-15: Regression tests"""
    try:
        # Test 12: GET /plans
        response = requests.get(f"{BASE_URL}/plans", timeout=10)
        if response.status_code == 200:
            plans = response.json().get("plans", [])
            if len(plans) >= 4:
                log_test("REGRESSION: GET /plans", True, f"Returns {len(plans)} plans")
            else:
                log_test("REGRESSION: GET /plans", False, f"Expected 4+ plans, got {len(plans)}")
        else:
            log_test("REGRESSION: GET /plans", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("REGRESSION: GET /plans", False, f"Exception: {str(e)}")
    
    try:
        # Test 13: POST /razorpay/create-order
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
                                headers={"Authorization": f"Bearer {token}"},
                                json={"planId": "yearly"},
                                timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "orderId" in data and data["orderId"].startswith("order_"):
                log_test("REGRESSION: POST /razorpay/create-order", True, f"Created order {data['orderId']}")
            else:
                log_test("REGRESSION: POST /razorpay/create-order", False, f"Invalid order response")
        else:
            log_test("REGRESSION: POST /razorpay/create-order", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("REGRESSION: POST /razorpay/create-order", False, f"Exception: {str(e)}")
    
    try:
        # Test 14: GET /classes
        response = requests.get(f"{BASE_URL}/classes", timeout=10)
        if response.status_code == 200:
            classes = response.json().get("classes", [])
            if len(classes) >= 11:
                log_test("REGRESSION: GET /classes", True, f"Returns {len(classes)} classes")
            else:
                log_test("REGRESSION: GET /classes", False, f"Expected 11+ classes, got {len(classes)}")
        else:
            log_test("REGRESSION: GET /classes", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("REGRESSION: GET /classes", False, f"Exception: {str(e)}")
    
    try:
        # Test 15: GET /admin/analytics
        response = requests.get(f"{BASE_URL}/admin/analytics", 
                               headers={"Authorization": f"Bearer {token}"},
                               timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "totalUsers" in data and "totalLessons" in data:
                log_test("REGRESSION: GET /admin/analytics", True, f"Returns analytics data")
            else:
                log_test("REGRESSION: GET /admin/analytics", False, f"Missing analytics fields")
        else:
            log_test("REGRESSION: GET /admin/analytics", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("REGRESSION: GET /admin/analytics", False, f"Exception: {str(e)}")

def main():
    print("=" * 80)
    print("GEMINI AI INTEGRATION - COMPREHENSIVE BACKEND TEST")
    print("=" * 80)
    print(f"Backend URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    print("=" * 80)
    
    # Test 1: Admin login
    print("\n📋 TEST GROUP 1: AUTHENTICATION")
    token = test_admin_login()
    if not token:
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    # Test 2-3: AI Status
    print("\n📋 TEST GROUP 2: AI STATUS ENDPOINT")
    initial_status = test_ai_status(token)
    test_ai_status_auth()
    
    # Test 4-6: MCQs
    print("\n📋 TEST GROUP 3: MCQ GENERATION")
    test_mcqs(token)
    test_mcqs_auth()
    test_mcqs_validation(token)
    
    # Test 7: Activities
    print("\n📋 TEST GROUP 4: ACTIVITY GENERATION")
    test_activities(token)
    
    # Test 8: Lesson Plan (slowest)
    print("\n📋 TEST GROUP 5: LESSON PLAN GENERATION")
    lesson_data = test_lesson_plan(token)
    
    # Test 9: Worksheet
    print("\n📋 TEST GROUP 6: WORKSHEET GENERATION")
    test_worksheet(token)
    
    # Test 10: Quota tracking
    print("\n📋 TEST GROUP 7: QUOTA TRACKING")
    if initial_status:
        test_quota_tracking(token, initial_status)
    
    # Test 11: Save lesson
    print("\n📋 TEST GROUP 8: SAVE AI-GENERATED LESSON")
    if lesson_data:
        test_save_lesson(token, lesson_data)
    else:
        log_test("POST /admin/ai/save-lesson", False, "Skipped - no lesson data from previous test")
    
    # Test 12-15: Regression
    print("\n📋 TEST GROUP 9: REGRESSION TESTS")
    test_regression(token)
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"✅ PASSED: {results['passed']}")
    print(f"❌ FAILED: {results['failed']}")
    print(f"📊 TOTAL:  {results['passed'] + results['failed']}")
    print(f"📈 SUCCESS RATE: {results['passed'] / (results['passed'] + results['failed']) * 100:.1f}%")
    print("=" * 80)
    
    if results["failed"] > 0:
        print("\n❌ FAILED TESTS:")
        for test in results["tests"]:
            if not test["passed"]:
                print(f"   - {test['name']}")
                if test["details"]:
                    print(f"     {test['details']}")
    
    sys.exit(0 if results["failed"] == 0 else 1)

if __name__ == "__main__":
    main()
