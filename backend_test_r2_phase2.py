#!/usr/bin/env python3
"""
Backend test for R2 Phase 2 secure PDF viewer migration (PREVIEW environment).
Tests Academic Resources and Official Papers secure viewers with token-gated streaming.

CRITICAL CONSTRAINTS:
- Do NOT modify or toggle any env/R2 flags
- Do NOT deploy anything
- Read-only testing only
"""

import requests
import json
import re
from urllib.parse import urlparse, parse_qs

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login_admin():
    """Login as admin and return Bearer token"""
    print("\n=== ADMIN LOGIN ===")
    url = f"{BASE_URL}/auth/login"
    payload = {"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}
    r = requests.post(url, json=payload, timeout=30)
    print(f"POST {url} → {r.status_code}")
    if r.status_code != 200:
        print(f"ERROR: Login failed: {r.text}")
        return None
    data = r.json()
    token = data.get("token")
    if not token:
        print(f"ERROR: No token in response: {data}")
        return None
    print(f"✅ Admin login successful, token received")
    return token

def test_academic_resources_secure_viewer(token):
    """
    TEST 1 — Academic Resources secure viewer:
    a) GET /api/academic-resources — pick a published PDF resource id
    b) GET /api/academic-resources/:id/pdf-view with Bearer token
    c) Extract token from streamUrl, GET /api/academic-resources/:id/pdf-stream?t=<token>
    d) Negative: pdf-stream with NO token and NO Authorization → 401
    e) Token binding: token for resource A cannot open resource B
    """
    print("\n" + "="*80)
    print("TEST 1 — ACADEMIC RESOURCES SECURE VIEWER")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # a) GET /api/academic-resources — pick a published PDF resource
    print("\n--- TEST 1a: GET /api/academic-resources (find published PDF) ---")
    url = f"{BASE_URL}/academic-resources"
    r = requests.get(url, headers=headers, timeout=30)
    print(f"GET {url} → {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    print(f"Found {len(items)} academic resources")
    
    # Find published PDF resources
    pdf_resources = [
        item for item in items
        if item.get("contentType") == "pdf"
        and item.get("isPublished") == True
        and item.get("isVisible") == True
    ]
    
    print(f"Found {len(pdf_resources)} published PDF resources")
    
    if len(pdf_resources) == 0:
        print("⚠️  WARNING: No published PDF resources found. Cannot test secure viewer.")
        return False
    
    # Pick first two resources (for token binding test)
    resource_a = pdf_resources[0]
    resource_b = pdf_resources[1] if len(pdf_resources) > 1 else None
    
    print(f"✅ Selected resource A: {resource_a['id']} - {resource_a.get('title', 'Untitled')}")
    if resource_b:
        print(f"✅ Selected resource B: {resource_b['id']} - {resource_b.get('title', 'Untitled')}")
    
    # b) GET /api/academic-resources/:id/pdf-view with Bearer token
    print(f"\n--- TEST 1b: GET /api/academic-resources/{resource_a['id']}/pdf-view ---")
    url = f"{BASE_URL}/academic-resources/{resource_a['id']}/pdf-view"
    r = requests.get(url, headers=headers, timeout=30)
    print(f"GET {url} → {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    view_data = r.json()
    print(f"Response keys: {list(view_data.keys())}")
    
    # ASSERT: response contains viewUrl AND streamUrl
    if "viewUrl" not in view_data:
        print(f"❌ FAIL: Response missing 'viewUrl'")
        return False
    if "streamUrl" not in view_data:
        print(f"❌ FAIL: Response missing 'streamUrl'")
        return False
    
    view_url = view_data["viewUrl"]
    stream_url = view_data["streamUrl"]
    
    print(f"viewUrl: {view_url}")
    print(f"streamUrl: {stream_url}")
    
    # ASSERT: BOTH must be same-origin paths beginning with /api/academic-resources/
    if not view_url.startswith("/api/academic-resources/"):
        print(f"❌ FAIL: viewUrl does not start with /api/academic-resources/")
        return False
    if not stream_url.startswith("/api/academic-resources/"):
        print(f"❌ FAIL: streamUrl does not start with /api/academic-resources/")
        return False
    
    # ASSERT: BOTH must contain /pdf-stream?t=
    if "/pdf-stream?t=" not in view_url:
        print(f"❌ FAIL: viewUrl does not contain /pdf-stream?t=")
        return False
    if "/pdf-stream?t=" not in stream_url:
        print(f"❌ FAIL: streamUrl does not contain /pdf-stream?t=")
        return False
    
    # ASSERT: response body does NOT contain res.cloudinary.com
    response_text = json.dumps(view_data)
    if "res.cloudinary.com" in response_text:
        print(f"❌ FAIL: Response contains 'res.cloudinary.com' (Cloudinary URL leaked)")
        return False
    
    print(f"✅ PASS: viewUrl and streamUrl are same-origin paths with /pdf-stream?t=")
    print(f"✅ PASS: No 'res.cloudinary.com' in response")
    
    # c) Extract token from streamUrl, GET /api/academic-resources/:id/pdf-stream?t=<token>
    print(f"\n--- TEST 1c: GET /api/academic-resources/{resource_a['id']}/pdf-stream?t=<token> ---")
    
    # Extract token from streamUrl
    match = re.search(r't=([^&]+)', stream_url)
    if not match:
        print(f"❌ FAIL: Could not extract token from streamUrl")
        return False
    
    token_a = match.group(1)
    print(f"Extracted token (first 20 chars): {token_a[:20]}...")
    
    # GET pdf-stream with token
    full_stream_url = f"https://odisha-learning-pro.preview.emergentagent.com{stream_url}"
    r = requests.get(full_stream_url, timeout=60)
    print(f"GET {stream_url} → {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}")
    print(f"Content-Length: {len(r.content)} bytes")
    
    # ASSERT: HTTP 200
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    # ASSERT: Content-Type is application/pdf
    content_type = r.headers.get("Content-Type", "")
    if "application/pdf" not in content_type:
        print(f"❌ FAIL: Expected Content-Type 'application/pdf', got '{content_type}'")
        return False
    
    # ASSERT: Body is non-empty and starts with %PDF
    if len(r.content) == 0:
        print(f"❌ FAIL: Response body is empty")
        return False
    
    if not r.content.startswith(b"%PDF"):
        print(f"❌ FAIL: Response body does not start with '%PDF' (first 10 bytes: {r.content[:10]})")
        return False
    
    # ASSERT: No res.cloudinary.com in headers
    headers_text = json.dumps(dict(r.headers))
    if "res.cloudinary.com" in headers_text:
        print(f"❌ FAIL: Response headers contain 'res.cloudinary.com'")
        return False
    
    print(f"✅ PASS: HTTP 200, Content-Type application/pdf, body starts with %PDF")
    print(f"✅ PASS: No 'res.cloudinary.com' in headers")
    
    # d) Negative: GET pdf-stream with NO token and NO Authorization → 401
    print(f"\n--- TEST 1d: Negative tests (no token, invalid token) ---")
    
    # No token, no auth
    url_no_token = f"{BASE_URL}/academic-resources/{resource_a['id']}/pdf-stream"
    r = requests.get(url_no_token, timeout=30)
    print(f"GET {url_no_token} (no token, no auth) → {r.status_code}")
    
    if r.status_code != 401:
        print(f"❌ FAIL: Expected 401, got {r.status_code}")
        return False
    
    print(f"✅ PASS: No token/auth → 401")
    
    # Invalid token
    url_invalid_token = f"{BASE_URL}/academic-resources/{resource_a['id']}/pdf-stream?t=abc123"
    r = requests.get(url_invalid_token, timeout=30)
    print(f"GET {url_invalid_token} (invalid token) → {r.status_code}")
    
    if r.status_code != 401:
        print(f"❌ FAIL: Expected 401, got {r.status_code}")
        return False
    
    print(f"✅ PASS: Invalid token → 401")
    
    # e) Token binding: token for resource A cannot open resource B
    if resource_b:
        print(f"\n--- TEST 1e: Token binding (token A cannot open resource B) ---")
        url_wrong_resource = f"{BASE_URL}/academic-resources/{resource_b['id']}/pdf-stream?t={token_a}"
        r = requests.get(url_wrong_resource, timeout=30)
        print(f"GET /academic-resources/{resource_b['id']}/pdf-stream?t=<tokenForA> → {r.status_code}")
        
        if r.status_code != 401:
            print(f"❌ FAIL: Expected 401 (token bound to resource A), got {r.status_code}")
            return False
        
        print(f"✅ PASS: Token for resource A cannot open resource B → 401")
    else:
        print(f"\n--- TEST 1e: SKIPPED (only one PDF resource available) ---")
    
    print(f"\n✅ TEST 1 PASSED: Academic Resources secure viewer working correctly")
    return True

def test_official_papers_secure_viewer(token):
    """
    TEST 2 — Official Papers secure viewer:
    a) GET /api/official-papers — pick a paper id
    b) GET /api/official-papers/:id/print with Bearer → expect printViewUrl
    c) Extract token, GET /api/official-papers/:id/print-view?t=<token> → HTML with iframe
    d) GET /api/official-papers/:id/pdf-stream?t=<token> → PDF bytes
    e) Negative: pdf-stream with no token/no auth → 401
    """
    print("\n" + "="*80)
    print("TEST 2 — OFFICIAL PAPERS SECURE VIEWER")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # a) GET /api/official-papers — pick a paper id
    print("\n--- TEST 2a: GET /api/official-papers (find paper) ---")
    url = f"{BASE_URL}/official-papers"
    r = requests.get(url, headers=headers, timeout=30)
    print(f"GET {url} → {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    print(f"Found {len(items)} official papers")
    
    if len(items) == 0:
        print("⚠️  WARNING: No official papers found. Cannot test secure viewer.")
        return False
    
    paper = items[0]
    paper_id = paper["id"]
    print(f"✅ Selected paper: {paper_id} - {paper.get('title', 'Untitled')}")
    
    # b) GET /api/official-papers/:id/print with Bearer → expect printViewUrl
    print(f"\n--- TEST 2b: GET /api/official-papers/{paper_id}/print ---")
    url = f"{BASE_URL}/official-papers/{paper_id}/print"
    r = requests.get(url, headers=headers, timeout=30)
    print(f"GET {url} → {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    print_data = r.json()
    print(f"Response keys: {list(print_data.keys())}")
    
    # ASSERT: response contains printViewUrl
    if "printViewUrl" not in print_data:
        print(f"❌ FAIL: Response missing 'printViewUrl'")
        return False
    
    print_view_url = print_data["printViewUrl"]
    print(f"printViewUrl: {print_view_url}")
    
    # ASSERT: printViewUrl contains /print-view?t=
    if "/print-view?t=" not in print_view_url:
        print(f"❌ FAIL: printViewUrl does not contain /print-view?t=")
        return False
    
    print(f"✅ PASS: printViewUrl contains /print-view?t=")
    
    # c) Extract token, GET /api/official-papers/:id/print-view?t=<token> → HTML with iframe
    print(f"\n--- TEST 2c: GET /api/official-papers/{paper_id}/print-view?t=<token> ---")
    
    # Extract token from printViewUrl
    match = re.search(r't=([^&]+)', print_view_url)
    if not match:
        print(f"❌ FAIL: Could not extract token from printViewUrl")
        return False
    
    paper_token = match.group(1)
    print(f"Extracted token (first 20 chars): {paper_token[:20]}...")
    
    # GET print-view with token
    full_print_view_url = f"https://odisha-learning-pro.preview.emergentagent.com{print_view_url}"
    r = requests.get(full_print_view_url, timeout=60)
    print(f"GET {print_view_url} → {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}")
    print(f"Content-Length: {len(r.content)} bytes")
    
    # ASSERT: HTTP 200
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    # ASSERT: Content-Type is text/html
    content_type = r.headers.get("Content-Type", "")
    if "text/html" not in content_type:
        print(f"❌ FAIL: Expected Content-Type 'text/html', got '{content_type}'")
        return False
    
    html = r.text
    
    # ASSERT: HTML contains iframe pointing to /pdf-stream?t=
    if "<iframe" not in html:
        print(f"❌ FAIL: HTML does not contain <iframe>")
        return False
    
    if "/pdf-stream?t=" not in html:
        print(f"❌ FAIL: HTML does not contain /pdf-stream?t=")
        return False
    
    print(f"✅ PASS: HTTP 200, text/html, contains iframe with /pdf-stream?t=")
    
    # d) GET /api/official-papers/:id/pdf-stream?t=<token> → PDF bytes
    print(f"\n--- TEST 2d: GET /api/official-papers/{paper_id}/pdf-stream?t=<token> ---")
    
    url_pdf_stream = f"{BASE_URL}/official-papers/{paper_id}/pdf-stream?t={paper_token}"
    r = requests.get(url_pdf_stream, timeout=60)
    print(f"GET /official-papers/{paper_id}/pdf-stream?t=<token> → {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}")
    print(f"Content-Length: {len(r.content)} bytes")
    
    # ASSERT: HTTP 200
    if r.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {r.status_code}")
        print(f"Response: {r.text[:500]}")
        return False
    
    # ASSERT: Content-Type is application/pdf
    content_type = r.headers.get("Content-Type", "")
    if "application/pdf" not in content_type:
        print(f"❌ FAIL: Expected Content-Type 'application/pdf', got '{content_type}'")
        return False
    
    # ASSERT: Body is non-empty and starts with %PDF
    if len(r.content) == 0:
        print(f"❌ FAIL: Response body is empty")
        return False
    
    if not r.content.startswith(b"%PDF"):
        print(f"❌ FAIL: Response body does not start with '%PDF' (first 10 bytes: {r.content[:10]})")
        return False
    
    # ASSERT: No res.cloudinary.com in response
    response_text = r.text if isinstance(r.content, str) else ""
    headers_text = json.dumps(dict(r.headers))
    if "res.cloudinary.com" in response_text or "res.cloudinary.com" in headers_text:
        print(f"❌ FAIL: Response contains 'res.cloudinary.com'")
        return False
    
    print(f"✅ PASS: HTTP 200, Content-Type application/pdf, body starts with %PDF")
    print(f"✅ PASS: No 'res.cloudinary.com' in response")
    
    # e) Negative: pdf-stream with no token/no auth → 401
    print(f"\n--- TEST 2e: Negative test (no token, no auth) ---")
    
    url_no_token = f"{BASE_URL}/official-papers/{paper_id}/pdf-stream"
    r = requests.get(url_no_token, timeout=30)
    print(f"GET {url_no_token} (no token, no auth) → {r.status_code}")
    
    if r.status_code != 401:
        print(f"❌ FAIL: Expected 401, got {r.status_code}")
        return False
    
    print(f"✅ PASS: No token/auth → 401")
    
    print(f"\n✅ TEST 2 PASSED: Official Papers secure viewer working correctly")
    return True

def test_regression_endpoints(token):
    """
    TEST 3 — Regression: ensure no 500s and existing listing endpoints still work
    a) GET /api/academic-resources
    b) GET /api/official-papers
    c) GET /api/academic-resources/counts
    d) GET /api/official-papers/facets
    """
    print("\n" + "="*80)
    print("TEST 3 — REGRESSION TESTS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    endpoints = [
        "/api/academic-resources",
        "/api/official-papers",
        "/api/academic-resources/counts",
        "/api/official-papers/facets",
    ]
    
    all_passed = True
    
    for endpoint in endpoints:
        print(f"\n--- Testing {endpoint} ---")
        url = f"https://odisha-learning-pro.preview.emergentagent.com{endpoint}"
        r = requests.get(url, headers=headers, timeout=30)
        print(f"GET {endpoint} → {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            all_passed = False
        else:
            print(f"✅ PASS: {endpoint} returned 200")
    
    if all_passed:
        print(f"\n✅ TEST 3 PASSED: All regression endpoints working correctly")
    else:
        print(f"\n❌ TEST 3 FAILED: Some regression endpoints failed")
    
    return all_passed

def main():
    print("="*80)
    print("R2 PHASE 2 SECURE PDF VIEWER MIGRATION TEST")
    print("PREVIEW ENVIRONMENT - READ-ONLY TESTING")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Admin login failed. Cannot proceed with tests.")
        return
    
    # Run tests
    results = {
        "TEST 1 - Academic Resources Secure Viewer": False,
        "TEST 2 - Official Papers Secure Viewer": False,
        "TEST 3 - Regression Tests": False,
    }
    
    try:
        results["TEST 1 - Academic Resources Secure Viewer"] = test_academic_resources_secure_viewer(token)
    except Exception as e:
        print(f"\n❌ TEST 1 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results["TEST 2 - Official Papers Secure Viewer"] = test_official_papers_secure_viewer(token)
    except Exception as e:
        print(f"\n❌ TEST 2 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results["TEST 3 - Regression Tests"] = test_regression_endpoints(token)
    except Exception as e:
        print(f"\n❌ TEST 3 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n🎉 ALL TESTS PASSED")
    else:
        print("\n⚠️  SOME TESTS FAILED")
    
    print("="*80)

if __name__ == "__main__":
    main()
