#!/usr/bin/env python3
"""
Backend Test: Panchapadi Chapter Reset-to-Default-Order Feature
================================================================

Tests the new defaultDisplayOrder field, v6 migration, and reset-order endpoint.

Test Objectives:
1. v6 backfill via first admin GET
2. Setup - Pick 2 chapters in DIFFERENT books
3. Simulate custom ordering - PATCH Chapter A displayOrder=9999
4. Reset Chapter A's book
5. ISOLATION check - Chapter B's displayOrder must still be 8888
6. Validation errors
7. Regression - Move + basic CRUD still work
8. Teacher browse regression
9. Cleanup
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test state
admin_token = None
chapter_a = None
chapter_b = None
test_chapter_id = None

def log(msg):
    print(f"[TEST] {msg}")

def log_pass(msg):
    print(f"✅ PASS: {msg}")

def log_fail(msg):
    print(f"❌ FAIL: {msg}")
    
def log_info(msg):
    print(f"ℹ️  INFO: {msg}")

# ============================================================================
# Test 1: Admin Login
# ============================================================================
def test_1_admin_login():
    global admin_token
    log("Test 1: Admin Login")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        
        if resp.status_code != 200:
            log_fail(f"Login failed with status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        if not data.get("token"):
            log_fail(f"No token in response: {data}")
            return False
        
        admin_token = data["token"]
        log_pass(f"Admin login successful, token obtained")
        return True
    except Exception as e:
        log_fail(f"Exception during login: {e}")
        return False

# ============================================================================
# Test 2: v6 Backfill via First Admin GET
# ============================================================================
def test_2_v6_backfill():
    log("Test 2: v6 Backfill via First Admin GET")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        
        if resp.status_code != 200:
            log_fail(f"GET /admin/panchapadi-chapters failed with status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        chapters = data.get("chapters", [])
        
        if not chapters:
            log_fail("No chapters found in response")
            return False
        
        log_info(f"Found {len(chapters)} chapters")
        
        # Assert EVERY chapter has defaultDisplayOrder set
        missing_default = []
        for ch in chapters:
            if "defaultDisplayOrder" not in ch or ch["defaultDisplayOrder"] is None:
                missing_default.append(ch.get("id", "unknown"))
        
        if missing_default:
            log_fail(f"{len(missing_default)} chapters missing defaultDisplayOrder: {missing_default[:5]}")
            return False
        
        log_pass(f"All {len(chapters)} chapters have defaultDisplayOrder populated")
        
        # Verify defaultDisplayOrder is a finite number >= 0
        invalid_values = []
        for ch in chapters:
            val = ch.get("defaultDisplayOrder")
            if not isinstance(val, (int, float)) or val < 0:
                invalid_values.append(f"{ch.get('id')}: {val}")
        
        if invalid_values:
            log_fail(f"Invalid defaultDisplayOrder values: {invalid_values[:5]}")
            return False
        
        log_pass("All defaultDisplayOrder values are valid (>= 0)")
        return True
    except Exception as e:
        log_fail(f"Exception during v6 backfill test: {e}")
        return False

# ============================================================================
# Test 3: Setup - Pick 2 Chapters in DIFFERENT Books
# ============================================================================
def test_3_setup_chapters():
    global chapter_a, chapter_b
    log("Test 3: Setup - Pick 2 Chapters in DIFFERENT Books")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        
        if resp.status_code != 200:
            log_fail(f"GET failed with status {resp.status_code}")
            return False
        
        data = resp.json()
        chapters = data.get("chapters", [])
        
        # Find Chapter A: Class 1, book contains "ଗଣିତ ଖେଳ" (Math)
        math_chapters = [ch for ch in chapters 
                        if ch.get("classLabel") == "Class 1" 
                        and "ଗଣିତ ଖେଳ" in ch.get("bookLabel", "")]
        
        if not math_chapters:
            log_fail("No chapters found for Class 1 / ଗଣିତ ଖେଳ")
            return False
        
        chapter_a = math_chapters[0]
        log_info(f"Chapter A: {chapter_a.get('chapterLabel')} (id={chapter_a.get('id')}, displayOrder={chapter_a.get('displayOrder')}, defaultDisplayOrder={chapter_a.get('defaultDisplayOrder')})")
        
        # Find Chapter B: any chapter in a DIFFERENT (class, book) pair
        for ch in chapters:
            if (ch.get("classLabel") != chapter_a.get("classLabel") or 
                ch.get("bookLabel") != chapter_a.get("bookLabel")):
                chapter_b = ch
                break
        
        if not chapter_b:
            # Create a test chapter in a different book
            log_info("No existing chapter in different book, creating test chapter")
            create_resp = requests.post(f"{BASE_URL}/admin/panchapadi-chapters", 
                headers=headers,
                json={
                    "classLabel": "Class 1",
                    "bookLabel": "TEST-BOOK-Reset-Iso",
                    "chapterLabel": "Test-Iso-Ch-1",
                    "chapterName": "Test Iso 1"
                },
                timeout=30)
            
            if create_resp.status_code != 200:
                log_fail(f"Failed to create test chapter: {create_resp.text}")
                return False
            
            chapter_b = create_resp.json().get("chapter")
            log_info(f"Created test Chapter B: {chapter_b.get('chapterLabel')} (id={chapter_b.get('id')})")
        else:
            log_info(f"Chapter B: {chapter_b.get('chapterLabel')} (id={chapter_b.get('id')}, class={chapter_b.get('classLabel')}, book={chapter_b.get('bookLabel')}, displayOrder={chapter_b.get('displayOrder')}, defaultDisplayOrder={chapter_b.get('defaultDisplayOrder')})")
        
        log_pass(f"Setup complete: Chapter A and B selected from different books")
        return True
    except Exception as e:
        log_fail(f"Exception during setup: {e}")
        return False

# ============================================================================
# Test 4: Simulate Custom Ordering - PATCH Chapter A displayOrder=9999
# ============================================================================
def test_4_custom_ordering():
    log("Test 4: Simulate Custom Ordering - PATCH displayOrder=9999")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # PATCH Chapter A to displayOrder=9999
        resp_a = requests.patch(
            f"{BASE_URL}/admin/panchapadi-chapters/{chapter_a['id']}",
            headers=headers,
            json={"displayOrder": 9999},
            timeout=30
        )
        
        if resp_a.status_code != 200:
            log_fail(f"PATCH Chapter A failed with status {resp_a.status_code}: {resp_a.text}")
            return False
        
        data_a = resp_a.json()
        if data_a.get("chapter", {}).get("displayOrder") != 9999:
            log_fail(f"Chapter A displayOrder not updated: {data_a}")
            return False
        
        log_pass(f"Chapter A displayOrder updated to 9999")
        
        # PATCH Chapter B to displayOrder=8888
        resp_b = requests.patch(
            f"{BASE_URL}/admin/panchapadi-chapters/{chapter_b['id']}",
            headers=headers,
            json={"displayOrder": 8888},
            timeout=30
        )
        
        if resp_b.status_code != 200:
            log_fail(f"PATCH Chapter B failed with status {resp_b.status_code}: {resp_b.text}")
            return False
        
        data_b = resp_b.json()
        if data_b.get("chapter", {}).get("displayOrder") != 8888:
            log_fail(f"Chapter B displayOrder not updated: {data_b}")
            return False
        
        log_pass(f"Chapter B displayOrder updated to 8888")
        
        # GET and verify both chapters
        resp_get = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        if resp_get.status_code != 200:
            log_fail(f"GET failed: {resp_get.text}")
            return False
        
        chapters = resp_get.json().get("chapters", [])
        ch_a_updated = next((ch for ch in chapters if ch["id"] == chapter_a["id"]), None)
        ch_b_updated = next((ch for ch in chapters if ch["id"] == chapter_b["id"]), None)
        
        if not ch_a_updated or ch_a_updated.get("displayOrder") != 9999:
            log_fail(f"Chapter A displayOrder verification failed: {ch_a_updated}")
            return False
        
        if not ch_b_updated or ch_b_updated.get("displayOrder") != 8888:
            log_fail(f"Chapter B displayOrder verification failed: {ch_b_updated}")
            return False
        
        # Verify defaultDisplayOrder unchanged
        if ch_a_updated.get("defaultDisplayOrder") != chapter_a.get("defaultDisplayOrder"):
            log_fail(f"Chapter A defaultDisplayOrder changed unexpectedly")
            return False
        
        if ch_b_updated.get("defaultDisplayOrder") != chapter_b.get("defaultDisplayOrder"):
            log_fail(f"Chapter B defaultDisplayOrder changed unexpectedly")
            return False
        
        log_pass("Both chapters updated, defaultDisplayOrder unchanged")
        return True
    except Exception as e:
        log_fail(f"Exception during custom ordering: {e}")
        return False

# ============================================================================
# Test 5: Reset Chapter A's Book
# ============================================================================
def test_5_reset_chapter_a_book():
    log("Test 5: Reset Chapter A's Book")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # POST reset-order for Chapter A's book
        resp = requests.post(
            f"{BASE_URL}/admin/panchapadi-chapters/reset-order",
            headers=headers,
            json={
                "classLabel": chapter_a["classLabel"],
                "bookLabel": chapter_a["bookLabel"]
            },
            timeout=30
        )
        
        if resp.status_code != 200:
            log_fail(f"Reset-order failed with status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        if not data.get("ok"):
            log_fail(f"Reset-order response not ok: {data}")
            return False
        
        reset_count = data.get("resetCount", 0)
        if reset_count < 1:
            log_fail(f"Reset count is {reset_count}, expected >= 1")
            return False
        
        log_pass(f"Reset-order successful, resetCount={reset_count}")
        
        # GET and verify Chapter A displayOrder == defaultDisplayOrder
        resp_get = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        if resp_get.status_code != 200:
            log_fail(f"GET failed: {resp_get.text}")
            return False
        
        chapters = resp_get.json().get("chapters", [])
        ch_a_reset = next((ch for ch in chapters if ch["id"] == chapter_a["id"]), None)
        
        if not ch_a_reset:
            log_fail(f"Chapter A not found after reset")
            return False
        
        if ch_a_reset.get("displayOrder") != chapter_a.get("defaultDisplayOrder"):
            log_fail(f"Chapter A displayOrder not reset to defaultDisplayOrder. Got {ch_a_reset.get('displayOrder')}, expected {chapter_a.get('defaultDisplayOrder')}")
            return False
        
        log_pass(f"Chapter A displayOrder reset to defaultDisplayOrder ({chapter_a.get('defaultDisplayOrder')})")
        return True
    except Exception as e:
        log_fail(f"Exception during reset: {e}")
        return False

# ============================================================================
# Test 6: ISOLATION Check - Chapter B's displayOrder Must Still Be 8888
# ============================================================================
def test_6_isolation_check():
    log("Test 6: ISOLATION Check - Chapter B displayOrder must still be 8888")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        resp = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        if resp.status_code != 200:
            log_fail(f"GET failed: {resp.text}")
            return False
        
        chapters = resp.json().get("chapters", [])
        ch_b_check = next((ch for ch in chapters if ch["id"] == chapter_b["id"]), None)
        
        if not ch_b_check:
            log_fail(f"Chapter B not found")
            return False
        
        if ch_b_check.get("displayOrder") != 8888:
            log_fail(f"Chapter B displayOrder changed! Got {ch_b_check.get('displayOrder')}, expected 8888")
            return False
        
        log_pass(f"Chapter B displayOrder unchanged (8888) - isolation verified")
        return True
    except Exception as e:
        log_fail(f"Exception during isolation check: {e}")
        return False

# ============================================================================
# Test 7: Validation Errors
# ============================================================================
def test_7_validation_errors():
    log("Test 7: Validation Errors")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test 7a: Missing classLabel/bookLabel
        resp_empty = requests.post(
            f"{BASE_URL}/admin/panchapadi-chapters/reset-order",
            headers=headers,
            json={},
            timeout=30
        )
        
        if resp_empty.status_code != 400:
            log_fail(f"Empty body should return 400, got {resp_empty.status_code}")
            return False
        
        error_msg = resp_empty.json().get("error", "")
        if "classLabel" not in error_msg or "bookLabel" not in error_msg:
            log_fail(f"Error message should mention classLabel/bookLabel: {error_msg}")
            return False
        
        log_pass("Empty body validation working (400)")
        
        # Test 7b: Non-existent class/book
        resp_nonexist = requests.post(
            f"{BASE_URL}/admin/panchapadi-chapters/reset-order",
            headers=headers,
            json={
                "classLabel": "NonExistentClassXYZ",
                "bookLabel": "NonExistentBookXYZ"
            },
            timeout=30
        )
        
        if resp_nonexist.status_code != 200:
            log_fail(f"Non-existent class/book should return 200, got {resp_nonexist.status_code}")
            return False
        
        data = resp_nonexist.json()
        if data.get("resetCount") != 0 or data.get("matched") != 0:
            log_fail(f"Non-existent class/book should have resetCount=0, matched=0: {data}")
            return False
        
        log_pass("Non-existent class/book validation working (200, resetCount=0)")
        return True
    except Exception as e:
        log_fail(f"Exception during validation tests: {e}")
        return False

# ============================================================================
# Test 8: Regression - Move + Basic CRUD Still Work
# ============================================================================
def test_8_regression_crud():
    global test_chapter_id
    log("Test 8: Regression - Move + Basic CRUD Still Work")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # 8a: POST - Create a fresh test chapter
        resp_create = requests.post(
            f"{BASE_URL}/admin/panchapadi-chapters",
            headers=headers,
            json={
                "classLabel": "Class 1",
                "bookLabel": "TEST-BOOK-CRUD",
                "chapterLabel": "Test-CRUD-Ch-1",
                "chapterName": "Test CRUD Chapter"
            },
            timeout=30
        )
        
        if resp_create.status_code != 200:
            log_fail(f"POST create failed: {resp_create.text}")
            return False
        
        test_chapter_id = resp_create.json().get("chapter", {}).get("id")
        log_pass(f"POST create successful (id={test_chapter_id})")
        
        # 8b: PATCH - Edit chapterName
        resp_patch = requests.patch(
            f"{BASE_URL}/admin/panchapadi-chapters/{test_chapter_id}",
            headers=headers,
            json={"chapterName": "Test CRUD Chapter Updated"},
            timeout=30
        )
        
        if resp_patch.status_code != 200:
            log_fail(f"PATCH edit failed: {resp_patch.text}")
            return False
        
        log_pass("PATCH edit successful")
        
        # 8c: POST move (skip if no sibling available)
        # Get all chapters in the same book to check if there's a sibling
        resp_get = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        if resp_get.status_code == 200:
            chapters = resp_get.json().get("chapters", [])
            siblings = [ch for ch in chapters 
                       if ch.get("classLabel") == "Class 1" 
                       and ch.get("bookLabel") == "TEST-BOOK-CRUD"
                       and ch.get("id") != test_chapter_id]
            
            if siblings:
                resp_move = requests.post(
                    f"{BASE_URL}/admin/panchapadi-chapters/{test_chapter_id}/move",
                    headers=headers,
                    json={"direction": "down"},
                    timeout=30
                )
                
                if resp_move.status_code != 200:
                    log_fail(f"POST move failed: {resp_move.text}")
                    return False
                
                log_pass("POST move successful")
            else:
                log_info("Skipping move test (no sibling available)")
        
        # 8d: DELETE - Archive
        resp_delete = requests.delete(
            f"{BASE_URL}/admin/panchapadi-chapters/{test_chapter_id}",
            headers=headers,
            timeout=30
        )
        
        if resp_delete.status_code != 200:
            log_fail(f"DELETE archive failed: {resp_delete.text}")
            return False
        
        log_pass("DELETE archive successful")
        
        # 8e: POST restore
        resp_restore = requests.post(
            f"{BASE_URL}/admin/panchapadi-chapters/{test_chapter_id}/restore",
            headers=headers,
            json={},
            timeout=30
        )
        
        if resp_restore.status_code != 200:
            log_fail(f"POST restore failed: {resp_restore.text}")
            return False
        
        log_pass("POST restore successful")
        
        log_pass("All CRUD operations working correctly")
        return True
    except Exception as e:
        log_fail(f"Exception during CRUD regression: {e}")
        return False

# ============================================================================
# Test 9: Teacher Browse Regression
# ============================================================================
def test_9_teacher_browse():
    log("Test 9: Teacher Browse Regression")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=30)
        
        if resp.status_code != 200:
            log_fail(f"GET /panchapadi-lessons/browse failed with status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        classes = data.get("classes", [])
        
        if not classes:
            log_fail("No classes found in browse response")
            return False
        
        log_info(f"Found {len(classes)} classes in browse")
        
        # Verify chapters are ordered by displayOrder ascending
        for cls in classes:
            for book in cls.get("books", []):
                chapters = book.get("chapters", [])
                if len(chapters) > 1:
                    for i in range(len(chapters) - 1):
                        curr_order = chapters[i].get("displayOrder", 0)
                        next_order = chapters[i + 1].get("displayOrder", 0)
                        if curr_order > next_order:
                            log_fail(f"Chapters not ordered by displayOrder: {curr_order} > {next_order}")
                            return False
        
        log_pass("Teacher browse working, chapters ordered by displayOrder")
        return True
    except Exception as e:
        log_fail(f"Exception during teacher browse: {e}")
        return False

# ============================================================================
# Test 10: Cleanup
# ============================================================================
def test_10_cleanup():
    log("Test 10: Cleanup")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Archive test chapters created during tests
        cleanup_ids = []
        
        if test_chapter_id:
            cleanup_ids.append(test_chapter_id)
        
        # Find and archive TEST-BOOK-Reset-Iso chapters
        resp_get = requests.get(f"{BASE_URL}/admin/panchapadi-chapters", headers=headers, timeout=30)
        if resp_get.status_code == 200:
            chapters = resp_get.json().get("chapters", [])
            test_chapters = [ch for ch in chapters 
                           if "TEST-BOOK" in ch.get("bookLabel", "")]
            
            for ch in test_chapters:
                cleanup_ids.append(ch["id"])
        
        # Archive all test chapters
        for ch_id in cleanup_ids:
            resp_del = requests.delete(
                f"{BASE_URL}/admin/panchapadi-chapters/{ch_id}",
                headers=headers,
                timeout=30
            )
            if resp_del.status_code == 200:
                log_info(f"Archived test chapter {ch_id}")
        
        log_pass(f"Cleanup complete, archived {len(cleanup_ids)} test chapters")
        return True
    except Exception as e:
        log_fail(f"Exception during cleanup: {e}")
        return False

# ============================================================================
# Main Test Runner
# ============================================================================
def main():
    print("=" * 80)
    print("Backend Test: Panchapadi Chapter Reset-to-Default-Order Feature")
    print("=" * 80)
    print()
    
    tests = [
        ("Admin Login", test_1_admin_login),
        ("v6 Backfill via First Admin GET", test_2_v6_backfill),
        ("Setup - Pick 2 Chapters in DIFFERENT Books", test_3_setup_chapters),
        ("Simulate Custom Ordering - PATCH displayOrder=9999", test_4_custom_ordering),
        ("Reset Chapter A's Book", test_5_reset_chapter_a_book),
        ("ISOLATION Check - Chapter B displayOrder=8888", test_6_isolation_check),
        ("Validation Errors", test_7_validation_errors),
        ("Regression - Move + Basic CRUD", test_8_regression_crud),
        ("Teacher Browse Regression", test_9_teacher_browse),
        ("Cleanup", test_10_cleanup),
    ]
    
    results = []
    for name, test_func in tests:
        print()
        print("-" * 80)
        result = test_func()
        results.append((name, result))
        print("-" * 80)
    
    print()
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print()
    print(f"Total: {passed}/{total} tests passed")
    print("=" * 80)
    
    if passed == total:
        print()
        print("🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print()
        print(f"⚠️  {total - passed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
