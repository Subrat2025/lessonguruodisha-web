#!/usr/bin/env python3
"""
Backend test for hardened /api/auth/login endpoint.
Tests defensive normalization for mobile and password fields.
"""
import requests
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_login_hardening():
    print("\n" + "="*80)
    print("BACKEND TEST: Hardened /api/auth/login endpoint")
    print("="*80 + "\n")
    
    passed = 0
    failed = 0
    
    # ========== REGRESSION TESTS ==========
    print("📋 REGRESSION TESTS (must still pass)\n")
    
    # Test 1: Correct credentials login
    print("Test 1: Correct credentials login (9999999999 / admin123)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data and "user" in data:
                print("✅ PASS: Login successful with token")
                admin_token = data["token"]
                passed += 1
            else:
                print(f"❌ FAIL: Missing token or user in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 2: Wrong password
    print("Test 2: Wrong password (9999999999 / wrongpass)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "wrongpass"
        }, timeout=10)
        if resp.status_code == 401:
            data = resp.json()
            if "Invalid credentials" in data.get("error", ""):
                print("✅ PASS: 401 with 'Invalid credentials'")
                passed += 1
            else:
                print(f"❌ FAIL: Wrong error message: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 3: Non-existent mobile
    print("Test 3: Non-existent mobile (1111111111 / admin123)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "1111111111",
            "password": "admin123"
        }, timeout=10)
        if resp.status_code == 401:
            data = resp.json()
            if "Invalid credentials" in data.get("error", ""):
                print("✅ PASS: 401 with 'Invalid credentials'")
                passed += 1
            else:
                print(f"❌ FAIL: Wrong error message: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 4: Suspended user (first create a suspended user)
    print("Test 4: Suspended user")
    try:
        # First, get admin token
        admin_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=10)
        if admin_resp.status_code != 200:
            print(f"⚠️  SKIP: Could not get admin token for suspension test")
            failed += 1
        else:
            admin_token = admin_resp.json()["token"]
            
            # Create or get test user
            test_mobile = "7777777777"
            test_password = "test123"
            
            # Try to register (might already exist)
            reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
                "name": "Suspended Test",
                "mobile": test_mobile,
                "password": test_password
            }, timeout=10)
            
            # Get user ID by listing all users and finding this mobile
            users_resp = requests.get(
                f"{BASE_URL}/admin/users",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            if users_resp.status_code == 200:
                users = users_resp.json().get("users", [])
                test_user = next((u for u in users if u.get("mobile") == test_mobile), None)
                
                if test_user:
                    user_id = test_user["id"]
                    
                    # Suspend the user
                    suspend_resp = requests.put(
                        f"{BASE_URL}/admin/users/{user_id}/suspend",
                        headers={"Authorization": f"Bearer {admin_token}"},
                        timeout=10
                    )
                    
                    # Try to login with suspended user
                    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
                        "mobile": test_mobile,
                        "password": test_password
                    }, timeout=10)
                    
                    if login_resp.status_code == 403:
                        data = login_resp.json()
                        if "suspended" in data.get("error", "").lower():
                            print("✅ PASS: 403 with 'Account suspended' message")
                            passed += 1
                        else:
                            print(f"❌ FAIL: Wrong error message: {data}")
                            failed += 1
                    else:
                        print(f"❌ FAIL: Expected 403, got {login_resp.status_code}: {login_resp.text}")
                        failed += 1
                    
                    # Cleanup: unsuspend the user
                    requests.put(
                        f"{BASE_URL}/admin/users/{user_id}/unsuspend",
                        headers={"Authorization": f"Bearer {admin_token}"},
                        timeout=10
                    )
                else:
                    print(f"⚠️  SKIP: Could not find test user in users list")
                    failed += 1
            else:
                print(f"⚠️  SKIP: Could not get users list")
                failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # ========== NEW HARDENING TESTS ==========
    print("\n📋 NEW HARDENING TESTS\n")
    
    # Test 5: Whitespace-tolerant mobile (with leading/trailing spaces)
    print("Test 5: Whitespace-tolerant mobile (' 9999999999 ' / admin123)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": " 9999999999 ",
            "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                print("✅ PASS: Login successful with whitespace-padded mobile")
                passed += 1
            else:
                print(f"❌ FAIL: Missing token in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 6: Mobile with country code prefix
    print("Test 6: Mobile with country code (+91 9999999999 / admin123)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "+91 9999999999",
            "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                print("✅ PASS: Login successful with country code prefix")
                passed += 1
            else:
                print(f"❌ FAIL: Missing token in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 7: Non-digit chars in mobile (999-999-9999)
    print("Test 7: Non-digit chars in mobile (999-999-9999 / admin123)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "999-999-9999",
            "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                print("✅ PASS: Login successful with dashes in mobile")
                passed += 1
            else:
                print(f"❌ FAIL: Missing token in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 8: 11-digit with country code (919999999999)
    print("Test 8: 11-digit with country code (919999999999 / admin123)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "919999999999",
            "password": "admin123"
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                print("✅ PASS: Login successful with 11-digit mobile (last 10 digits used)")
                passed += 1
            else:
                print(f"❌ FAIL: Missing token in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 9: Password with trailing space (admin123 with space)
    print("Test 9: Password with trailing space (9999999999 / 'admin123 ')")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123 "
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                print("✅ PASS: Login successful with trailing space in password (trim fallback)")
                passed += 1
            else:
                print(f"❌ FAIL: Missing token in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 10: Empty body
    print("Test 10: Empty body {}")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={}, timeout=10)
        if resp.status_code == 401:
            data = resp.json()
            if "Invalid credentials" in data.get("error", ""):
                print("✅ PASS: 401 with 'Invalid credentials' for empty body")
                passed += 1
            else:
                print(f"❌ FAIL: Wrong error message: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 11: Missing password
    print("Test 11: Missing password { mobile: '9999999999' }")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999"
        }, timeout=10)
        if resp.status_code == 401:
            data = resp.json()
            if "Invalid credentials" in data.get("error", ""):
                print("✅ PASS: 401 with 'Invalid credentials' for missing password (not 500)")
                passed += 1
            else:
                print(f"❌ FAIL: Wrong error message: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # ========== FRESH USER TESTS ==========
    print("\n📋 FRESH USER TESTS (create via /api/auth/register)\n")
    
    # Test 12: Create fresh user and login
    print("Test 12: Create fresh user (9490345524 / abcd) and login")
    try:
        # Register new user
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": "9490345524",
            "password": "abcd"
        }, timeout=10)
        if resp.status_code == 200:
            # Now login with the new user
            login_resp = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": "9490345524",
                "password": "abcd"
            }, timeout=10)
            if login_resp.status_code == 200:
                data = login_resp.json()
                if "token" in data:
                    print("✅ PASS: Fresh user registered and logged in successfully")
                    passed += 1
                else:
                    print(f"❌ FAIL: Missing token in response: {data}")
                    failed += 1
            else:
                print(f"❌ FAIL: Expected 200, got {login_resp.status_code}: {login_resp.text}")
                failed += 1
        else:
            # User might already exist, try login anyway
            login_resp = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": "9490345524",
                "password": "abcd"
            }, timeout=10)
            if login_resp.status_code == 200:
                data = login_resp.json()
                if "token" in data:
                    print("✅ PASS: User already exists, logged in successfully")
                    passed += 1
                else:
                    print(f"❌ FAIL: Missing token in response: {data}")
                    failed += 1
            else:
                print(f"❌ FAIL: Could not register or login: {resp.text}")
                failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 13: Login with trailing space in password
    print("Test 13: Login with trailing space in password (9490345524 / 'abcd ')")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9490345524",
            "password": "abcd "
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                print("✅ PASS: Login successful with trailing space (trim fallback)")
                passed += 1
            else:
                print(f"❌ FAIL: Missing token in response: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # Test 14: Login with wrong password
    print("Test 14: Login with wrong password (9490345524 / 'wrong')")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9490345524",
            "password": "wrong"
        }, timeout=10)
        if resp.status_code == 401:
            data = resp.json()
            if "Invalid credentials" in data.get("error", ""):
                print("✅ PASS: 401 with 'Invalid credentials' for wrong password")
                passed += 1
            else:
                print(f"❌ FAIL: Wrong error message: {data}")
                failed += 1
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}: {resp.text}")
            failed += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        failed += 1
    print()
    
    # ========== SUMMARY ==========
    print("\n" + "="*80)
    print(f"TEST SUMMARY: {passed} passed, {failed} failed out of {passed + failed} tests")
    print("="*80 + "\n")
    
    if failed == 0:
        print("✅ ALL TESTS PASSED - Login hardening is working correctly!")
        return True
    else:
        print(f"❌ {failed} TEST(S) FAILED - Please review the failures above")
        return False

if __name__ == "__main__":
    success = test_login_hardening()
    exit(0 if success else 1)
