#!/usr/bin/env python3
"""
Backend test for Subscription Downgrade Fix (MongoDB $set + $unset conflict)
Re-runs ONLY:
- Test A: SCHEDULE + AUTO-ACTIVATE DOWNGRADE (full flow)
- Test Bx: Cancel when no schedule exists
- Test Ex: Invalid planId
- Test Ey: Current plan id
"""

import requests
import time
import json
from uuid import uuid4
from datetime import datetime, timedelta
from pymongo import MongoClient

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_MOBILE = "9999900001"
PREMIUM_PASSWORD = "<redacted>"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

def get_mongo():
    """Get MongoDB connection"""
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

def login(mobile, password):
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
    if resp.status_code == 200:
        return resp.json().get("token")
    return None

def get_me(token):
    """Get current user info"""
    resp = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        return data.get("user", data)
    return None

def get_plans(token):
    """Get all plans"""
    resp = requests.get(f"{BASE_URL}/plans", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None

print("\n" + "="*80)
print("SUBSCRIPTION DOWNGRADE FIX TEST (MongoDB $set + $unset conflict)")
print("="*80)

# Connect to MongoDB
db = get_mongo()
print(f"✅ Connected to MongoDB: {DB_NAME}")

# Login as premium user
print("\n--- LOGIN ---")
premium_token = login(PREMIUM_MOBILE, PREMIUM_PASSWORD)
if not premium_token:
    print("❌ FATAL: Cannot login as premium user")
    exit(1)
print(f"✅ Logged in as premium user: {PREMIUM_MOBILE}")

# Get premium user info
premium_user = get_me(premium_token)
if not premium_user:
    print("❌ FATAL: Cannot get premium user info")
    exit(1)
premium_user_id = premium_user.get("id")
print(f"✅ Premium user ID: {premium_user_id}")
print(f"   Current subscription: {premium_user.get('subscription', {}).get('plan', 'none')}")
print(f"   Status: {premium_user.get('subscription', {}).get('status', 'none')}")

# Get all plans
plans_data = get_plans(premium_token)
if not plans_data:
    print("❌ FATAL: Cannot get plans")
    exit(1)
plans = plans_data.get("plans", [])
print(f"✅ Found {len(plans)} plans")

# Find cheapest PAID plan and yearly plan
plans_sorted = sorted(plans, key=lambda p: p.get("price", 0))
paid_plans = [p for p in plans_sorted if p.get("price", 0) > 0]
cheapest_plan = paid_plans[0] if paid_plans else plans_sorted[0]
yearly_plan = next((p for p in plans if 'yearly' in p.get('id', '').lower() or p.get('days') == 365), None)

print(f"   Cheapest PAID: {cheapest_plan.get('name')} ({cheapest_plan.get('id')}) - Rs{cheapest_plan.get('price')}")
print(f"   Yearly plan: {yearly_plan.get('name')} ({yearly_plan.get('id')}) - Rs{yearly_plan.get('price')}")

# Store original subscription for cleanup
original_subscription = premium_user.get('subscription', {}).copy()

# Setup: Ensure premium user has Yearly plan
print(f"\n--- SETUP: Ensure premium user has Yearly plan ---")
current_plan = premium_user.get('subscription', {}).get('plan')
if current_plan != yearly_plan.get('id'):
    print(f"   Current plan: {current_plan}, setting to Yearly...")
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$set": {
            "subscription": {
                "plan": yearly_plan.get('id'),
                "status": "active",
                "startDate": datetime.now() - timedelta(days=30),
                "expiryDate": datetime.now() + timedelta(days=300)
            }
        }}
    )
    print(f"✅ Updated user to Yearly plan: {yearly_plan.get('id')}")
    premium_user = get_me(premium_token)
else:
    print(f"✅ User already has Yearly plan")

print("\n" + "="*80)
print("TEST A: SCHEDULE + AUTO-ACTIVATE DOWNGRADE")
print("="*80)

test_a_pass = True

try:
    # 1. Schedule downgrade to cheapest plan
    print(f"\n1. Schedule downgrade to {cheapest_plan.get('name')} ({cheapest_plan.get('id')})")
    resp = requests.post(
        f"{BASE_URL}/subscription/schedule-downgrade",
        json={"planId": cheapest_plan.get('id')},
        headers={"Authorization": f"Bearer {premium_token}"},
        timeout=15
    )
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Schedule downgrade response: {json.dumps(data, indent=2, default=str)}")
        
        if data.get('ok') and data.get('scheduled'):
            print(f"✅ TEST A.1 PASS: Downgrade scheduled successfully")
        else:
            print(f"❌ TEST A.1 FAIL: Response missing ok/scheduled fields")
            test_a_pass = False
    else:
        print(f"❌ TEST A.1 FAIL: Schedule downgrade failed: {resp.status_code}")
        print(f"   Response: {resp.text}")
        test_a_pass = False
    
    # 2. Verify scheduledDowngrade in user doc
    print(f"\n2. Verify scheduledDowngrade in GET /auth/me")
    time.sleep(0.5)
    premium_user = get_me(premium_token)
    scheduled_downgrade = premium_user.get('subscription', {}).get('scheduledDowngrade')
    
    if scheduled_downgrade:
        print(f"✅ TEST A.2 PASS: scheduledDowngrade exists")
        print(f"   planId: {scheduled_downgrade.get('planId')}")
        print(f"   planName: {scheduled_downgrade.get('planName')}")
        print(f"   planDays: {scheduled_downgrade.get('planDays')}")
        print(f"   activatesAt: {scheduled_downgrade.get('activatesAt')}")
    else:
        print(f"❌ TEST A.2 FAIL: scheduledDowngrade not found in user doc")
        test_a_pass = False
    
    # 3. Simulate expiry by setting expiryDate to past
    print(f"\n3. Simulate expiry by setting expiryDate to 60 seconds ago")
    past_expiry = datetime.now() - timedelta(seconds=60)
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$set": {"subscription.expiryDate": past_expiry}}
    )
    print(f"✅ Updated expiryDate to: {past_expiry}")
    
    # 4. Poll /auth/me to trigger reconciler
    print(f"\n4. Poll GET /auth/me to trigger reconciler (max 10 polls)")
    max_polls = 10
    downgrade_activated = False
    
    for i in range(max_polls):
        time.sleep(0.5)
        premium_user = get_me(premium_token)
        
        new_plan = premium_user.get('subscription', {}).get('plan')
        new_status = premium_user.get('subscription', {}).get('status')
        scheduled_downgrade_after = premium_user.get('subscription', {}).get('scheduledDowngrade')
        
        if new_plan == cheapest_plan.get('id') and new_status == 'active' and scheduled_downgrade_after is None:
            print(f"✅ Downgrade activated on poll {i+1}")
            downgrade_activated = True
            break
    
    if not downgrade_activated:
        print(f"❌ TEST A.3 FAIL: Downgrade not activated after {max_polls} polls")
        test_a_pass = False
    
    # 5. Verify all conditions
    print(f"\n5. Verify downgrade activation details")
    new_plan = premium_user.get('subscription', {}).get('plan')
    new_status = premium_user.get('subscription', {}).get('status')
    new_start = premium_user.get('subscription', {}).get('startDate')
    new_expiry = premium_user.get('subscription', {}).get('expiryDate')
    scheduled_downgrade_after = premium_user.get('subscription', {}).get('scheduledDowngrade')
    activated_from_downgrade = premium_user.get('subscription', {}).get('activatedFromDowngrade')
    previous_plan = premium_user.get('subscription', {}).get('previousPlan')
    
    print(f"   Plan: {new_plan}")
    print(f"   Status: {new_status}")
    print(f"   startDate: {new_start}")
    print(f"   expiryDate: {new_expiry}")
    print(f"   scheduledDowngrade: {scheduled_downgrade_after}")
    print(f"   activatedFromDowngrade: {activated_from_downgrade}")
    print(f"   previousPlan: {previous_plan}")
    
    # Verify plan
    if new_plan != cheapest_plan.get('id'):
        print(f"❌ TEST A.3 FAIL: Plan not changed to {cheapest_plan.get('id')}, got {new_plan}")
        test_a_pass = False
    else:
        print(f"✅ Plan changed to {cheapest_plan.get('id')}")
    
    # Verify status
    if new_status != 'active':
        print(f"❌ TEST A.3 FAIL: Status not active, got {new_status}")
        test_a_pass = False
    else:
        print(f"✅ Status is active")
    
    # Verify startDate is recent
    if new_start:
        start_dt = datetime.fromisoformat(new_start.replace('Z', '+00:00')) if isinstance(new_start, str) else new_start
        start_age = (datetime.now() - start_dt.replace(tzinfo=None)).total_seconds()
        if start_age > 10:
            print(f"❌ TEST A.3 FAIL: startDate not recent, age: {start_age}s")
            test_a_pass = False
        else:
            print(f"✅ startDate is recent (age: {start_age:.2f}s)")
    else:
        print(f"❌ TEST A.3 FAIL: startDate is None")
        test_a_pass = False
    
    # Verify expiryDate
    if new_expiry:
        expiry_dt = datetime.fromisoformat(new_expiry.replace('Z', '+00:00')) if isinstance(new_expiry, str) else new_expiry
        expected_expiry = datetime.now() + timedelta(days=cheapest_plan.get('days', 0))
        expiry_diff = abs((expiry_dt.replace(tzinfo=None) - expected_expiry).total_seconds())
        if expiry_diff > 600:  # 10 minutes tolerance
            print(f"❌ TEST A.3 FAIL: expiryDate not correct, diff: {expiry_diff}s")
            test_a_pass = False
        else:
            print(f"✅ expiryDate is correct (diff: {expiry_diff:.2f}s)")
    else:
        print(f"❌ TEST A.3 FAIL: expiryDate is None")
        test_a_pass = False
    
    # Verify scheduledDowngrade is unset
    if scheduled_downgrade_after is not None:
        print(f"❌ TEST A.3 FAIL: scheduledDowngrade not unset, got {scheduled_downgrade_after}")
        test_a_pass = False
    else:
        print(f"✅ scheduledDowngrade is unset")
    
    # Verify activatedFromDowngrade
    if not activated_from_downgrade:
        print(f"❌ TEST A.3 FAIL: activatedFromDowngrade not set")
        test_a_pass = False
    else:
        print(f"✅ activatedFromDowngrade is set")
    
    # Verify previousPlan
    if previous_plan != yearly_plan.get('id'):
        print(f"❌ TEST A.3 FAIL: previousPlan not set correctly, got {previous_plan}")
        test_a_pass = False
    else:
        print(f"✅ previousPlan is set correctly")
    
    # 6. Check admin_logs
    print(f"\n6. Verify admin_logs has 'downgrade_activated' entry")
    log_entry = db.admin_logs.find_one({"type": "downgrade_activated", "userId": premium_user_id})
    if log_entry:
        print(f"✅ TEST A.4 PASS: Admin log entry found")
        print(f"   fromPlan: {log_entry.get('fromPlan')}")
        print(f"   toPlan: {log_entry.get('toPlan')}")
        print(f"   startDate: {log_entry.get('startDate')}")
        print(f"   expiryDate: {log_entry.get('expiryDate')}")
    else:
        print(f"❌ TEST A.4 FAIL: Admin log entry not found")
        test_a_pass = False

except Exception as e:
    print(f"❌ TEST A EXCEPTION: {e}")
    import traceback
    traceback.print_exc()
    test_a_pass = False

if test_a_pass:
    print(f"\n✅✅✅ TEST A: PASS - All checks passed")
else:
    print(f"\n❌❌❌ TEST A: FAIL - Some checks failed")

print("\n" + "="*80)
print("TEST Bx: Cancel when no schedule exists")
print("="*80)

test_bx_pass = True

try:
    # Ensure no scheduled downgrade exists
    print(f"1. Ensure no scheduled downgrade exists")
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$unset": {"subscription.scheduledDowngrade": ""}}
    )
    print(f"✅ Cleared any existing scheduledDowngrade")
    
    # Try to cancel (should fail with 400)
    print(f"\n2. POST /subscription/cancel-scheduled-downgrade (should fail with 400)")
    resp = requests.post(
        f"{BASE_URL}/subscription/cancel-scheduled-downgrade",
        headers={"Authorization": f"Bearer {premium_token}"},
        timeout=15
    )
    
    if resp.status_code == 400:
        data = resp.json()
        if data.get('code') == 'NO_SCHEDULED_DOWNGRADE':
            print(f"✅ TEST Bx PASS: Returns 400 with NO_SCHEDULED_DOWNGRADE")
            print(f"   Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ TEST Bx FAIL: Wrong error code: {data.get('code')}")
            test_bx_pass = False
    else:
        print(f"❌ TEST Bx FAIL: Expected 400, got {resp.status_code}")
        print(f"   Response: {resp.text}")
        test_bx_pass = False

except Exception as e:
    print(f"❌ TEST Bx EXCEPTION: {e}")
    import traceback
    traceback.print_exc()
    test_bx_pass = False

if test_bx_pass:
    print(f"\n✅✅✅ TEST Bx: PASS")
else:
    print(f"\n❌❌❌ TEST Bx: FAIL")

print("\n" + "="*80)
print("TEST Ex: Invalid planId")
print("="*80)

test_ex_pass = True

try:
    print(f"1. POST /subscription/schedule-downgrade with invalid planId")
    resp = requests.post(
        f"{BASE_URL}/subscription/schedule-downgrade",
        json={"planId": "plan-does-not-exist"},
        headers={"Authorization": f"Bearer {premium_token}"},
        timeout=15
    )
    
    if resp.status_code == 400:
        data = resp.json()
        error_msg = data.get('error', '').lower()
        if 'invalid plan' in error_msg or 'plan' in error_msg:
            print(f"✅ TEST Ex PASS: Returns 400 with error about invalid plan")
            print(f"   Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ TEST Ex FAIL: Wrong error message: {data.get('error')}")
            test_ex_pass = False
    else:
        print(f"❌ TEST Ex FAIL: Expected 400, got {resp.status_code}")
        print(f"   Response: {resp.text}")
        test_ex_pass = False

except Exception as e:
    print(f"❌ TEST Ex EXCEPTION: {e}")
    import traceback
    traceback.print_exc()
    test_ex_pass = False

if test_ex_pass:
    print(f"\n✅✅✅ TEST Ex: PASS")
else:
    print(f"\n❌❌❌ TEST Ex: FAIL")

print("\n" + "="*80)
print("TEST Ey: Current plan id")
print("="*80)

test_ey_pass = True

try:
    # Restore user to active yearly
    print(f"1. Restore user to active Yearly plan")
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$set": {
            "subscription": {
                "plan": yearly_plan.get('id'),
                "status": "active",
                "startDate": datetime.now() - timedelta(days=30),
                "expiryDate": datetime.now() + timedelta(days=300)
            }
        }}
    )
    print(f"✅ Restored user to Yearly plan")
    
    print(f"\n2. POST /subscription/schedule-downgrade with current plan id")
    resp = requests.post(
        f"{BASE_URL}/subscription/schedule-downgrade",
        json={"planId": yearly_plan.get('id')},
        headers={"Authorization": f"Bearer {premium_token}"},
        timeout=15
    )
    
    if resp.status_code == 400:
        data = resp.json()
        if data.get('code') == 'NOT_A_DOWNGRADE':
            print(f"✅ TEST Ey PASS: Returns 400 with NOT_A_DOWNGRADE")
            print(f"   Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ TEST Ey FAIL: Wrong error code: {data.get('code')}")
            test_ey_pass = False
    else:
        print(f"❌ TEST Ey FAIL: Expected 400, got {resp.status_code}")
        print(f"   Response: {resp.text}")
        test_ey_pass = False

except Exception as e:
    print(f"❌ TEST Ey EXCEPTION: {e}")
    import traceback
    traceback.print_exc()
    test_ey_pass = False

if test_ey_pass:
    print(f"\n✅✅✅ TEST Ey: PASS")
else:
    print(f"\n❌❌❌ TEST Ey: FAIL")

# Cleanup
print("\n" + "="*80)
print("CLEANUP")
print("="*80)

try:
    print(f"Restoring original subscription for premium user...")
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$set": {"subscription": original_subscription}}
    )
    print(f"✅ Restored original subscription")
    
    # Delete test admin logs
    result = db.admin_logs.delete_many({
        "userId": premium_user_id,
        "type": {"$in": ["downgrade_activated", "downgrade_cancelled", "downgrade_scheduled"]}
    })
    print(f"✅ Deleted {result.deleted_count} test admin log entries")
    
except Exception as e:
    print(f"❌ Cleanup error: {e}")

print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
print(f"TEST A (SCHEDULE + AUTO-ACTIVATE): {'✅ PASS' if test_a_pass else '❌ FAIL'}")
print(f"TEST Bx (Cancel when no schedule): {'✅ PASS' if test_bx_pass else '❌ FAIL'}")
print(f"TEST Ex (Invalid planId): {'✅ PASS' if test_ex_pass else '❌ FAIL'}")
print(f"TEST Ey (Current plan id): {'✅ PASS' if test_ey_pass else '❌ FAIL'}")
print("="*80)

all_pass = test_a_pass and test_bx_pass and test_ex_pass and test_ey_pass
if all_pass:
    print("✅✅✅ ALL TESTS PASSED ✅✅✅")
else:
    print("❌❌❌ SOME TESTS FAILED ❌❌❌")
print("="*80)
