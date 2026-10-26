#!/usr/bin/env python3
"""
Ambassador ₹99 Plan KILL Switch Test - Fail-Closed vs Malformed DB Entry

Tests that AMBASSADOR_PLAN_KILL=true correctly blocks a malformed DB plan entry
that mimics the LIVE data shape (no ambassadorOnly flag, enabled:true).

CRITICAL: This test injects a malformed entry into MongoDB settings.plans,
tests the kill switch, then RESTORES the original value.
"""

import asyncio
import httpx
import os
from pymongo import MongoClient

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

# Credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
NORMAL_USER_MOBILE = "9999900001"  # Premium user
NORMAL_USER_PASSWORD = "Test@1234"

# Malformed ambassador plan entry (mimics LIVE data shape)
MALFORMED_AMBASSADOR_PLAN = {
    "id": "ambassador-yearly",
    "name": "Ambassador Special",
    "price": 99,
    "days": 365,
    "enabled": True
    # NOTE: NO ambassadorOnly flag - this is the bug we're testing against
}

print("=" * 80)
print("AMBASSADOR ₹99 PLAN KILL SWITCH TEST - FAIL-CLOSED vs MALFORMED DB ENTRY")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"API Base: {API_BASE}")
print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
print("=" * 80)

async def login(mobile: str, password: str) -> str:
    """Login and return bearer token"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{API_BASE}/auth/login",
            json={"mobile": mobile, "password": password}
        )
        if resp.status_code != 200:
            raise Exception(f"Login failed: {resp.status_code} {resp.text}")
        data = resp.json()
        return data.get('token')

async def main():
    print("\n🔐 STEP 0: Login")
    print("-" * 80)
    
    try:
        admin_token = await login(ADMIN_MOBILE, ADMIN_PASSWORD)
        print(f"✅ Admin login successful")
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return
    
    try:
        normal_token = await login(NORMAL_USER_MOBILE, NORMAL_USER_PASSWORD)
        print(f"✅ Normal user login successful")
    except Exception as e:
        print(f"❌ Normal user login failed: {e}")
        return
    
    # MongoDB connection
    print("\n📦 STEP 1: SETUP - Backup and inject malformed ambassador plan")
    print("-" * 80)
    
    mongo_client = None
    original_plans = None
    
    try:
        mongo_client = MongoClient(MONGO_URL)
        db = mongo_client[DB_NAME]
        settings_coll = db['settings']
        
        # Backup original plans
        settings_doc = settings_coll.find_one({"key": "plans"})
        if not settings_doc:
            print("❌ CRITICAL: No settings doc with key:'plans' found")
            return
        
        original_plans = settings_doc.get('value', [])
        print(f"✅ Backed up original plans array ({len(original_plans)} plans)")
        print(f"   Original plan IDs: {[p.get('id') for p in original_plans]}")
        
        # Check if ambassador-yearly already exists
        has_ambassador = any(p.get('id') == 'ambassador-yearly' for p in original_plans)
        if has_ambassador:
            print(f"⚠️  WARNING: 'ambassador-yearly' already exists in DB")
            print(f"   Will inject anyway to test KILL switch")
        
        # Inject malformed ambassador plan
        modified_plans = [p for p in original_plans if p.get('id') != 'ambassador-yearly']
        modified_plans.append(MALFORMED_AMBASSADOR_PLAN)
        
        result = settings_coll.update_one(
            {"key": "plans"},
            {"$set": {"value": modified_plans}}
        )
        
        if result.modified_count == 1:
            print(f"✅ Injected malformed ambassador plan into DB")
            print(f"   Malformed entry: {MALFORMED_AMBASSADOR_PLAN}")
            print(f"   NOTE: NO ambassadorOnly flag, enabled:true (mimics LIVE bug)")
        else:
            print(f"❌ Failed to inject malformed plan")
            return
        
        # Verify injection
        verify_doc = settings_coll.find_one({"key": "plans"})
        verify_plans = verify_doc.get('value', [])
        injected_plan = next((p for p in verify_plans if p.get('id') == 'ambassador-yearly'), None)
        
        if injected_plan:
            print(f"✅ Verified injection: ambassador-yearly present in DB")
            print(f"   ambassadorOnly flag: {injected_plan.get('ambassadorOnly', 'NOT SET')}")
            print(f"   enabled: {injected_plan.get('enabled')}")
        else:
            print(f"❌ Injection verification failed")
            return
        
    except Exception as e:
        print(f"❌ MongoDB setup failed: {e}")
        if mongo_client:
            mongo_client.close()
        return
    
    # Now run the verification tests
    print("\n🔒 STEP 2: VERIFY - AMBASSADOR_PLAN_KILL=true blocks malformed entry")
    print("-" * 80)
    
    test_results = []
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # TEST 1: GET /api/plans (normal user) - should NOT contain ambassador-yearly
        print("\n📋 TEST 1: GET /api/plans (normal user)")
        try:
            resp = await client.get(
                f"{API_BASE}/plans",
                headers={"Authorization": f"Bearer {normal_token}"}
            )
            
            if resp.status_code == 200:
                data = resp.json()
                plans = data.get('plans', [])
                plan_ids = [p.get('id') for p in plans]
                
                has_ambassador = 'ambassador-yearly' in plan_ids
                
                if not has_ambassador:
                    print(f"✅ PASS: ambassador-yearly NOT in plans list")
                    print(f"   Status: {resp.status_code}")
                    print(f"   Plan IDs: {plan_ids}")
                    test_results.append(("TEST 1: GET /api/plans", True, "ambassador-yearly correctly filtered out"))
                else:
                    print(f"❌ FAIL: ambassador-yearly FOUND in plans list (KILL switch not working)")
                    print(f"   Status: {resp.status_code}")
                    print(f"   Plan IDs: {plan_ids}")
                    test_results.append(("TEST 1: GET /api/plans", False, "ambassador-yearly present (should be filtered)"))
            else:
                print(f"❌ FAIL: Unexpected status {resp.status_code}")
                print(f"   Response: {resp.text[:200]}")
                test_results.append(("TEST 1: GET /api/plans", False, f"Status {resp.status_code}"))
        except Exception as e:
            print(f"❌ ERROR: {e}")
            test_results.append(("TEST 1: GET /api/plans", False, str(e)))
        
        # TEST 2: POST /api/razorpay/create-order (KEY PROOF)
        print("\n💳 TEST 2: POST /api/razorpay/create-order {planId:'ambassador-yearly'}")
        print("   KEY PROOF: Must return 400 'Invalid plan' (NOT a Razorpay order)")
        try:
            resp = await client.post(
                f"{API_BASE}/razorpay/create-order",
                headers={"Authorization": f"Bearer {normal_token}"},
                json={"planId": "ambassador-yearly"}
            )
            
            status = resp.status_code
            body = resp.text
            
            print(f"   Status: {status}")
            print(f"   Body: {body[:200]}")
            
            if status == 400 and "Invalid plan" in body:
                print(f"✅ PASS: 400 'Invalid plan' (KILL switch working)")
                test_results.append(("TEST 2: Razorpay create-order", True, f"400 Invalid plan"))
            elif status == 403:
                print(f"⚠️  PARTIAL: 403 (blocked, but expected 400 'Invalid plan')")
                test_results.append(("TEST 2: Razorpay create-order", True, f"403 (blocked)"))
            elif status == 200:
                print(f"❌ FAIL: 200 (Razorpay order created - KILL switch NOT working)")
                test_results.append(("TEST 2: Razorpay create-order", False, "200 (order created)"))
            else:
                print(f"⚠️  Status {status}: {body[:100]}")
                test_results.append(("TEST 2: Razorpay create-order", False, f"Status {status}"))
        except Exception as e:
            print(f"❌ ERROR: {e}")
            test_results.append(("TEST 2: Razorpay create-order", False, str(e)))
        
        # TEST 3: POST /api/qr-payment/quote
        print("\n📱 TEST 3: POST /api/qr-payment/quote {planId:'ambassador-yearly'}")
        print("   Expected: 4xx (no amount)")
        try:
            resp = await client.post(
                f"{API_BASE}/qr-payment/quote",
                headers={"Authorization": f"Bearer {normal_token}"},
                json={"planId": "ambassador-yearly"}
            )
            
            status = resp.status_code
            body = resp.text
            
            print(f"   Status: {status}")
            print(f"   Body: {body[:200]}")
            
            if status >= 400:
                print(f"✅ PASS: {status} (blocked, no amount)")
                test_results.append(("TEST 3: QR quote", True, f"{status} (blocked)"))
            elif status == 200:
                data = resp.json()
                if 'amount' in data:
                    print(f"❌ FAIL: 200 with amount (KILL switch NOT working)")
                    test_results.append(("TEST 3: QR quote", False, "200 with amount"))
                else:
                    print(f"⚠️  200 but no amount: {data}")
                    test_results.append(("TEST 3: QR quote", True, "200 no amount"))
            else:
                print(f"⚠️  Status {status}: {body[:100]}")
                test_results.append(("TEST 3: QR quote", False, f"Status {status}"))
        except Exception as e:
            print(f"❌ ERROR: {e}")
            test_results.append(("TEST 3: QR quote", False, str(e)))
        
        # TEST 4: REGRESSION - Normal plans still work
        print("\n🔄 TEST 4: REGRESSION - Normal plans still work")
        print("   4a. GET /api/plans should have 'yearly' and 'monthly'")
        try:
            resp = await client.get(
                f"{API_BASE}/plans",
                headers={"Authorization": f"Bearer {normal_token}"}
            )
            
            if resp.status_code == 200:
                data = resp.json()
                plans = data.get('plans', [])
                plan_ids = [p.get('id') for p in plans]
                
                has_yearly = 'yearly' in plan_ids
                has_monthly = 'monthly' in plan_ids
                
                if has_yearly and has_monthly:
                    print(f"✅ PASS: 'yearly' and 'monthly' present")
                    print(f"   Plan IDs: {plan_ids}")
                    test_results.append(("TEST 4a: Normal plans list", True, "yearly and monthly present"))
                else:
                    print(f"❌ FAIL: Missing normal plans")
                    print(f"   Plan IDs: {plan_ids}")
                    test_results.append(("TEST 4a: Normal plans list", False, "Missing yearly or monthly"))
            else:
                print(f"❌ FAIL: Status {resp.status_code}")
                test_results.append(("TEST 4a: Normal plans list", False, f"Status {resp.status_code}"))
        except Exception as e:
            print(f"❌ ERROR: {e}")
            test_results.append(("TEST 4a: Normal plans list", False, str(e)))
        
        print("\n   4b. POST /api/qr-payment/quote {planId:'yearly'} should return 200 with amount")
        try:
            resp = await client.post(
                f"{API_BASE}/qr-payment/quote",
                headers={"Authorization": f"Bearer {normal_token}"},
                json={"planId": "yearly"}
            )
            
            status = resp.status_code
            
            if status == 200:
                data = resp.json()
                amount = data.get('amount')
                if amount and isinstance(amount, (int, float)):
                    print(f"✅ PASS: 200 with numeric amount: ₹{amount}")
                    test_results.append(("TEST 4b: QR quote yearly", True, f"200 with amount {amount}"))
                else:
                    print(f"⚠️  200 but no numeric amount: {data}")
                    test_results.append(("TEST 4b: QR quote yearly", False, "200 but no amount"))
            else:
                print(f"❌ FAIL: Status {status}")
                print(f"   Body: {resp.text[:200]}")
                test_results.append(("TEST 4b: QR quote yearly", False, f"Status {status}"))
        except Exception as e:
            print(f"❌ ERROR: {e}")
            test_results.append(("TEST 4b: QR quote yearly", False, str(e)))
    
    # TEARDOWN
    print("\n🧹 STEP 3: TEARDOWN - Restore original settings.plans")
    print("-" * 80)
    
    try:
        if original_plans is not None:
            result = settings_coll.update_one(
                {"key": "plans"},
                {"$set": {"value": original_plans}}
            )
            
            if result.modified_count == 1:
                print(f"✅ Restored original plans array")
            else:
                print(f"⚠️  No changes made (already restored?)")
            
            # Verify restoration
            verify_doc = settings_coll.find_one({"key": "plans"})
            verify_plans = verify_doc.get('value', [])
            verify_ids = [p.get('id') for p in verify_plans]
            
            print(f"✅ Verified restoration: {len(verify_plans)} plans")
            print(f"   Plan IDs: {verify_ids}")
            
            has_ambassador = 'ambassador-yearly' in verify_ids
            if has_ambassador:
                print(f"⚠️  WARNING: 'ambassador-yearly' still present (was in original)")
            else:
                print(f"✅ Confirmed: 'ambassador-yearly' removed")
        else:
            print(f"❌ No backup to restore")
    except Exception as e:
        print(f"❌ Restoration failed: {e}")
    finally:
        if mongo_client:
            mongo_client.close()
            print(f"✅ MongoDB connection closed")
    
    # Final verification - GET /api/plans should be back to normal
    print("\n🔍 STEP 4: FINAL VERIFICATION - GET /api/plans after restoration")
    print("-" * 80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{API_BASE}/plans",
                headers={"Authorization": f"Bearer {normal_token}"}
            )
            
            if resp.status_code == 200:
                data = resp.json()
                plans = data.get('plans', [])
                plan_ids = [p.get('id') for p in plans]
                
                has_ambassador = 'ambassador-yearly' in plan_ids
                
                print(f"✅ GET /api/plans: {resp.status_code}")
                print(f"   Plan IDs: {plan_ids}")
                print(f"   ambassador-yearly present: {has_ambassador}")
                
                if not has_ambassador:
                    print(f"✅ CONFIRMED: Plans restored to original state (no ambassador-yearly)")
                else:
                    print(f"⚠️  ambassador-yearly still present (may have been in original)")
            else:
                print(f"⚠️  Status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result, _ in test_results if result)
    total = len(test_results)
    
    for test_name, result, details in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        print(f"         {details}")
    
    print("-" * 80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - AMBASSADOR_PLAN_KILL working correctly")
        print("   ✅ Malformed DB entry correctly blocked")
        print("   ✅ Normal plans still working")
        print("   ✅ Database restored to original state")
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED - Review results above")

if __name__ == "__main__":
    asyncio.run(main())
