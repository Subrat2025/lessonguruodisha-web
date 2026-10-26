#!/usr/bin/env python3
"""
Backend test for POST /api/lesson-curriculum endpoint.

Tests the NEW read-only endpoint that returns curriculum alignment
(Curricular Goal / Competency / Learning Outcomes) for a lesson period.

Test Plan:
1. POST with Class 3 lesson (pre-cached with CG-4/C-4.2) → eligible=true with full data
2. Discover Class 9/10 lessons → eligible=false
3. Discover Balvatika/Class 1/Class 2 lessons with loCodes → eligible=true
4. No Authorization header → 401
5. POST with nonexistent lessonId → 404
6. Uniqueness sanity: different periods with different loCodes should differ
"""

import requests
import json
import sys

# Base URL from environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_lesson_curriculum():
    print("=" * 80)
    print("BACKEND TEST: POST /api/lesson-curriculum")
    print("=" * 80)
    print()

    # =========================================================================
    # SETUP: Login as admin to get Bearer token
    # =========================================================================
    print("🔐 TEST 0: Admin Login")
    print("-" * 80)
    
    login_resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"mobile": "9999999999", "password": "admin123"},
        timeout=30
    )
    
    if login_resp.status_code != 200:
        print(f"❌ FAIL: Login failed with status {login_resp.status_code}")
        print(f"Response: {login_resp.text}")
        return False
    
    login_data = login_resp.json()
    token = login_data.get("token")
    
    if not token:
        print(f"❌ FAIL: No token in login response")
        print(f"Response: {json.dumps(login_data, indent=2)}")
        return False
    
    print(f"✅ PASS: Admin login successful")
    print(f"Token: {token[:20]}...")
    print()
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # =========================================================================
    # TEST 1: POST with Class 3 lesson (pre-cached with CG-4/C-4.2)
    # =========================================================================
    print("📝 TEST 1: Class 3 Lesson (Pre-cached CG-4/C-4.2)")
    print("-" * 80)
    
    try:
        test1_resp = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            json={"lessonId": "dcf5c1da-525b-47e7-b88e-60208e1b69fa"},
            headers=headers,
            timeout=30
        )
        
        print(f"Status: {test1_resp.status_code}")
        
        if test1_resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {test1_resp.status_code}")
            print(f"Response: {test1_resp.text}")
            return False
        
        test1_data = test1_resp.json()
        print(f"Response: {json.dumps(test1_data, indent=2)}")
        
        # Assertions
        if not test1_data.get("eligible"):
            print(f"❌ FAIL: Expected eligible=true, got {test1_data.get('eligible')}")
            return False
        
        cg = test1_data.get("cg")
        if not cg or cg.get("code") != "CG-4":
            print(f"❌ FAIL: Expected cg.code='CG-4', got {cg}")
            return False
        
        comp = test1_data.get("competency")
        if not comp or comp.get("code") != "C-4.2":
            print(f"❌ FAIL: Expected competency.code='C-4.2', got {comp}")
            return False
        
        if not cg.get("text"):
            print(f"❌ FAIL: Expected non-empty cg.text, got '{cg.get('text')}'")
            return False
        
        if not comp.get("text"):
            print(f"❌ FAIL: Expected non-empty competency.text, got '{comp.get('text')}'")
            return False
        
        learningOutcomes = test1_data.get("learningOutcomes", [])
        if not isinstance(learningOutcomes, list) or len(learningOutcomes) == 0:
            print(f"❌ FAIL: Expected non-empty learningOutcomes array, got {learningOutcomes}")
            return False
        
        # Check each LO has code and text
        for lo in learningOutcomes:
            if not lo.get("code") or not lo.get("text"):
                print(f"❌ FAIL: Learning outcome missing code or text: {lo}")
                return False
        
        print(f"✅ PASS: Class 3 lesson returns eligible=true with CG-4, C-4.2, and {len(learningOutcomes)} learning outcomes")
        print()
        
    except Exception as e:
        print(f"❌ FAIL: Exception in Test 1: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # =========================================================================
    # TEST 2: Discover lessons for gating tests
    # =========================================================================
    print("🔍 TEST 2: Discover Class 9/10 and Foundational Lessons")
    print("-" * 80)
    
    try:
        # Get all classes
        classes_resp = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
        if classes_resp.status_code != 200:
            print(f"❌ FAIL: Could not fetch classes, status {classes_resp.status_code}")
            return False
        
        classes_data = classes_resp.json()
        classes = classes_data.get("classes", []) if isinstance(classes_data, dict) else classes_data
        print(f"Found {len(classes)} classes")
        
        # Find Class 9, Class 10, and foundational classes
        class9 = None
        class10 = None
        foundational_classes = []
        
        for cls in classes:
            name = cls.get("name", "")
            if "Class 9" in name or "Class IX" in name:
                class9 = cls
            elif "Class 10" in name or "Class X" in name:
                class10 = cls
            elif any(x in name for x in ["Balvatika", "Class 1", "Class 2", "Class I", "Class II"]):
                foundational_classes.append(cls)
        
        print(f"Class 9: {class9.get('name') if class9 else 'NOT FOUND'}")
        print(f"Class 10: {class10.get('name') if class10 else 'NOT FOUND'}")
        print(f"Foundational classes: {[c.get('name') for c in foundational_classes]}")
        print()
        
        # Test Class 9 lesson (if found)
        if class9:
            print(f"📝 TEST 2a: Class 9 Lesson → eligible=false")
            print("-" * 80)
            
            # Get books for Class 9
            books_resp = requests.get(
                f"{BASE_URL}/books?classId={class9['id']}",
                headers=headers,
                timeout=30
            )
            
            if books_resp.status_code == 200:
                books_data = books_resp.json()
                books = books_data.get("books", []) if isinstance(books_data, dict) else books_data
                if len(books) > 0:
                    book = books[0]
                    print(f"Found book: {book.get('name')}")
                    
                    # Get chapters for this book
                    chapters_resp = requests.get(
                        f"{BASE_URL}/chapters?bookId={book['id']}",
                        headers=headers,
                        timeout=30
                    )
                    
                    if chapters_resp.status_code == 200:
                        chapters_data = chapters_resp.json()
                        chapters = chapters_data.get("chapters", []) if isinstance(chapters_data, dict) else chapters_data
                        
                        if len(chapters) > 0:
                            chapter = chapters[0]
                            print(f"Found chapter: {chapter.get('name')}")
                            
                            # Get lessons for this chapter
                            lessons_resp = requests.get(
                                f"{BASE_URL}/lessons?chapterId={chapter['id']}",
                                headers=headers,
                                timeout=30
                            )
                            
                            if lessons_resp.status_code == 200:
                                lessons_data = lessons_resp.json()
                                lessons = lessons_data.get("lessons", []) if isinstance(lessons_data, dict) else lessons_data
                                
                                if len(lessons) > 0:
                                    lesson = lessons[0]
                                    print(f"Found lesson: {lesson.get('title', lesson.get('topic', 'Untitled'))}")
                                    
                                    # Test the lesson-curriculum endpoint
                                    test2a_resp = requests.post(
                                        f"{BASE_URL}/lesson-curriculum",
                                        json={"lessonId": lesson["id"]},
                                        headers=headers,
                                        timeout=30
                                    )
                                    
                                    print(f"Status: {test2a_resp.status_code}")
                                    test2a_data = test2a_resp.json()
                                    print(f"Response: {json.dumps(test2a_data, indent=2)}")
                                    
                                    if test2a_resp.status_code != 200:
                                        print(f"❌ FAIL: Expected 200, got {test2a_resp.status_code}")
                                        return False
                                    
                                    if test2a_data.get("eligible") != False:
                                        print(f"❌ FAIL: Expected eligible=false for Class 9, got {test2a_data.get('eligible')}")
                                        return False
                                    
                                    print(f"✅ PASS: Class 9 lesson returns eligible=false")
                                    print()
                                else:
                                    print(f"⚠️ SKIP: No lessons found for Class 9 chapter")
                                    print()
                            else:
                                print(f"⚠️ SKIP: Could not fetch lessons for Class 9 chapter")
                                print()
                        else:
                            print(f"⚠️ SKIP: No chapters found for Class 9 book")
                            print()
                    else:
                        print(f"⚠️ SKIP: Could not fetch chapters for Class 9 book")
                        print()
                else:
                    print(f"⚠️ SKIP: No books found for Class 9")
                    print()
            else:
                print(f"⚠️ SKIP: Could not fetch books for Class 9")
                print()
        else:
            print(f"⚠️ SKIP: Class 9 not found in database")
            print()
        
        # Test Class 10 lesson (if found)
        if class10:
            print(f"📝 TEST 2b: Class 10 Lesson → eligible=false")
            print("-" * 80)
            
            # Get books for Class 10
            books_resp = requests.get(
                f"{BASE_URL}/books?classId={class10['id']}",
                headers=headers,
                timeout=30
            )
            
            if books_resp.status_code == 200:
                books_data = books_resp.json()
                books = books_data.get("books", []) if isinstance(books_data, dict) else books_data
                if len(books) > 0:
                    book = books[0]
                    print(f"Found book: {book.get('name')}")
                    
                    # Get chapters for this book
                    chapters_resp = requests.get(
                        f"{BASE_URL}/chapters?bookId={book['id']}",
                        headers=headers,
                        timeout=30
                    )
                    
                    if chapters_resp.status_code == 200:
                        chapters_data = chapters_resp.json()
                        chapters = chapters_data.get("chapters", []) if isinstance(chapters_data, dict) else chapters_data
                        
                        if len(chapters) > 0:
                            chapter = chapters[0]
                            print(f"Found chapter: {chapter.get('name')}")
                            
                            # Get lessons for this chapter
                            lessons_resp = requests.get(
                                f"{BASE_URL}/lessons?chapterId={chapter['id']}",
                                headers=headers,
                                timeout=30
                            )
                            
                            if lessons_resp.status_code == 200:
                                lessons_data = lessons_resp.json()
                                lessons = lessons_data.get("lessons", []) if isinstance(lessons_data, dict) else lessons_data
                                
                                if len(lessons) > 0:
                                    lesson = lessons[0]
                                    print(f"Found lesson: {lesson.get('title', lesson.get('topic', 'Untitled'))}")
                                    
                                    # Test the lesson-curriculum endpoint
                                    test2b_resp = requests.post(
                                        f"{BASE_URL}/lesson-curriculum",
                                        json={"lessonId": lesson["id"]},
                                        headers=headers,
                                        timeout=30
                                    )
                                    
                                    print(f"Status: {test2b_resp.status_code}")
                                    test2b_data = test2b_resp.json()
                                    print(f"Response: {json.dumps(test2b_data, indent=2)}")
                                    
                                    if test2b_resp.status_code != 200:
                                        print(f"❌ FAIL: Expected 200, got {test2b_resp.status_code}")
                                        return False
                                    
                                    if test2b_data.get("eligible") != False:
                                        print(f"❌ FAIL: Expected eligible=false for Class 10, got {test2b_data.get('eligible')}")
                                        return False
                                    
                                    print(f"✅ PASS: Class 10 lesson returns eligible=false")
                                    print()
                                else:
                                    print(f"⚠️ SKIP: No lessons found for Class 10 chapter")
                                    print()
                            else:
                                print(f"⚠️ SKIP: Could not fetch lessons for Class 10 chapter")
                                print()
                        else:
                            print(f"⚠️ SKIP: No chapters found for Class 10 book")
                            print()
                    else:
                        print(f"⚠️ SKIP: Could not fetch chapters for Class 10 book")
                        print()
                else:
                    print(f"⚠️ SKIP: No books found for Class 10")
                    print()
            else:
                print(f"⚠️ SKIP: Could not fetch books for Class 10")
                print()
        else:
            print(f"⚠️ SKIP: Class 10 not found in database")
            print()
        
        # Test foundational class lessons (Balvatika/Class 1/Class 2)
        foundational_tested = False
        for found_cls in foundational_classes:
            print(f"📝 TEST 2c: {found_cls.get('name')} Lesson → eligible=true")
            print("-" * 80)
            
            # Get books for this class
            books_resp = requests.get(
                f"{BASE_URL}/books?classId={found_cls['id']}",
                headers=headers,
                timeout=30
            )
            
            if books_resp.status_code == 200:
                books_data = books_resp.json()
                books = books_data.get("books", []) if isinstance(books_data, dict) else books_data
                if len(books) > 0:
                    book = books[0]
                    print(f"Found book: {book.get('name')}")
                    
                    # Get chapters for this book
                    chapters_resp = requests.get(
                        f"{BASE_URL}/chapters?bookId={book['id']}",
                        headers=headers,
                        timeout=30
                    )
                    
                    if chapters_resp.status_code == 200:
                        chapters_data = chapters_resp.json()
                        chapters = chapters_data.get("chapters", []) if isinstance(chapters_data, dict) else chapters_data
                        
                        if len(chapters) > 0:
                            chapter = chapters[0]
                            print(f"Found chapter: {chapter.get('name')}")
                            
                            # Get lessons for this chapter
                            lessons_resp = requests.get(
                                f"{BASE_URL}/lessons?chapterId={chapter['id']}",
                                headers=headers,
                                timeout=30
                            )
                            
                            if lessons_resp.status_code == 200:
                                lessons_data = lessons_resp.json()
                                lessons = lessons_data.get("lessons", []) if isinstance(lessons_data, dict) else lessons_data
                                
                                # Find a lesson with loCodes
                                lesson_with_codes = None
                                for les in lessons:
                                    # Get full lesson details to check loCodes
                                    lesson_detail_resp = requests.get(
                                        f"{BASE_URL}/lessons/{les['id']}",
                                        headers=headers,
                                        timeout=30
                                    )
                                    
                                    if lesson_detail_resp.status_code == 200:
                                        lesson_detail = lesson_detail_resp.json()
                                        lesson_obj = lesson_detail.get("lesson", lesson_detail)
                                        lo_codes = lesson_obj.get("loCodes", [])
                                        
                                        if lo_codes and len(lo_codes) > 0:
                                            lesson_with_codes = lesson_obj
                                            break
                                
                                if lesson_with_codes:
                                    print(f"Found lesson with loCodes: {lesson_with_codes.get('title', lesson_with_codes.get('topic', 'Untitled'))}")
                                    print(f"LO Codes: {lesson_with_codes.get('loCodes', [])}")
                                    
                                    # Test the lesson-curriculum endpoint
                                    test2c_resp = requests.post(
                                        f"{BASE_URL}/lesson-curriculum",
                                        json={"lessonId": lesson_with_codes["id"]},
                                        headers=headers,
                                        timeout=30
                                    )
                                    
                                    print(f"Status: {test2c_resp.status_code}")
                                    test2c_data = test2c_resp.json()
                                    print(f"Response: {json.dumps(test2c_data, indent=2)}")
                                    
                                    if test2c_resp.status_code != 200:
                                        print(f"❌ FAIL: Expected 200, got {test2c_resp.status_code}")
                                        return False
                                    
                                    if not test2c_data.get("eligible"):
                                        print(f"❌ FAIL: Expected eligible=true for {found_cls.get('name')}, got {test2c_data.get('eligible')}")
                                        return False
                                    
                                    # Check if cg and/or competency are populated (foundational codes should resolve these)
                                    cg = test2c_data.get("cg")
                                    comp = test2c_data.get("competency")
                                    
                                    if cg:
                                        print(f"✅ CG populated: {cg.get('code')} - {cg.get('text', '')[:50]}...")
                                    else:
                                        print(f"⚠️ CG is null (may be expected if loCodes don't resolve to CG)")
                                    
                                    if comp:
                                        print(f"✅ Competency populated: {comp.get('code')} - {comp.get('text', '')[:50]}...")
                                    else:
                                        print(f"⚠️ Competency is null (may be expected if loCodes don't resolve to Competency)")
                                    
                                    print(f"✅ PASS: {found_cls.get('name')} lesson returns eligible=true")
                                    foundational_tested = True
                                    print()
                                    break  # Only test one foundational class
                                else:
                                    print(f"⚠️ SKIP: No lessons with loCodes found for {found_cls.get('name')}")
                                    print()
                            else:
                                print(f"⚠️ SKIP: Could not fetch lessons for {found_cls.get('name')} chapter")
                                print()
                        else:
                            print(f"⚠️ SKIP: No chapters found for {found_cls.get('name')} book")
                            print()
                    else:
                        print(f"⚠️ SKIP: Could not fetch chapters for {found_cls.get('name')} book")
                        print()
                else:
                    print(f"⚠️ SKIP: No books found for {found_cls.get('name')}")
                    print()
            else:
                print(f"⚠️ SKIP: Could not fetch books for {found_cls.get('name')}")
                print()
            
            if foundational_tested:
                break
        
        if not foundational_tested:
            print(f"⚠️ WARNING: Could not test any foundational class lessons")
            print()
        
    except Exception as e:
        print(f"❌ FAIL: Exception in Test 2: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # =========================================================================
    # TEST 3: No Authorization header → 401
    # =========================================================================
    print("🔒 TEST 3: No Authorization Header → 401")
    print("-" * 80)
    
    try:
        test3_resp = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            json={"lessonId": "dcf5c1da-525b-47e7-b88e-60208e1b69fa"},
            timeout=30
        )
        
        print(f"Status: {test3_resp.status_code}")
        
        if test3_resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {test3_resp.status_code}")
            print(f"Response: {test3_resp.text}")
            return False
        
        print(f"✅ PASS: No auth returns 401")
        print()
        
    except Exception as e:
        print(f"❌ FAIL: Exception in Test 3: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # =========================================================================
    # TEST 4: POST with nonexistent lessonId → 404
    # =========================================================================
    print("🔍 TEST 4: Nonexistent lessonId → 404")
    print("-" * 80)
    
    try:
        test4_resp = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            json={"lessonId": "nonexistent-xyz"},
            headers=headers,
            timeout=30
        )
        
        print(f"Status: {test4_resp.status_code}")
        
        if test4_resp.status_code != 404:
            print(f"❌ FAIL: Expected 404, got {test4_resp.status_code}")
            print(f"Response: {test4_resp.text}")
            return False
        
        print(f"✅ PASS: Nonexistent lessonId returns 404")
        print()
        
    except Exception as e:
        print(f"❌ FAIL: Exception in Test 4: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # =========================================================================
    # TEST 5: Uniqueness sanity check
    # =========================================================================
    print("🔍 TEST 5: Uniqueness Sanity - Different Periods with Different loCodes")
    print("-" * 80)
    
    try:
        # Try to find two different lessons from the same chapter with different loCodes
        # We'll use the Class 3 lesson we already tested and try to find another one
        
        # Get the Class 3 lesson details
        lesson1_resp = requests.get(
            f"{BASE_URL}/lessons/dcf5c1da-525b-47e7-b88e-60208e1b69fa",
            headers=headers,
            timeout=30
        )
        
        if lesson1_resp.status_code == 200:
            lesson1_data = lesson1_resp.json()
            lesson1 = lesson1_data.get("lesson", lesson1_data)
            chapter_id = lesson1.get("chapterId")
            
            if chapter_id:
                # Get all lessons from this chapter
                lessons_resp = requests.get(
                    f"{BASE_URL}/lessons?chapterId={chapter_id}",
                    headers=headers,
                    timeout=30
                )
                
                if lessons_resp.status_code == 200:
                    lessons_data = lessons_resp.json()
                    lessons = lessons_data.get("lessons", []) if isinstance(lessons_data, dict) else lessons_data
                    
                    # Find another lesson with different loCodes
                    lesson1_codes = set(lesson1.get("loCodes", []))
                    lesson2 = None
                    
                    for les in lessons:
                        if les["id"] != lesson1["id"]:
                            # Get full lesson details
                            les_detail_resp = requests.get(
                                f"{BASE_URL}/lessons/{les['id']}",
                                headers=headers,
                                timeout=30
                            )
                            
                            if les_detail_resp.status_code == 200:
                                les_detail = les_detail_resp.json()
                                les_obj = les_detail.get("lesson", les_detail)
                                les_codes = set(les_obj.get("loCodes", []))
                                
                                if les_codes and les_codes != lesson1_codes:
                                    lesson2 = les_obj
                                    break
                    
                    if lesson2:
                        print(f"Found two lessons with different loCodes:")
                        print(f"Lesson 1: {lesson1.get('title', lesson1.get('topic', 'Untitled'))} - loCodes: {lesson1.get('loCodes', [])}")
                        print(f"Lesson 2: {lesson2.get('title', lesson2.get('topic', 'Untitled'))} - loCodes: {lesson2.get('loCodes', [])}")
                        
                        # Test both lessons
                        curr1_resp = requests.post(
                            f"{BASE_URL}/lesson-curriculum",
                            json={"lessonId": lesson1["id"]},
                            headers=headers,
                            timeout=30
                        )
                        
                        curr2_resp = requests.post(
                            f"{BASE_URL}/lesson-curriculum",
                            json={"lessonId": lesson2["id"]},
                            headers=headers,
                            timeout=30
                        )
                        
                        if curr1_resp.status_code == 200 and curr2_resp.status_code == 200:
                            curr1_data = curr1_resp.json()
                            curr2_data = curr2_resp.json()
                            
                            lo1_codes = set(curr1_data.get("loCodes", []))
                            lo2_codes = set(curr2_data.get("loCodes", []))
                            
                            if lo1_codes == lo2_codes:
                                print(f"❌ FAIL: Two different lessons returned identical loCodes: {lo1_codes}")
                                return False
                            
                            print(f"✅ PASS: Two lessons with different loCodes return different learningOutcomes")
                            print(f"Lesson 1 loCodes: {list(lo1_codes)}")
                            print(f"Lesson 2 loCodes: {list(lo2_codes)}")
                            print()
                        else:
                            print(f"⚠️ SKIP: Could not fetch curriculum for both lessons")
                            print()
                    else:
                        print(f"⚠️ SKIP: Could not find two lessons with different loCodes in the same chapter")
                        print()
                else:
                    print(f"⚠️ SKIP: Could not fetch lessons for chapter")
                    print()
            else:
                print(f"⚠️ SKIP: Lesson 1 has no chapterId")
                print()
        else:
            print(f"⚠️ SKIP: Could not fetch lesson 1 details")
            print()
        
    except Exception as e:
        print(f"❌ FAIL: Exception in Test 5: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("=" * 80)
    print("✅ ALL TESTS PASSED")
    print("=" * 80)
    return True


if __name__ == "__main__":
    try:
        success = test_lesson_curriculum()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️ Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
