#!/usr/bin/env python3
"""
Backend API Test Suite for Admin Curriculum Reorder/Move Endpoints
Tests 4 new endpoints: chapters/reorder, chapters/:id/move, lessons/reorder, lessons/:id/move
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Global variables for test state
admin_token = None
regular_user_token = None
test_class_id = None
test_book_id_1 = None
test_book_id_2 = None
test_chapter_id_1 = None
test_chapter_id_2 = None
test_chapter_id_3 = None
test_lesson_id_1 = None
test_lesson_id_2 = None
test_lesson_id_3 = None

def log(message, status="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{status}] {message}")

def test_admin_login():
    """Test 1: Admin login"""
    global admin_token
    log("Testing admin login...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert data["user"]["role"] == "admin", "User should be admin"
        admin_token = data["token"]
        log(f"✅ Admin login passed (mobile: {ADMIN_MOBILE})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin login failed: {str(e)}", "FAIL")
        return False

def test_create_regular_user():
    """Test 2: Create regular user for 403 testing"""
    global regular_user_token
    log("Testing regular user creation...", "TEST")
    
    # Generate unique mobile
    test_mobile = f"91{datetime.now().strftime('%H%M%S%f')[:8]}"
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Regular User",
            "mobile": test_mobile,
            "password": "test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert data["user"]["role"] == "user", "Role should be user"
        regular_user_token = data["token"]
        log(f"✅ Regular user created (mobile: {test_mobile})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regular user creation failed: {str(e)}", "FAIL")
        return False

def test_setup_test_data():
    """Test 3: Setup test data - create class, 2 books, 3 chapters, 3 lessons"""
    global test_class_id, test_book_id_1, test_book_id_2
    global test_chapter_id_1, test_chapter_id_2, test_chapter_id_3
    global test_lesson_id_1, test_lesson_id_2, test_lesson_id_3
    
    log("Setting up test data...", "TEST")
    
    try:
        # Get existing class (use Class 1)
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        classes = response.json().get("classes", [])
        assert len(classes) > 0, "Should have at least one class"
        test_class_id = classes[0]["id"]
        log(f"Using existing class: {classes[0]['name']} (ID: {test_class_id})")
        
        # Get 2 existing books from this class
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        books = response.json().get("books", [])
        assert len(books) >= 2, "Should have at least 2 books in this class"
        test_book_id_1 = books[0]["id"]
        test_book_id_2 = books[1]["id"]
        log(f"Using book 1: {books[0]['name']} (ID: {test_book_id_1})")
        log(f"Using book 2: {books[1]['name']} (ID: {test_book_id_2})")
        
        # Create 3 test chapters in book 1
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Chapter 1
        response = requests.post(f"{BASE_URL}/admin/chapters", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "name": f"Test Chapter 1 - {datetime.now().strftime('%H%M%S')}",
                "order": 100,
                "totalPeriods": 3
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        test_chapter_id_1 = data.get("id") or data.get("chapter", {}).get("id")
        assert test_chapter_id_1, f"Chapter ID not found in response: {data}"
        log(f"Created test chapter 1 (ID: {test_chapter_id_1})")
        
        # Chapter 2
        response = requests.post(f"{BASE_URL}/admin/chapters", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "name": f"Test Chapter 2 - {datetime.now().strftime('%H%M%S')}",
                "order": 101,
                "totalPeriods": 3
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        test_chapter_id_2 = data.get("id") or data.get("chapter", {}).get("id")
        assert test_chapter_id_2, f"Chapter ID not found in response: {data}"
        log(f"Created test chapter 2 (ID: {test_chapter_id_2})")
        
        # Chapter 3
        response = requests.post(f"{BASE_URL}/admin/chapters", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "name": f"Test Chapter 3 - {datetime.now().strftime('%H%M%S')}",
                "order": 102,
                "totalPeriods": 3
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        test_chapter_id_3 = data.get("id") or data.get("chapter", {}).get("id")
        assert test_chapter_id_3, f"Chapter ID not found in response: {data}"
        log(f"Created test chapter 3 (ID: {test_chapter_id_3})")
        
        # Create 3 test lessons in chapter 1
        # Lesson 1
        response = requests.post(f"{BASE_URL}/admin/lessons", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "chapterId": test_chapter_id_1,
                "period": 1,
                "title": f"Test Lesson 1 - Period 1",
                "content": "Test content for lesson 1"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        test_lesson_id_1 = response.json()["lesson"]["id"]
        log(f"Created test lesson 1 (ID: {test_lesson_id_1})")
        
        # Lesson 2
        response = requests.post(f"{BASE_URL}/admin/lessons", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "chapterId": test_chapter_id_1,
                "period": 2,
                "title": f"Test Lesson 2 - Period 2",
                "content": "Test content for lesson 2"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        test_lesson_id_2 = response.json()["lesson"]["id"]
        log(f"Created test lesson 2 (ID: {test_lesson_id_2})")
        
        # Lesson 3
        response = requests.post(f"{BASE_URL}/admin/lessons", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "chapterId": test_chapter_id_1,
                "period": 3,
                "title": f"Test Lesson 3 - Period 3",
                "content": "Test content for lesson 3"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        test_lesson_id_3 = response.json()["lesson"]["id"]
        log(f"Created test lesson 3 (ID: {test_lesson_id_3})")
        
        log("✅ Test data setup complete", "PASS")
        return True
    except Exception as e:
        log(f"❌ Test data setup failed: {str(e)}", "FAIL")
        return False

# ===== TEST PUT /api/admin/chapters/reorder =====

def test_chapters_reorder_no_auth():
    """Test 4: PUT /admin/chapters/reorder without auth returns 401 or 403"""
    log("Testing chapters reorder without auth...", "TEST")
    try:
        response = requests.put(f"{BASE_URL}/admin/chapters/reorder", json={
            "bookId": test_book_id_1,
            "items": [{"id": test_chapter_id_1, "order": 1}]
        })
        # Admin endpoints return 403 even without auth (admin check happens first)
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        log("✅ Chapters reorder without auth returns 401/403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapters reorder without auth test failed: {str(e)}", "FAIL")
        return False

def test_chapters_reorder_non_admin():
    """Test 5: PUT /admin/chapters/reorder with non-admin returns 403"""
    log("Testing chapters reorder with non-admin user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.put(f"{BASE_URL}/admin/chapters/reorder", 
            headers=headers,
            json={
                "bookId": test_book_id_1,
                "items": [{"id": test_chapter_id_1, "order": 1}]
            })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        log("✅ Chapters reorder with non-admin returns 403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapters reorder non-admin test failed: {str(e)}", "FAIL")
        return False

def test_chapters_reorder_missing_fields():
    """Test 6: PUT /admin/chapters/reorder with missing fields returns 400"""
    log("Testing chapters reorder with missing fields...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Missing bookId
        response = requests.put(f"{BASE_URL}/admin/chapters/reorder", 
            headers=headers,
            json={"items": [{"id": test_chapter_id_1, "order": 1}]})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        # Missing items
        response = requests.put(f"{BASE_URL}/admin/chapters/reorder", 
            headers=headers,
            json={"bookId": test_book_id_1})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        log("✅ Chapters reorder missing fields validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapters reorder missing fields test failed: {str(e)}", "FAIL")
        return False

def test_chapters_reorder_success():
    """Test 7: PUT /admin/chapters/reorder successfully reorders chapters"""
    log("Testing chapters reorder success...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Reorder: swap chapter 1 (order 100) and chapter 2 (order 101)
        response = requests.put(f"{BASE_URL}/admin/chapters/reorder", 
            headers=headers,
            json={
                "bookId": test_book_id_1,
                "items": [
                    {"id": test_chapter_id_1, "order": 101},
                    {"id": test_chapter_id_2, "order": 100}
                ]
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        assert data.get("modified") == 2, f"Should modify 2 chapters, got {data.get('modified')}"
        
        # Verify orders changed
        response = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id_1}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        chapters = response.json().get("chapters", [])
        
        chapter1 = next((c for c in chapters if c["id"] == test_chapter_id_1), None)
        chapter2 = next((c for c in chapters if c["id"] == test_chapter_id_2), None)
        
        assert chapter1 is not None, "Chapter 1 should exist"
        assert chapter2 is not None, "Chapter 2 should exist"
        assert chapter1["order"] == 101, f"Chapter 1 order should be 101, got {chapter1['order']}"
        assert chapter2["order"] == 100, f"Chapter 2 order should be 100, got {chapter2['order']}"
        
        log("✅ Chapters reorder success - orders updated correctly", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapters reorder success test failed: {str(e)}", "FAIL")
        return False

# ===== TEST POST /api/admin/chapters/:id/move =====

def test_chapter_move_no_auth():
    """Test 8: POST /admin/chapters/:id/move without auth returns 401 or 403"""
    log("Testing chapter move without auth...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", json={
            "newClassId": test_class_id,
            "newBookId": test_book_id_2
        })
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        log("✅ Chapter move without auth returns 401/403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapter move without auth test failed: {str(e)}", "FAIL")
        return False

def test_chapter_move_non_admin():
    """Test 9: POST /admin/chapters/:id/move with non-admin returns 403"""
    log("Testing chapter move with non-admin user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", 
            headers=headers,
            json={
                "newClassId": test_class_id,
                "newBookId": test_book_id_2
            })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        log("✅ Chapter move with non-admin returns 403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapter move non-admin test failed: {str(e)}", "FAIL")
        return False

def test_chapter_move_missing_fields():
    """Test 10: POST /admin/chapters/:id/move with missing fields returns 400"""
    log("Testing chapter move with missing fields...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Missing newBookId
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", 
            headers=headers,
            json={"newClassId": test_class_id})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        # Missing newClassId
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", 
            headers=headers,
            json={"newBookId": test_book_id_2})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        log("✅ Chapter move missing fields validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapter move missing fields test failed: {str(e)}", "FAIL")
        return False

def test_chapter_move_invalid_class():
    """Test 11: POST /admin/chapters/:id/move with invalid class returns 404"""
    log("Testing chapter move with invalid class...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", 
            headers=headers,
            json={
                "newClassId": "invalid-class-id",
                "newBookId": test_book_id_2
            })
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "class" in data.get("error", "").lower(), "Error should mention class"
        log("✅ Chapter move with invalid class returns 404", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapter move invalid class test failed: {str(e)}", "FAIL")
        return False

def test_chapter_move_invalid_book():
    """Test 12: POST /admin/chapters/:id/move with invalid book returns 404"""
    log("Testing chapter move with invalid book...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", 
            headers=headers,
            json={
                "newClassId": test_class_id,
                "newBookId": "invalid-book-id"
            })
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "book" in data.get("error", "").lower(), "Error should mention book"
        log("✅ Chapter move with invalid book returns 404", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapter move invalid book test failed: {str(e)}", "FAIL")
        return False

def test_chapter_move_book_not_in_class():
    """Test 13: POST /admin/chapters/:id/move with book not in class returns 404"""
    log("Testing chapter move with book not in target class...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get a different class
        response = requests.get(f"{BASE_URL}/classes")
        classes = response.json().get("classes", [])
        different_class = next((c for c in classes if c["id"] != test_class_id), None)
        
        if different_class:
            # Try to move chapter to different class but with book from original class
            response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_3}/move", 
                headers=headers,
                json={
                    "newClassId": different_class["id"],
                    "newBookId": test_book_id_2  # This book belongs to test_class_id, not different_class
                })
            assert response.status_code == 404, f"Expected 404, got {response.status_code}"
            data = response.json()
            assert "book" in data.get("error", "").lower() and "class" in data.get("error", "").lower(), "Error should mention book and class mismatch"
            log("✅ Chapter move with book not in class returns 404", "PASS")
        else:
            log("⚠️ Skipping test - only one class available", "SKIP")
        return True
    except Exception as e:
        log(f"❌ Chapter move book not in class test failed: {str(e)}", "FAIL")
        return False

def test_chapter_move_success_with_cascade():
    """Test 14: POST /admin/chapters/:id/move successfully moves chapter and cascades to lessons"""
    log("Testing chapter move success with cascade to lessons...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current state of chapter 1 and its lessons
        response = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter_id_1}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lessons_before = response.json().get("lessons", [])
        log(f"Chapter 1 has {len(lessons_before)} lessons before move")
        
        # Verify lessons are currently in book 1
        for lesson in lessons_before:
            assert lesson["bookId"] == test_book_id_1, f"Lesson should be in book 1 before move"
        
        # Move chapter 1 to book 2
        response = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id_1}/move", 
            headers=headers,
            json={
                "newClassId": test_class_id,
                "newBookId": test_book_id_2,
                "order": 50
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        assert data.get("newOrder") == 50, f"Should return newOrder:50, got {data.get('newOrder')}"
        
        # Verify chapter moved
        response = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id_2}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        chapters = response.json().get("chapters", [])
        moved_chapter = next((c for c in chapters if c["id"] == test_chapter_id_1), None)
        assert moved_chapter is not None, "Chapter should exist in new book"
        assert moved_chapter["order"] == 50, f"Chapter order should be 50, got {moved_chapter['order']}"
        
        # Verify ALL lessons under this chapter also moved (CASCADE)
        response = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter_id_1}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lessons_after = response.json().get("lessons", [])
        
        assert len(lessons_after) == len(lessons_before), f"Should have same number of lessons, got {len(lessons_after)} vs {len(lessons_before)}"
        
        # Verify each lesson now has new bookId (CASCADE VERIFICATION)
        for lesson in lessons_after:
            # Get full lesson details to check bookId
            response = requests.get(f"{BASE_URL}/lessons/{lesson['id']}", headers=headers)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            full_lesson = response.json().get("lesson", {})
            assert full_lesson["bookId"] == test_book_id_2, f"Lesson {lesson['id']} should have new bookId {test_book_id_2}, got {full_lesson['bookId']}"
            assert full_lesson["classId"] == test_class_id, f"Lesson {lesson['id']} should have classId {test_class_id}"
            log(f"✓ Lesson {lesson['id']} cascaded correctly: bookId={full_lesson['bookId']}")
        
        log("✅ Chapter move success - chapter and ALL lessons cascaded correctly", "PASS")
        return True
    except Exception as e:
        log(f"❌ Chapter move success test failed: {str(e)}", "FAIL")
        return False

# ===== TEST PUT /api/admin/lessons/reorder =====

def test_lessons_reorder_no_auth():
    """Test 15: PUT /admin/lessons/reorder without auth returns 401 or 403"""
    log("Testing lessons reorder without auth...", "TEST")
    try:
        response = requests.put(f"{BASE_URL}/admin/lessons/reorder", json={
            "chapterId": test_chapter_id_1,
            "items": [{"id": test_lesson_id_1, "period": 1}]
        })
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        log("✅ Lessons reorder without auth returns 401/403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lessons reorder without auth test failed: {str(e)}", "FAIL")
        return False

def test_lessons_reorder_non_admin():
    """Test 16: PUT /admin/lessons/reorder with non-admin returns 403"""
    log("Testing lessons reorder with non-admin user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.put(f"{BASE_URL}/admin/lessons/reorder", 
            headers=headers,
            json={
                "chapterId": test_chapter_id_1,
                "items": [{"id": test_lesson_id_1, "period": 1}]
            })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        log("✅ Lessons reorder with non-admin returns 403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lessons reorder non-admin test failed: {str(e)}", "FAIL")
        return False

def test_lessons_reorder_missing_fields():
    """Test 17: PUT /admin/lessons/reorder with missing fields returns 400"""
    log("Testing lessons reorder with missing fields...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Missing chapterId
        response = requests.put(f"{BASE_URL}/admin/lessons/reorder", 
            headers=headers,
            json={"items": [{"id": test_lesson_id_1, "period": 1}]})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        # Missing items
        response = requests.put(f"{BASE_URL}/admin/lessons/reorder", 
            headers=headers,
            json={"chapterId": test_chapter_id_1})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        log("✅ Lessons reorder missing fields validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lessons reorder missing fields test failed: {str(e)}", "FAIL")
        return False

def test_lessons_reorder_success():
    """Test 18: PUT /admin/lessons/reorder successfully reorders lessons"""
    log("Testing lessons reorder success...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Reorder: swap lesson 1 (period 1) and lesson 2 (period 2)
        response = requests.put(f"{BASE_URL}/admin/lessons/reorder", 
            headers=headers,
            json={
                "chapterId": test_chapter_id_1,
                "items": [
                    {"id": test_lesson_id_1, "period": 2},
                    {"id": test_lesson_id_2, "period": 1}
                ]
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        assert data.get("modified") == 2, f"Should modify 2 lessons, got {data.get('modified')}"
        
        # Verify periods changed
        response = requests.get(f"{BASE_URL}/lessons/{test_lesson_id_1}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lesson1 = response.json().get("lesson", {})
        
        response = requests.get(f"{BASE_URL}/lessons/{test_lesson_id_2}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lesson2 = response.json().get("lesson", {})
        
        assert lesson1["period"] == 2, f"Lesson 1 period should be 2, got {lesson1['period']}"
        assert lesson2["period"] == 1, f"Lesson 2 period should be 1, got {lesson2['period']}"
        
        log("✅ Lessons reorder success - periods updated correctly", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lessons reorder success test failed: {str(e)}", "FAIL")
        return False

# ===== TEST POST /api/admin/lessons/:id/move =====

def test_lesson_move_no_auth():
    """Test 19: POST /admin/lessons/:id/move without auth returns 401 or 403"""
    log("Testing lesson move without auth...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/lessons/{test_lesson_id_3}/move", json={
            "newChapterId": test_chapter_id_2
        })
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        log("✅ Lesson move without auth returns 401/403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson move without auth test failed: {str(e)}", "FAIL")
        return False

def test_lesson_move_non_admin():
    """Test 20: POST /admin/lessons/:id/move with non-admin returns 403"""
    log("Testing lesson move with non-admin user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.post(f"{BASE_URL}/admin/lessons/{test_lesson_id_3}/move", 
            headers=headers,
            json={"newChapterId": test_chapter_id_2})
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        log("✅ Lesson move with non-admin returns 403", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson move non-admin test failed: {str(e)}", "FAIL")
        return False

def test_lesson_move_missing_fields():
    """Test 21: POST /admin/lessons/:id/move with missing fields returns 400"""
    log("Testing lesson move with missing fields...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Missing newChapterId
        response = requests.post(f"{BASE_URL}/admin/lessons/{test_lesson_id_3}/move", 
            headers=headers,
            json={})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        log("✅ Lesson move missing fields validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson move missing fields test failed: {str(e)}", "FAIL")
        return False

def test_lesson_move_invalid_chapter():
    """Test 22: POST /admin/lessons/:id/move with invalid chapter returns 404"""
    log("Testing lesson move with invalid chapter...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/lessons/{test_lesson_id_3}/move", 
            headers=headers,
            json={"newChapterId": "invalid-chapter-id"})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "chapter" in data.get("error", "").lower(), "Error should mention chapter"
        log("✅ Lesson move with invalid chapter returns 404", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson move invalid chapter test failed: {str(e)}", "FAIL")
        return False

def test_lesson_move_success_with_inheritance():
    """Test 23: POST /admin/lessons/:id/move successfully moves lesson and inherits classId/bookId"""
    log("Testing lesson move success with classId/bookId inheritance...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current state of lesson 3
        response = requests.get(f"{BASE_URL}/lessons/{test_lesson_id_3}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lesson_before = response.json().get("lesson", {})
        log(f"Lesson 3 before move: chapterId={lesson_before['chapterId']}, bookId={lesson_before['bookId']}, period={lesson_before['period']}")
        
        # Get target chapter 2 details
        response = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id_1}")
        chapters = response.json().get("chapters", [])
        target_chapter = next((c for c in chapters if c["id"] == test_chapter_id_2), None)
        assert target_chapter is not None, "Target chapter should exist"
        
        # Move lesson 3 to chapter 2
        response = requests.post(f"{BASE_URL}/admin/lessons/{test_lesson_id_3}/move", 
            headers=headers,
            json={
                "newChapterId": test_chapter_id_2,
                "period": 5
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        assert data.get("newPeriod") == 5, f"Should return newPeriod:5, got {data.get('newPeriod')}"
        
        # Verify lesson moved and inherited classId/bookId from target chapter
        response = requests.get(f"{BASE_URL}/lessons/{test_lesson_id_3}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lesson_after = response.json().get("lesson", {})
        
        assert lesson_after["chapterId"] == test_chapter_id_2, f"Lesson should have new chapterId {test_chapter_id_2}, got {lesson_after['chapterId']}"
        assert lesson_after["period"] == 5, f"Lesson period should be 5, got {lesson_after['period']}"
        
        # CRITICAL: Verify lesson inherited classId and bookId from target chapter
        # Note: Chapter 2 is still in book 1 (we only moved chapter 1 to book 2)
        assert lesson_after["bookId"] == test_book_id_1, f"Lesson should inherit bookId {test_book_id_1} from target chapter, got {lesson_after['bookId']}"
        assert lesson_after["classId"] == test_class_id, f"Lesson should inherit classId {test_class_id} from target chapter, got {lesson_after['classId']}"
        
        log(f"✓ Lesson 3 after move: chapterId={lesson_after['chapterId']}, bookId={lesson_after['bookId']}, period={lesson_after['period']}")
        log("✅ Lesson move success - lesson moved and inherited classId/bookId from target chapter", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson move success test failed: {str(e)}", "FAIL")
        return False

# ===== REGRESSION TESTS =====

def test_regression_create_chapter():
    """Test 24: Regression - POST /admin/chapters still works"""
    log("Testing regression - create chapter...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/chapters", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "name": f"Regression Test Chapter - {datetime.now().strftime('%H%M%S')}",
                "order": 999
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True or "chapter" in data, f"Should return ok:true or chapter, got {data}"
        log("✅ Regression - create chapter still works", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression create chapter test failed: {str(e)}", "FAIL")
        return False

def test_regression_update_chapter():
    """Test 25: Regression - PUT /admin/chapters/:id still works"""
    log("Testing regression - update chapter...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/chapters/{test_chapter_id_2}", 
            headers=headers,
            json={"name": f"Updated Chapter Name - {datetime.now().strftime('%H%M%S')}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        log("✅ Regression - update chapter still works", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression update chapter test failed: {str(e)}", "FAIL")
        return False

def test_regression_create_lesson():
    """Test 26: Regression - POST /admin/lessons still works"""
    log("Testing regression - create lesson...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/lessons", 
            headers=headers,
            json={
                "classId": test_class_id,
                "bookId": test_book_id_1,
                "chapterId": test_chapter_id_2,
                "period": 10,
                "title": f"Regression Test Lesson - {datetime.now().strftime('%H%M%S')}",
                "content": "Regression test content"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "lesson" in data, "Should return lesson"
        log("✅ Regression - create lesson still works", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression create lesson test failed: {str(e)}", "FAIL")
        return False

def test_regression_update_lesson():
    """Test 27: Regression - PUT /admin/lessons/:id still works"""
    log("Testing regression - update lesson...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/lessons/{test_lesson_id_2}", 
            headers=headers,
            json={"title": f"Updated Lesson Title - {datetime.now().strftime('%H%M%S')}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        log("✅ Regression - update lesson still works", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression update lesson test failed: {str(e)}", "FAIL")
        return False

# ===== CLEANUP =====

def test_cleanup():
    """Test 28: Cleanup test data"""
    log("Cleaning up test data...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Delete test chapters (will cascade delete lessons)
        for chapter_id in [test_chapter_id_1, test_chapter_id_2, test_chapter_id_3]:
            response = requests.delete(f"{BASE_URL}/admin/chapters/{chapter_id}?cascade=1", headers=headers)
            if response.status_code == 200:
                log(f"✓ Deleted chapter {chapter_id}")
        
        log("✅ Cleanup complete", "PASS")
        return True
    except Exception as e:
        log(f"⚠️ Cleanup failed (non-critical): {str(e)}", "WARN")
        return True  # Don't fail the test suite on cleanup errors

# ===== MAIN TEST RUNNER =====

def main():
    """Run all tests"""
    log("=" * 80, "INFO")
    log("BACKEND CURRICULUM REORDER/MOVE ENDPOINTS TEST SUITE", "INFO")
    log("=" * 80, "INFO")
    
    tests = [
        # Setup
        test_admin_login,
        test_create_regular_user,
        test_setup_test_data,
        
        # PUT /admin/chapters/reorder
        test_chapters_reorder_no_auth,
        test_chapters_reorder_non_admin,
        test_chapters_reorder_missing_fields,
        test_chapters_reorder_success,
        
        # POST /admin/chapters/:id/move
        test_chapter_move_no_auth,
        test_chapter_move_non_admin,
        test_chapter_move_missing_fields,
        test_chapter_move_invalid_class,
        test_chapter_move_invalid_book,
        test_chapter_move_book_not_in_class,
        test_chapter_move_success_with_cascade,
        
        # PUT /admin/lessons/reorder
        test_lessons_reorder_no_auth,
        test_lessons_reorder_non_admin,
        test_lessons_reorder_missing_fields,
        test_lessons_reorder_success,
        
        # POST /admin/lessons/:id/move
        test_lesson_move_no_auth,
        test_lesson_move_non_admin,
        test_lesson_move_missing_fields,
        test_lesson_move_invalid_chapter,
        test_lesson_move_success_with_inheritance,
        
        # Regression
        test_regression_create_chapter,
        test_regression_update_chapter,
        test_regression_create_lesson,
        test_regression_update_lesson,
        
        # Cleanup
        test_cleanup,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            log(f"❌ Test {test.__name__} crashed: {str(e)}", "FAIL")
            failed += 1
    
    log("=" * 80, "INFO")
    log(f"TEST SUMMARY: {passed} passed, {failed} failed out of {passed + failed} tests", "INFO")
    log("=" * 80, "INFO")
    
    if failed > 0:
        sys.exit(1)
    else:
        log("🎉 ALL TESTS PASSED!", "INFO")
        sys.exit(0)

if __name__ == "__main__":
    main()
