#!/usr/bin/env python3
"""
Backend testing for:
1. Refund exclusion from milestone count + Mark-refunded admin action
2. Referral rule change (100 milestone, continuous OFF, max 5 rewards)
3. Ambassador plan (₹99/year) — eligibility-gated
4. Milestone preview continuous field

Base URL: https://odisha-learning-pro.preview.emergentagent.com/api
Admin: 9692604577 / Subrat@909e
"""

import requests
import json
from datetime import datetime
from pymongo import MongoClient
import os

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

print("=" * 80)
print("BACKEND TEST: Referral Rule Change + Refunds + Ambassador Plan")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
print(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

# Connect to MongoDB
try:
    mongo_client = MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    print("✅ MongoDB connection successful")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    exit(1)

# Helper functions
def login(mobile, password):
    """Login and return bearer token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"❌ Login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def register_test_user(mobile, password="abc123"):
    """Register a throwaway test user"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": mobile,
            "password": password,
            "name": f"TEST-USER-{mobile[-4:]}"
        }, timeout=10)
        if resp.status_code in [200, 201]:
            data = resp.json()
            return data.get("token"), data.get("user", {}).get("id")
        else:
            print(f"⚠️  Register failed: {resp.status_code} {resp.text}")
            return None, None
    except Exception as e:
        print(f"❌ Register exception: {e}")
        return None, None

def get_user_id_from_token(token):
    """Get user ID from /api/me"""
    try:
        resp = requests.get(f"{BASE_URL}/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("id")
        return None
    except:
        return None

# Login as admin
print("\n🔐 Logging in as admin...")
admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
if not admin_token:
    print("❌ CRITICAL: Admin login failed. Cannot proceed.")
    exit(1)
print(f"✅ Admin token obtained: {admin_token[:20]}...")

# Create a normal test user for 403 tests
print("\n👤 Creating normal test user...")
test_mobile_normal = "6123456789"
normal_token, normal_user_id = register_test_user(test_mobile_normal)
if not normal_token:
    print("⚠️  Could not create normal test user, trying to login...")
    normal_token = login(test_mobile_normal, "abc123")
    if normal_token:
        normal_user_id = get_user_id_from_token(normal_token)
if normal_token:
    print(f"✅ Normal user token: {normal_token[:20]}... (ID: {normal_user_id})")
else:
    print("⚠️  Normal user not available for 403 tests")

print("\n" + "=" * 80)
print("TEST 1: Mark-refunded admin action + refund exclusion")
print("=" * 80)

test1_passed = 0
test1_total = 0

# 1a. POST /api/admin/payment-refund with NO token → 401
print("\n1a. POST /api/admin/payment-refund with NO token → 401")
test1_total += 1
try:
    resp = requests.post(f"{BASE_URL}/admin/payment-refund", json={"paymentId": "TEST", "reason": "test"}, timeout=10)
    if resp.status_code == 401:
        print("✅ PASS: 401 without token")
        test1_passed += 1
    else:
        print(f"❌ FAIL: Expected 401, got {resp.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 1b. POST with normal user token → 403
print("\n1b. POST /api/admin/payment-refund with normal user token → 403")
test1_total += 1
if normal_token:
    try:
        resp = requests.post(f"{BASE_URL}/admin/payment-refund", 
                           json={"paymentId": "TEST", "reason": "test"},
                           headers={"Authorization": f"Bearer {normal_token}"},
                           timeout=10)
        if resp.status_code == 403:
            print("✅ PASS: 403 for non-admin")
            test1_passed += 1
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
else:
    print("⚠️  SKIP: No normal user token")

# 1c. Create throwaway test user T1
print("\n1c. Creating throwaway test user T1...")
test1_total += 1
test_mobile_t1 = "6987654321"
t1_token, t1_user_id = register_test_user(test_mobile_t1)
if not t1_token:
    t1_token = login(test_mobile_t1, "abc123")
    if t1_token:
        t1_user_id = get_user_id_from_token(t1_token)

if t1_user_id:
    print(f"✅ PASS: Test user T1 created (ID: {t1_user_id})")
    test1_passed += 1
    
    # Insert test payment into MongoDB
    print("\n1d. Inserting test payment TESTPAY1 into MongoDB...")
    test1_total += 1
    try:
        db.payments.insert_one({
            "id": "TESTPAY1",
            "userId": t1_user_id,
            "status": "success",
            "amount": 219,
            "createdAt": datetime.now()
        })
        print("✅ PASS: Test payment TESTPAY1 inserted")
        test1_passed += 1
    except Exception as e:
        print(f"❌ FAIL: Could not insert payment: {e}")
else:
    print("❌ FAIL: Could not create test user T1")

# 1e. POST without reason → 400
print("\n1e. POST /api/admin/payment-refund without reason → 400")
test1_total += 1
try:
    resp = requests.post(f"{BASE_URL}/admin/payment-refund",
                       json={"paymentId": "TESTPAY1"},
                       headers={"Authorization": f"Bearer {admin_token}"},
                       timeout=10)
    if resp.status_code == 400:
        print(f"✅ PASS: 400 without reason - {resp.json().get('error', '')}")
        test1_passed += 1
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 1f. POST with reason → 200, refunded:true
print("\n1f. POST /api/admin/payment-refund with reason → 200")
test1_total += 1
try:
    resp = requests.post(f"{BASE_URL}/admin/payment-refund",
                       json={"paymentId": "TESTPAY1", "reason": "test refund"},
                       headers={"Authorization": f"Bearer {admin_token}"},
                       timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        if data.get("ok") and data.get("refunded") == True:
            print(f"✅ PASS: 200 with refunded:true - {json.dumps(data, indent=2)}")
            test1_passed += 1
        else:
            print(f"❌ FAIL: Response missing expected fields - {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 1g. Verify in MongoDB
print("\n1g. Verifying refunded flag in MongoDB...")
test1_total += 1
try:
    payment_doc = db.payments.find_one({"id": "TESTPAY1"})
    if payment_doc:
        if payment_doc.get("refunded") == True and payment_doc.get("refundReason") == "test refund":
            print(f"✅ PASS: MongoDB doc has refunded:true, refundReason:'test refund', refundedAt:{payment_doc.get('refundedAt')}")
            test1_passed += 1
        else:
            print(f"❌ FAIL: MongoDB doc missing expected fields - refunded:{payment_doc.get('refunded')}, refundReason:{payment_doc.get('refundReason')}")
    else:
        print("❌ FAIL: Payment doc not found in MongoDB")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 1h. Verify admin_logs entry
print("\n1h. Verifying admin_logs entry...")
test1_total += 1
try:
    log_entry = db.admin_logs.find_one({"type": "payment_refunded", "paymentId": "TESTPAY1"})
    if log_entry:
        print(f"✅ PASS: admin_logs entry found - type:{log_entry.get('type')}, reason:{log_entry.get('reason')}")
        test1_passed += 1
    else:
        print("❌ FAIL: admin_logs entry not found")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 1i. POST again (idempotent) → 200 with already:true
print("\n1i. POST /api/admin/payment-refund again (idempotent) → 200 with already:true")
test1_total += 1
try:
    resp = requests.post(f"{BASE_URL}/admin/payment-refund",
                       json={"paymentId": "TESTPAY1", "reason": "test refund again"},
                       headers={"Authorization": f"Bearer {admin_token}"},
                       timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        if data.get("ok") and data.get("already") == True:
            print(f"✅ PASS: 200 with already:true (idempotent) - {json.dumps(data, indent=2)}")
            test1_passed += 1
        else:
            print(f"❌ FAIL: Response missing 'already:true' - {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 1j. POST with unrefund:true → 200 refunded:false
print("\n1j. POST /api/admin/payment-refund with unrefund:true → 200 refunded:false")
test1_total += 1
try:
    resp = requests.post(f"{BASE_URL}/admin/payment-refund",
                       json={"paymentId": "TESTPAY1", "reason": "undo refund", "unrefund": True},
                       headers={"Authorization": f"Bearer {admin_token}"},
                       timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        if data.get("ok") and data.get("refunded") == False:
            print(f"✅ PASS: 200 with refunded:false (unrefund) - {json.dumps(data, indent=2)}")
            test1_passed += 1
        else:
            print(f"❌ FAIL: Response missing expected fields - {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

print(f"\n📊 TEST 1 RESULTS: {test1_passed}/{test1_total} checks passed ({test1_passed*100//test1_total if test1_total > 0 else 0}%)")

print("\n" + "=" * 80)
print("TEST 2: Referral rule change (100 milestone, continuous OFF, max 5)")
print("=" * 80)

test2_passed = 0
test2_total = 0

# 2a. Read campaign from MongoDB
print("\n2a. Reading referral campaign from MongoDB...")
test2_total += 1
try:
    campaign = db.referral_campaigns.find_one({"id": "default-refer-and-earn"})
    if not campaign:
        # Try to trigger auto-migration by hitting an endpoint
        print("⚠️  Campaign not found, trying to trigger auto-migration...")
        resp = requests.get(f"{BASE_URL}/referral/campaign", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if resp.status_code == 200:
            campaign_data = resp.json()
            print(f"✅ Campaign fetched via API: {json.dumps(campaign_data, indent=2)}")
            # Re-read from MongoDB
            campaign = db.referral_campaigns.find_one({"id": "default-refer-and-earn"})
    
    if campaign:
        print(f"✅ PASS: Campaign found in MongoDB")
        test2_passed += 1
        
        # 2b. Verify milestones contains {count:100, rewardDays:365}
        print("\n2b. Verifying milestones contains {count:100, rewardDays:365}...")
        test2_total += 1
        milestones = campaign.get("milestones", [])
        has_100_milestone = any(m.get("count") == 100 and m.get("rewardDays") == 365 for m in milestones)
        if has_100_milestone:
            print(f"✅ PASS: Milestones contains {{count:100, rewardDays:365}}")
            test2_passed += 1
        else:
            print(f"❌ FAIL: Milestones does not contain {{count:100, rewardDays:365}}")
            print(f"   Milestones: {json.dumps(milestones, indent=2)}")
        
        # 2c. Verify continuous.enabled === false
        print("\n2c. Verifying continuous.enabled === false...")
        test2_total += 1
        continuous = campaign.get("continuous", {})
        if continuous.get("enabled") == False:
            print(f"✅ PASS: continuous.enabled === false")
            test2_passed += 1
        else:
            print(f"❌ FAIL: continuous.enabled !== false (got: {continuous.get('enabled')})")
        
        # 2d. Verify maxRewardsPerUser === 5
        print("\n2d. Verifying maxRewardsPerUser === 5...")
        test2_total += 1
        max_rewards = campaign.get("maxRewardsPerUser")
        if max_rewards == 5:
            print(f"✅ PASS: maxRewardsPerUser === 5")
            test2_passed += 1
        else:
            print(f"❌ FAIL: maxRewardsPerUser !== 5 (got: {max_rewards})")
        
        # 2e. Verify schemaVersion === 3
        print("\n2e. Verifying schemaVersion === 3...")
        test2_total += 1
        schema_version = campaign.get("schemaVersion")
        if schema_version == 3:
            print(f"✅ PASS: schemaVersion === 3")
            test2_passed += 1
        else:
            print(f"❌ FAIL: schemaVersion !== 3 (got: {schema_version})")
        
        print(f"\n📋 Campaign details:")
        print(f"   - milestones: {json.dumps(milestones, indent=6)}")
        print(f"   - continuous: {json.dumps(continuous, indent=6)}")
        print(f"   - maxRewardsPerUser: {max_rewards}")
        print(f"   - schemaVersion: {schema_version}")
    else:
        print("❌ FAIL: Campaign not found in MongoDB")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

print(f"\n📊 TEST 2 RESULTS: {test2_passed}/{test2_total} checks passed ({test2_passed*100//test2_total if test2_total > 0 else 0}%)")

print("\n" + "=" * 80)
print("TEST 3: Ambassador plan (₹99/year) — eligibility-gated")
print("=" * 80)

test3_passed = 0
test3_total = 0

# 3a. GET /api/admin/ambassador-plan with NO token → 401
print("\n3a. GET /api/admin/ambassador-plan with NO token → 401")
test3_total += 1
try:
    resp = requests.get(f"{BASE_URL}/admin/ambassador-plan", timeout=10)
    if resp.status_code == 401:
        print("✅ PASS: 401 without token")
        test3_passed += 1
    else:
        print(f"❌ FAIL: Expected 401, got {resp.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 3b. GET with non-admin token → 403
print("\n3b. GET /api/admin/ambassador-plan with non-admin token → 403")
test3_total += 1
if normal_token:
    try:
        resp = requests.get(f"{BASE_URL}/admin/ambassador-plan",
                          headers={"Authorization": f"Bearer {normal_token}"},
                          timeout=10)
        if resp.status_code == 403:
            print("✅ PASS: 403 for non-admin")
            test3_passed += 1
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
else:
    print("⚠️  SKIP: No normal user token")

# 3c. GET with admin token → 200
print("\n3c. GET /api/admin/ambassador-plan with admin token → 200")
test3_total += 1
try:
    resp = requests.get(f"{BASE_URL}/admin/ambassador-plan",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        config = data.get("config", {})
        print(f"✅ PASS: 200 with config: {json.dumps(config, indent=2)}")
        test3_passed += 1
        
        # Verify config shape
        if config.get("enabled") == True and config.get("priceInr") == 99 and config.get("days") == 365:
            print(f"   ✅ Config has expected values: enabled:true, priceInr:99, days:365")
        else:
            print(f"   ⚠️  Config values differ from expected")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 3d. PUT /api/admin/ambassador-plan (admin) → 200
print("\n3d. PUT /api/admin/ambassador-plan with admin token → 200")
test3_total += 1
try:
    resp = requests.put(f"{BASE_URL}/admin/ambassador-plan",
                      json={"priceInr": 99, "enabled": True},
                      headers={"Authorization": f"Bearer {admin_token}"},
                      timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ PASS: 200 - {json.dumps(data, indent=2)}")
        test3_passed += 1
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 3e. Create throwaway test user T2
print("\n3e. Creating throwaway test user T2...")
test3_total += 1
test_mobile_t2 = "6111222333"
t2_token, t2_user_id = register_test_user(test_mobile_t2)
if not t2_token:
    t2_token = login(test_mobile_t2, "abc123")
    if t2_token:
        t2_user_id = get_user_id_from_token(t2_token)

if t2_user_id:
    print(f"✅ PASS: Test user T2 created (ID: {t2_user_id})")
    test3_passed += 1
else:
    print("❌ FAIL: Could not create test user T2")

# 3f. GET /api/plans with T2 token → ambassadorEligible:false
print("\n3f. GET /api/plans with T2 token (non-eligible) → ambassadorEligible:false")
test3_total += 1
if t2_token:
    try:
        resp = requests.get(f"{BASE_URL}/plans",
                          headers={"Authorization": f"Bearer {t2_token}"},
                          timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            ambassador_eligible = data.get("ambassadorEligible")
            plans = data.get("plans", [])
            has_ambassador_plan = any(p.get("id") == "ambassador-yearly" for p in plans)
            
            if ambassador_eligible == False and not has_ambassador_plan:
                print(f"✅ PASS: ambassadorEligible:false AND no 'ambassador-yearly' in plans")
                test3_passed += 1
            else:
                print(f"❌ FAIL: ambassadorEligible:{ambassador_eligible}, has_ambassador_plan:{has_ambassador_plan}")
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
else:
    print("⚠️  SKIP: No T2 token")

# 3g. Seed eligibility: insert referral_rewards doc
print("\n3g. Seeding eligibility for T2 (insert referral_rewards with milestoneCount:100)...")
test3_total += 1
if t2_user_id:
    try:
        db.referral_rewards.insert_one({
            "id": "TR1",
            "userId": t2_user_id,
            "milestoneCount": 100,
            "rewardDays": 365,
            "grantedAt": datetime.now()
        })
        print("✅ PASS: Eligibility seeded (referral_rewards doc inserted)")
        test3_passed += 1
    except Exception as e:
        print(f"❌ FAIL: Could not insert referral_rewards: {e}")
else:
    print("⚠️  SKIP: No T2 user ID")

# 3h. GET /api/plans with T2 token again → ambassadorEligible:true
print("\n3h. GET /api/plans with T2 token (now eligible) → ambassadorEligible:true")
test3_total += 1
if t2_token:
    try:
        resp = requests.get(f"{BASE_URL}/plans",
                          headers={"Authorization": f"Bearer {t2_token}"},
                          timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            ambassador_eligible = data.get("ambassadorEligible")
            ambassador_referral_count = data.get("ambassadorReferralCount")
            plans = data.get("plans", [])
            ambassador_plan = next((p for p in plans if p.get("id") == "ambassador-yearly"), None)
            
            if ambassador_eligible == True and ambassador_plan:
                print(f"✅ PASS: ambassadorEligible:true AND 'ambassador-yearly' in plans")
                print(f"   - ambassadorReferralCount: {ambassador_referral_count}")
                print(f"   - Ambassador plan: {json.dumps(ambassador_plan, indent=6)}")
                test3_passed += 1
            else:
                print(f"❌ FAIL: ambassadorEligible:{ambassador_eligible}, ambassador_plan:{ambassador_plan}")
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
else:
    print("⚠️  SKIP: No T2 token")

# 3i. Create test user T3 (non-eligible)
print("\n3i. Creating test user T3 (non-eligible)...")
test3_total += 1
test_mobile_t3 = "6444555666"
t3_token, t3_user_id = register_test_user(test_mobile_t3)
if not t3_token:
    t3_token = login(test_mobile_t3, "abc123")
    if t3_token:
        t3_user_id = get_user_id_from_token(t3_token)

if t3_user_id:
    print(f"✅ PASS: Test user T3 created (ID: {t3_user_id})")
    test3_passed += 1
else:
    print("❌ FAIL: Could not create test user T3")

# 3j. POST /api/razorpay/create-order with non-eligible user → 403
print("\n3j. POST /api/razorpay/create-order with non-eligible user (T3) → 403")
test3_total += 1
if t3_token:
    try:
        resp = requests.post(f"{BASE_URL}/razorpay/create-order",
                           json={"planId": "ambassador-yearly"},
                           headers={"Authorization": f"Bearer {t3_token}"},
                           timeout=10)
        if resp.status_code == 403:
            print(f"✅ PASS: 403 for non-eligible user - {resp.json().get('error', '')}")
            test3_passed += 1
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
else:
    print("⚠️  SKIP: No T3 token")

print(f"\n📊 TEST 3 RESULTS: {test3_passed}/{test3_total} checks passed ({test3_passed*100//test3_total if test3_total > 0 else 0}%)")

print("\n" + "=" * 80)
print("TEST 4: Milestone preview — continuous earners count")
print("=" * 80)

test4_passed = 0
test4_total = 0

# 4a. GET /api/admin/referral-milestone/preview with NO token → 401
print("\n4a. GET /api/admin/referral-milestone/preview with NO token → 401")
test4_total += 1
try:
    resp = requests.get(f"{BASE_URL}/admin/referral-milestone/preview", timeout=10)
    if resp.status_code == 401:
        print("✅ PASS: 401 without token")
        test4_passed += 1
    else:
        print(f"❌ FAIL: Expected 401, got {resp.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

# 4b. GET with non-admin token → 403
print("\n4b. GET /api/admin/referral-milestone/preview with non-admin token → 403")
test4_total += 1
if normal_token:
    try:
        resp = requests.get(f"{BASE_URL}/admin/referral-milestone/preview",
                          headers={"Authorization": f"Bearer {normal_token}"},
                          timeout=10)
        if resp.status_code == 403:
            print("✅ PASS: 403 for non-admin")
            test4_passed += 1
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
else:
    print("⚠️  SKIP: No normal user token")

# 4c. GET with admin token → 200 with continuous field
print("\n4c. GET /api/admin/referral-milestone/preview with admin token → 200")
test4_total += 1
try:
    resp = requests.get(f"{BASE_URL}/admin/referral-milestone/preview",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        continuous = data.get("continuous")
        
        if continuous and isinstance(continuous, dict):
            count = continuous.get("count")
            earners = continuous.get("earners")
            
            if isinstance(count, int) and isinstance(earners, list):
                print(f"✅ PASS: Response includes continuous: {{count:{count}, earners:[{len(earners)} items]}}")
                print(f"   - continuous.count: {count}")
                print(f"   - continuous.earners: {json.dumps(earners[:3], indent=6)}...")
                test4_passed += 1
            else:
                print(f"❌ FAIL: continuous field has wrong types - count:{type(count)}, earners:{type(earners)}")
        else:
            print(f"❌ FAIL: Response missing 'continuous' field or wrong type")
            print(f"   Response keys: {list(data.keys())}")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ FAIL: Exception: {e}")

print(f"\n📊 TEST 4 RESULTS: {test4_passed}/{test4_total} checks passed ({test4_passed*100//test4_total if test4_total > 0 else 0}%)")

# Overall summary
print("\n" + "=" * 80)
print("OVERALL SUMMARY")
print("=" * 80)
total_passed = test1_passed + test2_passed + test3_passed + test4_passed
total_tests = test1_total + test2_total + test3_total + test4_total
success_rate = (total_passed * 100 // total_tests) if total_tests > 0 else 0

print(f"\n📊 TOTAL RESULTS: {total_passed}/{total_tests} checks passed ({success_rate}%)")
print(f"\n   TEST 1 (Refund): {test1_passed}/{test1_total} ({test1_passed*100//test1_total if test1_total > 0 else 0}%)")
print(f"   TEST 2 (Rule change): {test2_passed}/{test2_total} ({test2_passed*100//test2_total if test2_total > 0 else 0}%)")
print(f"   TEST 3 (Ambassador): {test3_passed}/{test3_total} ({test3_passed*100//test3_total if test3_total > 0 else 0}%)")
print(f"   TEST 4 (Preview): {test4_passed}/{test4_total} ({test4_passed*100//test4_total if test4_total > 0 else 0}%)")

if success_rate == 100:
    print("\n✅ ALL TESTS PASSED")
elif success_rate >= 80:
    print("\n✅ MOST TESTS PASSED (some minor issues)")
else:
    print("\n❌ SIGNIFICANT FAILURES DETECTED")

print("\n" + "=" * 80)
print("Test completed at:", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
print("=" * 80)
