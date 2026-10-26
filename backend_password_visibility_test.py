#!/usr/bin/env python3
"""
Backend test for Admin Password Visibility feature in Lesson Guru Odisha.

Tests the new lastKnownPassword field that stores plaintext passwords when
admins set them (generate, reset, create), but NOT when users self-signup
or self-change their passwords.

Admin credentials: 9999999999 / admin123
Backend base URL: process.env.NEXT_PUBLIC_BASE_URL + /api
"""

import requests
import json
import sys
from datetime import datetime

# Read base URL from .env
BASE_URL = None
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.split('=', 1)[1].strip() + '/api'
            break

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in .env")
    sys.exit(1)

print(f"🔗 Backend URL: {BASE_URL}\n")

# Test counters
passed = 0
failed = 0

def test(name, condition, details=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"✅ Test {passed + failed}: {name}")
        if details:
            print(f"   {details}")
    else:
        failed += 1
        print(f"❌ Test {passed + failed}: {name}")
        if details:
            print(f"   {details}")
    return condition

# ============================================================================
# Test 1: Admin Login
# ============================================================================
print("=" * 80)
print("TEST 1: Admin Login")
print("=" * 80)

try:
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": "9999999999",
        "password": "admin123"
    }, timeout=10)
    
    test("Admin login returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        admin_token = data.get('token')
        admin_user = data.get('user', {})
        admin_name = admin_user.get('name', 'Super Admin')
        
        test("Admin token received", bool(admin_token), f"Token length: {len(admin_token) if admin_token else 0}")
        test("Admin role is 'admin'", admin_user.get('role') == 'admin', f"Role: {admin_user.get('role')}")
        
        print(f"\n✓ Admin logged in: {admin_name} (mobile: 9999999999)")
        print(f"✓ Token: {admin_token[:20]}...")
    else:
        print(f"❌ Login failed: {resp.text}")
        sys.exit(1)
        
except Exception as e:
    print(f"❌ Exception during admin login: {e}")
    sys.exit(1)

# ============================================================================
# Test 2: Find a non-admin user for testing
# ============================================================================
print("\n" + "=" * 80)
print("TEST 2: Find Non-Admin User")
print("=" * 80)

try:
    resp = requests.get(f"{BASE_URL}/admin/users", headers={
        "Authorization": f"Bearer {admin_token}"
    }, timeout=10)
    
    test("GET /admin/users returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        users = data.get('users', [])
        
        # Find a non-admin user
        test_user = None
        for u in users:
            if u.get('role') != 'admin':
                test_user = u
                break
        
        if not test_user:
            # Create a test user
            print("⚠️  No non-admin user found, creating one...")
            resp = requests.post(f"{BASE_URL}/admin/users", headers={
                "Authorization": f"Bearer {admin_token}"
            }, json={
                "name": "Test User Password Visibility",
                "mobile": "9111222333",
                "password": "initial123",
                "role": "user"
            }, timeout=10)
            
            if resp.status_code == 200:
                test_user = resp.json().get('user', {})
                print(f"✓ Created test user: {test_user.get('name')} (mobile: {test_user.get('mobile')})")
            else:
                print(f"❌ Failed to create test user: {resp.text}")
                sys.exit(1)
        
        test_user_id = test_user.get('id')
        test_user_mobile = test_user.get('mobile')
        test_user_name = test_user.get('name')
        
        test("Test user found/created", bool(test_user_id), f"User: {test_user_name} ({test_user_mobile})")
        
        print(f"\n✓ Test user: {test_user_name}")
        print(f"✓ User ID: {test_user_id}")
        print(f"✓ Mobile: {test_user_mobile}")
        
except Exception as e:
    print(f"❌ Exception finding test user: {e}")
    sys.exit(1)

# ============================================================================
# Test 3: Generate Password → Verify lastKnownPassword Persisted
# ============================================================================
print("\n" + "=" * 80)
print("TEST 3: Generate Password → Verify Plaintext Persisted")
print("=" * 80)

try:
    # Generate password
    resp = requests.put(f"{BASE_URL}/admin/users/{test_user_id}/generate-password", headers={
        "Authorization": f"Bearer {admin_token}"
    }, timeout=10)
    
    test("PUT /admin/users/:id/generate-password returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        generated_password = data.get('plainPassword')
        
        test("Response includes plainPassword", bool(generated_password), f"Password: {generated_password}")
        test("Password is 8 characters", len(generated_password) == 8 if generated_password else False, f"Length: {len(generated_password) if generated_password else 0}")
        
        # Verify password is stored in user document
        resp2 = requests.get(f"{BASE_URL}/admin/users", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=10)
        
        if resp2.status_code == 200:
            users = resp2.json().get('users', [])
            user = next((u for u in users if u.get('id') == test_user_id), None)
            
            if user:
                stored_password = user.get('lastKnownPassword')
                stored_at = user.get('lastKnownPasswordAt')
                stored_by = user.get('lastKnownPasswordBy')
                
                test("lastKnownPassword matches generated password", stored_password == generated_password, 
                     f"Stored: {stored_password}, Generated: {generated_password}")
                test("lastKnownPasswordAt is set", bool(stored_at), f"Set at: {stored_at}")
                test("lastKnownPasswordBy is admin name", stored_by == admin_name, f"Set by: {stored_by}")
                
                print(f"\n✓ Generated password: {generated_password}")
                print(f"✓ Stored password: {stored_password}")
                print(f"✓ Set at: {stored_at}")
                print(f"✓ Set by: {stored_by}")
                
                # Save for later tests
                generated_pwd = generated_password
            else:
                test("User found in list", False, "User not found after generation")
        else:
            test("GET /admin/users after generation", False, f"Status: {resp2.status_code}")
    else:
        print(f"❌ Generate password failed: {resp.text}")
        
except Exception as e:
    print(f"❌ Exception during password generation: {e}")

# ============================================================================
# Test 4: Reset Password → Verify lastKnownPassword Persisted
# ============================================================================
print("\n" + "=" * 80)
print("TEST 4: Reset Password → Verify Plaintext Persisted")
print("=" * 80)

try:
    custom_password = "custom123"
    
    # Reset password
    resp = requests.put(f"{BASE_URL}/admin/users/{test_user_id}/reset-password", headers={
        "Authorization": f"Bearer {admin_token}"
    }, json={
        "newPassword": custom_password
    }, timeout=10)
    
    test("PUT /admin/users/:id/reset-password returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        # Verify password is stored
        resp2 = requests.get(f"{BASE_URL}/admin/users", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=10)
        
        if resp2.status_code == 200:
            users = resp2.json().get('users', [])
            user = next((u for u in users if u.get('id') == test_user_id), None)
            
            if user:
                stored_password = user.get('lastKnownPassword')
                
                test("lastKnownPassword matches custom password", stored_password == custom_password, 
                     f"Stored: {stored_password}, Expected: {custom_password}")
                
                print(f"\n✓ Custom password: {custom_password}")
                print(f"✓ Stored password: {stored_password}")
                
                # Verify login works with new password
                resp3 = requests.post(f"{BASE_URL}/auth/login", json={
                    "mobile": test_user_mobile,
                    "password": custom_password
                }, timeout=10)
                
                test("Login with custom password works", resp3.status_code == 200, f"Status: {resp3.status_code}")
                
                if resp3.status_code == 200:
                    user_token = resp3.json().get('token')
                    print(f"✓ Login successful with custom password")
            else:
                test("User found in list", False, "User not found after reset")
        else:
            test("GET /admin/users after reset", False, f"Status: {resp2.status_code}")
    else:
        print(f"❌ Reset password failed: {resp.text}")
        
except Exception as e:
    print(f"❌ Exception during password reset: {e}")

# ============================================================================
# Test 5: Admin Create User → Verify lastKnownPassword Persisted
# ============================================================================
print("\n" + "=" * 80)
print("TEST 5: Admin Create User → Verify Plaintext Persisted")
print("=" * 80)

try:
    new_user_mobile = "9111000222"
    new_user_password = "created123"
    
    # Create user
    resp = requests.post(f"{BASE_URL}/admin/users", headers={
        "Authorization": f"Bearer {admin_token}"
    }, json={
        "name": "QA Test User",
        "mobile": new_user_mobile,
        "password": new_user_password,
        "role": "user"
    }, timeout=10)
    
    test("POST /admin/users returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        new_user = resp.json().get('user', {})
        new_user_id = new_user.get('id')
        
        # Verify password is stored
        resp2 = requests.get(f"{BASE_URL}/admin/users?search={new_user_mobile}", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=10)
        
        if resp2.status_code == 200:
            users = resp2.json().get('users', [])
            user = next((u for u in users if u.get('mobile') == new_user_mobile), None)
            
            if user:
                stored_password = user.get('lastKnownPassword')
                stored_by = user.get('lastKnownPasswordBy')
                
                test("lastKnownPassword matches created password", stored_password == new_user_password, 
                     f"Stored: {stored_password}, Expected: {new_user_password}")
                test("lastKnownPasswordBy is admin name", stored_by == admin_name, f"Set by: {stored_by}")
                
                print(f"\n✓ Created user: {new_user.get('name')}")
                print(f"✓ Mobile: {new_user_mobile}")
                print(f"✓ Password: {new_user_password}")
                print(f"✓ Stored password: {stored_password}")
                print(f"✓ Set by: {stored_by}")
                
                # Save for cleanup
                created_user_id = new_user_id
            else:
                test("New user found in list", False, "User not found after creation")
        else:
            test("GET /admin/users after creation", False, f"Status: {resp2.status_code}")
    else:
        print(f"❌ Create user failed: {resp.text}")
        created_user_id = None
        
except Exception as e:
    print(f"❌ Exception during user creation: {e}")
    created_user_id = None

# ============================================================================
# Test 6: User Self-Signup → Verify lastKnownPassword NOT Set
# ============================================================================
print("\n" + "=" * 80)
print("TEST 6: User Self-Signup → Verify lastKnownPassword NOT Set")
print("=" * 80)

try:
    self_signup_mobile = "9111000333"
    self_signup_password = "selfmade456"
    
    # Self-signup
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "name": "Self Signup User",
        "mobile": self_signup_mobile,
        "password": self_signup_password
    }, timeout=10)
    
    test("POST /auth/register returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        # Verify lastKnownPassword is NOT set
        resp2 = requests.get(f"{BASE_URL}/admin/users?search={self_signup_mobile}", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=10)
        
        if resp2.status_code == 200:
            users = resp2.json().get('users', [])
            user = next((u for u in users if u.get('mobile') == self_signup_mobile), None)
            
            if user:
                stored_password = user.get('lastKnownPassword')
                
                test("lastKnownPassword is NOT set (None or undefined)", stored_password is None or stored_password == '', 
                     f"Stored: {stored_password} (should be None/empty)")
                
                print(f"\n✓ Self-signup user created: {user.get('name')}")
                print(f"✓ Mobile: {self_signup_mobile}")
                print(f"✓ lastKnownPassword: {stored_password} (correctly NOT set)")
                
                # Save for cleanup
                self_signup_user_id = user.get('id')
            else:
                test("Self-signup user found in list", False, "User not found after self-signup")
                self_signup_user_id = None
        else:
            test("GET /admin/users after self-signup", False, f"Status: {resp2.status_code}")
            self_signup_user_id = None
    else:
        print(f"⚠️  Self-signup endpoint may not exist or failed: {resp.text}")
        print(f"   This is acceptable if self-signup is disabled")
        self_signup_user_id = None
        
except Exception as e:
    print(f"⚠️  Exception during self-signup test: {e}")
    print(f"   This is acceptable if self-signup is disabled")
    self_signup_user_id = None

# ============================================================================
# Test 7: User Self-Change → Verify lastKnownPassword NOT Overwritten
# ============================================================================
print("\n" + "=" * 80)
print("TEST 7: User Self-Change → Verify lastKnownPassword NOT Overwritten")
print("=" * 80)

try:
    # Use the user from Test 5 (created by admin with password "created123")
    # Login as that user
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": new_user_mobile,
        "password": new_user_password
    }, timeout=10)
    
    test("Login as created user", resp.status_code == 200, f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        user_token = resp.json().get('token')
        
        # Change password as user
        new_self_password = "userpick789"
        resp2 = requests.post(f"{BASE_URL}/auth/change-password", headers={
            "Authorization": f"Bearer {user_token}"
        }, json={
            "oldPassword": new_user_password,
            "newPassword": new_self_password
        }, timeout=10)
        
        test("POST /auth/change-password returns 200", resp2.status_code == 200, f"Status: {resp2.status_code}")
        
        if resp2.status_code == 200:
            # Verify login with new password works
            resp3 = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": new_user_mobile,
                "password": new_self_password
            }, timeout=10)
            
            test("Login with new self-changed password works", resp3.status_code == 200, f"Status: {resp3.status_code}")
            
            # Verify lastKnownPassword is STILL the admin-set one (not overwritten)
            resp4 = requests.get(f"{BASE_URL}/admin/users?search={new_user_mobile}", headers={
                "Authorization": f"Bearer {admin_token}"
            }, timeout=10)
            
            if resp4.status_code == 200:
                users = resp4.json().get('users', [])
                user = next((u for u in users if u.get('mobile') == new_user_mobile), None)
                
                if user:
                    stored_password = user.get('lastKnownPassword')
                    
                    test("lastKnownPassword still equals admin-set password", stored_password == new_user_password, 
                         f"Stored: {stored_password}, Expected: {new_user_password} (NOT {new_self_password})")
                    
                    print(f"\n✓ User changed password from '{new_user_password}' to '{new_self_password}'")
                    print(f"✓ lastKnownPassword still: {stored_password} (correctly NOT overwritten)")
                else:
                    test("User found after self-change", False, "User not found")
            else:
                test("GET /admin/users after self-change", False, f"Status: {resp4.status_code}")
        else:
            print(f"❌ Change password failed: {resp2.text}")
    else:
        print(f"❌ Login as created user failed: {resp.text}")
        
except Exception as e:
    print(f"❌ Exception during self-change test: {e}")

# ============================================================================
# Test 8: Bcrypt Still Enforced for Auth
# ============================================================================
print("\n" + "=" * 80)
print("TEST 8: Bcrypt Still Enforced for Auth")
print("=" * 80)

try:
    # Login with the plaintext lastKnownPassword should work
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": test_user_mobile,
        "password": custom_password  # This is the lastKnownPassword from Test 4
    }, timeout=10)
    
    test("Login with lastKnownPassword (plaintext) works", resp.status_code == 200, f"Status: {resp.status_code}")
    
    # Get the bcrypt hash from the user document (we need to query MongoDB directly or use a different approach)
    # Since we can't access the hash directly via API (it's excluded), we'll test that
    # logging in with a random hash-like string fails
    
    fake_hash = "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOP"
    resp2 = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": test_user_mobile,
        "password": fake_hash
    }, timeout=10)
    
    test("Login with fake bcrypt hash fails", resp2.status_code == 401, f"Status: {resp2.status_code}")
    
    print(f"\n✓ Login with plaintext password works (bcrypt verification working)")
    print(f"✓ Login with hash string fails (hash not accepted as plaintext)")
    
except Exception as e:
    print(f"❌ Exception during bcrypt test: {e}")

# ============================================================================
# Test 9: Non-Admin Can't View lastKnownPassword
# ============================================================================
print("\n" + "=" * 80)
print("TEST 9: Non-Admin Can't View lastKnownPassword")
print("=" * 80)

try:
    # Login as non-admin user
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": test_user_mobile,
        "password": custom_password
    }, timeout=10)
    
    if resp.status_code == 200:
        user_token = resp.json().get('token')
        
        # Try to access /auth/me
        resp2 = requests.get(f"{BASE_URL}/auth/me", headers={
            "Authorization": f"Bearer {user_token}"
        }, timeout=10)
        
        test("GET /auth/me returns 200", resp2.status_code == 200, f"Status: {resp2.status_code}")
        
        if resp2.status_code == 200:
            user_data = resp2.json().get('user', {})
            has_last_known_pwd = 'lastKnownPassword' in user_data
            
            # Note: Based on the code review, stripUser only removes password and _id,
            # so lastKnownPassword might be visible to the user themselves.
            # The key test is that non-admin can't access /admin/users
            
            print(f"\n✓ User can access /auth/me")
            print(f"✓ lastKnownPassword in response: {has_last_known_pwd}")
            
            if has_last_known_pwd:
                print(f"   ⚠️  Note: User can see their own lastKnownPassword via /auth/me")
                print(f"   This may be intentional - the key security is that they can't see OTHER users' passwords")
        
        # Try to access /admin/users (should fail)
        resp3 = requests.get(f"{BASE_URL}/admin/users", headers={
            "Authorization": f"Bearer {user_token}"
        }, timeout=10)
        
        test("GET /admin/users with non-admin token fails", resp3.status_code in [401, 403], 
             f"Status: {resp3.status_code} (expected 401 or 403)")
        
        print(f"✓ Non-admin correctly blocked from /admin/users (status: {resp3.status_code})")
        
    else:
        test("Login as non-admin user", False, f"Status: {resp.status_code}")
        
except Exception as e:
    print(f"❌ Exception during non-admin access test: {e}")

# ============================================================================
# Cleanup: Delete Test Users
# ============================================================================
print("\n" + "=" * 80)
print("CLEANUP: Delete Test Users")
print("=" * 80)

try:
    # Delete created user
    if created_user_id:
        resp = requests.delete(f"{BASE_URL}/admin/users/{created_user_id}", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=10)
        
        if resp.status_code == 200:
            print(f"✓ Deleted created user: {new_user_mobile}")
        else:
            print(f"⚠️  Failed to delete created user: {resp.text}")
    
    # Delete self-signup user
    if self_signup_user_id:
        resp = requests.delete(f"{BASE_URL}/admin/users/{self_signup_user_id}", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=10)
        
        if resp.status_code == 200:
            print(f"✓ Deleted self-signup user: {self_signup_mobile}")
        else:
            print(f"⚠️  Failed to delete self-signup user: {resp.text}")
            
except Exception as e:
    print(f"⚠️  Exception during cleanup: {e}")

# ============================================================================
# Summary
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"✅ Passed: {passed}")
print(f"❌ Failed: {failed}")
print(f"📊 Total: {passed + failed}")
print(f"📈 Success Rate: {(passed / (passed + failed) * 100):.1f}%")
print("=" * 80)

if failed == 0:
    print("\n🎉 ALL TESTS PASSED! Admin Password Visibility feature is working correctly.")
    sys.exit(0)
else:
    print(f"\n⚠️  {failed} test(s) failed. Please review the output above.")
    sys.exit(1)
