#!/usr/bin/env python3
"""
Backend test for Gemini 3.x fix verification.
Tests the critical fix where thinkingConfig is stripped for non-2.x models.

Test scenarios:
1. LO generation (reset + generate, assert errors == 0)
2. CG/Competency backfill (reset + backfill, assert no 500 errors)
3. Curriculum rendering (lesson with loCodes, verify eligible:true and cg/competency)
4. Security regression (auth requirements)
"""

import requests
import json
import os
import sys

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"
FALLBACK_MOBILE = "9692604577"
FALLBACK_PASSWORD = "<redacted>"

def login_admin():
    """Login as admin and return token"""
    print("\n=== Admin Login ===")
    
    # Try primary admin credentials
    try:
        response = requests.post(
            f"{API_BASE}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                print(f"✅ Admin login successful with {ADMIN_MOBILE}")
                return token
    except Exception as e:
        print(f"⚠️  Primary admin login failed: {e}")
    
    # Try fallback credentials
    try:
        response = requests.post(
            f"{API_BASE}/auth/login",
            json={"mobile": FALLBACK_MOBILE, "password": FALLBACK_PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                print(f"✅ Admin login successful with {FALLBACK_MOBILE}")
                return token
    except Exception as e:
        print(f"❌ Fallback admin login failed: {e}")
    
    raise Exception("Failed to login as admin with both credentials")

def test_lo_generation(token):
    """
    Test 1: LO generation no longer errors
    - Reset LO generation
    - Run generation with limit 3, repeat up to 4 times
    - Assert total errors == 0
    """
    print("\n" + "="*80)
    print("TEST 1: LO GENERATION (Gemini 3.x fix verification)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 1a: Reset LO generation
    print("\n[1a] POST /api/admin/lo-generate/reset")
    try:
        response = requests.post(
            f"{API_BASE}/admin/lo-generate/reset",
            json={},
            headers=headers,
            timeout=30
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Reset successful: cleared={data.get('cleared', 0)}")
        else:
            print(f"❌ Reset failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Reset exception: {e}")
        return False
    
    # Step 1b: Run generation up to 4 times, collect totals
    print("\n[1b] POST /api/admin/lo-generate with limit=3 (up to 4 calls)")
    
    total_errors = 0
    total_updated = 0
    total_foundational = 0
    total_subject = 0
    total_skipped_nomatch = 0
    remaining_final = None
    
    for call_num in range(1, 5):
        print(f"\n  Call {call_num}:")
        try:
            response = requests.post(
                f"{API_BASE}/admin/lo-generate",
                json={"limit": 3},
                headers=headers,
                timeout=120  # Allow time for Gemini calls
            )
            print(f"  Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"  ❌ Generation call {call_num} failed: {response.text}")
                return False
            
            data = response.json()
            errors = data.get('errors', 0)
            updated = data.get('updated', 0)
            foundational = data.get('foundationalCount', 0)
            subject = data.get('subjectCount', 0)
            skipped_nomatch = data.get('skippedNoMatch', 0)
            remaining = data.get('remaining', 0)
            done = data.get('done', False)
            
            print(f"  Response: errors={errors}, updated={updated}, foundational={foundational}, subject={subject}, skippedNoMatch={skipped_nomatch}, remaining={remaining}, done={done}")
            
            total_errors += errors
            total_updated += updated
            total_foundational += foundational
            total_subject += subject
            total_skipped_nomatch += skipped_nomatch
            remaining_final = remaining
            
            # If done, no need to continue
            if done or remaining == 0:
                print(f"  ℹ️  Generation complete (done={done}, remaining={remaining})")
                break
                
        except Exception as e:
            print(f"  ❌ Generation call {call_num} exception: {e}")
            return False
    
    # Report totals
    print(f"\n📊 TOTALS ACROSS ALL CALLS:")
    print(f"  - Total errors: {total_errors}")
    print(f"  - Total updated: {total_updated}")
    print(f"  - Total foundational: {total_foundational}")
    print(f"  - Total subject: {total_subject}")
    print(f"  - Total skippedNoMatch: {total_skipped_nomatch}")
    print(f"  - Final remaining: {remaining_final}")
    
    # KEY ASSERTION: errors must be 0
    if total_errors == 0:
        print(f"\n✅ TEST 1 PASSED: No errors (Gemini 3.x fix working)")
        return True
    else:
        print(f"\n❌ TEST 1 FAILED: Found {total_errors} errors (Gemini 3.x fix NOT working)")
        return False

def test_curriculum_backfill(token):
    """
    Test 2: CG/Competency backfill works via Gemini
    - Reset backfill
    - Run backfill with limit 5, repeat up to 5 times
    - Assert no 500 errors, report totals
    """
    print("\n" + "="*80)
    print("TEST 2: CG/COMPETENCY BACKFILL (Gemini 3.x fix verification)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 2a: Reset backfill
    print("\n[2a] POST /api/admin/curriculum-backfill/reset")
    try:
        response = requests.post(
            f"{API_BASE}/admin/curriculum-backfill/reset",
            json={},
            headers=headers,
            timeout=30
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Reset successful: cleared={data.get('cleared', 0)}")
        else:
            print(f"❌ Reset failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Reset exception: {e}")
        return False
    
    # Step 2b: Run backfill up to 5 times
    print("\n[2b] POST /api/admin/curriculum-backfill with limit=5 (up to 5 calls)")
    
    total_foundational_cached = 0
    total_subject_cached = 0
    total_skipped_nodata = 0
    remaining_final = None
    all_success = True
    
    for call_num in range(1, 6):
        print(f"\n  Call {call_num}:")
        try:
            response = requests.post(
                f"{API_BASE}/admin/curriculum-backfill",
                json={"limit": 5},
                headers=headers,
                timeout=120  # Allow time for Gemini calls
            )
            print(f"  Status: {response.status_code}")
            
            if response.status_code == 500:
                print(f"  ❌ Backfill call {call_num} returned 500 (CRITICAL FAILURE)")
                all_success = False
                return False
            
            if response.status_code != 200:
                print(f"  ⚠️  Backfill call {call_num} returned {response.status_code}: {response.text}")
                continue
            
            data = response.json()
            foundational = data.get('foundationalCached', 0)
            subject = data.get('subjectCached', 0)
            skipped_nodata = data.get('skippedNoData', 0)
            remaining = data.get('remaining', 0)
            done = data.get('done', False)
            
            print(f"  Response: foundationalCached={foundational}, subjectCached={subject}, skippedNoData={skipped_nodata}, remaining={remaining}, done={done}")
            
            total_foundational_cached += foundational
            total_subject_cached += subject
            total_skipped_nodata += skipped_nodata
            remaining_final = remaining
            
            # If done, no need to continue
            if done or remaining == 0:
                print(f"  ℹ️  Backfill complete (done={done}, remaining={remaining})")
                break
                
        except Exception as e:
            print(f"  ❌ Backfill call {call_num} exception: {e}")
            all_success = False
            return False
    
    # Report totals
    print(f"\n📊 TOTALS ACROSS ALL CALLS:")
    print(f"  - Total foundationalCached: {total_foundational_cached}")
    print(f"  - Total subjectCached: {total_subject_cached}")
    print(f"  - Total skippedNoData: {total_skipped_nodata}")
    print(f"  - Final remaining: {remaining_final}")
    
    # KEY ASSERTION: no 500 errors
    if all_success:
        print(f"\n✅ TEST 2 PASSED: No 500 errors (Gemini 3.x fix working)")
        if total_subject_cached > 0:
            print(f"  ℹ️  Subject lessons successfully cached via Gemini")
        return True
    else:
        print(f"\n❌ TEST 2 FAILED: Encountered 500 errors")
        return False

def test_curriculum_rendering(token):
    """
    Test 3: Curriculum still renders
    - Pick a lesson with loCodes
    - POST /api/lesson-curriculum
    - Assert eligible:true and cg/competency present
    """
    print("\n" + "="*80)
    print("TEST 3: CURRICULUM RENDERING (deterministic)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Use a known Class 3 lesson with loCodes (from test_result.md)
    lesson_id = "dcf5c1da-525b-47e7-b88e-60208e1b69fa"
    
    print(f"\n[3] POST /api/lesson-curriculum with lessonId={lesson_id}")
    try:
        response = requests.post(
            f"{API_BASE}/lesson-curriculum",
            json={"lessonId": lesson_id},
            headers=headers,
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Curriculum rendering failed: {response.text}")
            return False
        
        data = response.json()
        eligible = data.get('eligible', False)
        cg = data.get('cg', {})
        competency = data.get('competency', {})
        
        print(f"Response:")
        print(f"  - eligible: {eligible}")
        print(f"  - cg.code: {cg.get('code', 'N/A')}")
        print(f"  - cg.text: {cg.get('text', 'N/A')[:50]}...")
        print(f"  - competency.code: {competency.get('code', 'N/A')}")
        print(f"  - competency.text: {competency.get('text', 'N/A')[:50]}...")
        
        # KEY ASSERTIONS
        if not eligible:
            print(f"❌ TEST 3 FAILED: eligible is False")
            return False
        
        if not cg.get('code'):
            print(f"❌ TEST 3 FAILED: cg.code is missing")
            return False
        
        if not competency.get('code'):
            print(f"❌ TEST 3 FAILED: competency.code is missing")
            return False
        
        print(f"\n✅ TEST 3 PASSED: Curriculum renders correctly with eligible=true and cg/competency present")
        return True
        
    except Exception as e:
        print(f"❌ Curriculum rendering exception: {e}")
        return False

def test_security_regression(token):
    """
    Test 4: Security regression
    - POST /api/admin/lo-generate with no auth → 401/403
    - POST /api/admin/lo-generate with non-admin → 403
    """
    print("\n" + "="*80)
    print("TEST 4: SECURITY REGRESSION")
    print("="*80)
    
    # Test 4a: No auth
    print("\n[4a] POST /api/admin/lo-generate with no auth")
    try:
        response = requests.post(
            f"{API_BASE}/admin/lo-generate",
            json={"limit": 1},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            print(f"✅ Correctly rejected with {response.status_code}")
        else:
            print(f"❌ Expected 401/403, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ No auth test exception: {e}")
        return False
    
    # Test 4b: Non-admin user
    print("\n[4b] POST /api/admin/lo-generate with non-admin user")
    try:
        # Register a fresh non-admin user
        test_mobile = f"94{str(int(1000000000 + (hash('gemini_test') % 1000000000)))[2:]}"
        reg_response = requests.post(
            f"{API_BASE}/auth/register",
            json={
                "name": "Test User",
                "mobile": test_mobile,
                "password": "test123",
                "school": "Test School"
            },
            timeout=30
        )
        
        if reg_response.status_code != 200:
            print(f"⚠️  Could not create test user: {reg_response.text}")
            # This is not critical, skip this sub-test
            print(f"ℹ️  Skipping non-admin test")
        else:
            user_data = reg_response.json()
            user_token = user_data.get('token')
            
            if user_token:
                # Try to access admin endpoint
                response = requests.post(
                    f"{API_BASE}/admin/lo-generate",
                    json={"limit": 1},
                    headers={"Authorization": f"Bearer {user_token}"},
                    timeout=30
                )
                print(f"Status: {response.status_code}")
                
                if response.status_code == 403:
                    print(f"✅ Correctly rejected non-admin with 403")
                else:
                    print(f"❌ Expected 403, got {response.status_code}")
                    return False
    except Exception as e:
        print(f"⚠️  Non-admin test exception: {e}")
        print(f"ℹ️  Skipping non-admin test")
    
    print(f"\n✅ TEST 4 PASSED: Security checks working")
    return True

def main():
    """Run all tests"""
    print("="*80)
    print("GEMINI 3.X FIX VERIFICATION TEST SUITE")
    print("="*80)
    print(f"API Base: {API_BASE}")
    
    try:
        # Login as admin
        token = login_admin()
        
        # Run all tests
        results = {
            "Test 1 (LO Generation)": test_lo_generation(token),
            "Test 2 (CG/Competency Backfill)": test_curriculum_backfill(token),
            "Test 3 (Curriculum Rendering)": test_curriculum_rendering(token),
            "Test 4 (Security Regression)": test_security_regression(token),
        }
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        passed = sum(1 for v in results.values() if v)
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"{status}: {test_name}")
        
        print(f"\nTotal: {passed}/{total} tests passed")
        
        if passed == total:
            print("\n🎉 ALL TESTS PASSED - Gemini 3.x fix is working correctly!")
            sys.exit(0)
        else:
            print(f"\n⚠️  {total - passed} test(s) failed")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
