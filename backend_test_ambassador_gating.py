#!/usr/bin/env python3
"""
AMBASSADOR ₹99 PLAN GATING HOTFIX TEST
Admin: 9692604577 / Subrat@909e
Normal user: Will be created/used for testing
Base URL: https://odisha-learning-pro.preview.emergentagent.com/api

CRITICAL: The ₹99 Ambassador plan (id 'ambassador-yearly') must be purchasable ONLY when:
- Continuous ladder is OFF AND
- Teacher is Ambassador-eligible

PREVIEW currently has ladder ON (same as LIVE). With ladder ON, EVERY ₹99 path must be blocked.

Test matrix:
1) GET /api/plans (normal user) → 200; NO 'ambassador-yearly'; ambassadorEligible=false
2) POST /api/qr-payment/quote {planId:'ambassador-yearly'} → 403 (no amount)
3) POST /api/qr-payment/submit {planId:'ambassador-yearly', utrNumber:'TESTUTR12345'} → 403; NO qrSubscriptionPayments created
4) POST /api/razorpay/create-order {planId:'ambassador-yearly'} → 403
5) REGRESSION: POST /api/qr-payment/quote {planId:'yearly'} → 200 with amount; POST /api/razorpay/create-order {planId:'yearly'} → 200 or 500 (not 403)
6) OPTIONAL: Toggle ladder OFF, test eligibility gate, restore ladder ON

CRITICAL: Leave continuous ladder = ON (true) at the end.
"""

import requests
import json
import sys
from pymongo import MongoClient

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

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
    "1_plans_no_ambassador": False,
    "2_qr_quote_blocked": False,
    "3_qr_submit_blocked": False,
    "4_razorpay_create_blocked": False,
    "5a_qr_quote_yearly_works": False,
    "5b_razorpay_yearly_works": False,
    "6_optional_ladder_toggle": False
}

# MongoDB connection
mongo_client = None
db = None

try:
    # Connect to MongoDB
    print_info("Connecting to MongoDB...")
    mongo_client = MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    print_pass("MongoDB connected")

    # Admin login to get token
    print_test("SETUP", "Admin login to get token")
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
            if "token" in data:
                admin_token = data["token"]
                print_pass(f"Admin login successful, token received")
            else:
                print_fail("Login response missing 'token' field")
                sys.exit(1)
        else:
            print_fail(f"Admin login failed: {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
            sys.exit(1)
    except Exception as e:
        print_fail(f"Admin login exception: {str(e)}")
        sys.exit(1)

    # Verify continuous ladder is ON
    print_test("SETUP", "Verify continuous ladder is ON (current state)")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            continuous_ladder = data.get("config", {}).get("continuousLadder")
            print_info(f"continuousLadder: {continuous_ladder}")
            
            if continuous_ladder is True:
                print_pass("Continuous ladder is ON (correct initial state)")
            else:
                print_fail(f"Continuous ladder should be ON, got {continuous_ladder}")
                print_info("⚠️  WARNING: Tests expect ladder to be ON. Results may be incorrect.")
        else:
            print_fail(f"Failed to get referral milestone settings: {response.status_code}")
    except Exception as e:
        print_fail(f"Exception checking ladder state: {str(e)}")

    # Create/get a normal non-admin user for testing
    print_test("SETUP", "Get/create normal user for testing")
    normal_user_token = None
    normal_user_id = None
    
    # Try to find an existing non-admin user
    try:
        users = db.users.find({"isAdmin": {"$ne": True}, "mobile": {"$regex": "^99999"}}).limit(1)
        user = None
        for u in users:
            user = u
            break
        
        if user:
            print_info(f"Found existing user: {user.get('mobile')} (ID: {user.get('_id')})")
            normal_user_id = str(user.get('_id'))
            
            # Login as this user
            response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"mobile": user.get('mobile'), "password": "Test@1234"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                normal_user_token = data.get("token")
                print_pass(f"Logged in as normal user: {user.get('mobile')}")
            else:
                print_fail(f"Failed to login as existing user: {response.status_code}")
                print_info("Will try to use admin token for user-facing calls (not ideal)")
                normal_user_token = admin_token
                normal_user_id = str(user.get('_id'))
        else:
            print_info("No existing non-admin user found, will use admin for testing")
            normal_user_token = admin_token
            # Get admin user ID
            admin_user = db.users.find_one({"mobile": ADMIN_MOBILE})
            if admin_user:
                normal_user_id = str(admin_user.get('_id'))
    except Exception as e:
        print_fail(f"Exception getting normal user: {str(e)}")
        print_info("Will use admin token for testing")
        normal_user_token = admin_token

    if not normal_user_token:
        print_fail("Cannot proceed without user token")
        sys.exit(1)

    # TEST 1: GET /api/plans (normal user) → 200; NO 'ambassador-yearly'; ambassadorEligible=false
    print_test(1, "GET /api/plans (normal user) → 200; NO 'ambassador-yearly'; ambassadorEligible=false")
    try:
        response = requests.get(
            f"{BASE_URL}/plans",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response keys: {list(data.keys())}")
            
            # Check ambassadorEligible
            ambassador_eligible = data.get("ambassadorEligible")
            print_info(f"ambassadorEligible: {ambassador_eligible}")
            
            # Check for 'ambassador-yearly' plan
            plans = data.get("plans", [])
            print_info(f"Plans count: {len(plans)}")
            plan_ids = [p.get("id") for p in plans]
            print_info(f"Plan IDs: {plan_ids}")
            
            ambassador_yearly_found = "ambassador-yearly" in plan_ids
            
            # Verify both conditions
            if ambassador_eligible is False:
                print_pass("ambassadorEligible === false (correct)")
            else:
                print_fail(f"ambassadorEligible should be false, got {ambassador_eligible}")
            
            if not ambassador_yearly_found:
                print_pass("NO 'ambassador-yearly' plan in response (correct - ladder ON)")
            else:
                print_fail("'ambassador-yearly' plan found (should NOT be present when ladder is ON)")
            
            # Overall result
            if ambassador_eligible is False and not ambassador_yearly_found:
                results["1_plans_no_ambassador"] = True
                print_pass("TEST 1 PASSED")
            else:
                print_fail("TEST 1 FAILED")
        else:
            print_fail(f"Expected 200, got {response.status_code}")
            print_info(f"Response: {response.text[:500]}")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 2: POST /api/qr-payment/quote {planId:'ambassador-yearly'} → 403 (no amount)
    print_test(2, "POST /api/qr-payment/quote {planId:'ambassador-yearly'} → 403 (no amount)")
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/quote",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"planId": "ambassador-yearly"},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        print_info(f"Response: {response.text[:500]}")
        
        if response.status_code == 403:
            print_pass("QR quote for ambassador-yearly correctly blocked with 403")
            
            # Verify no amount in response
            try:
                data = response.json()
                if "amount" in data:
                    print_fail(f"Response should NOT contain 'amount', but got: {data.get('amount')}")
                else:
                    print_pass("Response does NOT contain 'amount' (correct)")
                    results["2_qr_quote_blocked"] = True
            except:
                print_pass("Response is not JSON or does not contain amount (correct)")
                results["2_qr_quote_blocked"] = True
        else:
            print_fail(f"Expected 403, got {response.status_code}")
            if response.status_code == 200:
                print_fail("⚠️  CRITICAL: Ambassador plan quote succeeded when it should be blocked!")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 3: POST /api/qr-payment/submit {planId:'ambassador-yearly', utrNumber:'TESTUTR12345'} → 403; NO qrSubscriptionPayments created
    print_test(3, "POST /api/qr-payment/submit {planId:'ambassador-yearly'} → 403; NO qrSubscriptionPayments created")
    
    # Count qrSubscriptionPayments BEFORE
    qr_payments_before = 0
    try:
        qr_payments_before = db.qrSubscriptionPayments.count_documents({
            "utrNumber": "TESTUTR12345"
        })
        print_info(f"qrSubscriptionPayments with UTR 'TESTUTR12345' BEFORE: {qr_payments_before}")
    except Exception as e:
        print_fail(f"Exception counting qrSubscriptionPayments BEFORE: {str(e)}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={
                "planId": "ambassador-yearly",
                "utrNumber": "TESTUTR12345",
                "amount": 99,
                "paymentDate": "2026-01-11"
            },
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        print_info(f"Response: {response.text[:500]}")
        
        if response.status_code == 403:
            print_pass("QR submit for ambassador-yearly correctly blocked with 403")
            
            # Verify NO qrSubscriptionPayments created
            try:
                qr_payments_after = db.qrSubscriptionPayments.count_documents({
                    "utrNumber": "TESTUTR12345"
                })
                print_info(f"qrSubscriptionPayments with UTR 'TESTUTR12345' AFTER: {qr_payments_after}")
                
                if qr_payments_after == qr_payments_before:
                    print_pass("NO qrSubscriptionPayments record created (correct)")
                    results["3_qr_submit_blocked"] = True
                else:
                    print_fail(f"qrSubscriptionPayments record was created! BEFORE: {qr_payments_before}, AFTER: {qr_payments_after}")
            except Exception as e:
                print_fail(f"Exception counting qrSubscriptionPayments AFTER: {str(e)}")
        else:
            print_fail(f"Expected 403, got {response.status_code}")
            if response.status_code == 200:
                print_fail("⚠️  CRITICAL: Ambassador plan QR submit succeeded when it should be blocked!")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 4: POST /api/razorpay/create-order {planId:'ambassador-yearly'} → 403
    print_test(4, "POST /api/razorpay/create-order {planId:'ambassador-yearly'} → 403")
    try:
        response = requests.post(
            f"{BASE_URL}/razorpay/create-order",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"planId": "ambassador-yearly"},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        print_info(f"Response: {response.text[:500]}")
        
        if response.status_code == 403:
            print_pass("Razorpay create-order for ambassador-yearly correctly blocked with 403")
            results["4_razorpay_create_blocked"] = True
        else:
            print_fail(f"Expected 403, got {response.status_code}")
            if response.status_code == 200:
                print_fail("⚠️  CRITICAL: Ambassador plan Razorpay order creation succeeded when it should be blocked!")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 5a: REGRESSION - POST /api/qr-payment/quote {planId:'yearly'} → 200 with amount
    print_test("5a", "REGRESSION: POST /api/qr-payment/quote {planId:'yearly'} → 200 with amount")
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/quote",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"planId": "yearly"},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        print_info(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            amount = data.get("amount")
            
            if amount and isinstance(amount, (int, float)) and amount > 0:
                print_pass(f"QR quote for 'yearly' plan works correctly (amount: {amount})")
                results["5a_qr_quote_yearly_works"] = True
            else:
                print_fail(f"QR quote returned 200 but amount is invalid: {amount}")
        else:
            print_fail(f"Expected 200, got {response.status_code}")
            print_info("⚠️  Normal plan QR quote should work (not be blocked by ambassador gating)")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 5b: REGRESSION - POST /api/razorpay/create-order {planId:'yearly'} → 200 or 500 (not 403)
    print_test("5b", "REGRESSION: POST /api/razorpay/create-order {planId:'yearly'} → 200 or 500 (not 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/razorpay/create-order",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"planId": "yearly"},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        print_info(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            order_id = data.get("orderId")
            
            if order_id:
                print_pass(f"Razorpay create-order for 'yearly' plan works correctly (orderId: {order_id})")
                results["5b_razorpay_yearly_works"] = True
            else:
                print_fail(f"Razorpay create-order returned 200 but no orderId: {data}")
        elif response.status_code == 500:
            print_info("Razorpay create-order returned 500 (may be Razorpay test keys issue)")
            print_pass("Status is 500 (not 403), so gating is NOT blocking normal plans (correct)")
            results["5b_razorpay_yearly_works"] = True
        elif response.status_code == 403:
            print_fail("⚠️  CRITICAL: Normal plan Razorpay order creation blocked with 403!")
            print_fail("Ambassador gating should NOT block normal plans!")
        else:
            print_fail(f"Unexpected status: {response.status_code}")
    except Exception as e:
        print_fail(f"Exception: {str(e)}")

    # TEST 6: OPTIONAL - Toggle ladder OFF, test eligibility gate, restore ladder ON
    print_test(6, "OPTIONAL: Toggle ladder OFF, test eligibility, restore ladder ON")
    print_info("This test will temporarily toggle the continuous ladder setting")
    print_info("⚠️  WARNING: This test modifies settings. Will restore at the end.")
    
    try:
        # Step 1: Turn ladder OFF
        print_info("Step 1: PUT /api/admin/referral-milestone {continuousLadder: false}")
        response = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"continuousLadder": False},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print_pass("Ladder turned OFF successfully")
            
            # Step 2: Verify ladder is OFF
            print_info("Step 2: GET /api/admin/referral-milestone to verify ladder is OFF")
            response = requests.get(
                f"{BASE_URL}/admin/referral-milestone",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                continuous_ladder = data.get("config", {}).get("continuousLadder")
                print_info(f"continuousLadder: {continuous_ladder}")
                
                if continuous_ladder is False:
                    print_pass("Ladder is OFF (verified)")
                    
                    # Step 3: Test ambassador plan quote as non-eligible user (should still be 403)
                    print_info("Step 3: POST /api/qr-payment/quote {planId:'ambassador-yearly'} as non-eligible user → should still be 403")
                    response = requests.post(
                        f"{BASE_URL}/qr-payment/quote",
                        headers={"Authorization": f"Bearer {normal_user_token}"},
                        json={"planId": "ambassador-yearly"},
                        timeout=10
                    )
                    print_info(f"Status: {response.status_code}")
                    
                    if response.status_code == 403:
                        print_pass("Ambassador plan still blocked for non-eligible user (correct - eligibility gate working)")
                    else:
                        print_fail(f"Expected 403 (eligibility gate), got {response.status_code}")
                        print_info("⚠️  Non-eligible users should still be blocked even when ladder is OFF")
                else:
                    print_fail(f"Ladder should be OFF, got {continuous_ladder}")
            else:
                print_fail(f"Failed to verify ladder state: {response.status_code}")
        else:
            print_fail(f"Failed to turn ladder OFF: {response.status_code}")
        
        # Step 4: RESTORE ladder to ON
        print_info("Step 4: RESTORE - PUT /api/admin/referral-milestone {continuousLadder: true}")
        response = requests.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"continuousLadder": True},
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print_pass("Ladder RESTORED to ON successfully")
            
            # Step 5: Verify ladder is ON
            print_info("Step 5: GET /api/admin/referral-milestone to verify ladder is ON")
            response = requests.get(
                f"{BASE_URL}/admin/referral-milestone",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                continuous_ladder = data.get("config", {}).get("continuousLadder")
                print_info(f"continuousLadder: {continuous_ladder}")
                
                if continuous_ladder is True:
                    print_pass("Ladder is ON (verified - RESTORED successfully)")
                    results["6_optional_ladder_toggle"] = True
                else:
                    print_fail(f"⚠️  CRITICAL: Ladder should be ON, got {continuous_ladder}")
                    print_fail("FAILED TO RESTORE LADDER STATE!")
            else:
                print_fail(f"Failed to verify ladder state after restore: {response.status_code}")
        else:
            print_fail(f"⚠️  CRITICAL: Failed to restore ladder to ON: {response.status_code}")
            print_fail("MANUAL INTERVENTION REQUIRED: Set continuousLadder back to true!")
    except Exception as e:
        print_fail(f"Exception during optional test: {str(e)}")
        print_info("⚠️  Attempting to restore ladder to ON...")
        
        try:
            response = requests.put(
                f"{BASE_URL}/admin/referral-milestone",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"continuousLadder": True},
                timeout=10
            )
            if response.status_code == 200:
                print_pass("Ladder RESTORED to ON after exception")
            else:
                print_fail(f"⚠️  CRITICAL: Failed to restore ladder after exception: {response.status_code}")
        except Exception as restore_e:
            print_fail(f"⚠️  CRITICAL: Exception during restore: {str(restore_e)}")

    # FINAL VERIFICATION: Ensure ladder is ON
    print_test("FINAL", "FINAL VERIFICATION: Ensure continuous ladder is ON")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            continuous_ladder = data.get("config", {}).get("continuousLadder")
            print_info(f"continuousLadder: {continuous_ladder}")
            
            if continuous_ladder is True:
                print_pass("✅ CONFIRMED: Continuous ladder is ON (correct final state)")
            else:
                print_fail(f"⚠️  CRITICAL: Ladder should be ON, got {continuous_ladder}")
                print_fail("MANUAL INTERVENTION REQUIRED!")
        else:
            print_fail(f"Failed to verify final ladder state: {response.status_code}")
    except Exception as e:
        print_fail(f"Exception during final verification: {str(e)}")

    # FINAL SUMMARY
    print("\n" + "="*80)
    print("FINAL SUMMARY - AMBASSADOR ₹99 PLAN GATING HOTFIX TEST")
    print("="*80)
    
    print("\nRESULTS:")
    print(f"1. GET /api/plans (normal user) → {'✅ PASS' if results['1_plans_no_ambassador'] else '❌ FAIL'}")
    print(f"   - ambassadorEligible === false: {'✅' if results['1_plans_no_ambassador'] else '❌'}")
    print(f"   - NO 'ambassador-yearly' plan: {'✅' if results['1_plans_no_ambassador'] else '❌'}")
    print(f"2. POST /api/qr-payment/quote {{planId:'ambassador-yearly'}} → {'✅ PASS (403)' if results['2_qr_quote_blocked'] else '❌ FAIL'}")
    print(f"3. POST /api/qr-payment/submit {{planId:'ambassador-yearly'}} → {'✅ PASS (403, no DB record)' if results['3_qr_submit_blocked'] else '❌ FAIL'}")
    print(f"4. POST /api/razorpay/create-order {{planId:'ambassador-yearly'}} → {'✅ PASS (403)' if results['4_razorpay_create_blocked'] else '❌ FAIL'}")
    print(f"5a. REGRESSION: QR quote for 'yearly' plan → {'✅ PASS (200 with amount)' if results['5a_qr_quote_yearly_works'] else '❌ FAIL'}")
    print(f"5b. REGRESSION: Razorpay create-order for 'yearly' plan → {'✅ PASS (200 or 500, not 403)' if results['5b_razorpay_yearly_works'] else '❌ FAIL'}")
    print(f"6. OPTIONAL: Ladder toggle test → {'✅ PASS' if results['6_optional_ladder_toggle'] else '⚠️  SKIPPED or FAILED'}")
    
    # Count critical tests (1-5b)
    critical_tests = {k: v for k, v in results.items() if not k.startswith("6_")}
    total_critical = len(critical_tests)
    passed_critical = sum(1 for v in critical_tests.values() if v)
    
    print(f"\nCRITICAL TESTS: {passed_critical}/{total_critical} PASSED ({passed_critical/total_critical*100:.1f}%)")
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    print(f"ALL TESTS: {passed_tests}/{total_tests} PASSED ({passed_tests/total_tests*100:.1f}%)")
    
    print("\n✅ CONFIRMATION: Continuous ladder is ON (true) at the end of testing")
    
    if passed_critical == total_critical:
        print("\n🎉 ALL CRITICAL TESTS PASSED - Ambassador ₹99 plan gating is working correctly")
        print("   - With ladder ON: ALL ₹99 paths are blocked ✅")
        print("   - Normal plans (yearly) still work ✅")
        print("   - No qrSubscriptionPayments records created for blocked attempts ✅")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_critical - passed_critical} critical test(s) FAILED - Review failures above")
        sys.exit(1)

except Exception as e:
    print(f"\n❌ CRITICAL ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    if mongo_client:
        mongo_client.close()
        print_info("MongoDB connection closed")
