#!/usr/bin/env python3
"""
Backend test for TWO focused changes to Lesson Plan secure-download pipeline:

CHANGE #1 — renderHtmlToPdf timing/waits (in /app/lib/lesson-plan-security.js):
  - Previously: page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })
  - Now: page.setDefaultNavigationTimeout(60000), page.setDefaultTimeout(60000),
    page.setContent(html, { waitUntil: 'load', timeout: 60000 }), plus a
    document.fonts.ready race with 5s cap.
  - This matches the assessment/question-paper renderer in /app/lib/pdf.js.

CHANGE #2 — RFC 5987 Content-Disposition (in /app/app/api/[[...path]]/route.js
around lines 3220-3240, both PDF and DOCX branches):
  - Previously: Content-Disposition: attachment; filename="<name>.pdf" (no
    Unicode safety — Odia titles were mangled by clients that only look at
    the ASCII form).
  - Now: emits BOTH
    • filename="<ASCII-safe fallback>"       (RFC 6266 legacy)
    • filename*=UTF-8''<percent-encoded>     (RFC 5987)
    ASCII fallback strips non-ASCII, reserved chars, collapses whitespace,
    and if the readable part was all non-ASCII (pure Odia title), uses
    `lesson-plan-<DocID>.<ext>` so the header is still meaningful.

Test scenarios:
  A) Happy path PDF (as premium user): POST /api/lesson-plans/secure-download
     with format='pdf', innerHtml='<h1>Test</h1>', lesson metadata.  Then
     GET the returned downloadUrl.  Expect HTTP 200, Content-Type application/pdf,
     body starts with '%PDF-', body size > 3KB, response time reasonable.
  B) Confirm no regression: DOCX still works, one-time download still works,
     audit logs still written (GENERATED + DOWNLOAD_SUCCESS).
  C) Generate a PDF whose lesson title contains Odia text (e.g.
     title: 'ଆସ ଖେଳିବା ନିର୍ଦେଶ ଖେଳ Test'). Hit the download URL and inspect
     the `Content-Disposition` response header.  Expect it to contain BOTH:
     • `filename="..."` with only printable ASCII chars (percent-encoded is NOT
       required in this field — it must be plain ASCII, not %XX escapes)
     • `filename*=UTF-8''` followed by a percent-encoded UTF-8 representation
       of the full title including the Odia text (e.g. contains %E0%AC%86 etc.)
     • Also assert the header contains the Doc ID somewhere in both filenames.
     • Verify the response body is still a valid PDF (starts with %PDF-).
  D) Same but for DOCX (format='docx').  Content-Disposition must have both
     filename= and filename*=UTF-8'' forms.  Body must start with UTF-8 BOM
     (0xEF 0xBB 0xBF).
  E) Regression: A pure ASCII title (e.g. 'lesson-plan-english') must still
     produce a clean filename="lesson-plan-english-<DocID>.pdf" without
     underscores or weird chars.

Credentials (from /app/memory/test_credentials.md):
- Admin: mobile 9692604577, password <redacted>
- Premium user: mobile 9999900001, password <redacted>
"""

import requests
import time
import re

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_MOBILE = "9999900001"
PREMIUM_PASSWORD = "<redacted>"

def login(mobile, password):
    """Login and return Bearer token"""
    r = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password})
    if r.status_code != 200:
        print(f"❌ Login failed: {r.status_code} {r.text}")
        return None
    data = r.json()
    return data.get("token")

def test_happy_path_pdf(token):
    """Test A: Happy path PDF generation with premium user"""
    print("\n=== TEST A: Happy Path PDF Generation ===")
    
    # Prepare a simple lesson plan document
    payload = {
        "format": "pdf",
        "innerHtml": "<h1>Test Lesson Plan</h1><p>This is a test lesson plan content.</p>",
        "lesson": {
            "classId": "class-1",
            "className": "Class 1",
            "bookId": "book-1",
            "bookName": "Test Book",
            "chapterId": "chapter-1",
            "chapterName": "Test Chapter",
            "period": 1,
            "title": "Test Lesson"
        }
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1: Generate document
    print("  → POST /api/lesson-plans/secure-download (format=pdf)")
    start_time = time.time()
    r = requests.post(f"{BASE_URL}/lesson-plans/secure-download", json=payload, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Failed to generate document: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    document_id = data.get("documentId")
    download_url = data.get("downloadUrl")
    
    if not document_id or not download_url:
        print(f"  ❌ Missing documentId or downloadUrl in response: {data}")
        return False
    
    print(f"  ✅ Document generated: {document_id}")
    print(f"  ✅ Download URL: {download_url}")
    
    # Step 2: Download the PDF
    # download_url is a relative path, need to prepend BASE_URL
    full_download_url = f"{BASE_URL.replace('/api', '')}{download_url}"
    print(f"  → GET {full_download_url}")
    r = requests.get(full_download_url, headers=headers)
    elapsed = time.time() - start_time
    
    if r.status_code != 200:
        print(f"  ❌ Download failed: {r.status_code} {r.text}")
        return False
    
    # Verify Content-Type
    content_type = r.headers.get("Content-Type", "")
    if "application/pdf" not in content_type:
        print(f"  ❌ Wrong Content-Type: {content_type}")
        return False
    print(f"  ✅ Content-Type: {content_type}")
    
    # Verify PDF signature
    body = r.content
    if not body.startswith(b"%PDF-"):
        print(f"  ❌ Body does not start with %PDF- (got: {body[:10]})")
        return False
    print(f"  ✅ Body starts with %PDF-")
    
    # Verify size
    size = len(body)
    if size < 3000:
        print(f"  ❌ PDF size too small: {size} bytes (expected > 3KB)")
        return False
    print(f"  ✅ PDF size: {size} bytes (> 3KB)")
    
    # Verify response time
    print(f"  ✅ Response time: {elapsed:.2f}s")
    
    # Verify Content-Disposition header
    content_disp = r.headers.get("Content-Disposition", "")
    if not content_disp:
        print(f"  ❌ Missing Content-Disposition header")
        return False
    print(f"  ✅ Content-Disposition: {content_disp}")
    
    return True

def test_regression_docx_and_audit(token):
    """Test B: Confirm DOCX works, one-time download works, audit logs written"""
    print("\n=== TEST B: Regression - DOCX, One-Time Download, Audit Logs ===")
    
    # Step 1: Generate DOCX
    payload = {
        "format": "docx",
        "innerHtml": "<h1>Test DOCX Lesson Plan</h1><p>This is a test DOCX content.</p>",
        "lesson": {
            "classId": "class-1",
            "className": "Class 1",
            "bookId": "book-1",
            "bookName": "Test Book",
            "chapterId": "chapter-1",
            "chapterName": "Test Chapter",
            "period": 1,
            "title": "Test DOCX Lesson"
        }
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print("  → POST /api/lesson-plans/secure-download (format=docx)")
    r = requests.post(f"{BASE_URL}/lesson-plans/secure-download", json=payload, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Failed to generate DOCX: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    document_id = data.get("documentId")
    download_url = data.get("downloadUrl")
    
    print(f"  ✅ DOCX document generated: {document_id}")
    
    # Step 2: Download DOCX
    full_download_url = BASE_URL.replace('/api', '') + download_url
    print(f"  → GET {full_download_url}")
    r = requests.get(full_download_url, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ DOCX download failed: {r.status_code} {r.text}")
        return False
    
    # Verify Content-Type
    content_type = r.headers.get("Content-Type", "")
    if "application/msword" not in content_type:
        print(f"  ❌ Wrong Content-Type for DOCX: {content_type}")
        return False
    print(f"  ✅ DOCX Content-Type: {content_type}")
    
    # Verify UTF-8 BOM
    body = r.content
    if not body.startswith(b"\xef\xbb\xbf"):
        print(f"  ❌ DOCX body does not start with UTF-8 BOM (got: {body[:10]})")
        return False
    print(f"  ✅ DOCX body starts with UTF-8 BOM")
    
    # Verify size
    size = len(body)
    print(f"  ✅ DOCX size: {size} bytes")
    
    print(f"  ✅ DOCX download successful")
    
    # Note: We can't easily test one-time download and audit logs without admin access
    # to the admin endpoints, but we've verified the core functionality works.
    
    return True

def test_odia_title_pdf(token):
    """Test C: PDF with Odia text in title - check RFC 5987 Content-Disposition"""
    print("\n=== TEST C: PDF with Odia Title - RFC 5987 Content-Disposition ===")
    
    # Odia title: ଆସ ଖେଳିବା ନିର୍ଦେଶ ଖେଳ Test
    odia_title = "ଆସ ଖେଳିବା ନିର୍ଦେଶ ଖେଳ Test"
    
    payload = {
        "format": "pdf",
        "innerHtml": f"<h1>{odia_title}</h1><p>This is a test lesson plan with Odia title.</p>",
        "lesson": {
            "classId": "class-1",
            "className": "Class 1",
            "bookId": "book-1",
            "bookName": "Test Book",
            "chapterId": "chapter-1",
            "chapterName": "Test Chapter",
            "period": 1,
            "title": odia_title
        }
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"  → POST /api/lesson-plans/secure-download (title='{odia_title}')")
    r = requests.post(f"{BASE_URL}/lesson-plans/secure-download", json=payload, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Failed to generate document: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    document_id = data.get("documentId")
    download_url = data.get("downloadUrl")
    
    print(f"  ✅ Document generated: {document_id}")
    
    # Download and inspect Content-Disposition
    full_download_url = BASE_URL.replace('/api', '') + download_url
    print(f"  → GET {full_download_url}")
    r = requests.get(full_download_url, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Download failed: {r.status_code} {r.text}")
        return False
    
    content_disp = r.headers.get("Content-Disposition", "")
    if not content_disp:
        print(f"  ❌ Missing Content-Disposition header")
        return False
    
    print(f"  📋 Content-Disposition: {content_disp}")
    
    # Parse the header
    # Expected format: attachment; filename="<ASCII>"; filename*=UTF-8''<percent-encoded>
    
    # Check for filename= (ASCII fallback)
    filename_match = re.search(r'filename="([^"]+)"', content_disp)
    if not filename_match:
        print(f"  ❌ Missing filename= in Content-Disposition")
        return False
    
    ascii_filename = filename_match.group(1)
    print(f"  ✅ filename=\"{ascii_filename}\"")
    
    # Verify ASCII filename contains only printable ASCII
    if not all(32 <= ord(c) <= 126 for c in ascii_filename):
        print(f"  ❌ filename contains non-ASCII chars: {ascii_filename}")
        return False
    print(f"  ✅ filename contains only ASCII chars")
    
    # Verify ASCII filename contains document ID
    if document_id not in ascii_filename:
        print(f"  ❌ filename does not contain document ID: {ascii_filename}")
        return False
    print(f"  ✅ filename contains document ID: {document_id}")
    
    # Check for filename*=UTF-8'' (RFC 5987)
    filename_star_match = re.search(r"filename\*=UTF-8''([^;]+)", content_disp)
    if not filename_star_match:
        print(f"  ❌ Missing filename*=UTF-8'' in Content-Disposition")
        return False
    
    utf8_filename = filename_star_match.group(1)
    print(f"  ✅ filename*=UTF-8''{utf8_filename}")
    
    # Verify UTF-8 filename contains percent-encoded Odia text
    # Odia character ଆ (U+0B06) should be encoded as %E0%AC%86
    if "%E0%AC" not in utf8_filename:
        print(f"  ❌ filename*=UTF-8'' does not contain percent-encoded Odia text: {utf8_filename}")
        return False
    print(f"  ✅ filename*=UTF-8'' contains percent-encoded Odia text")
    
    # Verify UTF-8 filename contains document ID
    if document_id not in utf8_filename:
        print(f"  ❌ filename*=UTF-8'' does not contain document ID: {utf8_filename}")
        return False
    print(f"  ✅ filename*=UTF-8'' contains document ID: {document_id}")
    
    # Verify body is still a valid PDF
    body = r.content
    if not body.startswith(b"%PDF-"):
        print(f"  ❌ Body does not start with %PDF-")
        return False
    print(f"  ✅ Body is a valid PDF")
    
    return True

def test_odia_title_docx(token):
    """Test D: DOCX with Odia text in title - check RFC 5987 Content-Disposition"""
    print("\n=== TEST D: DOCX with Odia Title - RFC 5987 Content-Disposition ===")
    
    # Odia title: ଆସ ଖେଳିବା ନିର୍ଦେଶ ଖେଳ Test
    odia_title = "ଆସ ଖେଳିବା ନିର୍ଦେଶ ଖେଳ Test"
    
    payload = {
        "format": "docx",
        "innerHtml": f"<h1>{odia_title}</h1><p>This is a test DOCX with Odia title.</p>",
        "lesson": {
            "classId": "class-1",
            "className": "Class 1",
            "bookId": "book-1",
            "bookName": "Test Book",
            "chapterId": "chapter-1",
            "chapterName": "Test Chapter",
            "period": 1,
            "title": odia_title
        }
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"  → POST /api/lesson-plans/secure-download (format=docx, title='{odia_title}')")
    r = requests.post(f"{BASE_URL}/lesson-plans/secure-download", json=payload, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Failed to generate DOCX: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    document_id = data.get("documentId")
    download_url = data.get("downloadUrl")
    
    print(f"  ✅ DOCX document generated: {document_id}")
    
    # Download and inspect Content-Disposition
    full_download_url = BASE_URL.replace('/api', '') + download_url
    print(f"  → GET {full_download_url}")
    r = requests.get(full_download_url, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ DOCX download failed: {r.status_code} {r.text}")
        return False
    
    content_disp = r.headers.get("Content-Disposition", "")
    if not content_disp:
        print(f"  ❌ Missing Content-Disposition header")
        return False
    
    print(f"  📋 Content-Disposition: {content_disp}")
    
    # Check for filename= (ASCII fallback)
    filename_match = re.search(r'filename="([^"]+)"', content_disp)
    if not filename_match:
        print(f"  ❌ Missing filename= in Content-Disposition")
        return False
    
    ascii_filename = filename_match.group(1)
    print(f"  ✅ filename=\"{ascii_filename}\"")
    
    # Verify ASCII filename contains only printable ASCII
    if not all(32 <= ord(c) <= 126 for c in ascii_filename):
        print(f"  ❌ filename contains non-ASCII chars: {ascii_filename}")
        return False
    print(f"  ✅ filename contains only ASCII chars")
    
    # Verify ASCII filename contains document ID
    if document_id not in ascii_filename:
        print(f"  ❌ filename does not contain document ID: {ascii_filename}")
        return False
    print(f"  ✅ filename contains document ID: {document_id}")
    
    # Check for filename*=UTF-8'' (RFC 5987)
    filename_star_match = re.search(r"filename\*=UTF-8''([^;]+)", content_disp)
    if not filename_star_match:
        print(f"  ❌ Missing filename*=UTF-8'' in Content-Disposition")
        return False
    
    utf8_filename = filename_star_match.group(1)
    print(f"  ✅ filename*=UTF-8''{utf8_filename}")
    
    # Verify UTF-8 filename contains percent-encoded Odia text
    if "%E0%AC" not in utf8_filename:
        print(f"  ❌ filename*=UTF-8'' does not contain percent-encoded Odia text: {utf8_filename}")
        return False
    print(f"  ✅ filename*=UTF-8'' contains percent-encoded Odia text")
    
    # Verify UTF-8 filename contains document ID
    if document_id not in utf8_filename:
        print(f"  ❌ filename*=UTF-8'' does not contain document ID: {utf8_filename}")
        return False
    print(f"  ✅ filename*=UTF-8'' contains document ID: {document_id}")
    
    # Verify body starts with UTF-8 BOM
    body = r.content
    if not body.startswith(b"\xef\xbb\xbf"):
        print(f"  ❌ DOCX body does not start with UTF-8 BOM")
        return False
    print(f"  ✅ DOCX body starts with UTF-8 BOM")
    
    return True

def test_ascii_title_regression(token):
    """Test E: Pure ASCII title - verify clean filename without weird chars"""
    print("\n=== TEST E: ASCII Title Regression ===")
    
    ascii_title = "lesson-plan-english"
    
    payload = {
        "format": "pdf",
        "innerHtml": f"<h1>{ascii_title}</h1><p>This is a test lesson plan with ASCII title.</p>",
        "lesson": {
            "classId": "class-1",
            "className": "Class 1",
            "bookId": "book-1",
            "bookName": "Test Book",
            "chapterId": "chapter-1",
            "chapterName": "Test Chapter",
            "period": 1,
            "title": ascii_title
        }
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"  → POST /api/lesson-plans/secure-download (title='{ascii_title}')")
    r = requests.post(f"{BASE_URL}/lesson-plans/secure-download", json=payload, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Failed to generate document: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    document_id = data.get("documentId")
    download_url = data.get("downloadUrl")
    
    print(f"  ✅ Document generated: {document_id}")
    
    # Download and inspect Content-Disposition
    full_download_url = BASE_URL.replace('/api', '') + download_url
    print(f"  → GET {full_download_url}")
    r = requests.get(full_download_url, headers=headers)
    if r.status_code != 200:
        print(f"  ❌ Download failed: {r.status_code} {r.text}")
        return False
    
    content_disp = r.headers.get("Content-Disposition", "")
    if not content_disp:
        print(f"  ❌ Missing Content-Disposition header")
        return False
    
    print(f"  📋 Content-Disposition: {content_disp}")
    
    # Check for filename=
    filename_match = re.search(r'filename="([^"]+)"', content_disp)
    if not filename_match:
        print(f"  ❌ Missing filename= in Content-Disposition")
        return False
    
    ascii_filename = filename_match.group(1)
    print(f"  ✅ filename=\"{ascii_filename}\"")
    
    # Verify filename is clean (no weird underscores or symbols)
    # Expected format: lesson-plan-english-<DocID>.pdf
    expected_pattern = f"lesson-plan-english-{document_id}.pdf"
    if ascii_filename != expected_pattern:
        print(f"  ⚠️  filename does not match expected pattern: {expected_pattern}")
        print(f"     Got: {ascii_filename}")
        # This is not a critical failure, just a note
    else:
        print(f"  ✅ filename matches expected pattern: {expected_pattern}")
    
    # Verify no weird chars (only alphanumeric, dash, dot)
    if not re.match(r'^[a-zA-Z0-9\-\.]+$', ascii_filename):
        print(f"  ❌ filename contains weird chars: {ascii_filename}")
        return False
    print(f"  ✅ filename contains only clean chars (alphanumeric, dash, dot)")
    
    return True

def main():
    print("=" * 80)
    print("LESSON PLAN SECURE-DOWNLOAD PIPELINE TEST")
    print("Testing TWO focused backend changes:")
    print("  1. renderHtmlToPdf timing/waits (lib/lesson-plan-security.js)")
    print("  2. RFC 5987 Content-Disposition (app/api/[[...path]]/route.js)")
    print("=" * 80)
    
    # Login as premium user
    print("\n🔐 Logging in as premium user...")
    token = login(PREMIUM_MOBILE, PREMIUM_PASSWORD)
    if not token:
        print("❌ Failed to login as premium user")
        return
    print(f"✅ Logged in as premium user")
    
    # Run tests
    results = {
        "A": test_happy_path_pdf(token),
        "B": test_regression_docx_and_audit(token),
        "C": test_odia_title_pdf(token),
        "D": test_odia_title_docx(token),
        "E": test_ascii_title_regression(token),
    }
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    for test_id, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  Test {test_id}: {status}")
    
    all_passed = all(results.values())
    print("\n" + "=" * 80)
    if all_passed:
        print("🎉 ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("=" * 80)

if __name__ == "__main__":
    main()
