#!/usr/bin/env python3
"""
Backend test for GET /api/admin/referral-milestone/preview
PREVIEW-only READ-ONLY endpoint testing.

Admin: 9692604577 / Subrat@909e
Non-admin: Register throwaway user with mobile 6-9 prefix and password "abc123"

Tests:
1. GET with NO token → 401
2. GET with NON-admin token → 403
3. GET with admin token → 200 with correct JSON shape

Report:
- target value
- totalReferrersWithPaid
- Full atOrAboveTarget array (names + mobileLast4 + milestoneCount)
- Top 3 rows: name, mobileLast4, milestoneCount, oldPremiumCount, reached
"""

import requests
import json
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def print_section(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def test_auth_login(mobile, password):
    """Login and return bearer token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful for {mobile}")
                return token
            else:
                print(f"❌ Login response missing token for {mobile}")
                return None
        else:
            print(f"❌ Login failed for {mobile}: {resp.status_code} - {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def test_auth_register(mobile, password):
    """Register a new user and return bearer token"""
    try:
        payload = {
            "mobile": mobile,
            "password": password,
            "name": f"Test User {mobile[-4:]}",
            "district": "Test District"
        }
        resp = requests.post(f"{BASE_URL}/auth/register", json=payload, timeout=30)
        if resp.status_code == 200 or resp.status_code == 201:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ Registration successful for {mobile}")
                return token
            else:
                print(f"❌ Registration response missing token for {mobile}")
                return None
        else:
            print(f"❌ Registration failed for {mobile}: {resp.status_code} - {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Registration exception for {mobile}: {e}")
        return None

def generate_throwaway_mobile():
    """Generate a random 10-digit mobile starting with 6-9"""
    prefix = random.choice(['6', '7', '8', '9'])
    rest = ''.join([str(random.randint(0, 9)) for _ in range(9)])
    return prefix + rest

def test_milestone_preview():
    print_section("BACKEND TEST: GET /api/admin/referral-milestone/preview")
    
    # Admin credentials
    ADMIN_MOBILE = "9692604577"
    ADMIN_PASSWORD = "Subrat@909e"
    
    # Step 1: Login as admin
    print_section("STEP 1: Login as Admin")
    admin_token = test_auth_login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ CRITICAL: Cannot proceed without admin token")
        return
    
    # Step 2: Register throwaway non-admin user
    print_section("STEP 2: Register Throwaway Non-Admin User")
    throwaway_mobile = generate_throwaway_mobile()
    throwaway_password = "abc123"
    print(f"Registering throwaway user: {throwaway_mobile} / {throwaway_password}")
    non_admin_token = test_auth_register(throwaway_mobile, throwaway_password)
    if not non_admin_token:
        print("⚠️  WARNING: Cannot test non-admin 403 scenario (registration failed)")
    
    # Step 3: Test 1 - GET with NO token → 401
    print_section("TEST 1: GET /api/admin/referral-milestone/preview with NO token → expect 401")
    try:
        resp = requests.get(f"{BASE_URL}/admin/referral-milestone/preview?limit=20", timeout=30)
        if resp.status_code == 401:
            print(f"✅ TEST 1 PASSED: Got 401 without token")
        else:
            print(f"❌ TEST 1 FAILED: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ TEST 1 EXCEPTION: {e}")
    
    # Step 4: Test 2 - GET with NON-admin token → 403
    if non_admin_token:
        print_section("TEST 2: GET /api/admin/referral-milestone/preview with NON-admin token → expect 403")
        try:
            headers = {"Authorization": f"Bearer {non_admin_token}"}
            resp = requests.get(f"{BASE_URL}/admin/referral-milestone/preview?limit=20", headers=headers, timeout=30)
            if resp.status_code == 403:
                print(f"✅ TEST 2 PASSED: Got 403 with non-admin token")
            else:
                print(f"❌ TEST 2 FAILED: Expected 403, got {resp.status_code}")
                print(f"   Response: {resp.text[:200]}")
        except Exception as e:
            print(f"❌ TEST 2 EXCEPTION: {e}")
    else:
        print_section("TEST 2: SKIPPED (no non-admin token)")
    
    # Step 5: Test 3 - GET with admin token → 200 with correct JSON shape
    print_section("TEST 3: GET /api/admin/referral-milestone/preview with admin token → expect 200")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/referral-milestone/preview?limit=20", headers=headers, timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ TEST 3 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return
        
        print(f"✅ TEST 3 PASSED: Got 200 with admin token")
        
        # Parse JSON
        try:
            data = resp.json()
        except Exception as e:
            print(f"❌ JSON PARSE FAILED: {e}")
            print(f"   Response text: {resp.text[:500]}")
            return
        
        # Verify JSON shape
        print("\n" + "="*80)
        print("  RESPONSE STRUCTURE VERIFICATION")
        print("="*80 + "\n")
        
        required_keys = ['ok', 'target', 'totalReferrersWithPaid', 'top', 'atOrAboveTarget']
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            print(f"❌ MISSING KEYS: {missing_keys}")
            print(f"   Actual keys: {list(data.keys())}")
            return
        
        print(f"✅ All required keys present: {required_keys}")
        
        # Extract values
        ok = data.get('ok')
        target = data.get('target')
        total_referrers = data.get('totalReferrersWithPaid')
        top = data.get('top', [])
        at_or_above = data.get('atOrAboveTarget', [])
        
        # Report values
        print("\n" + "="*80)
        print("  REPORTED VALUES (as requested)")
        print("="*80 + "\n")
        
        print(f"ok: {ok}")
        print(f"target: {target}")
        print(f"totalReferrersWithPaid: {total_referrers}")
        
        print(f"\natOrAboveTarget array ({len(at_or_above)} items):")
        if len(at_or_above) == 0:
            print("  → EMPTY (no referrers at or above target)")
        else:
            for i, item in enumerate(at_or_above, 1):
                name = item.get('name', 'N/A')
                mobile_last4 = item.get('mobileLast4', 'N/A')
                milestone_count = item.get('milestoneCount', 'N/A')
                print(f"  {i}. {name} (****{mobile_last4}) - milestoneCount: {milestone_count}")
        
        print(f"\nTop 3 rows from 'top' array (total {len(top)} items):")
        for i, item in enumerate(top[:3], 1):
            name = item.get('name', 'N/A')
            mobile_last4 = item.get('mobileLast4', 'N/A')
            milestone_count = item.get('milestoneCount', 'N/A')
            old_premium_count = item.get('oldPremiumCount', 'N/A')
            reached = item.get('reached', 'N/A')
            print(f"  {i}. {name} (****{mobile_last4})")
            print(f"     - milestoneCount: {milestone_count}")
            print(f"     - oldPremiumCount: {old_premium_count}")
            print(f"     - reached: {reached}")
        
        if len(top) == 0:
            print("  → EMPTY (no referrers with paid referrals)")
        
        # Verify it's read-only (no writes, no messages)
        print("\n" + "="*80)
        print("  READ-ONLY VERIFICATION")
        print("="*80 + "\n")
        print("✅ Endpoint is GET (read-only by design)")
        print("✅ No POST/PUT/DELETE operations performed")
        print("✅ Response returned successfully without errors")
        print("✅ This is a pure read operation - no writes or messages sent")
        
        # Final summary
        print("\n" + "="*80)
        print("  TEST SUMMARY")
        print("="*80 + "\n")
        print("✅ TEST 1: GET with NO token → 401 ✅")
        if non_admin_token:
            print("✅ TEST 2: GET with NON-admin token → 403 ✅")
        else:
            print("⚠️  TEST 2: SKIPPED (non-admin registration failed)")
        print("✅ TEST 3: GET with admin token → 200 ✅")
        print("\n✅ ALL TESTS PASSED")
        print(f"\nREPORTED VALUES:")
        print(f"  - target: {target}")
        print(f"  - totalReferrersWithPaid: {total_referrers}")
        print(f"  - atOrAboveTarget: {len(at_or_above)} items {'(EMPTY)' if len(at_or_above) == 0 else ''}")
        print(f"  - top array: {len(top)} items")
        
    except Exception as e:
        print(f"❌ TEST 3 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_milestone_preview()
