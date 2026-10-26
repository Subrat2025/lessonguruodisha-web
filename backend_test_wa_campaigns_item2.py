#!/usr/bin/env python3
"""
WhatsApp Campaigns Item 2 Backend Testing
Tests dry-run guards, campaign create guards, send guards, and auth gating.

CRITICAL GUARDRAILS:
- Do NOT complete a real campaign send to real users
- Only pass dryRunConfirmed:true to /send against a filter that yields ZERO recipients
- Clean up every test campaign and wa_deliveries rows
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test results
test_results = []
cleanup_items = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"  Details: {details}")
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })

def admin_login():
    """Login as admin and return token"""
    print("\n=== ADMIN LOGIN ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Admin login successful")
                return token
            else:
                print(f"❌ No token in response")
                return None
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return None

def test_dry_run(token):
    """Test 1: POST /admin/wa/dry-run with template:'upgrade_premium', audience:'all'"""
    print("\n=== TEST 1: DRY-RUN (upgrade_premium, audience:all) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/dry-run",
            headers={"Authorization": f"Bearer {token}"},
            json={"template": "upgrade_premium", "audience": "all"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check required fields
            required_fields = ["count", "estCost", "costPerMsg", "currency", "samples", "approved", "withinWindow", "category"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                log_test("Test 1: Dry-run response fields", False, f"Missing fields: {missing_fields}")
                return None
            
            # Check samples structure
            samples = data.get("samples", [])
            if len(samples) > 3:
                log_test("Test 1: Samples count", False, f"Expected ≤3 samples, got {len(samples)}")
            else:
                log_test("Test 1: Samples count", True, f"Got {len(samples)} samples (≤3)")
            
            # Check masked mobile format
            if samples:
                sample = samples[0]
                mobile = sample.get("mobile", "")
                if mobile.startswith("XXXXXX") and len(mobile) == 10:
                    log_test("Test 1: Masked mobile format", True, f"Format: {mobile}")
                else:
                    log_test("Test 1: Masked mobile format", False, f"Expected XXXXXX+last4, got: {mobile}")
            
            # Report observed values
            print(f"\n📊 OBSERVED VALUES:")
            print(f"  - count: {data.get('count')}")
            print(f"  - estCost: {data.get('estCost')}")
            print(f"  - costPerMsg: {data.get('costPerMsg')}")
            print(f"  - currency: {data.get('currency')}")
            print(f"  - approved: {data.get('approved')}")
            print(f"  - withinWindow: {data.get('withinWindow')}")
            print(f"  - category: {data.get('category')}")
            
            log_test("Test 1: Dry-run endpoint", True, f"Status 200, all fields present")
            return data
        else:
            log_test("Test 1: Dry-run endpoint", False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Test 1: Dry-run endpoint", False, f"Exception: {str(e)}")
        return None

def test_dry_run_arbitrary_filter(token):
    """Test 1b: POST /admin/wa/dry-run with arbitrary filter (audience:'expired')"""
    print("\n=== TEST 1b: DRY-RUN (arbitrary filter: audience:expired) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/dry-run",
            headers={"Authorization": f"Bearer {token}"},
            json={"template": "upgrade_premium", "filter": {"audience": "expired"}},
            timeout=30
        )
        
        if response.status_code == 200:
            log_test("Test 1b: Dry-run arbitrary filter", True, "Status 200 (arbitrary filter accepted)")
            return True
        else:
            log_test("Test 1b: Dry-run arbitrary filter", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Test 1b: Dry-run arbitrary filter", False, f"Exception: {str(e)}")
        return False

def test_create_without_dry_run(token):
    """Test 2: Create campaign without dryRunConfirmed → expect 428"""
    print("\n=== TEST 2: CREATE WITHOUT DRY-RUN (expect 428) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "T1_test",
                "templateId": "upgrade_premium",
                "filter": {"audience": "all"},
                "status": "active"
            },
            timeout=30
        )
        
        if response.status_code == 428:
            data = response.json()
            code = data.get("code")
            if code == "dry_run_required":
                log_test("Test 2: Create without dry-run guard", True, "Status 428, code: dry_run_required")
                return True
            else:
                log_test("Test 2: Create without dry-run guard", False, f"Status 428 but code: {code}")
                return False
        else:
            log_test("Test 2: Create without dry-run guard", False, f"Expected 428, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Test 2: Create without dry-run guard", False, f"Exception: {str(e)}")
        return False

def test_create_with_dry_run(token, dry_run_data):
    """Test 2a: Create campaign with dryRunConfirmed:true → expect 200 with createdBy"""
    print("\n=== TEST 2a: CREATE WITH DRY-RUN (expect 200) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "T1_test",
                "templateId": "upgrade_premium",
                "filter": {"audience": "all"},
                "status": "active",
                "dryRunConfirmed": True,
                "dryRunCount": dry_run_data.get("count", 0) if dry_run_data else 5
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            campaign = data.get("campaign", {})
            campaign_id = campaign.get("id")
            created_by = campaign.get("createdBy")
            created_by_name = campaign.get("createdByName")
            
            if campaign_id:
                cleanup_items.append({"type": "campaign", "id": campaign_id})
            
            # Check createdBy and createdByName
            if created_by and created_by_name:
                print(f"\n📊 OBSERVED VALUES:")
                print(f"  - createdBy: {created_by}")
                print(f"  - createdByName: {created_by_name}")
                log_test("Test 2a: Create with dry-run", True, f"Status 200, createdBy: {created_by}, createdByName: {created_by_name}")
                return campaign_id
            else:
                log_test("Test 2a: Create with dry-run", False, f"Missing createdBy or createdByName")
                return None
        else:
            log_test("Test 2a: Create with dry-run", False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Test 2a: Create with dry-run", False, f"Exception: {str(e)}")
        return None

def test_create_unapproved_template(token):
    """Test 2b: Create with non-approved template → expect 400"""
    print("\n=== TEST 2b: CREATE WITH UNAPPROVED TEMPLATE (expect 400) ===")
    try:
        future_date = (datetime.now() + timedelta(days=2)).isoformat()
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "T2_test",
                "templateId": "NOT_A_REAL_TEMPLATE_XYZ",
                "scheduledFor": future_date,
                "dryRunConfirmed": True
            },
            timeout=30
        )
        
        if response.status_code == 400:
            data = response.json()
            code = data.get("code")
            if code == "template_not_approved":
                log_test("Test 2b: Unapproved template guard", True, "Status 400, code: template_not_approved")
                return True
            else:
                log_test("Test 2b: Unapproved template guard", False, f"Status 400 but code: {code}")
                return False
        else:
            log_test("Test 2b: Unapproved template guard", False, f"Expected 400, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Test 2b: Unapproved template guard", False, f"Exception: {str(e)}")
        return False

def test_create_draft(token):
    """Test 2c: Create draft (no schedule, no active) → expect 200 (no dry-run needed)"""
    print("\n=== TEST 2c: CREATE DRAFT (expect 200, no dry-run needed) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "T3_test",
                "templateId": "upgrade_premium",
                "status": "draft"
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            campaign = data.get("campaign", {})
            campaign_id = campaign.get("id")
            
            if campaign_id:
                cleanup_items.append({"type": "campaign", "id": campaign_id})
            
            log_test("Test 2c: Create draft", True, "Status 200 (draft allowed without dry-run)")
            return campaign_id
        else:
            log_test("Test 2c: Create draft", False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Test 2c: Create draft", False, f"Exception: {str(e)}")
        return None

def test_send_without_dry_run(token, campaign_id):
    """Test 3: Send without dryRunConfirmed → expect 428"""
    print("\n=== TEST 3: SEND WITHOUT DRY-RUN (expect 428) ===")
    if not campaign_id:
        log_test("Test 3: Send without dry-run guard", False, "No campaign ID available")
        return False
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/send",
            headers={"Authorization": f"Bearer {token}"},
            json={},
            timeout=30
        )
        
        if response.status_code == 428:
            data = response.json()
            code = data.get("code")
            if code == "dry_run_required":
                log_test("Test 3: Send without dry-run guard", True, "Status 428, code: dry_run_required")
                return True
            else:
                log_test("Test 3: Send without dry-run guard", False, f"Status 428 but code: {code}")
                return False
        else:
            log_test("Test 3: Send without dry-run guard", False, f"Expected 428, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Test 3: Send without dry-run guard", False, f"Exception: {str(e)}")
        return False

def test_auth_gating(token):
    """Test 4: Auth gating - all endpoints without token → 401/403"""
    print("\n=== TEST 4: AUTH GATING (expect 401/403) ===")
    
    endpoints = [
        ("POST", "/admin/wa/dry-run", {"template": "upgrade_premium", "audience": "all"}),
        ("POST", "/admin/wa/campaigns", {"name": "Test", "templateId": "upgrade_premium"})
    ]
    
    all_passed = True
    for method, path, body in endpoints:
        try:
            if method == "POST":
                response = requests.post(f"{BASE_URL}{path}", json=body, timeout=30)
            else:
                response = requests.get(f"{BASE_URL}{path}", timeout=30)
            
            if response.status_code in [401, 403]:
                log_test(f"Test 4: Auth gating {method} {path}", True, f"Status {response.status_code}")
            else:
                log_test(f"Test 4: Auth gating {method} {path}", False, f"Expected 401/403, got {response.status_code}")
                all_passed = False
        except Exception as e:
            log_test(f"Test 4: Auth gating {method} {path}", False, f"Exception: {str(e)}")
            all_passed = False
    
    return all_passed

def cleanup(token):
    """Cleanup all test campaigns and wa_deliveries"""
    print("\n=== CLEANUP ===")
    
    for item in cleanup_items:
        if item["type"] == "campaign":
            try:
                response = requests.delete(
                    f"{BASE_URL}/admin/wa/campaigns/{item['id']}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=30
                )
                if response.status_code == 200:
                    print(f"✅ Deleted campaign: {item['id']}")
                else:
                    print(f"⚠️ Failed to delete campaign {item['id']}: {response.status_code}")
            except Exception as e:
                print(f"⚠️ Error deleting campaign {item['id']}: {str(e)}")
    
    # Note: wa_deliveries cleanup would require direct DB access or a dedicated endpoint
    # For now, we're only creating test campaigns with status='active' or 'draft'
    # which should not create wa_deliveries entries unless actually sent
    
    print(f"✅ Cleanup complete: {len(cleanup_items)} items processed")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {(passed/total*100):.1f}%\n")
    
    # Print PASS/FAIL table
    print("DETAILED RESULTS:")
    print("-" * 80)
    for r in test_results:
        status = "✅ PASS" if r["passed"] else "❌ FAIL"
        print(f"{status}: {r['test']}")
        if r["details"]:
            print(f"         {r['details']}")
    print("-" * 80)
    
    return passed == total

def main():
    """Main test execution"""
    print("="*80)
    print("WhatsApp Campaigns Item 2 Backend Testing")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print("="*80)
    
    # Login
    token = admin_login()
    if not token:
        print("\n❌ FATAL: Admin login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    # Test 1: Dry-run
    dry_run_data = test_dry_run(token)
    
    # Test 1b: Dry-run with arbitrary filter
    test_dry_run_arbitrary_filter(token)
    
    # Test 2: Create without dry-run (expect 428)
    test_create_without_dry_run(token)
    
    # Test 2a: Create with dry-run (expect 200)
    t1_campaign_id = test_create_with_dry_run(token, dry_run_data)
    
    # Test 2b: Create with unapproved template (expect 400)
    test_create_unapproved_template(token)
    
    # Test 2c: Create draft (expect 200, no dry-run needed)
    t3_campaign_id = test_create_draft(token)
    
    # Test 3: Send without dry-run (expect 428)
    test_send_without_dry_run(token, t3_campaign_id)
    
    # Test 4: Auth gating
    test_auth_gating(token)
    
    # Cleanup
    cleanup(token)
    
    # Print summary
    all_passed = print_summary()
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
