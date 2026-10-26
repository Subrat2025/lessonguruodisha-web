#!/usr/bin/env python3
"""
Backend test for SSO SECURITY FIX (account-linking model) - Teacher Utility Toolkit auto-login.
PREVIEW ONLY — do NOT deploy.

Test cases:
1. NEW ACCOUNT auto-login + linked
2. EXISTING NOT LINKED -> confirm gate
3. /api/sso/link SAME phone (success)
4. /api/sso/link DIFFERENT phone (rejected)
5. ADMIN cannot be linked
6. AFTER LINK -> auto-login
7. ADMIN UNLINK
8. ADMIN GET shape
9. REGRESSION: guards on /sso/toolkit
"""

import os
import sys
import json
import time
import hmac
import hashlib
import base64
import random
import requests
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/.env')

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')
SSO_TOOLKIT_SECRET = os.getenv('SSO_TOOLKIT_SECRET')
JWT_SECRET = os.getenv('JWT_SECRET')

if not SSO_TOOLKIT_SECRET or not JWT_SECRET:
    print("❌ ERROR: SSO_TOOLKIT_SECRET or JWT_SECRET not found in .env")
    sys.exit(1)

# MongoDB connection
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Test data tracking for cleanup
test_user_ids = []
test_phones = []
test_nonces = []

def generate_test_phone():
    """Generate a valid Indian mobile number (10 digits, starts 6-9)"""
    first_digit = random.choice(['6', '7', '8', '9'])
    rest = ''.join([str(random.randint(0, 9)) for _ in range(9)])
    return first_digit + rest

def create_sso_token(phone, name="Test User", nonce=None):
    """Create a valid SSO token signed with SSO_TOOLKIT_SECRET"""
    if nonce is None:
        nonce = f"test-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
    
    now_ms = int(time.time() * 1000)
    payload = {
        "phone": phone,
        "name": name,
        "iat": now_ms,
        "exp": now_ms + 60000,  # 60 seconds
        "nonce": nonce,
        "src": "toolkit"
    }
    
    # Base64url encode
    json_str = json.dumps(payload, separators=(',', ':'))
    b64 = base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8').rstrip('=')
    
    # HMAC-SHA256 signature
    sig = hmac.new(SSO_TOOLKIT_SECRET.encode('utf-8'), b64.encode('utf-8'), hashlib.sha256).hexdigest()
    
    token = f"{b64}.{sig}"
    test_nonces.append(nonce)
    return token, nonce

def create_link_ticket(phone):
    """Create a valid link ticket signed with SSO_TOOLKIT_SECRET"""
    now_ms = int(time.time() * 1000)
    payload = {
        "phone": phone,
        "purpose": "sso-link",
        "iat": now_ms,
        "exp": now_ms + 600000  # 10 minutes
    }
    
    json_str = json.dumps(payload, separators=(',', ':'))
    b64 = base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8').rstrip('=')
    sig = hmac.new(SSO_TOOLKIT_SECRET.encode('utf-8'), b64.encode('utf-8'), hashlib.sha256).hexdigest()
    
    return f"{b64}.{sig}"

def create_jwt_token(user_id, role='user', session_id='test-session'):
    """Create a JWT token for Bearer auth (mimics signToken from lib/auth.js)"""
    import jwt
    payload = {
        "id": user_id,
        "role": role,
        "sessionId": session_id
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def create_test_user(phone, role='user', password='Test@1234', toolkit_linked=False, suspended=False):
    """Create a test user in MongoDB"""
    import uuid
    from datetime import datetime
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": f"Test User {phone[-4:]}",
        "mobile": phone,
        "password": password,  # In real app this would be hashed
        "role": role,
        "subscription": {
            "plan": None,
            "startDate": None,
            "expiryDate": None,
            "status": "none"
        },
        "mustChangePassword": False,
        "favorites": [],
        "recentLessons": [],
        "referralCode": f"TEST{phone[-4:]}",
        "referredBy": None,
        "waOptIn": False,
        "source": "test",
        "createdAt": datetime.utcnow()
    }
    
    if toolkit_linked:
        user["toolkitLinked"] = True
        user["toolkitLinkedAt"] = datetime.utcnow()
    
    if suspended:
        user["suspended"] = True
    
    db.users.insert_one(user)
    test_user_ids.append(user_id)
    test_phones.append(phone)
    return user

def cleanup():
    """Clean up all test data"""
    print("\n🧹 CLEANUP: Removing test data...")
    
    # Delete test users
    if test_user_ids:
        result = db.users.delete_many({"id": {"$in": test_user_ids}})
        print(f"   Deleted {result.deleted_count} test users")
    
    # Delete test phones (in case some were created by the SSO flow)
    if test_phones:
        result = db.users.delete_many({"mobile": {"$in": test_phones}})
        print(f"   Deleted {result.deleted_count} users by phone")
    
    # Delete test nonces
    if test_nonces:
        result = db.sso_nonces.delete_many({"nonce": {"$in": test_nonces}})
        print(f"   Deleted {result.deleted_count} test nonces")
    
    # Delete test audit entries (all entries with phoneLast4 matching our test phones)
    test_last4s = [p[-4:] for p in test_phones]
    if test_last4s:
        result = db.sso_audit.delete_many({"phoneLast4": {"$in": test_last4s}})
        print(f"   Deleted {result.deleted_count} test audit entries")
    
    # Delete test rate limit entries (optional, they expire anyway)
    # We'll skip this as rate limit entries are IP-based and expire quickly
    
    print("✅ Cleanup complete")

def test_1_new_account_auto_login():
    """TEST 1: NEW ACCOUNT auto-login + linked"""
    print("\n" + "="*80)
    print("TEST 1: NEW ACCOUNT auto-login + linked")
    print("="*80)
    
    try:
        # Generate a fresh random phone
        phone = generate_test_phone()
        test_phones.append(phone)
        print(f"📱 Test phone: {phone}")
        
        # Create a valid SSO token
        token, nonce = create_sso_token(phone, "New Test User")
        print(f"🔑 Created SSO token (nonce: {nonce})")
        
        # Send GET request to /sso/toolkit
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        
        print(f"📡 Response status: {response.status_code}")
        print(f"📍 Location: {response.headers.get('Location', 'N/A')}")
        
        # Verify 302 redirect to /sso/continue
        if response.status_code != 302:
            print(f"❌ FAIL: Expected 302, got {response.status_code}")
            return False
        
        location = response.headers.get('Location', '')
        if not location.startswith('/sso/continue'):
            print(f"❌ FAIL: Expected redirect to /sso/continue, got {location}")
            return False
        
        print("✅ Redirected to /sso/continue")
        
        # Verify user was created in MongoDB
        user = db.users.find_one({"mobile": phone})
        if not user:
            print("❌ FAIL: User not created in MongoDB")
            return False
        
        test_user_ids.append(user['id'])
        print(f"✅ User created with id: {user['id']}")
        
        # Verify user fields
        checks = [
            ("toolkitLinked", True, user.get('toolkitLinked')),
            ("toolkitLinkedAt", "set", user.get('toolkitLinkedAt') is not None),
            ("source", "toolkit", user.get('source')),
            ("password", None, user.get('password')),
            ("referredBy", None, user.get('referredBy')),
            ("waOptIn", False, user.get('waOptIn')),
            ("role", "user", user.get('role')),
            ("subscription.status", "none", user.get('subscription', {}).get('status'))
        ]
        
        all_passed = True
        for field, expected, actual in checks:
            if field == "toolkitLinkedAt":
                if actual:
                    print(f"✅ {field}: set")
                else:
                    print(f"❌ {field}: NOT set (expected set)")
                    all_passed = False
            else:
                if actual == expected:
                    print(f"✅ {field}: {actual}")
                else:
                    print(f"❌ {field}: {actual} (expected {expected})")
                    all_passed = False
        
        # Verify audit log
        last4 = phone[-4:]
        audit_entries = list(db.sso_audit.find({"phoneLast4": last4}).sort("at", -1).limit(5))
        print(f"\n📋 Audit entries for {last4}:")
        for entry in audit_entries:
            print(f"   - {entry.get('result')} at {entry.get('at')}")
        
        # Check for 'linked' and 'ok_new' in audit
        results = [e.get('result') for e in audit_entries]
        if 'linked' in results and 'ok_new' in results:
            print("✅ Audit has 'linked' and 'ok_new'")
        else:
            print(f"❌ Audit missing 'linked' or 'ok_new': {results}")
            all_passed = False
        
        if all_passed:
            print("\n✅ TEST 1 PASSED")
            return True
        else:
            print("\n❌ TEST 1 FAILED")
            return False
            
    except Exception as e:
        print(f"❌ TEST 1 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_2_existing_not_linked_confirm_gate():
    """TEST 2: EXISTING NOT LINKED -> confirm gate"""
    print("\n" + "="*80)
    print("TEST 2: EXISTING NOT LINKED -> confirm gate")
    print("="*80)
    
    try:
        # Create a test user (NOT linked)
        phone = generate_test_phone()
        user = create_test_user(phone, role='user', password='Test@1234', toolkit_linked=False)
        print(f"📱 Created test user: {user['id']} with phone {phone}")
        print(f"   toolkitLinked: {user.get('toolkitLinked', 'NOT SET')}")
        
        # Record initial activeSessionId (should be None or unchanged)
        initial_session_id = user.get('activeSessionId')
        print(f"   Initial activeSessionId: {initial_session_id}")
        
        # Create a valid SSO token for this phone
        token, nonce = create_sso_token(phone, "Existing User")
        print(f"🔑 Created SSO token")
        
        # Send GET request to /sso/toolkit
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        
        print(f"📡 Response status: {response.status_code}")
        print(f"📍 Location: {response.headers.get('Location', 'N/A')}")
        
        # Verify 302 redirect to /sso/confirm (NOT /sso/continue)
        if response.status_code != 302:
            print(f"❌ FAIL: Expected 302, got {response.status_code}")
            return False
        
        location = response.headers.get('Location', '')
        if not location.startswith('/sso/confirm'):
            print(f"❌ FAIL: Expected redirect to /sso/confirm, got {location}")
            return False
        
        # Verify link ticket is present
        if 'lt=' not in location:
            print(f"❌ FAIL: No link ticket (lt=) in redirect URL")
            return False
        
        print("✅ Redirected to /sso/confirm with link ticket")
        
        # Verify NO session was minted (activeSessionId unchanged)
        updated_user = db.users.find_one({"id": user['id']})
        updated_session_id = updated_user.get('activeSessionId')
        
        if updated_session_id == initial_session_id:
            print(f"✅ activeSessionId unchanged: {updated_session_id}")
        else:
            print(f"❌ FAIL: activeSessionId changed from {initial_session_id} to {updated_session_id}")
            return False
        
        # Verify audit log has 'confirm_required'
        last4 = phone[-4:]
        audit_entries = list(db.sso_audit.find({"phoneLast4": last4}).sort("at", -1).limit(3))
        print(f"\n📋 Audit entries for {last4}:")
        for entry in audit_entries:
            print(f"   - {entry.get('result')} at {entry.get('at')}")
        
        results = [e.get('result') for e in audit_entries]
        if 'confirm_required' in results:
            print("✅ Audit has 'confirm_required'")
        else:
            print(f"❌ Audit missing 'confirm_required': {results}")
            return False
        
        print("\n✅ TEST 2 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_3_sso_link_same_phone_success():
    """TEST 3: /api/sso/link SAME phone (success)"""
    print("\n" + "="*80)
    print("TEST 3: /api/sso/link SAME phone (success)")
    print("="*80)
    
    try:
        # Create a test user (NOT linked)
        phone = generate_test_phone()
        user = create_test_user(phone, role='user', password='Test@1234', toolkit_linked=False)
        print(f"📱 Created test user: {user['id']} with phone {phone}")
        print(f"   toolkitLinked: {user.get('toolkitLinked', 'NOT SET')}")
        
        # Mint a Bearer JWT for this user
        jwt_token = create_jwt_token(user['id'], role='user', session_id='test-session')
        print(f"🔑 Created Bearer JWT")
        
        # Build a valid link ticket for the SAME phone
        link_ticket = create_link_ticket(phone)
        print(f"🎫 Created link ticket for {phone}")
        
        # POST /api/sso/link
        url = f"{BASE_URL}/api/sso/link"
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Content-Type": "application/json"
        }
        payload = {"ticket": link_ticket}
        
        response = requests.post(url, headers=headers, json=payload)
        print(f"📡 Response status: {response.status_code}")
        print(f"📄 Response body: {response.text}")
        
        # Verify 200 with ok:true
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if not data.get('ok'):
            print(f"❌ FAIL: Expected ok:true, got {data}")
            return False
        
        print("✅ Response: 200 with ok:true")
        
        # Verify user now has toolkitLinked:true
        updated_user = db.users.find_one({"id": user['id']})
        if updated_user.get('toolkitLinked') == True:
            print(f"✅ User now has toolkitLinked: True")
        else:
            print(f"❌ FAIL: User toolkitLinked: {updated_user.get('toolkitLinked')}")
            return False
        
        # Verify audit log has 'linked'
        last4 = phone[-4:]
        audit_entries = list(db.sso_audit.find({"phoneLast4": last4}).sort("at", -1).limit(3))
        print(f"\n📋 Audit entries for {last4}:")
        for entry in audit_entries:
            print(f"   - {entry.get('result')} at {entry.get('at')}")
        
        results = [e.get('result') for e in audit_entries]
        if 'linked' in results:
            print("✅ Audit has 'linked'")
        else:
            print(f"❌ Audit missing 'linked': {results}")
            return False
        
        print("\n✅ TEST 3 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_4_sso_link_different_phone_rejected():
    """TEST 4: /api/sso/link DIFFERENT phone (rejected)"""
    print("\n" + "="*80)
    print("TEST 4: /api/sso/link DIFFERENT phone (rejected)")
    print("="*80)
    
    try:
        # Create a test user (NOT linked)
        phone_a = generate_test_phone()
        user = create_test_user(phone_a, role='user', password='Test@1234', toolkit_linked=False)
        print(f"📱 Created test user: {user['id']} with phone A: {phone_a}")
        
        # Mint a Bearer JWT for this user
        jwt_token = create_jwt_token(user['id'], role='user', session_id='test-session')
        print(f"🔑 Created Bearer JWT for user with phone A")
        
        # Build a link ticket for a DIFFERENT phone B
        phone_b = generate_test_phone()
        test_phones.append(phone_b)
        link_ticket = create_link_ticket(phone_b)
        print(f"🎫 Created link ticket for DIFFERENT phone B: {phone_b}")
        
        # POST /api/sso/link
        url = f"{BASE_URL}/api/sso/link"
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Content-Type": "application/json"
        }
        payload = {"ticket": link_ticket}
        
        response = requests.post(url, headers=headers, json=payload)
        print(f"📡 Response status: {response.status_code}")
        print(f"📄 Response body: {response.text}")
        
        # Verify 403 with error about different number
        if response.status_code != 403:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            return False
        
        data = response.json()
        error_msg = data.get('error', '').lower()
        if 'different' not in error_msg and 'mismatch' not in error_msg:
            print(f"❌ FAIL: Expected error about different number, got: {data}")
            return False
        
        print("✅ Response: 403 with error about different number")
        
        # Verify user's toolkitLinked was NOT changed
        updated_user = db.users.find_one({"id": user['id']})
        if updated_user.get('toolkitLinked') != True:
            print(f"✅ User toolkitLinked NOT changed: {updated_user.get('toolkitLinked', 'NOT SET')}")
        else:
            print(f"❌ FAIL: User was incorrectly linked: {updated_user.get('toolkitLinked')}")
            return False
        
        # Verify audit log has 'link_mismatch'
        last4_a = phone_a[-4:]
        audit_entries = list(db.sso_audit.find({"phoneLast4": last4_a}).sort("at", -1).limit(3))
        print(f"\n📋 Audit entries for {last4_a}:")
        for entry in audit_entries:
            print(f"   - {entry.get('result')} at {entry.get('at')}")
        
        results = [e.get('result') for e in audit_entries]
        if 'link_mismatch' in results:
            print("✅ Audit has 'link_mismatch'")
        else:
            print(f"❌ Audit missing 'link_mismatch': {results}")
            return False
        
        print("\n✅ TEST 4 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_5_admin_cannot_be_linked():
    """TEST 5: ADMIN cannot be linked"""
    print("\n" + "="*80)
    print("TEST 5: ADMIN cannot be linked")
    print("="*80)
    
    try:
        # Create an admin user (NOT linked)
        phone = generate_test_phone()
        user = create_test_user(phone, role='admin', password='Admin@1234', toolkit_linked=False)
        print(f"📱 Created admin user: {user['id']} with phone {phone}")
        
        # Mint a Bearer JWT for this admin
        jwt_token = create_jwt_token(user['id'], role='admin', session_id='test-session')
        print(f"🔑 Created Bearer JWT for admin")
        
        # Build a link ticket for the SAME phone
        link_ticket = create_link_ticket(phone)
        print(f"🎫 Created link ticket for admin's phone")
        
        # POST /api/sso/link
        url = f"{BASE_URL}/api/sso/link"
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Content-Type": "application/json"
        }
        payload = {"ticket": link_ticket}
        
        response = requests.post(url, headers=headers, json=payload)
        print(f"📡 Response status: {response.status_code}")
        print(f"📄 Response body: {response.text}")
        
        # Verify 403 (not allowed)
        if response.status_code != 403:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            return False
        
        print("✅ Response: 403 (admin cannot be linked)")
        
        # Verify user was NOT linked
        updated_user = db.users.find_one({"id": user['id']})
        if updated_user.get('toolkitLinked') != True:
            print(f"✅ Admin NOT linked: {updated_user.get('toolkitLinked', 'NOT SET')}")
        else:
            print(f"❌ FAIL: Admin was incorrectly linked")
            return False
        
        # Verify audit log has 'link_admin_blocked'
        last4 = phone[-4:]
        audit_entries = list(db.sso_audit.find({"phoneLast4": last4}).sort("at", -1).limit(3))
        print(f"\n📋 Audit entries for {last4}:")
        for entry in audit_entries:
            print(f"   - {entry.get('result')} at {entry.get('at')}")
        
        results = [e.get('result') for e in audit_entries]
        if 'link_admin_blocked' in results:
            print("✅ Audit has 'link_admin_blocked'")
        else:
            print(f"⚠️  Audit missing 'link_admin_blocked': {results} (minor issue)")
        
        print("\n✅ TEST 5 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 5 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_6_after_link_auto_login():
    """TEST 6: AFTER LINK -> auto-login"""
    print("\n" + "="*80)
    print("TEST 6: AFTER LINK -> auto-login")
    print("="*80)
    
    try:
        # Create a test user that is ALREADY linked
        phone = generate_test_phone()
        user = create_test_user(phone, role='user', password='Test@1234', toolkit_linked=True)
        print(f"📱 Created linked user: {user['id']} with phone {phone}")
        print(f"   toolkitLinked: {user.get('toolkitLinked')}")
        
        # Create a fresh valid SSO token for this phone
        token, nonce = create_sso_token(phone, "Linked User")
        print(f"🔑 Created SSO token")
        
        # Send GET request to /sso/toolkit
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        
        print(f"📡 Response status: {response.status_code}")
        print(f"📍 Location: {response.headers.get('Location', 'N/A')}")
        
        # Verify 302 redirect to /sso/continue (auto-login, NOT /sso/confirm)
        if response.status_code != 302:
            print(f"❌ FAIL: Expected 302, got {response.status_code}")
            return False
        
        location = response.headers.get('Location', '')
        if not location.startswith('/sso/continue'):
            print(f"❌ FAIL: Expected redirect to /sso/continue, got {location}")
            return False
        
        print("✅ Redirected to /sso/continue (auto-login)")
        
        # Verify destination is /plans or /lessons
        if 'to=' in location:
            dest = location.split('to=')[1].split('&')[0]
            dest = requests.utils.unquote(dest)
            if dest in ['/plans', '/lessons']:
                print(f"✅ Destination: {dest}")
            else:
                print(f"⚠️  Unexpected destination: {dest}")
        
        print("\n✅ TEST 6 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 6 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_7_admin_unlink():
    """TEST 7: ADMIN UNLINK"""
    print("\n" + "="*80)
    print("TEST 7: ADMIN UNLINK")
    print("="*80)
    
    try:
        # Create a linked user
        phone = generate_test_phone()
        user = create_test_user(phone, role='user', password='Test@1234', toolkit_linked=True)
        print(f"📱 Created linked user: {user['id']} with phone {phone}")
        print(f"   toolkitLinked: {user.get('toolkitLinked')}")
        
        # Create an admin user for auth
        admin_phone = generate_test_phone()
        admin_user = create_test_user(admin_phone, role='admin', password='Admin@1234')
        admin_jwt = create_jwt_token(admin_user['id'], role='admin')
        print(f"👤 Created admin user: {admin_user['id']}")
        
        # POST /api/admin/sso-toolkit/unlink
        url = f"{BASE_URL}/api/admin/sso-toolkit/unlink"
        headers = {
            "Authorization": f"Bearer {admin_jwt}",
            "Content-Type": "application/json"
        }
        payload = {"userId": user['id']}
        
        response = requests.post(url, headers=headers, json=payload)
        print(f"📡 Response status: {response.status_code}")
        print(f"📄 Response body: {response.text}")
        
        # Verify 200 with ok:true
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if not data.get('ok'):
            print(f"❌ FAIL: Expected ok:true, got {data}")
            return False
        
        print("✅ Response: 200 with ok:true")
        
        # Verify user now has toolkitLinked:false
        updated_user = db.users.find_one({"id": user['id']})
        if updated_user.get('toolkitLinked') == False or 'toolkitLinked' not in updated_user:
            print(f"✅ User now has toolkitLinked: {updated_user.get('toolkitLinked', 'NOT SET')}")
        else:
            print(f"❌ FAIL: User still linked: {updated_user.get('toolkitLinked')}")
            return False
        
        # Verify toolkitLinkedAt is unset
        if 'toolkitLinkedAt' not in updated_user:
            print(f"✅ toolkitLinkedAt unset")
        else:
            print(f"⚠️  toolkitLinkedAt still present: {updated_user.get('toolkitLinkedAt')}")
        
        # Verify audit log has 'unlinked'
        last4 = phone[-4:]
        audit_entries = list(db.sso_audit.find({"phoneLast4": last4}).sort("at", -1).limit(3))
        print(f"\n📋 Audit entries for {last4}:")
        for entry in audit_entries:
            print(f"   - {entry.get('result')} at {entry.get('at')}")
        
        results = [e.get('result') for e in audit_entries]
        if 'unlinked' in results:
            print("✅ Audit has 'unlinked'")
        else:
            print(f"❌ Audit missing 'unlinked': {results}")
            return False
        
        # NOW send a fresh /sso/toolkit token -> should redirect to /sso/confirm again
        print("\n🔄 Testing that unlinked user now requires confirm again...")
        token, nonce = create_sso_token(phone, "Unlinked User")
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        
        print(f"📡 Response status: {response.status_code}")
        print(f"📍 Location: {response.headers.get('Location', 'N/A')}")
        
        location = response.headers.get('Location', '')
        if location.startswith('/sso/confirm'):
            print("✅ Unlinked user now redirected to /sso/confirm (gate returns)")
        else:
            print(f"❌ FAIL: Expected /sso/confirm, got {location}")
            return False
        
        print("\n✅ TEST 7 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ TEST 7 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_8_admin_get_shape():
    """TEST 8: ADMIN GET shape"""
    print("\n" + "="*80)
    print("TEST 8: ADMIN GET shape")
    print("="*80)
    
    try:
        # Create an admin user
        admin_phone = generate_test_phone()
        admin_user = create_test_user(admin_phone, role='admin', password='Admin@1234')
        admin_jwt = create_jwt_token(admin_user['id'], role='admin')
        print(f"👤 Created admin user: {admin_user['id']}")
        
        # Create a linked user for the linked list
        linked_phone = generate_test_phone()
        linked_user = create_test_user(linked_phone, role='user', toolkit_linked=True)
        print(f"📱 Created linked user: {linked_user['id']}")
        
        # Test 1: No token -> 401
        print("\n🔍 Test 8a: No token -> 401")
        url = f"{BASE_URL}/api/admin/sso-toolkit"
        response = requests.get(url)
        print(f"📡 Response status: {response.status_code}")
        if response.status_code == 401:
            print("✅ No token -> 401")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
            return False
        
        # Test 2: Non-admin token -> 403
        print("\n🔍 Test 8b: Non-admin token -> 403")
        non_admin_phone = generate_test_phone()
        non_admin_user = create_test_user(non_admin_phone, role='user')
        non_admin_jwt = create_jwt_token(non_admin_user['id'], role='user')
        headers = {"Authorization": f"Bearer {non_admin_jwt}"}
        response = requests.get(url, headers=headers)
        print(f"📡 Response status: {response.status_code}")
        if response.status_code == 403:
            print("✅ Non-admin token -> 403")
        else:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            return False
        
        # Test 3: Admin token -> 200 with correct shape
        print("\n🔍 Test 8c: Admin token -> 200 with correct shape")
        headers = {"Authorization": f"Bearer {admin_jwt}"}
        response = requests.get(url, headers=headers)
        print(f"📡 Response status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"📄 Response keys: {list(data.keys())}")
        
        # Verify required keys
        required_keys = ['ok', 'settings', 'currentHostType', 'audit', 'linked']
        all_present = True
        for key in required_keys:
            if key in data:
                print(f"✅ {key}: present")
            else:
                print(f"❌ {key}: MISSING")
                all_present = False
        
        if not all_present:
            return False
        
        # Verify 'linked' is an array
        if not isinstance(data['linked'], list):
            print(f"❌ FAIL: 'linked' is not an array: {type(data['linked'])}")
            return False
        
        print(f"✅ 'linked' is an array with {len(data['linked'])} items")
        
        # Verify linked items have correct shape
        if len(data['linked']) > 0:
            item = data['linked'][0]
            print(f"\n📋 First linked item: {item}")
            
            required_item_keys = ['id', 'name', 'phoneLast4', 'linkedAt', 'source']
            for key in required_item_keys:
                if key in item:
                    print(f"✅ {key}: {item[key]}")
                else:
                    print(f"❌ {key}: MISSING")
                    all_present = False
            
            # Verify phoneLast4 is only last 4 digits (never full phone)
            phone_last4 = item.get('phoneLast4', '')
            if len(phone_last4) == 4 and phone_last4.isdigit():
                print(f"✅ phoneLast4 is last 4 digits only: {phone_last4}")
            else:
                print(f"❌ FAIL: phoneLast4 is not 4 digits: {phone_last4}")
                all_present = False
        
        # Test 4: Unlink route with non-admin -> 403
        print("\n🔍 Test 8d: Unlink route with non-admin -> 403")
        unlink_url = f"{BASE_URL}/api/admin/sso-toolkit/unlink"
        headers = {"Authorization": f"Bearer {non_admin_jwt}", "Content-Type": "application/json"}
        payload = {"userId": linked_user['id']}
        response = requests.post(unlink_url, headers=headers, json=payload)
        print(f"📡 Response status: {response.status_code}")
        if response.status_code == 403:
            print("✅ Unlink route with non-admin -> 403")
        else:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            return False
        
        if all_present:
            print("\n✅ TEST 8 PASSED")
            return True
        else:
            print("\n❌ TEST 8 FAILED")
            return False
        
    except Exception as e:
        print(f"❌ TEST 8 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_9_regression_guards():
    """TEST 9: REGRESSION - guards on /sso/toolkit"""
    print("\n" + "="*80)
    print("TEST 9: REGRESSION - guards on /sso/toolkit")
    print("="*80)
    
    try:
        all_passed = True
        
        # Test 9a: Expired token -> /sso/expired
        print("\n🔍 Test 9a: Expired token -> /sso/expired")
        phone = generate_test_phone()
        test_phones.append(phone)
        
        # Create token with exp in the past
        nonce = f"test-expired-{int(time.time() * 1000)}"
        now_ms = int(time.time() * 1000)
        payload = {
            "phone": phone,
            "name": "Test",
            "iat": now_ms - 120000,  # 2 minutes ago
            "exp": now_ms - 60000,   # 1 minute ago (expired)
            "nonce": nonce,
            "src": "toolkit"
        }
        json_str = json.dumps(payload, separators=(',', ':'))
        b64 = base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8').rstrip('=')
        sig = hmac.new(SSO_TOOLKIT_SECRET.encode('utf-8'), b64.encode('utf-8'), hashlib.sha256).hexdigest()
        token = f"{b64}.{sig}"
        test_nonces.append(nonce)
        
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        location = response.headers.get('Location', '')
        
        if location == '/sso/expired':
            print("✅ Expired token -> /sso/expired")
        else:
            print(f"❌ FAIL: Expected /sso/expired, got {location}")
            all_passed = False
        
        # Test 9b: Tampered signature -> /sso/expired
        print("\n🔍 Test 9b: Tampered signature -> /sso/expired")
        phone = generate_test_phone()
        test_phones.append(phone)
        token, nonce = create_sso_token(phone)
        # Tamper with the signature
        parts = token.split('.')
        tampered_sig = parts[1][:-4] + 'XXXX'
        tampered_token = f"{parts[0]}.{tampered_sig}"
        
        url = f"{BASE_URL}/sso/toolkit?token={tampered_token}"
        response = requests.get(url, allow_redirects=False)
        location = response.headers.get('Location', '')
        
        if location == '/sso/expired':
            print("✅ Tampered signature -> /sso/expired")
        else:
            print(f"❌ FAIL: Expected /sso/expired, got {location}")
            all_passed = False
        
        # Test 9c: Reused nonce -> /sso/expired
        print("\n🔍 Test 9c: Reused nonce -> /sso/expired")
        phone = generate_test_phone()
        test_phones.append(phone)
        reused_nonce = f"test-reused-{int(time.time() * 1000)}"
        
        # First use
        token1, _ = create_sso_token(phone, nonce=reused_nonce)
        url = f"{BASE_URL}/sso/toolkit?token={token1}"
        response1 = requests.get(url, allow_redirects=False)
        print(f"   First use: {response1.headers.get('Location', '')}")
        
        # Second use (replay)
        token2, _ = create_sso_token(phone, nonce=reused_nonce)
        url = f"{BASE_URL}/sso/toolkit?token={token2}"
        response2 = requests.get(url, allow_redirects=False)
        location2 = response2.headers.get('Location', '')
        
        if location2 == '/sso/expired':
            print("✅ Reused nonce -> /sso/expired")
        else:
            print(f"❌ FAIL: Expected /sso/expired, got {location2}")
            all_passed = False
        
        # Test 9d: Admin phone -> /sso/expired (admin_blocked)
        print("\n🔍 Test 9d: Admin phone -> /sso/expired (admin_blocked)")
        admin_phone = generate_test_phone()
        admin_user = create_test_user(admin_phone, role='admin')
        
        token, nonce = create_sso_token(admin_phone, "Admin User")
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        location = response.headers.get('Location', '')
        
        if location == '/sso/expired':
            print("✅ Admin phone -> /sso/expired")
            
            # Check audit for 'admin_blocked'
            last4 = admin_phone[-4:]
            audit_entries = list(db.sso_audit.find({"phoneLast4": last4}).sort("at", -1).limit(3))
            results = [e.get('result') for e in audit_entries]
            if 'admin_blocked' in results:
                print("✅ Audit has 'admin_blocked'")
            else:
                print(f"⚠️  Audit missing 'admin_blocked': {results}")
        else:
            print(f"❌ FAIL: Expected /sso/expired, got {location}")
            all_passed = False
        
        # Test 9e: Suspended user -> /sso/expired
        print("\n🔍 Test 9e: Suspended user -> /sso/expired")
        suspended_phone = generate_test_phone()
        suspended_user = create_test_user(suspended_phone, role='user', suspended=True)
        
        token, nonce = create_sso_token(suspended_phone, "Suspended User")
        url = f"{BASE_URL}/sso/toolkit?token={token}"
        response = requests.get(url, allow_redirects=False)
        location = response.headers.get('Location', '')
        
        if location == '/sso/expired':
            print("✅ Suspended user -> /sso/expired")
        else:
            print(f"❌ FAIL: Expected /sso/expired, got {location}")
            all_passed = False
        
        if all_passed:
            print("\n✅ TEST 9 PASSED")
            return True
        else:
            print("\n❌ TEST 9 FAILED")
            return False
        
    except Exception as e:
        print(f"❌ TEST 9 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("SSO SECURITY FIX - Backend Testing")
    print("PREVIEW ONLY — do NOT deploy")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    print(f"SSO_TOOLKIT_SECRET: {'SET' if SSO_TOOLKIT_SECRET else 'NOT SET'}")
    print(f"JWT_SECRET: {'SET' if JWT_SECRET else 'NOT SET'}")
    print("="*80)
    
    results = {}
    
    try:
        # Run all tests
        results['test_1'] = test_1_new_account_auto_login()
        results['test_2'] = test_2_existing_not_linked_confirm_gate()
        results['test_3'] = test_3_sso_link_same_phone_success()
        results['test_4'] = test_4_sso_link_different_phone_rejected()
        results['test_5'] = test_5_admin_cannot_be_linked()
        results['test_6'] = test_6_after_link_auto_login()
        results['test_7'] = test_7_admin_unlink()
        results['test_8'] = test_8_admin_get_shape()
        results['test_9'] = test_9_regression_guards()
        
    finally:
        # Always cleanup
        cleanup()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({int(passed/total*100)}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
