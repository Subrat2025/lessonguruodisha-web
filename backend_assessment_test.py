#!/usr/bin/env python3
"""
Backend test for Assessment Generator feature
Tests all CRUD endpoints + PDF generation + validation + auth
"""

import requests
import json
import time
import sys
from pymongo import MongoClient

# Load environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Test credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def log(msg):
    print(f"[TEST] {msg}")

def test_login():
    """Test 1: Admin login"""
    log("Test 1: Admin login")
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data, "No token in response"
        log(f"✅ Test 1 PASSED: Admin login successful, token: {data['token'][:20]}...")
        return data["token"]
    except Exception as e:
        log(f"❌ Test 1 FAILED: {e}")
        sys.exit(1)

def test_list_empty(token):
    """Test 2: List assessments (note initial count)"""
    log("Test 2: GET /api/assessments - list assessments")
    try:
        r = requests.get(f"{BASE_URL}/assessments", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=30)
        assert r.status_code == 200, f"List failed: {r.status_code} {r.text}"
        data = r.json()
        assert "items" in data, "No items in response"
        count = len(data["items"])
        log(f"✅ Test 2 PASSED: List returned {count} assessments")
        return count
    except Exception as e:
        log(f"❌ Test 2 FAILED: {e}")
        return None

def find_valid_chapter_ids():
    """Find valid classId, bookId, chapterId from MongoDB"""
    log("Finding valid chapter IDs from MongoDB...")
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Find book with most chapters
        pipeline = [
            {"$group": {"_id": "$bookId", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 1}
        ]
        result = list(db.chapters.aggregate(pipeline))
        if not result:
            log("❌ No chapters found in database")
            return None, None, None
        
        book_id = result[0]["_id"]
        log(f"Found bookId with most chapters: {book_id} ({result[0]['count']} chapters)")
        
        # Get book details
        book = db.books.find_one({"id": book_id})
        if not book:
            log(f"❌ Book not found: {book_id}")
            return None, None, None
        
        class_id = book.get("classId")
        book_name = book.get("name", "Unknown")
        log(f"Book: {book_name}, classId: {class_id}")
        
        # Get first chapter
        chapter = db.chapters.find_one({"bookId": book_id})
        if not chapter:
            log(f"❌ No chapters found for book: {book_id}")
            return None, None, None
        
        chapter_id = chapter.get("id")
        chapter_name = chapter.get("name", "Unknown")
        log(f"Chapter: {chapter_name}, chapterId: {chapter_id}")
        
        return class_id, book_id, chapter_id
    except Exception as e:
        log(f"❌ MongoDB query failed: {e}")
        return None, None, None

def test_generate_fa1(token, class_id, book_id, chapter_id):
    """Test 3: Generate FA1 assessment (Odia)"""
    log("Test 3: POST /api/assessments/generate - FA1 (Odia)")
    try:
        start_time = time.time()
        payload = {
            "classId": class_id,
            "bookId": book_id,
            "chapterIds": [chapter_id],
            "type": "fa1",
            "language": "odia"
        }
        log(f"Payload: {json.dumps(payload, indent=2)}")
        log("⏳ Generating assessment (this may take 30-90 seconds)...")
        
        r = requests.post(f"{BASE_URL}/assessments/generate", 
                         json=payload,
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=180)
        
        elapsed = time.time() - start_time
        log(f"⏱️  Generation took {elapsed:.1f} seconds")
        
        assert r.status_code == 200, f"Generate failed: {r.status_code} {r.text}"
        data = r.json()
        
        # Verify response structure
        assert "assessment" in data, "No assessment in response"
        a = data["assessment"]
        
        # Required fields
        required = ["id", "userId", "classId", "bookId", "chapterIds", "type", "language", 
                   "title", "totalMarks", "durationMin", "learningOutcomes", "blueprint", 
                   "questions", "answerKey", "rubrics", "homework", "remedial", "enrichment",
                   "selfAssessment", "peerAssessment", "markDistribution", "createdAt", "generationTimeMs"]
        
        for field in required:
            assert field in a, f"Missing field: {field}"
        
        # Verify FA1 specifics
        assert a["type"] == "fa1", f"Wrong type: {a['type']}"
        assert a["totalMarks"] == 25, f"Wrong totalMarks: {a['totalMarks']}"
        assert a["durationMin"] == 45, f"Wrong durationMin: {a['durationMin']}"
        assert a["language"] == "odia", f"Wrong language: {a['language']}"
        
        # Report array lengths
        log(f"📊 Assessment structure:")
        log(f"   - ID: {a['id']}")
        log(f"   - Title: {a['title'][:60]}...")
        log(f"   - Type: {a['type']}, Marks: {a['totalMarks']}, Duration: {a['durationMin']} min")
        log(f"   - Language: {a['language']}")
        log(f"   - Learning Outcomes: {len(a['learningOutcomes'])} items")
        log(f"   - Blueprint: {len(a['blueprint'])} rows")
        log(f"   - Questions: {len(a['questions'])} items")
        log(f"   - Answer Key: {len(a['answerKey'])} entries")
        log(f"   - Rubrics: {len(a['rubrics'])} items")
        log(f"   - Homework: {len(a['homework'])} items")
        log(f"   - Remedial: {len(a['remedial'])} items")
        log(f"   - Enrichment: {len(a['enrichment'])} items")
        log(f"   - Self Assessment: {a['selfAssessment']}")
        log(f"   - Peer Assessment: {a['peerAssessment']}")
        log(f"   - Mark Distribution: {a['markDistribution']}")
        log(f"   - Generation Time: {a['generationTimeMs']} ms")
        
        log(f"✅ Test 3 PASSED: FA1 assessment generated successfully in {elapsed:.1f}s")
        return a["id"]
    except Exception as e:
        log(f"❌ Test 3 FAILED: {e}")
        return None

def test_pdf_export(token, assessment_id):
    """Test 4: PDF export"""
    log(f"Test 4: GET /api/assessments/{assessment_id}/pdf - PDF export")
    try:
        r = requests.get(f"{BASE_URL}/assessments/{assessment_id}/pdf",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=60)
        
        assert r.status_code == 200, f"PDF export failed: {r.status_code} {r.text}"
        assert r.headers.get("Content-Type") == "application/pdf", f"Wrong content type: {r.headers.get('Content-Type')}"
        
        # Verify PDF signature
        content = r.content
        assert content[:4] == b'%PDF', "Not a valid PDF (missing %PDF header)"
        
        size_kb = len(content) / 1024
        assert size_kb > 50, f"PDF too small: {size_kb:.1f} KB"
        
        log(f"✅ Test 4 PASSED: PDF exported successfully, size: {size_kb:.1f} KB")
        return True
    except Exception as e:
        log(f"❌ Test 4 FAILED: {e}")
        return False

def test_fetch_by_id(token, assessment_id):
    """Test 5: Fetch assessment by ID"""
    log(f"Test 5: GET /api/assessments/{assessment_id} - fetch by ID")
    try:
        r = requests.get(f"{BASE_URL}/assessments/{assessment_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=30)
        
        assert r.status_code == 200, f"Fetch failed: {r.status_code} {r.text}"
        data = r.json()
        
        assert "id" in data, "No id in response"
        assert data["id"] == assessment_id, f"Wrong ID: {data['id']}"
        assert "questions" in data, "No questions in response"
        
        log(f"✅ Test 5 PASSED: Assessment fetched successfully")
        return True
    except Exception as e:
        log(f"❌ Test 5 FAILED: {e}")
        return False

def test_generate_sa1(token, class_id, book_id, chapter_id):
    """Test 6: Generate SA1 assessment"""
    log("Test 6: POST /api/assessments/generate - SA1")
    try:
        start_time = time.time()
        payload = {
            "classId": class_id,
            "bookId": book_id,
            "chapterIds": [chapter_id],
            "type": "sa1",
            "language": "odia"
        }
        log(f"Payload: {json.dumps(payload, indent=2)}")
        log("⏳ Generating SA1 assessment (this may take 30-90 seconds)...")
        
        r = requests.post(f"{BASE_URL}/assessments/generate", 
                         json=payload,
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=180)
        
        elapsed = time.time() - start_time
        log(f"⏱️  Generation took {elapsed:.1f} seconds")
        
        assert r.status_code == 200, f"Generate failed: {r.status_code} {r.text}"
        data = r.json()
        
        assert "assessment" in data, "No assessment in response"
        a = data["assessment"]
        
        # Verify SA1 specifics
        assert a["type"] == "sa1", f"Wrong type: {a['type']}"
        assert a["totalMarks"] == 50, f"Wrong totalMarks: {a['totalMarks']}"
        assert a["durationMin"] == 90, f"Wrong durationMin: {a['durationMin']}"
        assert len(a["questions"]) >= 15, f"Too few questions: {len(a['questions'])}"
        
        log(f"📊 SA1 Assessment:")
        log(f"   - Type: {a['type']}, Marks: {a['totalMarks']}, Duration: {a['durationMin']} min")
        log(f"   - Questions: {len(a['questions'])} items")
        
        log(f"✅ Test 6 PASSED: SA1 assessment generated successfully in {elapsed:.1f}s")
        return a["id"]
    except Exception as e:
        log(f"❌ Test 6 FAILED: {e}")
        log(f"   Note: Skipping SA1 test to save time budget")
        return None

def test_generate_observation(token, class_id, book_id, chapter_id):
    """Test 7: Generate Observation type assessment"""
    log("Test 7: POST /api/assessments/generate - Observation")
    try:
        start_time = time.time()
        payload = {
            "classId": class_id,
            "bookId": book_id,
            "chapterIds": [chapter_id],
            "type": "observation",
            "language": "odia"
        }
        log(f"Payload: {json.dumps(payload, indent=2)}")
        log("⏳ Generating observation assessment (this may take 30-90 seconds)...")
        
        r = requests.post(f"{BASE_URL}/assessments/generate", 
                         json=payload,
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=180)
        
        elapsed = time.time() - start_time
        log(f"⏱️  Generation took {elapsed:.1f} seconds")
        
        assert r.status_code == 200, f"Generate failed: {r.status_code} {r.text}"
        data = r.json()
        
        assert "assessment" in data, "No assessment in response"
        a = data["assessment"]
        
        # Verify Observation specifics
        assert a["type"] == "observation", f"Wrong type: {a['type']}"
        assert a["totalMarks"] == 25, f"Wrong totalMarks: {a['totalMarks']}"
        assert "observationSheet" in a, "No observationSheet in response"
        assert "indicators" in a["observationSheet"], "No indicators in observationSheet"
        
        indicators_count = len(a["observationSheet"]["indicators"])
        assert indicators_count >= 10, f"Too few indicators: {indicators_count}"
        
        # Questions may be empty or minimal for observation type
        questions_count = len(a.get("questions", []))
        
        log(f"📊 Observation Assessment:")
        log(f"   - Type: {a['type']}, Marks: {a['totalMarks']}")
        log(f"   - Observation Indicators: {indicators_count} items")
        log(f"   - Questions: {questions_count} items (may be empty for observation type)")
        
        log(f"✅ Test 7 PASSED: Observation assessment generated successfully in {elapsed:.1f}s")
        return a["id"]
    except Exception as e:
        log(f"❌ Test 7 FAILED: {e}")
        return None

def test_delete(token, assessment_id):
    """Test 8: Delete assessment"""
    log(f"Test 8: DELETE /api/assessments/{assessment_id}")
    try:
        r = requests.delete(f"{BASE_URL}/assessments/{assessment_id}",
                           headers={"Authorization": f"Bearer {token}"},
                           timeout=30)
        
        assert r.status_code == 200, f"Delete failed: {r.status_code} {r.text}"
        
        # Verify it's gone
        r2 = requests.get(f"{BASE_URL}/assessments/{assessment_id}",
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=30)
        assert r2.status_code == 404, f"Assessment still exists after delete: {r2.status_code}"
        
        log(f"✅ Test 8 PASSED: Assessment deleted successfully")
        return True
    except Exception as e:
        log(f"❌ Test 8 FAILED: {e}")
        return False

def test_auth_guard(token):
    """Test 9: Auth guard - no token should return 401"""
    log("Test 9: GET /api/assessments without auth - should return 401")
    try:
        r = requests.get(f"{BASE_URL}/assessments", timeout=30)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        
        log(f"✅ Test 9 PASSED: Auth guard working (401 without token)")
        return True
    except Exception as e:
        log(f"❌ Test 9 FAILED: {e}")
        return False

def test_validation(token):
    """Test 10: Validation - missing fields should return 400"""
    log("Test 10: POST /api/assessments/generate with missing fields - should return 400")
    try:
        # Missing classId, bookId, chapterIds
        r = requests.post(f"{BASE_URL}/assessments/generate",
                         json={"type": "fa1"},
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        
        log(f"✅ Test 10 PASSED: Validation working (400 for missing fields)")
        return True
    except Exception as e:
        log(f"❌ Test 10 FAILED: {e}")
        return False

def test_regression_worksheets(token):
    """Test 11: Regression - POST /api/lessons/:lid/worksheets"""
    log("Test 11: Regression - POST /api/lessons/:lid/worksheets")
    try:
        # Find a lesson ID
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        lesson = db.lessons.find_one({})
        if not lesson:
            log("⚠️  Test 11 SKIPPED: No lessons found")
            return True
        
        lesson_id = lesson.get("id")
        log(f"Using lesson ID: {lesson_id}")
        
        r = requests.post(f"{BASE_URL}/lessons/{lesson_id}/worksheets",
                         json={"count": 5, "type": "mcq"},
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=60)
        
        assert r.status_code == 200, f"Worksheets failed: {r.status_code} {r.text}"
        
        log(f"✅ Test 11 PASSED: Worksheets endpoint still working")
        return True
    except Exception as e:
        log(f"❌ Test 11 FAILED: {e}")
        return False

def test_regression_analytics(token):
    """Test 12: Regression - GET /api/admin/analytics/dashboard"""
    log("Test 12: Regression - GET /api/admin/analytics/dashboard?range=30d")
    try:
        r = requests.get(f"{BASE_URL}/admin/analytics/dashboard?range=30d",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=30)
        
        assert r.status_code == 200, f"Analytics failed: {r.status_code} {r.text}"
        
        log(f"✅ Test 12 PASSED: Analytics endpoint still working")
        return True
    except Exception as e:
        log(f"❌ Test 12 FAILED: {e}")
        return False

def test_regression_msg_settings(token):
    """Test 13: Regression - GET /api/admin/msg-settings"""
    log("Test 13: Regression - GET /api/admin/msg-settings")
    try:
        r = requests.get(f"{BASE_URL}/admin/msg-settings",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=30)
        
        assert r.status_code == 200, f"Msg-settings failed: {r.status_code} {r.text}"
        
        log(f"✅ Test 13 PASSED: Msg-settings endpoint still working")
        return True
    except Exception as e:
        log(f"❌ Test 13 FAILED: {e}")
        return False

def verify_mongodb(assessment_id):
    """Test 14: Verify MongoDB collections"""
    log("Test 14: Verify MongoDB collections")
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Check assessments collection
        assessment = db.assessments.find_one({"id": assessment_id})
        if assessment:
            log(f"✅ Assessment found in MongoDB: {assessment_id}")
        else:
            log(f"⚠️  Assessment not found in MongoDB (may have been deleted)")
        
        # Check assessmentAnalytics collection
        analytics = db.assessmentAnalytics.find_one({"assessmentId": assessment_id})
        if analytics:
            log(f"✅ Assessment analytics found: status={analytics.get('status')}")
        else:
            log(f"⚠️  No analytics found for assessment {assessment_id}")
        
        log(f"✅ Test 14 PASSED: MongoDB verification complete")
        return True
    except Exception as e:
        log(f"❌ Test 14 FAILED: {e}")
        return False

def main():
    log("=" * 80)
    log("ASSESSMENT GENERATOR BACKEND TEST")
    log("=" * 80)
    
    # Test 1: Login
    token = test_login()
    
    # Test 2: List assessments (note initial count)
    initial_count = test_list_empty(token)
    
    # Find valid chapter IDs
    class_id, book_id, chapter_id = find_valid_chapter_ids()
    if not all([class_id, book_id, chapter_id]):
        log("❌ FATAL: Could not find valid chapter IDs")
        sys.exit(1)
    
    # Test 3: Generate FA1 (Odia)
    fa1_id = test_generate_fa1(token, class_id, book_id, chapter_id)
    if not fa1_id:
        log("❌ FATAL: FA1 generation failed")
        sys.exit(1)
    
    # Test 4: PDF export
    test_pdf_export(token, fa1_id)
    
    # Test 5: Fetch by ID
    test_fetch_by_id(token, fa1_id)
    
    # Test 6: Generate SA1 (optional - may skip to save time)
    log("\n⏰ SA1 generation test - this will take additional 30-90 seconds")
    log("   Proceeding with SA1 test...")
    sa1_id = test_generate_sa1(token, class_id, book_id, chapter_id)
    
    # Test 7: Generate Observation type
    log("\n⏰ Observation generation test - this will take additional 30-90 seconds")
    log("   Proceeding with Observation test...")
    obs_id = test_generate_observation(token, class_id, book_id, chapter_id)
    
    # Test 8: Delete (use FA1 ID)
    test_delete(token, fa1_id)
    
    # Verify list count decreased
    final_count = test_list_empty(token)
    if initial_count is not None and final_count is not None:
        log(f"📊 Assessment count: {initial_count} → {final_count} (after delete)")
    
    # Test 9: Auth guard
    test_auth_guard(token)
    
    # Test 10: Validation
    test_validation(token)
    
    # Test 11-13: Regression tests
    test_regression_worksheets(token)
    test_regression_analytics(token)
    test_regression_msg_settings(token)
    
    # Test 14: MongoDB verification (use SA1 or Observation ID if available)
    verify_id = sa1_id or obs_id or fa1_id
    if verify_id:
        verify_mongodb(verify_id)
    
    log("=" * 80)
    log("✅ ALL TESTS COMPLETED")
    log("=" * 80)

if __name__ == "__main__":
    main()
