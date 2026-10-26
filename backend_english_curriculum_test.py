#!/usr/bin/env python3
"""
Backend Test: English-language CG/Competency support in POST /api/lesson-curriculum
Tests the new English translation feature for English-subject lessons.
"""

import requests
import json
import sys
import re

# Backend URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def login_admin():
    """Login as admin and return token"""
    print("\n=== TEST 0: Admin Login ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print(f"✅ Login successful, token obtained")
            return token
        else:
            print(f"❌ Login failed: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return None

def find_english_lesson(token):
    """Find an English-subject lesson with loCodes"""
    print("\n=== Finding English-subject lesson ===")
    try:
        # Get classes
        response = requests.get(f"{BASE_URL}/classes", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if response.status_code != 200:
            print(f"❌ Failed to get classes: {response.status_code}")
            return None
        
        classes = response.json()
        print(f"Found {len(classes)} classes")
        
        # Look for classes from Balvatika to Class 8
        eligible_classes = []
        for cls in classes:
            name = cls.get("name", "")
            if any(x in name for x in ["Balvatika", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8"]):
                eligible_classes.append(cls)
        
        print(f"Found {len(eligible_classes)} eligible classes (Balvatika-Class 8)")
        
        # Search for English books
        for cls in eligible_classes:
            class_id = cls.get("id")
            class_name = cls.get("name")
            
            # Get books for this class
            response = requests.get(
                f"{BASE_URL}/books?classId={class_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            if response.status_code != 200:
                continue
            
            books = response.json()
            
            # Find English books
            english_books = [b for b in books if "English" in b.get("name", "") or "english" in b.get("name", "")]
            
            if english_books:
                print(f"\n✅ Found {len(english_books)} English book(s) in {class_name}")
                
                for book in english_books:
                    book_id = book.get("id")
                    book_name = book.get("name")
                    print(f"  - Book: {book_name}")
                    
                    # Get chapters
                    response = requests.get(
                        f"{BASE_URL}/chapters?bookId={book_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=30
                    )
                    if response.status_code != 200:
                        continue
                    
                    chapters_data = response.json()
                    chapters = chapters_data.get("chapters", []) if isinstance(chapters_data, dict) else chapters_data
                    
                    if chapters:
                        # Get lessons from first chapter
                        chapter = chapters[0]
                        chapter_id = chapter.get("id")
                        
                        response = requests.get(
                            f"{BASE_URL}/lessons?chapterId={chapter_id}&limit=50",
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=30
                        )
                        if response.status_code != 200:
                            continue
                        
                        lessons_data = response.json()
                        lessons = lessons_data.get("lessons", []) if isinstance(lessons_data, dict) else lessons_data
                        
                        # Find lesson with loCodes
                        for lesson in lessons:
                            lo_codes = lesson.get("loCodes", [])
                            if lo_codes and len(lo_codes) > 0:
                                lesson_id = lesson.get("id")
                                lesson_title = lesson.get("title", "")
                                print(f"    ✅ Found English lesson with loCodes: {lesson_title}")
                                print(f"       Lesson ID: {lesson_id}")
                                print(f"       LO Codes: {lo_codes}")
                                return {
                                    "lessonId": lesson_id,
                                    "className": class_name,
                                    "bookName": book_name,
                                    "title": lesson_title,
                                    "loCodes": lo_codes
                                }
        
        print("❌ No English lesson with loCodes found")
        return None
        
    except Exception as e:
        print(f"❌ Error finding English lesson: {str(e)}")
        return None

def find_non_english_lesson(token):
    """Find a non-English lesson (Odia/Math/EVS) with loCodes"""
    print("\n=== Finding non-English lesson ===")
    try:
        # Get classes
        response = requests.get(f"{BASE_URL}/classes", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if response.status_code != 200:
            print(f"❌ Failed to get classes: {response.status_code}")
            return None
        
        classes = response.json()
        
        # Look for classes from Balvatika to Class 8
        eligible_classes = []
        for cls in classes:
            name = cls.get("name", "")
            if any(x in name for x in ["Balvatika", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8"]):
                eligible_classes.append(cls)
        
        # Search for non-English books (Odia, Math, EVS, Science, Social Science)
        for cls in eligible_classes:
            class_id = cls.get("id")
            class_name = cls.get("name")
            
            # Get books for this class
            response = requests.get(
                f"{BASE_URL}/books?classId={class_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            if response.status_code != 200:
                continue
            
            books = response.json()
            
            # Find non-English books (Odia, Math, EVS, etc.)
            non_english_books = [b for b in books if "English" not in b.get("name", "") and "english" not in b.get("name", "")]
            
            if non_english_books:
                for book in non_english_books[:3]:  # Check first 3 books
                    book_id = book.get("id")
                    book_name = book.get("name")
                    
                    # Get chapters
                    response = requests.get(
                        f"{BASE_URL}/chapters?bookId={book_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=30
                    )
                    if response.status_code != 200:
                        continue
                    
                    chapters_data = response.json()
                    chapters = chapters_data.get("chapters", []) if isinstance(chapters_data, dict) else chapters_data
                    
                    if chapters:
                        # Get lessons from first chapter
                        chapter = chapters[0]
                        chapter_id = chapter.get("id")
                        
                        response = requests.get(
                            f"{BASE_URL}/lessons?chapterId={chapter_id}&limit=50",
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=30
                        )
                        if response.status_code != 200:
                            continue
                        
                        lessons_data = response.json()
                        lessons = lessons_data.get("lessons", []) if isinstance(lessons_data, dict) else lessons_data
                        
                        # Find lesson with loCodes
                        for lesson in lessons:
                            lo_codes = lesson.get("loCodes", [])
                            if lo_codes and len(lo_codes) > 0:
                                lesson_id = lesson.get("id")
                                lesson_title = lesson.get("title", "")
                                print(f"✅ Found non-English lesson with loCodes")
                                print(f"   Class: {class_name}")
                                print(f"   Book: {book_name}")
                                print(f"   Title: {lesson_title}")
                                print(f"   Lesson ID: {lesson_id}")
                                print(f"   LO Codes: {lo_codes}")
                                return {
                                    "lessonId": lesson_id,
                                    "className": class_name,
                                    "bookName": book_name,
                                    "title": lesson_title,
                                    "loCodes": lo_codes
                                }
        
        print("❌ No non-English lesson with loCodes found")
        return None
        
    except Exception as e:
        print(f"❌ Error finding non-English lesson: {str(e)}")
        return None

def is_english_text(text):
    """Check if text is in English (Latin script) vs Odia (Oriya script)"""
    if not text:
        return False
    
    # Count ASCII letters (English) vs non-ASCII (Odia/other scripts)
    ascii_count = sum(1 for c in text if ord(c) < 128 and c.isalpha())
    non_ascii_count = sum(1 for c in text if ord(c) >= 128)
    
    # If majority is ASCII letters, it's English
    return ascii_count > non_ascii_count

def test_english_lesson_curriculum(token, lesson_info):
    """Test POST /api/lesson-curriculum for English lesson"""
    print("\n=== TEST 1: English-subject lesson → lang='en', English text ===")
    
    if not lesson_info:
        print("❌ SKIPPED: No English lesson found")
        return False
    
    try:
        lesson_id = lesson_info["lessonId"]
        
        response = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            headers={"Authorization": f"Bearer {token}"},
            json={"lessonId": lesson_id},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Check eligible
        if not data.get("eligible"):
            print(f"❌ FAILED: eligible should be true")
            return False
        print(f"✅ eligible: true")
        
        # Check lang field
        lang = data.get("lang")
        if lang != "en":
            print(f"❌ FAILED: lang should be 'en', got '{lang}'")
            return False
        print(f"✅ lang: 'en'")
        
        # Check CG text
        cg = data.get("cg")
        if not cg:
            print(f"❌ FAILED: cg is missing")
            return False
        
        cg_code = cg.get("code")
        cg_text = cg.get("text", "")
        
        print(f"\n📊 CG (Curricular Goal):")
        print(f"   Code: {cg_code}")
        print(f"   Text: {cg_text}")
        
        if not cg_text:
            print(f"⚠️  WARNING: cg.text is empty")
        elif is_english_text(cg_text):
            print(f"✅ cg.text is in ENGLISH (Latin script)")
        else:
            print(f"❌ FAILED: cg.text should be in English but appears to be Odia script")
            print(f"   Text: {cg_text}")
            return False
        
        # Check Competency text
        competency = data.get("competency")
        if not competency:
            print(f"❌ FAILED: competency is missing")
            return False
        
        comp_code = competency.get("code")
        comp_text = competency.get("text", "")
        
        print(f"\n📊 Competency:")
        print(f"   Code: {comp_code}")
        print(f"   Text: {comp_text}")
        
        if not comp_text:
            print(f"⚠️  WARNING: competency.text is empty")
        elif is_english_text(comp_text):
            print(f"✅ competency.text is in ENGLISH (Latin script)")
        else:
            print(f"❌ FAILED: competency.text should be in English but appears to be Odia script")
            print(f"   Text: {comp_text}")
            return False
        
        # Check loCodes and learningOutcomes
        lo_codes = data.get("loCodes", [])
        learning_outcomes = data.get("learningOutcomes", [])
        
        print(f"\n📊 Learning Outcomes:")
        print(f"   loCodes: {lo_codes}")
        print(f"   learningOutcomes count: {len(learning_outcomes)}")
        
        if not lo_codes:
            print(f"⚠️  WARNING: loCodes is empty")
        else:
            print(f"✅ loCodes present: {len(lo_codes)} codes")
        
        if not learning_outcomes:
            print(f"⚠️  WARNING: learningOutcomes is empty")
        else:
            print(f"✅ learningOutcomes present: {len(learning_outcomes)} outcomes")
        
        print(f"\n✅ TEST 1 PASSED: English lesson returns lang='en' with English text")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_non_english_lesson_curriculum(token, lesson_info):
    """Test POST /api/lesson-curriculum for non-English lesson"""
    print("\n=== TEST 2: Non-English lesson → lang='or', Odia text ===")
    
    if not lesson_info:
        print("❌ SKIPPED: No non-English lesson found")
        return False
    
    try:
        lesson_id = lesson_info["lessonId"]
        
        response = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            headers={"Authorization": f"Bearer {token}"},
            json={"lessonId": lesson_id},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Check eligible
        if not data.get("eligible"):
            print(f"❌ FAILED: eligible should be true")
            return False
        print(f"✅ eligible: true")
        
        # Check lang field
        lang = data.get("lang")
        if lang != "or":
            print(f"❌ FAILED: lang should be 'or', got '{lang}'")
            return False
        print(f"✅ lang: 'or'")
        
        # Check CG text
        cg = data.get("cg")
        if not cg:
            print(f"❌ FAILED: cg is missing")
            return False
        
        cg_code = cg.get("code")
        cg_text = cg.get("text", "")
        
        print(f"\n📊 CG (Curricular Goal):")
        print(f"   Code: {cg_code}")
        print(f"   Text: {cg_text}")
        
        if not cg_text:
            print(f"⚠️  WARNING: cg.text is empty")
        elif not is_english_text(cg_text):
            print(f"✅ cg.text is in ODIA (Oriya script)")
        else:
            print(f"❌ FAILED: cg.text should be in Odia but appears to be English")
            print(f"   Text: {cg_text}")
            return False
        
        # Check Competency text
        competency = data.get("competency")
        if not competency:
            print(f"❌ FAILED: competency is missing")
            return False
        
        comp_code = competency.get("code")
        comp_text = competency.get("text", "")
        
        print(f"\n📊 Competency:")
        print(f"   Code: {comp_code}")
        print(f"   Text: {comp_text}")
        
        if not comp_text:
            print(f"⚠️  WARNING: competency.text is empty")
        elif not is_english_text(comp_text):
            print(f"✅ competency.text is in ODIA (Oriya script)")
        else:
            print(f"❌ FAILED: competency.text should be in Odia but appears to be English")
            print(f"   Text: {comp_text}")
            return False
        
        # Check loCodes and learningOutcomes
        lo_codes = data.get("loCodes", [])
        learning_outcomes = data.get("learningOutcomes", [])
        
        print(f"\n📊 Learning Outcomes:")
        print(f"   loCodes: {lo_codes}")
        print(f"   learningOutcomes count: {len(learning_outcomes)}")
        
        if not lo_codes:
            print(f"⚠️  WARNING: loCodes is empty")
        else:
            print(f"✅ loCodes present: {len(lo_codes)} codes")
        
        if not learning_outcomes:
            print(f"⚠️  WARNING: learningOutcomes is empty")
        else:
            print(f"✅ learningOutcomes present: {len(learning_outcomes)} outcomes")
        
        print(f"\n✅ TEST 2 PASSED: Non-English lesson returns lang='or' with Odia text")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_regression_codes_present(token, lesson_info):
    """Test that cg.code and competency.code are still present"""
    print("\n=== TEST 3: Regression - codes still present ===")
    
    if not lesson_info:
        print("❌ SKIPPED: No lesson found")
        return False
    
    try:
        lesson_id = lesson_info["lessonId"]
        
        response = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            headers={"Authorization": f"Bearer {token}"},
            json={"lessonId": lesson_id},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check CG code
        cg = data.get("cg")
        if not cg or not cg.get("code"):
            print(f"❌ FAILED: cg.code is missing")
            return False
        print(f"✅ cg.code present: {cg.get('code')}")
        
        # Check Competency code
        competency = data.get("competency")
        if not competency or not competency.get("code"):
            print(f"❌ FAILED: competency.code is missing")
            return False
        print(f"✅ competency.code present: {competency.get('code')}")
        
        # Check loCodes
        lo_codes = data.get("loCodes")
        if lo_codes is None:
            print(f"❌ FAILED: loCodes field is missing")
            return False
        print(f"✅ loCodes field present (count: {len(lo_codes)})")
        
        # Check learningOutcomes
        learning_outcomes = data.get("learningOutcomes")
        if learning_outcomes is None:
            print(f"❌ FAILED: learningOutcomes field is missing")
            return False
        print(f"✅ learningOutcomes field present (count: {len(learning_outcomes)})")
        
        print(f"\n✅ TEST 3 PASSED: All required fields present")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {str(e)}")
        return False

def test_security_no_auth():
    """Test that endpoint requires authentication"""
    print("\n=== TEST 4: Security - no auth → 401/403 ===")
    
    try:
        # Use a dummy lesson ID
        response = requests.post(
            f"{BASE_URL}/lesson-curriculum",
            json={"lessonId": "dummy-id"},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            print(f"✅ TEST 4 PASSED: Correctly rejected with {response.status_code}")
            return True
        else:
            print(f"❌ FAILED: Expected 401 or 403, got {response.status_code}")
            return False
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {str(e)}")
        return False

def main():
    print("=" * 80)
    print("BACKEND TEST: English-language CG/Competency Support")
    print("Testing POST /api/lesson-curriculum for Lesson Guru Odisha")
    print("=" * 80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ CRITICAL: Cannot proceed without admin token")
        sys.exit(1)
    
    # Find lessons
    english_lesson = find_english_lesson(token)
    non_english_lesson = find_non_english_lesson(token)
    
    # Run tests
    results = []
    
    # Test 1: English lesson
    results.append(("TEST 1: English lesson", test_english_lesson_curriculum(token, english_lesson)))
    
    # Test 2: Non-English lesson
    results.append(("TEST 2: Non-English lesson", test_non_english_lesson_curriculum(token, non_english_lesson)))
    
    # Test 3: Regression - codes present (use any lesson)
    test_lesson = english_lesson or non_english_lesson
    results.append(("TEST 3: Regression - codes present", test_regression_codes_present(token, test_lesson)))
    
    # Test 4: Security
    results.append(("TEST 4: Security - no auth", test_security_no_auth()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
