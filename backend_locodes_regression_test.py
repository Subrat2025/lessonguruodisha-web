#!/usr/bin/env python3
"""
Backend regression test for loCodes array addition to daily-plan and multigrade endpoints.

CHANGE 1: POST /api/daily-plan/generate now emits `loCodes: lesson.loCodes || []` in each period payload
CHANGE 2: POST /api/multigrade/generate now emits `loCodes: lesson.loCodes || []` in each resolved[] class payload

Test requirements:
- Login as admin (9692604577 / <redacted>)
- Hit BOTH endpoints with valid class/lesson selection
- Verify each period object contains BOTH:
  - `loCode` (string, may be empty)
  - `loCodes` (array — should be [] or a list of codes; must be an array type even when empty)
- If a lesson has assigned codes in DB, verify all codes appear in the returned `loCodes` array
- Confirm no other endpoints are broken (quick smoke test)
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_locodes_regression():
    print("=" * 80)
    print("BACKEND REGRESSION TEST: loCodes Array Addition")
    print("=" * 80)
    print()
    
    # Test 1: Admin Login
    print("Test 1: Admin Login (9692604577 / <redacted>)")
    try:
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        print(f"  Status: {login_resp.status_code}")
        if login_resp.status_code != 200:
            print(f"  ❌ FAILED: {login_resp.text}")
            return
        login_data = login_resp.json()
        token = login_data.get("token")
        print(f"  ✅ PASSED: Token obtained")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 2: Get classes to find Class 1 or Balvatika
    print("\nTest 2: GET /api/classes (find Class 1 or Balvatika)")
    try:
        classes_resp = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=10)
        print(f"  Status: {classes_resp.status_code}")
        if classes_resp.status_code != 200:
            print(f"  ❌ FAILED: {classes_resp.text}")
            return
        classes_data = classes_resp.json()
        classes = classes_data.get("classes", [])
        print(f"  ✅ PASSED: {len(classes)} classes found")
        
        # Find Class 1 or Balvatika
        target_class = None
        for cls in classes:
            if cls.get("name") in ["Class 1", "Balvatika", "Class 2"]:
                target_class = cls
                break
        
        if not target_class:
            print(f"  ⚠ WARNING: No Class 1/Balvatika/Class 2 found, using first class")
            target_class = classes[0]
        
        class_id = target_class.get("id")
        class_name = target_class.get("name")
        print(f"  Selected class: {class_name} (id: {class_id})")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 3: Get books for the selected class
    print(f"\nTest 3: GET /api/books?classId={class_id}")
    try:
        books_resp = requests.get(f"{BASE_URL}/books?classId={class_id}", headers=headers, timeout=10)
        print(f"  Status: {books_resp.status_code}")
        if books_resp.status_code != 200:
            print(f"  ❌ FAILED: {books_resp.text}")
            return
        books_data = books_resp.json()
        books = books_data.get("books", [])
        print(f"  ✅ PASSED: {len(books)} books found")
        
        if not books:
            print(f"  ❌ FAILED: No books found for class {class_name}")
            return
        
        book = books[0]
        book_id = book.get("id")
        book_name = book.get("name")
        print(f"  Selected book: {book_name} (id: {book_id})")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 4: Get chapters for the selected book
    print(f"\nTest 4: GET /api/chapters?bookId={book_id}")
    try:
        chapters_resp = requests.get(f"{BASE_URL}/chapters?bookId={book_id}", headers=headers, timeout=10)
        print(f"  Status: {chapters_resp.status_code}")
        if chapters_resp.status_code != 200:
            print(f"  ❌ FAILED: {chapters_resp.text}")
            return
        chapters_data = chapters_resp.json()
        chapters = chapters_data.get("chapters", [])
        print(f"  ✅ PASSED: {len(chapters)} chapters found")
        
        if not chapters:
            print(f"  ❌ FAILED: No chapters found for book {book_name}")
            return
        
        chapter = chapters[0]
        chapter_id = chapter.get("id")
        chapter_name = chapter.get("name")
        print(f"  Selected chapter: {chapter_name} (id: {chapter_id})")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 5: Get lessons for the selected chapter
    print(f"\nTest 5: GET /api/lessons?chapterId={chapter_id}")
    try:
        lessons_resp = requests.get(f"{BASE_URL}/lessons?chapterId={chapter_id}", headers=headers, timeout=10)
        print(f"  Status: {lessons_resp.status_code}")
        if lessons_resp.status_code != 200:
            print(f"  ❌ FAILED: {lessons_resp.text}")
            return
        lessons_data = lessons_resp.json()
        lessons = lessons_data.get("lessons", [])
        print(f"  ✅ PASSED: {len(lessons)} lessons found")
        
        if not lessons:
            print(f"  ❌ FAILED: No lessons found for chapter {chapter_name}")
            return
        
        lesson = lessons[0]
        lesson_id = lesson.get("id")
        lesson_title = lesson.get("title")
        print(f"  Selected lesson: {lesson_title} (id: {lesson_id})")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 6: Get full lesson detail to check loCodes in DB
    print(f"\nTest 6: GET /api/lessons/{lesson_id} (check DB loCodes)")
    try:
        lesson_detail_resp = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers, timeout=10)
        print(f"  Status: {lesson_detail_resp.status_code}")
        if lesson_detail_resp.status_code != 200:
            print(f"  ❌ FAILED: {lesson_detail_resp.text}")
            return
        lesson_detail = lesson_detail_resp.json()
        lesson_data = lesson_detail.get("lesson", {})
        db_lo_codes = lesson_data.get("loCodes", [])
        db_lo_code = lesson_data.get("loCode", "")
        print(f"  ✅ PASSED: Lesson detail retrieved")
        print(f"  DB loCode: '{db_lo_code}'")
        print(f"  DB loCodes: {db_lo_codes} (type: {type(db_lo_codes).__name__}, length: {len(db_lo_codes) if isinstance(db_lo_codes, list) else 'N/A'})")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 7: POST /api/daily-plan/generate - CHANGE 1
    print(f"\nTest 7: POST /api/daily-plan/generate (CHANGE 1 - verify loCodes array)")
    try:
        daily_plan_payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "classType": "single",
            "slots": [
                {
                    "lessonId": lesson_id,
                    "classId": class_id,
                    "bookId": book_id,
                    "chapterId": chapter_id
                }
            ]
        }
        daily_plan_resp = requests.post(f"{BASE_URL}/daily-plan/generate", 
                                       json=daily_plan_payload, 
                                       headers=headers, 
                                       timeout=10)
        print(f"  Status: {daily_plan_resp.status_code}")
        if daily_plan_resp.status_code != 200:
            print(f"  ❌ FAILED: {daily_plan_resp.text}")
            return
        
        daily_plan_data = daily_plan_resp.json()
        periods = daily_plan_data.get("periods", [])
        print(f"  ✅ PASSED: Daily plan generated with {len(periods)} periods")
        
        if not periods:
            print(f"  ❌ FAILED: No periods in daily plan response")
            return
        
        # Check first period for loCodes array
        period = periods[0]
        has_lo_code = "loCode" in period
        has_lo_codes = "loCodes" in period
        lo_code_value = period.get("loCode", None)
        lo_codes_value = period.get("loCodes", None)
        
        print(f"\n  Period 1 structure:")
        print(f"    - Has 'loCode' field: {has_lo_code}")
        print(f"    - loCode value: '{lo_code_value}' (type: {type(lo_code_value).__name__})")
        print(f"    - Has 'loCodes' field: {has_lo_codes}")
        print(f"    - loCodes value: {lo_codes_value} (type: {type(lo_codes_value).__name__})")
        
        # Verify requirements
        if not has_lo_code:
            print(f"  ❌ FAILED: Missing 'loCode' field in period")
            return
        
        if not has_lo_codes:
            print(f"  ❌ FAILED: Missing 'loCodes' field in period")
            return
        
        if not isinstance(lo_codes_value, list):
            print(f"  ❌ FAILED: 'loCodes' is not an array (type: {type(lo_codes_value).__name__})")
            return
        
        print(f"  ✅ PASSED: Both 'loCode' (string) and 'loCodes' (array) fields present")
        
        # If DB has loCodes, verify they appear in response
        if db_lo_codes and len(db_lo_codes) > 0:
            print(f"\n  Verifying DB loCodes preservation:")
            print(f"    DB loCodes: {db_lo_codes}")
            print(f"    Response loCodes: {lo_codes_value}")
            
            # Check if all DB codes are in response
            missing_codes = [code for code in db_lo_codes if code not in lo_codes_value]
            if missing_codes:
                print(f"  ❌ FAILED: Missing codes from DB: {missing_codes}")
                return
            else:
                print(f"  ✅ PASSED: All DB loCodes preserved in response")
        else:
            print(f"  ℹ INFO: No loCodes in DB for this lesson, response loCodes is empty array as expected")
        
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 8: POST /api/multigrade/generate - CHANGE 2
    print(f"\nTest 8: POST /api/multigrade/generate (CHANGE 2 - verify loCodes array)")
    try:
        # For multigrade, we need at least 2 classes
        # Let's try to find another class
        other_class = None
        for cls in classes:
            if cls.get("id") != class_id and cls.get("name") in ["Class 1", "Class 2", "Balvatika", "Class 3"]:
                other_class = cls
                break
        
        if not other_class:
            # Use any other class
            for cls in classes:
                if cls.get("id") != class_id:
                    other_class = cls
                    break
        
        if not other_class:
            print(f"  ⚠ WARNING: Only one class available, skipping multigrade test")
        else:
            other_class_id = other_class.get("id")
            other_class_name = other_class.get("name")
            print(f"  Using classes: {class_name} and {other_class_name}")
            
            # Get a lesson for the other class
            other_books_resp = requests.get(f"{BASE_URL}/books?classId={other_class_id}", headers=headers, timeout=10)
            if other_books_resp.status_code == 200:
                other_books_data = other_books_resp.json()
                other_books = other_books_data.get("books", [])
                if other_books:
                    other_book = other_books[0]
                    other_book_id = other_book.get("id")
                    
                    other_chapters_resp = requests.get(f"{BASE_URL}/chapters?bookId={other_book_id}", headers=headers, timeout=10)
                    if other_chapters_resp.status_code == 200:
                        other_chapters_data = other_chapters_resp.json()
                        other_chapters = other_chapters_data.get("chapters", [])
                        if other_chapters:
                            other_chapter = other_chapters[0]
                            other_chapter_id = other_chapter.get("id")
                            
                            other_lessons_resp = requests.get(f"{BASE_URL}/lessons?chapterId={other_chapter_id}", headers=headers, timeout=10)
                            if other_lessons_resp.status_code == 200:
                                other_lessons_data = other_lessons_resp.json()
                                other_lessons = other_lessons_data.get("lessons", [])
                                if other_lessons:
                                    other_lesson = other_lessons[0]
                                    other_lesson_id = other_lesson.get("id")
                                    
                                    # Now we can test multigrade
                                    multigrade_payload = {
                                        "date": datetime.now().strftime("%Y-%m-%d"),
                                        "periodNumber": 1,
                                        "slots": [
                                            {
                                                "classId": class_id,
                                                "bookId": book_id,
                                                "chapterId": chapter_id,
                                                "lessonId": lesson_id
                                            },
                                            {
                                                "classId": other_class_id,
                                                "bookId": other_book_id,
                                                "chapterId": other_chapter_id,
                                                "lessonId": other_lesson_id
                                            }
                                        ]
                                    }
                                    
                                    multigrade_resp = requests.post(f"{BASE_URL}/multigrade/generate", 
                                                                   json=multigrade_payload, 
                                                                   headers=headers, 
                                                                   timeout=10)
                                    print(f"  Status: {multigrade_resp.status_code}")
                                    if multigrade_resp.status_code != 200:
                                        print(f"  ❌ FAILED: {multigrade_resp.text}")
                                        return
                                    
                                    multigrade_data = multigrade_resp.json()
                                    resolved = multigrade_data.get("classes", [])
                                    print(f"  ✅ PASSED: Multigrade plan generated with {len(resolved)} classes")
                                    
                                    if not resolved:
                                        print(f"  ❌ FAILED: No resolved classes in multigrade response")
                                        return
                                    
                                    # Check first resolved class for loCodes array
                                    resolved_class = resolved[0]
                                    has_lo_code = "loCode" in resolved_class
                                    has_lo_codes = "loCodes" in resolved_class
                                    lo_code_value = resolved_class.get("loCode", None)
                                    lo_codes_value = resolved_class.get("loCodes", None)
                                    
                                    print(f"\n  Resolved class 1 structure:")
                                    print(f"    - Has 'loCode' field: {has_lo_code}")
                                    print(f"    - loCode value: '{lo_code_value}' (type: {type(lo_code_value).__name__})")
                                    print(f"    - Has 'loCodes' field: {has_lo_codes}")
                                    print(f"    - loCodes value: {lo_codes_value} (type: {type(lo_codes_value).__name__})")
                                    
                                    # Verify requirements
                                    if not has_lo_code:
                                        print(f"  ❌ FAILED: Missing 'loCode' field in resolved class")
                                        return
                                    
                                    if not has_lo_codes:
                                        print(f"  ❌ FAILED: Missing 'loCodes' field in resolved class")
                                        return
                                    
                                    if not isinstance(lo_codes_value, list):
                                        print(f"  ❌ FAILED: 'loCodes' is not an array (type: {type(lo_codes_value).__name__})")
                                        return
                                    
                                    print(f"  ✅ PASSED: Both 'loCode' (string) and 'loCodes' (array) fields present in multigrade response")
                                    
                                else:
                                    print(f"  ⚠ WARNING: No lessons found for second class, skipping multigrade test")
                            else:
                                print(f"  ⚠ WARNING: Could not get lessons for second class, skipping multigrade test")
                        else:
                            print(f"  ⚠ WARNING: No chapters found for second class, skipping multigrade test")
                    else:
                        print(f"  ⚠ WARNING: Could not get chapters for second class, skipping multigrade test")
                else:
                    print(f"  ⚠ WARNING: No books found for second class, skipping multigrade test")
            else:
                print(f"  ⚠ WARNING: Could not get books for second class, skipping multigrade test")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return
    
    # Test 9: Quick smoke test - /auth/login
    print(f"\nTest 9: Smoke test - POST /api/auth/login")
    try:
        smoke_login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        print(f"  Status: {smoke_login_resp.status_code}")
        if smoke_login_resp.status_code == 200:
            print(f"  ✅ PASSED: Login endpoint still working")
        else:
            print(f"  ❌ FAILED: Login endpoint broken")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
    
    # Test 10: Quick smoke test - /auth/me
    print(f"\nTest 10: Smoke test - GET /api/auth/me")
    try:
        # Get a fresh token for smoke tests
        fresh_login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        if fresh_login_resp.status_code == 200:
            fresh_token = fresh_login_resp.json().get("token")
            fresh_headers = {"Authorization": f"Bearer {fresh_token}"}
            
            smoke_me_resp = requests.get(f"{BASE_URL}/auth/me", headers=fresh_headers, timeout=10)
            print(f"  Status: {smoke_me_resp.status_code}")
            if smoke_me_resp.status_code == 200:
                print(f"  ✅ PASSED: /auth/me endpoint still working")
            else:
                print(f"  ❌ FAILED: /auth/me endpoint broken")
        else:
            print(f"  ⚠ WARNING: Could not get fresh token for smoke test")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
    
    # Test 11: Quick smoke test - /classes
    print(f"\nTest 11: Smoke test - GET /api/classes")
    try:
        # Get a fresh token for smoke tests
        fresh_login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        if fresh_login_resp.status_code == 200:
            fresh_token = fresh_login_resp.json().get("token")
            fresh_headers = {"Authorization": f"Bearer {fresh_token}"}
            
            smoke_classes_resp = requests.get(f"{BASE_URL}/classes", headers=fresh_headers, timeout=10)
            print(f"  Status: {smoke_classes_resp.status_code}")
            if smoke_classes_resp.status_code == 200:
                print(f"  ✅ PASSED: /classes endpoint still working")
            else:
                print(f"  ❌ FAILED: /classes endpoint broken")
        else:
            print(f"  ⚠ WARNING: Could not get fresh token for smoke test")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
    
    print("\n" + "=" * 80)
    print("REGRESSION TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    test_locodes_regression()
