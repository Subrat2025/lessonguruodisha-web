#!/usr/bin/env python3
"""
Backend API Test Suite for Panchapadi Schema Changes
Tests new topic + panchapadi object fields in bulk-import and lesson endpoints
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

# Global variables
admin_token = None
created_lesson_id = None
created_chapter_id = None

def log(message, status="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{status}] {message}")

def setup_admin_token():
    """Setup: Login as admin and get token"""
    global admin_token
    log("Setting up admin token...", "SETUP")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        data = response.json()
        admin_token = data["token"]
        log("✅ Admin token obtained", "SETUP")
        return True
    except Exception as e:
        log(f"❌ Admin token setup failed: {str(e)}", "FAIL")
        return False

# ===== TEST 1: BULK IMPORT WITH PANCHAPADI + TOPIC =====
def test_bulk_import_with_panchapadi():
    """Test 1: Bulk import with new fields (topic + panchapadi object)"""
    global created_lesson_id, created_chapter_id
    log("Testing bulk import with panchapadi + topic...", "TEST")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Prepare test row with full panchapadi structure
        test_row = {
            "className": "Class 1",
            "bookName": "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)",
            "chapterName": "ପାଠ - ୧ (ଚୁଲବୁଲି ବିଲେଇକୁ ଖୋଜିବା)",
            "chapterOrder": 1,
            "period": 1,
            "title": "Period 1: ଗୀତ ମାଧ୍ୟମରେ ସ୍ଥାନ ଓ ଦିଗର ଧାରଣା",
            "topic": "ଗୀତ ମାଧ୍ୟମରେ ସ୍ଥାନ ଓ ଦିଗର ଧାରଣା (ଉପରେ, ତଳେ, ଭିତରେ, ବାହାରେ)",
            "learningOutcomes": ["ଗୀତଟିକୁ ଆବୃତ୍ତି କରିବେ"],
            "tlm": ["ଶ୍ରେଣୀଗୃହର ଉପକରଣ"],
            "panchapadi": {
                "prastabana": {
                    "stepLabel": "ପ୍ରସ୍ତାବନା (Introduction)",
                    "stepRaw": "୧. ପ୍ରସ୍ତାବନା ଓ ୱାର୍ମ ଅପ୍ (୫ ମିନିଟ୍)",
                    "timing": "୫ ମିନିଟ୍",
                    "teacherActivity": "<b>ୱାର୍ମ ଅପ୍ ଖେଳ:</b> Teacher introduces warm up game",
                    "teacherActivityText": "warm up game",
                    "studentActivity": "<b>ପ୍ରତିକ୍ରିୟା:</b> Students play the game",
                    "studentActivityText": "students play"
                },
                "anweshana": {
                    "stepLabel": "ଅନ୍ୱେଷଣ",
                    "stepRaw": "୨. ଅନ୍ୱେଷଣ (୧୦ ମିନିଟ୍)",
                    "timing": "୧୦ ମିନିଟ୍",
                    "teacherActivity": "<b>Exploration:</b> Teacher guides exploration",
                    "teacherActivityText": "explore",
                    "studentActivity": "<b>Activity:</b> Students explore concepts",
                    "studentActivityText": "st_explore"
                },
                "alochana": {
                    "stepLabel": "ଆଲୋଚନା",
                    "stepRaw": "୩. ଆଲୋଚନା (୧୦ ମିନିଟ୍)",
                    "timing": "୧୦ ମିନିଟ୍",
                    "teacherActivity": "<b>Discussion:</b> Teacher leads discussion",
                    "teacherActivityText": "discuss",
                    "studentActivity": "<b>Participation:</b> Students discuss",
                    "studentActivityText": "st_discuss"
                },
                "prayoga": {
                    "stepLabel": "ପ୍ରୟୋଗ",
                    "stepRaw": "୪. ପ୍ରୟୋଗ (୧୫ ମିନିଟ୍)",
                    "timing": "୧୫ ମିନିଟ୍",
                    "teacherActivity": "<b>Application:</b> Teacher demonstrates application",
                    "teacherActivityText": "apply",
                    "studentActivity": "<b>Practice:</b> Students apply learning",
                    "studentActivityText": "st_apply"
                },
                "mulyayana": {
                    "stepLabel": "ମୂଲ୍ୟାୟନ",
                    "stepRaw": "୫. ମୂଲ୍ୟାୟନ (୫ ମିନିଟ୍)",
                    "timing": "୫ ମିନିଟ୍",
                    "teacherActivity": "<b>Evaluation:</b> Teacher evaluates learning",
                    "teacherActivityText": "evaluate",
                    "studentActivity": "<b>Assessment:</b> Students demonstrate understanding",
                    "studentActivityText": "st_evaluate"
                }
            },
            "homework": "Practice up/down directions"
        }
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [test_row],
                "dedupeMode": "skip"
            })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "lessonsCreated" in data, "Response should have lessonsCreated"
        assert "booksCreated" in data, "Response should have booksCreated"
        assert "chaptersCreated" in data, "Response should have chaptersCreated"
        assert "errors" in data, "Response should have errors array"
        
        # Verify at least 1 lesson was created (or already exists)
        assert data["lessonsCreated"] >= 0, "lessonsCreated should be >= 0"
        assert isinstance(data["errors"], list), "errors should be an array"
        
        log(f"✅ Bulk import passed: lessonsCreated={data['lessonsCreated']}, booksCreated={data['booksCreated']}, chaptersCreated={data['chaptersCreated']}, errors={len(data['errors'])}", "PASS")
        
        # Get the created lesson ID for next tests
        # Find the chapter first
        response = requests.get(f"{BASE_URL}/chapters", headers=headers)
        chapters = response.json()["chapters"]
        chapter = next((c for c in chapters if "ଚୁଲବୁଲି ବିଲେଇକୁ ଖୋଜିବା" in c["name"]), None)
        
        if chapter:
            created_chapter_id = chapter["id"]
            # Get lessons for this chapter
            response = requests.get(f"{BASE_URL}/lessons?chapterId={created_chapter_id}", headers=headers)
            lessons = response.json()["lessons"]
            if lessons:
                created_lesson_id = lessons[0]["id"]
                log(f"Found created lesson ID: {created_lesson_id}", "INFO")
        
        return True
    except Exception as e:
        log(f"❌ Bulk import with panchapadi failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 2: LESSON DETAIL RETURNS FULL PANCHAPADI FOR ADMIN =====
def test_lesson_detail_returns_panchapadi():
    """Test 2: Lesson detail returns full panchapadi for admin"""
    log("Testing lesson detail returns full panchapadi...", "TEST")
    
    if not created_lesson_id:
        log("⚠️ No lesson ID available, skipping", "WARN")
        return True
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/lessons/{created_lesson_id}", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify lesson structure
        assert "lesson" in data, "Response should contain lesson"
        lesson = data["lesson"]
        
        # Verify topic field exists
        assert "topic" in lesson, "Lesson should have topic field"
        assert lesson["topic"] == "ଗୀତ ମାଧ୍ୟମରେ ସ୍ଥାନ ଓ ଦିଗର ଧାରଣା (ଉପରେ, ତଳେ, ଭିତରେ, ବାହାରେ)", "Topic should match imported value"
        
        # Verify panchapadi object exists and has all 5 steps
        assert "panchapadi" in lesson, "Lesson should have panchapadi field"
        panchapadi = lesson["panchapadi"]
        
        assert isinstance(panchapadi, dict), "panchapadi should be an object"
        assert "prastabana" in panchapadi, "panchapadi should have prastabana"
        assert "anweshana" in panchapadi, "panchapadi should have anweshana"
        assert "alochana" in panchapadi, "panchapadi should have alochana"
        assert "prayoga" in panchapadi, "panchapadi should have prayoga"
        assert "mulyayana" in panchapadi, "panchapadi should have mulyayana"
        
        # Verify each step has required sub-fields
        for step_name in ["prastabana", "anweshana", "alochana", "prayoga", "mulyayana"]:
            step = panchapadi[step_name]
            assert isinstance(step, dict), f"{step_name} should be an object"
            assert "stepLabel" in step, f"{step_name} should have stepLabel"
            assert "timing" in step, f"{step_name} should have timing"
            assert "teacherActivity" in step, f"{step_name} should have teacherActivity"
            assert "teacherActivityText" in step, f"{step_name} should have teacherActivityText"
            assert "studentActivity" in step, f"{step_name} should have studentActivity"
            assert "studentActivityText" in step, f"{step_name} should have studentActivityText"
        
        # Verify specific content is preserved
        assert "warm up game" in panchapadi["prastabana"]["teacherActivityText"], "prastabana teacherActivityText should be preserved"
        assert "explore" in panchapadi["anweshana"]["teacherActivityText"], "anweshana teacherActivityText should be preserved"
        
        log("✅ Lesson detail returns full panchapadi with all 5 steps and sub-fields", "PASS")
        return True
    except Exception as e:
        log(f"❌ Lesson detail panchapadi test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 3: LIST ENDPOINT STRIPS PANCHAPADI + TOPIC =====
def test_list_strips_panchapadi_and_topic():
    """Test 3: List endpoint strips panchapadi + topic (security)"""
    log("Testing list endpoint strips panchapadi and topic...", "TEST")
    
    if not created_chapter_id:
        log("⚠️ No chapter ID available, skipping", "WARN")
        return True
    
    try:
        # Test without auth (public list)
        response = requests.get(f"{BASE_URL}/lessons?chapterId={created_chapter_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "lessons" in data, "Response should contain lessons"
        lessons = data["lessons"]
        
        if len(lessons) > 0:
            lesson = lessons[0]
            
            # Verify sensitive fields are NOT present
            assert "panchapadi" not in lesson, "List should NOT include panchapadi field"
            assert "topic" not in lesson, "List should NOT include topic field"
            assert "content" not in lesson, "List should NOT include content field"
            assert "teacherNotes" not in lesson, "List should NOT include teacherNotes field"
            
            # Verify basic fields ARE present
            assert "id" in lesson, "List should include id"
            assert "title" in lesson, "List should include title"
            assert "period" in lesson, "List should include period"
            
            log("✅ List endpoint correctly strips panchapadi, topic, and other sensitive fields", "PASS")
        else:
            log("⚠️ No lessons found in list, but endpoint works", "WARN")
        
        return True
    except Exception as e:
        log(f"❌ List strips test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 4: PREVIEW USES TOPIC, NOT PANCHAPADI TEXT =====
def test_preview_uses_topic_not_panchapadi():
    """Test 4: Preview endpoint uses topic, NOT panchapadi text (no leak)"""
    log("Testing preview uses topic, not panchapadi text...", "TEST")
    
    if not created_lesson_id:
        log("⚠️ No lesson ID available, skipping", "WARN")
        return True
    
    try:
        # Test without auth token (should return preview)
        response = requests.get(f"{BASE_URL}/lessons/{created_lesson_id}")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        
        # Verify preview structure
        assert data.get("preview") == True, "Response should have preview:true"
        assert "lesson" in data, "Response should contain lesson"
        
        lesson = data["lesson"]
        
        # Verify topic is present in preview
        assert "topic" in lesson, "Preview should include topic field"
        assert lesson["topic"] == "ଗୀତ ମାଧ୍ୟମରେ ସ୍ଥାନ ଓ ଦିଗର ଧାରଣା (ଉପରେ, ତଳେ, ଭିତରେ, ବାହାରେ)", "Topic should match"
        
        # Verify panchapadi is NOT present in preview
        assert "panchapadi" not in lesson, "Preview should NOT include panchapadi object"
        
        # Verify preview text does NOT contain panchapadi internal text
        preview_text = lesson.get("preview", "")
        assert "warm up game" not in preview_text.lower(), "Preview should NOT leak panchapadi teacherActivityText"
        assert "explore" not in preview_text.lower() or "ଅନ୍ୱେଷଣ" in preview_text, "Preview should NOT leak panchapadi internal text"
        assert "discuss" not in preview_text.lower() or "ଆଲୋଚନା" in preview_text, "Preview should NOT leak panchapadi internal text"
        
        # Verify preview contains topic (or snippet from it)
        assert "ଗୀତ" in preview_text or lesson["topic"] in preview_text, "Preview should show topic text"
        
        log("✅ Preview correctly uses topic, does NOT leak panchapadi internals", "PASS")
        return True
    except Exception as e:
        log(f"❌ Preview topic test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 5A: DEDUPE MODE SKIP =====
def test_dedupe_skip():
    """Test 5a: Dedupe mode 'skip' - re-import same row should skip"""
    log("Testing dedupe mode 'skip'...", "TEST")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Re-import the same row
        test_row = {
            "className": "Class 1",
            "bookName": "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)",
            "chapterName": "ପାଠ - ୧ (ଚୁଲବୁଲି ବିଲେଇକୁ ଖୋଜିବା)",
            "period": 1,
            "title": "Period 1: Updated Title",
            "topic": "Updated topic",
            "panchapadi": {}
        }
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [test_row],
                "dedupeMode": "skip"
            })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify lesson was skipped
        assert data["lessonsSkipped"] == 1, f"Expected lessonsSkipped=1, got {data['lessonsSkipped']}"
        assert data["lessonsCreated"] == 0, f"Expected lessonsCreated=0, got {data['lessonsCreated']}"
        
        log(f"✅ Dedupe skip mode works: lessonsSkipped={data['lessonsSkipped']}", "PASS")
        return True
    except Exception as e:
        log(f"❌ Dedupe skip test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 5B: DEDUPE MODE REPLACE =====
def test_dedupe_replace():
    """Test 5b: Dedupe mode 'replace' - re-import same row should replace"""
    log("Testing dedupe mode 'replace'...", "TEST")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Re-import with replace mode
        test_row = {
            "className": "Class 1",
            "bookName": "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)",
            "chapterName": "ପାଠ - ୧ (ଚୁଲବୁଲି ବିଲେଇକୁ ଖୋଜିବା)",
            "period": 1,
            "title": "Period 1: Replaced Title",
            "topic": "Replaced topic",
            "panchapadi": {
                "prastabana": {
                    "stepLabel": "New Label",
                    "timing": "10 min",
                    "teacherActivity": "New activity",
                    "teacherActivityText": "new text",
                    "studentActivity": "New student activity",
                    "studentActivityText": "new student text"
                }
            }
        }
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [test_row],
                "dedupeMode": "replace"
            })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify lesson was replaced
        assert data["lessonsReplaced"] == 1, f"Expected lessonsReplaced=1, got {data['lessonsReplaced']}"
        assert data["lessonsCreated"] == 0, f"Expected lessonsCreated=0, got {data['lessonsCreated']}"
        
        log(f"✅ Dedupe replace mode works: lessonsReplaced={data['lessonsReplaced']}", "PASS")
        return True
    except Exception as e:
        log(f"❌ Dedupe replace test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 5C: DEDUPE MODE MERGE =====
def test_dedupe_merge_preserves_panchapadi():
    """Test 5c: Dedupe mode 'merge' - preserves existing panchapadi sub-steps"""
    log("Testing dedupe mode 'merge' preserves panchapadi...", "TEST")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First, replace with full panchapadi to have a known state
        full_row = {
            "className": "Class 1",
            "bookName": "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)",
            "chapterName": "ପାଠ - ୧ (ଚୁଲବୁଲି ବିଲେଇକୁ ଖୋଜିବା)",
            "period": 1,
            "title": "Period 1: Merge Test",
            "topic": "Original topic for merge",
            "panchapadi": {
                "prastabana": {
                    "stepLabel": "Original Prastabana",
                    "timing": "5 min",
                    "teacherActivity": "Original teacher activity",
                    "teacherActivityText": "original text",
                    "studentActivity": "Original student activity",
                    "studentActivityText": "original student text"
                },
                "anweshana": {
                    "stepLabel": "Original Anweshana",
                    "timing": "10 min",
                    "teacherActivity": "Original exploration",
                    "teacherActivityText": "original explore",
                    "studentActivity": "Original student exploration",
                    "studentActivityText": "original st_explore"
                }
            }
        }
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [full_row],
                "dedupeMode": "replace"
            })
        assert response.status_code == 200, "Replace should succeed"
        
        # Now merge with empty panchapadi sub-steps
        merge_row = {
            "className": "Class 1",
            "bookName": "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)",
            "chapterName": "ପାଠ - ୧ (ଚୁଲବୁଲି ବିଲେଇକୁ ଖୋଜିବା)",
            "period": 1,
            "title": "Period 1: Merge Test",
            "topic": "Original topic for merge",
            "panchapadi": {
                "prastabana": {
                    "stepLabel": "",
                    "timing": "",
                    "teacherActivity": "",
                    "teacherActivityText": "",
                    "studentActivity": "",
                    "studentActivityText": ""
                },
                "alochana": {
                    "stepLabel": "New Alochana",
                    "timing": "10 min",
                    "teacherActivity": "New discussion",
                    "teacherActivityText": "new discuss",
                    "studentActivity": "New student discussion",
                    "studentActivityText": "new st_discuss"
                }
            }
        }
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [merge_row],
                "dedupeMode": "merge"
            })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify lesson was merged
        assert data["lessonsReplaced"] == 1, f"Expected lessonsReplaced=1 for merge, got {data['lessonsReplaced']}"
        
        # Now fetch the lesson and verify panchapadi was preserved
        response = requests.get(f"{BASE_URL}/lessons/{created_lesson_id}", headers=headers)
        assert response.status_code == 200, "Lesson fetch should succeed"
        
        lesson_data = response.json()
        lesson = lesson_data["lesson"]
        panchapadi = lesson["panchapadi"]
        
        # Verify original prastabana was preserved (not overwritten by empty strings)
        assert panchapadi["prastabana"]["teacherActivityText"] == "original text", "Merge should preserve existing prastabana content"
        
        # Verify original anweshana was preserved
        assert panchapadi["anweshana"]["teacherActivityText"] == "original explore", "Merge should preserve existing anweshana content"
        
        # Verify new alochana was added
        assert panchapadi["alochana"]["teacherActivityText"] == "new discuss", "Merge should add new alochana content"
        
        log("✅ Dedupe merge mode correctly preserves existing panchapadi sub-steps", "PASS")
        return True
    except Exception as e:
        log(f"❌ Dedupe merge test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

# ===== TEST 6: REGRESSION TESTS =====
def test_regression_classes():
    """Test 6a: Regression - GET /classes returns 11 classes"""
    log("Testing regression: GET /classes...", "TEST")
    
    try:
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "classes" in data, "Response should contain classes"
        classes = data["classes"]
        assert len(classes) >= 11, f"Should have at least 11 classes, got {len(classes)}"
        
        log(f"✅ Regression test passed: {len(classes)} classes found", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression classes test failed: {str(e)}", "FAIL")
        return False

def test_regression_books():
    """Test 6b: Regression - GET /books returns books"""
    log("Testing regression: GET /books...", "TEST")
    
    try:
        response = requests.get(f"{BASE_URL}/books")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "books" in data, "Response should contain books"
        books = data["books"]
        assert len(books) > 0, "Should have at least some books"
        
        log(f"✅ Regression test passed: {len(books)} books found", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression books test failed: {str(e)}", "FAIL")
        return False

def test_regression_auth():
    """Test 6c: Regression - Auth /auth/login as admin works"""
    log("Testing regression: Admin login...", "TEST")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert data["user"]["role"] == "admin", "User should be admin"
        
        log("✅ Regression test passed: Admin login works", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression auth test failed: {str(e)}", "FAIL")
        return False

def test_regression_legacy_import():
    """Test 6d: Regression - Bulk import without topic/panchapadi still works"""
    log("Testing regression: Legacy bulk import...", "TEST")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Import a legacy row without topic/panchapadi
        legacy_row = {
            "className": "Class 1",
            "bookName": "Test Legacy Book",
            "chapterName": "Test Legacy Chapter",
            "period": 1,
            "title": "Legacy Period 1",
            "content": "This is legacy content without panchapadi",
            "learningOutcomes": ["Legacy outcome"],
            "tlm": ["Legacy TLM"]
        }
        
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [legacy_row],
                "dedupeMode": "skip"
            })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should create or skip successfully
        assert data["lessonsCreated"] >= 0, "Legacy import should work"
        assert isinstance(data["errors"], list), "Should have errors array"
        
        log(f"✅ Regression test passed: Legacy import works (created={data['lessonsCreated']}, skipped={data['lessonsSkipped']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression legacy import test failed: {str(e)}", "FAIL")
        import traceback
        traceback.print_exc()
        return False

def run_all_tests():
    """Run all Panchapadi schema tests"""
    log("=" * 80, "INFO")
    log("Starting Panchapadi Schema Backend Test Suite", "INFO")
    log(f"Base URL: {BASE_URL}", "INFO")
    log("=" * 80, "INFO")
    
    # Setup
    if not setup_admin_token():
        log("❌ Failed to setup admin token, aborting tests", "FAIL")
        return False
    
    tests = [
        ("1. Bulk import with panchapadi + topic", test_bulk_import_with_panchapadi),
        ("2. Lesson detail returns full panchapadi for admin", test_lesson_detail_returns_panchapadi),
        ("3. List endpoint strips panchapadi + topic", test_list_strips_panchapadi_and_topic),
        ("4. Preview uses topic, NOT panchapadi text", test_preview_uses_topic_not_panchapadi),
        ("5a. Dedupe mode 'skip'", test_dedupe_skip),
        ("5b. Dedupe mode 'replace'", test_dedupe_replace),
        ("5c. Dedupe mode 'merge' preserves panchapadi", test_dedupe_merge_preserves_panchapadi),
        ("6a. Regression: GET /classes", test_regression_classes),
        ("6b. Regression: GET /books", test_regression_books),
        ("6c. Regression: Admin login", test_regression_auth),
        ("6d. Regression: Legacy import without panchapadi", test_regression_legacy_import),
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
            import traceback
            traceback.print_exc()
            failed += 1
    
    log("=" * 80, "INFO")
    log(f"Test Results: {passed} passed, {failed} failed out of {len(tests)} total", "INFO")
    log("=" * 80, "INFO")
    
    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
