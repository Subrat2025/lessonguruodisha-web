#!/usr/bin/env python3
"""
Backend test for Official Papers Library feature
Tests all 10 cases from test_result.md
"""

import requests
import json
import os
import time

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
EXPIRED_USER_MOBILE = "9000000099"
EXPIRED_USER_PASSWORD = "test1234"

# Known IDs from test plan
EXISTING_PAPER_ID = "5acbf08d-6568-4d10-9b71-e1d8707731e8"
CLASS_1_ID = "6660f1e3-314d-47ba-8d5e-5096ae657b27"
BOOK_ID = "ee09afd9-f0a5-4d4b-a6aa-6aa74d2974f3"

# Global variables to store test data
admin_token = None
expired_user_token = None
set_b_paper_id = None

def print_test(num, desc):
    print(f"\n{'='*80}")
    print(f"TEST {num}: {desc}")
    print('='*80)

def print_pass(msg):
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    print(f"❌ FAIL: {msg}")

def print_response(resp):
    print(f"Status: {resp.status_code}")
    try:
        print(f"Response: {json.dumps(resp.json(), indent=2)}")
    except:
        print(f"Response (text): {resp.text[:500]}")

# Test 0: Setup - Login as admin and expired user
def test_0_setup():
    global admin_token, expired_user_token
    
    print_test(0, "SETUP - Login as admin and expired user")
    
    # Admin login
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code == 200:
            admin_token = resp.json().get('token')
            print_pass(f"Admin login successful, token: {admin_token[:20]}...")
        else:
            print_fail(f"Admin login failed: {resp.status_code}")
            print_response(resp)
            return False
    except Exception as e:
        print_fail(f"Admin login exception: {e}")
        return False
    
    # Expired user login
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": EXPIRED_USER_MOBILE,
            "password": EXPIRED_USER_PASSWORD
        })
        if resp.status_code == 200:
            expired_user_token = resp.json().get('token')
            print_pass(f"Expired user login successful, token: {expired_user_token[:20]}...")
        else:
            print_fail(f"Expired user login failed: {resp.status_code}")
            print_response(resp)
            return False
    except Exception as e:
        print_fail(f"Expired user login exception: {e}")
        return False
    
    return True

# Test 1: Admin multipart upload of Set B
def test_1_admin_upload_multipart():
    global set_b_paper_id
    
    print_test(1, "Admin multipart upload - Set B")
    
    if not admin_token:
        print_fail("No admin token available")
        return False
    
    try:
        # Read the PDF file
        with open('/tmp/FA1.pdf', 'rb') as f:
            pdf_content = f.read()
        
        # Prepare multipart form data
        files = {
            'pdf': ('FA1_SetB.pdf', pdf_content, 'application/pdf')
        }
        data = {
            'classId': CLASS_1_ID,
            'bookId': BOOK_ID,
            'examType': 'fa1',
            'setLetter': 'B',
            'year': '2025-26',
            'title': 'FA1 Class 1 Set B Test Upload'
        }
        headers = {
            'Authorization': f'Bearer {admin_token}'
        }
        
        resp = requests.post(
            f"{API_BASE}/admin/official-papers/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        print_response(resp)
        
        if resp.status_code == 200:
            result = resp.json()
            if result.get('ok') and result.get('paper'):
                paper = result['paper']
                set_b_paper_id = paper.get('id')
                
                # Verify required fields
                checks = [
                    (paper.get('setLetter') == 'B', f"setLetter is 'B': {paper.get('setLetter')}"),
                    (paper.get('pages') is not None, f"pages field exists: {paper.get('pages')}"),
                    (paper.get('thumbnailUrl') is not None, f"thumbnailUrl exists: {paper.get('thumbnailUrl')}"),
                    (paper.get('pdfUrl') and 'cloudinary' in paper.get('pdfUrl', ''), f"pdfUrl contains 'cloudinary': {paper.get('pdfUrl')}"),
                    (set_b_paper_id is not None, f"paper ID exists: {set_b_paper_id}")
                ]
                
                all_passed = True
                for check, msg in checks:
                    if check:
                        print_pass(msg)
                    else:
                        print_fail(msg)
                        all_passed = False
                
                return all_passed
            else:
                print_fail(f"Response missing 'ok' or 'paper': {result}")
                return False
        else:
            print_fail(f"Expected 200, got {resp.status_code}")
            return False
            
    except Exception as e:
        print_fail(f"Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

# Test 2: Duplicate Set A upload → 409
def test_2_duplicate_rejection():
    print_test(2, "Duplicate Set A upload → 409")
    
    if not admin_token:
        print_fail("No admin token available")
        return False
    
    try:
        with open('/tmp/FA1.pdf', 'rb') as f:
            pdf_content = f.read()
        
        files = {
            'pdf': ('FA1_SetA_Duplicate.pdf', pdf_content, 'application/pdf')
        }
        data = {
            'classId': CLASS_1_ID,
            'bookId': BOOK_ID,
            'examType': 'fa1',
            'setLetter': 'A',  # Already exists
            'year': '2025-26'
        }
        headers = {
            'Authorization': f'Bearer {admin_token}'
        }
        
        resp = requests.post(
            f"{API_BASE}/admin/official-papers/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        print_response(resp)
        
        if resp.status_code == 409:
            print_pass("Got 409 Conflict as expected for duplicate set")
            return True
        else:
            print_fail(f"Expected 409, got {resp.status_code}")
            return False
            
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# Test 3: Missing required field (year) → 400
def test_3_missing_year():
    print_test(3, "Missing required field (year) → 400")
    
    if not admin_token:
        print_fail("No admin token available")
        return False
    
    try:
        with open('/tmp/FA1.pdf', 'rb') as f:
            pdf_content = f.read()
        
        files = {
            'pdf': ('FA1_NoYear.pdf', pdf_content, 'application/pdf')
        }
        data = {
            'classId': CLASS_1_ID,
            'bookId': BOOK_ID,
            'examType': 'fa1',
            'setLetter': 'C'
            # Missing 'year' field
        }
        headers = {
            'Authorization': f'Bearer {admin_token}'
        }
        
        resp = requests.post(
            f"{API_BASE}/admin/official-papers/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        print_response(resp)
        
        if resp.status_code == 400:
            print_pass("Got 400 Bad Request as expected for missing year")
            return True
        else:
            print_fail(f"Expected 400, got {resp.status_code}")
            return False
            
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# Test 4: Public list - no auth required
def test_4_public_list():
    print_test(4, "Public GET /api/official-papers → items + facets (no auth)")
    
    try:
        # Test 4a: Get all papers (no auth)
        resp = requests.get(f"{API_BASE}/official-papers")
        print_response(resp)
        
        if resp.status_code != 200:
            print_fail(f"Expected 200, got {resp.status_code}")
            return False
        
        result = resp.json()
        
        # Check structure
        checks = [
            ('items' in result, "Response has 'items' field"),
            ('facets' in result, "Response has 'facets' field"),
            (isinstance(result.get('items'), list), "items is a list"),
            (len(result.get('items', [])) >= 2, f"At least 2 items (Set A + Set B): {len(result.get('items', []))} items")
        ]
        
        all_passed = True
        for check, msg in checks:
            if check:
                print_pass(msg)
            else:
                print_fail(msg)
                all_passed = False
        
        if not all_passed:
            return False
        
        # Test 4b: Filter by classId
        print("\n--- Test 4b: Filter by classId ---")
        resp = requests.get(f"{API_BASE}/official-papers?classId={CLASS_1_ID}")
        print_response(resp)
        
        if resp.status_code == 200:
            result = resp.json()
            items = result.get('items', [])
            # All items should be for Class 1
            class_1_only = all(item.get('classId') == CLASS_1_ID for item in items)
            if class_1_only:
                print_pass(f"Filter by classId working: {len(items)} Class 1 items")
            else:
                print_fail("Filter by classId not working correctly")
                all_passed = False
        else:
            print_fail(f"Filter by classId failed: {resp.status_code}")
            all_passed = False
        
        # Test 4c: Filter by examType
        print("\n--- Test 4c: Filter by examType ---")
        resp = requests.get(f"{API_BASE}/official-papers?examType=fa1")
        print_response(resp)
        
        if resp.status_code == 200:
            result = resp.json()
            items = result.get('items', [])
            # All items should be FA1
            fa1_only = all(item.get('examType') == 'fa1' for item in items)
            if fa1_only:
                print_pass(f"Filter by examType working: {len(items)} FA1 items")
            else:
                print_fail("Filter by examType not working correctly")
                all_passed = False
        else:
            print_fail(f"Filter by examType failed: {resp.status_code}")
            all_passed = False
        
        return all_passed
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# Test 5: Preview endpoint bumps previewCount
def test_5_preview_endpoint():
    print_test(5, "Preview endpoint bumps previewCount")
    
    try:
        # First call
        resp1 = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/preview")
        print("--- First preview call ---")
        print_response(resp1)
        
        if resp1.status_code != 200:
            print_fail(f"First preview call failed: {resp1.status_code}")
            return False
        
        result1 = resp1.json()
        preview_count_1 = result1.get('paper', {}).get('previewCount', 0)
        print_pass(f"First preview call successful, previewCount: {preview_count_1}")
        
        # Wait a moment
        time.sleep(0.5)
        
        # Second call
        resp2 = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/preview")
        print("\n--- Second preview call ---")
        print_response(resp2)
        
        if resp2.status_code != 200:
            print_fail(f"Second preview call failed: {resp2.status_code}")
            return False
        
        result2 = resp2.json()
        preview_count_2 = result2.get('paper', {}).get('previewCount', 0)
        
        if preview_count_2 > preview_count_1:
            print_pass(f"previewCount incremented: {preview_count_1} → {preview_count_2}")
            return True
        else:
            print_fail(f"previewCount did not increment: {preview_count_1} → {preview_count_2}")
            return False
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# Test 6: Download gating
def test_6_download_gating():
    print_test(6, "Download gating: 401 no-auth, 402 expired user, 200 admin")
    
    all_passed = True
    
    # Test 6a: No auth → 401
    print("\n--- Test 6a: No auth → 401 ---")
    try:
        resp = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/download")
        print_response(resp)
        
        if resp.status_code == 401:
            print_pass("No auth returns 401 as expected")
        else:
            print_fail(f"Expected 401, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 6b: Expired user → 402
    print("\n--- Test 6b: Expired user → 402 ---")
    try:
        headers = {'Authorization': f'Bearer {expired_user_token}'}
        resp = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/download", headers=headers)
        print_response(resp)
        
        if resp.status_code == 402:
            result = resp.json()
            if result.get('code') == 'SUBSCRIPTION_REQUIRED':
                print_pass("Expired user returns 402 with SUBSCRIPTION_REQUIRED code")
            else:
                print_fail(f"Got 402 but wrong code: {result.get('code')}")
                all_passed = False
        else:
            print_fail(f"Expected 402, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 6c: Admin → 200 (admin bypass)
    print("\n--- Test 6c: Admin → 200 (admin bypass) ---")
    try:
        # Get initial downloadCount
        resp_preview = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/preview")
        initial_download_count = resp_preview.json().get('downloadCount', 0)
        print(f"Initial downloadCount: {initial_download_count}")
        
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/download", headers=headers)
        print_response(resp)
        
        if resp.status_code == 200:
            result = resp.json()
            checks = [
                ('downloadUrl' in result, "Response has 'downloadUrl'"),
                ('title' in result, "Response has 'title'"),
                ('bytes' in result, "Response has 'bytes'")
            ]
            
            for check, msg in checks:
                if check:
                    print_pass(msg)
                else:
                    print_fail(msg)
                    all_passed = False
            
            # Verify admin download does NOT increment downloadCount
            time.sleep(0.5)
            resp_preview2 = requests.get(f"{API_BASE}/official-papers/{EXISTING_PAPER_ID}/preview")
            final_download_count = resp_preview2.json().get('downloadCount', 0)
            print(f"Final downloadCount: {final_download_count}")
            
            if final_download_count == initial_download_count:
                print_pass("Admin download did NOT increment downloadCount (correct)")
            else:
                print_fail(f"Admin download incremented downloadCount: {initial_download_count} → {final_download_count}")
                all_passed = False
        else:
            print_fail(f"Expected 200, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    return all_passed

# Test 7: Admin hide/publish
def test_7_admin_hide_publish():
    print_test(7, "Admin PATCH hide/publish")
    
    if not admin_token or not set_b_paper_id:
        print_fail("No admin token or Set B paper ID available")
        return False
    
    all_passed = True
    
    # Test 7a: Hide the paper
    print("\n--- Test 7a: Hide the paper ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.patch(
            f"{API_BASE}/admin/official-papers/{set_b_paper_id}",
            json={'hiddenByAdmin': True},
            headers=headers
        )
        print_response(resp)
        
        if resp.status_code == 200:
            print_pass("PATCH hide successful")
        else:
            print_fail(f"Expected 200, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 7b: Verify hidden paper does NOT appear in public list
    print("\n--- Test 7b: Verify hidden paper not in public list ---")
    try:
        resp = requests.get(f"{API_BASE}/official-papers")
        result = resp.json()
        items = result.get('items', [])
        
        # Check if Set B paper is in the list
        set_b_in_list = any(item.get('id') == set_b_paper_id for item in items)
        
        if not set_b_in_list:
            print_pass("Hidden paper correctly excluded from public list")
        else:
            print_fail("Hidden paper still appears in public list")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 7c: Publish the paper again
    print("\n--- Test 7c: Publish the paper again ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.patch(
            f"{API_BASE}/admin/official-papers/{set_b_paper_id}",
            json={'hiddenByAdmin': False},
            headers=headers
        )
        print_response(resp)
        
        if resp.status_code == 200:
            print_pass("PATCH publish successful")
        else:
            print_fail(f"Expected 200, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 7d: Verify published paper appears in public list
    print("\n--- Test 7d: Verify published paper in public list ---")
    try:
        resp = requests.get(f"{API_BASE}/official-papers")
        result = resp.json()
        items = result.get('items', [])
        
        # Check if Set B paper is in the list
        set_b_in_list = any(item.get('id') == set_b_paper_id for item in items)
        
        if set_b_in_list:
            print_pass("Published paper correctly appears in public list")
        else:
            print_fail("Published paper does not appear in public list")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    return all_passed

# Test 8: Admin delete
def test_8_admin_delete():
    print_test(8, "Admin DELETE Set B")
    
    if not admin_token or not set_b_paper_id:
        print_fail("No admin token or Set B paper ID available")
        return False
    
    all_passed = True
    
    # Test 8a: Delete Set B
    print("\n--- Test 8a: Delete Set B ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.delete(
            f"{API_BASE}/admin/official-papers/{set_b_paper_id}",
            headers=headers
        )
        print_response(resp)
        
        if resp.status_code == 200:
            print_pass("DELETE successful")
        else:
            print_fail(f"Expected 200, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 8b: Verify deleted paper not in admin list
    print("\n--- Test 8b: Verify deleted paper not in admin list ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.get(f"{API_BASE}/admin/official-papers", headers=headers)
        result = resp.json()
        items = result.get('items', [])
        
        set_b_in_list = any(item.get('id') == set_b_paper_id for item in items)
        
        if not set_b_in_list:
            print_pass("Deleted paper correctly excluded from admin list")
        else:
            print_fail("Deleted paper still appears in admin list")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 8c: Verify deleted paper not in public list
    print("\n--- Test 8c: Verify deleted paper not in public list ---")
    try:
        resp = requests.get(f"{API_BASE}/official-papers")
        result = resp.json()
        items = result.get('items', [])
        
        set_b_in_list = any(item.get('id') == set_b_paper_id for item in items)
        
        if not set_b_in_list:
            print_pass("Deleted paper correctly excluded from public list")
        else:
            print_fail("Deleted paper still appears in public list")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    return all_passed

# Test 9: Non-admin cannot access admin endpoints
def test_9_non_admin_access():
    print_test(9, "Non-admin cannot access /admin endpoints → 403")
    
    if not expired_user_token:
        print_fail("No expired user token available")
        return False
    
    all_passed = True
    
    # Test 9a: POST /admin/official-papers/upload
    print("\n--- Test 9a: POST /admin/official-papers/upload with non-admin → 403 ---")
    try:
        with open('/tmp/FA1.pdf', 'rb') as f:
            pdf_content = f.read()
        
        files = {'pdf': ('test.pdf', pdf_content, 'application/pdf')}
        data = {
            'classId': CLASS_1_ID,
            'bookId': BOOK_ID,
            'examType': 'fa1',
            'setLetter': 'Z',
            'year': '2025-26'
        }
        headers = {'Authorization': f'Bearer {expired_user_token}'}
        
        resp = requests.post(
            f"{API_BASE}/admin/official-papers/upload",
            files=files,
            data=data,
            headers=headers
        )
        print_response(resp)
        
        if resp.status_code == 403:
            print_pass("Non-admin upload returns 403 as expected")
        else:
            print_fail(f"Expected 403, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 9b: GET /admin/official-papers
    print("\n--- Test 9b: GET /admin/official-papers with non-admin → 403 ---")
    try:
        headers = {'Authorization': f'Bearer {expired_user_token}'}
        resp = requests.get(f"{API_BASE}/admin/official-papers", headers=headers)
        print_response(resp)
        
        if resp.status_code == 403:
            print_pass("Non-admin list returns 403 as expected")
        else:
            print_fail(f"Expected 403, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    return all_passed

# Test 10: Regression - existing endpoints still work
def test_10_regression():
    print_test(10, "Regression - existing endpoints still work")
    
    all_passed = True
    
    # Test 10a: GET /api/assessments
    print("\n--- Test 10a: GET /api/assessments ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.get(f"{API_BASE}/assessments", headers=headers)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print_pass("GET /api/assessments working")
        else:
            print_fail(f"GET /api/assessments failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 10b: GET /api/assessments/community (requires auth)
    print("\n--- Test 10b: GET /api/assessments/community ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.get(f"{API_BASE}/assessments/community", headers=headers)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print_pass("GET /api/assessments/community working")
        else:
            print_fail(f"GET /api/assessments/community failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    # Test 10c: GET /api/me/referral
    print("\n--- Test 10c: GET /api/me/referral ---")
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.get(f"{API_BASE}/me/referral", headers=headers)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print_pass("GET /api/me/referral working")
        else:
            print_fail(f"GET /api/me/referral failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print_fail(f"Exception: {e}")
        all_passed = False
    
    return all_passed

# Main test runner
def main():
    print("="*80)
    print("OFFICIAL PAPERS LIBRARY - BACKEND TEST SUITE")
    print("="*80)
    
    results = {}
    
    # Run all tests
    results['Test 0: Setup'] = test_0_setup()
    
    if not results['Test 0: Setup']:
        print("\n❌ Setup failed, cannot continue with tests")
        return
    
    results['Test 1: Admin multipart upload'] = test_1_admin_upload_multipart()
    results['Test 2: Duplicate rejection'] = test_2_duplicate_rejection()
    results['Test 3: Missing year field'] = test_3_missing_year()
    results['Test 4: Public list'] = test_4_public_list()
    results['Test 5: Preview endpoint'] = test_5_preview_endpoint()
    results['Test 6: Download gating'] = test_6_download_gating()
    results['Test 7: Admin hide/publish'] = test_7_admin_hide_publish()
    results['Test 8: Admin delete'] = test_8_admin_delete()
    results['Test 9: Non-admin access'] = test_9_non_admin_access()
    results['Test 10: Regression'] = test_10_regression()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == '__main__':
    main()
