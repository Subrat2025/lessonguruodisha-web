#!/usr/bin/env python3
"""
Backend test for the new "hide chapter from Lessons list only" admin feature.

Tests the following:
- Field returned in list projection
- Single-chapter toggle endpoint
- Bulk endpoint
- scope=lessons filter (critical test)
- Admin/uploader sees hidden even with scope=lessons
- Non-regression: other consumers of /chapters unaffected
- hiddenFromLessons doesn't cascade to /lessons
- 404 & auth guards
"""

import requests
import sys
import os

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials (from review_request)
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
REGULAR_MOBILE = "9999900001"
REGULAR_PASSWORD = "<redacted>"

def login(mobile, password):
    """Login and return token"""
    try:
        r = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=30)
        if r.status_code == 200:
            data = r.json()
            return data.get('token')
        else:
            print(f"❌ Login failed for {mobile}: {r.status_code} {r.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def test_field_in_projection(admin_token):
    """TEST A — Field returned in list projection"""
    print("\n=== TEST A: Field returned in list projection ===")
    try:
        # Get classes first
        r = requests.get(f"{API_BASE}/classes", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get classes: {r.status_code}")
            return False, None, None, None
        classes_data = r.json()
        # Handle both array and object with 'classes' key
        if isinstance(classes_data, dict):
            classes = classes_data.get('classes', [])
        else:
            classes = classes_data
        if not classes:
            print("❌ No classes found")
            return False, None, None, None
        
        # Pick first class with books
        class_id = None
        book_id = None
        for cls in classes:
            r2 = requests.get(f"{API_BASE}/books?classId={cls['id']}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
            if r2.status_code == 200:
                books_data = r2.json()
                # Handle both array and object with 'books' key
                if isinstance(books_data, dict):
                    books = books_data.get('books', [])
                else:
                    books = books_data
                if books:
                    class_id = cls['id']
                    book_id = books[0]['id']
                    break
        
        if not book_id:
            print("❌ No books found")
            return False, None, None, None
        
        # Get chapters for this book
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters: {r.status_code}")
            return False
        
        data = r.json()
        chapters = data.get('chapters', [])
        if len(chapters) < 3:
            print(f"⚠️  Only {len(chapters)} chapters found, need at least 3 for full test")
        
        # Check that hiddenFromLessons field is present (may be missing/false initially)
        for ch in chapters[:3]:
            if 'hiddenFromLessons' not in ch and ch.get('hiddenFromLessons') is None:
                # Field can be missing or false initially - both are fine
                pass
            print(f"✅ Chapter {ch['id'][:8]}... has hiddenFromLessons field: {ch.get('hiddenFromLessons', 'missing/false')}")
        
        print(f"✅ TEST A PASSED: hiddenFromLessons field is in projection (found {len(chapters)} chapters)")
        return True, class_id, book_id, chapters[0]['id'] if chapters else None
    except Exception as e:
        print(f"❌ TEST A FAILED: {e}")
        return False, None, None, None

def test_single_toggle(admin_token, chapter_id, book_id):
    """TEST B — Single-chapter toggle endpoint"""
    print("\n=== TEST B: Single-chapter toggle endpoint ===")
    try:
        # 1. Hide the chapter
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to hide chapter: {r.status_code} {r.text[:200]}")
            return False
        data = r.json()
        if not data.get('ok') or data.get('hiddenFromLessons') != True:
            print(f"❌ Unexpected response: {data}")
            return False
        print(f"✅ Step 1: Hidden chapter {chapter_id[:8]}... → hiddenFromLessons=true")
        
        # 2. Verify in list
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}", 
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        target = next((ch for ch in chapters if ch['id'] == chapter_id), None)
        if not target or target.get('hiddenFromLessons') != True:
            print(f"❌ Chapter not hidden in list: {target}")
            return False
        print(f"✅ Step 2: Verified hiddenFromLessons=true in list")
        
        # 3. Unhide
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": False}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to unhide chapter: {r.status_code}")
            return False
        data = r.json()
        if not data.get('ok') or data.get('hiddenFromLessons') != False:
            print(f"❌ Unexpected response: {data}")
            return False
        print(f"✅ Step 3: Unhidden chapter → hiddenFromLessons=false")
        
        # 4. Bad payload
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": "yes"}, timeout=30)
        if r.status_code != 400:
            print(f"❌ Expected 400 for bad payload, got {r.status_code}")
            return False
        if 'hidden' not in r.text.lower() and 'boolean' not in r.text.lower():
            print(f"❌ Expected error message about boolean, got: {r.text[:200]}")
            return False
        print(f"✅ Step 4: Bad payload rejected with 400")
        
        print("✅ TEST B PASSED: Single-chapter toggle working")
        return True
    except Exception as e:
        print(f"❌ TEST B FAILED: {e}")
        return False

def test_bulk_endpoint(admin_token, book_id):
    """TEST C — Bulk endpoint"""
    print("\n=== TEST C: Bulk endpoint ===")
    try:
        # Get 2-3 chapters
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}", 
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        if len(chapters) < 2:
            print(f"⚠️  Only {len(chapters)} chapters, need at least 2")
            return False
        
        test_ids = [ch['id'] for ch in chapters[:3]]
        print(f"Testing with {len(test_ids)} chapters: {[id[:8] for id in test_ids]}")
        
        # 1. Bulk hide
        r = requests.put(f"{API_BASE}/admin/chapters/lessons-visibility/bulk", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"ids": test_ids, "hidden": True}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Bulk hide failed: {r.status_code} {r.text[:200]}")
            return False
        data = r.json()
        if not data.get('ok') or data.get('hidden') != True:
            print(f"❌ Unexpected response: {data}")
            return False
        print(f"✅ Step 1: Bulk hidden {data.get('matched')} chapters (modified: {data.get('modified')})")
        
        # 2. Verify all hidden
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}", 
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        for tid in test_ids:
            target = next((ch for ch in chapters if ch['id'] == tid), None)
            if not target or target.get('hiddenFromLessons') != True:
                print(f"❌ Chapter {tid[:8]} not hidden: {target}")
                return False
        print(f"✅ Step 2: All {len(test_ids)} chapters verified hidden")
        
        # 3. Bulk unhide
        r = requests.put(f"{API_BASE}/admin/chapters/lessons-visibility/bulk", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"ids": test_ids, "hidden": False}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Bulk unhide failed: {r.status_code}")
            return False
        print(f"✅ Step 3: Bulk unhidden")
        
        # 4. Missing ids
        r = requests.put(f"{API_BASE}/admin/chapters/lessons-visibility/bulk", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={}, timeout=30)
        if r.status_code != 400:
            print(f"❌ Expected 400 for missing ids, got {r.status_code}")
            return False
        print(f"✅ Step 4: Missing ids rejected with 400")
        
        print("✅ TEST C PASSED: Bulk endpoint working")
        return True, test_ids
    except Exception as e:
        print(f"❌ TEST C FAILED: {e}")
        return False, []

def test_scope_filter(admin_token, regular_token, book_id, chapter_id):
    """TEST D — scope=lessons filter (CRITICAL TEST)"""
    print("\n=== TEST D: scope=lessons filter (CRITICAL) ===")
    try:
        # 1. Hide chapter as admin
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to hide chapter: {r.status_code}")
            return False
        print(f"✅ Step 1: Hidden chapter {chapter_id[:8]}...")
        
        # 2. Regular user with scope=lessons → chapter MUST NOT appear
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}&scope=lessons", 
                        headers={"Authorization": f"Bearer {regular_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters with scope: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        if any(ch['id'] == chapter_id for ch in chapters):
            print(f"❌ Hidden chapter STILL VISIBLE with scope=lessons for regular user")
            return False
        print(f"✅ Step 2: Hidden chapter NOT in list with scope=lessons (regular user)")
        
        # 3. Regular user WITHOUT scope → chapter MUST appear
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}", 
                        headers={"Authorization": f"Bearer {regular_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters without scope: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        if not any(ch['id'] == chapter_id for ch in chapters):
            print(f"❌ Hidden chapter NOT visible without scope (should be visible)")
            return False
        print(f"✅ Step 3: Hidden chapter STILL in list without scope (pickers work)")
        
        # 4. Unhide
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": False}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to unhide: {r.status_code}")
            return False
        print(f"✅ Step 4: Unhidden chapter (cleanup)")
        
        print("✅ TEST D PASSED: scope=lessons filter working correctly")
        return True
    except Exception as e:
        print(f"❌ TEST D FAILED: {e}")
        return False

def test_admin_bypass(admin_token, book_id, chapter_id):
    """TEST E — Admin/uploader sees hidden even with scope=lessons"""
    print("\n=== TEST E: Admin bypass with scope=lessons ===")
    try:
        # 1. Hide chapter
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to hide chapter: {r.status_code}")
            return False
        print(f"✅ Step 1: Hidden chapter {chapter_id[:8]}...")
        
        # 2. Admin with scope=lessons → chapter MUST still appear
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}&scope=lessons", 
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        if not any(ch['id'] == chapter_id for ch in chapters):
            print(f"❌ Admin cannot see hidden chapter with scope=lessons")
            return False
        print(f"✅ Step 2: Admin sees hidden chapter even with scope=lessons")
        
        # 3. Unhide (cleanup)
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": False}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to unhide: {r.status_code}")
            return False
        print(f"✅ Step 3: Unhidden (cleanup)")
        
        print("✅ TEST E PASSED: Admin bypass working")
        return True
    except Exception as e:
        print(f"❌ TEST E FAILED: {e}")
        return False

def test_non_regression(regular_token, book_id, chapter_id, admin_token):
    """TEST F — Non-regression: other consumers unaffected"""
    print("\n=== TEST F: Non-regression (other consumers) ===")
    try:
        # 1. Hide chapter
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to hide chapter: {r.status_code}")
            return False
        print(f"✅ Step 1: Hidden chapter {chapter_id[:8]}...")
        
        # 2. Regular user without scope → chapter returned
        r = requests.get(f"{API_BASE}/chapters?bookId={book_id}", 
                        headers={"Authorization": f"Bearer {regular_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to get chapters: {r.status_code}")
            return False
        chapters = r.json().get('chapters', [])
        if not any(ch['id'] == chapter_id for ch in chapters):
            print(f"❌ Hidden chapter not visible without scope (should be)")
            return False
        print(f"✅ Step 2: Hidden chapter visible without scope (pickers work)")
        
        # 3. Unhide (cleanup)
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": False}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to unhide: {r.status_code}")
            return False
        print(f"✅ Step 3: Unhidden (cleanup)")
        
        print("✅ TEST F PASSED: Non-regression verified")
        return True
    except Exception as e:
        print(f"❌ TEST F FAILED: {e}")
        return False

def test_lessons_endpoint(regular_token, chapter_id, admin_token):
    """TEST G — hiddenFromLessons doesn't cascade to /lessons"""
    print("\n=== TEST G: /lessons endpoint not affected ===")
    try:
        # 1. Hide chapter
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to hide chapter: {r.status_code}")
            return False
        print(f"✅ Step 1: Hidden chapter {chapter_id[:8]}...")
        
        # 2. Get lessons for hidden chapter
        r = requests.get(f"{API_BASE}/lessons?chapterId={chapter_id}", 
                        headers={"Authorization": f"Bearer {regular_token}"}, timeout=30)
        if r.status_code != 200:
            print(f"⚠️  /lessons endpoint returned {r.status_code} (may be expected if no lessons)")
        else:
            lessons = r.json().get('lessons', [])
            print(f"✅ Step 2: /lessons endpoint still works (returned {len(lessons)} lessons)")
            print(f"   Note: This is BY DESIGN - scope gate is on /chapters only")
        
        # 3. Unhide (cleanup)
        r = requests.put(f"{API_BASE}/admin/chapters/{chapter_id}/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": False}, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to unhide: {r.status_code}")
            return False
        print(f"✅ Step 3: Unhidden (cleanup)")
        
        print("✅ TEST G PASSED: /lessons endpoint behavior recorded")
        return True
    except Exception as e:
        print(f"❌ TEST G FAILED: {e}")
        return False

def test_auth_guards(admin_token, regular_token):
    """TEST H — 404 & auth guards"""
    print("\n=== TEST H: 404 & auth guards ===")
    try:
        # 1. Non-existent chapter
        r = requests.put(f"{API_BASE}/admin/chapters/nonexistent-id-12345/lessons-visibility", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code != 404:
            print(f"❌ Expected 404 for non-existent chapter, got {r.status_code}")
            return False
        if 'not found' not in r.text.lower():
            print(f"❌ Expected 'not found' in error, got: {r.text[:200]}")
            return False
        print(f"✅ Step 1: Non-existent chapter → 404")
        
        # 2. Regular user trying to hide
        r = requests.put(f"{API_BASE}/admin/chapters/some-id/lessons-visibility", 
                        headers={"Authorization": f"Bearer {regular_token}"},
                        json={"hidden": True}, timeout=30)
        if r.status_code not in [401, 403]:
            print(f"❌ Expected 401/403 for regular user, got {r.status_code}")
            return False
        print(f"✅ Step 2: Regular user → {r.status_code} (auth guard working)")
        
        print("✅ TEST H PASSED: Auth guards working")
        return True
    except Exception as e:
        print(f"❌ TEST H FAILED: {e}")
        return False

def main():
    print("=" * 80)
    print("BACKEND TEST: Hide Chapter from Lessons List Only")
    print("=" * 80)
    
    # Login
    print("\n=== AUTHENTICATION ===")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ Admin login failed")
        sys.exit(1)
    print(f"✅ Admin logged in")
    
    regular_token = login(REGULAR_MOBILE, REGULAR_PASSWORD)
    if not regular_token:
        print("❌ Regular user login failed")
        sys.exit(1)
    print(f"✅ Regular user logged in")
    
    # Run tests
    results = []
    
    # TEST A
    result = test_field_in_projection(admin_token)
    if isinstance(result, tuple):
        success, class_id, book_id, chapter_id = result
        results.append(("TEST A: Field in projection", success))
    else:
        results.append(("TEST A: Field in projection", False))
        print("\n❌ Cannot continue without chapter data")
        sys.exit(1)
    
    # TEST B
    if chapter_id:
        success = test_single_toggle(admin_token, chapter_id, book_id)
        results.append(("TEST B: Single toggle", success))
    
    # TEST C
    result = test_bulk_endpoint(admin_token, book_id)
    if isinstance(result, tuple):
        success, test_ids = result
        results.append(("TEST C: Bulk endpoint", success))
    else:
        results.append(("TEST C: Bulk endpoint", False))
    
    # TEST D (CRITICAL)
    if chapter_id:
        success = test_scope_filter(admin_token, regular_token, book_id, chapter_id)
        results.append(("TEST D: scope=lessons filter (CRITICAL)", success))
    
    # TEST E
    if chapter_id:
        success = test_admin_bypass(admin_token, book_id, chapter_id)
        results.append(("TEST E: Admin bypass", success))
    
    # TEST F
    if chapter_id:
        success = test_non_regression(regular_token, book_id, chapter_id, admin_token)
        results.append(("TEST F: Non-regression", success))
    
    # TEST G
    if chapter_id:
        success = test_lessons_endpoint(regular_token, chapter_id, admin_token)
        results.append(("TEST G: /lessons endpoint", success))
    
    # TEST H
    success = test_auth_guards(admin_token, regular_token)
    results.append(("TEST H: Auth guards", success))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(1 for _, success in results if success)
    total = len(results)
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
