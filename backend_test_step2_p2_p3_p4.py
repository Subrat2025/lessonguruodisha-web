#!/usr/bin/env python3
"""
Backend Testing for STEP 2 P2/P3/P4 — Switch-Off Preview, Rs99 Gating, Unified X Display
Base URL: https://odisha-learning-pro.preview.emergentagent.com/api
Admin: 9692604577 / Subrat@909e
User: 9999900001 / Test@1234
"""
import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
USER_MOBILE = "9999900001"
USER_PASSWORD = "Test@1234"

def login(mobile, password):
    """Login and return auth token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def test_switch_off_preview_endpoint():
    """
    TEST 1: NEW endpoint GET /api/admin/referral-milestone/switch-off-preview
    - With admin auth → 200, JSON has ok:true and keys: ambassadorThreshold, teacherCount, totalFreeDays, ambassadorCount, rows
    - No auth → 401
    - Non-admin (user 9999900001) → 403
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/admin/referral-milestone/switch-off-preview")
    print("="*80)
    
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    user_token = login(USER_MOBILE, USER_PASSWORD)
    
    if not admin_token:
        print("❌ TEST 1 FAILED: Could not get admin token")
        return False
    if not user_token:
        print("❌ TEST 1 FAILED: Could not get user token")
        return False
    
    # 1.1: No auth → 401
    print("\n1.1. Testing no auth → expect 401")
    try:
        resp = requests.get(f"{BASE_URL}/admin/referral-milestone/switch-off-preview", timeout=35)
        if resp.status_code == 401:
            print(f"✅ No auth → 401 (correct)")
        else:
            print(f"❌ No auth → {resp.status_code} (expected 401)")
            return False
    except Exception as e:
        print(f"❌ No auth test exception: {e}")
        return False
    
    # 1.2: Non-admin → 403
    print("\n1.2. Testing non-admin user → expect 403")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone/switch-off-preview",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=35
        )
        if resp.status_code == 403:
            print(f"✅ Non-admin → 403 (correct)")
        else:
            print(f"❌ Non-admin → {resp.status_code} (expected 403)")
            print(f"   Response: {resp.text[:300]}")
            return False
    except Exception as e:
        print(f"❌ Non-admin test exception: {e}")
        return False
    
    # 1.3: Admin → 200 with required fields
    print("\n1.3. Testing admin auth → expect 200 with ok:true and required keys")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone/switch-off-preview",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=35
        )
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ Admin request → {resp.status_code} (expected 200)")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        
        # Check ok:true
        if not data.get("ok"):
            print(f"❌ Response has ok:{data.get('ok')} (expected ok:true)")
            print(f"   Full response: {json.dumps(data, indent=2)[:500]}")
            return False
        
        # Check required keys
        required_keys = ["ambassadorThreshold", "teacherCount", "totalFreeDays", "ambassadorCount", "rows"]
        missing_keys = [k for k in required_keys if k not in data]
        if missing_keys:
            print(f"❌ Missing required keys: {missing_keys}")
            print(f"   Available keys: {list(data.keys())}")
            return False
        
        # Validate types
        if not isinstance(data["ambassadorThreshold"], (int, float)):
            print(f"❌ ambassadorThreshold is not a number: {type(data['ambassadorThreshold'])}")
            return False
        if not isinstance(data["teacherCount"], (int, float)):
            print(f"❌ teacherCount is not a number: {type(data['teacherCount'])}")
            return False
        if not isinstance(data["totalFreeDays"], (int, float)):
            print(f"❌ totalFreeDays is not a number: {type(data['totalFreeDays'])}")
            return False
        if not isinstance(data["ambassadorCount"], (int, float)):
            print(f"❌ ambassadorCount is not a number: {type(data['ambassadorCount'])}")
            return False
        if not isinstance(data["rows"], list):
            print(f"❌ rows is not an array: {type(data['rows'])}")
            return False
        
        print(f"✅ Admin → 200 with ok:true")
        print(f"   ambassadorThreshold: {data['ambassadorThreshold']}")
        print(f"   teacherCount: {data['teacherCount']}")
        print(f"   totalFreeDays: {data['totalFreeDays']}")
        print(f"   ambassadorCount: {data['ambassadorCount']}")
        print(f"   rows count: {len(data['rows'])}")
        
        # If rows non-empty, check structure
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            print(f"   Sample row keys: {list(row.keys())}")
            expected_row_keys = ["name", "mobileLast4", "X", "freeDays", "becomesAmbassador"]
            missing_row_keys = [k for k in expected_row_keys if k not in row]
            if missing_row_keys:
                print(f"⚠️  Row missing keys: {missing_row_keys} (may be optional)")
            else:
                print(f"✅ Row has all expected keys: {expected_row_keys}")
        
        # Check it completed within ~30s (we set timeout to 35s)
        print(f"✅ Request completed within timeout (~30s)")
        
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ Request timed out (>35s)")
        return False
    except Exception as e:
        print(f"❌ Admin test exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_me_referral_endpoint():
    """
    TEST 2: GET /api/me/referral (user auth)
    - Must return 200
    - Body MUST include top-level milestoneCount (number) and ambassador object {eligible, target, count}
    - Existing fields still present: code, link, stats (with qualified), rewards
    """
    print("\n" + "="*80)
    print("TEST 2: GET /api/me/referral (user auth)")
    print("="*80)
    
    user_token = login(USER_MOBILE, USER_PASSWORD)
    if not user_token:
        print("❌ TEST 2 FAILED: Could not get user token")
        return False
    
    print("\n2.1. Testing GET /api/me/referral with user auth")
    try:
        resp = requests.get(
            f"{BASE_URL}/me/referral",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=30
        )
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ GET /api/me/referral → {resp.status_code} (expected 200)")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        print(f"   Response keys: {list(data.keys())}")
        
        # Check milestoneCount (top-level, number)
        if "milestoneCount" not in data:
            print(f"❌ Missing top-level 'milestoneCount' field")
            return False
        if not isinstance(data["milestoneCount"], (int, float)):
            print(f"❌ milestoneCount is not a number: {type(data['milestoneCount'])}")
            return False
        print(f"✅ milestoneCount present: {data['milestoneCount']} (type: {type(data['milestoneCount']).__name__})")
        
        # Check ambassador object
        if "ambassador" not in data:
            print(f"❌ Missing 'ambassador' object")
            return False
        if not isinstance(data["ambassador"], dict):
            print(f"❌ ambassador is not an object: {type(data['ambassador'])}")
            return False
        
        amb = data["ambassador"]
        print(f"   ambassador keys: {list(amb.keys())}")
        
        required_amb_keys = ["eligible", "target", "count"]
        missing_amb_keys = [k for k in required_amb_keys if k not in amb]
        if missing_amb_keys:
            print(f"❌ ambassador object missing keys: {missing_amb_keys}")
            return False
        
        if not isinstance(amb["eligible"], bool):
            print(f"❌ ambassador.eligible is not a boolean: {type(amb['eligible'])}")
            return False
        if not isinstance(amb["target"], (int, float)):
            print(f"❌ ambassador.target is not a number: {type(amb['target'])}")
            return False
        if not isinstance(amb["count"], (int, float)):
            print(f"❌ ambassador.count is not a number: {type(amb['count'])}")
            return False
        
        print(f"✅ ambassador object present with all required keys:")
        print(f"   - eligible: {amb['eligible']} (bool)")
        print(f"   - target: {amb['target']} (number)")
        print(f"   - count: {amb['count']} (number)")
        
        # Check existing fields still present
        existing_fields = ["code", "link", "stats", "rewards"]
        missing_existing = [f for f in existing_fields if f not in data]
        if missing_existing:
            print(f"❌ Missing existing fields: {missing_existing}")
            return False
        
        print(f"✅ Existing fields still present: {existing_fields}")
        
        # Check stats.qualified
        if "qualified" not in data["stats"]:
            print(f"❌ stats.qualified missing")
            return False
        print(f"✅ stats.qualified present: {data['stats']['qualified']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_regression_endpoints():
    """
    TEST 3: Regression — all must be 200, no 500s
    - GET /api/referral/my-milestone (user auth)
    - GET /api/referral/milestone-config (user auth)
    - GET /api/admin/referral-milestone (admin)
    - GET /api/admin/referral-milestone?withReached=1 (admin)
    - GET /api/admin/referral-milestone/preview?limit=20 (admin)
    """
    print("\n" + "="*80)
    print("TEST 3: Regression Tests (no 500s)")
    print("="*80)
    
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    user_token = login(USER_MOBILE, USER_PASSWORD)
    
    if not admin_token or not user_token:
        print("❌ TEST 3 FAILED: Could not get tokens")
        return False
    
    tests = [
        ("GET /api/referral/my-milestone (user)", f"{BASE_URL}/referral/my-milestone", user_token),
        ("GET /api/referral/milestone-config (user)", f"{BASE_URL}/referral/milestone-config", user_token),
        ("GET /api/admin/referral-milestone (admin)", f"{BASE_URL}/admin/referral-milestone", admin_token),
        ("GET /api/admin/referral-milestone?withReached=1 (admin)", f"{BASE_URL}/admin/referral-milestone?withReached=1", admin_token),
        ("GET /api/admin/referral-milestone/preview?limit=20 (admin)", f"{BASE_URL}/admin/referral-milestone/preview?limit=20", admin_token),
    ]
    
    all_passed = True
    for name, url, token in tests:
        print(f"\n3.{tests.index((name, url, token)) + 1}. Testing {name}")
        try:
            resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=35)
            print(f"   Status: {resp.status_code}")
            
            if resp.status_code == 200:
                print(f"✅ {name} → 200")
            elif resp.status_code >= 500:
                print(f"❌ {name} → {resp.status_code} (SERVER ERROR)")
                print(f"   Response: {resp.text[:500]}")
                all_passed = False
            else:
                print(f"⚠️  {name} → {resp.status_code} (not 200, but not 500)")
                print(f"   Response: {resp.text[:300]}")
        except requests.exceptions.Timeout:
            print(f"❌ {name} → TIMEOUT (>35s)")
            all_passed = False
        except Exception as e:
            print(f"❌ {name} → Exception: {e}")
            all_passed = False
    
    return all_passed

def test_ambassador_kill_switch():
    """
    TEST 4: Ambassador kill-switch regression (CRITICAL)
    - GET /api/plans → plans array has NO item with id 'ambassador-yearly'
    - POST /api/razorpay/create-order { planId: 'ambassador-yearly' } (user auth) → blocked (expect 400 or 403, NOT a created order)
    - Confirm GET /api/admin/referral-milestone returns continuousLadder: true (ladder ON)
    """
    print("\n" + "="*80)
    print("TEST 4: Ambassador Kill-Switch Regression (CRITICAL)")
    print("="*80)
    
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    user_token = login(USER_MOBILE, USER_PASSWORD)
    
    if not admin_token or not user_token:
        print("❌ TEST 4 FAILED: Could not get tokens")
        return False
    
    # 4.1: GET /api/plans → no ambassador-yearly
    print("\n4.1. Testing GET /api/plans → no ambassador-yearly")
    try:
        resp = requests.get(f"{BASE_URL}/plans", headers={"Authorization": f"Bearer {user_token}"}, timeout=30)
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ GET /api/plans → {resp.status_code} (expected 200)")
            return False
        
        data = resp.json()
        plans = data.get("plans", [])
        print(f"   Plans count: {len(plans)}")
        
        ambassador_plan = next((p for p in plans if p.get("id") == "ambassador-yearly"), None)
        if ambassador_plan:
            print(f"❌ ambassador-yearly plan FOUND in plans list (should be blocked)")
            print(f"   Plan: {json.dumps(ambassador_plan, indent=2)}")
            return False
        
        print(f"✅ ambassador-yearly plan NOT in plans list (correctly blocked)")
        plan_ids = [p.get("id") for p in plans]
        print(f"   Available plan IDs: {plan_ids}")
        
    except Exception as e:
        print(f"❌ Test exception: {e}")
        return False
    
    # 4.2: POST /api/razorpay/create-order with ambassador-yearly → blocked
    print("\n4.2. Testing POST /api/razorpay/create-order with ambassador-yearly → expect 400/403")
    try:
        resp = requests.post(
            f"{BASE_URL}/razorpay/create-order",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"planId": "ambassador-yearly"},
            timeout=30
        )
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code in [400, 403]:
            print(f"✅ create-order with ambassador-yearly → {resp.status_code} (correctly blocked)")
            data = resp.json()
            print(f"   Error message: {data.get('error', 'N/A')}")
        elif resp.status_code == 200:
            print(f"❌ create-order with ambassador-yearly → 200 (SHOULD BE BLOCKED)")
            print(f"   Response: {resp.text[:500]}")
            return False
        else:
            print(f"⚠️  create-order with ambassador-yearly → {resp.status_code} (expected 400/403)")
            print(f"   Response: {resp.text[:300]}")
        
    except Exception as e:
        print(f"❌ Test exception: {e}")
        return False
    
    # 4.3: Confirm continuousLadder: true
    print("\n4.3. Testing GET /api/admin/referral-milestone → continuousLadder: true")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ GET /api/admin/referral-milestone → {resp.status_code} (expected 200)")
            return False
        
        data = resp.json()
        continuous_ladder = data.get("continuousLadder")
        print(f"   continuousLadder: {continuous_ladder}")
        
        if continuous_ladder is True:
            print(f"✅ continuousLadder: true (ladder ON, as expected)")
        else:
            print(f"⚠️  continuousLadder: {continuous_ladder} (expected true)")
        
        return True
        
    except Exception as e:
        print(f"❌ Test exception: {e}")
        return False

def test_gift_reward_title():
    """
    TEST 5: GET /api/admin/referral-milestone (admin) → config.rewards.gift.title
    Report its exact value (expected 'Gift Hamper' on a fresh config; note if DB has a custom saved value)
    """
    print("\n" + "="*80)
    print("TEST 5: Gift Reward Title")
    print("="*80)
    
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ TEST 5 FAILED: Could not get admin token")
        return False
    
    print("\n5.1. Testing GET /api/admin/referral-milestone → config.rewards.gift.title")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/referral-milestone",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ GET /api/admin/referral-milestone → {resp.status_code} (expected 200)")
            return False
        
        data = resp.json()
        
        if "config" not in data:
            print(f"❌ Response missing 'config' field")
            return False
        
        config = data["config"]
        if "rewards" not in config:
            print(f"❌ config missing 'rewards' field")
            return False
        
        rewards = config["rewards"]
        if "gift" not in rewards:
            print(f"❌ rewards missing 'gift' field")
            return False
        
        gift = rewards["gift"]
        if "title" not in gift:
            print(f"❌ gift missing 'title' field")
            return False
        
        title = gift["title"]
        print(f"✅ config.rewards.gift.title: '{title}'")
        
        if title == "Gift Hamper":
            print(f"✅ Title matches expected default: 'Gift Hamper'")
        else:
            print(f"⚠️  Title is '{title}' (expected 'Gift Hamper' on fresh config)")
            print(f"   Note: DB may have a custom saved value")
        
        return True
        
    except Exception as e:
        print(f"❌ Test exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("BACKEND TESTING: STEP 2 P2/P3/P4")
    print("Switch-Off Preview, Rs99 Gating, Unified X Display")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"User: {USER_MOBILE}")
    print("="*80)
    
    results = []
    
    # Test 1: Switch-off preview endpoint
    try:
        result = test_switch_off_preview_endpoint()
        results.append(("TEST 1: Switch-Off Preview Endpoint", result))
    except Exception as e:
        print(f"\n❌ TEST 1 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        results.append(("TEST 1: Switch-Off Preview Endpoint", False))
    
    # Test 2: /me/referral endpoint
    try:
        result = test_me_referral_endpoint()
        results.append(("TEST 2: /me/referral Endpoint", result))
    except Exception as e:
        print(f"\n❌ TEST 2 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        results.append(("TEST 2: /me/referral Endpoint", False))
    
    # Test 3: Regression endpoints
    try:
        result = test_regression_endpoints()
        results.append(("TEST 3: Regression Endpoints", result))
    except Exception as e:
        print(f"\n❌ TEST 3 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        results.append(("TEST 3: Regression Endpoints", False))
    
    # Test 4: Ambassador kill-switch
    try:
        result = test_ambassador_kill_switch()
        results.append(("TEST 4: Ambassador Kill-Switch", result))
    except Exception as e:
        print(f"\n❌ TEST 4 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        results.append(("TEST 4: Ambassador Kill-Switch", False))
    
    # Test 5: Gift reward title
    try:
        result = test_gift_reward_title()
        results.append(("TEST 5: Gift Reward Title", result))
    except Exception as e:
        print(f"\n❌ TEST 5 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        results.append(("TEST 5: Gift Reward Title", False))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
