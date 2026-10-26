#!/usr/bin/env python3
"""
Backend Test: Admin Unresolved Subjects Endpoints
Tests the NEW admin endpoints for Worksheet Language Resolver registry growth.
"""

import requests
import json

BASE_URL = "http://localhost:3000/api"

# Admin credentials (SINGLE-DEVICE login - log in once, reuse token)
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
ADMIN_MOBILE_FALLBACK = "9999999999"
ADMIN_PASSWORD_FALLBACK = "admin123"

# Normal user credentials (for testing non-admin access)
NORMAL_USER_MOBILE = "9444106792"
NORMAL_USER_PASSWORD = "<redacted>"

def test_admin_login():
    """Test 0: Admin login (SINGLE-DEVICE - log in once, reuse token)"""
    print("\n" + "="*80)
    print("TEST 0: Admin Login (SINGLE-DEVICE)")
    print("="*80)
    
    try:
        # Try primary admin credentials
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"⚠️  Primary admin login failed ({response.status_code}), trying fallback...")
            # Try fallback admin credentials
            response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"mobile": ADMIN_MOBILE_FALLBACK, "password": ADMIN_PASSWORD_FALLBACK},
                timeout=10
            )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Admin login successful")
                print(f"   Mobile: {data.get('user', {}).get('mobile', 'N/A')}")
                print(f"   Role: {data.get('user', {}).get('role', 'N/A')}")
                return token
            else:
                print(f"❌ Admin login failed: No token in response")
                return None
        else:
            print(f"❌ Admin login failed: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Admin login exception: {e}")
        return None

def test_normal_user_login():
    """Get normal user token for testing non-admin access"""
    print("\n" + "="*80)
    print("TEST 0b: Normal User Login (for non-admin testing)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": NORMAL_USER_MOBILE, "password": NORMAL_USER_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Normal user login successful")
                print(f"   Mobile: {data.get('user', {}).get('mobile', 'N/A')}")
                print(f"   Role: {data.get('user', {}).get('role', 'N/A')}")
                return token
            else:
                print(f"❌ Normal user login failed: No token in response")
                return None
        else:
            print(f"❌ Normal user login failed: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Normal user login exception: {e}")
        return None

def test_1_auth_no_token():
    """Test 1a: AUTH - GET /admin/unresolved-subjects without token returns 403"""
    print("\n" + "="*80)
    print("TEST 1a: AUTH - GET /admin/unresolved-subjects without token")
    print("="*80)
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/unresolved-subjects",
            timeout=10
        )
        
        if response.status_code == 403:
            print(f"✅ GET /admin/unresolved-subjects without token → 403 (correctly rejected)")
            return True
        else:
            print(f"❌ GET /admin/unresolved-subjects without token → {response.status_code} (expected 403)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 1a exception: {e}")
        return False

def test_1_auth_no_token_resolve():
    """Test 1b: AUTH - POST /admin/unresolved-subjects/resolve without token returns 403"""
    print("\n" + "="*80)
    print("TEST 1b: AUTH - POST /admin/unresolved-subjects/resolve without token")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/unresolved-subjects/resolve",
            json={"key": "test"},
            timeout=10
        )
        
        if response.status_code == 403:
            print(f"✅ POST /admin/unresolved-subjects/resolve without token → 403 (correctly rejected)")
            return True
        else:
            print(f"❌ POST /admin/unresolved-subjects/resolve without token → {response.status_code} (expected 403)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 1b exception: {e}")
        return False

def test_1_auth_normal_user(normal_token):
    """Test 1c: AUTH - GET /admin/unresolved-subjects with normal user token returns 403"""
    print("\n" + "="*80)
    print("TEST 1c: AUTH - GET /admin/unresolved-subjects with normal user token")
    print("="*80)
    
    if not normal_token:
        print(f"⚠️  Skipping test 1c: No normal user token available")
        return False
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/unresolved-subjects",
            headers={"Authorization": f"Bearer {normal_token}"},
            timeout=10
        )
        
        if response.status_code == 403:
            print(f"✅ GET /admin/unresolved-subjects with normal user token → 403 (correctly rejected)")
            return True
        else:
            print(f"❌ GET /admin/unresolved-subjects with normal user token → {response.status_code} (expected 403)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 1c exception: {e}")
        return False

def test_1_auth_normal_user_resolve(normal_token):
    """Test 1d: AUTH - POST /admin/unresolved-subjects/resolve with normal user token returns 403"""
    print("\n" + "="*80)
    print("TEST 1d: AUTH - POST /admin/unresolved-subjects/resolve with normal user token")
    print("="*80)
    
    if not normal_token:
        print(f"⚠️  Skipping test 1d: No normal user token available")
        return False
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/unresolved-subjects/resolve",
            headers={"Authorization": f"Bearer {normal_token}"},
            json={"key": "test"},
            timeout=10
        )
        
        if response.status_code == 403:
            print(f"✅ POST /admin/unresolved-subjects/resolve with normal user token → 403 (correctly rejected)")
            return True
        else:
            print(f"❌ POST /admin/unresolved-subjects/resolve with normal user token → {response.status_code} (expected 403)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 1d exception: {e}")
        return False

def test_2_get_unresolved_subjects(admin_token):
    """Test 2: GET /admin/unresolved-subjects (admin) returns 200 with correct shape"""
    print("\n" + "="*80)
    print("TEST 2: GET /admin/unresolved-subjects (admin token)")
    print("="*80)
    
    if not admin_token:
        print(f"⚠️  Skipping test 2: No admin token available")
        return False
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/unresolved-subjects",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check response shape
            has_ok = "ok" in data and data["ok"] is True
            has_count = "count" in data and isinstance(data["count"], int)
            has_subjects = "subjects" in data and isinstance(data["subjects"], list)
            
            if has_ok and has_count and has_subjects:
                print(f"✅ GET /admin/unresolved-subjects → 200 with correct shape")
                print(f"   ok: {data['ok']}")
                print(f"   count: {data['count']}")
                print(f"   subjects: array with {len(data['subjects'])} items")
                
                # Show sample if any
                if len(data['subjects']) > 0:
                    print(f"   Sample subject: {json.dumps(data['subjects'][0], indent=2)}")
                else:
                    print(f"   Note: subjects array is empty (acceptable on this DB)")
                
                return True
            else:
                print(f"❌ GET /admin/unresolved-subjects → 200 but incorrect shape")
                print(f"   has_ok: {has_ok}, has_count: {has_count}, has_subjects: {has_subjects}")
                print(f"   Response: {json.dumps(data, indent=2)[:500]}")
                return False
        else:
            print(f"❌ GET /admin/unresolved-subjects → {response.status_code} (expected 200)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 2 exception: {e}")
        return False

def test_3_get_unresolved_subjects_include_resolved(admin_token):
    """Test 3: GET /admin/unresolved-subjects?includeResolved=1 returns 200 with array"""
    print("\n" + "="*80)
    print("TEST 3: GET /admin/unresolved-subjects?includeResolved=1")
    print("="*80)
    
    if not admin_token:
        print(f"⚠️  Skipping test 3: No admin token available")
        return False
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/unresolved-subjects?includeResolved=1",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check response shape
            has_ok = "ok" in data and data["ok"] is True
            has_subjects = "subjects" in data and isinstance(data["subjects"], list)
            
            if has_ok and has_subjects:
                print(f"✅ GET /admin/unresolved-subjects?includeResolved=1 → 200 with array")
                print(f"   ok: {data['ok']}")
                print(f"   count: {data.get('count', 'N/A')}")
                print(f"   subjects: array with {len(data['subjects'])} items")
                return True
            else:
                print(f"❌ GET /admin/unresolved-subjects?includeResolved=1 → 200 but incorrect shape")
                print(f"   has_ok: {has_ok}, has_subjects: {has_subjects}")
                print(f"   Response: {json.dumps(data, indent=2)[:500]}")
                return False
        else:
            print(f"❌ GET /admin/unresolved-subjects?includeResolved=1 → {response.status_code} (expected 200)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 3 exception: {e}")
        return False

def test_4_resolve_no_key(admin_token):
    """Test 4a: POST /admin/unresolved-subjects/resolve with NO key returns 400"""
    print("\n" + "="*80)
    print("TEST 4a: POST /admin/unresolved-subjects/resolve with NO key")
    print("="*80)
    
    if not admin_token:
        print(f"⚠️  Skipping test 4a: No admin token available")
        return False
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/unresolved-subjects/resolve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},  # No key
            timeout=10
        )
        
        if response.status_code == 400:
            print(f"✅ POST /admin/unresolved-subjects/resolve with NO key → 400 (correctly rejected)")
            print(f"   Response: {response.text[:200]}")
            return True
        else:
            print(f"❌ POST /admin/unresolved-subjects/resolve with NO key → {response.status_code} (expected 400)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 4a exception: {e}")
        return False

def test_4_resolve_with_key(admin_token):
    """Test 4b: POST /admin/unresolved-subjects/resolve with key returns 200 (idempotent)"""
    print("\n" + "="*80)
    print("TEST 4b: POST /admin/unresolved-subjects/resolve with key (idempotent)")
    print("="*80)
    
    if not admin_token:
        print(f"⚠️  Skipping test 4b: No admin token available")
        return False
    
    try:
        # Use a test key that may or may not exist in DB (idempotent)
        test_key = "someunknownsubject"
        
        response = requests.post(
            f"{BASE_URL}/admin/unresolved-subjects/resolve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"key": test_key},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            has_ok = "ok" in data and data["ok"] is True
            
            if has_ok:
                print(f"✅ POST /admin/unresolved-subjects/resolve with key → 200 {{ ok:true }}")
                print(f"   key: {test_key}")
                print(f"   Response: {json.dumps(data, indent=2)}")
                print(f"   Note: Idempotent even if key not present in DB")
                return True
            else:
                print(f"❌ POST /admin/unresolved-subjects/resolve with key → 200 but ok is not true")
                print(f"   Response: {json.dumps(data, indent=2)}")
                return False
        else:
            print(f"❌ POST /admin/unresolved-subjects/resolve with key → {response.status_code} (expected 200)")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 4b exception: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("BACKEND TEST: Admin Unresolved Subjects Endpoints")
    print("Testing NEW admin endpoints for Worksheet Language Resolver registry growth")
    print("="*80)
    
    results = {}
    
    # Test 0: Login
    admin_token = test_admin_login()
    normal_token = test_normal_user_login()
    
    # Test 1: AUTH (4 sub-tests)
    results["1a_auth_no_token_get"] = test_1_auth_no_token()
    results["1b_auth_no_token_resolve"] = test_1_auth_no_token_resolve()
    results["1c_auth_normal_user_get"] = test_1_auth_normal_user(normal_token)
    results["1d_auth_normal_user_resolve"] = test_1_auth_normal_user_resolve(normal_token)
    
    # Test 2: GET /admin/unresolved-subjects
    results["2_get_unresolved_subjects"] = test_2_get_unresolved_subjects(admin_token)
    
    # Test 3: GET /admin/unresolved-subjects?includeResolved=1
    results["3_get_include_resolved"] = test_3_get_unresolved_subjects_include_resolved(admin_token)
    
    # Test 4: POST /admin/unresolved-subjects/resolve (2 sub-tests)
    results["4a_resolve_no_key"] = test_4_resolve_no_key(admin_token)
    results["4b_resolve_with_key"] = test_4_resolve_with_key(admin_token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nResults by validation item (from review request):")
    print(f"  1. AUTH (4 checks): ", end="")
    auth_tests = [results.get(k, False) for k in ["1a_auth_no_token_get", "1b_auth_no_token_resolve", "1c_auth_normal_user_get", "1d_auth_normal_user_resolve"]]
    if all(auth_tests):
        print("✅ PASSED (4/4)")
    else:
        print(f"❌ FAILED ({sum(auth_tests)}/4)")
    
    print(f"  2. GET /admin/unresolved-subjects: ", end="")
    if results.get("2_get_unresolved_subjects", False):
        print("✅ PASSED")
    else:
        print("❌ FAILED")
    
    print(f"  3. GET with includeResolved=1: ", end="")
    if results.get("3_get_include_resolved", False):
        print("✅ PASSED")
    else:
        print("❌ FAILED")
    
    print(f"  4. POST resolve (2 checks): ", end="")
    resolve_tests = [results.get(k, False) for k in ["4a_resolve_no_key", "4b_resolve_with_key"]]
    if all(resolve_tests):
        print("✅ PASSED (2/2)")
    else:
        print(f"❌ FAILED ({sum(resolve_tests)}/2)")
    
    print(f"\nOverall: {passed}/{total} tests passed ({passed*100//total}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Admin Unresolved Subjects endpoints working correctly!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - see details above")
    
    print("="*80)

if __name__ == "__main__":
    main()
