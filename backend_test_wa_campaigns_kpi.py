#!/usr/bin/env python3
"""
Backend test for WhatsApp campaigns: KPI summary counts + dry-run exclusion breakdown + report safe for old/new format
Test date: 2026-01-01
Admin: 9692604577 / <redacted>
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login_admin():
    """Login as admin and return Bearer token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        print(f"✅ Admin login: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            print(f"✅ Admin token received: {token[:20]}...")
            return token
        else:
            print(f"❌ Admin login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Admin login error: {e}")
        return None

def test_kpi_summary_counts(token):
    """
    TEST A: GET /api/admin/wa/campaigns
    Verify kpis now has acceptedMonth, deliveredMonth==acceptedMonth, failedMonth (>=6 from QA data),
    successRate = round(acceptedMonth/(acceptedMonth+failedMonth)*100) or 0.
    """
    print("\n" + "="*80)
    print("TEST A: KPI SUMMARY COUNTS FIX")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/admin/wa/campaigns", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        kpis = data.get("kpis", {})
        
        print(f"\n📊 KPIs Object:")
        print(json.dumps(kpis, indent=2))
        
        # Check required fields
        checks = []
        
        # 1. acceptedMonth present
        if "acceptedMonth" in kpis:
            print(f"✅ acceptedMonth present: {kpis['acceptedMonth']}")
            checks.append(True)
        else:
            print(f"❌ acceptedMonth missing")
            checks.append(False)
        
        # 2. deliveredMonth == acceptedMonth
        if "deliveredMonth" in kpis and kpis["deliveredMonth"] == kpis.get("acceptedMonth"):
            print(f"✅ deliveredMonth == acceptedMonth: {kpis['deliveredMonth']}")
            checks.append(True)
        else:
            print(f"❌ deliveredMonth != acceptedMonth: deliveredMonth={kpis.get('deliveredMonth')}, acceptedMonth={kpis.get('acceptedMonth')}")
            checks.append(False)
        
        # 3. failedMonth present and >= 6
        if "failedMonth" in kpis:
            failed = kpis["failedMonth"]
            if failed >= 6:
                print(f"✅ failedMonth >= 6: {failed}")
                checks.append(True)
            else:
                print(f"⚠️  failedMonth < 6: {failed} (expected >= 6 from QA data)")
                checks.append(False)
        else:
            print(f"❌ failedMonth missing")
            checks.append(False)
        
        # 4. successRate calculation
        if "successRate" in kpis:
            accepted = kpis.get("acceptedMonth", 0)
            failed = kpis.get("failedMonth", 0)
            expected_rate = round(accepted / (accepted + failed) * 100) if (accepted + failed) > 0 else 0
            actual_rate = kpis["successRate"]
            
            if actual_rate == expected_rate:
                print(f"✅ successRate correct: {actual_rate}% (accepted={accepted}, failed={failed})")
                checks.append(True)
            else:
                print(f"❌ successRate incorrect: expected {expected_rate}%, got {actual_rate}%")
                checks.append(False)
        else:
            print(f"❌ successRate missing")
            checks.append(False)
        
        # Summary
        passed = sum(checks)
        total = len(checks)
        print(f"\n📊 TEST A RESULT: {passed}/{total} checks passed")
        
        return all(checks)
        
    except Exception as e:
        print(f"❌ TEST A ERROR: {e}")
        return False

def test_dry_run_exclusion_breakdown(token):
    """
    TEST B: POST /api/admin/wa/dry-run
    Test both marketing and utility templates for exclusion breakdown
    """
    print("\n" + "="*80)
    print("TEST B: DRY-RUN EXCLUSION BREAKDOWN")
    print("="*80)
    
    all_passed = True
    
    # B1: Marketing template (expired_premium_renewal)
    print("\n--- B1: Marketing Template (expired_premium_renewal) ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/wa/dry-run", headers={
            "Authorization": f"Bearer {token}"
        }, json={
            "template": "expired_premium_renewal",
            "audience": "expired"
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            all_passed = False
        else:
            data = resp.json()
            
            # Check required fields
            checks = []
            
            # count field
            if "count" in data and isinstance(data["count"], (int, float)):
                print(f"✅ count present: {data['count']}")
                checks.append(True)
            else:
                print(f"❌ count missing or invalid")
                checks.append(False)
            
            # breakdown field
            if "breakdown" in data:
                breakdown = data["breakdown"]
                print(f"\n📊 Breakdown:")
                print(json.dumps(breakdown, indent=2))
                
                required_keys = ["matched", "optOut", "capPaused", "capDays", "invalidMobile", "final"]
                for key in required_keys:
                    if key in breakdown:
                        print(f"✅ breakdown.{key}: {breakdown[key]}")
                        checks.append(True)
                    else:
                        print(f"❌ breakdown.{key} missing")
                        checks.append(False)
                
                # Assert breakdown.final == count
                if breakdown.get("final") == data.get("count"):
                    print(f"✅ breakdown.final == count: {breakdown.get('final')}")
                    checks.append(True)
                else:
                    print(f"❌ breakdown.final != count: final={breakdown.get('final')}, count={data.get('count')}")
                    checks.append(False)
                
                # Assert breakdown.capDays == 7
                if breakdown.get("capDays") == 7:
                    print(f"✅ breakdown.capDays == 7")
                    checks.append(True)
                else:
                    print(f"❌ breakdown.capDays != 7: {breakdown.get('capDays')}")
                    checks.append(False)
            else:
                print(f"❌ breakdown missing")
                checks.append(False)
            
            # payloadSample field
            if "payloadSample" in data:
                payload = data["payloadSample"]
                print(f"\n📊 Payload Sample:")
                print(json.dumps(payload, indent=2))
                
                required_keys = ["template_id", "language", "category", "variables"]
                for key in required_keys:
                    if key in payload:
                        print(f"✅ payloadSample.{key}: {payload[key]}")
                        checks.append(True)
                    else:
                        print(f"❌ payloadSample.{key} missing")
                        checks.append(False)
            else:
                print(f"❌ payloadSample missing")
                checks.append(False)
            
            # wallet field
            if "wallet" in data:
                print(f"✅ wallet present")
                checks.append(True)
            else:
                print(f"❌ wallet missing")
                checks.append(False)
            
            # category == "marketing"
            if data.get("category") == "marketing":
                print(f"✅ category == 'marketing'")
                checks.append(True)
            else:
                print(f"❌ category != 'marketing': {data.get('category')}")
                checks.append(False)
            
            passed = sum(checks)
            total = len(checks)
            print(f"\n📊 B1 RESULT: {passed}/{total} checks passed")
            
            if not all(checks):
                all_passed = False
    
    except Exception as e:
        print(f"❌ B1 ERROR: {e}")
        all_passed = False
    
    # B2: Utility template (plan_expiring_soon)
    print("\n--- B2: Utility Template (plan_expiring_soon) ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/wa/dry-run", headers={
            "Authorization": f"Bearer {token}"
        }, json={
            "template": "plan_expiring_soon",
            "audience": "expired"
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            all_passed = False
        else:
            data = resp.json()
            
            checks = []
            
            # category == "utility"
            if data.get("category") == "utility":
                print(f"✅ category == 'utility'")
                checks.append(True)
            else:
                print(f"❌ category != 'utility': {data.get('category')}")
                checks.append(False)
            
            # capPaused == 0 (utility exempt)
            breakdown = data.get("breakdown", {})
            if breakdown.get("capPaused") == 0:
                print(f"✅ capPaused == 0 (utility exempt)")
                checks.append(True)
            else:
                print(f"❌ capPaused != 0: {breakdown.get('capPaused')} (utility should be exempt)")
                checks.append(False)
            
            # optOut == 0 (utility exempt)
            if breakdown.get("optOut") == 0:
                print(f"✅ optOut == 0 (utility exempt)")
                checks.append(True)
            else:
                print(f"❌ optOut != 0: {breakdown.get('optOut')} (utility should be exempt)")
                checks.append(False)
            
            print(f"\n📊 Breakdown:")
            print(json.dumps(breakdown, indent=2))
            
            passed = sum(checks)
            total = len(checks)
            print(f"\n📊 B2 RESULT: {passed}/{total} checks passed")
            
            if not all(checks):
                all_passed = False
    
    except Exception as e:
        print(f"❌ B2 ERROR: {e}")
        all_passed = False
    
    return all_passed

def test_report_safe_for_old_new_format(token):
    """
    TEST C: GET /api/admin/wa/campaigns/:id/report
    Test both old format (qa-oldfmt-renwaal) and new format (qa-newfmt-renew) campaigns
    """
    print("\n" + "="*80)
    print("TEST C: REPORT SAFE FOR OLD + NEW FORMAT")
    print("="*80)
    
    all_passed = True
    
    # C1: Old format campaign (qa-oldfmt-renwaal)
    print("\n--- C1: Old Format Campaign (qa-oldfmt-renwaal) ---")
    try:
        resp = requests.get(f"{BASE_URL}/admin/wa/campaigns/qa-oldfmt-renwaal/report", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 500:
            print(f"❌ Got 500 error (should be 200)")
            print(f"Response: {resp.text}")
            all_passed = False
        elif resp.status_code != 200:
            print(f"⚠️  Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            all_passed = False
        else:
            data = resp.json()
            
            checks = []
            
            # deliveries is ARRAY
            if "deliveries" in data and isinstance(data["deliveries"], list):
                print(f"✅ deliveries is array: length={len(data['deliveries'])}")
                checks.append(True)
            else:
                print(f"❌ deliveries is not array or missing")
                checks.append(False)
            
            # failReasons is ARRAY
            if "failReasons" in data and isinstance(data["failReasons"], list):
                print(f"✅ failReasons is array: length={len(data['failReasons'])}")
                checks.append(True)
            else:
                print(f"❌ failReasons is not array or missing")
                checks.append(False)
            
            # Report values
            print(f"\n📊 Report Values:")
            print(f"  total: {data.get('total')}")
            print(f"  accepted: {data.get('accepted')}")
            print(f"  delivered: {data.get('delivered')}")
            print(f"  failed: {data.get('failed')}")
            
            passed = sum(checks)
            total = len(checks)
            print(f"\n📊 C1 RESULT: {passed}/{total} checks passed")
            
            if not all(checks):
                all_passed = False
    
    except Exception as e:
        print(f"❌ C1 ERROR: {e}")
        all_passed = False
    
    # C2: New format campaign (qa-newfmt-renew)
    print("\n--- C2: New Format Campaign (qa-newfmt-renew) ---")
    try:
        resp = requests.get(f"{BASE_URL}/admin/wa/campaigns/qa-newfmt-renew/report", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 500:
            print(f"❌ Got 500 error (should be 200)")
            print(f"Response: {resp.text}")
            all_passed = False
        elif resp.status_code != 200:
            print(f"⚠️  Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            all_passed = False
        else:
            data = resp.json()
            
            checks = []
            
            # failed >= 6
            if data.get("failed", 0) >= 6:
                print(f"✅ failed >= 6: {data.get('failed')}")
                checks.append(True)
            else:
                print(f"❌ failed < 6: {data.get('failed')}")
                checks.append(False)
            
            # deliveries array length >= 6
            deliveries = data.get("deliveries", [])
            if isinstance(deliveries, list) and len(deliveries) >= 6:
                print(f"✅ deliveries length >= 6: {len(deliveries)}")
                checks.append(True)
            else:
                print(f"❌ deliveries length < 6: {len(deliveries) if isinstance(deliveries, list) else 'not array'}")
                checks.append(False)
            
            # Check for "Insufficient wallet balance" in failReasons or deliveries
            fail_reasons = data.get("failReasons", [])
            found_wallet_error = False
            
            # Check in failReasons aggregation
            for reason in fail_reasons:
                reason_text = reason.get("_id", {}).get("reason", "")
                if "Insufficient wallet balance" in reason_text or "wallet" in reason_text.lower():
                    found_wallet_error = True
                    print(f"✅ Found 'Insufficient wallet balance' in failReasons: {reason_text}")
                    break
            
            # Also check in deliveries array
            if not found_wallet_error:
                for delivery in deliveries[:10]:  # Check first 10
                    error = delivery.get("error", "")
                    if "Insufficient wallet balance" in error or "wallet" in error.lower():
                        found_wallet_error = True
                        print(f"✅ Found 'Insufficient wallet balance' in deliveries: {error}")
                        break
            
            if found_wallet_error:
                checks.append(True)
            else:
                print(f"⚠️  'Insufficient wallet balance' not found in failReasons or deliveries")
                print(f"   failReasons: {fail_reasons}")
                checks.append(False)
            
            # Report values
            print(f"\n📊 Report Values:")
            print(f"  total: {data.get('total')}")
            print(f"  accepted: {data.get('accepted')}")
            print(f"  delivered: {data.get('delivered')}")
            print(f"  failed: {data.get('failed')}")
            print(f"  deliveries length: {len(deliveries)}")
            print(f"  failReasons count: {len(fail_reasons)}")
            
            passed = sum(checks)
            total = len(checks)
            print(f"\n📊 C2 RESULT: {passed}/{total} checks passed")
            
            if not all(checks):
                all_passed = False
    
    except Exception as e:
        print(f"❌ C2 ERROR: {e}")
        all_passed = False
    
    return all_passed

def main():
    print("="*80)
    print("WhatsApp Campaigns: KPI Summary Counts + Dry-Run Exclusion + Report Test")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    print(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FAILED: Could not login as admin")
        return
    
    # Run tests
    results = []
    
    # Test A: KPI Summary Counts
    results.append(("TEST A: KPI Summary Counts", test_kpi_summary_counts(token)))
    
    # Test B: Dry-Run Exclusion Breakdown
    results.append(("TEST B: Dry-Run Exclusion Breakdown", test_dry_run_exclusion_breakdown(token)))
    
    # Test C: Report Safe for Old + New Format
    results.append(("TEST C: Report Safe for Old + New Format", test_report_safe_for_old_new_format(token)))
    
    # Final Summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(result[1] for result in results)
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)

if __name__ == "__main__":
    main()
