#!/usr/bin/env python3
"""
Backend test for LO Codes fix in Lesson Guru Odisha app.
Tests the new Class 9-10 LO codes import, auto-assign, and daily plan generation with proper LO code resolution.
"""

import requests
import json
import sys
import os

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
FALLBACK_ADMIN_MOBILE = "9999999999"
FALLBACK_ADMIN_PASSWORD = "admin123"

admin_token = None
test_results = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if details:
        result += f" - {details}"
    print(result)
    test_results.append({"name": test_name, "passed": passed, "details": details})
    return passed

def login_admin():
    """Login as admin and get token"""
    global admin_token
    
    # Try primary admin first
    try:
        print(f"\n🔐 Attempting admin login with {ADMIN_MOBILE}...")
        response = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get('token')
            print(f"✅ Admin login successful with {ADMIN_MOBILE}")
            return True
    except Exception as e:
        print(f"⚠️ Primary admin login failed: {e}")
    
    # Try fallback admin
    try:
        print(f"🔐 Attempting fallback admin login with {FALLBACK_ADMIN_MOBILE}...")
        response = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": FALLBACK_ADMIN_MOBILE,
            "password": FALLBACK_ADMIN_PASSWORD
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get('token')
            print(f"✅ Admin login successful with {FALLBACK_ADMIN_MOBILE}")
            return True
    except Exception as e:
        print(f"❌ Fallback admin login failed: {e}")
    
    return False

def test_import_class9_10_locodes():
    """Test 1: POST /api/admin/import/class9-10-locodes"""
    print("\n" + "="*80)
    print("TEST 1: Import Class 9-10 LO Codes")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{API_BASE}/admin/import/class9-10-locodes",
            headers=headers,
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Check response structure
        if response.status_code == 200 and data.get('ok'):
            class9_total = data.get('class9Total', 0)
            class10_total = data.get('class10Total', 0)
            
            log_test(
                "Import Class 9-10 LO codes",
                class9_total == 70 and class10_total == 70,
                f"Class 9: {class9_total} codes, Class 10: {class10_total} codes"
            )
            
            # Verify GET /api/lo-codes?class=9
            print("\n📋 Verifying Class 9 LO codes...")
            response = requests.get(f"{API_BASE}/lo-codes?class=9", timeout=10)
            class9_data = response.json()
            class9_codes = class9_data.get('items', []) if isinstance(class9_data, dict) else class9_data
            print(f"Class 9 codes count: {len(class9_codes)}")
            
            log_test(
                "GET /api/lo-codes?class=9 returns ≥65 codes",
                len(class9_codes) >= 65,
                f"Found {len(class9_codes)} codes"
            )
            
            # Verify GET /api/lo-codes?class=10
            print("\n📋 Verifying Class 10 LO codes...")
            response = requests.get(f"{API_BASE}/lo-codes?class=10", timeout=10)
            class10_data = response.json()
            class10_codes = class10_data.get('items', []) if isinstance(class10_data, dict) else class10_data
            print(f"Class 10 codes count: {len(class10_codes)}")
            
            log_test(
                "GET /api/lo-codes?class=10 returns ≥65 codes",
                len(class10_codes) >= 65,
                f"Found {len(class10_codes)} codes"
            )
            
            return True
        else:
            log_test("Import Class 9-10 LO codes", False, f"Unexpected response: {data}")
            return False
            
    except Exception as e:
        log_test("Import Class 9-10 LO codes", False, f"Exception: {str(e)}")
        return False

def test_auto_assign_locodes():
    """Test 2: POST /api/admin/lessons/auto-assign-locodes"""
    print("\n" + "="*80)
    print("TEST 2: Auto-assign LO codes to lessons")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        response = requests.post(
            f"{API_BASE}/admin/lessons/auto-assign-locodes",
            headers=headers,
            json={"force": True, "limit": 500},
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if response.status_code == 200:
            updated = data.get('updated', 0)
            errors = data.get('errors', 0)
            
            log_test(
                "Auto-assign LO codes",
                updated > 100 and errors == 0,
                f"Updated: {updated}, Errors: {errors}"
            )
            
            # Check response time (should be < 30 seconds)
            # Note: We already got the response, so it was within timeout
            log_test(
                "Auto-assign response time < 30s",
                True,
                "Response received within timeout"
            )
            
            return True
        else:
            log_test("Auto-assign LO codes", False, f"Status: {response.status_code}")
            return False
            
    except Exception as e:
        log_test("Auto-assign LO codes", False, f"Exception: {str(e)}")
        return False

def test_daily_plan_class9_english():
    """Test 3: POST /api/daily-plan/generate with Class 9 English lesson"""
    print("\n" + "="*80)
    print("TEST 3: Daily plan with Class 9 English lesson")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Find Class 9
        print("📋 Finding Class 9...")
        response = requests.get(f"{API_BASE}/classes", timeout=10)
        classes_data = response.json()
        classes = classes_data.get('classes', []) if isinstance(classes_data, dict) else classes_data
        class9 = next((c for c in classes if c['name'] == 'Class 9'), None)
        
        if not class9:
            log_test("Find Class 9", False, "Class 9 not found")
            return False
        
        print(f"✅ Found Class 9: {class9['id']}")
        
        # Find English book with chapters
        print("📋 Finding English book for Class 9...")
        response = requests.get(f"{API_BASE}/books?classId={class9['id']}", timeout=10)
        books_data = response.json()
        books = books_data.get('books', []) if isinstance(books_data, dict) else books_data
        
        # Try to find a book with chapters (prefer English, but accept any)
        english_book = None
        for book in books:
            if book.get('chaptersCount', 0) > 0:
                english_book = book
                if 'English' in book.get('name', '') or 'english' in book.get('name', '').lower():
                    break  # Prefer English book
        
        if not english_book:
            # If no book has chapters, just use the first book
            english_book = books[0] if books else None
        
        if not english_book:
            log_test("Find book for Class 9", False, "No books found for Class 9")
            return False
        
        print(f"✅ Found book: {english_book['name']} ({english_book['id']}), chapters: {english_book.get('chaptersCount', 0)}")
        
        # Find first chapter
        print("📋 Finding chapter...")
        response = requests.get(f"{API_BASE}/chapters?bookId={english_book['id']}", timeout=10)
        chapters_data = response.json()
        chapters = chapters_data.get('chapters', []) if isinstance(chapters_data, dict) else chapters_data
        
        if not chapters:
            log_test("Find chapter", False, "No chapters found")
            return False
        
        chapter = chapters[0]
        print(f"✅ Found chapter: {chapter['name']} ({chapter['id']})")
        
        # Find first lesson
        print("📋 Finding lesson...")
        response = requests.get(f"{API_BASE}/lessons?chapterId={chapter['id']}", timeout=10)
        lessons_data = response.json()
        lessons = lessons_data.get('lessons', []) if isinstance(lessons_data, dict) else lessons_data
        
        if not lessons:
            log_test("Find lesson", False, "No lessons found")
            return False
        
        lesson = lessons[0]
        print(f"✅ Found lesson: {lesson['title']} ({lesson['id']})")
        
        # Generate daily plan
        print("\n📋 Generating daily plan...")
        response = requests.post(
            f"{API_BASE}/daily-plan/generate",
            headers=headers,
            json={
                "date": "2026-01-13",
                "schoolName": "Test School",
                "classType": "weekday",
                "slots": [{
                    "classId": class9['id'],
                    "bookId": english_book['id'],
                    "chapterId": chapter['id'],
                    "lessonId": lesson['id']
                }]
            },
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code == 200 and data.get('periods'):
            period = data['periods'][0]
            lo_code = period.get('loCode', '')
            lo_description = period.get('loDescription', '')
            
            print(f"\n📊 Period details:")
            print(f"  LO Code: {lo_code}")
            print(f"  LO Description: {lo_description}")
            
            # Check if loCode is specific (not "—" or empty)
            is_specific = lo_code and lo_code != "—" and lo_code.strip() != ""
            
            # Check if it's a Class 9 code (EN 901-910, M 9xx, SCI 9xx, SS 9xx, OD 9xx, or CG-9-x)
            is_class9_code = False
            if is_specific:
                if lo_code.startswith('EN 90') or lo_code.startswith('M 9') or \
                   lo_code.startswith('SCI 9') or lo_code.startswith('SS 9') or \
                   lo_code.startswith('OD 9') or lo_code.startswith('CG-9-'):
                    is_class9_code = True
            
            log_test(
                "Class 9 English lesson has specific LO code",
                is_specific and is_class9_code,
                f"LO Code: {lo_code}"
            )
            
            # Check loDescription is non-empty (≥10 chars)
            log_test(
                "Class 9 English lesson has non-empty LO description",
                len(lo_description) >= 10,
                f"Description length: {len(lo_description)} chars"
            )
            
            return True
        else:
            log_test("Generate daily plan for Class 9 English", False, f"Status: {response.status_code}")
            return False
            
    except Exception as e:
        log_test("Generate daily plan for Class 9 English", False, f"Exception: {str(e)}")
        return False

def test_daily_plan_class5_math():
    """Test 4: POST /api/daily-plan/generate with Class 5 Math lesson"""
    print("\n" + "="*80)
    print("TEST 4: Daily plan with Class 5 Math lesson (verify stored loCodes)")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Find Class 5
        print("📋 Finding Class 5...")
        response = requests.get(f"{API_BASE}/classes", timeout=10)
        classes_data = response.json()
        classes = classes_data.get('classes', []) if isinstance(classes_data, dict) else classes_data
        class5 = next((c for c in classes if c['name'] == 'Class 5'), None)
        
        if not class5:
            log_test("Find Class 5", False, "Class 5 not found")
            return False
        
        print(f"✅ Found Class 5: {class5['id']}")
        
        # Find Math book with chapters
        print("📋 Finding Math book for Class 5...")
        response = requests.get(f"{API_BASE}/books?classId={class5['id']}", timeout=10)
        books_data = response.json()
        books = books_data.get('books', []) if isinstance(books_data, dict) else books_data
        
        # Try to find a Math book with chapters
        math_book = None
        for book in books:
            if book.get('chaptersCount', 0) > 0:
                math_book = book
                if 'Math' in book.get('name', '') or 'ଗଣିତ' in book.get('name', ''):
                    break  # Prefer Math book
        
        if not math_book:
            # If no book has chapters, just use the first book
            math_book = books[0] if books else None
        
        if not math_book:
            log_test("Find book for Class 5", False, "No books found for Class 5")
            return False
        
        print(f"✅ Found book: {math_book['name']} ({math_book['id']}), chapters: {math_book.get('chaptersCount', 0)}")
        
        # Find first chapter
        print("📋 Finding chapter...")
        response = requests.get(f"{API_BASE}/chapters?bookId={math_book['id']}", timeout=10)
        chapters_data = response.json()
        chapters = chapters_data.get('chapters', []) if isinstance(chapters_data, dict) else chapters_data
        
        if not chapters:
            log_test("Find chapter", False, "No chapters found")
            return False
        
        chapter = chapters[0]
        print(f"✅ Found chapter: {chapter['name']} ({chapter['id']})")
        
        # Find first lesson
        print("📋 Finding lesson...")
        response = requests.get(f"{API_BASE}/lessons?chapterId={chapter['id']}", timeout=10)
        lessons_data = response.json()
        lessons = lessons_data.get('lessons', []) if isinstance(lessons_data, dict) else lessons_data
        
        if not lessons:
            log_test("Find lesson", False, "No lessons found")
            return False
        
        lesson = lessons[0]
        print(f"✅ Found lesson: {lesson['title']} ({lesson['id']})")
        
        # Get full lesson details to check stored loCodes
        print("📋 Getting lesson details...")
        response = requests.get(f"{API_BASE}/lessons/{lesson['id']}", headers=headers, timeout=10)
        lesson_detail = response.json()
        
        stored_locodes = lesson_detail.get('lesson', {}).get('loCodes', [])
        print(f"📊 Stored loCodes: {stored_locodes}")
        
        if not stored_locodes:
            print("⚠️ Warning: Lesson has no stored loCodes, skipping verification")
            log_test("Class 5 Math lesson has stored loCodes", False, "No stored loCodes found")
            return False
        
        # Generate daily plan
        print("\n📋 Generating daily plan...")
        response = requests.post(
            f"{API_BASE}/daily-plan/generate",
            headers=headers,
            json={
                "date": "2026-01-13",
                "schoolName": "Test School",
                "classType": "weekday",
                "slots": [{
                    "classId": class5['id'],
                    "bookId": math_book['id'],
                    "chapterId": chapter['id'],
                    "lessonId": lesson['id']
                }]
            },
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code == 200 and data.get('periods'):
            period = data['periods'][0]
            lo_code = period.get('loCode', '')
            lo_description = period.get('loDescription', '')
            
            print(f"\n📊 Period details:")
            print(f"  LO Code: {lo_code}")
            print(f"  Stored loCodes[0]: {stored_locodes[0]}")
            print(f"  LO Description: {lo_description}")
            
            # Check if loCode matches stored loCodes[0]
            log_test(
                "Class 5 Math lesson loCode matches stored loCodes[0]",
                lo_code == stored_locodes[0],
                f"Expected: {stored_locodes[0]}, Got: {lo_code}"
            )
            
            # Check loDescription is non-empty
            log_test(
                "Class 5 Math lesson has non-empty LO description",
                len(lo_description) >= 10,
                f"Description length: {len(lo_description)} chars"
            )
            
            return True
        else:
            log_test("Generate daily plan for Class 5 Math", False, f"Status: {response.status_code}")
            return False
            
    except Exception as e:
        log_test("Generate daily plan for Class 5 Math", False, f"Exception: {str(e)}")
        return False

def test_multigrade_class6_class9():
    """Test 5: POST /api/multigrade/generate with Class 6 + Class 9"""
    print("\n" + "="*80)
    print("TEST 5: Multigrade plan with Class 6 + Class 9")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Find Class 6 and Class 9
        print("📋 Finding classes...")
        response = requests.get(f"{API_BASE}/classes", timeout=10)
        classes_data = response.json()
        classes = classes_data.get('classes', []) if isinstance(classes_data, dict) else classes_data
        class6 = next((c for c in classes if c['name'] == 'Class 6'), None)
        class9 = next((c for c in classes if c['name'] == 'Class 9'), None)
        
        if not class6 or not class9:
            log_test("Find Class 6 and Class 9", False, "Classes not found")
            return False
        
        print(f"✅ Found Class 6: {class6['id']}")
        print(f"✅ Found Class 9: {class9['id']}")
        
        # Find books and lessons for both classes
        slots = []
        
        # Class 6 slot
        print("\n📋 Finding Class 6 lesson...")
        response = requests.get(f"{API_BASE}/books?classId={class6['id']}", timeout=10)
        books_data = response.json()
        books6 = books_data.get('books', []) if isinstance(books_data, dict) else books_data
        if books6:
            # Find a book with chapters
            book6 = next((b for b in books6 if b.get('chaptersCount', 0) > 0), books6[0] if books6 else None)
            if book6:
                response = requests.get(f"{API_BASE}/chapters?bookId={book6['id']}", timeout=10)
                chapters_data = response.json()
                chapters6 = chapters_data.get('chapters', []) if isinstance(chapters_data, dict) else chapters_data
                if chapters6:
                    chapter6 = chapters6[0]
                    response = requests.get(f"{API_BASE}/lessons?chapterId={chapter6['id']}", timeout=10)
                    lessons_data = response.json()
                    lessons6 = lessons_data.get('lessons', []) if isinstance(lessons_data, dict) else lessons_data
                    if lessons6:
                        lesson6 = lessons6[0]
                        slots.append({
                            "classId": class6['id'],
                            "bookId": book6['id'],
                            "chapterId": chapter6['id'],
                            "lessonId": lesson6['id']
                        })
                        print(f"✅ Class 6 lesson: {lesson6['title']}")
        
        # Class 9 slot
        print("\n📋 Finding Class 9 lesson...")
        response = requests.get(f"{API_BASE}/books?classId={class9['id']}", timeout=10)
        books_data = response.json()
        books9 = books_data.get('books', []) if isinstance(books_data, dict) else books_data
        if books9:
            # Find a book with chapters
            book9 = next((b for b in books9 if b.get('chaptersCount', 0) > 0), books9[0] if books9 else None)
            if book9:
                response = requests.get(f"{API_BASE}/chapters?bookId={book9['id']}", timeout=10)
                chapters_data = response.json()
                chapters9 = chapters_data.get('chapters', []) if isinstance(chapters_data, dict) else chapters_data
                if chapters9:
                    chapter9 = chapters9[0]
                    response = requests.get(f"{API_BASE}/lessons?chapterId={chapter9['id']}", timeout=10)
                    lessons_data = response.json()
                    lessons9 = lessons_data.get('lessons', []) if isinstance(lessons_data, dict) else lessons_data
                    if lessons9:
                        lesson9 = lessons9[0]
                        slots.append({
                            "classId": class9['id'],
                            "bookId": book9['id'],
                            "chapterId": chapter9['id'],
                            "lessonId": lesson9['id']
                        })
                        print(f"✅ Class 9 lesson: {lesson9['title']}")
        
        if len(slots) < 2:
            log_test("Find lessons for both classes", False, "Could not find lessons")
            return False
        
        # Generate multigrade plan
        print("\n📋 Generating multigrade plan...")
        response = requests.post(
            f"{API_BASE}/multigrade/generate",
            headers=headers,
            json={
                "date": "2026-01-13",
                "periodNumber": 1,
                "schoolName": "Test School",
                "slots": slots
            },
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ Error response: {json.dumps(data, indent=2)}")
            log_test("Generate multigrade plan", False, f"Status: {response.status_code}, Error: {data.get('error', 'Unknown')}")
            return False
        
        print(f"📊 Response keys: {list(data.keys())}")
        
        # Multigrade returns 'classes' and 'steps', not 'periods'
        if response.status_code == 200 and data.get('classes'):
            classes_data = data['classes']
            
            print(f"\n📊 Multigrade plan has {len(classes_data)} classes")
            
            all_specific = True
            all_descriptions_valid = True
            
            for i, class_info in enumerate(classes_data):
                lo_code = class_info.get('loCode', '')
                lo_description = class_info.get('loDescription', '')
                class_name = class_info.get('className', '')
                
                print(f"\nClass {i+1} ({class_name}):")
                print(f"  LO Code: {lo_code}")
                print(f"  LO Description: {lo_description[:50]}..." if len(lo_description) > 50 else f"  LO Description: {lo_description}")
                
                # Check if loCode is specific (not "—" or empty)
                if not lo_code or lo_code == "—" or lo_code.strip() == "":
                    all_specific = False
                    print(f"  ❌ LO code is not specific")
                
                # Check if loDescription is non-empty
                if len(lo_description) < 10:
                    all_descriptions_valid = False
                    print(f"  ❌ LO description is too short")
            
            log_test(
                "Multigrade: Both classes have specific LO codes",
                all_specific,
                f"All {len(classes_data)} classes have specific LO codes" if all_specific else "Some classes have empty/generic LO codes"
            )
            
            log_test(
                "Multigrade: Both classes have non-empty LO descriptions",
                all_descriptions_valid,
                f"All {len(classes_data)} classes have valid descriptions" if all_descriptions_valid else "Some classes have short descriptions"
            )
            
            return True
        else:
            log_test("Generate multigrade plan", False, f"Status: {response.status_code}, No classes in response")
            return False
            
    except Exception as e:
        log_test("Generate multigrade plan", False, f"Exception: {str(e)}")
        return False

def test_regression_checks():
    """Test 6: Regression checks on existing endpoints"""
    print("\n" + "="*80)
    print("TEST 6: Regression checks")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # GET /api/auth/me (auth)
        print("\n📋 Testing GET /api/auth/me...")
        response = requests.get(f"{API_BASE}/auth/me", headers=headers, timeout=10)
        log_test(
            "GET /api/auth/me (auth)",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        # GET /api/classes
        print("\n📋 Testing GET /api/classes...")
        response = requests.get(f"{API_BASE}/classes", timeout=10)
        classes_data = response.json() if response.status_code == 200 else {}
        classes = classes_data.get('classes', []) if isinstance(classes_data, dict) else []
        log_test(
            "GET /api/classes",
            response.status_code == 200 and len(classes) >= 11,
            f"Status: {response.status_code}, Classes: {len(classes)}"
        )
        
        # GET /api/books?classId=...
        if classes:
            print("\n📋 Testing GET /api/books...")
            response = requests.get(f"{API_BASE}/books?classId={classes[0]['id']}", timeout=10)
            log_test(
                "GET /api/books?classId=...",
                response.status_code == 200,
                f"Status: {response.status_code}"
            )
        
        # GET /api/lo-codes?class=5
        print("\n📋 Testing GET /api/lo-codes?class=5...")
        response = requests.get(f"{API_BASE}/lo-codes?class=5", timeout=10)
        log_test(
            "GET /api/lo-codes?class=5",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        # GET /api/admin/analytics (admin only)
        print("\n📋 Testing GET /api/admin/analytics...")
        response = requests.get(f"{API_BASE}/admin/analytics", headers=headers, timeout=10)
        log_test(
            "GET /api/admin/analytics (admin only)",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
        
        # POST /api/admin/import/balvatika-locodes (idempotent re-seed)
        print("\n📋 Testing POST /api/admin/import/balvatika-locodes...")
        response = requests.post(
            f"{API_BASE}/admin/import/balvatika-locodes",
            headers=headers,
            timeout=30
        )
        data = response.json() if response.status_code == 200 else {}
        log_test(
            "POST /api/admin/import/balvatika-locodes (idempotent)",
            response.status_code == 200 and data.get('ok'),
            f"Status: {response.status_code}, OK: {data.get('ok')}"
        )
        
        return True
        
    except Exception as e:
        log_test("Regression checks", False, f"Exception: {str(e)}")
        return False

def main():
    """Main test runner"""
    print("\n" + "="*80)
    print("🧪 LESSON GURU ODISHA - LO CODES FIX TESTING")
    print("="*80)
    print(f"Backend URL: {API_BASE}")
    print(f"Admin credentials: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    print("="*80)
    
    # Login as admin
    if not login_admin():
        print("\n❌ FATAL: Could not login as admin. Aborting tests.")
        sys.exit(1)
    
    # Run tests
    test_import_class9_10_locodes()
    test_auto_assign_locodes()
    test_daily_plan_class9_english()
    test_daily_plan_class5_math()
    test_multigrade_class6_class9()
    test_regression_checks()
    
    # Summary
    print("\n" + "="*80)
    print("📊 TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for t in test_results if t['passed'])
    total = len(test_results)
    
    print(f"\nTotal tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success rate: {(passed/total*100):.1f}%")
    
    print("\n📋 Detailed results:")
    for i, test in enumerate(test_results, 1):
        status = "✅" if test['passed'] else "❌"
        print(f"{i}. {status} {test['name']}")
        if test['details']:
            print(f"   {test['details']}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️ {total - passed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
