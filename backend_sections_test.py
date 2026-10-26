#!/usr/bin/env python3
"""
Backend API Test Suite for Sections Upload (Assessment/Activities/Questions/Project)
Tests all sections endpoints with proper validation
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
LEGACY_ADMIN_MOBILE = "9999999999"
LEGACY_ADMIN_PASSWORD = "admin123"

# Global variables for test state
admin_token = None
non_admin_token = None
test_class_id = None
test_book_id = None
test_chapter_id = None
test_lesson_id = None
created_section_ids = []

def log(message, status="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{status}] {message}")

def test_admin_login():
    """Test: Admin login"""
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
        admin_token = data["token"]
        log(f"✅ Admin login passed (token: {admin_token[:20]}...)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin login failed: {str(e)}", "FAIL")
        return False

def test_get_test_data():
    """Test: Get test data (class, book, chapter, lesson IDs)"""
    global test_class_id, test_book_id, test_chapter_id, test_lesson_id
    log("Getting test data (class, book, chapter, lesson)...", "TEST")
    try:
        # Get classes
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        classes = response.json().get("classes", [])
        assert len(classes) >= 11, f"Expected at least 11 classes, got {len(classes)}"
        
        # Find Balvatika class
        balvatika = next((c for c in classes if "Balvatika" in c.get("name", "")), None)
        assert balvatika, "Balvatika class not found"
        test_class_id = balvatika["id"]
        log(f"  Found class: {balvatika['name']} (id: {test_class_id})", "INFO")
        
        # Get books for this class
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        books = response.json().get("books", [])
        assert len(books) > 0, "No books found for Balvatika"
        test_book_id = books[0]["id"]
        log(f"  Found book: {books[0]['name']} (id: {test_book_id})", "INFO")
        
        # Get chapters for this book
        response = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        chapters = response.json().get("chapters", [])
        assert len(chapters) > 0, "No chapters found for book"
        test_chapter_id = chapters[0]["id"]
        log(f"  Found chapter: {chapters[0]['name']} (id: {test_chapter_id})", "INFO")
        
        # Get lessons for this chapter
        response = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        lessons = response.json().get("lessons", [])
        assert len(lessons) > 0, "No lessons found for chapter"
        test_lesson_id = lessons[0]["id"]
        log(f"  Found lesson: {lessons[0]['title']} (id: {test_lesson_id})", "INFO")
        
        log("✅ Test data retrieved successfully", "PASS")
        return True
    except Exception as e:
        log(f"❌ Failed to get test data: {str(e)}", "FAIL")
        return False

def test_create_section_assessment():
    """Test: POST /api/admin/sections - Create assessment section"""
    global created_section_ids
    log("Testing POST /api/admin/sections (assessment)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "assessment",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "period": 1,
                "title": "Assessment Questions",
                "contentHtml": "<h3>Assessment Questions</h3><ol><li>What is 2+2?</li><li>Name three colors.</li></ol>"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Response should have ok:true"
        assert data.get("action") == "created", f"Expected action='created', got {data.get('action')}"
        assert "id" in data, "Response should contain id"
        created_section_ids.append(data["id"])
        log(f"✅ Assessment section created (id: {data['id']}, action: {data['action']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Failed to create assessment section: {str(e)}", "FAIL")
        return False

def test_create_section_activities():
    """Test: POST /api/admin/sections - Create activities section"""
    global created_section_ids
    log("Testing POST /api/admin/sections (activities)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "activities",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "period": 1,
                "title": "Learning Activities",
                "contentHtml": "<h3>Activities</h3><ul><li>Draw a picture</li><li>Sing a song</li></ul>"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Response should have ok:true"
        assert data.get("action") == "created", f"Expected action='created', got {data.get('action')}"
        assert "id" in data, "Response should contain id"
        created_section_ids.append(data["id"])
        log(f"✅ Activities section created (id: {data['id']}, action: {data['action']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Failed to create activities section: {str(e)}", "FAIL")
        return False

def test_create_section_questions():
    """Test: POST /api/admin/sections - Create questions section"""
    global created_section_ids
    log("Testing POST /api/admin/sections (questions)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "questions",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "period": 1,
                "title": "Question Bank",
                "contentHtml": "<h3>Question Bank</h3><ol><li>MCQ: What is the capital of Odisha?</li><li>Short answer: Explain photosynthesis.</li></ol>"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Response should have ok:true"
        assert data.get("action") == "created", f"Expected action='created', got {data.get('action')}"
        assert "id" in data, "Response should contain id"
        created_section_ids.append(data["id"])
        log(f"✅ Questions section created (id: {data['id']}, action: {data['action']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Failed to create questions section: {str(e)}", "FAIL")
        return False

def test_create_section_project():
    """Test: POST /api/admin/sections - Create project section"""
    global created_section_ids
    log("Testing POST /api/admin/sections (project)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "project",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "period": 1,
                "title": "Project Work",
                "contentHtml": "<h3>Project Work</h3><p>Create a model of the solar system using household items.</p>"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Response should have ok:true"
        assert data.get("action") == "created", f"Expected action='created', got {data.get('action')}"
        assert "id" in data, "Response should contain id"
        created_section_ids.append(data["id"])
        log(f"✅ Project section created (id: {data['id']}, action: {data['action']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Failed to create project section: {str(e)}", "FAIL")
        return False

def test_upsert_idempotency():
    """Test: POST /api/admin/sections - Upsert idempotency (update existing)"""
    log("Testing POST /api/admin/sections (upsert/update)...", "TEST")
    try:
        # Post same section again with different content
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "assessment",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "period": 1,
                "title": "Updated Assessment Questions",
                "contentHtml": "<h3>Updated Assessment</h3><ol><li>What is 5+5?</li><li>Name five animals.</li></ol>"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Response should have ok:true"
        assert data.get("action") == "updated", f"Expected action='updated', got {data.get('action')}"
        assert "id" in data, "Response should contain id"
        
        # Verify the content was updated
        response = requests.get(f"{BASE_URL}/admin/sections?lessonId={test_lesson_id}&section=assessment",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        sections = response.json().get("sections", [])
        assert len(sections) > 0, "Should have at least one section"
        updated_section = sections[0]
        assert "Updated Assessment" in updated_section.get("contentHtml", ""), "Content should be updated"
        
        log(f"✅ Upsert idempotency passed (id: {data['id']}, action: {data['action']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Upsert idempotency failed: {str(e)}", "FAIL")
        return False

def test_invalid_section_type():
    """Test: POST /api/admin/sections - Invalid section type"""
    log("Testing POST /api/admin/sections (invalid section)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "foo",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "contentHtml": "<p>Test</p>"
            })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        assert "assessment" in data["error"].lower() or "allowed" in data["error"].lower(), "Error should mention allowed sections"
        log("✅ Invalid section type validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Invalid section type validation failed: {str(e)}", "FAIL")
        return False

def test_missing_required_ids():
    """Test: POST /api/admin/sections - Missing required IDs"""
    log("Testing POST /api/admin/sections (missing IDs)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "assessment",
                "classId": "",
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "contentHtml": "<p>Test</p>"
            })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        log("✅ Missing required IDs validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Missing required IDs validation failed: {str(e)}", "FAIL")
        return False

def test_invalid_ids():
    """Test: POST /api/admin/sections - Invalid IDs"""
    log("Testing POST /api/admin/sections (invalid IDs)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "assessment",
                "classId": "does-not-exist",
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "contentHtml": "<p>Test</p>"
            })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        log("✅ Invalid IDs validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Invalid IDs validation failed: {str(e)}", "FAIL")
        return False

def test_empty_content_html():
    """Test: POST /api/admin/sections - Empty contentHtml"""
    log("Testing POST /api/admin/sections (empty contentHtml)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "section": "assessment",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "contentHtml": ""
            })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        log("✅ Empty contentHtml validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Empty contentHtml validation failed: {str(e)}", "FAIL")
        return False

def test_get_admin_sections_all():
    """Test: GET /api/admin/sections - List all sections"""
    log("Testing GET /api/admin/sections (all)...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/admin/sections",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "sections" in data, "Response should contain sections"
        sections = data["sections"]
        assert len(sections) >= 4, f"Expected at least 4 sections, got {len(sections)}"
        log(f"✅ GET /api/admin/sections passed (found {len(sections)} sections)", "PASS")
        return True
    except Exception as e:
        log(f"❌ GET /api/admin/sections failed: {str(e)}", "FAIL")
        return False

def test_get_admin_sections_filter_by_section():
    """Test: GET /api/admin/sections - Filter by section type"""
    log("Testing GET /api/admin/sections?section=assessment...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/admin/sections?section=assessment",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        sections = data.get("sections", [])
        assert len(sections) >= 1, f"Expected at least 1 assessment section, got {len(sections)}"
        for section in sections:
            assert section.get("section") == "assessment", f"Expected section='assessment', got {section.get('section')}"
        log(f"✅ Filter by section passed (found {len(sections)} assessment sections)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Filter by section failed: {str(e)}", "FAIL")
        return False

def test_get_admin_sections_filter_by_lesson():
    """Test: GET /api/admin/sections - Filter by lessonId"""
    log("Testing GET /api/admin/sections?lessonId=...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/admin/sections?lessonId={test_lesson_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        sections = data.get("sections", [])
        assert len(sections) >= 4, f"Expected at least 4 sections for lesson, got {len(sections)}"
        for section in sections:
            assert section.get("lessonId") == test_lesson_id, f"Expected lessonId={test_lesson_id}, got {section.get('lessonId')}"
        log(f"✅ Filter by lessonId passed (found {len(sections)} sections)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Filter by lessonId failed: {str(e)}", "FAIL")
        return False

def test_get_admin_sections_filter_by_chapter():
    """Test: GET /api/admin/sections - Filter by chapterId"""
    log("Testing GET /api/admin/sections?chapterId=...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/admin/sections?chapterId={test_chapter_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        sections = data.get("sections", [])
        assert len(sections) >= 4, f"Expected at least 4 sections for chapter, got {len(sections)}"
        for section in sections:
            assert section.get("chapterId") == test_chapter_id, f"Expected chapterId={test_chapter_id}, got {section.get('chapterId')}"
        log(f"✅ Filter by chapterId passed (found {len(sections)} sections)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Filter by chapterId failed: {str(e)}", "FAIL")
        return False

def test_get_public_sections_without_auth():
    """Test: GET /api/sections - Without auth (should fail)"""
    log("Testing GET /api/sections (without auth)...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/sections")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        log("✅ GET /api/sections without auth correctly returns 401", "PASS")
        return True
    except Exception as e:
        log(f"❌ GET /api/sections without auth failed: {str(e)}", "FAIL")
        return False

def test_register_non_admin_user():
    """Test: Register a non-admin user for testing"""
    global non_admin_token
    log("Registering non-admin user...", "TEST")
    try:
        test_mobile = f"88{datetime.now().strftime('%H%M%S%f')[:8]}"
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": test_mobile,
            "password": "test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        non_admin_token = data["token"]
        log(f"✅ Non-admin user registered (mobile: {test_mobile})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Non-admin user registration failed: {str(e)}", "FAIL")
        return False

def test_get_public_sections_with_non_admin():
    """Test: GET /api/sections - With non-admin user (should work)"""
    log("Testing GET /api/sections (with non-admin user)...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/sections?lessonId={test_lesson_id}",
            headers={"Authorization": f"Bearer {non_admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "sections" in data, "Response should contain sections"
        sections = data["sections"]
        assert len(sections) >= 4, f"Expected at least 4 sections, got {len(sections)}"
        log(f"✅ GET /api/sections with non-admin user passed (found {len(sections)} sections)", "PASS")
        return True
    except Exception as e:
        log(f"❌ GET /api/sections with non-admin user failed: {str(e)}", "FAIL")
        return False

def test_delete_section():
    """Test: DELETE /api/admin/sections/{id} - Delete a section"""
    log("Testing DELETE /api/admin/sections/{id}...", "TEST")
    try:
        # Get the first created section ID
        section_id = created_section_ids[0] if created_section_ids else None
        assert section_id, "No section ID available for deletion"
        
        response = requests.delete(f"{BASE_URL}/admin/sections/{section_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Response should have ok:true"
        log(f"✅ DELETE section passed (id: {section_id})", "PASS")
        return True
    except Exception as e:
        log(f"❌ DELETE section failed: {str(e)}", "FAIL")
        return False

def test_delete_section_not_found():
    """Test: DELETE /api/admin/sections/{id} - Delete same section again (should fail)"""
    log("Testing DELETE /api/admin/sections/{id} (not found)...", "TEST")
    try:
        section_id = created_section_ids[0] if created_section_ids else None
        assert section_id, "No section ID available"
        
        response = requests.delete(f"{BASE_URL}/admin/sections/{section_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        log("✅ DELETE section not found correctly returns 404", "PASS")
        return True
    except Exception as e:
        log(f"❌ DELETE section not found failed: {str(e)}", "FAIL")
        return False

def test_delete_section_non_admin():
    """Test: DELETE /api/admin/sections/{id} - Non-admin user (should fail)"""
    log("Testing DELETE /api/admin/sections/{id} (non-admin)...", "TEST")
    try:
        section_id = created_section_ids[1] if len(created_section_ids) > 1 else None
        assert section_id, "No section ID available"
        
        response = requests.delete(f"{BASE_URL}/admin/sections/{section_id}",
            headers={"Authorization": f"Bearer {non_admin_token}"})
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error message"
        log("✅ DELETE section with non-admin correctly returns 403", "PASS")
        return True
    except Exception as e:
        log(f"❌ DELETE section with non-admin failed: {str(e)}", "FAIL")
        return False

def test_admin_sections_without_auth():
    """Test: POST /api/admin/sections - Without auth (should fail)"""
    log("Testing POST /api/admin/sections (without auth)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections", json={
            "section": "assessment",
            "classId": test_class_id,
            "bookId": test_book_id,
            "chapterId": test_chapter_id,
            "lessonId": test_lesson_id,
            "contentHtml": "<p>Test</p>"
        })
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        log("✅ POST /api/admin/sections without auth correctly returns 401/403", "PASS")
        return True
    except Exception as e:
        log(f"❌ POST /api/admin/sections without auth failed: {str(e)}", "FAIL")
        return False

def test_admin_sections_non_admin():
    """Test: POST /api/admin/sections - Non-admin user (should fail)"""
    log("Testing POST /api/admin/sections (non-admin)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/admin/sections",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            json={
                "section": "assessment",
                "classId": test_class_id,
                "bookId": test_book_id,
                "chapterId": test_chapter_id,
                "lessonId": test_lesson_id,
                "contentHtml": "<p>Test</p>"
            })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        log("✅ POST /api/admin/sections with non-admin correctly returns 403", "PASS")
        return True
    except Exception as e:
        log(f"❌ POST /api/admin/sections with non-admin failed: {str(e)}", "FAIL")
        return False

def test_template_lesson_plan():
    """Test: GET /templates/lesson-plan-template.html"""
    log("Testing GET /templates/lesson-plan-template.html...", "TEST")
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/templates/lesson-plan-template.html")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/html" in response.headers.get("content-type", "").lower(), "Content-Type should be text/html"
        assert len(response.content) > 1000, f"Expected size > 1000 bytes, got {len(response.content)}"
        log(f"✅ Lesson plan template accessible (size: {len(response.content)} bytes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson plan template failed: {str(e)}", "FAIL")
        return False

def test_template_section_assessment():
    """Test: GET /templates/section-assessment-template.html"""
    log("Testing GET /templates/section-assessment-template.html...", "TEST")
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/templates/section-assessment-template.html")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, f"Expected size > 1000 bytes, got {len(response.content)}"
        log(f"✅ Assessment template accessible (size: {len(response.content)} bytes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Assessment template failed: {str(e)}", "FAIL")
        return False

def test_template_section_activities():
    """Test: GET /templates/section-activities-template.html"""
    log("Testing GET /templates/section-activities-template.html...", "TEST")
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/templates/section-activities-template.html")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, f"Expected size > 1000 bytes, got {len(response.content)}"
        log(f"✅ Activities template accessible (size: {len(response.content)} bytes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Activities template failed: {str(e)}", "FAIL")
        return False

def test_template_section_questions():
    """Test: GET /templates/section-questions-template.html"""
    log("Testing GET /templates/section-questions-template.html...", "TEST")
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/templates/section-questions-template.html")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, f"Expected size > 1000 bytes, got {len(response.content)}"
        log(f"✅ Questions template accessible (size: {len(response.content)} bytes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Questions template failed: {str(e)}", "FAIL")
        return False

def test_template_section_project():
    """Test: GET /templates/section-project-template.html"""
    log("Testing GET /templates/section-project-template.html...", "TEST")
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/templates/section-project-template.html")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, f"Expected size > 1000 bytes, got {len(response.content)}"
        log(f"✅ Project template accessible (size: {len(response.content)} bytes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Project template failed: {str(e)}", "FAIL")
        return False

def test_regression_settings_public():
    """Test: Regression - GET /api/settings/public"""
    log("Testing regression: GET /api/settings/public...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/settings/public")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "showPrint" in data, "Response should contain showPrint"
        assert "showPdf" in data, "Response should contain showPdf"
        assert "showWord" in data, "Response should contain showWord"
        assert "showWatermark" in data, "Response should contain showWatermark"
        log("✅ Regression: GET /api/settings/public passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression: GET /api/settings/public failed: {str(e)}", "FAIL")
        return False

def test_regression_admin_login():
    """Test: Regression - Admin login"""
    log("Testing regression: Admin login...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        log("✅ Regression: Admin login passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression: Admin login failed: {str(e)}", "FAIL")
        return False

def test_regression_get_classes():
    """Test: Regression - GET /api/classes"""
    log("Testing regression: GET /api/classes...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        classes = data.get("classes", [])
        assert len(classes) >= 11, f"Expected at least 11 classes, got {len(classes)}"
        log(f"✅ Regression: GET /api/classes passed ({len(classes)} classes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression: GET /api/classes failed: {str(e)}", "FAIL")
        return False

def cleanup_test_sections():
    """Cleanup: Delete remaining test sections"""
    log("Cleaning up test sections...", "INFO")
    try:
        for section_id in created_section_ids[1:]:  # Skip first one (already deleted)
            try:
                response = requests.delete(f"{BASE_URL}/admin/sections/{section_id}",
                    headers={"Authorization": f"Bearer {admin_token}"})
                if response.status_code == 200:
                    log(f"  Deleted section: {section_id}", "INFO")
            except:
                pass
        log("✅ Cleanup completed", "INFO")
        return True
    except Exception as e:
        log(f"⚠ Cleanup failed: {str(e)}", "WARN")
        return False

def main():
    """Run all tests"""
    log("=" * 80, "INFO")
    log("SECTIONS UPLOAD API TEST SUITE", "INFO")
    log("=" * 80, "INFO")
    
    tests = [
        # Setup
        ("Admin Login", test_admin_login),
        ("Get Test Data", test_get_test_data),
        
        # Create sections (all 4 types)
        ("Create Assessment Section", test_create_section_assessment),
        ("Create Activities Section", test_create_section_activities),
        ("Create Questions Section", test_create_section_questions),
        ("Create Project Section", test_create_section_project),
        
        # Upsert/Update
        ("Upsert Idempotency", test_upsert_idempotency),
        
        # Validation tests
        ("Invalid Section Type", test_invalid_section_type),
        ("Missing Required IDs", test_missing_required_ids),
        ("Invalid IDs", test_invalid_ids),
        ("Empty Content HTML", test_empty_content_html),
        
        # Admin GET tests
        ("GET Admin Sections (All)", test_get_admin_sections_all),
        ("GET Admin Sections (Filter by Section)", test_get_admin_sections_filter_by_section),
        ("GET Admin Sections (Filter by Lesson)", test_get_admin_sections_filter_by_lesson),
        ("GET Admin Sections (Filter by Chapter)", test_get_admin_sections_filter_by_chapter),
        
        # Public GET tests
        ("GET Public Sections (Without Auth)", test_get_public_sections_without_auth),
        ("Register Non-Admin User", test_register_non_admin_user),
        ("GET Public Sections (With Non-Admin)", test_get_public_sections_with_non_admin),
        
        # DELETE tests
        ("DELETE Section", test_delete_section),
        ("DELETE Section (Not Found)", test_delete_section_not_found),
        ("DELETE Section (Non-Admin)", test_delete_section_non_admin),
        
        # Auth gating tests
        ("POST Admin Sections (Without Auth)", test_admin_sections_without_auth),
        ("POST Admin Sections (Non-Admin)", test_admin_sections_non_admin),
        
        # Template tests
        ("GET Lesson Plan Template", test_template_lesson_plan),
        ("GET Assessment Template", test_template_section_assessment),
        ("GET Activities Template", test_template_section_activities),
        ("GET Questions Template", test_template_section_questions),
        ("GET Project Template", test_template_section_project),
        
        # Regression tests
        ("Regression: GET /api/settings/public", test_regression_settings_public),
        ("Regression: Admin Login", test_regression_admin_login),
        ("Regression: GET /api/classes", test_regression_get_classes),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            log(f"❌ Test '{test_name}' crashed: {str(e)}", "FAIL")
            failed += 1
    
    # Cleanup
    cleanup_test_sections()
    
    log("=" * 80, "INFO")
    log(f"TEST RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests", "INFO")
    log("=" * 80, "INFO")
    
    if failed > 0:
        sys.exit(1)
    else:
        log("✅ ALL TESTS PASSED!", "PASS")
        sys.exit(0)

if __name__ == "__main__":
    main()
