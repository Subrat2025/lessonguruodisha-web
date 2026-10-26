#!/usr/bin/env python3
"""
Backend test for Question Bank Bulk Reassign and Bulk Delete endpoints
Tests:
- POST /api/admin/qbank/items/bulk-reassign (happy path, auto-create, partial, errors)
- POST /api/admin/qbank/items/bulk-delete (happy path, errors)
- Access control (non-admin rejection)
Admin: 9999999999 / admin123 (also 9692604577 / <redacted>)
"""

import requests
import json
import time

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
TEMPLATE_URL = "https://odisha-learning-pro.preview.emergentagent.com/templates/qbank-import-template.html"

def test_qbank_bulk_operations():
    print("=" * 80)
    print("QUESTION BANK BULK REASSIGN & DELETE - BACKEND TESTING")
    print("=" * 80)
    
    # Test 1: Admin Login
    print("\n[Test 1] Admin Login...")
    try:
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} - {login_resp.text}"
        admin_token = login_resp.json()["token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("✅ Test 1 PASSED: Admin login successful")
    except Exception as e:
        print(f"❌ Test 1 FAILED: {str(e)}")
        return
    
    # Test 2: Check if we have existing items, if not import some
    print("\n[Test 2] Check for existing question bank items...")
    try:
        items_resp = requests.get(f"{BASE_URL}/admin/qbank/items", headers=admin_headers)
        assert items_resp.status_code == 200, f"Items fetch failed: {items_resp.status_code}"
        existing_items = items_resp.json()["items"]
        
        if len(existing_items) < 2:
            print(f"   Found only {len(existing_items)} items, importing more...")
            # Download template
            template_resp = requests.get(TEMPLATE_URL)
            assert template_resp.status_code == 200, f"Template download failed: {template_resp.status_code}"
            template_html = template_resp.text
            
            # Preview
            preview_resp = requests.post(f"{BASE_URL}/admin/qbank/import/preview", 
                headers=admin_headers,
                json={
                    "html": template_html,
                    "fileName": "bulk-test.html"
                }
            )
            assert preview_resp.status_code == 200, f"Preview failed: {preview_resp.status_code} - {preview_resp.text}"
            preview_data = preview_resp.json()
            preview_id = preview_data["previewId"]
            items = preview_data["items"]
            
            if len(items) > 0:
                # Save (this will create or update items)
                save_resp = requests.post(f"{BASE_URL}/admin/qbank/import/save",
                    headers=admin_headers,
                    json={
                        "previewId": preview_id,
                        "dedupeMode": "replace"  # Replace existing to ensure we have fresh data
                    }
                )
                assert save_resp.status_code == 200, f"Save failed: {save_resp.status_code} - {save_resp.text}"
                save_data = save_resp.json()
                print(f"   Imported {save_data.get('saved', 0)} questions")
        
        print(f"✅ Test 2 PASSED: Have sufficient items for testing")
    except Exception as e:
        print(f"❌ Test 2 FAILED: {str(e)}")
        return
    
    # Test 3: Get existing classes, books, chapters for testing
    print("\n[Test 3] Get existing classes, books, chapters...")
    try:
        classes_resp = requests.get(f"{BASE_URL}/classes")
        assert classes_resp.status_code == 200, f"Classes fetch failed: {classes_resp.status_code}"
        classes_data = classes_resp.json()
        classes = classes_data.get('classes', classes_data) if isinstance(classes_data, dict) else classes_data
        assert len(classes) > 0, "No classes found"
        
        # Get a class (prefer Class 5 or Class 1)
        test_class = next((c for c in classes if c['name'] == 'Class 5'), classes[0])
        test_class_id = test_class['id']
        
        # Get books for this class
        books_resp = requests.get(f"{BASE_URL}/books?classId={test_class_id}")
        assert books_resp.status_code == 200, f"Books fetch failed: {books_resp.status_code}"
        books_data = books_resp.json()
        books = books_data.get('books', books_data) if isinstance(books_data, dict) else books_data
        assert len(books) > 0, f"No books found for test class"
        
        # Find a book with chapters
        test_book = None
        test_book_id = None
        test_chapter = None
        test_chapter_id = None
        
        for book in books:
            chapters_resp = requests.get(f"{BASE_URL}/chapters?bookId={book['id']}")
            if chapters_resp.status_code == 200:
                chapters_data = chapters_resp.json()
                chapters = chapters_data.get('chapters', chapters_data) if isinstance(chapters_data, dict) else chapters_data
                if len(chapters) > 0:
                    test_book = book
                    test_book_id = book['id']
                    test_chapter = chapters[0]
                    test_chapter_id = test_chapter['id']
                    break
        
        assert test_book is not None, "No books with chapters found for test class"
        
        print(f"✅ Test 3 PASSED: Found test class '{test_class['name']}', book '{test_book['name']}', chapter '{test_chapter['name']}'")
    except Exception as e:
        print(f"❌ Test 3 FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return
    
    # Test 4: Get some question bank items to work with
    print("\n[Test 4] Get question bank items...")
    try:
        items_resp = requests.get(f"{BASE_URL}/admin/qbank/items", headers=admin_headers)
        assert items_resp.status_code == 200, f"Items fetch failed: {items_resp.status_code}"
        all_items = items_resp.json()["items"]
        assert len(all_items) >= 2, f"Need at least 2 items for testing, found {len(all_items)}"
        
        # Take first 2 items for testing
        test_item_ids = [all_items[0]['id'], all_items[1]['id']]
        print(f"✅ Test 4 PASSED: Found {len(all_items)} items, selected 2 for testing: {test_item_ids}")
    except Exception as e:
        print(f"❌ Test 4 FAILED: {str(e)}")
        return
    
    # Test 5: Bulk reassign - Happy path with existing masters (classId + subjectId + chapterId)
    print("\n[Test 5] POST /api/admin/qbank/items/bulk-reassign - Happy path with existing IDs...")
    try:
        reassign_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign",
            headers=admin_headers,
            json={
                "itemIds": test_item_ids,
                "classId": test_class_id,
                "subjectId": test_book_id,
                "chapterId": test_chapter_id
            }
        )
        assert reassign_resp.status_code == 200, f"Reassign failed: {reassign_resp.status_code} - {reassign_resp.text}"
        reassign_data = reassign_resp.json()
        assert reassign_data["ok"] == True, "Reassign not ok"
        assert reassign_data["modified"] == 2, f"Expected 2 modified, got {reassign_data['modified']}"
        assert reassign_data["resolved"]["classId"] == test_class_id, "ClassId mismatch"
        assert reassign_data["resolved"]["subjectId"] == test_book_id, "SubjectId mismatch"
        assert reassign_data["resolved"]["chapterId"] == test_chapter_id, "ChapterId mismatch"
        print(f"✅ Test 5 PASSED: Reassigned {reassign_data['modified']} items to existing class/subject/chapter")
    except Exception as e:
        print(f"❌ Test 5 FAILED: {str(e)}")
    
    # Test 6: Verify items were reassigned by querying with filters
    print("\n[Test 6] Verify reassigned items appear in filtered query...")
    try:
        filtered_resp = requests.get(
            f"{BASE_URL}/admin/qbank/items?classId={test_class_id}&subjectId={test_book_id}&chapterId={test_chapter_id}",
            headers=admin_headers
        )
        assert filtered_resp.status_code == 200, f"Filtered query failed: {filtered_resp.status_code}"
        filtered_items = filtered_resp.json()["items"]
        
        # Check if our test items are in the results
        filtered_ids = [item['id'] for item in filtered_items]
        assert test_item_ids[0] in filtered_ids, f"First test item not found in filtered results"
        assert test_item_ids[1] in filtered_ids, f"Second test item not found in filtered results"
        
        # Verify the items have correct classId, subjectId, chapterId
        test_item_1 = next(item for item in filtered_items if item['id'] == test_item_ids[0])
        assert test_item_1['classId'] == test_class_id, "Item 1 classId mismatch"
        assert test_item_1['subjectId'] == test_book_id, "Item 1 subjectId mismatch"
        assert test_item_1['chapterId'] == test_chapter_id, "Item 1 chapterId mismatch"
        
        print(f"✅ Test 6 PASSED: Verified items appear in filtered query with correct IDs")
    except Exception as e:
        print(f"❌ Test 6 FAILED: {str(e)}")
    
    # Test 7: Bulk reassign - Auto-create path (new class/subject/chapter by name)
    print("\n[Test 7] POST /api/admin/qbank/items/bulk-reassign - Auto-create new masters...")
    try:
        timestamp = int(time.time())
        new_class_name = f"TEST NEW CLASS {timestamp}"
        new_subject_name = f"TEST NEW SUBJECT {timestamp}"
        new_chapter_name = f"TEST NEW CHAPTER {timestamp}"
        
        reassign_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign",
            headers=admin_headers,
            json={
                "itemIds": [test_item_ids[0]],  # Just reassign first item
                "className": new_class_name,
                "subjectName": new_subject_name,
                "chapterName": new_chapter_name,
                "autoCreate": True
            }
        )
        assert reassign_resp.status_code == 200, f"Auto-create reassign failed: {reassign_resp.status_code} - {reassign_resp.text}"
        reassign_data = reassign_resp.json()
        assert reassign_data["ok"] == True, "Auto-create reassign not ok"
        assert reassign_data["modified"] == 1, f"Expected 1 modified, got {reassign_data['modified']}"
        
        new_class_id = reassign_data["resolved"]["classId"]
        new_subject_id = reassign_data["resolved"]["subjectId"]
        new_chapter_id = reassign_data["resolved"]["chapterId"]
        
        assert new_class_id is not None, "New classId not created"
        assert new_subject_id is not None, "New subjectId not created"
        assert new_chapter_id is not None, "New chapterId not created"
        
        print(f"✅ Test 7 PASSED: Auto-created new class/subject/chapter and reassigned 1 item")
        print(f"   - New classId: {new_class_id}")
        print(f"   - New subjectId: {new_subject_id}")
        print(f"   - New chapterId: {new_chapter_id}")
    except Exception as e:
        print(f"❌ Test 7 FAILED: {str(e)}")
        new_class_id = None
        new_subject_id = None
        new_chapter_id = None
    
    # Test 8: Verify new masters were created in database
    print("\n[Test 8] Verify new class/subject/chapter exist in database...")
    try:
        # Check classes
        classes_resp = requests.get(f"{BASE_URL}/classes")
        classes_data = classes_resp.json()
        classes = classes_data.get('classes', classes_data) if isinstance(classes_data, dict) else classes_data
        new_class = next((c for c in classes if c['id'] == new_class_id), None)
        assert new_class is not None, "New class not found in database"
        assert new_class['name'] == new_class_name, f"Class name mismatch: {new_class['name']}"
        
        # Check books
        books_resp = requests.get(f"{BASE_URL}/books?classId={new_class_id}")
        books_data = books_resp.json()
        books = books_data.get('books', books_data) if isinstance(books_data, dict) else books_data
        new_book = next((b for b in books if b['id'] == new_subject_id), None)
        assert new_book is not None, "New book not found in database"
        assert new_book['name'] == new_subject_name, f"Book name mismatch: {new_book['name']}"
        
        # Check chapters
        chapters_resp = requests.get(f"{BASE_URL}/chapters?bookId={new_subject_id}")
        chapters_data = chapters_resp.json()
        chapters = chapters_data.get('chapters', chapters_data) if isinstance(chapters_data, dict) else chapters_data
        new_chapter = next((ch for ch in chapters if ch['id'] == new_chapter_id), None)
        assert new_chapter is not None, "New chapter not found in database"
        assert new_chapter['name'] == new_chapter_name, f"Chapter name mismatch: {new_chapter['name']}"
        
        print(f"✅ Test 8 PASSED: Verified new class/book/chapter exist in database")
    except Exception as e:
        print(f"❌ Test 8 FAILED: {str(e)}")
    
    # Test 9: Verify item was reassigned to new masters
    print("\n[Test 9] Verify item was reassigned to new masters...")
    try:
        item_resp = requests.get(
            f"{BASE_URL}/admin/qbank/items?classId={new_class_id}&subjectId={new_subject_id}&chapterId={new_chapter_id}",
            headers=admin_headers
        )
        assert item_resp.status_code == 200, f"Query failed: {item_resp.status_code}"
        items = item_resp.json()["items"]
        
        # Check if our test item is in the results
        item_ids = [item['id'] for item in items]
        assert test_item_ids[0] in item_ids, "Test item not found in new location"
        
        print(f"✅ Test 9 PASSED: Item successfully reassigned to new masters")
    except Exception as e:
        print(f"❌ Test 9 FAILED: {str(e)}")
    
    # Test 10: Partial reassign (only chapter change, keep class/subject)
    print("\n[Test 10] POST /api/admin/qbank/items/bulk-reassign - Partial (only chapter)...")
    try:
        # Get another chapter from the same book
        chapters_resp = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}")
        chapters = chapters_resp.json()
        if len(chapters) >= 2:
            another_chapter_id = chapters[1]['id']
        else:
            # If only one chapter, use the same one (still valid test)
            another_chapter_id = test_chapter_id
        
        reassign_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign",
            headers=admin_headers,
            json={
                "itemIds": [test_item_ids[1]],  # Reassign second item
                "chapterId": another_chapter_id  # Only provide chapterId
            }
        )
        assert reassign_resp.status_code == 200, f"Partial reassign failed: {reassign_resp.status_code} - {reassign_resp.text}"
        reassign_data = reassign_resp.json()
        assert reassign_data["ok"] == True, "Partial reassign not ok"
        assert reassign_data["modified"] == 1, f"Expected 1 modified, got {reassign_data['modified']}"
        assert reassign_data["resolved"]["chapterId"] == another_chapter_id, "ChapterId mismatch"
        
        print(f"✅ Test 10 PASSED: Partial reassign (only chapter) successful")
    except Exception as e:
        print(f"❌ Test 10 FAILED: {str(e)}")
    
    # Test 11: Error case - empty itemIds
    print("\n[Test 11] POST /api/admin/qbank/items/bulk-reassign - Error: empty itemIds...")
    try:
        reassign_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign",
            headers=admin_headers,
            json={
                "itemIds": [],
                "classId": test_class_id
            }
        )
        assert reassign_resp.status_code == 400, f"Expected 400, got {reassign_resp.status_code}"
        error_data = reassign_resp.json()
        assert "error" in error_data, "Missing error field"
        assert "No items selected" in error_data["error"], f"Wrong error message: {error_data['error']}"
        print(f"✅ Test 11 PASSED: Empty itemIds correctly rejected with 400")
    except Exception as e:
        print(f"❌ Test 11 FAILED: {str(e)}")
    
    # Test 12: Error case - no target fields
    print("\n[Test 12] POST /api/admin/qbank/items/bulk-reassign - Error: no target fields...")
    try:
        reassign_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign",
            headers=admin_headers,
            json={
                "itemIds": test_item_ids
                # No classId, subjectId, chapterId, or names
            }
        )
        assert reassign_resp.status_code == 400, f"Expected 400, got {reassign_resp.status_code}"
        error_data = reassign_resp.json()
        assert "error" in error_data, "Missing error field"
        assert "Nothing to reassign" in error_data["error"], f"Wrong error message: {error_data['error']}"
        print(f"✅ Test 12 PASSED: No target fields correctly rejected with 400")
    except Exception as e:
        print(f"❌ Test 12 FAILED: {str(e)}")
    
    # Test 13: Access control - non-admin should be rejected
    print("\n[Test 13] POST /api/admin/qbank/items/bulk-reassign - Access control: non-admin...")
    try:
        # Create a regular user
        timestamp = int(time.time())
        user_mobile = f"88{timestamp % 100000000:08d}"
        register_resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": user_mobile,
            "password": "test123"
        })
        assert register_resp.status_code == 200, f"User registration failed: {register_resp.status_code}"
        user_token = register_resp.json()["token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}
        
        # Try to reassign with non-admin token
        reassign_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-reassign",
            headers=user_headers,
            json={
                "itemIds": test_item_ids,
                "classId": test_class_id
            }
        )
        assert reassign_resp.status_code in [401, 403], f"Expected 401/403, got {reassign_resp.status_code}"
        print(f"✅ Test 13 PASSED: Non-admin correctly rejected with {reassign_resp.status_code}")
    except Exception as e:
        print(f"❌ Test 13 FAILED: {str(e)}")
    
    # Test 14: Bulk delete - Happy path
    print("\n[Test 14] POST /api/admin/qbank/items/bulk-delete - Happy path...")
    try:
        # Get current count
        items_resp = requests.get(f"{BASE_URL}/admin/qbank/items", headers=admin_headers)
        initial_count = len(items_resp.json()["items"])
        
        # Delete the 2 test items
        delete_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-delete",
            headers=admin_headers,
            json={
                "itemIds": test_item_ids
            }
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.status_code} - {delete_resp.text}"
        delete_data = delete_resp.json()
        assert delete_data["ok"] == True, "Delete not ok"
        assert delete_data["deleted"] == 2, f"Expected 2 deleted, got {delete_data['deleted']}"
        
        # Verify items are gone
        items_resp = requests.get(f"{BASE_URL}/admin/qbank/items", headers=admin_headers)
        final_count = len(items_resp.json()["items"])
        assert final_count == initial_count - 2, f"Expected count to decrease by 2, got {initial_count} -> {final_count}"
        
        # Verify specific items are gone
        all_ids = [item['id'] for item in items_resp.json()["items"]]
        assert test_item_ids[0] not in all_ids, "First item still exists after delete"
        assert test_item_ids[1] not in all_ids, "Second item still exists after delete"
        
        print(f"✅ Test 14 PASSED: Deleted 2 items, verified they're gone")
    except Exception as e:
        print(f"❌ Test 14 FAILED: {str(e)}")
    
    # Test 15: Bulk delete - Error: empty itemIds
    print("\n[Test 15] POST /api/admin/qbank/items/bulk-delete - Error: empty itemIds...")
    try:
        delete_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-delete",
            headers=admin_headers,
            json={
                "itemIds": []
            }
        )
        assert delete_resp.status_code == 400, f"Expected 400, got {delete_resp.status_code}"
        error_data = delete_resp.json()
        assert "error" in error_data, "Missing error field"
        assert "No items selected" in error_data["error"], f"Wrong error message: {error_data['error']}"
        print(f"✅ Test 15 PASSED: Empty itemIds correctly rejected with 400")
    except Exception as e:
        print(f"❌ Test 15 FAILED: {str(e)}")
    
    # Test 16: Bulk delete - Access control: non-admin
    print("\n[Test 16] POST /api/admin/qbank/items/bulk-delete - Access control: non-admin...")
    try:
        # Use the user token from Test 13
        delete_resp = requests.post(f"{BASE_URL}/admin/qbank/items/bulk-delete",
            headers=user_headers,
            json={
                "itemIds": ["dummy-id"]
            }
        )
        assert delete_resp.status_code in [401, 403], f"Expected 401/403, got {delete_resp.status_code}"
        print(f"✅ Test 16 PASSED: Non-admin correctly rejected with {delete_resp.status_code}")
    except Exception as e:
        print(f"❌ Test 16 FAILED: {str(e)}")
    
    # Test 17: Cleanup - Delete test class/book/chapter created in Test 7
    print("\n[Test 17] Cleanup - Delete test masters created during testing...")
    try:
        if new_chapter_id:
            # Note: There's no DELETE endpoint for chapters/books/classes in the current API
            # So we'll just note that they exist and can be cleaned up manually if needed
            print(f"   ⚠️  Test masters created (manual cleanup may be needed):")
            print(f"      - Class: {new_class_name} (ID: {new_class_id})")
            print(f"      - Book: {new_subject_name} (ID: {new_subject_id})")
            print(f"      - Chapter: {new_chapter_name} (ID: {new_chapter_id})")
        print(f"✅ Test 17 PASSED: Cleanup noted (test items already deleted in Test 14)")
    except Exception as e:
        print(f"❌ Test 17 FAILED: {str(e)}")
    
    print("\n" + "=" * 80)
    print("TESTING COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    test_qbank_bulk_operations()
