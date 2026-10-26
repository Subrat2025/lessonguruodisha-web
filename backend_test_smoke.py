#!/usr/bin/env python3
"""
PRE-DEPLOY BACKEND HEALTH SMOKE TEST (READ-ONLY)
Admin: 9692604577 / Subrat@909e
Base URL: https://odisha-learning-pro.preview.emergentagent.com/api

CRITICAL: This is a READ-ONLY test. DO NOT:
- Flip any toggles
- Run backfill
- Create/refund payments
- Mutate any data or settings
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

def print_test(test_num, description):
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def print_pass(message):
    print(f"✅ PASS: {message}")

def print_fail(message):
    print(f"❌ FAIL: {message}")

def print_info(message):
    print(f"ℹ️  INFO: {message}")

# Track results
results = {
    "1_settings_public": False,
    "2_reviews_public": False,
    "3_plans_anonymous": False,
    "4_admin_referral_milestone": False,
    "5_admin_login": False
}

try:
    # TEST 1: GET /api/settings/public → 200 and returns JSON
    print_test(1, "GET /api/settings/public → 200 and returns JSON")
    try:
        response = requests.get(f"{BASE_URL}/settings/public", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            print_pass("GET /api/settings/public returns 200 with JSON")
            results["1_settings_public"] = True
        else:
            print_fail(f"Expected 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 2: GET /api/reviews/public → 200
    print_test(2, "GET /api/reviews/public → 200")
    try:
        response = requests.get(f"{BASE_URL}/reviews/public", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response type: {type(data)}")
            if isinstance(data, list):
                print_info(f"Reviews count: {len(data)}")
            print_pass("GET /api/reviews/public returns 200")
            results["2_reviews_public"] = True
        else:
            print_fail(f"Expected 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 3: GET /api/plans (anonymous) → 200, ambassadorEligible === false, NO 'ambassador-yearly'
    print_test(3, "GET /api/plans (anonymous) → 200, ambassadorEligible === false, NO 'ambassador-yearly'")
    try:
        response = requests.get(f"{BASE_URL}/plans", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            # Check ambassadorEligible
            ambassador_eligible = data.get("ambassadorEligible")
            print_info(f"ambassadorEligible: {ambassador_eligible}")
            
            if ambassador_eligible is False:
                print_pass("ambassadorEligible === false (correct)")
            else:
                print_fail(f"ambassadorEligible should be false, got {ambassador_eligible}")
            
            # Check for 'ambassador-yearly' plan
            plans = data.get("plans", [])
            print_info(f"Plans count: {len(plans)}")
            
            ambassador_yearly_found = False
            for plan in plans:
                plan_id = plan.get("id", "")
                if plan_id == "ambassador-yearly":
                    ambassador_yearly_found = True
                    break
            
            if not ambassador_yearly_found:
                print_pass("NO 'ambassador-yearly' plan present (correct - continuous ladder ON)")
            else:
                print_fail("'ambassador-yearly' plan found (should NOT be present when continuous ladder is ON)")
            
            # Overall result
            if ambassador_eligible is False and not ambassador_yearly_found:
                results["3_plans_anonymous"] = True
                print_pass("GET /api/plans anonymous check PASSED")
            else:
                print_fail("GET /api/plans anonymous check FAILED")
        else:
            print_fail(f"Expected 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 5: Admin login (do this before TEST 4 to get token)
    print_test(5, "Admin login: POST /api/auth/login with 9692604577 / Subrat@909e")
    admin_token = None
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            if "token" in data:
                admin_token = data["token"]
                print_pass(f"Admin login successful, token received (length: {len(admin_token)})")
                results["5_admin_login"] = True
            else:
                print_fail("Login response missing 'token' field")
                print_info(f"Response: {json.dumps(data, indent=2)[:500]}")
        else:
            print_fail(f"Expected 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 4: GET /api/admin/referral-milestone (admin auth) → 200 and continuousLadder === true
    print_test(4, "GET /api/admin/referral-milestone (admin auth) → 200 and continuousLadder === true (READ ONLY)")
    if not admin_token:
        print_fail("Cannot test - admin token not available from TEST 5")
    else:
        try:
            response = requests.get(
                f"{BASE_URL}/admin/referral-milestone",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            print_info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print_info(f"Response keys: {list(data.keys())}")
                
                # Check continuousLadder
                continuous_ladder = data.get("config", {}).get("continuousLadder")
                print_info(f"continuousLadder: {continuous_ladder}")
                
                if continuous_ladder is True:
                    print_pass("continuousLadder === true (default ON, correct)")
                    results["4_admin_referral_milestone"] = True
                else:
                    print_fail(f"continuousLadder should be true, got {continuous_ladder}")
                
                print_info("✅ READ-ONLY: Did NOT mutate any settings (no PUT request made)")
            else:
                print_fail(f"Expected 200, got {response.status_code}")
                print_info(f"Response: {response.text[:500]}")
        except Exception as e:
            print_fail(f"Exception: {str(e)}")

    # FINAL SUMMARY
    print("\n" + "="*80)
    print("FINAL SUMMARY - PRE-DEPLOY BACKEND HEALTH SMOKE TEST")
    print("="*80)
    
    print("\nRESULTS:")
    print(f"1. GET /api/settings/public → {'✅ PASS' if results['1_settings_public'] else '❌ FAIL'}")
    print(f"2. GET /api/reviews/public → {'✅ PASS' if results['2_reviews_public'] else '❌ FAIL'}")
    print(f"3. GET /api/plans (anonymous) → {'✅ PASS' if results['3_plans_anonymous'] else '❌ FAIL'}")
    print(f"   - ambassadorEligible === false: {'✅' if results['3_plans_anonymous'] else '❌'}")
    print(f"   - NO 'ambassador-yearly' plan: {'✅' if results['3_plans_anonymous'] else '❌'}")
    print(f"4. GET /api/admin/referral-milestone (admin) → {'✅ PASS' if results['4_admin_referral_milestone'] else '❌ FAIL'}")
    print(f"   - continuousLadder === true: {'✅' if results['4_admin_referral_milestone'] else '❌'}")
    print(f"5. Admin login (9692604577) → {'✅ PASS' if results['5_admin_login'] else '❌ FAIL'}")
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    
    print(f"\nOVERALL: {passed_tests}/{total_tests} tests PASSED ({passed_tests/total_tests*100:.1f}%)")
    
    print("\n✅ CONFIRMATION: This was a READ-ONLY test. NO data or settings were mutated.")
    print("   - Did NOT flip any toggles")
    print("   - Did NOT run backfill")
    print("   - Did NOT create/refund payments")
    print("   - Did NOT PUT to /api/admin/referral-milestone")
    print("   - Continuous ladder remains ON (as found)")
    
    if passed_tests == total_tests:
        print("\n🎉 ALL TESTS PASSED - Backend is healthy for deployment")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_tests - passed_tests} test(s) FAILED - Review failures above")
        sys.exit(1)

except Exception as e:
    print(f"\n❌ CRITICAL ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
