#!/usr/bin/env python3
"""
Backend API Test Suite for EduMaster Odisha Premium - REFACTORED VERSION
Tests new Class → Book → Chapter → Period hierarchy
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test data
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Global variables for test state
admin_token = None
user_token = None
subscribed_user_token = None
test_mobile = None
subscribed_mobile = None
class_ids = {}
book_ids = {}
chapter_ids = {}
lesson_ids = []

def log(message, status="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{status}] {message}")

def test_health_check():
    """Test 1: Health check endpoint"""
    log("Testing health check endpoint...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Health check should return ok:true"
        log("✅ Health check passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Health check failed: {str(e)}", "FAIL")
        return False

def test_admin_login():
    """Test 2: Login as admin"""
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
        log("✅ Admin login passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin login failed: {str(e)}", "FAIL")
        return False

def test_register_regular_user():
    """Test 3: Register a regular user"""
    global user_token, test_mobile
    log("Testing regular user registration...", "TEST")
    
    test_mobile = f"91{datetime.now().strftime('%H%M%S%f')[:8]}"
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Priya Sharma",
            "mobile": test_mobile,
            "password": "test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        
        user_token = data["token"]
        log(f"✅ Regular user registration passed (mobile: {test_mobile})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regular user registration failed: {str(e)}", "FAIL")
        return False

def test_register_subscribed_user():
    """Test 4: Register and subscribe a user"""
    global subscribed_user_token, subscribed_mobile
    log("Testing subscribed user registration...", "TEST")
    
    subscribed_mobile = f"92{datetime.now().strftime('%H%M%S%f')[:8]}"
    
    try:
        # Register
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Amit Kumar",
            "mobile": subscribed_mobile,
            "password": "test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        subscribed_user_token = data["token"]
        
        # Subscribe
        headers = {"Authorization": f"Bearer {subscribed_user_token}"}
        response = requests.post(f"{BASE_URL}/subscribe", 
            headers=headers,
            json={"planId": "monthly"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        log(f"✅ Subscribed user registration passed (mobile: {subscribed_mobile})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Subscribed user registration failed: {str(e)}", "FAIL")
        return False

def test_get_classes():
    """Test 5: Get all classes"""
    global class_ids
    log("Testing get classes...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "classes" in data, "Response should contain classes"
        classes = data["classes"]
        assert len(classes) >= 11, f"Should have at least 11 classes, got {len(classes)}"
        
        # Store class IDs
        for cls in classes:
            class_ids[cls["name"]] = cls["id"]
        
        log(f"✅ Get classes passed ({len(classes)} classes found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get classes failed: {str(e)}", "FAIL")
        return False

def test_subjects_endpoint_gone():
    """Test 6: Verify /subjects endpoint is gone (404)"""
    log("Testing /subjects endpoint is gone...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/subjects")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        log("✅ /subjects endpoint correctly returns 404", "PASS")
        return True
    except Exception as e:
        log(f"❌ /subjects endpoint test failed: {str(e)}", "FAIL")
        return False

def test_get_all_books():
    """Test 7: Get all books"""
    global book_ids
    log("Testing get all books...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/books")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "books" in data, "Response should contain books"
        books = data["books"]
        assert len(books) >= 85, f"Should have at least 85 books, got {len(books)}"
        
        # Verify book structure
        if books:
            book = books[0]
            assert "id" in book, "Book should have id"
            assert "classId" in book, "Book should have classId"
            assert "name" in book, "Book should have name"
            assert "order" in book, "Book should have order"
            assert "emoji" in book, "Book should have emoji"
            assert "color" in book, "Book should have color"
        
        # Store book IDs
        for book in books:
            book_ids[book["name"]] = book["id"]
        
        log(f"✅ Get all books passed ({len(books)} books found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get all books failed: {str(e)}", "FAIL")
        return False

def test_get_books_for_class6():
    """Test 8: Get books for Class 6"""
    log("Testing get books for Class 6...", "TEST")
    try:
        class6_id = class_ids.get("Class 6")
        if not class6_id:
            log("⚠️ Class 6 not found, skipping", "WARN")
            return True
        
        response = requests.get(f"{BASE_URL}/books?classId={class6_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "books" in data, "Response should contain books"
        books = data["books"]
        assert len(books) >= 11, f"Should have at least 11 books for Class 6, got {len(books)}"
        
        # Check for specific books
        book_names = [b["name"] for b in books]
        assert "Jasmine" in book_names, "Should have Jasmine book"
        assert "ହିନ୍ଦୀ କଳିକା" in book_names, "Should have ହିନ୍ଦୀ କଳିକା book"
        
        log(f"✅ Get books for Class 6 passed ({len(books)} books found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get books for Class 6 failed: {str(e)}", "FAIL")
        return False

def test_get_books_for_class10():
    """Test 9: Get books for Class 10"""
    log("Testing get books for Class 10...", "TEST")
    try:
        class10_id = class_ids.get("Class 10")
        if not class10_id:
            log("⚠️ Class 10 not found, skipping", "WARN")
            return True
        
        response = requests.get(f"{BASE_URL}/books?classId={class10_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "books" in data, "Response should contain books"
        books = data["books"]
        assert len(books) >= 15, f"Should have at least 15 books for Class 10, got {len(books)}"
        
        # Check for specific book
        book_names = [b["name"] for b in books]
        assert "ସାହିତ୍ୟ ସିନ୍ଧୁ" in book_names, "Should have ସାହିତ୍ୟ ସିନ୍ଧୁ book"
        
        log(f"✅ Get books for Class 10 passed ({len(books)} books found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get books for Class 10 failed: {str(e)}", "FAIL")
        return False

def test_get_chapters_by_book():
    """Test 10: Get chapters filtered by bookId"""
    global chapter_ids
    log("Testing get chapters by bookId...", "TEST")
    try:
        if not book_ids:
            log("⚠️ No books found, skipping", "WARN")
            return True
        
        book_id = list(book_ids.values())[0]
        response = requests.get(f"{BASE_URL}/chapters?bookId={book_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "chapters" in data, "Response should contain chapters"
        chapters = data["chapters"]
        
        # Verify chapters are sorted by order
        if len(chapters) > 1:
            orders = [c.get("order", 0) for c in chapters]
            assert orders == sorted(orders), "Chapters should be sorted by order"
        
        # Store chapter IDs
        for chap in chapters:
            chapter_ids[chap["name"]] = chap["id"]
        
        log(f"✅ Get chapters by bookId passed ({len(chapters)} chapters found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get chapters by bookId failed: {str(e)}", "FAIL")
        return False

def test_get_lessons_by_book():
    """Test 11: Get lessons filtered by bookId"""
    global lesson_ids
    log("Testing get lessons by bookId...", "TEST")
    try:
        if not book_ids:
            log("⚠️ No books found, skipping", "WARN")
            return True
        
        book_id = list(book_ids.values())[0]
        response = requests.get(f"{BASE_URL}/lessons?bookId={book_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "lessons" in data, "Response should contain lessons"
        lessons = data["lessons"]
        
        # Store lesson IDs
        lesson_ids = [l["id"] for l in lessons if "id" in l]
        
        # Verify sensitive fields are not included
        if lessons:
            assert "content" not in lessons[0], "Content should not be in list view"
            assert "teacherNotes" not in lessons[0], "Teacher notes should not be in list view"
            assert "tlm" not in lessons[0], "TLM should not be in list view"
        
        log(f"✅ Get lessons by bookId passed ({len(lessons)} lessons found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get lessons by bookId failed: {str(e)}", "FAIL")
        return False

def test_lesson_preview_without_auth():
    """Test 12: Lesson detail without auth returns 401 with preview"""
    log("Testing lesson preview without auth...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        lesson_id = lesson_ids[0]
        response = requests.get(f"{BASE_URL}/lessons/{lesson_id}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        
        # Verify preview structure
        assert data.get("preview") == True, "Should have preview:true"
        assert "lesson" in data, "Should have lesson object"
        assert "preview" in data["lesson"], "Lesson should have preview text"
        assert len(data["lesson"]["preview"]) <= 360, "Preview should be ~350 chars"
        assert "class" in data, "Should have class object"
        assert "book" in data, "Should have book object"
        assert "chapter" in data, "Should have chapter object"
        assert "siblings" in data, "Should have siblings array"
        assert "message" in data, "Should have message"
        
        log("✅ Lesson preview without auth passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson preview without auth failed: {str(e)}", "FAIL")
        return False

def test_lesson_preview_without_subscription():
    """Test 13: Lesson detail without subscription returns 402 with preview"""
    log("Testing lesson preview without subscription...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        lesson_id = lesson_ids[0]
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
        assert response.status_code == 402, f"Expected 402, got {response.status_code}"
        data = response.json()
        
        # Verify preview structure
        assert data.get("preview") == True, "Should have preview:true"
        assert "lesson" in data, "Should have lesson object"
        assert "preview" in data["lesson"], "Lesson should have preview text"
        assert data.get("code") == "NO_SUBSCRIPTION", "Should have NO_SUBSCRIPTION code"
        assert "book" in data, "Should have book object (not subject)"
        
        log("✅ Lesson preview without subscription passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson preview without subscription failed: {str(e)}", "FAIL")
        return False

def test_lesson_full_as_admin():
    """Test 14: Lesson detail as admin returns full content"""
    log("Testing lesson full content as admin...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        lesson_id = lesson_ids[0]
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify full content structure
        assert "lesson" in data, "Should have lesson object"
        lesson = data["lesson"]
        assert "content" in lesson, "Should have content"
        assert "teacherNotes" in lesson, "Should have teacherNotes"
        assert "tlm" in lesson, "Should have tlm"
        assert "learningOutcomes" in lesson, "Should have learningOutcomes"
        assert "loCodes" in lesson, "Should have loCodes"
        assert "assessmentQuestions" in lesson, "Should have assessmentQuestions"
        assert "panchapadiSopana" in lesson, "Should have panchapadiSopana"
        assert "activities" in lesson, "Should have activities"
        assert "worksheet" in lesson, "Should have worksheet"
        assert "homework" in lesson, "Should have homework"
        
        assert "class" in data, "Should have class object"
        assert "book" in data, "Should have book object"
        assert "chapter" in data, "Should have chapter object"
        assert "siblings" in data, "Should have siblings array"
        
        log("✅ Lesson full content as admin passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson full content as admin failed: {str(e)}", "FAIL")
        return False

def test_lesson_full_as_subscribed_user():
    """Test 15: Lesson detail as subscribed user returns full content"""
    log("Testing lesson full content as subscribed user...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        lesson_id = lesson_ids[0]
        headers = {"Authorization": f"Bearer {subscribed_user_token}"}
        response = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify full content
        assert "lesson" in data, "Should have lesson object"
        assert "content" in data["lesson"], "Should have full content"
        
        log("✅ Lesson full content as subscribed user passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson full content as subscribed user failed: {str(e)}", "FAIL")
        return False

def test_search_enriched():
    """Test 16: Search returns enriched results with className, bookName, chapterName"""
    log("Testing search with enriched data...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/search?q=Jasmine")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "results" in data, "Response should contain results"
        results = data["results"]
        
        # Check enriched fields
        if results:
            result = results[0]
            assert "className" in result, "Results should have className"
            assert "bookName" in result, "Results should have bookName (not subjectName)"
            assert "chapterName" in result, "Results should have chapterName"
            assert "subjectName" not in result, "Results should NOT have subjectName"
        
        log(f"✅ Search enriched passed ({len(results)} results found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Search enriched failed: {str(e)}", "FAIL")
        return False

def test_search_numbers():
    """Test 17: Search for Numbers"""
    log("Testing search for Numbers...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/search?q=Numbers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "results" in data, "Response should contain results"
        
        log(f"✅ Search Numbers passed ({len(data['results'])} results found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Search Numbers failed: {str(e)}", "FAIL")
        return False

def test_bulk_import_without_admin():
    """Test 18: Bulk import without admin token returns 403"""
    log("Testing bulk import without admin token...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(f"{BASE_URL}/admin/bulk-import", 
            headers=headers,
            json={"rows": []})
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        log("✅ Bulk import without admin passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Bulk import without admin failed: {str(e)}", "FAIL")
        return False

def test_bulk_import_with_admin():
    """Test 19: Bulk import with admin token creates books/chapters/lessons"""
    log("Testing bulk import with admin token...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Prepare test data
        rows = [
            {
                "className": "Class 7",
                "bookName": "Jasmine",
                "chapterName": "Test Chapter Bulk",
                "chapterOrder": 1,
                "period": 1,
                "title": "Test Lesson 1 from Bulk",
                "content": "<p>Test content for lesson 1</p>",
                "teacherNotes": "Test notes",
                "tlm": ["TLM1", "TLM2"],
                "learningOutcomes": ["LO1"],
                "loCodes": ["C7-E-1.1"],
                "assessmentQuestions": ["Q1?", "Q2?"]
            },
            {
                "className": "Class 7",
                "bookName": "Jasmine",
                "chapterName": "Test Chapter Bulk",
                "period": 2,
                "title": "Test Lesson 2 from Bulk",
                "content": "<p>Test content for lesson 2</p>"
            },
            {
                "className": "NonExistentClass",
                "bookName": "X",
                "chapterName": "Y",
                "period": 1,
                "title": "Should fail"
            }
        ]
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import", 
            headers=headers,
            json={"rows": rows})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "rows" in data, "Should have rows count"
        assert data["rows"] == 3, f"Should process 3 rows, got {data['rows']}"
        assert "booksCreated" in data, "Should have booksCreated count"
        assert "chaptersCreated" in data, "Should have chaptersCreated count"
        assert "lessonsCreated" in data, "Should have lessonsCreated count"
        assert "errors" in data, "Should have errors array"
        
        # Should create 2 lessons successfully
        assert data["lessonsCreated"] == 2, f"Should create 2 lessons, got {data['lessonsCreated']}"
        
        # Should have 1 error for NonExistentClass
        assert len(data["errors"]) == 1, f"Should have 1 error, got {len(data['errors'])}"
        assert "NonExistentClass" in data["errors"][0], "Error should mention NonExistentClass"
        
        log(f"✅ Bulk import passed (created {data['lessonsCreated']} lessons, {len(data['errors'])} errors)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Bulk import with admin failed: {str(e)}", "FAIL")
        return False

def test_bulk_import_no_duplicates():
    """Test 20: Re-running bulk import should not duplicate"""
    log("Testing bulk import no duplicates...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Run same import again
        rows = [
            {
                "className": "Class 7",
                "bookName": "Jasmine",
                "chapterName": "Test Chapter Bulk",
                "period": 1,
                "title": "Test Lesson 1 from Bulk",
                "content": "<p>Test content for lesson 1</p>"
            }
        ]
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import", 
            headers=headers,
            json={"rows": rows})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should create lesson but not duplicate book/chapter
        assert data["booksCreated"] == 0, f"Should not create duplicate book, got {data['booksCreated']}"
        assert data["chaptersCreated"] == 0, f"Should not create duplicate chapter, got {data['chaptersCreated']}"
        
        log("✅ Bulk import no duplicates passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Bulk import no duplicates failed: {str(e)}", "FAIL")
        return False

def test_favorites_add_without_auth():
    """Test 21: Add favorite without auth returns 401"""
    log("Testing add favorite without auth...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        response = requests.post(f"{BASE_URL}/me/favorites", 
            json={"lessonId": lesson_ids[0], "add": True})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        log("✅ Add favorite without auth passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Add favorite without auth failed: {str(e)}", "FAIL")
        return False

def test_favorites_add():
    """Test 22: Add favorite as subscribed user"""
    log("Testing add favorite as subscribed user...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        headers = {"Authorization": f"Bearer {subscribed_user_token}"}
        response = requests.post(f"{BASE_URL}/me/favorites", 
            headers=headers,
            json={"lessonId": lesson_ids[0], "add": True})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "favorites" in data, "Should return favorites array"
        assert lesson_ids[0] in data["favorites"], "Should include added lesson"
        
        log("✅ Add favorite passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Add favorite failed: {str(e)}", "FAIL")
        return False

def test_favorites_get():
    """Test 23: Get favorites returns enriched lessons"""
    log("Testing get favorites...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {subscribed_user_token}"}
        response = requests.get(f"{BASE_URL}/me/favorites", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "lessons" in data, "Should return lessons array"
        lessons = data["lessons"]
        
        if lessons:
            lesson = lessons[0]
            assert "className" in lesson, "Should have className"
            assert "bookName" in lesson, "Should have bookName"
        
        log(f"✅ Get favorites passed ({len(lessons)} favorites found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Get favorites failed: {str(e)}", "FAIL")
        return False

def test_favorites_remove():
    """Test 24: Remove favorite"""
    log("Testing remove favorite...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        headers = {"Authorization": f"Bearer {subscribed_user_token}"}
        response = requests.post(f"{BASE_URL}/me/favorites", 
            headers=headers,
            json={"lessonId": lesson_ids[0], "add": False})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "favorites" in data, "Should return favorites array"
        assert lesson_ids[0] not in data["favorites"], "Should not include removed lesson"
        
        log("✅ Remove favorite passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Remove favorite failed: {str(e)}", "FAIL")
        return False

def test_recent_lessons():
    """Test 25: Get recent lessons after viewing"""
    log("Testing recent lessons...", "TEST")
    try:
        if not lesson_ids:
            log("⚠️ No lessons found, skipping", "WARN")
            return True
        
        # View a lesson first
        headers = {"Authorization": f"Bearer {subscribed_user_token}"}
        lesson_id = lesson_ids[0]
        requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
        
        # Get recent lessons
        response = requests.get(f"{BASE_URL}/me/recent", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "lessons" in data, "Should return lessons array"
        lessons = data["lessons"]
        
        # Should include the viewed lesson at the top
        if lessons:
            assert lessons[0]["id"] == lesson_id, "Most recent lesson should be at top"
            assert "className" in lessons[0], "Should have className"
            assert "bookName" in lessons[0], "Should have bookName"
        
        log(f"✅ Recent lessons passed ({len(lessons)} recent lessons found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Recent lessons failed: {str(e)}", "FAIL")
        return False

def test_admin_analytics_enhanced():
    """Test 26: Admin analytics includes enhanced fields"""
    log("Testing admin analytics enhanced...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/analytics", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check for all required fields
        assert "totalUsers" in data, "Should have totalUsers"
        assert "activeSubs" in data, "Should have activeSubs"
        assert "totalLessons" in data, "Should have totalLessons"
        assert "totalChapters" in data, "Should have totalChapters"
        assert "totalBooks" in data, "Should have totalBooks (NEW)"
        assert "revenue" in data, "Should have revenue"
        assert "payments" in data, "Should have payments"
        assert "dau" in data, "Should have dau (NEW)"
        assert "popularLessons" in data, "Should have popularLessons (NEW)"
        assert "popularBooks" in data, "Should have popularBooks (NEW)"
        
        # Verify types
        assert isinstance(data["totalBooks"], int), "totalBooks should be number"
        assert isinstance(data["dau"], int), "dau should be number"
        assert isinstance(data["popularLessons"], list), "popularLessons should be array"
        assert isinstance(data["popularBooks"], list), "popularBooks should be array"
        
        # Verify popularLessons structure
        if data["popularLessons"]:
            lesson = data["popularLessons"][0]
            assert "count" in lesson, "Popular lesson should have count"
            assert "id" in lesson, "Popular lesson should have id"
            assert "title" in lesson, "Popular lesson should have title"
        
        # Verify popularBooks structure
        if data["popularBooks"]:
            book = data["popularBooks"][0]
            assert "count" in book, "Popular book should have count"
            assert "id" in book, "Popular book should have id"
            assert "name" in book, "Popular book should have name"
        
        log(f"✅ Admin analytics enhanced passed (Books: {data['totalBooks']}, DAU: {data['dau']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin analytics enhanced failed: {str(e)}", "FAIL")
        return False

def test_admin_add_book():
    """Test 27: Admin add book"""
    log("Testing admin add book...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        class_id = list(class_ids.values())[0]
        response = requests.post(f"{BASE_URL}/admin/books",
            headers=headers,
            json={
                "classId": class_id,
                "name": "Test Book from API"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "book" in data, "Should return book object"
        book = data["book"]
        assert "id" in book, "Book should have id"
        assert book["name"] == "Test Book from API", "Book name should match"
        assert "emoji" in book, "Book should have emoji"
        assert "color" in book, "Book should have color"
        
        log("✅ Admin add book passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin add book failed: {str(e)}", "FAIL")
        return False

def test_admin_add_book_no_duplicate():
    """Test 28: Admin add book with same name returns existing"""
    log("Testing admin add book no duplicate...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        class_id = list(class_ids.values())[0]
        response = requests.post(f"{BASE_URL}/admin/books",
            headers=headers,
            json={
                "classId": class_id,
                "name": "Test Book from API"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should return existing book
        assert "book" in data, "Should return book object"
        
        log("✅ Admin add book no duplicate passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin add book no duplicate failed: {str(e)}", "FAIL")
        return False

def test_admin_add_chapter():
    """Test 29: Admin add chapter"""
    log("Testing admin add chapter...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        class_id = list(class_ids.values())[0]
        book_id = list(book_ids.values())[0]
        
        response = requests.post(f"{BASE_URL}/admin/chapters",
            headers=headers,
            json={
                "classId": class_id,
                "bookId": book_id,
                "name": "Test Chapter from API"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "chapter" in data, "Should return chapter object"
        chapter = data["chapter"]
        assert "id" in chapter, "Chapter should have id"
        assert chapter["name"] == "Test Chapter from API", "Chapter name should match"
        
        log("✅ Admin add chapter passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin add chapter failed: {str(e)}", "FAIL")
        return False

def test_admin_add_chapter_no_duplicate():
    """Test 30: Admin add chapter with same name returns existing"""
    log("Testing admin add chapter no duplicate...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        class_id = list(class_ids.values())[0]
        book_id = list(book_ids.values())[0]
        
        response = requests.post(f"{BASE_URL}/admin/chapters",
            headers=headers,
            json={
                "classId": class_id,
                "bookId": book_id,
                "name": "Test Chapter from API"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should return existing chapter
        assert "chapter" in data, "Should return chapter object"
        
        log("✅ Admin add chapter no duplicate passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin add chapter no duplicate failed: {str(e)}", "FAIL")
        return False

def run_all_tests():
    """Run all backend tests"""
    log("=" * 80, "INFO")
    log("EduMaster Odisha Premium - REFACTORED Backend Test Suite", "INFO")
    log("Testing Class → Book → Chapter → Period hierarchy", "INFO")
    log(f"Base URL: {BASE_URL}", "INFO")
    log("=" * 80, "INFO")
    
    tests = [
        ("Health Check", test_health_check),
        ("Admin Login", test_admin_login),
        ("Register Regular User", test_register_regular_user),
        ("Register Subscribed User", test_register_subscribed_user),
        ("Get Classes", test_get_classes),
        
        # BOOKS (replaces /subjects)
        ("Subjects Endpoint Gone", test_subjects_endpoint_gone),
        ("Get All Books", test_get_all_books),
        ("Get Books for Class 6", test_get_books_for_class6),
        ("Get Books for Class 10", test_get_books_for_class10),
        
        # UPDATED CHAPTERS/LESSONS
        ("Get Chapters by Book", test_get_chapters_by_book),
        ("Get Lessons by Book", test_get_lessons_by_book),
        
        # LESSON DETAIL with PREVIEW MODE
        ("Lesson Preview Without Auth", test_lesson_preview_without_auth),
        ("Lesson Preview Without Subscription", test_lesson_preview_without_subscription),
        ("Lesson Full as Admin", test_lesson_full_as_admin),
        ("Lesson Full as Subscribed User", test_lesson_full_as_subscribed_user),
        
        # SEARCH (enriched)
        ("Search Enriched", test_search_enriched),
        ("Search Numbers", test_search_numbers),
        
        # BULK IMPORT
        ("Bulk Import Without Admin", test_bulk_import_without_admin),
        ("Bulk Import With Admin", test_bulk_import_with_admin),
        ("Bulk Import No Duplicates", test_bulk_import_no_duplicates),
        
        # FAVORITES & RECENT
        ("Favorites Add Without Auth", test_favorites_add_without_auth),
        ("Favorites Add", test_favorites_add),
        ("Favorites Get", test_favorites_get),
        ("Favorites Remove", test_favorites_remove),
        ("Recent Lessons", test_recent_lessons),
        
        # ADMIN ANALYTICS (enhanced)
        ("Admin Analytics Enhanced", test_admin_analytics_enhanced),
        
        # ADMIN ADD BOOK/CHAPTER
        ("Admin Add Book", test_admin_add_book),
        ("Admin Add Book No Duplicate", test_admin_add_book_no_duplicate),
        ("Admin Add Chapter", test_admin_add_chapter),
        ("Admin Add Chapter No Duplicate", test_admin_add_chapter_no_duplicate),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            log(f"❌ Test '{name}' crashed: {str(e)}", "FAIL")
            failed += 1
    
    log("=" * 80, "INFO")
    log(f"Test Results: {passed} passed, {failed} failed out of {len(tests)} total", "INFO")
    log(f"Success Rate: {(passed/len(tests)*100):.1f}%", "INFO")
    log("=" * 80, "INFO")
    
    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
