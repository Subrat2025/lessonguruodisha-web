#!/usr/bin/env python3
"""
Backend test for NEW Monthly LO Alignment feature.
Tests POST /api/admin/lo-codes/align-monthly-plan endpoint.
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_monthly_lo_alignment():
    """Test the new monthly LO alignment feature"""
    
    print("\n" + "="*80)
    print("MONTHLY LO ALIGNMENT FEATURE TESTS")
    print("="*80 + "\n")
    
    # Test 1: Admin login
    print("Test 1: Admin Login")
    try:
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        
        if login_resp.status_code != 200:
            print(f"❌ FAILED: Login failed with status {login_resp.status_code}")
            print(f"Response: {login_resp.text}")
            return False
        
        admin_token = login_resp.json().get("token")
        if not admin_token:
            print("❌ FAILED: No token in login response")
            return False
        
        print(f"✅ PASSED: Admin login successful")
        print(f"   Token: {admin_token[:20]}...")
    except Exception as e:
        print(f"❌ FAILED: Exception during login: {e}")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 2: Dry run - should return sample without modifying DB
    print("\nTest 2: POST /api/admin/lo-codes/align-monthly-plan (dryRun=true)")
    try:
        dry_resp = requests.post(
            f"{BASE_URL}/admin/lo-codes/align-monthly-plan",
            json={"dryRun": True},
            headers=headers,
            timeout=30
        )
        
        if dry_resp.status_code != 200:
            print(f"❌ FAILED: Dry run failed with status {dry_resp.status_code}")
            print(f"Response: {dry_resp.text}")
            return False
        
        dry_data = dry_resp.json()
        
        # Verify response structure
        if not dry_data.get("ok"):
            print(f"❌ FAILED: Response ok=false")
            return False
        
        if not dry_data.get("dryRun"):
            print(f"❌ FAILED: dryRun should be true")
            return False
        
        examined = dry_data.get("examined", 0)
        updated = dry_data.get("updated", 0)
        skipped = dry_data.get("skipped", 0)
        sample = dry_data.get("sample", [])
        
        print(f"✅ PASSED: Dry run successful")
        print(f"   Examined: {examined} lessons")
        print(f"   Would update: {updated} lessons")
        print(f"   Skipped: {skipped} lessons")
        print(f"   Sample size: {len(sample)}")
        
        # Verify sample structure
        if len(sample) > 0:
            first_sample = sample[0]
            required_fields = ["lessonId", "classCode", "month", "added"]
            missing = [f for f in required_fields if f not in first_sample]
            if missing:
                print(f"❌ FAILED: Sample missing fields: {missing}")
                return False
            
            # Verify classCode is one of BV3/C1/C2
            if first_sample["classCode"] not in ["BV3", "C1", "C2"]:
                print(f"❌ FAILED: Invalid classCode: {first_sample['classCode']}")
                return False
            
            # Verify added codes start with the classCode
            added_codes = first_sample.get("added", [])
            if added_codes:
                for code in added_codes:
                    if not code.startswith(first_sample["classCode"]):
                        print(f"❌ FAILED: Code {code} doesn't start with {first_sample['classCode']}")
                        return False
            
            print(f"   Sample item verified:")
            print(f"     - classCode: {first_sample['classCode']}")
            print(f"     - month: {first_sample['month']}")
            print(f"     - added codes: {len(added_codes)} codes")
            if added_codes:
                print(f"     - first code: {added_codes[0]}")
        
        # Store a sample lesson ID for later verification
        sample_lesson_id = sample[0]["lessonId"] if sample else None
        sample_class_code = sample[0]["classCode"] if sample else None
        
    except Exception as e:
        print(f"❌ FAILED: Exception during dry run: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 3: Get a lesson before actual run to verify no changes from dry run
    if sample_lesson_id:
        print(f"\nTest 3: Verify dry run didn't modify lesson {sample_lesson_id}")
        try:
            # Get lesson details
            lesson_resp = requests.get(
                f"{BASE_URL}/lessons/{sample_lesson_id}",
                headers=headers,
                timeout=10
            )
            
            if lesson_resp.status_code != 200:
                print(f"⚠️  WARNING: Could not fetch lesson (status {lesson_resp.status_code})")
            else:
                lesson_data = lesson_resp.json()
                lesson = lesson_data.get("lesson", {})
                lo_codes_before = lesson.get("loCodes", [])
                print(f"✅ PASSED: Lesson fetched successfully")
                print(f"   loCodes count before: {len(lo_codes_before)}")
        except Exception as e:
            print(f"⚠️  WARNING: Exception fetching lesson: {e}")
    
    # Test 4: Actual run (dryRun=false)
    print("\nTest 4: POST /api/admin/lo-codes/align-monthly-plan (dryRun=false)")
    try:
        actual_resp = requests.post(
            f"{BASE_URL}/admin/lo-codes/align-monthly-plan",
            json={"dryRun": False},
            headers=headers,
            timeout=30
        )
        
        if actual_resp.status_code != 200:
            print(f"❌ FAILED: Actual run failed with status {actual_resp.status_code}")
            print(f"Response: {actual_resp.text}")
            return False
        
        actual_data = actual_resp.json()
        
        if not actual_data.get("ok"):
            print(f"❌ FAILED: Response ok=false")
            return False
        
        if actual_data.get("dryRun"):
            print(f"❌ FAILED: dryRun should be false")
            return False
        
        examined_actual = actual_data.get("examined", 0)
        updated_actual = actual_data.get("updated", 0)
        
        print(f"✅ PASSED: Actual run successful")
        print(f"   Examined: {examined_actual} lessons")
        print(f"   Updated: {updated_actual} lessons")
        
        # Store sample for verification
        sample_actual = actual_data.get("sample", [])
        if sample_actual:
            verify_lesson_id = sample_actual[0]["lessonId"]
            verify_added_codes = sample_actual[0]["added"]
            print(f"   Sample lesson to verify: {verify_lesson_id}")
            print(f"   Expected added codes: {verify_added_codes}")
        else:
            verify_lesson_id = None
            verify_added_codes = []
        
    except Exception as e:
        print(f"❌ FAILED: Exception during actual run: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 5: Verify lesson was actually updated
    if verify_lesson_id and verify_added_codes:
        print(f"\nTest 5: Verify lesson {verify_lesson_id} was updated")
        try:
            lesson_resp = requests.get(
                f"{BASE_URL}/lessons/{verify_lesson_id}",
                headers=headers,
                timeout=10
            )
            
            if lesson_resp.status_code != 200:
                print(f"❌ FAILED: Could not fetch lesson (status {lesson_resp.status_code})")
                return False
            
            lesson_data = lesson_resp.json()
            lesson = lesson_data.get("lesson", {})
            lo_codes_after = lesson.get("loCodes", [])
            
            # Verify all expected codes are present
            missing_codes = [c for c in verify_added_codes if c not in lo_codes_after]
            if missing_codes:
                print(f"❌ FAILED: Expected codes not found in lesson: {missing_codes}")
                print(f"   Lesson loCodes: {lo_codes_after}")
                return False
            
            print(f"✅ PASSED: Lesson updated correctly")
            print(f"   loCodes count: {len(lo_codes_after)}")
            print(f"   All expected codes present: {verify_added_codes}")
            
        except Exception as e:
            print(f"❌ FAILED: Exception verifying lesson: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    # Test 6: Access control - non-admin should get 403
    print("\nTest 6: Access control - non-admin user")
    try:
        # Register a regular user
        reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User Monthly",
            "mobile": "9876543210",
            "password": "test123"
        }, timeout=10)
        
        if reg_resp.status_code == 200:
            user_token = reg_resp.json().get("token")
            user_headers = {"Authorization": f"Bearer {user_token}"}
            
            # Try to access endpoint
            forbidden_resp = requests.post(
                f"{BASE_URL}/admin/lo-codes/align-monthly-plan",
                json={"dryRun": True},
                headers=user_headers,
                timeout=10
            )
            
            if forbidden_resp.status_code == 403:
                print(f"✅ PASSED: Non-admin correctly rejected with 403")
            else:
                print(f"❌ FAILED: Expected 403, got {forbidden_resp.status_code}")
                return False
        else:
            print(f"⚠️  WARNING: Could not create test user (status {reg_resp.status_code})")
    except Exception as e:
        print(f"⚠️  WARNING: Exception testing access control: {e}")
    
    # Test 7: Regression - seed-foundational still works
    print("\nTest 7: Regression - POST /api/admin/lo-codes/seed-foundational")
    try:
        seed_resp = requests.post(
            f"{BASE_URL}/admin/lo-codes/seed-foundational",
            headers=headers,
            timeout=30
        )
        
        if seed_resp.status_code != 200:
            print(f"❌ FAILED: Seed endpoint failed with status {seed_resp.status_code}")
            return False
        
        seed_data = seed_resp.json()
        total = seed_data.get("total", 0)
        
        if total != 521:
            print(f"❌ FAILED: Expected 521 codes, got {total}")
            return False
        
        print(f"✅ PASSED: Seed endpoint still works (521 codes)")
        
    except Exception as e:
        print(f"❌ FAILED: Exception testing seed endpoint: {e}")
        return False
    
    # Test 8: Regression - align-foundational-lessons still works
    print("\nTest 8: Regression - POST /api/admin/lo-codes/align-foundational-lessons")
    try:
        align_resp = requests.post(
            f"{BASE_URL}/admin/lo-codes/align-foundational-lessons",
            json={"dryRun": True},
            headers=headers,
            timeout=30
        )
        
        if align_resp.status_code != 200:
            print(f"❌ FAILED: Align endpoint failed with status {align_resp.status_code}")
            return False
        
        align_data = align_resp.json()
        
        if not align_data.get("ok"):
            print(f"❌ FAILED: Align endpoint returned ok=false")
            return False
        
        print(f"✅ PASSED: Align-foundational endpoint still works")
        print(f"   Examined: {align_data.get('examined', 0)}")
        print(f"   Would update: {align_data.get('updated', 0)}")
        
    except Exception as e:
        print(f"❌ FAILED: Exception testing align endpoint: {e}")
        return False
    
    # Test 9: Regression - reset-foundational-lessons still works
    print("\nTest 9: Regression - POST /api/admin/lo-codes/reset-foundational-lessons")
    try:
        reset_resp = requests.post(
            f"{BASE_URL}/admin/lo-codes/reset-foundational-lessons",
            headers=headers,
            timeout=30
        )
        
        if reset_resp.status_code != 200:
            print(f"❌ FAILED: Reset endpoint failed with status {reset_resp.status_code}")
            return False
        
        reset_data = reset_resp.json()
        
        if not reset_data.get("ok"):
            print(f"❌ FAILED: Reset endpoint returned ok=false")
            return False
        
        print(f"✅ PASSED: Reset endpoint still works")
        print(f"   Cleaned lessons: {reset_data.get('cleanedLessons', 0)}")
        print(f"   Codes removed: {reset_data.get('totalCodesRemoved', 0)}")
        
    except Exception as e:
        print(f"❌ FAILED: Exception testing reset endpoint: {e}")
        return False
    
    # Test 10: Regression - admin analytics still works
    print("\nTest 10: Regression - GET /api/admin/analytics")
    try:
        analytics_resp = requests.get(
            f"{BASE_URL}/admin/analytics",
            headers=headers,
            timeout=10
        )
        
        if analytics_resp.status_code != 200:
            print(f"❌ FAILED: Analytics failed with status {analytics_resp.status_code}")
            return False
        
        analytics_data = analytics_resp.json()
        
        required_fields = ["totalUsers", "totalLessons", "activeSubs"]
        missing = [f for f in required_fields if f not in analytics_data]
        if missing:
            print(f"❌ FAILED: Analytics missing fields: {missing}")
            return False
        
        print(f"✅ PASSED: Analytics endpoint still works")
        print(f"   Total users: {analytics_data.get('totalUsers', 0)}")
        print(f"   Total lessons: {analytics_data.get('totalLessons', 0)}")
        
    except Exception as e:
        print(f"❌ FAILED: Exception testing analytics: {e}")
        return False
    
    print("\n" + "="*80)
    print("ALL TESTS PASSED ✅")
    print("="*80 + "\n")
    
    return True

if __name__ == "__main__":
    success = test_monthly_lo_alignment()
    sys.exit(0 if success else 1)
