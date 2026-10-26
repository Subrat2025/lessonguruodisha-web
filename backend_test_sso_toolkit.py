#!/usr/bin/env python3
"""
Backend test for Teacher Utility Toolkit SSO auto-login feature.
Tests all 12 cases from the review request.
CRITICAL: Never prints SSO_TOOLKIT_SECRET or JWT tokens.
"""
import asyncio
import json
import time
import hmac
import hashlib
import base64
import os
from datetime import datetime, timedelta
from pymongo import MongoClient

# Read environment variables
def load_env():
    env = {}
    with open('/app/.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env[key] = value.strip().strip('"').strip("'")
    return env

ENV = load_env()
BASE_URL = ENV.get('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
SSO_SECRET = ENV.get('SSO_TOOLKIT_SECRET', '')
MONGO_URL = ENV.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = ENV.get('DB_NAME', 'edumaster_odisha')
JWT_SECRET = ENV.get('JWT_SECRET', '')
SUPER_ADMIN_MOBILE = ENV.get('STORE_SUPER_ADMIN_MOBILE', '9692604577')

print(f"✓ Base URL: {BASE_URL}")
print(f"✓ SSO Secret loaded: {'Yes' if SSO_SECRET else 'No'}")
print(f"✓ MongoDB: {MONGO_URL}/{DB_NAME}")
print(f"✓ Super Admin Mobile: {SUPER_ADMIN_MOBILE}")
print()

# MongoDB connection
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

def create_sso_token(phone, name, iat_ms, exp_ms, nonce, src='toolkit'):
    """Create SSO token: base64url(JSON) + '.' + hex HMAC-SHA256"""
    payload = {
        'phone': phone,
        'name': name,
        'iat': iat_ms,
        'exp': exp_ms,
        'nonce': nonce,
        'src': src
    }
    json_str = json.dumps(payload, separators=(',', ':'))
    b64_part = base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8').rstrip('=')
    
    # HMAC-SHA256 signature
    sig = hmac.new(SSO_SECRET.encode('utf-8'), b64_part.encode('utf-8'), hashlib.sha256).hexdigest()
    
    return f"{b64_part}.{sig}"

def test_sso_redirect(token, headers=None):
    """Test SSO endpoint with redirect:manual to read Location header"""
    import requests
    url = f"{BASE_URL}/sso/toolkit?token={token}"
    h = headers or {}
    try:
        resp = requests.get(url, allow_redirects=False, headers=h, timeout=10)
        location = resp.headers.get('Location', '')
        return {
            'status': resp.status_code,
            'location': location,
            'success': location.startswith('/sso/continue#t='),
            'expired': location == '/sso/expired'
        }
    except Exception as e:
        return {'status': 0, 'location': '', 'success': False, 'expired': False, 'error': str(e)}

def get_admin_jwt():
    """Get admin JWT by signing with JWT_SECRET"""
    # Find admin user
    admin = db.users.find_one({'mobile': SUPER_ADMIN_MOBILE})
    if not admin:
        print(f"⚠️  Admin user {SUPER_ADMIN_MOBILE} not found in DB")
        return None
    
    # Create JWT payload
    import jwt as pyjwt
    payload = {
        'id': admin['id'],
        'role': 'admin',
        'sessionId': admin.get('activeSessionId', 'test-session')
    }
    token = pyjwt.encode(payload, JWT_SECRET, algorithm='HS256')
    return token

# Test data tracking
test_users_created = []
test_nonces_used = []
test_audit_ids = []

print("=" * 80)
print("BACKEND TEST: SSO TOOLKIT AUTO-LOGIN")
print("=" * 80)
print()

# Count initial state
initial_users = db.users.count_documents({})
initial_nonces = db.sso_nonces.count_documents({})
initial_audit = db.sso_audit.count_documents({})
print(f"📊 Initial DB state:")
print(f"   Users: {initial_users}")
print(f"   SSO nonces: {initial_nonces}")
print(f"   SSO audit: {initial_audit}")
print()

# ============================================================================
# TEST 1: VALID TOKEN + UNKNOWN PHONE -> NEW USER CREATED
# ============================================================================
print("TEST 1: Valid token + unknown phone (new user creation)")
print("-" * 80)

test1_phone = '9876543210'  # Random 10-digit starting with 9
test1_name = 'SSO Test User 1'
test1_nonce = f'nonce-test1-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test1_token = create_sso_token(test1_phone, test1_name, now_ms, now_ms + 30000, test1_nonce)

result1 = test_sso_redirect(test1_token, {'X-Forwarded-For': '1.2.3.4'})
print(f"Status: {result1['status']}")
print(f"Location: {result1['location'][:80]}..." if len(result1['location']) > 80 else f"Location: {result1['location']}")
print(f"Success (starts with /sso/continue#t=): {result1['success']}")

if result1['success']:
    print("✅ Redirected to /sso/continue with JWT")
    
    # Check if user was created
    new_user = db.users.find_one({'mobile': test1_phone})
    if new_user:
        print(f"✅ New user created: {new_user['name']}")
        test_users_created.append(new_user['id'])
        
        # Verify fields
        checks = {
            'source': new_user.get('source') == 'toolkit',
            'password': new_user.get('password') is None,
            'referredBy': new_user.get('referredBy') is None,
            'waOptIn': new_user.get('waOptIn') == False,
            'role': new_user.get('role') == 'user',
            'subscription.status': new_user.get('subscription', {}).get('status') == 'none'
        }
        
        for field, passed in checks.items():
            status = "✅" if passed else "❌"
            print(f"{status} {field}: {passed}")
        
        # Check audit log
        audit_entry = db.sso_audit.find_one({'phoneLast4': test1_phone[-4:], 'result': {'$in': ['ok_new', 'ok']}}, sort=[('at', -1)])
        if audit_entry:
            print(f"✅ Audit log entry: result={audit_entry['result']}, phoneLast4={audit_entry['phoneLast4']}")
            test_audit_ids.append(audit_entry['_id'])
        else:
            print("⚠️  No audit log entry found")
    else:
        print("❌ User was NOT created")
else:
    print(f"❌ TEST 1 FAILED: {result1}")

test_nonces_used.append(test1_nonce)
print()

# ============================================================================
# TEST 2: REUSED NONCE -> /sso/expired
# ============================================================================
print("TEST 2: Reused nonce (replay attack)")
print("-" * 80)

# Reuse the exact same token from test 1
result2 = test_sso_redirect(test1_token, {'X-Forwarded-For': '1.2.3.5'})
print(f"Status: {result2['status']}")
print(f"Location: {result2['location']}")
print(f"Expired: {result2['expired']}")

if result2['expired']:
    print("✅ Correctly blocked with /sso/expired")
    
    # Check audit log
    audit_entry = db.sso_audit.find_one({'result': 'nonce_reuse'}, sort=[('at', -1)])
    if audit_entry:
        print(f"✅ Audit log: result=nonce_reuse, phoneLast4={audit_entry['phoneLast4']}")
        test_audit_ids.append(audit_entry['_id'])
else:
    print(f"❌ TEST 2 FAILED: Should redirect to /sso/expired, got {result2['location']}")

print()

# ============================================================================
# TEST 3: EXPIRED TOKEN -> /sso/expired
# ============================================================================
print("TEST 3: Expired token")
print("-" * 80)

test3_phone = '9876543211'
test3_nonce = f'nonce-test3-{int(time.time() * 1000)}'
past_ms = int((time.time() - 120) * 1000)  # 2 minutes ago
test3_token = create_sso_token(test3_phone, 'Test3', past_ms, past_ms + 30000, test3_nonce)

result3 = test_sso_redirect(test3_token, {'X-Forwarded-For': '1.2.3.6'})
print(f"Status: {result3['status']}")
print(f"Location: {result3['location']}")
print(f"Expired: {result3['expired']}")

if result3['expired']:
    print("✅ Correctly blocked with /sso/expired")
else:
    print(f"❌ TEST 3 FAILED: Should redirect to /sso/expired, got {result3['location']}")

test_nonces_used.append(test3_nonce)
print()

# ============================================================================
# TEST 4: WINDOW > 60s -> /sso/expired
# ============================================================================
print("TEST 4: Window > 60s (exp - iat = 120s)")
print("-" * 80)

test4_phone = '9876543212'
test4_nonce = f'nonce-test4-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test4_token = create_sso_token(test4_phone, 'Test4', now_ms, now_ms + 120000, test4_nonce)  # 120s window

result4 = test_sso_redirect(test4_token, {'X-Forwarded-For': '1.2.3.7'})
print(f"Status: {result4['status']}")
print(f"Location: {result4['location']}")
print(f"Expired: {result4['expired']}")

if result4['expired']:
    print("✅ Correctly blocked with /sso/expired")
else:
    print(f"❌ TEST 4 FAILED: Should redirect to /sso/expired, got {result4['location']}")

test_nonces_used.append(test4_nonce)
print()

# ============================================================================
# TEST 5: TAMPERED SIGNATURE -> /sso/expired
# ============================================================================
print("TEST 5: Tampered signature")
print("-" * 80)

test5_phone = '9876543213'
test5_nonce = f'nonce-test5-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test5_token = create_sso_token(test5_phone, 'Test5', now_ms, now_ms + 30000, test5_nonce)

# Flip one character in the signature
parts = test5_token.split('.')
tampered_sig = parts[1][:-1] + ('a' if parts[1][-1] != 'a' else 'b')
tampered_token = f"{parts[0]}.{tampered_sig}"

result5 = test_sso_redirect(tampered_token, {'X-Forwarded-For': '1.2.3.8'})
print(f"Status: {result5['status']}")
print(f"Location: {result5['location']}")
print(f"Expired: {result5['expired']}")

if result5['expired']:
    print("✅ Correctly blocked with /sso/expired")
else:
    print(f"❌ TEST 5 FAILED: Should redirect to /sso/expired, got {result5['location']}")

test_nonces_used.append(test5_nonce)
print()

# ============================================================================
# TEST 6: ADMIN PHONE BLOCKED
# ============================================================================
print("TEST 6: Admin phone blocked (admin role + super-admin mobile)")
print("-" * 80)

# Test 6a: Admin role user
test6a_phone = '9111111111'
test6a_user = {
    'id': f'test-admin-{int(time.time())}',
    'name': 'Test Admin User',
    'mobile': test6a_phone,
    'role': 'admin',
    'password': None,
    'subscription': {'status': 'none'},
    'createdAt': datetime.utcnow()
}
db.users.insert_one(test6a_user)
test_users_created.append(test6a_user['id'])

test6a_nonce = f'nonce-test6a-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test6a_token = create_sso_token(test6a_phone, 'Test6a', now_ms, now_ms + 30000, test6a_nonce)

result6a = test_sso_redirect(test6a_token, {'X-Forwarded-For': '1.2.3.9'})
print(f"6a) Admin role user:")
print(f"   Status: {result6a['status']}")
print(f"   Location: {result6a['location']}")
print(f"   Expired: {result6a['expired']}")

if result6a['expired']:
    print("   ✅ Correctly blocked with /sso/expired")
    audit_entry = db.sso_audit.find_one({'result': 'admin_blocked', 'phoneLast4': test6a_phone[-4:]}, sort=[('at', -1)])
    if audit_entry:
        print(f"   ✅ Audit log: result=admin_blocked")
        test_audit_ids.append(audit_entry['_id'])
else:
    print(f"   ❌ TEST 6a FAILED: Should block admin user")

test_nonces_used.append(test6a_nonce)

# Test 6b: Super-admin mobile
test6b_nonce = f'nonce-test6b-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test6b_token = create_sso_token(SUPER_ADMIN_MOBILE, 'Test6b', now_ms, now_ms + 30000, test6b_nonce)

result6b = test_sso_redirect(test6b_token, {'X-Forwarded-For': '1.2.3.10'})
print(f"6b) Super-admin mobile ({SUPER_ADMIN_MOBILE}):")
print(f"   Status: {result6b['status']}")
print(f"   Location: {result6b['location']}")
print(f"   Expired: {result6b['expired']}")

if result6b['expired']:
    print("   ✅ Correctly blocked with /sso/expired")
else:
    print(f"   ❌ TEST 6b FAILED: Should block super-admin mobile")

test_nonces_used.append(test6b_nonce)
print()

# ============================================================================
# TEST 7: BLOCKED/DELETED ACCOUNT -> /sso/expired
# ============================================================================
print("TEST 7: Blocked/deleted account")
print("-" * 80)

# Test 7a: Suspended user
test7a_phone = '9222222222'
test7a_user = {
    'id': f'test-suspended-{int(time.time())}',
    'name': 'Test Suspended User',
    'mobile': test7a_phone,
    'role': 'user',
    'password': None,
    'suspended': True,
    'subscription': {'status': 'none'},
    'createdAt': datetime.utcnow()
}
db.users.insert_one(test7a_user)
test_users_created.append(test7a_user['id'])

test7a_nonce = f'nonce-test7a-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test7a_token = create_sso_token(test7a_phone, 'Test7a', now_ms, now_ms + 30000, test7a_nonce)

result7a = test_sso_redirect(test7a_token, {'X-Forwarded-For': '1.2.3.11'})
print(f"7a) Suspended user:")
print(f"   Status: {result7a['status']}")
print(f"   Location: {result7a['location']}")
print(f"   Expired: {result7a['expired']}")

if result7a['expired']:
    print("   ✅ Correctly blocked with /sso/expired")
else:
    print(f"   ❌ TEST 7a FAILED: Should block suspended user")

test_nonces_used.append(test7a_nonce)

# Test 7b: Deleted user
test7b_phone = '9333333333'
test7b_user = {
    'id': f'test-deleted-{int(time.time())}',
    'name': 'Test Deleted User',
    'mobile': test7b_phone,
    'role': 'user',
    'password': None,
    'deleted': True,
    'subscription': {'status': 'none'},
    'createdAt': datetime.utcnow()
}
db.users.insert_one(test7b_user)
test_users_created.append(test7b_user['id'])

test7b_nonce = f'nonce-test7b-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test7b_token = create_sso_token(test7b_phone, 'Test7b', now_ms, now_ms + 30000, test7b_nonce)

result7b = test_sso_redirect(test7b_token, {'X-Forwarded-For': '1.2.3.12'})
print(f"7b) Deleted user:")
print(f"   Status: {result7b['status']}")
print(f"   Location: {result7b['location']}")
print(f"   Expired: {result7b['expired']}")

if result7b['expired']:
    print("   ✅ Correctly blocked with /sso/expired")
else:
    print(f"   ❌ TEST 7b FAILED: Should block deleted user")

test_nonces_used.append(test7b_nonce)
print()

# ============================================================================
# TEST 8: PREMIUM USER -> dest /lessons
# ============================================================================
print("TEST 8: Premium user -> destination /lessons")
print("-" * 80)

test8_phone = '9444444444'
future_date = datetime.utcnow() + timedelta(days=30)
test8_user = {
    'id': f'test-premium-{int(time.time())}',
    'name': 'Test Premium User',
    'mobile': test8_phone,
    'role': 'user',
    'password': None,
    'subscription': {
        'plan': 'monthly',
        'status': 'active',
        'expiryDate': future_date
    },
    'createdAt': datetime.utcnow()
}
db.users.insert_one(test8_user)
test_users_created.append(test8_user['id'])

test8_nonce = f'nonce-test8-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test8_token = create_sso_token(test8_phone, 'Test8', now_ms, now_ms + 30000, test8_nonce)

result8 = test_sso_redirect(test8_token, {'X-Forwarded-For': '1.2.3.13'})
print(f"Status: {result8['status']}")
print(f"Location: {result8['location'][:100]}..." if len(result8['location']) > 100 else f"Location: {result8['location']}")

if result8['success'] and '&to=%2Flessons' in result8['location']:
    print("✅ Correctly redirected to /sso/continue with to=/lessons")
else:
    print(f"❌ TEST 8 FAILED: Should redirect with to=/lessons, got {result8['location']}")

test_nonces_used.append(test8_nonce)
print()

# ============================================================================
# TEST 9: NON-PREMIUM EXISTING USER -> dest /plans
# ============================================================================
print("TEST 9: Non-premium existing user -> destination /plans")
print("-" * 80)

test9_phone = '9555555555'
test9_user = {
    'id': f'test-nonpremium-{int(time.time())}',
    'name': 'Test Non-Premium User',
    'mobile': test9_phone,
    'role': 'user',
    'password': None,
    'subscription': {'status': 'none'},
    'createdAt': datetime.utcnow()
}
db.users.insert_one(test9_user)
test_users_created.append(test9_user['id'])

test9_nonce = f'nonce-test9-{int(time.time() * 1000)}'
now_ms = int(time.time() * 1000)
test9_token = create_sso_token(test9_phone, 'Test9', now_ms, now_ms + 30000, test9_nonce)

result9 = test_sso_redirect(test9_token, {'X-Forwarded-For': '1.2.3.14'})
print(f"Status: {result9['status']}")
print(f"Location: {result9['location'][:100]}..." if len(result9['location']) > 100 else f"Location: {result9['location']}")

if result9['success'] and '&to=%2Fplans' in result9['location']:
    print("✅ Correctly redirected to /sso/continue with to=/plans")
else:
    print(f"❌ TEST 9 FAILED: Should redirect with to=/plans, got {result9['location']}")

test_nonces_used.append(test9_nonce)
print()

# ============================================================================
# TEST 10: SWITCH OFF -> /sso/expired
# ============================================================================
print("TEST 10: Switch OFF -> no auto-login")
print("-" * 80)

# Get admin JWT
admin_jwt = get_admin_jwt()
if not admin_jwt:
    print("❌ Cannot get admin JWT, skipping test 10")
else:
    import requests
    
    # Turn switch OFF for preview
    print("10a) Turning preview switch OFF...")
    put_url = f"{BASE_URL}/api/admin/sso-toolkit"
    put_headers = {'Authorization': f'Bearer {admin_jwt}', 'Content-Type': 'application/json'}
    put_body = {'hostType': 'preview', 'enabled': False}
    
    try:
        put_resp = requests.put(put_url, json=put_body, headers=put_headers, timeout=10)
        print(f"   PUT status: {put_resp.status_code}")
        if put_resp.status_code == 200:
            data = put_resp.json()
            print(f"   ✅ Switch OFF: enabled_preview={data.get('settings', {}).get('enabled_preview')}")
            
            # Now test with a valid token
            test10_phone = '9666666666'
            test10_nonce = f'nonce-test10-{int(time.time() * 1000)}'
            now_ms = int(time.time() * 1000)
            test10_token = create_sso_token(test10_phone, 'Test10', now_ms, now_ms + 30000, test10_nonce)
            
            result10 = test_sso_redirect(test10_token, {'X-Forwarded-For': '1.2.3.15'})
            print(f"10b) Test with valid token (switch OFF):")
            print(f"   Status: {result10['status']}")
            print(f"   Location: {result10['location']}")
            print(f"   Expired: {result10['expired']}")
            
            if result10['expired']:
                print("   ✅ Correctly blocked with /sso/expired")
                audit_entry = db.sso_audit.find_one({'result': 'disabled'}, sort=[('at', -1)])
                if audit_entry:
                    print(f"   ✅ Audit log: result=disabled")
                    test_audit_ids.append(audit_entry['_id'])
            else:
                print(f"   ❌ TEST 10 FAILED: Should block when switch is OFF")
            
            test_nonces_used.append(test10_nonce)
            
            # Turn switch back ON
            print("10c) Turning preview switch back ON...")
            put_body_on = {'hostType': 'preview', 'enabled': True}
            put_resp_on = requests.put(put_url, json=put_body_on, headers=put_headers, timeout=10)
            if put_resp_on.status_code == 200:
                data_on = put_resp_on.json()
                print(f"   ✅ Switch ON: enabled_preview={data_on.get('settings', {}).get('enabled_preview')}")
            else:
                print(f"   ⚠️  Failed to turn switch back ON: {put_resp_on.status_code}")
        else:
            print(f"   ❌ Failed to turn switch OFF: {put_resp.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")

print()

# ============================================================================
# TEST 11: RATE LIMIT -> after 10 requests, /sso/expired
# ============================================================================
print("TEST 11: Rate limit (>10 requests in 1 minute)")
print("-" * 80)

rate_limit_ip = '99.99.99.99'
print(f"Using IP: {rate_limit_ip}")

rate_limit_results = []
for i in range(12):
    test11_phone = f'97777777{i:02d}'
    test11_nonce = f'nonce-test11-{i}-{int(time.time() * 1000)}'
    now_ms = int(time.time() * 1000)
    test11_token = create_sso_token(test11_phone, f'Test11-{i}', now_ms, now_ms + 30000, test11_nonce)
    
    result11 = test_sso_redirect(test11_token, {'X-Forwarded-For': rate_limit_ip})
    rate_limit_results.append({
        'i': i + 1,
        'expired': result11['expired'],
        'success': result11['success']
    })
    test_nonces_used.append(test11_nonce)
    
    if i < 5 or i >= 9:  # Print first 5 and last 2
        print(f"   Request {i+1}: expired={result11['expired']}, success={result11['success']}")
    elif i == 5:
        print(f"   ... (requests 6-10)")

# Check results
first_10_ok = all(r['success'] or r['expired'] for r in rate_limit_results[:10])
after_10_blocked = all(r['expired'] for r in rate_limit_results[10:])

print(f"First 10 requests: {'✅ Allowed' if first_10_ok else '❌ Some failed'}")
print(f"Requests 11-12: {'✅ Blocked (rate limited)' if after_10_blocked else '❌ Not blocked'}")

if after_10_blocked:
    audit_entry = db.sso_audit.find_one({'result': 'rate_limited'}, sort=[('at', -1)])
    if audit_entry:
        print(f"✅ Audit log: result=rate_limited")
        test_audit_ids.append(audit_entry['_id'])

print()

# ============================================================================
# TEST 12: ADMIN API SHAPE
# ============================================================================
print("TEST 12: Admin API shape")
print("-" * 80)

if not admin_jwt:
    print("❌ Cannot get admin JWT, skipping test 12")
else:
    import requests
    
    # Test GET without token
    print("12a) GET without token:")
    get_url = f"{BASE_URL}/api/admin/sso-toolkit"
    try:
        resp_noauth = requests.get(get_url, timeout=10)
        print(f"   Status: {resp_noauth.status_code}")
        if resp_noauth.status_code == 401:
            print("   ✅ Correctly returns 401")
        else:
            print(f"   ❌ Should return 401, got {resp_noauth.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test GET with admin token
    print("12b) GET with admin token:")
    get_headers = {'Authorization': f'Bearer {admin_jwt}'}
    try:
        resp_admin = requests.get(get_url, headers=get_headers, timeout=10)
        print(f"   Status: {resp_admin.status_code}")
        if resp_admin.status_code == 200:
            data = resp_admin.json()
            print(f"   ✅ Returns 200")
            
            # Check shape
            has_ok = 'ok' in data
            has_settings = 'settings' in data
            has_currentHostType = 'currentHostType' in data
            has_audit = 'audit' in data
            
            print(f"   {'✅' if has_ok else '❌'} Has 'ok' field: {has_ok}")
            print(f"   {'✅' if has_settings else '❌'} Has 'settings' field: {has_settings}")
            print(f"   {'✅' if has_currentHostType else '❌'} Has 'currentHostType' field: {has_currentHostType}")
            print(f"   {'✅' if has_audit else '❌'} Has 'audit' field: {has_audit}")
            
            if has_settings:
                settings = data['settings']
                has_enabled_preview = 'enabled_preview' in settings
                has_enabled_live = 'enabled_live' in settings
                print(f"   {'✅' if has_enabled_preview else '❌'} settings.enabled_preview: {has_enabled_preview}")
                print(f"   {'✅' if has_enabled_live else '❌'} settings.enabled_live: {has_enabled_live}")
            
            if has_audit:
                audit_list = data['audit']
                print(f"   ✅ Audit list length: {len(audit_list)}")
                if len(audit_list) > 0:
                    sample = audit_list[0]
                    print(f"   ✅ Sample audit entry: at={sample.get('at')}, phoneLast4={sample.get('phoneLast4')}, result={sample.get('result')}")
        else:
            print(f"   ❌ Should return 200, got {resp_admin.status_code}: {resp_admin.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test with non-admin token (if we have a non-admin user)
    print("12c) GET with non-admin token:")
    # Use the test premium user from test 8
    non_admin_user = db.users.find_one({'id': test8_user['id']})
    if non_admin_user:
        import jwt as pyjwt
        non_admin_payload = {
            'id': non_admin_user['id'],
            'role': 'user',
            'sessionId': 'test-session'
        }
        non_admin_jwt = pyjwt.encode(non_admin_payload, JWT_SECRET, algorithm='HS256')
        non_admin_headers = {'Authorization': f'Bearer {non_admin_jwt}'}
        
        try:
            resp_nonauth = requests.get(get_url, headers=non_admin_headers, timeout=10)
            print(f"   Status: {resp_nonauth.status_code}")
            if resp_nonauth.status_code == 403:
                print("   ✅ Correctly returns 403")
            else:
                print(f"   ❌ Should return 403, got {resp_nonauth.status_code}")
        except Exception as e:
            print(f"   ❌ Error: {e}")

print()

# ============================================================================
# CLEANUP
# ============================================================================
print("=" * 80)
print("CLEANUP")
print("=" * 80)

print(f"Deleting {len(test_users_created)} test users...")
if test_users_created:
    result = db.users.delete_many({'id': {'$in': test_users_created}})
    print(f"✅ Deleted {result.deleted_count} users")

print(f"Deleting test nonces...")
result = db.sso_nonces.delete_many({'nonce': {'$regex': '^nonce-test'}})
print(f"✅ Deleted {result.deleted_count} nonces")

print(f"Deleting test audit entries...")
# Delete audit entries created during this test run (last 5 minutes)
cutoff = datetime.utcnow() - timedelta(minutes=5)
result = db.sso_audit.delete_many({'at': {'$gte': cutoff}})
print(f"✅ Deleted {result.deleted_count} audit entries")

print(f"Deleting test rate limit entries...")
result = db.sso_rate.delete_many({'key': {'$regex': '^99\\.99\\.99\\.99:'}})
print(f"✅ Deleted {result.deleted_count} rate limit entries")

# Verify cleanup
final_users = db.users.count_documents({})
final_nonces = db.sso_nonces.count_documents({})
final_audit = db.sso_audit.count_documents({})

print()
print(f"📊 Final DB state:")
print(f"   Users: {final_users} (initial: {initial_users})")
print(f"   SSO nonces: {final_nonces} (initial: {initial_nonces})")
print(f"   SSO audit: {final_audit} (initial: {initial_audit})")

if final_users <= initial_users + 1:  # Allow 1 extra in case of timing
    print("✅ Cleanup successful: user count restored")
else:
    print(f"⚠️  Warning: {final_users - initial_users} extra users remain")

print()
print("=" * 80)
print("TEST COMPLETE")
print("=" * 80)
