#!/usr/bin/env python3
"""
Google Drive Books Library Integration — Backend Testing
Tests all admin/drive/* endpoints + public PDF proxy with Range support + download gating + publish/hide enforcement.
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test state
admin_token = None
normal_user_token = None
normal_user_mobile = None
test_book_id = None
test_chapter_id = None
test_chapter_odia_id = None
class_1_id = "6660f1e3-314d-47ba-8d5e-5096ae657b27"

def log(msg: str):
    print(f"  {msg}")

def test_result(name: str, passed: bool, details: str = ""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  {details}")
    return passed

def login_admin() -> str:
    """Login as admin and return token"""
    global admin_token
    log("Logging in as admin...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    admin_token = data.get("token")
    assert admin_token, "No token in admin login response"
    log(f"Admin logged in successfully")
    return admin_token

def register_normal_user() -> tuple[str, str]:
    """Register a normal user and return (token, mobile)"""
    global normal_user_token, normal_user_mobile
    import random
    mobile = f"94{random.randint(10000000, 99999999)}"
    log(f"Registering normal user: {mobile}")
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "mobile": mobile,
        "password": "<redacted>",
        "name": "Test User"
    })
    assert resp.status_code == 200, f"User registration failed: {resp.status_code} {resp.text}"
    data = resp.json()
    normal_user_token = data.get("token")
    normal_user_mobile = mobile
    assert normal_user_token, "No token in user registration response"
    log(f"Normal user registered: {mobile}")
    
    # Save to test_credentials.md
    try:
        with open("/app/memory/test_credentials.md", "a") as f:
            f.write(f"\n## Test Normal User (Google Drive testing)\n")
            f.write(f"- Mobile: `{mobile}`\n")
            f.write(f"- Password: `<redacted>`\n")
            f.write(f"- Role: user\n")
            f.write(f"- Purpose: Test auth guards on /admin/drive/* endpoints\n")
    except:
        pass
    
    return normal_user_token, mobile

def test_1_auth_guards():
    """Test 1: AUTH GUARDS - All /admin/drive/* endpoints must return 403 without token AND with normal user token"""
    print("\n" + "="*80)
    print("TEST 1: AUTH GUARDS ON /admin/drive/* ENDPOINTS")
    print("="*80)
    
    endpoints = [
        ("GET", "/admin/drive/status"),
        ("POST", "/admin/drive/test"),
        ("POST", "/admin/drive/sync"),
        ("GET", "/admin/drive/books"),
        ("GET", "/admin/drive/chapters?bookId=test"),
        ("PUT", "/admin/drive/settings"),
    ]
    
    all_passed = True
    
    # Test without token
    log("Testing without token...")
    for method, path in endpoints:
        if method == "GET":
            resp = requests.get(f"{BASE_URL}{path}")
        elif method == "POST":
            resp = requests.post(f"{BASE_URL}{path}", json={})
        elif method == "PUT":
            resp = requests.put(f"{BASE_URL}{path}", json={})
        
        passed = resp.status_code == 403
        if not passed:
            all_passed = False
            log(f"  ❌ {method} {path} without token: {resp.status_code} (expected 403)")
        else:
            log(f"  ✅ {method} {path} without token: 403")
    
    # Test with normal user token
    log("\nTesting with normal user token...")
    for method, path in endpoints:
        headers = {"Authorization": f"Bearer {normal_user_token}"}
        if method == "GET":
            resp = requests.get(f"{BASE_URL}{path}", headers=headers)
        elif method == "POST":
            resp = requests.post(f"{BASE_URL}{path}", json={}, headers=headers)
        elif method == "PUT":
            resp = requests.put(f"{BASE_URL}{path}", json={}, headers=headers)
        
        passed = resp.status_code == 403
        if not passed:
            all_passed = False
            log(f"  ❌ {method} {path} with normal user: {resp.status_code} (expected 403)")
        else:
            log(f"  ✅ {method} {path} with normal user: 403")
    
    return test_result("AUTH GUARDS", all_passed, 
                      "All /admin/drive/* endpoints correctly reject non-admin users")

def test_2_status():
    """Test 2: STATUS - GET /api/admin/drive/status returns ok:true, configured:true, counts.books>0, counts.chapters>0"""
    print("\n" + "="*80)
    print("TEST 2: STATUS ENDPOINT")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/admin/drive/status", headers=headers)
    
    if resp.status_code != 200:
        return test_result("STATUS", False, f"Status code: {resp.status_code}")
    
    data = resp.json()
    log(f"Response: {json.dumps(data, indent=2)}")
    
    checks = [
        (data.get("ok") == True, "ok:true"),
        (data.get("configured") == True, "configured:true"),
        (data.get("serviceAccount") is not None, "serviceAccount set"),
        (data.get("counts", {}).get("books", 0) > 0, "counts.books > 0"),
        (data.get("counts", {}).get("chapters", 0) > 0, "counts.chapters > 0"),
        (data.get("lastSyncReport") is not None, "lastSyncReport present"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("STATUS", all_passed, details)

def test_3_test_connection():
    """Test 3: TEST CONNECTION - POST /api/admin/drive/test returns ok:true, rootName, childFolders, sampleFolders includes 'Class 1'"""
    print("\n" + "="*80)
    print("TEST 3: TEST CONNECTION")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{BASE_URL}/admin/drive/test", json={}, headers=headers)
    
    if resp.status_code != 200:
        return test_result("TEST CONNECTION", False, f"Status code: {resp.status_code}")
    
    data = resp.json()
    log(f"Response: {json.dumps(data, indent=2)}")
    
    checks = [
        (data.get("ok") == True, "ok:true"),
        (data.get("rootName") == "Lesson Guru", "rootName is 'Lesson Guru'"),
        (data.get("childFolders", 0) == 11, "childFolders = 11"),
        ("Class 1" in data.get("sampleFolders", []), "sampleFolders includes 'Class 1'"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("TEST CONNECTION", all_passed, details)

def test_4_idempotent_sync():
    """Test 4: IDEMPOTENT SYNC - POST /api/admin/drive/sync twice; second run should have newBooks:0 and unchanged>0"""
    print("\n" + "="*80)
    print("TEST 4: IDEMPOTENT SYNC")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get initial counts
    status_resp = requests.get(f"{BASE_URL}/admin/drive/status", headers=headers)
    initial_books = status_resp.json().get("counts", {}).get("books", 0)
    initial_chapters = status_resp.json().get("counts", {}).get("chapters", 0)
    log(f"Initial counts: books={initial_books}, chapters={initial_chapters}")
    
    # First sync
    log("\nRunning first sync...")
    resp1 = requests.post(f"{BASE_URL}/admin/drive/sync", json={}, headers=headers)
    if resp1.status_code != 200:
        return test_result("IDEMPOTENT SYNC", False, f"First sync failed: {resp1.status_code}")
    
    data1 = resp1.json()
    log(f"First sync report: {json.dumps(data1.get('report', {}), indent=2)}")
    
    # Second sync
    log("\nRunning second sync...")
    resp2 = requests.post(f"{BASE_URL}/admin/drive/sync", json={}, headers=headers)
    if resp2.status_code != 200:
        return test_result("IDEMPOTENT SYNC", False, f"Second sync failed: {resp2.status_code}")
    
    data2 = resp2.json()
    report2 = data2.get("report", {})
    log(f"Second sync report: {json.dumps(report2, indent=2)}")
    
    # Get final counts
    status_resp = requests.get(f"{BASE_URL}/admin/drive/status", headers=headers)
    final_books = status_resp.json().get("counts", {}).get("books", 0)
    final_chapters = status_resp.json().get("counts", {}).get("chapters", 0)
    log(f"\nFinal counts: books={final_books}, chapters={final_chapters}")
    
    checks = [
        (report2.get("newBooks", -1) == 0, f"Second sync newBooks=0 (got {report2.get('newBooks')})"),
        (report2.get("unchanged", 0) > 0, f"Second sync unchanged>0 (got {report2.get('unchanged')})"),
        (final_books == initial_books, f"Total books unchanged ({initial_books} -> {final_books})"),
        (final_chapters == initial_chapters, f"Total chapters unchanged ({initial_chapters} -> {final_chapters})"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("IDEMPOTENT SYNC", all_passed, details)

def test_5_admin_lists():
    """Test 5: ADMIN LISTS - GET /api/admin/drive/books?classId=... returns gdrive books with chaptersCount>0 and className"""
    print("\n" + "="*80)
    print("TEST 5: ADMIN LISTS")
    print("="*80)
    
    global test_book_id, test_chapter_id, test_chapter_odia_id
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get books for Class 1
    log(f"Getting books for Class 1 (classId={class_1_id})...")
    resp = requests.get(f"{BASE_URL}/admin/drive/books?classId={class_1_id}", headers=headers)
    
    if resp.status_code != 200:
        return test_result("ADMIN LISTS", False, f"GET books failed: {resp.status_code}")
    
    data = resp.json()
    books = data.get("books", [])
    log(f"Found {len(books)} books for Class 1")
    
    if len(books) == 0:
        return test_result("ADMIN LISTS", False, "No books found for Class 1")
    
    # Pick first book
    test_book = books[0]
    test_book_id = test_book.get("id")
    log(f"\nTest book: {test_book.get('name')} (id={test_book_id})")
    log(f"  className: {test_book.get('className')}")
    log(f"  chaptersCount: {test_book.get('chaptersCount')}")
    
    # Find an Odia book for PDF proxy testing
    odia_book = None
    for book in books:
        if "odia" in book.get("subject", "").lower() or "ଓଡ଼ିଆ" in book.get("name", ""):
            odia_book = book
            break
    
    if not odia_book:
        odia_book = books[0]  # fallback to first book
    
    log(f"\nOdia book for PDF testing: {odia_book.get('name')} (id={odia_book.get('id')})")
    
    # Get chapters for the test book
    log(f"\nGetting chapters for book {test_book_id}...")
    resp2 = requests.get(f"{BASE_URL}/admin/drive/chapters?bookId={test_book_id}", headers=headers)
    
    if resp2.status_code != 200:
        return test_result("ADMIN LISTS", False, f"GET chapters failed: {resp2.status_code}")
    
    data2 = resp2.json()
    chapters = data2.get("chapters", [])
    log(f"Found {len(chapters)} chapters")
    
    if len(chapters) == 0:
        return test_result("ADMIN LISTS", False, "No chapters found for test book")
    
    test_chapter = chapters[0]
    test_chapter_id = test_chapter.get("id")
    log(f"\nTest chapter: {test_chapter.get('name')} (id={test_chapter_id})")
    log(f"  driveFileId: {test_chapter.get('driveFileId')}")
    log(f"  published: {test_chapter.get('published')}")
    log(f"  allowDownload: {test_chapter.get('allowDownload')}")
    
    # Get chapters for Odia book
    resp3 = requests.get(f"{BASE_URL}/admin/drive/chapters?bookId={odia_book.get('id')}", headers=headers)
    if resp3.status_code == 200:
        odia_chapters = resp3.json().get("chapters", [])
        if odia_chapters:
            test_chapter_odia_id = odia_chapters[0].get("id")
            log(f"\nOdia chapter for PDF testing: {odia_chapters[0].get('name')} (id={test_chapter_odia_id})")
    
    checks = [
        (len(books) > 0, "Books list not empty"),
        (test_book.get("chaptersCount", 0) > 0, "Book has chaptersCount > 0"),
        (test_book.get("className") is not None, "Book has className"),
        (len(chapters) > 0, "Chapters list not empty"),
        (test_chapter.get("driveFileId") is not None, "Chapter has driveFileId"),
        (test_chapter.get("published") is not None, "Chapter has published field"),
        (test_chapter.get("allowDownload") is not None, "Chapter has allowDownload field"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("ADMIN LISTS", all_passed, details)

def test_6_pdf_proxy():
    """Test 6: PDF PROXY - GET /api/chapters/:id/pdf with no range, with Range header, and download gating"""
    print("\n" + "="*80)
    print("TEST 6: PDF PROXY (PUBLIC ENDPOINT)")
    print("="*80)
    
    if not test_chapter_id:
        return test_result("PDF PROXY", False, "No test chapter ID available")
    
    # Use test_chapter_id (from test_book_id) so allowDownload changes apply
    chapter_id = test_chapter_id
    
    # 6.1: No range - should return 200 with PDF content
    log(f"6.1: Testing PDF proxy without Range header (chapter {chapter_id})...")
    resp1 = requests.get(f"{BASE_URL}/chapters/{chapter_id}/pdf")
    
    check_6_1 = (
        resp1.status_code == 200 and
        resp1.headers.get("Content-Type") == "application/pdf" and
        resp1.content[:4] == b"%PDF"
    )
    log(f"  Status: {resp1.status_code}")
    log(f"  Content-Type: {resp1.headers.get('Content-Type')}")
    log(f"  Starts with %PDF: {resp1.content[:4] == b'%PDF'}")
    log(f"  Content-Length: {resp1.headers.get('Content-Length')}")
    
    # 6.2: Range header - should return 206 Partial Content
    log(f"\n6.2: Testing PDF proxy with Range header (bytes=0-1023)...")
    resp2 = requests.get(f"{BASE_URL}/chapters/{chapter_id}/pdf", headers={"Range": "bytes=0-1023"})
    
    check_6_2 = (
        resp2.status_code == 206 and
        "Content-Range" in resp2.headers and
        resp2.headers.get("Content-Length") == "1024"
    )
    log(f"  Status: {resp2.status_code}")
    log(f"  Content-Range: {resp2.headers.get('Content-Range')}")
    log(f"  Content-Length: {resp2.headers.get('Content-Length')}")
    
    # 6.3: Download gating - with default allowDownload=false, ?download=1 should return 403 for normal user
    log(f"\n6.3: Testing download gating (allowDownload=false, normal user)...")
    headers_normal = {"Authorization": f"Bearer {normal_user_token}"}
    resp3 = requests.get(f"{BASE_URL}/chapters/{chapter_id}/pdf?download=1", headers=headers_normal)
    
    check_6_3 = (resp3.status_code == 403 and resp3.json().get("code") == "DOWNLOAD_DISABLED")
    log(f"  Status: {resp3.status_code}")
    log(f"  Code: {resp3.json().get('code')}")
    
    # 6.4: Enable allowDownload on the book
    log(f"\n6.4: Enabling allowDownload on book {test_book_id}...")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    resp4 = requests.patch(f"{BASE_URL}/admin/drive/books/{test_book_id}", 
                          json={"allowDownload": True}, headers=headers_admin)
    log(f"  PATCH status: {resp4.status_code}")
    
    # 6.5: Now ?download=1 should return 200 with Content-Disposition: attachment
    log(f"\n6.5: Testing download after enabling allowDownload...")
    resp5 = requests.get(f"{BASE_URL}/chapters/{chapter_id}/pdf?download=1", headers=headers_normal)
    
    check_6_5 = (
        resp5.status_code == 200 and
        "attachment" in resp5.headers.get("Content-Disposition", "")
    )
    log(f"  Status: {resp5.status_code}")
    log(f"  Content-Disposition: {resp5.headers.get('Content-Disposition')}")
    
    # 6.6: Reset allowDownload back to false
    log(f"\n6.6: Resetting allowDownload to false...")
    resp6 = requests.patch(f"{BASE_URL}/admin/drive/books/{test_book_id}", 
                          json={"allowDownload": False}, headers=headers_admin)
    log(f"  PATCH status: {resp6.status_code}")
    
    checks = [
        (check_6_1, "6.1: No range returns 200, Content-Type application/pdf, starts with %PDF"),
        (check_6_2, "6.2: Range header returns 206 Partial Content with Content-Range and Content-Length:1024"),
        (check_6_3, "6.3: Download gating: ?download=1 returns 403 DOWNLOAD_DISABLED for normal user when allowDownload=false"),
        (check_6_5, "6.5: After enabling allowDownload, ?download=1 returns 200 with Content-Disposition: attachment"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("PDF PROXY", all_passed, details)

def test_7_publish_hide_enforcement():
    """Test 7: PUBLISH/HIDE ENFORCEMENT - PATCH book to published:false, hidden:true; verify normal user cannot see it"""
    print("\n" + "="*80)
    print("TEST 7: PUBLISH/HIDE ENFORCEMENT")
    print("="*80)
    
    if not test_book_id or not test_chapter_id:
        return test_result("PUBLISH/HIDE ENFORCEMENT", False, "No test book/chapter ID available")
    
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_normal = {"Authorization": f"Bearer {normal_user_token}"}
    
    # 7.1: Hide the book
    log(f"7.1: Hiding book {test_book_id} (published:false, hidden:true)...")
    resp1 = requests.patch(f"{BASE_URL}/admin/drive/books/{test_book_id}", 
                          json={"published": False, "hidden": True}, headers=headers_admin)
    log(f"  PATCH status: {resp1.status_code}")
    
    # 7.2: Normal user GET /api/books?classId=... should NOT include the book
    log(f"\n7.2: Normal user GET /api/books?classId={class_1_id}...")
    resp2 = requests.get(f"{BASE_URL}/books?classId={class_1_id}", headers=headers_normal)
    books = resp2.json().get("books", [])
    book_ids = [b.get("id") for b in books]
    check_7_2 = test_book_id not in book_ids
    log(f"  Books count: {len(books)}")
    log(f"  Test book {test_book_id} in list: {not check_7_2}")
    
    # 7.3: Normal user GET /api/chapters?bookId=... should return empty
    log(f"\n7.3: Normal user GET /api/chapters?bookId={test_book_id}...")
    resp3 = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}", headers=headers_normal)
    chapters = resp3.json().get("chapters", [])
    check_7_3 = len(chapters) == 0
    log(f"  Chapters count: {len(chapters)}")
    
    # 7.4: Normal user GET /api/chapters/:id/pdf should return 404/403
    log(f"\n7.4: Normal user GET /api/chapters/{test_chapter_id}/pdf...")
    resp4 = requests.get(f"{BASE_URL}/chapters/{test_chapter_id}/pdf", headers=headers_normal)
    check_7_4 = resp4.status_code in [403, 404]
    log(f"  Status: {resp4.status_code}")
    
    # 7.5: Restore the book
    log(f"\n7.5: Restoring book {test_book_id} (published:true, hidden:false)...")
    resp5 = requests.patch(f"{BASE_URL}/admin/drive/books/{test_book_id}", 
                          json={"published": True, "hidden": False}, headers=headers_admin)
    log(f"  PATCH status: {resp5.status_code}")
    
    # 7.6: Normal user should now see the book
    log(f"\n7.6: Normal user GET /api/books?classId={class_1_id} (after restore)...")
    resp6 = requests.get(f"{BASE_URL}/books?classId={class_1_id}", headers=headers_normal)
    books = resp6.json().get("books", [])
    book_ids = [b.get("id") for b in books]
    check_7_6 = test_book_id in book_ids
    log(f"  Books count: {len(books)}")
    log(f"  Test book {test_book_id} in list: {check_7_6}")
    
    checks = [
        (check_7_2, "7.2: Hidden book NOT in normal user's /books list"),
        (check_7_3, "7.3: Hidden book's /chapters returns empty for normal user"),
        (check_7_4, "7.4: Hidden book's chapter /pdf returns 404/403 for normal user"),
        (check_7_6, "7.6: After restore, book reappears in normal user's /books list"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("PUBLISH/HIDE ENFORCEMENT", all_passed, details)

def test_8_chapter_toggle():
    """Test 8: CHAPTER TOGGLE - PATCH chapter to published:false; verify normal user cannot see it"""
    print("\n" + "="*80)
    print("TEST 8: CHAPTER TOGGLE")
    print("="*80)
    
    if not test_book_id or not test_chapter_id:
        return test_result("CHAPTER TOGGLE", False, "No test book/chapter ID available")
    
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_normal = {"Authorization": f"Bearer {normal_user_token}"}
    
    # 8.1: Unpublish the chapter
    log(f"8.1: Unpublishing chapter {test_chapter_id} (published:false)...")
    resp1 = requests.patch(f"{BASE_URL}/admin/drive/chapters/{test_chapter_id}", 
                          json={"published": False}, headers=headers_admin)
    log(f"  PATCH status: {resp1.status_code}")
    
    # 8.2: Normal user GET /api/chapters?bookId=... should NOT include the chapter
    log(f"\n8.2: Normal user GET /api/chapters?bookId={test_book_id}...")
    resp2 = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}", headers=headers_normal)
    chapters = resp2.json().get("chapters", [])
    chapter_ids = [c.get("id") for c in chapters]
    check_8_2 = test_chapter_id not in chapter_ids
    log(f"  Chapters count: {len(chapters)}")
    log(f"  Test chapter {test_chapter_id} in list: {not check_8_2}")
    
    # 8.3: Normal user GET /api/chapters/:id/pdf should return 404
    log(f"\n8.3: Normal user GET /api/chapters/{test_chapter_id}/pdf...")
    resp3 = requests.get(f"{BASE_URL}/chapters/{test_chapter_id}/pdf", headers=headers_normal)
    check_8_3 = resp3.status_code == 404
    log(f"  Status: {resp3.status_code}")
    
    # 8.4: Restore the chapter
    log(f"\n8.4: Restoring chapter {test_chapter_id} (published:true)...")
    resp4 = requests.patch(f"{BASE_URL}/admin/drive/chapters/{test_chapter_id}", 
                          json={"published": True}, headers=headers_admin)
    log(f"  PATCH status: {resp4.status_code}")
    
    # 8.5: Normal user should now see the chapter
    log(f"\n8.5: Normal user GET /api/chapters?bookId={test_book_id} (after restore)...")
    resp5 = requests.get(f"{BASE_URL}/chapters?bookId={test_book_id}", headers=headers_normal)
    chapters = resp5.json().get("chapters", [])
    chapter_ids = [c.get("id") for c in chapters]
    check_8_5 = test_chapter_id in chapter_ids
    log(f"  Chapters count: {len(chapters)}")
    log(f"  Test chapter {test_chapter_id} in list: {check_8_5}")
    
    checks = [
        (check_8_2, "8.2: Unpublished chapter NOT in normal user's /chapters list"),
        (check_8_3, "8.3: Unpublished chapter /pdf returns 404 for normal user"),
        (check_8_5, "8.5: After restore, chapter reappears in normal user's /chapters list"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("CHAPTER TOGGLE", all_passed, details)

def test_9_reorder():
    """Test 9: REORDER - POST /api/admin/drive/books/:id/move {dir:'down'} then {dir:'up'}"""
    print("\n" + "="*80)
    print("TEST 9: REORDER")
    print("="*80)
    
    if not test_book_id:
        return test_result("REORDER", False, "No test book ID available")
    
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    
    # Get initial order
    log(f"Getting initial book order for Class 1...")
    resp0 = requests.get(f"{BASE_URL}/admin/drive/books?classId={class_1_id}", headers=headers_admin)
    books_before = resp0.json().get("books", [])
    orders_before = [(b.get("id"), b.get("order"), b.get("name")) for b in books_before]
    log(f"  Books before: {len(books_before)}")
    for book_id, order, name in orders_before[:5]:
        log(f"    {order}: {name} ({book_id})")
    
    # 9.1: Move down
    log(f"\n9.1: Moving book {test_book_id} down...")
    resp1 = requests.post(f"{BASE_URL}/admin/drive/books/{test_book_id}/move", 
                         json={"dir": "down"}, headers=headers_admin)
    check_9_1 = resp1.status_code == 200 and resp1.json().get("ok") == True
    log(f"  POST status: {resp1.status_code}")
    log(f"  Response: {resp1.json()}")
    
    # Get order after move down
    resp2 = requests.get(f"{BASE_URL}/admin/drive/books?classId={class_1_id}", headers=headers_admin)
    books_after_down = resp2.json().get("books", [])
    orders_after_down = [(b.get("id"), b.get("order"), b.get("name")) for b in books_after_down]
    log(f"  Books after move down:")
    for book_id, order, name in orders_after_down[:5]:
        log(f"    {order}: {name} ({book_id})")
    
    # 9.2: Move up
    log(f"\n9.2: Moving book {test_book_id} up...")
    resp3 = requests.post(f"{BASE_URL}/admin/drive/books/{test_book_id}/move", 
                         json={"dir": "up"}, headers=headers_admin)
    check_9_2 = resp3.status_code == 200 and resp3.json().get("ok") == True
    log(f"  POST status: {resp3.status_code}")
    log(f"  Response: {resp3.json()}")
    
    # Get order after move up
    resp4 = requests.get(f"{BASE_URL}/admin/drive/books?classId={class_1_id}", headers=headers_admin)
    books_after_up = resp4.json().get("books", [])
    orders_after_up = [(b.get("id"), b.get("order"), b.get("name")) for b in books_after_up]
    log(f"  Books after move up:")
    for book_id, order, name in orders_after_up[:5]:
        log(f"    {order}: {name} ({book_id})")
    
    checks = [
        (check_9_1, "9.1: Move down returns ok:true"),
        (check_9_2, "9.2: Move up returns ok:true"),
        (len(books_before) == len(books_after_up), "Book count unchanged after moves"),
    ]
    
    all_passed = all(check[0] for check in checks)
    details = "\n".join([f"  {'✅' if check[0] else '❌'} {check[1]}" for check in checks])
    
    return test_result("REORDER", all_passed, details)

def main():
    print("\n" + "="*80)
    print("GOOGLE DRIVE BOOKS LIBRARY INTEGRATION - BACKEND TESTING")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print("="*80)
    
    results = []
    
    try:
        # Setup
        print("\n" + "="*80)
        print("SETUP")
        print("="*80)
        login_admin()
        register_normal_user()
        
        # Run tests
        results.append(test_1_auth_guards())
        results.append(test_2_status())
        results.append(test_3_test_connection())
        results.append(test_4_idempotent_sync())
        results.append(test_5_admin_lists())
        results.append(test_6_pdf_proxy())
        results.append(test_7_publish_hide_enforcement())
        results.append(test_8_chapter_toggle())
        results.append(test_9_reorder())
        
        # Summary
        print("\n" + "="*80)
        print("SUMMARY")
        print("="*80)
        passed = sum(results)
        total = len(results)
        print(f"\nPassed: {passed}/{total}")
        print(f"Success rate: {passed/total*100:.1f}%")
        
        if passed == total:
            print("\n✅ ALL TESTS PASSED - Google Drive Books Library integration is working correctly!")
            sys.exit(0)
        else:
            print(f"\n❌ {total - passed} TEST(S) FAILED")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
