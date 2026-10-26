#!/usr/bin/env python3
"""
Backend test for Part B: WhatsApp consent + support number + auth min-6 endpoints
Tests on PREVIEW environment: https://odisha-learning-pro.preview.emergentagent.com
"""

import requests
import json
import time
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

# Test results tracking
test_results = []
backfill_counts = {}

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if details:
        result += f" - {details}"
    print(result)
    test_results.append({"name": test_name, "passed": passed, "details": details})
    return passed

def test_support_whatsapp_number():
    """Test 1: Support WhatsApp number endpoints"""
    print("\n" + "="*80)
    print("TEST 1: Support WhatsApp Number (GET/PUT /api/admin/support-whatsapp)")
    print("="*80)
    
    try:
        # 1a. GET without token → 401
        print("\n1a. GET /api/admin/support-whatsapp with NO token → expect 401")
        r = requests.get(f"{BASE_URL}/admin/support-whatsapp")
        log_test("1a. GET support-whatsapp without token", r.status_code == 401, f"status={r.status_code}")
        
        # Login as admin to get token
        print("\n[Setup] Logging in as admin...")
        login_r = requests.post(f"{BASE_URL}/auth/login", json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
        if login_r.status_code != 200:
            print(f"❌ Admin login failed: {login_r.status_code} {login_r.text}")
            return False
        admin_token = login_r.json()["token"]
        print(f"✅ Admin logged in successfully")
        
        # Register a normal user for non-admin tests
        print("\n[Setup] Registering a normal user...")
        test_mobile = f"99999{random.randint(10000, 99999)}"
        reg_r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": test_mobile,
            "password": "test123456"
        })
        if reg_r.status_code != 200:
            print(f"❌ User registration failed: {reg_r.status_code} {reg_r.text}")
            return False
        user_token = reg_r.json()["token"]
        print(f"✅ Normal user registered: {test_mobile}")
        
        # 1b. GET with non-admin token → 403
        print("\n1b. GET /api/admin/support-whatsapp with NON-admin token → expect 403")
        r = requests.get(f"{BASE_URL}/admin/support-whatsapp", headers={"Authorization": f"Bearer {user_token}"})
        log_test("1b. GET support-whatsapp with non-admin token", r.status_code == 403, f"status={r.status_code}")
        
        # 1c. GET with admin token → 200 with { number }
        print("\n1c. GET /api/admin/support-whatsapp with admin token → expect 200 with { number }")
        r = requests.get(f"{BASE_URL}/admin/support-whatsapp", headers={"Authorization": f"Bearer {admin_token}"})
        passed = r.status_code == 200 and "number" in r.json()
        current_number = r.json().get("number", "") if r.status_code == 200 else ""
        log_test("1c. GET support-whatsapp with admin token", passed, f"status={r.status_code}, number={current_number}")
        
        # 1d. PUT with invalid short number → 400
        print("\n1d. PUT /api/admin/support-whatsapp with invalid short number '123' → expect 400")
        r = requests.put(f"{BASE_URL}/admin/support-whatsapp", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"number": "123"})
        log_test("1d. PUT support-whatsapp with invalid number", r.status_code == 400, f"status={r.status_code}")
        
        # 1e. PUT with valid number → 200
        print("\n1e. PUT /api/admin/support-whatsapp with valid number '918093414633' → expect 200")
        r = requests.put(f"{BASE_URL}/admin/support-whatsapp", 
                        headers={"Authorization": f"Bearer {admin_token}"},
                        json={"number": "918093414633"})
        passed = r.status_code == 200 and r.json().get("ok") == True and r.json().get("number") == "918093414633"
        log_test("1e. PUT support-whatsapp with valid number", passed, f"status={r.status_code}, response={r.json()}")
        
        # 1f. GET /api/settings/public → must include supportWhatsapp
        print("\n1f. GET /api/settings/public (no auth) → expect 200 with supportWhatsapp field")
        r = requests.get(f"{BASE_URL}/settings/public")
        passed = r.status_code == 200 and "supportWhatsapp" in r.json()
        support_wa = r.json().get("supportWhatsapp", "") if r.status_code == 200 else ""
        log_test("1f. GET settings/public includes supportWhatsapp", passed, f"status={r.status_code}, supportWhatsapp={support_wa}")
        
        return True
        
    except Exception as e:
        print(f"❌ Exception in test_support_whatsapp_number: {str(e)}")
        return False

def test_register_waoptin_min6():
    """Test 2: Register with waOptIn + min-6 password"""
    print("\n" + "="*80)
    print("TEST 2: Register with waOptIn + min-6 password")
    print("="*80)
    
    try:
        # 2a. Register with password < 6 chars → 400
        print("\n2a. POST /api/auth/register with password 'ab123' (5 chars) → expect 400")
        test_mobile = f"99998{random.randint(10000, 99999)}"
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Short Pass",
            "mobile": test_mobile,
            "password": "ab123"
        })
        log_test("2a. Register with password < 6 chars", r.status_code == 400, f"status={r.status_code}, error={r.json().get('error', '')}")
        
        # 2b. Register with password >= 6 and waOptIn:true → 200
        print("\n2b. POST /api/auth/register with password 'abc123' (6 chars) and waOptIn:true → expect 200")
        test_mobile_optin = f"99997{random.randint(10000, 99999)}"
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test OptIn True",
            "mobile": test_mobile_optin,
            "password": "abc123",
            "waOptIn": True
        })
        passed = r.status_code == 200 and "token" in r.json() and "user" in r.json()
        token_optin = r.json().get("token", "") if r.status_code == 200 else ""
        log_test("2b. Register with waOptIn:true", passed, f"status={r.status_code}, mobile={test_mobile_optin}")
        
        # 2c. GET /api/me to confirm waOptIn === true
        if token_optin:
            print("\n2c. GET /api/me with optin-true user → confirm waOptIn === true")
            r = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token_optin}"})
            passed = r.status_code == 200 and r.json().get("user", {}).get("waOptIn") == True
            wa_optin_value = r.json().get("user", {}).get("waOptIn") if r.status_code == 200 else None
            log_test("2c. GET /api/me confirms waOptIn === true", passed, f"status={r.status_code}, waOptIn={wa_optin_value}")
        
        # 2d. Register with password >= 6 and waOptIn:false → 200
        print("\n2d. POST /api/auth/register with password 'abc123' and waOptIn:false → expect 200")
        test_mobile_optout = f"99996{random.randint(10000, 99999)}"
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test OptIn False",
            "mobile": test_mobile_optout,
            "password": "abc123",
            "waOptIn": False
        })
        passed = r.status_code == 200 and "token" in r.json() and "user" in r.json()
        token_optout = r.json().get("token", "") if r.status_code == 200 else ""
        log_test("2d. Register with waOptIn:false", passed, f"status={r.status_code}, mobile={test_mobile_optout}")
        
        # 2e. GET /api/me to confirm waOptIn === false
        if token_optout:
            print("\n2e. GET /api/me with optin-false user → confirm waOptIn === false")
            r = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token_optout}"})
            passed = r.status_code == 200 and r.json().get("user", {}).get("waOptIn") == False
            wa_optin_value = r.json().get("user", {}).get("waOptIn") if r.status_code == 200 else None
            log_test("2e. GET /api/me confirms waOptIn === false", passed, f"status={r.status_code}, waOptIn={wa_optin_value}")
        
        return True
        
    except Exception as e:
        print(f"❌ Exception in test_register_waoptin_min6: {str(e)}")
        return False

def test_change_password_min6():
    """Test 3: Change-password / forgot reset min-6"""
    print("\n" + "="*80)
    print("TEST 3: Change-password / forgot reset min-6")
    print("="*80)
    
    try:
        # Register a test user
        print("\n[Setup] Registering a test user for password change...")
        test_mobile = f"99995{random.randint(10000, 99999)}"
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Password Change",
            "mobile": test_mobile,
            "password": "abc123"
        })
        if r.status_code != 200:
            print(f"❌ User registration failed: {r.status_code} {r.text}")
            return False
        token = r.json()["token"]
        print(f"✅ Test user registered: {test_mobile}")
        
        # 3a. Change password with newPassword < 6 → 400
        print("\n3a. POST /api/auth/change-password with newPassword '12345' (5 chars) → expect 400")
        r = requests.post(f"{BASE_URL}/auth/change-password", 
                         headers={"Authorization": f"Bearer {token}"},
                         json={"oldPassword": "abc123", "newPassword": "12345"})
        log_test("3a. Change password with newPassword < 6 chars", r.status_code == 400, f"status={r.status_code}, error={r.json().get('error', '')}")
        
        # 3b. Change password with newPassword >= 6 → 200
        print("\n3b. POST /api/auth/change-password with newPassword '123456' (6 chars) → expect 200")
        r = requests.post(f"{BASE_URL}/auth/change-password", 
                         headers={"Authorization": f"Bearer {token}"},
                         json={"oldPassword": "abc123", "newPassword": "123456"})
        log_test("3b. Change password with newPassword >= 6 chars", r.status_code == 200, f"status={r.status_code}, response={r.json()}")
        
        # 3c. Confirm admin login still works (no new length check on login)
        print("\n3c. POST /api/auth/login with admin credentials → confirm login still works")
        r = requests.post(f"{BASE_URL}/auth/login", json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
        log_test("3c. Admin login still works", r.status_code == 200, f"status={r.status_code}")
        
        return True
        
    except Exception as e:
        print(f"❌ Exception in test_change_password_min6: {str(e)}")
        return False

def test_backfill_wa_consent():
    """Test 4: Backfill WhatsApp consent (dry-run + apply)"""
    print("\n" + "="*80)
    print("TEST 4: Backfill WhatsApp consent (dry-run + apply)")
    print("="*80)
    
    global backfill_counts
    
    try:
        # Login as admin
        print("\n[Setup] Logging in as admin...")
        login_r = requests.post(f"{BASE_URL}/auth/login", json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
        if login_r.status_code != 200:
            print(f"❌ Admin login failed: {login_r.status_code} {login_r.text}")
            return False
        admin_token = login_r.json()["token"]
        print(f"✅ Admin logged in successfully")
        
        # Register a normal user for non-admin test
        print("\n[Setup] Registering a normal user...")
        test_mobile = f"99994{random.randint(10000, 99999)}"
        reg_r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": test_mobile,
            "password": "test123456"
        })
        if reg_r.status_code != 200:
            print(f"❌ User registration failed: {reg_r.status_code} {reg_r.text}")
            return False
        user_token = reg_r.json()["token"]
        print(f"✅ Normal user registered: {test_mobile}")
        
        # 4a. GET without token → 401
        print("\n4a. GET /api/admin/wa-consent-backfill with NO token → expect 401")
        r = requests.get(f"{BASE_URL}/admin/wa-consent-backfill")
        log_test("4a. GET wa-consent-backfill without token", r.status_code == 401, f"status={r.status_code}")
        
        # 4b. GET with non-admin token → 403
        print("\n4b. GET /api/admin/wa-consent-backfill with NON-admin token → expect 403")
        r = requests.get(f"{BASE_URL}/admin/wa-consent-backfill", headers={"Authorization": f"Bearer {user_token}"})
        log_test("4b. GET wa-consent-backfill with non-admin token", r.status_code == 403, f"status={r.status_code}")
        
        # 4c. GET with admin token → 200 dry-run
        print("\n4c. GET /api/admin/wa-consent-backfill with admin token → expect 200 dry-run")
        r = requests.get(f"{BASE_URL}/admin/wa-consent-backfill", headers={"Authorization": f"Bearer {admin_token}"})
        passed = r.status_code == 200
        if passed:
            data = r.json()
            backfill_counts["before_candidates"] = data.get("candidates", 0)
            backfill_counts["before_willSetTrue"] = data.get("willSetTrue", 0)
            backfill_counts["before_willSetFalse"] = data.get("willSetFalse", 0)
            backfill_counts["before_alreadySet"] = data.get("alreadySet", 0)
            print(f"\n📊 DRY-RUN COUNTS (BEFORE POST):")
            print(f"   candidates: {backfill_counts['before_candidates']}")
            print(f"   willSetTrue: {backfill_counts['before_willSetTrue']}")
            print(f"   willSetFalse: {backfill_counts['before_willSetFalse']}")
            print(f"   alreadySet: {backfill_counts['before_alreadySet']}")
        log_test("4c. GET wa-consent-backfill dry-run", passed, f"status={r.status_code}")
        
        # 4d. POST to apply backfill → 200
        print("\n4d. POST /api/admin/wa-consent-backfill with admin token → expect 200")
        r = requests.post(f"{BASE_URL}/admin/wa-consent-backfill", 
                         headers={"Authorization": f"Bearer {admin_token}"},
                         json={})
        passed = r.status_code == 200
        if passed:
            data = r.json()
            backfill_counts["post_setTrue"] = data.get("setTrue", 0)
            backfill_counts["post_setFalse"] = data.get("setFalse", 0)
            print(f"\n📊 POST APPLY RESULTS:")
            print(f"   setTrue: {backfill_counts['post_setTrue']}")
            print(f"   setFalse: {backfill_counts['post_setFalse']}")
        log_test("4d. POST wa-consent-backfill apply", passed, f"status={r.status_code}")
        
        # 4e. GET again to confirm counts changed
        print("\n4e. GET /api/admin/wa-consent-backfill again → expect counts changed")
        r = requests.get(f"{BASE_URL}/admin/wa-consent-backfill", headers={"Authorization": f"Bearer {admin_token}"})
        passed = r.status_code == 200
        if passed:
            data = r.json()
            backfill_counts["after_candidates"] = data.get("candidates", 0)
            backfill_counts["after_willSetTrue"] = data.get("willSetTrue", 0)
            backfill_counts["after_willSetFalse"] = data.get("willSetFalse", 0)
            backfill_counts["after_alreadySet"] = data.get("alreadySet", 0)
            print(f"\n📊 DRY-RUN COUNTS (AFTER POST):")
            print(f"   candidates: {backfill_counts['after_candidates']}")
            print(f"   willSetTrue: {backfill_counts['after_willSetTrue']}")
            print(f"   willSetFalse: {backfill_counts['after_willSetFalse']}")
            print(f"   alreadySet: {backfill_counts['after_alreadySet']}")
            
            # Verify counts changed as expected
            candidates_dropped = backfill_counts["after_candidates"] < backfill_counts["before_candidates"]
            already_set_increased = backfill_counts["after_alreadySet"] > backfill_counts["before_alreadySet"]
            print(f"\n✅ Candidates dropped: {candidates_dropped} (before={backfill_counts['before_candidates']}, after={backfill_counts['after_candidates']})")
            print(f"✅ AlreadySet increased: {already_set_increased} (before={backfill_counts['before_alreadySet']}, after={backfill_counts['after_alreadySet']})")
        log_test("4e. GET wa-consent-backfill after POST", passed, f"status={r.status_code}")
        
        return True
        
    except Exception as e:
        print(f"❌ Exception in test_backfill_wa_consent: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BACKEND TEST: Part B - WhatsApp Consent + Support Number + Auth Min-6")
    print("PREVIEW Environment: https://odisha-learning-pro.preview.emergentagent.com")
    print("="*80)
    
    # Run all tests
    test_support_whatsapp_number()
    test_register_waoptin_min6()
    test_change_password_min6()
    test_backfill_wa_consent()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed_count = sum(1 for t in test_results if t["passed"])
    total_count = len(test_results)
    
    print(f"\nTotal tests: {total_count}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {total_count - passed_count}")
    print(f"Success rate: {(passed_count/total_count*100):.1f}%")
    
    print("\n📊 BACKFILL COUNTS SUMMARY:")
    if backfill_counts:
        print(f"\nBEFORE POST:")
        print(f"  candidates: {backfill_counts.get('before_candidates', 'N/A')}")
        print(f"  willSetTrue: {backfill_counts.get('before_willSetTrue', 'N/A')}")
        print(f"  willSetFalse: {backfill_counts.get('before_willSetFalse', 'N/A')}")
        print(f"  alreadySet: {backfill_counts.get('before_alreadySet', 'N/A')}")
        print(f"\nPOST RESULT:")
        print(f"  setTrue: {backfill_counts.get('post_setTrue', 'N/A')}")
        print(f"  setFalse: {backfill_counts.get('post_setFalse', 'N/A')}")
        print(f"\nAFTER POST:")
        print(f"  candidates: {backfill_counts.get('after_candidates', 'N/A')}")
        print(f"  willSetTrue: {backfill_counts.get('after_willSetTrue', 'N/A')}")
        print(f"  willSetFalse: {backfill_counts.get('after_willSetFalse', 'N/A')}")
        print(f"  alreadySet: {backfill_counts.get('after_alreadySet', 'N/A')}")
    
    print("\n" + "="*80)
    print("DETAILED RESULTS:")
    print("="*80)
    for i, t in enumerate(test_results, 1):
        status = "✅ PASS" if t["passed"] else "❌ FAIL"
        print(f"{i}. {status}: {t['name']}")
        if t["details"]:
            print(f"   {t['details']}")
    
    print("\n" + "="*80)
    if passed_count == total_count:
        print("✅ ALL TESTS PASSED")
    else:
        print(f"⚠️  {total_count - passed_count} TEST(S) FAILED")
    print("="*80)

if __name__ == "__main__":
    main()
