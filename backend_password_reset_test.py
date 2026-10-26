#!/usr/bin/env python3
"""
Backend test for Self Password Reset System (Security Number + Security Image)
Tests all 27 scenarios from the review request.
"""

import requests
import json
import time

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def test_password_reset_system():
    """Test the complete Self Password Reset System"""
    
    print("=" * 80)
    print("SELF PASSWORD RESET SYSTEM - COMPREHENSIVE BACKEND TEST")
    print("=" * 80)
    
    admin_token = None
    user_token = None
    user_id = None
    test_mobile = "9491111111"
    test_password = "abcd"
    test_name = "Reset Test"
    security_image_id = None
    reset_token = None
    new_image_id = None
    
    try:
        # ============================================================================
        # PART A — Security Setup for a user (auth required)
        # ============================================================================
        
        print("\n" + "=" * 80)
        print("PART A — SECURITY SETUP FOR A USER (AUTH REQUIRED)")
        print("=" * 80)
        
        # Test 1: Register a new user
        print("\n[Test 1] Register new user: POST /api/auth/register")
        try:
            resp = requests.post(f"{BASE_URL}/auth/register", json={
                "name": test_name,
                "mobile": test_mobile,
                "password": test_password
            }, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                user_token = data.get("token")
                user_id = data.get("user", {}).get("id")
                security_setup = data.get("user", {}).get("securitySetupCompleted")
                print(f"✅ User registered successfully")
                print(f"   Token: {user_token[:20]}...")
                print(f"   User ID: {user_id}")
                print(f"   securitySetupCompleted: {security_setup}")
                if security_setup is False or security_setup is None:
                    print(f"   ✅ PASS: securitySetupCompleted is False/missing as expected")
                else:
                    print(f"   ❌ FAIL: securitySetupCompleted should be False, got {security_setup}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 2: GET /api/security/images (public, no auth)
        print("\n[Test 2] GET /api/security/images (public, no auth)")
        try:
            resp = requests.get(f"{BASE_URL}/security/images", timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                images = data.get("images", [])
                print(f"✅ Retrieved {len(images)} security images")
                if len(images) >= 9:
                    print(f"   ✅ PASS: At least 9 default images returned")
                    # Verify structure of first image
                    if images:
                        img = images[0]
                        security_image_id = img.get("id")
                        print(f"   Sample image: {img.get('label')} {img.get('emoji')}")
                        print(f"   Fields: id={img.get('id')}, label={img.get('label')}, emoji={img.get('emoji')}, gradient={img.get('gradient')}, url={img.get('url')}, active={img.get('active')}, order={img.get('order')}")
                        if all(k in img for k in ['id', 'label', 'emoji', 'gradient', 'active', 'order']):
                            print(f"   ✅ PASS: Image has all required fields")
                        else:
                            print(f"   ❌ FAIL: Image missing required fields")
                else:
                    print(f"   ❌ FAIL: Expected at least 9 images, got {len(images)}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 3: GET /api/me/security-setup (with new user's token)
        print("\n[Test 3] GET /api/me/security-setup (with new user's token)")
        try:
            resp = requests.get(f"{BASE_URL}/me/security-setup", 
                              headers={"Authorization": f"Bearer {user_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"✅ Retrieved security setup status")
                print(f"   completed: {data.get('completed')}")
                print(f"   securityNumber: {data.get('securityNumber')}")
                print(f"   securityImageId: {data.get('securityImageId')}")
                if data.get('completed') is False and data.get('securityNumber') is None and data.get('securityImageId') is None:
                    print(f"   ✅ PASS: Setup not completed, all fields null as expected")
                else:
                    print(f"   ❌ FAIL: Expected completed=false, securityNumber=null, securityImageId=null")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 4: POST /api/me/security-setup with valid data
        print("\n[Test 4] POST /api/me/security-setup with valid data")
        try:
            resp = requests.post(f"{BASE_URL}/me/security-setup", 
                               headers={"Authorization": f"Bearer {user_token}"},
                               json={"securityNumber": 2, "securityImageId": security_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"✅ Security setup completed successfully")
                print(f"   Response: {data}")
                if data.get('ok') is True:
                    print(f"   ✅ PASS: Setup successful")
                else:
                    print(f"   ❌ FAIL: Expected ok=true")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 5: GET /api/me/security-setup again to verify
        print("\n[Test 5] GET /api/me/security-setup again to verify")
        try:
            resp = requests.get(f"{BASE_URL}/me/security-setup", 
                              headers={"Authorization": f"Bearer {user_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"✅ Retrieved security setup status")
                print(f"   completed: {data.get('completed')}")
                print(f"   securityNumber: {data.get('securityNumber')}")
                print(f"   securityImageId: {data.get('securityImageId')}")
                print(f"   securityImage: {data.get('securityImage', {}).get('label') if data.get('securityImage') else None}")
                if data.get('completed') is True and data.get('securityNumber') == 2 and data.get('securityImageId') == security_image_id:
                    print(f"   ✅ PASS: Setup completed, number=2, image saved correctly")
                else:
                    print(f"   ❌ FAIL: Expected completed=true, securityNumber=2, securityImageId={security_image_id}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 6: Invalid input tests
        print("\n[Test 6] POST with securityNumber=5 (invalid) → 400")
        try:
            resp = requests.post(f"{BASE_URL}/me/security-setup", 
                               headers={"Authorization": f"Bearer {user_token}"},
                               json={"securityNumber": 5, "securityImageId": security_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 400:
                print(f"✅ PASS: Correctly rejected invalid securityNumber=5")
                print(f"   Error: {resp.json().get('error')}")
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        print("\n[Test 7] POST with securityNumber=2 but no securityImageId → 400")
        try:
            resp = requests.post(f"{BASE_URL}/me/security-setup", 
                               headers={"Authorization": f"Bearer {user_token}"},
                               json={"securityNumber": 2}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 400:
                print(f"✅ PASS: Correctly rejected missing securityImageId")
                print(f"   Error: {resp.json().get('error')}")
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        print("\n[Test 8] POST with unknown securityImageId → 400")
        try:
            resp = requests.post(f"{BASE_URL}/me/security-setup", 
                               headers={"Authorization": f"Bearer {user_token}"},
                               json={"securityNumber": 2, "securityImageId": "00000000-0000-0000-0000-000000000000"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 400:
                print(f"✅ PASS: Correctly rejected unknown securityImageId")
                print(f"   Error: {resp.json().get('error')}")
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 9: PUT /api/me/security-setup with wrong password
        print("\n[Test 9] PUT /api/me/security-setup with wrong currentPassword → 400")
        try:
            # Get another image ID for update
            resp_imgs = requests.get(f"{BASE_URL}/security/images", timeout=10)
            if resp_imgs.status_code == 200:
                images = resp_imgs.json().get("images", [])
                other_image_id = next((img['id'] for img in images if img['id'] != security_image_id), security_image_id)
            
            resp = requests.put(f"{BASE_URL}/me/security-setup", 
                              headers={"Authorization": f"Bearer {user_token}"},
                              json={"currentPassword": "wrong", "securityNumber": 3, "securityImageId": other_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 400:
                error = resp.json().get('error', '')
                print(f"✅ PASS: Correctly rejected wrong password")
                print(f"   Error: {error}")
                if "password is incorrect" in error.lower():
                    print(f"   ✅ PASS: Error message mentions incorrect password")
                else:
                    print(f"   ⚠️  WARNING: Error message doesn't mention incorrect password")
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 10: PUT /api/me/security-setup with correct password
        print("\n[Test 10] PUT /api/me/security-setup with correct currentPassword → 200")
        try:
            # Get another image ID for update
            resp_imgs = requests.get(f"{BASE_URL}/security/images", timeout=10)
            if resp_imgs.status_code == 200:
                images = resp_imgs.json().get("images", [])
                other_image_id = next((img['id'] for img in images if img['id'] != security_image_id), security_image_id)
            
            resp = requests.put(f"{BASE_URL}/me/security-setup", 
                              headers={"Authorization": f"Bearer {user_token}"},
                              json={"currentPassword": test_password, "securityNumber": 3, "securityImageId": other_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"✅ PASS: Security setup updated successfully")
                # Verify update
                resp_verify = requests.get(f"{BASE_URL}/me/security-setup", 
                                         headers={"Authorization": f"Bearer {user_token}"}, timeout=10)
                if resp_verify.status_code == 200:
                    data = resp_verify.json()
                    if data.get('securityNumber') == 3 and data.get('securityImageId') == other_image_id:
                        print(f"   ✅ PASS: Verified number=3 and new image saved")
                        # Update for next tests
                        security_image_id = other_image_id
                    else:
                        print(f"   ❌ FAIL: Update not reflected correctly")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # ============================================================================
        # PART B — Password Reset Flow (public)
        # ============================================================================
        
        print("\n" + "=" * 80)
        print("PART B — PASSWORD RESET FLOW (PUBLIC)")
        print("=" * 80)
        
        # Test 11: POST /api/password-reset/init with valid mobile
        print("\n[Test 11] POST /api/password-reset/init with valid mobile")
        try:
            resp = requests.post(f"{BASE_URL}/password-reset/init", 
                               json={"mobile": test_mobile}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"✅ Password reset initiated successfully")
                print(f"   name: {data.get('name')}")
                print(f"   maskedMobile: {data.get('maskedMobile')}")
                images = data.get('images', [])
                print(f"   images count: {len(images)}")
                if len(images) == 3:
                    print(f"   ✅ PASS: Exactly 3 images returned")
                    # Verify one of them is the correct image
                    image_ids = [img['id'] for img in images]
                    if security_image_id in image_ids:
                        print(f"   ✅ PASS: Correct image ID found in challenge")
                    else:
                        print(f"   ❌ FAIL: Correct image ID not found in challenge")
                else:
                    print(f"   ❌ FAIL: Expected 3 images, got {len(images)}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 12: POST /api/password-reset/init with non-existent mobile
        print("\n[Test 12] POST /api/password-reset/init with non-existent mobile → 404")
        try:
            resp = requests.post(f"{BASE_URL}/password-reset/init", 
                               json={"mobile": "1234567890"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 404:
                print(f"✅ PASS: Correctly returned 404 for non-existent mobile")
                print(f"   Error: {resp.json().get('error')}")
            else:
                print(f"❌ FAIL: Expected 404, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 13: POST /api/password-reset/verify with correct details
        print("\n[Test 13] POST /api/password-reset/verify with correct details → 200")
        try:
            resp = requests.post(f"{BASE_URL}/password-reset/verify", 
                               json={"mobile": test_mobile, "securityNumber": 3, "securityImageId": security_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                reset_token = data.get('resetToken')
                print(f"✅ PASS: Verification successful")
                print(f"   resetToken: {reset_token[:30]}...")
                if reset_token:
                    print(f"   ✅ PASS: resetToken returned")
                else:
                    print(f"   ❌ FAIL: resetToken not returned")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 14: POST /api/password-reset/verify with wrong number
        print("\n[Test 14] POST /api/password-reset/verify with wrong securityNumber → 400")
        try:
            resp = requests.post(f"{BASE_URL}/password-reset/verify", 
                               json={"mobile": test_mobile, "securityNumber": 1, "securityImageId": security_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 400:
                print(f"✅ PASS: Correctly rejected wrong securityNumber")
                print(f"   Error: {resp.json().get('error')}")
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 15: POST /api/password-reset/verify with wrong image
        print("\n[Test 15] POST /api/password-reset/verify with wrong securityImageId → 400")
        try:
            # Get a different image ID
            resp_imgs = requests.get(f"{BASE_URL}/security/images", timeout=10)
            if resp_imgs.status_code == 200:
                images = resp_imgs.json().get("images", [])
                wrong_image_id = next((img['id'] for img in images if img['id'] != security_image_id), None)
                if wrong_image_id:
                    resp = requests.post(f"{BASE_URL}/password-reset/verify", 
                                       json={"mobile": test_mobile, "securityNumber": 3, "securityImageId": wrong_image_id}, timeout=10)
                    print(f"Status: {resp.status_code}")
                    if resp.status_code == 400:
                        print(f"✅ PASS: Correctly rejected wrong securityImageId")
                        print(f"   Error: {resp.json().get('error')}")
                    else:
                        print(f"❌ FAIL: Expected 400, got {resp.status_code}")
                else:
                    print(f"⚠️  SKIP: Could not find a different image ID")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 16: Lockout after 5 failures
        print("\n[Test 16] Lockout after 5 failed attempts → 429")
        try:
            print("   Sending 5 wrong verify attempts...")
            for i in range(5):
                resp = requests.post(f"{BASE_URL}/password-reset/verify", 
                                   json={"mobile": test_mobile, "securityNumber": 1, "securityImageId": security_image_id}, timeout=10)
                print(f"   Attempt {i+1}: {resp.status_code}")
                time.sleep(0.5)
            
            # 6th attempt should be locked
            resp = requests.post(f"{BASE_URL}/password-reset/verify", 
                               json={"mobile": test_mobile, "securityNumber": 3, "securityImageId": security_image_id}, timeout=10)
            print(f"Status (6th attempt): {resp.status_code}")
            if resp.status_code == 429:
                error = resp.json().get('error', '')
                print(f"✅ PASS: Correctly locked out after 5 failures")
                print(f"   Error: {error}")
                if "minute" in error.lower():
                    print(f"   ✅ PASS: Error message mentions wait time")
                else:
                    print(f"   ⚠️  WARNING: Error message doesn't mention wait time")
            else:
                print(f"❌ FAIL: Expected 429, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 17: Admin login and reset lockout
        print("\n[Test 17] Admin login and reset lockout via POST /api/admin/security/users/:userId/reset")
        try:
            # Admin login
            resp_login = requests.post(f"{BASE_URL}/auth/login", 
                                      json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}, timeout=10)
            if resp_login.status_code == 200:
                admin_token = resp_login.json().get("token")
                print(f"✅ Admin logged in successfully")
                
                # Reset user's security setup
                resp_reset = requests.post(f"{BASE_URL}/admin/security/users/{user_id}/reset", 
                                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
                print(f"Reset status: {resp_reset.status_code}")
                if resp_reset.status_code == 200:
                    print(f"✅ PASS: User security setup reset successfully")
                    
                    # Re-do setup (Test 4 again)
                    print("   Re-doing security setup...")
                    resp_setup = requests.post(f"{BASE_URL}/me/security-setup", 
                                             headers={"Authorization": f"Bearer {user_token}"},
                                             json={"securityNumber": 3, "securityImageId": security_image_id}, timeout=10)
                    if resp_setup.status_code == 200:
                        print(f"   ✅ PASS: Security setup re-done successfully")
                    else:
                        print(f"   ❌ FAIL: Could not re-do security setup: {resp_setup.status_code}")
                else:
                    print(f"❌ FAIL: Could not reset user security: {resp_reset.status_code}")
            else:
                print(f"❌ FAIL: Admin login failed: {resp_login.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 18: Happy path - verify with correct details after reset
        print("\n[Test 18] POST /api/password-reset/verify with correct details (after reset) → 200")
        try:
            resp = requests.post(f"{BASE_URL}/password-reset/verify", 
                               json={"mobile": test_mobile, "securityNumber": 3, "securityImageId": security_image_id}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                reset_token = data.get('resetToken')
                print(f"✅ PASS: Verification successful after reset")
                print(f"   resetToken: {reset_token[:30]}...")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 19: POST /api/password-reset/complete with valid token
        print("\n[Test 19] POST /api/password-reset/complete with valid resetToken → 200")
        try:
            new_password = "newpass123"
            resp = requests.post(f"{BASE_URL}/password-reset/complete", 
                               json={"resetToken": reset_token, "newPassword": new_password}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"✅ PASS: Password reset completed successfully")
                # Update test_password for next tests
                test_password = new_password
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 20: Login with new password
        print("\n[Test 20] Login with new password → 200")
        try:
            resp = requests.post(f"{BASE_URL}/auth/login", 
                               json={"mobile": test_mobile, "password": test_password}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"✅ PASS: Login successful with new password")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 21: Login with old password should fail
        print("\n[Test 21] Login with old password → 401")
        try:
            resp = requests.post(f"{BASE_URL}/auth/login", 
                               json={"mobile": test_mobile, "password": "abcd"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 401:
                print(f"✅ PASS: Old password correctly rejected")
            else:
                print(f"❌ FAIL: Expected 401, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 22: POST /api/password-reset/complete with expired/invalid token
        print("\n[Test 22] POST /api/password-reset/complete with invalid token → 400")
        try:
            resp = requests.post(f"{BASE_URL}/password-reset/complete", 
                               json={"resetToken": "invalid-token-12345", "newPassword": "test123"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 400:
                print(f"✅ PASS: Invalid token correctly rejected")
                print(f"   Error: {resp.json().get('error')}")
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # ============================================================================
        # PART C — Admin endpoints
        # ============================================================================
        
        print("\n" + "=" * 80)
        print("PART C — ADMIN ENDPOINTS")
        print("=" * 80)
        
        # Test 23: GET /api/admin/security/images (admin)
        print("\n[Test 23] GET /api/admin/security/images (admin)")
        try:
            resp = requests.get(f"{BASE_URL}/admin/security/images", 
                              headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                images = data.get('images', [])
                print(f"✅ Retrieved {len(images)} images with userCount")
                if images:
                    img = images[0]
                    print(f"   Sample: {img.get('label')} - userCount: {img.get('userCount')}")
                    if 'userCount' in img:
                        print(f"   ✅ PASS: userCount field present")
                    else:
                        print(f"   ❌ FAIL: userCount field missing")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 24: POST /api/admin/security/images (create new image)
        print("\n[Test 24] POST /api/admin/security/images (create new image)")
        try:
            resp = requests.post(f"{BASE_URL}/admin/security/images", 
                               headers={"Authorization": f"Bearer {admin_token}"},
                               json={"label": "Test Custom", "emoji": "🎨", "gradient": "from-blue-400 to-indigo-600"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                new_image_id = data.get('image', {}).get('id')
                print(f"✅ PASS: New image created successfully")
                print(f"   Image ID: {new_image_id}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                print(f"Response: {resp.text}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 25: PUT /api/admin/security/images/:id (update image)
        print("\n[Test 25] PUT /api/admin/security/images/:id (update image)")
        try:
            if new_image_id:
                resp = requests.put(f"{BASE_URL}/admin/security/images/{new_image_id}", 
                                  headers={"Authorization": f"Bearer {admin_token}"},
                                  json={"label": "Renamed", "active": False}, timeout=10)
                print(f"Status: {resp.status_code}")
                if resp.status_code == 200:
                    print(f"✅ PASS: Image updated successfully")
                    
                    # Verify inactive image doesn't appear in public GET
                    resp_public = requests.get(f"{BASE_URL}/security/images", timeout=10)
                    if resp_public.status_code == 200:
                        public_images = resp_public.json().get('images', [])
                        public_ids = [img['id'] for img in public_images]
                        if new_image_id not in public_ids:
                            print(f"   ✅ PASS: Inactive image not in public list")
                        else:
                            print(f"   ❌ FAIL: Inactive image still in public list")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            else:
                print(f"⚠️  SKIP: No new image ID to update")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 26: DELETE /api/admin/security/images/:id
        print("\n[Test 26] DELETE /api/admin/security/images/:id")
        try:
            if new_image_id:
                resp = requests.delete(f"{BASE_URL}/admin/security/images/{new_image_id}", 
                                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
                print(f"Status: {resp.status_code}")
                if resp.status_code == 200:
                    print(f"✅ PASS: Image deleted successfully")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            else:
                print(f"⚠️  SKIP: No new image ID to delete")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 27: GET /api/admin/security/users
        print("\n[Test 27] GET /api/admin/security/users")
        try:
            resp = requests.get(f"{BASE_URL}/admin/security/users", 
                              headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                users = data.get('users', [])
                print(f"✅ Retrieved {len(users)} non-admin users")
                # Find our test user
                test_user = next((u for u in users if u.get('mobile') == test_mobile), None)
                if test_user:
                    print(f"   Test user found:")
                    print(f"   - name: {test_user.get('name')}")
                    print(f"   - securitySetupCompleted: {test_user.get('securitySetupCompleted')}")
                    print(f"   - securityImage: {test_user.get('securityImage', {}).get('label') if test_user.get('securityImage') else None}")
                    print(f"   ✅ PASS: User list includes setup status and image info")
                else:
                    print(f"   ⚠️  WARNING: Test user not found in list")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 28: Global toggle - disable
        print("\n[Test 28] PUT /api/admin/security/toggle (disable)")
        try:
            resp = requests.put(f"{BASE_URL}/admin/security/toggle", 
                              headers={"Authorization": f"Bearer {admin_token}"},
                              json={"enabled": False}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"✅ PASS: Toggle updated to disabled")
                
                # Verify /password-reset/init returns 403
                resp_init = requests.post(f"{BASE_URL}/password-reset/init", 
                                        json={"mobile": test_mobile}, timeout=10)
                print(f"   Init status (should be 403): {resp_init.status_code}")
                if resp_init.status_code == 403:
                    error = resp_init.json().get('error', '')
                    print(f"   ✅ PASS: Password reset correctly disabled")
                    print(f"   Error: {error}")
                    if "disabled" in error.lower():
                        print(f"   ✅ PASS: Error message mentions disabled")
                else:
                    print(f"   ❌ FAIL: Expected 403, got {resp_init.status_code}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 29: Global toggle - enable
        print("\n[Test 29] PUT /api/admin/security/toggle (enable)")
        try:
            resp = requests.put(f"{BASE_URL}/admin/security/toggle", 
                              headers={"Authorization": f"Bearer {admin_token}"},
                              json={"enabled": True}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"✅ PASS: Toggle updated to enabled")
                
                # Verify /password-reset/init works again
                resp_init = requests.post(f"{BASE_URL}/password-reset/init", 
                                        json={"mobile": test_mobile}, timeout=10)
                print(f"   Init status (should be 200): {resp_init.status_code}")
                if resp_init.status_code == 200:
                    print(f"   ✅ PASS: Password reset working again")
                else:
                    print(f"   ❌ FAIL: Expected 200, got {resp_init.status_code}")
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        # Test 30: Non-admin access to admin endpoints
        print("\n[Test 30] Non-admin access to /api/admin/security/* → 401/403")
        try:
            # Try with user token (non-admin)
            resp = requests.get(f"{BASE_URL}/admin/security/images", 
                              headers={"Authorization": f"Bearer {user_token}"}, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code in [401, 403]:
                print(f"✅ PASS: Non-admin correctly blocked from admin endpoint")
            else:
                print(f"❌ FAIL: Expected 401/403, got {resp.status_code}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
        
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print("All 30 tests completed. Review results above for pass/fail status.")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_password_reset_system()
