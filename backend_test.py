#!/usr/bin/env python3
"""
WhatsApp Drip Remap + Ultramsg-OFF Backend Tests (PREVIEW ONLY)
================================================================
Tests the WhatsApp drip system with the following CRITICAL GUARDRAILS:
- DO NOT enable drip master switch (never PUT /admin/whatsapp-drip/config with enabled:true)
- DO NOT touch R2 flags
- Send EXACTLY ONE login-OTP to 9692604577 (rate limit 3/15min)
- Use test accounts only; clean up TEST_ prefixed data
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test user credentials (for in-app notifications test)
TEST_USER_MOBILE = "9999900001"
TEST_USER_PASSWORD = "<redacted>"

# Global token storage
admin_token = None
test_user_token = None

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "details": []
}

def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"  Details: {details}")
    
    test_results["details"].append({
        "test": test_name,
        "passed": passed,
        "details": details
    })
    
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1

def login_admin() -> Optional[str]:
    """Login as admin and return token"""
    global admin_token
    print("\n🔐 Logging in as admin...")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get("token")
            print(f"✅ Admin login successful")
            return admin_token
        else:
            print(f"❌ Admin login failed: {response.status_code} - {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Admin login exception: {str(e)}")
        return None

def login_test_user() -> Optional[str]:
    """Login as test user and return token"""
    global test_user_token
    print("\n🔐 Logging in as test user...")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": TEST_USER_MOBILE, "password": TEST_USER_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            test_user_token = data.get("token")
            print(f"✅ Test user login successful")
            return test_user_token
        else:
            print(f"⚠️  Test user login failed: {response.status_code} - {response.text[:200]}")
            return None
    except Exception as e:
        print(f"⚠️  Test user login exception: {str(e)}")
        return None

def test_a_drip_config():
    """
    TEST A: GET /admin/whatsapp-drip/config
    Verify: enabled=false, enabledAt=null, welcomeTemplate='welcome_lessonguru',
    nudgeTemplate='upgrade_premium', sequence[0].template='upgrade_premium'
    No legacy names (user_registration_2, lesson_guru_activate_01)
    """
    print("\n" + "="*80)
    print("TEST A: GET /admin/whatsapp-drip/config")
    print("="*80)
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("A. GET /admin/whatsapp-drip/config - Status 200", False, f"Got {response.status_code}")
            return
        
        log_test("A. GET /admin/whatsapp-drip/config - Status 200", True)
        
        data = response.json()
        config = data.get("config", {})
        
        # Check enabled === false
        enabled = config.get("enabled")
        log_test("A. config.enabled === false", enabled == False, f"enabled={enabled}")
        
        # Check enabledAt === null
        enabled_at = config.get("enabledAt")
        log_test("A. config.enabledAt === null", enabled_at is None, f"enabledAt={enabled_at}")
        
        # Check welcomeTemplate === 'welcome_lessonguru'
        welcome_tpl = config.get("welcomeTemplate")
        log_test("A. config.welcomeTemplate === 'welcome_lessonguru'", 
                welcome_tpl == "welcome_lessonguru", f"welcomeTemplate={welcome_tpl}")
        
        # Check nudgeTemplate === 'upgrade_premium'
        nudge_tpl = config.get("nudgeTemplate")
        log_test("A. config.nudgeTemplate === 'upgrade_premium'", 
                nudge_tpl == "upgrade_premium", f"nudgeTemplate={nudge_tpl}")
        
        # Check sequence[0].template === 'upgrade_premium'
        sequence = config.get("sequence", [])
        if len(sequence) > 0:
            seq0_tpl = sequence[0].get("template")
            log_test("A. config.sequence[0].template === 'upgrade_premium'", 
                    seq0_tpl == "upgrade_premium", f"sequence[0].template={seq0_tpl}")
        else:
            log_test("A. config.sequence[0].template === 'upgrade_premium'", False, "sequence is empty")
        
        # Check NO legacy template names anywhere in config
        config_str = json.dumps(config).lower()
        legacy_names = ["user_registration_2", "lesson_guru_activate_01"]
        has_legacy = any(name in config_str for name in legacy_names)
        log_test("A. No legacy template names in config", not has_legacy, 
                f"Legacy names found: {has_legacy}")
        
        print(f"\n📊 Config Summary:")
        print(f"  enabled: {enabled}")
        print(f"  enabledAt: {enabled_at}")
        print(f"  welcomeTemplate: {welcome_tpl}")
        print(f"  nudgeTemplate: {nudge_tpl}")
        print(f"  sequence: {len(sequence)} steps")
        if sequence:
            for i, step in enumerate(sequence):
                print(f"    [{i}] template={step.get('template')}, delayHours={step.get('delayHours')}")
        
    except Exception as e:
        log_test("A. GET /admin/whatsapp-drip/config - Exception", False, str(e))

def test_b_drip_run_disabled():
    """
    TEST B: POST /admin/whatsapp-drip/run (with drip disabled)
    Verify: response.skipped === 'drip-disabled' (nothing sent)
    """
    print("\n" + "="*80)
    print("TEST B: POST /admin/whatsapp-drip/run (drip disabled)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/whatsapp-drip/run",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B. POST /admin/whatsapp-drip/run - Status 200", False, f"Got {response.status_code}")
            return
        
        log_test("B. POST /admin/whatsapp-drip/run - Status 200", True)
        
        data = response.json()
        skipped = data.get("skipped")
        
        log_test("B. response.skipped === 'drip-disabled'", 
                skipped == "drip-disabled", f"skipped={skipped}")
        
        print(f"\n📊 Run Result:")
        print(f"  skipped: {skipped}")
        print(f"  Full response: {json.dumps(data, indent=2)}")
        
    except Exception as e:
        log_test("B. POST /admin/whatsapp-drip/run - Exception", False, str(e))

def test_c_expired_logs():
    """
    TEST C: GET /admin/whatsapp-drip/logs?status=expired_not_sent
    Verify: total === 26
    """
    print("\n" + "="*80)
    print("TEST C: GET /admin/whatsapp-drip/logs?status=expired_not_sent")
    print("="*80)
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/logs?status=expired_not_sent",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("C. GET /admin/whatsapp-drip/logs - Status 200", False, f"Got {response.status_code}")
            return
        
        log_test("C. GET /admin/whatsapp-drip/logs - Status 200", True)
        
        data = response.json()
        total = data.get("total", 0)
        items = data.get("items", [])
        
        log_test("C. total === 26", total == 26, f"total={total}")
        
        # Count per-template breakdown
        template_counts = {}
        for item in items:
            tpl = item.get("template", "unknown")
            template_counts[tpl] = template_counts.get(tpl, 0) + 1
        
        print(f"\n📊 Expired Logs Summary:")
        print(f"  total: {total}")
        print(f"  Per-template breakdown:")
        for tpl, count in sorted(template_counts.items()):
            print(f"    {tpl}: {count}")
        
    except Exception as e:
        log_test("C. GET /admin/whatsapp-drip/logs - Exception", False, str(e))

def test_d_known_templates():
    """
    TEST D: GET /admin/wa/known-templates
    Verify: 200, returns templates array with status field (APPROVED/UNKNOWN/etc)
    Report each template name + status + approved boolean
    """
    print("\n" + "="*80)
    print("TEST D: GET /admin/wa/known-templates")
    print("="*80)
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/wa/known-templates",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("D. GET /admin/wa/known-templates - Status 200", False, f"Got {response.status_code}")
            return
        
        log_test("D. GET /admin/wa/known-templates - Status 200", True)
        
        data = response.json()
        templates = data.get("templates", [])
        
        log_test("D. Returns templates array", isinstance(templates, list) and len(templates) > 0, 
                f"templates count={len(templates)}")
        
        # Check each template has status field
        all_have_status = all("status" in t for t in templates)
        log_test("D. Each template has status field", all_have_status)
        
        print(f"\n📊 Known Templates Summary:")
        print(f"  Total templates: {len(templates)}")
        print(f"\n  Template Details:")
        for t in templates:
            name = t.get("name", "unknown")
            status = t.get("status", "unknown")
            approved = t.get("approved", False)
            print(f"    • {name}")
            print(f"      status: {status}")
            print(f"      approved: {approved}")
        
    except Exception as e:
        log_test("D. GET /admin/wa/known-templates - Exception", False, str(e))

def test_e_test_send_unapproved():
    """
    TEST E: POST /admin/wa/test-send (with unapproved template)
    Verify: 409 "Template is not approved"
    First read known-templates to find an unapproved one
    """
    print("\n" + "="*80)
    print("TEST E: POST /admin/wa/test-send (unapproved template)")
    print("="*80)
    
    try:
        # First get known templates to find an unapproved one
        response = requests.get(
            f"{BASE_URL}/admin/wa/known-templates",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("E. Could not fetch known-templates", False, f"Got {response.status_code}")
            return
        
        data = response.json()
        templates = data.get("templates", [])
        
        # Find an unapproved template
        unapproved_template = None
        for t in templates:
            if not t.get("approved", False):
                unapproved_template = t.get("name")
                break
        
        if not unapproved_template:
            print("⚠️  No unapproved templates found. Skipping test E.")
            log_test("E. POST /admin/wa/test-send (unapproved) - Skipped", True, 
                    "No unapproved templates available")
            return
        
        print(f"  Using unapproved template: {unapproved_template}")
        
        # Try to send with unapproved template
        response = requests.post(
            f"{BASE_URL}/admin/wa/test-send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"template": unapproved_template, "mobile": ADMIN_MOBILE},
            timeout=10
        )
        
        log_test("E. POST /admin/wa/test-send - Status 409", 
                response.status_code == 409, f"Got {response.status_code}")
        
        if response.status_code == 409:
            error_msg = response.json().get("error", "")
            log_test("E. Error message contains 'not approved'", 
                    "not approved" in error_msg.lower(), f"error={error_msg}")
            print(f"  Error message: {error_msg}")
        
    except Exception as e:
        log_test("E. POST /admin/wa/test-send - Exception", False, str(e))

def test_f_dry_run():
    """
    TEST F: POST /admin/wa/dry-run
    Verify: 200 with {count, estCost, approved, category, samples}
    """
    print("\n" + "="*80)
    print("TEST F: POST /admin/wa/dry-run")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/dry-run",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"template": "plan_expiring_soon", "audience": "all"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("F. POST /admin/wa/dry-run - Status 200", False, f"Got {response.status_code}")
            return
        
        log_test("F. POST /admin/wa/dry-run - Status 200", True)
        
        data = response.json()
        
        # Check required fields
        has_count = "count" in data
        has_estCost = "estCost" in data
        has_approved = "approved" in data
        has_category = "category" in data
        has_samples = "samples" in data
        
        log_test("F. Response has 'count' field", has_count, f"count={data.get('count')}")
        log_test("F. Response has 'estCost' field", has_estCost, f"estCost={data.get('estCost')}")
        log_test("F. Response has 'approved' field", has_approved, f"approved={data.get('approved')}")
        log_test("F. Response has 'category' field", has_category, f"category={data.get('category')}")
        log_test("F. Response has 'samples' field", has_samples, f"samples count={len(data.get('samples', []))}")
        
        print(f"\n📊 Dry Run Summary:")
        print(f"  count: {data.get('count')}")
        print(f"  estCost: {data.get('estCost')}")
        print(f"  approved: {data.get('approved')}")
        print(f"  category: {data.get('category')}")
        print(f"  samples: {len(data.get('samples', []))} samples")
        
    except Exception as e:
        log_test("F. POST /admin/wa/dry-run - Exception", False, str(e))

def test_g_otp_scenarios():
    """
    TEST G: OTP on preview
    1. POST /auth/send-login-otp {mobile:'9692604577'} → expect {ok:true} (SEND ONLY ONCE)
    2. POST /auth/send-login-otp {mobile:'0000000000'} → expect 400 (invalid)
    3. POST /auth/send-login-otp {mobile:'9000000098'} → expect 404 (unregistered)
    """
    print("\n" + "="*80)
    print("TEST G: OTP Scenarios")
    print("="*80)
    
    # Scenario 1: Valid registered number (SEND ONLY ONCE)
    print("\n  Scenario 1: Valid registered number (9692604577) - SEND ONLY ONCE")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/send-login-otp",
            json={"mobile": ADMIN_MOBILE},
            timeout=10
        )
        
        log_test("G1. POST /auth/send-login-otp (valid registered) - Status 200", 
                response.status_code == 200, f"Got {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_test("G1. Response has ok:true", data.get("ok") == True, f"ok={data.get('ok')}")
            print(f"  Response: {json.dumps(data, indent=2)}")
        else:
            print(f"  Response: {response.text[:200]}")
        
    except Exception as e:
        log_test("G1. POST /auth/send-login-otp (valid) - Exception", False, str(e))
    
    # Scenario 2: Invalid number
    print("\n  Scenario 2: Invalid number (0000000000)")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/send-login-otp",
            json={"mobile": "0000000000"},
            timeout=10
        )
        
        log_test("G2. POST /auth/send-login-otp (invalid) - Status 400", 
                response.status_code == 400, f"Got {response.status_code}")
        
        if response.status_code == 400:
            data = response.json()
            print(f"  Error: {data.get('error')}")
        
    except Exception as e:
        log_test("G2. POST /auth/send-login-otp (invalid) - Exception", False, str(e))
    
    # Scenario 3: Unregistered but valid 10-digit number
    print("\n  Scenario 3: Unregistered valid number (9000000098)")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/send-login-otp",
            json={"mobile": "9000000098"},
            timeout=10
        )
        
        log_test("G3. POST /auth/send-login-otp (unregistered) - Status 404", 
                response.status_code == 404, f"Got {response.status_code}")
        
        if response.status_code == 404:
            data = response.json()
            print(f"  Error: {data.get('error')}")
        
    except Exception as e:
        log_test("G3. POST /auth/send-login-otp (unregistered) - Exception", False, str(e))

def test_h_auth_gating():
    """
    TEST H: Auth gating
    Hit GET /admin/whatsapp-drip/config, /admin/wa/known-templates, /admin/wa/settings
    WITHOUT token → expect 401/403 each
    """
    print("\n" + "="*80)
    print("TEST H: Auth Gating (no token)")
    print("="*80)
    
    endpoints = [
        "/admin/whatsapp-drip/config",
        "/admin/wa/known-templates",
        "/admin/wa/settings"
    ]
    
    for endpoint in endpoints:
        try:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                timeout=10
            )
            
            is_unauthorized = response.status_code in [401, 403]
            log_test(f"H. GET {endpoint} (no token) - 401/403", 
                    is_unauthorized, f"Got {response.status_code}")
            
        except Exception as e:
            log_test(f"H. GET {endpoint} (no token) - Exception", False, str(e))

def test_i_notifications():
    """
    TEST I: In-app notifications (Ultramsg replacement)
    Login as test user (9999900001 / <redacted>) and GET /me/notifications
    Verify: 200 with {items, unreadCount}
    """
    print("\n" + "="*80)
    print("TEST I: In-app Notifications")
    print("="*80)
    
    # Login as test user
    token = login_test_user()
    if not token:
        log_test("I. Test user login failed", False, "Could not login as test user")
        return
    
    try:
        response = requests.get(
            f"{BASE_URL}/me/notifications",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("I. GET /me/notifications - Status 200", False, f"Got {response.status_code}")
            return
        
        log_test("I. GET /me/notifications - Status 200", True)
        
        data = response.json()
        
        has_items = "items" in data
        has_unreadCount = "unreadCount" in data
        
        log_test("I. Response has 'items' field", has_items, f"items count={len(data.get('items', []))}")
        log_test("I. Response has 'unreadCount' field", has_unreadCount, f"unreadCount={data.get('unreadCount')}")
        
        print(f"\n📊 Notifications Summary:")
        print(f"  items: {len(data.get('items', []))} notifications")
        print(f"  unreadCount: {data.get('unreadCount')}")
        
    except Exception as e:
        log_test("I. GET /me/notifications - Exception", False, str(e))

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = test_results["passed"] + test_results["failed"]
    pass_rate = (test_results["passed"] / total * 100) if total > 0 else 0
    
    print(f"\n✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"📊 Total: {total}")
    print(f"📈 Pass Rate: {pass_rate:.1f}%")
    
    if test_results["failed"] > 0:
        print("\n❌ Failed Tests:")
        for detail in test_results["details"]:
            if not detail["passed"]:
                print(f"  • {detail['test']}")
                if detail["details"]:
                    print(f"    {detail['details']}")
    
    print("\n" + "="*80)
    
    # Return exit code
    return 0 if test_results["failed"] == 0 else 1

def main():
    """Main test runner"""
    print("="*80)
    print("WhatsApp Drip Remap + Ultramsg-OFF Backend Tests")
    print("PREVIEW ONLY - Test Accounts - Cleanup After")
    print("="*80)
    
    # Login as admin
    if not login_admin():
        print("❌ Failed to login as admin. Exiting.")
        sys.exit(1)
    
    # Run all tests
    test_a_drip_config()
    test_b_drip_run_disabled()
    test_c_expired_logs()
    test_d_known_templates()
    test_e_test_send_unapproved()
    test_f_dry_run()
    test_g_otp_scenarios()
    test_h_auth_gating()
    test_i_notifications()
    
    # Print summary
    exit_code = print_summary()
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
