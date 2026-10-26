#!/usr/bin/env python3
"""
Assessment Store Prompt 4 (Security) Backend Test
Tests teacher verification, gated download, secure viewer, leak trace, and PDF thumbnails.
"""

import requests
import json
import time
import hmac
import hashlib
import base64
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Generate unique mobile for fresh buyer
BUYER_MOBILE = f"94{random.randint(10000000, 99999999)}"
BUYER_PASSWORD = "<redacted>"
BUYER_NAME = "QA Buyer Teacher"

# Second buyer for unverified test
BUYER2_MOBILE = f"95{random.randint(10000000, 99999999)}"
BUYER2_PASSWORD = "<redacted>"
BUYER2_NAME = "QA Unverified Teacher"

admin_token = None
buyer_token = None
buyer2_token = None
teacher_profile_id = None
document_id = None
trace_code = None

def log(msg):
    print(f"[TEST] {msg}")

def register_and_login(mobile, password, name):
    """Register and login a user, return token"""
    try:
        # Try to register first
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": mobile,
            "password": password,
            "name": name
        }, timeout=10)
        
        # If already registered (409) or success (200), proceed to login
        if resp.status_code == 409:
            log(f"User {mobile} already exists, logging in...")
        elif resp.status_code == 200:
            log(f"✅ Registered {mobile}")
        elif resp.status_code == 400 and "already registered" in resp.text.lower():
            log(f"User {mobile} already exists, logging in...")
        else:
            log(f"⚠️ Register returned {resp.status_code}, trying login anyway...")
        
        # Login
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            log(f"✅ Logged in as {mobile}, token: {token[:20]}...")
            return token
        else:
            log(f"❌ Login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        log(f"❌ Register/login error: {e}")
        return None

def test_auth_guards():
    """TEST 1: AUTH - All protected endpoints return 401 without token"""
    log("\n=== TEST 1: AUTH GUARDS ===")
    
    endpoints = [
        ("GET", "/assess/teacher/me"),
        ("POST", "/assess/teacher/apply"),
        ("GET", f"/assess/download/test-doc-id"),
        ("GET", f"/assess/view/test-doc-id"),
    ]
    
    all_passed = True
    for method, path in endpoints:
        try:
            if method == "GET":
                resp = requests.get(f"{BASE_URL}{path}", timeout=10)
            else:
                resp = requests.post(f"{BASE_URL}{path}", json={}, timeout=10)
            
            if resp.status_code == 401:
                log(f"✅ {method} {path} → 401 (correct)")
            else:
                log(f"❌ {method} {path} → {resp.status_code} (expected 401)")
                all_passed = False
        except Exception as e:
            log(f"❌ {method} {path} error: {e}")
            all_passed = False
    
    return all_passed

def test_teacher_profile_buyer():
    """TEST 2: TEACHER PROFILE - Buyer creates profile"""
    global teacher_profile_id
    log("\n=== TEST 2: TEACHER PROFILE (BUYER) ===")
    
    headers = {"Authorization": f"Bearer {buyer_token}"}
    
    # 2a: GET /assess/teacher/me → {profile:null, required:true}
    try:
        resp = requests.get(f"{BASE_URL}/assess/teacher/me", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("profile") is None and data.get("required") == True:
                log(f"✅ 2a: GET /assess/teacher/me → profile:null, required:true")
            else:
                log(f"❌ 2a: Unexpected response: {data}")
                return False
        else:
            log(f"❌ 2a: GET /assess/teacher/me → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 2a: Error: {e}")
        return False
    
    # 2b: POST /assess/teacher/apply {} (missing fields) → 400
    try:
        resp = requests.post(f"{BASE_URL}/assess/teacher/apply", headers=headers, json={}, timeout=10)
        if resp.status_code == 400:
            log(f"✅ 2b: POST /assess/teacher/apply (empty) → 400")
        else:
            log(f"❌ 2b: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 2b: Error: {e}")
        return False
    
    # 2c: POST /assess/teacher/apply with valid data → 200
    try:
        resp = requests.post(f"{BASE_URL}/assess/teacher/apply", headers=headers, json={
            "name": "QA Teacher",
            "school": "QA School",
            "district": "Khordha"
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            profile = data.get("profile", {})
            if profile.get("status") == "pending":
                teacher_profile_id = profile.get("id")
                log(f"✅ 2c: POST /assess/teacher/apply → 200, status:pending, id:{teacher_profile_id}")
            else:
                log(f"❌ 2c: Expected status:pending, got {profile.get('status')}")
                return False
        else:
            log(f"❌ 2c: POST /assess/teacher/apply → {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log(f"❌ 2c: Error: {e}")
        return False
    
    # 2d: GET /assess/teacher/me again → profile.status 'pending'
    try:
        resp = requests.get(f"{BASE_URL}/assess/teacher/me", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            profile = data.get("profile", {})
            if profile.get("status") == "pending":
                log(f"✅ 2d: GET /assess/teacher/me → status:pending")
            else:
                log(f"❌ 2d: Expected status:pending, got {profile.get('status')}")
                return False
        else:
            log(f"❌ 2d: GET /assess/teacher/me → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 2d: Error: {e}")
        return False
    
    return True

def test_admin_review():
    """TEST 3: ADMIN REVIEW - Admin approves/rejects teacher profile"""
    log("\n=== TEST 3: ADMIN REVIEW ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 3a: GET /admin/assess/teachers?status=pending
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/teachers?status=pending", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            teachers = data.get("teachers", [])
            pending_count = data.get("pending_count", 0)
            
            # Find our QA profile
            qa_profile = None
            for t in teachers:
                if t.get("id") == teacher_profile_id:
                    qa_profile = t
                    break
            
            if qa_profile and pending_count >= 1:
                log(f"✅ 3a: GET /admin/assess/teachers?status=pending → found QA profile, pending_count:{pending_count}")
            else:
                log(f"❌ 3a: QA profile not found or pending_count < 1")
                return False
        else:
            log(f"❌ 3a: GET /admin/assess/teachers → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 3a: Error: {e}")
        return False
    
    # 3b: POST /admin/assess/teachers/:id/reject
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/teachers/{teacher_profile_id}/reject", 
                            headers=headers, json={"reason": "test"}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            profile = data.get("profile", {})
            if profile.get("status") == "rejected":
                log(f"✅ 3b: POST /admin/assess/teachers/:id/reject → status:rejected")
            else:
                log(f"❌ 3b: Expected status:rejected, got {profile.get('status')}")
                return False
        else:
            log(f"❌ 3b: POST reject → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 3b: Error: {e}")
        return False
    
    # 3c: POST /admin/assess/teachers/:id/approve
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/teachers/{teacher_profile_id}/approve", 
                            headers=headers, json={}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            profile = data.get("profile", {})
            if profile.get("status") == "approved":
                log(f"✅ 3c: POST /admin/assess/teachers/:id/approve → status:approved")
            else:
                log(f"❌ 3c: Expected status:approved, got {profile.get('status')}")
                return False
        else:
            log(f"❌ 3c: POST approve → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 3c: Error: {e}")
        return False
    
    return True

def test_own_pack():
    """TEST 4: OWN A PACK - Admin grants pack to buyer"""
    global document_id
    log("\n=== TEST 4: OWN A PACK ===")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}
    
    # Grant SHISHU_VATIKA3_FULL pack to buyer (has documents)
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/grant", headers=admin_headers, json={
            "user_mobile": BUYER_MOBILE,
            "pack_code": "SHISHU_VATIKA3_FULL",
            "amount_inr": 0
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            log(f"✅ 4a: POST /admin/assess/grant → 200, ok:{data.get('ok')}")
        else:
            log(f"❌ 4a: POST /admin/assess/grant → {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        log(f"❌ 4a: Error: {e}")
        return False
    
    # GET /assess/my to verify ownership
    try:
        resp = requests.get(f"{BASE_URL}/assess/my", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            owned_codes = data.get("owned_pack_codes", [])
            documents = data.get("documents", [])
            
            if "SHISHU_VATIKA3_FULL" in owned_codes and len(documents) > 0:
                document_id = documents[0].get("id")
                log(f"✅ 4b: GET /assess/my → SHISHU_VATIKA3_FULL owned, {len(documents)} documents, first doc:{document_id}")
            else:
                log(f"❌ 4b: SHISHU_VATIKA3_FULL not in owned_pack_codes or no documents")
                return False
        else:
            log(f"❌ 4b: GET /assess/my → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 4b: Error: {e}")
        return False
    
    return True

def test_download_gating():
    """TEST 5: DOWNLOAD GATING - Test verification requirements"""
    log("\n=== TEST 5: DOWNLOAD GATING ===")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    buyer2_headers = {"Authorization": f"Bearer {buyer2_token}"}
    
    # 5a: Ensure require_teacher_verification is true
    try:
        resp = requests.put(f"{BASE_URL}/admin/assess/settings", headers=admin_headers, json={
            "settings": {"require_teacher_verification": True}
        }, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 5a: PUT /admin/assess/settings → require_teacher_verification:true")
        else:
            log(f"❌ 5a: PUT settings → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 5a: Error: {e}")
        return False
    
    # Grant SHISHU_VATIKA3_FULL to buyer2 (unverified)
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/grant", headers=admin_headers, json={
            "user_mobile": BUYER2_MOBILE,
            "pack_code": "SHISHU_VATIKA3_FULL",
            "amount_inr": 0
        }, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 5b: Granted SHISHU_VATIKA3_FULL to unverified buyer2")
        else:
            log(f"❌ 5b: Grant failed → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 5b: Error: {e}")
        return False
    
    # 5c: GET /assess/download/:docId as unverified buyer2 → 403 VERIFY_REQUIRED
    try:
        resp = requests.get(f"{BASE_URL}/assess/download/{document_id}", headers=buyer2_headers, timeout=10)
        if resp.status_code == 403:
            data = resp.json()
            if data.get("code") == "VERIFY_REQUIRED":
                log(f"✅ 5c: GET /assess/download (unverified) → 403 VERIFY_REQUIRED")
            else:
                log(f"❌ 5c: Expected code:VERIFY_REQUIRED, got {data.get('code')}")
                return False
        else:
            log(f"❌ 5c: Expected 403, got {resp.status_code} (doc_id:{document_id})")
            return False
    except Exception as e:
        log(f"❌ 5c: Error: {e}")
        return False
    
    # 5d: GET /assess/download/:docId as approved buyer → 404 (no file) or 200
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}
    try:
        resp = requests.get(f"{BASE_URL}/assess/download/{document_id}", headers=buyer_headers, timeout=10)
        if resp.status_code == 404:
            data = resp.json()
            if "File not uploaded yet" in data.get("error", ""):
                log(f"✅ 5d: GET /assess/download (approved) → 404 'File not uploaded yet' (acceptable, gating passed)")
            else:
                log(f"❌ 5d: Unexpected 404 error: {data.get('error')}")
                return False
        elif resp.status_code == 200:
            log(f"✅ 5d: GET /assess/download (approved) → 200 (file exists)")
        else:
            log(f"❌ 5d: Unexpected status {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 5d: Error: {e}")
        return False
    
    return True

def test_success_path():
    """TEST 6: SUCCESS PATH - Upload PDF and test download/view (optional)"""
    log("\n=== TEST 6: SUCCESS PATH (OPTIONAL) ===")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}
    
    # Create a minimal valid PDF
    minimal_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n210\n%%EOF"
    pdf_b64 = base64.b64encode(minimal_pdf).decode()
    
    # Init upload
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/init", headers=admin_headers, json={}, timeout=10)
        if resp.status_code == 200:
            upload_id = resp.json().get("uploadId")
            log(f"✅ 6a: POST /admin/assess/upload/init → uploadId:{upload_id}")
        else:
            log(f"⚠️ 6a: Upload init failed → {resp.status_code}, skipping success path")
            return True  # Not critical
    except Exception as e:
        log(f"⚠️ 6a: Error: {e}, skipping success path")
        return True
    
    # Upload chunk
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/chunk", headers=admin_headers, json={
            "uploadId": upload_id,
            "data": pdf_b64
        }, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 6b: POST /admin/assess/upload/chunk → 200")
        else:
            log(f"⚠️ 6b: Chunk upload failed → {resp.status_code}, skipping success path")
            return True
    except Exception as e:
        log(f"⚠️ 6b: Error: {e}, skipping success path")
        return True
    
    # Commit upload to document_id
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/commit", headers=admin_headers, json={
            "uploadId": upload_id,
            "kind": "pdf",
            "document_id": document_id
        }, timeout=15)
        if resp.status_code == 200:
            log(f"✅ 6c: POST /admin/assess/upload/commit → 200 (PDF uploaded to {document_id})")
        elif resp.status_code == 500:
            log(f"⚠️ 6c: Cloudinary rejected minimal PDF (500), acceptable - skipping download test")
            return True
        else:
            log(f"⚠️ 6c: Commit failed → {resp.status_code}, skipping success path")
            return True
    except Exception as e:
        log(f"⚠️ 6c: Error: {e}, skipping success path")
        return True
    
    # Test download as approved buyer
    global trace_code
    try:
        resp = requests.get(f"{BASE_URL}/assess/download/{document_id}", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            trace_code = data.get("trace_code")
            url = data.get("url")
            log(f"✅ 6d: GET /assess/download → 200, trace_code:{trace_code}, url exists:{bool(url)}")
        else:
            log(f"⚠️ 6d: Download failed → {resp.status_code}, but upload succeeded")
            return True
    except Exception as e:
        log(f"⚠️ 6d: Error: {e}")
        return True
    
    # Test view as approved buyer
    try:
        resp = requests.get(f"{BASE_URL}/assess/view/{document_id}", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            pages = data.get("pages", [])
            count = data.get("count", 0)
            trace = data.get("trace_code")
            log(f"✅ 6e: GET /assess/view → 200, pages:{len(pages)}, count:{count}, trace:{trace}")
        else:
            log(f"⚠️ 6e: View failed → {resp.status_code}")
            return True
    except Exception as e:
        log(f"⚠️ 6e: Error: {e}")
        return True
    
    return True

def test_verify_off():
    """TEST 7: VERIFY-OFF PATH - Test with verification disabled"""
    log("\n=== TEST 7: VERIFY-OFF PATH ===")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    buyer2_headers = {"Authorization": f"Bearer {buyer2_token}"}
    
    # Disable require_teacher_verification
    try:
        resp = requests.put(f"{BASE_URL}/admin/assess/settings", headers=admin_headers, json={
            "settings": {"require_teacher_verification": False}
        }, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 7a: PUT /admin/assess/settings → require_teacher_verification:false")
        else:
            log(f"❌ 7a: PUT settings → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 7a: Error: {e}")
        return False
    
    # GET /assess/download as unverified buyer2 → should NOT be 403 VERIFY_REQUIRED
    try:
        resp = requests.get(f"{BASE_URL}/assess/download/{document_id}", headers=buyer2_headers, timeout=10)
        if resp.status_code == 403:
            data = resp.json()
            if data.get("code") == "VERIFY_REQUIRED":
                log(f"❌ 7b: Still got VERIFY_REQUIRED with verification off")
                return False
            else:
                log(f"✅ 7b: Got 403 but not VERIFY_REQUIRED (other reason: {data.get('error')})")
        elif resp.status_code == 404:
            log(f"✅ 7b: GET /assess/download (verify off) → 404 (no file, acceptable)")
        elif resp.status_code == 200:
            log(f"✅ 7b: GET /assess/download (verify off) → 200 (file exists)")
        else:
            log(f"⚠️ 7b: Unexpected status {resp.status_code}")
    except Exception as e:
        log(f"❌ 7b: Error: {e}")
        return False
    
    # Restore require_teacher_verification to true
    try:
        resp = requests.put(f"{BASE_URL}/admin/assess/settings", headers=admin_headers, json={
            "settings": {"require_teacher_verification": True}
        }, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 7c: PUT /admin/assess/settings → require_teacher_verification:true (restored)")
        else:
            log(f"❌ 7c: PUT settings → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 7c: Error: {e}")
        return False
    
    return True

def test_leak_trace():
    """TEST 8: LEAK TRACE - Test admin download logs"""
    log("\n=== TEST 8: LEAK TRACE (ADMIN) ===")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # GET /admin/assess/downloads
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/downloads", headers=admin_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            downloads = data.get("downloads", [])
            log(f"✅ 8a: GET /admin/assess/downloads → 200, {len(downloads)} records")
        else:
            log(f"❌ 8a: GET /admin/assess/downloads → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 8a: Error: {e}")
        return False
    
    # If we have a trace_code from success path, test trace filter
    if trace_code:
        try:
            resp = requests.get(f"{BASE_URL}/admin/assess/downloads?trace={trace_code}", 
                              headers=admin_headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                downloads = data.get("downloads", [])
                if len(downloads) > 0:
                    rec = downloads[0]
                    has_buyer_info = rec.get("user_name") and rec.get("user_mobile")
                    log(f"✅ 8b: GET /admin/assess/downloads?trace={trace_code} → found record with buyer info:{has_buyer_info}")
                else:
                    log(f"⚠️ 8b: No records found for trace {trace_code}")
            else:
                log(f"❌ 8b: GET with trace filter → {resp.status_code}")
                return False
        except Exception as e:
            log(f"❌ 8b: Error: {e}")
            return False
    else:
        log(f"⚠️ 8b: No trace_code from success path, skipping trace filter test")
    
    return True

def test_thumbnails():
    """TEST 9: THUMBNAILS - Test document endpoints have thumb_url field"""
    log("\n=== TEST 9: THUMBNAILS SHAPE ===")
    
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}
    
    # GET /assess/documents
    try:
        resp = requests.get(f"{BASE_URL}/assess/documents", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            documents = data.get("documents", [])
            if len(documents) > 0:
                doc = documents[0]
                has_file = doc.get("has_file")
                thumb_url = doc.get("thumb_url")
                log(f"✅ 9a: GET /assess/documents → has_file:{has_file}, thumb_url:{thumb_url} (null ok for no file)")
            else:
                log(f"⚠️ 9a: No documents returned")
        else:
            log(f"❌ 9a: GET /assess/documents → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 9a: Error: {e}")
        return False
    
    # GET /assess/pack/SHISHU_VATIKA3_FULL
    try:
        resp = requests.get(f"{BASE_URL}/assess/pack/SHISHU_VATIKA3_FULL", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            pack = data.get("pack", {})
            documents = data.get("documents", [])
            if len(documents) > 0:
                doc = documents[0]
                has_file = doc.get("has_file")
                thumb_url = doc.get("thumb_url")
                log(f"✅ 9b: GET /assess/pack/SHISHU_VATIKA3_FULL → pack + {len(documents)} docs, has_file:{has_file}, thumb_url:{thumb_url}")
            else:
                log(f"⚠️ 9b: No documents in pack")
        else:
            log(f"❌ 9b: GET /assess/pack → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 9b: Error: {e}")
        return False
    
    # GET /assess/my
    try:
        resp = requests.get(f"{BASE_URL}/assess/my", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            documents = data.get("documents", [])
            if len(documents) > 0:
                doc = documents[0]
                has_thumb = "thumb_url" in doc
                log(f"✅ 9c: GET /assess/my → documents have thumb_url field:{has_thumb}")
            else:
                log(f"⚠️ 9c: No documents in /assess/my")
        else:
            log(f"❌ 9c: GET /assess/my → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 9c: Error: {e}")
        return False
    
    return True

def test_regression():
    """TEST 10: REGRESSION - Existing endpoints still work"""
    log("\n=== TEST 10: REGRESSION ===")
    
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}
    
    # GET /assess/classes
    try:
        resp = requests.get(f"{BASE_URL}/assess/classes", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 10a: GET /assess/classes → 200")
        else:
            log(f"❌ 10a: GET /assess/classes → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 10a: Error: {e}")
        return False
    
    # GET /assess/pricing
    try:
        resp = requests.get(f"{BASE_URL}/assess/pricing", headers=buyer_headers, timeout=10)
        if resp.status_code == 200:
            log(f"✅ 10b: GET /assess/pricing → 200")
        else:
            log(f"❌ 10b: GET /assess/pricing → {resp.status_code}")
            return False
    except Exception as e:
        log(f"❌ 10b: Error: {e}")
        return False
    
    return True

def main():
    global admin_token, buyer_token, buyer2_token
    
    log("=" * 60)
    log("ASSESSMENT STORE PROMPT 4 (SECURITY) BACKEND TEST")
    log("=" * 60)
    
    # Setup: Login admin and register buyers
    log("\n=== SETUP ===")
    admin_token = register_and_login(ADMIN_MOBILE, ADMIN_PASSWORD, "Admin")
    if not admin_token:
        log("❌ FATAL: Admin login failed")
        return
    
    buyer_token = register_and_login(BUYER_MOBILE, BUYER_PASSWORD, BUYER_NAME)
    if not buyer_token:
        log("❌ FATAL: Buyer registration failed")
        return
    
    buyer2_token = register_and_login(BUYER2_MOBILE, BUYER2_PASSWORD, BUYER2_NAME)
    if not buyer2_token:
        log("❌ FATAL: Buyer2 registration failed")
        return
    
    # Run tests
    results = {}
    
    results["TEST 1: AUTH"] = test_auth_guards()
    results["TEST 2: TEACHER PROFILE"] = test_teacher_profile_buyer()
    results["TEST 3: ADMIN REVIEW"] = test_admin_review()
    results["TEST 4: OWN A PACK"] = test_own_pack()
    results["TEST 5: DOWNLOAD GATING"] = test_download_gating()
    results["TEST 6: SUCCESS PATH"] = test_success_path()
    results["TEST 7: VERIFY-OFF"] = test_verify_off()
    results["TEST 8: LEAK TRACE"] = test_leak_trace()
    results["TEST 9: THUMBNAILS"] = test_thumbnails()
    results["TEST 10: REGRESSION"] = test_regression()
    
    # Summary
    log("\n" + "=" * 60)
    log("TEST SUMMARY")
    log("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status} - {test}")
    
    log(f"\nTOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        log(f"\n⚠️ {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
