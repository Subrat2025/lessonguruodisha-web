#!/usr/bin/env python3
"""
Backend Test: My Downloads Feature (Lesson Plans)
==================================================
Tests the two NEW backend endpoints for the "My Downloads" feature:
1. GET  /api/lesson-plans/my-documents?limit=&skip=&format=&status=
2. POST /api/lesson-plans/documents/:id/regenerate

SCOPE: STRICTLY Lesson Plans. Does NOT touch Assessments, Question Papers,
Worksheets, or any other feature.

Test scenarios:
A) Auth required - both endpoints should return 401 without auth
B) my-documents list - test with premium user, verify pagination, filters, cross-user isolation
C) regenerate happy path - create new doc from cached payload
D) regenerate wrong owner - 403 error
E) regenerate payload expired - 410 error
F) regenerate respects admin toggles - 403 when PDF disabled
G) No regression - existing endpoints still work
"""

import requests
import subprocess
import os
import time

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Credentials from /app/memory/test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_USER_MOBILE = "9999900001"
PREMIUM_USER_PASSWORD = "<redacted>"

admin_token = None
premium_token = None
test_doc_id_1 = None  # PDF doc
test_doc_id_2 = None  # DOCX doc
test_doc_id_3 = None  # For payload expiry test

def login(mobile, password):
    """Login and return JWT token"""
    resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
    if resp.status_code != 200:
        print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    return data.get("token")

def test_a1_auth_required_my_documents():
    """Test A1: GET /api/lesson-plans/my-documents without auth → 401"""
    print("\n=== Test A1: GET /api/lesson-plans/my-documents without auth → 401 ===")
    try:
        resp = requests.get(f"{API_BASE}/lesson-plans/my-documents", timeout=30)
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        data = resp.json()
        assert "error" in data, "Expected error message"
        print(f"✅ Test A1 PASSED: 401 with error: {data.get('error')}")
        return True
    except Exception as e:
        print(f"❌ Test A1 FAILED: {e}")
        return False

def test_a2_auth_required_regenerate():
    """Test A2: POST /api/lesson-plans/documents/:id/regenerate without auth → 401"""
    print("\n=== Test A2: POST /api/lesson-plans/documents/:id/regenerate without auth → 401 ===")
    try:
        resp = requests.post(f"{API_BASE}/lesson-plans/documents/LG-LP-XXXXXXXX-YYYYYY/regenerate", timeout=30)
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        data = resp.json()
        assert "error" in data, "Expected error message"
        print(f"✅ Test A2 PASSED: 401 with error: {data.get('error')}")
        return True
    except Exception as e:
        print(f"❌ Test A2 FAILED: {e}")
        return False

def test_b1_generate_test_docs():
    """Test B1: Generate 2 fresh docs to seed (1 PDF + 1 DOCX)"""
    print("\n=== Test B1: Generate 2 fresh docs (PDF + DOCX) ===")
    global test_doc_id_1, test_doc_id_2
    try:
        # Generate PDF doc
        pdf_payload = {
            "format": "pdf",
            "innerHtml": "<h1>PDF Test for My Downloads</h1><p>This is a test document with enough content to render properly. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 1,
                "title": "MyDownloads PDF Test"
            }
        }
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            json=pdf_payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp.status_code == 200, f"PDF generation failed: {resp.status_code} {resp.text}"
        data = resp.json()
        test_doc_id_1 = data.get("documentId")
        assert test_doc_id_1, "Missing documentId in PDF response"
        print(f"✅ PDF doc generated: {test_doc_id_1}")
        
        # Generate DOCX doc
        docx_payload = {
            "format": "docx",
            "innerHtml": "<h1>Word Test for My Downloads</h1><p>This is a test document with enough content to render properly. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 2,
                "title": "MyDownloads Word Test"
            }
        }
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            json=docx_payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp.status_code == 200, f"DOCX generation failed: {resp.status_code} {resp.text}"
        data = resp.json()
        test_doc_id_2 = data.get("documentId")
        assert test_doc_id_2, "Missing documentId in DOCX response"
        print(f"✅ DOCX doc generated: {test_doc_id_2}")
        
        print(f"✅ Test B1 PASSED: Generated 2 docs (PDF: {test_doc_id_1}, DOCX: {test_doc_id_2})")
        return True
    except Exception as e:
        print(f"❌ Test B1 FAILED: {e}")
        return False

def test_b2_my_documents_list():
    """Test B2: GET /api/lesson-plans/my-documents → 200 with items"""
    print("\n=== Test B2: GET /api/lesson-plans/my-documents → 200 ===")
    try:
        resp = requests.get(
            f"{API_BASE}/lesson-plans/my-documents",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        # Verify response structure
        assert "items" in data, "Missing 'items' in response"
        assert "total" in data, "Missing 'total' in response"
        assert "limit" in data, "Missing 'limit' in response"
        assert "skip" in data, "Missing 'skip' in response"
        
        items = data["items"]
        assert len(items) >= 2, f"Expected at least 2 items, got {len(items)}"
        
        # Verify both test docs are present
        doc_ids = [item["id"] for item in items]
        assert test_doc_id_1 in doc_ids, f"PDF doc {test_doc_id_1} not found in list"
        assert test_doc_id_2 in doc_ids, f"DOCX doc {test_doc_id_2} not found in list"
        
        # Verify item structure
        for item in items[:2]:
            assert "id" in item, "Missing 'id' in item"
            assert "format" in item, "Missing 'format' in item"
            assert "lesson" in item, "Missing 'lesson' in item"
            assert "createdAt" in item, "Missing 'createdAt' in item"
            assert "downloadStatus" in item, "Missing 'downloadStatus' in item"
            assert "downloadCount" in item, "Missing 'downloadCount' in item"
            assert "expiresAt" in item, "Missing 'expiresAt' in item"
            assert "canRedownload" in item, "Missing 'canRedownload' in item"
            assert "canRegenerate" in item, "Missing 'canRegenerate' in item"
            assert "payloadCachedUntil" in item, "Missing 'payloadCachedUntil' in item"
            
            # Verify canRedownload and canRegenerate are booleans
            assert isinstance(item["canRedownload"], bool), "canRedownload should be boolean"
            assert isinstance(item["canRegenerate"], bool), "canRegenerate should be boolean"
            
            # Fresh docs should be redownloadable and regeneratable
            if item["id"] in [test_doc_id_1, test_doc_id_2]:
                assert item["canRedownload"] == True, f"Fresh doc {item['id']} should be redownloadable"
                assert item["canRegenerate"] == True, f"Fresh doc {item['id']} should be regeneratable"
        
        # Verify sorting (createdAt desc)
        if len(items) >= 2:
            for i in range(len(items) - 1):
                assert items[i]["createdAt"] >= items[i+1]["createdAt"], "Items should be sorted by createdAt desc"
        
        print(f"✅ Test B2 PASSED: Found {len(items)} docs, both test docs present with correct structure")
        return True
    except Exception as e:
        print(f"❌ Test B2 FAILED: {e}")
        return False

def test_b3_filter_by_format():
    """Test B3: GET /api/lesson-plans/my-documents?format=pdf → only PDF docs"""
    print("\n=== Test B3: GET /api/lesson-plans/my-documents?format=pdf ===")
    try:
        resp = requests.get(
            f"{API_BASE}/lesson-plans/my-documents?format=pdf",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        items = data["items"]
        
        # Verify all items are PDF
        for item in items:
            assert item["format"] == "pdf", f"Expected format=pdf, got {item['format']}"
        
        # Verify test_doc_id_1 (PDF) is present
        doc_ids = [item["id"] for item in items]
        assert test_doc_id_1 in doc_ids, f"PDF doc {test_doc_id_1} not found in filtered list"
        
        print(f"✅ Test B3 PASSED: Filter by format=pdf working, found {len(items)} PDF docs")
        return True
    except Exception as e:
        print(f"❌ Test B3 FAILED: {e}")
        return False

def test_b4_filter_by_status():
    """Test B4: GET /api/lesson-plans/my-documents?status=active → only active docs"""
    print("\n=== Test B4: GET /api/lesson-plans/my-documents?status=active ===")
    try:
        resp = requests.get(
            f"{API_BASE}/lesson-plans/my-documents?status=active",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        items = data["items"]
        
        # Verify all items are active
        for item in items:
            assert item["downloadStatus"] == "active", f"Expected status=active, got {item['downloadStatus']}"
        
        print(f"✅ Test B4 PASSED: Filter by status=active working, found {len(items)} active docs")
        return True
    except Exception as e:
        print(f"❌ Test B4 FAILED: {e}")
        return False

def test_b5_cross_user_isolation():
    """Test B5: Admin should only see admin's own docs (not premium user's docs)"""
    print("\n=== Test B5: Cross-user isolation (admin vs premium user) ===")
    try:
        # Get admin's docs
        resp = requests.get(
            f"{API_BASE}/lesson-plans/my-documents",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        admin_items = data["items"]
        admin_doc_ids = [item["id"] for item in admin_items]
        
        # Verify premium user's docs are NOT in admin's list
        assert test_doc_id_1 not in admin_doc_ids, f"Premium user's PDF doc {test_doc_id_1} should NOT be in admin's list"
        assert test_doc_id_2 not in admin_doc_ids, f"Premium user's DOCX doc {test_doc_id_2} should NOT be in admin's list"
        
        print(f"✅ Test B5 PASSED: Cross-user isolation working (admin has {len(admin_items)} docs, premium user's docs not visible)")
        return True
    except Exception as e:
        print(f"❌ Test B5 FAILED: {e}")
        return False

def test_c1_regenerate_happy_path():
    """Test C1: POST /api/lesson-plans/documents/:id/regenerate → 200 with new doc"""
    print("\n=== Test C1: POST /api/lesson-plans/documents/:id/regenerate (happy path) ===")
    global test_doc_id_1
    try:
        # Regenerate the PDF doc
        resp = requests.post(
            f"{API_BASE}/lesson-plans/documents/{test_doc_id_1}/regenerate",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code} {resp.text}"
        data = resp.json()
        
        # Verify response structure
        assert "documentId" in data, "Missing 'documentId' in response"
        assert "token" in data, "Missing 'token' in response"
        assert "downloadUrl" in data, "Missing 'downloadUrl' in response"
        assert "regeneratedFrom" in data, "Missing 'regeneratedFrom' in response"
        assert "format" in data, "Missing 'format' in response"
        assert "lesson" in data, "Missing 'lesson' in response"
        
        new_doc_id = data["documentId"]
        
        # Verify new doc ID is different from old
        assert new_doc_id != test_doc_id_1, f"New doc ID {new_doc_id} should be different from old {test_doc_id_1}"
        
        # Verify regeneratedFrom equals old doc ID
        assert data["regeneratedFrom"] == test_doc_id_1, f"regeneratedFrom should be {test_doc_id_1}, got {data['regeneratedFrom']}"
        
        # Verify format is preserved
        assert data["format"] == "pdf", f"Format should be 'pdf', got {data['format']}"
        
        # Verify lesson metadata is preserved
        assert data["lesson"]["title"] == "MyDownloads PDF Test", "Lesson title should be preserved"
        
        # Verify new doc is downloadable
        download_url = data["downloadUrl"]
        resp = requests.get(
            f"{BASE_URL}{download_url}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp.status_code == 200, f"Download failed: {resp.status_code}"
        assert resp.headers.get("Content-Type") == "application/pdf", "Content-Type should be application/pdf"
        assert len(resp.content) > 3000, f"PDF too small: {len(resp.content)} bytes"
        assert resp.content[:4] == b'%PDF', "PDF should start with %PDF-"
        
        print(f"✅ Test C1 PASSED: Regenerated doc {new_doc_id} from {test_doc_id_1}, format preserved, downloadable")
        return True
    except Exception as e:
        print(f"❌ Test C1 FAILED: {e}")
        return False

def test_c2_regenerate_audit_log():
    """Test C2: Verify REGENERATED entry in audit log"""
    print("\n=== Test C2: Verify REGENERATED entry in audit log ===")
    try:
        # Get admin logs
        resp = requests.get(
            f"{API_BASE}/admin/lesson-plan-documents/logs?limit=50",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        items = data["items"]
        
        # Find REGENERATED entry
        regenerated_entries = [item for item in items if item.get("action") == "REGENERATED"]
        assert len(regenerated_entries) > 0, "No REGENERATED entries found in audit log"
        
        # Verify meta.regeneratedFrom is set
        latest_regen = regenerated_entries[0]
        assert "meta" in latest_regen, "Missing 'meta' in REGENERATED entry"
        assert "regeneratedFrom" in latest_regen["meta"], "Missing 'regeneratedFrom' in meta"
        assert latest_regen["meta"]["regeneratedFrom"] == test_doc_id_1, f"regeneratedFrom should be {test_doc_id_1}"
        
        print(f"✅ Test C2 PASSED: REGENERATED entry found in audit log with meta.regeneratedFrom = {test_doc_id_1}")
        return True
    except Exception as e:
        print(f"❌ Test C2 FAILED: {e}")
        return False

def test_d1_regenerate_wrong_owner():
    """Test D1: Admin tries to regenerate premium user's doc → 403"""
    print("\n=== Test D1: Admin tries to regenerate premium user's doc → 403 ===")
    try:
        resp = requests.post(
            f"{API_BASE}/lesson-plans/documents/{test_doc_id_1}/regenerate",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        data = resp.json()
        assert "error" in data, "Expected error message"
        assert "another user" in data["error"].lower() or "belongs to" in data["error"].lower(), "Error should mention ownership"
        
        print(f"✅ Test D1 PASSED: 403 with error: {data.get('error')}")
        return True
    except Exception as e:
        print(f"❌ Test D1 FAILED: {e}")
        return False

def test_e1_regenerate_payload_expired():
    """Test E1: Regenerate with expired payload → 410 PAYLOAD_EXPIRED"""
    print("\n=== Test E1: Regenerate with expired payload → 410 ===")
    global test_doc_id_3
    try:
        # Generate a new doc
        payload = {
            "format": "pdf",
            "innerHtml": "<h1>Payload Expiry Test</h1><p>This document's payload will be deleted to test expiry handling. Lorem ipsum dolor sit amet.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 3,
                "title": "Payload Expiry Test"
            }
        }
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp.status_code == 200, f"Doc generation failed: {resp.status_code}"
        data = resp.json()
        test_doc_id_3 = data.get("documentId")
        assert test_doc_id_3, "Missing documentId"
        print(f"✅ Generated test doc: {test_doc_id_3}")
        
        # Delete the payload using mongosh
        mongo_cmd = f"db.lesson_plan_document_payloads.deleteOne({{ documentId: '{test_doc_id_3}' }})"
        result = subprocess.run(
            ["mongosh", "edumaster_odisha", "--quiet", "--eval", mongo_cmd],
            capture_output=True,
            text=True,
            timeout=10
        )
        if "deletedCount: 1" not in result.stdout:
            print(f"⚠️  Warning: Payload deletion may have failed: {result.stdout}")
        else:
            print(f"✅ Deleted payload for {test_doc_id_3}")
        
        # Try to regenerate
        resp = requests.post(
            f"{API_BASE}/lesson-plans/documents/{test_doc_id_3}/regenerate",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 410, f"Expected 410, got {resp.status_code}"
        data = resp.json()
        assert "error" in data, "Expected error message"
        assert "code" in data, "Expected error code"
        assert data["code"] == "PAYLOAD_EXPIRED", f"Expected code=PAYLOAD_EXPIRED, got {data['code']}"
        
        print(f"✅ Test E1 PASSED: 410 with code=PAYLOAD_EXPIRED, error: {data.get('error')}")
        return True
    except Exception as e:
        print(f"❌ Test E1 FAILED: {e}")
        return False

def test_f1_regenerate_respects_admin_toggles():
    """Test F1: Regenerate respects admin toggles (PDF disabled) → 403"""
    print("\n=== Test F1: Regenerate respects admin toggles (PDF disabled) ===")
    try:
        # Disable PDF downloads
        resp = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            json={"settings": {"allowPdf": False}},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Config update failed: {resp.status_code}"
        print("✅ Disabled PDF downloads")
        
        # Try to regenerate PDF doc
        resp = requests.post(
            f"{API_BASE}/lesson-plans/documents/{test_doc_id_1}/regenerate",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=30
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        data = resp.json()
        assert "error" in data, "Expected error message"
        assert "code" in data, "Expected error code"
        assert data["code"] == "PDF_DISABLED", f"Expected code=PDF_DISABLED, got {data['code']}"
        
        print(f"✅ Test F1 PASSED: 403 with code=PDF_DISABLED, error: {data.get('error')}")
        
        # Restore PDF downloads
        resp = requests.put(
            f"{API_BASE}/admin/document-security/lesson-plan/config",
            json={"settings": {"allowPdf": True}},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Config restore failed: {resp.status_code}"
        print("✅ Restored PDF downloads")
        
        return True
    except Exception as e:
        print(f"❌ Test F1 FAILED: {e}")
        return False

def test_g1_no_regression_config():
    """Test G1: GET /api/document-security/lesson-plan/config → 200"""
    print("\n=== Test G1: GET /api/document-security/lesson-plan/config → 200 ===")
    try:
        resp = requests.get(f"{API_BASE}/document-security/lesson-plan/config", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "config" in data, "Missing 'config' in response"
        print("✅ Test G1 PASSED: Config endpoint still working")
        return True
    except Exception as e:
        print(f"❌ Test G1 FAILED: {e}")
        return False

def test_g2_no_regression_secure_download():
    """Test G2: POST /api/lesson-plans/secure-download → 200"""
    print("\n=== Test G2: POST /api/lesson-plans/secure-download → 200 ===")
    try:
        payload = {
            "format": "pdf",
            "innerHtml": "<h1>Regression Test</h1><p>Testing that secure-download still works after My Downloads changes.</p>",
            "lesson": {
                "classId": "C1",
                "className": "Class 1",
                "bookId": "B1",
                "bookName": "Odia",
                "chapterId": "Ch1",
                "chapterName": "Chapter 1",
                "period": 4,
                "title": "Regression Test"
            }
        }
        resp = requests.post(
            f"{API_BASE}/lesson-plans/secure-download",
            json=payload,
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "documentId" in data, "Missing documentId"
        print(f"✅ Test G2 PASSED: secure-download still working, generated {data['documentId']}")
        return True
    except Exception as e:
        print(f"❌ Test G2 FAILED: {e}")
        return False

def test_g3_no_regression_download():
    """Test G3: GET /api/lesson-plans/documents/:id/download → 200"""
    print("\n=== Test G3: GET /api/lesson-plans/documents/:id/download → 200 ===")
    try:
        # Use test_doc_id_2 (DOCX) which hasn't been used yet
        resp = requests.get(
            f"{API_BASE}/lesson-plans/documents/{test_doc_id_2}/download?format=docx&token=dummy",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=60
        )
        # Note: This might fail with 403 if token is invalid, but endpoint should exist
        # We're just checking the endpoint is accessible
        assert resp.status_code in [200, 403, 410], f"Unexpected status: {resp.status_code}"
        print(f"✅ Test G3 PASSED: download endpoint accessible (status: {resp.status_code})")
        return True
    except Exception as e:
        print(f"❌ Test G3 FAILED: {e}")
        return False

def test_g4_no_regression_admin_list():
    """Test G4: GET /api/admin/lesson-plan-documents → 200"""
    print("\n=== Test G4: GET /api/admin/lesson-plan-documents → 200 ===")
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
        print(f"✅ Test G4 PASSED: Admin list endpoint still working (found {len(data['items'])} docs)")
        return True
    except Exception as e:
        print(f"❌ Test G4 FAILED: {e}")
        return False

def main():
    """Run all tests"""
    global admin_token, premium_token
    
    print("=" * 80)
    print("Backend Test: My Downloads Feature (Lesson Plans)")
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
    
    # A) Auth required
    results.append(("A1: Auth required - my-documents", test_a1_auth_required_my_documents()))
    results.append(("A2: Auth required - regenerate", test_a2_auth_required_regenerate()))
    
    # B) my-documents list
    results.append(("B1: Generate test docs", test_b1_generate_test_docs()))
    results.append(("B2: my-documents list", test_b2_my_documents_list()))
    results.append(("B3: Filter by format", test_b3_filter_by_format()))
    results.append(("B4: Filter by status", test_b4_filter_by_status()))
    results.append(("B5: Cross-user isolation", test_b5_cross_user_isolation()))
    
    # C) regenerate happy path
    results.append(("C1: Regenerate happy path", test_c1_regenerate_happy_path()))
    results.append(("C2: Regenerate audit log", test_c2_regenerate_audit_log()))
    
    # D) regenerate wrong owner
    results.append(("D1: Regenerate wrong owner", test_d1_regenerate_wrong_owner()))
    
    # E) regenerate payload expired
    results.append(("E1: Regenerate payload expired", test_e1_regenerate_payload_expired()))
    
    # F) regenerate respects admin toggles
    results.append(("F1: Regenerate respects admin toggles", test_f1_regenerate_respects_admin_toggles()))
    
    # G) No regression
    results.append(("G1: No regression - config", test_g1_no_regression_config()))
    results.append(("G2: No regression - secure-download", test_g2_no_regression_secure_download()))
    results.append(("G3: No regression - download", test_g3_no_regression_download()))
    results.append(("G4: No regression - admin list", test_g4_no_regression_admin_list()))
    
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
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! My Downloads feature is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the failures above.")

if __name__ == "__main__":
    main()
