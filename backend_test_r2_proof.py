#!/usr/bin/env python3
"""
R2 Migration + Payment Proof Backend Tests (PREVIEW ONLY)
==========================================================
Tests:
1. R2-Assets Backfill excludes financial collections
2. Payment proof resolves privately from R2 for admin, blocked for logged-out

CRITICAL GUARDRAILS:
- DO NOT delete QA payments (qa-proof-legacy, qa-proof-new)
- DO NOT touch R2 flags
- Use admin account only: 9692604577 / <redacted>
"""

import requests
import json
import sys
import time
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Global token storage
admin_token = None

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
            timeout=30
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

def test_r2_backfill_excludes_financial():
    """
    TEST 1 — R2-Assets Backfill excludes financial collections
    """
    print("\n" + "="*80)
    print("TEST 1: R2-Assets Backfill excludes financial collections")
    print("="*80)
    
    if not admin_token:
        log_test("TEST 1 - Admin login required", False, "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 1: Start dry-run backfill job
    print("\n📤 Step 1: Starting dry-run backfill job...")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/r2mig/backfill",
            json={"mode": "dryrun"},
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("TEST 1.1 - Start backfill job", False, 
                    f"Expected 200, got {response.status_code}: {response.text[:200]}")
            return
        
        data = response.json()
        job_id = data.get("jobId")
        
        if not job_id:
            log_test("TEST 1.1 - Start backfill job", False, "No jobId in response")
            return
        
        log_test("TEST 1.1 - Start backfill job", True, f"jobId: {job_id}")
        print(f"  Job ID: {job_id}")
        
    except Exception as e:
        log_test("TEST 1.1 - Start backfill job", False, f"Exception: {str(e)}")
        return
    
    # Step 2: Poll job status until done (max 90 seconds)
    print("\n⏳ Step 2: Polling job status (max 90s)...")
    max_wait = 90
    poll_interval = 2
    elapsed = 0
    job_status = None
    
    try:
        while elapsed < max_wait:
            response = requests.get(
                f"{BASE_URL}/admin/r2mig/jobs/{job_id}",
                headers=headers,
                timeout=30
            )
            
            if response.status_code != 200:
                log_test("TEST 1.2 - Poll job status", False, 
                        f"Expected 200, got {response.status_code}")
                return
            
            data = response.json()
            job = data.get("job", {})
            job_status = job.get("status")
            
            print(f"  [{elapsed}s] Status: {job_status}")
            
            if job_status == "done":
                log_test("TEST 1.2 - Poll job status", True, f"Job completed in {elapsed}s")
                break
            
            time.sleep(poll_interval)
            elapsed += poll_interval
        
        if job_status != "done":
            log_test("TEST 1.2 - Poll job status", False, 
                    f"Job did not complete within {max_wait}s (status: {job_status})")
            return
        
    except Exception as e:
        log_test("TEST 1.2 - Poll job status", False, f"Exception: {str(e)}")
        return
    
    # Step 3: Get full job details
    print("\n📥 Step 3: Getting full job details...")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/r2mig/jobs/{job_id}/full",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("TEST 1.3 - Get full job", False, 
                    f"Expected 200, got {response.status_code}")
            return
        
        data = response.json()
        job = data.get("job", {})
        job_result = job.get("result", {})
        
        log_test("TEST 1.3 - Get full job", True, "Full job details retrieved")
        
    except Exception as e:
        log_test("TEST 1.3 - Get full job", False, f"Exception: {str(e)}")
        return
    
    # Step 4: Verify excludedCollections
    print("\n🔍 Step 4: Verifying excludedCollections...")
    excluded_collections = job_result.get("excludedCollections", [])
    expected_excluded = ["payments", "qrSubscriptionPayments", "storeOrders"]
    
    print(f"  Expected excluded: {expected_excluded}")
    print(f"  Actual excluded: {excluded_collections}")
    
    if set(excluded_collections) == set(expected_excluded):
        log_test("TEST 1.4 - excludedCollections", True, 
                f"Correct: {excluded_collections}")
    else:
        log_test("TEST 1.4 - excludedCollections", False, 
                f"Expected {expected_excluded}, got {excluded_collections}")
    
    # Step 5: Verify scanned does NOT contain financial collections
    print("\n🔍 Step 5: Verifying scanned collections...")
    scanned = job_result.get("scanned", [])
    
    print(f"  Scanned collections ({len(scanned)}): {scanned}")
    
    financial_in_scanned = [c for c in expected_excluded if c in scanned]
    
    if not financial_in_scanned:
        log_test("TEST 1.5 - scanned excludes financial", True, 
                f"No financial collections in scanned list")
    else:
        log_test("TEST 1.5 - scanned excludes financial", False, 
                f"Found financial collections in scanned: {financial_in_scanned}")
    
    # Step 6: Verify perCollection has NO financial entries
    print("\n🔍 Step 6: Verifying perCollection...")
    per_collection = job_result.get("perCollection", [])
    
    financial_in_per_collection = [
        entry for entry in per_collection 
        if entry.get("collection") in expected_excluded
    ]
    
    if not financial_in_per_collection:
        log_test("TEST 1.6 - perCollection excludes financial", True, 
                f"No financial collections in perCollection")
    else:
        log_test("TEST 1.6 - perCollection excludes financial", False, 
                f"Found financial collections in perCollection: {financial_in_per_collection}")
    
    # Summary
    print("\n📊 TEST 1 SUMMARY:")
    print(f"  excludedCollections: {excluded_collections}")
    print(f"  scanned: {scanned}")
    print(f"  perCollection count: {len(per_collection)}")
    print(f"  Financial collections properly excluded: {not financial_in_scanned and not financial_in_per_collection}")

def test_payment_proof_resolves_privately():
    """
    TEST 2 — Payment proof resolves privately from R2 for admin, blocked for logged-out
    """
    print("\n" + "="*80)
    print("TEST 2: Payment proof resolves privately from R2")
    print("="*80)
    
    qa_payment_ids = ["qa-proof-legacy", "qa-proof-new"]
    
    # Test 2a: Admin access to qa-proof-legacy
    print("\n📤 Test 2a: Admin access to qa-proof-legacy...")
    if not admin_token:
        log_test("TEST 2a - Admin login required", False, "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/qa-proof-legacy",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("TEST 2a - Admin GET qa-proof-legacy", False, 
                    f"Expected 200, got {response.status_code}: {response.text[:200]}")
        else:
            data = response.json()
            payment = data.get("payment", {})
            has_proof = payment.get("hasProof")
            screenshot_url = payment.get("screenshotUrl", "")
            
            print(f"  Status: {response.status_code}")
            print(f"  hasProof: {has_proof}")
            print(f"  screenshotUrl prefix: {screenshot_url[:50] if screenshot_url else 'None'}...")
            
            # Check hasProof (or infer from screenshotUrl presence)
            has_proof_value = has_proof if has_proof is not None else bool(screenshot_url)
            if has_proof_value:
                log_test("TEST 2a.1 - hasProof == true", True, "hasProof is true (or screenshotUrl present)")
            else:
                log_test("TEST 2a.1 - hasProof == true", False, f"hasProof is {has_proof}, screenshotUrl empty")
            
            # Check screenshotUrl starts with "data:"
            if screenshot_url.startswith("data:"):
                mime_prefix = screenshot_url.split(";")[0] if ";" in screenshot_url else screenshot_url[:50]
                byte_length = len(screenshot_url)
                log_test("TEST 2a.2 - screenshotUrl is data URI", True, 
                        f"Mime: {mime_prefix}, Length: {byte_length} chars")
                print(f"  Data URI mime prefix: {mime_prefix}")
                print(f"  Data URI byte length: ~{byte_length} chars")
            else:
                log_test("TEST 2a.2 - screenshotUrl is data URI", False, 
                        f"screenshotUrl does not start with 'data:': {screenshot_url[:100]}")
            
            # Check NO http(s) Cloudinary/R2 URL
            if "http://" in screenshot_url or "https://" in screenshot_url:
                log_test("TEST 2a.3 - No http(s) URL", False, 
                        "Found http(s) URL in screenshotUrl")
            else:
                log_test("TEST 2a.3 - No http(s) URL", True, 
                        "No http(s) Cloudinary/R2 URL in response")
    
    except Exception as e:
        log_test("TEST 2a - Admin GET qa-proof-legacy", False, f"Exception: {str(e)}")
    
    # Test 2b: Admin access to qa-proof-new
    print("\n📤 Test 2b: Admin access to qa-proof-new...")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/qa-proof-new",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("TEST 2b - Admin GET qa-proof-new", False, 
                    f"Expected 200, got {response.status_code}: {response.text[:200]}")
        else:
            data = response.json()
            payment = data.get("payment", {})
            has_proof = payment.get("hasProof")
            screenshot_url = payment.get("screenshotUrl", "")
            
            print(f"  Status: {response.status_code}")
            print(f"  hasProof: {has_proof}")
            print(f"  screenshotUrl prefix: {screenshot_url[:50] if screenshot_url else 'None'}...")
            
            # Check hasProof (or infer from screenshotUrl presence)
            has_proof_value = has_proof if has_proof is not None else bool(screenshot_url)
            if has_proof_value:
                log_test("TEST 2b.1 - hasProof == true", True, "hasProof is true (or screenshotUrl present)")
            else:
                log_test("TEST 2b.1 - hasProof == true", False, f"hasProof is {has_proof}, screenshotUrl empty")
            
            # Check screenshotUrl starts with "data:"
            if screenshot_url.startswith("data:"):
                mime_prefix = screenshot_url.split(";")[0] if ";" in screenshot_url else screenshot_url[:50]
                byte_length = len(screenshot_url)
                log_test("TEST 2b.2 - screenshotUrl is data URI", True, 
                        f"Mime: {mime_prefix}, Length: {byte_length} chars")
                print(f"  Data URI mime prefix: {mime_prefix}")
                print(f"  Data URI byte length: ~{byte_length} chars")
            else:
                log_test("TEST 2b.2 - screenshotUrl is data URI", False, 
                        f"screenshotUrl does not start with 'data:': {screenshot_url[:100]}")
            
            # Check NO http(s) Cloudinary/R2 URL
            if "http://" in screenshot_url or "https://" in screenshot_url:
                log_test("TEST 2b.3 - No http(s) URL", False, 
                        "Found http(s) URL in screenshotUrl")
            else:
                log_test("TEST 2b.3 - No http(s) URL", True, 
                        "No http(s) Cloudinary/R2 URL in response")
    
    except Exception as e:
        log_test("TEST 2b - Admin GET qa-proof-new", False, f"Exception: {str(e)}")
    
    # Test 2c: Logged-out access to qa-proof-legacy (should be 403)
    print("\n📤 Test 2c: Logged-out access to qa-proof-legacy...")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/qa-proof-legacy",
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 403:
            log_test("TEST 2c - Logged-out GET qa-proof-legacy", True, 
                    "Correctly blocked with 403")
        else:
            log_test("TEST 2c - Logged-out GET qa-proof-legacy", False, 
                    f"Expected 403, got {response.status_code}")
    
    except Exception as e:
        log_test("TEST 2c - Logged-out GET qa-proof-legacy", False, f"Exception: {str(e)}")
    
    # Test 2d: Logged-out access to qa-proof-new (should be 403)
    print("\n📤 Test 2d: Logged-out access to qa-proof-new...")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/qa-proof-new",
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 403:
            log_test("TEST 2d - Logged-out GET qa-proof-new", True, 
                    "Correctly blocked with 403")
        else:
            log_test("TEST 2d - Logged-out GET qa-proof-new", False, 
                    f"Expected 403, got {response.status_code}")
    
    except Exception as e:
        log_test("TEST 2d - Logged-out GET qa-proof-new", False, f"Exception: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"📊 Total: {test_results['passed'] + test_results['failed']}")
    print(f"Success Rate: {test_results['passed'] / (test_results['passed'] + test_results['failed']) * 100:.1f}%")
    
    if test_results['failed'] > 0:
        print("\n❌ FAILED TESTS:")
        for detail in test_results['details']:
            if not detail['passed']:
                print(f"  - {detail['test']}: {detail['details']}")

def main():
    """Main test runner"""
    print("="*80)
    print("R2 MIGRATION + PAYMENT PROOF BACKEND TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    print("="*80)
    
    # Login as admin
    if not login_admin():
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    # Run tests
    test_r2_backfill_excludes_financial()
    test_payment_proof_resolves_privately()
    
    # Print summary
    print_summary()
    
    # Exit with appropriate code
    if test_results['failed'] > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
