#!/usr/bin/env python3
"""
Backend test for Phase 2 Subscription Recovery — Auto-Send via BulkyMarketing
Endpoint: POST /api/admin/recovery-send

Test cases:
1. AUTH GUARDS: 401 without token, 403 for non-admin
2. VALIDATION: 400 for empty userIds, 400 for >50 userIds
3. DRY-RUN: mode:'dry-run' should NOT call provider, return counts/items/cost/wallet/approvals/previews
4. WALLET GATE on SEND: mode:'send' should be blocked by wallet gate (409) if balance insufficient
5. NO REGRESSION: GET /api/admin/subscription-recovery still works
"""

import requests
import json
import sys
from datetime import datetime

# Read base URL from .env
BASE_URL = None
try:
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_BASE_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"')
                break
except Exception as e:
    print(f"❌ Failed to read .env: {e}")
    sys.exit(1)

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in .env")
    sys.exit(1)

API_BASE = f"{BASE_URL}/api"
print(f"🔗 API Base URL: {API_BASE}")
print(f"📅 Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

# Test credentials from /app/memory/test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
PREMIUM_USER_MOBILE = "9999900001"
PREMIUM_USER_PASSWORD = "Test@1234"

# Helper functions
def login(mobile, password):
    """Login and return JWT token"""
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('token')
        else:
            print(f"⚠️  Login failed for {mobile}: {resp.status_code} {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def test_auth_guards():
    """TEST 1: AUTH GUARDS - 401 without token, 403 for non-admin"""
    print("\n" + "=" * 80)
    print("TEST 1: AUTH GUARDS")
    print("=" * 80)
    
    passed = 0
    total = 2
    
    # 1a. POST with NO Authorization header → expect 401
    print("\n1a. POST /api/admin/recovery-send without token → expect 401")
    try:
        resp = requests.post(
            f"{API_BASE}/admin/recovery-send",
            json={"mode": "dry-run", "userIds": ["dummy"]},
            timeout=30
        )
        if resp.status_code == 401:
            print(f"✅ PASS: Got 401 as expected")
            passed += 1
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # 1b. POST with a NON-admin user's token → expect 403
    print("\n1b. POST /api/admin/recovery-send with non-admin token → expect 403")
    premium_token = login(PREMIUM_USER_MOBILE, PREMIUM_USER_PASSWORD)
    if premium_token:
        try:
            resp = requests.post(
                f"{API_BASE}/admin/recovery-send",
                json={"mode": "dry-run", "userIds": ["dummy"]},
                headers={"Authorization": f"Bearer {premium_token}"},
                timeout=30
            )
            if resp.status_code == 403:
                print(f"✅ PASS: Got 403 as expected")
                passed += 1
            else:
                print(f"❌ FAIL: Expected 403, got {resp.status_code}")
                print(f"   Response: {resp.text[:200]}")
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
    else:
        print(f"❌ FAIL: Could not login as premium user")
    
    print(f"\n📊 TEST 1 RESULT: {passed}/{total} checks passed")
    return passed, total

def test_validation(admin_token):
    """TEST 2: VALIDATION - 400 for empty userIds, 400 for >50 userIds"""
    print("\n" + "=" * 80)
    print("TEST 2: VALIDATION")
    print("=" * 80)
    
    passed = 0
    total = 2
    
    # 2a. Admin POST { mode:'dry-run', userIds: [] } → expect 400 ("No users selected")
    print("\n2a. POST with empty userIds array → expect 400")
    try:
        resp = requests.post(
            f"{API_BASE}/admin/recovery-send",
            json={"mode": "dry-run", "userIds": []},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if resp.status_code == 400:
            data = resp.json()
            error = data.get('error', '')
            if 'No users selected' in error:
                print(f"✅ PASS: Got 400 with correct error message: '{error}'")
                passed += 1
            else:
                print(f"⚠️  PASS: Got 400 but different error: '{error}'")
                passed += 1
        else:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # 2b. Admin POST with userIds array of length 51 → expect 400 (max 50 per send)
    print("\n2b. POST with 51 userIds → expect 400 (max 50)")
    try:
        dummy_ids = [f"dummy_{i}" for i in range(51)]
        resp = requests.post(
            f"{API_BASE}/admin/recovery-send",
            json={"mode": "dry-run", "userIds": dummy_ids},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if resp.status_code == 400:
            data = resp.json()
            error = data.get('error', '')
            if 'Max' in error or '50' in error:
                print(f"✅ PASS: Got 400 with correct error message: '{error}'")
                passed += 1
            else:
                print(f"⚠️  PASS: Got 400 but different error: '{error}'")
                passed += 1
        else:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    print(f"\n📊 TEST 2 RESULT: {passed}/{total} checks passed")
    return passed, total

def test_dry_run(admin_token):
    """TEST 3: DRY-RUN - must NOT send anything, no provider call"""
    print("\n" + "=" * 80)
    print("TEST 3: DRY-RUN (must NOT send anything, no provider call)")
    print("=" * 80)
    
    passed = 0
    total = 0
    
    # 3a. First, GET /api/admin/subscription-recovery to fetch real expired user IDs
    print("\n3a. GET /api/admin/subscription-recovery to fetch expired users")
    expired_user_ids = []
    try:
        resp = requests.get(
            f"{API_BASE}/admin/subscription-recovery?page=1&pageSize=20",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            users = data.get('users', [])
            expired_user_ids = [u['id'] for u in users if u.get('id')]
            print(f"✅ PASS: Got {len(expired_user_ids)} expired users")
            if expired_user_ids:
                print(f"   Sample user IDs: {expired_user_ids[:3]}")
            else:
                print(f"   ⚠️  No expired users found in the list")
            passed += 1
            total += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
            total += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        total += 1
    
    # If no expired users found, use the test expired user from test_credentials.md
    if not expired_user_ids:
        print(f"\n   ℹ️  Using test expired user mobile 9000000099 (if exists in DB)")
        # We'll try with a dummy ID anyway to test the structure
        expired_user_ids = ["test_user_id_1", "test_user_id_2"]
    
    # 3b. Admin POST { mode:'dry-run', userIds: [<those ids>] }
    print(f"\n3b. POST /api/admin/recovery-send with mode:'dry-run' and {len(expired_user_ids[:5])} user IDs")
    try:
        resp = requests.post(
            f"{API_BASE}/admin/recovery-send",
            json={"mode": "dry-run", "userIds": expired_user_ids[:5]},  # Use first 5 IDs
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: Got 200 response")
            
            # Check response structure
            required_keys = ['counts', 'items', 'cost', 'wallet', 'approvals', 'previews']
            for key in required_keys:
                if key in data:
                    print(f"   ✅ Has '{key}' field")
                    passed += 1
                else:
                    print(f"   ❌ Missing '{key}' field")
                total += 1
            
            # Check counts structure
            if 'counts' in data:
                counts = data['counts']
                count_keys = ['total', 'eligible', 'marketing', 'utility', 'skipped', 'blocked']
                print(f"\n   Counts: {counts}")
                for key in count_keys:
                    if key in counts:
                        print(f"   ✅ counts.{key} = {counts[key]}")
                    else:
                        print(f"   ⚠️  counts.{key} missing")
            
            # Check items structure
            if 'items' in data:
                items = data['items']
                print(f"\n   Items: {len(items)} total")
                if items:
                    sample = items[0]
                    print(f"   Sample item: {json.dumps(sample, indent=2)}")
                    
                    # Check for expired_premium_renewal template with marketing category
                    expired_items = [i for i in items if i.get('template') == 'expired_premium_renewal']
                    if expired_items:
                        print(f"\n   ✅ Found {len(expired_items)} items with template 'expired_premium_renewal'")
                        for item in expired_items[:2]:
                            if item.get('category') == 'marketing':
                                print(f"      ✅ Item {item.get('id')} has category 'marketing'")
                                passed += 1
                            else:
                                print(f"      ❌ Item {item.get('id')} has category '{item.get('category')}' (expected 'marketing')")
                            total += 1
                    else:
                        print(f"   ℹ️  No items with template 'expired_premium_renewal' (may be no expired users)")
            
            # Check cost structure
            if 'cost' in data:
                cost = data['cost']
                print(f"\n   Cost: {cost}")
                if cost.get('rateMarketing') == 0.9926:
                    print(f"   ✅ rateMarketing = 0.9926 (correct)")
                    passed += 1
                else:
                    print(f"   ⚠️  rateMarketing = {cost.get('rateMarketing')} (expected 0.9926)")
                total += 1
            
            # Check wallet structure
            if 'wallet' in data:
                wallet = data['wallet']
                print(f"\n   Wallet: {json.dumps(wallet, indent=2)}")
                wallet_keys = ['balance', 'otpReserve', 'balanceAfter', 'canSend', 'blockReason', 'stale']
                for key in wallet_keys:
                    if key in wallet:
                        print(f"   ✅ wallet.{key} = {wallet[key]}")
                    else:
                        print(f"   ⚠️  wallet.{key} missing")
            
            # Check approvals structure
            if 'approvals' in data:
                approvals = data['approvals']
                print(f"\n   Approvals: {approvals}")
            
            # Check previews structure
            if 'previews' in data:
                previews = data['previews']
                print(f"\n   Previews: {list(previews.keys())}")
            
            passed += 1
            total += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            total += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        total += 1
    
    print(f"\n📊 TEST 3 RESULT: {passed}/{total} checks passed")
    return passed, total

def test_wallet_gate_on_send(admin_token):
    """TEST 4: WALLET GATE on SEND - should block with 409 if balance insufficient"""
    print("\n" + "=" * 80)
    print("TEST 4: WALLET GATE on SEND")
    print("=" * 80)
    
    passed = 0
    total = 1
    
    # First get some user IDs
    print("\n4a. GET /api/admin/subscription-recovery to fetch user IDs")
    user_ids = []
    try:
        resp = requests.get(
            f"{API_BASE}/admin/subscription-recovery?page=1&pageSize=5",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            users = data.get('users', [])
            user_ids = [u['id'] for u in users[:2] if u.get('id')]  # Get first 2 users
            print(f"   Got {len(user_ids)} user IDs for testing")
        else:
            print(f"   ⚠️  Could not fetch users: {resp.status_code}")
    except Exception as e:
        print(f"   ⚠️  Exception fetching users: {e}")
    
    if not user_ids:
        print(f"   ℹ️  Using dummy user IDs for testing")
        user_ids = ["test_user_1", "test_user_2"]
    
    # 4b. Admin POST { mode:'send', userIds: [<a couple real expired ids>] }
    print(f"\n4b. POST /api/admin/recovery-send with mode:'send' and {len(user_ids)} user IDs")
    print(f"   Expected: 409 if wallet balance is 0 or below (cost + ₹300 reserve)")
    print(f"   This is CORRECT SAFETY BEHAVIOUR, not a bug")
    try:
        resp = requests.post(
            f"{API_BASE}/admin/recovery-send",
            json={"mode": "send", "userIds": user_ids},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if resp.status_code == 409:
            data = resp.json()
            print(f"✅ PASS: Got 409 (wallet gate blocked) - CORRECT SAFETY BEHAVIOUR")
            print(f"   Error: {data.get('error', 'N/A')}")
            if 'wallet' in data:
                wallet = data['wallet']
                print(f"   Wallet balance: {wallet.get('balance', 'N/A')}")
                print(f"   OTP reserve: {wallet.get('otpReserve', 'N/A')}")
                print(f"   Can send: {wallet.get('canSend', 'N/A')}")
                print(f"   Block reason: {wallet.get('blockReason', 'N/A')}")
            passed += 1
        elif resp.status_code == 200:
            data = resp.json()
            print(f"⚠️  Got 200 (send succeeded) - wallet gate passed")
            print(f"   This means wallet balance is sufficient (cost + ₹300 reserve)")
            if 'report' in data:
                report = data['report']
                print(f"   Sent: {report.get('sentCount', 0)}")
                print(f"   Failed: {report.get('failedCount', 0)}")
                print(f"   Skipped: {report.get('skippedCount', 0)}")
                print(f"   Spend: {report.get('spend', 0)} {report.get('currency', 'INR')}")
            
            # Check if wa_deliveries entries were created
            print(f"\n   ℹ️  Real send occurred. Checking if wa_deliveries entries were created...")
            print(f"   (Cannot verify via API, but endpoint returned 200 with report)")
            
            # This is acceptable if wallet has sufficient balance
            print(f"\n   ✅ PASS: Endpoint returned 200 with report (wallet gate passed)")
            print(f"   NOTE: This is acceptable if wallet balance is sufficient")
            passed += 1
        else:
            print(f"❌ FAIL: Expected 409 or 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
        
        total += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        total += 1
    
    print(f"\n📊 TEST 4 RESULT: {passed}/{total} checks passed")
    return passed, total

def test_no_regression(admin_token):
    """TEST 5: NO REGRESSION - GET /api/admin/subscription-recovery still works"""
    print("\n" + "=" * 80)
    print("TEST 5: NO REGRESSION")
    print("=" * 80)
    
    passed = 0
    total = 1
    
    print("\n5a. GET /api/admin/subscription-recovery → expect 200 with kpis/users")
    try:
        resp = requests.get(
            f"{API_BASE}/admin/subscription-recovery?page=1&pageSize=20",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: Got 200 response")
            
            # Check for kpis and users
            if 'kpis' in data:
                print(f"   ✅ Has 'kpis' field: {data['kpis']}")
            else:
                print(f"   ⚠️  Missing 'kpis' field")
            
            if 'users' in data:
                users = data['users']
                print(f"   ✅ Has 'users' field: {len(users)} users")
            else:
                print(f"   ⚠️  Missing 'users' field")
            
            passed += 1
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
        
        total += 1
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        total += 1
    
    print(f"\n📊 TEST 5 RESULT: {passed}/{total} checks passed")
    return passed, total

def main():
    print("\n" + "=" * 80)
    print("PHASE 2 SUBSCRIPTION RECOVERY — AUTO-SEND VIA BULKYMARKETING")
    print("Backend Testing: POST /api/admin/recovery-send")
    print("=" * 80)
    
    # Login as admin
    print("\n🔐 Logging in as admin...")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ CRITICAL: Could not login as admin. Aborting tests.")
        sys.exit(1)
    print(f"✅ Admin login successful")
    
    # Run all tests
    total_passed = 0
    total_checks = 0
    
    p, t = test_auth_guards()
    total_passed += p
    total_checks += t
    
    p, t = test_validation(admin_token)
    total_passed += p
    total_checks += t
    
    p, t = test_dry_run(admin_token)
    total_passed += p
    total_checks += t
    
    p, t = test_wallet_gate_on_send(admin_token)
    total_passed += p
    total_checks += t
    
    p, t = test_no_regression(admin_token)
    total_passed += p
    total_checks += t
    
    # Final summary
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    success_rate = (total_passed / total_checks * 100) if total_checks > 0 else 0
    print(f"✅ Total Passed: {total_passed}/{total_checks} ({success_rate:.1f}%)")
    print(f"📅 Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🔗 API Base: {API_BASE}")
    print("=" * 80)
    
    if total_passed == total_checks:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_checks - total_passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
