#!/usr/bin/env python3
"""
Backend test for Panchapadi writeMode 'separate' + browse shows both entries
Tests the new "Add as separate lesson" duplicate handling mode.

Admin login: 9692604577 / <redacted> (SINGLE-DEVICE - log in ONCE, reuse token)
Base URL: http://localhost:3000/api
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
HTML_FILE = "/tmp/pp_base.html"

# Expected values from the HTML file
EXPECTED_CLASS = "Class 1"
EXPECTED_BOOK = "ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)"
EXPECTED_CHAPTER = "ପାଠ - ୨"
EXPECTED_CHAPTER_ID = "99b5f34c-0e3e-4db7-9593-78fbbcca31c7"
EXPECTED_PERIOD = 1
ORIGINAL_LESSON_ID = "f70ad03c-7bf7-420c-b720-a4c0a639c3c8"

# Global token storage
admin_token = None
created_lesson_ids = []

def log_test(step, message):
    """Print test step with formatting"""
    print(f"\n{'='*80}")
    print(f"STEP {step}: {message}")
    print('='*80)

def log_result(success, message):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def read_html_file():
    """Read the Panchapadi HTML file"""
    try:
        with open(HTML_FILE, 'r', encoding='utf-8') as f:
            html_content = f.read()
        print(f"✅ Read HTML file: {len(html_content)} characters")
        return html_content
    except Exception as e:
        print(f"❌ FAIL: Could not read HTML file: {e}")
        sys.exit(1)

def admin_login():
    """Step 0: Admin login (ONCE, reuse token)"""
    global admin_token
    
    log_test(0, "Admin Login (SINGLE-DEVICE - log in ONCE)")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get('token')
            if admin_token:
                log_result(True, f"Admin logged in successfully. Token: {admin_token[:20]}...")
                return True
            else:
                log_result(False, "No token in response")
                return False
        else:
            log_result(False, f"Login failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_result(False, f"Login exception: {e}")
        return False

def test_preview(html_content):
    """Step 1: POST /api/admin/panchapadi-lessons/preview"""
    log_test(1, "POST /api/admin/panchapadi-lessons/preview")
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/panchapadi-lessons/preview",
            json={"html": html_content},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
            
            # Validate response
            checks = []
            checks.append(("preview.ready is true", data.get('preview', {}).get('ready') == True))
            checks.append(("existingCount >= 1", data.get('preview', {}).get('existingCount', 0) >= 1))
            checks.append(("resolved.chapterId matches", data.get('resolved', {}).get('chapterId') == EXPECTED_CHAPTER_ID))
            checks.append(("period is 1", data.get('resolved', {}).get('period') == EXPECTED_PERIOD))
            
            all_passed = all(check[1] for check in checks)
            
            for check_name, check_result in checks:
                log_result(check_result, check_name)
            
            if all_passed:
                log_result(True, "Preview endpoint working correctly - duplicate detected")
                return True
            else:
                log_result(False, "Preview validation failed")
                return False
        else:
            log_result(False, f"Preview failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_result(False, f"Preview exception: {e}")
        return False

def get_baseline_count():
    """Step 2: GET /api/panchapadi-lessons/browse - get baseline count"""
    log_test(2, "GET /api/panchapadi-lessons/browse - Record baseline count")
    
    try:
        response = requests.get(
            f"{BASE_URL}/panchapadi-lessons/browse",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            classes = data.get('classes', [])
            
            # Find Class 1
            class_1 = None
            for cls in classes:
                if cls.get('classLabel') == EXPECTED_CLASS:
                    class_1 = cls
                    break
            
            if not class_1:
                log_result(False, f"Could not find {EXPECTED_CLASS} in browse response")
                return None
            
            print(f"✅ Found {EXPECTED_CLASS}")
            
            # Find the book
            books = class_1.get('books', [])
            target_book = None
            for book in books:
                if book.get('bookLabel') == EXPECTED_BOOK:
                    target_book = book
                    break
            
            if not target_book:
                log_result(False, f"Could not find book '{EXPECTED_BOOK}'")
                return None
            
            print(f"✅ Found book: {EXPECTED_BOOK}")
            
            # Find the chapter
            chapters = target_book.get('chapters', [])
            target_chapter = None
            for chapter in chapters:
                if chapter.get('chapterLabel') == EXPECTED_CHAPTER:
                    target_chapter = chapter
                    break
            
            if not target_chapter:
                log_result(False, f"Could not find chapter '{EXPECTED_CHAPTER}'")
                return None
            
            print(f"✅ Found chapter: {EXPECTED_CHAPTER}")
            
            # Count period==1 entries
            periods = target_chapter.get('periods', [])
            period_1_entries = [p for p in periods if p.get('period') == EXPECTED_PERIOD]
            baseline_count = len(period_1_entries)
            
            print(f"✅ Baseline count for period==1: {baseline_count}")
            print(f"Period 1 entries: {json.dumps(period_1_entries, indent=2, ensure_ascii=False)}")
            
            log_result(True, f"Baseline count recorded: {baseline_count} entry(ies) for period==1")
            return baseline_count
        else:
            log_result(False, f"Browse failed with status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_result(False, f"Browse exception: {e}")
        return None

def create_separate_entry(html_content):
    """Step 3: POST /api/admin/panchapadi-lessons with writeMode='separate'"""
    log_test(3, "POST /api/admin/panchapadi-lessons with writeMode='separate'")
    
    try:
        payload = {
            "html": html_content,
            "writeMode": "separate",
            "status": "published",
            "newLessonPlanVisible": True,
            "allowPrint": False,
            "allowPdfDownload": False,
            "allowHtmlDownload": False,
            "allowRawDownload": False,
            "academicYear": "2026-27",
            "language": "or"
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/panchapadi-lessons",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
            
            # Validate response
            checks = []
            checks.append(("ok is true", data.get('ok') == True))
            
            mode = data.get('mode', '')
            checks.append(("mode contains 'separate'", 'separate' in mode.lower()))
            
            # Get created lesson IDs
            lesson_ids = data.get('lessonIds', [])
            if not lesson_ids:
                # Try single lessonId
                lesson_id = data.get('lessonId') or data.get('id')
                if lesson_id:
                    lesson_ids = [lesson_id]
            
            checks.append(("New lesson ID(s) returned", len(lesson_ids) > 0))
            
            if lesson_ids:
                # Verify new IDs are different from original
                different_from_original = all(lid != ORIGINAL_LESSON_ID for lid in lesson_ids)
                checks.append(("New ID(s) differ from original", different_from_original))
                
                # Store for cleanup
                created_lesson_ids.extend(lesson_ids)
                print(f"✅ Created lesson ID(s): {lesson_ids}")
            
            all_passed = all(check[1] for check in checks)
            
            for check_name, check_result in checks:
                log_result(check_result, check_name)
            
            if all_passed:
                log_result(True, f"Separate entry created successfully. Mode: {mode}, IDs: {lesson_ids}")
                return True
            else:
                log_result(False, "Separate entry creation validation failed")
                return False
        else:
            log_result(False, f"Create failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_result(False, f"Create exception: {e}")
        return False

def verify_both_entries(baseline_count):
    """Step 4: GET /api/panchapadi-lessons/browse - verify both entries exist"""
    log_test(4, "GET /api/panchapadi-lessons/browse - Verify both entries exist")
    
    try:
        response = requests.get(
            f"{BASE_URL}/panchapadi-lessons/browse",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            classes = data.get('classes', [])
            
            # Find Class 1
            class_1 = None
            for cls in classes:
                if cls.get('classLabel') == EXPECTED_CLASS:
                    class_1 = cls
                    break
            
            if not class_1:
                log_result(False, f"Could not find {EXPECTED_CLASS}")
                return False
            
            # Find the book
            books = class_1.get('books', [])
            target_book = None
            for book in books:
                if book.get('bookLabel') == EXPECTED_BOOK:
                    target_book = book
                    break
            
            if not target_book:
                log_result(False, f"Could not find book '{EXPECTED_BOOK}'")
                return False
            
            # Find the chapter
            chapters = target_book.get('chapters', [])
            target_chapter = None
            for chapter in chapters:
                if chapter.get('chapterLabel') == EXPECTED_CHAPTER:
                    target_chapter = chapter
                    break
            
            if not target_chapter:
                log_result(False, f"Could not find chapter '{EXPECTED_CHAPTER}'")
                return False
            
            # Count period==1 entries
            periods = target_chapter.get('periods', [])
            period_1_entries = [p for p in periods if p.get('period') == EXPECTED_PERIOD]
            new_count = len(period_1_entries)
            
            print(f"✅ New count for period==1: {new_count}")
            print(f"Period 1 entries: {json.dumps(period_1_entries, indent=2, ensure_ascii=False)}")
            
            # Validate
            checks = []
            expected_count = baseline_count + 1
            checks.append((f"Count increased to {expected_count}", new_count == expected_count))
            
            # Check for separateEntry flag
            has_separate_entry = any(p.get('separateEntry') == True for p in period_1_entries)
            checks.append(("At least one entry has separateEntry:true", has_separate_entry))
            
            # Check original lesson still exists
            original_exists = any(p.get('id') == ORIGINAL_LESSON_ID for p in period_1_entries)
            checks.append(("Original lesson still present", original_exists))
            
            all_passed = all(check[1] for check in checks)
            
            for check_name, check_result in checks:
                log_result(check_result, check_name)
            
            if all_passed:
                log_result(True, f"Both entries verified. Count: {new_count} (baseline: {baseline_count})")
                return True
            else:
                log_result(False, "Verification failed")
                return False
        else:
            log_result(False, f"Browse failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_result(False, f"Browse exception: {e}")
        return False

def test_replace_mode(html_content):
    """Step 5: POST with writeMode='replace' - should NOT add more separate entries"""
    log_test(5, "POST /api/admin/panchapadi-lessons with writeMode='replace' (negative test)")
    
    try:
        # Get count before replace
        response = requests.get(
            f"{BASE_URL}/panchapadi-lessons/browse",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_result(False, "Could not get count before replace")
            return False
        
        data = response.json()
        classes = data.get('classes', [])
        class_1 = next((c for c in classes if c.get('className') == EXPECTED_CLASS), None)
        if not class_1:
            log_result(False, "Could not find Class 1")
            return False
        
        books = class_1.get('books', [])
        target_book = next((b for b in books if b.get('bookName') == EXPECTED_BOOK), None)
        if not target_book:
            log_result(False, "Could not find book")
            return False
        
        chapters = target_book.get('chapters', [])
        target_chapter = next((ch for ch in chapters if ch.get('chapterName') == EXPECTED_CHAPTER), None)
        if not target_chapter:
            log_result(False, "Could not find chapter")
            return False
        
        periods = target_chapter.get('periods', [])
        count_before_replace = len([p for p in periods if p.get('period') == EXPECTED_PERIOD])
        print(f"✅ Count before replace: {count_before_replace}")
        
        # Now POST with replace mode
        payload = {
            "html": html_content,
            "writeMode": "replace",
            "status": "published",
            "newLessonPlanVisible": True,
            "allowPrint": False,
            "allowPdfDownload": False,
            "allowHtmlDownload": False,
            "allowRawDownload": False,
            "academicYear": "2026-27",
            "language": "or"
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/panchapadi-lessons",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60
        )
        
        print(f"Replace POST status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Replace response: {json.dumps(data, indent=2, ensure_ascii=False)}")
            
            mode = data.get('mode', '')
            print(f"Mode: {mode}")
            
            # Check mode is 'single' or 'bundle' (not 'separate')
            mode_check = mode.lower() in ['single', 'bundle', 'single-replace', 'bundle-replace']
            log_result(mode_check, f"Mode is '{mode}' (not separate)")
            
            # Get count after replace
            response = requests.get(
                f"{BASE_URL}/panchapadi-lessons/browse",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30
            )
            
            if response.status_code != 200:
                log_result(False, "Could not get count after replace")
                return False
            
            data = response.json()
            classes = data.get('classes', [])
            class_1 = next((c for c in classes if c.get('classLabel') == EXPECTED_CLASS), None)
            books = class_1.get('books', [])
            target_book = next((b for b in books if b.get('bookLabel') == EXPECTED_BOOK), None)
            chapters = target_book.get('chapters', [])
            target_chapter = next((ch for ch in chapters if ch.get('chapterLabel') == EXPECTED_CHAPTER), None)
            periods = target_chapter.get('periods', [])
            count_after_replace = len([p for p in periods if p.get('period') == EXPECTED_PERIOD])
            
            print(f"✅ Count after replace: {count_after_replace}")
            
            # Count should NOT increase (replace upserts, doesn't add separate)
            count_unchanged = count_after_replace == count_before_replace
            log_result(count_unchanged, f"Count unchanged: {count_after_replace} == {count_before_replace}")
            
            if mode_check and count_unchanged:
                log_result(True, "Replace mode correctly does NOT add separate entries")
                return True
            else:
                log_result(False, "Replace mode validation failed")
                return False
        else:
            log_result(False, f"Replace POST failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_result(False, f"Replace test exception: {e}")
        return False

def cleanup_created_lessons():
    """Step 6: DELETE created lessons and verify baseline restored"""
    log_test(6, "CLEANUP - Delete created lessons and verify baseline")
    
    if not created_lesson_ids:
        log_result(False, "No lesson IDs to clean up")
        return False
    
    print(f"Deleting {len(created_lesson_ids)} lesson(s): {created_lesson_ids}")
    
    # Delete each created lesson
    deleted_count = 0
    for lesson_id in created_lesson_ids:
        try:
            # Verify we're NOT deleting the original lesson
            if lesson_id == ORIGINAL_LESSON_ID:
                print(f"⚠️  SKIPPING original lesson {ORIGINAL_LESSON_ID} (should not delete)")
                continue
            
            response = requests.delete(
                f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30
            )
            
            if response.status_code == 200:
                print(f"✅ Deleted lesson {lesson_id}")
                deleted_count += 1
            else:
                print(f"⚠️  Failed to delete {lesson_id}: {response.status_code} {response.text}")
        except Exception as e:
            print(f"⚠️  Exception deleting {lesson_id}: {e}")
    
    log_result(deleted_count > 0, f"Deleted {deleted_count} lesson(s)")
    
    # Verify baseline restored
    try:
        response = requests.get(
            f"{BASE_URL}/panchapadi-lessons/browse",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            classes = data.get('classes', [])
            class_1 = next((c for c in classes if c.get('classLabel') == EXPECTED_CLASS), None)
            
            if not class_1:
                log_result(False, "Could not find Class 1 after cleanup")
                return False
            
            books = class_1.get('books', [])
            target_book = next((b for b in books if b.get('bookLabel') == EXPECTED_BOOK), None)
            
            if not target_book:
                log_result(False, "Could not find book after cleanup")
                return False
            
            chapters = target_book.get('chapters', [])
            target_chapter = next((ch for ch in chapters if ch.get('chapterLabel') == EXPECTED_CHAPTER), None)
            
            if not target_chapter:
                log_result(False, "Could not find chapter after cleanup")
                return False
            
            periods = target_chapter.get('periods', [])
            final_count = len([p for p in periods if p.get('period') == EXPECTED_PERIOD])
            
            print(f"✅ Final count for period==1: {final_count}")
            
            # Should be back to baseline (1)
            baseline_restored = final_count == 1
            log_result(baseline_restored, f"Baseline restored: {final_count} entry (expected 1)")
            
            # Verify original lesson still exists
            original_exists = any(p.get('id') == ORIGINAL_LESSON_ID for p in periods if p.get('period') == EXPECTED_PERIOD)
            log_result(original_exists, f"Original lesson {ORIGINAL_LESSON_ID} still exists")
            
            if baseline_restored and original_exists:
                log_result(True, "Cleanup successful - baseline restored")
                return True
            else:
                log_result(False, "Cleanup verification failed")
                return False
        else:
            log_result(False, f"Browse after cleanup failed: {response.status_code}")
            return False
    except Exception as e:
        log_result(False, f"Cleanup verification exception: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("PANCHAPADI WRITEMODE 'SEPARATE' BACKEND TEST")
    print("Testing: Add as separate lesson + browse shows both entries")
    print("="*80)
    
    # Read HTML file
    html_content = read_html_file()
    
    # Step 0: Login (ONCE)
    if not admin_login():
        print("\n❌ FATAL: Admin login failed. Cannot proceed.")
        sys.exit(1)
    
    # Step 1: Preview
    step1_pass = test_preview(html_content)
    
    # Step 2: Get baseline count
    baseline_count = get_baseline_count()
    if baseline_count is None:
        print("\n❌ FATAL: Could not get baseline count. Cannot proceed.")
        sys.exit(1)
    
    # Step 3: Create separate entry
    step3_pass = create_separate_entry(html_content)
    
    # Step 4: Verify both entries
    step4_pass = verify_both_entries(baseline_count)
    
    # Step 5: Test replace mode (negative)
    step5_pass = test_replace_mode(html_content)
    
    # Step 6: Cleanup
    step6_pass = cleanup_created_lessons()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Step 1 (Preview):              {'✅ PASS' if step1_pass else '❌ FAIL'}")
    print(f"Step 2 (Baseline):             {'✅ PASS' if baseline_count is not None else '❌ FAIL'}")
    print(f"Step 3 (Create separate):      {'✅ PASS' if step3_pass else '❌ FAIL'}")
    print(f"Step 4 (Verify both entries):  {'✅ PASS' if step4_pass else '❌ FAIL'}")
    print(f"Step 5 (Replace mode):         {'✅ PASS' if step5_pass else '❌ FAIL'}")
    print(f"Step 6 (Cleanup):              {'✅ PASS' if step6_pass else '❌ FAIL'}")
    print("="*80)
    
    all_passed = all([step1_pass, baseline_count is not None, step3_pass, step4_pass, step5_pass, step6_pass])
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED - Panchapadi writeMode 'separate' working correctly")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED - See details above")
        sys.exit(1)

if __name__ == "__main__":
    main()
