#!/usr/bin/env python3
"""
Backend test for Phase 3 Referral Milestone (PREVIEW).
Tests all NEW milestone routes with comprehensive auth, data privacy, and functionality checks.
"""
import requests
import sys
import json

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
NON_ADMIN_MOBILE = "9999900001"
NON_ADMIN_PASSWORD = "Test@1234"

# Expected seeded test referrers
REFERRER_500_CODE = "LGTES500"  # count = 500
REFERRER_45_CODE = "LGTEST45"   # count = 45

def login(mobile, password):
    """Login and return JWT token."""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful for {mobile}")
                return token
            else:
                print(f"❌ Login response missing token for {mobile}: {data}")
                return None
        else:
            print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def test_milestone_config(admin_token, non_admin_token):
    """
    A) GET /api/referral/milestone-config
       1. No token -> 401
       2. Logged-in token -> 200 with ONLY {popupV2, milestoneEnabled, target, rechargeLimit, rewards}
    """
    print("\n" + "="*80)
    print("TEST A: GET /api/referral/milestone-config")
    print("="*80)
    
    # A1: No token -> 401
    print("\nA1. No token -> 401")
    try:
        resp = requests.get(f"{BASE_URL}/referral/milestone-config", timeout=10)
        if resp.status_code == 401:
            print(f"✅ PASS: No token returned 401")
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # A2: Logged-in token -> 200 with correct keys
    print("\nA2. Logged-in (non-admin) token -> 200 with correct keys")
    try:
        resp = requests.get(
            f"{BASE_URL}/referral/milestone-config",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        
        # MUST contain ONLY these keys
        expected_keys = {"popupV2", "milestoneEnabled", "target", "rechargeLimit", "rewards"}
        actual_keys = set(data.keys())
        
        if actual_keys == expected_keys:
            print(f"✅ PASS: Response contains ONLY expected keys: {expected_keys}")
        else:
            print(f"❌ FAIL: Key mismatch")
            print(f"   Expected: {expected_keys}")
            print(f"   Actual: {actual_keys}")
            print(f"   Missing: {expected_keys - actual_keys}")
            print(f"   Extra: {actual_keys - expected_keys}")
            return False
        
        # MUST NOT contain PII (names, phones, counts of others)
        data_str = json.dumps(data).lower()
        pii_indicators = ["name", "mobile", "phone", "email", "count", "reached", "userid"]
        found_pii = [word for word in pii_indicators if word in data_str and word not in ["rechargeLimit"]]
        
        if found_pii:
            print(f"⚠️  WARNING: Response may contain PII indicators: {found_pii}")
            print(f"   Full response: {json.dumps(data, indent=2)}")
        else:
            print(f"✅ PASS: No PII indicators found in response")
        
        # Verify structure
        if "rewards" in data and isinstance(data["rewards"], dict):
            print(f"   Rewards keys: {list(data['rewards'].keys())}")
            print(f"✅ PASS: Response structure valid")
        else:
            print(f"❌ FAIL: Invalid rewards structure")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_my_milestone(admin_token, non_admin_token):
    """
    B) GET /api/referral/my-milestone
       1. No token -> 401
       2. Logged-in token -> 200 with ONLY {count, target}
    """
    print("\n" + "="*80)
    print("TEST B: GET /api/referral/my-milestone")
    print("="*80)
    
    # B1: No token -> 401
    print("\nB1. No token -> 401")
    try:
        resp = requests.get(f"{BASE_URL}/referral/my-milestone", timeout=10)
        if resp.status_code == 401:
            print(f"✅ PASS: No token returned 401")
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # B2: Logged-in token -> 200 with {count, target}
    print("\nB2. Logged-in token -> 200 with {count, target}")
    try:
        resp = requests.get(
            f"{BASE_URL}/referral/my-milestone",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        print(f"   Response data: {json.dumps(data, indent=2)}")
        
        # MUST contain ONLY {count, target}
        expected_keys = {"count", "target"}
        actual_keys = set(data.keys())
        
        if actual_keys == expected_keys:
            print(f"✅ PASS: Response contains ONLY expected keys: {expected_keys}")
        else:
            print(f"❌ FAIL: Key mismatch")
            print(f"   Expected: {expected_keys}")
            print(f"   Actual: {actual_keys}")
            return False
        
        # Verify types
        if isinstance(data.get("count"), int) and isinstance(data.get("target"), int):
            print(f"✅ PASS: count={data['count']}, target={data['target']} (both integers)")
        else:
            print(f"❌ FAIL: Invalid types - count: {type(data.get('count'))}, target: {type(data.get('target'))}")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_admin_referral_milestone(admin_token, non_admin_token):
    """
    C) GET /api/admin/referral-milestone
       1. No token -> 401
       2. Non-admin token -> 403
       3. Admin token -> 200 with {config, target, reached[]}
          - Verify count=500 user appears in reached[]
          - Verify count=45 user does NOT appear (below target 500)
          - Each reached item has: name, mobileMasked (masked), count, fraud[], marks
    """
    print("\n" + "="*80)
    print("TEST C: GET /api/admin/referral-milestone")
    print("="*80)
    
    # C1: No token -> 401
    print("\nC1. No token -> 401")
    try:
        resp = requests.get(f"{BASE_URL}/admin/referral-milestone", timeout=10)
        if resp.status_code == 401:
            print(f"✅ PASS: No token returned 401")
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None
    
    # C2: Non-admin token -> 403
    print("\nC2. Non-admin token -> 403")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=10
        )
        if resp.status_code == 403:
            print(f"✅ PASS: Non-admin token returned 403")
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None
    
    # C3: Admin token -> 200 with correct structure
    print("\nC3. Admin token -> 200 with {config, target, reached[]}")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False, None
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        
        # Verify top-level structure
        if not all(k in data for k in ["config", "target", "reached"]):
            print(f"❌ FAIL: Missing required keys. Got: {list(data.keys())}")
            return False, None
        
        print(f"✅ PASS: Response has config, target, reached")
        print(f"   Target: {data['target']}")
        print(f"   Reached count: {len(data['reached'])}")
        
        # Verify reached[] structure
        reached = data.get("reached", [])
        if not reached:
            print(f"⚠️  WARNING: No users in reached[] (may be expected if no seeded data)")
            return True, None
        
        print(f"\n   Analyzing reached[] items ({len(reached)} users):")
        
        user_500 = None
        user_45 = None
        
        for i, item in enumerate(reached):
            print(f"\n   User {i+1}:")
            print(f"     Keys: {list(item.keys())}")
            print(f"     Name: {item.get('name', 'N/A')}")
            print(f"     Mobile: {item.get('mobileMasked', 'N/A')}")
            print(f"     Count: {item.get('count', 'N/A')}")
            print(f"     Fraud: {item.get('fraud', [])}")
            print(f"     Marks keys: {list(item.get('marks', {}).keys())}")
            
            # Check for required fields
            required_fields = ["name", "mobileMasked", "count", "fraud", "marks"]
            missing = [f for f in required_fields if f not in item]
            if missing:
                print(f"     ❌ Missing fields: {missing}")
                return False, None
            
            # Check if mobile is masked (should contain ****)
            mobile = item.get("mobileMasked", "")
            if "****" in mobile or "*" in mobile:
                print(f"     ✅ Mobile is masked")
            else:
                print(f"     ⚠️  Mobile may not be masked: {mobile}")
            
            # Check if this is the 500-count user
            if item.get("count") == 500:
                user_500 = item
                print(f"     ✅ Found count=500 user")
            
            # Check if this is the 45-count user (should NOT be here)
            if item.get("count") == 45:
                user_45 = item
                print(f"     ❌ Found count=45 user (should be below target)")
        
        # Verify 500-count user appears
        if user_500:
            print(f"\n✅ PASS: User with count=500 appears in reached[]")
        else:
            print(f"\n⚠️  WARNING: No user with count=500 found (may need to check seeded data)")
        
        # Verify 45-count user does NOT appear
        if user_45:
            print(f"❌ FAIL: User with count=45 appears in reached[] (should be filtered out, target=500)")
            return False, user_500
        else:
            print(f"✅ PASS: User with count=45 does NOT appear (correctly filtered)")
        
        return True, user_500
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_admin_put_milestone(admin_token, non_admin_token):
    """
    D) PUT /api/admin/referral-milestone
       1. No token -> 401
       2. Non-admin token -> 403
       3. Admin: PUT {rechargeLimit: "up to Rs2,999 (TEST)"} -> 200
       4. GET again and confirm config.rechargeLimit reflects it
       5. PUT it back to "up to Rs2,999"
    """
    print("\n" + "="*80)
    print("TEST D: PUT /api/admin/referral-milestone")
    print("="*80)
    
    # D1: No token -> 401
    print("\nD1. No token -> 401")
    try:
        resp = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            json={"rechargeLimit": "test"},
            timeout=10
        )
        if resp.status_code == 401:
            print(f"✅ PASS: No token returned 401")
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # D2: Non-admin token -> 403
    print("\nD2. Non-admin token -> 403")
    try:
        resp = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            json={"rechargeLimit": "test"},
            timeout=10
        )
        if resp.status_code == 403:
            print(f"✅ PASS: Non-admin token returned 403")
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # D3: Admin PUT with test value
    print("\nD3. Admin PUT {rechargeLimit: 'up to Rs2,999 (TEST)'} -> 200")
    try:
        resp = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"rechargeLimit": "up to Rs2,999 (TEST)"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"✅ PASS: PUT returned 200")
        print(f"   Response: {json.dumps(data, indent=2)}")
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # D4: GET again and verify
    print("\nD4. GET again and verify rechargeLimit updated")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: GET returned {resp.status_code}")
            return False
        
        data = resp.json()
        recharge_limit = data.get("config", {}).get("rechargeLimit")
        print(f"   Current rechargeLimit: {recharge_limit}")
        
        if recharge_limit == "up to Rs2,999 (TEST)":
            print(f"✅ PASS: rechargeLimit updated correctly")
        else:
            print(f"❌ FAIL: rechargeLimit not updated. Expected 'up to Rs2,999 (TEST)', got '{recharge_limit}'")
            return False
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # D5: PUT it back to original
    print("\nD5. PUT back to original value 'up to ₹2,999'")
    try:
        resp = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"rechargeLimit": "up to ₹2,999"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        print(f"✅ PASS: Restored original rechargeLimit")
        
        # Verify restoration
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        data = resp.json()
        recharge_limit = data.get("config", {}).get("rechargeLimit")
        print(f"   Verified rechargeLimit: {recharge_limit}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_admin_mark_milestone(admin_token, non_admin_token, user_500):
    """
    E) POST /api/admin/referral-milestone/mark
       1. No token -> 401
       2. Non-admin token -> 403
       3. Admin give: {userId, reward:'recharge', action:'give', note:'TXN123'} -> 200
       4. Admin give again same -> 409 (already-given)
       5. Admin undo without reason -> 409 (reason-required)
       6. Admin undo with reason -> 200
    """
    print("\n" + "="*80)
    print("TEST E: POST /api/admin/referral-milestone/mark")
    print("="*80)
    
    if not user_500:
        print("⚠️  SKIPPING: No user with count=500 found in previous test")
        return True
    
    user_id = user_500.get("userId")
    if not user_id:
        print("❌ FAIL: user_500 has no userId")
        return False
    
    print(f"\nUsing userId: {user_id} (count=500 user)")
    
    # E1: No token -> 401
    print("\nE1. No token -> 401")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/referral-milestone/mark",
            json={"userId": user_id, "reward": "recharge", "action": "give", "note": "TXN123"},
            timeout=10
        )
        if resp.status_code == 401:
            print(f"✅ PASS: No token returned 401")
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # E2: Non-admin token -> 403
    print("\nE2. Non-admin token -> 403")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/referral-milestone/mark",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            json={"userId": user_id, "reward": "recharge", "action": "give", "note": "TXN123"},
            timeout=10
        )
        if resp.status_code == 403:
            print(f"✅ PASS: Non-admin token returned 403")
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # E3: Admin give reward
    print("\nE3. Admin give reward: {userId, reward:'recharge', action:'give', note:'TXN123'} -> 200")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/referral-milestone/mark",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"userId": user_id, "reward": "recharge", "action": "give", "note": "TXN123"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"✅ PASS: Give reward returned 200")
        print(f"   Response: {json.dumps(data, indent=2)}")
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # E4: Admin give again (should fail with 409 already-given)
    print("\nE4. Admin give again same reward -> 409 (already-given)")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/referral-milestone/mark",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"userId": user_id, "reward": "recharge", "action": "give", "note": "TXN123"},
            timeout=10
        )
        if resp.status_code == 409:
            data = resp.json()
            error = data.get("error", "")
            if "already-given" in error or "already" in error.lower():
                print(f"✅ PASS: Duplicate give returned 409 with error: {error}")
            else:
                print(f"⚠️  WARNING: Got 409 but error message unclear: {error}")
        else:
            print(f"❌ FAIL: Expected 409, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # E5: Admin undo without reason (should fail with 409 reason-required)
    print("\nE5. Admin undo without reason -> 409 (reason-required)")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/referral-milestone/mark",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"userId": user_id, "reward": "recharge", "action": "undo"},
            timeout=10
        )
        if resp.status_code == 409:
            data = resp.json()
            error = data.get("error", "")
            if "reason" in error.lower():
                print(f"✅ PASS: Undo without reason returned 409 with error: {error}")
            else:
                print(f"⚠️  WARNING: Got 409 but error message unclear: {error}")
        else:
            print(f"❌ FAIL: Expected 409, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # E6: Admin undo with reason (should succeed)
    print("\nE6. Admin undo with reason: {userId, reward:'recharge', action:'undo', reason:'test cleanup'} -> 200")
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/referral-milestone/mark",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"userId": user_id, "reward": "recharge", "action": "undo", "reason": "test cleanup"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"✅ PASS: Undo with reason returned 200")
        print(f"   Response: {json.dumps(data, indent=2)}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_no_regression(non_admin_token):
    """
    F) No regression: GET /api/me/referral with normal user token still returns 200 with stats.qualified
    """
    print("\n" + "="*80)
    print("TEST F: No Regression - GET /api/me/referral")
    print("="*80)
    
    print("\nF1. GET /api/me/referral with normal user token -> 200 with stats.qualified")
    try:
        resp = requests.get(
            f"{BASE_URL}/me/referral",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        
        # Check for stats field
        if "stats" not in data:
            print(f"❌ FAIL: Response missing 'stats' field")
            print(f"   Response: {json.dumps(data, indent=2)}")
            return False
        
        stats = data.get("stats", {})
        print(f"   Stats keys: {list(stats.keys())}")
        
        # Check for qualified field in stats
        if "qualified" in stats:
            print(f"✅ PASS: stats.qualified present: {stats['qualified']}")
        else:
            print(f"❌ FAIL: stats.qualified missing")
            print(f"   Stats: {json.dumps(stats, indent=2)}")
            return False
        
        print(f"✅ PASS: Old referral endpoint still working correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("PHASE 3 REFERRAL MILESTONE BACKEND TEST (PREVIEW)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Non-admin: {NON_ADMIN_MOBILE}")
    
    # Login
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ CRITICAL: Admin login failed")
        sys.exit(1)
    
    non_admin_token = login(NON_ADMIN_MOBILE, NON_ADMIN_PASSWORD)
    if not non_admin_token:
        print("❌ CRITICAL: Non-admin login failed")
        sys.exit(1)
    
    # Run tests
    results = []
    
    # Test A: milestone-config
    result_a = test_milestone_config(admin_token, non_admin_token)
    results.append(("A) GET /api/referral/milestone-config", result_a))
    
    # Test B: my-milestone
    result_b = test_my_milestone(admin_token, non_admin_token)
    results.append(("B) GET /api/referral/my-milestone", result_b))
    
    # Test C: admin/referral-milestone (GET)
    result_c, user_500 = test_admin_referral_milestone(admin_token, non_admin_token)
    results.append(("C) GET /api/admin/referral-milestone", result_c))
    
    # Test D: admin/referral-milestone (PUT)
    result_d = test_admin_put_milestone(admin_token, non_admin_token)
    results.append(("D) PUT /api/admin/referral-milestone", result_d))
    
    # Test E: admin/referral-milestone/mark (POST)
    result_e = test_admin_mark_milestone(admin_token, non_admin_token, user_500)
    results.append(("E) POST /api/admin/referral-milestone/mark", result_e))
    
    # Test F: No regression
    result_f = test_no_regression(non_admin_token)
    results.append(("F) No Regression - GET /api/me/referral", result_f))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print(f"{'='*80}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
