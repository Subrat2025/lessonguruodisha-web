#!/usr/bin/env python3
"""
Backend Test: Lesson Plan Document Security Layer
==================================================
Tests the newly-added lesson plan document security endpoints.

SCOPE: ONLY lesson_plan document security. Assessments, question papers,
worksheets, etc. must remain UNCHANGED.

Test scenarios:
1. Config endpoints (GET public, GET auth, PUT admin)
2. Prepare + Download PDF (with encryption verification)
3. Prepare + Download DOCX
4. Enforcement checks (format mismatch, ownership, disabled formats)
5. One-time download
6. Revocation
7. Admin log/list
8. Regression checks (existing routes untouched)
"""

import requests
import subprocess
import os
import tempfile
import time

# Base URL from review request
BASE_URL = "http://localhost:3000"
API_BASE = f"{BASE_URL}/api"

# Credentials from /app/memory/test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_USER_MOBILE = "9999900001"
PREMIUM_USER_PASSWORD = "<redacted>"

admin_token = None
premium_token = None

def login(mobile, password):
    """Login and return JWT token"""
    resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
    if resp.status_code != 200:
        print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    return data.get("token")

def test_1_config_public():
    """Test 1: GET /api/document-security/lesson-plan/config (no auth)"""
    print("\n=== Test 1: GET /api/document-security/lesson-plan/config (no auth) ===")
    try:
        resp = requests.get(f"{API_BASE}/document-security/lesson-plan/config", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "config" in data, "Missing 'config' in response"
        assert "defaults" in data, "Missing 'defaults' in response"
        
        # Check defaults
        defaults = data["defaults"]
        assert defaults["allowPdf"] == True, "allowPdf should default to True"
        assert defaults["allowWord"] == True, "allowWord should default to True"
        assert defaults["allowPrint"] == True, "allowPrint should default to True"
        assert defaults["brandWatermark"] == True, "brandWatermark should default to True"
        assert defaults["userWatermark"] == True, "userWatermark should default to True"
        assert defaults["pdfPassword"] == True, "pdfPassword should default to True"
        assert defaults["wordProtect"] == True, "wordProtect should default to True"
        assert defaults["oneTimeDownload"] == False, "oneTimeDownload should default to False"
        assert defaults["expiry"] == "off", "expiry should default to 'off'"
        
        print("✅ Test 1 PASSED: Config endpoint returns correct defaults")
        return True
    except Exception as e:
        print(f"❌ Test 1 FAILED: {e}")
        return False

def test_2_permissions_auth():
    """Test 2: GET /api/document-security/lesson-plan/permissions (auth)"""
    print("\n=== Test 2: GET /api/document-security/lesson-plan/permissions (auth) ===")
    try:
        resp = requests.get(
            f"{API_BASE}/document-security/lesson-plan/permissions",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "permissions" in data, "Missing 'permissions' in response"
        
        perms = data["permissions"]
        assert perms["allowPdf"] == True, "allowPdf should be True"
        assert perms["allowWord"] == True, "allowWord should be True"
        assert perms["oneTimeDownload"] == False, "oneTimeDownload should be False"
        assert perms["expiry"] == "off", "expiry should be 'off'"
        
        print("✅ Test 2 PASSED: Permissions endpoint returns correct global config")
        return True
    except Exception as e:
        print(f"❌ Test 2 FAILED: {e}")
        return False

def test_3_admin_update_config():
    """Test 3: PUT /api/admin/document-security/lesson-plan/config (admin)"""
    print("\n=== Test 3: PUT /api/admin/document-security/lesson-plan/config (admin) ===")
    try:
        # Turn off allowPdf
        resp = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"allowPdf": False}},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "config" in data, "Missing 'config' in response"
        assert data["config"]["allowPdf"] == False, "allowPdf should be False after update"
        
        # Verify via public config endpoint
        resp2 = requests.get(f"{API_BASE}/document-security/lesson-plan/config", timeout=30)
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
        data2 = resp2.json()
        assert data2["config"]["allowPdf"] == False, "allowPdf should be False in public config"
        
        # Restore to True
        resp3 = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"allowPdf": True}},
            timeout=30
        )
        assert resp3.status_code == 200, f"Expected 200, got {resp3.status_code}"
        
        print("✅ Test 3 PASSED: Admin can update config and it reflects in public endpoint")
        return True
    except Exception as e:
        print(f"❌ Test 3 FAILED: {e}")
        return False

def test_5_prepare_download_pdf():
    """Test 5: POST /api/lesson-plans/secure-download (PDF) + download"""
    print("\n=== Test 5: POST /api/lesson-plans/secure-download (PDF) + download ===")
    try:
        # Prepare PDF
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            headers={"Authorization": f"Bearer {premium_token}"},
            json={
                "format": "pdf",
                "innerHtml": "<h2>Test Lesson Plan</h2><p>This is a test lesson content for PDF generation.</p>",
                "lesson": {
                    "title": "Test Lesson",
                    "period": 1,
                    "className": "Class 1",
                    "bookName": "Test Book",
                    "chapterName": "Test Chapter"
                }
            },
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify response structure
        assert "documentId" in data, "Missing 'documentId' in response"
        assert "token" in data, "Missing 'token' in response"
        assert "downloadUrl" in data, "Missing 'downloadUrl' in response"
        assert "format" in data, "Missing 'format' in response"
        assert data["format"] == "pdf", f"Expected format 'pdf', got {data['format']}"
        
        # Verify documentId pattern: LG-LP-YYYYMMDD-XXXXXX
        doc_id = data["documentId"]
        import re
        assert re.match(r"^LG-LP-\d{8}-[A-Z0-9]{6}$", doc_id), f"Invalid documentId pattern: {doc_id}"
        
        assert "watermarkOn" in data, "Missing 'watermarkOn' in response"
        assert data["watermarkOn"] == True, "watermarkOn should be True"
        assert "pdfPassword" in data, "Missing 'pdfPassword' in response"
        assert data["pdfPassword"] == True, "pdfPassword should be True"
        
        print(f"✅ Document prepared: {doc_id}")
        
        # Download the PDF
        download_url = data["downloadUrl"]
        resp2 = requests.get(
            f"{BASE_URL}{download_url}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}: {resp2.text}"
        assert resp2.headers["Content-Type"] == "application/pdf", f"Expected application/pdf, got {resp2.headers['Content-Type']}"
        
        pdf_content = resp2.content
        assert len(pdf_content) > 5000, f"PDF too small: {len(pdf_content)} bytes"
        assert pdf_content.startswith(b"%PDF-"), "PDF should start with %PDF-"
        
        print(f"✅ PDF downloaded: {len(pdf_content)} bytes")
        
        # Save PDF and check encryption with qpdf
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_content)
            pdf_path = f.name
        
        try:
            result = subprocess.run(
                ["qpdf", "--show-encryption", pdf_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            output = result.stdout + result.stderr
            print(f"qpdf output: {output}")
            
            # Check for 256-bit AES encryption (R = 6)
            assert "R = 6" in output, f"Expected R = 6 (256-bit AES), got: {output}"
            print("✅ PDF is encrypted with 256-bit AES (R = 6)")
            
        finally:
            os.unlink(pdf_path)
        
        print("✅ Test 5 PASSED: PDF preparation and download with encryption working")
        return True, doc_id
    except Exception as e:
        print(f"❌ Test 5 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_7_prepare_download_docx():
    """Test 7: POST /api/lesson-plans/secure-download (DOCX) + download"""
    print("\n=== Test 7: POST /api/lesson-plans/secure-download (DOCX) + download ===")
    try:
        # Prepare DOCX
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            headers={"Authorization": f"Bearer {premium_token}"},
            json={
                "format": "docx",
                "innerHtml": "<h2>Test Lesson Plan DOCX</h2><p>This is a test lesson content for DOCX generation.</p>",
                "lesson": {
                    "title": "Test Lesson DOCX",
                    "period": 2,
                    "className": "Class 2",
                    "bookName": "Test Book",
                    "chapterName": "Test Chapter"
                }
            },
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert data["format"] == "docx", f"Expected format 'docx', got {data['format']}"
        doc_id = data["documentId"]
        
        # Download the DOCX
        download_url = data["downloadUrl"]
        resp2 = requests.get(
            f"{BASE_URL}{download_url}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}: {resp2.text}"
        
        # Check Content-Type (should be application/msword)
        content_type = resp2.headers.get("Content-Type", "")
        assert "application/msword" in content_type, f"Expected application/msword, got {content_type}"
        
        docx_content = resp2.content
        assert len(docx_content) > 1000, f"DOCX too small: {len(docx_content)} bytes"
        
        # Check for UTF-8 BOM + DOCTYPE html (Word MHTML format)
        assert docx_content.startswith(b'\xef\xbb\xbf'), "DOCX should start with UTF-8 BOM"
        content_str = docx_content.decode('utf-8')
        assert "<!DOCTYPE html>" in content_str or "<!DOCTYPE HTML>" in content_str.upper(), "DOCX should contain DOCTYPE html"
        assert 'xmlns:o="urn:schemas-microsoft-com:office:office"' in content_str, "DOCX should contain Office namespace"
        
        print(f"✅ DOCX downloaded: {len(docx_content)} bytes")
        print("✅ Test 7 PASSED: DOCX preparation and download working")
        return True, doc_id
    except Exception as e:
        print(f"❌ Test 7 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_8_format_mismatch(pdf_doc_id):
    """Test 8: Prepare PDF, try download as DOCX (format mismatch)"""
    print("\n=== Test 8: Format mismatch (prepare PDF, download as DOCX) ===")
    try:
        if not pdf_doc_id:
            print("⚠️ Test 8 SKIPPED: No PDF doc ID from previous test")
            return False
        
        # Try to download as DOCX
        resp = requests.get(
            f"{API_BASE}/lesson-plans/documents/{pdf_doc_id}/download?format=docx",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        assert "code" in data, "Missing 'code' in error response"
        assert data["code"] == "FORMAT_MISMATCH", f"Expected FORMAT_MISMATCH, got {data['code']}"
        
        print("✅ Test 8 PASSED: Format mismatch correctly rejected with 400")
        return True
    except Exception as e:
        print(f"❌ Test 8 FAILED: {e}")
        return False

def test_9_ownership_check(docx_doc_id):
    """Test 9: Try downloading another user's document (admin tries to download premium user's doc)"""
    print("\n=== Test 9: Ownership check (admin tries to download premium user's doc) ===")
    try:
        if not docx_doc_id:
            print("⚠️ Test 9 SKIPPED: No DOCX doc ID from previous test")
            return False
        
        # Admin tries to download premium user's document
        resp = requests.get(
            f"{API_BASE}/lesson-plans/documents/{docx_doc_id}/download?format=docx",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        data = resp.json()
        assert "code" in data, "Missing 'code' in error response"
        assert data["code"] == "FORBIDDEN", f"Expected FORBIDDEN, got {data['code']}"
        
        print("✅ Test 9 PASSED: Ownership check working (403 FORBIDDEN)")
        return True
    except Exception as e:
        print(f"❌ Test 9 FAILED: {e}")
        return False

def test_10_pdf_disabled():
    """Test 10: Turn off allowPdf, try to prepare PDF (should fail)"""
    print("\n=== Test 10: PDF disabled enforcement ===")
    try:
        # Turn off allowPdf
        resp = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"allowPdf": False}},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        # Try to prepare PDF
        resp2 = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            headers={"Authorization": f"Bearer {premium_token}"},
            json={
                "format": "pdf",
                "innerHtml": "<h2>Test</h2>",
                "lesson": {"title": "Test", "period": 1}
            },
            timeout=30
        )
        assert resp2.status_code == 403, f"Expected 403, got {resp2.status_code}"
        data = resp2.json()
        assert "code" in data, "Missing 'code' in error response"
        assert data["code"] == "PDF_DISABLED", f"Expected PDF_DISABLED, got {data['code']}"
        
        # Restore allowPdf
        resp3 = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"allowPdf": True}},
            timeout=30
        )
        assert resp3.status_code == 200, f"Expected 200, got {resp3.status_code}"
        
        print("✅ Test 10 PASSED: PDF disabled enforcement working (403 PDF_DISABLED)")
        return True
    except Exception as e:
        print(f"❌ Test 10 FAILED: {e}")
        return False

def test_11_word_disabled():
    """Test 11: Turn off allowWord, try to prepare DOCX (should fail)"""
    print("\n=== Test 11: Word disabled enforcement ===")
    try:
        # Turn off allowWord
        resp = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"allowWord": False}},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        # Try to prepare DOCX
        resp2 = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            headers={"Authorization": f"Bearer {premium_token}"},
            json={
                "format": "docx",
                "innerHtml": "<h2>Test</h2>",
                "lesson": {"title": "Test", "period": 1}
            },
            timeout=30
        )
        assert resp2.status_code == 403, f"Expected 403, got {resp2.status_code}"
        data = resp2.json()
        assert "code" in data, "Missing 'code' in error response"
        assert data["code"] == "WORD_DISABLED", f"Expected WORD_DISABLED, got {data['code']}"
        
        # Restore allowWord
        resp3 = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"allowWord": True}},
            timeout=30
        )
        assert resp3.status_code == 200, f"Expected 200, got {resp3.status_code}"
        
        print("✅ Test 11 PASSED: Word disabled enforcement working (403 WORD_DISABLED)")
        return True
    except Exception as e:
        print(f"❌ Test 11 FAILED: {e}")
        return False

def test_12_one_time_download():
    """Test 12: Turn on oneTimeDownload, prepare doc, download once, try again (should fail)"""
    print("\n=== Test 12: One-time download enforcement ===")
    try:
        # Turn on oneTimeDownload
        resp = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"oneTimeDownload": True}},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        # Prepare a new document
        resp2 = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            headers={"Authorization": f"Bearer {premium_token}"},
            json={
                "format": "pdf",
                "innerHtml": "<h2>One-time test</h2>",
                "lesson": {"title": "One-time Test", "period": 1}
            },
            timeout=30
        )
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
        data = resp2.json()
        doc_id = data["documentId"]
        download_url = data["downloadUrl"]
        
        # Download once (should succeed)
        resp3 = requests.get(
            f"{BASE_URL}{download_url}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp3.status_code == 200, f"Expected 200 on first download, got {resp3.status_code}"
        print("✅ First download succeeded")
        
        # Try to download again (should fail with 410 ALREADY_USED)
        resp4 = requests.get(
            f"{BASE_URL}{download_url}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp4.status_code == 410, f"Expected 410 on second download, got {resp4.status_code}"
        data4 = resp4.json()
        assert "code" in data4, "Missing 'code' in error response"
        assert data4["code"] == "ALREADY_USED", f"Expected ALREADY_USED, got {data4['code']}"
        
        # Turn off oneTimeDownload
        resp5 = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"oneTimeDownload": False}},
            timeout=30
        )
        assert resp5.status_code == 200, f"Expected 200, got {resp5.status_code}"
        
        print("✅ Test 12 PASSED: One-time download enforcement working (410 ALREADY_USED)")
        return True
    except Exception as e:
        print(f"❌ Test 12 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_13_revocation():
    """Test 13: Prepare doc, revoke it, try to download (should fail)"""
    print("\n=== Test 13: Document revocation ===")
    try:
        # Prepare a new document
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            headers={"Authorization": f"Bearer {premium_token}"},
            json={
                "format": "pdf",
                "innerHtml": "<h2>Revocation test</h2>",
                "lesson": {"title": "Revocation Test", "period": 1}
            },
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        doc_id = data["documentId"]
        download_url = data["downloadUrl"]
        
        # Revoke the document as admin
        resp2 = requests.post(
            f"{API_BASE}/admin/lesson-plan-documents/{doc_id}/revoke",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "test revocation"},
            timeout=30
        )
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
        print(f"✅ Document {doc_id} revoked")
        
        # Try to download (should fail with 403 REVOKED)
        resp3 = requests.get(
            f"{BASE_URL}{download_url}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp3.status_code == 403, f"Expected 403, got {resp3.status_code}"
        data3 = resp3.json()
        assert "code" in data3, "Missing 'code' in error response"
        assert data3["code"] == "REVOKED", f"Expected REVOKED, got {data3['code']}"
        
        print("✅ Test 13 PASSED: Document revocation working (403 REVOKED)")
        return True
    except Exception as e:
        print(f"❌ Test 13 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_14_admin_list_documents():
    """Test 14: GET /api/admin/lesson-plan-documents (admin list)"""
    print("\n=== Test 14: GET /api/admin/lesson-plan-documents (admin list) ===")
    try:
        resp = requests.get(
            f"{API_BASE}/admin/lesson-plan-documents?limit=10",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "items" in data, "Missing 'items' in response"
        assert "total" in data, "Missing 'total' in response"
        assert isinstance(data["items"], list), "items should be a list"
        assert data["total"] >= len(data["items"]), "total should be >= items count"
        
        # Check structure of first item (if any)
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "id" in item, "Missing 'id' in item"
            assert "userId" in item, "Missing 'userId' in item"
            assert "userName" in item, "Missing 'userName' in item"
            assert "userMobileMasked" in item, "Missing 'userMobileMasked' in item"
            assert "lesson" in item, "Missing 'lesson' in item"
            assert "format" in item, "Missing 'format' in item"
            assert "downloadStatus" in item, "Missing 'downloadStatus' in item"
            assert "downloadCount" in item, "Missing 'downloadCount' in item"
            assert "createdAt" in item, "Missing 'createdAt' in item"
            
            # Verify mobile is masked
            mobile = item["userMobileMasked"]
            assert "*" in mobile, f"Mobile should be masked, got: {mobile}"
            
            print(f"✅ Found {len(data['items'])} documents, total: {data['total']}")
        
        print("✅ Test 14 PASSED: Admin document list working")
        return True
    except Exception as e:
        print(f"❌ Test 14 FAILED: {e}")
        return False

def test_15_admin_logs():
    """Test 15: GET /api/admin/lesson-plan-documents/logs (admin logs)"""
    print("\n=== Test 15: GET /api/admin/lesson-plan-documents/logs (admin logs) ===")
    try:
        resp = requests.get(
            f"{API_BASE}/admin/lesson-plan-documents/logs?limit=50",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "items" in data, "Missing 'items' in response"
        assert "total" in data, "Missing 'total' in response"
        assert isinstance(data["items"], list), "items should be a list"
        
        # Check for expected log actions from previous tests
        actions = [item.get("action") for item in data["items"]]
        print(f"✅ Found {len(data['items'])} log entries, total: {data['total']}")
        print(f"   Actions: {set(actions)}")
        
        # Should have GENERATED, DOWNLOAD_SUCCESS, ADMIN_REVOKED, ALREADY_USED entries
        assert "GENERATED" in actions, "Should have GENERATED entries"
        assert "DOWNLOAD_SUCCESS" in actions, "Should have DOWNLOAD_SUCCESS entries"
        
        print("✅ Test 15 PASSED: Admin logs working with expected actions")
        return True
    except Exception as e:
        print(f"❌ Test 15 FAILED: {e}")
        return False

def test_16_regression_lessons():
    """Test 16: GET /api/lessons?limit=5 (regression check)"""
    print("\n=== Test 16: Regression - GET /api/lessons?limit=5 ===")
    try:
        resp = requests.get(f"{API_BASE}/lessons?limit=5", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "lessons" in data, "Missing 'lessons' in response"
        assert "total" in data, "Missing 'total' in response"
        assert "limit" in data, "Missing 'limit' in response"
        assert "skip" in data, "Missing 'skip' in response"
        print("✅ Test 16 PASSED: GET /api/lessons still working")
        return True
    except Exception as e:
        print(f"❌ Test 16 FAILED: {e}")
        return False

def test_17_regression_books():
    """Test 17: GET /api/books (regression check)"""
    print("\n=== Test 17: Regression - GET /api/books ===")
    try:
        resp = requests.get(f"{API_BASE}/books", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "books" in data, "Missing 'books' in response"
        print("✅ Test 17 PASSED: GET /api/books still working")
        return True
    except Exception as e:
        print(f"❌ Test 17 FAILED: {e}")
        return False

def test_18_regression_chapters():
    """Test 18: GET /api/chapters (regression check)"""
    print("\n=== Test 18: Regression - GET /api/chapters ===")
    try:
        resp = requests.get(f"{API_BASE}/chapters", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "chapters" in data, "Missing 'chapters' in response"
        assert "total" in data, "Missing 'total' in response"
        assert "limit" in data, "Missing 'limit' in response"
        assert "skip" in data, "Missing 'skip' in response"
        print("✅ Test 18 PASSED: GET /api/chapters still working")
        return True
    except Exception as e:
        print(f"❌ Test 18 FAILED: {e}")
        return False

def test_19_regression_assessments_community():
    """Test 19: GET /api/assessments/community?limit=3 (regression check)"""
    print("\n=== Test 19: Regression - GET /api/assessments/community?limit=3 ===")
    try:
        resp = requests.get(
            f"{API_BASE}/assessments/community?limit=3",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "items" in data, "Missing 'items' in response"
        print("✅ Test 19 PASSED: GET /api/assessments/community still working")
        return True
    except Exception as e:
        print(f"❌ Test 19 FAILED: {e}")
        return False

def test_20_regression_assessment_pdf():
    """Test 20: GET /api/assessments/:id/pdf (regression check - untouched route)"""
    print("\n=== Test 20: Regression - GET /api/assessments/:id/pdf ===")
    try:
        # First get an assessment from community
        resp = requests.get(
            f"{API_BASE}/assessments/community?limit=1",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        if len(data.get("items", [])) == 0:
            print("⚠️ Test 20 SKIPPED: No assessments found in community")
            return True
        
        assessment_id = data["items"][0]["id"]
        
        # Try to get PDF
        resp2 = requests.get(
            f"{API_BASE}/assessments/{assessment_id}/pdf",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
        assert resp2.headers["Content-Type"] == "application/pdf", f"Expected application/pdf, got {resp2.headers['Content-Type']}"
        
        print("✅ Test 20 PASSED: GET /api/assessments/:id/pdf still working (untouched)")
        return True
    except Exception as e:
        print(f"❌ Test 20 FAILED: {e}")
        return False

def main():
    global admin_token, premium_token
    
    print("=" * 80)
    print("LESSON PLAN DOCUMENT SECURITY - BACKEND TEST SUITE")
    print("=" * 80)
    
    # Login
    print("\n=== Logging in ===")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ Admin login failed, aborting tests")
        return
    print(f"✅ Admin logged in")
    
    premium_token = login(PREMIUM_USER_MOBILE, PREMIUM_USER_PASSWORD)
    if not premium_token:
        print("❌ Premium user login failed, aborting tests")
        return
    print(f"✅ Premium user logged in")
    
    # Run tests
    results = []
    
    # Config endpoints
    results.append(("Test 1: Config public", test_1_config_public()))
    results.append(("Test 2: Permissions auth", test_2_permissions_auth()))
    results.append(("Test 3: Admin update config", test_3_admin_update_config()))
    
    # Prepare + Download
    pdf_success, pdf_doc_id = test_5_prepare_download_pdf()
    results.append(("Test 5: Prepare + Download PDF", pdf_success))
    
    docx_success, docx_doc_id = test_7_prepare_download_docx()
    results.append(("Test 7: Prepare + Download DOCX", docx_success))
    
    # Enforcement checks
    results.append(("Test 8: Format mismatch", test_8_format_mismatch(pdf_doc_id)))
    results.append(("Test 9: Ownership check", test_9_ownership_check(docx_doc_id)))
    results.append(("Test 10: PDF disabled", test_10_pdf_disabled()))
    results.append(("Test 11: Word disabled", test_11_word_disabled()))
    results.append(("Test 12: One-time download", test_12_one_time_download()))
    results.append(("Test 13: Revocation", test_13_revocation()))
    
    # Admin endpoints
    results.append(("Test 14: Admin list documents", test_14_admin_list_documents()))
    results.append(("Test 15: Admin logs", test_15_admin_logs()))
    
    # Regression checks
    results.append(("Test 16: Regression - lessons", test_16_regression_lessons()))
    results.append(("Test 17: Regression - books", test_17_regression_books()))
    results.append(("Test 18: Regression - chapters", test_18_regression_chapters()))
    results.append(("Test 19: Regression - assessments community", test_19_regression_assessments_community()))
    results.append(("Test 20: Regression - assessment PDF", test_20_regression_assessment_pdf()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("\n" + "=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed ({100*passed//total}% success rate)")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Lesson Plan Document Security is working correctly.")
    else:
        print(f"\n⚠️ {total - passed} test(s) failed. Please review the output above.")

if __name__ == "__main__":
    main()
