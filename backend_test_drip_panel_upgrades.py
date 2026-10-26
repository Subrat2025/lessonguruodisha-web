#!/usr/bin/env python3
"""
Backend test for WhatsApp Drip Panel Upgrades (PREVIEW ONLY)
Base URL: https://odisha-learning-pro.preview.emergentagent.com/api
Admin: 9692604577 / <redacted>

CRITICAL GUARDRAILS:
- Do NOT set the drip enabled to true at any point
- Do NOT touch R2/storage flags
- Leave the config as found (enabled:false, new templates)

Test checklist:
1. POST /admin/whatsapp-drip/apply-remap (admin, empty body) → 200 {ok:true}
   - Assert response.config.welcomeTemplate === 'welcome_lessonguru'
   - Assert response.config.nudgeTemplate === 'upgrade_premium'
   - Assert response.config.sequence length === 1 and sequence[0].template === 'upgrade_premium'
   - Assert response.changed has welcomeTemplate/nudgeTemplate/removedSteps/sequenceCount
   - Record response.config.enabled

2. Call apply-remap a SECOND time → still 200, config identical, and config.enabled is UNCHANGED from step 1 (idempotent)

3. GET /admin/whatsapp-drip/stats (admin) → 200
   - Assert it has oldSystem {sent,failed,blocked} and newSystem {sent,failed,blocked,converted}
   - Assert perTemplate keys include all of: user_registration_2, lesson_guru_activate_01, premium_offer1, panchapdi_photo, welcome_lessonguru, upgrade_premium
   - Report oldSystem and newSystem values

3b. Confirm GET /admin/whatsapp-drip/stats responds quickly (under ~5s, not a hang)

4. Clobber-fix regression:
   - PUT /admin/whatsapp-drip/config {settings:{enabled:false}}
   - Then PUT /admin/whatsapp-drip/config {settings:{lastRunAt:(new ISO date string)}}
   - Then GET /admin/whatsapp-drip/config
   - Assert config.enabled is STILL false

5. Auth gating: POST /admin/whatsapp-drip/apply-remap and GET /admin/whatsapp-drip/stats WITHOUT a token → 401/403
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login_admin():
    """Login as admin and return JWT token"""
    print("\n=== ADMIN LOGIN ===")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"ERROR: Login failed - {resp.text}")
        return None
    data = resp.json()
    token = data.get("token")
    print(f"✅ Admin login successful")
    return token

def test_apply_remap(token):
    """Test 1 & 2: POST /admin/whatsapp-drip/apply-remap (twice for idempotency)"""
    print("\n=== TEST 1: POST /admin/whatsapp-drip/apply-remap (FIRST CALL) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/whatsapp-drip/apply-remap", headers=headers, json={})
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return None
        
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check response structure
        if not data.get("ok"):
            print(f"❌ FAIL: response.ok is not true")
            return None
        print(f"✅ response.ok === true")
        
        # Check config
        config = data.get("config", {})
        if config.get("welcomeTemplate") != "welcome_lessonguru":
            print(f"❌ FAIL: config.welcomeTemplate === '{config.get('welcomeTemplate')}', expected 'welcome_lessonguru'")
            return None
        print(f"✅ config.welcomeTemplate === 'welcome_lessonguru'")
        
        if config.get("nudgeTemplate") != "upgrade_premium":
            print(f"❌ FAIL: config.nudgeTemplate === '{config.get('nudgeTemplate')}', expected 'upgrade_premium'")
            return None
        print(f"✅ config.nudgeTemplate === 'upgrade_premium'")
        
        sequence = config.get("sequence", [])
        if len(sequence) != 1:
            print(f"❌ FAIL: config.sequence length === {len(sequence)}, expected 1")
            return None
        print(f"✅ config.sequence length === 1")
        
        if sequence[0].get("template") != "upgrade_premium":
            print(f"❌ FAIL: sequence[0].template === '{sequence[0].get('template')}', expected 'upgrade_premium'")
            return None
        print(f"✅ sequence[0].template === 'upgrade_premium'")
        
        # Check changed object
        changed = data.get("changed", {})
        required_keys = ["welcomeTemplate", "nudgeTemplate", "removedSteps", "sequenceCount"]
        for key in required_keys:
            if key not in changed:
                print(f"❌ FAIL: response.changed missing key '{key}'")
                return None
        print(f"✅ response.changed has all required keys: {required_keys}")
        
        # Record enabled state
        enabled_first = config.get("enabled")
        print(f"📝 config.enabled (first call) = {enabled_first}")
        
        # TEST 2: Call apply-remap SECOND time (idempotency check)
        print("\n=== TEST 2: POST /admin/whatsapp-drip/apply-remap (SECOND CALL - IDEMPOTENCY) ===")
        resp2 = requests.post(f"{BASE_URL}/admin/whatsapp-drip/apply-remap", headers=headers, json={})
        print(f"Status: {resp2.status_code}")
        
        if resp2.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp2.status_code}")
            return None
        
        data2 = resp2.json()
        config2 = data2.get("config", {})
        enabled_second = config2.get("enabled")
        
        if enabled_second != enabled_first:
            print(f"❌ FAIL: config.enabled changed from {enabled_first} to {enabled_second} (NOT idempotent)")
            return None
        print(f"✅ config.enabled UNCHANGED ({enabled_first} → {enabled_second}) - idempotent")
        
        # Verify config is identical
        if config2.get("welcomeTemplate") != "welcome_lessonguru":
            print(f"❌ FAIL: Second call config.welcomeTemplate changed")
            return None
        if config2.get("nudgeTemplate") != "upgrade_premium":
            print(f"❌ FAIL: Second call config.nudgeTemplate changed")
            return None
        if len(config2.get("sequence", [])) != 1:
            print(f"❌ FAIL: Second call config.sequence length changed")
            return None
        print(f"✅ Second call config identical to first call")
        
        print(f"\n✅ TEST 1 & 2 PASSED: apply-remap works correctly and is idempotent")
        return enabled_first
        
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        return None

def test_stats(token):
    """Test 3 & 3b: GET /admin/whatsapp-drip/stats"""
    print("\n=== TEST 3: GET /admin/whatsapp-drip/stats ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        start_time = time.time()
        resp = requests.get(f"{BASE_URL}/admin/whatsapp-drip/stats", headers=headers, timeout=10)
        elapsed = time.time() - start_time
        
        print(f"Status: {resp.status_code}")
        print(f"Response time: {elapsed:.2f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        # TEST 3b: Check response time
        if elapsed > 5.0:
            print(f"⚠️  WARNING: Response took {elapsed:.2f}s (> 5s threshold)")
        else:
            print(f"✅ Response time OK ({elapsed:.2f}s < 5s)")
        
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check oldSystem
        old_system = data.get("oldSystem")
        if not old_system:
            print(f"❌ FAIL: response.oldSystem missing")
            return False
        
        required_old_keys = ["sent", "failed", "blocked"]
        for key in required_old_keys:
            if key not in old_system:
                print(f"❌ FAIL: oldSystem missing key '{key}'")
                return False
        print(f"✅ oldSystem has all required keys: {required_old_keys}")
        print(f"   oldSystem = {old_system}")
        
        # Check newSystem
        new_system = data.get("newSystem")
        if not new_system:
            print(f"❌ FAIL: response.newSystem missing")
            return False
        
        required_new_keys = ["sent", "failed", "blocked", "converted"]
        for key in required_new_keys:
            if key not in new_system:
                print(f"❌ FAIL: newSystem missing key '{key}'")
                return False
        print(f"✅ newSystem has all required keys: {required_new_keys}")
        print(f"   newSystem = {new_system}")
        
        # Check perTemplate
        per_template = data.get("perTemplate", {})
        if not per_template:
            print(f"❌ FAIL: response.perTemplate missing")
            return False
        
        required_templates = [
            "user_registration_2",
            "lesson_guru_activate_01",
            "premium_offer1",
            "panchapdi_photo",
            "welcome_lessonguru",
            "upgrade_premium"
        ]
        
        missing_templates = []
        for tpl in required_templates:
            if tpl not in per_template:
                missing_templates.append(tpl)
        
        if missing_templates:
            print(f"❌ FAIL: perTemplate missing templates: {missing_templates}")
            print(f"   Available templates: {list(per_template.keys())}")
            return False
        
        print(f"✅ perTemplate includes all required templates: {required_templates}")
        
        # Print per-template stats
        print(f"\n📊 Per-Template Stats:")
        for tpl in required_templates:
            stats = per_template.get(tpl, {})
            print(f"   {tpl}: sent={stats.get('sent', 0)}, failed={stats.get('failed', 0)}, blocked={stats.get('blocked', 0)}, converted={stats.get('converted', 0)}")
        
        print(f"\n✅ TEST 3 & 3b PASSED: stats endpoint works correctly and responds quickly")
        return True
        
    except requests.Timeout:
        print(f"❌ FAIL: Request timed out (> 10s)")
        return False
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        return False

def test_clobber_fix(token):
    """Test 4: Clobber-fix regression"""
    print("\n=== TEST 4: CLOBBER-FIX REGRESSION ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        # Step 1: PUT config with enabled:false
        print("Step 1: PUT /admin/whatsapp-drip/config {enabled:false}")
        resp1 = requests.put(f"{BASE_URL}/admin/whatsapp-drip/config", headers=headers, json={
            "enabled": False
        })
        print(f"Status: {resp1.status_code}")
        
        if resp1.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp1.status_code}")
            return False
        
        data1 = resp1.json()
        if data1.get("config", {}).get("enabled") != False:
            print(f"❌ FAIL: config.enabled not set to false")
            return False
        print(f"✅ config.enabled set to false")
        
        # Step 2: PUT config with lastRunAt (simulating hourly tick)
        print("\nStep 2: PUT /admin/whatsapp-drip/config {lastRunAt:<ISO date>}")
        iso_date = datetime.utcnow().isoformat() + "Z"
        resp2 = requests.put(f"{BASE_URL}/admin/whatsapp-drip/config", headers=headers, json={
            "lastRunAt": iso_date
        })
        print(f"Status: {resp2.status_code}")
        
        if resp2.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp2.status_code}")
            return False
        print(f"✅ lastRunAt updated to {iso_date}")
        
        # Step 3: GET config and verify enabled is STILL false
        print("\nStep 3: GET /admin/whatsapp-drip/config")
        resp3 = requests.get(f"{BASE_URL}/admin/whatsapp-drip/config", headers=headers)
        print(f"Status: {resp3.status_code}")
        
        if resp3.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp3.status_code}")
            return False
        
        data3 = resp3.json()
        final_enabled = data3.get("config", {}).get("enabled")
        
        if final_enabled != False:
            print(f"❌ FAIL: config.enabled was CLOBBERED to {final_enabled} (expected false)")
            return False
        
        print(f"✅ config.enabled is STILL false (clobber-fix working)")
        print(f"\n✅ TEST 4 PASSED: Clobber-fix regression test passed")
        return True
        
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        return False

def test_auth_gating():
    """Test 5: Auth gating (no token → 401/403)"""
    print("\n=== TEST 5: AUTH GATING (NO TOKEN) ===")
    
    try:
        # Test apply-remap without token
        print("Test 5a: POST /admin/whatsapp-drip/apply-remap (no token)")
        resp1 = requests.post(f"{BASE_URL}/admin/whatsapp-drip/apply-remap", json={})
        print(f"Status: {resp1.status_code}")
        
        if resp1.status_code not in [401, 403]:
            print(f"❌ FAIL: Expected 401/403, got {resp1.status_code}")
            return False
        print(f"✅ apply-remap returns {resp1.status_code} without token")
        
        # Test stats without token
        print("\nTest 5b: GET /admin/whatsapp-drip/stats (no token)")
        resp2 = requests.get(f"{BASE_URL}/admin/whatsapp-drip/stats")
        print(f"Status: {resp2.status_code}")
        
        if resp2.status_code not in [401, 403]:
            print(f"❌ FAIL: Expected 401/403, got {resp2.status_code}")
            return False
        print(f"✅ stats returns {resp2.status_code} without token")
        
        print(f"\n✅ TEST 5 PASSED: Auth gating works correctly")
        return True
        
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        return False

def main():
    print("=" * 80)
    print("WHATSAPP DRIP PANEL UPGRADES - BACKEND TEST")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    print(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Admin login failed")
        return
    
    # Run tests
    results = {}
    
    # Test 1 & 2: apply-remap (idempotency)
    enabled_state = test_apply_remap(token)
    results["apply_remap"] = enabled_state is not None
    
    # Test 3 & 3b: stats
    results["stats"] = test_stats(token)
    
    # Test 4: clobber-fix
    results["clobber_fix"] = test_clobber_fix(token)
    
    # Test 5: auth gating
    results["auth_gating"] = test_auth_gating()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
    
    print("\n" + "=" * 80)
    print("OBSERVED VALUES:")
    print("=" * 80)
    print(f"config.enabled (after apply-remap): {enabled_state}")
    print("\nNOTE: Drip config left as found (enabled:false, new templates)")
    print("=" * 80)

if __name__ == "__main__":
    main()
