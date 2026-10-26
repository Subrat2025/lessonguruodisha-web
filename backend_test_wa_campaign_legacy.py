#!/usr/bin/env python3
"""
Backend test for WhatsApp Campaign Report endpoint with OLD-format campaign.
Tests backward compatibility with legacy campaign records.
"""

import requests
import json
import sys

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
CAMPAIGN_ID = "qa-oldfmt-renwaal"

# Global headers (will be updated with token after login)
headers = {
    "Content-Type": "application/json"
}

def login_admin():
    """Login as admin and get Bearer token"""
    print("\n" + "="*80)
    print("LOGIN: Authenticating as admin")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/auth/login"
        payload = {
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }
        
        print(f"POST {url}")
        print(f"Mobile: {ADMIN_MOBILE}")
        
        response = requests.post(url, json=payload, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ LOGIN FAILED: {response.status_code}")
            print(f"Response: {response.text}")
            return None
        
        data = response.json()
        token = data.get("token")
        
        if not token:
            print(f"❌ LOGIN FAILED: No token in response")
            return None
        
        print(f"✅ Login successful")
        print(f"Token: {token[:50]}...")
        
        return token
        
    except Exception as e:
        print(f"❌ LOGIN FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def test_step_1_report_endpoint():
    """
    STEP 1: GET /api/admin/wa/campaigns/qa-oldfmt-renwaal/report
    ASSERT: HTTP 200 (NOT 500)
    ASSERT: JSON contains keys: campaign, total, accepted, delivered, failed, deliveries (ARRAY), failReasons (ARRAY)
    """
    print("\n" + "="*80)
    print("STEP 1: Testing report endpoint with OLD-format campaign")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/admin/wa/campaigns/{CAMPAIGN_ID}/report"
        print(f"GET {url}")
        
        response = requests.get(url, headers=headers, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print("✅ Status 200 (NOT 500)")
        
        data = response.json()
        
        # Check required keys
        required_keys = ["campaign", "total", "accepted", "delivered", "failed", "deliveries", "failReasons"]
        missing_keys = [key for key in required_keys if key not in data]
        
        if missing_keys:
            print(f"❌ FAILED: Missing keys: {missing_keys}")
            print(f"Response keys: {list(data.keys())}")
            return False
        
        print("✅ All required keys present: campaign, total, accepted, delivered, failed, deliveries, failReasons")
        
        # Verify types
        if not isinstance(data.get("deliveries"), list):
            print(f"❌ FAILED: deliveries is not an array, got type: {type(data.get('deliveries'))}")
            return False
        
        print(f"✅ deliveries is an ARRAY (type: {type(data['deliveries']).__name__})")
        
        if not isinstance(data.get("failReasons"), list):
            print(f"❌ FAILED: failReasons is not an array, got type: {type(data.get('failReasons'))}")
            return False
        
        print(f"✅ failReasons is an ARRAY (type: {type(data['failReasons']).__name__})")
        
        # Report actual values
        print("\n📊 OBSERVED VALUES:")
        print(f"  - total: {data.get('total')} (type: {type(data.get('total')).__name__})")
        print(f"  - accepted: {data.get('accepted')} (type: {type(data.get('accepted')).__name__})")
        print(f"  - delivered: {data.get('delivered')} (type: {type(data.get('delivered')).__name__})")
        print(f"  - failed: {data.get('failed')} (type: {type(data.get('failed')).__name__})")
        print(f"  - deliveries: {len(data.get('deliveries', []))} items (type: {type(data.get('deliveries')).__name__})")
        print(f"  - failReasons: {len(data.get('failReasons', []))} items (type: {type(data.get('failReasons')).__name__})")
        
        if data.get("campaign"):
            print(f"\n📋 CAMPAIGN OBJECT:")
            campaign = data["campaign"]
            print(f"  - id: {campaign.get('id')}")
            print(f"  - status: {campaign.get('status')}")
            if "counts" in campaign:
                print(f"  - counts: {campaign['counts']}")
        
        print("\n✅ STEP 1 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ STEP 1 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_step_2_mark_failed():
    """
    STEP 2: POST /api/admin/wa/campaigns/qa-oldfmt-renwaal/mark-failed
    Body: {"reason":"Insufficient wallet balance","failedCount":3373,"code":"INSUFFICIENT_BALANCE"}
    ASSERT: 200 ok:true
    Then GET report again → ASSERT campaign.status=="failed", counts.failed==3373, counts.accepted==0, counts.delivered==0, failReason=="Insufficient wallet balance"
    """
    print("\n" + "="*80)
    print("STEP 2: Testing mark-failed endpoint")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/admin/wa/campaigns/{CAMPAIGN_ID}/mark-failed"
        print(f"POST {url}")
        
        payload = {
            "reason": "Insufficient wallet balance",
            "failedCount": 3373,
            "code": "INSUFFICIENT_BALANCE"
        }
        print(f"Body: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print("✅ Status 200")
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if not data.get("ok"):
            print(f"❌ FAILED: Expected ok:true, got ok:{data.get('ok')}")
            return False
        
        print("✅ Response ok:true")
        
        # Now GET the report again to verify the changes
        print("\n📊 Verifying changes via GET report...")
        report_url = f"{BASE_URL}/admin/wa/campaigns/{CAMPAIGN_ID}/report"
        report_response = requests.get(report_url, headers=headers, timeout=30)
        
        if report_response.status_code != 200:
            print(f"❌ FAILED: Report GET returned {report_response.status_code}")
            return False
        
        report_data = report_response.json()
        campaign = report_data.get("campaign", {})
        
        print("\n📋 CAMPAIGN AFTER MARK-FAILED:")
        print(f"  - status: {campaign.get('status')}")
        print(f"  - failReason: {campaign.get('failReason')}")
        if "counts" in campaign:
            counts = campaign["counts"]
            print(f"  - counts.failed: {counts.get('failed')}")
            print(f"  - counts.accepted: {counts.get('accepted')}")
            print(f"  - counts.delivered: {counts.get('delivered')}")
        
        # Verify assertions
        errors = []
        
        if campaign.get("status") != "failed":
            errors.append(f"campaign.status is '{campaign.get('status')}', expected 'failed'")
        else:
            print("✅ campaign.status == 'failed'")
        
        if campaign.get("failReason") != "Insufficient wallet balance":
            errors.append(f"campaign.failReason is '{campaign.get('failReason')}', expected 'Insufficient wallet balance'")
        else:
            print("✅ campaign.failReason == 'Insufficient wallet balance'")
        
        counts = campaign.get("counts", {})
        
        if counts.get("failed") != 3373:
            errors.append(f"counts.failed is {counts.get('failed')}, expected 3373")
        else:
            print("✅ counts.failed == 3373")
        
        if counts.get("accepted") != 0:
            errors.append(f"counts.accepted is {counts.get('accepted')}, expected 0")
        else:
            print("✅ counts.accepted == 0")
        
        if counts.get("delivered") != 0:
            errors.append(f"counts.delivered is {counts.get('delivered')}, expected 0")
        else:
            print("✅ counts.delivered == 0")
        
        if errors:
            print(f"\n❌ STEP 2 FAILED:")
            for error in errors:
                print(f"  - {error}")
            return False
        
        print("\n✅ STEP 2 PASSED")
        return True
        
    except Exception as e:
        print(f"❌ STEP 2 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_step_3_cleanup():
    """
    STEP 3: DELETE /api/admin/wa/campaigns/qa-oldfmt-renwaal
    ASSERT: 200
    """
    print("\n" + "="*80)
    print("STEP 3: Cleanup - Delete campaign")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/admin/wa/campaigns/{CAMPAIGN_ID}"
        print(f"DELETE {url}")
        
        response = requests.delete(url, headers=headers, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print("✅ Status 200")
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        print("\n✅ STEP 3 PASSED - Campaign deleted")
        return True
        
    except Exception as e:
        print(f"❌ STEP 3 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("="*80)
    print("WhatsApp Campaign Report - OLD-format Campaign Backward Compatibility Test")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Campaign ID: {CAMPAIGN_ID}")
    
    # Login first
    token = login_admin()
    if not token:
        print("\n❌ Cannot proceed without authentication")
        sys.exit(1)
    
    # Update global headers with token
    headers["Authorization"] = f"Bearer {token}"
    
    results = {
        "step_1": False,
        "step_2": False,
        "step_3": False
    }
    
    # Run tests in sequence
    results["step_1"] = test_step_1_report_endpoint()
    
    if results["step_1"]:
        results["step_2"] = test_step_2_mark_failed()
    else:
        print("\n⚠️ Skipping STEP 2 (mark-failed) because STEP 1 failed")
    
    if results["step_1"] and results["step_2"]:
        results["step_3"] = test_step_3_cleanup()
    else:
        print("\n⚠️ Skipping STEP 3 (cleanup) because previous steps failed")
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for step, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{step.upper()}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} TEST(S) FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
