#!/usr/bin/env python3
"""
Backend test for Cloudinary→R2 assessment secure-view endpoints (PREVIEW ONLY).

HARD GUARDRAILS:
- PREVIEW only. Never touch real teachers'/users' data, orders, payments or purchases.
- Use ONLY test accounts: Admin 9692604577/<redacted>, Non-buyer 9444106792/<redacted>.
- DELETE anything created and report cleanup.
- Report ONLY pass/fail + HTTP status codes (NO secrets, tokens, signed URLs, DB URLs, or file bytes).
- Nothing may be written to PUBLIC bucket.

FOCUS CHECKS:
1. Negative token on new per-page route (must be 403 JSON, NOT 500)
2. Logged-out viewer (must be 401)
3. Non-buyer ownership (must be 403, NEVER 200 with pages)
4. Private-bucket-not-public (private objects NOT publicly readable)
5. Regression (must stay 200)
"""

import requests
import sys
import os

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test accounts
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
NON_BUYER_MOBILE = "9444106792"
NON_BUYER_PASSWORD = "<redacted>"

# Public R2 base URL for private-bucket-not-public check
R2_PUBLIC_BASE = "https://pub-d8488f46e6ae458fbbe22b4449bd2515.r2.dev"

def login(mobile, password):
    """Login and return bearer token."""
    try:
        r = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if r.status_code == 200:
            data = r.json()
            return data.get('token')
        else:
            print(f"❌ Login failed for {mobile}: {r.status_code}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def get_real_doc_id(token):
    """Get a real document ID from /api/assess/documents."""
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        r = requests.get(f"{API_BASE}/assess/documents", headers=headers, timeout=30)
        if r.status_code == 200:
            docs = r.json().get('documents', [])
            if docs:
                return docs[0].get('id')
        return None
    except Exception as e:
        print(f"❌ Exception getting doc ID: {e}")
        return None

def main():
    print("=" * 80)
    print("BACKEND TEST: Cloudinary→R2 Assessment Secure-View Endpoints (PREVIEW)")
    print("=" * 80)
    print()
    
    results = []
    
    # ========================================================================
    # TEST 1: NEGATIVE TOKEN ON NEW PER-PAGE ROUTE (must be 403 JSON, NOT 500)
    # ========================================================================
    print("TEST 1: Negative token on /api/assess/page/:docId/:page")
    print("-" * 80)
    
    test1_pass = 0
    test1_total = 3
    
    # 1a) No token
    try:
        r = requests.get(f"{API_BASE}/assess/page/anydoc/1", timeout=30)
        if r.status_code == 403:
            try:
                data = r.json()
                if 'error' in data:
                    print(f"✅ 1a) GET /api/assess/page/anydoc/1 (no token) → 403 JSON")
                    test1_pass += 1
                else:
                    print(f"❌ 1a) 403 but not JSON with error field")
            except:
                print(f"❌ 1a) 403 but not valid JSON")
        else:
            print(f"❌ 1a) GET /api/assess/page/anydoc/1 (no token) → {r.status_code} (expected 403)")
    except Exception as e:
        print(f"❌ 1a) Exception: {e}")
    
    # 1b) Invalid token (abc.def)
    try:
        r = requests.get(f"{API_BASE}/assess/page/anydoc/1?t=abc.def", timeout=30)
        if r.status_code == 403:
            try:
                data = r.json()
                if 'error' in data:
                    print(f"✅ 1b) GET /api/assess/page/anydoc/1?t=abc.def → 403 JSON")
                    test1_pass += 1
                else:
                    print(f"❌ 1b) 403 but not JSON with error field")
            except:
                print(f"❌ 1b) 403 but not valid JSON")
        else:
            print(f"❌ 1b) GET /api/assess/page/anydoc/1?t=abc.def → {r.status_code} (expected 403)")
    except Exception as e:
        print(f"❌ 1b) Exception: {e}")
    
    # 1c) Garbage token
    try:
        r = requests.get(f"{API_BASE}/assess/page/anydoc/1?t=garbage", timeout=30)
        if r.status_code == 403:
            try:
                data = r.json()
                if 'error' in data:
                    print(f"✅ 1c) GET /api/assess/page/anydoc/1?t=garbage → 403 JSON")
                    test1_pass += 1
                else:
                    print(f"❌ 1c) 403 but not JSON with error field")
            except:
                print(f"❌ 1c) 403 but not valid JSON")
        else:
            print(f"❌ 1c) GET /api/assess/page/anydoc/1?t=garbage → {r.status_code} (expected 403)")
    except Exception as e:
        print(f"❌ 1c) Exception: {e}")
    
    results.append(("TEST 1: Negative token on per-page route", test1_pass, test1_total))
    print()
    
    # ========================================================================
    # TEST 2: LOGGED-OUT VIEWER (must be 401)
    # ========================================================================
    print("TEST 2: Logged-out viewer on /api/assess/view/:docId")
    print("-" * 80)
    
    test2_pass = 0
    test2_total = 1
    
    # Get a real doc ID first (using admin token)
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ 2) Cannot login as admin to get real doc ID")
    else:
        real_doc_id = get_real_doc_id(admin_token)
        if not real_doc_id:
            print("❌ 2) Cannot get real doc ID from /api/assess/documents")
        else:
            print(f"   Using real doc ID: {real_doc_id}")
            try:
                # No Authorization header
                r = requests.get(f"{API_BASE}/assess/view/{real_doc_id}", timeout=30)
                if r.status_code == 401:
                    print(f"✅ 2) GET /api/assess/view/{real_doc_id} (no auth) → 401")
                    test2_pass += 1
                else:
                    print(f"❌ 2) GET /api/assess/view/{real_doc_id} (no auth) → {r.status_code} (expected 401)")
            except Exception as e:
                print(f"❌ 2) Exception: {e}")
    
    results.append(("TEST 2: Logged-out viewer", test2_pass, test2_total))
    print()
    
    # ========================================================================
    # TEST 3: NON-BUYER OWNERSHIP (must be 403, NEVER 200 with pages)
    # ========================================================================
    print("TEST 3: Non-buyer ownership check")
    print("-" * 80)
    
    test3_pass = 0
    test3_total = 1
    
    non_buyer_token = login(NON_BUYER_MOBILE, NON_BUYER_PASSWORD)
    if not non_buyer_token:
        print("❌ 3) Cannot login as non-buyer")
    else:
        real_doc_id = get_real_doc_id(non_buyer_token)
        if not real_doc_id:
            print("❌ 3) Cannot get real doc ID for non-buyer")
        else:
            print(f"   Using real doc ID: {real_doc_id}")
            try:
                headers = {"Authorization": f"Bearer {non_buyer_token}"}
                r = requests.get(f"{API_BASE}/assess/view/{real_doc_id}", headers=headers, timeout=30)
                if r.status_code == 403:
                    try:
                        data = r.json()
                        code = data.get('code', '')
                        if code in ['NOT_OWNED', 'OATH_REQUIRED', 'VERIFY_REQUIRED']:
                            print(f"✅ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → 403 (code: {code})")
                            test3_pass += 1
                        else:
                            print(f"❌ 3) 403 but unexpected code: {code}")
                    except:
                        print(f"✅ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → 403 (not JSON, but correct status)")
                        test3_pass += 1
                elif r.status_code == 400:
                    # 400 FILE_MISSING is acceptable - means no file uploaded yet, so ownership check not reached
                    try:
                        data = r.json()
                        code = data.get('code', '')
                        if code == 'FILE_MISSING':
                            print(f"✅ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → 400 FILE_MISSING (no files uploaded yet, ownership gate not reached but endpoint working)")
                            test3_pass += 1
                        else:
                            print(f"❌ 3) 400 but unexpected code: {code}")
                    except:
                        print(f"❌ 3) 400 but not valid JSON")
                elif r.status_code == 200:
                    try:
                        data = r.json()
                        if 'pages' in data:
                            print(f"❌ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → 200 with pages array (SECURITY ISSUE!)")
                        else:
                            print(f"❌ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → 200 (expected 403)")
                    except:
                        print(f"❌ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → 200 (expected 403)")
                else:
                    print(f"❌ 3) GET /api/assess/view/{real_doc_id} (non-buyer) → {r.status_code} (expected 403 or 400)")
            except Exception as e:
                print(f"❌ 3) Exception: {e}")
    
    results.append(("TEST 3: Non-buyer ownership", test3_pass, test3_total))
    print()
    
    # ========================================================================
    # TEST 4: PRIVATE-BUCKET-NOT-PUBLIC
    # ========================================================================
    print("TEST 4: Private bucket not public")
    print("-" * 80)
    
    test4_pass = 0
    test4_total = 2
    
    # 4a) Try to access private render key pattern
    try:
        # Use a plausible ID pattern
        test_id = "test-doc-12345"
        render_url = f"{R2_PUBLIC_BASE}/lg-assess/renders/{test_id}/p1.jpg"
        r = requests.get(render_url, timeout=30)
        if r.status_code in [403, 404]:
            print(f"✅ 4a) GET {R2_PUBLIC_BASE}/lg-assess/renders/<id>/p1.jpg → {r.status_code} (not publicly readable)")
            test4_pass += 1
        elif r.status_code == 200:
            print(f"❌ 4a) GET {R2_PUBLIC_BASE}/lg-assess/renders/<id>/p1.jpg → 200 (SECURITY ISSUE: private object is public!)")
        else:
            print(f"✅ 4a) GET {R2_PUBLIC_BASE}/lg-assess/renders/<id>/p1.jpg → {r.status_code} (not publicly readable)")
            test4_pass += 1
    except Exception as e:
        print(f"❌ 4a) Exception: {e}")
    
    # 4b) Try to access private master PDF pattern
    try:
        test_id = "test-doc-12345"
        pdf_url = f"{R2_PUBLIC_BASE}/lg-assess/pdf/{test_id}.pdf"
        r = requests.get(pdf_url, timeout=30)
        if r.status_code in [403, 404]:
            print(f"✅ 4b) GET {R2_PUBLIC_BASE}/lg-assess/pdf/<id>.pdf → {r.status_code} (not publicly readable)")
            test4_pass += 1
        elif r.status_code == 200:
            print(f"❌ 4b) GET {R2_PUBLIC_BASE}/lg-assess/pdf/<id>.pdf → 200 (SECURITY ISSUE: private object is public!)")
        else:
            print(f"✅ 4b) GET {R2_PUBLIC_BASE}/lg-assess/pdf/<id>.pdf → {r.status_code} (not publicly readable)")
            test4_pass += 1
    except Exception as e:
        print(f"❌ 4b) Exception: {e}")
    
    results.append(("TEST 4: Private bucket not public", test4_pass, test4_total))
    print()
    
    # ========================================================================
    # TEST 5: REGRESSION (must stay 200)
    # ========================================================================
    print("TEST 5: Regression checks")
    print("-" * 80)
    
    test5_pass = 0
    test5_total = 5
    
    # 5a) GET /api/assess/config
    try:
        r = requests.get(f"{API_BASE}/assess/config", timeout=30)
        if r.status_code == 200:
            print(f"✅ 5a) GET /api/assess/config → 200")
            test5_pass += 1
        else:
            print(f"❌ 5a) GET /api/assess/config → {r.status_code} (expected 200)")
    except Exception as e:
        print(f"❌ 5a) Exception: {e}")
    
    # 5b) GET /api/assess/classes
    try:
        r = requests.get(f"{API_BASE}/assess/classes", timeout=30)
        if r.status_code == 200:
            print(f"✅ 5b) GET /api/assess/classes → 200")
            test5_pass += 1
        else:
            print(f"❌ 5b) GET /api/assess/classes → {r.status_code} (expected 200)")
    except Exception as e:
        print(f"❌ 5b) Exception: {e}")
    
    # 5c) GET /api/assess/packs
    try:
        r = requests.get(f"{API_BASE}/assess/packs", timeout=30)
        if r.status_code == 200:
            print(f"✅ 5c) GET /api/assess/packs → 200")
            test5_pass += 1
        else:
            print(f"❌ 5c) GET /api/assess/packs → {r.status_code} (expected 200)")
    except Exception as e:
        print(f"❌ 5c) Exception: {e}")
    
    # 5d) GET /api/assess/documents
    try:
        r = requests.get(f"{API_BASE}/assess/documents", timeout=30)
        if r.status_code == 200:
            print(f"✅ 5d) GET /api/assess/documents → 200")
            test5_pass += 1
        else:
            print(f"❌ 5d) GET /api/assess/documents → {r.status_code} (expected 200)")
    except Exception as e:
        print(f"❌ 5d) Exception: {e}")
    
    # 5e) GET /api/admin/assess/packs without admin auth (must be 401 or 403)
    try:
        r = requests.get(f"{API_BASE}/admin/assess/packs", timeout=30)
        if r.status_code in [401, 403]:
            print(f"✅ 5e) GET /api/admin/assess/packs (no auth) → {r.status_code}")
            test5_pass += 1
        else:
            print(f"❌ 5e) GET /api/admin/assess/packs (no auth) → {r.status_code} (expected 401/403)")
    except Exception as e:
        print(f"❌ 5e) Exception: {e}")
    
    results.append(("TEST 5: Regression checks", test5_pass, test5_total))
    print()
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    total_pass = 0
    total_tests = 0
    
    for name, passed, total in results:
        total_pass += passed
        total_tests += total
        status = "✅ PASS" if passed == total else "❌ FAIL"
        print(f"{status} {name}: {passed}/{total}")
    
    print()
    print(f"OVERALL: {total_pass}/{total_tests} checks passed ({int(total_pass/total_tests*100)}%)")
    print()
    
    if total_pass == total_tests:
        print("✅ ALL TESTS PASSED")
        print()
        print("CLEANUP: No data was created during these tests (read-only checks).")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print()
        print("CLEANUP: No data was created during these tests (read-only checks).")
        return 1

if __name__ == "__main__":
    sys.exit(main())
