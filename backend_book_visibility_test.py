#!/usr/bin/env python3
"""
Backend test for Book Visibility (show/hide) feature.
Tests the newly added book visibility endpoints and cascade filtering.

Admin credentials: mobile 9692604577 / password <redacted>
"""

import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test state
admin_token = None
normal_user_token = None
books_uploader_token = None
test_class_id = None
test_book_id = None
test_book2_id = None
test_chapter_id = None
test_lesson_id = None
normal_user_mobile = None

def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_admin_login():
    """Test 1: Login as admin"""
    global admin_token
    log("TEST 1: Admin login with mobile 9692604577 / password <redacted>")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("token"):
                admin_token = data["token"]
                log(f"✅ Admin login successful, token: {admin_token[:20]}...")
                return True
            else:
                log(f"❌ Admin login failed: No token in response")
                return False
        else:
            log(f"❌ Admin login failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Admin login exception: {e}")
        return False

def test_get_class_and_book():
    """Test 2: GET /api/classes and pick a class, then get a book with chapters/lessons"""
    global test_class_id, test_book_id, test_chapter_id, test_lesson_id
    log("TEST 2: GET /api/classes and pick a class with books")
    
    try:
        # Get classes
        response = requests.get(f"{BASE_URL}/classes", timeout=10)
        if response.status_code != 200:
            log(f"❌ GET /classes failed with status {response.status_code}")
            return False
        
        classes = response.json().get("classes", [])
        if not classes:
            log(f"❌ No classes found")
            return False
        
        # Pick first class
        test_class_id = classes[0].get("id")
        log(f"✅ Using class: {classes[0].get('name')} with id: {test_class_id}")
        
        # Get books for this class
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", 
                               headers={"Authorization": f"Bearer {admin_token}"}, 
                               timeout=10)
        if response.status_code != 200:
            log(f"❌ GET /books failed with status {response.status_code}")
            return False
        
        books = response.json().get("books", [])
        if not books:
            log(f"❌ No books found for class")
            return False
        
        # Pick first book with chapters and lessons
        for book in books:
            if book.get("chaptersCount", 0) > 0 and book.get("lessonsCount", 0) > 0:
                test_book_id = book.get("id")
                log(f"✅ Using book: {book.get('name')} with id: {test_book_id}")
                log(f"   Chapters: {book.get('chaptersCount')}, Lessons: {book.get('lessonsCount')}")
                
                # Get a chapter from this book
                response = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}", timeout=10)
                if response.status_code == 200:
                    chapters = response.json().get("chapters", [])
                    if chapters:
                        test_chapter_id = chapters[0].get("id")
                        log(f"✅ Using chapter: {chapters[0].get('name')} with id: {test_chapter_id}")
                        
                        # Get a lesson from this chapter
                        response = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter_id}", timeout=10)
                        if response.status_code == 200:
                            lessons = response.json().get("lessons", [])
                            if lessons:
                                test_lesson_id = lessons[0].get("id")
                                log(f"✅ Using lesson: {lessons[0].get('title')} with id: {test_lesson_id}")
                                return True
        
        log(f"❌ No suitable book with chapters and lessons found")
        return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_hide_book_via_visibility_endpoint():
    """Test 3: PUT /api/admin/books/:id/visibility with { hidden: true }"""
    log("TEST 3: PUT /api/admin/books/:id/visibility with { hidden: true }")
    
    try:
        response = requests.put(f"{BASE_URL}/admin/books/{test_book_id}/visibility", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"hidden": True}, 
            timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("hidden") == True:
                log(f"✅ Book hidden successfully: {data}")
                return True
            else:
                log(f"❌ Unexpected response: {data}")
                return False
        else:
            log(f"❌ PUT /admin/books/:id/visibility failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_admin_still_sees_hidden_book():
    """Test 4: GET /api/books?classId as admin - hidden book MUST still appear"""
    log("TEST 4: GET /api/books?classId as admin - hidden book MUST still appear")
    
    try:
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", 
                               headers={"Authorization": f"Bearer {admin_token}"}, 
                               timeout=10)
        
        if response.status_code == 200:
            books = response.json().get("books", [])
            found = any(book.get("id") == test_book_id for book in books)
            
            if found:
                log(f"✅ Admin can still see hidden book (correct)")
                return True
            else:
                log(f"❌ Admin cannot see hidden book (WRONG - admin should see all)")
                return False
        else:
            log(f"❌ GET /books failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_public_cannot_see_hidden_book():
    """Test 5: GET /api/books?classId without token - hidden book MUST NOT appear"""
    log("TEST 5: GET /api/books?classId without token - hidden book MUST NOT appear")
    
    try:
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", timeout=10)
        
        if response.status_code == 200:
            books = response.json().get("books", [])
            found = any(book.get("id") == test_book_id for book in books)
            
            if not found:
                log(f"✅ Public cannot see hidden book (correct)")
                return True
            else:
                log(f"❌ Public can see hidden book (WRONG - should be filtered)")
                return False
        else:
            log(f"❌ GET /books failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_public_chapters_cascade():
    """Test 6: GET /api/chapters?bookId=<hiddenBookId> without token - expect empty chapters: []"""
    log("TEST 6: GET /api/chapters?bookId=<hiddenBookId> without token - expect empty chapters: []")
    
    try:
        response = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}", timeout=10)
        
        if response.status_code == 200:
            chapters = response.json().get("chapters", [])
            
            if len(chapters) == 0:
                log(f"✅ Public gets empty chapters for hidden book (correct cascade)")
                return True
            else:
                log(f"❌ Public can see {len(chapters)} chapters for hidden book (WRONG - should be empty)")
                return False
        else:
            log(f"❌ GET /chapters failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_public_lessons_cascade():
    """Test 7: GET /api/lessons?bookId=<hiddenBookId> without token - expect empty lessons: []"""
    log("TEST 7: GET /api/lessons?bookId=<hiddenBookId> without token - expect empty lessons: []")
    
    try:
        response = requests.get(f"{BASE_URL}/lessons?bookId={test_book_id}", timeout=10)
        
        if response.status_code == 200:
            lessons = response.json().get("lessons", [])
            
            if len(lessons) == 0:
                log(f"✅ Public gets empty lessons for hidden book (correct cascade)")
                return True
            else:
                log(f"❌ Public can see {len(lessons)} lessons for hidden book (WRONG - should be empty)")
                return False
        else:
            log(f"❌ GET /lessons failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_register_normal_user():
    """Test 8: Register a normal user"""
    global normal_user_token, normal_user_mobile
    log("TEST 8: Register a normal user")
    
    # Generate unique mobile
    import random
    normal_user_mobile = f"9{random.randint(100000000, 999999999)}"
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Normal User",
            "mobile": normal_user_mobile,
            "password": "test1234"
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("token"):
                normal_user_token = data["token"]
                log(f"✅ Normal user registered: {normal_user_mobile}, token: {normal_user_token[:20]}...")
                return True
            else:
                log(f"❌ Registration failed: No token in response")
                return False
        else:
            log(f"❌ Registration failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_normal_user_cannot_see_hidden_book():
    """Test 9: GET /api/books?classId as normal user - hidden book MUST NOT appear"""
    log("TEST 9: GET /api/books?classId as normal user - hidden book MUST NOT appear")
    
    try:
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", 
                               headers={"Authorization": f"Bearer {normal_user_token}"}, 
                               timeout=10)
        
        if response.status_code == 200:
            books = response.json().get("books", [])
            found = any(book.get("id") == test_book_id for book in books)
            
            if not found:
                log(f"✅ Normal user cannot see hidden book (correct)")
                return True
            else:
                log(f"❌ Normal user can see hidden book (WRONG - should be filtered)")
                return False
        else:
            log(f"❌ GET /books failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_unhide_book():
    """Test 10: PUT /api/admin/books/:id/visibility with { hidden: false } - book reappears"""
    log("TEST 10: PUT /api/admin/books/:id/visibility with { hidden: false }")
    
    try:
        response = requests.put(f"{BASE_URL}/admin/books/{test_book_id}/visibility", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"hidden": False}, 
            timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("hidden") == False:
                log(f"✅ Book unhidden successfully: {data}")
                
                # Verify book reappears for public
                response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", timeout=10)
                if response.status_code == 200:
                    books = response.json().get("books", [])
                    found = any(book.get("id") == test_book_id for book in books)
                    
                    if found:
                        log(f"✅ Book reappears for public after unhiding")
                        return True
                    else:
                        log(f"❌ Book still hidden for public after unhiding")
                        return False
                else:
                    log(f"❌ GET /books failed")
                    return False
            else:
                log(f"❌ Unexpected response: {data}")
                return False
        else:
            log(f"❌ PUT /admin/books/:id/visibility failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_bulk_hide_books():
    """Test 11: PUT /api/admin/books/visibility/bulk with { ids: [id1, id2], hidden: true }"""
    global test_book2_id
    log("TEST 11: PUT /api/admin/books/visibility/bulk - hide 2 books")
    
    try:
        # Get another book
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", 
                               headers={"Authorization": f"Bearer {admin_token}"}, 
                               timeout=10)
        if response.status_code != 200:
            log(f"❌ GET /books failed")
            return False
        
        books = response.json().get("books", [])
        if len(books) < 2:
            log(f"⚠️  Only {len(books)} books available, need at least 2 for bulk test")
            # Still test with available books
            book_ids = [book.get("id") for book in books[:2]]
        else:
            # Pick 2 books including our test book
            book_ids = [test_book_id]
            for book in books:
                if book.get("id") != test_book_id:
                    test_book2_id = book.get("id")
                    book_ids.append(test_book2_id)
                    break
        
        log(f"   Hiding books: {book_ids}")
        
        # Bulk hide
        response = requests.put(f"{BASE_URL}/admin/books/visibility/bulk", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"ids": book_ids, "hidden": True}, 
            timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log(f"✅ Bulk hide successful: matched={data.get('matched')}, modified={data.get('modified')}")
                
                # Verify both are filtered for non-admin
                response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", timeout=10)
                if response.status_code == 200:
                    books = response.json().get("books", [])
                    found_count = sum(1 for book in books if book.get("id") in book_ids)
                    
                    if found_count == 0:
                        log(f"✅ Both books hidden for public (correct)")
                        return True
                    else:
                        log(f"❌ {found_count} books still visible for public (should be 0)")
                        return False
                else:
                    log(f"❌ GET /books failed")
                    return False
            else:
                log(f"❌ Unexpected response: {data}")
                return False
        else:
            log(f"❌ PUT /admin/books/visibility/bulk failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_bulk_unhide_books():
    """Test 12: PUT /api/admin/books/visibility/bulk with { hidden: false } - reset"""
    log("TEST 12: PUT /api/admin/books/visibility/bulk with { hidden: false } - reset")
    
    try:
        book_ids = [test_book_id]
        if test_book2_id:
            book_ids.append(test_book2_id)
        
        response = requests.put(f"{BASE_URL}/admin/books/visibility/bulk", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"ids": book_ids, "hidden": False}, 
            timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log(f"✅ Bulk unhide successful: matched={data.get('matched')}, modified={data.get('modified')}")
                return True
            else:
                log(f"❌ Unexpected response: {data}")
                return False
        else:
            log(f"❌ PUT /admin/books/visibility/bulk failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_update_book_with_hidden_field():
    """Test 13: PUT /api/admin/books/:id with { name, hidden: true } - both updates work"""
    log("TEST 13: PUT /api/admin/books/:id with { name, hidden: true }")
    
    try:
        # Get current book name
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", 
                               headers={"Authorization": f"Bearer {admin_token}"}, 
                               timeout=10)
        if response.status_code != 200:
            log(f"❌ GET /books failed")
            return False
        
        books = response.json().get("books", [])
        current_book = next((b for b in books if b.get("id") == test_book_id), None)
        if not current_book:
            log(f"❌ Test book not found")
            return False
        
        original_name = current_book.get("name")
        new_name = f"{original_name} (UPDATED)"
        
        # Update both name and hidden
        response = requests.put(f"{BASE_URL}/admin/books/{test_book_id}", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": new_name, "hidden": True}, 
            timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log(f"✅ Book updated successfully")
                
                # Verify both updates in DB (as admin)
                response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", 
                                       headers={"Authorization": f"Bearer {admin_token}"}, 
                                       timeout=10)
                if response.status_code == 200:
                    books = response.json().get("books", [])
                    updated_book = next((b for b in books if b.get("id") == test_book_id), None)
                    
                    if updated_book:
                        name_updated = updated_book.get("name") == new_name
                        # Check if hidden for public
                        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", timeout=10)
                        if response.status_code == 200:
                            public_books = response.json().get("books", [])
                            is_hidden = not any(b.get("id") == test_book_id for b in public_books)
                            
                            if name_updated and is_hidden:
                                log(f"✅ Both name and hidden field updated correctly")
                                
                                # Reset name
                                requests.put(f"{BASE_URL}/admin/books/{test_book_id}", 
                                    headers={"Authorization": f"Bearer {admin_token}"},
                                    json={"name": original_name, "hidden": False}, 
                                    timeout=10)
                                
                                return True
                            else:
                                log(f"❌ Updates not applied: name_updated={name_updated}, is_hidden={is_hidden}")
                                return False
                        else:
                            log(f"❌ GET /books (public) failed")
                            return False
                    else:
                        log(f"❌ Updated book not found")
                        return False
                else:
                    log(f"❌ GET /books failed")
                    return False
            else:
                log(f"❌ Unexpected response: {data}")
                return False
        else:
            log(f"❌ PUT /admin/books/:id failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_non_admin_cannot_toggle_visibility():
    """Test 14: Non-admin user calls /admin/books/:id/visibility - expect 403"""
    log("TEST 14: Non-admin user calls /admin/books/:id/visibility - expect 403")
    
    try:
        response = requests.put(f"{BASE_URL}/admin/books/{test_book_id}/visibility", 
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"hidden": True}, 
            timeout=10)
        
        if response.status_code == 403:
            log(f"✅ Non-admin correctly rejected with 403")
            return True
        else:
            log(f"❌ Expected 403, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_validation_errors():
    """Test 15: Test validation errors for visibility endpoints"""
    log("TEST 15: Test validation errors for visibility endpoints")
    
    all_passed = True
    
    # Test missing hidden field
    log("  15a: PUT /admin/books/:id/visibility without hidden field (expect 400)")
    try:
        response = requests.put(f"{BASE_URL}/admin/books/{test_book_id}/visibility", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={}, 
            timeout=10)
        
        if response.status_code == 400:
            log(f"  ✅ Correctly rejected with 400")
        else:
            log(f"  ❌ Expected 400, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log(f"  ❌ Exception: {e}")
        all_passed = False
    
    # Test invalid hidden type
    log("  15b: PUT /admin/books/:id/visibility with hidden='true' (string, expect 400)")
    try:
        response = requests.put(f"{BASE_URL}/admin/books/{test_book_id}/visibility", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"hidden": "true"}, 
            timeout=10)
        
        if response.status_code == 400:
            log(f"  ✅ Correctly rejected with 400")
        else:
            log(f"  ❌ Expected 400, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log(f"  ❌ Exception: {e}")
        all_passed = False
    
    # Test bulk without ids
    log("  15c: PUT /admin/books/visibility/bulk without ids (expect 400)")
    try:
        response = requests.put(f"{BASE_URL}/admin/books/visibility/bulk", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"hidden": True}, 
            timeout=10)
        
        if response.status_code == 400:
            log(f"  ✅ Correctly rejected with 400")
        else:
            log(f"  ❌ Expected 400, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log(f"  ❌ Exception: {e}")
        all_passed = False
    
    # Test bulk with empty ids
    log("  15d: PUT /admin/books/visibility/bulk with empty ids (expect 400)")
    try:
        response = requests.put(f"{BASE_URL}/admin/books/visibility/bulk", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"ids": [], "hidden": True}, 
            timeout=10)
        
        if response.status_code == 400:
            log(f"  ✅ Correctly rejected with 400")
        else:
            log(f"  ❌ Expected 400, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log(f"  ❌ Exception: {e}")
        all_passed = False
    
    if all_passed:
        log(f"✅ All validation tests passed")
    else:
        log(f"❌ Some validation tests failed")
    
    return all_passed

def test_default_visibility():
    """Test 16: Ensure default (no hidden field set) treats book as VISIBLE"""
    log("TEST 16: Create new book and verify it's visible by default")
    
    try:
        # Create a new book without hidden field
        response = requests.post(f"{BASE_URL}/admin/books", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "classId": test_class_id,
                "name": "TEST DEFAULT VISIBILITY BOOK"
            }, 
            timeout=10)
        
        if response.status_code != 200:
            log(f"❌ Failed to create book: {response.status_code}")
            return False
        
        new_book_id = response.json().get("id") or response.json().get("book", {}).get("id")
        if not new_book_id:
            log(f"❌ No book id in response")
            return False
        
        log(f"   Created book with id: {new_book_id}")
        
        # Verify it's visible for public
        response = requests.get(f"{BASE_URL}/books?classId={test_class_id}", timeout=10)
        if response.status_code == 200:
            books = response.json().get("books", [])
            found = any(book.get("id") == new_book_id for book in books)
            
            # Cleanup
            requests.delete(f"{BASE_URL}/admin/books/{new_book_id}?cascade=1", 
                          headers={"Authorization": f"Bearer {admin_token}"}, 
                          timeout=10)
            
            if found:
                log(f"✅ New book is visible by default (correct)")
                return True
            else:
                log(f"❌ New book is hidden by default (WRONG)")
                return False
        else:
            log(f"❌ GET /books failed")
            return False
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def test_regression_other_endpoints():
    """Test 17: Ensure other book endpoints still work"""
    log("TEST 17: Regression test - other book endpoints")
    
    all_passed = True
    
    # Test GET /admin/books
    log("  17a: GET /admin/books")
    try:
        response = requests.get(f"{BASE_URL}/admin/books", 
            headers={"Authorization": f"Bearer {admin_token}"}, 
            timeout=10)
        
        if response.status_code == 200:
            log(f"  ✅ GET /admin/books works")
        else:
            log(f"  ❌ GET /admin/books failed: {response.status_code}")
            all_passed = False
    except Exception as e:
        log(f"  ❌ Exception: {e}")
        all_passed = False
    
    # Test POST /admin/books
    log("  17b: POST /admin/books")
    try:
        response = requests.post(f"{BASE_URL}/admin/books", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"classId": test_class_id, "name": "TEST REGRESSION BOOK"}, 
            timeout=10)
        
        if response.status_code == 200:
            new_book_id = response.json().get("id") or response.json().get("book", {}).get("id")
            log(f"  ✅ POST /admin/books works, created id: {new_book_id}")
            
            # Cleanup
            if new_book_id:
                requests.delete(f"{BASE_URL}/admin/books/{new_book_id}?cascade=1", 
                              headers={"Authorization": f"Bearer {admin_token}"}, 
                              timeout=10)
        else:
            log(f"  ❌ POST /admin/books failed: {response.status_code}")
            all_passed = False
    except Exception as e:
        log(f"  ❌ Exception: {e}")
        all_passed = False
    
    if all_passed:
        log(f"✅ All regression tests passed")
    else:
        log(f"❌ Some regression tests failed")
    
    return all_passed

def main():
    """Run all tests"""
    log("=" * 80)
    log("BOOK VISIBILITY (SHOW/HIDE) BACKEND TESTS")
    log("=" * 80)
    
    tests = [
        ("Admin Login", test_admin_login),
        ("Get Class and Book", test_get_class_and_book),
        ("Hide Book via Visibility Endpoint", test_hide_book_via_visibility_endpoint),
        ("Admin Still Sees Hidden Book", test_admin_still_sees_hidden_book),
        ("Public Cannot See Hidden Book", test_public_cannot_see_hidden_book),
        ("Public Chapters Cascade", test_public_chapters_cascade),
        ("Public Lessons Cascade", test_public_lessons_cascade),
        ("Register Normal User", test_register_normal_user),
        ("Normal User Cannot See Hidden Book", test_normal_user_cannot_see_hidden_book),
        ("Unhide Book", test_unhide_book),
        ("Bulk Hide Books", test_bulk_hide_books),
        ("Bulk Unhide Books", test_bulk_unhide_books),
        ("Update Book with Hidden Field", test_update_book_with_hidden_field),
        ("Non-Admin Cannot Toggle Visibility", test_non_admin_cannot_toggle_visibility),
        ("Validation Errors", test_validation_errors),
        ("Default Visibility", test_default_visibility),
        ("Regression Other Endpoints", test_regression_other_endpoints),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        log("")
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            log(f"❌ Test '{test_name}' raised exception: {e}")
            failed += 1
    
    log("")
    log("=" * 80)
    log(f"TEST SUMMARY: {passed} passed, {failed} failed out of {len(tests)} tests")
    log("=" * 80)
    
    if failed == 0:
        log("✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        log(f"❌ {failed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
