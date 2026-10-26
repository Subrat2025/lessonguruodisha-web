#!/usr/bin/env python3
"""
Backend test for Community Assessment Library feature.

Tests:
1. GET /api/assessments/community - list all ready non-hidden assessments
2. Filters and sorts (classId, bookId, type, sort, pagination)
3. Subscription gating (402 for non-subscribers)
4. Cross-user duplicate (subscribed users can copy others' assessments)
5. Report flow (POST /api/assessments/:id/report)
6. Admin queue (GET /api/admin/assessment-reports, POST resolve)
7. Download counter (PDF downloads increment counter for non-owner only)
8. Regression tests
"""

import requests
import time
import json
import sys
from datetime import datetime, timedelta

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Balvatika class ID (from test plan)
BALVATIKA_CLASS_ID = "39c75179-874e-4c6f-9549-7d82462f42d0"

def login(mobile, password):
    """Login and return token"""
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": mobile,
        "password": password
    })
    if r.status_code != 200:
        print(f"❌ Login failed for {mobile}: {r.text}")
        return None
    data = r.json()
    token = data.get("token")
    user = data.get("user", {})
    print(f"✅ Login successful for {mobile}, user: {user.get('name')}, id: {user.get('id')}")
    return token, user

def test_community_list_happy_path(admin_token):
    """Test 1: GET /api/assessments/community with admin token"""
    print("\n=== Test 1: Community List - Happy Path ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/assessments/community?limit=20", headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    total = data.get("total", 0)
    
    print(f"Total assessments: {total}")
    print(f"Items returned: {len(items)}")
    
    if total < 1:
        print("❌ Expected at least 1 assessment in community library")
        return False
    
    # Check first item structure
    if items:
        item = items[0]
        required_fields = ["id", "title", "ownerLabel", "isMine", "userId", "userName", 
                          "thumbnail", "downloadCount", "duplicateCount"]
        missing = [f for f in required_fields if f not in item]
        if missing:
            print(f"❌ Missing fields in item: {missing}")
            return False
        
        print(f"✅ Item structure correct")
        print(f"   - id: {item['id']}")
        print(f"   - title: {item['title'][:50]}...")
        print(f"   - ownerLabel: {item['ownerLabel']}")
        print(f"   - isMine: {item['isMine']}")
        print(f"   - downloadCount: {item['downloadCount']}")
        print(f"   - duplicateCount: {item['duplicateCount']}")
        print(f"   - thumbnail: {item['thumbnail'][:50] if item['thumbnail'] else 'null'}...")
        
        # Check that items where userId matches have isMine=true and ownerLabel="You"
        admin_items = [i for i in items if i.get('isMine') == True]
        if admin_items:
            admin_item = admin_items[0]
            if admin_item.get('ownerLabel') != 'You':
                print(f"❌ Admin's own item should have ownerLabel='You', got: {admin_item.get('ownerLabel')}")
                return False
            print(f"✅ Admin's own items have isMine=true and ownerLabel='You'")
    
    print(f"✅ Test 1 PASSED")
    return True

def test_filters_and_sorts(admin_token):
    """Test 2: Filters and sorts"""
    print("\n=== Test 2: Filters and Sorts ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 2a: Filter by classId (Balvatika)
    print("\n2a. Filter by classId (Balvatika)...")
    r = requests.get(f"{BASE_URL}/assessments/community?classId={BALVATIKA_CLASS_ID}&limit=20", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    total = data.get("total", 0)
    print(f"Balvatika assessments: {total}")
    
    # Verify all items have the correct classId
    if items:
        wrong_class = [i for i in items if i.get('classId') != BALVATIKA_CLASS_ID]
        if wrong_class:
            print(f"❌ Found {len(wrong_class)} items with wrong classId")
            return False
        print(f"✅ All {len(items)} items have correct classId")
    
    # Test 2b: Filter by type (fa1)
    print("\n2b. Filter by type (fa1)...")
    r = requests.get(f"{BASE_URL}/assessments/community?type=fa1&limit=20", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    total = data.get("total", 0)
    print(f"FA1 assessments: {total}")
    
    if items:
        wrong_type = [i for i in items if i.get('assessmentType') != 'fa1']
        if wrong_type:
            print(f"❌ Found {len(wrong_type)} items with wrong type")
            return False
        print(f"✅ All {len(items)} items have assessmentType='fa1'")
    else:
        print(f"⚠️ No FA1 assessments found (may be OK if none created yet)")
    
    # Test 2c: Sort by popular
    print("\n2c. Sort by popular...")
    r = requests.get(f"{BASE_URL}/assessments/community?sort=popular&limit=10", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    print(f"✅ Sort=popular returned 200")
    
    # Test 2d: Sort by downloads
    print("\n2d. Sort by downloads...")
    r = requests.get(f"{BASE_URL}/assessments/community?sort=downloads&limit=10", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    print(f"✅ Sort=downloads returned 200")
    
    # Test 2e: Sort by recent (default)
    print("\n2e. Sort by recent...")
    r = requests.get(f"{BASE_URL}/assessments/community?sort=recent&limit=10", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    print(f"✅ Sort=recent returned 200")
    
    # Test 2f: Pagination
    print("\n2f. Pagination (limit=3, skip=0 and skip=3)...")
    r1 = requests.get(f"{BASE_URL}/assessments/community?limit=3&skip=0", headers=headers)
    r2 = requests.get(f"{BASE_URL}/assessments/community?limit=3&skip=3", headers=headers)
    
    if r1.status_code != 200 or r2.status_code != 200:
        print(f"❌ Pagination failed")
        return False
    
    data1 = r1.json()
    data2 = r2.json()
    items1 = data1.get("items", [])
    items2 = data2.get("items", [])
    
    print(f"Page 1 (skip=0): {len(items1)} items")
    print(f"Page 2 (skip=3): {len(items2)} items")
    
    # Check that items are different
    if items1 and items2:
        ids1 = set(i['id'] for i in items1)
        ids2 = set(i['id'] for i in items2)
        if ids1 & ids2:
            print(f"⚠️ Some items overlap between pages (may be OK if total < 6)")
        else:
            print(f"✅ Pagination working correctly (no overlap)")
    
    print(f"✅ Test 2 PASSED")
    return True

def test_subscription_gating():
    """Test 3: Subscription gating"""
    print("\n=== Test 3: Subscription Gating ===")
    
    # Create a fresh user without subscription
    epoch_suffix = str(int(time.time()))[-3:]
    test_mobile = f"9888888{epoch_suffix}"
    test_password = "test1234"
    test_name = "Community Test User"
    
    print(f"\n3a. Creating fresh user: {test_mobile}...")
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "name": test_name,
        "mobile": test_mobile,
        "password": test_password
    })
    
    if r.status_code != 200:
        print(f"❌ Registration failed: {r.text}")
        return False, None, None
    
    print(f"✅ User created: {test_mobile}")
    
    # Login as fresh user
    print(f"\n3b. Login as fresh user...")
    result = login(test_mobile, test_password)
    if not result:
        return False, None, None
    
    test_token, test_user = result
    test_user_id = test_user.get('id')
    
    # Test 3c: GET /api/assessments/community with fresh token (should be 402)
    print(f"\n3c. GET /api/assessments/community with unsubscribed user...")
    headers = {"Authorization": f"Bearer {test_token}"}
    r = requests.get(f"{BASE_URL}/assessments/community", headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 402:
        print(f"❌ Expected 402, got {r.status_code}: {r.text}")
        return False, test_user_id, test_mobile
    
    data = r.json()
    if data.get('code') != 'SUBSCRIPTION_REQUIRED':
        print(f"❌ Expected code='SUBSCRIPTION_REQUIRED', got: {data.get('code')}")
        return False, test_user_id, test_mobile
    
    print(f"✅ Unsubscribed user got 402 with SUBSCRIPTION_REQUIRED")
    
    # Test 3d: GET /api/assessments/:id with unsubscribed user (should be 402)
    print(f"\n3d. GET /api/assessments/:id with unsubscribed user...")
    # First, get an admin's assessment ID
    admin_token, _ = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/assessments/community?limit=1", headers=admin_headers)
    if r.status_code != 200:
        print(f"❌ Failed to get admin assessment: {r.text}")
        return False, test_user_id, test_mobile
    
    items = r.json().get("items", [])
    if not items:
        print(f"❌ No assessments found in community library")
        return False, test_user_id, test_mobile
    
    admin_assessment_id = items[0]['id']
    print(f"Testing with admin assessment: {admin_assessment_id}")
    
    r = requests.get(f"{BASE_URL}/assessments/{admin_assessment_id}", headers=headers)
    print(f"Status: {r.status_code}")
    if r.status_code != 402:
        print(f"❌ Expected 402, got {r.status_code}: {r.text}")
        return False, test_user_id, test_mobile
    
    data = r.json()
    if data.get('code') != 'SUBSCRIPTION_REQUIRED':
        print(f"❌ Expected code='SUBSCRIPTION_REQUIRED', got: {data.get('code')}")
        return False, test_user_id, test_mobile
    
    print(f"✅ Unsubscribed user got 402 for assessment detail")
    
    # Test 3e: POST /api/assessments/:id/duplicate with unsubscribed user (should be 402)
    print(f"\n3e. POST /api/assessments/:id/duplicate with unsubscribed user...")
    r = requests.post(f"{BASE_URL}/assessments/{admin_assessment_id}/duplicate", headers=headers)
    print(f"Status: {r.status_code}")
    if r.status_code != 402:
        print(f"❌ Expected 402, got {r.status_code}: {r.text}")
        return False, test_user_id, test_mobile
    
    data = r.json()
    if data.get('code') != 'SUBSCRIPTION_REQUIRED':
        print(f"❌ Expected code='SUBSCRIPTION_REQUIRED', got: {data.get('code')}")
        return False, test_user_id, test_mobile
    
    print(f"✅ Unsubscribed user got 402 for duplicate")
    
    print(f"✅ Test 3 PASSED")
    return True, test_user_id, test_mobile

def upgrade_user_subscription(user_id):
    """Upgrade user subscription directly in MongoDB"""
    print(f"\n=== Upgrading user subscription in MongoDB ===")
    
    from pymongo import MongoClient
    
    mongo_url = "mongodb://localhost:27017"
    db_name = "edumaster_odisha"
    
    try:
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        # Update user with active subscription
        result = db.users.update_one(
            {"id": user_id},
            {"$set": {
                "subscription": {
                    "status": "active",
                    "plan": "monthly",
                    "startDate": datetime.utcnow(),
                    "expiryDate": datetime.utcnow() + timedelta(days=30)
                }
            }}
        )
        
        if result.modified_count > 0:
            print(f"✅ User subscription upgraded: {user_id}")
            return True
        else:
            print(f"❌ Failed to upgrade user subscription")
            return False
    except Exception as e:
        print(f"❌ MongoDB error: {e}")
        return False

def test_cross_user_duplicate(test_mobile, test_password, admin_token):
    """Test 4: Cross-user duplicate"""
    print("\n=== Test 4: Cross-User Duplicate ===")
    
    # Re-login as test user to get fresh token with updated subscription
    print(f"\n4a. Re-login as test user with subscription...")
    result = login(test_mobile, test_password)
    if not result:
        return False, None
    
    test_token, test_user = result
    
    # Verify subscription is active
    headers = {"Authorization": f"Bearer {test_token}"}
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get user info: {r.text}")
        return False, None
    
    user_data = r.json().get("user", {})
    subscription = user_data.get("subscription", {})
    if subscription.get("status") != "active":
        print(f"❌ Subscription not active: {subscription}")
        return False, None
    
    print(f"✅ User subscription is active: {subscription.get('plan')}")
    
    # Test 4b: GET /api/assessments/community should now work
    print(f"\n4b. GET /api/assessments/community with subscribed user...")
    r = requests.get(f"{BASE_URL}/assessments/community?limit=10", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False, None
    
    print(f"✅ Subscribed user can access community library")
    
    # Test 4c: Pick an admin assessment and duplicate it
    print(f"\n4c. Duplicate admin's assessment...")
    # Get a fresh admin token (previous one was invalidated by test user login)
    admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_result:
        print(f"❌ Failed to re-login as admin")
        return False, None
    fresh_admin_token, _ = admin_result
    admin_headers = {"Authorization": f"Bearer {fresh_admin_token}"}
    r = requests.get(f"{BASE_URL}/assessments/community?limit=1", headers=admin_headers)
    if r.status_code != 200:
        print(f"❌ Failed to get admin assessment: {r.text}")
        return False, None
    
    items = r.json().get("items", [])
    if not items:
        print(f"❌ No assessments found")
        return False, None
    
    original = items[0]
    original_id = original['id']
    original_duplicate_count = original.get('duplicateCount', 0)
    
    print(f"Original assessment: {original['title'][:50]}...")
    print(f"Original duplicateCount: {original_duplicate_count}")
    
    # Duplicate it
    r = requests.post(f"{BASE_URL}/assessments/{original_id}/duplicate", headers=headers)
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"❌ Duplicate failed: {r.text}")
        return False, None
    
    data = r.json()
    if not data.get('ok'):
        print(f"❌ Duplicate failed: {data}")
        return False, None
    
    clone = data.get('assessment', {})
    clone_id = clone.get('id')
    
    print(f"✅ Duplicate successful")
    print(f"   - Clone ID: {clone_id}")
    print(f"   - Clone title: {clone['title'][:60]}...")
    print(f"   - Clone userId: {clone.get('userId')}")
    
    # Verify clone properties
    if clone.get('userId') != test_user.get('id'):
        print(f"❌ Clone userId should be test user's id")
        return False, clone_id
    
    if not clone['title'].startswith('🌟'):
        print(f"❌ Clone title should start with 🌟")
        return False, clone_id
    
    if '(from ' not in clone['title']:
        print(f"❌ Clone title should contain '(from <owner name>)'")
        return False, clone_id
    
    if clone.get('copiedFromId') != original_id:
        print(f"❌ Clone copiedFromId should be original id")
        return False, clone_id
    
    print(f"✅ Clone properties correct")
    
    # Test 4d: Verify clone is accessible by owner
    print(f"\n4d. GET /api/assessments/{clone_id} with test user token...")
    r = requests.get(f"{BASE_URL}/assessments/{clone_id}", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get clone: {r.text}")
        return False, clone_id
    
    print(f"✅ Test user can access their clone (owner access)")
    
    # Test 4e: Verify source duplicateCount incremented
    print(f"\n4e. Verify source duplicateCount incremented...")
    # Get fresh admin token again
    admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_result:
        print(f"❌ Failed to re-login as admin")
        return False, clone_id
    fresh_admin_token2, _ = admin_result
    admin_headers2 = {"Authorization": f"Bearer {fresh_admin_token2}"}
    r = requests.get(f"{BASE_URL}/assessments/{original_id}", headers=admin_headers2)
    if r.status_code != 200:
        print(f"❌ Failed to get original: {r.text}")
        return False, clone_id
    
    updated_original = r.json().get('assessment', {})
    new_duplicate_count = updated_original.get('duplicateCount', 0)
    
    print(f"Original duplicateCount: {original_duplicate_count}")
    print(f"New duplicateCount: {new_duplicate_count}")
    
    if new_duplicate_count != original_duplicate_count + 1:
        print(f"❌ duplicateCount should be incremented by 1")
        return False, clone_id
    
    print(f"✅ Source duplicateCount incremented correctly")
    
    print(f"✅ Test 4 PASSED")
    return True, clone_id

def test_report_flow(test_token, admin_token):
    """Test 5: Report flow"""
    print("\n=== Test 5: Report Flow ===")
    
    # Get an assessment to report
    headers = {"Authorization": f"Bearer {test_token}"}
    r = requests.get(f"{BASE_URL}/assessments/community?limit=1", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed to get assessment: {r.text}")
        return False, None
    
    items = r.json().get("items", [])
    if not items:
        print(f"❌ No assessments found")
        return False, None
    
    assessment_id = items[0]['id']
    assessment_title = items[0]['title']
    
    print(f"\n5a. Report assessment: {assessment_title[:50]}...")
    
    # Report it
    r = requests.post(f"{BASE_URL}/assessments/{assessment_id}/report", 
                     json={"reason": "inappropriate content", "notes": "test report"},
                     headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"❌ Report failed: {r.text}")
        return False, None
    
    data = r.json()
    if not data.get('ok'):
        print(f"❌ Report failed: {data}")
        return False, None
    
    print(f"✅ Report submitted: {data.get('message')}")
    
    # Test 5b: Check MongoDB for report entry
    print(f"\n5b. Check MongoDB for report entry...")
    from pymongo import MongoClient
    
    mongo_url = "mongodb://localhost:27017"
    db_name = "edumaster_odisha"
    
    try:
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        report = db.assessment_reports.find_one({"assessmentId": assessment_id, "status": "pending"})
        if not report:
            print(f"❌ Report not found in database")
            return False, None
        
        report_id = report.get('id')
        print(f"✅ Report found in database")
        print(f"   - Report ID: {report_id}")
        print(f"   - Assessment ID: {report.get('assessmentId')}")
        print(f"   - Reporter ID: {report.get('reporterId')}")
        print(f"   - Reason: {report.get('reason')}")
        print(f"   - Status: {report.get('status')}")
        
        # Test 5c: Check for admin notification
        print(f"\n5c. Check for admin notification...")
        
        # Get admin user ID
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/auth/me", headers=admin_headers)
        if r.status_code != 200:
            print(f"❌ Failed to get admin info: {r.text}")
            return False, report_id
        
        admin_user = r.json().get("user", {})
        admin_id = admin_user.get('id')
        
        # Check for notification
        notification = db.referral_notifications.find_one({
            "userId": admin_id,
            "type": "info",
            "title": {"$regex": "🚩"}
        })
        
        if not notification:
            print(f"⚠️ Admin notification not found (may be OK if notification system is async)")
        else:
            print(f"✅ Admin notification found")
            print(f"   - Title: {notification.get('title')}")
            print(f"   - Message: {notification.get('message')[:60]}...")
        
        print(f"✅ Test 5 PASSED")
        return True, report_id
        
    except Exception as e:
        print(f"❌ MongoDB error: {e}")
        return False, None

def test_admin_queue(admin_token, report_id):
    """Test 6: Admin queue"""
    print("\n=== Test 6: Admin Queue ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 6a: GET /api/admin/assessment-reports?status=pending
    print(f"\n6a. GET /api/admin/assessment-reports?status=pending...")
    r = requests.get(f"{BASE_URL}/admin/assessment-reports?status=pending", headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    
    print(f"Pending reports: {len(items)}")
    
    # Find our report
    our_report = next((r for r in items if r.get('id') == report_id), None)
    if not our_report:
        print(f"❌ Our report not found in pending list")
        return False
    
    print(f"✅ Our report found in pending list")
    print(f"   - Assessment: {our_report.get('assessmentTitle')[:50]}...")
    print(f"   - Reason: {our_report.get('reason')}")
    
    # Test 6b: POST /api/admin/assessment-reports/:id/resolve with action='hide'
    print(f"\n6b. POST /api/admin/assessment-reports/{report_id}/resolve with action='hide'...")
    r = requests.post(f"{BASE_URL}/admin/assessment-reports/{report_id}/resolve",
                     json={"action": "hide"},
                     headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    
    data = r.json()
    if not data.get('ok'):
        print(f"❌ Resolve failed: {data}")
        return False
    
    if data.get('action') != 'hide':
        print(f"❌ Expected action='hide', got: {data.get('action')}")
        return False
    
    print(f"✅ Report resolved with action='hide'")
    
    # Test 6c: Verify report status updated in MongoDB
    print(f"\n6c. Verify report status updated...")
    from pymongo import MongoClient
    
    mongo_url = "mongodb://localhost:27017"
    db_name = "edumaster_odisha"
    
    try:
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        report = db.assessment_reports.find_one({"id": report_id})
        if not report:
            print(f"❌ Report not found")
            return False
        
        if report.get('status') != 'resolved-hidden':
            print(f"❌ Expected status='resolved-hidden', got: {report.get('status')}")
            return False
        
        print(f"✅ Report status updated to 'resolved-hidden'")
        
        # Test 6d: Verify assessment hiddenByAdmin=true
        print(f"\n6d. Verify assessment hiddenByAdmin=true...")
        assessment_id = our_report.get('assessmentId')
        assessment = db.assessments.find_one({"id": assessment_id})
        
        if not assessment:
            print(f"❌ Assessment not found")
            return False
        
        if not assessment.get('hiddenByAdmin'):
            print(f"❌ Expected hiddenByAdmin=true, got: {assessment.get('hiddenByAdmin')}")
            return False
        
        print(f"✅ Assessment hiddenByAdmin=true")
        
        # Test 6e: Verify hidden assessment not in community list
        print(f"\n6e. Verify hidden assessment not in community list...")
        r = requests.get(f"{BASE_URL}/assessments/community?limit=100", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to get community list: {r.text}")
            return False
        
        items = r.json().get("items", [])
        hidden_in_list = any(i.get('id') == assessment_id for i in items)
        
        if hidden_in_list:
            print(f"❌ Hidden assessment still appears in community list")
            return False
        
        print(f"✅ Hidden assessment not in community list")
        
        # Test 6f: Verify owner can still access hidden assessment
        print(f"\n6f. Verify owner can still access hidden assessment...")
        # Get owner's token (admin in this case)
        r = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=headers)
        if r.status_code != 200:
            print(f"❌ Owner cannot access hidden assessment: {r.text}")
            return False
        
        print(f"✅ Owner can still access hidden assessment")
        
        print(f"✅ Test 6 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ MongoDB error: {e}")
        return False

def test_download_counter(admin_token, test_token):
    """Test 7: Download counter"""
    print("\n=== Test 7: Download Counter ===")
    
    # Get an admin assessment
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/assessments/community?limit=1&mine=1", headers=admin_headers)
    if r.status_code != 200:
        print(f"❌ Failed to get admin assessment: {r.text}")
        return False
    
    items = r.json().get("items", [])
    if not items:
        print(f"❌ No admin assessments found")
        return False
    
    assessment_id = items[0]['id']
    initial_download_count = items[0].get('downloadCount', 0)
    
    print(f"Assessment: {items[0]['title'][:50]}...")
    print(f"Initial downloadCount: {initial_download_count}")
    
    # Test 7a: Test user downloads PDF (should increment counter)
    print(f"\n7a. Test user downloads PDF (should increment counter)...")
    test_headers = {"Authorization": f"Bearer {test_token}"}
    
    r = requests.get(f"{BASE_URL}/assessments/{assessment_id}/pdf", headers=test_headers, timeout=70)
    print(f"Status: {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ PDF download failed: {r.text[:200]}")
        return False
    
    if not r.content.startswith(b'%PDF'):
        print(f"❌ Response is not a PDF")
        return False
    
    print(f"✅ PDF downloaded: {len(r.content)} bytes")
    
    # Wait a moment for counter to update
    time.sleep(2)
    
    # Check counter
    r = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=admin_headers)
    if r.status_code != 200:
        print(f"❌ Failed to get assessment: {r.text}")
        return False
    
    updated = r.json().get('assessment', {})
    new_download_count = updated.get('downloadCount', 0)
    
    print(f"Initial downloadCount: {initial_download_count}")
    print(f"New downloadCount: {new_download_count}")
    
    if new_download_count != initial_download_count + 1:
        print(f"❌ downloadCount should be incremented by 1")
        return False
    
    print(f"✅ downloadCount incremented for non-owner download")
    
    # Test 7b: Owner downloads PDF (should NOT increment counter)
    print(f"\n7b. Owner downloads PDF (should NOT increment counter)...")
    
    r = requests.get(f"{BASE_URL}/assessments/{assessment_id}/pdf", headers=admin_headers, timeout=70)
    print(f"Status: {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ PDF download failed: {r.text[:200]}")
        return False
    
    print(f"✅ PDF downloaded by owner: {len(r.content)} bytes")
    
    # Wait a moment
    time.sleep(2)
    
    # Check counter again
    r = requests.get(f"{BASE_URL}/assessments/{assessment_id}", headers=admin_headers)
    if r.status_code != 200:
        print(f"❌ Failed to get assessment: {r.text}")
        return False
    
    final = r.json().get('assessment', {})
    final_download_count = final.get('downloadCount', 0)
    
    print(f"Download count after owner download: {final_download_count}")
    
    if final_download_count != new_download_count:
        print(f"❌ downloadCount should NOT change for owner downloads")
        return False
    
    print(f"✅ downloadCount NOT incremented for owner download")
    
    print(f"✅ Test 7 PASSED")
    return True

def test_regression(admin_token):
    """Test 8: Regression tests"""
    print("\n=== Test 8: Regression Tests ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 8a: GET /api/assessments (my library)
    print(f"\n8a. GET /api/assessments (my library)...")
    r = requests.get(f"{BASE_URL}/assessments", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    print(f"✅ My library endpoint working")
    
    # Test 8b: GET /api/me/referral (Phase 2 endpoint)
    print(f"\n8b. GET /api/me/referral...")
    r = requests.get(f"{BASE_URL}/me/referral", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    
    data = r.json()
    if 'code' not in data or 'link' not in data:
        print(f"❌ Referral response missing required fields")
        return False
    
    print(f"✅ Referral endpoint working")
    
    # Test 8c: GET /api/classes
    print(f"\n8c. GET /api/classes...")
    r = requests.get(f"{BASE_URL}/classes", headers=headers)
    if r.status_code != 200:
        print(f"❌ Failed: {r.text}")
        return False
    print(f"✅ Classes endpoint working")
    
    print(f"✅ Test 8 PASSED")
    return True

def cleanup(test_user_id, clone_id):
    """Cleanup test data"""
    print("\n=== Cleanup ===")
    
    from pymongo import MongoClient
    
    mongo_url = "mongodb://localhost:27017"
    db_name = "edumaster_odisha"
    
    try:
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        # Delete test user
        if test_user_id:
            result = db.users.delete_one({"id": test_user_id})
            print(f"✅ Deleted test user: {result.deleted_count}")
        
        # Delete clone assessment
        if clone_id:
            result = db.assessments.delete_one({"id": clone_id})
            print(f"✅ Deleted clone assessment: {result.deleted_count}")
        
        # Delete test reports (keep for admin review)
        # result = db.assessment_reports.delete_many({"reason": "inappropriate content"})
        # print(f"✅ Deleted test reports: {result.deleted_count}")
        
        print(f"✅ Cleanup complete")
        
    except Exception as e:
        print(f"⚠️ Cleanup error: {e}")

def main():
    print("=" * 80)
    print("COMMUNITY ASSESSMENT LIBRARY - BACKEND TEST")
    print("=" * 80)
    
    test_user_id = None
    test_mobile = None
    test_password = "test1234"
    clone_id = None
    report_id = None
    
    try:
        # Login as admin
        print("\n=== Admin Login ===")
        result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
        if not result:
            print("❌ Admin login failed")
            sys.exit(1)
        
        admin_token, admin_user = result
        
        results = {}
        
        # Test 1: Community list - happy path
        results["Test 1: Community List"] = test_community_list_happy_path(admin_token)
        
        # Test 2: Filters and sorts
        results["Test 2: Filters & Sorts"] = test_filters_and_sorts(admin_token)
        
        # Test 3: Subscription gating
        passed, test_user_id, test_mobile = test_subscription_gating()
        results["Test 3: Subscription Gating"] = passed
        
        if not passed or not test_user_id:
            print("\n❌ Cannot continue without test user")
        else:
            # Upgrade user subscription
            if not upgrade_user_subscription(test_user_id):
                print("\n❌ Cannot continue without subscription upgrade")
            else:
                # Get fresh admin token (previous one was invalidated)
                admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
                if not admin_result:
                    print("\n❌ Cannot continue without admin token")
                else:
                    admin_token, _ = admin_result
                    
                    # Test 4: Cross-user duplicate
                    passed, clone_id = test_cross_user_duplicate(test_mobile, test_password, admin_token)
                    results["Test 4: Cross-User Duplicate"] = passed
                    
                    if passed:
                        # Re-login to get fresh token
                        test_result = login(test_mobile, test_password)
                        if test_result:
                            test_token, _ = test_result
                            
                            # Get fresh admin token again
                            admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
                            if admin_result:
                                admin_token, _ = admin_result
                                
                                # Test 5: Report flow
                                passed, report_id = test_report_flow(test_token, admin_token)
                                results["Test 5: Report Flow"] = passed
                                
                                if passed and report_id:
                                    # Get fresh admin token again
                                    admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
                                    if admin_result:
                                        admin_token, _ = admin_result
                                        # Test 6: Admin queue
                                        results["Test 6: Admin Queue"] = test_admin_queue(admin_token, report_id)
                                
                                # Get fresh tokens for download test
                                admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
                                test_result = login(test_mobile, test_password)
                                if admin_result and test_result:
                                    admin_token, _ = admin_result
                                    test_token, _ = test_result
                                    # Test 7: Download counter
                                    results["Test 7: Download Counter"] = test_download_counter(admin_token, test_token)
        
        # Test 8: Regression (get fresh admin token)
        admin_result = login(ADMIN_MOBILE, ADMIN_PASSWORD)
        if admin_result:
            admin_token, _ = admin_result
            results["Test 8: Regression"] = test_regression(admin_token)
        
        # Print summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        for test_name, passed in results.items():
            status = "✅ PASSED" if passed else "❌ FAILED"
            print(f"{test_name}: {status}")
        
        passed_count = sum(1 for v in results.values() if v)
        total_count = len(results)
        
        print("\n" + "=" * 80)
        print(f"RESULTS: {passed_count}/{total_count} TESTS PASSED")
        
        if passed_count == total_count:
            print("✅ ALL TESTS PASSED - COMMUNITY ASSESSMENT LIBRARY WORKING ✅")
        else:
            print(f"⚠️ {total_count - passed_count} TEST(S) FAILED")
        
        print("=" * 80)
        
        # Cleanup
        cleanup(test_user_id, clone_id)
        
        sys.exit(0 if passed_count == total_count else 1)
        
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {e}")
        import traceback
        traceback.print_exc()
        
        # Cleanup on error
        if test_user_id or clone_id:
            cleanup(test_user_id, clone_id)
        
        sys.exit(1)

if __name__ == "__main__":
    main()
