#!/usr/bin/env python3
"""
Backend test for Subscription Renewal Flow Fixes
Tests: Schedule downgrade, cancel downgrade, stale-lock reconciler, auto-expire, no regression
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
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"❌ Login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def get_me(token):
    """Get current user info"""
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("user", data)  # Handle both {user: ...} and direct user object
        else:
            print(f"❌ Get me failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Get me error: {e}")
        return None

def get_plans(token):
    """Get all plans"""
    try:
        resp = requests.get(f"{BASE_URL}/plans", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"❌ Get plans failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Get plans error: {e}")
        return None

def schedule_downgrade(token, plan_id):
    """Schedule a downgrade"""
    try:
        resp = requests.post(f"{BASE_URL}/subscription/schedule-downgrade", 
                            json={"planId": plan_id}, 
                            headers={"Authorization": f"Bearer {token}"}, 
                            timeout=10)
        return resp
    except Exception as e:
        print(f"❌ Schedule downgrade error: {e}")
        return None

def cancel_scheduled_downgrade(token):
    """Cancel scheduled downgrade"""
    try:
        resp = requests.post(f"{BASE_URL}/subscription/cancel-scheduled-downgrade", 
                            headers={"Authorization": f"Bearer {token}"}, 
                            timeout=10)
        return resp
    except Exception as e:
        print(f"❌ Cancel scheduled downgrade error: {e}")
        return None

def get_plans_quote(token, plan_id):
    """Get quote for a plan"""
    try:
        resp = requests.post(f"{BASE_URL}/plans/quote", 
                            json={"planId": plan_id}, 
                            headers={"Authorization": f"Bearer {token}"}, 
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("quote", data)  # Handle both {quote: ...} and direct quote object
        else:
            print(f"❌ Get quote failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Get quote error: {e}")
        return None

print("\n" + "="*80)
print("SUBSCRIPTION RENEWAL FLOW TESTS")
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

# Find cheapest PAID plan and most expensive plans
plans_sorted = sorted(plans, key=lambda p: p.get("price", 0))
paid_plans = [p for p in plans_sorted if p.get("price", 0) > 0]
cheapest_plan = paid_plans[0] if paid_plans else plans_sorted[0]
most_expensive_plan = plans_sorted[-1] if plans_sorted else None

print(f"   Cheapest PAID: {cheapest_plan.get('name')} ({cheapest_plan.get('id')}) - ₹{cheapest_plan.get('price')}")
print(f"   Most expensive: {most_expensive_plan.get('name')} ({most_expensive_plan.get('id')}) - ₹{most_expensive_plan.get('price')}")

# Ensure premium user has a yearly plan to make monthly a downgrade
current_plan = premium_user.get('subscription', {}).get('plan')
print(f"\n--- SETUP: Ensure premium user has Yearly plan ---")
if current_plan != 'plan-yearly-999':
    print(f"   Current plan: {current_plan}, setting to Yearly...")
    # Find yearly plan
    yearly_plan = next((p for p in plans if 'yearly' in p.get('id', '').lower() or p.get('days') == 365), None)
    if not yearly_plan:
        print("❌ FATAL: Cannot find yearly plan")
        exit(1)
    
    # Update user subscription to yearly
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
    
    # Refresh user info
    premium_user = get_me(premium_token)
    print(f"   New plan: {premium_user.get('subscription', {}).get('plan')}")
else:
    print(f"✅ User already has Yearly plan")

# Store original subscription for cleanup
original_subscription = premium_user.get('subscription', {}).copy()

print("\n" + "="*80)
print("TEST A: SCHEDULE + AUTO-ACTIVATE DOWNGRADE")
print("="*80)

try:
    # Get current expiry
    current_expiry = premium_user.get('subscription', {}).get('expiryDate')
    print(f"Current expiry: {current_expiry}")
    
    # Schedule downgrade to cheapest plan
    print(f"\n1. Schedule downgrade to {cheapest_plan.get('name')} ({cheapest_plan.get('id')})")
    resp = schedule_downgrade(premium_token, cheapest_plan.get('id'))
    
    if resp and resp.status_code == 200:
        data = resp.json()
        print(f"✅ Schedule downgrade response: {json.dumps(data, indent=2, default=str)}")
        
        if data.get('ok') and data.get('scheduled'):
            print(f"✅ TEST A.1 PASS: Downgrade scheduled successfully")
            print(f"   activatesAt: {data.get('activatesAt')}")
        else:
            print(f"❌ TEST A.1 FAIL: Response missing ok/scheduled fields")
    else:
        print(f"❌ TEST A.1 FAIL: Schedule downgrade failed: {resp.status_code if resp else 'No response'}")
        if resp:
            print(f"   Response: {resp.text}")
    
    # Verify scheduledDowngrade in user doc
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
        print(f"   scheduledAt: {scheduled_downgrade.get('scheduledAt')}")
    else:
        print(f"❌ TEST A.2 FAIL: scheduledDowngrade not found in user doc")
    
    # Simulate expiry by setting expiryDate to past
    print(f"\n3. Simulate expiry by setting expiryDate to 60 seconds ago")
    past_expiry = datetime.now() - timedelta(seconds=60)
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$set": {"subscription.expiryDate": past_expiry}}
    )
    print(f"✅ Updated expiryDate to: {past_expiry}")
    
    # Wait for reconciler to run
    print(f"\n4. Wait 250ms then GET /auth/me to trigger reconciler")
    time.sleep(0.25)
    premium_user = get_me(premium_token)
    
    # Check if downgrade was activated
    new_plan = premium_user.get('subscription', {}).get('plan')
    new_status = premium_user.get('subscription', {}).get('status')
    new_start = premium_user.get('subscription', {}).get('startDate')
    new_expiry = premium_user.get('subscription', {}).get('expiryDate')
    scheduled_downgrade_after = premium_user.get('subscription', {}).get('scheduledDowngrade')
    activated_from_downgrade = premium_user.get('subscription', {}).get('activatedFromDowngrade')
    previous_plan = premium_user.get('subscription', {}).get('previousPlan')
    
    print(f"\n5. Verify downgrade activation")
    print(f"   New plan: {new_plan}")
    print(f"   Status: {new_status}")
    print(f"   startDate: {new_start}")
    print(f"   expiryDate: {new_expiry}")
    print(f"   scheduledDowngrade: {scheduled_downgrade_after}")
    print(f"   activatedFromDowngrade: {activated_from_downgrade}")
    print(f"   previousPlan: {previous_plan}")
    
    # Verify all conditions
    test_a3_pass = True
    if new_plan != cheapest_plan.get('id'):
        print(f"❌ TEST A.3 FAIL: Plan not changed to {cheapest_plan.get('id')}, got {new_plan}")
        test_a3_pass = False
    else:
        print(f"✅ Plan changed to {cheapest_plan.get('id')}")
    
    if new_status != 'active':
        print(f"❌ TEST A.3 FAIL: Status not active, got {new_status}")
        test_a3_pass = False
    else:
        print(f"✅ Status is active")
    
    # Check startDate is recent (within last 10 seconds)
    if new_start:
        start_dt = datetime.fromisoformat(new_start.replace('Z', '+00:00')) if isinstance(new_start, str) else new_start
        start_age = (datetime.now() - start_dt.replace(tzinfo=None)).total_seconds()
        if start_age > 10:
            print(f"❌ TEST A.3 FAIL: startDate not recent, age: {start_age}s")
            test_a3_pass = False
        else:
            print(f"✅ startDate is recent (age: {start_age:.2f}s)")
    else:
        print(f"❌ TEST A.3 FAIL: startDate is None")
        test_a3_pass = False
    
    # Check expiryDate is approximately now + planDays
    if new_expiry:
        expiry_dt = datetime.fromisoformat(new_expiry.replace('Z', '+00:00')) if isinstance(new_expiry, str) else new_expiry
        expected_expiry = datetime.now() + timedelta(days=cheapest_plan.get('days', 0))
        expiry_diff = abs((expiry_dt.replace(tzinfo=None) - expected_expiry).total_seconds())
        if expiry_diff > 600:  # 10 minutes tolerance
            print(f"❌ TEST A.3 FAIL: expiryDate not correct, diff: {expiry_diff}s")
            test_a3_pass = False
        else:
            print(f"✅ expiryDate is correct (diff: {expiry_diff:.2f}s)")
    else:
        print(f"❌ TEST A.3 FAIL: expiryDate is None")
        test_a3_pass = False
    
    if scheduled_downgrade_after is not None:
        print(f"❌ TEST A.3 FAIL: scheduledDowngrade not unset, got {scheduled_downgrade_after}")
        test_a3_pass = False
    else:
        print(f"✅ scheduledDowngrade is unset")
    
    if not activated_from_downgrade:
        print(f"❌ TEST A.3 FAIL: activatedFromDowngrade not set")
        test_a3_pass = False
    else:
        print(f"✅ activatedFromDowngrade is set")
    
    if previous_plan != 'plan-yearly-999':
        print(f"❌ TEST A.3 FAIL: previousPlan not set correctly, got {previous_plan}")
        test_a3_pass = False
    else:
        print(f"✅ previousPlan is set correctly")
    
    if test_a3_pass:
        print(f"\n✅ TEST A.3 PASS: Downgrade activated successfully")
    else:
        print(f"\n❌ TEST A.3 FAIL: Downgrade activation incomplete")
    
    # Check admin_logs for downgrade_activated entry
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

except Exception as e:
    print(f"❌ TEST A EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*80)
print("TEST B: CANCEL SCHEDULED DOWNGRADE")
print("="*80)

try:
    # Restore user to active yearly with future expiry
    print(f"1. Restore premium user to active Yearly with future expiry")
    yearly_plan = next((p for p in plans if 'yearly' in p.get('id', '').lower() or p.get('days') == 365), None)
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
    
    # Schedule downgrade
    print(f"\n2. Schedule downgrade to {cheapest_plan.get('name')}")
    resp = schedule_downgrade(premium_token, cheapest_plan.get('id'))
    if resp and resp.status_code == 200:
        print(f"✅ Downgrade scheduled")
    else:
        print(f"❌ Failed to schedule downgrade")
    
    # Verify scheduledDowngrade exists
    time.sleep(0.5)
    premium_user = get_me(premium_token)
    scheduled_downgrade = premium_user.get('subscription', {}).get('scheduledDowngrade')
    if scheduled_downgrade:
        print(f"✅ TEST B.1 PASS: scheduledDowngrade exists before cancel")
    else:
        print(f"❌ TEST B.1 FAIL: scheduledDowngrade not found before cancel")
    
    # Cancel scheduled downgrade
    print(f"\n3. Cancel scheduled downgrade")
    resp = cancel_scheduled_downgrade(premium_token)
    
    if resp and resp.status_code == 200:
        data = resp.json()
        print(f"✅ Cancel response: {json.dumps(data, indent=2, default=str)}")
        
        if data.get('ok') and data.get('cancelled'):
            print(f"✅ TEST B.2 PASS: Cancel successful")
            print(f"   Cancelled schedule: {data.get('cancelled')}")
        else:
            print(f"❌ TEST B.2 FAIL: Response missing ok/cancelled fields")
    else:
        print(f"❌ TEST B.2 FAIL: Cancel failed: {resp.status_code if resp else 'No response'}")
        if resp:
            print(f"   Response: {resp.text}")
    
    # Verify scheduledDowngrade is unset
    print(f"\n4. Verify scheduledDowngrade is unset in GET /auth/me")
    time.sleep(0.5)
    premium_user = get_me(premium_token)
    scheduled_downgrade_after = premium_user.get('subscription', {}).get('scheduledDowngrade')
    
    if scheduled_downgrade_after is None:
        print(f"✅ TEST B.3 PASS: scheduledDowngrade is unset")
    else:
        print(f"❌ TEST B.3 FAIL: scheduledDowngrade still exists: {scheduled_downgrade_after}")
    
    # Check admin_logs for downgrade_cancelled entry
    print(f"\n5. Verify admin_logs has 'downgrade_cancelled' entry")
    log_entry = db.admin_logs.find_one({"type": "downgrade_cancelled", "userId": premium_user_id})
    if log_entry:
        print(f"✅ TEST B.4 PASS: Admin log entry found")
        print(f"   cancelledSchedule: {log_entry.get('cancelledSchedule')}")
    else:
        print(f"❌ TEST B.4 FAIL: Admin log entry not found")
    
    # Try to cancel again (should fail)
    print(f"\n6. Try to cancel again (should fail with 400)")
    try:
        resp = cancel_scheduled_downgrade(premium_token)
        
        if resp and resp.status_code == 400:
            data = resp.json()
            if data.get('code') == 'NO_SCHEDULED_DOWNGRADE':
                print(f"✅ TEST B.5 PASS: Second cancel returns 400 with NO_SCHEDULED_DOWNGRADE")
            else:
                print(f"❌ TEST B.5 FAIL: Wrong error code: {data.get('code')}")
        else:
            print(f"❌ TEST B.5 FAIL: Expected 400, got {resp.status_code if resp else 'No response'}")
    except Exception as e:
        print(f"❌ TEST B.5 FAIL: Exception: {e}")

except Exception as e:
    print(f"❌ TEST B EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*80)
print("TEST C: STALE-LOCK RECONCILER")
print("="*80)

try:
    # Insert fake stuck payment
    print(f"1. Insert fake stuck payment in 'activating' status")
    fake_payment_id = str(uuid4())
    fake_order_id = f"order_STALE_TEST_{int(time.time())}"
    stuck_payment = {
        "id": fake_payment_id,
        "userId": premium_user_id,
        "plan": "plan-monthly-99",
        "amount": 99,
        "currency": "INR",
        "razorpay_order_id": fake_order_id,
        "status": "activating",
        "activationStartedAt": datetime.now() - timedelta(minutes=30),
        "createdAt": datetime.now() - timedelta(minutes=30)
    }
    db.payments.insert_one(stuck_payment)
    print(f"✅ Inserted stuck payment: {fake_payment_id}")
    print(f"   Order ID: {fake_order_id}")
    print(f"   Status: activating")
    print(f"   activationStartedAt: 30 minutes ago")
    
    # Hit POST /razorpay/verify with dummy body to trigger reconciler
    print(f"\n2. Hit POST /razorpay/verify with dummy body to trigger reconciler")
    resp = requests.post(
        f"{BASE_URL}/razorpay/verify",
        json={
            "razorpay_order_id": "x",
            "razorpay_payment_id": "y",
            "razorpay_signature": "z"
        },
        headers={"Authorization": f"Bearer {premium_token}"},
        timeout=10
    )
    print(f"   Response: {resp.status_code} (expected 400 after reconciler runs)")
    
    # Poll payment row
    print(f"\n3. Poll payment row (max 5s)")
    max_polls = 10
    poll_interval = 0.5
    payment_reset = False
    
    for i in range(max_polls):
        time.sleep(poll_interval)
        payment = db.payments.find_one({"id": fake_payment_id})
        
        if payment and payment.get('status') == 'pending':
            print(f"✅ TEST C.1 PASS: Payment status changed to 'pending'")
            print(f"   activationError: {payment.get('activationError')}")
            print(f"   activationResetAt: {payment.get('activationResetAt')}")
            
            if payment.get('activationError') == 'stale_lock_reset':
                print(f"✅ TEST C.2 PASS: activationError is 'stale_lock_reset'")
            else:
                print(f"❌ TEST C.2 FAIL: Wrong activationError: {payment.get('activationError')}")
            
            if payment.get('activationResetAt'):
                print(f"✅ TEST C.3 PASS: activationResetAt is set")
            else:
                print(f"❌ TEST C.3 FAIL: activationResetAt not set")
            
            payment_reset = True
            break
    
    if not payment_reset:
        print(f"❌ TEST C.1 FAIL: Payment status not changed after {max_polls * poll_interval}s")
    
    # Check admin_logs for stale_payment_lock_reset entry
    print(f"\n4. Verify admin_logs has 'stale_payment_lock_reset' entry")
    log_entry = db.admin_logs.find_one({"type": "stale_payment_lock_reset", "paymentId": fake_payment_id})
    if log_entry:
        print(f"✅ TEST C.4 PASS: Admin log entry found")
        print(f"   orderId: {log_entry.get('orderId')}")
        print(f"   userId: {log_entry.get('userId')}")
        print(f"   lockedSinceMs: {log_entry.get('lockedSinceMs')}")
    else:
        print(f"❌ TEST C.4 FAIL: Admin log entry not found")
    
    # Cleanup: delete fake payment
    db.payments.delete_one({"id": fake_payment_id})
    print(f"\n✅ Cleanup: Deleted fake payment")

except Exception as e:
    print(f"❌ TEST C EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*80)
print("TEST D: AUTO-EXPIRE (no scheduled downgrade)")
print("="*80)

try:
    # Restore user to active yearly with past expiry
    print(f"1. Set premium user to active with expiryDate 1 hour ago")
    past_expiry = datetime.now() - timedelta(hours=1)
    result = db.users.update_one(
        {"id": premium_user_id},
        {"$set": {
            "subscription.expiryDate": past_expiry,
            "subscription.status": "active"
        },
        "$unset": {
            "subscription.scheduledDowngrade": ""
        }}
    )
    print(f"✅ Set expiryDate to: {past_expiry}")
    print(f"   Status: active (stale)")
    
    # Hit GET /auth/me to trigger reconciler
    print(f"\n2. Hit GET /auth/me to trigger reconciler")
    time.sleep(0.5)
    premium_user = get_me(premium_token)
    
    # Check if status changed to expired
    new_status = premium_user.get('subscription', {}).get('status')
    expired_at = premium_user.get('subscription', {}).get('expiredAt')
    
    print(f"\n3. Verify subscription status changed to 'expired'")
    print(f"   Status: {new_status}")
    print(f"   expiredAt: {expired_at}")
    
    if new_status == 'expired':
        print(f"✅ TEST D.1 PASS: Status changed to 'expired'")
    else:
        print(f"❌ TEST D.1 FAIL: Status not changed, got {new_status}")
    
    if expired_at:
        # Check if expiredAt is recent
        expired_dt = datetime.fromisoformat(expired_at.replace('Z', '+00:00')) if isinstance(expired_at, str) else expired_at
        expired_age = (datetime.now() - expired_dt.replace(tzinfo=None)).total_seconds()
        if expired_age < 10:
            print(f"✅ TEST D.2 PASS: expiredAt is recent (age: {expired_age:.2f}s)")
        else:
            print(f"❌ TEST D.2 FAIL: expiredAt not recent, age: {expired_age}s")
    else:
        print(f"❌ TEST D.2 FAIL: expiredAt not set")

except Exception as e:
    print(f"❌ TEST D EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*80)
print("TEST E: NO REGRESSION")
print("="*80)

try:
    # Restore user to active yearly
    print(f"1. Restore premium user to active Yearly")
    yearly_plan = next((p for p in plans if 'yearly' in p.get('id', '').lower() or p.get('days') == 365), None)
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
    
    # Get quote for same plan (renewal)
    print(f"\n2. GET /api/plans/quote for same plan (renewal)")
    quote = get_plans_quote(premium_token, yearly_plan.get('id'))
    
    if quote:
        print(f"✅ Quote response: {json.dumps(quote, indent=2, default=str)}")
        
        if quote.get('action') == 'renew':
            print(f"✅ TEST E.1 PASS: Quote action is 'renew'")
        else:
            print(f"❌ TEST E.1 FAIL: Quote action is not 'renew', got {quote.get('action')}")
        
        if quote.get('amount') and quote.get('amount') > 0:
            print(f"✅ TEST E.2 PASS: Quote has valid amount: ₹{quote.get('amount')}")
        else:
            print(f"❌ TEST E.2 FAIL: Quote amount invalid: {quote.get('amount')}")
    else:
        print(f"❌ TEST E.1 FAIL: Failed to get quote")
    
    # Try to schedule downgrade with same plan (should fail)
    print(f"\n3. POST /subscription/schedule-downgrade with same plan (should fail)")
    try:
        resp = schedule_downgrade(premium_token, yearly_plan.get('id'))
        
        if resp and resp.status_code == 400:
            data = resp.json()
            if data.get('code') == 'NOT_A_DOWNGRADE':
                print(f"✅ TEST E.3 PASS: Returns 400 with NOT_A_DOWNGRADE")
            else:
                print(f"❌ TEST E.3 FAIL: Wrong error code: {data.get('code')}")
        else:
            print(f"❌ TEST E.3 FAIL: Expected 400, got {resp.status_code if resp else 'No response'}")
    except Exception as e:
        print(f"❌ TEST E.3 FAIL: Exception: {e}")
    
    # Try to schedule downgrade with bogus planId (should fail)
    print(f"\n4. POST /subscription/schedule-downgrade with bogus planId (should fail)")
    try:
        resp = schedule_downgrade(premium_token, "plan-bogus-999")
        
        if resp and resp.status_code == 400:
            print(f"✅ TEST E.4 PASS: Returns 400 for bogus planId")
        else:
            print(f"❌ TEST E.4 FAIL: Expected 400, got {resp.status_code if resp else 'No response'}")
    except Exception as e:
        print(f"❌ TEST E.4 FAIL: Exception: {e}")
    
    # Try to schedule downgrade without auth (should fail)
    print(f"\n5. POST /subscription/schedule-downgrade without auth (should fail)")
    resp = requests.post(
        f"{BASE_URL}/subscription/schedule-downgrade",
        json={"planId": cheapest_plan.get('id')},
        timeout=10
    )
    
    if resp.status_code == 401:
        print(f"✅ TEST E.5 PASS: Returns 401 without auth")
    else:
        print(f"❌ TEST E.5 FAIL: Expected 401, got {resp.status_code}")

except Exception as e:
    print(f"❌ TEST E EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

# Cleanup: restore original subscription
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
    
    # Delete any test admin logs
    result = db.admin_logs.delete_many({
        "userId": premium_user_id,
        "type": {"$in": ["downgrade_activated", "downgrade_cancelled", "downgrade_scheduled", "stale_payment_lock_reset"]}
    })
    print(f"✅ Deleted {result.deleted_count} test admin log entries")
    
except Exception as e:
    print(f"❌ Cleanup error: {e}")

print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
print("✅ All tests completed. Check results above for PASS/FAIL status.")
print("="*80)
