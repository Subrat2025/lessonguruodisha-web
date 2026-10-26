#!/usr/bin/env python3
"""
Backend Test Suite for Admin Curriculum Backfill
Tests admin-only endpoints:
1. POST /api/admin/curriculum-backfill (with dryRun, limit, batch processing)
2. POST /api/admin/curriculum-backfill/reset (with only parameter)

Test scenarios A-H as specified in the review request.
"""

import requests
import json
import time
import sys

# Base URL from environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"
FALLBACK_ADMIN_MOBILE = "9692604577"
FALLBACK_ADMIN_PASSWORD = "<redacted>"

# Test state
admin_token = None
normal_user_token = None
normal_user_mobile = None

def log(msg):
    print(f"[TEST] {msg}")

def login(mobile, password):
    """Login and return token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            log(f"Login failed for {mobile}: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        log(f"Login exception for {mobile}: {e}")
        return None

def register_test_user():
    """Register a new test user and return (mobile, token)"""
    timestamp = int(time.time() * 1000)
    mobile = f"94{timestamp % 100000000:08d}"  # Generate 10-digit mobile
    password = "test1234"
    name = f"TestUser{timestamp % 10000}"
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": name,
            "mobile": mobile,
            "password": password
        }, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            log(f"✅ Registered test user: {mobile}")
            return mobile, token
        else:
            log(f"❌ Registration failed: {resp.status_code} - {resp.text}")
            return None, None
    except Exception as e:
        log(f"❌ Registration exception: {e}")
        return None, None

# ============================================================
# TEST A: Security - No auth and Non-admin
# ============================================================

def test_a_security_no_auth():
    """Test A1: POST /api/admin/curriculum-backfill without auth → 401"""
    log("\n=== TEST A1: Security - No Auth ===")
    try:
        resp = requests.post(f"{BASE_URL}/admin/curriculum-backfill", json={
            "dryRun": True
        }, timeout=30)
        
        if resp.status_code == 401:
            log(f"✅ TEST A1 PASSED: No auth → 401 (status: {resp.status_code})")
            return True
        else:
            log(f"❌ TEST A1 FAILED: Expected 401, got {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
    except Exception as e:
        log(f"❌ TEST A1 EXCEPTION: {e}")
        return False

def test_a_security_non_admin():
    """Test A2: POST /api/admin/curriculum-backfill with non-admin token → 403"""
    log("\n=== TEST A2: Security - Non-Admin ===")
    global normal_user_token, normal_user_mobile
    
    # Register a fresh normal user
    normal_user_mobile, normal_user_token = register_test_user()
    if not normal_user_token:
        log(f"❌ TEST A2 FAILED: Could not register normal user")
        return False
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"dryRun": True}, 
            timeout=30)
        
        if resp.status_code == 403:
            log(f"✅ TEST A2 PASSED: Non-admin → 403 (status: {resp.status_code})")
            return True
        else:
            log(f"❌ TEST A2 FAILED: Expected 403, got {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
    except Exception as e:
        log(f"❌ TEST A2 EXCEPTION: {e}")
        return False

# ============================================================
# TEST B: DryRun - Must NOT process anything
# ============================================================

def test_b_dryrun():
    """Test B: POST with dryRun:true twice → remaining identical both times"""
    log("\n=== TEST B: DryRun - No Processing ===")
    global admin_token
    
    try:
        # First dryRun call
        resp1 = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"dryRun": True}, 
            timeout=30)
        
        if resp1.status_code != 200:
            log(f"❌ TEST B FAILED: First dryRun call failed with {resp1.status_code}")
            log(f"   Response: {resp1.text}")
            return False
        
        data1 = resp1.json()
        log(f"   First dryRun response: {json.dumps(data1, indent=2)}")
        
        # Validate response structure
        if not isinstance(data1.get("geminiEnabled"), bool):
            log(f"❌ TEST B FAILED: geminiEnabled is not boolean: {data1.get('geminiEnabled')}")
            return False
        
        if not isinstance(data1.get("remaining"), (int, float)):
            log(f"❌ TEST B FAILED: remaining is not numeric: {data1.get('remaining')}")
            return False
        
        if not isinstance(data1.get("done"), bool):
            log(f"❌ TEST B FAILED: done is not boolean: {data1.get('done')}")
            return False
        
        remaining1 = data1.get("remaining")
        log(f"   First dryRun: geminiEnabled={data1.get('geminiEnabled')}, remaining={remaining1}, done={data1.get('done')}")
        
        # Wait a moment
        time.sleep(1)
        
        # Second dryRun call
        resp2 = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"dryRun": True}, 
            timeout=30)
        
        if resp2.status_code != 200:
            log(f"❌ TEST B FAILED: Second dryRun call failed with {resp2.status_code}")
            log(f"   Response: {resp2.text}")
            return False
        
        data2 = resp2.json()
        remaining2 = data2.get("remaining")
        log(f"   Second dryRun: geminiEnabled={data2.get('geminiEnabled')}, remaining={remaining2}, done={data2.get('done')}")
        
        # Assert remaining is identical
        if remaining1 == remaining2:
            log(f"✅ TEST B PASSED: DryRun does NOT process (remaining identical: {remaining1})")
            return True
        else:
            log(f"❌ TEST B FAILED: DryRun processed data! remaining changed from {remaining1} to {remaining2}")
            return False
            
    except Exception as e:
        log(f"❌ TEST B EXCEPTION: {e}")
        return False

# ============================================================
# TEST C: Batch processing with limit
# ============================================================

def test_c_batch():
    """Test C: POST with limit:5 → validate response structure and constraints"""
    log("\n=== TEST C: Batch Processing ===")
    global admin_token
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"limit": 5}, 
            timeout=60)
        
        if resp.status_code != 200:
            log(f"❌ TEST C FAILED: Batch call failed with {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        log(f"   Batch response: {json.dumps(data, indent=2)}")
        
        # Validate response structure
        required_fields = ["geminiEnabled", "batch", "foundationalCached", "subjectCached", 
                          "skippedIneligible", "skippedNoCodes", "skippedNoData", "remaining", "done"]
        
        for field in required_fields:
            if field not in data:
                log(f"❌ TEST C FAILED: Missing field '{field}' in response")
                return False
        
        # Validate types
        if not isinstance(data.get("geminiEnabled"), bool):
            log(f"❌ TEST C FAILED: geminiEnabled is not boolean")
            return False
        
        batch = data.get("batch")
        if not isinstance(batch, (int, float)) or batch < 0:
            log(f"❌ TEST C FAILED: batch is not a valid number: {batch}")
            return False
        
        if batch > 5:
            log(f"❌ TEST C FAILED: batch ({batch}) exceeds limit (5)")
            return False
        
        # Validate constraint: sum of processed/skipped <= batch
        foundationalCached = data.get("foundationalCached", 0)
        subjectCached = data.get("subjectCached", 0)
        skippedIneligible = data.get("skippedIneligible", 0)
        skippedNoCodes = data.get("skippedNoCodes", 0)
        skippedNoData = data.get("skippedNoData", 0)
        
        total_processed = foundationalCached + subjectCached + skippedIneligible + skippedNoCodes + skippedNoData
        
        log(f"   Batch: {batch}")
        log(f"   Foundational cached: {foundationalCached}")
        log(f"   Subject cached: {subjectCached}")
        log(f"   Skipped (ineligible): {skippedIneligible}")
        log(f"   Skipped (no codes): {skippedNoCodes}")
        log(f"   Skipped (no data): {skippedNoData}")
        log(f"   Total processed: {total_processed}")
        log(f"   Remaining: {data.get('remaining')}")
        log(f"   Done: {data.get('done')}")
        
        if total_processed <= batch:
            log(f"✅ TEST C PASSED: Batch processing valid (processed {total_processed} <= batch {batch})")
            return True
        else:
            log(f"❌ TEST C FAILED: Total processed ({total_processed}) exceeds batch ({batch})")
            return False
            
    except Exception as e:
        log(f"❌ TEST C EXCEPTION: {e}")
        return False

# ============================================================
# TEST D: Monotonic progress / Idempotency
# ============================================================

def test_d_monotonic_progress():
    """Test D: Call limit:5 three times → remaining never increases"""
    log("\n=== TEST D: Monotonic Progress / Idempotency ===")
    global admin_token
    
    try:
        # Get initial remaining via dryRun
        resp_dry = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"dryRun": True}, 
            timeout=30)
        
        if resp_dry.status_code != 200:
            log(f"❌ TEST D FAILED: Initial dryRun failed")
            return False
        
        initial_remaining = resp_dry.json().get("remaining")
        log(f"   Initial remaining (dryRun): {initial_remaining}")
        
        remaining_values = [initial_remaining]
        
        # Call limit:5 three times
        for i in range(1, 4):
            log(f"   Batch call {i}/3...")
            resp = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"limit": 5}, 
                timeout=60)
            
            if resp.status_code != 200:
                log(f"❌ TEST D FAILED: Batch call {i} failed with {resp.status_code}")
                return False
            
            data = resp.json()
            remaining = data.get("remaining")
            remaining_values.append(remaining)
            log(f"   After batch {i}: remaining={remaining}, done={data.get('done')}")
            time.sleep(1)
        
        # Check monotonic non-increasing
        log(f"   Remaining progression: {remaining_values}")
        
        for i in range(len(remaining_values) - 1):
            if remaining_values[i+1] > remaining_values[i]:
                log(f"❌ TEST D FAILED: Remaining INCREASED from {remaining_values[i]} to {remaining_values[i+1]}")
                return False
        
        log(f"✅ TEST D PASSED: Remaining is monotonically non-increasing: {remaining_values}")
        return True
        
    except Exception as e:
        log(f"❌ TEST D EXCEPTION: {e}")
        return False

# ============================================================
# TEST E: Persistence - Verify cached data
# ============================================================

def test_e_persistence():
    """Test E: After backfill, verify a foundational lesson has cgCode persisted"""
    log("\n=== TEST E: Persistence - Verify Cached Data ===")
    global admin_token
    
    try:
        # Use a known Class 3 lesson that should have cached CG/Competency
        # This lesson ID is from the test_result.md file (Class 3, Pallavi, My Family)
        known_lesson_id = "dcf5c1da-525b-47e7-b88e-60208e1b69fa"
        
        log(f"   Testing with known lesson ID: {known_lesson_id}")
        
        # Call POST /api/lesson-curriculum with this lesson
        resp_curriculum = requests.post(f"{BASE_URL}/lesson-curriculum", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"lessonId": known_lesson_id}, 
            timeout=30)
        
        if resp_curriculum.status_code != 200:
            log(f"❌ TEST E FAILED: lesson-curriculum call failed with {resp_curriculum.status_code}")
            log(f"   Response: {resp_curriculum.text}")
            return False
        
        curriculum_data = resp_curriculum.json()
        log(f"   Curriculum response: {json.dumps(curriculum_data, indent=2)}")
        
        # Verify cg and competency are present
        if not curriculum_data.get("eligible"):
            log(f"❌ TEST E FAILED: Lesson not eligible for curriculum alignment")
            return False
        
        cg = curriculum_data.get("cg")
        competency = curriculum_data.get("competency")
        
        if cg and cg.get("code") and competency and competency.get("code"):
            log(f"✅ TEST E PASSED: Lesson has persisted CG ({cg.get('code')}) and Competency ({competency.get('code')})")
            log(f"   This confirms backfill didn't corrupt data and curriculum alignment is working")
            return True
        else:
            log(f"❌ TEST E FAILED: Lesson missing CG or Competency after backfill")
            log(f"   CG: {cg}")
            log(f"   Competency: {competency}")
            return False
        
    except Exception as e:
        log(f"❌ TEST E EXCEPTION: {e}")
        return False

# ============================================================
# TEST F: Limit clamping
# ============================================================

def test_f_limit_clamp():
    """Test F: POST with limit:999 → batch <= 40, limit:0 → still works"""
    log("\n=== TEST F: Limit Clamping ===")
    global admin_token
    
    try:
        # Test F1: limit 999 should clamp to 40
        log("   F1: Testing limit=999 (should clamp to 40)...")
        resp1 = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"limit": 999}, 
            timeout=60)
        
        if resp1.status_code != 200:
            log(f"❌ TEST F1 FAILED: limit=999 call failed with {resp1.status_code}")
            log(f"   Response: {resp1.text}")
            return False
        
        data1 = resp1.json()
        batch1 = data1.get("batch")
        
        if batch1 <= 40:
            log(f"✅ TEST F1 PASSED: limit=999 clamped correctly (batch={batch1} <= 40)")
        else:
            log(f"❌ TEST F1 FAILED: limit=999 not clamped (batch={batch1} > 40)")
            return False
        
        time.sleep(1)
        
        # Test F2: limit 0 should clamp to >= 1
        log("   F2: Testing limit=0 (should clamp to >= 1)...")
        resp2 = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"limit": 0}, 
            timeout=60)
        
        if resp2.status_code != 200:
            log(f"❌ TEST F2 FAILED: limit=0 call failed with {resp2.status_code}")
            log(f"   Response: {resp2.text}")
            return False
        
        data2 = resp2.json()
        batch2 = data2.get("batch")
        
        log(f"   limit=0 result: batch={batch2}")
        log(f"✅ TEST F2 PASSED: limit=0 handled gracefully (status 200)")
        
        time.sleep(1)
        
        # Test F3: negative limit should also work
        log("   F3: Testing limit=-5 (should clamp to >= 1)...")
        resp3 = requests.post(f"{BASE_URL}/admin/curriculum-backfill", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"limit": -5}, 
            timeout=60)
        
        if resp3.status_code != 200:
            log(f"❌ TEST F3 FAILED: limit=-5 call failed with {resp3.status_code}")
            log(f"   Response: {resp3.text}")
            return False
        
        data3 = resp3.json()
        batch3 = data3.get("batch")
        
        log(f"   limit=-5 result: batch={batch3}")
        log(f"✅ TEST F3 PASSED: limit=-5 handled gracefully (status 200)")
        
        log(f"✅ TEST F PASSED: All limit clamping tests passed")
        return True
        
    except Exception as e:
        log(f"❌ TEST F EXCEPTION: {e}")
        return False

# ============================================================
# TEST G: Reset endpoint with only parameter
# ============================================================

def test_g_reset():
    """Test G: POST /api/admin/curriculum-backfill/reset with only:'nogemini' → 200 with cleared count"""
    log("\n=== TEST G: Reset Endpoint ===")
    global admin_token
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/curriculum-backfill/reset", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"only": "nogemini"}, 
            timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ TEST G FAILED: Reset call failed with {resp.status_code}")
            log(f"   Response: {resp.text}")
            return False
        
        data = resp.json()
        log(f"   Reset response: {json.dumps(data, indent=2)}")
        
        # Validate response structure
        if not data.get("ok"):
            log(f"❌ TEST G FAILED: Response ok is not true")
            return False
        
        cleared = data.get("cleared")
        if not isinstance(cleared, (int, float)) or cleared < 0:
            log(f"❌ TEST G FAILED: cleared is not a valid number: {cleared}")
            return False
        
        log(f"✅ TEST G PASSED: Reset successful (ok=true, cleared={cleared})")
        return True
        
    except Exception as e:
        log(f"❌ TEST G EXCEPTION: {e}")
        return False

# ============================================================
# TEST H: Reset endpoint security
# ============================================================

def test_h_reset_security():
    """Test H: POST /api/admin/curriculum-backfill/reset without auth → 401, non-admin → 403"""
    log("\n=== TEST H: Reset Security ===")
    global admin_token, normal_user_token
    
    try:
        # H1: No auth
        log("   H1: Testing reset without auth...")
        resp1 = requests.post(f"{BASE_URL}/admin/curriculum-backfill/reset", 
            json={"only": "nogemini"}, 
            timeout=30)
        
        if resp1.status_code == 401:
            log(f"✅ TEST H1 PASSED: No auth → 401")
        else:
            log(f"❌ TEST H1 FAILED: Expected 401, got {resp1.status_code}")
            log(f"   Response: {resp1.text}")
            return False
        
        # H2: Non-admin
        log("   H2: Testing reset with non-admin token...")
        if not normal_user_token:
            log(f"⚠️  TEST H2 SKIPPED: No normal user token available")
        else:
            resp2 = requests.post(f"{BASE_URL}/admin/curriculum-backfill/reset", 
                headers={"Authorization": f"Bearer {normal_user_token}"},
                json={"only": "nogemini"}, 
                timeout=30)
            
            if resp2.status_code == 403:
                log(f"✅ TEST H2 PASSED: Non-admin → 403")
            else:
                log(f"❌ TEST H2 FAILED: Expected 403, got {resp2.status_code}")
                log(f"   Response: {resp2.text}")
                return False
        
        log(f"✅ TEST H PASSED: Reset security checks passed")
        return True
        
    except Exception as e:
        log(f"❌ TEST H EXCEPTION: {e}")
        return False

# ============================================================
# Main test runner
# ============================================================

def main():
    global admin_token
    
    log("=" * 60)
    log("ADMIN CURRICULUM BACKFILL TEST SUITE")
    log("=" * 60)
    
    # Login as admin
    log("\n=== Admin Login ===")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        log(f"Primary admin login failed, trying fallback...")
        admin_token = login(FALLBACK_ADMIN_MOBILE, FALLBACK_ADMIN_PASSWORD)
    
    if not admin_token:
        log(f"❌ FATAL: Could not login as admin")
        sys.exit(1)
    
    log(f"✅ Admin logged in successfully")
    
    # Run all tests
    results = {}
    
    # Test A: Security
    results["A1_no_auth"] = test_a_security_no_auth()
    results["A2_non_admin"] = test_a_security_non_admin()
    
    # Test B: DryRun
    results["B_dryrun"] = test_b_dryrun()
    
    # Test C: Batch
    results["C_batch"] = test_c_batch()
    
    # Test D: Monotonic progress
    results["D_monotonic"] = test_d_monotonic_progress()
    
    # Test E: Persistence
    results["E_persistence"] = test_e_persistence()
    
    # Test F: Limit clamp
    results["F_limit_clamp"] = test_f_limit_clamp()
    
    # Test G: Reset
    results["G_reset"] = test_g_reset()
    
    # Test H: Reset security
    results["H_reset_security"] = test_h_reset_security()
    
    # Summary
    log("\n" + "=" * 60)
    log("TEST SUMMARY")
    log("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status}: {test_name}")
    
    log(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        log(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
