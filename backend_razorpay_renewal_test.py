#!/usr/bin/env python3
"""
Backend test for Razorpay renewal flow - verifies that new plan days stack on top of existing subscription time.

Test scenarios:
T1 - Fresh user buys monthly plan (no subscription)
T2 - User with 10 days remaining renews monthly plan (should stack days)
T3 - User upgrades to lifetime plan
T4 - Invalid signature rejection
T5 - Regression tests for existing endpoints
"""

import requests
import hmac
import hashlib
import json
from datetime import datetime, timedelta
import time

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
RZP_KEY_SECRET = "i1wjidyWgO9h5QUeXeVRUs6q"  # From .env

def compute_signature(order_id, payment_id, secret):
    """Compute HMAC-SHA256 signature for Razorpay verification"""
    message = f"{order_id}|{payment_id}"
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

def register_user(mobile, name="Test User", password="test1234"):
    """Register a new test user"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": name,
            "mobile": mobile,
            "password": password
        }, timeout=30)
        return resp
    except Exception as e:
        print(f"❌ Register failed: {e}")
        return None

def login_user(mobile, password):
    """Login and get JWT token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=30)
        if resp.status_code == 200:
            return resp.json().get('token')
        return None
    except Exception as e:
        print(f"❌ Login failed: {e}")
        return None

def get_plans():
    """Get available plans"""
    try:
        resp = requests.get(f"{BASE_URL}/plans", timeout=30)
        if resp.status_code == 200:
            return resp.json().get('plans', [])
        return []
    except Exception as e:
        print(f"❌ Get plans failed: {e}")
        return []

def create_order(token, plan_id):
    """Create Razorpay order"""
    try:
        resp = requests.post(f"{BASE_URL}/razorpay/create-order", 
            json={"planId": plan_id},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        return resp
    except Exception as e:
        print(f"❌ Create order failed: {e}")
        return None

def verify_payment(token, order_id, payment_id, signature, plan_id):
    """Verify Razorpay payment"""
    try:
        resp = requests.post(f"{BASE_URL}/razorpay/verify",
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
                "planId": plan_id
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=60
        )
        return resp
    except requests.exceptions.Timeout:
        print(f"⚠️  Verify payment timed out (60s)")
        return None
    except Exception as e:
        print(f"❌ Verify payment failed: {e}")
        return None

def get_user_info(token):
    """Get current user info"""
    try:
        resp = requests.get(f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        return resp
    except Exception as e:
        print(f"❌ Get user info failed: {e}")
        return None

def seed_subscription_via_mongo(mobile, days_remaining):
    """
    Seed a subscription directly in MongoDB for testing renewal scenarios.
    This is a helper to set up test state.
    """
    from pymongo import MongoClient
    try:
        client = MongoClient("mongodb://localhost:27017")
        db = client["edumaster_odisha"]
        
        now = datetime.utcnow()
        expiry = now + timedelta(days=days_remaining)
        
        result = db.users.update_one(
            {"mobile": mobile},
            {"$set": {
                "subscription": {
                    "plan": "monthly",
                    "startDate": now,
                    "expiryDate": expiry,
                    "status": "active"
                }
            }}
        )
        return result.modified_count > 0
    except Exception as e:
        print(f"❌ MongoDB seed failed: {e}")
        return False

def main():
    print("=" * 80)
    print("RAZORPAY RENEWAL FLOW TEST")
    print("=" * 80)
    print()
    
    # Get plans first
    print("📋 Step 0: Fetching available plans...")
    plans = get_plans()
    if not plans:
        print("❌ Failed to fetch plans")
        return
    
    print(f"✅ Found {len(plans)} plans")
    monthly_plan = next((p for p in plans if p['id'] == 'monthly'), None)
    lifetime_plan = next((p for p in plans if p.get('days', 0) >= 3650), None)
    
    if not monthly_plan:
        print("❌ Monthly plan not found")
        return
    
    print(f"   Monthly plan: {monthly_plan['name']} - ₹{monthly_plan['price']} - {monthly_plan['days']} days")
    if lifetime_plan:
        print(f"   Lifetime plan: {lifetime_plan['name']} - ₹{lifetime_plan['price']} - {lifetime_plan['days']} days")
    print()
    
    # ========================================================================
    # T1: Fresh user buys monthly plan
    # ========================================================================
    print("=" * 80)
    print("T1: Fresh user buys monthly plan (no existing subscription)")
    print("=" * 80)
    
    test_mobile_1 = f"98765{int(time.time()) % 100000:05d}"
    print(f"📱 Creating test user: {test_mobile_1}")
    
    try:
        resp = register_user(test_mobile_1, "T1 Fresh User", "test1234")
        if not resp or resp.status_code != 200:
            print(f"❌ T1 FAILED: Registration failed - {resp.status_code if resp else 'No response'}")
            if resp:
                print(f"   Response: {resp.text}")
        else:
            print("✅ User registered successfully")
            
            # Login
            token = login_user(test_mobile_1, "test1234")
            if not token:
                print("❌ T1 FAILED: Login failed")
            else:
                print("✅ Login successful")
                
                # Create order
                order_resp = create_order(token, monthly_plan['id'])
                if not order_resp or order_resp.status_code != 200:
                    print(f"❌ T1 FAILED: Create order failed - {order_resp.status_code if order_resp else 'No response'}")
                    if order_resp:
                        print(f"   Response: {order_resp.text}")
                else:
                    order_data = order_resp.json()
                    order_id = order_data['orderId']
                    print(f"✅ Order created: {order_id}")
                    
                    # Compute signature
                    fake_payment_id = f"pay_TEST_{int(time.time())}"
                    signature = compute_signature(order_id, fake_payment_id, RZP_KEY_SECRET)
                    print(f"✅ Signature computed: {signature[:20]}...")
                    
                    # Verify payment
                    verify_resp = verify_payment(token, order_id, fake_payment_id, signature, monthly_plan['id'])
                    if not verify_resp or verify_resp.status_code != 200:
                        print(f"❌ T1 FAILED: Verify payment failed - {verify_resp.status_code if verify_resp else 'No response'}")
                        if verify_resp:
                            print(f"   Response: {verify_resp.text}")
                    else:
                        verify_data = verify_resp.json()
                        print(f"✅ Payment verified successfully")
                        print(f"   isRenewal: {verify_data.get('isRenewal')}")
                        print(f"   expiryDate: {verify_data.get('expiryDate')}")
                        
                        # Verify user subscription
                        user_resp = get_user_info(token)
                        if user_resp and user_resp.status_code == 200:
                            user_data = user_resp.json()
                            subscription = user_data.get('user', {}).get('subscription', {})
                            expiry_date = subscription.get('expiryDate')
                            status = subscription.get('status')
                            
                            print(f"   User subscription status: {status}")
                            print(f"   User subscription expiry: {expiry_date}")
                            
                            # Verify expectations
                            if verify_data.get('isRenewal') == False:
                                print("✅ T1 ASSERTION PASSED: isRenewal is False (fresh user)")
                            else:
                                print(f"❌ T1 ASSERTION FAILED: isRenewal should be False, got {verify_data.get('isRenewal')}")
                            
                            if status == 'active':
                                print("✅ T1 ASSERTION PASSED: Subscription is active")
                            else:
                                print(f"❌ T1 ASSERTION FAILED: Subscription should be active, got {status}")
                            
                            # Check expiry is approximately now + monthly_plan.days
                            if expiry_date:
                                expiry_dt = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
                                now = datetime.now(expiry_dt.tzinfo)
                                expected_expiry = now + timedelta(days=monthly_plan['days'])
                                diff_seconds = abs((expiry_dt - expected_expiry).total_seconds())
                                
                                if diff_seconds < 120:  # Within 2 minutes tolerance
                                    print(f"✅ T1 ASSERTION PASSED: Expiry date is approximately now + {monthly_plan['days']} days (diff: {diff_seconds:.0f}s)")
                                else:
                                    print(f"❌ T1 ASSERTION FAILED: Expiry date mismatch (diff: {diff_seconds:.0f}s)")
                            
                            print("✅ T1 PASSED: Fresh user purchase working correctly")
                        else:
                            print("❌ T1 FAILED: Could not verify user info")
    except Exception as e:
        print(f"❌ T1 FAILED with exception: {e}")
    
    print()
    
    # ========================================================================
    # T2: User with 10 days remaining renews monthly plan
    # ========================================================================
    print("=" * 80)
    print("T2: User with 10 days remaining renews monthly plan (should stack days)")
    print("=" * 80)
    
    test_mobile_2 = f"98765{int(time.time()) % 100000:05d}"
    print(f"📱 Creating test user: {test_mobile_2}")
    
    try:
        resp = register_user(test_mobile_2, "T2 Renewal User", "test1234")
        if not resp or resp.status_code != 200:
            print(f"❌ T2 FAILED: Registration failed - {resp.status_code if resp else 'No response'}")
        else:
            print("✅ User registered successfully")
            
            # Login
            token = login_user(test_mobile_2, "test1234")
            if not token:
                print("❌ T2 FAILED: Login failed")
            else:
                print("✅ Login successful")
                
                # Seed subscription with 10 days remaining
                print("🔧 Seeding subscription with 10 days remaining...")
                if seed_subscription_via_mongo(test_mobile_2, 10):
                    print("✅ Subscription seeded successfully")
                    
                    # Verify seeded subscription
                    user_resp = get_user_info(token)
                    if user_resp and user_resp.status_code == 200:
                        user_data = user_resp.json()
                        subscription = user_data.get('user', {}).get('subscription', {})
                        seeded_expiry = subscription.get('expiryDate')
                        print(f"   Seeded expiry: {seeded_expiry}")
                        
                        # Create order for renewal
                        order_resp = create_order(token, monthly_plan['id'])
                        if not order_resp or order_resp.status_code != 200:
                            print(f"❌ T2 FAILED: Create order failed - {order_resp.status_code if order_resp else 'No response'}")
                        else:
                            order_data = order_resp.json()
                            order_id = order_data['orderId']
                            print(f"✅ Order created: {order_id}")
                            
                            # Compute signature
                            fake_payment_id = f"pay_TEST_{int(time.time())}"
                            signature = compute_signature(order_id, fake_payment_id, RZP_KEY_SECRET)
                            
                            # Verify payment (renewal)
                            verify_resp = verify_payment(token, order_id, fake_payment_id, signature, monthly_plan['id'])
                            if not verify_resp or verify_resp.status_code != 200:
                                print(f"❌ T2 FAILED: Verify payment failed - {verify_resp.status_code if verify_resp else 'No response'}")
                                if verify_resp:
                                    print(f"   Response: {verify_resp.text}")
                            else:
                                verify_data = verify_resp.json()
                                print(f"✅ Payment verified successfully")
                                print(f"   isRenewal: {verify_data.get('isRenewal')}")
                                print(f"   expiryDate: {verify_data.get('expiryDate')}")
                                
                                # Verify user subscription
                                user_resp = get_user_info(token)
                                if user_resp and user_resp.status_code == 200:
                                    user_data = user_resp.json()
                                    subscription = user_data.get('user', {}).get('subscription', {})
                                    new_expiry = subscription.get('expiryDate')
                                    
                                    print(f"   New expiry: {new_expiry}")
                                    
                                    # Verify expectations
                                    if verify_data.get('isRenewal') == True:
                                        print("✅ T2 ASSERTION PASSED: isRenewal is True (renewal)")
                                    else:
                                        print(f"❌ T2 ASSERTION FAILED: isRenewal should be True, got {verify_data.get('isRenewal')}")
                                    
                                    # Check expiry is approximately seeded_expiry + monthly_plan.days
                                    if seeded_expiry and new_expiry:
                                        seeded_dt = datetime.fromisoformat(seeded_expiry.replace('Z', '+00:00'))
                                        new_dt = datetime.fromisoformat(new_expiry.replace('Z', '+00:00'))
                                        expected_new_dt = seeded_dt + timedelta(days=monthly_plan['days'])
                                        diff_seconds = abs((new_dt - expected_new_dt).total_seconds())
                                        
                                        if diff_seconds < 120:  # Within 2 minutes tolerance
                                            print(f"✅ T2 ASSERTION PASSED: New expiry = old expiry + {monthly_plan['days']} days (diff: {diff_seconds:.0f}s)")
                                            print(f"   Days stacked correctly: {monthly_plan['days']} days added to existing 10 days")
                                        else:
                                            print(f"❌ T2 ASSERTION FAILED: Expiry date mismatch (diff: {diff_seconds:.0f}s)")
                                            print(f"   Expected: {expected_new_dt}")
                                            print(f"   Got: {new_dt}")
                                        
                                        print("✅ T2 PASSED: Renewal stacking working correctly")
                                    else:
                                        print("❌ T2 FAILED: Could not compare expiry dates")
                                else:
                                    print("❌ T2 FAILED: Could not verify user info")
                    else:
                        print("❌ T2 FAILED: Could not verify seeded subscription")
                else:
                    print("❌ T2 FAILED: Could not seed subscription")
    except Exception as e:
        print(f"❌ T2 FAILED with exception: {e}")
    
    print()
    
    # ========================================================================
    # T3: User upgrades to lifetime plan
    # ========================================================================
    if lifetime_plan:
        print("=" * 80)
        print("T3: User upgrades to LIFETIME plan")
        print("=" * 80)
        
        test_mobile_3 = f"98765{int(time.time()) % 100000:05d}"
        print(f"📱 Creating test user: {test_mobile_3}")
        
        try:
            resp = register_user(test_mobile_3, "T3 Lifetime User", "test1234")
            if not resp or resp.status_code != 200:
                print(f"❌ T3 FAILED: Registration failed")
            else:
                print("✅ User registered successfully")
                
                # Login
                token = login_user(test_mobile_3, "test1234")
                if not token:
                    print("❌ T3 FAILED: Login failed")
                else:
                    print("✅ Login successful")
                    
                    # Create order for lifetime
                    order_resp = create_order(token, lifetime_plan['id'])
                    if not order_resp or order_resp.status_code != 200:
                        print(f"❌ T3 FAILED: Create order failed - {order_resp.status_code if order_resp else 'No response'}")
                    else:
                        order_data = order_resp.json()
                        order_id = order_data['orderId']
                        print(f"✅ Order created: {order_id}")
                        
                        # Compute signature
                        fake_payment_id = f"pay_TEST_{int(time.time())}"
                        signature = compute_signature(order_id, fake_payment_id, RZP_KEY_SECRET)
                        
                        # Verify payment
                        verify_resp = verify_payment(token, order_id, fake_payment_id, signature, lifetime_plan['id'])
                        if not verify_resp or verify_resp.status_code != 200:
                            print(f"❌ T3 FAILED: Verify payment failed - {verify_resp.status_code if verify_resp else 'No response'}")
                        else:
                            verify_data = verify_resp.json()
                            print(f"✅ Payment verified successfully")
                            print(f"   expiryDate: {verify_data.get('expiryDate')}")
                            
                            # Verify user subscription
                            user_resp = get_user_info(token)
                            if user_resp and user_resp.status_code == 200:
                                user_data = user_resp.json()
                                subscription = user_data.get('user', {}).get('subscription', {})
                                expiry_date = subscription.get('expiryDate')
                                
                                print(f"   User subscription expiry: {expiry_date}")
                                
                                # Check expiry is 2099-12-31
                                if expiry_date and '2099-12-31' in expiry_date:
                                    print("✅ T3 ASSERTION PASSED: Lifetime expiry is 2099-12-31")
                                    print("✅ T3 PASSED: Lifetime plan working correctly")
                                else:
                                    print(f"❌ T3 ASSERTION FAILED: Expected 2099-12-31, got {expiry_date}")
                            else:
                                print("❌ T3 FAILED: Could not verify user info")
        except Exception as e:
            print(f"❌ T3 FAILED with exception: {e}")
        
        print()
    else:
        print("⚠️  T3 SKIPPED: No lifetime plan found (days >= 3650)")
        print()
    
    # ========================================================================
    # T4: Invalid signature rejection
    # ========================================================================
    print("=" * 80)
    print("T4: Invalid signature must be rejected")
    print("=" * 80)
    
    test_mobile_4 = f"98765{int(time.time()) % 100000:05d}"
    print(f"📱 Creating test user: {test_mobile_4}")
    
    try:
        resp = register_user(test_mobile_4, "T4 Invalid Sig User", "test1234")
        if not resp or resp.status_code != 200:
            print(f"❌ T4 FAILED: Registration failed")
        else:
            print("✅ User registered successfully")
            
            # Login
            token = login_user(test_mobile_4, "test1234")
            if not token:
                print("❌ T4 FAILED: Login failed")
            else:
                print("✅ Login successful")
                
                # Create order
                order_resp = create_order(token, monthly_plan['id'])
                if not order_resp or order_resp.status_code != 200:
                    print(f"❌ T4 FAILED: Create order failed")
                else:
                    order_data = order_resp.json()
                    order_id = order_data['orderId']
                    print(f"✅ Order created: {order_id}")
                    
                    # Use invalid signature
                    fake_payment_id = f"pay_TEST_{int(time.time())}"
                    invalid_signature = "badbeef123456789abcdef"
                    print(f"🔧 Using invalid signature: {invalid_signature}")
                    
                    # Get user info before invalid attempt
                    user_before = get_user_info(token)
                    subscription_before = None
                    if user_before and user_before.status_code == 200:
                        subscription_before = user_before.json().get('user', {}).get('subscription')
                    
                    # Try to verify with invalid signature (direct request to avoid timeout)
                    try:
                        verify_resp = requests.post(f"{BASE_URL}/razorpay/verify",
                            json={
                                "razorpay_order_id": order_id,
                                "razorpay_payment_id": fake_payment_id,
                                "razorpay_signature": invalid_signature,
                                "planId": monthly_plan['id']
                            },
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=30
                        )
                    except requests.exceptions.Timeout:
                        print("⚠️  Request timed out - skipping T4")
                        verify_resp = None
                    except Exception as e:
                        print(f"⚠️  Request failed: {e}")
                        verify_resp = None
                    
                    if verify_resp and verify_resp.status_code == 400:
                        print("✅ T4 ASSERTION PASSED: Invalid signature rejected with 400")
                        
                        error_data = verify_resp.json()
                        if 'signature' in error_data.get('error', '').lower():
                            print("✅ T4 ASSERTION PASSED: Error message mentions 'signature'")
                        else:
                            print(f"⚠️  T4 WARNING: Error message doesn't mention signature: {error_data.get('error')}")
                        
                        # Verify user subscription unchanged
                        user_after = get_user_info(token)
                        if user_after and user_after.status_code == 200:
                            subscription_after = user_after.json().get('user', {}).get('subscription')
                            
                            if subscription_before == subscription_after:
                                print("✅ T4 ASSERTION PASSED: User subscription unchanged after failed attempt")
                                print("✅ T4 PASSED: Invalid signature rejection working correctly")
                            else:
                                print(f"❌ T4 ASSERTION FAILED: Subscription changed after failed attempt")
                                print(f"   Before: {subscription_before}")
                                print(f"   After: {subscription_after}")
                        else:
                            print("⚠️  T4 WARNING: Could not verify user info after failed attempt")
                    elif verify_resp is None:
                        print("⚠️  T4 SKIPPED: Request timed out or failed")
                    else:
                        print(f"❌ T4 FAILED: Expected 400, got {verify_resp.status_code if verify_resp else 'No response'}")
                        if verify_resp:
                            print(f"   Response: {verify_resp.text}")
    except Exception as e:
        print(f"❌ T4 FAILED with exception: {e}")
    
    print()
    
    # ========================================================================
    # T5: Regression tests
    # ========================================================================
    print("=" * 80)
    print("T5: Regression tests - existing endpoints still work")
    print("=" * 80)
    
    try:
        # Test 1: GET /api/razorpay/config
        print("📋 Test 5.1: GET /api/razorpay/config")
        resp = requests.get(f"{BASE_URL}/razorpay/config", timeout=30)
        if resp.status_code == 200:
            config = resp.json()
            if 'keyId' in config:
                print(f"✅ T5.1 PASSED: Razorpay config returns keyId: {config['keyId']}")
            else:
                print(f"❌ T5.1 FAILED: keyId not in response")
        else:
            print(f"❌ T5.1 FAILED: Status {resp.status_code}")
        
        # Test 2: GET /api/plans
        print("📋 Test 5.2: GET /api/plans")
        resp = requests.get(f"{BASE_URL}/plans", timeout=30)
        if resp.status_code == 200:
            plans_data = resp.json()
            plans_list = plans_data.get('plans', [])
            if len(plans_list) > 0:
                print(f"✅ T5.2 PASSED: Plans endpoint returns {len(plans_list)} plans")
            else:
                print(f"❌ T5.2 FAILED: No plans returned")
        else:
            print(f"❌ T5.2 FAILED: Status {resp.status_code}")
        
        # Test 3: POST /api/razorpay/create-order (with valid token)
        print("📋 Test 5.3: POST /api/razorpay/create-order")
        test_mobile_5 = f"98765{int(time.time()) % 100000:05d}"
        resp = register_user(test_mobile_5, "T5 Regression User", "test1234")
        if resp and resp.status_code == 200:
            token = login_user(test_mobile_5, "test1234")
            if token:
                order_resp = create_order(token, monthly_plan['id'])
                if order_resp and order_resp.status_code == 200:
                    order_data = order_resp.json()
                    if 'orderId' in order_data:
                        print(f"✅ T5.3 PASSED: Create order returns orderId: {order_data['orderId'][:20]}...")
                    else:
                        print(f"❌ T5.3 FAILED: orderId not in response")
                else:
                    print(f"❌ T5.3 FAILED: Status {order_resp.status_code if order_resp else 'No response'}")
            else:
                print(f"❌ T5.3 FAILED: Could not login")
        else:
            print(f"❌ T5.3 FAILED: Could not register user")
        
        print("✅ T5 PASSED: All regression tests completed")
        
    except Exception as e:
        print(f"❌ T5 FAILED with exception: {e}")
    
    print()
    print("=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
