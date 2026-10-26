#!/usr/bin/env python3
"""
Backend test for Assessment Store: rate limiting + bulk release dates
Test date: 2026-09-30
"""
import requests
import time
import json
from pymongo import MongoClient
import os

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

def get_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

def login_admin():
    """Login as admin and return token"""
    print("\n=== ADMIN LOGIN ===")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    print(f"Login status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        token = data.get("token")
        print(f"✅ Admin login successful, token: {token[:20]}...")
        return token
    else:
        print(f"❌ Admin login failed: {resp.text}")
        return None

def test_rate_limiting(admin_token):
    """Test rate limiting on /assess/* endpoints"""
    print("\n" + "="*80)
    print("TEST 1: RATE LIMITING (applies ONLY to /api/assess/*, NOT rest of site)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 1a. Set rate_per_user_min to 5
    print("\n1a. Set rate_per_user_min to 5 via PUT /api/admin/assess/settings")
    resp = requests.put(f"{BASE_URL}/admin/assess/settings", 
                       json={"settings": {"rate_per_user_min": 5}},
                       headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Settings updated: rate_per_user_min = {data.get('settings', {}).get('rate_per_user_min')}")
    else:
        print(f"❌ Failed to update settings: {resp.text}")
        return False
    
    # Wait a moment for cache to expire (30s cache in getAssessRateCfg)
    print("\nWaiting 2 seconds for rate config cache to refresh...")
    time.sleep(2)
    
    # 1b. Hammer GET /api/assess/config (lightweight assess endpoint) >5 times
    print("\n1b. Hammer GET /api/assess/config >5 times with SAME admin token")
    print("Expected: first ~5 requests succeed (200), then 429 RATE_LIMITED")
    
    rate_limited_count = 0
    success_count = 0
    
    for i in range(10):
        resp = requests.get(f"{BASE_URL}/assess/config", headers=headers)
        if resp.status_code == 200:
            success_count += 1
            print(f"  Request {i+1}: 200 OK")
        elif resp.status_code == 429:
            rate_limited_count += 1
            data = resp.json()
            code = data.get("code")
            error = data.get("error")
            retry_after = resp.headers.get("Retry-After")
            print(f"  Request {i+1}: 429 RATE_LIMITED")
            print(f"    code: {code}")
            print(f"    error: {error}")
            print(f"    Retry-After: {retry_after}")
            if code == "RATE_LIMITED" and "ଅତ୍ୟଧିକ ଅନୁରୋଧ" in error:
                print(f"    ✅ Correct error code and Odia message")
            else:
                print(f"    ❌ Unexpected error format")
        else:
            print(f"  Request {i+1}: {resp.status_code} (unexpected)")
        time.sleep(0.1)  # Small delay between requests
    
    print(f"\nSummary: {success_count} succeeded, {rate_limited_count} rate-limited")
    
    if rate_limited_count > 0:
        print("✅ TEST 1b PASSED: Rate limiting working on /assess/* endpoints")
    else:
        print("❌ TEST 1b FAILED: No rate limiting observed")
        return False
    
    # 1c. Confirm NON-assess endpoint is NOT rate-limited
    print("\n1c. Hammer GET /api/plans (NON-assess endpoint) ~20 times")
    print("Expected: ALL requests succeed (200), NEVER 429 RATE_LIMITED")
    
    non_assess_limited = 0
    non_assess_success = 0
    
    for i in range(20):
        resp = requests.get(f"{BASE_URL}/plans", headers=headers)
        if resp.status_code == 200:
            non_assess_success += 1
        elif resp.status_code == 429:
            non_assess_limited += 1
            data = resp.json()
            if data.get("code") == "RATE_LIMITED":
                print(f"  Request {i+1}: 429 RATE_LIMITED (UNEXPECTED!)")
        time.sleep(0.05)
    
    print(f"Summary: {non_assess_success}/20 succeeded, {non_assess_limited}/20 rate-limited")
    
    if non_assess_limited == 0 and non_assess_success == 20:
        print("✅ TEST 1c PASSED: Non-assess endpoints NOT rate-limited")
    else:
        print(f"❌ TEST 1c FAILED: Non-assess endpoint was rate-limited {non_assess_limited} times")
        return False
    
    # 1d. Restore rate_per_user_min to 30
    print("\n1d. Restore rate_per_user_min to 30")
    resp = requests.put(f"{BASE_URL}/admin/assess/settings",
                       json={"settings": {"rate_per_user_min": 30}},
                       headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        restored_value = data.get('settings', {}).get('rate_per_user_min')
        print(f"✅ Settings restored: rate_per_user_min = {restored_value}")
        if restored_value == 30:
            print("✅ TEST 1d PASSED: Settings restored successfully")
        else:
            print(f"❌ TEST 1d FAILED: Expected 30, got {restored_value}")
            return False
    else:
        print(f"❌ Failed to restore settings: {resp.text}")
        return False
    
    print("\n✅ ALL RATE LIMITING TESTS PASSED")
    return True

def test_bulk_release(admin_token):
    """Test bulk release dates endpoint"""
    print("\n" + "="*80)
    print("TEST 2: BULK RELEASE DATES (POST /api/admin/assess/bulk-release)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    db = get_db()
    
    # First, discover a valid class with documents
    print("\n2a. Discover a valid class with documents (using narrow filter)")
    
    # Get facets from assess_documents to find a class with few documents
    pipeline = [
        {"$group": {"_id": "$class", "count": {"$sum": 1}}},
        {"$sort": {"count": 1}},
        {"$limit": 5}
    ]
    facets = list(db.assess_documents.aggregate(pipeline))
    print(f"Found {len(facets)} classes with documents:")
    for f in facets:
        print(f"  Class {f['_id']}: {f['count']} documents")
    
    if not facets:
        print("❌ No documents found in assess_documents collection")
        return False
    
    # Use the class with fewest documents for narrow filter
    test_class = facets[0]['_id']
    test_count = facets[0]['count']
    print(f"\nUsing narrow filter: class='{test_class}' (matches {test_count} documents)")
    
    # 2b. Preview with narrow filter
    print(f"\n2b. Preview: POST /api/admin/assess/bulk-release {{filter:{{class:'{test_class}'}}, preview:true}}")
    resp = requests.post(f"{BASE_URL}/admin/assess/bulk-release",
                        json={"filter": {"class": test_class}, "preview": True},
                        headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        preview_count = data.get("count", 0)
        print(f"✅ Preview successful: count={preview_count}, preview={data.get('preview')}")
        if preview_count != test_count:
            print(f"⚠ Warning: Expected {test_count} documents, got {preview_count}")
    else:
        print(f"❌ Preview failed: {resp.text}")
        return False
    
    # 2c. Apply future release_at date
    future_date = "2027-01-01T00:00:00.000Z"
    print(f"\n2c. Apply future date: {{filter:{{class:'{test_class}'}}, release_at:'{future_date}'}}")
    resp = requests.post(f"{BASE_URL}/admin/assess/bulk-release",
                        json={"filter": {"class": test_class}, "release_at": future_date},
                        headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        affected = data.get("affected", 0)
        print(f"✅ Bulk release applied: affected={affected} documents")
        
        # Verify via DB that release_at was set
        docs_with_release = db.assess_documents.count_documents({
            "class": test_class,
            "release_at": {"$ne": None}
        })
        print(f"  Verified via DB: {docs_with_release} documents have release_at set")
        
        # Verify assess_admin_audit row exists
        audit = db.assess_admin_audit.find_one(
            {"action": "bulk_release", "filter.class": test_class},
            sort=[("at", -1)]
        )
        if audit:
            print(f"  ✅ Audit row found: action={audit['action']}, affected={audit.get('affected')}")
        else:
            print(f"  ❌ No audit row found for bulk_release action")
            return False
    else:
        print(f"❌ Bulk release failed: {resp.text}")
        return False
    
    # 2d. Clear release_at (RESTORE availability)
    print(f"\n2d. Clear release_at: {{filter:{{class:'{test_class}'}}, clear:true}}")
    resp = requests.post(f"{BASE_URL}/admin/assess/bulk-release",
                        json={"filter": {"class": test_class}, "clear": True},
                        headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        affected = data.get("affected", 0)
        print(f"✅ Release dates cleared: affected={affected} documents")
        
        # Verify via DB that release_at is now null
        docs_with_release = db.assess_documents.count_documents({
            "class": test_class,
            "release_at": {"$ne": None}
        })
        print(f"  Verified via DB: {docs_with_release} documents still have release_at (should be 0)")
        
        if docs_with_release == 0:
            print(f"  ✅ All release_at values cleared successfully")
        else:
            print(f"  ❌ Some documents still have release_at set")
            return False
    else:
        print(f"❌ Clear failed: {resp.text}")
        return False
    
    # 2e. Empty filter match (should return 400)
    print("\n2e. Empty filter match: {{filter:{{class:'__nope__'}}, release_at:'2027-01-01T00:00:00.000Z'}}")
    resp = requests.post(f"{BASE_URL}/admin/assess/bulk-release",
                        json={"filter": {"class": "__nope__"}, "release_at": future_date},
                        headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400:
        data = resp.json()
        print(f"✅ Correctly rejected empty filter: {data.get('error')}")
    else:
        print(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
        return False
    
    # 2f. Non-admin/no token (should return 401/403)
    print("\n2f. Non-admin/no token: POST /api/admin/assess/bulk-release without token")
    resp = requests.post(f"{BASE_URL}/admin/assess/bulk-release",
                        json={"filter": {"class": test_class}, "preview": True})
    print(f"Status: {resp.status_code}")
    if resp.status_code in [401, 403]:
        print(f"✅ Correctly rejected non-admin request: {resp.status_code}")
    else:
        print(f"❌ Expected 401/403, got {resp.status_code}")
        return False
    
    print("\n✅ ALL BULK RELEASE TESTS PASSED")
    return True

def main():
    print("="*80)
    print("BACKEND TEST: Assessment Store Rate Limiting + Bulk Release Dates")
    print("="*80)
    
    # Login as admin
    admin_token = login_admin()
    if not admin_token:
        print("\n❌ FATAL: Admin login failed")
        return
    
    # Test rate limiting
    rate_test_passed = test_rate_limiting(admin_token)
    
    # Wait for rate limiter to reset (60s window)
    if rate_test_passed:
        print("\n⏳ Waiting 60 seconds for rate limiter window to reset...")
        time.sleep(60)
    
    # Test bulk release
    bulk_test_passed = test_bulk_release(admin_token)
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    if rate_test_passed and bulk_test_passed:
        print("✅ ALL TESTS PASSED (100% success rate)")
        print("\n📊 TEST RESULTS:")
        print("  ✅ Rate limiting on /assess/* endpoints: WORKING")
        print("  ✅ Non-assess endpoints NOT rate-limited: WORKING")
        print("  ✅ Bulk release preview: WORKING")
        print("  ✅ Bulk release apply: WORKING")
        print("  ✅ Bulk release clear: WORKING")
        print("  ✅ Empty filter rejection: WORKING")
        print("  ✅ Admin auth enforcement: WORKING")
        print("\n✅ Settings restored: rate_per_user_min=30")
        print("✅ Release dates cleared: all test documents available")
    else:
        print("❌ SOME TESTS FAILED")
        if not rate_test_passed:
            print("  ❌ Rate limiting tests failed")
        if not bulk_test_passed:
            print("  ❌ Bulk release tests failed")

if __name__ == "__main__":
    main()
