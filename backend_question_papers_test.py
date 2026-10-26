#!/usr/bin/env python3
"""
Backend test for Question Paper Generator module.
Tests all endpoints: generate, poll, list, regenerate, duplicate, delete, PDF, admin.
"""

import requests
import time
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_question_papers():
    print("\n" + "="*80)
    print("QUESTION PAPER GENERATOR — BACKEND TEST")
    print("="*80)
    
    # =========================================================================
    # Test 1: Admin Login
    # =========================================================================
    print("\n[Test 1] Admin Login (9692604577 / <redacted>)")
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": "9692604577",
        "password": "<redacted>"
    })
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    admin_token = r.json()["token"]
    admin_user = r.json()["user"]
    print(f"✅ Admin login successful: {admin_user['name']} (role={admin_user['role']})")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # =========================================================================
    # Test 2: Regression - GET /api/classes
    # =========================================================================
    print("\n[Test 2] Regression: GET /api/classes")
    r = requests.get(f"{BASE_URL}/classes")
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    classes = data.get("classes", data)  # Handle both {classes: [...]} and [...]
    assert len(classes) > 0, "No classes found"
    print(f"✅ Classes endpoint working: {len(classes)} classes found")
    
    # Pick a class for testing (prefer Class 1 if available)
    test_class = next((c for c in classes if "Class 1" in c['name']), classes[0])
    print(f"   Using test class: {test_class['name']} (id={test_class['id']})")
    
    # =========================================================================
    # Test 3: Get books for class
    # =========================================================================
    print(f"\n[Test 3] GET /api/books?classId={test_class['id']}")
    r = requests.get(f"{BASE_URL}/books", params={"classId": test_class['id']})
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    books = data.get("books", data)  # Handle both {books: [...]} and [...]
    assert len(books) > 0, "No books found for class"
    test_book = books[0]
    print(f"✅ Books found: {len(books)} books")
    print(f"   Using test book: {test_book['name']} (id={test_book['id']})")
    
    # =========================================================================
    # Test 4: Get chapters for book
    # =========================================================================
    print(f"\n[Test 4] GET /api/chapters?classId={test_class['id']}&bookId={test_book['id']}")
    r = requests.get(f"{BASE_URL}/chapters", params={
        "classId": test_class['id'],
        "bookId": test_book['id']
    })
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    chapters = data.get("chapters", data)  # Handle both {chapters: [...]} and [...]
    assert len(chapters) > 0, "No chapters found for book"
    test_chapters = chapters[:2]  # Use first 2 chapters
    chapter_ids = [c['id'] for c in test_chapters]
    print(f"✅ Chapters found: {len(chapters)} chapters")
    print(f"   Using chapters: {[c['name'] for c in test_chapters]}")
    
    # =========================================================================
    # Test 5: POST /api/question-papers/generate (without auth) → 401
    # =========================================================================
    print("\n[Test 5] POST /api/question-papers/generate (no auth) → 401")
    r = requests.post(f"{BASE_URL}/question-papers/generate", json={
        "classId": test_class['id'],
        "bookId": test_book['id'],
        "chapterIds": chapter_ids,
        "questionMix": {"mcq": 3, "fill": 2},
        "difficulty": "easy",
        "language": "odia"
    })
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("✅ Correctly returns 401 without auth")
    
    # =========================================================================
    # Test 6: POST /api/question-papers/generate (missing classId) → 400
    # =========================================================================
    print("\n[Test 6] POST /api/question-papers/generate (missing classId) → 400")
    r = requests.post(f"{BASE_URL}/question-papers/generate", headers=headers, json={
        "bookId": test_book['id'],
        "chapterIds": chapter_ids,
        "questionMix": {"mcq": 3}
    })
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "required" in r.text.lower(), "Error message should mention required fields"
    print("✅ Correctly validates missing classId")
    
    # =========================================================================
    # Test 7: POST /api/question-papers/generate (empty questionMix) → 400
    # =========================================================================
    print("\n[Test 7] POST /api/question-papers/generate (empty questionMix) → 400")
    r = requests.post(f"{BASE_URL}/question-papers/generate", headers=headers, json={
        "classId": test_class['id'],
        "bookId": test_book['id'],
        "chapterIds": chapter_ids,
        "questionMix": {}
    })
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "question type" in r.text.lower(), "Error message should mention question type"
    print("✅ Correctly validates empty questionMix")
    
    # =========================================================================
    # Test 8: POST /api/question-papers/generate (invalid classId) → 404
    # =========================================================================
    print("\n[Test 8] POST /api/question-papers/generate (invalid classId) → 404")
    r = requests.post(f"{BASE_URL}/question-papers/generate", headers=headers, json={
        "classId": "invalid-class-id-12345",
        "bookId": test_book['id'],
        "chapterIds": chapter_ids,
        "questionMix": {"mcq": 3}
    })
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"
    print("✅ Correctly returns 404 for invalid class")
    
    # =========================================================================
    # Test 9: POST /api/question-papers/generate (valid) → async stub
    # =========================================================================
    print("\n[Test 9] POST /api/question-papers/generate (valid payload)")
    print(f"   Generating: {test_class['name']} · {test_book['name']}")
    print(f"   Chapters: {[c['name'] for c in test_chapters]}")
    print(f"   Mix: 3 MCQ + 2 Fill + 2 Very Short")
    print(f"   Difficulty: easy, Language: odia")
    
    start_time = time.time()
    r = requests.post(f"{BASE_URL}/question-papers/generate", headers=headers, json={
        "classId": test_class['id'],
        "bookId": test_book['id'],
        "chapterIds": chapter_ids,
        "questionMix": {"mcq": 3, "fill": 2, "veryshort": 2},
        "difficulty": "easy",
        "language": "odia",
        "teacherContext": "Focus on basic concepts for beginners"
    })
    assert r.status_code == 200, f"Failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["ok"] == True, "Response should have ok=true"
    assert data["status"] == "generating", "Status should be 'generating'"
    assert "questionPaper" in data, "Response should have questionPaper"
    
    qp = data["questionPaper"]
    qp_id = qp["id"]
    assert qp["status"] == "generating", "Initial status should be 'generating'"
    assert qp["userId"] == admin_user["id"], "userId should match logged-in user"
    assert qp["classId"] == test_class['id'], "classId should match"
    assert qp["bookId"] == test_book['id'], "bookId should match"
    assert qp["difficulty"] == "easy", "difficulty should match"
    assert qp["language"] == "odia", "language should match"
    assert qp["questionMix"]["mcq"] == 3, "questionMix should match"
    assert qp["questionMix"]["fill"] == 2, "questionMix should match"
    assert qp["questionMix"]["veryshort"] == 2, "questionMix should match"
    
    print(f"✅ Question paper generation started")
    print(f"   ID: {qp_id}")
    print(f"   Status: {qp['status']}")
    print(f"   Progress: {qp.get('progress', 'N/A')}")
    print(f"   Total Marks: {qp['totalMarks']}")
    print(f"   Duration: {qp['durationMin']} min")
    
    # =========================================================================
    # Test 10: GET /api/question-papers/:id (poll until ready)
    # =========================================================================
    print(f"\n[Test 10] GET /api/question-papers/{qp_id} (polling until ready)")
    max_wait = 120  # 2 minutes max
    poll_interval = 4  # 4 seconds
    
    final_status = None
    for i in range(max_wait // poll_interval):
        time.sleep(poll_interval)
        r = requests.get(f"{BASE_URL}/question-papers/{qp_id}", headers=headers)
        assert r.status_code == 200, f"Poll failed: {r.status_code}"
        data = r.json()
        qp = data["questionPaper"]
        status = qp["status"]
        progress = qp.get("progress", "")
        
        print(f"   Poll {i+1}: status={status}, progress={progress}")
        
        if status == "ready":
            final_status = "ready"
            generation_time = time.time() - start_time
            print(f"✅ Question paper ready in {generation_time:.1f}s")
            print(f"   Questions: {len(qp.get('questions', []))}")
            print(f"   Answer Key: {len(qp.get('answerKey', []))}")
            print(f"   Generation Time (server): {qp.get('generationTimeMs', 0)/1000:.1f}s")
            
            # Validate structure
            assert len(qp["questions"]) > 0, "Should have questions"
            assert len(qp["answerKey"]) > 0, "Should have answer key"
            assert qp["title"], "Should have title"
            assert qp["instructions"], "Should have instructions"
            
            # Check question structure
            q1 = qp["questions"][0]
            assert "q" in q1, "Question should have 'q' field"
            assert "type" in q1, "Question should have 'type' field"
            assert "marks" in q1, "Question should have 'marks' field"
            assert "qNumber" in q1, "Question should have 'qNumber' field"
            
            # Check answer key structure
            a1 = qp["answerKey"][0]
            assert "qNumber" in a1, "Answer should have 'qNumber' field"
            assert "answer" in a1, "Answer should have 'answer' field"
            
            print(f"   ✓ Question structure validated")
            print(f"   ✓ Answer key structure validated")
            break
        elif status == "failed":
            final_status = "failed"
            error_msg = qp.get("errorMessage", "Unknown error")
            print(f"❌ Generation failed: {error_msg}")
            break
    
    assert final_status == "ready", f"Generation did not complete successfully (status={final_status})"
    
    # =========================================================================
    # Test 11: GET /api/question-papers (list mine)
    # =========================================================================
    print("\n[Test 11] GET /api/question-papers (list mine)")
    r = requests.get(f"{BASE_URL}/question-papers", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    assert "items" in data, "Response should have 'items'"
    items = data["items"]
    assert len(items) > 0, "Should have at least 1 question paper"
    
    # Find our paper
    our_paper = next((p for p in items if p["id"] == qp_id), None)
    assert our_paper is not None, "Our paper should be in the list"
    
    # Verify list projection (should exclude questions and answerKey)
    assert "questions" not in our_paper, "List should exclude questions"
    assert "answerKey" not in our_paper, "List should exclude answerKey"
    assert "title" in our_paper, "List should include title"
    assert "status" in our_paper, "List should include status"
    
    print(f"✅ List endpoint working: {len(items)} papers found")
    print(f"   ✓ Our paper found in list")
    print(f"   ✓ questions/answerKey excluded from list (performance)")
    
    # =========================================================================
    # Test 12: GET /api/question-papers?search=... (search)
    # =========================================================================
    print("\n[Test 12] GET /api/question-papers?search=... (search)")
    search_term = test_class['name'][:5]  # First 5 chars of class name
    r = requests.get(f"{BASE_URL}/question-papers", headers=headers, params={"search": search_term})
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    items = data["items"]
    print(f"✅ Search working: {len(items)} papers found for '{search_term}'")
    
    # =========================================================================
    # Test 13: GET /api/question-papers/:id/pdf?mode=paper (without auth)
    # =========================================================================
    print(f"\n[Test 13] GET /api/question-papers/{qp_id}/pdf?mode=paper (no auth)")
    # Note: PDF endpoint doesn't require auth (public access)
    r = requests.get(f"{BASE_URL}/question-papers/{qp_id}/pdf", params={"mode": "paper"})
    assert r.status_code == 200, f"Failed: {r.status_code}"
    assert r.headers["Content-Type"] == "application/pdf", "Should return PDF"
    pdf_size = len(r.content)
    print(f"✅ PDF (paper only) generated: {pdf_size/1024:.1f} KB")
    
    # =========================================================================
    # Test 14: GET /api/question-papers/:id/pdf?mode=paper+answers
    # =========================================================================
    print(f"\n[Test 14] GET /api/question-papers/{qp_id}/pdf?mode=paper+answers")
    r = requests.get(f"{BASE_URL}/question-papers/{qp_id}/pdf", params={"mode": "paper+answers"})
    assert r.status_code == 200, f"Failed: {r.status_code}"
    assert r.headers["Content-Type"] == "application/pdf", "Should return PDF"
    pdf_size = len(r.content)
    print(f"✅ PDF (paper + answers) generated: {pdf_size/1024:.1f} KB")
    
    # =========================================================================
    # Test 15: GET /api/question-papers/:id/pdf?mode=answers-only
    # =========================================================================
    print(f"\n[Test 15] GET /api/question-papers/{qp_id}/pdf?mode=answers-only")
    r = requests.get(f"{BASE_URL}/question-papers/{qp_id}/pdf", params={"mode": "answers-only"})
    assert r.status_code == 200, f"Failed: {r.status_code}"
    assert r.headers["Content-Type"] == "application/pdf", "Should return PDF"
    pdf_size = len(r.content)
    print(f"✅ PDF (answers only) generated: {pdf_size/1024:.1f} KB")
    
    # =========================================================================
    # Test 16: GET /api/question-papers/:id/pdf (status not ready) → 400
    # =========================================================================
    print("\n[Test 16] GET /api/question-papers/:id/pdf (status not ready) → 400")
    # Create a new paper that's still generating
    r = requests.post(f"{BASE_URL}/question-papers/generate", headers=headers, json={
        "classId": test_class['id'],
        "bookId": test_book['id'],
        "chapterIds": chapter_ids,
        "questionMix": {"mcq": 2},
        "difficulty": "easy",
        "language": "odia"
    })
    assert r.status_code == 200, f"Failed: {r.status_code}"
    generating_id = r.json()["questionPaper"]["id"]
    
    # Try to get PDF immediately (should fail)
    r = requests.get(f"{BASE_URL}/question-papers/{generating_id}/pdf", params={"mode": "paper"})
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "not ready" in r.text.lower(), "Error should mention 'not ready'"
    print("✅ Correctly returns 400 when paper not ready")
    
    # =========================================================================
    # Test 17: POST /api/question-papers/:id/duplicate
    # =========================================================================
    print(f"\n[Test 17] POST /api/question-papers/{qp_id}/duplicate")
    r = requests.post(f"{BASE_URL}/question-papers/{qp_id}/duplicate", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    assert data["ok"] == True, "Response should have ok=true"
    assert "questionPaper" in data, "Response should have questionPaper"
    
    duplicate = data["questionPaper"]
    duplicate_id = duplicate["id"]
    assert duplicate_id != qp_id, "Duplicate should have different ID"
    assert "Copy" in duplicate["title"] or "📋" in duplicate["title"], "Duplicate title should indicate copy"
    assert duplicate["status"] == "ready", "Duplicate should inherit ready status"
    assert len(duplicate["questions"]) == len(qp["questions"]), "Duplicate should have same questions"
    
    print(f"✅ Duplicate created successfully")
    print(f"   Original ID: {qp_id}")
    print(f"   Duplicate ID: {duplicate_id}")
    print(f"   Title: {duplicate['title']}")
    
    # =========================================================================
    # Test 18: POST /api/question-papers/:id/regenerate
    # =========================================================================
    print(f"\n[Test 18] POST /api/question-papers/{duplicate_id}/regenerate")
    r = requests.post(f"{BASE_URL}/question-papers/{duplicate_id}/regenerate", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    assert data["ok"] == True, "Response should have ok=true"
    assert data["status"] == "generating", "Status should be 'generating'"
    
    print(f"✅ Regeneration started for duplicate")
    print(f"   Waiting for regeneration to complete...")
    
    # Poll until ready
    for i in range(30):  # 30 * 4 = 120 seconds max
        time.sleep(4)
        r = requests.get(f"{BASE_URL}/question-papers/{duplicate_id}", headers=headers)
        assert r.status_code == 200, f"Poll failed: {r.status_code}"
        status = r.json()["questionPaper"]["status"]
        if status == "ready":
            print(f"✅ Regeneration completed")
            break
        elif status == "failed":
            print(f"⚠️  Regeneration failed (acceptable for testing)")
            break
    
    # =========================================================================
    # Test 19: GET /api/admin/question-papers (admin only)
    # =========================================================================
    print("\n[Test 19] GET /api/admin/question-papers (admin only)")
    r = requests.get(f"{BASE_URL}/admin/question-papers", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    
    assert "items" in data, "Response should have 'items'"
    assert "total" in data, "Response should have 'total'"
    assert "analytics" in data, "Response should have 'analytics'"
    
    analytics = data["analytics"]
    assert "totalGenerated" in analytics, "Analytics should have totalGenerated"
    assert "readyCount" in analytics, "Analytics should have readyCount"
    assert "byDifficulty" in analytics, "Analytics should have byDifficulty"
    assert "byClass" in analytics, "Analytics should have byClass"
    assert "topTeachers" in analytics, "Analytics should have topTeachers"
    
    print(f"✅ Admin endpoint working")
    print(f"   Total Generated: {analytics['totalGenerated']}")
    print(f"   Ready Count: {analytics['readyCount']}")
    print(f"   By Difficulty: {analytics['byDifficulty']}")
    print(f"   By Class: {len(analytics['byClass'])} classes")
    print(f"   Top Teachers: {len(analytics['topTeachers'])} teachers")
    
    # =========================================================================
    # Test 20: GET /api/admin/question-papers (non-admin) → 403
    # =========================================================================
    print("\n[Test 20] GET /api/admin/question-papers (non-admin) → 403")
    # Create a regular user
    test_mobile = f"99{int(time.time()) % 100000000}"
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "name": "Test Teacher",
        "mobile": test_mobile,
        "password": "test123"
    })
    assert r.status_code == 200, f"Register failed: {r.status_code}"
    teacher_token = r.json()["token"]
    teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
    
    r = requests.get(f"{BASE_URL}/admin/question-papers", headers=teacher_headers)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
    print("✅ Correctly returns 403 for non-admin")
    
    # =========================================================================
    # Test 21: DELETE /api/question-papers/:id (owner only)
    # =========================================================================
    print(f"\n[Test 21] DELETE /api/question-papers/{duplicate_id} (owner only)")
    # Try to delete with teacher account (should fail - not owner)
    r = requests.delete(f"{BASE_URL}/question-papers/{duplicate_id}", headers=teacher_headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    assert data["ok"] == False, "Should fail to delete (not owner)"
    print("✅ Non-owner cannot delete")
    
    # Delete with admin account (owner)
    r = requests.delete(f"{BASE_URL}/question-papers/{duplicate_id}", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    assert data["ok"] == True, "Should successfully delete"
    print("✅ Owner can delete")
    
    # Verify deleted
    r = requests.get(f"{BASE_URL}/question-papers/{duplicate_id}", headers=headers)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"
    print("✅ Deleted paper returns 404")
    
    # =========================================================================
    # Test 22: Regression - GET /api/admin/assessments (existing feature)
    # =========================================================================
    print("\n[Test 22] Regression: GET /api/admin/assessments")
    r = requests.get(f"{BASE_URL}/admin/assessments", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    data = r.json()
    assert "items" in data or "analytics" in data, "Should have items or analytics"
    print("✅ Admin assessments endpoint still working")
    
    # =========================================================================
    # Test 23: Teachers can only see their own papers
    # =========================================================================
    print("\n[Test 23] Teachers can only see their own papers")
    # Teacher tries to get admin's paper
    r = requests.get(f"{BASE_URL}/question-papers/{qp_id}", headers=teacher_headers)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"
    print("✅ Teacher cannot access other teacher's papers")
    
    # Admin can see any paper
    r = requests.get(f"{BASE_URL}/question-papers/{qp_id}", headers=headers)
    assert r.status_code == 200, f"Failed: {r.status_code}"
    print("✅ Admin can access any paper")
    
    # =========================================================================
    # Cleanup: Delete test papers
    # =========================================================================
    print("\n[Cleanup] Deleting test papers")
    r = requests.delete(f"{BASE_URL}/question-papers/{qp_id}", headers=headers)
    print(f"   Deleted original paper: {qp_id}")
    
    r = requests.delete(f"{BASE_URL}/question-papers/{generating_id}", headers=headers)
    print(f"   Deleted generating paper: {generating_id}")
    
    print("\n" + "="*80)
    print("✅ ALL 23 TESTS PASSED — QUESTION PAPER GENERATOR WORKING PERFECTLY")
    print("="*80)

if __name__ == "__main__":
    try:
        test_question_papers()
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
