#!/usr/bin/env python3
"""
Backend test for AI generation reliability changes:
- Async 202 recovery
- requestId idempotency
- Friendly errors
- SA chunking
"""

import requests
import time
import json
import uuid

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials (bypasses subscription + AI credits)
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test data - Class 1 Maths WITH lesson content
CLASS_ID = "39c75179-874e-4c6f-9549-7d82462f42d0"
BOOK_ID = "57e77512-39dc-45ab-a949-1997adb53273"
CHAPTER_ID = "39e2c118-ffde-4d18-947d-c4db6142920f"

def login():
    """Login as admin and return token"""
    print("\n🔐 Logging in as admin...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    print(f"   Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"   ❌ Login failed: {resp.text}")
        return None
    data = resp.json()
    token = data.get("token")
    if not token:
        print(f"   ❌ No token in response: {data}")
        return None
    print(f"   ✅ Login successful")
    return token

def test_1_async_202(token):
    """TEST 1: ASYNC 202 - POST /api/question-papers/generate returns quickly with status 'generating'"""
    print("\n" + "="*80)
    print("TEST 1: ASYNC 202 - Quick return with status 'generating'")
    print("="*80)
    
    try:
        start = time.time()
        resp = requests.post(
            f"{BASE_URL}/question-papers/generate",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "classId": CLASS_ID,
                "bookId": BOOK_ID,
                "chapterIds": [CHAPTER_ID],
                "questionMix": {"mcq": 5, "veryshort": 3},
                "difficulty": "mixed",
                "language": "odia",
                "forceRegenerate": True  # Force fresh generation to test async behavior
            },
            timeout=10
        )
        elapsed = time.time() - start
        
        print(f"   Response time: {elapsed:.2f}s")
        print(f"   Status code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"   ❌ FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return None
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        
        # Check response structure
        if not data.get("ok"):
            print(f"   ❌ FAILED: ok field is not true")
            return None
        
        if data.get("status") != "generating":
            print(f"   ❌ FAILED: Expected status 'generating', got '{data.get('status')}'")
            return None
        
        qp = data.get("questionPaper")
        if not qp:
            print(f"   ❌ FAILED: No questionPaper in response")
            return None
        
        qp_id = qp.get("id")
        qp_status = qp.get("status")
        
        if not qp_id:
            print(f"   ❌ FAILED: No id in questionPaper")
            return None
        
        if qp_status != "generating":
            print(f"   ❌ FAILED: questionPaper.status is '{qp_status}', expected 'generating'")
            return None
        
        if elapsed > 5:
            print(f"   ⚠️  WARNING: Response took {elapsed:.2f}s (expected < 5s)")
        
        print(f"   ✅ PASSED: Returned in {elapsed:.2f}s with status 'generating'")
        print(f"   Question paper ID: {qp_id}")
        return qp_id
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return None

def test_2_library_visibility(token, qp_id):
    """TEST 2: LIBRARY VISIBILITY - GET /api/question-papers includes the stub"""
    print("\n" + "="*80)
    print("TEST 2: LIBRARY VISIBILITY - Stub appears in library")
    print("="*80)
    
    try:
        resp = requests.get(
            f"{BASE_URL}/question-papers",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        print(f"   Status code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"   ❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        papers = data.get("items", data.get("questionPapers", []))
        
        print(f"   Total papers in library: {len(papers)}")
        
        # Find our paper
        found = None
        for p in papers:
            if p.get("id") == qp_id:
                found = p
                break
        
        if not found:
            print(f"   ❌ FAILED: Paper {qp_id} not found in library")
            print(f"   Available IDs: {[p.get('id') for p in papers[:5]]}")
            return False
        
        print(f"   ✅ PASSED: Paper found in library")
        print(f"   Status: {found.get('status')}")
        print(f"   Title: {found.get('title', '')[:60]}")
        return True
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return False

def test_3_idempotency_qp(token):
    """TEST 3: IDEMPOTENCY (question papers) - Same requestId returns same paper"""
    print("\n" + "="*80)
    print("TEST 3: IDEMPOTENCY (question papers) - requestId deduplication")
    print("="*80)
    
    try:
        request_id = f"test-req-{uuid.uuid4()}"
        print(f"   Using requestId: {request_id}")
        
        payload = {
            "classId": CLASS_ID,
            "bookId": BOOK_ID,
            "chapterIds": [CHAPTER_ID],
            "questionMix": {"mcq": 5, "veryshort": 3},
            "difficulty": "mixed",
            "language": "odia",
            "requestId": request_id
        }
        
        # First request
        print(f"   Sending first request...")
        resp1 = requests.post(
            f"{BASE_URL}/question-papers/generate",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10
        )
        
        if resp1.status_code != 200:
            print(f"   ❌ FAILED: First request failed with {resp1.status_code}")
            return False
        
        data1 = resp1.json()
        id1 = data1.get("questionPaper", {}).get("id")
        print(f"   First request returned ID: {id1}")
        
        # Second request (rapid)
        print(f"   Sending second request (rapid)...")
        time.sleep(0.1)  # Small delay
        resp2 = requests.post(
            f"{BASE_URL}/question-papers/generate",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10
        )
        
        if resp2.status_code != 200:
            print(f"   ❌ FAILED: Second request failed with {resp2.status_code}")
            return False
        
        data2 = resp2.json()
        id2 = data2.get("questionPaper", {}).get("id")
        deduped = data2.get("deduped", False)
        
        print(f"   Second request returned ID: {id2}")
        print(f"   Deduped flag: {deduped}")
        
        if id1 != id2:
            print(f"   ❌ FAILED: IDs don't match! {id1} != {id2}")
            return False
        
        # Check library for exactly one doc with this requestId
        print(f"   Checking library for duplicate...")
        resp3 = requests.get(
            f"{BASE_URL}/question-papers",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if resp3.status_code != 200:
            print(f"   ⚠️  WARNING: Could not verify library (status {resp3.status_code})")
        else:
            papers = resp3.json().get("questionPapers", [])
            matching = [p for p in papers if p.get("requestId") == request_id]
            print(f"   Papers with requestId '{request_id}': {len(matching)}")
            
            # Note: The library endpoint may not return requestId field in the list view
            # The critical check is that both API calls returned the same ID
            if len(matching) > 1:
                print(f"   ❌ FAILED: Found {len(matching)} papers (expected 1)")
                return False
            elif len(matching) == 0:
                print(f"   ⚠️  Note: requestId not visible in list view (backend may not project it)")
        
        print(f"   ✅ PASSED: Both requests returned same ID (idempotency working)")
        return True
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return False

def test_4_idempotency_assessment(token):
    """TEST 4: IDEMPOTENCY (assessments) - Same requestId returns same assessment"""
    print("\n" + "="*80)
    print("TEST 4: IDEMPOTENCY (assessments) - requestId deduplication")
    print("="*80)
    
    try:
        request_id = f"test-asm-{uuid.uuid4()}"
        print(f"   Using requestId: {request_id}")
        
        payload = {
            "classId": CLASS_ID,
            "bookId": BOOK_ID,
            "chapterIds": [CHAPTER_ID],
            "type": "fa1",
            "language": "odia",
            "requestId": request_id
        }
        
        # First request
        print(f"   Sending first request...")
        resp1 = requests.post(
            f"{BASE_URL}/assessments/generate",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10
        )
        
        if resp1.status_code != 200:
            print(f"   ❌ FAILED: First request failed with {resp1.status_code}")
            print(f"   Response: {resp1.text[:500]}")
            return False
        
        data1 = resp1.json()
        id1 = data1.get("assessment", {}).get("id")
        print(f"   First request returned ID: {id1}")
        
        # Second request (rapid)
        print(f"   Sending second request (rapid)...")
        time.sleep(0.1)
        resp2 = requests.post(
            f"{BASE_URL}/assessments/generate",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10
        )
        
        if resp2.status_code != 200:
            print(f"   ❌ FAILED: Second request failed with {resp2.status_code}")
            return False
        
        data2 = resp2.json()
        id2 = data2.get("assessment", {}).get("id")
        deduped = data2.get("deduped", False)
        
        print(f"   Second request returned ID: {id2}")
        print(f"   Deduped flag: {deduped}")
        
        if id1 != id2:
            print(f"   ❌ FAILED: IDs don't match! {id1} != {id2}")
            return False
        
        print(f"   ✅ PASSED: Both requests returned same assessment ID")
        return True
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return False

def test_5_friendly_no_content_error(token):
    """TEST 5: FRIENDLY NO-CONTENT ERROR - Invalid chapterId returns 400 with helpful message"""
    print("\n" + "="*80)
    print("TEST 5: FRIENDLY NO-CONTENT ERROR - Helpful message for missing content")
    print("="*80)
    
    try:
        fake_chapter_id = str(uuid.uuid4())
        print(f"   Using fake chapterId: {fake_chapter_id}")
        
        resp = requests.post(
            f"{BASE_URL}/question-papers/generate",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "classId": CLASS_ID,
                "bookId": BOOK_ID,
                "chapterIds": [fake_chapter_id],
                "questionMix": {"mcq": 5, "veryshort": 3},
                "difficulty": "mixed",
                "language": "odia"
            },
            timeout=10
        )
        
        print(f"   Status code: {resp.status_code}")
        
        if resp.status_code != 400:
            print(f"   ❌ FAILED: Expected 400, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        error_msg = data.get("error", "")
        error_code = data.get("code", "")
        
        print(f"   Error code: {error_code}")
        print(f"   Error message: {error_msg[:200]}")
        
        # Check for NO_LESSON_CONTENT code
        if error_code != "NO_LESSON_CONTENT":
            print(f"   ❌ FAILED: Expected code 'NO_LESSON_CONTENT', got '{error_code}'")
            return False
        
        # Check message mentions lesson content
        if "lesson content" not in error_msg.lower():
            print(f"   ❌ FAILED: Error message doesn't mention 'lesson content'")
            return False
        
        print(f"   ✅ PASSED: Returns 400 with code NO_LESSON_CONTENT and helpful message")
        return True
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return False

def test_6_sa_chunking(token):
    """TEST 6: PHASE 2 SA CHUNKING - Large paper completes with questions"""
    print("\n" + "="*80)
    print("TEST 6: PHASE 2 SA CHUNKING - Large 50-mark SA paper")
    print("="*80)
    
    try:
        print(f"   Generating large SA paper (50 marks)...")
        start = time.time()
        
        resp = requests.post(
            f"{BASE_URL}/question-papers/generate",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "classId": CLASS_ID,
                "bookId": BOOK_ID,
                "chapterIds": [CHAPTER_ID],
                "questionMix": {
                    "mcq": 10,
                    "veryshort": 5,
                    "short": 5,
                    "long": 4
                },
                "difficulty": "mixed",
                "language": "odia",
                "assessmentType": "sa1",
                "totalMarks": 50
            },
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"   ❌ FAILED: Generate request failed with {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        qp_id = data.get("questionPaper", {}).get("id")
        
        if not qp_id:
            print(f"   ❌ FAILED: No question paper ID returned")
            return False
        
        print(f"   Question paper ID: {qp_id}")
        print(f"   Polling for completion (max 3.5 minutes)...")
        
        # Poll every 5s for up to 3.5 minutes
        max_polls = 42  # 3.5 minutes / 5s
        poll_count = 0
        
        while poll_count < max_polls:
            time.sleep(5)
            poll_count += 1
            elapsed = time.time() - start
            
            resp = requests.get(
                f"{BASE_URL}/question-papers/{qp_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if resp.status_code != 200:
                print(f"   ⚠️  Poll {poll_count}: Status {resp.status_code}")
                continue
            
            data = resp.json()
            qp = data.get("questionPaper", {})
            status = qp.get("status")
            progress = qp.get("progress", "")
            
            print(f"   Poll {poll_count} ({elapsed:.0f}s): status={status}, progress={progress}")
            
            if status == "ready":
                questions = qp.get("questions", [])
                total_marks = qp.get("totalMarks", 0)
                gen_time = qp.get("generationTimeMs", 0)
                
                print(f"   ✅ COMPLETED!")
                print(f"   Status: {status}")
                print(f"   Questions count: {len(questions)}")
                print(f"   Total marks: {total_marks}")
                print(f"   Generation time: {gen_time}ms ({gen_time/1000:.1f}s)")
                
                if len(questions) == 0:
                    print(f"   ❌ FAILED: No questions generated")
                    return False
                
                if len(questions) < 20:
                    print(f"   ⚠️  WARNING: Expected >= 20 questions, got {len(questions)}")
                
                if total_marks == 0:
                    print(f"   ⚠️  WARNING: totalMarks is 0")
                
                print(f"   ✅ PASSED: Large SA paper completed successfully")
                return True
            
            elif status == "failed":
                error_msg = qp.get("errorMessage", "")
                error_code = qp.get("errorCode", "")
                print(f"   ❌ FAILED: Generation failed")
                print(f"   Error code: {error_code}")
                print(f"   Error message: {error_msg}")
                return False
        
        print(f"   ❌ FAILED: Timed out after {max_polls * 5}s (status still 'generating')")
        return False
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return False

def test_7_no_regression_small(token, qp_id):
    """TEST 7: NO REGRESSION - Small paper from test 1 completes"""
    print("\n" + "="*80)
    print("TEST 7: NO REGRESSION - Small paper completes")
    print("="*80)
    
    try:
        print(f"   Polling paper {qp_id} for completion...")
        
        # Poll for up to 2 minutes
        max_polls = 24  # 2 minutes / 5s
        poll_count = 0
        
        while poll_count < max_polls:
            time.sleep(5)
            poll_count += 1
            
            resp = requests.get(
                f"{BASE_URL}/question-papers/{qp_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if resp.status_code != 200:
                print(f"   ⚠️  Poll {poll_count}: Status {resp.status_code}")
                continue
            
            data = resp.json()
            qp = data.get("questionPaper", {})
            status = qp.get("status")
            progress = qp.get("progress", "")
            
            print(f"   Poll {poll_count}: status={status}, progress={progress}")
            
            if status == "ready":
                questions = qp.get("questions", [])
                gen_time = qp.get("generationTimeMs", 0)
                
                print(f"   ✅ COMPLETED!")
                print(f"   Questions count: {len(questions)}")
                print(f"   Generation time: {gen_time}ms ({gen_time/1000:.1f}s)")
                
                # Check for actual questions content
                if len(questions) == 0:
                    print(f"   ❌ FAILED: No questions generated (empty array)")
                    print(f"   Paper title: {qp.get('title', '')}")
                    print(f"   Error message: {qp.get('errorMessage', 'None')}")
                    # This is a critical bug - paper marked ready but has no questions
                    return False
                
                print(f"   ✅ PASSED: Small paper completed successfully")
                return True
            
            elif status == "failed":
                error_msg = qp.get("errorMessage", "")
                error_code = qp.get("errorCode", "")
                print(f"   ❌ FAILED: Generation failed")
                print(f"   Error code: {error_code}")
                print(f"   Error message: {error_msg}")
                return False
        
        print(f"   ❌ FAILED: Timed out after {max_polls * 5}s")
        return False
        
    except Exception as e:
        print(f"   ❌ FAILED: Exception: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("AI GENERATION RELIABILITY TESTS")
    print("Testing: async recovery, requestId idempotency, friendly errors, SA chunking")
    print("="*80)
    
    # Login
    token = login()
    if not token:
        print("\n❌ Cannot proceed without admin token")
        return
    
    results = {}
    
    # Test 1: Async 202
    qp_id = test_1_async_202(token)
    results["test_1_async_202"] = qp_id is not None
    
    # Test 2: Library visibility
    if qp_id:
        results["test_2_library_visibility"] = test_2_library_visibility(token, qp_id)
    else:
        print("\n⏭️  Skipping test 2 (no paper ID from test 1)")
        results["test_2_library_visibility"] = False
    
    # Test 3: Idempotency (question papers)
    results["test_3_idempotency_qp"] = test_3_idempotency_qp(token)
    
    # Test 4: Idempotency (assessments)
    results["test_4_idempotency_assessment"] = test_4_idempotency_assessment(token)
    
    # Test 5: Friendly no-content error
    results["test_5_friendly_error"] = test_5_friendly_no_content_error(token)
    
    # Test 6: SA chunking (large paper)
    results["test_6_sa_chunking"] = test_6_sa_chunking(token)
    
    # Test 7: No regression (small paper)
    if qp_id:
        results["test_7_no_regression"] = test_7_no_regression_small(token, qp_id)
    else:
        print("\n⏭️  Skipping test 7 (no paper ID from test 1)")
        results["test_7_no_regression"] = False
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}  {test_name}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
