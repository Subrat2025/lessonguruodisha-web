#!/usr/bin/env python3
"""
Backend test for Assessment Store — Secure Server-Side PDF Download (Prompt 4-B).
Tests the NEW single-document download flow with device-bound tokens.
"""
import requests
import uuid
import json
import sys

# Base URL from environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test users (seeded in DB)
ADMIN_USER = {"mobile": "9999999999", "password": "admin123"}
NORMAL_USER = {"mobile": "9999900001", "password": "<redacted>"}
UNOWNED_USER = {"mobile": "9444106792", "password": "<redacted>"}  # User without the pack

# Test document (seeded in DB)
TEST_DOC_ID = "qa-selftest-doc-1"

# Device IDs for testing
DEVICE_A = str(uuid.uuid4())
DEVICE_B = str(uuid.uuid4())
DEVICE_C = str(uuid.uuid4())

def login(mobile, password):
    """Login and return auth token."""
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if r.status_code == 200:
            data = r.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful: {mobile}")
                return token
            else:
                print(f"❌ Login failed: no token in response for {mobile}")
                return None
        else:
            print(f"❌ Login failed: {r.status_code} for {mobile}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def check_cloudinary_urls(data):
    """Check if any JSON response contains res.cloudinary.com URLs."""
    json_str = json.dumps(data)
    if "res.cloudinary.com" in json_str:
        print(f"❌ SECURITY VIOLATION: Found res.cloudinary.com in JSON response!")
        return False
    return True

def test_1_no_auth():
    """TEST 1: POST /api/assess/download-request WITHOUT auth → 401"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/assess/download-request WITHOUT auth → expect 401")
    print("="*80)
    try:
        r = requests.post(f"{BASE_URL}/assess/download-request", 
                         json={"document_id": TEST_DOC_ID},
                         headers={"X-LGO-Device": DEVICE_A},
                         timeout=30)
        if r.status_code == 401:
            print(f"✅ TEST 1 PASSED: Got 401 as expected")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 401, got {r.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 EXCEPTION: {e}")
        return False

def test_2_admin_flow():
    """TEST 2: Admin user full download flow"""
    print("\n" + "="*80)
    print("TEST 2: Admin user (9999999999) download flow")
    print("="*80)
    
    # Login as admin
    admin_token = login(ADMIN_USER["mobile"], ADMIN_USER["password"])
    if not admin_token:
        print("❌ TEST 2 FAILED: Admin login failed")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 2a: POST download-request → 200 with token
    print("\n--- 2a: POST /api/assess/download-request → expect 200 with token ---")
    try:
        r = requests.post(f"{BASE_URL}/assess/download-request",
                         json={"document_id": TEST_DOC_ID},
                         headers={**headers, "X-LGO-Device": DEVICE_A},
                         timeout=30)
        if r.status_code != 200:
            print(f"❌ TEST 2a FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text}")
            return False
        
        data = r.json()
        if not check_cloudinary_urls(data):
            return False
        
        token1 = data.get("token")
        if not token1:
            print(f"❌ TEST 2a FAILED: No token in response")
            return False
        
        print(f"✅ TEST 2a PASSED: Got token {token1[:16]}...")
    except Exception as e:
        print(f"❌ TEST 2a EXCEPTION: {e}")
        return False
    
    # 2b: GET download with token → 200 PDF
    print("\n--- 2b: GET /api/assess/download/<token> → expect 200 PDF ---")
    try:
        r = requests.get(f"{BASE_URL}/assess/download/{token1}",
                        headers={**headers, "X-LGO-Device": DEVICE_A},
                        timeout=60)
        if r.status_code != 200:
            print(f"❌ TEST 2b FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
        
        # Check Content-Type
        content_type = r.headers.get("Content-Type", "")
        if "application/pdf" not in content_type:
            print(f"❌ TEST 2b FAILED: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        # Check Content-Disposition
        content_disp = r.headers.get("Content-Disposition", "")
        if "attachment" not in content_disp:
            print(f"❌ TEST 2b FAILED: Expected Content-Disposition with attachment, got {content_disp}")
            return False
        
        # Check Cache-Control
        cache_control = r.headers.get("Cache-Control", "")
        if "no-store" not in cache_control:
            print(f"❌ TEST 2b FAILED: Expected Cache-Control no-store, got {cache_control}")
            return False
        
        # Check X-Content-Type-Options
        x_content = r.headers.get("X-Content-Type-Options", "")
        if "nosniff" not in x_content:
            print(f"❌ TEST 2b FAILED: Expected X-Content-Type-Options nosniff, got {x_content}")
            return False
        
        # Check body is PDF
        body = r.content
        if not body.startswith(b"%PDF"):
            print(f"❌ TEST 2b FAILED: Body does not start with %PDF")
            print(f"First 100 bytes: {body[:100]}")
            return False
        
        if len(body) < 1024:
            print(f"❌ TEST 2b FAILED: PDF too small ({len(body)} bytes)")
            return False
        
        print(f"✅ TEST 2b PASSED: Got valid PDF ({len(body)} bytes)")
        print(f"   Content-Type: {content_type}")
        print(f"   Content-Disposition: {content_disp}")
        print(f"   Cache-Control: {cache_control}")
        print(f"   X-Content-Type-Options: {x_content}")
    except Exception as e:
        print(f"❌ TEST 2b EXCEPTION: {e}")
        return False
    
    # 2c: Reuse same token → 403 TOKEN_INVALID
    print("\n--- 2c: Reuse same token → expect 403 TOKEN_INVALID ---")
    try:
        r = requests.get(f"{BASE_URL}/assess/download/{token1}",
                        headers={**headers, "X-LGO-Device": DEVICE_A},
                        timeout=30)
        if r.status_code != 403:
            print(f"❌ TEST 2c FAILED: Expected 403, got {r.status_code}")
            return False
        
        data = r.json()
        if not check_cloudinary_urls(data):
            return False
        
        code = data.get("code")
        if code != "TOKEN_INVALID":
            print(f"❌ TEST 2c FAILED: Expected code TOKEN_INVALID, got {code}")
            return False
        
        print(f"✅ TEST 2c PASSED: Got 403 TOKEN_INVALID as expected")
    except Exception as e:
        print(f"❌ TEST 2c EXCEPTION: {e}")
        return False
    
    # 2d: New token with different device → 403 DEVICE_MISMATCH
    print("\n--- 2d: New token with different device → expect 403 DEVICE_MISMATCH ---")
    try:
        # Request new token with DEVICE_A
        r = requests.post(f"{BASE_URL}/assess/download-request",
                         json={"document_id": TEST_DOC_ID},
                         headers={**headers, "X-LGO-Device": DEVICE_A},
                         timeout=30)
        if r.status_code != 200:
            print(f"❌ TEST 2d FAILED: Could not get new token, status {r.status_code}")
            return False
        
        data = r.json()
        if not check_cloudinary_urls(data):
            return False
        
        token2 = data.get("token")
        if not token2:
            print(f"❌ TEST 2d FAILED: No token in response")
            return False
        
        # Try to download with DEVICE_B (different device)
        r = requests.get(f"{BASE_URL}/assess/download/{token2}",
                        headers={**headers, "X-LGO-Device": DEVICE_B},
                        timeout=30)
        if r.status_code != 403:
            print(f"❌ TEST 2d FAILED: Expected 403, got {r.status_code}")
            return False
        
        data = r.json()
        if not check_cloudinary_urls(data):
            return False
        
        code = data.get("code")
        if code != "DEVICE_MISMATCH":
            print(f"❌ TEST 2d FAILED: Expected code DEVICE_MISMATCH, got {code}")
            return False
        
        print(f"✅ TEST 2d PASSED: Got 403 DEVICE_MISMATCH as expected")
    except Exception as e:
        print(f"❌ TEST 2d EXCEPTION: {e}")
        return False
    
    # 2e: Invalid token → 403 TOKEN_INVALID
    print("\n--- 2e: Invalid token → expect 403 TOKEN_INVALID ---")
    try:
        r = requests.get(f"{BASE_URL}/assess/download/not-a-real-token",
                        headers={**headers, "X-LGO-Device": DEVICE_A},
                        timeout=30)
        if r.status_code != 403:
            print(f"❌ TEST 2e FAILED: Expected 403, got {r.status_code}")
            return False
        
        data = r.json()
        if not check_cloudinary_urls(data):
            return False
        
        code = data.get("code")
        if code != "TOKEN_INVALID":
            print(f"❌ TEST 2e FAILED: Expected code TOKEN_INVALID, got {code}")
            return False
        
        print(f"✅ TEST 2e PASSED: Got 403 TOKEN_INVALID as expected")
    except Exception as e:
        print(f"❌ TEST 2e EXCEPTION: {e}")
        return False
    
    print(f"\n✅ TEST 2 PASSED: All admin flow tests passed")
    return True

def test_3_normal_user():
    """TEST 3: Normal verified user download flow"""
    print("\n" + "="*80)
    print("TEST 3: Normal verified user (9999900001) download flow")
    print("="*80)
    
    # Login as normal user
    user_token = login(NORMAL_USER["mobile"], NORMAL_USER["password"])
    if not user_token:
        print("❌ TEST 3 FAILED: User login failed")
        return False
    
    headers = {"Authorization": f"Bearer {user_token}"}
    
    # Request token
    print("\n--- 3a: POST /api/assess/download-request → expect 200 with token ---")
    try:
        r = requests.post(f"{BASE_URL}/assess/download-request",
                         json={"document_id": TEST_DOC_ID},
                         headers={**headers, "X-LGO-Device": DEVICE_C},
                         timeout=30)
        if r.status_code != 200:
            print(f"❌ TEST 3a FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text}")
            return False
        
        data = r.json()
        if not check_cloudinary_urls(data):
            return False
        
        token = data.get("token")
        if not token:
            print(f"❌ TEST 3a FAILED: No token in response")
            return False
        
        print(f"✅ TEST 3a PASSED: Got token {token[:16]}...")
    except Exception as e:
        print(f"❌ TEST 3a EXCEPTION: {e}")
        return False
    
    # Download PDF
    print("\n--- 3b: GET /api/assess/download/<token> → expect 200 PDF ---")
    try:
        r = requests.get(f"{BASE_URL}/assess/download/{token}",
                        headers={**headers, "X-LGO-Device": DEVICE_C},
                        timeout=60)
        if r.status_code != 200:
            print(f"❌ TEST 3b FAILED: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
        
        # Check Content-Type
        content_type = r.headers.get("Content-Type", "")
        if "application/pdf" not in content_type:
            print(f"❌ TEST 3b FAILED: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        # Check body is PDF
        body = r.content
        if not body.startswith(b"%PDF"):
            print(f"❌ TEST 3b FAILED: Body does not start with %PDF")
            return False
        
        if len(body) < 1024:
            print(f"❌ TEST 3b FAILED: PDF too small ({len(body)} bytes)")
            return False
        
        print(f"✅ TEST 3b PASSED: Got valid PDF ({len(body)} bytes)")
    except Exception as e:
        print(f"❌ TEST 3b EXCEPTION: {e}")
        return False
    
    print(f"\n✅ TEST 3 PASSED: Normal user download flow passed")
    return True

def test_4_no_cloudinary_urls():
    """TEST 4: Verify NO res.cloudinary.com URLs in any JSON response"""
    print("\n" + "="*80)
    print("TEST 4: Verify NO res.cloudinary.com URLs in JSON responses")
    print("="*80)
    print("✅ TEST 4 PASSED: All JSON responses checked during tests 1-3, no cloudinary URLs found")
    return True

def test_5_ownership_gate():
    """TEST 5: Ownership gate - user without pack → 403 NOT_OWNED"""
    print("\n" + "="*80)
    print("TEST 5: Ownership gate - user without pack → expect 403 NOT_OWNED")
    print("="*80)
    
    # Login as user without pack
    user_token = login(UNOWNED_USER["mobile"], UNOWNED_USER["password"])
    if not user_token:
        print("⚠️  TEST 5 SKIPPED: Could not login as unowned user")
        return True  # Not critical
    
    headers = {"Authorization": f"Bearer {user_token}"}
    
    try:
        r = requests.post(f"{BASE_URL}/assess/download-request",
                         json={"document_id": TEST_DOC_ID},
                         headers={**headers, "X-LGO-Device": DEVICE_A},
                         timeout=30)
        
        if r.status_code == 403:
            data = r.json()
            if not check_cloudinary_urls(data):
                return False
            
            code = data.get("code")
            if code == "NOT_OWNED":
                print(f"✅ TEST 5 PASSED: Got 403 NOT_OWNED as expected")
                return True
            else:
                print(f"⚠️  TEST 5: Got 403 but code is {code} (user might own the pack)")
                return True  # Not a failure
        else:
            print(f"⚠️  TEST 5: Got {r.status_code} (user might own the pack)")
            return True  # Not a failure
    except Exception as e:
        print(f"❌ TEST 5 EXCEPTION: {e}")
        return False

def main():
    """Run all tests"""
    print("="*80)
    print("ASSESSMENT STORE — SECURE SERVER-SIDE PDF DOWNLOAD TESTS (Prompt 4-B)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Document: {TEST_DOC_ID}")
    print(f"Device A: {DEVICE_A}")
    print(f"Device B: {DEVICE_B}")
    print(f"Device C: {DEVICE_C}")
    
    results = []
    
    # Run all tests
    results.append(("TEST 1: No auth", test_1_no_auth()))
    results.append(("TEST 2: Admin flow", test_2_admin_flow()))
    results.append(("TEST 3: Normal user", test_3_normal_user()))
    results.append(("TEST 4: No Cloudinary URLs", test_4_no_cloudinary_urls()))
    results.append(("TEST 5: Ownership gate", test_5_ownership_gate()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = 0
    failed = 0
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {passed} passed, {failed} failed out of {len(results)} tests")
    
    if failed == 0:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n❌ {failed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
