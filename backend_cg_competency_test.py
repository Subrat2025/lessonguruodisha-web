#!/usr/bin/env python3
"""
Backend test for Subject CG/Competency mapping in daily-plan and multigrade generators.
Tests that subject lessons (Odia/Math/EVS/etc.) now get Curricular Goal (CG) + Competency codes.
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_cg_competency_mapping():
    """Test CG/Competency codes in daily-plan and multigrade generators."""
    
    print("=" * 80)
    print("BACKEND TEST: Subject CG/Competency Mapping")
    print("=" * 80)
    
    # Step 1: Login as admin
    print("\n[Test 1] Admin Login")
    print("-" * 80)
    try:
        login_response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": "9999999999", "password": "admin123"},
            timeout=30
        )
        print(f"Status: {login_response.status_code}")
        
        if login_response.status_code != 200:
            print(f"❌ FAIL: Login failed with status {login_response.status_code}")
            print(f"Response: {login_response.text}")
            return False
        
        login_data = login_response.json()
        token = login_data.get("token")
        
        if not token:
            print("❌ FAIL: No token in login response")
            return False
        
        print(f"✅ PASS: Admin login successful")
        print(f"Token: {token[:20]}...")
        
    except Exception as e:
        print(f"❌ FAIL: Login exception: {e}")
        return False
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Test 2: CACHED subject lesson (must return codes instantly, no AI dependency)
    print("\n[Test 2] POST /api/daily-plan/generate - CACHED lesson (Class 3 Pallavi)")
    print("-" * 80)
    print("Lesson ID: dcf5c1da-525b-47e7-b88e-60208e1b69fa (Class 3 'Pallavi', pre-cached CG-4/C-4.2)")
    try:
        payload = {
            "date": "2026-08-27",
            "schoolName": "Test School",
            "classType": "single",
            "slots": [
                {"lessonId": "dcf5c1da-525b-47e7-b88e-60208e1b69fa"}
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/daily-plan/generate",
            json=payload,
            headers=headers,
            timeout=120  # Allow up to 120s as per requirement
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        periods = data.get("periods", [])
        
        if not periods or len(periods) < 1:
            print(f"❌ FAIL: No periods in response")
            print(f"Response: {json.dumps(data, indent=2)}")
            return False
        
        period = periods[0]
        
        # ASSERTIONS for cached lesson
        print("\nAsserting cached lesson codes:")
        
        # Check cgCode
        cg_code = period.get("cgCode", "")
        print(f"  cgCode: '{cg_code}'")
        if cg_code != "CG-4":
            print(f"  ❌ FAIL: Expected cgCode='CG-4', got '{cg_code}'")
            return False
        print(f"  ✅ PASS: cgCode === 'CG-4'")
        
        # Check competencyCode
        comp_code = period.get("competencyCode", "")
        print(f"  competencyCode: '{comp_code}'")
        if comp_code != "C-4.2":
            print(f"  ❌ FAIL: Expected competencyCode='C-4.2', got '{comp_code}'")
            return False
        print(f"  ✅ PASS: competencyCode === 'C-4.2'")
        
        # Check curricularGoal is non-empty
        cg_text = period.get("curricularGoal", "")
        print(f"  curricularGoal: '{cg_text[:50]}...' (length: {len(cg_text)})")
        if not cg_text or len(cg_text) == 0:
            print(f"  ❌ FAIL: curricularGoal is empty")
            return False
        print(f"  ✅ PASS: curricularGoal is non-empty")
        
        # Check competencyText is non-empty
        comp_text = period.get("competencyText", "")
        print(f"  competencyText: '{comp_text[:50]}...' (length: {len(comp_text)})")
        if not comp_text or len(comp_text) == 0:
            print(f"  ❌ FAIL: competencyText is empty")
            return False
        print(f"  ✅ PASS: competencyText is non-empty")
        
        print(f"\n✅ PASS: Test 2 - Cached lesson returns correct CG-4 and C-4.2 codes")
        
    except Exception as e:
        print(f"❌ FAIL: Test 2 exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 3: UNCACHED subject lesson (must not crash; codes may or may not populate)
    print("\n[Test 3] POST /api/daily-plan/generate - UNCACHED lesson (Class 5 Math)")
    print("-" * 80)
    print("Lesson ID: 9891e934-a75f-47da-a453-89993436bced (Class 5 Math, uncached)")
    try:
        payload = {
            "date": "2026-08-27",
            "schoolName": "Test School",
            "classType": "single",
            "slots": [
                {"lessonId": "9891e934-a75f-47da-a453-89993436bced"}
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/daily-plan/generate",
            json=payload,
            headers=headers,
            timeout=120  # Allow up to 120s for potential Gemini call
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200 (NOT 500), got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print(f"✅ PASS: Status 200 (NOT 500) - endpoint did not crash")
        
        data = response.json()
        periods = data.get("periods", [])
        
        if not periods or len(periods) < 1:
            print(f"❌ FAIL: No periods in response")
            print(f"Response: {json.dumps(data, indent=2)}")
            return False
        
        print(f"✅ PASS: Response has periods array with >= 1 item")
        
        period = periods[0]
        
        # Check that keys are present (values may be empty if Gemini timed out)
        print("\nChecking presence of CG/Competency keys:")
        
        has_cg_code = "cgCode" in period
        has_comp_code = "competencyCode" in period
        has_cg_text = "curricularGoal" in period
        has_comp_text = "competencyText" in period
        
        print(f"  cgCode present: {has_cg_code}")
        print(f"  competencyCode present: {has_comp_code}")
        print(f"  curricularGoal present: {has_cg_text}")
        print(f"  competencyText present: {has_comp_text}")
        
        if not (has_cg_code and has_comp_code and has_cg_text and has_comp_text):
            print(f"  ❌ FAIL: Not all keys present")
            return False
        
        print(f"  ✅ PASS: All keys present")
        
        # Report actual values (may be empty if Gemini timed out - that's acceptable)
        cg_code = period.get("cgCode", "")
        comp_code = period.get("competencyCode", "")
        cg_text = period.get("curricularGoal", "")
        comp_text = period.get("competencyText", "")
        
        print(f"\nActual values (may be empty if Gemini timed out - acceptable):")
        print(f"  cgCode: '{cg_code}'")
        print(f"  competencyCode: '{comp_code}'")
        print(f"  curricularGoal: '{cg_text[:50]}...' (length: {len(cg_text)})")
        print(f"  competencyText: '{comp_text[:50]}...' (length: {len(comp_text)})")
        
        if cg_code and comp_code:
            print(f"\n✅ BONUS: Gemini successfully populated codes for uncached lesson!")
        else:
            print(f"\nℹ️  INFO: Codes are empty (Gemini may have timed out - this is acceptable)")
        
        print(f"\n✅ PASS: Test 3 - Uncached lesson did not crash, keys present")
        
    except Exception as e:
        print(f"❌ FAIL: Test 3 exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 4: Multigrade with both lessons
    print("\n[Test 4] POST /api/multigrade/generate - Both lessons")
    print("-" * 80)
    print("Lesson IDs: dcf5c1da-525b-47e7-b88e-60208e1b69fa (cached) + 9891e934-a75f-47da-a453-89993436bced (uncached)")
    try:
        payload = {
            "date": "2026-08-27",
            "periodNumber": 3,
            "schoolName": "T",
            "slots": [
                {"lessonId": "dcf5c1da-525b-47e7-b88e-60208e1b69fa"},
                {"lessonId": "9891e934-a75f-47da-a453-89993436bced"}
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/multigrade/generate",
            json=payload,
            headers=headers,
            timeout=120  # Allow up to 120s
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print(f"✅ PASS: Status 200")
        
        data = response.json()
        classes = data.get("classes", [])
        
        if not classes or len(classes) < 2:
            print(f"❌ FAIL: Expected classes array with 2 items, got {len(classes)}")
            print(f"Response: {json.dumps(data, indent=2)}")
            return False
        
        print(f"✅ PASS: Response has classes array with 2 items")
        
        # Find the Class 3 class object (cached lesson with OD codes)
        class3_obj = None
        for cls in classes:
            class_name = cls.get("className", "")
            lo_codes = cls.get("loCodes", [])
            # Class 3 Pallavi has LO codes starting with "OD"
            if "Class 3" in class_name or any(code.startswith("OD") for code in lo_codes):
                class3_obj = cls
                break
        
        if not class3_obj:
            print(f"❌ FAIL: Could not find Class 3 object in classes array")
            print(f"Classes: {json.dumps(classes, indent=2)}")
            return False
        
        print(f"\nFound Class 3 object: {class3_obj.get('className', 'Unknown')}")
        
        # Check Class 3 has CG-4 and non-empty competencyText
        cg_code = class3_obj.get("cgCode", "")
        comp_text = class3_obj.get("competencyText", "")
        
        print(f"  cgCode: '{cg_code}'")
        print(f"  competencyText: '{comp_text[:50]}...' (length: {len(comp_text)})")
        
        if cg_code != "CG-4":
            print(f"  ❌ FAIL: Expected cgCode='CG-4', got '{cg_code}'")
            return False
        print(f"  ✅ PASS: cgCode === 'CG-4'")
        
        if not comp_text or len(comp_text) == 0:
            print(f"  ❌ FAIL: competencyText is empty")
            return False
        print(f"  ✅ PASS: competencyText is non-empty")
        
        # Report cgCode/competencyCode for both class objects
        print(f"\nCG/Competency codes for all classes:")
        for i, cls in enumerate(classes):
            print(f"  Class {i+1}: {cls.get('className', 'Unknown')}")
            print(f"    cgCode: '{cls.get('cgCode', '')}'")
            print(f"    competencyCode: '{cls.get('competencyCode', '')}'")
            print(f"    curricularGoal: '{cls.get('curricularGoal', '')[:50]}...'")
            print(f"    competencyText: '{cls.get('competencyText', '')[:50]}...'")
        
        print(f"\n✅ PASS: Test 4 - Multigrade returns correct codes for Class 3")
        
    except Exception as e:
        print(f"❌ FAIL: Test 4 exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 5: Regression - instant-plan/html with CG/Competency codes
    print("\n[Test 5] POST /api/instant-plan/html - Regression test")
    print("-" * 80)
    print("Testing that instant-plan/html still works with CG-4 and C-4.2 codes")
    try:
        payload = {
            "mode": "instant",
            "plan": {
                "date": "2026-08-27",
                "periods": [
                    {
                        "periodNum": 1,
                        "className": "Class 5",
                        "subject": "EVS",
                        "loCodes": ["OD 501"],
                        "cgCode": "CG-4",
                        "competencyCode": "C-4.2",
                        "panchapadi": {
                            "prastabana": {
                                "teacherActivity": "intro",
                                "studentActivity": "s",
                                "timing": "5 min"
                            }
                        }
                    }
                ]
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/instant-plan/html",
            json=payload,
            headers=headers,
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print(f"✅ PASS: Status 200")
        
        data = response.json()
        html = data.get("html", "")
        
        if not html or len(html) == 0:
            print(f"❌ FAIL: No html in response")
            return False
        
        print(f"✅ PASS: HTML received (length: {len(html)})")
        
        # Check that html contains CG-4 and C-4.2
        has_cg4 = "CG-4" in html
        has_c42 = "C-4.2" in html
        
        print(f"\nChecking HTML content:")
        print(f"  Contains 'CG-4': {has_cg4}")
        print(f"  Contains 'C-4.2': {has_c42}")
        
        if not has_cg4:
            print(f"  ❌ FAIL: HTML does not contain 'CG-4'")
            return False
        print(f"  ✅ PASS: HTML contains 'CG-4'")
        
        if not has_c42:
            print(f"  ❌ FAIL: HTML does not contain 'C-4.2'")
            return False
        print(f"  ✅ PASS: HTML contains 'C-4.2'")
        
        print(f"\n✅ PASS: Test 5 - Regression test passed")
        
    except Exception as e:
        print(f"❌ FAIL: Test 5 exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n" + "=" * 80)
    print("✅ ALL TESTS PASSED - Subject CG/Competency mapping working correctly")
    print("=" * 80)
    return True


if __name__ == "__main__":
    success = test_cg_competency_mapping()
    sys.exit(0 if success else 1)
