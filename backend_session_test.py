#!/usr/bin/env python3
"""
Single-Device Login Enforcement Test Suite
Tests the auto-kick feature where logging in on a second device invalidates the first device's token.
"""

import requests
import json
import jwt
import random
from datetime import datetime

# Base URL from environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Legacy admin for parallel testing
LEGACY_ADMIN_MOBILE = "9999999999"
LEGACY_ADMIN_PASSWORD = "admin123"

def decode_token(token):
    """Decode JWT without verification to inspect payload"""
    try:
        return jwt.decode(token, options={"verify_signature": False})
    except Exception as e:
        print(f"Failed to decode token: {e}")
        return None

def test_happy_path_login():
    """A) Happy path - login and verify /me works"""
    print("\n" + "="*80)
    print("TEST A: Happy Path - Login and /me")
    print("="*80)
    
    try:
        # Login
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed with status {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        assert "user" in data, "No user in login response"
        
        token = data["token"]
        print(f"✅ Login successful, got token")
        
        # Decode and inspect token
        payload = decode_token(token)
        if payload:
            print(f"   Token payload: id={payload.get('id')}, role={payload.get('role')}, sessionId={payload.get('sessionId')}")
            assert "sessionId" in payload, "Token missing sessionId field"
            print(f"✅ Token contains sessionId: {payload['sessionId']}")
        
        # Test /me endpoint
        response = requests.get(f"{BASE_URL}/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        
        assert response.status_code == 200, f"/me failed with status {response.status_code}: {response.text}"
        me_data = response.json()
        assert "user" in me_data, "No user in /me response"
        print(f"✅ GET /auth/me returned 200 with user: {me_data['user']['name']}")
        
        print("\n✅ TEST A PASSED: Happy path login works correctly")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST A FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST A ERROR: {e}")
        return False

def test_two_device_kick():
    """B) Two-device kick - login twice, first token should be invalidated"""
    print("\n" + "="*80)
    print("TEST B: Two-Device Kick (Core Feature)")
    print("="*80)
    
    try:
        # First login
        response1 = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response1.status_code == 200, f"First login failed: {response1.text}"
        tokenA = response1.json()["token"]
        payloadA = decode_token(tokenA)
        print(f"✅ First login successful, tokenA sessionId: {payloadA.get('sessionId')}")
        
        # Verify tokenA works
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {tokenA}"})
        assert response.status_code == 200, f"tokenA should work initially: {response.text}"
        print(f"✅ tokenA works initially (GET /auth/me → 200)")
        
        # Second login (simulating another device)
        response2 = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response2.status_code == 200, f"Second login failed: {response2.text}"
        tokenB = response2.json()["token"]
        payloadB = decode_token(tokenB)
        print(f"✅ Second login successful, tokenB sessionId: {payloadB.get('sessionId')}")
        
        # Verify sessionIds are different
        assert payloadA.get('sessionId') != payloadB.get('sessionId'), "SessionIds should be different"
        print(f"✅ SessionIds are different (tokenA: {payloadA.get('sessionId')[:8]}..., tokenB: {payloadB.get('sessionId')[:8]}...)")
        
        # Now tokenA should be kicked out
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {tokenA}"})
        assert response.status_code == 401, f"tokenA should return 401, got {response.status_code}: {response.text}"
        error_data = response.json()
        assert error_data.get("code") == "SESSION_REPLACED", f"Expected code SESSION_REPLACED, got {error_data.get('code')}"
        assert "another device" in error_data.get("error", "").lower(), f"Error message should mention another device: {error_data.get('error')}"
        print(f"✅ tokenA now returns 401 with code='SESSION_REPLACED'")
        print(f"   Error message: {error_data.get('error')}")
        
        # tokenB should still work
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {tokenB}"})
        assert response.status_code == 200, f"tokenB should work: {response.text}"
        print(f"✅ tokenB still works (GET /auth/me → 200)")
        
        # Test another authenticated endpoint with tokenA (should also fail)
        response = requests.get(f"{BASE_URL}/me/timetable", headers={"Authorization": f"Bearer {tokenA}"})
        assert response.status_code == 401, f"tokenA should fail on /me/timetable, got {response.status_code}"
        error_data = response.json()
        assert error_data.get("code") == "SESSION_REPLACED", f"Expected SESSION_REPLACED on /me/timetable"
        print(f"✅ tokenA also fails on GET /me/timetable with SESSION_REPLACED")
        
        # Same endpoint with tokenB should work (or return 200 with empty timetable)
        response = requests.get(f"{BASE_URL}/me/timetable", headers={"Authorization": f"Bearer {tokenB}"})
        assert response.status_code == 200, f"tokenB should work on /me/timetable: {response.text}"
        print(f"✅ tokenB works on GET /me/timetable (200)")
        
        print("\n✅ TEST B PASSED: Two-device kick working correctly")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST B FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST B ERROR: {e}")
        return False

def test_register_flow():
    """C) Register flow - new registration should also enforce single-device login"""
    print("\n" + "="*80)
    print("TEST C: Register Flow with Session Enforcement")
    print("="*80)
    
    try:
        # Generate random mobile number
        random_mobile = f"90{random.randint(10000000, 99999999)}"
        test_password = "test1234"
        
        # Register new user
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User Session",
            "mobile": random_mobile,
            "password": test_password
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in register response"
        
        register_token = data["token"]
        payload = decode_token(register_token)
        print(f"✅ Registration successful for mobile {random_mobile}")
        print(f"   Register token sessionId: {payload.get('sessionId')}")
        
        # Verify register token works
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {register_token}"})
        assert response.status_code == 200, f"Register token should work: {response.text}"
        print(f"✅ Register token works (GET /auth/me → 200)")
        
        # Login again with same credentials (simulating another device)
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": random_mobile,
            "password": test_password
        })
        
        assert response.status_code == 200, f"Login after register failed: {response.text}"
        login_token = response.json()["token"]
        login_payload = decode_token(login_token)
        print(f"✅ Login successful after registration")
        print(f"   Login token sessionId: {login_payload.get('sessionId')}")
        
        # Verify sessionIds are different
        assert payload.get('sessionId') != login_payload.get('sessionId'), "SessionIds should differ"
        print(f"✅ SessionIds are different")
        
        # Original register token should now be invalid
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {register_token}"})
        assert response.status_code == 401, f"Register token should be invalid, got {response.status_code}"
        error_data = response.json()
        assert error_data.get("code") == "SESSION_REPLACED", f"Expected SESSION_REPLACED"
        print(f"✅ Original register token now returns 401 SESSION_REPLACED")
        
        # New login token should work
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {login_token}"})
        assert response.status_code == 200, f"Login token should work: {response.text}"
        print(f"✅ New login token works (GET /auth/me → 200)")
        
        print("\n✅ TEST C PASSED: Register flow enforces single-device login")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST C FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST C ERROR: {e}")
        return False

def test_public_endpoints():
    """D) Public endpoints should work without auth"""
    print("\n" + "="*80)
    print("TEST D: Public Endpoints Unaffected")
    print("="*80)
    
    try:
        # Test /settings/public
        response = requests.get(f"{BASE_URL}/settings/public")
        assert response.status_code == 200, f"/settings/public failed: {response.text}"
        data = response.json()
        print(f"✅ GET /settings/public → 200 (no auth required)")
        print(f"   Response keys: {list(data.keys())}")
        
        # Test /reviews/public (if it exists)
        response = requests.get(f"{BASE_URL}/reviews/public")
        assert response.status_code == 200, f"/reviews/public failed: {response.text}"
        print(f"✅ GET /reviews/public → 200 (no auth required)")
        
        # Test /auth/login endpoint itself (should not require auth)
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"/auth/login should work: {response.text}"
        print(f"✅ POST /auth/login → 200 (no auth required)")
        
        print("\n✅ TEST D PASSED: Public endpoints work without auth")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST D FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST D ERROR: {e}")
        return False

def test_invalid_credentials():
    """E) Invalid credentials should return 401 with different message (not SESSION_REPLACED)"""
    print("\n" + "="*80)
    print("TEST E: Invalid Credentials Error Message")
    print("="*80)
    
    try:
        # Test with wrong password
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": "wrongpassword123"
        })
        
        assert response.status_code == 401, f"Should return 401 for wrong password, got {response.status_code}"
        error_data = response.json()
        assert "error" in error_data, "Should have error field"
        assert "invalid credentials" in error_data["error"].lower(), f"Error should mention invalid credentials: {error_data['error']}"
        assert error_data.get("code") != "SESSION_REPLACED", "Should NOT have SESSION_REPLACED code for invalid credentials"
        print(f"✅ Wrong password returns 401 with error: '{error_data['error']}'")
        print(f"✅ No 'code' field present (or code != SESSION_REPLACED)")
        
        # Test with non-existent mobile
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "1234567890",
            "password": "anypassword"
        })
        
        assert response.status_code == 401, f"Should return 401 for non-existent user"
        error_data = response.json()
        assert "invalid credentials" in error_data["error"].lower(), f"Error should mention invalid credentials"
        print(f"✅ Non-existent mobile returns 401 with error: '{error_data['error']}'")
        
        print("\n✅ TEST E PASSED: Invalid credentials return proper error (not SESSION_REPLACED)")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST E FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST E ERROR: {e}")
        return False

def test_regression_endpoints():
    """F) Regression - existing endpoints should work with valid current token"""
    print("\n" + "="*80)
    print("TEST F: Regression - Existing Endpoints Still Work")
    print("="*80)
    
    try:
        # Get a fresh token
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json()["token"]
        print(f"✅ Got fresh admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test /classes (public endpoint)
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"/classes failed: {response.text}"
        classes_data = response.json()
        assert "classes" in classes_data, "Should have classes array"
        print(f"✅ GET /classes → 200 (public, {len(classes_data['classes'])} classes)")
        
        # Test /auth/me with valid token
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        assert response.status_code == 200, f"/auth/me failed: {response.text}"
        me_data = response.json()
        assert "user" in me_data, "Should have user object"
        print(f"✅ GET /auth/me → 200 with valid token")
        
        # Test /admin/analytics (admin-only endpoint)
        response = requests.get(f"{BASE_URL}/admin/analytics", headers=headers)
        assert response.status_code == 200, f"/admin/analytics failed: {response.text}"
        analytics = response.json()
        print(f"✅ GET /admin/analytics → 200 (admin endpoint works)")
        
        # Test /me/timetable (user endpoint)
        response = requests.get(f"{BASE_URL}/me/timetable", headers=headers)
        assert response.status_code == 200, f"/me/timetable failed: {response.text}"
        print(f"✅ GET /me/timetable → 200")
        
        # Test /plans (public endpoint)
        response = requests.get(f"{BASE_URL}/plans")
        assert response.status_code == 200, f"/plans failed: {response.text}"
        plans_data = response.json()
        print(f"✅ GET /plans → 200 (public)")
        
        print("\n✅ TEST F PASSED: All regression endpoints work correctly")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST F FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST F ERROR: {e}")
        return False

def test_parallel_accounts():
    """Additional test: Verify two different accounts don't interfere with each other"""
    print("\n" + "="*80)
    print("TEST G: Parallel Accounts (Bonus Test)")
    print("="*80)
    
    try:
        # Login with admin account
        response1 = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response1.status_code == 200, f"Admin login failed"
        admin_token = response1.json()["token"]
        print(f"✅ Admin logged in")
        
        # Login with legacy admin account
        response2 = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": LEGACY_ADMIN_MOBILE,
            "password": LEGACY_ADMIN_PASSWORD
        })
        assert response2.status_code == 200, f"Legacy admin login failed"
        legacy_token = response2.json()["token"]
        print(f"✅ Legacy admin logged in")
        
        # Both tokens should still work (different accounts)
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Admin token should still work"
        print(f"✅ Admin token still works (different accounts don't interfere)")
        
        response = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {legacy_token}"})
        assert response.status_code == 200, f"Legacy token should still work"
        print(f"✅ Legacy admin token still works")
        
        print("\n✅ TEST G PASSED: Different accounts don't interfere with each other")
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST G FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ TEST G ERROR: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("SINGLE-DEVICE LOGIN ENFORCEMENT TEST SUITE")
    print("Testing auto-kick feature for Next.js backend")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = []
    
    # Run all tests
    results.append(("A - Happy Path Login", test_happy_path_login()))
    results.append(("B - Two-Device Kick (CORE)", test_two_device_kick()))
    results.append(("C - Register Flow", test_register_flow()))
    results.append(("D - Public Endpoints", test_public_endpoints()))
    results.append(("E - Invalid Credentials", test_invalid_credentials()))
    results.append(("F - Regression Tests", test_regression_endpoints()))
    results.append(("G - Parallel Accounts", test_parallel_accounts()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("\n" + "="*80)
    print(f"FINAL RESULT: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Single-device login enforcement is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the failures above.")
        return 1

if __name__ == "__main__":
    exit(main())
