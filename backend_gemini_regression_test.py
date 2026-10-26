#!/usr/bin/env python3
"""
🚨 URGENT REGRESSION TEST — Gemini generation was completely broken; fixes applied.

SCOPE (STRICTLY LIMITED):
- POST /api/lessons/:id/worksheets (custom worksheets)
- POST /api/assessments/build (assessment builder)
- POST /api/assessments/generate (assessment generate)  
- POST /api/resources/generate (resources generate)
- AI Credit gating regression
- Timing sanity check

DO NOT test unrelated endpoints like lessons, chapters, LO codes, subscription, OTP, etc.

CONTEXT:
- Base URL: use NEXT_PUBLIC_BASE_URL from /app/.env
- Admin creds: mobile 9692604577, password <redacted>
- Fixes in /app/lib/gemini.js:
  a) MODEL_PREFERENCE reordered (working models first)
  b) Dropped responseSchema from Gemini calls
  c) Added Odia/Devanagari/Bengali digit normalization
  d) thinkingConfig.thinkingBudget=0 + maxOutputTokens=65536
  e) maxModelAttempts 4→8
"""

import requests
import time
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login():
    """Login and return token"""
    print("\n=== Test 1: Admin Login ===")
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"❌ Login failed: {r.text}")
        sys.exit(1)
    data = r.json()
    token = data.get("token")
    user = data.get("user", {})
    print(f"✅ Login successful")
    print(f"   User: {user.get('name')} ({user.get('mobile')})")
    print(f"   Role: {user.get('role')}")
    print(f"   Token: {token[:30]}...")
    return token

def get_real_lesson_id(token):
    """Get a real lesson ID from the database"""
    print("\n=== Getting Real Lesson ID ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get first lesson with limit=1
    r = requests.get(f"{BASE_URL}/lessons?limit=1", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get lessons: {r.status_code}")
        return None
    
    data = r.json()
    lessons = data.get("lessons", [])
    if not lessons:
        print(f"❌ No lessons found in database")
        return None
    
    lesson = lessons[0]
    lesson_id = lesson.get("id")
    print(f"✅ Found lesson: {lesson.get('title', 'Untitled')}")
    print(f"   ID: {lesson_id}")
    print(f"   Class: {lesson.get('classId')}")
    print(f"   Book: {lesson.get('bookId')}")
    print(f"   Chapter: {lesson.get('chapterId')}")
    return lesson_id

def test_custom_worksheets(token, lesson_id):
    """
    Test 1: Custom Worksheets — POST /api/lessons/:id/worksheets
    Test 4 combos with force:true to bypass cache
    """
    print("\n" + "="*70)
    print("TEST 1: CUSTOM WORKSHEETS — POST /api/lessons/:id/worksheets")
    print("="*70)
    
    headers = {"Authorization": f"Bearer {token}"}
    results = []
    latencies = []
    
    test_cases = [
        {
            "name": "homework / mcq / medium / 5 questions",
            "payload": {
                "type": "homework",
                "format": "mcq",
                "difficulty": "medium",
                "count": 5,
                "force": True
            },
            "expected_count": 5
        },
        {
            "name": "practice / fill / hard / 10 questions",
            "payload": {
                "type": "practice",
                "format": "fill",
                "difficulty": "hard",
                "count": 10,
                "force": True
            },
            "expected_count": 10
        },
        {
            "name": "hots / short / medium / 8 questions",
            "payload": {
                "type": "hots",
                "format": "short",
                "difficulty": "medium",
                "count": 8,
                "force": True
            },
            "expected_count": 8
        },
        {
            "name": "assessment / truefalse / easy / 6 questions",
            "payload": {
                "type": "assessment",
                "format": "truefalse",
                "difficulty": "easy",
                "count": 6,
                "force": True
            },
            "expected_count": 6
        }
    ]
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test['name']} ---")
        start = time.time()
        
        try:
            r = requests.post(
                f"{BASE_URL}/lessons/{lesson_id}/worksheets",
                json=test["payload"],
                headers=headers,
                timeout=60
            )
            elapsed = time.time() - start
            latencies.append(elapsed)
            
            print(f"Status: {r.status_code}")
            print(f"Latency: {elapsed:.1f}s")
            
            if r.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                results.append(False)
                continue
            
            data = r.json()
            worksheet = data.get("worksheet", {})
            questions = worksheet.get("questions", [])
            language = worksheet.get("language", "")
            title = worksheet.get("title", "")
            
            print(f"✅ Response: 200 OK")
            print(f"   Title: {title[:60]}...")
            print(f"   Language: {language}")
            print(f"   Questions: {len(questions)}")
            
            # Verify question count
            if len(questions) != test["expected_count"]:
                print(f"❌ FAIL: Expected {test['expected_count']} questions, got {len(questions)}")
                results.append(False)
                continue
            
            # Verify structure
            if not title:
                print(f"❌ FAIL: Missing title")
                results.append(False)
                continue
            
            if not language:
                print(f"❌ FAIL: Missing language")
                results.append(False)
                continue
            
            # Check first question structure
            if questions:
                q1 = questions[0]
                # Handle different question field names based on format
                q_text = q1.get('question', q1.get('q', q1.get('statement', '')))
                # Handle question_number as string or int
                q_num = q1.get('question_number', '')
                if isinstance(q_num, int):
                    q_num = str(q_num)
                
                print(f"   Sample Q1: {q_text[:80]}...")
                if not q_text:
                    print(f"❌ FAIL: Question missing 'question', 'q', or 'statement' field")
                    print(f"   Question structure: {list(q1.keys())}")
                    results.append(False)
                    continue
            
            print(f"✅ PASS: All checks passed")
            results.append(True)
            
        except requests.exceptions.Timeout:
            elapsed = time.time() - start
            print(f"❌ FAIL: Request timed out after {elapsed:.1f}s")
            results.append(False)
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            results.append(False)
    
    # Summary
    print(f"\n--- Custom Worksheets Summary ---")
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    if latencies:
        avg_latency = sum(latencies) / len(latencies)
        print(f"Average latency: {avg_latency:.1f}s")
        print(f"Max latency: {max(latencies):.1f}s")
    
    return all(results), latencies

def test_assessment_builder(token, lesson_id):
    """
    Test 2: Assessment Builder — POST /api/assessments/build
    Test 3 combos, poll until status='ready'
    """
    print("\n" + "="*70)
    print("TEST 2: ASSESSMENT BUILDER — POST /api/assessments/build")
    print("="*70)
    
    headers = {"Authorization": f"Bearer {token}"}
    results = []
    latencies = []
    
    # First get lesson details to get classId, bookId, chapterId
    r = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get lesson details: {r.status_code}")
        return False, []
    
    lesson_data = r.json()
    lesson = lesson_data.get("lesson", {})
    class_id = lesson.get("classId")
    book_id = lesson.get("bookId")
    chapter_id = lesson.get("chapterId")
    
    print(f"Using lesson context:")
    print(f"   Class: {class_id}")
    print(f"   Book: {book_id}")
    print(f"   Chapter: {chapter_id}")
    
    test_cases = [
        {
            "name": "fa1 / 25 marks / mcq+fill",
            "payload": {
                "assessmentType": "fa1",
                "totalMarks": 25,
                "writtenTypes": ["mcq", "fill"],
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id]
            }
        },
        {
            "name": "sa1 / 50 marks",
            "payload": {
                "assessmentType": "sa1",
                "totalMarks": 50,
                "writtenTypes": ["mcq", "short"],
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id]
            }
        },
        {
            "name": "practice / 30 marks",
            "payload": {
                "assessmentType": "practice",
                "totalMarks": 30,
                "writtenTypes": ["fill", "truefalse"],
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id]
            }
        }
    ]
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test['name']} ---")
        start = time.time()
        
        try:
            # POST to create assessment
            r = requests.post(
                f"{BASE_URL}/assessments/build",
                json=test["payload"],
                headers=headers,
                timeout=10
            )
            
            print(f"Status: {r.status_code}")
            
            if r.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                results.append(False)
                continue
            
            data = r.json()
            assessment = data.get("assessment", {})
            assessment_id = assessment.get("id")
            status = data.get("status", "pending")
            
            print(f"✅ Response: 200 OK")
            print(f"   Assessment ID: {assessment_id}")
            print(f"   Initial status: {status}")
            
            # Poll until ready (max 60s)
            print(f"   Polling for status='ready'...")
            poll_count = 0
            max_polls = 12  # 12 * 5s = 60s
            final_status = status
            
            while poll_count < max_polls and final_status not in ["ready", "failed"]:
                time.sleep(5)
                poll_count += 1
                
                r = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=headers)
                if r.status_code != 200:
                    print(f"   ❌ Poll failed: {r.status_code}")
                    break
                
                poll_data = r.json()
                assessment = poll_data.get("assessment", {})
                final_status = assessment.get("status")
                progress = assessment.get("progress", "")
                
                print(f"   Poll {poll_count}: status={final_status}, progress={progress}")
                
                if final_status == "ready":
                    elapsed = time.time() - start
                    latencies.append(elapsed)
                    
                    sections = assessment.get("sections", [])
                    questions = assessment.get("questions", [])
                    print(f"✅ PASS: Assessment ready in {elapsed:.1f}s")
                    print(f"   Sections: {len(sections)}")
                    print(f"   Questions: {len(questions)}")
                    
                    # For builder mode, check sections; for generate mode, check questions
                    if len(sections) > 0 or len(questions) > 0:
                        print(f"   ✅ Content populated")
                        results.append(True)
                    else:
                        print(f"   ❌ FAIL: No sections or questions found")
                        results.append(False)
                    break
                
                if final_status == "failed":
                    error = assessment.get("errorMessage", "Unknown error")
                    print(f"   ❌ FAIL: Assessment generation failed: {error}")
                    results.append(False)
                    break
            
            if poll_count >= max_polls and final_status not in ["ready", "failed"]:
                print(f"   ❌ FAIL: Timeout after {max_polls * 5}s, status still '{final_status}'")
                results.append(False)
            
        except requests.exceptions.Timeout:
            print(f"❌ FAIL: Request timed out")
            results.append(False)
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            results.append(False)
    
    # Summary
    print(f"\n--- Assessment Builder Summary ---")
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    if latencies:
        avg_latency = sum(latencies) / len(latencies)
        print(f"Average latency: {avg_latency:.1f}s")
    
    return all(results), latencies

def test_assessment_generate(token, lesson_id):
    """
    Test 3: Assessment Generate — POST /api/assessments/generate
    Verify admin bypass works
    """
    print("\n" + "="*70)
    print("TEST 3: ASSESSMENT GENERATE — POST /api/assessments/generate")
    print("="*70)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get lesson details
    r = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get lesson details: {r.status_code}")
        return False, []
    
    lesson_data = r.json()
    lesson = lesson_data.get("lesson", {})
    class_id = lesson.get("classId")
    book_id = lesson.get("bookId")
    chapter_id = lesson.get("chapterId")
    
    print(f"Using lesson context:")
    print(f"   Class: {class_id}")
    print(f"   Book: {book_id}")
    print(f"   Chapter: {chapter_id}")
    
    payload = {
        "classId": class_id,
        "bookId": book_id,
        "chapterIds": [chapter_id],
        "type": "fa1",
        "language": "odia"
    }
    
    print(f"\nGenerating assessment...")
    start = time.time()
    
    try:
        r = requests.post(
            f"{BASE_URL}/assessments/generate",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False, []
        
        data = r.json()
        assessment_id = data.get("assessment", {}).get("id")
        status = data.get("status")
        
        print(f"✅ Response: 200 OK (admin bypass working)")
        print(f"   Assessment ID: {assessment_id}")
        print(f"   Initial status: {status}")
        
        # If already ready, check immediately
        if status == "ready":
            r = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=headers)
            if r.status_code == 200:
                poll_data = r.json()
                assessment = poll_data.get("assessment", {})
                sections = assessment.get("sections", [])
                questions = assessment.get("questions", [])
                print(f"✅ Assessment already ready")
                print(f"   Sections: {len(sections)}")
                print(f"   Questions: {len(questions)}")
                
                if len(sections) > 0 or len(questions) > 0:
                    print(f"   ✅ Content generated successfully")
                    return True, [0]
                else:
                    print(f"   ❌ FAIL: No sections or questions found")
                    return False, []
        
        # Poll until ready
        print(f"   Polling for status='ready'...")
        poll_count = 0
        max_polls = 12
        final_status = status
        
        while poll_count < max_polls and final_status not in ["ready", "failed"]:
            time.sleep(5)
            poll_count += 1
            
            r = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=headers)
            if r.status_code != 200:
                print(f"   ❌ Poll failed: {r.status_code}")
                break
            
            poll_data = r.json()
            assessment = poll_data.get("assessment", {})
            final_status = assessment.get("status")
            progress = assessment.get("progress", "")
            
            print(f"   Poll {poll_count}: status={final_status}, progress={progress}")
            
            if final_status == "ready":
                elapsed = time.time() - start
                
                sections = assessment.get("sections", [])
                questions = assessment.get("questions", [])
                print(f"✅ PASS: Assessment ready in {elapsed:.1f}s")
                print(f"   Sections: {len(sections)}")
                print(f"   Questions: {len(questions)}")
                
                if len(sections) > 0 or len(questions) > 0:
                    print(f"   ✅ Content generated successfully")
                    return True, [elapsed]
                else:
                    print(f"   ❌ FAIL: No sections or questions found")
                    return False, []
            
            if final_status == "failed":
                error = assessment.get("errorMessage", "Unknown error")
                print(f"   ❌ FAIL: Assessment generation failed: {error}")
                return False, []
        
        if poll_count >= max_polls:
            print(f"   ❌ FAIL: Timeout after {max_polls * 5}s")
            return False, []
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, []

def test_resources_generate(token, lesson_id):
    """
    Test 4: Resources Generate — POST /api/resources/generate
    Test activity-sheet and hots-questions
    """
    print("\n" + "="*70)
    print("TEST 4: RESOURCES GENERATE — POST /api/resources/generate")
    print("="*70)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get lesson details for classId, bookId, chapterId
    r = requests.get(f"{BASE_URL}/lessons/{lesson_id}", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get lesson details: {r.status_code}")
        return False, []
    
    lesson_data = r.json()
    lesson = lesson_data.get("lesson", {})
    class_id = lesson.get("classId")
    book_id = lesson.get("bookId")
    chapter_id = lesson.get("chapterId")
    
    print(f"Using lesson context:")
    print(f"   Class: {class_id}")
    print(f"   Book: {book_id}")
    print(f"   Chapter: {chapter_id}")
    
    results = []
    
    test_cases = [
        {
            "name": "activity-sheet",
            "payload": {
                "resourceType": "activity-sheet",
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id]
            }
        },
        {
            "name": "hots-questions",
            "payload": {
                "resourceType": "hots-questions",
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id]
            }
        }
    ]
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test['name']} ---")
        
        try:
            r = requests.post(
                f"{BASE_URL}/resources/generate",
                json=test["payload"],
                headers=headers,
                timeout=60
            )
            
            print(f"Status: {r.status_code}")
            
            if r.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {r.status_code}")
                print(f"Response: {r.text[:500]}")
                results.append(False)
                continue
            
            data = r.json()
            print(f"✅ PASS: Resource generated successfully")
            print(f"   Response keys: {list(data.keys())}")
            results.append(True)
            
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            results.append(False)
    
    # Summary
    print(f"\n--- Resources Generate Summary ---")
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    return all(results), []

def test_ai_credit_gating(token):
    """
    Test 5: AI Credit gating regression
    Create fresh 0-credit user and verify 402 responses
    """
    print("\n" + "="*70)
    print("TEST 5: AI CREDIT GATING REGRESSION")
    print("="*70)
    
    # Register fresh user
    print("\n--- Creating fresh 0-credit user ---")
    fresh_mobile = f"99{int(time.time()) % 100000000}"
    
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": fresh_mobile,
            "password": "test123"
        })
        
        if r.status_code != 200:
            print(f"❌ Failed to register user: {r.status_code}")
            return False
        
        data = r.json()
        fresh_token = data.get("token")
        print(f"✅ User registered: {fresh_mobile}")
        print(f"   Token: {fresh_token[:30]}...")
        
        headers = {"Authorization": f"Bearer {fresh_token}"}
        
        # Get a lesson ID
        r = requests.get(f"{BASE_URL}/lessons?limit=1", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to get lessons: {r.status_code}")
            return False
        
        lessons = r.json().get("lessons", [])
        if not lessons:
            print(f"❌ No lessons found")
            return False
        
        lesson_id = lessons[0].get("id")
        class_id = lessons[0].get("classId")
        book_id = lessons[0].get("bookId")
        chapter_id = lessons[0].get("chapterId")
        
        results = []
        
        # Test 1: POST /worksheets on 0-credit user → 402
        print(f"\n--- Test 1: POST /worksheets (0-credit user) ---")
        r = requests.post(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets",
            json={"type": "homework", "format": "mcq", "difficulty": "easy", "count": 5},
            headers=headers,
            timeout=10
        )
        print(f"Status: {r.status_code}")
        if r.status_code == 402:
            data = r.json()
            code = data.get("code")
            print(f"✅ PASS: Got 402 with code={code}")
            results.append(code == "INSUFFICIENT_AI_CREDITS")
        else:
            print(f"❌ FAIL: Expected 402, got {r.status_code}")
            results.append(False)
        
        # Test 2: POST /assessments/build on 0-credit user → 402
        print(f"\n--- Test 2: POST /assessments/build (0-credit user) ---")
        r = requests.post(
            f"{BASE_URL}/assessments/build",
            json={
                "assessmentType": "fa1",
                "totalMarks": 25,
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id]
            },
            headers=headers,
            timeout=10
        )
        print(f"Status: {r.status_code}")
        if r.status_code == 402:
            data = r.json()
            code = data.get("code")
            print(f"✅ PASS: Got 402 with code={code}")
            results.append(code == "INSUFFICIENT_AI_CREDITS")
        else:
            print(f"❌ FAIL: Expected 402, got {r.status_code}")
            results.append(False)
        
        # Test 3: POST /assessments/generate on 0-credit user → 402
        print(f"\n--- Test 3: POST /assessments/generate (0-credit user) ---")
        r = requests.post(
            f"{BASE_URL}/assessments/generate",
            json={
                "classId": class_id,
                "bookId": book_id,
                "chapterIds": [chapter_id],
                "type": "fa1",
                "language": "odia"
            },
            headers=headers,
            timeout=10
        )
        print(f"Status: {r.status_code}")
        if r.status_code == 402:
            data = r.json()
            code = data.get("code")
            print(f"✅ PASS: Got 402 with code={code}")
            results.append(code == "INSUFFICIENT_AI_CREDITS")
        else:
            print(f"❌ FAIL: Expected 402, got {r.status_code}")
            results.append(False)
        
        # Summary
        print(f"\n--- AI Credit Gating Summary ---")
        passed = sum(results)
        total = len(results)
        print(f"Passed: {passed}/{total}")
        
        return all(results)
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def main():
    print("=" * 70)
    print("🚨 URGENT REGRESSION TEST — Gemini Generation")
    print("=" * 70)
    print("\nFixes applied in /app/lib/gemini.js:")
    print("  a) MODEL_PREFERENCE reordered (working models first)")
    print("  b) Dropped responseSchema from Gemini calls")
    print("  c) Added Odia/Devanagari/Bengali digit normalization")
    print("  d) thinkingConfig.thinkingBudget=0 + maxOutputTokens=65536")
    print("  e) maxModelAttempts 4→8")
    print("=" * 70)
    
    try:
        # Login
        token = login()
        
        # Get real lesson ID
        lesson_id = get_real_lesson_id(token)
        if not lesson_id:
            print("\n❌ Cannot proceed without lesson ID")
            sys.exit(1)
        
        # Run tests
        all_latencies = []
        
        test1_pass, test1_latencies = test_custom_worksheets(token, lesson_id)
        all_latencies.extend(test1_latencies)
        
        test2_pass, test2_latencies = test_assessment_builder(token, lesson_id)
        all_latencies.extend(test2_latencies)
        
        test3_pass, test3_latencies = test_assessment_generate(token, lesson_id)
        all_latencies.extend(test3_latencies)
        
        test4_pass, test4_latencies = test_resources_generate(token, lesson_id)
        
        test5_pass = test_ai_credit_gating(token)
        
        # Timing sanity check
        print("\n" + "="*70)
        print("TEST 6: TIMING SANITY CHECK")
        print("="*70)
        
        if all_latencies:
            avg_latency = sum(all_latencies) / len(all_latencies)
            max_latency = max(all_latencies)
            timeouts = [l for l in all_latencies if l > 60]
            
            print(f"Average latency: {avg_latency:.1f}s")
            print(f"Max latency: {max_latency:.1f}s")
            print(f"Timeouts (>60s): {len(timeouts)}")
            
            if avg_latency < 30:
                print(f"✅ PASS: Average latency < 30s")
                timing_pass = True
            else:
                print(f"⚠️ WARNING: Average latency > 30s")
                timing_pass = True  # Still pass if no timeouts
            
            if len(timeouts) > 0:
                print(f"❌ FAIL: {len(timeouts)} requests timed out")
                timing_pass = False
        else:
            print(f"⚠️ No latency data collected")
            timing_pass = True
        
        # Final summary
        print("\n" + "="*70)
        print("FINAL RESULTS")
        print("="*70)
        
        results = {
            "1. Custom Worksheets": test1_pass,
            "2. Assessment Builder": test2_pass,
            "3. Assessment Generate": test3_pass,
            "4. Resources Generate": test4_pass,
            "5. AI Credit Gating": test5_pass,
            "6. Timing Sanity Check": timing_pass
        }
        
        for test_name, passed in results.items():
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{test_name}: {status}")
        
        all_passed = all(results.values())
        
        print("\n" + "="*70)
        if all_passed:
            print("✅ ALL TESTS PASSED — Gemini generation is working correctly")
        else:
            failed_count = sum(1 for v in results.values() if not v)
            print(f"❌ {failed_count}/{len(results)} TESTS FAILED")
        print("="*70)
        
        sys.exit(0 if all_passed else 1)
        
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
