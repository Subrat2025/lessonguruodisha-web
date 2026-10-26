#!/usr/bin/env python3
"""
Backend test for NEW admin password generation endpoint
PUT /api/admin/users/:userId/generate-password

Test cases:
1. Happy path - generate password for non-admin user
2. New password works, old password fails
3. Admin-only guard (no auth, non-admin auth)
4. Not found (invalid userId)
5. Regenerate again (different password)
6. Regression - reset-password and profile update still work
"""

import requests
import os
import re

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def test_generate_password():
    print("\n" + "="*80)
    print("BACKEND TEST: Admin Password Generation Endpoint")
    print("="*80)
    
    admin_token = None
    user_token = None
    test_user_id = None
    test_user_mobile = None
    original_password = "test123"
    generated_password1 = None
    generated_password2 = None
    
    try:
        # ============================================================
        # TEST 1: Admin Login
        # ============================================================
        print("\n[TEST 1] Admin Login")
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"❌ FAILED: Admin login failed - {resp.text}")
            return
        
        data = resp.json()
        admin_token = data.get('token')
        print(f"✅ PASSED: Admin logged in, token: {admin_token[:20]}...")
        
        # ============================================================
        # TEST 2: Create a test user (non-admin)
        # ============================================================
        print("\n[TEST 2] Create test user")
        test_user_mobile = "9000990099"
        resp = requests.post(f"{API_URL}/auth/register", json={
            "name": "Test Subscriber",
            "mobile": test_user_mobile,
            "password": original_password
        })
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            test_user_id = data.get('user', {}).get('id')
            print(f"✅ PASSED: Test user created with ID: {test_user_id}")
        elif resp.status_code == 400 and "already exists" in resp.text.lower():
            # User already exists, fetch it
            print("User already exists, fetching...")
            resp = requests.get(f"{API_URL}/admin/users", headers={
                "Authorization": f"Bearer {admin_token}"
            })
            if resp.status_code == 200:
                users = resp.json().get('users', [])
                for u in users:
                    if u.get('mobile') == test_user_mobile:
                        test_user_id = u.get('id')
                        print(f"✅ PASSED: Found existing test user with ID: {test_user_id}")
                        break
        
        if not test_user_id:
            print("❌ FAILED: Could not create or find test user")
            return
        
        # ============================================================
        # TEST 3: Happy Path - Generate password for non-admin user
        # ============================================================
        print("\n[TEST 3] Happy Path - Generate password")
        resp = requests.put(
            f"{API_URL}/admin/users/{test_user_id}/generate-password",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        if not data.get('ok'):
            print(f"❌ FAILED: Expected ok:true, got {data}")
            return
        
        generated_password1 = data.get('plainPassword')
        returned_mobile = data.get('mobile')
        returned_name = data.get('name')
        
        print(f"Generated password: {generated_password1}")
        print(f"Mobile: {returned_mobile}")
        print(f"Name: {returned_name}")
        
        # Verify password format: 8 chars, uppercase + digits, no confusables
        if not generated_password1 or len(generated_password1) != 8:
            print(f"❌ FAILED: Password length should be 8, got {len(generated_password1) if generated_password1 else 0}")
            return
        
        # Check only uppercase letters and digits
        if not re.match(r'^[A-Z0-9]+$', generated_password1):
            print(f"❌ FAILED: Password should only contain uppercase letters and digits")
            return
        
        # Check no confusables (O, 0, I, 1 should not be present)
        confusables = set('O0I1')
        if any(c in confusables for c in generated_password1):
            print(f"❌ FAILED: Password contains confusable characters (O, 0, I, 1)")
            return
        
        if returned_mobile != test_user_mobile:
            print(f"❌ FAILED: Expected mobile {test_user_mobile}, got {returned_mobile}")
            return
        
        if returned_name != "Test Subscriber":
            print(f"❌ FAILED: Expected name 'Test Subscriber', got {returned_name}")
            return
        
        print(f"✅ PASSED: Password generated successfully with correct format")
        
        # ============================================================
        # TEST 4: New password works - old fails
        # ============================================================
        print("\n[TEST 4] New password works, old password fails")
        
        # Try login with NEW password
        print(f"Trying login with NEW password: {generated_password1}")
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": generated_password1
        })
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Login with new password failed - {resp.text}")
            return
        
        data = resp.json()
        user_token = data.get('token')
        print(f"✅ PASSED: Login with NEW password succeeded, token: {user_token[:20]}...")
        
        # Try login with OLD password (should fail)
        print(f"\nTrying login with OLD password: {original_password}")
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": original_password
        })
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"❌ FAILED: Login with old password should have failed but succeeded")
            return
        
        if resp.status_code not in [401, 403]:
            print(f"❌ FAILED: Expected 401/403 for old password, got {resp.status_code}")
            return
        
        print(f"✅ PASSED: Login with OLD password correctly failed with {resp.status_code}")
        
        # ============================================================
        # TEST 5: Admin-only guard - No auth
        # ============================================================
        print("\n[TEST 5] Admin-only guard - No auth header")
        resp = requests.put(f"{API_URL}/admin/users/{test_user_id}/generate-password")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code not in [401, 403]:
            print(f"❌ FAILED: Expected 401/403 without auth, got {resp.status_code}")
            return
        
        print(f"✅ PASSED: Correctly rejected with {resp.status_code} without auth")
        
        # ============================================================
        # TEST 6: Admin-only guard - Non-admin user
        # ============================================================
        print("\n[TEST 6] Admin-only guard - Non-admin user token")
        resp = requests.put(
            f"{API_URL}/admin/users/{test_user_id}/generate-password",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        print(f"Status: {resp.status_code}")
        
        if resp.status_code not in [401, 403]:
            print(f"❌ FAILED: Expected 401/403 for non-admin, got {resp.status_code}")
            return
        
        print(f"✅ PASSED: Correctly rejected with {resp.status_code} for non-admin")
        
        # ============================================================
        # TEST 7: Not found - Invalid userId
        # ============================================================
        print("\n[TEST 7] Not found - Invalid userId")
        invalid_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.put(
            f"{API_URL}/admin/users/{invalid_id}/generate-password",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code != 404:
            print(f"❌ FAILED: Expected 404 for invalid userId, got {resp.status_code}")
            return
        
        data = resp.json()
        if "not found" not in data.get('error', '').lower():
            print(f"❌ FAILED: Expected 'User not found' error message")
            return
        
        print(f"✅ PASSED: Correctly returned 404 with 'User not found' message")
        
        # ============================================================
        # TEST 8: Regenerate again - Different password
        # ============================================================
        print("\n[TEST 8] Regenerate again - Should get different password")
        resp = requests.put(
            f"{API_URL}/admin/users/{test_user_id}/generate-password",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        generated_password2 = data.get('plainPassword')
        print(f"First password: {generated_password1}")
        print(f"Second password: {generated_password2}")
        
        if generated_password1 == generated_password2:
            print(f"⚠️  WARNING: Both passwords are the same (very unlikely but possible)")
        else:
            print(f"✅ PASSED: Second password is different from first")
        
        # Verify second password works
        print(f"\nVerifying second password works...")
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": generated_password2
        })
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Login with second password failed")
            return
        
        print(f"✅ PASSED: Login with second password succeeded")
        
        # Verify first password no longer works
        print(f"\nVerifying first password no longer works...")
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": generated_password1
        })
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"❌ FAILED: First password should not work after regeneration")
            return
        
        print(f"✅ PASSED: First password correctly rejected after regeneration")
        
        # ============================================================
        # TEST 9: Regression - reset-password still works
        # ============================================================
        print("\n[TEST 9] Regression - reset-password with explicit password")
        explicit_password = "explicit123"
        resp = requests.put(
            f"{API_URL}/admin/users/{test_user_id}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"newPassword": explicit_password}
        )
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: reset-password endpoint failed")
            return
        
        data = resp.json()
        if not data.get('ok'):
            print(f"❌ FAILED: Expected ok:true from reset-password")
            return
        
        print(f"✅ PASSED: reset-password endpoint still works")
        
        # Verify explicit password works
        print(f"\nVerifying explicit password works...")
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": explicit_password
        })
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Login with explicit password failed")
            return
        
        print(f"✅ PASSED: Login with explicit password succeeded")
        
        # ============================================================
        # TEST 10: Regression - profile update still works
        # ============================================================
        print("\n[TEST 10] Regression - profile update (PUT /admin/users/:id)")
        resp = requests.put(
            f"{API_URL}/admin/users/{test_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Renamed User"}
        )
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAILED: Profile update failed")
            return
        
        # Verify name was updated
        resp = requests.get(
            f"{API_URL}/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if resp.status_code == 200:
            users = resp.json().get('users', [])
            for u in users:
                if u.get('id') == test_user_id:
                    if u.get('name') == "Renamed User":
                        print(f"✅ PASSED: Profile update still works, name changed to 'Renamed User'")
                    else:
                        print(f"❌ FAILED: Name not updated, got {u.get('name')}")
                        return
                    break
        
        # ============================================================
        # CLEANUP
        # ============================================================
        print("\n[CLEANUP] Deleting test user")
        resp = requests.delete(
            f"{API_URL}/admin/users/{test_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ Test user deleted successfully")
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED - Admin Password Generation Endpoint Working Correctly")
        print("="*80)
        
    except Exception as e:
        print(f"\n❌ TEST FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_generate_password()
