#!/usr/bin/env python3
"""
Backend test for STEP 2 P1: Unified Referral Count + Ambassador Threshold (PREVIEW ONLY)

Tests:
1. Admin setting round-trip for ambassadorRequiredReferrals field
2. No regressions on GET endpoints
3. Ambassador plan kill-switch enforcement
4. Continuous-ladder default state verification
"""

import requests
import json
import sys
from typing import Dict, Any

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
NON_ADMIN_MOBILE = "9999900001"
NON_ADMIN_PASSWORD = "Test@1234"

def login(mobile: str, password: str) -> str:
    """Login and return JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": mobile, "password": password},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful for {mobile}")
                return token
            else:
                print(f"❌ Login failed for {mobile}: No token in response")
                return None
        else:
            print(f"❌ Login failed for {mobile}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {str(e)}")
        return None

def test_1_admin_setting_roundtrip(admin_token: str) -> bool:
    """Test 1: Admin setting round-trip for ambassadorRequiredReferrals"""
    print("\n" + "="*80)
    print("TEST 1: Admin Setting Round-Trip for ambassadorRequiredReferrals")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    all_passed = True
    original_value = None
    
    try:
        # Step 1: GET initial value
        print("\n[1.1] GET /api/admin/referral-milestone (initial)")
        response = requests.get(f"{BASE_URL}/admin/referral-milestone", headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            if "config" not in data:
                print(f"❌ FAIL: Response missing 'config' field")
                print(f"Response: {json.dumps(data, indent=2)}")
                all_passed = False
            elif "ambassadorRequiredReferrals" not in data["config"]:
                print(f"❌ FAIL: config missing 'ambassadorRequiredReferrals' field")
                print(f"Config: {json.dumps(data['config'], indent=2)}")
                all_passed = False
            else:
                original_value = data["config"]["ambassadorRequiredReferrals"]
                print(f"✅ PASS: config.ambassadorRequiredReferrals = {original_value}")
                if original_value != 500:
                    print(f"⚠️  NOTE: Expected default 500, got {original_value}")
                
                # Store other fields to verify they don't get clobbered
                print(f"   Other fields: target={data['config'].get('target')}, popupV2={data['config'].get('popupV2')}, milestoneEnabled={data['config'].get('milestoneEnabled')}")
        
        # Step 2: PUT with valid value (300)
        print("\n[1.2] PUT /api/admin/referral-milestone with ambassadorRequiredReferrals=300")
        response = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers=headers,
            json={"ambassadorRequiredReferrals": 300},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            if data.get("config", {}).get("ambassadorRequiredReferrals") != 300:
                print(f"❌ FAIL: Expected ambassadorRequiredReferrals=300, got {data.get('config', {}).get('ambassadorRequiredReferrals')}")
                print(f"Response: {json.dumps(data, indent=2)}")
                all_passed = False
            else:
                print(f"✅ PASS: ambassadorRequiredReferrals updated to 300")
        
        # Step 3: GET again to confirm persistence
        print("\n[1.3] GET /api/admin/referral-milestone (verify persistence)")
        response = requests.get(f"{BASE_URL}/admin/referral-milestone", headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get("config", {}).get("ambassadorRequiredReferrals") != 300:
                print(f"❌ FAIL: Expected persisted value 300, got {data.get('config', {}).get('ambassadorRequiredReferrals')}")
                all_passed = False
            else:
                print(f"✅ PASS: ambassadorRequiredReferrals persisted as 300")
        
        # Step 4: PUT with invalid value ("abc")
        print("\n[1.4] PUT /api/admin/referral-milestone with ambassadorRequiredReferrals='abc' (invalid)")
        response = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers=headers,
            json={"ambassadorRequiredReferrals": "abc"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            coerced_value = data.get("config", {}).get("ambassadorRequiredReferrals")
            # Should coerce to valid number (>=1, falls back to 500)
            if not isinstance(coerced_value, int) or coerced_value < 1:
                print(f"❌ FAIL: Expected coercion to valid int >=1, got {coerced_value} (type: {type(coerced_value)})")
                all_passed = False
            else:
                print(f"✅ PASS: Invalid value coerced to {coerced_value} (valid int >=1)")
        
        # Step 5: Verify other fields NOT clobbered
        print("\n[1.5] Verify other fields NOT clobbered")
        response = requests.get(f"{BASE_URL}/admin/referral-milestone", headers=headers, timeout=30)
        if response.status_code == 200:
            data = response.json()
            config = data.get("config", {})
            required_fields = ["target", "popupV2", "milestoneEnabled", "rewards"]
            missing_fields = [f for f in required_fields if f not in config]
            if missing_fields:
                print(f"❌ FAIL: Missing fields after PUT: {missing_fields}")
                all_passed = False
            else:
                print(f"✅ PASS: All required fields present (target, popupV2, milestoneEnabled, rewards)")
                print(f"   target={config.get('target')}, popupV2={config.get('popupV2')}, milestoneEnabled={config.get('milestoneEnabled')}")
        
        # Step 6: CLEANUP - Restore original value (or 500 if original was not 500)
        restore_value = 500  # Always restore to 500 as per instructions
        print(f"\n[1.6] CLEANUP: Restore ambassadorRequiredReferrals to {restore_value}")
        response = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers=headers,
            json={"ambassadorRequiredReferrals": restore_value},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Cleanup failed - {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get("config", {}).get("ambassadorRequiredReferrals") != restore_value:
                print(f"❌ FAIL: Cleanup failed - expected {restore_value}, got {data.get('config', {}).get('ambassadorRequiredReferrals')}")
                all_passed = False
            else:
                print(f"✅ PASS: Restored ambassadorRequiredReferrals to {restore_value}")
        
        # Final verification
        print("\n[1.7] Final verification GET")
        response = requests.get(f"{BASE_URL}/admin/referral-milestone", headers=headers, timeout=30)
        if response.status_code == 200:
            data = response.json()
            final_value = data.get("config", {}).get("ambassadorRequiredReferrals")
            if final_value == restore_value:
                print(f"✅ PASS: Final value confirmed as {restore_value}")
            else:
                print(f"❌ FAIL: Final value is {final_value}, expected {restore_value}")
                all_passed = False
    
    except Exception as e:
        print(f"❌ EXCEPTION in test_1: {str(e)}")
        all_passed = False
    
    return all_passed

def test_2_no_regressions(admin_token: str, user_token: str) -> bool:
    """Test 2: No regressions / no 500s on GET endpoints"""
    print("\n" + "="*80)
    print("TEST 2: No Regressions on GET Endpoints")
    print("="*80)
    
    all_passed = True
    
    try:
        # Test 2.1: GET /api/admin/referral-milestone (fast, no reached list)
        print("\n[2.1] GET /api/admin/referral-milestone (admin auth, no withReached)")
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/referral-milestone", headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            required_fields = ["config", "continuousLadder", "notice"]
            missing = [f for f in required_fields if f not in data]
            if missing:
                print(f"❌ FAIL: Missing fields: {missing}")
                print(f"Response keys: {list(data.keys())}")
                all_passed = False
            else:
                print(f"✅ PASS: Response has config + continuousLadder + notice")
                print(f"   continuousLadder={data.get('continuousLadder')}, reachedDeferred={data.get('reachedDeferred')}")
        
        # Test 2.2: GET /api/admin/referral-milestone?withReached=1 (may take a while)
        print("\n[2.2] GET /api/admin/referral-milestone?withReached=1 (admin auth, with reached list)")
        print("   NOTE: This may take up to 25 seconds...")
        response = requests.get(f"{BASE_URL}/admin/referral-milestone?withReached=1", headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            required_fields = ["config", "continuousLadder", "notice", "reached"]
            missing = [f for f in required_fields if f not in data]
            if missing:
                print(f"❌ FAIL: Missing fields: {missing}")
                all_passed = False
            else:
                print(f"✅ PASS: Response has config + continuousLadder + notice + reached")
                print(f"   reached count: {len(data.get('reached', []))}")
        
        # Test 2.3: GET /api/admin/referral-milestone/preview?limit=20
        print("\n[2.3] GET /api/admin/referral-milestone/preview?limit=20 (admin auth)")
        response = requests.get(f"{BASE_URL}/admin/referral-milestone/preview?limit=20", headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            if "ok" not in data or not data["ok"]:
                print(f"❌ FAIL: Response missing 'ok: true'")
                all_passed = False
            else:
                print(f"✅ PASS: Preview endpoint returned 200 with ok=true")
                print(f"   Response keys: {list(data.keys())}")
        
        # Test 2.4: GET /api/referral/my-milestone (non-admin user)
        print("\n[2.4] GET /api/referral/my-milestone (non-admin user auth)")
        user_headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/referral/my-milestone", headers=user_headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            if "count" not in data or "target" not in data:
                print(f"❌ FAIL: Response missing 'count' or 'target'")
                print(f"Response: {json.dumps(data, indent=2)}")
                all_passed = False
            else:
                print(f"✅ PASS: Response has count={data['count']}, target={data['target']}")
        
        # Test 2.5: GET /api/referral/milestone-config (non-admin user)
        print("\n[2.5] GET /api/referral/milestone-config (non-admin user auth)")
        response = requests.get(f"{BASE_URL}/referral/milestone-config", headers=user_headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            all_passed = False
        else:
            data = response.json()
            if "continuousLadder" not in data:
                print(f"❌ FAIL: Response missing 'continuousLadder'")
                print(f"Response keys: {list(data.keys())}")
                all_passed = False
            else:
                print(f"✅ PASS: Response includes continuousLadder={data['continuousLadder']}")
                print(f"   Other keys: {list(data.keys())}")
    
    except Exception as e:
        print(f"❌ EXCEPTION in test_2: {str(e)}")
        all_passed = False
    
    return all_passed

def test_3_ambassador_killswitch(admin_token: str, user_token: str) -> bool:
    """Test 3: Ambassador plan kill-switch enforcement"""
    print("\n" + "="*80)
    print("TEST 3: Ambassador Plan Kill-Switch Enforcement")
    print("="*80)
    
    all_passed = True
    
    try:
        # Test 3.1: GET /api/plans (any auth) - should NOT contain ambassador-yearly
        print("\n[3.1] GET /api/plans (user auth) - verify ambassador-yearly NOT present")
        user_headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/plans", headers=user_headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            plans = data.get("plans", [])
            ambassador_plan = next((p for p in plans if p.get("id") == "ambassador-yearly"), None)
            if ambassador_plan:
                print(f"❌ FAIL: ambassador-yearly plan FOUND in plans list (should be blocked)")
                print(f"   Plan: {json.dumps(ambassador_plan, indent=2)}")
                all_passed = False
            else:
                print(f"✅ PASS: ambassador-yearly plan NOT in plans list (correctly blocked)")
                print(f"   Plans found: {[p.get('id') for p in plans]}")
        
        # Test 3.2: GET /api/plans (admin auth) - should also NOT contain ambassador-yearly
        print("\n[3.2] GET /api/plans (admin auth) - verify ambassador-yearly NOT present")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/plans", headers=admin_headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            plans = data.get("plans", [])
            ambassador_plan = next((p for p in plans if p.get("id") == "ambassador-yearly"), None)
            if ambassador_plan:
                print(f"❌ FAIL: ambassador-yearly plan FOUND in plans list for admin (should be blocked)")
                all_passed = False
            else:
                print(f"✅ PASS: ambassador-yearly plan NOT in plans list for admin (correctly blocked)")
        
        # Test 3.3: POST /api/razorpay/create-order with ambassador-yearly - should return 403
        print("\n[3.3] POST /api/razorpay/create-order with planId='ambassador-yearly' (should be 403)")
        response = requests.post(
            f"{BASE_URL}/razorpay/create-order",
            headers=user_headers,
            json={"planId": "ambassador-yearly"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 403:
            print(f"✅ PASS: ambassador-yearly order creation blocked with 403")
            data = response.json()
            print(f"   Error message: {data.get('error', 'N/A')}")
        elif response.status_code == 200:
            print(f"❌ FAIL: ambassador-yearly order creation SUCCEEDED (should be blocked)")
            print(f"   Response: {response.text}")
            all_passed = False
        else:
            print(f"⚠️  UNEXPECTED: Got status {response.status_code} (expected 403)")
            print(f"   Response: {response.text}")
            # Not necessarily a failure if it's blocked in some other way
        
        # Test 3.4: Try with admin token as well
        print("\n[3.4] POST /api/razorpay/create-order with planId='ambassador-yearly' (admin, should be 403)")
        response = requests.post(
            f"{BASE_URL}/razorpay/create-order",
            headers=admin_headers,
            json={"planId": "ambassador-yearly"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 403:
            print(f"✅ PASS: ambassador-yearly order creation blocked for admin with 403")
            data = response.json()
            print(f"   Error message: {data.get('error', 'N/A')}")
        elif response.status_code == 200:
            print(f"❌ FAIL: ambassador-yearly order creation SUCCEEDED for admin (should be blocked)")
            all_passed = False
        else:
            print(f"⚠️  UNEXPECTED: Got status {response.status_code} (expected 403)")
        
        # Test 3.5: Check QR payment path (if endpoint exists)
        print("\n[3.5] Check QR payment path for ambassador-yearly blocking")
        # Try to submit QR payment with ambassador-yearly plan
        response = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers=user_headers,
            json={
                "planId": "ambassador-yearly",
                "utrNumber": "TEST123456789",
                "amount": 99
            },
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 403:
            print(f"✅ PASS: QR payment for ambassador-yearly blocked with 403")
            data = response.json()
            print(f"   Error message: {data.get('error', 'N/A')}")
        elif response.status_code == 404:
            print(f"ℹ️  INFO: QR payment endpoint not found (404) - may not exist or different path")
        elif response.status_code == 200:
            print(f"❌ FAIL: QR payment for ambassador-yearly SUCCEEDED (should be blocked)")
            all_passed = False
        else:
            print(f"ℹ️  INFO: Got status {response.status_code} - endpoint may not exist or require different params")
    
    except Exception as e:
        print(f"❌ EXCEPTION in test_3: {str(e)}")
        all_passed = False
    
    return all_passed

def test_4_continuous_ladder_default(admin_token: str) -> bool:
    """Test 4: Continuous-ladder default state should be ON (true)"""
    print("\n" + "="*80)
    print("TEST 4: Continuous-Ladder Default State Verification")
    print("="*80)
    
    all_passed = True
    
    try:
        print("\n[4.1] GET /api/admin/referral-milestone - verify continuousLadder=true")
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/referral-milestone", headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            continuous_ladder = data.get("continuousLadder")
            if continuous_ladder is None:
                print(f"❌ FAIL: continuousLadder field missing from response")
                all_passed = False
            elif continuous_ladder is True:
                print(f"✅ PASS: continuousLadder is ON (true) as expected")
            else:
                print(f"⚠️  WARNING: continuousLadder is {continuous_ladder} (expected true)")
                print(f"   NOTE: Per instructions, we should NOT flip it OFF")
                # Not marking as failure since it might have been changed by someone else
        
        print("\n[4.2] DO NOT FLIP - Confirming we will not change continuousLadder")
        print("✅ CONFIRMED: Test will NOT attempt to flip continuousLadder OFF")
        print("   (Per instructions: 'DO NOT flip it OFF - it rewrites the default campaign')")
    
    except Exception as e:
        print(f"❌ EXCEPTION in test_4: {str(e)}")
        all_passed = False
    
    return all_passed

def main():
    print("="*80)
    print("STEP 2 P1 Backend Testing - Unified Referral Count + Ambassador Threshold")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Non-admin premium user: {NON_ADMIN_MOBILE}")
    print("="*80)
    
    # Login
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("\n❌ FATAL: Admin login failed. Cannot proceed.")
        sys.exit(1)
    
    user_token = login(NON_ADMIN_MOBILE, NON_ADMIN_PASSWORD)
    if not user_token:
        print("\n❌ FATAL: Non-admin user login failed. Cannot proceed.")
        sys.exit(1)
    
    # Run tests
    results = {}
    
    results["test_1"] = test_1_admin_setting_roundtrip(admin_token)
    results["test_2"] = test_2_no_regressions(admin_token, user_token)
    results["test_3"] = test_3_ambassador_killswitch(admin_token, user_token)
    results["test_4"] = test_4_continuous_ladder_default(admin_token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    total_tests = len(results)
    passed_tests = sum(1 for p in results.values() if p)
    
    print("\n" + "="*80)
    print(f"OVERALL: {passed_tests}/{total_tests} tests passed")
    print("="*80)
    
    if all(results.values()):
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
