#!/usr/bin/env python3
"""
Backend Test Suite for One-Click Production Imports (Sishuvatika Workbook + Balvatika LO Codes)
Tests the two new admin import endpoints for Balvatika content.
"""

import requests
import json
import sys

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
LEGACY_ADMIN_MOBILE = "9999999999"
LEGACY_ADMIN_PASSWORD = "admin123"

# Test counters
tests_passed = 0
tests_failed = 0

def log_test(name, passed, details=""):
    """Log test result"""
    global tests_passed, tests_failed
    if passed:
        tests_passed += 1
        print(f"✅ TEST {tests_passed + tests_failed}: {name}")
        if details:
            print(f"   {details}")
    else:
        tests_failed += 1
        print(f"❌ TEST {tests_passed + tests_failed}: {name}")
        if details:
            print(f"   {details}")

def login(mobile, password):
    """Login and return token"""
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def register_user(name, mobile, password):
    """Register a new user and return token"""
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": name,
            "mobile": mobile,
            "password": password
        }, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        return None
    except Exception as e:
        print(f"Register error: {e}")
        return None

print("=" * 80)
print("BACKEND TEST SUITE: One-Click Production Imports (Sishuvatika + Balvatika LO Codes)")
print("=" * 80)
print()

# ===== SETUP: Login as admin =====
print("SETUP: Logging in as primary admin...")
admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
if not admin_token:
    print("❌ FATAL: Could not login as admin. Aborting tests.")
    sys.exit(1)
print(f"✅ Admin login successful")
print()

# ===== TEST GROUP 1: Sishuvatika Workbook Import =====
print("=" * 80)
print("TEST GROUP 1: POST /api/admin/import/sishuvatika-workbook")
print("=" * 80)
print()

# Test 1: Import Sishuvatika Workbook (first time)
print("Test 1: Import Sishuvatika Workbook (first import)")
try:
    response = requests.post(
        f"{BASE_URL}/admin/import/sishuvatika-workbook",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30
    )
    data = response.json()
    
    if response.status_code == 200:
        if data.get("ok") and data.get("inserted") == 109:
            log_test(
                "Import Sishuvatika Workbook - First Import",
                True,
                f"Inserted: {data.get('inserted')}, Removed: {data.get('removedExistingLessons', 0)}, Class: {data.get('className')}"
            )
            # Store IDs for later tests
            balvatika_class_id = data.get("classId")
            sishu_book_id = data.get("bookId")
            sishu_chapter_id = data.get("chapterId")
        else:
            log_test(
                "Import Sishuvatika Workbook - First Import",
                False,
                f"Expected inserted=109, got: {data.get('inserted')}"
            )
    else:
        log_test(
            "Import Sishuvatika Workbook - First Import",
            False,
            f"Status: {response.status_code}, Response: {response.text[:200]}"
        )
except Exception as e:
    log_test("Import Sishuvatika Workbook - First Import", False, f"Error: {e}")
print()

# Test 2: Verify book exists in GET /api/books
print("Test 2: Verify Sishuvatika Workbook in GET /api/books")
try:
    # First get Balvatika class ID
    classes_response = requests.get(f"{BASE_URL}/classes", timeout=10)
    classes_data = classes_response.json()
    balvatika_class = next((c for c in classes_data.get("classes", []) if "Balvatika" in c.get("name", "") or "ବାଲବାଟିକା" in c.get("name", "")), None)
    
    if balvatika_class:
        balvatika_class_id = balvatika_class.get("id")
        books_response = requests.get(
            f"{BASE_URL}/books",
            params={"classId": balvatika_class_id},
            timeout=10
        )
        books_data = books_response.json()
        books = books_data.get("books", [])
        
        sishu_book = next((b for b in books if b.get("name") == "Sishuvatika Workbook"), None)
        
        if sishu_book:
            log_test(
                "Verify Sishuvatika Workbook in books list",
                True,
                f"Found book: {sishu_book.get('name')}, ID: {sishu_book.get('id')}"
            )
            sishu_book_id = sishu_book.get("id")
        else:
            log_test(
                "Verify Sishuvatika Workbook in books list",
                False,
                f"Book not found. Available books: {[b.get('name') for b in books]}"
            )
    else:
        log_test("Verify Sishuvatika Workbook in books list", False, "Balvatika class not found")
except Exception as e:
    log_test("Verify Sishuvatika Workbook in books list", False, f"Error: {e}")
print()

# Test 3: Verify exactly 1 chapter
print("Test 3: Verify exactly 1 chapter in Sishuvatika Workbook")
try:
    if sishu_book_id:
        chapters_response = requests.get(
            f"{BASE_URL}/chapters",
            params={"bookId": sishu_book_id},
            timeout=10
        )
        chapters_data = chapters_response.json()
        chapters = chapters_data.get("chapters", [])
        
        if len(chapters) == 1:
            chapter = chapters[0]
            expected_name = "ବାଲବାଟିକା ସିଲାବସ୍ — Developmental Activities"
            if chapter.get("name") == expected_name:
                log_test(
                    "Verify exactly 1 chapter with correct name",
                    True,
                    f"Chapter: {chapter.get('name')}, ID: {chapter.get('id')}"
                )
                sishu_chapter_id = chapter.get("id")
            else:
                log_test(
                    "Verify exactly 1 chapter with correct name",
                    False,
                    f"Expected: {expected_name}, Got: {chapter.get('name')}"
                )
        else:
            log_test(
                "Verify exactly 1 chapter with correct name",
                False,
                f"Expected 1 chapter, found {len(chapters)}"
            )
    else:
        log_test("Verify exactly 1 chapter with correct name", False, "Book ID not available")
except Exception as e:
    log_test("Verify exactly 1 chapter with correct name", False, f"Error: {e}")
print()

# Test 4: Verify exactly 109 lessons
print("Test 4: Verify exactly 109 lessons in chapter")
try:
    if sishu_chapter_id:
        lessons_response = requests.get(
            f"{BASE_URL}/lessons",
            params={"chapterId": sishu_chapter_id},
            timeout=10
        )
        lessons_data = lessons_response.json()
        lessons = lessons_data.get("lessons", [])
        
        if len(lessons) == 109:
            log_test(
                "Verify exactly 109 lessons",
                True,
                f"Found {len(lessons)} lessons (periods 1-109)"
            )
            # Store first lesson ID for spot check
            first_lesson_id = lessons[0].get("id") if lessons else None
        else:
            log_test(
                "Verify exactly 109 lessons",
                False,
                f"Expected 109 lessons, found {len(lessons)}"
            )
    else:
        log_test("Verify exactly 109 lessons", False, "Chapter ID not available")
except Exception as e:
    log_test("Verify exactly 109 lessons", False, f"Error: {e}")
print()

# Test 5: Spot check one lesson for required fields
print("Test 5: Spot check lesson for loCodes, tlm, homework, panchapadi")
try:
    if first_lesson_id:
        lesson_response = requests.get(
            f"{BASE_URL}/lessons/{first_lesson_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        lesson_data = lesson_response.json()
        lesson = lesson_data.get("lesson", {})
        
        has_lo_codes = isinstance(lesson.get("loCodes"), list) and len(lesson.get("loCodes", [])) > 0
        has_tlm = isinstance(lesson.get("tlm"), list) and len(lesson.get("tlm", [])) > 0
        has_homework = lesson.get("homework") and len(lesson.get("homework", "")) > 0
        has_panchapadi = isinstance(lesson.get("panchapadi"), dict)
        
        # Check panchapadi structure
        panchapadi_valid = False
        if has_panchapadi:
            panchapadi = lesson.get("panchapadi", {})
            required_steps = ["prastabana", "anweshana", "alochana", "prayoga", "mulyayana"]
            all_steps_present = all(step in panchapadi for step in required_steps)
            
            # Check if each step has required sub-fields
            step_structure_valid = True
            if all_steps_present:
                for step_name in required_steps:
                    step = panchapadi.get(step_name, {})
                    required_fields = ["teacherActivityText", "studentActivityText", "timing"]
                    if not all(field in step for field in required_fields):
                        step_structure_valid = False
                        break
                panchapadi_valid = step_structure_valid
        
        all_valid = has_lo_codes and has_tlm and has_homework and panchapadi_valid
        
        if all_valid:
            log_test(
                "Spot check lesson structure",
                True,
                f"loCodes: {lesson.get('loCodes', [])[:3]}, tlm count: {len(lesson.get('tlm', []))}, homework: {len(lesson.get('homework', ''))} chars, panchapadi: 5 steps with all sub-fields"
            )
        else:
            log_test(
                "Spot check lesson structure",
                False,
                f"loCodes: {has_lo_codes}, tlm: {has_tlm}, homework: {has_homework}, panchapadi: {panchapadi_valid}"
            )
    else:
        log_test("Spot check lesson structure", False, "Lesson ID not available")
except Exception as e:
    log_test("Spot check lesson structure", False, f"Error: {e}")
print()

# Test 6: Idempotency - Import again
print("Test 6: Idempotency - Import Sishuvatika Workbook again")
try:
    response = requests.post(
        f"{BASE_URL}/admin/import/sishuvatika-workbook",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30
    )
    data = response.json()
    
    if response.status_code == 200:
        removed = data.get("removedExistingLessons", 0)
        inserted = data.get("inserted", 0)
        
        if removed == 109 and inserted == 109:
            log_test(
                "Idempotency - Second import",
                True,
                f"Removed: {removed}, Inserted: {inserted} (idempotent)"
            )
        else:
            log_test(
                "Idempotency - Second import",
                False,
                f"Expected removed=109, inserted=109. Got removed={removed}, inserted={inserted}"
            )
    else:
        log_test(
            "Idempotency - Second import",
            False,
            f"Status: {response.status_code}"
        )
except Exception as e:
    log_test("Idempotency - Second import", False, f"Error: {e}")
print()

# Test 7: Verify lesson count still 109 after re-import
print("Test 7: Verify lesson count still 109 after re-import (no duplicates)")
try:
    # Re-fetch the chapter ID since it was recreated during re-import
    if sishu_book_id:
        # Get the book again to ensure we have the latest ID
        books_response = requests.get(
            f"{BASE_URL}/books",
            params={"classId": balvatika_class_id},
            timeout=10
        )
        books_data = books_response.json()
        books = books_data.get("books", [])
        sishu_book = next((b for b in books if b.get("name") == "Sishuvatika Workbook"), None)
        
        if sishu_book:
            sishu_book_id = sishu_book.get("id")
            
            # Get the chapter again
            chapters_response = requests.get(
                f"{BASE_URL}/chapters",
                params={"bookId": sishu_book_id},
                timeout=10
            )
            chapters_data = chapters_response.json()
            chapters = chapters_data.get("chapters", [])
            
            if len(chapters) > 0:
                sishu_chapter_id = chapters[0].get("id")
                
                # Now get lessons with the new chapter ID
                lessons_response = requests.get(
                    f"{BASE_URL}/lessons",
                    params={"chapterId": sishu_chapter_id},
                    timeout=10
                )
                lessons_data = lessons_response.json()
                lessons = lessons_data.get("lessons", [])
                
                if len(lessons) == 109:
                    log_test(
                        "Verify no duplicates after re-import",
                        True,
                        f"Still exactly 109 lessons (no duplicates)"
                    )
                else:
                    log_test(
                        "Verify no duplicates after re-import",
                        False,
                        f"Expected 109 lessons, found {len(lessons)}"
                    )
            else:
                log_test("Verify no duplicates after re-import", False, "No chapters found after re-import")
        else:
            log_test("Verify no duplicates after re-import", False, "Book not found after re-import")
    else:
        log_test("Verify no duplicates after re-import", False, "Book ID not available")
except Exception as e:
    log_test("Verify no duplicates after re-import", False, f"Error: {e}")
print()

# ===== TEST GROUP 2: Balvatika LO Codes Import =====
print("=" * 80)
print("TEST GROUP 2: POST /api/admin/import/balvatika-locodes")
print("=" * 80)
print()

# Test 8: Import Balvatika LO Codes (first time)
print("Test 8: Import Balvatika LO Codes (first import)")
try:
    response = requests.post(
        f"{BASE_URL}/admin/import/balvatika-locodes",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30
    )
    data = response.json()
    
    if response.status_code == 200:
        if data.get("ok") and data.get("inserted") == 74:
            log_test(
                "Import Balvatika LO Codes - First Import",
                True,
                f"Inserted: {data.get('inserted')}, Removed: {data.get('removed', 0)}"
            )
        else:
            log_test(
                "Import Balvatika LO Codes - First Import",
                False,
                f"Expected inserted=74, got: {data.get('inserted')}"
            )
    else:
        log_test(
            "Import Balvatika LO Codes - First Import",
            False,
            f"Status: {response.status_code}, Response: {response.text[:200]}"
        )
except Exception as e:
    log_test("Import Balvatika LO Codes - First Import", False, f"Error: {e}")
print()

# Test 9: Verify exactly 74 LO codes for class=0
print("Test 9: Verify exactly 74 LO codes for class=0")
try:
    response = requests.get(
        f"{BASE_URL}/lo-codes",
        params={"class": "0"},
        timeout=10
    )
    data = response.json()
    items = data.get("items", [])
    
    if len(items) == 74:
        log_test(
            "Verify exactly 74 LO codes for class=0",
            True,
            f"Found {len(items)} LO codes for Balvatika (class=0)"
        )
    else:
        log_test(
            "Verify exactly 74 LO codes for class=0",
            False,
            f"Expected 74 LO codes, found {len(items)}"
        )
except Exception as e:
    log_test("Verify exactly 74 LO codes for class=0", False, f"Error: {e}")
print()

# Test 10: Spot-check specific LO codes
print("Test 10: Spot-check specific LO codes (CG-1, CG-13, C-1.1, C-12.2, C-8.10)")
try:
    response = requests.get(
        f"{BASE_URL}/lo-codes",
        params={"class": "0"},
        timeout=10
    )
    data = response.json()
    items = data.get("items", [])
    codes = [item.get("code") for item in items]
    
    required_codes = ["CG-1", "CG-13", "C-1.1", "C-12.2", "C-8.10"]
    found_codes = [code for code in required_codes if code in codes]
    
    if len(found_codes) == len(required_codes):
        log_test(
            "Spot-check specific LO codes",
            True,
            f"All required codes found: {found_codes}"
        )
    else:
        missing = [code for code in required_codes if code not in codes]
        log_test(
            "Spot-check specific LO codes",
            False,
            f"Missing codes: {missing}. Found: {found_codes}"
        )
except Exception as e:
    log_test("Spot-check specific LO codes", False, f"Error: {e}")
print()

# Test 11: Verify GET /api/lo-codes/meta includes class 0
print("Test 11: Verify GET /api/lo-codes/meta includes class 0")
try:
    response = requests.get(f"{BASE_URL}/lo-codes/meta", timeout=10)
    data = response.json()
    classes = data.get("classes", [])
    
    if 0 in classes:
        log_test(
            "Verify lo-codes/meta includes class 0",
            True,
            f"Classes: {classes} (includes 0)"
        )
    else:
        log_test(
            "Verify lo-codes/meta includes class 0",
            False,
            f"Class 0 not found in classes: {classes}"
        )
except Exception as e:
    log_test("Verify lo-codes/meta includes class 0", False, f"Error: {e}")
print()

# Test 12: Idempotency - Import Balvatika LO Codes again
print("Test 12: Idempotency - Import Balvatika LO Codes again")
try:
    response = requests.post(
        f"{BASE_URL}/admin/import/balvatika-locodes",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30
    )
    data = response.json()
    
    if response.status_code == 200:
        removed = data.get("removed", 0)
        inserted = data.get("inserted", 0)
        
        if removed == 74 and inserted == 74:
            log_test(
                "Idempotency - Second LO codes import",
                True,
                f"Removed: {removed}, Inserted: {inserted} (idempotent)"
            )
        else:
            log_test(
                "Idempotency - Second LO codes import",
                False,
                f"Expected removed=74, inserted=74. Got removed={removed}, inserted={inserted}"
            )
    else:
        log_test(
            "Idempotency - Second LO codes import",
            False,
            f"Status: {response.status_code}"
        )
except Exception as e:
    log_test("Idempotency - Second LO codes import", False, f"Error: {e}")
print()

# Test 13: Verify LO code count still 74 after re-import
print("Test 13: Verify LO code count still 74 after re-import (no duplicates)")
try:
    response = requests.get(
        f"{BASE_URL}/lo-codes",
        params={"class": "0"},
        timeout=10
    )
    data = response.json()
    items = data.get("items", [])
    
    if len(items) == 74:
        log_test(
            "Verify no duplicates after LO codes re-import",
            True,
            f"Still exactly 74 LO codes (no duplicates)"
        )
    else:
        log_test(
            "Verify no duplicates after LO codes re-import",
            False,
            f"Expected 74 LO codes, found {len(items)}"
        )
except Exception as e:
    log_test("Verify no duplicates after LO codes re-import", False, f"Error: {e}")
print()

# ===== TEST GROUP 3: Auth Gating =====
print("=" * 80)
print("TEST GROUP 3: Auth Gating (401/403)")
print("=" * 80)
print()

# Test 14: Sishuvatika import without token
print("Test 14: POST /api/admin/import/sishuvatika-workbook without token")
try:
    response = requests.post(
        f"{BASE_URL}/admin/import/sishuvatika-workbook",
        timeout=10
    )
    
    if response.status_code in [401, 403]:
        log_test(
            "Sishuvatika import without token returns 401/403",
            True,
            f"Status: {response.status_code} (correctly rejected)"
        )
    else:
        log_test(
            "Sishuvatika import without token returns 401/403",
            False,
            f"Expected 401/403, got {response.status_code}"
        )
except Exception as e:
    log_test("Sishuvatika import without token returns 401/403", False, f"Error: {e}")
print()

# Test 15: Balvatika LO codes import without token
print("Test 15: POST /api/admin/import/balvatika-locodes without token")
try:
    response = requests.post(
        f"{BASE_URL}/admin/import/balvatika-locodes",
        timeout=10
    )
    
    if response.status_code in [401, 403]:
        log_test(
            "Balvatika LO codes import without token returns 401/403",
            True,
            f"Status: {response.status_code} (correctly rejected)"
        )
    else:
        log_test(
            "Balvatika LO codes import without token returns 401/403",
            False,
            f"Expected 401/403, got {response.status_code}"
        )
except Exception as e:
    log_test("Balvatika LO codes import without token returns 401/403", False, f"Error: {e}")
print()

# Test 16: Create non-admin user and test with non-admin token
print("Test 16: POST /api/admin/import/sishuvatika-workbook with non-admin token")
try:
    # Register a regular user with unique mobile
    import random
    test_mobile = f"7{random.randint(100000000, 999999999)}"
    test_password = "test1234"
    user_token = register_user("Test User", test_mobile, test_password)
    
    if user_token:
        response = requests.post(
            f"{BASE_URL}/admin/import/sishuvatika-workbook",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        
        if response.status_code == 403:
            log_test(
                "Sishuvatika import with non-admin token returns 403",
                True,
                f"Status: {response.status_code} (correctly rejected)"
            )
        else:
            log_test(
                "Sishuvatika import with non-admin token returns 403",
                False,
                f"Expected 403, got {response.status_code}"
            )
    else:
        log_test("Sishuvatika import with non-admin token returns 403", False, "Could not create/login test user")
except Exception as e:
    log_test("Sishuvatika import with non-admin token returns 403", False, f"Error: {e}")
print()

# Test 17: Balvatika LO codes import with non-admin token
print("Test 17: POST /api/admin/import/balvatika-locodes with non-admin token")
try:
    if user_token:
        response = requests.post(
            f"{BASE_URL}/admin/import/balvatika-locodes",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        
        if response.status_code == 403:
            log_test(
                "Balvatika LO codes import with non-admin token returns 403",
                True,
                f"Status: {response.status_code} (correctly rejected)"
            )
        else:
            log_test(
                "Balvatika LO codes import with non-admin token returns 403",
                False,
                f"Expected 403, got {response.status_code}"
            )
    else:
        log_test("Balvatika LO codes import with non-admin token returns 403", False, "User token not available")
except Exception as e:
    log_test("Balvatika LO codes import with non-admin token returns 403", False, f"Error: {e}")
print()

# ===== TEST GROUP 4: Regression Tests =====
print("=" * 80)
print("TEST GROUP 4: Regression Tests")
print("=" * 80)
print()

# Test 18: GET /api/settings/public still works
print("Test 18: GET /api/settings/public still works")
try:
    response = requests.get(f"{BASE_URL}/settings/public", timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        has_required_fields = all(key in data for key in ["showPrint", "showPdf", "showWord", "showWatermark"])
        
        if has_required_fields:
            log_test(
                "GET /api/settings/public regression",
                True,
                f"Response: {data}"
            )
        else:
            log_test(
                "GET /api/settings/public regression",
                False,
                f"Missing required fields. Got: {data}"
            )
    else:
        log_test(
            "GET /api/settings/public regression",
            False,
            f"Status: {response.status_code}"
        )
except Exception as e:
    log_test("GET /api/settings/public regression", False, f"Error: {e}")
print()

# Test 19: GET /api/lo-codes/meta returns >=9 classes including 0
print("Test 19: GET /api/lo-codes/meta returns >=9 classes including 0")
try:
    response = requests.get(f"{BASE_URL}/lo-codes/meta", timeout=10)
    data = response.json()
    classes = data.get("classes", [])
    
    if len(classes) >= 9 and 0 in classes:
        log_test(
            "GET /api/lo-codes/meta regression",
            True,
            f"Found {len(classes)} classes including 0: {classes}"
        )
    else:
        log_test(
            "GET /api/lo-codes/meta regression",
            False,
            f"Expected >=9 classes including 0. Got {len(classes)} classes: {classes}"
        )
except Exception as e:
    log_test("GET /api/lo-codes/meta regression", False, f"Error: {e}")
print()

# Test 20: Existing class data remains unchanged (check Class 1 lessons)
print("Test 20: Existing class data remains unchanged (check Class 1)")
try:
    # Get Class 1
    classes_response = requests.get(f"{BASE_URL}/classes", timeout=10)
    classes_data = classes_response.json()
    class1 = next((c for c in classes_data.get("classes", []) if c.get("name") == "Class 1"), None)
    
    if class1:
        # Get books for Class 1
        books_response = requests.get(
            f"{BASE_URL}/books",
            params={"classId": class1.get("id")},
            timeout=10
        )
        books_data = books_response.json()
        books = books_data.get("books", [])
        
        if len(books) > 0:
            log_test(
                "Existing class data unchanged (Class 1)",
                True,
                f"Class 1 has {len(books)} books (data intact)"
            )
        else:
            log_test(
                "Existing class data unchanged (Class 1)",
                False,
                f"Class 1 has no books (data may be corrupted)"
            )
    else:
        log_test("Existing class data unchanged (Class 1)", False, "Class 1 not found")
except Exception as e:
    log_test("Existing class data unchanged (Class 1)", False, f"Error: {e}")
print()

# ===== FINAL SUMMARY =====
print("=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"✅ Tests Passed: {tests_passed}")
print(f"❌ Tests Failed: {tests_failed}")
print(f"📊 Total Tests: {tests_passed + tests_failed}")
print(f"📈 Success Rate: {(tests_passed / (tests_passed + tests_failed) * 100):.1f}%")
print("=" * 80)

if tests_failed == 0:
    print("🎉 ALL TESTS PASSED!")
    sys.exit(0)
else:
    print("⚠️  SOME TESTS FAILED")
    sys.exit(1)
