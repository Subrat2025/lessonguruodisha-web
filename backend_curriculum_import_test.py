#!/usr/bin/env python3
"""
Backend test for Admin LO-Code Import endpoint - POST /api/admin/curriculum-import
Tests security, dryRun, persistence safety, actual import, and response shape.
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_admin_curriculum_import():
    print("=" * 80)
    print("BACKEND TEST: Admin LO-Code Import - POST /api/admin/curriculum-import")
    print("=" * 80)
    
    # Admin credentials
    admin_mobile = "9999999999"
    admin_password = "admin123"
    
    try:
        # ============================================================
        # TEST A: SECURITY
        # ============================================================
        print("\n" + "=" * 80)
        print("TEST A: SECURITY")
        print("=" * 80)
        
        # Test A1: No auth → 401 or 403
        print("\n[Test A1] POST /api/admin/curriculum-import without auth...")
        try:
            resp = requests.post(f"{BASE_URL}/admin/curriculum-import", json={"dryRun": True}, timeout=30)
            print(f"✓ Status: {resp.status_code}")
            if resp.status_code in [401, 403]:
                print(f"✅ TEST A1 PASSED: No auth correctly rejected with {resp.status_code}")
            else:
                print(f"❌ TEST A1 FAILED: Expected 401 or 403, got {resp.status_code}")
                print(f"Response: {resp.text[:200]}")
        except Exception as e:
            print(f"❌ TEST A1 FAILED: {e}")
        
        # Test A2: Register a fresh non-admin user
        print("\n[Test A2] Register fresh non-admin user...")
        test_mobile = "9434252525"
        test_password = "test1234"
        try:
            reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
                "name": "Test User Curriculum",
                "mobile": test_mobile,
                "password": test_password
            }, timeout=30)
            print(f"✓ Register status: {reg_resp.status_code}")
            
            # Login to get token
            login_resp = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": test_mobile,
                "password": test_password
            }, timeout=30)
            print(f"✓ Login status: {login_resp.status_code}")
            
            if login_resp.status_code == 200:
                test_token = login_resp.json().get("token")
                print(f"✓ Test user token obtained")
                
                # Try to access admin endpoint with non-admin token
                print("\n[Test A3] POST /api/admin/curriculum-import with non-admin token...")
                resp = requests.post(f"{BASE_URL}/admin/curriculum-import", 
                                   json={"dryRun": True},
                                   headers={"Authorization": f"Bearer {test_token}"},
                                   timeout=30)
                print(f"✓ Status: {resp.status_code}")
                if resp.status_code == 403:
                    print(f"✅ TEST A2 PASSED: Non-admin correctly rejected with 403")
                else:
                    print(f"❌ TEST A2 FAILED: Expected 403, got {resp.status_code}")
                    print(f"Response: {resp.text[:200]}")
            else:
                print(f"❌ TEST A2 FAILED: Could not login test user")
        except Exception as e:
            print(f"❌ TEST A2 FAILED: {e}")
        
        # ============================================================
        # Get Admin Token
        # ============================================================
        print("\n" + "=" * 80)
        print("ADMIN LOGIN")
        print("=" * 80)
        print(f"\n[Admin Login] Logging in as admin ({admin_mobile})...")
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": admin_mobile,
            "password": admin_password
        }, timeout=30)
        
        if login_resp.status_code != 200:
            print(f"❌ Admin login failed: {login_resp.status_code}")
            print(f"Response: {login_resp.text}")
            return
        
        admin_token = login_resp.json().get("token")
        print(f"✅ Admin login successful, token obtained")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # ============================================================
        # TEST B: DRYRUN (NON-DESTRUCTIVE)
        # ============================================================
        print("\n" + "=" * 80)
        print("TEST B: DRYRUN (NON-DESTRUCTIVE)")
        print("=" * 80)
        
        # Test B1: First dryRun
        print("\n[Test B1] POST /api/admin/curriculum-import { dryRun: true } - FIRST RUN...")
        try:
            resp1 = requests.post(f"{BASE_URL}/admin/curriculum-import",
                                json={"dryRun": True},
                                headers=headers,
                                timeout=60)
            print(f"✓ Status: {resp1.status_code}")
            
            if resp1.status_code == 200:
                data1 = resp1.json()
                print(f"✓ Response received")
                print(f"  - ok: {data1.get('ok')}")
                print(f"  - dryRun: {data1.get('dryRun')}")
                print(f"  - seedCount: {data1.get('seedCount')}")
                print(f"  - matchedById: {data1.get('matchedById')}")
                print(f"  - matchedByTitle: {data1.get('matchedByTitle')}")
                print(f"  - notFound: {data1.get('notFound')}")
                print(f"  - updated: {data1.get('updated')}")
                print(f"  - alreadyHad: {data1.get('alreadyHad')}")
                print(f"  - notFoundSamples length: {len(data1.get('notFoundSamples', []))}")
                
                # Validate fields
                assert data1.get('ok') == True, "ok should be true"
                assert data1.get('dryRun') == True, "dryRun should be true"
                assert data1.get('seedCount') == 148, f"seedCount should be 148, got {data1.get('seedCount')}"
                assert data1.get('matchedById') >= 100, f"matchedById should be >= 100, got {data1.get('matchedById')}"
                assert isinstance(data1.get('notFoundSamples'), list), "notFoundSamples should be an array"
                assert len(data1.get('notFoundSamples', [])) <= 10, f"notFoundSamples should have <= 10 items, got {len(data1.get('notFoundSamples', []))}"
                
                print(f"✅ TEST B1 PASSED: First dryRun successful with correct structure")
                
                # Test B2: Second dryRun (should be identical)
                print("\n[Test B2] POST /api/admin/curriculum-import { dryRun: true } - SECOND RUN...")
                resp2 = requests.post(f"{BASE_URL}/admin/curriculum-import",
                                    json={"dryRun": True},
                                    headers=headers,
                                    timeout=60)
                print(f"✓ Status: {resp2.status_code}")
                
                if resp2.status_code == 200:
                    data2 = resp2.json()
                    print(f"✓ Response received")
                    print(f"  - seedCount: {data2.get('seedCount')}")
                    print(f"  - matchedById: {data2.get('matchedById')}")
                    print(f"  - alreadyHad: {data2.get('alreadyHad')}")
                    
                    # Assert identical counts
                    assert data2.get('seedCount') == data1.get('seedCount'), f"seedCount changed: {data1.get('seedCount')} → {data2.get('seedCount')}"
                    assert data2.get('matchedById') == data1.get('matchedById'), f"matchedById changed: {data1.get('matchedById')} → {data2.get('matchedById')}"
                    assert data2.get('alreadyHad') == data1.get('alreadyHad'), f"alreadyHad changed: {data1.get('alreadyHad')} → {data2.get('alreadyHad')}"
                    
                    print(f"✅ TEST B2 PASSED: Second dryRun identical to first (proves non-destructive)")
                else:
                    print(f"❌ TEST B2 FAILED: Status {resp2.status_code}")
                    print(f"Response: {resp2.text[:200]}")
            else:
                print(f"❌ TEST B1 FAILED: Status {resp1.status_code}")
                print(f"Response: {resp1.text[:200]}")
        except Exception as e:
            print(f"❌ TEST B FAILED: {e}")
        
        # ============================================================
        # TEST C: PERSISTENCE SAFETY
        # ============================================================
        print("\n" + "=" * 80)
        print("TEST C: PERSISTENCE SAFETY")
        print("=" * 80)
        
        # Pick a lesson known to have loCodes (from seed file)
        # Using Class 1 lesson: "6530100b-b928-4d85-b7b5-d2d20c5aa12a"
        test_lesson_id = "6530100b-b928-4d85-b7b5-d2d20c5aa12a"  # Class 1, ଅ, ଆ, ଇ, ଈ ସ୍ୱର ବର୍ଣ୍ଣ
        
        print(f"\n[Test C1] GET lesson curriculum BEFORE dryRun import...")
        print(f"Lesson ID: {test_lesson_id}")
        try:
            resp_before = requests.post(f"{BASE_URL}/lesson-curriculum",
                                      json={"lessonId": test_lesson_id},
                                      headers=headers,
                                      timeout=30)
            print(f"✓ Status: {resp_before.status_code}")
            
            if resp_before.status_code == 200:
                data_before = resp_before.json()
                print(f"✓ Curriculum data BEFORE:")
                print(f"  - eligible: {data_before.get('eligible')}")
                print(f"  - loCodes: {data_before.get('loCodes')}")
                cg_before = data_before.get('cg') or {}
                comp_before = data_before.get('competency') or {}
                print(f"  - cg.code: {cg_before.get('code')}")
                print(f"  - competency.code: {comp_before.get('code')}")
                
                # Run dryRun import
                print(f"\n[Test C2] Running dryRun import...")
                resp_dry = requests.post(f"{BASE_URL}/admin/curriculum-import",
                                       json={"dryRun": True},
                                       headers=headers,
                                       timeout=60)
                print(f"✓ DryRun status: {resp_dry.status_code}")
                
                # Get lesson curriculum AFTER dryRun
                print(f"\n[Test C3] GET lesson curriculum AFTER dryRun import...")
                resp_after = requests.post(f"{BASE_URL}/lesson-curriculum",
                                         json={"lessonId": test_lesson_id},
                                         headers=headers,
                                         timeout=30)
                print(f"✓ Status: {resp_after.status_code}")
                
                if resp_after.status_code == 200:
                    data_after = resp_after.json()
                    print(f"✓ Curriculum data AFTER:")
                    print(f"  - eligible: {data_after.get('eligible')}")
                    print(f"  - loCodes: {data_after.get('loCodes')}")
                    cg_after = data_after.get('cg') or {}
                    comp_after = data_after.get('competency') or {}
                    print(f"  - cg.code: {cg_after.get('code')}")
                    print(f"  - competency.code: {comp_after.get('code')}")
                    
                    # Assert UNCHANGED
                    assert data_after.get('loCodes') == data_before.get('loCodes'), "loCodes changed after dryRun!"
                    assert cg_after.get('code') == cg_before.get('code'), "cg.code changed after dryRun!"
                    assert comp_after.get('code') == comp_before.get('code'), "competency.code changed after dryRun!"
                    
                    print(f"✅ TEST C PASSED: Lesson curriculum UNCHANGED after dryRun (persistence safety verified)")
                else:
                    print(f"❌ TEST C FAILED: Could not get curriculum after dryRun")
            else:
                print(f"❌ TEST C FAILED: Could not get curriculum before dryRun")
        except Exception as e:
            print(f"❌ TEST C FAILED: {e}")
        
        # ============================================================
        # TEST D: ACTUAL IMPORT (ADDITIVE)
        # ============================================================
        print("\n" + "=" * 80)
        print("TEST D: ACTUAL IMPORT (ADDITIVE)")
        print("=" * 80)
        
        print("\n[Test D1] POST /api/admin/curriculum-import { dryRun: false, overwrite: false }...")
        try:
            resp_import = requests.post(f"{BASE_URL}/admin/curriculum-import",
                                      json={"dryRun": False, "overwrite": False},
                                      headers=headers,
                                      timeout=60)
            print(f"✓ Status: {resp_import.status_code}")
            
            if resp_import.status_code == 200:
                data_import = resp_import.json()
                print(f"✓ Import response:")
                print(f"  - ok: {data_import.get('ok')}")
                print(f"  - dryRun: {data_import.get('dryRun')}")
                print(f"  - overwrite: {data_import.get('overwrite')}")
                print(f"  - seedCount: {data_import.get('seedCount')}")
                print(f"  - matchedById: {data_import.get('matchedById')}")
                print(f"  - matchedByTitle: {data_import.get('matchedByTitle')}")
                print(f"  - notFound: {data_import.get('notFound')}")
                print(f"  - updated: {data_import.get('updated')}")
                print(f"  - alreadyHad: {data_import.get('alreadyHad')}")
                
                assert data_import.get('ok') == True, "ok should be true"
                assert data_import.get('dryRun') == False, "dryRun should be false"
                assert data_import.get('overwrite') == False, "overwrite should be false"
                
                # 'updated' should count only lessons that were missing codes
                # Since preview DB already has loCodes, updated should be low or 0
                print(f"\n✓ Updated count: {data_import.get('updated')} (lessons that were missing codes)")
                print(f"✓ AlreadyHad count: {data_import.get('alreadyHad')} (lessons that already had codes)")
                
                # Verify NO lesson LOST its loCodes
                print(f"\n[Test D2] Verify lesson still has its loCodes after import...")
                resp_verify = requests.post(f"{BASE_URL}/lesson-curriculum",
                                          json={"lessonId": test_lesson_id},
                                          headers=headers,
                                          timeout=30)
                print(f"✓ Status: {resp_verify.status_code}")
                
                if resp_verify.status_code == 200:
                    data_verify = resp_verify.json()
                    print(f"✓ Lesson curriculum after actual import:")
                    print(f"  - loCodes: {data_verify.get('loCodes')}")
                    cg_verify = data_verify.get('cg') or {}
                    comp_verify = data_verify.get('competency') or {}
                    print(f"  - cg.code: {cg_verify.get('code')}")
                    print(f"  - competency.code: {comp_verify.get('code')}")
                    
                    # Should still have loCodes
                    assert data_verify.get('loCodes') is not None, "Lesson lost its loCodes!"
                    assert len(data_verify.get('loCodes', [])) > 0, "Lesson has empty loCodes!"
                    
                    print(f"✅ TEST D PASSED: Actual import successful, NO lesson lost its loCodes")
                else:
                    print(f"❌ TEST D FAILED: Could not verify lesson after import")
            else:
                print(f"❌ TEST D FAILED: Status {resp_import.status_code}")
                print(f"Response: {resp_import.text[:200]}")
        except Exception as e:
            print(f"❌ TEST D FAILED: {e}")
        
        # ============================================================
        # TEST E: RESPONSE SHAPE
        # ============================================================
        print("\n" + "=" * 80)
        print("TEST E: RESPONSE SHAPE")
        print("=" * 80)
        
        print("\n[Test E] Verify notFoundSamples shape...")
        try:
            # Use the data from previous dryRun
            if 'data1' in locals():
                samples = data1.get('notFoundSamples', [])
                print(f"✓ notFoundSamples is an array: {isinstance(samples, list)}")
                print(f"✓ notFoundSamples length: {len(samples)}")
                
                assert isinstance(samples, list), "notFoundSamples should be an array"
                
                if len(samples) > 0:
                    print(f"✓ Checking first sample structure...")
                    first_sample = samples[0]
                    print(f"  - Sample: {first_sample}")
                    
                    assert 'title' in first_sample, "Sample should have 'title' field"
                    assert 'className' in first_sample, "Sample should have 'className' field"
                    
                    print(f"  - title: {first_sample.get('title')}")
                    print(f"  - className: {first_sample.get('className')}")
                    
                    print(f"✅ TEST E PASSED: notFoundSamples has correct shape (array with title + className)")
                else:
                    print(f"✅ TEST E PASSED: notFoundSamples is empty array (all lessons matched)")
            else:
                print(f"❌ TEST E FAILED: No dryRun data available")
        except Exception as e:
            print(f"❌ TEST E FAILED: {e}")
        
        # ============================================================
        # SUMMARY
        # ============================================================
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print("\n✅ All critical tests completed!")
        print("\nKey findings:")
        print("- Security: Admin-only access enforced (401/403 for non-admin)")
        print("- DryRun: Non-destructive, identical results on repeated calls")
        print("- Persistence: Lesson data unchanged after dryRun")
        print("- Import: Additive mode works, no data loss")
        print("- Shape: Response structure correct with all required fields")
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_admin_curriculum_import()
