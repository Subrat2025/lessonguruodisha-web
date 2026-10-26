#!/usr/bin/env python3
"""
HARDENED Academic Resources Secure Viewer + Secure Download Proxy Test
Tests 8 scenarios as specified in the review request:
1. pdf-view minting (streamUrl with t=, ttl=300, no cloudinary)
2. pdf-stream happy path (account + token + device)
3. logged-out copied link fails
4. cross-account copied link fails
5. invalid/expired token fails
6. device binding
7. secure download proxy
8. regression: official papers still stream
"""

import requests
import json
import os
import re

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials (User A)
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test user credentials (User B)
TEST_USER_MOBILE = "8000000001"
TEST_USER_PASSWORD = "<redacted>"

def login(mobile, password):
    """Login and return token"""
    resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password})
    if resp.status_code == 200:
        data = resp.json()
        return data.get('token'), data.get('user', {}).get('id')
    return None, None

def test_pdf_view_minting(token_a, device_a="deviceA"):
    """TEST 1: pdf-view minting returns streamUrl with t=, ttl=300, no cloudinary"""
    print("\n" + "="*80)
    print("TEST 1: PDF-VIEW MINTING")
    print("="*80)
    
    # First, get a published PDF resource
    resp = requests.get(f"{API_BASE}/academic-resources")
    if resp.status_code != 200:
        print(f"❌ Failed to get academic resources: {resp.status_code}")
        return None, None
    
    resources = resp.json().get('resources', [])
    pdf_resource = None
    for r in resources:
        if r.get('contentType') == 'pdf':
            pdf_resource = r
            break
    
    if not pdf_resource:
        print("❌ No published PDF resource found")
        return None, None, None
    
    resource_id = pdf_resource['id']
    allow_download = pdf_resource.get('allowPdfDownload', False)
    print(f"✅ Found PDF resource: {resource_id}")
    print(f"   Title: {pdf_resource.get('title', 'N/A')}")
    print(f"   allowPdfDownload: {allow_download}")
    
    # GET /api/academic-resources/:id/pdf-view with Bearer + x-lgo-device
    headers = {
        "Authorization": f"Bearer {token_a}",
        "x-lgo-device": device_a
    }
    resp = requests.get(f"{API_BASE}/academic-resources/{resource_id}/pdf-view", headers=headers)
    
    print(f"\nGET /api/academic-resources/{resource_id}/pdf-view")
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return None, None
    
    data = resp.json()
    print(f"✅ Status 200")
    
    # Check response structure
    checks = []
    
    # Check streamUrl exists
    stream_url = data.get('streamUrl', '')
    if stream_url:
        print(f"✅ streamUrl present: {stream_url[:80]}...")
        checks.append(True)
    else:
        print(f"❌ streamUrl missing")
        checks.append(False)
    
    # Check ttl == 300
    ttl = data.get('ttl')
    if ttl == 300:
        print(f"✅ ttl == 300")
        checks.append(True)
    else:
        print(f"❌ ttl != 300 (got {ttl})")
        checks.append(False)
    
    # Check streamUrl contains /pdf-stream?t=
    if '/pdf-stream?t=' in stream_url:
        print(f"✅ streamUrl contains /pdf-stream?t=")
        checks.append(True)
    else:
        print(f"❌ streamUrl does not contain /pdf-stream?t=")
        checks.append(False)
    
    # Check NO res.cloudinary.com in response
    response_text = resp.text
    if 'res.cloudinary.com' not in response_text:
        print(f"✅ NO res.cloudinary.com in response")
        checks.append(True)
    else:
        print(f"❌ res.cloudinary.com found in response")
        checks.append(False)
    
    # Extract token from streamUrl
    token_match = re.search(r't=([^&]+)', stream_url)
    token_a_view = token_match.group(1) if token_match else None
    
    if token_a_view:
        print(f"✅ Extracted view token: {token_a_view[:40]}...")
        checks.append(True)
    else:
        print(f"❌ Failed to extract view token")
        checks.append(False)
    
    print(f"\nTEST 1 RESULT: {'✅ PASS' if all(checks) else '❌ FAIL'} ({sum(checks)}/{len(checks)} checks)")
    return resource_id, token_a_view, allow_download

def test_pdf_stream_happy_path(resource_id, token_a, token_a_view, device_a="deviceA"):
    """TEST 2: pdf-stream WITH Bearer + token + device → 200 application/pdf %PDF"""
    print("\n" + "="*80)
    print("TEST 2: PDF-STREAM HAPPY PATH (account + token + device)")
    print("="*80)
    
    # Construct full streamUrl
    stream_url = f"{API_BASE}/academic-resources/{resource_id}/pdf-stream?t={token_a_view}"
    
    headers = {
        "Authorization": f"Bearer {token_a}",
        "x-lgo-device": device_a
    }
    
    print(f"GET {stream_url[:100]}...")
    resp = requests.get(stream_url, headers=headers)
    
    print(f"Status: {resp.status_code}")
    
    checks = []
    
    # Check 200
    if resp.status_code == 200:
        print(f"✅ Status 200")
        checks.append(True)
    else:
        print(f"❌ Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text[:200]}")
        checks.append(False)
        print(f"\nTEST 2 RESULT: ❌ FAIL ({sum(checks)}/{len(checks)} checks)")
        return
    
    # Check Content-Type
    content_type = resp.headers.get('Content-Type', '')
    if 'application/pdf' in content_type:
        print(f"✅ Content-Type: application/pdf")
        checks.append(True)
    else:
        print(f"❌ Content-Type: {content_type}")
        checks.append(False)
    
    # Check body starts with %PDF
    body = resp.content
    if body[:4] == b'%PDF':
        print(f"✅ Body starts with %PDF ({len(body)} bytes)")
        checks.append(True)
    else:
        print(f"❌ Body does not start with %PDF (first 20 bytes: {body[:20]})")
        checks.append(False)
    
    # Check NO res.cloudinary.com in headers or body
    headers_str = str(resp.headers)
    body_str = body[:1000].decode('latin1', errors='ignore')
    if 'res.cloudinary.com' not in headers_str and 'res.cloudinary.com' not in body_str:
        print(f"✅ NO res.cloudinary.com in headers or body")
        checks.append(True)
    else:
        print(f"❌ res.cloudinary.com found")
        checks.append(False)
    
    print(f"\nTEST 2 RESULT: {'✅ PASS' if all(checks) else '❌ FAIL'} ({sum(checks)}/{len(checks)} checks)")

def test_logged_out_fails(resource_id, token_a_view, device_a="deviceA"):
    """TEST 3: pdf-stream with token but NO Bearer (logged-out) → 401"""
    print("\n" + "="*80)
    print("TEST 3: LOGGED-OUT COPIED LINK FAILS")
    print("="*80)
    
    stream_url = f"{API_BASE}/academic-resources/{resource_id}/pdf-stream?t={token_a_view}"
    
    # NO Authorization header
    headers = {
        "x-lgo-device": device_a
    }
    
    print(f"GET {stream_url[:100]}... (NO Authorization)")
    resp = requests.get(stream_url, headers=headers)
    
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 401:
        print(f"✅ Status 401 (correctly rejected)")
        print(f"✅ TEST 3 RESULT: PASS")
    else:
        print(f"❌ Expected 401, got {resp.status_code}")
        print(f"Response: {resp.text[:200]}")
        print(f"❌ TEST 3 RESULT: FAIL")

def test_cross_account_fails(resource_id, token_a_view, token_b, device_a="deviceA"):
    """TEST 4: pdf-stream with User B Bearer but token minted for User A → 401"""
    print("\n" + "="*80)
    print("TEST 4: CROSS-ACCOUNT COPIED LINK FAILS")
    print("="*80)
    
    if not token_b:
        print("⚠️  User B not available, skipping cross-account test")
        print("✅ TEST 4 RESULT: SKIPPED")
        return
    
    stream_url = f"{API_BASE}/academic-resources/{resource_id}/pdf-stream?t={token_a_view}"
    
    # Use User B's Bearer token with User A's view token
    headers = {
        "Authorization": f"Bearer {token_b}",
        "x-lgo-device": device_a
    }
    
    print(f"GET {stream_url[:100]}... (User B Bearer, User A token)")
    resp = requests.get(stream_url, headers=headers)
    
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 401:
        print(f"✅ Status 401 (account mismatch correctly detected)")
        print(f"✅ TEST 4 RESULT: PASS")
    else:
        print(f"❌ Expected 401, got {resp.status_code}")
        print(f"Response: {resp.text[:200]}")
        print(f"❌ TEST 4 RESULT: FAIL")

def test_invalid_token_fails(resource_id, token_a):
    """TEST 5: pdf-stream with invalid token → 401"""
    print("\n" + "="*80)
    print("TEST 5: INVALID/EXPIRED TOKEN FAILS")
    print("="*80)
    
    stream_url = f"{API_BASE}/academic-resources/{resource_id}/pdf-stream?t=not-a-valid-token"
    
    headers = {
        "Authorization": f"Bearer {token_a}",
        "x-lgo-device": "deviceA"
    }
    
    print(f"GET {stream_url} (invalid token)")
    resp = requests.get(stream_url, headers=headers)
    
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 401:
        print(f"✅ Status 401 (invalid token correctly rejected)")
        print(f"✅ TEST 5 RESULT: PASS")
    else:
        print(f"❌ Expected 401, got {resp.status_code}")
        print(f"Response: {resp.text[:200]}")
        print(f"❌ TEST 5 RESULT: FAIL")

def test_device_binding(resource_id, token_a, token_a_view, device_a="deviceA"):
    """TEST 6: pdf-stream with mismatched device → 401"""
    print("\n" + "="*80)
    print("TEST 6: DEVICE BINDING")
    print("="*80)
    
    stream_url = f"{API_BASE}/academic-resources/{resource_id}/pdf-stream?t={token_a_view}"
    
    # Use different device header
    headers = {
        "Authorization": f"Bearer {token_a}",
        "x-lgo-device": "deviceB"  # Different from deviceA used in minting
    }
    
    print(f"GET {stream_url[:100]}... (deviceB, token minted with deviceA)")
    resp = requests.get(stream_url, headers=headers)
    
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 401:
        print(f"✅ Status 401 (device mismatch correctly detected)")
        print(f"✅ TEST 6 RESULT: PASS")
    else:
        print(f"❌ Expected 401, got {resp.status_code}")
        print(f"Response: {resp.text[:200]}")
        print(f"❌ TEST 6 RESULT: FAIL")

def test_secure_download_proxy(token_a, allow_download_resource_id, no_download_resource_id):
    """TEST 7: secure download proxy"""
    print("\n" + "="*80)
    print("TEST 7: SECURE DOWNLOAD PROXY")
    print("="*80)
    
    checks = []
    
    # Test 7a: allowPdfDownload=true resource WITH Bearer
    if allow_download_resource_id:
        print("\n7a. Resource with allowPdfDownload=true WITH Bearer:")
        headers = {"Authorization": f"Bearer {token_a}"}
        resp = requests.get(f"{API_BASE}/academic-resources/{allow_download_resource_id}/pdf-download", headers=headers)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ Status 200")
            checks.append(True)
            
            # Check Content-Type
            content_type = resp.headers.get('Content-Type', '')
            if 'application/pdf' in content_type:
                print(f"✅ Content-Type: application/pdf")
                checks.append(True)
            else:
                print(f"❌ Content-Type: {content_type}")
                checks.append(False)
            
            # Check Content-Disposition is attachment
            content_disp = resp.headers.get('Content-Disposition', '')
            if 'attachment' in content_disp:
                print(f"✅ Content-Disposition: attachment (filename: {content_disp[:80]}...)")
                checks.append(True)
            else:
                print(f"❌ Content-Disposition: {content_disp}")
                checks.append(False)
            
            # Check body starts with %PDF
            body = resp.content
            if body[:4] == b'%PDF':
                print(f"✅ Body starts with %PDF ({len(body)} bytes)")
                checks.append(True)
            else:
                print(f"❌ Body does not start with %PDF")
                checks.append(False)
            
            # Check NO res.cloudinary.com
            if 'res.cloudinary.com' not in resp.text[:1000]:
                print(f"✅ NO res.cloudinary.com in response")
                checks.append(True)
            else:
                print(f"❌ res.cloudinary.com found")
                checks.append(False)
            
            # Check response is NOT JSON with downloadUrl
            try:
                data = resp.json()
                if 'downloadUrl' in data:
                    print(f"❌ Response is JSON with downloadUrl (should be bytes)")
                    checks.append(False)
                else:
                    checks.append(True)
            except:
                print(f"✅ Response is NOT JSON (correct, it's PDF bytes)")
                checks.append(True)
        else:
            print(f"❌ Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
            checks.append(False)
    else:
        print("\n7a. ⚠️  No resource with allowPdfDownload=true found, skipping")
    
    # Test 7b: Same resource WITHOUT Bearer → 401
    if allow_download_resource_id:
        print("\n7b. Same resource WITHOUT Bearer:")
        resp = requests.get(f"{API_BASE}/academic-resources/{allow_download_resource_id}/pdf-download")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 401:
            print(f"✅ Status 401 (correctly rejected)")
            checks.append(True)
        else:
            print(f"❌ Expected 401, got {resp.status_code}")
            checks.append(False)
    
    # Test 7c: Resource with allowPdfDownload=false WITH Bearer → 403
    if no_download_resource_id:
        print("\n7c. Resource with allowPdfDownload=false WITH Bearer:")
        headers = {"Authorization": f"Bearer {token_a}"}
        resp = requests.get(f"{API_BASE}/academic-resources/{no_download_resource_id}/pdf-download", headers=headers)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 403:
            print(f"✅ Status 403 (download disabled)")
            checks.append(True)
        else:
            print(f"❌ Expected 403, got {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
            checks.append(False)
    else:
        print("\n7c. ⚠️  No resource with allowPdfDownload=false found, skipping")
    
    print(f"\nTEST 7 RESULT: {'✅ PASS' if all(checks) else '❌ FAIL'} ({sum(checks)}/{len(checks)} checks)")

def test_official_papers_regression(token_a):
    """TEST 8: regression - official papers still stream"""
    print("\n" + "="*80)
    print("TEST 8: REGRESSION - OFFICIAL PAPERS STILL STREAM")
    print("="*80)
    
    # Get official papers list
    headers = {"Authorization": f"Bearer {token_a}"}
    resp = requests.get(f"{API_BASE}/official-papers", headers=headers)
    
    if resp.status_code != 200:
        print(f"❌ Failed to get official papers: {resp.status_code}")
        print(f"❌ TEST 8 RESULT: FAIL")
        return
    
    papers = resp.json().get('items', [])
    if not papers:
        print(f"⚠️  No official papers found, skipping regression test")
        print(f"✅ TEST 8 RESULT: SKIPPED")
        return
    
    paper = papers[0]
    paper_id = paper['id']
    print(f"✅ Found official paper: {paper_id}")
    print(f"   Title: {paper.get('title', 'N/A')}")
    
    checks = []
    
    # GET /api/official-papers/:id/print
    print(f"\nGET /api/official-papers/{paper_id}/print")
    resp = requests.get(f"{API_BASE}/official-papers/{paper_id}/print", headers=headers)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        print(f"✅ Status 200")
        checks.append(True)
        
        data = resp.json()
        print_view_url = data.get('printViewUrl', '')
        
        if print_view_url:
            print(f"✅ printViewUrl present: {print_view_url[:80]}...")
            checks.append(True)
            
            # Extract token from printViewUrl
            token_match = re.search(r't=([^&]+)', print_view_url)
            if token_match:
                t = token_match.group(1)
                print(f"✅ Extracted token: {t[:40]}...")
                checks.append(True)
                
                # GET /api/official-papers/:id/pdf-stream?t=<t>
                stream_url = f"{API_BASE}/official-papers/{paper_id}/pdf-stream?t={t}"
                print(f"\nGET {stream_url[:100]}...")
                resp2 = requests.get(stream_url)
                print(f"Status: {resp2.status_code}")
                
                if resp2.status_code == 200:
                    print(f"✅ Status 200")
                    checks.append(True)
                    
                    # Check Content-Type
                    if 'application/pdf' in resp2.headers.get('Content-Type', ''):
                        print(f"✅ Content-Type: application/pdf")
                        checks.append(True)
                    else:
                        print(f"❌ Content-Type: {resp2.headers.get('Content-Type')}")
                        checks.append(False)
                    
                    # Check body starts with %PDF
                    if resp2.content[:4] == b'%PDF':
                        print(f"✅ Body starts with %PDF ({len(resp2.content)} bytes)")
                        checks.append(True)
                    else:
                        print(f"❌ Body does not start with %PDF")
                        checks.append(False)
                    
                    # Check NO res.cloudinary.com
                    if 'res.cloudinary.com' not in str(resp2.headers) and 'res.cloudinary.com' not in resp2.content[:1000].decode('latin1', errors='ignore'):
                        print(f"✅ NO res.cloudinary.com")
                        checks.append(True)
                    else:
                        print(f"❌ res.cloudinary.com found")
                        checks.append(False)
                else:
                    print(f"❌ Expected 200, got {resp2.status_code}")
                    checks.append(False)
            else:
                print(f"❌ Failed to extract token")
                checks.append(False)
        else:
            print(f"❌ printViewUrl missing")
            checks.append(False)
    else:
        print(f"❌ Expected 200, got {resp.status_code}")
        checks.append(False)
    
    print(f"\nTEST 8 RESULT: {'✅ PASS' if all(checks) else '❌ FAIL'} ({sum(checks)}/{len(checks)} checks)")

def find_resources_by_download_flag():
    """Find one resource with allowPdfDownload=true and one with false"""
    resp = requests.get(f"{API_BASE}/academic-resources")
    if resp.status_code != 200:
        return None, None
    
    resources = resp.json().get('resources', [])
    allow_true = None
    allow_false = None
    
    for r in resources:
        if r.get('contentType') == 'pdf':
            if r.get('allowPdfDownload') == True and not allow_true:
                allow_true = r['id']
            elif r.get('allowPdfDownload') == False and not allow_false:
                allow_false = r['id']
            
            if allow_true and allow_false:
                break
    
    return allow_true, allow_false

def main():
    print("="*80)
    print("HARDENED ACADEMIC RESOURCES SECURE VIEWER + DOWNLOAD PROXY TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    
    # Login as User A (admin)
    print("\n" + "="*80)
    print("SETUP: LOGIN")
    print("="*80)
    print(f"Logging in as User A (admin): {ADMIN_MOBILE}")
    token_a, user_a_id = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    
    if not token_a:
        print(f"❌ Failed to login as admin")
        return
    
    print(f"✅ User A logged in successfully")
    print(f"   User ID: {user_a_id}")
    print(f"   Token: {token_a[:40]}...")
    
    # Try to login as User B
    print(f"\nLogging in as User B: {TEST_USER_MOBILE}")
    token_b, user_b_id = login(TEST_USER_MOBILE, TEST_USER_PASSWORD)
    
    if token_b:
        print(f"✅ User B logged in successfully")
        print(f"   User ID: {user_b_id}")
        print(f"   Token: {token_b[:40]}...")
    else:
        print(f"⚠️  User B not available (will skip cross-account test)")
    
    # Find resources with different allowPdfDownload flags
    print("\n" + "="*80)
    print("SETUP: FIND RESOURCES")
    print("="*80)
    allow_download_id, no_download_id = find_resources_by_download_flag()
    
    if allow_download_id:
        print(f"✅ Found resource with allowPdfDownload=true: {allow_download_id}")
    else:
        print(f"⚠️  No resource with allowPdfDownload=true found")
    
    if no_download_id:
        print(f"✅ Found resource with allowPdfDownload=false: {no_download_id}")
    else:
        print(f"⚠️  No resource with allowPdfDownload=false found")
    
    # Run tests
    device_a = "deviceA"
    
    # TEST 1: pdf-view minting
    resource_id, token_a_view, allow_download = test_pdf_view_minting(token_a, device_a)
    
    if not resource_id or not token_a_view:
        print("\n❌ TEST 1 failed, cannot continue with remaining tests")
        return
    
    # TEST 2: pdf-stream happy path
    test_pdf_stream_happy_path(resource_id, token_a, token_a_view, device_a)
    
    # TEST 3: logged-out fails
    test_logged_out_fails(resource_id, token_a_view, device_a)
    
    # TEST 4: cross-account fails
    test_cross_account_fails(resource_id, token_a_view, token_b, device_a)
    
    # TEST 5: invalid token fails
    test_invalid_token_fails(resource_id, token_a)
    
    # TEST 6: device binding
    test_device_binding(resource_id, token_a, token_a_view, device_a)
    
    # TEST 7: secure download proxy
    # Use the resource from TEST 1 if it has allowPdfDownload=true, otherwise use the found one
    download_test_id = resource_id if allow_download else allow_download_id
    test_secure_download_proxy(token_a, download_test_id, no_download_id)
    
    # TEST 8: regression - official papers
    test_official_papers_regression(token_a)
    
    print("\n" + "="*80)
    print("ALL TESTS COMPLETED")
    print("="*80)

if __name__ == "__main__":
    main()
