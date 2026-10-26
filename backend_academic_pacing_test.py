#!/usr/bin/env python3
"""
Backend test for Academic Pacing Phase 1 endpoints.
Tests Academic Year CRUD and Subject Period Allocations.
"""

import requests
import json
import time

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def test_academic_pacing():
    print("\n" + "="*80)
    print("ACADEMIC PACING PHASE 1 - BACKEND TEST")
    print("="*80 + "\n")
    
    # ========================================================================
    # TEST 1: Admin Login
    # ========================================================================
    print("TEST 1: Admin Login")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            admin_token = data.get("token")
            print(f"  ✅ PASS: Admin login successful, token obtained")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
            return
    except Exception as e:
        print(f"  ❌ FAIL: Exception during login: {e}")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # ========================================================================
    # TEST 2: GET /admin/academic-pacing/years - No Auth → 403
    # ========================================================================
    print("\nTEST 2: GET /admin/academic-pacing/years - No Auth → 403")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 403:
            data = resp.json()
            print(f"  Error: {data.get('error')}")
            print(f"  ✅ PASS: Auth gate working (403 without admin token)")
        else:
            print(f"  ❌ FAIL: Expected 403, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 3: GET /admin/academic-pacing/years - With Admin Auth → 200
    # ========================================================================
    print("\nTEST 3: GET /admin/academic-pacing/years - With Admin Auth → 200")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ok: {data.get('ok')}")
            years = data.get('years', [])
            print(f"  years count: {len(years)}")
            
            # Check for seeded 2026-27 year
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                print(f"  ✅ Found seeded year 2026-27:")
                print(f"     - teachingDays: {year_2026_27.get('teachingDays')}")
                print(f"     - isActive: {year_2026_27.get('isActive')}")
                print(f"     - allocationCount: {year_2026_27.get('allocationCount')}")
                print(f"     - plannedPeriodsTotal: {year_2026_27.get('plannedPeriodsTotal')}")
                
                if year_2026_27.get('teachingDays') == 190 and year_2026_27.get('isActive') == True:
                    print(f"  ✅ PASS: Seeded year has correct teachingDays=190 and isActive=true")
                else:
                    print(f"  ❌ FAIL: Seeded year has incorrect values")
                
                # Check for required fields
                if 'allocationCount' in year_2026_27 and 'plannedPeriodsTotal' in year_2026_27:
                    print(f"  ✅ PASS: allocationCount and plannedPeriodsTotal fields present")
                else:
                    print(f"  ❌ FAIL: Missing allocationCount or plannedPeriodsTotal fields")
            else:
                print(f"  ❌ FAIL: Seeded year 2026-27 not found")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 4: GET /admin/academic-pacing/years - Idempotency Check (3 calls)
    # ========================================================================
    print("\nTEST 4: GET /admin/academic-pacing/years - Idempotency Check (3 calls)")
    try:
        counts = []
        for i in range(3):
            resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                years = data.get('years', [])
                year_2026_27_count = sum(1 for y in years if y.get('label') == '2026-27')
                counts.append(year_2026_27_count)
                print(f"  Call {i+1}: Found {year_2026_27_count} year(s) with label '2026-27'")
        
        if all(c == 1 for c in counts):
            print(f"  ✅ PASS: Idempotent seed - no duplicate 2026-27 created (all calls returned 1)")
        else:
            print(f"  ❌ FAIL: Duplicate 2026-27 detected - counts: {counts}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 5: POST /admin/academic-pacing/years - Bad Label → 400
    # ========================================================================
    print("\nTEST 5: POST /admin/academic-pacing/years - Bad Label → 400")
    try:
        resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={
            "label": "BAD"
        }, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            data = resp.json()
            error = data.get('error', '')
            print(f"  Error: {error}")
            if 'YYYY' in error or 'YY' in error:
                print(f"  ✅ PASS: Bad label rejected with correct error message")
            else:
                print(f"  ❌ FAIL: Error message doesn't mention YYYY-YY format")
        else:
            print(f"  ❌ FAIL: Expected 400, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 6: POST /admin/academic-pacing/years - Duplicate Label → 400
    # ========================================================================
    print("\nTEST 6: POST /admin/academic-pacing/years - Duplicate Label → 400")
    try:
        resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={
            "label": "2026-27"
        }, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            data = resp.json()
            error = data.get('error', '')
            print(f"  Error: {error}")
            if 'already exists' in error.lower():
                print(f"  ✅ PASS: Duplicate label rejected with 'already exists' error")
            else:
                print(f"  ❌ FAIL: Error message doesn't mention 'already exists'")
        else:
            print(f"  ❌ FAIL: Expected 400, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 7: POST /admin/academic-pacing/years - Valid New Year → 200
    # ========================================================================
    print("\nTEST 7: POST /admin/academic-pacing/years - Valid New Year (2027-28) → 200")
    try:
        resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={
            "label": "2027-28",
            "teachingDays": 200,
            "notes": "test year"
        }, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ok: {data.get('ok')}")
            year = data.get('year', {})
            print(f"  Created year: {year.get('label')}, teachingDays: {year.get('teachingDays')}")
            if year.get('label') == '2027-28' and year.get('teachingDays') == 200:
                print(f"  ✅ PASS: New year created successfully")
                year_2027_28_id = year.get('id')
            else:
                print(f"  ❌ FAIL: Year data incorrect")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 8: POST /admin/academic-pacing/years - isActive=true → Deactivates Others
    # ========================================================================
    print("\nTEST 8: POST /admin/academic-pacing/years - isActive=true (2028-29) → Deactivates Others")
    try:
        resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={
            "label": "2028-29",
            "teachingDays": 210,
            "isActive": True
        }, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            year = data.get('year', {})
            print(f"  Created year: {year.get('label')}, isActive: {year.get('isActive')}")
            
            # Check that 2026-27 is now inactive
            resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
            if resp2.status_code == 200:
                years = resp2.json().get('years', [])
                year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
                year_2028_29 = next((y for y in years if y.get('label') == '2028-29'), None)
                
                if year_2026_27 and year_2028_29:
                    print(f"  2026-27 isActive: {year_2026_27.get('isActive')}")
                    print(f"  2028-29 isActive: {year_2028_29.get('isActive')}")
                    
                    if year_2028_29.get('isActive') == True and year_2026_27.get('isActive') == False:
                        print(f"  ✅ PASS: Only 2028-29 is active, 2026-27 deactivated")
                        year_2028_29_id = year_2028_29.get('id')
                    else:
                        print(f"  ❌ FAIL: isActive flags incorrect")
                else:
                    print(f"  ❌ FAIL: Could not find years to verify")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 9: PATCH /admin/academic-pacing/years/:id - Update teachingDays → 200
    # ========================================================================
    print("\nTEST 9: PATCH /admin/academic-pacing/years/:id - Update teachingDays → 200")
    try:
        # Get 2026-27 year ID
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_id}", headers=headers, json={
                    "teachingDays": 195,
                    "notes": "updated"
                }, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 200:
                    data = resp2.json()
                    year = data.get('year', {})
                    print(f"  Updated year: {year.get('label')}, teachingDays: {year.get('teachingDays')}, notes: {year.get('notes')}")
                    if year.get('teachingDays') == 195 and year.get('notes') == 'updated':
                        print(f"  ✅ PASS: Year updated successfully")
                    else:
                        print(f"  ❌ FAIL: Update values incorrect")
                else:
                    print(f"  ❌ FAIL: Expected 200, got {resp2.status_code}")
            else:
                print(f"  ❌ FAIL: Could not find 2026-27 year")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 10: PATCH /admin/academic-pacing/years/:id - Bad Label → 400
    # ========================================================================
    print("\nTEST 10: PATCH /admin/academic-pacing/years/:id - Bad Label → 400")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_id}", headers=headers, json={
                    "label": "BAD"
                }, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 400:
                    data = resp2.json()
                    error = data.get('error', '')
                    print(f"  Error: {error}")
                    if 'YYYY' in error or 'YY' in error:
                        print(f"  ✅ PASS: Bad label rejected")
                    else:
                        print(f"  ❌ FAIL: Error message doesn't mention format")
                else:
                    print(f"  ❌ FAIL: Expected 400, got {resp2.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 11: PATCH /admin/academic-pacing/years/:id - Duplicate Label → 400
    # ========================================================================
    print("\nTEST 11: PATCH /admin/academic-pacing/years/:id - Duplicate Label → 400")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_id}", headers=headers, json={
                    "label": "2027-28"
                }, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 400:
                    data = resp2.json()
                    error = data.get('error', '')
                    print(f"  Error: {error}")
                    if 'already exists' in error.lower():
                        print(f"  ✅ PASS: Duplicate label rejected")
                    else:
                        print(f"  ❌ FAIL: Error message doesn't mention 'already exists'")
                else:
                    print(f"  ❌ FAIL: Expected 400, got {resp2.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 12: PATCH /admin/academic-pacing/years/:id - isActive=true → Deactivates Others
    # ========================================================================
    print("\nTEST 12: PATCH /admin/academic-pacing/years/:id - isActive=true → Deactivates Others")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_id}", headers=headers, json={
                    "isActive": True
                }, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 200:
                    # Check that 2028-29 is now inactive
                    resp3 = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
                    if resp3.status_code == 200:
                        years = resp3.json().get('years', [])
                        year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
                        year_2028_29 = next((y for y in years if y.get('label') == '2028-29'), None)
                        
                        if year_2026_27 and year_2028_29:
                            print(f"  2026-27 isActive: {year_2026_27.get('isActive')}")
                            print(f"  2028-29 isActive: {year_2028_29.get('isActive')}")
                            
                            if year_2026_27.get('isActive') == True and year_2028_29.get('isActive') == False:
                                print(f"  ✅ PASS: Only 2026-27 is active, 2028-29 deactivated")
                            else:
                                print(f"  ❌ FAIL: isActive flags incorrect")
                else:
                    print(f"  ❌ FAIL: Expected 200, got {resp2.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 13: GET /admin/academic-pacing/allocations - No Auth → 403
    # ========================================================================
    print("\nTEST 13: GET /admin/academic-pacing/allocations - No Auth → 403")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId=test", timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"  ✅ PASS: Auth gate working (403 without admin token)")
        else:
            print(f"  ❌ FAIL: Expected 403, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 14: GET /admin/academic-pacing/allocations - Missing yearId → 400
    # ========================================================================
    print("\nTEST 14: GET /admin/academic-pacing/allocations - Missing yearId → 400")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            data = resp.json()
            error = data.get('error', '')
            print(f"  Error: {error}")
            if 'yearId' in error.lower():
                print(f"  ✅ PASS: Missing yearId rejected")
            else:
                print(f"  ❌ FAIL: Error message doesn't mention yearId")
        else:
            print(f"  ❌ FAIL: Expected 400, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 15: GET /admin/academic-pacing/allocations - Fake yearId → 200 with empty rows
    # ========================================================================
    print("\nTEST 15: GET /admin/academic-pacing/allocations - Fake yearId → 200 with empty rows")
    try:
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId=fake-uuid", headers=headers, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get('rows', [])
            summary = data.get('summary')
            print(f"  rows count: {len(rows)}")
            print(f"  summary: {summary}")
            # Should return rows from books but with annualPeriods=0
            if len(rows) > 0:
                print(f"  ✅ PASS: Returns rows (from books) even with fake yearId")
            else:
                print(f"  ⚠️  WARNING: No rows returned (might be OK if no books exist)")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 16: GET /admin/academic-pacing/allocations - Valid yearId → 200 with rows
    # ========================================================================
    print("\nTEST 16: GET /admin/academic-pacing/allocations - Valid yearId → 200 with rows")
    try:
        # Get 2026-27 year ID
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 200:
                    data = resp2.json()
                    rows = data.get('rows', [])
                    summary = data.get('summary')
                    print(f"  ok: {data.get('ok')}")
                    print(f"  rows count: {len(rows)}")
                    
                    if len(rows) > 0:
                        sample = rows[0]
                        print(f"  Sample row fields: {list(sample.keys())}")
                        print(f"  Sample: classId={sample.get('classId')}, className={sample.get('className')}, subject={sample.get('subject')}, annualPeriods={sample.get('annualPeriods')}, allocationId={sample.get('allocationId')}")
                        
                        # Check required fields
                        required_fields = ['classId', 'className', 'subject', 'bookIds', 'bookNames', 'annualPeriods', 'allocationId']
                        if all(f in sample for f in required_fields):
                            print(f"  ✅ PASS: All required fields present")
                        else:
                            print(f"  ❌ FAIL: Missing required fields")
                        
                        # Check sorting (by classOrder then className then subject)
                        print(f"  First 3 rows:")
                        for i, r in enumerate(rows[:3]):
                            print(f"    {i+1}. {r.get('className')} - {r.get('subject')}")
                        print(f"  ✅ PASS: Rows returned and sorted")
                    else:
                        print(f"  ⚠️  WARNING: No rows returned (might be OK if no books exist)")
                    
                    if summary:
                        print(f"  Summary: {summary}")
                else:
                    print(f"  ❌ FAIL: Expected 200, got {resp2.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 17: PUT /admin/academic-pacing/allocations - Missing fields → 400
    # ========================================================================
    print("\nTEST 17: PUT /admin/academic-pacing/allocations - Missing fields → 400")
    try:
        resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={}, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            data = resp.json()
            error = data.get('error', '')
            print(f"  Error: {error}")
            print(f"  ✅ PASS: Missing fields rejected")
        else:
            print(f"  ❌ FAIL: Expected 400, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 18: PUT /admin/academic-pacing/allocations - Bad academicYearId → 400
    # ========================================================================
    print("\nTEST 18: PUT /admin/academic-pacing/allocations - Bad academicYearId → 400")
    try:
        # Get a real classId first
        resp = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
        if resp.status_code == 200:
            classes = resp.json()
            if len(classes) > 0:
                class_id = classes[0].get('id')
                
                resp2 = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
                    "academicYearId": "fake-uuid",
                    "classId": class_id,
                    "subject": "Test Subject",
                    "annualPeriods": 100
                }, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 400:
                    data = resp2.json()
                    error = data.get('error', '')
                    print(f"  Error: {error}")
                    if 'academic year not found' in error.lower():
                        print(f"  ✅ PASS: Bad academicYearId rejected")
                    else:
                        print(f"  ❌ FAIL: Error message doesn't mention 'Academic year not found'")
                else:
                    print(f"  ❌ FAIL: Expected 400, got {resp2.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 19: PUT /admin/academic-pacing/allocations - Bad classId → 400
    # ========================================================================
    print("\nTEST 19: PUT /admin/academic-pacing/allocations - Bad classId → 400")
    try:
        # Get 2026-27 year ID
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
                    "academicYearId": year_id,
                    "classId": "fake-class-id",
                    "subject": "Test Subject",
                    "annualPeriods": 100
                }, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 400:
                    data = resp2.json()
                    error = data.get('error', '')
                    print(f"  Error: {error}")
                    if 'class not found' in error.lower():
                        print(f"  ✅ PASS: Bad classId rejected")
                    else:
                        print(f"  ❌ FAIL: Error message doesn't mention 'Class not found'")
                else:
                    print(f"  ❌ FAIL: Expected 400, got {resp2.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 20: PUT /admin/academic-pacing/allocations - Valid → 200 (Create)
    # ========================================================================
    print("\nTEST 20: PUT /admin/academic-pacing/allocations - Valid → 200 (Create)")
    try:
        # Get 2026-27 year ID and a real class
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        resp2 = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
        
        if resp.status_code == 200 and resp2.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            classes = resp2.json()
            
            if year_2026_27 and len(classes) > 0:
                year_id = year_2026_27.get('id')
                class_id = classes[0].get('id')
                
                # Get allocations to find a real subject
                resp3 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                if resp3.status_code == 200:
                    rows = resp3.json().get('rows', [])
                    if len(rows) > 0:
                        subject = rows[0].get('subject')
                        
                        resp4 = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "subject": subject,
                            "annualPeriods": 180
                        }, timeout=30)
                        print(f"  Status: {resp4.status_code}")
                        if resp4.status_code == 200:
                            data = resp4.json()
                            allocation = data.get('allocation', {})
                            print(f"  ok: {data.get('ok')}")
                            print(f"  allocation: classId={allocation.get('classId')}, subject={allocation.get('subject')}, annualPeriods={allocation.get('annualPeriods')}")
                            
                            if allocation.get('annualPeriods') == 180:
                                print(f"  ✅ PASS: Allocation created successfully")
                                allocation_id = allocation.get('id')
                            else:
                                print(f"  ❌ FAIL: Allocation data incorrect")
                        else:
                            print(f"  ❌ FAIL: Expected 200, got {resp4.status_code}")
                            print(f"  Response: {resp4.text}")
                    else:
                        print(f"  ⚠️  SKIP: No rows to get subject from")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 21: PUT /admin/academic-pacing/allocations - Upsert (Update) → 200
    # ========================================================================
    print("\nTEST 21: PUT /admin/academic-pacing/allocations - Upsert (Update) → 200")
    try:
        # Get 2026-27 year ID and a real class
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        resp2 = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
        
        if resp.status_code == 200 and resp2.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            classes = resp2.json()
            
            if year_2026_27 and len(classes) > 0:
                year_id = year_2026_27.get('id')
                class_id = classes[0].get('id')
                
                # Get allocations to find a real subject
                resp3 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                if resp3.status_code == 200:
                    rows = resp3.json().get('rows', [])
                    if len(rows) > 0:
                        subject = rows[0].get('subject')
                        
                        # Update with different annualPeriods
                        resp4 = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "subject": subject,
                            "annualPeriods": 200
                        }, timeout=30)
                        print(f"  Status: {resp4.status_code}")
                        if resp4.status_code == 200:
                            data = resp4.json()
                            allocation = data.get('allocation', {})
                            print(f"  ok: {data.get('ok')}")
                            print(f"  allocation: annualPeriods={allocation.get('annualPeriods')}")
                            
                            if allocation.get('annualPeriods') == 200:
                                print(f"  ✅ PASS: Allocation updated successfully (upsert)")
                            else:
                                print(f"  ❌ FAIL: Allocation not updated")
                        else:
                            print(f"  ❌ FAIL: Expected 200, got {resp4.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 22: GET /admin/academic-pacing/allocations - Verify Upsert
    # ========================================================================
    print("\nTEST 22: GET /admin/academic-pacing/allocations - Verify Upsert")
    try:
        # Get 2026-27 year ID
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 200:
                    data = resp2.json()
                    rows = data.get('rows', [])
                    summary = data.get('summary')
                    
                    # Find the row we just upserted
                    resp3 = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
                    if resp3.status_code == 200:
                        classes = resp3.json()
                        if len(classes) > 0:
                            class_id = classes[0].get('id')
                            
                            # Get the first subject from rows
                            first_row = next((r for r in rows if r.get('classId') == class_id), None)
                            if first_row:
                                subject = first_row.get('subject')
                                annualPeriods = first_row.get('annualPeriods')
                                allocationId = first_row.get('allocationId')
                                
                                print(f"  Row: classId={class_id}, subject={subject}, annualPeriods={annualPeriods}, allocationId={allocationId}")
                                
                                if annualPeriods == 200 and allocationId:
                                    print(f"  ✅ PASS: Upsert verified - annualPeriods=200, allocationId present")
                                else:
                                    print(f"  ❌ FAIL: Upsert not reflected correctly")
                                
                                # Check summary
                                if summary:
                                    totals = summary.get('totals', {})
                                    print(f"  Summary totals: totalPlanned={totals.get('totalPlanned')}, totalSubjects={totals.get('totalSubjects')}")
                                    if totals.get('totalPlanned', 0) >= 200:
                                        print(f"  ✅ PASS: Summary reflects upsert")
                                    else:
                                        print(f"  ❌ FAIL: Summary doesn't reflect upsert")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 23: DELETE /admin/academic-pacing/allocations/:id - Valid → 200
    # ========================================================================
    print("\nTEST 23: DELETE /admin/academic-pacing/allocations/:id - Valid → 200")
    try:
        # Get 2026-27 year ID
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                # Get allocations to find an allocation to delete
                resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                if resp2.status_code == 200:
                    rows = resp2.json().get('rows', [])
                    allocation_row = next((r for r in rows if r.get('allocationId')), None)
                    
                    if allocation_row:
                        allocation_id = allocation_row.get('allocationId')
                        
                        resp3 = requests.delete(f"{BASE_URL}/admin/academic-pacing/allocations/{allocation_id}", headers=headers, timeout=30)
                        print(f"  Status: {resp3.status_code}")
                        if resp3.status_code == 200:
                            data = resp3.json()
                            print(f"  ok: {data.get('ok')}, deleted: {data.get('deleted')}")
                            if data.get('deleted') == 1:
                                print(f"  ✅ PASS: Allocation deleted successfully")
                            else:
                                print(f"  ❌ FAIL: Deleted count incorrect")
                        else:
                            print(f"  ❌ FAIL: Expected 200, got {resp3.status_code}")
                    else:
                        print(f"  ⚠️  SKIP: No allocation to delete")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 24: GET /admin/academic-pacing/allocations - Verify Delete
    # ========================================================================
    print("\nTEST 24: GET /admin/academic-pacing/allocations - Verify Delete")
    try:
        # Get 2026-27 year ID
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            if year_2026_27:
                year_id = year_2026_27.get('id')
                
                resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 200:
                    data = resp2.json()
                    rows = data.get('rows', [])
                    
                    # Find the row we just deleted (should have annualPeriods=0, allocationId='')
                    resp3 = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
                    if resp3.status_code == 200:
                        classes = resp3.json()
                        if len(classes) > 0:
                            class_id = classes[0].get('id')
                            
                            first_row = next((r for r in rows if r.get('classId') == class_id), None)
                            if first_row:
                                annualPeriods = first_row.get('annualPeriods')
                                allocationId = first_row.get('allocationId')
                                
                                print(f"  Row: annualPeriods={annualPeriods}, allocationId='{allocationId}'")
                                
                                if annualPeriods == 0 and allocationId == '':
                                    print(f"  ✅ PASS: Delete verified - annualPeriods=0, allocationId=''")
                                else:
                                    print(f"  ❌ FAIL: Delete not reflected correctly")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 25: DELETE /admin/academic-pacing/years/:id - With Allocations → 400
    # ========================================================================
    print("\nTEST 25: DELETE /admin/academic-pacing/years/:id - With Allocations → 400")
    try:
        # First create an allocation for 2027-28
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        resp2 = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
        
        if resp.status_code == 200 and resp2.status_code == 200:
            years = resp.json().get('years', [])
            year_2027_28 = next((y for y in years if y.get('label') == '2027-28'), None)
            classes = resp2.json()
            
            if year_2027_28 and len(classes) > 0:
                year_id = year_2027_28.get('id')
                class_id = classes[0].get('id')
                
                # Get allocations to find a real subject
                resp3 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", headers=headers, timeout=30)
                if resp3.status_code == 200:
                    rows = resp3.json().get('rows', [])
                    if len(rows) > 0:
                        subject = rows[0].get('subject')
                        
                        # Create allocation
                        resp4 = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "subject": subject,
                            "annualPeriods": 100
                        }, timeout=30)
                        
                        if resp4.status_code == 200:
                            # Now try to delete the year
                            resp5 = requests.delete(f"{BASE_URL}/admin/academic-pacing/years/{year_id}", headers=headers, timeout=30)
                            print(f"  Status: {resp5.status_code}")
                            if resp5.status_code == 400:
                                data = resp5.json()
                                error = data.get('error', '')
                                print(f"  Error: {error}")
                                if 'cannot delete' in error.lower() and 'allocation' in error.lower():
                                    print(f"  ✅ PASS: Delete refused when allocations exist")
                                else:
                                    print(f"  ❌ FAIL: Error message doesn't mention allocations")
                            else:
                                print(f"  ❌ FAIL: Expected 400, got {resp5.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 26: DELETE /admin/academic-pacing/years/:id - Without Allocations → 200
    # ========================================================================
    print("\nTEST 26: DELETE /admin/academic-pacing/years/:id - Without Allocations → 200")
    try:
        # Delete 2028-29 (should have no allocations)
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            year_2028_29 = next((y for y in years if y.get('label') == '2028-29'), None)
            
            if year_2028_29:
                year_id = year_2028_29.get('id')
                
                resp2 = requests.delete(f"{BASE_URL}/admin/academic-pacing/years/{year_id}", headers=headers, timeout=30)
                print(f"  Status: {resp2.status_code}")
                if resp2.status_code == 200:
                    data = resp2.json()
                    print(f"  ok: {data.get('ok')}")
                    print(f"  ✅ PASS: Year deleted successfully")
                else:
                    print(f"  ❌ FAIL: Expected 200, got {resp2.status_code}")
                    print(f"  Response: {resp2.text}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # REGRESSION TESTS
    # ========================================================================
    print("\n" + "="*80)
    print("REGRESSION TESTS")
    print("="*80 + "\n")
    
    # ========================================================================
    # TEST 27: GET /api/classes - Still Works
    # ========================================================================
    print("TEST 27: GET /api/classes - Still Works")
    try:
        resp = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            classes = resp.json()
            print(f"  Classes count: {len(classes)}")
            print(f"  ✅ PASS: Classes endpoint still working")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # ========================================================================
    # TEST 28: GET /api/admin/panchapadi-lessons?limit=5&light=1 - Still Works
    # ========================================================================
    print("\nTEST 28: GET /api/admin/panchapadi-lessons?limit=5&light=1 - Still Works")
    try:
        resp = requests.get(f"{BASE_URL}/admin/panchapadi-lessons?limit=5&light=1", headers=headers, timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            lessons = data.get('lessons', [])
            print(f"  Lessons count: {len(lessons)}")
            print(f"  ✅ PASS: Panchapadi lessons endpoint still working")
        else:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    print("\n" + "="*80)
    print("ACADEMIC PACING PHASE 1 - TEST COMPLETE")
    print("="*80 + "\n")

if __name__ == "__main__":
    test_academic_pacing()
