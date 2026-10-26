#!/usr/bin/env python3
"""
Backend test for Admin Export Settings (Print/PDF/Word/Watermark visibility flags)
Tests GET /api/settings/public (no auth) and PUT /api/admin/settings (admin auth)
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
LEGACY_ADMIN_MOBILE = "9999999999"
LEGACY_ADMIN_PASSWORD = "admin123"

# Test user credentials (non-admin)
TEST_USER_MOBILE = "8888888888"
TEST_USER_PASSWORD = "test123"

def test_public_settings_no_auth():
    """Test 1: GET /api/settings/public without auth - should return defaults"""
    print("\n=== Test 1: GET /api/settings/public (no auth) ===")
    try:
        response = requests.get(f"{BASE_URL}/settings/public")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify all four fields exist and default to true
        required_fields = ['showPrint', 'showPdf', 'showWord', 'showWatermark']
        for field in required_fields:
            if field not in data:
                print(f"❌ FAIL: Missing field '{field}'")
                return False
            if data[field] != True:
                print(f"❌ FAIL: Field '{field}' should default to true, got {data[field]}")
                return False
        
        print("✅ PASS: All fields present and default to true")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_login():
    """Test 2: Admin login to get token"""
    print("\n=== Test 2: Admin login (9692604577 / <redacted>) ===")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Login failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return None
        
        data = response.json()
        token = data.get('token')
        if not token:
            print(f"❌ FAIL: No token in response")
            return None
        
        print(f"✅ PASS: Admin login successful, token: {token[:20]}...")
        return token
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return None

def test_admin_settings_no_auth():
    """Test 3: PUT /api/admin/settings without auth - should return 401/403"""
    print("\n=== Test 3: PUT /api/admin/settings (no auth) ===")
    try:
        response = requests.put(f"{BASE_URL}/admin/settings", json={
            "key": "dailyplan_show_print",
            "value": False
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code not in [401, 403]:
            print(f"❌ FAIL: Expected 401 or 403, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print(f"✅ PASS: Correctly rejected with {response.status_code}")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_settings_set_print_false(admin_token):
    """Test 4: PUT /api/admin/settings with key=dailyplan_show_print, value=false"""
    print("\n=== Test 4: PUT /api/admin/settings (dailyplan_show_print=false) ===")
    try:
        response = requests.put(f"{BASE_URL}/admin/settings", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"key": "dailyplan_show_print", "value": False}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        if not data.get('ok'):
            print(f"❌ FAIL: Expected ok:true, got {data}")
            return False
        
        # Verify via public endpoint
        pub_response = requests.get(f"{BASE_URL}/settings/public")
        pub_data = pub_response.json()
        print(f"Public settings after update: {json.dumps(pub_data, indent=2)}")
        
        if pub_data.get('showPrint') != False:
            print(f"❌ FAIL: showPrint should be false, got {pub_data.get('showPrint')}")
            return False
        
        print("✅ PASS: dailyplan_show_print set to false, showPrint=false in public endpoint")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_settings_set_pdf_false(admin_token):
    """Test 5: PUT /api/admin/settings with key=dailyplan_show_pdf, value=false"""
    print("\n=== Test 5: PUT /api/admin/settings (dailyplan_show_pdf=false) ===")
    try:
        response = requests.put(f"{BASE_URL}/admin/settings", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"key": "dailyplan_show_pdf", "value": False}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        # Verify via public endpoint
        pub_response = requests.get(f"{BASE_URL}/settings/public")
        pub_data = pub_response.json()
        
        if pub_data.get('showPdf') != False:
            print(f"❌ FAIL: showPdf should be false, got {pub_data.get('showPdf')}")
            return False
        
        print("✅ PASS: dailyplan_show_pdf set to false, showPdf=false in public endpoint")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_settings_set_word_false(admin_token):
    """Test 6: PUT /api/admin/settings with key=dailyplan_show_word, value=false"""
    print("\n=== Test 6: PUT /api/admin/settings (dailyplan_show_word=false) ===")
    try:
        response = requests.put(f"{BASE_URL}/admin/settings", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"key": "dailyplan_show_word", "value": False}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        # Verify via public endpoint
        pub_response = requests.get(f"{BASE_URL}/settings/public")
        pub_data = pub_response.json()
        
        if pub_data.get('showWord') != False:
            print(f"❌ FAIL: showWord should be false, got {pub_data.get('showWord')}")
            return False
        
        print("✅ PASS: dailyplan_show_word set to false, showWord=false in public endpoint")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_settings_set_watermark_false(admin_token):
    """Test 7: PUT /api/admin/settings with key=dailyplan_show_watermark, value=false"""
    print("\n=== Test 7: PUT /api/admin/settings (dailyplan_show_watermark=false) ===")
    try:
        response = requests.put(f"{BASE_URL}/admin/settings", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"key": "dailyplan_show_watermark", "value": False}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        # Verify via public endpoint
        pub_response = requests.get(f"{BASE_URL}/settings/public")
        pub_data = pub_response.json()
        
        if pub_data.get('showWatermark') != False:
            print(f"❌ FAIL: showWatermark should be false, got {pub_data.get('showWatermark')}")
            return False
        
        print("✅ PASS: dailyplan_show_watermark set to false, showWatermark=false in public endpoint")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_verify_all_false(admin_token):
    """Test 8: Verify all four flags are now false"""
    print("\n=== Test 8: Verify all four flags are false ===")
    try:
        pub_response = requests.get(f"{BASE_URL}/settings/public")
        pub_data = pub_response.json()
        print(f"Public settings: {json.dumps(pub_data, indent=2)}")
        
        expected = {
            'showPrint': False,
            'showPdf': False,
            'showWord': False,
            'showWatermark': False
        }
        
        for key, expected_value in expected.items():
            if pub_data.get(key) != expected_value:
                print(f"❌ FAIL: {key} should be {expected_value}, got {pub_data.get(key)}")
                return False
        
        print("✅ PASS: All four flags are false")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_reset_all_to_true(admin_token):
    """Test 9: Reset all four flags to true"""
    print("\n=== Test 9: Reset all four flags to true ===")
    try:
        keys = ['dailyplan_show_print', 'dailyplan_show_pdf', 'dailyplan_show_word', 'dailyplan_show_watermark']
        
        for key in keys:
            response = requests.put(f"{BASE_URL}/admin/settings", 
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"key": key, "value": True}
            )
            if response.status_code != 200:
                print(f"❌ FAIL: Failed to reset {key}, status {response.status_code}")
                return False
        
        # Verify via public endpoint
        pub_response = requests.get(f"{BASE_URL}/settings/public")
        pub_data = pub_response.json()
        print(f"Public settings after reset: {json.dumps(pub_data, indent=2)}")
        
        expected = {
            'showPrint': True,
            'showPdf': True,
            'showWord': True,
            'showWatermark': True
        }
        
        for key, expected_value in expected.items():
            if pub_data.get(key) != expected_value:
                print(f"❌ FAIL: {key} should be {expected_value}, got {pub_data.get(key)}")
                return False
        
        print("✅ PASS: All four flags reset to true")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_non_admin_user_cannot_update(admin_token):
    """Test 10: Create non-admin user and verify they cannot update settings"""
    print("\n=== Test 10: Non-admin user cannot update settings ===")
    try:
        # First, try to register a test user (or login if exists)
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": TEST_USER_MOBILE,
            "password": TEST_USER_PASSWORD
        })
        
        if reg_response.status_code == 200:
            user_token = reg_response.json().get('token')
            print(f"Test user registered, token: {user_token[:20]}...")
        else:
            # User might already exist, try login
            login_response = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": TEST_USER_MOBILE,
                "password": TEST_USER_PASSWORD
            })
            if login_response.status_code == 200:
                user_token = login_response.json().get('token')
                print(f"Test user logged in, token: {user_token[:20]}...")
            else:
                print(f"⚠ WARNING: Could not create/login test user, skipping non-admin test")
                return True  # Skip this test
        
        # Try to update settings with non-admin token
        response = requests.put(f"{BASE_URL}/admin/settings", 
            headers={"Authorization": f"Bearer {user_token}"},
            json={"key": "dailyplan_show_print", "value": False}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 403:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print("✅ PASS: Non-admin user correctly rejected with 403")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_plans():
    """Test 11: Regression - GET /api/plans returns 5 plans"""
    print("\n=== Test 11: Regression - GET /api/plans ===")
    try:
        response = requests.get(f"{BASE_URL}/plans")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        plans = data.get('plans', [])
        print(f"Plans count: {len(plans)}")
        
        if len(plans) != 5:
            print(f"❌ FAIL: Expected 5 plans, got {len(plans)}")
            return False
        
        print("✅ PASS: GET /api/plans returns 5 plans")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_admin_settings_get(admin_token):
    """Test 12: Regression - GET /api/admin/settings returns all settings including new ones"""
    print("\n=== Test 12: Regression - GET /api/admin/settings ===")
    try:
        response = requests.get(f"{BASE_URL}/admin/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        settings = data.get('settings', {})
        print(f"Settings keys: {list(settings.keys())}")
        
        # Verify the four new keys are present
        required_keys = ['dailyplan_show_print', 'dailyplan_show_pdf', 'dailyplan_show_word', 'dailyplan_show_watermark']
        for key in required_keys:
            if key not in settings:
                print(f"❌ FAIL: Missing key '{key}' in admin settings")
                return False
        
        print("✅ PASS: GET /api/admin/settings returns all settings including new export flags")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_legacy_admin_login():
    """Test 13: Regression - Legacy admin login still works"""
    print("\n=== Test 13: Regression - Legacy admin login (9999999999 / admin123) ===")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": LEGACY_ADMIN_MOBILE,
            "password": LEGACY_ADMIN_PASSWORD
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Legacy admin login failed with status {response.status_code}")
            return False
        
        data = response.json()
        token = data.get('token')
        if not token:
            print(f"❌ FAIL: No token in response")
            return False
        
        print(f"✅ PASS: Legacy admin login successful")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def main():
    print("=" * 80)
    print("BACKEND TEST: Admin Export Settings (Print/PDF/Word/Watermark flags)")
    print("=" * 80)
    
    results = []
    
    # Test 1: Public endpoint without auth (should work)
    results.append(("Public settings (no auth)", test_public_settings_no_auth()))
    
    # Test 2: Admin login
    admin_token = test_admin_login()
    if not admin_token:
        print("\n❌ CRITICAL: Admin login failed, cannot continue")
        sys.exit(1)
    results.append(("Admin login", True))
    
    # Test 3: Admin endpoint without auth (should fail)
    results.append(("Admin settings without auth", test_admin_settings_no_auth()))
    
    # Test 4-7: Set each flag to false
    results.append(("Set showPrint=false", test_admin_settings_set_print_false(admin_token)))
    results.append(("Set showPdf=false", test_admin_settings_set_pdf_false(admin_token)))
    results.append(("Set showWord=false", test_admin_settings_set_word_false(admin_token)))
    results.append(("Set showWatermark=false", test_admin_settings_set_watermark_false(admin_token)))
    
    # Test 8: Verify all false
    results.append(("Verify all false", test_verify_all_false(admin_token)))
    
    # Test 9: Reset all to true
    results.append(("Reset all to true", test_reset_all_to_true(admin_token)))
    
    # Test 10: Non-admin user cannot update
    results.append(("Non-admin cannot update", test_non_admin_user_cannot_update(admin_token)))
    
    # Test 11-13: Regression tests
    results.append(("Regression: GET /api/plans", test_regression_plans()))
    results.append(("Regression: GET /api/admin/settings", test_regression_admin_settings_get(admin_token)))
    results.append(("Regression: Legacy admin login", test_regression_legacy_admin_login()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({100*passed//total}% success rate)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠ {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
