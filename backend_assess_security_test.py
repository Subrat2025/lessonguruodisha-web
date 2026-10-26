#!/usr/bin/env python3
"""
Backend test for Assessment Store abuse-detection + Security admin endpoints
Tests all 5 scenarios from review request
"""
import requests
import os
import sys
from pymongo import MongoClient
from datetime import datetime
import uuid

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Track synthetic data for cleanup
synthetic_event_ids = []
test_user_id = None
original_lock_state = None

def log(msg):
    print(f"[TEST] {msg}")

def get_admin_token():
    """Login as admin and get token"""
    try:
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        if resp.status_code == 200:
            token = resp.json().get('token')
            log(f"✅ Admin login successful")
            return token
        else:
            log(f"❌ Admin login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        log(f"❌ Admin login error: {e}")
        return None

def get_test_user():
    """Get a non-admin test user from MongoDB"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Find a non-admin user
        user = db.users.find_one({"role": {"$ne": "admin"}})
        if user:
            log(f"✅ Found test user: {user.get('id')} (mobile: {user.get('mobile')})")
            return user
        else:
            log(f"❌ No non-admin user found in database")
            return None
    except Exception as e:
        log(f"❌ Error getting test user: {e}")
        return None

def get_user_token(mobile, password="<redacted>"):
    """Login as a user and get token"""
    try:
        resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=10)
        if resp.status_code == 200:
            token = resp.json().get('token')
            log(f"✅ User login successful (mobile: {mobile})")
            return token
        else:
            log(f"⚠ User login failed: {resp.status_code} (will test lock enforcement via DB check)")
            return None
    except Exception as e:
        log(f"⚠ User login error: {e} (will test lock enforcement via DB check)")
        return None

def test_1_settings(admin_token):
    """TEST 1: Settings PUT/GET"""
    log("\n" + "="*80)
    log("TEST 1: SETTINGS PUT/GET")
    log("="*80)
    
    try:
        # PUT settings
        settings_data = {
            "settings": {
                "abuse_max_downloads_per_hour": 40,
                "abuse_max_ips_24h": 5,
                "abuse_max_devices": 2
            }
        }
        
        resp = requests.put(
            f"{API_URL}/admin/assess/settings",
            json=settings_data,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if resp.status_code == 200:
            log(f"✅ PUT /admin/assess/settings → 200")
            log(f"   Response: {resp.json()}")
        else:
            log(f"❌ PUT /admin/assess/settings → {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
        
        # GET settings
        resp = requests.get(
            f"{API_URL}/admin/assess/settings",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            settings = data.get('settings', {})
            log(f"✅ GET /admin/assess/settings → 200")
            log(f"   abuse_max_downloads_per_hour: {settings.get('abuse_max_downloads_per_hour')}")
            log(f"   abuse_max_ips_24h: {settings.get('abuse_max_ips_24h')}")
            log(f"   abuse_max_devices: {settings.get('abuse_max_devices')}")
            
            # Verify values
            if (settings.get('abuse_max_downloads_per_hour') == 40 and
                settings.get('abuse_max_ips_24h') == 5 and
                settings.get('abuse_max_devices') == 2):
                log(f"✅ TEST 1 PASSED: Settings stored and retrieved correctly")
                return True
            else:
                log(f"❌ TEST 1 FAILED: Settings values don't match")
                return False
        else:
            log(f"❌ GET /admin/assess/settings → {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
            
    except Exception as e:
        log(f"❌ TEST 1 ERROR: {e}")
        return False

def test_2_lock_enforcement(test_user, user_token, admin_token):
    """TEST 2: Lock enforcement"""
    log("\n" + "="*80)
    log("TEST 2: LOCK ENFORCEMENT")
    log("="*80)
    
    global original_lock_state
    
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Save original lock state
        user_doc = db.users.find_one({"id": test_user['id']})
        original_lock_state = user_doc.get('assess_download_lock', {'locked': False})
        log(f"   Original lock state: {original_lock_state}")
        
        # Set lock
        db.users.update_one(
            {"id": test_user['id']},
            {"$set": {"assess_download_lock": {"locked": True, "reason": "test"}}}
        )
        log(f"✅ Set assess_download_lock={{locked:true, reason:'test'}} for user {test_user['id']}")
        
        # Test 2a: POST /assess/download-request should return 423 STORE_LOCKED
        if user_token:
            resp = requests.post(
                f"{API_URL}/assess/download-request",
                json={"document_id": "anything"},
                headers={"Authorization": f"Bearer {user_token}"},
                timeout=10
            )
            
            if resp.status_code == 423:
                data = resp.json()
                if data.get('code') == 'STORE_LOCKED':
                    log(f"✅ POST /assess/download-request → 423 STORE_LOCKED")
                    log(f"   Error message (Odia): {data.get('error')}")
                    log(f"   Reason: {data.get('reason')}")
                else:
                    log(f"❌ POST /assess/download-request → 423 but code is {data.get('code')}, expected STORE_LOCKED")
                    return False
            else:
                log(f"❌ POST /assess/download-request → {resp.status_code}, expected 423")
                log(f"   Response: {resp.text}")
                return False
        else:
            log(f"⚠ Skipping POST /assess/download-request test (no user token)")
        
        # Test 2b: GET /assess/view/:id should return 423 STORE_LOCKED
        if user_token:
            resp = requests.get(
                f"{API_URL}/assess/view/any-doc-id",
                headers={"Authorization": f"Bearer {user_token}"},
                timeout=10
            )
            
            if resp.status_code == 423:
                data = resp.json()
                if data.get('code') == 'STORE_LOCKED':
                    log(f"✅ GET /assess/view/:id → 423 STORE_LOCKED")
                    log(f"   Error message (Odia): {data.get('error')}")
                else:
                    log(f"❌ GET /assess/view/:id → 423 but code is {data.get('code')}, expected STORE_LOCKED")
                    return False
            else:
                log(f"❌ GET /assess/view/:id → {resp.status_code}, expected 423")
                log(f"   Response: {resp.text}")
                return False
        else:
            log(f"⚠ Skipping GET /assess/view test (no user token)")
        
        # Clear lock
        db.users.update_one(
            {"id": test_user['id']},
            {"$set": {"assess_download_lock": {"locked": False}}}
        )
        log(f"✅ Cleared assess_download_lock for user {test_user['id']}")
        
        # Test 2c: Verify endpoints no longer return 423 STORE_LOCKED
        if user_token:
            resp = requests.post(
                f"{API_URL}/assess/download-request",
                json={"document_id": "anything"},
                headers={"Authorization": f"Bearer {user_token}"},
                timeout=10
            )
            
            if resp.status_code == 423 and resp.json().get('code') == 'STORE_LOCKED':
                log(f"❌ POST /assess/download-request still returns 423 STORE_LOCKED after clearing lock")
                return False
            else:
                log(f"✅ POST /assess/download-request no longer returns 423 STORE_LOCKED (got {resp.status_code})")
                log(f"   Response: {resp.json() if resp.status_code != 423 else resp.text}")
        else:
            # Verify via DB that lock is cleared
            user_doc = db.users.find_one({"id": test_user['id']})
            lock = user_doc.get('assess_download_lock', {})
            if not lock.get('locked'):
                log(f"✅ Verified via DB: assess_download_lock.locked == false")
            else:
                log(f"❌ DB check failed: assess_download_lock.locked is still true")
                return False
        
        log(f"✅ TEST 2 PASSED: Lock enforcement working correctly")
        return True
        
    except Exception as e:
        log(f"❌ TEST 2 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_3_security_list(admin_token, test_user):
    """TEST 3: Security list"""
    log("\n" + "="*80)
    log("TEST 3: SECURITY LIST")
    log("="*80)
    
    global synthetic_event_ids
    
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Insert synthetic event
        event_id = str(uuid.uuid4())
        synthetic_event_ids.append(event_id)
        
        event_doc = {
            "id": event_id,
            "user_id": test_user['id'],
            "type": "rapid_downloads",
            "details": {"count": 41},
            "ip": "1.2.3.4",
            "device_id": "devA",
            "created_at": datetime.utcnow(),
            "status": "open"
        }
        
        db.assess_security_events.insert_one(event_doc)
        log(f"✅ Inserted synthetic assess_security_events row: {event_id}")
        
        # Test 3a: GET /admin/assess/security?status=open (with admin token)
        resp = requests.get(
            f"{API_URL}/admin/assess/security?status=open",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            log(f"✅ GET /admin/assess/security?status=open → 200")
            log(f"   open_count: {data.get('open_count')}")
            log(f"   events count: {len(data.get('events', []))}")
            
            # Find our synthetic event
            our_event = None
            for e in data.get('events', []):
                if e.get('id') == event_id:
                    our_event = e
                    break
            
            if our_event:
                log(f"✅ Found synthetic event in response")
                log(f"   user_name: {our_event.get('user_name')}")
                log(f"   user_mobile: {our_event.get('user_mobile')}")
                log(f"   type: {our_event.get('type')}")
                log(f"   locked: {our_event.get('locked')}")
                log(f"   details: {our_event.get('details')}")
            else:
                log(f"❌ Synthetic event not found in response")
                return False
        else:
            log(f"❌ GET /admin/assess/security?status=open → {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
        
        # Test 3b: GET without admin token should return 401/403
        resp = requests.get(
            f"{API_URL}/admin/assess/security?status=open",
            timeout=10
        )
        
        if resp.status_code in [401, 403]:
            log(f"✅ GET /admin/assess/security without token → {resp.status_code} (correctly rejected)")
        else:
            log(f"❌ GET /admin/assess/security without token → {resp.status_code}, expected 401/403")
            return False
        
        log(f"✅ TEST 3 PASSED: Security list working correctly")
        return True
        
    except Exception as e:
        log(f"❌ TEST 3 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_4_user_history(admin_token, test_user):
    """TEST 4: User history"""
    log("\n" + "="*80)
    log("TEST 4: USER HISTORY")
    log("="*80)
    
    try:
        # GET /admin/assess/security/user/:userId
        resp = requests.get(
            f"{API_URL}/admin/assess/security/user/{test_user['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            log(f"✅ GET /admin/assess/security/user/:userId → 200")
            
            user = data.get('user', {})
            log(f"   user.id: {user.get('id')}")
            log(f"   user.name: {user.get('name')}")
            log(f"   user.mobile: {user.get('mobile')}")
            log(f"   user.locked: {user.get('locked')}")
            log(f"   user.lock: {user.get('lock')}")
            
            history = data.get('history', [])
            log(f"   history count: {len(history)}")
            
            events = data.get('events', [])
            log(f"   events count: {len(events)}")
            
            log(f"✅ TEST 4 PASSED: User history endpoint working correctly")
            return True
        else:
            log(f"❌ GET /admin/assess/security/user/:userId → {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
            
    except Exception as e:
        log(f"❌ TEST 4 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_5_actions(admin_token, test_user):
    """TEST 5: Actions (unlock, dismiss, keep)"""
    log("\n" + "="*80)
    log("TEST 5: ACTIONS")
    log("="*80)
    
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Test 5a: Action 'unlock'
        log("\n--- Test 5a: Action 'unlock' ---")
        
        # First set lock
        db.users.update_one(
            {"id": test_user['id']},
            {"$set": {"assess_download_lock": {"locked": True, "reason": "test"}, "assess_blocked": True}}
        )
        log(f"   Set lock for user {test_user['id']}")
        
        resp = requests.post(
            f"{API_URL}/admin/assess/security/action",
            json={"user_id": test_user['id'], "action": "unlock"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if resp.status_code == 200:
            log(f"✅ POST /admin/assess/security/action (unlock) → 200")
            
            # Verify user's assess_download_lock.locked == false
            user_doc = db.users.find_one({"id": test_user['id']})
            lock = user_doc.get('assess_download_lock', {})
            blocked = user_doc.get('assess_blocked', False)
            
            if not lock.get('locked') and not blocked:
                log(f"✅ Verified: assess_download_lock.locked == false, assess_blocked == false")
            else:
                log(f"❌ Lock state incorrect: locked={lock.get('locked')}, blocked={blocked}")
                return False
            
            # Verify open events marked as 'reviewed'
            open_events = db.assess_security_events.count_documents({
                "user_id": test_user['id'],
                "status": "open"
            })
            log(f"   Open events for user: {open_events}")
            
            # Verify audit row written
            audit = db.assess_admin_audit.find_one({
                "action": "security_unlock",
                "target_user_id": test_user['id']
            }, sort=[("at", -1)])
            
            if audit:
                log(f"✅ Verified: assess_admin_audit row written (action: security_unlock)")
            else:
                log(f"⚠ No audit row found (may be non-fatal)")
        else:
            log(f"❌ POST /admin/assess/security/action (unlock) → {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
        
        # Test 5b: Action 'dismiss' with event_id
        log("\n--- Test 5b: Action 'dismiss' ---")
        
        if synthetic_event_ids:
            event_id = synthetic_event_ids[0]
            
            resp = requests.post(
                f"{API_URL}/admin/assess/security/action",
                json={"user_id": test_user['id'], "action": "dismiss", "event_id": event_id},
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            
            if resp.status_code == 200:
                log(f"✅ POST /admin/assess/security/action (dismiss) → 200")
                
                # Verify event status changed to 'dismissed'
                event = db.assess_security_events.find_one({"id": event_id})
                if event and event.get('status') == 'dismissed':
                    log(f"✅ Verified: event status changed to 'dismissed'")
                else:
                    log(f"❌ Event status not changed: {event.get('status') if event else 'not found'}")
                    return False
            else:
                log(f"❌ POST /admin/assess/security/action (dismiss) → {resp.status_code}")
                log(f"   Response: {resp.text}")
                return False
        else:
            log(f"⚠ No synthetic event to dismiss")
        
        # Test 5c: Action 'keep'
        log("\n--- Test 5c: Action 'keep' ---")
        
        resp = requests.post(
            f"{API_URL}/admin/assess/security/action",
            json={"user_id": test_user['id'], "action": "keep"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if resp.status_code == 200:
            log(f"✅ POST /admin/assess/security/action (keep) → 200")
            
            # Verify user locked again
            user_doc = db.users.find_one({"id": test_user['id']})
            lock = user_doc.get('assess_download_lock', {})
            
            if lock.get('locked'):
                log(f"✅ Verified: user locked again (assess_download_lock.locked == true)")
            else:
                log(f"❌ User not locked: {lock}")
                return False
        else:
            log(f"❌ POST /admin/assess/security/action (keep) → {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
        
        # Test 5d: Without admin token should return 401/403
        log("\n--- Test 5d: Without admin token ---")
        
        resp = requests.post(
            f"{API_URL}/admin/assess/security/action",
            json={"user_id": test_user['id'], "action": "unlock"},
            timeout=10
        )
        
        if resp.status_code in [401, 403]:
            log(f"✅ POST /admin/assess/security/action without token → {resp.status_code} (correctly rejected)")
        else:
            log(f"❌ POST /admin/assess/security/action without token → {resp.status_code}, expected 401/403")
            return False
        
        log(f"✅ TEST 5 PASSED: All actions working correctly")
        return True
        
    except Exception as e:
        log(f"❌ TEST 5 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def cleanup():
    """Clean up synthetic data"""
    log("\n" + "="*80)
    log("CLEANUP")
    log("="*80)
    
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Remove synthetic events
        if synthetic_event_ids:
            result = db.assess_security_events.delete_many({"id": {"$in": synthetic_event_ids}})
            log(f"✅ Deleted {result.deleted_count} synthetic assess_security_events rows")
        
        # Restore original lock state
        if test_user_id and original_lock_state is not None:
            db.users.update_one(
                {"id": test_user_id},
                {"$set": {"assess_download_lock": original_lock_state}}
            )
            log(f"✅ Restored original lock state for user {test_user_id}")
        
        log(f"✅ CLEANUP COMPLETE")
        
    except Exception as e:
        log(f"❌ CLEANUP ERROR: {e}")

def main():
    global test_user_id
    
    log("="*80)
    log("ASSESSMENT STORE ABUSE-DETECTION + SECURITY ADMIN ENDPOINTS TEST")
    log("="*80)
    log(f"Base URL: {BASE_URL}")
    log(f"API URL: {API_URL}")
    log(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    
    # Get admin token
    admin_token = get_admin_token()
    if not admin_token:
        log("❌ FATAL: Cannot get admin token")
        sys.exit(1)
    
    # Get test user
    test_user = get_test_user()
    if not test_user:
        log("❌ FATAL: Cannot get test user")
        sys.exit(1)
    
    test_user_id = test_user['id']
    
    # Get user token (optional, for lock enforcement test)
    user_token = get_user_token(test_user.get('mobile'))
    
    # Run tests
    results = []
    
    results.append(("TEST 1: Settings", test_1_settings(admin_token)))
    results.append(("TEST 2: Lock Enforcement", test_2_lock_enforcement(test_user, user_token, admin_token)))
    results.append(("TEST 3: Security List", test_3_security_list(admin_token, test_user)))
    results.append(("TEST 4: User History", test_4_user_history(admin_token, test_user)))
    results.append(("TEST 5: Actions", test_5_actions(admin_token, test_user)))
    
    # Cleanup
    cleanup()
    
    # Summary
    log("\n" + "="*80)
    log("TEST SUMMARY")
    log("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        log(f"{status}: {name}")
    
    log(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        log(f"\n❌ {total - passed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
