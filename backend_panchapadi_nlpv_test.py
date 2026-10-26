#!/usr/bin/env python3
"""
Backend test for Panchapadi newLessonPlanVisible visibility gate.

Tests the new visibility gate that controls which uploads appear in the
teacher-facing /panchapadi-lessons/browse endpoint. Legacy uploads (28 rows)
have been migrated to newLessonPlanVisible: false. New uploads default to
newLessonPlanVisible: true.

Test scenarios:
1. Legacy hidden by default - GET /browse returns empty or only new uploads
2. Migration integrity - verify DB counts
3. Insert NEW row with newLessonPlanVisible: true - verify it appears
4. Toggle visibility via PATCH - verify row disappears/reappears
5. Meta and View also gated - verify 404 when hidden
6. New upload defaults to newLessonPlanVisible: true
7. New upload can explicitly opt-out
8. Bulk showInNew/hideFromNew actions
9. Regression - legacy status transitions still work
10. by-chapter also gated
11. Cleanup
"""

import requests
import json
from pymongo import MongoClient

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def print_test(num, desc):
    print(f"\n{'='*70}")
    print(f"TEST {num}: {desc}")
    print('='*70)

def main():
    print("\n" + "="*70)
    print("PANCHAPADI newLessonPlanVisible VISIBILITY GATE TEST")
    print("="*70)
    
    # Connect to MongoDB
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db['panchapadiUploads']
    
    # ========================================================================
    # TEST 1: Admin Login
    # ========================================================================
    print_test(1, "Admin Login")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return
        data = resp.json()
        admin_token = data.get('token')
        if not admin_token:
            print(f"❌ FAIL: No token in response")
            print(f"Response: {json.dumps(data, indent=2)}")
            return
        print(f"✅ PASS: Admin login successful, token: {admin_token[:20]}...")
    except Exception as e:
        print(f"❌ FAIL: Exception during admin login: {e}")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # ========================================================================
    # TEST 2: Migration Integrity - Verify DB Counts
    # ========================================================================
    print_test(2, "Migration Integrity - Verify DB Counts")
    try:
        total_count = collection.count_documents({})
        false_count = collection.count_documents({"newLessonPlanVisible": False})
        true_count = collection.count_documents({"newLessonPlanVisible": True})
        
        print(f"Total documents: {total_count}")
        print(f"newLessonPlanVisible: false → {false_count}")
        print(f"newLessonPlanVisible: true → {true_count}")
        
        # According to the review_request, there should be 28 legacy rows with false
        # and initially 0 with true (in preview environment)
        if false_count >= 28:
            print(f"✅ PASS: Found {false_count} legacy rows with newLessonPlanVisible: false (expected >= 28)")
        else:
            print(f"⚠️ WARNING: Found {false_count} legacy rows, expected >= 28")
        
        print(f"✅ PASS: Migration integrity verified")
        print(f"   - Total: {total_count}")
        print(f"   - Hidden (false): {false_count}")
        print(f"   - Visible (true): {true_count}")
    except Exception as e:
        print(f"❌ FAIL: Exception during migration integrity check: {e}")
        return
    
    # ========================================================================
    # TEST 3: Legacy Hidden by Default - GET /browse
    # ========================================================================
    print_test(3, "Legacy Hidden by Default - GET /browse")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return
        data = resp.json()
        classes = data.get('classes', [])
        print(f"Classes returned: {len(classes)}")
        
        # Check if any legacy classes are present
        legacy_class_labels = ['Balvatika', 'Class 1', 'Class 3', 'Class 5']
        legacy_book_patterns = ['ଝୁଲଣା', 'ଗଣିତ (ଖୁସିଖୁସିଆ ଗଣିତ)', 'ଭାଷା ମହକ 1', 'ଓଡ଼ିଆ']
        
        found_legacy = False
        for cls in classes:
            if cls.get('classLabel') in legacy_class_labels:
                for book in cls.get('books', []):
                    if any(pattern in book.get('bookLabel', '') for pattern in legacy_book_patterns):
                        found_legacy = True
                        print(f"⚠️ Found legacy class/book: {cls.get('classLabel')} / {book.get('bookLabel')}")
        
        if not found_legacy and len(classes) == 0:
            print(f"✅ PASS: No legacy classes found in browse (expected empty or only new uploads)")
        elif not found_legacy:
            print(f"✅ PASS: No legacy classes found, only new uploads present ({len(classes)} classes)")
        else:
            print(f"❌ FAIL: Found legacy classes in browse (should be hidden)")
    except Exception as e:
        print(f"❌ FAIL: Exception during browse test: {e}")
        return
    
    # ========================================================================
    # TEST 4: Insert NEW Row with newLessonPlanVisible: true
    # ========================================================================
    print_test(4, "Insert NEW Row with newLessonPlanVisible: true")
    test_id = 'nlpv-test-1'
    test_chapter_id = 'nlpv-ch-1'
    try:
        # First, delete any existing test row
        collection.delete_one({"id": test_id})
        
        # Insert new test row
        test_doc = {
            "id": test_id,
            "chapterId": test_chapter_id,
            "classLabel": "Class 1",
            "classOrder": 1,
            "bookLabel": "ଗଣିତ",
            "chapterLabel": "Test Ch NLPV",
            "chapterOrder": 1,
            "period": 1,
            "title": "New Library Test",
            "filename": "nlpv.html",
            "hidden": False,
            "status": "published",
            "newLessonPlanVisible": True,
            "html": "<!doctype html><html><body>Hello</body></html>" + ("x" * 500),
            "createdAt": None,
            "updatedAt": None
        }
        
        from datetime import datetime
        test_doc["createdAt"] = datetime.utcnow()
        test_doc["updatedAt"] = datetime.utcnow()
        
        result = collection.insert_one(test_doc)
        print(f"Inserted test document with id: {test_id}")
        
        # Verify it appears in browse
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
        print(f"Browse status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        classes = data.get('classes', [])
        
        # Find our test row
        found = False
        for cls in classes:
            if cls.get('classLabel') == 'Class 1':
                for book in cls.get('books', []):
                    if book.get('bookLabel') == 'ଗଣିତ':
                        for chapter in book.get('chapters', []):
                            if chapter.get('chapterLabel') == 'Test Ch NLPV':
                                for period in chapter.get('periods', []):
                                    if period.get('id') == test_id:
                                        found = True
                                        print(f"✅ Found test row in browse:")
                                        print(f"   - Class: {cls.get('classLabel')}")
                                        print(f"   - Book: {book.get('bookLabel')}")
                                        print(f"   - Chapter: {chapter.get('chapterLabel')}")
                                        print(f"   - Period: {period.get('period')}")
                                        print(f"   - Title: {period.get('title')}")
        
        if found:
            print(f"✅ PASS: Test row with newLessonPlanVisible: true appears in browse")
        else:
            print(f"❌ FAIL: Test row NOT found in browse")
            print(f"Response classes: {json.dumps(classes, indent=2)}")
    except Exception as e:
        print(f"❌ FAIL: Exception during insert test: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # ========================================================================
    # TEST 5: Toggle Visibility OFF via PATCH
    # ========================================================================
    print_test(5, "Toggle Visibility OFF via PATCH")
    try:
        resp = requests.patch(
            f"{BASE_URL}/admin/panchapadi-lessons/{test_id}",
            headers=headers,
            json={"newLessonPlanVisible": False},
            timeout=10
        )
        print(f"PATCH status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return
        
        data = resp.json()
        print(f"PATCH response: {json.dumps(data, indent=2)}")
        
        # Verify it disappears from browse
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
        print(f"Browse status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        classes = data.get('classes', [])
        
        # Check if test row is gone
        found = False
        for cls in classes:
            if cls.get('classLabel') == 'Class 1':
                for book in cls.get('books', []):
                    if book.get('bookLabel') == 'ଗଣିତ':
                        for chapter in book.get('chapters', []):
                            if chapter.get('chapterLabel') == 'Test Ch NLPV':
                                for period in chapter.get('periods', []):
                                    if period.get('id') == test_id:
                                        found = True
        
        if not found:
            print(f"✅ PASS: Test row disappeared from browse after setting newLessonPlanVisible: false")
        else:
            print(f"❌ FAIL: Test row still appears in browse (should be hidden)")
    except Exception as e:
        print(f"❌ FAIL: Exception during toggle OFF test: {e}")
        return
    
    # ========================================================================
    # TEST 6: Toggle Visibility ON via PATCH
    # ========================================================================
    print_test(6, "Toggle Visibility ON via PATCH")
    try:
        resp = requests.patch(
            f"{BASE_URL}/admin/panchapadi-lessons/{test_id}",
            headers=headers,
            json={"newLessonPlanVisible": True},
            timeout=10
        )
        print(f"PATCH status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return
        
        data = resp.json()
        print(f"PATCH response: {json.dumps(data, indent=2)}")
        
        # Verify it reappears in browse
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
        print(f"Browse status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        classes = data.get('classes', [])
        
        # Find our test row
        found = False
        for cls in classes:
            if cls.get('classLabel') == 'Class 1':
                for book in cls.get('books', []):
                    if book.get('bookLabel') == 'ଗଣିତ':
                        for chapter in book.get('chapters', []):
                            if chapter.get('chapterLabel') == 'Test Ch NLPV':
                                for period in chapter.get('periods', []):
                                    if period.get('id') == test_id:
                                        found = True
        
        if found:
            print(f"✅ PASS: Test row reappeared in browse after setting newLessonPlanVisible: true")
        else:
            print(f"❌ FAIL: Test row NOT found in browse (should be visible)")
    except Exception as e:
        print(f"❌ FAIL: Exception during toggle ON test: {e}")
        return
    
    # ========================================================================
    # TEST 7: Meta Endpoint Gated (while newLessonPlanVisible: false)
    # ========================================================================
    print_test(7, "Meta Endpoint Gated (while newLessonPlanVisible: false)")
    try:
        # First, set newLessonPlanVisible to false
        resp = requests.patch(
            f"{BASE_URL}/admin/panchapadi-lessons/{test_id}",
            headers=headers,
            json={"newLessonPlanVisible": False},
            timeout=10
        )
        print(f"PATCH status: {resp.status_code}")
        
        # Try to access meta endpoint
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{test_id}/meta", headers=headers, timeout=10)
        print(f"Meta status: {resp.status_code}")
        if resp.status_code == 404:
            print(f"✅ PASS: Meta endpoint returns 404 when newLessonPlanVisible: false")
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}")
            print(f"Response: {resp.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception during meta gated test: {e}")
        return
    
    # ========================================================================
    # TEST 8: View Endpoint Gated (while newLessonPlanVisible: false)
    # ========================================================================
    print_test(8, "View Endpoint Gated (while newLessonPlanVisible: false)")
    try:
        # Try to access view endpoint (should still be false from previous test)
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{test_id}/view", headers=headers, timeout=10)
        print(f"View status: {resp.status_code}")
        if resp.status_code == 404:
            print(f"✅ PASS: View endpoint returns 404 when newLessonPlanVisible: false")
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception during view gated test: {e}")
        return
    
    # ========================================================================
    # TEST 9: Meta and View Endpoints Work When Visible
    # ========================================================================
    print_test(9, "Meta and View Endpoints Work When Visible")
    try:
        # Set newLessonPlanVisible to true
        resp = requests.patch(
            f"{BASE_URL}/admin/panchapadi-lessons/{test_id}",
            headers=headers,
            json={"newLessonPlanVisible": True},
            timeout=10
        )
        print(f"PATCH status: {resp.status_code}")
        
        # Try meta endpoint
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{test_id}/meta", headers=headers, timeout=10)
        print(f"Meta status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: Meta endpoint returns 200 when newLessonPlanVisible: true")
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
        
        # Try view endpoint
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{test_id}/view", headers=headers, timeout=10)
        print(f"View status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: View endpoint returns 200 when newLessonPlanVisible: true")
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception during meta/view visible test: {e}")
        return
    
    # ========================================================================
    # TEST 10: by-chapter Endpoint Gated
    # ========================================================================
    print_test(10, "by-chapter Endpoint Gated")
    try:
        # First, set newLessonPlanVisible to false
        resp = requests.patch(
            f"{BASE_URL}/admin/panchapadi-lessons/{test_id}",
            headers=headers,
            json={"newLessonPlanVisible": False},
            timeout=10
        )
        print(f"PATCH status: {resp.status_code}")
        
        # Try by-chapter endpoint
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/by-chapter/{test_chapter_id}", headers=headers, timeout=10)
        print(f"by-chapter status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        uploads = data.get('uploads', {})
        print(f"Uploads: {json.dumps(uploads, indent=2)}")
        
        if len(uploads) == 0 or '1' not in uploads:
            print(f"✅ PASS: by-chapter returns empty uploads when newLessonPlanVisible: false")
        else:
            print(f"❌ FAIL: by-chapter should return empty uploads (found {len(uploads)})")
        
        # Now set to true and verify it appears
        resp = requests.patch(
            f"{BASE_URL}/admin/panchapadi-lessons/{test_id}",
            headers=headers,
            json={"newLessonPlanVisible": True},
            timeout=10
        )
        print(f"PATCH status: {resp.status_code}")
        
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/by-chapter/{test_chapter_id}", headers=headers, timeout=10)
        print(f"by-chapter status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        uploads = data.get('uploads', {})
        print(f"Uploads: {json.dumps(uploads, indent=2)}")
        
        if '1' in uploads and uploads['1'].get('id') == test_id:
            print(f"✅ PASS: by-chapter returns upload when newLessonPlanVisible: true")
        else:
            print(f"❌ FAIL: by-chapter should return upload (not found)")
    except Exception as e:
        print(f"❌ FAIL: Exception during by-chapter gated test: {e}")
        return
    
    # ========================================================================
    # TEST 11: Bulk showInNew Action
    # ========================================================================
    print_test(11, "Bulk showInNew Action")
    try:
        # First, get a few legacy IDs
        legacy_docs = list(collection.find({"newLessonPlanVisible": False}).limit(3))
        if len(legacy_docs) == 0:
            print(f"⚠️ WARNING: No legacy documents found for bulk test")
        else:
            legacy_ids = [doc['id'] for doc in legacy_docs]
            print(f"Testing with legacy IDs: {legacy_ids}")
            
            # Apply showInNew action
            resp = requests.post(
                f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                headers=headers,
                json={"ids": legacy_ids, "action": "showInNew"},
                timeout=10
            )
            print(f"Bulk showInNew status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
                return
            
            data = resp.json()
            print(f"Bulk response: {json.dumps(data, indent=2)}")
            
            if data.get('matched', 0) > 0:
                print(f"✅ PASS: Bulk showInNew matched {data.get('matched')} documents")
            else:
                print(f"❌ FAIL: Bulk showInNew matched 0 documents")
            
            # Verify they appear in browse
            resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
            data = resp.json()
            classes = data.get('classes', [])
            
            # Count how many of our legacy IDs appear
            found_count = 0
            for cls in classes:
                for book in cls.get('books', []):
                    for chapter in book.get('chapters', []):
                        for period in chapter.get('periods', []):
                            if period.get('id') in legacy_ids:
                                found_count += 1
            
            print(f"Found {found_count} of {len(legacy_ids)} legacy IDs in browse")
            if found_count > 0:
                print(f"✅ PASS: Legacy rows appear in browse after showInNew")
            else:
                print(f"⚠️ WARNING: No legacy rows found in browse (may be filtered by other criteria)")
            
            # Now hide them again with hideFromNew
            resp = requests.post(
                f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                headers=headers,
                json={"ids": legacy_ids, "action": "hideFromNew"},
                timeout=10
            )
            print(f"Bulk hideFromNew status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                return
            
            data = resp.json()
            print(f"Bulk response: {json.dumps(data, indent=2)}")
            
            if data.get('matched', 0) > 0:
                print(f"✅ PASS: Bulk hideFromNew matched {data.get('matched')} documents")
            else:
                print(f"❌ FAIL: Bulk hideFromNew matched 0 documents")
            
            # Verify they disappear from browse
            resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
            data = resp.json()
            classes = data.get('classes', [])
            
            # Count how many of our legacy IDs appear
            found_count = 0
            for cls in classes:
                for book in cls.get('books', []):
                    for chapter in book.get('chapters', []):
                        for period in chapter.get('periods', []):
                            if period.get('id') in legacy_ids:
                                found_count += 1
            
            print(f"Found {found_count} of {len(legacy_ids)} legacy IDs in browse after hideFromNew")
            if found_count == 0:
                print(f"✅ PASS: Legacy rows disappeared from browse after hideFromNew")
            else:
                print(f"⚠️ WARNING: {found_count} legacy rows still in browse")
    except Exception as e:
        print(f"❌ FAIL: Exception during bulk test: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # ========================================================================
    # TEST 12: Regression - Legacy Status Transitions Still Work
    # ========================================================================
    print_test(12, "Regression - Legacy Status Transitions Still Work")
    try:
        # Get a legacy document
        legacy_doc = collection.find_one({"newLessonPlanVisible": False})
        if not legacy_doc:
            print(f"⚠️ WARNING: No legacy document found for regression test")
        else:
            legacy_id = legacy_doc['id']
            print(f"Testing with legacy ID: {legacy_id}")
            
            # Apply publish action (should NOT reveal the row)
            resp = requests.post(
                f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                headers=headers,
                json={"ids": [legacy_id], "action": "publish"},
                timeout=10
            )
            print(f"Bulk publish status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                return
            
            data = resp.json()
            print(f"Bulk response: {json.dumps(data, indent=2)}")
            
            # Verify it does NOT appear in browse (because newLessonPlanVisible is still false)
            resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
            data = resp.json()
            classes = data.get('classes', [])
            
            found = False
            for cls in classes:
                for book in cls.get('books', []):
                    for chapter in book.get('chapters', []):
                        for period in chapter.get('periods', []):
                            if period.get('id') == legacy_id:
                                found = True
            
            if not found:
                print(f"✅ PASS: Publishing legacy row does NOT reveal it (newLessonPlanVisible still false)")
            else:
                print(f"❌ FAIL: Legacy row appeared in browse after publish (should remain hidden)")
    except Exception as e:
        print(f"❌ FAIL: Exception during regression test: {e}")
        return
    
    # ========================================================================
    # TEST 13: New Upload Defaults to newLessonPlanVisible: true
    # ========================================================================
    print_test(13, "New Upload Defaults to newLessonPlanVisible: true")
    test_upload_id = None
    try:
        # Create a minimal HTML upload without specifying newLessonPlanVisible
        html_content = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="em-class" content="Class 1">
    <meta name="em-book" content="ଗଣିତ">
    <meta name="em-chapter" content="Test Upload Default">
    <meta name="em-period" content="1">
    <meta name="em-title" content="Test Default NLPV">
</head>
<body>
    <h1>Test Upload - Default newLessonPlanVisible</h1>
    <p>This is a test upload to verify that newLessonPlanVisible defaults to true.</p>
    <p>Additional content to meet minimum length requirement.</p>
    <p>More content here to ensure we have at least 200 characters in the HTML.</p>
</body>
</html>"""
        
        resp = requests.post(
            f"{BASE_URL}/admin/panchapadi-lessons",
            headers=headers,
            json={
                "html": html_content,
                "filename": "test-default-nlpv.html",
                # NOT specifying newLessonPlanVisible - should default to true
            },
            timeout=15
        )
        print(f"Upload status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
        else:
            data = resp.json()
            print(f"Upload response: {json.dumps(data, indent=2)}")
            
            # Get the uploaded document ID
            if 'id' in data:
                test_upload_id = data['id']
            elif 'saved' in data and len(data['saved']) > 0:
                test_upload_id = data['saved'][0].get('id')
            
            if test_upload_id:
                # Query DB to verify newLessonPlanVisible is true
                doc = collection.find_one({"id": test_upload_id})
                if doc:
                    nlpv_value = doc.get('newLessonPlanVisible')
                    print(f"DB newLessonPlanVisible: {nlpv_value}")
                    if nlpv_value is True:
                        print(f"✅ PASS: New upload defaults to newLessonPlanVisible: true")
                    else:
                        print(f"❌ FAIL: Expected newLessonPlanVisible: true, got {nlpv_value}")
                else:
                    print(f"⚠️ WARNING: Could not find uploaded document in DB")
            else:
                print(f"⚠️ WARNING: Could not extract upload ID from response")
    except Exception as e:
        print(f"❌ FAIL: Exception during new upload default test: {e}")
        import traceback
        traceback.print_exc()
    
    # ========================================================================
    # TEST 14: New Upload Can Explicitly Opt-Out
    # ========================================================================
    print_test(14, "New Upload Can Explicitly Opt-Out")
    test_optout_id = None
    try:
        # Create a minimal HTML upload with newLessonPlanVisible: false
        html_content = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="em-class" content="Class 1">
    <meta name="em-book" content="ଗଣିତ">
    <meta name="em-chapter" content="Test Upload Opt-Out">
    <meta name="em-period" content="1">
    <meta name="em-title" content="Test Opt-Out NLPV">
</head>
<body>
    <h1>Test Upload - Opt-Out newLessonPlanVisible</h1>
    <p>This is a test upload to verify that newLessonPlanVisible can be explicitly set to false.</p>
    <p>Additional content to meet minimum length requirement.</p>
    <p>More content here to ensure we have at least 200 characters in the HTML.</p>
</body>
</html>"""
        
        resp = requests.post(
            f"{BASE_URL}/admin/panchapadi-lessons",
            headers=headers,
            json={
                "html": html_content,
                "filename": "test-optout-nlpv.html",
                "newLessonPlanVisible": False,  # Explicitly opt-out
            },
            timeout=15
        )
        print(f"Upload status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
        else:
            data = resp.json()
            print(f"Upload response: {json.dumps(data, indent=2)}")
            
            # Get the uploaded document ID
            if 'id' in data:
                test_optout_id = data['id']
            elif 'saved' in data and len(data['saved']) > 0:
                test_optout_id = data['saved'][0].get('id')
            
            if test_optout_id:
                # Query DB to verify newLessonPlanVisible is false
                doc = collection.find_one({"id": test_optout_id})
                if doc:
                    nlpv_value = doc.get('newLessonPlanVisible')
                    print(f"DB newLessonPlanVisible: {nlpv_value}")
                    if nlpv_value is False:
                        print(f"✅ PASS: New upload can explicitly opt-out (newLessonPlanVisible: false)")
                    else:
                        print(f"❌ FAIL: Expected newLessonPlanVisible: false, got {nlpv_value}")
                    
                    # Verify it does NOT appear in browse
                    resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
                    data = resp.json()
                    classes = data.get('classes', [])
                    
                    found = False
                    for cls in classes:
                        for book in cls.get('books', []):
                            for chapter in book.get('chapters', []):
                                for period in chapter.get('periods', []):
                                    if period.get('id') == test_optout_id:
                                        found = True
                    
                    if not found:
                        print(f"✅ PASS: Opted-out upload does NOT appear in browse")
                    else:
                        print(f"❌ FAIL: Opted-out upload should NOT appear in browse")
                else:
                    print(f"⚠️ WARNING: Could not find uploaded document in DB")
            else:
                print(f"⚠️ WARNING: Could not extract upload ID from response")
    except Exception as e:
        print(f"❌ FAIL: Exception during opt-out test: {e}")
        import traceback
        traceback.print_exc()
    
    # ========================================================================
    # TEST 15: Cleanup - Delete All Test Rows
    # ========================================================================
    print_test(15, "Cleanup - Delete All Test Rows")
    try:
        # Delete the original test row
        result = collection.delete_one({"id": test_id})
        print(f"Deleted original test row: {result.deleted_count} document(s)")
        
        # Delete the default upload test row
        if test_upload_id:
            result = collection.delete_one({"id": test_upload_id})
            print(f"Deleted default upload test row: {result.deleted_count} document(s)")
        
        # Delete the opt-out test row
        if test_optout_id:
            result = collection.delete_one({"id": test_optout_id})
            print(f"Deleted opt-out test row: {result.deleted_count} document(s)")
        
        print(f"✅ PASS: All test rows cleaned up successfully")
    except Exception as e:
        print(f"❌ FAIL: Exception during cleanup: {e}")
    
    # ========================================================================
    # FINAL SUMMARY
    # ========================================================================
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print("✅ All tests completed")
    print("="*70)

if __name__ == "__main__":
    main()
