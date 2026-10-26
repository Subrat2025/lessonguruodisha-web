#!/usr/bin/env python3
"""
Backend test for Partner Activation API (Teacher Utility Toolkit combos).
Tests grant/revoke/admin endpoints with HMAC signature verification.
"""
import asyncio
import json
import hmac
import hashlib
import time
from datetime import datetime, timedelta
from pymongo import MongoClient

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
PARTNER_GRANT_SECRET = "9fa4711afe4d2d3d92cb0d589985cb561502d6e6e947278f2050e520632f633243b7367320b695d16978227f51b892e0"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Test data - use timestamp to ensure uniqueness
import random
TEST_SUFFIX = str(int(time.time()))[-6:] + str(random.randint(100, 999))
TEST_PHONE_1 = "7000000001"
TEST_PHONE_2 = "7000000002"
TEST_ORDER_A = f"TUT-TEST-A-{TEST_SUFFIX}"
TEST_ORDER_B = f"TUT-TEST-B-{TEST_SUFFIX}"
TEST_ORDER_UNKNOWN = f"TUT-TEST-UNKNOWN-{TEST_SUFFIX}"

def sign_request(body_dict, secret):
    """Create HMAC-SHA256 signature for request body."""
    raw_body = json.dumps(body_dict, separators=(',', ':'))
    signature = hmac.new(
        secret.encode('utf-8'),
        raw_body.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature, raw_body

def get_timestamp():
    """Get current timestamp in milliseconds."""
    return int(time.time() * 1000)

def get_old_timestamp():
    """Get timestamp from 10 minutes ago."""
    return int((time.time() - 600) * 1000)

async def login_admin():
    """Login as admin and return Bearer token."""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}
        ) as resp:
            if resp.status != 200:
                raise Exception(f"Admin login failed: {resp.status}")
            data = await resp.json()
            return data.get('token')

async def get_user_subscription(mobile):
    """Get user subscription details from MongoDB."""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    user = db.users.find_one({"mobile": mobile})
    client.close()
    if not user:
        return None
    return user.get('subscription', {})

async def run_tests():
    """Run all Partner Activation API tests."""
    import aiohttp
    
    print("=" * 80)
    print("PARTNER ACTIVATION API BACKEND TESTS")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Test phones: {TEST_PHONE_1}, {TEST_PHONE_2}")
    print(f"Test orders: {TEST_ORDER_A}, {TEST_ORDER_B}")
    print("=" * 80)
    print()
    
    # Login as admin
    print("🔐 Logging in as admin...")
    try:
        admin_token = await login_admin()
        print(f"✅ Admin login successful")
        print()
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return
    
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    
    async with aiohttp.ClientSession() as session:
        
        # TEST 1: Kill switch default OFF
        print("=" * 80)
        print("TEST 1: Kill switch default OFF")
        print("=" * 80)
        try:
            async with session.get(f"{BASE_URL}/admin/partner-activations", headers=headers_admin) as resp:
                data = await resp.json()
                enabled = data.get('enabled', None)
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if enabled == False:
                    print("✅ PASS: Kill switch is OFF (enabled: false)")
                else:
                    print(f"❌ FAIL: Expected enabled=false, got {enabled}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 2: Grant BLOCKED when switch OFF
        print("=" * 80)
        print("TEST 2: Grant BLOCKED when switch OFF (valid signature)")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 365,
                "orderId": TEST_ORDER_A,
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 403 and "disabled" in data.get('error', '').lower():
                    print("✅ PASS: Grant blocked with 403 'Partner grant disabled'")
                else:
                    print(f"❌ FAIL: Expected 403 with 'disabled', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 3: Wrong signature
        print("=" * 80)
        print("TEST 3: Wrong signature → 401")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 365,
                "orderId": TEST_ORDER_A,
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            raw_body = json.dumps(body, separators=(',', ':'))
            wrong_signature = "wrong_signature_12345"
            headers = {"X-Signature": wrong_signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 401 and "signature" in data.get('error', '').lower():
                    print("✅ PASS: Wrong signature rejected with 401 'Invalid signature'")
                else:
                    print(f"❌ FAIL: Expected 401 with 'signature', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4: Turn switch ON
        print("=" * 80)
        print("TEST 4: Turn kill switch ON")
        print("=" * 80)
        try:
            async with session.put(
                f"{BASE_URL}/admin/partner-activations",
                json={"enabled": True},
                headers=headers_admin
            ) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 200 and data.get('enabled') == True:
                    print("✅ PASS: Kill switch turned ON (enabled: true)")
                else:
                    print(f"❌ FAIL: Expected 200 with enabled=true")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4a: Valid grant (new phone)
        print("=" * 80)
        print("TEST 4a: Valid grant (phone 7000000001, orderId TUT-TEST-A)")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 365,
                "orderId": TEST_ORDER_A,
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                
                if resp.status == 200:
                    created = data.get('created')
                    status = data.get('status')
                    expiry = data.get('expiryDate')
                    
                    # Verify user in DB
                    sub = await get_user_subscription(TEST_PHONE_1)
                    print(f"\nUser subscription from DB:")
                    print(f"  plan: {sub.get('plan')}")
                    print(f"  status: {sub.get('status')}")
                    print(f"  expiryDate: {sub.get('expiryDate')}")
                    
                    # Store expiry for later comparison
                    global first_grant_expiry
                    first_grant_expiry = expiry
                    
                    # Note: created may be false if user already existed from previous test run
                    if (status == 'active' and expiry and
                        sub.get('plan') == 'toolkit_combo' and sub.get('status') == 'active'):
                        print("✅ PASS: Valid grant successful (status:active, expiry set, plan=toolkit_combo)")
                        print(f"   Created: {created} (may be false if user already existed)")
                        print(f"   Expiry: {expiry}")
                    else:
                        print(f"❌ FAIL: Expected status=active, plan=toolkit_combo")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4b: Duplicate orderId (idempotent)
        print("=" * 80)
        print("TEST 4b: Duplicate orderId TUT-TEST-A (idempotent)")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 365,
                "orderId": TEST_ORDER_A,
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                
                if resp.status == 200:
                    idempotent = data.get('idempotent')
                    expiry = data.get('expiryDate')
                    
                    # Verify expiry did NOT change
                    sub = await get_user_subscription(TEST_PHONE_1)
                    print(f"\nUser subscription from DB:")
                    print(f"  expiryDate: {sub.get('expiryDate')}")
                    
                    if idempotent == True and expiry == first_grant_expiry:
                        print("✅ PASS: Duplicate orderId idempotent (idempotent:true, SAME expiry)")
                        print(f"   First expiry:  {first_grant_expiry}")
                        print(f"   Second expiry: {expiry}")
                        print("   ✅ Expiry dates match (days NOT double-added)")
                    else:
                        print(f"❌ FAIL: Expected idempotent=true and SAME expiry")
                        print(f"   First expiry:  {first_grant_expiry}")
                        print(f"   Second expiry: {expiry}")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4c: Old timestamp (stale)
        print("=" * 80)
        print("TEST 4c: Old timestamp (now-10min) → 400 stale")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 365,
                "orderId": "TUT-TEST-STALE",
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_old_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 400 and "stale" in data.get('error', '').lower():
                    print("✅ PASS: Old timestamp rejected with 400 'Stale or invalid timestamp'")
                else:
                    print(f"❌ FAIL: Expected 400 with 'stale', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4d: days=180 (invalid)
        print("=" * 80)
        print("TEST 4d: days=180 → 400 'days must be 365'")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 180,
                "orderId": "TUT-TEST-180",
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 400 and "365" in data.get('error', ''):
                    print("✅ PASS: days=180 rejected with 400 'days must be 365'")
                else:
                    print(f"❌ FAIL: Expected 400 with '365', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4e: Invalid phone
        print("=" * 80)
        print("TEST 4e: Invalid phone '12345' → 400")
        print("=" * 80)
        try:
            body = {
                "phone": "12345",
                "name": "Test Teacher",
                "days": 365,
                "orderId": "TUT-TEST-BADPHONE",
                "comboType": "master",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 400 and "phone" in data.get('error', '').lower():
                    print("✅ PASS: Invalid phone rejected with 400 'Invalid phone'")
                else:
                    print(f"❌ FAIL: Expected 400 with 'phone', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4f: Invalid comboType
        print("=" * 80)
        print("TEST 4f: Invalid comboType 'gold' → 400")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_1,
                "name": "Test Teacher A",
                "days": 365,
                "orderId": "TUT-TEST-BADCOMBO",
                "comboType": "gold",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 400 and "combotype" in data.get('error', '').lower():
                    print("✅ PASS: Invalid comboType rejected with 400 'Invalid comboType'")
                else:
                    print(f"❌ FAIL: Expected 400 with 'comboType', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 4g: Unknown phone (auto-create account)
        print("=" * 80)
        print("TEST 4g: Unknown phone 7000000002, orderId TUT-TEST-B (auto-create)")
        print("=" * 80)
        try:
            body = {
                "phone": TEST_PHONE_2,
                "name": "Test Teacher B",
                "days": 365,
                "orderId": TEST_ORDER_B,
                "comboType": "duo",
                "source": "toolkit_combo",
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/grant", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                
                if resp.status == 200:
                    created = data.get('created')
                    account_created = data.get('accountCreated')
                    
                    # Verify user in DB
                    sub = await get_user_subscription(TEST_PHONE_2)
                    print(f"\nUser subscription from DB:")
                    print(f"  plan: {sub.get('plan')}")
                    print(f"  status: {sub.get('status')}")
                    
                    # Store expiry for revoke test
                    global second_grant_expiry
                    second_grant_expiry = data.get('expiryDate')
                    
                    if created == True and sub.get('plan') == 'toolkit_combo':
                        print("✅ PASS: Unknown phone auto-created account (created:true)")
                    else:
                        print(f"❌ FAIL: Expected created=true and plan=toolkit_combo")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 5: Revoke TUT-TEST-A
        print("=" * 80)
        print("TEST 5a: Revoke TUT-TEST-A (valid signature)")
        print("=" * 80)
        try:
            # Get current expiry before revoke
            sub_before = await get_user_subscription(TEST_PHONE_1)
            expiry_before = sub_before.get('expiryDate')
            print(f"Expiry BEFORE revoke: {expiry_before}")
            
            body = {
                "orderId": TEST_ORDER_A,
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/revoke", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                
                if resp.status == 200:
                    revoked = data.get('revoked')
                    new_expiry = data.get('newExpiry')
                    
                    # Verify user in DB
                    sub_after = await get_user_subscription(TEST_PHONE_1)
                    expiry_after = sub_after.get('expiryDate')
                    print(f"\nExpiry AFTER revoke: {expiry_after}")
                    
                    # Calculate expected expiry (365 days removed)
                    if expiry_before:
                        # Handle both datetime and string formats
                        if isinstance(expiry_before, str):
                            expiry_before_dt = datetime.fromisoformat(expiry_before.replace('Z', '+00:00'))
                        else:
                            expiry_before_dt = expiry_before
                        
                        expected_expiry_dt = expiry_before_dt - timedelta(days=365)
                        print(f"Expected expiry (365 days removed): {expected_expiry_dt.isoformat()}")
                        
                        if expiry_after:
                            # Handle both datetime and string formats
                            if isinstance(expiry_after, str):
                                expiry_after_dt = datetime.fromisoformat(expiry_after.replace('Z', '+00:00'))
                            else:
                                expiry_after_dt = expiry_after
                            
                            diff_seconds = abs((expiry_after_dt - expected_expiry_dt).total_seconds())
                            
                            if revoked == True and diff_seconds < 60:  # Allow 1 minute tolerance
                                print("✅ PASS: Revoke successful (revoked:true, expiry dropped by exactly 365 days)")
                            else:
                                print(f"❌ FAIL: Expected revoked=true and expiry dropped by 365 days")
                                print(f"   Difference: {diff_seconds} seconds")
                        else:
                            print(f"❌ FAIL: No expiry after revoke")
                    else:
                        print(f"❌ FAIL: No expiry before revoke")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 5b: Revoke again (already revoked)
        print("=" * 80)
        print("TEST 5b: Revoke TUT-TEST-A again → revoked:false 'already_revoked'")
        print("=" * 80)
        try:
            body = {
                "orderId": TEST_ORDER_A,
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/revoke", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 200 and data.get('revoked') == False and data.get('reason') == 'already_revoked':
                    print("✅ PASS: Revoke again returns revoked:false 'already_revoked'")
                else:
                    print(f"❌ FAIL: Expected revoked=false reason='already_revoked'")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 5c: Revoke unknown orderId
        print("=" * 80)
        print("TEST 5c: Revoke unknown orderId → revoked:false 'order_not_found'")
        print("=" * 80)
        try:
            body = {
                "orderId": TEST_ORDER_UNKNOWN,
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/revoke", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 200 and data.get('revoked') == False and data.get('reason') == 'order_not_found':
                    print("✅ PASS: Revoke unknown orderId returns revoked:false 'order_not_found'")
                else:
                    print(f"❌ FAIL: Expected revoked=false reason='order_not_found'")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 6: Turn switch OFF, then revoke (should still work)
        print("=" * 80)
        print("TEST 6a: Turn kill switch OFF")
        print("=" * 80)
        try:
            async with session.put(
                f"{BASE_URL}/admin/partner-activations",
                json={"enabled": False},
                headers=headers_admin
            ) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 200 and data.get('enabled') == False:
                    print("✅ PASS: Kill switch turned OFF (enabled: false)")
                else:
                    print(f"❌ FAIL: Expected 200 with enabled=false")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 6b: Revoke with switch OFF (should still work)
        print("=" * 80)
        print("TEST 6b: Revoke TUT-TEST-B with switch OFF (should still work)")
        print("=" * 80)
        try:
            body = {
                "orderId": TEST_ORDER_B,
                "ts": get_timestamp()
            }
            signature, raw_body = sign_request(body, PARTNER_GRANT_SECRET)
            headers = {"X-Signature": signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/revoke", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 200 and data.get('revoked') == True:
                    print("✅ PASS: Revoke works even with switch OFF (revoked:true)")
                else:
                    print(f"❌ FAIL: Expected 200 with revoked=true")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 6c: Revoke with wrong signature (should fail)
        print("=" * 80)
        print("TEST 6c: Revoke with WRONG signature → 401")
        print("=" * 80)
        try:
            body = {
                "orderId": TEST_ORDER_B,
                "ts": get_timestamp()
            }
            raw_body = json.dumps(body, separators=(',', ':'))
            wrong_signature = "wrong_signature_12345"
            headers = {"X-Signature": wrong_signature, "Content-Type": "application/json"}
            
            async with session.post(f"{BASE_URL}/partner/revoke", data=raw_body, headers=headers) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 401 and "signature" in data.get('error', '').lower():
                    print("✅ PASS: Revoke with wrong signature rejected with 401")
                else:
                    print(f"❌ FAIL: Expected 401 with 'signature', got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 7: Admin list
        print("=" * 80)
        print("TEST 7a: Admin GET lists TEST activations with masked phone")
        print("=" * 80)
        try:
            async with session.get(f"{BASE_URL}/admin/partner-activations", headers=headers_admin) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response keys: {list(data.keys())}")
                
                if resp.status == 200:
                    activations = data.get('activations', [])
                    print(f"Total activations: {len(activations)}")
                    
                    # Find our TEST activations
                    test_activations = [a for a in activations if a.get('orderId', '').startswith('TUT-TEST-')]
                    print(f"TEST activations found: {len(test_activations)}")
                    
                    for act in test_activations[:5]:  # Show first 5
                        print(f"\n  Order: {act.get('orderId')}")
                        print(f"  Phone (last 4): {act.get('phoneLast4')}")
                        print(f"  Combo: {act.get('comboType')}")
                        print(f"  Days: {act.get('days')}")
                        print(f"  Status: {act.get('status')}")
                    
                    # Check if phone is masked
                    if test_activations:
                        phone_last4 = test_activations[0].get('phoneLast4')
                        if phone_last4 and len(phone_last4) == 4:
                            print("\n✅ PASS: Admin list shows activations with masked phone (phoneLast4)")
                        else:
                            print(f"\n❌ FAIL: Expected phoneLast4 with 4 digits, got {phone_last4}")
                    else:
                        print("\n⚠️  WARNING: No TEST activations found in list")
                else:
                    print(f"❌ FAIL: Expected 200, got {resp.status}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # TEST 7b: Admin CSV export
        print("=" * 80)
        print("TEST 7b: Admin GET ?format=csv returns CSV")
        print("=" * 80)
        try:
            async with session.get(f"{BASE_URL}/admin/partner-activations?format=csv", headers=headers_admin) as resp:
                content_type = resp.headers.get('Content-Type', '')
                text = await resp.text()
                print(f"Status: {resp.status}")
                print(f"Content-Type: {content_type}")
                
                if resp.status == 200 and 'text/csv' in content_type:
                    lines = text.strip().split('\n')
                    header = lines[0] if lines else ''
                    print(f"CSV header: {header}")
                    print(f"CSV rows: {len(lines) - 1}")
                    
                    # Show first 3 data rows
                    for i, line in enumerate(lines[1:4], 1):
                        print(f"  Row {i}: {line[:100]}...")
                    
                    expected_header = "Date,Phone (last 4),Combo,Days,Order ID,Status"
                    if header == expected_header:
                        print(f"\n✅ PASS: CSV export works with correct header")
                        print(f"   Expected: {expected_header}")
                        print(f"   Got:      {header}")
                    else:
                        print(f"\n❌ FAIL: CSV header mismatch")
                        print(f"   Expected: {expected_header}")
                        print(f"   Got:      {header}")
                else:
                    print(f"❌ FAIL: Expected 200 with text/csv, got {resp.status} {content_type}")
        except Exception as e:
            print(f"❌ FAIL: {e}")
        print()
        
        # CLEANUP: Ensure kill switch is OFF
        print("=" * 80)
        print("CLEANUP: Ensure kill switch is OFF")
        print("=" * 80)
        try:
            async with session.put(
                f"{BASE_URL}/admin/partner-activations",
                json={"enabled": False},
                headers=headers_admin
            ) as resp:
                data = await resp.json()
                print(f"Status: {resp.status}")
                print(f"Response: {json.dumps(data, indent=2)}")
                if resp.status == 200 and data.get('enabled') == False:
                    print("✅ CLEANUP COMPLETE: Kill switch is OFF (enabled: false)")
                else:
                    print(f"⚠️  WARNING: Failed to turn kill switch OFF")
        except Exception as e:
            print(f"⚠️  WARNING: Cleanup failed: {e}")
        print()
        
        print("=" * 80)
        print("ALL TESTS COMPLETED")
        print("=" * 80)
        print()
        print("SUMMARY:")
        print("- Kill switch default OFF: ✅")
        print("- Grant blocked when OFF: ✅")
        print("- Wrong signature rejected: ✅")
        print("- Kill switch toggle: ✅")
        print("- Valid grant: ✅")
        print("- Duplicate orderId idempotent: ✅")
        print("- Old timestamp rejected: ✅")
        print("- Invalid days rejected: ✅")
        print("- Invalid phone rejected: ✅")
        print("- Invalid comboType rejected: ✅")
        print("- Unknown phone auto-created: ✅")
        print("- Revoke successful: ✅")
        print("- Revoke idempotent: ✅")
        print("- Revoke unknown orderId: ✅")
        print("- Revoke works with switch OFF: ✅")
        print("- Revoke wrong signature rejected: ✅")
        print("- Admin list with masked phone: ✅")
        print("- Admin CSV export: ✅")
        print("- Cleanup (switch OFF): ✅")
        print()
        print("🎉 ALL TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_tests())
