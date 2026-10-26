#!/usr/bin/env python3
"""
Backend Test: LIVE FIXES ROUND — Milestone Count + Fast Aggregation + DB Kill-Switch (PREVIEW ONLY)

Tests the following (READ-ONLY where possible):
1. GET /api/admin/referral-milestone/preview?limit=10 (admin) → 200, ok:true, countCheck object
2. GET /api/admin/referral-milestone/switch-off-preview (admin) → 200, ok:true, fast (<30s)
3. Kill-switch DB toggle: GET/PUT /api/admin/referral-milestone with ambassadorKill field
4. GET /api/me/referral (user auth) → 200, returns milestoneCount, earnedMilestones, ambassador object
5. No regressions on other endpoints
6. With kill ON: POST /api/razorpay/create-order with ambassador-yearly must be blocked

Admin: 9692604577 / Subrat@909e
User: 9999900001 / Test@1234
Base URL: NEXT_PUBLIC_BASE_URL + /api
"""

import asyncio
import os
import sys
from playwright.async_api import async_playwright
import json

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
USER_MOBILE = "9999900001"
USER_PASSWORD = "Test@1234"

async def login(page, mobile, password):
    """Login and return JWT token"""
    try:
        response = await page.request.post(f"{BASE_URL}/auth/login", data={
            "mobile": mobile,
            "password": password
        })
        if response.status != 200:
            print(f"❌ Login failed for {mobile}: {response.status}")
            return None
        data = await response.json()
        token = data.get("token")
        if not token:
            print(f"❌ No token in login response for {mobile}")
            return None
        print(f"✅ Login successful for {mobile}")
        return token
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

async def test_preview_endpoint(page, admin_token):
    """Test 1: GET /api/admin/referral-milestone/preview?limit=10"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/admin/referral-milestone/preview?limit=10 (admin)")
    print("="*80)
    
    try:
        import time
        start_time = time.time()
        
        response = await page.request.get(
            f"{BASE_URL}/admin/referral-milestone/preview?limit=10",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        elapsed = time.time() - start_time
        
        print(f"1.1. Status: {response.status}")
        if response.status != 200:
            print(f"❌ Expected 200, got {response.status}")
            return False
        
        data = await response.json()
        print(f"1.2. Response ok: {data.get('ok')}")
        
        if not data.get('ok'):
            print(f"❌ Expected ok:true, got {data.get('ok')}")
            return False
        
        # Check for countCheck object
        countCheck = data.get('countCheck')
        print(f"1.3. countCheck present: {countCheck is not None}")
        
        if not countCheck:
            print(f"❌ countCheck object missing from response")
            print(f"Response keys: {list(data.keys())}")
            return False
        
        # Verify countCheck structure
        required_keys = ['oldAdminActiveTotal', 'newMilestoneActiveDeduped', 'newMilestoneEverPaid', 'top', 'calculatedAt']
        missing_keys = [k for k in required_keys if k not in countCheck]
        
        if missing_keys:
            print(f"❌ countCheck missing keys: {missing_keys}")
            print(f"countCheck keys: {list(countCheck.keys())}")
            return False
        
        print(f"1.4. countCheck structure:")
        print(f"     - oldAdminActiveTotal: {countCheck.get('oldAdminActiveTotal')} (type: {type(countCheck.get('oldAdminActiveTotal')).__name__})")
        print(f"     - newMilestoneActiveDeduped: {countCheck.get('newMilestoneActiveDeduped')} (type: {type(countCheck.get('newMilestoneActiveDeduped')).__name__})")
        print(f"     - newMilestoneEverPaid: {countCheck.get('newMilestoneEverPaid')} (type: {type(countCheck.get('newMilestoneEverPaid')).__name__})")
        print(f"     - top: {len(countCheck.get('top', []))} items (type: {type(countCheck.get('top')).__name__})")
        print(f"     - calculatedAt: {countCheck.get('calculatedAt')}")
        
        # Verify types
        if not isinstance(countCheck.get('oldAdminActiveTotal'), (int, float)):
            print(f"❌ oldAdminActiveTotal is not a number")
            return False
        
        if not isinstance(countCheck.get('newMilestoneActiveDeduped'), (int, float)):
            print(f"❌ newMilestoneActiveDeduped is not a number")
            return False
        
        if not isinstance(countCheck.get('newMilestoneEverPaid'), (int, float)):
            print(f"❌ newMilestoneEverPaid is not a number")
            return False
        
        if not isinstance(countCheck.get('top'), list):
            print(f"❌ top is not an array")
            return False
        
        # Check top-level fields
        if 'top' not in data:
            print(f"❌ top-level 'top' field missing")
            return False
        
        if 'calculatedAt' not in data:
            print(f"❌ top-level 'calculatedAt' field missing")
            return False
        
        print(f"1.5. Top-level fields present: top (array), calculatedAt")
        
        # Check timing
        print(f"1.6. Response time: {elapsed:.2f}s")
        if elapsed > 30:
            print(f"⚠️  Response took longer than 30s (timeout concern)")
        else:
            print(f"✅ Response completed within 30s")
        
        print(f"✅ TEST 1 PASSED: preview endpoint working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_switch_off_preview(page, admin_token):
    """Test 2: GET /api/admin/referral-milestone/switch-off-preview"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/admin/referral-milestone/switch-off-preview (admin)")
    print("="*80)
    
    try:
        import time
        start_time = time.time()
        
        response = await page.request.get(
            f"{BASE_URL}/admin/referral-milestone/switch-off-preview",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        elapsed = time.time() - start_time
        
        print(f"2.1. Status: {response.status}")
        if response.status != 200:
            print(f"❌ Expected 200, got {response.status}")
            return False
        
        data = await response.json()
        print(f"2.2. Response ok: {data.get('ok')}")
        
        if not data.get('ok'):
            print(f"❌ Expected ok:true, got {data.get('ok')}")
            return False
        
        # Check required fields
        required_keys = ['byDays', 'rows', 'teacherCount', 'ambassadorCount', 'ambassadorThreshold', 'calculatedAt']
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            print(f"❌ Missing keys: {missing_keys}")
            print(f"Response keys: {list(data.keys())}")
            return False
        
        print(f"2.3. Response structure:")
        print(f"     - byDays: {data.get('byDays')}")
        print(f"     - rows: {len(data.get('rows', []))} items")
        print(f"     - teacherCount: {data.get('teacherCount')}")
        print(f"     - ambassadorCount: {data.get('ambassadorCount')}")
        print(f"     - ambassadorThreshold: {data.get('ambassadorThreshold')}")
        print(f"     - calculatedAt: {data.get('calculatedAt')}")
        
        # Check timing
        print(f"2.4. Response time: {elapsed:.2f}s")
        if elapsed > 30:
            print(f"⚠️  Response took longer than 30s (timeout concern)")
        else:
            print(f"✅ Response completed within 30s")
        
        print(f"✅ TEST 2 PASSED: switch-off-preview endpoint working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_kill_switch_toggle(page, admin_token):
    """Test 3: Kill-switch DB toggle"""
    print("\n" + "="*80)
    print("TEST 3: Kill-switch DB toggle (ambassadorKill field)")
    print("="*80)
    
    try:
        # 3.1. GET initial state
        print("3.1. GET /api/admin/referral-milestone (initial state)")
        response = await page.request.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if response.status != 200:
            print(f"❌ GET failed: {response.status}")
            return False
        
        data = await response.json()
        initial_kill = data.get('ambassadorKill')
        print(f"     Initial ambassadorKill: {initial_kill}")
        
        if initial_kill is None:
            print(f"❌ ambassadorKill field missing from response")
            return False
        
        if initial_kill != True:
            print(f"⚠️  Expected ambassadorKill to be true (default), got {initial_kill}")
        
        # 3.2. PUT ambassadorKill: false
        print("3.2. PUT /api/admin/referral-milestone with ambassadorKill: false")
        response = await page.request.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            data=json.dumps({"ambassadorKill": False})
        )
        
        if response.status != 200:
            print(f"❌ PUT failed: {response.status}")
            return False
        
        data = await response.json()
        new_kill = data.get('ambassadorKill')
        print(f"     Response ambassadorKill: {new_kill}")
        
        if new_kill != False:
            print(f"❌ Expected ambassadorKill to be false, got {new_kill}")
            return False
        
        # 3.3. GET to verify persistence
        print("3.3. GET /api/admin/referral-milestone (verify persistence)")
        response = await page.request.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if response.status != 200:
            print(f"❌ GET failed: {response.status}")
            return False
        
        data = await response.json()
        persisted_kill = data.get('ambassadorKill')
        print(f"     Persisted ambassadorKill: {persisted_kill}")
        
        if persisted_kill != False:
            print(f"❌ ambassadorKill not persisted correctly, got {persisted_kill}")
            return False
        
        # 3.4. RESTORE to true (IMPORTANT)
        print("3.4. PUT /api/admin/referral-milestone with ambassadorKill: true (RESTORE)")
        response = await page.request.put(
            f"{BASE_URL}/admin/referral-milestone",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json"
            },
            data=json.dumps({"ambassadorKill": True})
        )
        
        if response.status != 200:
            print(f"❌ RESTORE PUT failed: {response.status}")
            return False
        
        data = await response.json()
        restored_kill = data.get('ambassadorKill')
        print(f"     Restored ambassadorKill: {restored_kill}")
        
        if restored_kill != True:
            print(f"❌ Failed to restore ambassadorKill to true, got {restored_kill}")
            return False
        
        # 3.5. Verify GET /api/plans does NOT contain ambassador-yearly
        print("3.5. GET /api/plans (verify ambassador-yearly NOT exposed)")
        response = await page.request.get(f"{BASE_URL}/plans")
        
        if response.status != 200:
            print(f"❌ GET /api/plans failed: {response.status}")
            return False
        
        plans = await response.json()
        plan_ids = [p.get('id') for p in plans if isinstance(p, dict)]
        print(f"     Available plan IDs: {plan_ids}")
        
        if 'ambassador-yearly' in plan_ids:
            print(f"❌ ambassador-yearly plan is exposed in /api/plans (should be blocked)")
            return False
        
        print(f"✅ ambassador-yearly correctly NOT in plans list")
        
        print(f"✅ TEST 3 PASSED: Kill-switch toggle working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_me_referral(page, user_token):
    """Test 4: GET /api/me/referral (user auth)"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/me/referral (user auth)")
    print("="*80)
    
    try:
        response = await page.request.get(
            f"{BASE_URL}/me/referral",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        print(f"4.1. Status: {response.status}")
        if response.status != 200:
            print(f"❌ Expected 200, got {response.status}")
            return False
        
        data = await response.json()
        
        # Check for new fields
        print(f"4.2. Checking new fields:")
        
        # milestoneCount
        milestone_count = data.get('milestoneCount')
        print(f"     - milestoneCount: {milestone_count} (type: {type(milestone_count).__name__})")
        
        if milestone_count is None:
            print(f"❌ milestoneCount field missing")
            return False
        
        if not isinstance(milestone_count, (int, float)):
            print(f"❌ milestoneCount is not a number")
            return False
        
        # earnedMilestones
        earned_milestones = data.get('earnedMilestones')
        print(f"     - earnedMilestones: {earned_milestones} (type: {type(earned_milestones).__name__})")
        
        if earned_milestones is None:
            print(f"❌ earnedMilestones field missing")
            return False
        
        if not isinstance(earned_milestones, list):
            print(f"❌ earnedMilestones is not an array")
            return False
        
        # ambassador object
        ambassador = data.get('ambassador')
        print(f"     - ambassador: {ambassador}")
        
        if ambassador is None:
            print(f"❌ ambassador object missing")
            return False
        
        if not isinstance(ambassador, dict):
            print(f"❌ ambassador is not an object")
            return False
        
        # Check ambassador structure
        required_amb_keys = ['eligible', 'target', 'count']
        missing_amb_keys = [k for k in required_amb_keys if k not in ambassador]
        
        if missing_amb_keys:
            print(f"❌ ambassador object missing keys: {missing_amb_keys}")
            return False
        
        print(f"     - ambassador.eligible: {ambassador.get('eligible')} (type: {type(ambassador.get('eligible')).__name__})")
        print(f"     - ambassador.target: {ambassador.get('target')} (type: {type(ambassador.get('target')).__name__})")
        print(f"     - ambassador.count: {ambassador.get('count')} (type: {type(ambassador.get('count')).__name__})")
        
        if not isinstance(ambassador.get('eligible'), bool):
            print(f"❌ ambassador.eligible is not a boolean")
            return False
        
        if not isinstance(ambassador.get('target'), (int, float)):
            print(f"❌ ambassador.target is not a number")
            return False
        
        if not isinstance(ambassador.get('count'), (int, float)):
            print(f"❌ ambassador.count is not a number")
            return False
        
        # Check existing fields still present
        print(f"4.3. Checking existing fields still present:")
        existing_fields = ['code', 'link', 'stats', 'rewards']
        missing_existing = [f for f in existing_fields if f not in data]
        
        if missing_existing:
            print(f"❌ Existing fields missing: {missing_existing}")
            return False
        
        print(f"     - code: {data.get('code')}")
        print(f"     - link: {data.get('link')}")
        print(f"     - stats: present")
        print(f"     - rewards: {len(data.get('rewards', []))} items")
        
        print(f"✅ TEST 4 PASSED: /me/referral endpoint working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_regressions(page, admin_token, user_token):
    """Test 5: No regressions on other endpoints"""
    print("\n" + "="*80)
    print("TEST 5: No regressions on other endpoints")
    print("="*80)
    
    results = []
    
    # 5.1. GET /api/admin/referral-milestone?withReached=1
    try:
        print("5.1. GET /api/admin/referral-milestone?withReached=1 (admin)")
        response = await page.request.get(
            f"{BASE_URL}/admin/referral-milestone?withReached=1",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if response.status == 200:
            print(f"     ✅ Status: 200")
            results.append(True)
        else:
            print(f"     ❌ Status: {response.status}")
            results.append(False)
    except Exception as e:
        print(f"     ❌ Exception: {e}")
        results.append(False)
    
    # 5.2. GET /api/referral/my-milestone
    try:
        print("5.2. GET /api/referral/my-milestone (user)")
        response = await page.request.get(
            f"{BASE_URL}/referral/my-milestone",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        if response.status == 200:
            print(f"     ✅ Status: 200")
            results.append(True)
        else:
            print(f"     ❌ Status: {response.status}")
            results.append(False)
    except Exception as e:
        print(f"     ❌ Exception: {e}")
        results.append(False)
    
    # 5.3. GET /api/referral/milestone-config
    try:
        print("5.3. GET /api/referral/milestone-config (user)")
        response = await page.request.get(
            f"{BASE_URL}/referral/milestone-config",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        if response.status == 200:
            print(f"     ✅ Status: 200")
            results.append(True)
        else:
            print(f"     ❌ Status: {response.status}")
            results.append(False)
    except Exception as e:
        print(f"     ❌ Exception: {e}")
        results.append(False)
    
    if all(results):
        print(f"✅ TEST 5 PASSED: No regressions detected")
        return True
    else:
        print(f"❌ TEST 5 FAILED: Some endpoints returned errors")
        return False

async def test_ambassador_plan_blocked(page, user_token):
    """Test 6: With kill ON, ambassador-yearly must be blocked"""
    print("\n" + "="*80)
    print("TEST 6: POST /api/razorpay/create-order with ambassador-yearly (must be blocked)")
    print("="*80)
    
    try:
        response = await page.request.post(
            f"{BASE_URL}/razorpay/create-order",
            headers={
                "Authorization": f"Bearer {user_token}",
                "Content-Type": "application/json"
            },
            data=json.dumps({"planId": "ambassador-yearly"})
        )
        
        print(f"6.1. Status: {response.status}")
        
        # Should be blocked (400 or 403)
        if response.status in [400, 403]:
            data = await response.json()
            error = data.get('error', '')
            print(f"     ✅ Correctly blocked with status {response.status}")
            print(f"     Error message: {error}")
            print(f"✅ TEST 6 PASSED: ambassador-yearly plan correctly blocked")
            return True
        elif response.status == 200:
            data = await response.json()
            print(f"     ❌ Order was created (should be blocked)")
            print(f"     Response: {data}")
            return False
        else:
            print(f"     ⚠️  Unexpected status: {response.status}")
            return False
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    print("="*80)
    print("BACKEND TEST: LIVE FIXES ROUND — Milestone Count + Fast Aggregation + DB Kill-Switch")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"User: {USER_MOBILE}")
    print("="*80)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Login
        print("\n📝 Logging in...")
        admin_token = await login(page, ADMIN_MOBILE, ADMIN_PASSWORD)
        user_token = await login(page, USER_MOBILE, USER_PASSWORD)
        
        if not admin_token or not user_token:
            print("\n❌ LOGIN FAILED - Cannot proceed with tests")
            await browser.close()
            return False
        
        # Run tests
        results = []
        
        # Test 1: Preview endpoint with countCheck
        results.append(await test_preview_endpoint(page, admin_token))
        
        # Test 2: Switch-off preview
        results.append(await test_switch_off_preview(page, admin_token))
        
        # Test 3: Kill-switch toggle
        results.append(await test_kill_switch_toggle(page, admin_token))
        
        # Test 4: /me/referral with new fields
        results.append(await test_me_referral(page, user_token))
        
        # Test 5: Regressions
        results.append(await test_regressions(page, admin_token, user_token))
        
        # Test 6: Ambassador plan blocked
        results.append(await test_ambassador_plan_blocked(page, user_token))
        
        await browser.close()
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        passed = sum(results)
        total = len(results)
        print(f"Passed: {passed}/{total}")
        print(f"Success rate: {(passed/total*100):.1f}%")
        
        if all(results):
            print("\n✅ ALL TESTS PASSED")
            return True
        else:
            print("\n❌ SOME TESTS FAILED")
            return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
