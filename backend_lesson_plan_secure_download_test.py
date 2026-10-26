#!/usr/bin/env python3
"""
Backend Test: Lesson Plan Secure Download with Graceful Fallback
=================================================================
Tests the NEW graceful fallback behavior for Lesson Plan PDF/Word downloads.
Scoped strictly to Lesson Plan endpoints — does NOT touch Assessments, Question Papers, etc.

Test Cases:
1. Happy path - server-side PDF render (or fallback if puppeteer missing)
2. DOCX happy path
3. One-time download respected after fallback
4. Audit log written
5. Fallback code-path sanity check (unit-level)
6. Negative/security tests
"""

import requests
import json
import sys
import subprocess

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Credentials from /app/memory/test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_MOBILE = "9999900001"
PREMIUM_PASSWORD = "<redacted>"

def login(mobile, password):
    """Login and return Bearer token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"❌ Login failed: {resp.status_code} {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def test_1_admin_login():
    """Test 1: Admin login"""
    print("\n" + "="*80)
    print("TEST 1: Admin Login")
    print("="*80)
    token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if token:
        print(f"✅ Admin login successful, token: {token[:20]}...")
        return token
    else:
        print("❌ Admin login failed")
        return None

def test_2_premium_login():
    """Test 2: Premium user login"""
    print("\n" + "="*80)
    print("TEST 2: Premium User Login")
    print("="*80)
    token = login(PREMIUM_MOBILE, PREMIUM_PASSWORD)
    if token:
        print(f"✅ Premium user login successful, token: {token[:20]}...")
        return token
    else:
        print("❌ Premium user login failed")
        return None

def test_3_happy_path_pdf(premium_token):
    """Test 3: Happy path - PDF generation (server-side or fallback)"""
    print("\n" + "="*80)
    print("TEST 3: Happy Path - PDF Generation")
    print("="*80)
    
    try:
        # Generate secure download
        payload = {
            "format": "pdf",
            "innerHtml": "<h1>Test Lesson Plan</h1><p>This is a test lesson body with some content.</p><p>Learning outcomes: Students will understand basic concepts.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 1,
                "title": "Test Lesson - Secure Download"
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        
        if resp.status_code != 200:
            print(f"❌ Secure download generation failed: {resp.status_code} {resp.text[:300]}")
            return None
        
        data = resp.json()
        print(f"✅ Secure download generated:")
        print(f"   Document ID: {data.get('documentId')}")
        print(f"   User Code: {data.get('userCode')}")
        print(f"   Format: {data.get('format')}")
        print(f"   One-time download: {data.get('oneTimeDownload')}")
        print(f"   Watermark on: {data.get('watermarkOn')}")
        print(f"   PDF password: {data.get('pdfPassword')}")
        
        document_id = data.get('documentId')
        download_url = data.get('downloadUrl')
        token = data.get('token')
        
        if not document_id or not download_url:
            print("❌ Missing documentId or downloadUrl in response")
            return None
        
        # Now try to download
        # downloadUrl already includes /api prefix, so use base domain only
        base_domain = BASE_URL.replace('/api', '')
        full_url = f"{base_domain}{download_url}"
        print(f"\n   Attempting download from: {full_url}")
        dl_resp = requests.get(
            full_url,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        
        if dl_resp.status_code == 200:
            content_type = dl_resp.headers.get('Content-Type', '')
            content_disp = dl_resp.headers.get('Content-Disposition', '')
            
            # Check if it's a JSON fallback response
            if 'application/json' in content_type:
                fallback_data = dl_resp.json()
                if fallback_data.get('fallback') == 'print':
                    print(f"✅ Server-side render unavailable - received fallback response")
                    print(f"   Fallback mode: {fallback_data.get('fallback')}")
                    print(f"   Document ID: {fallback_data.get('documentId')}")
                    print(f"   Filename: {fallback_data.get('filename')}")
                    print(f"   HTML length: {len(fallback_data.get('html', ''))}")
                    print(f"   Note: {fallback_data.get('note', '')[:100]}")
                    
                    # Verify HTML contains watermark elements
                    html = fallback_data.get('html', '')
                    if 'LESSONGURU ODISHA' in html and document_id in html:
                        print(f"✅ Fallback HTML contains watermark and document ID")
                    else:
                        print(f"❌ Fallback HTML missing watermark or document ID")
                    
                    return {'documentId': document_id, 'mode': 'fallback', 'token': token}
                else:
                    print(f"❌ Unexpected JSON response: {fallback_data}")
                    return None
            
            # Check if it's a PDF
            elif 'application/pdf' in content_type:
                body = dl_resp.content
                if body[:4] == b'%PDF':
                    print(f"✅ Received valid PDF (server-side render)")
                    print(f"   Content-Type: {content_type}")
                    print(f"   Content-Disposition: {content_disp}")
                    print(f"   PDF size: {len(body)} bytes")
                    
                    # Check if document ID is in filename
                    if document_id in content_disp:
                        print(f"✅ Document ID present in Content-Disposition")
                    else:
                        print(f"⚠️  Document ID not in Content-Disposition: {content_disp}")
                    
                    return {'documentId': document_id, 'mode': 'server-pdf', 'token': token}
                else:
                    print(f"❌ Response claims to be PDF but doesn't start with %PDF")
                    return None
            else:
                print(f"❌ Unexpected Content-Type: {content_type}")
                return None
        else:
            print(f"❌ Download failed: {dl_resp.status_code} {dl_resp.text[:300]}")
            return None
            
    except Exception as e:
        print(f"❌ Test 3 exception: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_4_happy_path_docx(premium_token):
    """Test 4: Happy path - DOCX generation"""
    print("\n" + "="*80)
    print("TEST 4: Happy Path - DOCX Generation")
    print("="*80)
    
    try:
        # Generate secure download
        payload = {
            "format": "docx",
            "innerHtml": "<h1>Test Lesson Plan DOCX</h1><p>This is a test lesson body for Word format.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 2,
                "title": "Test Lesson - DOCX"
            }
        }
        
        resp = requests.post(
            f"{BASE_URL}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        
        if resp.status_code != 200:
            print(f"❌ DOCX generation failed: {resp.status_code} {resp.text[:300]}")
            return None
        
        data = resp.json()
        print(f"✅ DOCX secure download generated:")
        print(f"   Document ID: {data.get('documentId')}")
        print(f"   Format: {data.get('format')}")
        
        document_id = data.get('documentId')
        download_url = data.get('downloadUrl')
        
        # Download DOCX
        # downloadUrl already includes /api prefix, so use base domain only
        base_domain = BASE_URL.replace('/api', '')
        full_url = f"{base_domain}{download_url}"
        dl_resp = requests.get(
            full_url,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        
        if dl_resp.status_code == 200:
            content_type = dl_resp.headers.get('Content-Type', '')
            content_disp = dl_resp.headers.get('Content-Disposition', '')
            body = dl_resp.content
            
            if 'application/msword' in content_type or 'application/vnd' in content_type:
                print(f"✅ Received DOCX/Word document")
                print(f"   Content-Type: {content_type}")
                print(f"   Content-Disposition: {content_disp}")
                print(f"   Size: {len(body)} bytes")
                
                # Check for UTF-8 BOM (required for Odia rendering)
                if body[:3] == b'\xef\xbb\xbf':
                    print(f"✅ UTF-8 BOM present (required for Odia)")
                else:
                    print(f"⚠️  UTF-8 BOM not found")
                
                # Check if document ID is in filename
                if document_id in content_disp:
                    print(f"✅ Document ID present in Content-Disposition")
                
                return {'documentId': document_id, 'mode': 'docx'}
            else:
                print(f"❌ Unexpected Content-Type for DOCX: {content_type}")
                return None
        else:
            print(f"❌ DOCX download failed: {dl_resp.status_code} {dl_resp.text[:300]}")
            return None
            
    except Exception as e:
        print(f"❌ Test 4 exception: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_5_one_time_download(admin_token, premium_token):
    """Test 5: One-time download enforcement"""
    print("\n" + "="*80)
    print("TEST 5: One-Time Download Enforcement")
    print("="*80)
    
    try:
        # First, enable one-time download in admin config
        print("   Step 1: Enable one-time download in admin config")
        config_resp = requests.put(
            f"{BASE_URL}/admin/document-security/lesson-plan/config",
            json={"settings": {"oneTimeDownload": True}},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if config_resp.status_code != 200:
            print(f"❌ Failed to update config: {config_resp.status_code} {config_resp.text[:200]}")
            return False
        
        print(f"✅ One-time download enabled")
        
        # Generate a new document
        print("   Step 2: Generate new document with one-time download")
        payload = {
            "format": "pdf",
            "innerHtml": "<h1>One-Time Test</h1><p>This document should only be downloadable once.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 3,
                "title": "One-Time Test"
            }
        }
        
        gen_resp = requests.post(
            f"{BASE_URL}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        
        if gen_resp.status_code != 200:
            print(f"❌ Document generation failed: {gen_resp.status_code}")
            return False
        
        data = gen_resp.json()
        document_id = data.get('documentId')
        download_url = data.get('downloadUrl')
        one_time = data.get('oneTimeDownload')
        
        print(f"✅ Document generated: {document_id}")
        print(f"   One-time download: {one_time}")
        
        if not one_time:
            print(f"❌ oneTimeDownload should be True but got: {one_time}")
            return False
        
        # First download - should succeed
        print("   Step 3: First download (should succeed)")
        base_domain = BASE_URL.replace('/api', '')
        full_url = f"{base_domain}{download_url}"
        dl1_resp = requests.get(
            full_url,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        
        if dl1_resp.status_code == 200:
            print(f"✅ First download succeeded (status 200)")
        else:
            print(f"❌ First download failed: {dl1_resp.status_code}")
            return False
        
        # Second download - should fail with 410 ALREADY_USED
        print("   Step 4: Second download (should fail with 410 ALREADY_USED)")
        dl2_resp = requests.get(
            full_url,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        
        if dl2_resp.status_code == 410:
            error_data = dl2_resp.json()
            error_code = error_data.get('code')
            if error_code == 'ALREADY_USED':
                print(f"✅ Second download correctly blocked with 410 ALREADY_USED")
                print(f"   Error message: {error_data.get('error', '')[:100]}")
                return True
            else:
                print(f"❌ Got 410 but wrong code: {error_code}")
                return False
        else:
            print(f"❌ Second download should return 410 but got: {dl2_resp.status_code}")
            print(f"   Response: {dl2_resp.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Test 5 exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Restore config to default (one-time download OFF)
        try:
            requests.put(
                f"{BASE_URL}/admin/document-security/lesson-plan/config",
                json={"settings": {"oneTimeDownload": False}},
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30
            )
            print("   Cleanup: Restored one-time download to False")
        except:
            pass

def test_6_audit_logs(admin_token, test3_result):
    """Test 6: Audit logs written correctly"""
    print("\n" + "="*80)
    print("TEST 6: Audit Logs Verification")
    print("="*80)
    
    if not test3_result or 'documentId' not in test3_result:
        print("⚠️  Skipping audit log test - no document ID from test 3")
        return False
    
    document_id = test3_result['documentId']
    
    try:
        # Get document list
        print(f"   Step 1: Get document list for document {document_id}")
        docs_resp = requests.get(
            f"{BASE_URL}/admin/lesson-plan-documents?limit=10&documentId={document_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if docs_resp.status_code != 200:
            print(f"❌ Failed to get documents: {docs_resp.status_code}")
            return False
        
        docs_data = docs_resp.json()
        items = docs_data.get('items', [])
        
        if len(items) == 0:
            print(f"❌ No document found with ID {document_id}")
            return False
        
        doc = items[0]
        print(f"✅ Document found:")
        print(f"   ID: {doc.get('id')}")
        print(f"   User: {doc.get('userName')}")
        print(f"   Format: {doc.get('format')}")
        print(f"   Download status: {doc.get('downloadStatus')}")
        print(f"   Download count: {doc.get('downloadCount')}")
        
        # Get audit logs
        print(f"\n   Step 2: Get audit logs for document {document_id}")
        logs_resp = requests.get(
            f"{BASE_URL}/admin/lesson-plan-documents/logs?limit=20&documentId={document_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if logs_resp.status_code != 200:
            print(f"❌ Failed to get logs: {logs_resp.status_code}")
            return False
        
        logs_data = logs_resp.json()
        log_items = logs_data.get('items', [])
        
        if len(log_items) == 0:
            print(f"❌ No logs found for document {document_id}")
            return False
        
        print(f"✅ Found {len(log_items)} audit log entries:")
        
        # Check for expected log actions
        actions = [log.get('action') for log in log_items]
        print(f"   Actions: {actions}")
        
        # Should have GENERATED
        if 'GENERATED' in actions:
            print(f"✅ GENERATED action logged")
        else:
            print(f"❌ GENERATED action not found")
        
        # Should have either DOWNLOAD_SUCCESS or DOWNLOAD_SUCCESS_FALLBACK
        if 'DOWNLOAD_SUCCESS' in actions or 'DOWNLOAD_SUCCESS_FALLBACK' in actions:
            print(f"✅ Download success action logged")
        else:
            print(f"⚠️  No download success action found (may not have completed)")
        
        # If fallback was used, should have DOWNLOAD_FALLBACK
        if test3_result.get('mode') == 'fallback':
            if 'DOWNLOAD_FALLBACK' in actions:
                print(f"✅ DOWNLOAD_FALLBACK action logged (expected for fallback mode)")
            else:
                print(f"⚠️  DOWNLOAD_FALLBACK not found but fallback was used")
        
        return True
        
    except Exception as e:
        print(f"❌ Test 6 exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_7_fallback_sanity_check():
    """Test 7: Fallback code-path sanity check (unit-level)"""
    print("\n" + "="*80)
    print("TEST 7: Fallback Code-Path Sanity Check (Unit-Level)")
    print("="*80)
    
    try:
        # Run Node.js one-liner to test wrapLessonPlanPrintableHtml
        node_code = """
const { wrapLessonPlanPrintableHtml } = require('/app/lib/lesson-plan-security.js');
const html = wrapLessonPlanPrintableHtml('<h1>Test Content</h1>', {
  documentId: 'LG-LP-XYZ123',
  user: { id: 'u1', name: 'Test Teacher' },
  brandOn: true,
  userOn: true,
  autoPrint: true,
  orientation: 'landscape'
});
console.log(JSON.stringify({
  length: html.length,
  hasWatermark: html.includes('LESSONGURU ODISHA'),
  hasDocId: html.includes('LG-LP-XYZ123'),
  hasAutoPrint: html.includes('window.print'),
  hasStyle: html.includes('<style'),
  hasPageRule: html.includes('@page'),
  hasLandscape: html.includes('landscape')
}));
"""
        
        result = subprocess.run(
            ['node', '-e', node_code],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            print(f"❌ Node.js execution failed:")
            print(f"   stderr: {result.stderr}")
            return False
        
        output = result.stdout.strip()
        data = json.loads(output)
        
        print(f"✅ wrapLessonPlanPrintableHtml executed successfully:")
        print(f"   HTML length: {data.get('length')}")
        print(f"   Has watermark 'LESSONGURU ODISHA': {data.get('hasWatermark')}")
        print(f"   Has document ID: {data.get('hasDocId')}")
        print(f"   Has auto-print script: {data.get('hasAutoPrint')}")
        print(f"   Has <style> tag: {data.get('hasStyle')}")
        print(f"   Has @page rule: {data.get('hasPageRule')}")
        print(f"   Has landscape orientation: {data.get('hasLandscape')}")
        
        # Verify all expected elements
        checks = [
            (data.get('length', 0) > 4000, "HTML length > 4000"),
            (data.get('hasWatermark'), "Contains watermark"),
            (data.get('hasDocId'), "Contains document ID"),
            (data.get('hasAutoPrint'), "Contains auto-print script"),
            (data.get('hasStyle'), "Contains style tag"),
            (data.get('hasPageRule'), "Contains @page rule"),
            (data.get('hasLandscape'), "Contains landscape orientation")
        ]
        
        all_passed = True
        for passed, desc in checks:
            if passed:
                print(f"   ✅ {desc}")
            else:
                print(f"   ❌ {desc}")
                all_passed = False
        
        return all_passed
        
    except Exception as e:
        print(f"❌ Test 7 exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_8_negative_wrong_user(admin_token, premium_token, test3_result):
    """Test 8: Negative test - downloading someone else's document"""
    print("\n" + "="*80)
    print("TEST 8: Negative Test - Wrong User Access")
    print("="*80)
    
    if not test3_result or 'documentId' not in test3_result:
        print("⚠️  Skipping - no document ID from test 3")
        return False
    
    document_id = test3_result['documentId']
    token = test3_result.get('token', '')
    
    try:
        # Try to download premium user's document using admin token
        print(f"   Attempting to download premium user's document as admin")
        base_domain = BASE_URL.replace('/api', '')
        full_url = f"{base_domain}/api/lesson-plans/documents/{document_id}/download?format=pdf&token={token}"
        dl_resp = requests.get(
            full_url,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if dl_resp.status_code == 403:
            error_data = dl_resp.json()
            if error_data.get('code') == 'FORBIDDEN':
                print(f"✅ Correctly blocked with 403 FORBIDDEN")
                print(f"   Error: {error_data.get('error', '')[:100]}")
                return True
            else:
                print(f"❌ Got 403 but wrong code: {error_data.get('code')}")
                return False
        else:
            print(f"❌ Should return 403 but got: {dl_resp.status_code}")
            print(f"   Response: {dl_resp.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Test 8 exception: {e}")
        return False

def test_9_negative_disabled_format(admin_token, premium_token):
    """Test 9: Negative test - disabled format"""
    print("\n" + "="*80)
    print("TEST 9: Negative Test - Disabled Format")
    print("="*80)
    
    try:
        # Disable PDF downloads
        print("   Step 1: Disable PDF downloads in admin config")
        config_resp = requests.put(
            f"{BASE_URL}/admin/document-security/lesson-plan/config",
            json={"settings": {"allowPdf": False}},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if config_resp.status_code != 200:
            print(f"❌ Failed to update config: {config_resp.status_code}")
            return False
        
        print(f"✅ PDF downloads disabled")
        
        # Try to generate PDF
        print("   Step 2: Try to generate PDF (should fail)")
        payload = {
            "format": "pdf",
            "innerHtml": "<h1>Test</h1>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 1,
                "title": "Test"
            }
        }
        
        gen_resp = requests.post(
            f"{BASE_URL}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        
        if gen_resp.status_code == 403:
            error_data = gen_resp.json()
            if 'PDF download disabled' in error_data.get('error', ''):
                print(f"✅ Correctly blocked with 403")
                print(f"   Error: {error_data.get('error')}")
                return True
            else:
                print(f"❌ Got 403 but wrong error message: {error_data.get('error')}")
                return False
        else:
            print(f"❌ Should return 403 but got: {gen_resp.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Test 9 exception: {e}")
        return False
    finally:
        # Restore config
        try:
            requests.put(
                f"{BASE_URL}/admin/document-security/lesson-plan/config",
                json={"settings": {"allowPdf": True}},
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30
            )
            print("   Cleanup: Restored allowPdf to True")
        except:
            pass

def test_10_negative_revoked_document(admin_token, premium_token):
    """Test 10: Negative test - revoked document"""
    print("\n" + "="*80)
    print("TEST 10: Negative Test - Revoked Document")
    print("="*80)
    
    try:
        # Generate a document
        print("   Step 1: Generate document")
        payload = {
            "format": "pdf",
            "innerHtml": "<h1>To Be Revoked</h1>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 1,
                "title": "Revoke Test"
            }
        }
        
        gen_resp = requests.post(
            f"{BASE_URL}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        
        if gen_resp.status_code != 200:
            print(f"❌ Document generation failed: {gen_resp.status_code}")
            return False
        
        data = gen_resp.json()
        document_id = data.get('documentId')
        download_url = data.get('downloadUrl')
        
        print(f"✅ Document generated: {document_id}")
        
        # Revoke the document
        print("   Step 2: Revoke document as admin")
        revoke_resp = requests.post(
            f"{BASE_URL}/admin/lesson-plan-documents/{document_id}/revoke",
            json={"reason": "Test revocation"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if revoke_resp.status_code != 200:
            print(f"❌ Revoke failed: {revoke_resp.status_code}")
            return False
        
        print(f"✅ Document revoked")
        
        # Try to download
        print("   Step 3: Try to download revoked document (should fail)")
        base_domain = BASE_URL.replace('/api', '')
        full_url = f"{base_domain}{download_url}"
        dl_resp = requests.get(
            full_url,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        
        if dl_resp.status_code == 403:
            error_data = dl_resp.json()
            if error_data.get('code') == 'REVOKED':
                print(f"✅ Correctly blocked with 403 REVOKED")
                print(f"   Error: {error_data.get('error', '')[:100]}")
                return True
            else:
                print(f"❌ Got 403 but wrong code: {error_data.get('code')}")
                return False
        else:
            print(f"❌ Should return 403 but got: {dl_resp.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Test 10 exception: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("LESSON PLAN SECURE DOWNLOAD - BACKEND TEST SUITE")
    print("Testing graceful fallback behavior for PDF/Word downloads")
    print("="*80)
    
    results = {}
    
    # Test 1: Admin login
    admin_token = test_1_admin_login()
    results['test_1_admin_login'] = admin_token is not None
    
    if not admin_token:
        print("\n❌ CRITICAL: Admin login failed. Cannot continue.")
        sys.exit(1)
    
    # Test 2: Premium user login
    premium_token = test_2_premium_login()
    results['test_2_premium_login'] = premium_token is not None
    
    if not premium_token:
        print("\n❌ CRITICAL: Premium user login failed. Cannot continue.")
        sys.exit(1)
    
    # Test 3: Happy path PDF
    test3_result = test_3_happy_path_pdf(premium_token)
    results['test_3_happy_path_pdf'] = test3_result is not None
    
    # Test 4: Happy path DOCX
    test4_result = test_4_happy_path_docx(premium_token)
    results['test_4_happy_path_docx'] = test4_result is not None
    
    # Test 5: One-time download
    results['test_5_one_time_download'] = test_5_one_time_download(admin_token, premium_token)
    
    # Test 6: Audit logs
    results['test_6_audit_logs'] = test_6_audit_logs(admin_token, test3_result)
    
    # Test 7: Fallback sanity check
    results['test_7_fallback_sanity'] = test_7_fallback_sanity_check()
    
    # Test 8: Negative - wrong user
    results['test_8_negative_wrong_user'] = test_8_negative_wrong_user(admin_token, premium_token, test3_result)
    
    # Test 9: Negative - disabled format
    results['test_9_negative_disabled_format'] = test_9_negative_disabled_format(admin_token, premium_token)
    
    # Test 10: Negative - revoked document
    results['test_10_negative_revoked'] = test_10_negative_revoked_document(admin_token, premium_token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print(f"{'='*80}\n")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
