#!/usr/bin/env python3
"""
Backend test for books_uploader role — comprehensive RBAC testing.

Tests:
1. Admin login
2. Create test users (books_uploader, section_uploader, normal user)
3. Set roles and verify persistence
4. Test books_uploader allowed endpoints (Books & PDFs)
5. Test books_uploader denied endpoints (users, analytics, sections, qbank, whatsapp)
6. Cross-role checks (section_uploader denied /admin/pdfs/list)
7. Normal user denied all admin endpoints
8. Cleanup
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_books_uploader_role():
    print("=" * 80)
    print("BOOKS_UPLOADER ROLE TESTING")
    print("=" * 80)
    
    # Test 1: Admin login
    print("\n[Test 1] Admin login (9692604577 / <redacted>)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Admin login failed with {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        admin_token = resp.json().get('token')
        admin_user = resp.json().get('user')
        print(f"✅ PASSED: Admin logged in, role={admin_user.get('role')}")
    except Exception as e:
        print(f"❌ FAILED: Admin login error: {e}")
        return False
    
    # Test 2: Create books_uploader user (or reuse if exists)
    print("\n[Test 2] Create books_uploader user")
    try:
        resp = requests.post(f"{BASE_URL}/admin/users", json={
            "name": "Books Uploader Test",
            "mobile": "7777777777",
            "password": "test123"
        }, headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 400 and "already registered" in resp.text:
            # User exists, find and reuse
            print("User already exists, finding existing user...")
            resp = requests.get(f"{BASE_URL}/admin/users?search=7777777777", 
                               headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
            if resp.status_code == 200:
                users = resp.json().get('users', [])
                books_user = next((u for u in users if u.get('mobile') == '7777777777'), None)
                if books_user:
                    books_user_id = books_user.get('id')
                    print(f"✅ PASSED: Reusing existing user, id={books_user_id}")
                else:
                    print(f"❌ FAILED: User exists but not found in list")
                    return False
            else:
                print(f"❌ FAILED: Could not search for existing user")
                return False
        elif resp.status_code in [200, 201]:
            books_user = resp.json().get('user')
            books_user_id = books_user.get('id')
            print(f"✅ PASSED: User created, id={books_user_id}")
        else:
            print(f"❌ FAILED: Create user failed with {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAILED: Create user error: {e}")
        return False
    
    # Test 3: Set role to books_uploader
    print("\n[Test 3] Set role to books_uploader")
    try:
        resp = requests.put(f"{BASE_URL}/admin/users/{books_user_id}", json={
            "role": "books_uploader"
        }, headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Set role failed with {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        resp_data = resp.json()
        if not resp_data.get('ok'):
            print(f"❌ FAILED: Update not successful")
            print(f"Response: {resp.text}")
            return False
        print(f"✅ PASSED: Role update successful")
    except Exception as e:
        print(f"❌ FAILED: Set role error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 4: Verify role persists (GET /admin/users)
    print("\n[Test 4] Verify role persists in user list")
    try:
        resp = requests.get(f"{BASE_URL}/admin/users", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Get users failed with {resp.status_code}")
            return False
        users = resp.json().get('users', [])
        books_user_in_list = next((u for u in users if u.get('id') == books_user_id), None)
        if not books_user_in_list:
            print(f"❌ FAILED: User not found in list")
            return False
        if books_user_in_list.get('role') != 'books_uploader':
            print(f"❌ FAILED: Role coerced to {books_user_in_list.get('role')}, expected books_uploader")
            return False
        print(f"✅ PASSED: Role persists as books_uploader (not coerced to 'user')")
    except Exception as e:
        print(f"❌ FAILED: Verify role error: {e}")
        return False
    
    # Test 5: Login as books_uploader
    print("\n[Test 5] Login as books_uploader")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "7777777777",
            "password": "test123"
        }, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Login failed with {resp.status_code}")
            return False
        books_token = resp.json().get('token')
        books_user_data = resp.json().get('user')
        if books_user_data.get('role') != 'books_uploader':
            print(f"❌ FAILED: Role in login response is {books_user_data.get('role')}")
            return False
        print(f"✅ PASSED: Logged in as books_uploader, token obtained")
    except Exception as e:
        print(f"❌ FAILED: Login error: {e}")
        return False
    
    # Get a valid bookId for testing
    print("\n[Setup] Get a valid bookId for testing")
    try:
        resp = requests.get(f"{BASE_URL}/books", timeout=10)
        books = resp.json().get('books', [])
        if not books:
            print("❌ FAILED: No books found")
            return False
        test_book_id = books[0].get('id')
        test_class_id = books[0].get('classId')
        print(f"Using bookId={test_book_id}, classId={test_class_id}")
    except Exception as e:
        print(f"❌ FAILED: Get books error: {e}")
        return False
    
    # Get a valid chapterId for testing
    print("\n[Setup] Get a valid chapterId for testing")
    try:
        resp = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}", timeout=10)
        chapters = resp.json().get('chapters', [])
        if not chapters:
            print("⚠ WARNING: No chapters found, will skip chapter-specific tests")
            test_chapter_id = None
        else:
            test_chapter_id = chapters[0].get('id')
            print(f"Using chapterId={test_chapter_id}")
    except Exception as e:
        print(f"❌ FAILED: Get chapters error: {e}")
        return False
    
    # ========== BOOKS_UPLOADER ALLOWED ENDPOINTS ==========
    print("\n" + "=" * 80)
    print("BOOKS_UPLOADER ALLOWED ENDPOINTS (should be 200/2xx or 4xx for input errors, NOT 403)")
    print("=" * 80)
    
    # Test 6: GET /api/admin/pdfs/list?bookId=<any>
    print("\n[Test 6] GET /api/admin/pdfs/list?bookId=<any> (should be allowed)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/pdfs/list?bookId={test_book_id}", 
                           headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
            return False
        if resp.status_code in [200, 404]:
            print(f"✅ PASSED: Allowed (status {resp.status_code})")
        else:
            print(f"⚠ WARNING: Unexpected status {resp.status_code}, but not 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 7: POST /api/admin/pdfs/bulk-upload (bogus multipart - expect 400, NOT 403)
    print("\n[Test 7] POST /api/admin/pdfs/bulk-upload (bogus multipart - expect 400, NOT 403)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/pdfs/bulk-upload", 
                            headers={"Authorization": f"Bearer {books_token}"}, 
                            json={}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"❌ FAILED: Got 403 Forbidden, should be allowed (may 400 for missing files)")
            return False
        if resp.status_code in [400, 422]:
            print(f"✅ PASSED: Allowed, got expected input error {resp.status_code}")
        else:
            print(f"⚠ WARNING: Unexpected status {resp.status_code}, but not 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 8: POST /api/admin/books (with valid body)
    print("\n[Test 8] POST /api/admin/books (with valid body)")
    created_book_id = None
    try:
        resp = requests.post(f"{BASE_URL}/admin/books", json={
            "classId": test_class_id,
            "name": "Test Book for Books Uploader"
        }, headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
            return False
        if resp.status_code in [200, 201]:
            resp_data = resp.json()
            if resp_data.get('ok') and resp_data.get('id'):
                created_book_id = resp_data.get('id')
                print(f"✅ PASSED: Book created, id={created_book_id}")
            else:
                print(f"✅ PASSED: Book creation successful (status {resp.status_code})")
        elif resp.status_code == 400:
            # Might be duplicate - that's OK, not a 403
            print(f"✅ PASSED: Allowed (got 400, likely duplicate)")
        else:
            print(f"⚠ WARNING: Unexpected status {resp.status_code}, but not 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 9: PUT /api/admin/books/:id (rename)
    if created_book_id:
        print("\n[Test 9] PUT /api/admin/books/:id (rename)")
        try:
            resp = requests.put(f"{BASE_URL}/admin/books/{created_book_id}", json={
                "name": "Test Book Renamed"
            }, headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 403:
                print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
                return False
            if resp.status_code == 200:
                print(f"✅ PASSED: Book renamed")
            else:
                print(f"⚠ WARNING: Unexpected status {resp.status_code}")
        except Exception as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
    else:
        print("\n[Test 9] SKIPPED: No book created in Test 8")
    
    # Test 10: POST /api/admin/chapters (with valid body)
    print("\n[Test 10] POST /api/admin/chapters (with valid body)")
    created_chapter_id = None
    try:
        resp = requests.post(f"{BASE_URL}/admin/chapters", json={
            "classId": test_class_id,
            "bookId": test_book_id,
            "name": "Test Chapter for Books Uploader"
        }, headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
            return False
        if resp.status_code in [200, 201]:
            resp_data = resp.json()
            if resp_data.get('ok') and resp_data.get('id'):
                created_chapter_id = resp_data.get('id')
                print(f"✅ PASSED: Chapter created, id={created_chapter_id}")
            else:
                print(f"✅ PASSED: Chapter creation successful (status {resp.status_code})")
        elif resp.status_code == 400:
            # Might be duplicate - that's OK, not a 403
            print(f"✅ PASSED: Allowed (got 400, likely duplicate)")
        else:
            print(f"⚠ WARNING: Unexpected status {resp.status_code}, but not 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 11: PUT /api/admin/chapters/:id (rename)
    if created_chapter_id:
        print("\n[Test 11] PUT /api/admin/chapters/:id (rename)")
        try:
            resp = requests.put(f"{BASE_URL}/admin/chapters/{created_chapter_id}", json={
                "name": "Test Chapter Renamed"
            }, headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 403:
                print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
                return False
            if resp.status_code == 200:
                print(f"✅ PASSED: Chapter renamed")
            else:
                print(f"⚠ WARNING: Unexpected status {resp.status_code}")
        except Exception as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
    else:
        print("\n[Test 11] SKIPPED: No chapter created in Test 10")
    
    # Test 12: PUT /api/admin/chapters/reorder
    print("\n[Test 12] PUT /api/admin/chapters/reorder")
    try:
        resp = requests.put(f"{BASE_URL}/admin/chapters/reorder", json={
            "bookId": test_book_id,
            "items": []
        }, headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
            return False
        if resp.status_code == 200:
            print(f"✅ PASSED: Reorder allowed")
        else:
            print(f"⚠ WARNING: Unexpected status {resp.status_code}")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 13: POST /api/admin/chapters/:id/pdf (bogus multipart - expect 400/404, NOT 403)
    if test_chapter_id:
        print("\n[Test 13] POST /api/admin/chapters/:id/pdf (bogus multipart - expect 400/404, NOT 403)")
        try:
            resp = requests.post(f"{BASE_URL}/admin/chapters/{test_chapter_id}/pdf", 
                                headers={"Authorization": f"Bearer {books_token}"}, 
                                json={}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 403:
                print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
                return False
            if resp.status_code in [400, 404, 422]:
                print(f"✅ PASSED: Allowed, got expected error {resp.status_code}")
            else:
                print(f"⚠ WARNING: Unexpected status {resp.status_code}, but not 403")
        except Exception as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
    else:
        print("\n[Test 13] SKIPPED: No chapter available")
    
    # Test 14: DELETE /api/admin/chapters/:id/pdf
    if test_chapter_id:
        print("\n[Test 14] DELETE /api/admin/chapters/:id/pdf")
        try:
            resp = requests.delete(f"{BASE_URL}/admin/chapters/{test_chapter_id}/pdf", 
                                  headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 403:
                print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
                return False
            if resp.status_code in [200, 404]:
                print(f"✅ PASSED: Allowed (status {resp.status_code})")
            else:
                print(f"⚠ WARNING: Unexpected status {resp.status_code}, but not 403")
        except Exception as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
    else:
        print("\n[Test 14] SKIPPED: No chapter available")
    
    # Test 15: DELETE /api/admin/chapters/:id
    if created_chapter_id:
        print("\n[Test 15] DELETE /api/admin/chapters/:id")
        try:
            resp = requests.delete(f"{BASE_URL}/admin/chapters/{created_chapter_id}", 
                                  headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 403:
                print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
                return False
            if resp.status_code in [200, 409]:
                print(f"✅ PASSED: Delete allowed (status {resp.status_code})")
            else:
                print(f"⚠ WARNING: Unexpected status {resp.status_code}")
        except Exception as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
    else:
        print("\n[Test 15] SKIPPED: No chapter created")
    
    # Test 16: DELETE /api/admin/books/:id?cascade=1
    if created_book_id:
        print("\n[Test 16] DELETE /api/admin/books/:id?cascade=1")
        try:
            resp = requests.delete(f"{BASE_URL}/admin/books/{created_book_id}?cascade=1", 
                                  headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 403:
                print(f"❌ FAILED: Got 403 Forbidden, should be allowed")
                return False
            if resp.status_code in [200, 409]:
                print(f"✅ PASSED: Delete allowed (status {resp.status_code})")
            else:
                print(f"⚠ WARNING: Unexpected status {resp.status_code}")
        except Exception as e:
            print(f"❌ FAILED: Request error: {e}")
            return False
    else:
        print("\n[Test 16] SKIPPED: No book created")
    
    # ========== BOOKS_UPLOADER DENIED ENDPOINTS ==========
    print("\n" + "=" * 80)
    print("BOOKS_UPLOADER DENIED ENDPOINTS (should return 403)")
    print("=" * 80)
    
    # Test 17: GET /api/admin/users (should be 403)
    print("\n[Test 17] GET /api/admin/users (should be 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/users", 
                           headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 18: GET /api/admin/analytics (should be 403)
    print("\n[Test 18] GET /api/admin/analytics (should be 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/analytics", 
                           headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 19: GET /api/admin/sections (should be 403)
    print("\n[Test 19] GET /api/admin/sections (should be 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/sections", 
                           headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 20: POST /api/admin/sections (should be 403)
    print("\n[Test 20] POST /api/admin/sections (should be 403)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/sections", json={}, 
                            headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 21: POST /api/admin/qbank/items/bulk-reassign (should be 403)
    print("\n[Test 21] POST /api/admin/qbank/items/bulk-reassign (should be 403)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign", json={}, 
                            headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 22: POST /api/admin/whatsapp/campaign/inactive-99/send (should be 403)
    print("\n[Test 22] POST /api/admin/whatsapp/campaign/inactive-99/send (should be 403)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/send", json={}, 
                            headers={"Authorization": f"Bearer {books_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # ========== CROSS-ROLE CHECKS ==========
    print("\n" + "=" * 80)
    print("CROSS-ROLE CHECKS")
    print("=" * 80)
    
    # Test 23: Create section_uploader user (or reuse if exists)
    print("\n[Test 23] Create section_uploader user")
    try:
        resp = requests.post(f"{BASE_URL}/admin/users", json={
            "name": "Section Uploader Test",
            "mobile": "8888888888",
            "password": "test123"
        }, headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 400 and "already registered" in resp.text:
            # User exists, find and reuse
            print("User already exists, finding existing user...")
            resp = requests.get(f"{BASE_URL}/admin/users?search=8888888888", 
                               headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
            if resp.status_code == 200:
                users = resp.json().get('users', [])
                section_user = next((u for u in users if u.get('mobile') == '8888888888'), None)
                if section_user:
                    section_user_id = section_user.get('id')
                    print(f"✅ PASSED: Reusing existing user, id={section_user_id}")
                else:
                    print(f"❌ FAILED: User exists but not found in list")
                    return False
            else:
                print(f"❌ FAILED: Could not search for existing user")
                return False
        elif resp.status_code in [200, 201]:
            section_user = resp.json().get('user')
            section_user_id = section_user.get('id')
            print(f"✅ PASSED: User created, id={section_user_id}")
        else:
            print(f"❌ FAILED: Create user failed with {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAILED: Create user error: {e}")
        return False
    
    # Test 24: Set role to section_uploader
    print("\n[Test 24] Set role to section_uploader")
    try:
        resp = requests.put(f"{BASE_URL}/admin/users/{section_user_id}", json={
            "role": "section_uploader"
        }, headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Set role failed with {resp.status_code}")
            return False
        print(f"✅ PASSED: Role set to section_uploader")
    except Exception as e:
        print(f"❌ FAILED: Set role error: {e}")
        return False
    
    # Test 25: Login as section_uploader
    print("\n[Test 25] Login as section_uploader")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "8888888888",
            "password": "test123"
        }, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Login failed with {resp.status_code}")
            return False
        section_token = resp.json().get('token')
        print(f"✅ PASSED: Logged in as section_uploader")
    except Exception as e:
        print(f"❌ FAILED: Login error: {e}")
        return False
    
    # Test 26: section_uploader → GET /api/admin/pdfs/list (should be 403 NOW)
    print("\n[Test 26] section_uploader → GET /api/admin/pdfs/list (should be 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/pdfs/list?bookId={test_book_id}", 
                           headers={"Authorization": f"Bearer {section_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Correctly denied with 403 (NEW - this endpoint now requires books_uploader or admin)")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 27: section_uploader → GET /api/admin/sections (should still be 200)
    print("\n[Test 27] section_uploader → GET /api/admin/sections (should still be 200)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/sections", 
                           headers={"Authorization": f"Bearer {section_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return False
        print(f"✅ PASSED: section_uploader can still access sections (unchanged)")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 28: Create normal user
    print("\n[Test 28] Create normal user")
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Normal User Test",
            "mobile": "6666666666",
            "password": "test123"
        }, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code not in [200, 201]:
            print(f"❌ FAILED: Register failed with {resp.status_code}")
            return False
        normal_token = resp.json().get('token')
        print(f"✅ PASSED: Normal user registered")
    except Exception as e:
        print(f"❌ FAILED: Register error: {e}")
        return False
    
    # Test 29: normal user → GET /api/admin/pdfs/list (should be 403)
    print("\n[Test 29] normal user → GET /api/admin/pdfs/list (should be 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/pdfs/list?bookId={test_book_id}", 
                           headers={"Authorization": f"Bearer {normal_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Normal user correctly denied")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 30: normal user → POST /api/admin/books (should be 403)
    print("\n[Test 30] normal user → POST /api/admin/books (should be 403)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/books", json={
            "classId": test_class_id,
            "name": "Test"
        }, headers={"Authorization": f"Bearer {normal_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Normal user correctly denied")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 31: normal user → POST /api/admin/chapters (should be 403)
    print("\n[Test 31] normal user → POST /api/admin/chapters (should be 403)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/chapters", json={
            "classId": test_class_id,
            "bookId": test_book_id,
            "name": "Test"
        }, headers={"Authorization": f"Bearer {normal_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 403:
            print(f"❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"✅ PASSED: Normal user correctly denied")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # Test 32: Admin can still access everything
    print("\n[Test 32] Admin → GET /api/admin/pdfs/list (should still work)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/pdfs/list?bookId={test_book_id}", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"❌ FAILED: Admin should not be denied")
            return False
        print(f"✅ PASSED: Admin access unbroken (status {resp.status_code})")
    except Exception as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    
    # ========== CLEANUP ==========
    print("\n" + "=" * 80)
    print("CLEANUP")
    print("=" * 80)
    
    # Delete test users
    print("\n[Cleanup] Delete books_uploader test user")
    try:
        resp = requests.delete(f"{BASE_URL}/admin/users/{books_user_id}", 
                              headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ Deleted books_uploader user")
        else:
            print(f"⚠ WARNING: Delete failed with {resp.status_code}")
    except Exception as e:
        print(f"⚠ WARNING: Delete error: {e}")
    
    print("\n[Cleanup] Delete section_uploader test user")
    try:
        resp = requests.delete(f"{BASE_URL}/admin/users/{section_user_id}", 
                              headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ Deleted section_uploader user")
        else:
            print(f"⚠ WARNING: Delete failed with {resp.status_code}")
    except Exception as e:
        print(f"⚠ WARNING: Delete error: {e}")
    
    print("\n[Cleanup] Delete normal user (via mobile lookup)")
    try:
        # Get user ID first
        resp = requests.get(f"{BASE_URL}/admin/users?search=6666666666", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if resp.status_code == 200:
            users = resp.json().get('users', [])
            normal_user = next((u for u in users if u.get('mobile') == '6666666666'), None)
            if normal_user:
                normal_user_id = normal_user.get('id')
                resp = requests.delete(f"{BASE_URL}/admin/users/{normal_user_id}", 
                                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
                print(f"Status: {resp.status_code}")
                if resp.status_code == 200:
                    print(f"✅ Deleted normal user")
                else:
                    print(f"⚠ WARNING: Delete failed with {resp.status_code}")
            else:
                print(f"⚠ WARNING: Normal user not found")
        else:
            print(f"⚠ WARNING: Search failed with {resp.status_code}")
    except Exception as e:
        print(f"⚠ WARNING: Delete error: {e}")
    
    print("\n" + "=" * 80)
    print("✅ ALL TESTS PASSED")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = test_books_uploader_role()
    sys.exit(0 if success else 1)
