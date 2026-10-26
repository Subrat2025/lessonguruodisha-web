#!/usr/bin/env python3
"""
Backend test for Q&A Worksheets feature
Tests all endpoints: upload (single/bulk), list, get, delete, auth, parser
"""

import requests
import json
import os
from pathlib import Path

# Backend URL from .env
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test data
CLASS_4_ID = "07b512b5-0d75-4056-a592-c613f96a931b"
BOOK_ID = "6ff5d045-2b8c-48ba-8370-c0195ca6b7d2"  # ଗଣିତ ମେଳା

# Global variables
admin_token = None
test_chapter_id = None
test_chapter_id_2 = None
test_qa_id = None
sample_html = None

def log(msg):
    print(f"✓ {msg}")

def error(msg):
    print(f"✗ {msg}")

def test_admin_login():
    """Test 1: Admin login"""
    global admin_token
    try:
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            admin_token = data.get('token')
            if admin_token:
                log(f"Test 1 PASSED: Admin login successful (token: {admin_token[:20]}...)")
                return True
            else:
                error("Test 1 FAILED: No token in response")
                return False
        else:
            error(f"Test 1 FAILED: Login failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 1 FAILED: Exception during login: {e}")
        return False

def load_sample_html():
    """Load sample Q&A HTML file"""
    global sample_html
    try:
        with open('/tmp/qa_sample.html', 'r', encoding='utf-8') as f:
            sample_html = f.read()
        log(f"Loaded sample HTML ({len(sample_html)} chars)")
        return True
    except Exception as e:
        error(f"Failed to load sample HTML: {e}")
        return False

def test_create_test_chapter():
    """Test 2: Create test chapter for Q&A upload"""
    global test_chapter_id
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/chapters", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "name": "Test Chapter for Q&A",
            "order": 999
        }, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            test_chapter_id = data.get('id')  # Fixed: response is { ok: true, id }
            if test_chapter_id:
                log(f"Test 2 PASSED: Created test chapter (id: {test_chapter_id})")
                return True
            else:
                error(f"Test 2 FAILED: No chapter id in response: {data}")
                return False
        else:
            error(f"Test 2 FAILED: Chapter creation failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 2 FAILED: Exception during chapter creation: {e}")
        return False

def test_single_upload_valid():
    """Test 3: POST /admin/qa-worksheets/upload - Single upload with valid data"""
    global test_qa_id
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/qa-worksheets/upload", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "chapterId": test_chapter_id,
            "html": sample_html,
            "filename": "qa_sample.html"
        }, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') and data.get('saved') == 1 and data.get('failed') == 0:
                results = data.get('results', [])
                if len(results) == 1 and results[0].get('ok'):
                    test_qa_id = results[0].get('id')
                    mode = results[0].get('mode')
                    question_count = results[0].get('questionCount')
                    log(f"Test 3 PASSED: Single upload successful (id: {test_qa_id}, mode: {mode}, questions: {question_count})")
                    return True
                else:
                    error(f"Test 3 FAILED: Invalid results structure: {results}")
                    return False
            else:
                error(f"Test 3 FAILED: Unexpected response: {data}")
                return False
        else:
            error(f"Test 3 FAILED: Upload failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 3 FAILED: Exception during upload: {e}")
        return False

def test_single_upload_upsert():
    """Test 4: POST /admin/qa-worksheets/upload - Re-upload should upsert (mode='updated')"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/qa-worksheets/upload", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "chapterId": test_chapter_id,
            "html": sample_html,
            "filename": "qa_sample_updated.html"
        }, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') and data.get('saved') == 1:
                results = data.get('results', [])
                if len(results) == 1 and results[0].get('mode') == 'updated':
                    log(f"Test 4 PASSED: Re-upload upserted correctly (mode: updated)")
                    return True
                else:
                    error(f"Test 4 FAILED: Expected mode='updated', got: {results}")
                    return False
            else:
                error(f"Test 4 FAILED: Unexpected response: {data}")
                return False
        else:
            error(f"Test 4 FAILED: Upload failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 4 FAILED: Exception during upload: {e}")
        return False

def test_single_upload_bad_chapter():
    """Test 5: POST /admin/qa-worksheets/upload - Bad chapterId should return error in results"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/qa-worksheets/upload", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "chapterId": "bad-chapter-id-12345",
            "html": sample_html,
            "filename": "test.html"
        }, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            results = data.get('results', [])
            if len(results) == 1 and not results[0].get('ok') and 'Chapter not found' in results[0].get('error', ''):
                log(f"Test 5 PASSED: Bad chapterId correctly rejected with error: {results[0].get('error')}")
                return True
            else:
                error(f"Test 5 FAILED: Expected 'Chapter not found' error, got: {results}")
                return False
        else:
            error(f"Test 5 FAILED: Upload failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 5 FAILED: Exception during upload: {e}")
        return False

def test_single_upload_missing_classid():
    """Test 6: POST /admin/qa-worksheets/upload - Missing classId should return 400"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/qa-worksheets/upload", json={
            "bookId": BOOK_ID,
            "chapterId": test_chapter_id,
            "html": sample_html,
            "filename": "test.html"
        }, headers=headers, timeout=15)
        
        if resp.status_code == 400:
            log(f"Test 6 PASSED: Missing classId correctly rejected with 400")
            return True
        else:
            error(f"Test 6 FAILED: Expected 400, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 6 FAILED: Exception during upload: {e}")
        return False

def test_create_second_chapter():
    """Test 7: Create second test chapter for bulk upload"""
    global test_chapter_id_2
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/chapters", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "name": "Test Chapter 2 for Q&A",
            "order": 1000
        }, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            test_chapter_id_2 = data.get('id')  # Fixed: response is { ok: true, id }
            if test_chapter_id_2:
                log(f"Test 7 PASSED: Created second test chapter (id: {test_chapter_id_2})")
                return True
            else:
                error(f"Test 7 FAILED: No chapter id in response: {data}")
                return False
        else:
            error(f"Test 7 FAILED: Chapter creation failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 7 FAILED: Exception during chapter creation: {e}")
        return False

def test_bulk_upload():
    """Test 8: POST /admin/qa-worksheets/upload - Bulk upload with 2 chapters"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{API_URL}/admin/qa-worksheets/upload", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "items": [
                {"chapterId": test_chapter_id, "html": sample_html, "filename": "bulk1.html"},
                {"chapterId": test_chapter_id_2, "html": sample_html, "filename": "bulk2.html"}
            ]
        }, headers=headers, timeout=20)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') and data.get('saved') == 2 and data.get('failed') == 0:
                log(f"Test 8 PASSED: Bulk upload successful (saved: 2, failed: 0)")
                return True
            else:
                error(f"Test 8 FAILED: Expected saved=2, failed=0, got: {data}")
                return False
        else:
            error(f"Test 8 FAILED: Bulk upload failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 8 FAILED: Exception during bulk upload: {e}")
        return False

def test_list_all():
    """Test 9: GET /qa-worksheets - List all (no filter)"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('items', [])
            if len(items) >= 2:  # Should have at least our 2 test items
                # Verify htmlContent is NOT included
                has_html_content = any('htmlContent' in item for item in items)
                if not has_html_content:
                    log(f"Test 9 PASSED: List all returned {len(items)} items without htmlContent")
                    return True
                else:
                    error(f"Test 9 FAILED: htmlContent should not be in list response")
                    return False
            else:
                error(f"Test 9 FAILED: Expected at least 2 items, got {len(items)}")
                return False
        else:
            error(f"Test 9 FAILED: List failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 9 FAILED: Exception during list: {e}")
        return False

def test_list_filter_chapter():
    """Test 10: GET /qa-worksheets?chapterId=xxx - Filter by chapter"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets?chapterId={test_chapter_id}", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('items', [])
            if len(items) == 1 and items[0].get('chapterId') == test_chapter_id:
                log(f"Test 10 PASSED: Filter by chapterId returned 1 item")
                return True
            else:
                error(f"Test 10 FAILED: Expected 1 item with chapterId={test_chapter_id}, got {len(items)} items")
                return False
        else:
            error(f"Test 10 FAILED: List failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 10 FAILED: Exception during list: {e}")
        return False

def test_list_filter_book():
    """Test 11: GET /qa-worksheets?bookId=xxx - Filter by book"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets?bookId={BOOK_ID}", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('items', [])
            if len(items) >= 2:  # Should have our 2 test items
                log(f"Test 11 PASSED: Filter by bookId returned {len(items)} items")
                return True
            else:
                error(f"Test 11 FAILED: Expected at least 2 items, got {len(items)}")
                return False
        else:
            error(f"Test 11 FAILED: List failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 11 FAILED: Exception during list: {e}")
        return False

def test_list_filter_class():
    """Test 12: GET /qa-worksheets?classId=xxx - Filter by class"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets?classId={CLASS_4_ID}", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('items', [])
            if len(items) >= 2:  # Should have our 2 test items
                log(f"Test 12 PASSED: Filter by classId returned {len(items)} items")
                return True
            else:
                error(f"Test 12 FAILED: Expected at least 2 items, got {len(items)}")
                return False
        else:
            error(f"Test 12 FAILED: List failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 12 FAILED: Exception during list: {e}")
        return False

def test_get_full_item():
    """Test 13: GET /qa-worksheets/:id - Get full item with htmlContent"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets/{test_qa_id}", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            item = data.get('item', {})
            html_content = item.get('htmlContent', '')
            
            # Verify required fields
            checks = [
                ('htmlContent', len(html_content) > 5000, f"htmlContent length: {len(html_content)}"),
                ('title', 'title' in item, item.get('title')),
                ('chapterName', 'chapterName' in item, item.get('chapterName')),
                ('questionCount', 'questionCount' in item, item.get('questionCount')),
                ('pages', isinstance(item.get('pages'), list), f"pages count: {len(item.get('pages', []))}"),
            ]
            
            failed = []
            for name, condition, value in checks:
                if not condition:
                    failed.append(f"{name} check failed (value: {value})")
            
            if not failed:
                log(f"Test 13 PASSED: Full item retrieved with all required fields")
                return True
            else:
                error(f"Test 13 FAILED: {', '.join(failed)}")
                return False
        else:
            error(f"Test 13 FAILED: Get failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 13 FAILED: Exception during get: {e}")
        return False

def test_parser_correctness():
    """Test 14: Verify parser correctness - questionCount, pageCount, pages structure"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets/{test_qa_id}", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            item = data.get('item', {})
            
            # Expected values from qa_sample.html
            checks = [
                ('questionCount', item.get('questionCount') == 42, f"Expected 42, got {item.get('questionCount')}"),
                ('pageCount', item.get('pageCount') == 13, f"Expected 13, got {item.get('pageCount')}"),
                ('pages[0].heading', item.get('pages', [{}])[0].get('heading') == 'ଘରର ମଡେଲ', 
                 f"Expected 'ଘରର ମଡେଲ', got '{item.get('pages', [{}])[0].get('heading')}'"),
                ('title contains', 'ଆମ ଚାରିପାଖର ଆକୃତି' in item.get('title', ''), 
                 f"Title: {item.get('title')}"),
            ]
            
            # Check summary.cards
            summary = item.get('summary', {})
            if summary:
                cards = summary.get('cards', [])
                checks.append(('summary.cards.length', len(cards) == 8, f"Expected 8, got {len(cards)}"))
            
            failed = []
            for name, condition, value in checks:
                if not condition:
                    failed.append(f"{name}: {value}")
            
            if not failed:
                log(f"Test 14 PASSED: Parser correctness verified (42 questions, 13 pages, correct heading, 8 summary cards)")
                return True
            else:
                error(f"Test 14 FAILED: {', '.join(failed)}")
                return False
        else:
            error(f"Test 14 FAILED: Get failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 14 FAILED: Exception during parser check: {e}")
        return False

def test_auth_public_read():
    """Test 15: GET /qa-worksheets (no auth) - Should work (public read)"""
    try:
        resp = requests.get(f"{API_URL}/qa-worksheets", timeout=10)
        
        if resp.status_code == 200:
            log(f"Test 15 PASSED: Public read access works (no auth required)")
            return True
        else:
            error(f"Test 15 FAILED: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 15 FAILED: Exception: {e}")
        return False

def test_auth_upload_no_admin():
    """Test 16: POST /admin/qa-worksheets/upload (no admin) - Should return 401/403"""
    try:
        # Try without token
        resp = requests.post(f"{API_URL}/admin/qa-worksheets/upload", json={
            "classId": CLASS_4_ID,
            "bookId": BOOK_ID,
            "chapterId": test_chapter_id,
            "html": sample_html
        }, timeout=10)
        
        if resp.status_code in [401, 403]:
            log(f"Test 16 PASSED: Upload without admin correctly rejected with {resp.status_code}")
            return True
        else:
            error(f"Test 16 FAILED: Expected 401/403, got {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 16 FAILED: Exception: {e}")
        return False

def test_auth_delete_no_admin():
    """Test 17: DELETE /admin/qa-worksheets/:id (no admin) - Should return 401/403"""
    try:
        # Try without token
        resp = requests.delete(f"{API_URL}/admin/qa-worksheets/{test_qa_id}", timeout=10)
        
        if resp.status_code in [401, 403]:
            log(f"Test 17 PASSED: Delete without admin correctly rejected with {resp.status_code}")
            return True
        else:
            error(f"Test 17 FAILED: Expected 401/403, got {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 17 FAILED: Exception: {e}")
        return False

def test_delete_existing():
    """Test 18: DELETE /admin/qa-worksheets/:id - Delete existing item"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.delete(f"{API_URL}/admin/qa-worksheets/{test_qa_id}", headers=headers, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') and data.get('deleted') == 1:
                log(f"Test 18 PASSED: Delete existing item successful (deleted: 1)")
                return True
            else:
                error(f"Test 18 FAILED: Expected deleted=1, got: {data}")
                return False
        else:
            error(f"Test 18 FAILED: Delete failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 18 FAILED: Exception during delete: {e}")
        return False

def test_delete_nonexistent():
    """Test 19: DELETE /admin/qa-worksheets/:id - Delete non-existent item"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.delete(f"{API_URL}/admin/qa-worksheets/nonexistent-id-12345", headers=headers, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') and data.get('deleted') == 0:
                log(f"Test 19 PASSED: Delete non-existent item returned deleted=0")
                return True
            else:
                error(f"Test 19 FAILED: Expected deleted=0, got: {data}")
                return False
        else:
            error(f"Test 19 FAILED: Delete failed with status {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        error(f"Test 19 FAILED: Exception during delete: {e}")
        return False

def test_regression_classes():
    """Test 20: Regression - GET /classes still works"""
    try:
        resp = requests.get(f"{API_URL}/classes", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if len(data.get('classes', [])) >= 11:
                log(f"Test 20 PASSED: Regression - GET /classes works ({len(data.get('classes', []))} classes)")
                return True
            else:
                error(f"Test 20 FAILED: Expected at least 11 classes")
                return False
        else:
            error(f"Test 20 FAILED: GET /classes failed with status {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 20 FAILED: Exception: {e}")
        return False

def test_regression_books():
    """Test 21: Regression - GET /books still works"""
    try:
        resp = requests.get(f"{API_URL}/books", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if len(data.get('books', [])) >= 85:
                log(f"Test 21 PASSED: Regression - GET /books works ({len(data.get('books', []))} books)")
                return True
            else:
                error(f"Test 21 FAILED: Expected at least 85 books")
                return False
        else:
            error(f"Test 21 FAILED: GET /books failed with status {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 21 FAILED: Exception: {e}")
        return False

def test_regression_chapters():
    """Test 22: Regression - GET /chapters still works"""
    try:
        resp = requests.get(f"{API_URL}/chapters?bookId={BOOK_ID}", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if 'chapters' in data:
                log(f"Test 22 PASSED: Regression - GET /chapters works ({len(data.get('chapters', []))} chapters)")
                return True
            else:
                error(f"Test 22 FAILED: No chapters in response")
                return False
        else:
            error(f"Test 22 FAILED: GET /chapters failed with status {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 22 FAILED: Exception: {e}")
        return False

def test_regression_locodes():
    """Test 23: Regression - GET /lo-codes?class=5 still works"""
    try:
        resp = requests.get(f"{API_URL}/lo-codes?class=5", timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if 'items' in data:  # Fixed: response has 'items' not 'codes'
                log(f"Test 23 PASSED: Regression - GET /lo-codes works ({len(data.get('items', []))} codes)")
                return True
            else:
                error(f"Test 23 FAILED: No items in response: {data}")
                return False
        else:
            error(f"Test 23 FAILED: GET /lo-codes failed with status {resp.status_code}")
            return False
    except Exception as e:
        error(f"Test 23 FAILED: Exception: {e}")
        return False

def cleanup():
    """Cleanup: Delete test chapters and remaining Q&A worksheets"""
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Delete remaining Q&A worksheets for test_chapter_id_2
        resp = requests.get(f"{API_URL}/qa-worksheets?chapterId={test_chapter_id_2}", timeout=10)
        if resp.status_code == 200:
            items = resp.json().get('items', [])
            for item in items:
                requests.delete(f"{API_URL}/admin/qa-worksheets/{item['id']}", headers=headers, timeout=10)
        
        # Delete test chapters
        if test_chapter_id:
            requests.delete(f"{API_URL}/admin/chapters/{test_chapter_id}", headers=headers, timeout=10)
        if test_chapter_id_2:
            requests.delete(f"{API_URL}/admin/chapters/{test_chapter_id_2}", headers=headers, timeout=10)
        
        log("Cleanup completed")
    except Exception as e:
        error(f"Cleanup failed: {e}")

def main():
    print("\n" + "="*80)
    print("Q&A WORKSHEETS BACKEND TEST")
    print("="*80 + "\n")
    
    tests = [
        ("Admin Login", test_admin_login),
        ("Load Sample HTML", load_sample_html),
        ("Create Test Chapter", test_create_test_chapter),
        ("Single Upload - Valid", test_single_upload_valid),
        ("Single Upload - Upsert", test_single_upload_upsert),
        ("Single Upload - Bad Chapter", test_single_upload_bad_chapter),
        ("Single Upload - Missing classId", test_single_upload_missing_classid),
        ("Create Second Chapter", test_create_second_chapter),
        ("Bulk Upload", test_bulk_upload),
        ("List All", test_list_all),
        ("List Filter - Chapter", test_list_filter_chapter),
        ("List Filter - Book", test_list_filter_book),
        ("List Filter - Class", test_list_filter_class),
        ("Get Full Item", test_get_full_item),
        ("Parser Correctness", test_parser_correctness),
        ("Auth - Public Read", test_auth_public_read),
        ("Auth - Upload No Admin", test_auth_upload_no_admin),
        ("Auth - Delete No Admin", test_auth_delete_no_admin),
        ("Delete Existing", test_delete_existing),
        ("Delete Non-existent", test_delete_nonexistent),
        ("Regression - Classes", test_regression_classes),
        ("Regression - Books", test_regression_books),
        ("Regression - Chapters", test_regression_chapters),
        ("Regression - LO Codes", test_regression_locodes),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        print(f"\n--- {name} ---")
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            error(f"Test crashed: {e}")
            failed += 1
    
    print("\n" + "="*80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(tests)} tests")
    print("="*80 + "\n")
    
    if failed == 0:
        print("✅ ALL TESTS PASSED!")
    else:
        print(f"❌ {failed} TEST(S) FAILED")
    
    # Cleanup
    print("\n--- Cleanup ---")
    cleanup()
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
