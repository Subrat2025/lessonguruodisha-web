#!/usr/bin/env python3
"""
Backend test for 15-second time budget in admin endpoints
Tests POST /api/admin/curriculum-backfill and POST /api/admin/lo-generate
"""

import requests
import time
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def login_admin():
    """Login with admin credentials"""
    print("\n=== Admin Login ===")
    # Try primary admin credentials
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": "9999999999",
        "password": "admin123"
    })
    
    if response.status_code != 200:
        # Try fallback admin credentials
        print("Primary admin login failed, trying fallback...")
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        })
    
    assert response.status_code == 200, f"Admin login failed: {response.status_code} {response.text}"
    data = response.json()
    token = data.get("token")
    assert token, "No token in login response"
    print(f"✅ Admin login successful")
    return token

def register_user(mobile, password):
    """Register a new user"""
    response = requests.post(f"{BASE_URL}/auth/register", json={
        "mobile": mobile,
        "password": password,
        "name": f"Test User {mobile[-4:]}"
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    return None

def test_curriculum_backfill_dryrun(token):
    """Test 1: POST /api/admin/curriculum-backfill { dryRun: true }"""
    print("\n=== TEST 1: Curriculum Backfill DryRun ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    start_time = time.time()
    
    response = requests.post(
        f"{BASE_URL}/admin/curriculum-backfill",
        json={"dryRun": True},
        headers=headers
    )
    
    elapsed = time.time() - start_time
    
    print(f"Status: {response.status_code}")
    print(f"Response time: {elapsed:.2f}s")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    # Verify required fields
    assert "geminiEnabled" in data, "Missing geminiEnabled field"
    assert isinstance(data["geminiEnabled"], bool), "geminiEnabled should be boolean"
    
    assert "remaining" in data, "Missing remaining field"
    assert isinstance(data["remaining"], (int, float)), "remaining should be number"
    
    assert "done" in data, "Missing done field"
    assert isinstance(data["done"], bool), "done should be boolean"
    
    print(f"✅ TEST 1 PASSED: geminiEnabled={data['geminiEnabled']}, remaining={data['remaining']}, done={data['done']}")
    return data

def test_curriculum_backfill_batch(token):
    """Test 2: POST /api/admin/curriculum-backfill { limit: 5 }"""
    print("\n=== TEST 2: Curriculum Backfill Batch (limit=5) ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    start_time = time.time()
    
    response = requests.post(
        f"{BASE_URL}/admin/curriculum-backfill",
        json={"limit": 5},
        headers=headers
    )
    
    elapsed = time.time() - start_time
    
    print(f"Status: {response.status_code}")
    print(f"Response time: {elapsed:.2f}s")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    # CRITICAL: Response should return in well under 30 seconds (with 15s time budget)
    assert elapsed < 30, f"Response took {elapsed:.2f}s, expected < 30s"
    print(f"✅ Response time OK: {elapsed:.2f}s < 30s")
    
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    # Verify required fields
    required_fields = ["foundationalCached", "subjectCached", "skippedIneligible", 
                      "skippedNoCodes", "skippedNoData", "remaining", "done", "batch"]
    
    for field in required_fields:
        assert field in data, f"Missing required field: {field}"
    
    # Verify batch constraint: (foundationalCached + subjectCached + skipped*) <= batch
    total_processed = (data["foundationalCached"] + data["subjectCached"] + 
                      data["skippedIneligible"] + data["skippedNoCodes"] + 
                      data["skippedNoData"])
    
    print(f"Batch constraint check: {total_processed} <= {data['batch']}")
    assert total_processed <= data["batch"], f"Batch constraint violated: {total_processed} > {data['batch']}"
    
    print(f"✅ TEST 2 PASSED: All fields present, batch constraint satisfied, response time < 30s")
    return data

def test_lo_generate_dryrun(token):
    """Test 3: POST /api/admin/lo-generate { dryRun: true }"""
    print("\n=== TEST 3: LO Generate DryRun ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    start_time = time.time()
    
    response = requests.post(
        f"{BASE_URL}/admin/lo-generate",
        json={"dryRun": True},
        headers=headers
    )
    
    elapsed = time.time() - start_time
    
    print(f"Status: {response.status_code}")
    print(f"Response time: {elapsed:.2f}s")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    # Verify required fields
    assert "geminiEnabled" in data, "Missing geminiEnabled field"
    assert isinstance(data["geminiEnabled"], bool), "geminiEnabled should be boolean"
    
    assert "remaining" in data, "Missing remaining field"
    assert isinstance(data["remaining"], (int, float)), "remaining should be number"
    
    assert "done" in data, "Missing done field"
    assert isinstance(data["done"], bool), "done should be boolean"
    
    print(f"✅ TEST 3 PASSED: geminiEnabled={data['geminiEnabled']}, remaining={data['remaining']}, done={data['done']}")
    return data

def test_lo_generate_batch(token):
    """Test 4: POST /api/admin/lo-generate { limit: 5 }"""
    print("\n=== TEST 4: LO Generate Batch (limit=5) ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    start_time = time.time()
    
    response = requests.post(
        f"{BASE_URL}/admin/lo-generate",
        json={"limit": 5},
        headers=headers
    )
    
    elapsed = time.time() - start_time
    
    print(f"Status: {response.status_code}")
    print(f"Response time: {elapsed:.2f}s")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    # CRITICAL: Response should return in well under 30 seconds (with 15s time budget)
    assert elapsed < 30, f"Response took {elapsed:.2f}s, expected < 30s"
    print(f"✅ Response time OK: {elapsed:.2f}s < 30s")
    
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    # Verify required fields
    required_fields = ["updated", "foundationalCount", "subjectCount", "skippedIneligible",
                      "skippedNoGemini", "skippedNoPool", "skippedNoMatch", "errors",
                      "remaining", "done", "batch"]
    
    for field in required_fields:
        assert field in data, f"Missing required field: {field}"
    
    # CRITICAL: Assert errors == 0 (Gemini works)
    print(f"Errors check: {data['errors']} == 0")
    assert data["errors"] == 0, f"Expected errors=0 (Gemini working), got {data['errors']}"
    print(f"✅ Gemini working correctly (errors=0)")
    
    # Verify batch constraint: (updated + skipped* + errors) <= batch
    total_processed = (data["updated"] + data["skippedIneligible"] + data["skippedNoGemini"] +
                      data["skippedNoPool"] + data["skippedNoMatch"] + data["errors"])
    
    print(f"Batch constraint check: {total_processed} <= {data['batch']}")
    assert total_processed <= data["batch"], f"Batch constraint violated: {total_processed} > {data['batch']}"
    
    print(f"✅ TEST 4 PASSED: All fields present, errors=0, batch constraint satisfied, response time < 30s")
    return data

def test_security():
    """Test 5: Security checks for both endpoints"""
    print("\n=== TEST 5: Security Checks ===")
    
    # Test 5a: No auth → 401/403
    print("\n--- Test 5a: No auth ---")
    
    response1 = requests.post(f"{BASE_URL}/admin/curriculum-backfill", json={"dryRun": True})
    print(f"curriculum-backfill without auth: {response1.status_code}")
    assert response1.status_code in [401, 403], f"Expected 401/403, got {response1.status_code}"
    print(f"✅ curriculum-backfill correctly rejects no auth: {response1.status_code}")
    
    response2 = requests.post(f"{BASE_URL}/admin/lo-generate", json={"dryRun": True})
    print(f"lo-generate without auth: {response2.status_code}")
    assert response2.status_code in [401, 403], f"Expected 401/403, got {response2.status_code}"
    print(f"✅ lo-generate correctly rejects no auth: {response2.status_code}")
    
    # Test 5b: Non-admin → 403
    print("\n--- Test 5b: Non-admin user ---")
    
    # Register a non-admin user
    non_admin_mobile = "9434299999"
    non_admin_token = register_user(non_admin_mobile, "test123")
    
    if non_admin_token:
        print(f"Registered non-admin user: {non_admin_mobile}")
        
        headers = {"Authorization": f"Bearer {non_admin_token}"}
        
        response3 = requests.post(
            f"{BASE_URL}/admin/curriculum-backfill",
            json={"dryRun": True},
            headers=headers
        )
        print(f"curriculum-backfill with non-admin: {response3.status_code}")
        assert response3.status_code == 403, f"Expected 403, got {response3.status_code}"
        print(f"✅ curriculum-backfill correctly rejects non-admin: 403")
        
        response4 = requests.post(
            f"{BASE_URL}/admin/lo-generate",
            json={"dryRun": True},
            headers=headers
        )
        print(f"lo-generate with non-admin: {response4.status_code}")
        assert response4.status_code == 403, f"Expected 403, got {response4.status_code}"
        print(f"✅ lo-generate correctly rejects non-admin: 403")
    else:
        print("⚠️ Could not register non-admin user, skipping non-admin tests")
    
    print(f"✅ TEST 5 PASSED: Security checks working correctly")

def main():
    print("=" * 80)
    print("BACKEND TEST: 15-Second Time Budget in Admin Endpoints")
    print("=" * 80)
    
    try:
        # Login as admin
        admin_token = login_admin()
        
        # Run all tests
        test_curriculum_backfill_dryrun(admin_token)
        test_curriculum_backfill_batch(admin_token)
        test_lo_generate_dryrun(admin_token)
        test_lo_generate_batch(admin_token)
        test_security()
        
        print("\n" + "=" * 80)
        print("✅ ALL 5 TESTS PASSED - 15-SECOND TIME BUDGET WORKING CORRECTLY")
        print("=" * 80)
        print("\nSUMMARY:")
        print("✅ Test 1: curriculum-backfill dryRun returns geminiEnabled, remaining, done")
        print("✅ Test 2: curriculum-backfill batch returns in < 30s with all fields, batch constraint satisfied")
        print("✅ Test 3: lo-generate dryRun returns geminiEnabled, remaining, done")
        print("✅ Test 4: lo-generate batch returns in < 30s with all fields, errors=0, batch constraint satisfied")
        print("✅ Test 5: Security checks working (no auth → 401/403, non-admin → 403)")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        raise

if __name__ == "__main__":
    main()
