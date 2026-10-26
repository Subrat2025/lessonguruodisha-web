#!/usr/bin/env python3
"""
Backend Test: Referral System Phase 2
Tests the upgraded referral system with continuous stacking rewards and notification center.
"""

import requests
import json
import time
import random
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test results
results = []

def log_test(test_num, description, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    results.append({
        "test": test_num,
        "description": description,
        "status": status,
        "details": details
    })
    print(f"\nTest {test_num}: {description}")
    print(f"{status}")
    if details:
        print(f"Details: {details}")

def generate_random_mobile():
    """Generate a random 10-digit mobile number"""
    # Start with 9 or 8 to look realistic
    first = random.choice(['9', '8'])
    rest = ''.join([str(random.randint(0, 9)) for _ in range(9)])
    return first + rest

# ============================================================================
# Test 1: Admin Login + Get Referral Code
# ============================================================================
print("\n" + "="*80)
print("TEST 1: Admin Login + Milestones Schema Verification")
print("="*80)

try:
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        admin_token = data.get("token")
        log_test(1, "Admin login successful", True, f"Token received: {admin_token[:20]}...")
    else:
        log_test(1, "Admin login", False, f"Status: {response.status_code}, Response: {response.text}")
        print("\n❌ Cannot proceed without admin login. Exiting.")
        exit(1)
except Exception as e:
    log_test(1, "Admin login", False, f"Exception: {str(e)}")
    exit(1)

# ============================================================================
# Test 2: GET /api/me/referral - Verify Milestones Schema
# ============================================================================
print("\n" + "="*80)
print("TEST 2: GET /api/me/referral - Verify Milestones Schema")
print("="*80)

try:
    response = requests.get(f"{BASE_URL}/me/referral", headers={
        "Authorization": f"Bearer {admin_token}"
    }, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        
        # Extract key fields
        admin_referral_code = data.get("code")
        campaign = data.get("campaign", {})
        milestones = campaign.get("milestones", [])
        continuous = campaign.get("continuous", {})
        stats = data.get("stats", {})
        reward_history = data.get("rewardHistory", [])
        
        print(f"\n📊 Referral Code: {admin_referral_code}")
        print(f"📊 Milestones Count: {len(milestones)}")
        print(f"📊 Continuous Enabled: {continuous.get('enabled')}")
        print(f"📊 Stats: {json.dumps(stats, indent=2)}")
        
        # Verify milestones structure
        checks = []
        
        # Check 1: At least 5 milestones (4 base + 1 continuous)
        checks.append(("Milestones count >= 5", len(milestones) >= 5))
        
        # Check 2: Base milestones [5, 15, 30, 50]
        milestone_counts = [m.get("count") for m in milestones]
        checks.append(("Contains milestone 5", 5 in milestone_counts))
        checks.append(("Contains milestone 15", 15 in milestone_counts))
        checks.append(("Contains milestone 30", 30 in milestone_counts))
        checks.append(("Contains milestone 50", 50 in milestone_counts))
        
        # Check 3: Reward days [30, 90, 180, 365]
        milestone_5 = next((m for m in milestones if m.get("count") == 5), None)
        milestone_15 = next((m for m in milestones if m.get("count") == 15), None)
        milestone_30 = next((m for m in milestones if m.get("count") == 30), None)
        milestone_50 = next((m for m in milestones if m.get("count") == 50), None)
        
        checks.append(("Milestone 5 = 30 days", milestone_5 and milestone_5.get("rewardDays") == 30))
        checks.append(("Milestone 15 = 90 days", milestone_15 and milestone_15.get("rewardDays") == 90))
        checks.append(("Milestone 30 = 180 days", milestone_30 and milestone_30.get("rewardDays") == 180))
        checks.append(("Milestone 50 = 365 days", milestone_50 and milestone_50.get("rewardDays") == 365))
        
        # Check 4: At least one milestone with continuous=true
        continuous_milestones = [m for m in milestones if m.get("continuous") == True]
        checks.append(("Has continuous milestone", len(continuous_milestones) > 0))
        if continuous_milestones:
            cont_m = continuous_milestones[0]
            checks.append(("Continuous milestone count=100", cont_m.get("count") == 100))
            checks.append(("Continuous milestone rewardDays=365", cont_m.get("rewardDays") == 365))
        
        # Check 5: Continuous config
        checks.append(("campaign.continuous.enabled = true", continuous.get("enabled") == True))
        checks.append(("campaign.continuous.every = 50", continuous.get("every") == 50))
        checks.append(("campaign.continuous.rewardDays = 365", continuous.get("rewardDays") == 365))
        
        # Check 6: Stats fields
        checks.append(("stats.continuousStep = 50", stats.get("continuousStep") == 50))
        checks.append(("stats.baseMaxMilestone = 50", stats.get("baseMaxMilestone") == 50))
        checks.append(("stats.continuousActive is boolean", isinstance(stats.get("continuousActive"), bool)))
        checks.append(("stats.nextMilestone exists", stats.get("nextMilestone") is not None))
        
        # Check 7: rewardHistory is array
        checks.append(("rewardHistory is array", isinstance(reward_history, list)))
        
        # Print all checks
        print("\n🔍 Verification Checks:")
        for check_name, check_result in checks:
            status = "✅" if check_result else "❌"
            print(f"  {status} {check_name}")
        
        all_passed = all(check[1] for check in checks)
        
        if all_passed:
            log_test(2, "Milestones schema verification", True, 
                    f"All {len(checks)} checks passed. Milestones: {milestone_counts}")
        else:
            failed_checks = [c[0] for c in checks if not c[1]]
            log_test(2, "Milestones schema verification", False, 
                    f"Failed checks: {', '.join(failed_checks)}")
    else:
        log_test(2, "GET /api/me/referral", False, 
                f"Status: {response.status_code}, Response: {response.text}")
except Exception as e:
    log_test(2, "GET /api/me/referral", False, f"Exception: {str(e)}")

# ============================================================================
# Test 3: GET /api/me/notifications - Without Auth (401)
# ============================================================================
print("\n" + "="*80)
print("TEST 3: GET /api/me/notifications - Without Auth")
print("="*80)

try:
    response = requests.get(f"{BASE_URL}/me/notifications", timeout=30)
    
    if response.status_code == 401:
        log_test(3, "Notifications without auth returns 401", True, "Correctly rejected")
    else:
        log_test(3, "Notifications without auth", False, 
                f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test(3, "Notifications without auth", False, f"Exception: {str(e)}")

# ============================================================================
# Test 4: GET /api/me/notifications - With Auth (Empty State)
# ============================================================================
print("\n" + "="*80)
print("TEST 4: GET /api/me/notifications - With Auth")
print("="*80)

try:
    response = requests.get(f"{BASE_URL}/me/notifications", headers={
        "Authorization": f"Bearer {admin_token}"
    }, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        items = data.get("items", [])
        unread_count = data.get("unreadCount", 0)
        
        print(f"📊 Items: {len(items)}")
        print(f"📊 Unread Count: {unread_count}")
        
        # Check structure
        checks = [
            ("Response has 'items' field", "items" in data),
            ("Response has 'unreadCount' field", "unreadCount" in data),
            ("items is array", isinstance(items, list)),
            ("unreadCount is number", isinstance(unread_count, int))
        ]
        
        all_passed = all(check[1] for check in checks)
        
        if all_passed:
            log_test(4, "GET /api/me/notifications with auth", True, 
                    f"Items: {len(items)}, Unread: {unread_count}")
        else:
            failed_checks = [c[0] for c in checks if not c[1]]
            log_test(4, "GET /api/me/notifications with auth", False, 
                    f"Failed checks: {', '.join(failed_checks)}")
    else:
        log_test(4, "GET /api/me/notifications with auth", False, 
                f"Status: {response.status_code}, Response: {response.text}")
except Exception as e:
    log_test(4, "GET /api/me/notifications with auth", False, f"Exception: {str(e)}")

# ============================================================================
# Test 5: New Referral Joined Notification (End-to-End)
# ============================================================================
print("\n" + "="*80)
print("TEST 5: New Referral Joined Notification (End-to-End)")
print("="*80)

try:
    # Generate random mobile for new user
    new_mobile = generate_random_mobile()
    new_name = f"TestReferred_{int(time.time())}"
    
    print(f"📝 Creating new user: {new_name} / {new_mobile}")
    print(f"📝 Using referral code: {admin_referral_code}")
    
    # Register new user with admin's referral code
    response = requests.post(f"{BASE_URL}/auth/register", json={
        "name": new_name,
        "mobile": new_mobile,
        "password": "test1234",
        "ref": admin_referral_code
    }, timeout=30)
    
    if response.status_code == 200:
        print(f"✅ New user registered successfully")
        
        # Wait a moment for notification to be created
        time.sleep(1)
        
        # Check admin's notifications
        response = requests.get(f"{BASE_URL}/me/notifications", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            unread_count = data.get("unreadCount", 0)
            
            print(f"📊 Admin notifications: {len(items)} items, {unread_count} unread")
            
            # Find the referral_joined notification
            joined_notif = None
            for item in items:
                if item.get("type") == "referral_joined" and new_name in item.get("message", ""):
                    joined_notif = item
                    break
            
            if joined_notif:
                print(f"✅ Found referral_joined notification:")
                print(f"   Type: {joined_notif.get('type')}")
                print(f"   Title: {joined_notif.get('title')}")
                print(f"   Message: {joined_notif.get('message')}")
                print(f"   Read: {joined_notif.get('read')}")
                
                checks = [
                    ("Notification type = referral_joined", joined_notif.get("type") == "referral_joined"),
                    ("Message contains referred name", new_name in joined_notif.get("message", "")),
                    ("Notification is unread", joined_notif.get("read") == False),
                    ("Has id field", "id" in joined_notif),
                    ("Has createdAt field", "createdAt" in joined_notif)
                ]
                
                all_passed = all(check[1] for check in checks)
                
                if all_passed:
                    log_test(5, "Referral joined notification created", True, 
                            f"Notification created for {new_name}")
                    
                    # Store notification ID for later tests
                    global test_notification_id
                    test_notification_id = joined_notif.get("id")
                else:
                    failed_checks = [c[0] for c in checks if not c[1]]
                    log_test(5, "Referral joined notification", False, 
                            f"Failed checks: {', '.join(failed_checks)}")
            else:
                log_test(5, "Referral joined notification", False, 
                        f"No referral_joined notification found for {new_name}")
        else:
            log_test(5, "Check admin notifications", False, 
                    f"Status: {response.status_code}")
    else:
        log_test(5, "Register new user with ref code", False, 
                f"Status: {response.status_code}, Response: {response.text}")
except Exception as e:
    log_test(5, "Referral joined notification", False, f"Exception: {str(e)}")

# ============================================================================
# Test 6: POST /api/me/notifications/mark-read - Single ID
# ============================================================================
print("\n" + "="*80)
print("TEST 6: POST /api/me/notifications/mark-read - Single ID")
print("="*80)

try:
    if 'test_notification_id' in globals():
        response = requests.post(f"{BASE_URL}/me/notifications/mark-read", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"ids": [test_notification_id]},
            timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            modified = data.get("modified", 0)
            
            print(f"📊 Modified: {modified}")
            
            if data.get("ok") and modified >= 1:
                # Verify notification is now read
                response = requests.get(f"{BASE_URL}/me/notifications", headers={
                    "Authorization": f"Bearer {admin_token}"
                }, timeout=30)
                
                if response.status_code == 200:
                    items = response.json().get("items", [])
                    notif = next((n for n in items if n.get("id") == test_notification_id), None)
                    
                    if notif and notif.get("read") == True:
                        log_test(6, "Mark single notification as read", True, 
                                f"Modified: {modified}, read=true verified")
                    else:
                        log_test(6, "Mark single notification as read", False, 
                                "Notification not marked as read")
                else:
                    log_test(6, "Verify notification read status", False, 
                            f"Status: {response.status_code}")
            else:
                log_test(6, "Mark single notification as read", False, 
                        f"Modified count: {modified}")
        else:
            log_test(6, "Mark single notification as read", False, 
                    f"Status: {response.status_code}, Response: {response.text}")
    else:
        log_test(6, "Mark single notification as read", False, 
                "No test notification ID available from Test 5")
except Exception as e:
    log_test(6, "Mark single notification as read", False, f"Exception: {str(e)}")

# ============================================================================
# Test 7: POST /api/me/notifications/mark-read - All
# ============================================================================
print("\n" + "="*80)
print("TEST 7: POST /api/me/notifications/mark-read - All")
print("="*80)

try:
    response = requests.post(f"{BASE_URL}/me/notifications/mark-read", 
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"all": True},
        timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        modified = data.get("modified", 0)
        
        print(f"📊 Modified: {modified}")
        
        if data.get("ok"):
            # Verify unreadCount is now 0
            response = requests.get(f"{BASE_URL}/me/notifications", headers={
                "Authorization": f"Bearer {admin_token}"
            }, timeout=30)
            
            if response.status_code == 200:
                unread_count = response.json().get("unreadCount", -1)
                
                if unread_count == 0:
                    log_test(7, "Mark all notifications as read", True, 
                            f"Modified: {modified}, unreadCount=0")
                else:
                    log_test(7, "Mark all notifications as read", False, 
                            f"unreadCount still {unread_count}")
            else:
                log_test(7, "Verify unread count", False, 
                        f"Status: {response.status_code}")
        else:
            log_test(7, "Mark all notifications as read", False, 
                    f"Response: {data}")
    else:
        log_test(7, "Mark all notifications as read", False, 
                f"Status: {response.status_code}, Response: {response.text}")
except Exception as e:
    log_test(7, "Mark all notifications as read", False, f"Exception: {str(e)}")

# ============================================================================
# Test 8: DELETE /api/me/notifications/:id
# ============================================================================
print("\n" + "="*80)
print("TEST 8: DELETE /api/me/notifications/:id")
print("="*80)

try:
    if 'test_notification_id' in globals():
        response = requests.delete(f"{BASE_URL}/me/notifications/{test_notification_id}", 
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("ok"):
                # Verify notification is deleted
                response = requests.get(f"{BASE_URL}/me/notifications", headers={
                    "Authorization": f"Bearer {admin_token}"
                }, timeout=30)
                
                if response.status_code == 200:
                    items = response.json().get("items", [])
                    notif = next((n for n in items if n.get("id") == test_notification_id), None)
                    
                    if notif is None:
                        log_test(8, "Delete notification", True, 
                                "Notification successfully deleted")
                    else:
                        log_test(8, "Delete notification", False, 
                                "Notification still exists after delete")
                else:
                    log_test(8, "Verify notification deleted", False, 
                            f"Status: {response.status_code}")
            else:
                log_test(8, "Delete notification", False, 
                        f"Response: {data}")
        else:
            log_test(8, "Delete notification", False, 
                    f"Status: {response.status_code}, Response: {response.text}")
    else:
        log_test(8, "Delete notification", False, 
                "No test notification ID available")
except Exception as e:
    log_test(8, "Delete notification", False, f"Exception: {str(e)}")

# ============================================================================
# Test 9: Idempotency - Multiple calls to /me/referral
# ============================================================================
print("\n" + "="*80)
print("TEST 9: Idempotency - Multiple calls to /me/referral")
print("="*80)

try:
    # Call /me/referral 3 times
    reward_counts = []
    
    for i in range(3):
        response = requests.get(f"{BASE_URL}/me/referral", headers={
            "Authorization": f"Bearer {admin_token}"
        }, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            reward_history = data.get("rewardHistory", [])
            reward_counts.append(len(reward_history))
            print(f"  Call {i+1}: {len(reward_history)} rewards")
            time.sleep(0.5)
        else:
            log_test(9, "Idempotency check", False, 
                    f"Call {i+1} failed with status {response.status_code}")
            break
    
    if len(reward_counts) == 3:
        # All counts should be the same (no duplicates created)
        if reward_counts[0] == reward_counts[1] == reward_counts[2]:
            log_test(9, "Idempotency - no duplicate rewards", True, 
                    f"Reward count stable at {reward_counts[0]} across 3 calls")
        else:
            log_test(9, "Idempotency - no duplicate rewards", False, 
                    f"Reward counts changed: {reward_counts}")
    else:
        log_test(9, "Idempotency check", False, 
                "Could not complete 3 calls")
except Exception as e:
    log_test(9, "Idempotency check", False, f"Exception: {str(e)}")

# ============================================================================
# Test 10: Regression - GET /api/classes
# ============================================================================
print("\n" + "="*80)
print("TEST 10: Regression - GET /api/classes")
print("="*80)

try:
    response = requests.get(f"{BASE_URL}/classes", timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        classes = data if isinstance(data, list) else data.get("classes", [])
        
        if len(classes) > 0:
            log_test(10, "Regression - GET /api/classes", True, 
                    f"Found {len(classes)} classes")
        else:
            log_test(10, "Regression - GET /api/classes", False, 
                    "No classes returned")
    else:
        log_test(10, "Regression - GET /api/classes", False, 
                f"Status: {response.status_code}")
except Exception as e:
    log_test(10, "Regression - GET /api/classes", False, f"Exception: {str(e)}")

# ============================================================================
# Test 11: Regression - GET /api/admin/referrals
# ============================================================================
print("\n" + "="*80)
print("TEST 11: Regression - GET /api/admin/referrals")
print("="*80)

try:
    response = requests.get(f"{BASE_URL}/admin/referrals", headers={
        "Authorization": f"Bearer {admin_token}"
    }, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        
        checks = [
            ("Has 'items' or 'leaderboard' field", "items" in data or "leaderboard" in data),
            ("Response is valid JSON", True)
        ]
        
        all_passed = all(check[1] for check in checks)
        
        if all_passed:
            log_test(11, "Regression - GET /api/admin/referrals", True, 
                    "Admin referrals endpoint working")
        else:
            log_test(11, "Regression - GET /api/admin/referrals", False, 
                    "Invalid response structure")
    else:
        log_test(11, "Regression - GET /api/admin/referrals", False, 
                f"Status: {response.status_code}")
except Exception as e:
    log_test(11, "Regression - GET /api/admin/referrals", False, f"Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)

passed = sum(1 for r in results if "✅ PASS" in r["status"])
failed = sum(1 for r in results if "❌ FAIL" in r["status"])
total = len(results)

print(f"\n📊 Total Tests: {total}")
print(f"✅ Passed: {passed}")
print(f"❌ Failed: {failed}")
print(f"📈 Success Rate: {(passed/total*100):.1f}%")

print("\n" + "="*80)
print("DETAILED RESULTS")
print("="*80)

for r in results:
    print(f"\nTest {r['test']}: {r['description']}")
    print(f"  {r['status']}")
    if r['details']:
        print(f"  {r['details']}")

# Exit with appropriate code
exit(0 if failed == 0 else 1)
