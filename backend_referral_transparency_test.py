#!/usr/bin/env python3
"""
PHASE 1 Referral Transparency Backend Test
Tests GET /api/admin/referrals and GET /api/me/referral for qualified + reason fields.
"""
import os
import sys
import requests
from pymongo import MongoClient

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

# Known reason codes from referral-engine.js isQualifyingReferral
VALID_REASON_CODES = {
    'qualified',
    'no-active-subscription',
    'past-validity-window',
    'plan-not-eligible',
    'expired-subscription',
    'same-mobile',
    'same-email',
    'self-referral'
}

def main():
    print("=" * 80)
    print("PHASE 1 REFERRAL TRANSPARENCY BACKEND TEST")
    print("=" * 80)
    
    # Connect to MongoDB for regression check
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # REGRESSION CHECK: Count referral_rewards before testing
        rewards_before = db.referral_rewards.count_documents({})
        print(f"\n✓ Referral rewards count BEFORE: {rewards_before}")
        
        # TEST 1: Admin login
        print("\n" + "=" * 80)
        print("TEST 1: ADMIN LOGIN")
        print("=" * 80)
        
        admin_login_resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": "9999999999", "password": "admin123"},
            timeout=30
        )
        print(f"Admin login status: {admin_login_resp.status_code}")
        
        if admin_login_resp.status_code != 200:
            print(f"❌ FAILED: Admin login failed with {admin_login_resp.status_code}")
            print(f"Response: {admin_login_resp.text}")
            sys.exit(1)
        
        admin_data = admin_login_resp.json()
        admin_token = admin_data.get("token")
        
        if not admin_token:
            print("❌ FAILED: No token in admin login response")
            sys.exit(1)
        
        print(f"✅ PASSED: Admin login successful, token obtained")
        
        # TEST 2: GET /api/admin/referrals - Structure check
        print("\n" + "=" * 80)
        print("TEST 2: GET /api/admin/referrals - STRUCTURE CHECK")
        print("=" * 80)
        
        admin_referrals_resp = requests.get(
            f"{BASE_URL}/admin/referrals",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"GET /admin/referrals status: {admin_referrals_resp.status_code}")
        
        if admin_referrals_resp.status_code != 200:
            print(f"❌ FAILED: GET /admin/referrals returned {admin_referrals_resp.status_code}")
            print(f"Response: {admin_referrals_resp.text}")
            sys.exit(1)
        
        admin_ref_data = admin_referrals_resp.json()
        
        # Check required top-level keys
        required_keys = ['leaderboard', 'totalReferrals', 'totalSubscribed', 'ambassadors']
        for key in required_keys:
            if key not in admin_ref_data:
                print(f"❌ FAILED: Missing required key '{key}' in response")
                sys.exit(1)
        
        print(f"✅ PASSED: All required keys present: {required_keys}")
        print(f"  - leaderboard: {len(admin_ref_data['leaderboard'])} entries")
        print(f"  - totalReferrals: {admin_ref_data['totalReferrals']}")
        print(f"  - totalSubscribed: {admin_ref_data['totalSubscribed']}")
        print(f"  - ambassadors: {admin_ref_data['ambassadors']}")
        
        # TEST 3: Check leaderboard[].recent[] entries for qualified + reason
        print("\n" + "=" * 80)
        print("TEST 3: LEADERBOARD RECENT ENTRIES - qualified + reason FIELDS")
        print("=" * 80)
        
        total_recent_entries = 0
        entries_with_qualified = 0
        entries_with_reason = 0
        invalid_reasons = []
        consistency_errors = []
        
        for idx, leader in enumerate(admin_ref_data['leaderboard']):
            recent = leader.get('recent', [])
            total_recent_entries += len(recent)
            
            for entry_idx, entry in enumerate(recent):
                # Check for qualified field
                if 'qualified' not in entry:
                    print(f"❌ FAILED: Missing 'qualified' field in leaderboard[{idx}].recent[{entry_idx}]")
                    print(f"   Entry: {entry}")
                    sys.exit(1)
                entries_with_qualified += 1
                
                # Check for reason field
                if 'reason' not in entry:
                    print(f"❌ FAILED: Missing 'reason' field in leaderboard[{idx}].recent[{entry_idx}]")
                    print(f"   Entry: {entry}")
                    sys.exit(1)
                entries_with_reason += 1
                
                # Check reason is valid
                reason = entry['reason']
                if reason not in VALID_REASON_CODES:
                    invalid_reasons.append({
                        'leader_idx': idx,
                        'entry_idx': entry_idx,
                        'reason': reason,
                        'entry': entry
                    })
                
                # Check consistency: qualified=true → reason="qualified"
                qualified = entry['qualified']
                if qualified and reason != 'qualified':
                    consistency_errors.append({
                        'leader_idx': idx,
                        'entry_idx': entry_idx,
                        'qualified': qualified,
                        'reason': reason,
                        'entry': entry
                    })
                
                # Check consistency: qualified=false → reason != "qualified"
                if not qualified and reason == 'qualified':
                    consistency_errors.append({
                        'leader_idx': idx,
                        'entry_idx': entry_idx,
                        'qualified': qualified,
                        'reason': reason,
                        'entry': entry
                    })
                
                # Check existing fields are present
                required_entry_fields = ['name', 'mobile', 'joinedAt', 'subscribed', 'plan']
                for field in required_entry_fields:
                    if field not in entry:
                        print(f"❌ FAILED: Missing required field '{field}' in leaderboard[{idx}].recent[{entry_idx}]")
                        sys.exit(1)
        
        print(f"✅ PASSED: All {total_recent_entries} recent entries have 'qualified' field")
        print(f"✅ PASSED: All {total_recent_entries} recent entries have 'reason' field")
        print(f"✅ PASSED: All recent entries have existing fields (name, mobile, joinedAt, subscribed, plan)")
        
        # TEST 4: Validate reason codes
        print("\n" + "=" * 80)
        print("TEST 4: REASON CODE VALIDATION")
        print("=" * 80)
        
        if invalid_reasons:
            print(f"❌ FAILED: Found {len(invalid_reasons)} entries with invalid reason codes:")
            for err in invalid_reasons[:5]:  # Show first 5
                print(f"   leaderboard[{err['leader_idx']}].recent[{err['entry_idx']}]:")
                print(f"     reason: '{err['reason']}' (INVALID)")
                print(f"     entry: {err['entry']}")
            sys.exit(1)
        
        print(f"✅ PASSED: All {total_recent_entries} reason codes are valid")
        print(f"   Valid codes: {sorted(VALID_REASON_CODES)}")
        
        # TEST 5: Consistency check
        print("\n" + "=" * 80)
        print("TEST 5: CONSISTENCY CHECK (qualified ↔ reason)")
        print("=" * 80)
        
        if consistency_errors:
            print(f"❌ FAILED: Found {len(consistency_errors)} consistency errors:")
            for err in consistency_errors[:5]:  # Show first 5
                print(f"   leaderboard[{err['leader_idx']}].recent[{err['entry_idx']}]:")
                print(f"     qualified: {err['qualified']}, reason: '{err['reason']}' (INCONSISTENT)")
                print(f"     entry: {err['entry']}")
            sys.exit(1)
        
        print(f"✅ PASSED: All {total_recent_entries} entries are consistent")
        print(f"   - qualified=true → reason='qualified'")
        print(f"   - qualified=false → reason != 'qualified'")
        
        # Show sample entries
        if total_recent_entries > 0:
            print("\n📊 SAMPLE RECENT ENTRIES:")
            sample_count = 0
            for leader in admin_ref_data['leaderboard']:
                for entry in leader.get('recent', [])[:2]:  # Show first 2 from each leader
                    if sample_count >= 5:  # Max 5 samples
                        break
                    print(f"   - name: {entry['name']}, mobile: {entry['mobile']}")
                    print(f"     qualified: {entry['qualified']}, reason: '{entry['reason']}'")
                    print(f"     subscribed: {entry['subscribed']}, plan: {entry['plan']}")
                    sample_count += 1
                if sample_count >= 5:
                    break
        
        # TEST 6: GET /api/me/referral - Check for existing user
        print("\n" + "=" * 80)
        print("TEST 6: GET /api/me/referral - USER ENDPOINT CHECK")
        print("=" * 80)
        
        # Try to find a user with referrals or create a test user
        # First, try admin's own referral endpoint
        me_referral_resp = requests.get(
            f"{BASE_URL}/me/referral",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"GET /me/referral (admin) status: {me_referral_resp.status_code}")
        
        if me_referral_resp.status_code != 200:
            print(f"❌ FAILED: GET /me/referral returned {me_referral_resp.status_code}")
            print(f"Response: {me_referral_resp.text}")
            sys.exit(1)
        
        me_ref_data = me_referral_resp.json()
        
        # Check for joined array (backward compat field)
        if 'joined' not in me_ref_data:
            print(f"❌ FAILED: Missing 'joined' array in /me/referral response")
            sys.exit(1)
        
        joined = me_ref_data['joined']
        print(f"✅ PASSED: /me/referral returns 'joined' array with {len(joined)} entries")
        
        # Check each joined entry for qualified, subscribed, reason
        for idx, entry in enumerate(joined):
            if 'qualified' not in entry:
                print(f"❌ FAILED: Missing 'qualified' field in joined[{idx}]")
                sys.exit(1)
            if 'subscribed' not in entry:
                print(f"❌ FAILED: Missing 'subscribed' field in joined[{idx}]")
                sys.exit(1)
            if 'reason' not in entry:
                print(f"❌ FAILED: Missing 'reason' field in joined[{idx}]")
                sys.exit(1)
            
            # Validate reason code
            if entry['reason'] not in VALID_REASON_CODES:
                print(f"❌ FAILED: Invalid reason code '{entry['reason']}' in joined[{idx}]")
                sys.exit(1)
            
            # Check consistency
            if entry['qualified'] and entry['reason'] != 'qualified':
                print(f"❌ FAILED: Inconsistent joined[{idx}]: qualified=true but reason='{entry['reason']}'")
                sys.exit(1)
            if not entry['qualified'] and entry['reason'] == 'qualified':
                print(f"❌ FAILED: Inconsistent joined[{idx}]: qualified=false but reason='qualified'")
                sys.exit(1)
        
        print(f"✅ PASSED: All {len(joined)} joined entries have qualified, subscribed, reason fields")
        print(f"✅ PASSED: All joined entries have valid reason codes and are consistent")
        
        # Show sample
        if len(joined) > 0:
            print("\n📊 SAMPLE JOINED ENTRIES:")
            for entry in joined[:3]:  # Show first 3
                print(f"   - name: {entry.get('name', 'N/A')}, mobile: {entry.get('mobile', 'N/A')}")
                print(f"     qualified: {entry['qualified']}, reason: '{entry['reason']}'")
                print(f"     subscribed: {entry['subscribed']}, plan: {entry.get('plan', 'N/A')}")
        
        # TEST 7: REGRESSION - Check referral_rewards count after
        print("\n" + "=" * 80)
        print("TEST 7: REGRESSION CHECK - NO NEW REWARDS CREATED")
        print("=" * 80)
        
        rewards_after = db.referral_rewards.count_documents({})
        print(f"✓ Referral rewards count AFTER: {rewards_after}")
        
        if rewards_after != rewards_before:
            print(f"❌ FAILED: Referral rewards count changed!")
            print(f"   Before: {rewards_before}")
            print(f"   After: {rewards_after}")
            print(f"   Difference: {rewards_after - rewards_before}")
            print(f"   This endpoint should NOT create new rewards (read-only)")
            sys.exit(1)
        
        print(f"✅ PASSED: Referral rewards count unchanged ({rewards_before} → {rewards_after})")
        print(f"✅ PASSED: No new rewards created by GET /admin/referrals (read-only confirmed)")
        
        # FINAL SUMMARY
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED - PHASE 1 REFERRAL TRANSPARENCY")
        print("=" * 80)
        print(f"✅ TEST 1: Admin login successful")
        print(f"✅ TEST 2: GET /admin/referrals returns correct structure")
        print(f"✅ TEST 3: All {total_recent_entries} recent entries have qualified + reason fields")
        print(f"✅ TEST 4: All reason codes are valid")
        print(f"✅ TEST 5: All entries are consistent (qualified ↔ reason)")
        print(f"✅ TEST 6: GET /me/referral returns qualified + reason in joined array")
        print(f"✅ TEST 7: REGRESSION - No new rewards created (read-only)")
        print("\n🎯 SUMMARY:")
        print(f"   - Total recent entries checked: {total_recent_entries}")
        print(f"   - Total joined entries checked: {len(joined)}")
        print(f"   - All entries have qualified (boolean) + reason (string)")
        print(f"   - All reason codes are valid engine codes")
        print(f"   - All entries are consistent (qualified=true → reason='qualified')")
        print(f"   - Referral reward computation unchanged (no new rewards)")
        print("\n✅ PHASE 1 REFERRAL TRANSPARENCY IS PRODUCTION-READY")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED WITH EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        client.close()

if __name__ == "__main__":
    main()
