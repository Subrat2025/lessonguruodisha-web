#!/usr/bin/env python3
"""
Backend Test: Assessment Store Admin Analytics + Block/Revoke Enforcement
Tests the admin analytics endpoint and block/unblock user flow with enforcement.
"""

import requests
import time
import json
import sys

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"
PACK_ID = "qa-blk-pack"
DOCUMENT_ID = "qa-blk-doc"

# Test state
admin_token = None
admin_user_id = None
acceptance_id = None
download_token = None

def log_test(test_name, status, details=""):
    """Log test result"""
    symbol = "✅" if status == "PASS" else "❌"
    print(f"\n{symbol} TEST {test_name}: {status}")
    if details:
        print(f"   {details}")

def admin_login():
    """Login as admin and get token + user_id"""
    global admin_token, admin_user_id
    print("\n" + "="*80)
    print("ADMIN LOGIN")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get("token")
            user = data.get("user", {})
            admin_user_id = user.get("id")
            print(f"✅ Admin login successful")
            print(f"   Token: {admin_token[:20]}...")
            print(f"   User ID: {admin_user_id}")
            return True
        else:
            print(f"❌ Admin login failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Admin login error: {e}")
        return False

def test_1_analytics():
    """TEST 1: GET /api/admin/assess/analytics"""
    print("\n" + "="*80)
    print("TEST 1: ADMIN ANALYTICS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/assess/analytics",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("1", "FAIL", f"Status: {response.status_code}, Expected: 200")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        
        # Check required keys
        required_keys = ["perDay", "perPack", "topTeachers", "totals"]
        missing_keys = [key for key in required_keys if key not in data]
        
        if missing_keys:
            log_test("1", "FAIL", f"Missing keys: {missing_keys}")
            return False
        
        # Check totals structure
        totals = data.get("totals", {})
        totals_keys = ["acceptances", "downloads", "teachers"]
        missing_totals = [key for key in totals_keys if key not in totals]
        
        if missing_totals:
            log_test("1", "FAIL", f"Missing totals keys: {missing_totals}")
            return False
        
        # Check array types
        if not isinstance(data.get("perDay"), list):
            log_test("1", "FAIL", "perDay is not an array")
            return False
        
        if not isinstance(data.get("perPack"), list):
            log_test("1", "FAIL", "perPack is not an array")
            return False
        
        if not isinstance(data.get("topTeachers"), list):
            log_test("1", "FAIL", "topTeachers is not an array")
            return False
        
        # Success
        log_test("1", "PASS", 
                f"Analytics endpoint working. Totals: acceptances={totals['acceptances']}, "
                f"downloads={totals['downloads']}, teachers={totals['teachers']}")
        print(f"   perDay entries: {len(data['perDay'])}")
        print(f"   perPack entries: {len(data['perPack'])}")
        print(f"   topTeachers entries: {len(data['topTeachers'])}")
        return True
        
    except Exception as e:
        log_test("1", "FAIL", f"Error: {e}")
        return False

def test_2a_accept_oath():
    """TEST 2a: Accept full oath for qa-blk-pack"""
    global acceptance_id
    print("\n" + "="*80)
    print("TEST 2a: ACCEPT FULL OATH")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-LGO-Device": "DEV1"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/assess/oath/accept",
            json={
                "pack_id": PACK_ID,
                "type": "full",
                "typed_name": "Super Admin",
                "checkboxes": [True, True, True],
                "context": "download"
            },
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("2a", "FAIL", f"Status: {response.status_code}, Expected: 200")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        acceptance_id = data.get("acceptance_id")
        
        if not acceptance_id:
            log_test("2a", "FAIL", "No acceptance_id in response")
            return False
        
        log_test("2a", "PASS", f"Oath accepted. acceptance_id: {acceptance_id}")
        return True
        
    except Exception as e:
        log_test("2a", "FAIL", f"Error: {e}")
        return False

def test_2b_download_before_block():
    """TEST 2b: Download request BEFORE block (should work)"""
    global download_token
    print("\n" + "="*80)
    print("TEST 2b: DOWNLOAD REQUEST BEFORE BLOCK")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-LGO-Device": "DEV1"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/assess/download-request",
            json={
                "document_id": DOCUMENT_ID,
                "acceptance_id": acceptance_id
            },
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("2b", "FAIL", f"Status: {response.status_code}, Expected: 200")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        download_token = data.get("token")
        
        if not download_token:
            log_test("2b", "FAIL", "No token in response")
            return False
        
        log_test("2b", "PASS", f"Download request successful BEFORE block. Token: {download_token[:20]}...")
        return True
        
    except Exception as e:
        log_test("2b", "FAIL", f"Error: {e}")
        return False

def test_2c_block_user():
    """TEST 2c: Block admin user"""
    print("\n" + "="*80)
    print("TEST 2c: BLOCK USER")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/assess/block-user",
            json={
                "user_id": admin_user_id,
                "block": True,
                "reason": "qa-test"
            },
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("2c", "FAIL", f"Status: {response.status_code}, Expected: 200")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        blocked = data.get("blocked")
        orders_revoked = data.get("orders_revoked", 0)
        
        if blocked != True:
            log_test("2c", "FAIL", f"Expected blocked=true, got {blocked}")
            return False
        
        if orders_revoked < 1:
            log_test("2c", "FAIL", f"Expected orders_revoked >= 1, got {orders_revoked}")
            return False
        
        log_test("2c", "PASS", f"User blocked successfully. orders_revoked: {orders_revoked}")
        return True
        
    except Exception as e:
        log_test("2c", "FAIL", f"Error: {e}")
        return False

def test_2d_download_after_block():
    """TEST 2d: Download request AFTER block (should fail with 403 BLOCKED)"""
    print("\n" + "="*80)
    print("TEST 2d: DOWNLOAD REQUEST AFTER BLOCK")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-LGO-Device": "DEV1"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/assess/download-request",
            json={
                "document_id": DOCUMENT_ID,
                "acceptance_id": acceptance_id
            },
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 403:
            log_test("2d", "FAIL", f"Status: {response.status_code}, Expected: 403")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        code = data.get("code")
        
        if code != "BLOCKED":
            log_test("2d", "FAIL", f"Expected code='BLOCKED', got '{code}'")
            return False
        
        log_test("2d", "PASS", f"Download request correctly blocked with 403 code='BLOCKED'")
        return True
        
    except Exception as e:
        log_test("2d", "FAIL", f"Error: {e}")
        return False

def test_2e_view_after_block():
    """TEST 2e: View AFTER block (should fail with 403 BLOCKED)"""
    print("\n" + "="*80)
    print("TEST 2e: VIEW AFTER BLOCK")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-LGO-Device": "DEV1"
    }
    
    try:
        response = requests.get(
            f"{BASE_URL}/assess/view/{DOCUMENT_ID}?acc={acceptance_id}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 403:
            log_test("2e", "FAIL", f"Status: {response.status_code}, Expected: 403")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        code = data.get("code")
        
        if code != "BLOCKED":
            log_test("2e", "FAIL", f"Expected code='BLOCKED', got '{code}'")
            return False
        
        log_test("2e", "PASS", f"View correctly blocked with 403 code='BLOCKED'")
        return True
        
    except Exception as e:
        log_test("2e", "FAIL", f"Error: {e}")
        return False

def test_2f_unblock_user():
    """TEST 2f: Unblock admin user"""
    print("\n" + "="*80)
    print("TEST 2f: UNBLOCK USER")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/assess/block-user",
            json={
                "user_id": admin_user_id,
                "block": False
            },
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("2f", "FAIL", f"Status: {response.status_code}, Expected: 200")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        blocked = data.get("blocked")
        orders_restored = data.get("orders_restored", 0)
        
        if blocked != False:
            log_test("2f", "FAIL", f"Expected blocked=false, got {blocked}")
            return False
        
        if orders_restored < 1:
            log_test("2f", "FAIL", f"Expected orders_restored >= 1, got {orders_restored}")
            return False
        
        log_test("2f", "PASS", f"User unblocked successfully. orders_restored: {orders_restored}")
        return True
        
    except Exception as e:
        log_test("2f", "FAIL", f"Error: {e}")
        return False

def test_2g_download_after_unblock():
    """TEST 2g: Download request AFTER unblock (should work again)"""
    print("\n" + "="*80)
    print("TEST 2g: DOWNLOAD REQUEST AFTER UNBLOCK")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-LGO-Device": "DEV1"
    }
    
    try:
        # Need to accept oath again (fresh acceptance)
        accept_response = requests.post(
            f"{BASE_URL}/assess/oath/accept",
            json={
                "pack_id": PACK_ID,
                "type": "full",
                "typed_name": "Super Admin",
                "checkboxes": [True, True, True],
                "context": "download"
            },
            headers=headers,
            timeout=30
        )
        
        if accept_response.status_code != 200:
            log_test("2g", "FAIL", f"Oath accept failed: {accept_response.status_code}")
            print(f"   Response: {accept_response.text}")
            return False
        
        new_acceptance_id = accept_response.json().get("acceptance_id")
        
        # Now try download request
        response = requests.post(
            f"{BASE_URL}/assess/download-request",
            json={
                "document_id": DOCUMENT_ID,
                "acceptance_id": new_acceptance_id
            },
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("2g", "FAIL", f"Status: {response.status_code}, Expected: 200")
            print(f"   Response: {response.text}")
            return False
        
        data = response.json()
        new_token = data.get("token")
        
        if not new_token:
            log_test("2g", "FAIL", "No token in response")
            return False
        
        # Optionally test actual download
        download_response = requests.get(
            f"{BASE_URL}/assess/download/{new_token}",
            headers=headers,
            timeout=30
        )
        
        if download_response.status_code == 200:
            content = download_response.content
            is_pdf = content[:4] == b'%PDF'
            log_test("2g", "PASS", 
                    f"Access restored after unblock. Download successful. "
                    f"PDF verified: {is_pdf}, Size: {len(content)} bytes")
        else:
            log_test("2g", "PASS", 
                    f"Access restored after unblock. Token received: {new_token[:20]}... "
                    f"(Download endpoint returned {download_response.status_code})")
        
        return True
        
    except Exception as e:
        log_test("2g", "FAIL", f"Error: {e}")
        return False

def main():
    """Main test execution"""
    print("\n" + "="*80)
    print("ASSESSMENT STORE - ADMIN ANALYTICS + BLOCK/REVOKE ENFORCEMENT TEST")
    print("="*80)
    
    # Login
    if not admin_login():
        print("\n❌ FATAL: Admin login failed. Cannot proceed.")
        sys.exit(1)
    
    # Run tests
    results = {}
    results["TEST 1: Analytics"] = test_1_analytics()
    results["TEST 2a: Accept Oath"] = test_2a_accept_oath()
    results["TEST 2b: Download Before Block"] = test_2b_download_before_block()
    results["TEST 2c: Block User"] = test_2c_block_user()
    results["TEST 2d: Download After Block"] = test_2d_download_after_block()
    results["TEST 2e: View After Block"] = test_2e_view_after_block()
    results["TEST 2f: Unblock User"] = test_2f_unblock_user()
    results["TEST 2g: Download After Unblock"] = test_2g_download_after_unblock()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        symbol = "✅" if result else "❌"
        print(f"{symbol} {test_name}: {'PASS' if result else 'FAIL'}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    print(f"{'='*80}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Assessment Store admin analytics + block/revoke enforcement is working correctly.")
        sys.exit(0)
    else:
        print(f"\n⚠️ {total - passed} test(s) failed. Please review the failures above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
