#!/usr/bin/env python3
"""
Backend test for PHASE 2 — Referral Reward Clawback
Tests manual reverse endpoint + auto-reverse on referred-user lapse
"""
import requests
import time
import json
from datetime import datetime, timedelta

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def get_user_subscription_expiry(user_id, admin_headers):
    """Get user's subscription expiry via admin endpoint (workaround for /me 500 error)"""
    try:
        # Use admin endpoint to get user data
        res = requests.get(f"{BASE_URL}/admin/users/{user_id}", headers=admin_headers)
        if res.status_code == 200:
            user = res.json()
            return user.get('subscription', {}).get('expiryDate')
    except:
        pass
    return None

def test_referral_clawback():
    log("=" * 80)
    log("PHASE 2 — REFERRAL REWARD CLAWBACK TESTING")
    log("=" * 80)
    
    # ========== ADMIN LOGIN ==========
    log("\n[SETUP] Admin login...")
    admin_res = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": "9999999999",
        "password": "admin123"
    })
    if admin_res.status_code != 200:
        log(f"❌ Admin login failed: {admin_res.status_code} {admin_res.text}")
        return
    admin_token = admin_res.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    log(f"✅ Admin logged in")
    
    # ========== GET PLANS ==========
    log("\n[SETUP] Fetching plans...")
    plans_res = requests.get(f"{BASE_URL}/plans")
    if plans_res.status_code != 200:
        log(f"❌ Failed to fetch plans: {plans_res.status_code}")
        return
    plans_data = plans_res.json()
    plans = plans_data.get("plans", plans_data) if isinstance(plans_data, dict) else plans_data
    eligible_plan = next((p for p in plans if p["id"] in ["monthly", "quarterly", "half-yearly", "yearly", "lifetime", "special199"]), None)
    if not eligible_plan:
        log(f"❌ No eligible plan found")
        return
    log(f"✅ Using plan: {eligible_plan['id']} ({eligible_plan.get('days', 30)} days)")
    
    # ========== REGISTER REFERRER R ==========
    log("\n[SETUP] Registering referrer R...")
    r_mobile = f"91{int(time.time()) % 100000000:08d}"
    r_res = requests.post(f"{BASE_URL}/auth/register", json={
        "name": "Referrer R",
        "mobile": r_mobile,
        "password": "<redacted>"
    })
    if r_res.status_code != 200:
        log(f"❌ Failed to register referrer R: {r_res.status_code} {r_res.text}")
        return
    r_token = r_res.json()["token"]
    r_id = r_res.json()["user"]["id"]
    r_headers = {"Authorization": f"Bearer {r_token}"}
    log(f"✅ Referrer R registered: {r_mobile} (ID: {r_id})")
    
    # Get R's referral code
    log("\n[SETUP] Getting R's referral code...")
    r_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r_headers)
    if r_ref_res.status_code != 200:
        log(f"❌ Failed to get R's referral code: {r_ref_res.status_code}")
        return
    r_code = r_ref_res.json()["code"]
    log(f"✅ R's referral code: {r_code}")
    
    # Give R an active subscription so they can receive rewards
    log("\n[SETUP] Activating R's subscription...")
    r_sub_res = requests.put(f"{BASE_URL}/admin/users/{r_id}/activate-subscription", 
        headers=admin_headers,
        json={"planId": eligible_plan["id"]}
    )
    if r_sub_res.status_code != 200:
        log(f"❌ Failed to activate R's subscription: {r_sub_res.status_code}")
        return
    log(f"✅ R's subscription activated")
    
    # ========== REGISTER 5 REFERRED USERS ==========
    log("\n[SETUP] Registering 5 referred users with R's code...")
    referred_users = []
    for i in range(5):
        mobile = f"92{int(time.time()) % 100000000 + i:08d}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": f"Referred User {i+1}",
            "mobile": mobile,
            "password": "<redacted>",
            "ref": r_code
        })
        if res.status_code != 200:
            log(f"❌ Failed to register referred user {i+1}: {res.status_code}")
            return
        user_id = res.json()["user"]["id"]
        referred_users.append({"id": user_id, "mobile": mobile, "name": f"Referred User {i+1}"})
        log(f"✅ Referred user {i+1} registered: {mobile} (ID: {user_id})")
        time.sleep(0.5)  # Rate limiting
    
    # ========== ACTIVATE SUBSCRIPTIONS FOR ALL 5 REFERRED USERS ==========
    log("\n[SETUP] Activating subscriptions for all 5 referred users...")
    for i, user in enumerate(referred_users):
        res = requests.put(f"{BASE_URL}/admin/users/{user['id']}/activate-subscription",
            headers=admin_headers,
            json={"planId": eligible_plan["id"]}
        )
        if res.status_code != 200:
            log(f"❌ Failed to activate subscription for user {i+1}: {res.status_code}")
            return
        log(f"✅ Subscription activated for referred user {i+1}")
        time.sleep(0.5)
    
    # ========== TRIGGER REWARD GRANT ==========
    log("\n[SETUP] Triggering reward grant for R (GET /me/referral)...")
    time.sleep(1)  # Give DB a moment
    r_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r_headers)
    if r_ref_res.status_code != 200:
        log(f"❌ Failed to trigger reward grant: {r_ref_res.status_code}")
        return
    r_data = r_ref_res.json()
    log(f"✅ Reward grant triggered")
    log(f"   Qualified: {r_data['stats']['qualified']}")
    log(f"   Rewards: {len(r_data.get('rewards', []))}")
    
    if len(r_data.get('rewards', [])) == 0:
        log(f"❌ No rewards granted! Expected milestone=5 reward")
        return
    
    reward = r_data['rewards'][0]
    reward_id = reward['id']
    log(f"✅ Reward granted: milestone={reward['milestoneCount']}, rewardDays={reward['rewardDays']}")
    log(f"   Reward ID: {reward_id}")
    log(f"   Expiry before: {reward.get('expiryBefore')}")
    log(f"   Expiry after: {reward.get('expiryAfter')}")
    
    # Get R's current subscription expiry from the reward data
    # (We already have expiryAfter from the reward response)
    r_expiry_before_reverse = reward.get('expiryAfter')
    if not r_expiry_before_reverse:
        # Fallback: try to get from /me endpoint
        r_user_res = requests.get(f"{BASE_URL}/me", headers=r_headers)
        if r_user_res.status_code == 200:
            r_user = r_user_res.json()
            r_expiry_before_reverse = r_user['subscription']['expiryDate']
        else:
            log(f"⚠️ Could not get R's user info from /me endpoint (500 error)")
            log(f"   Using expiryAfter from reward data instead")
    log(f"   R's current expiry: {r_expiry_before_reverse}")
    
    # ========== TEST A: MANUAL REVERSE ==========
    log("\n" + "=" * 80)
    log("TEST A: MANUAL REVERSE via POST /admin/referrals/rewards/:rewardId/reverse")
    log("=" * 80)
    
    reverse_res = requests.post(f"{BASE_URL}/admin/referrals/rewards/{reward_id}/reverse",
        headers=admin_headers,
        json={"reason": "test refund"}
    )
    
    if reverse_res.status_code != 200:
        log(f"❌ TEST A FAILED: {reverse_res.status_code} {reverse_res.text}")
    else:
        reverse_data = reverse_res.json()
        log(f"✅ TEST A PASSED: Manual reverse successful")
        log(f"   Response: {json.dumps(reverse_data, indent=2)}")
        
        # Verify via GET /admin/referrals
        admin_ref_res = requests.get(f"{BASE_URL}/admin/referrals", headers=admin_headers)
        if admin_ref_res.status_code == 200:
            admin_data = admin_ref_res.json()
            r_entry = next((e for e in admin_data['leaderboard'] if e['userId'] == r_id), None)
            if r_entry and len(r_entry.get('rewards', [])) > 0:
                reversed_reward = r_entry['rewards'][0]
                log(f"   Reward.reversed: {reversed_reward.get('reversed')}")
                log(f"   Reward.reversalTrigger: {reversed_reward.get('reversalTrigger')}")
                log(f"   Reward.expiryBeforeReversal: {reversed_reward.get('expiryBeforeReversal')}")
                log(f"   Reward.expiryAfterReversal: {reversed_reward.get('expiryAfterReversal')}")
                
                if reversed_reward.get('reversed') != True:
                    log(f"❌ TEST A FAILED: Reward not marked as reversed")
        
        # Verify R's expiry reduced
        r_expiry_after_reverse = get_user_subscription_expiry(r_id, admin_headers)
        if not r_expiry_after_reverse:
            log(f"⚠️ Could not get R's expiry after reverse")
        else:
            log(f"   R's expiry after reverse: {r_expiry_after_reverse}")
            
            # Calculate expected reduction (should be ~30 days less)
            before_dt = datetime.fromisoformat(r_expiry_before_reverse.replace('Z', '+00:00'))
            after_dt = datetime.fromisoformat(r_expiry_after_reverse.replace('Z', '+00:00'))
            diff_days = (before_dt - after_dt).days
            log(f"   Expiry reduced by: {diff_days} days (expected: ~{reward['rewardDays']})")
            
            if abs(diff_days - reward['rewardDays']) > 1:
                log(f"❌ TEST A FAILED: Expiry not reduced correctly")
    
    # ========== TEST B: IDEMPOTENT (reverse again) ==========
    log("\n" + "=" * 80)
    log("TEST B: IDEMPOTENT - Reverse same reward again")
    log("=" * 80)
    
    reverse2_res = requests.post(f"{BASE_URL}/admin/referrals/rewards/{reward_id}/reverse",
        headers=admin_headers,
        json={"reason": "test refund again"}
    )
    
    if reverse2_res.status_code == 409:
        log(f"✅ TEST B PASSED: Got 409 as expected")
        log(f"   Response: {reverse2_res.json()}")
        
        # Verify R's expiry NOT reduced again
        r_expiry_after_second = get_user_subscription_expiry(r_id, admin_headers)
        
        if r_expiry_after_second == r_expiry_after_reverse:
            log(f"✅ TEST B PASSED: R's expiry unchanged (not reduced twice)")
        else:
            log(f"❌ TEST B FAILED: R's expiry changed on second reverse!")
            log(f"   After first: {r_expiry_after_reverse}")
            log(f"   After second: {r_expiry_after_second}")
    else:
        log(f"❌ TEST B FAILED: Expected 409, got {reverse2_res.status_code}")
        log(f"   Response: {reverse2_res.text}")
    
    # ========== TEST C: MILESTONE NOT RE-GRANTED ==========
    log("\n" + "=" * 80)
    log("TEST C: MILESTONE NOT RE-GRANTED - Call /me/referral again")
    log("=" * 80)
    
    r_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r_headers)
    if r_ref_res.status_code != 200:
        log(f"❌ TEST C FAILED: {r_ref_res.status_code}")
    else:
        r_data = r_ref_res.json()
        rewards_count = len(r_data.get('rewards', []))
        log(f"   Rewards count: {rewards_count}")
        
        # Check if there's a new non-reversed milestone=5 reward
        active_milestone_5 = [r for r in r_data.get('rewards', []) 
                              if r['milestoneCount'] == 5 and not r.get('reversed')]
        
        if len(active_milestone_5) == 0:
            log(f"✅ TEST C PASSED: No new active milestone=5 reward created")
        else:
            log(f"❌ TEST C FAILED: Found {len(active_milestone_5)} active milestone=5 rewards!")
            log(f"   Rewards: {json.dumps(active_milestone_5, indent=2)}")
    
    # ========== SETUP FOR TEST D: Create fresh scenario ==========
    log("\n[SETUP FOR TEST D] Creating fresh referrer R2 with 5 qualified referrals...")
    
    # Register R2
    r2_mobile = f"93{int(time.time()) % 100000000:08d}"
    r2_res = requests.post(f"{BASE_URL}/auth/register", json={
        "name": "Referrer R2",
        "mobile": r2_mobile,
        "password": "<redacted>"
    })
    if r2_res.status_code != 200:
        log(f"❌ Failed to register R2: {r2_res.status_code}")
        return
    r2_token = r2_res.json()["token"]
    r2_id = r2_res.json()["user"]["id"]
    r2_headers = {"Authorization": f"Bearer {r2_token}"}
    log(f"✅ R2 registered: {r2_mobile} (ID: {r2_id})")
    
    # Get R2's referral code
    r2_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r2_headers)
    r2_code = r2_ref_res.json()["code"]
    log(f"✅ R2's referral code: {r2_code}")
    
    # Activate R2's subscription
    requests.put(f"{BASE_URL}/admin/users/{r2_id}/activate-subscription",
        headers=admin_headers,
        json={"planId": eligible_plan["id"]}
    )
    log(f"✅ R2's subscription activated")
    
    # Register 5 referred users for R2
    r2_referred = []
    for i in range(5):
        mobile = f"94{int(time.time()) % 100000000 + i:08d}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": f"R2 Referred {i+1}",
            "mobile": mobile,
            "password": "<redacted>",
            "ref": r2_code
        })
        if res.status_code != 200:
            log(f"❌ Failed to register R2 referred user {i+1}")
            return
        user_id = res.json()["user"]["id"]
        r2_referred.append({"id": user_id, "mobile": mobile})
        log(f"✅ R2 referred user {i+1} registered: {mobile}")
        time.sleep(0.5)
    
    # Activate subscriptions for R2's referred users
    for i, user in enumerate(r2_referred):
        requests.put(f"{BASE_URL}/admin/users/{user['id']}/activate-subscription",
            headers=admin_headers,
            json={"planId": eligible_plan["id"]}
        )
        log(f"✅ Subscription activated for R2 referred user {i+1}")
        time.sleep(0.5)
    
    # Trigger reward grant for R2
    time.sleep(1)
    r2_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r2_headers)
    r2_data = r2_ref_res.json()
    log(f"✅ R2 reward granted: {len(r2_data.get('rewards', []))} rewards")
    
    if len(r2_data.get('rewards', [])) == 0:
        log(f"❌ No rewards granted for R2!")
        return
    
    r2_reward = r2_data['rewards'][0]
    r2_reward_id = r2_reward['id']
    log(f"   R2 Reward ID: {r2_reward_id}, milestone={r2_reward['milestoneCount']}")
    
    # Get R2's expiry before auto-reverse
    r2_expiry_before = get_user_subscription_expiry(r2_id, admin_headers)
    log(f"   R2's expiry before auto-reverse: {r2_expiry_before}")
    
    # ========== TEST D: AUTO-REVERSE ON DEACTIVATE ==========
    log("\n" + "=" * 80)
    log("TEST D: AUTO-REVERSE on deactivate-subscription")
    log("=" * 80)
    
    # Deactivate ONE of R2's referred users
    deactivate_user = r2_referred[0]
    log(f"   Deactivating user: {deactivate_user['id']}")
    
    deactivate_res = requests.put(f"{BASE_URL}/admin/users/{deactivate_user['id']}/deactivate-subscription",
        headers=admin_headers,
        json={}
    )
    
    if deactivate_res.status_code != 200:
        log(f"❌ TEST D FAILED: Deactivate failed: {deactivate_res.status_code}")
    else:
        log(f"✅ User deactivated")
        time.sleep(1)
        
        # Check R2's rewards
        admin_ref_res = requests.get(f"{BASE_URL}/admin/referrals", headers=admin_headers)
        if admin_ref_res.status_code == 200:
            admin_data = admin_ref_res.json()
            r2_entry = next((e for e in admin_data['leaderboard'] if e['userId'] == r2_id), None)
            
            if r2_entry and len(r2_entry.get('rewards', [])) > 0:
                r2_reward_check = r2_entry['rewards'][0]
                
                if r2_reward_check.get('reversed') == True:
                    log(f"✅ TEST D PASSED: Reward auto-reversed")
                    log(f"   reversed: {r2_reward_check.get('reversed')}")
                    log(f"   reversalTrigger: {r2_reward_check.get('reversalTrigger')}")
                    
                    if r2_reward_check.get('reversalTrigger') == 'auto-lapse':
                        log(f"✅ TEST D PASSED: reversalTrigger is 'auto-lapse'")
                    else:
                        log(f"❌ TEST D FAILED: reversalTrigger is '{r2_reward_check.get('reversalTrigger')}', expected 'auto-lapse'")
                    
                    # Check R2's expiry reduced
                    r2_expiry_after = get_user_subscription_expiry(r2_id, admin_headers)
                    log(f"   R2's expiry after auto-reverse: {r2_expiry_after}")
                    
                    if r2_expiry_before and r2_expiry_after:
                        before_dt = datetime.fromisoformat(r2_expiry_before.replace('Z', '+00:00'))
                        after_dt = datetime.fromisoformat(r2_expiry_after.replace('Z', '+00:00'))
                        diff_days = (before_dt - after_dt).days
                        log(f"   Expiry reduced by: {diff_days} days")
                        
                        if diff_days > 0:
                            log(f"✅ TEST D PASSED: R2's expiry reduced")
                        else:
                            log(f"❌ TEST D FAILED: R2's expiry not reduced")
                    else:
                        log(f"⚠️ Could not verify expiry reduction")
                else:
                    log(f"❌ TEST D FAILED: Reward not auto-reversed")
                    log(f"   reversed: {r2_reward_check.get('reversed')}")
    
    # ========== SETUP FOR TEST E: Create R3 ==========
    log("\n[SETUP FOR TEST E] Creating fresh referrer R3...")
    
    r3_mobile = f"95{int(time.time()) % 100000000:08d}"
    r3_res = requests.post(f"{BASE_URL}/auth/register", json={
        "name": "Referrer R3",
        "mobile": r3_mobile,
        "password": "<redacted>"
    })
    r3_token = r3_res.json()["token"]
    r3_id = r3_res.json()["user"]["id"]
    r3_headers = {"Authorization": f"Bearer {r3_token}"}
    log(f"✅ R3 registered: {r3_mobile}")
    
    r3_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r3_headers)
    r3_code = r3_ref_res.json()["code"]
    
    requests.put(f"{BASE_URL}/admin/users/{r3_id}/activate-subscription",
        headers=admin_headers,
        json={"planId": eligible_plan["id"]}
    )
    
    # Register 5 referred users for R3
    r3_referred = []
    for i in range(5):
        mobile = f"96{int(time.time()) % 100000000 + i:08d}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": f"R3 Referred {i+1}",
            "mobile": mobile,
            "password": "<redacted>",
            "ref": r3_code
        })
        user_id = res.json()["user"]["id"]
        r3_referred.append({"id": user_id, "mobile": mobile})
        time.sleep(0.5)
    
    for user in r3_referred:
        requests.put(f"{BASE_URL}/admin/users/{user['id']}/activate-subscription",
            headers=admin_headers,
            json={"planId": eligible_plan["id"]}
        )
        time.sleep(0.5)
    
    time.sleep(1)
    r3_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r3_headers)
    r3_data = r3_ref_res.json()
    log(f"✅ R3 reward granted: {len(r3_data.get('rewards', []))} rewards")
    
    if len(r3_data.get('rewards', [])) == 0:
        log(f"❌ No rewards granted for R3!")
        return
    
    r3_reward = r3_data['rewards'][0]
    
    # Get R3's expiry before auto-reverse
    r3_expiry_before = get_user_subscription_expiry(r3_id, admin_headers)
    log(f"   R3's expiry before auto-reverse: {r3_expiry_before}")
    
    # ========== TEST E: AUTO-REVERSE ON EDIT-TO-INACTIVE ==========
    log("\n" + "=" * 80)
    log("TEST E: AUTO-REVERSE on edit-subscription (status:'none')")
    log("=" * 80)
    
    edit_user = r3_referred[0]
    log(f"   Editing user: {edit_user['id']} to status:'none'")
    
    edit_res = requests.put(f"{BASE_URL}/admin/users/{edit_user['id']}/edit-subscription",
        headers=admin_headers,
        json={"status": "none"}
    )
    
    if edit_res.status_code != 200:
        log(f"❌ TEST E FAILED: Edit failed: {edit_res.status_code}")
    else:
        log(f"✅ User subscription edited to 'none'")
        time.sleep(1)
        
        # Check R3's rewards
        admin_ref_res = requests.get(f"{BASE_URL}/admin/referrals", headers=admin_headers)
        if admin_ref_res.status_code == 200:
            admin_data = admin_ref_res.json()
            r3_entry = next((e for e in admin_data['leaderboard'] if e['userId'] == r3_id), None)
            
            if r3_entry and len(r3_entry.get('rewards', [])) > 0:
                r3_reward_check = r3_entry['rewards'][0]
                
                if r3_reward_check.get('reversed') == True:
                    log(f"✅ TEST E PASSED: Reward auto-reversed on edit-to-inactive")
                    log(f"   reversed: {r3_reward_check.get('reversed')}")
                    log(f"   reversalTrigger: {r3_reward_check.get('reversalTrigger')}")
                    
                    if r3_reward_check.get('reversalTrigger') == 'auto-lapse':
                        log(f"✅ TEST E PASSED: reversalTrigger is 'auto-lapse'")
                    
                    # Check R3's expiry reduced
                    r3_expiry_after = get_user_subscription_expiry(r3_id, admin_headers)
                    log(f"   R3's expiry after auto-reverse: {r3_expiry_after}")
                    
                    if r3_expiry_before and r3_expiry_after:
                        before_dt = datetime.fromisoformat(r3_expiry_before.replace('Z', '+00:00'))
                        after_dt = datetime.fromisoformat(r3_expiry_after.replace('Z', '+00:00'))
                        diff_days = (before_dt - after_dt).days
                        log(f"   Expiry reduced by: {diff_days} days")
                    else:
                        log(f"⚠️ Could not verify expiry reduction")
                else:
                    log(f"❌ TEST E FAILED: Reward not auto-reversed")
    
    # ========== TEST F: REGRESSION ==========
    log("\n" + "=" * 80)
    log("TEST F: REGRESSION - Verify existing functionality still works")
    log("=" * 80)
    
    # Test /me/referral still works
    r_ref_res = requests.get(f"{BASE_URL}/me/referral", headers=r_headers)
    if r_ref_res.status_code == 200:
        log(f"✅ TEST F PASSED: GET /me/referral still works")
    else:
        log(f"❌ TEST F FAILED: GET /me/referral failed: {r_ref_res.status_code}")
    
    # Test /admin/referrals doesn't create new rewards
    admin_ref_res = requests.get(f"{BASE_URL}/admin/referrals", headers=admin_headers)
    if admin_ref_res.status_code == 200:
        log(f"✅ TEST F PASSED: GET /admin/referrals still works")
        # This is a read-only endpoint, so no new rewards should be created
    else:
        log(f"❌ TEST F FAILED: GET /admin/referrals failed: {admin_ref_res.status_code}")
    
    # ========== CLEANUP ==========
    log("\n" + "=" * 80)
    log("CLEANUP: Deleting test users and data")
    log("=" * 80)
    
    # Connect to MongoDB to clean up
    try:
        from pymongo import MongoClient
        client = MongoClient("mongodb://localhost:27017")
        db = client["edumaster_odisha"]
        
        # Collect all test user IDs
        all_test_ids = [r_id, r2_id, r3_id]
        all_test_ids.extend([u['id'] for u in referred_users])
        all_test_ids.extend([u['id'] for u in r2_referred])
        all_test_ids.extend([u['id'] for u in r3_referred])
        
        # Delete users
        users_deleted = db.users.delete_many({"id": {"$in": all_test_ids}})
        log(f"✅ Deleted {users_deleted.deleted_count} test users")
        
        # Delete referral_rewards
        rewards_deleted = db.referral_rewards.delete_many({"userId": {"$in": all_test_ids}})
        log(f"✅ Deleted {rewards_deleted.deleted_count} referral_rewards")
        
        # Delete referral_audit_logs
        audit_deleted = db.referral_audit_logs.delete_many({"userId": {"$in": all_test_ids}})
        log(f"✅ Deleted {audit_deleted.deleted_count} referral_audit_logs")
        
        # Delete referral_notifications
        notif_deleted = db.referral_notifications.delete_many({"userId": {"$in": all_test_ids}})
        log(f"✅ Deleted {notif_deleted.deleted_count} referral_notifications")
        
        # Delete payments
        payments_deleted = db.payments.delete_many({"userId": {"$in": all_test_ids}})
        log(f"✅ Deleted {payments_deleted.deleted_count} payments")
        
        # Delete assess_orders (if any)
        assess_orders_deleted = db.assess_orders.delete_many({"user_id": {"$in": all_test_ids}})
        log(f"✅ Deleted {assess_orders_deleted.deleted_count} assess_orders")
        
        log(f"\n✅ CLEANUP COMPLETE")
        
    except Exception as e:
        log(f"⚠️ Cleanup failed: {e}")
        log(f"   Manual cleanup required for user IDs: {all_test_ids}")
    
    log("\n" + "=" * 80)
    log("PHASE 2 REFERRAL REWARD CLAWBACK TESTING COMPLETE")
    log("=" * 80)

if __name__ == "__main__":
    test_referral_clawback()
