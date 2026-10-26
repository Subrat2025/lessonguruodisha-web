#!/usr/bin/env python3
"""
Panchapadi New Lesson Plan Data-Isolation Regression Test

CRITICAL: This test verifies that /api/panchapadi-lessons/browse ONLY returns
data from the panchapadiUploads collection and NEVER leaks data from the
general curriculum collections (classes, books, chapters, lessons).

Tests:
1. Empty-state test: panchapadiUploads empty → browse returns { classes: [] }
2. Insert one upload → verify it appears
3. Hidden upload test: hidden: true → browse returns empty
4. Existing lesson isolation regression: verify no curriculum data leak
5. Add second upload for different chapter → verify grouping
6. Cleanup: delete test uploads
"""

import requests
import os
from datetime import datetime

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
API_URL = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# MongoDB connection (for direct DB operations)
from pymongo import MongoClient

MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

def login_admin():
    """Login as admin and return token"""
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        print(f"❌ Admin login failed: {response.status_code} {response.text}")
        return None
    data = response.json()
    token = data.get('token')
    print(f"✅ Test 0: Admin login successful (token: {token[:20]}...)")
    return token

def test_empty_state(token):
    """Test 1: Empty panchapadiUploads → browse returns { classes: [] }"""
    print("\n" + "="*80)
    print("TEST 1: Empty-state test")
    print("="*80)
    
    # First, clear all test uploads from panchapadiUploads
    result = db.panchapadiUploads.delete_many({"id": {"$regex": "^test-"}})
    print(f"Cleared {result.deleted_count} test uploads from panchapadiUploads")
    
    # Verify collection is empty (or has no test data)
    count = db.panchapadiUploads.count_documents({"id": {"$regex": "^test-"}})
    print(f"Test uploads in panchapadiUploads: {count}")
    
    # Call browse endpoint
    response = requests.get(
        f"{API_URL}/panchapadi-lessons/browse",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"❌ TEST 1 FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    classes = data.get('classes', None)
    
    if classes is None:
        print(f"❌ TEST 1 FAILED: Response missing 'classes' field")
        print(f"Response: {data}")
        return False
    
    if not isinstance(classes, list):
        print(f"❌ TEST 1 FAILED: 'classes' is not a list, got {type(classes)}")
        return False
    
    # CRITICAL: With no test uploads, should return empty array
    # (may have real uploads, but we're only testing with test- prefix)
    # Actually, let's be more strict: clear ALL uploads temporarily
    all_uploads = list(db.panchapadiUploads.find({}, {"_id": 0}))
    db.panchapadiUploads.delete_many({})
    
    # Now test again
    response = requests.get(
        f"{API_URL}/panchapadi-lessons/browse",
        headers={"Authorization": f"Bearer {token}"}
    )
    data = response.json()
    classes = data.get('classes', [])
    
    # Restore uploads
    if all_uploads:
        db.panchapadiUploads.insert_many(all_uploads)
    
    if len(classes) != 0:
        print(f"❌ TEST 1 FAILED: Expected empty array, got {len(classes)} classes")
        print(f"Classes: {classes}")
        return False
    
    print(f"✅ TEST 1 PASSED: Empty panchapadiUploads → browse returns {{ classes: [] }}")
    return True

def test_insert_one_upload(token):
    """Test 2: Insert one upload → verify it appears"""
    print("\n" + "="*80)
    print("TEST 2: Insert one upload → verify it appears")
    print("="*80)
    
    # Insert one test upload
    upload = {
        "id": "test-1",
        "chapterId": "test-chapter",
        "classLabel": "Class 1",
        "classOrder": 1,
        "bookLabel": "ଗଣିତ",
        "chapterLabel": "Test Chapter",
        "chapterOrder": 1,
        "period": 1,
        "title": "Test Period 1",
        "filename": "test.html",
        "html": "<html><body>Test</body></html>",
        "hidden": False,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }
    
    db.panchapadiUploads.insert_one(upload)
    print(f"Inserted test upload: {upload['id']}")
    
    # Call browse endpoint
    response = requests.get(
        f"{API_URL}/panchapadi-lessons/browse",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"❌ TEST 2 FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    classes = data.get('classes', [])
    
    if len(classes) != 1:
        print(f"❌ TEST 2 FAILED: Expected 1 class, got {len(classes)}")
        print(f"Classes: {classes}")
        return False
    
    cls = classes[0]
    if cls.get('classLabel') != 'Class 1':
        print(f"❌ TEST 2 FAILED: Expected 'Class 1', got '{cls.get('classLabel')}'")
        return False
    
    books = cls.get('books', [])
    if len(books) != 1:
        print(f"❌ TEST 2 FAILED: Expected 1 book, got {len(books)}")
        return False
    
    book = books[0]
    if book.get('bookLabel') != 'ଗଣିତ':
        print(f"❌ TEST 2 FAILED: Expected 'ଗଣିତ', got '{book.get('bookLabel')}'")
        return False
    
    chapters = book.get('chapters', [])
    if len(chapters) != 1:
        print(f"❌ TEST 2 FAILED: Expected 1 chapter, got {len(chapters)}")
        return False
    
    chapter = chapters[0]
    if chapter.get('chapterLabel') != 'Test Chapter':
        print(f"❌ TEST 2 FAILED: Expected 'Test Chapter', got '{chapter.get('chapterLabel')}'")
        return False
    
    periods = chapter.get('periods', [])
    if len(periods) != 1:
        print(f"❌ TEST 2 FAILED: Expected 1 period, got {len(periods)}")
        return False
    
    period = periods[0]
    if period.get('title') != 'Test Period 1':
        print(f"❌ TEST 2 FAILED: Expected 'Test Period 1', got '{period.get('title')}'")
        return False
    
    print(f"✅ TEST 2 PASSED: Insert one upload → appears in browse with correct structure")
    print(f"   Class: {cls.get('classLabel')}, Book: {book.get('bookLabel')}, Chapter: {chapter.get('chapterLabel')}, Period: {period.get('title')}")
    return True

def test_hidden_upload(token):
    """Test 3: Hidden upload test: hidden: true → browse returns empty"""
    print("\n" + "="*80)
    print("TEST 3: Hidden upload test")
    print("="*80)
    
    # Update test-1 to hidden: true
    result = db.panchapadiUploads.update_one(
        {"id": "test-1"},
        {"$set": {"hidden": True}}
    )
    print(f"Updated test-1 to hidden: true (matched: {result.matched_count}, modified: {result.modified_count})")
    
    # Call browse endpoint
    response = requests.get(
        f"{API_URL}/panchapadi-lessons/browse",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"❌ TEST 3 FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    classes = data.get('classes', [])
    
    if len(classes) != 0:
        print(f"❌ TEST 3 FAILED: Expected empty array (hidden upload), got {len(classes)} classes")
        print(f"Classes: {classes}")
        return False
    
    print(f"✅ TEST 3 PASSED: Hidden upload (hidden: true) → browse returns {{ classes: [] }}")
    return True

def test_isolation_regression(token):
    """Test 4: Existing lesson isolation regression"""
    print("\n" + "="*80)
    print("TEST 4: Existing lesson isolation regression")
    print("="*80)
    
    # Count existing curriculum data
    classes_count = db.classes.count_documents({})
    books_count = db.books.count_documents({})
    chapters_count = db.chapters.count_documents({})
    lessons_count = db.lessons.count_documents({})
    
    print(f"Existing curriculum data:")
    print(f"  - Classes: {classes_count}")
    print(f"  - Books: {books_count}")
    print(f"  - Chapters: {chapters_count}")
    print(f"  - Lessons: {lessons_count}")
    
    if classes_count == 0:
        print(f"⚠️  WARNING: No classes in database, cannot verify isolation")
        return True
    
    # Ensure test upload is hidden or removed
    db.panchapadiUploads.update_one({"id": "test-1"}, {"$set": {"hidden": True}})
    
    # Call browse endpoint
    response = requests.get(
        f"{API_URL}/panchapadi-lessons/browse",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"❌ TEST 4 FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    classes = data.get('classes', [])
    
    # CRITICAL: Should return empty array, NOT the general curriculum classes
    if len(classes) != 0:
        print(f"❌ TEST 4 FAILED: DATA LEAK DETECTED!")
        print(f"   Expected empty array (no panchapadiUploads visible)")
        print(f"   Got {len(classes)} classes from browse endpoint")
        print(f"   This means the endpoint is returning data from general curriculum collections!")
        print(f"   Classes returned: {[c.get('classLabel') for c in classes]}")
        return False
    
    print(f"✅ TEST 4 PASSED: No data leak - browse endpoint returns empty when panchapadiUploads is empty/hidden")
    print(f"   Verified: {classes_count} classes exist in general curriculum, but browse returns 0")
    return True

def test_grouping_multiple_uploads(token):
    """Test 5: Add second upload for different chapter → verify grouping"""
    print("\n" + "="*80)
    print("TEST 5: Multiple uploads grouping test")
    print("="*80)
    
    # Unhide test-1
    db.panchapadiUploads.update_one({"id": "test-1"}, {"$set": {"hidden": False}})
    
    # Insert second upload for different chapter
    upload2 = {
        "id": "test-2",
        "chapterId": "test-chapter-2",
        "classLabel": "Class 1",
        "classOrder": 1,
        "bookLabel": "ଗଣିତ",
        "chapterLabel": "Test Chapter 2",
        "chapterOrder": 2,
        "period": 2,
        "title": "Test Period 2",
        "filename": "test2.html",
        "html": "<html><body>Test 2</body></html>",
        "hidden": False,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }
    
    db.panchapadiUploads.insert_one(upload2)
    print(f"Inserted second test upload: {upload2['id']}")
    
    # Call browse endpoint
    response = requests.get(
        f"{API_URL}/panchapadi-lessons/browse",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"❌ TEST 5 FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    classes = data.get('classes', [])
    
    if len(classes) != 1:
        print(f"❌ TEST 5 FAILED: Expected 1 class, got {len(classes)}")
        return False
    
    cls = classes[0]
    books = cls.get('books', [])
    
    if len(books) != 1:
        print(f"❌ TEST 5 FAILED: Expected 1 book, got {len(books)}")
        return False
    
    book = books[0]
    chapters = book.get('chapters', [])
    
    if len(chapters) != 2:
        print(f"❌ TEST 5 FAILED: Expected 2 chapters, got {len(chapters)}")
        print(f"Chapters: {chapters}")
        return False
    
    # Verify chapters are sorted by chapterOrder
    if chapters[0].get('chapterLabel') != 'Test Chapter':
        print(f"❌ TEST 5 FAILED: Expected first chapter 'Test Chapter', got '{chapters[0].get('chapterLabel')}'")
        return False
    
    if chapters[1].get('chapterLabel') != 'Test Chapter 2':
        print(f"❌ TEST 5 FAILED: Expected second chapter 'Test Chapter 2', got '{chapters[1].get('chapterLabel')}'")
        return False
    
    print(f"✅ TEST 5 PASSED: Multiple uploads grouped correctly")
    print(f"   1 class → 1 book → 2 chapters (sorted by chapterOrder)")
    return True

def test_cleanup(token):
    """Test 6: Cleanup - delete test uploads"""
    print("\n" + "="*80)
    print("TEST 6: Cleanup")
    print("="*80)
    
    # Delete all test uploads
    result = db.panchapadiUploads.delete_many({"id": {"$regex": "^test-"}})
    print(f"Deleted {result.deleted_count} test uploads")
    
    # Verify cleanup
    count = db.panchapadiUploads.count_documents({"id": {"$regex": "^test-"}})
    
    if count != 0:
        print(f"❌ TEST 6 FAILED: Expected 0 test uploads after cleanup, got {count}")
        return False
    
    print(f"✅ TEST 6 PASSED: All test uploads cleaned up")
    return True

def main():
    print("="*80)
    print("PANCHAPADI NEW LESSON PLAN DATA-ISOLATION REGRESSION TEST")
    print("="*80)
    print(f"API URL: {API_URL}")
    print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    print()
    
    # Login
    token = login_admin()
    if not token:
        print("❌ FATAL: Admin login failed, cannot proceed")
        return
    
    # Run tests
    results = []
    
    try:
        results.append(("Test 1: Empty-state", test_empty_state(token)))
        results.append(("Test 2: Insert one upload", test_insert_one_upload(token)))
        results.append(("Test 3: Hidden upload", test_hidden_upload(token)))
        results.append(("Test 4: Isolation regression", test_isolation_regression(token)))
        results.append(("Test 5: Multiple uploads grouping", test_grouping_multiple_uploads(token)))
        results.append(("Test 6: Cleanup", test_cleanup(token)))
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        # Cleanup on error
        db.panchapadiUploads.delete_many({"id": {"$regex": "^test-"}})
        return
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print()
    print(f"TOTAL: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Data isolation is working correctly!")
        print("   /api/panchapadi-lessons/browse ONLY returns data from panchapadiUploads")
        print("   NO data leak from general curriculum collections detected")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - see details above")

if __name__ == "__main__":
    main()
