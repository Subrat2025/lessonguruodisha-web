#!/usr/bin/env python3
"""
Focused backend test for Academic Pacing Phase 1 - Based on review request requirements.
"""

import requests
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def test_academic_pacing_focused():
    print("\n" + "="*80)
    print("ACADEMIC PACING PHASE 1 - FOCUSED TEST (Per Review Request)")
    print("="*80 + "\n")
    
    # Login
    print("🔐 Admin Login...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=30)
    
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.status_code}")
        return
    
    admin_token = resp.json().get("token")
    headers = {"Authorization": f"Bearer {admin_token}"}
    print(f"✅ Login successful\n")
    
    # ========================================================================
    # ACADEMIC YEAR CRUD TESTS
    # ========================================================================
    print("="*80)
    print("ACADEMIC YEAR CRUD TESTS")
    print("="*80 + "\n")
    
    # Test 1: Auth gate - no token → 403
    print("TEST 1: GET /admin/academic-pacing/years - No token → 403")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", timeout=30)
    if resp.status_code == 403 and resp.json().get('error') == 'Admin only':
        print(f"✅ PASS: Auth gate working (403 with 'Admin only')\n")
    else:
        print(f"❌ FAIL: Expected 403 with 'Admin only', got {resp.status_code}: {resp.text}\n")
    
    # Test 2: GET with admin auth → 200 with seeded 2026-27
    print("TEST 2: GET /admin/academic-pacing/years - With admin auth → 200")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
    if resp.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
        return
    
    data = resp.json()
    years = data.get('years', [])
    year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
    
    if not year_2026_27:
        print(f"❌ FAIL: Seeded year 2026-27 not found\n")
        return
    
    print(f"✅ PASS: Returns 200 with ok:true, years:[...]")
    print(f"   - Found seeded year: label='2026-27', teachingDays={year_2026_27.get('teachingDays')}, isActive={year_2026_27.get('isActive')}")
    print(f"   - allocationCount={year_2026_27.get('allocationCount')}, plannedPeriodsTotal={year_2026_27.get('plannedPeriodsTotal')}")
    
    if year_2026_27.get('teachingDays') == 190 and year_2026_27.get('isActive') == True:
        print(f"✅ PASS: Seeded year has correct values (teachingDays=190, isActive=true)")
    else:
        print(f"❌ FAIL: Seeded year has incorrect values")
    
    if 'allocationCount' in year_2026_27 and 'plannedPeriodsTotal' in year_2026_27:
        print(f"✅ PASS: Each row has allocationCount and plannedPeriodsTotal numeric fields\n")
    else:
        print(f"❌ FAIL: Missing allocationCount or plannedPeriodsTotal\n")
    
    year_2026_27_id = year_2026_27.get('id')
    
    # Test 3: Idempotency - call 3 times, no duplicate 2026-27
    print("TEST 3: Idempotency - Call GET 3 times, verify NO duplicate 2026-27")
    counts = []
    for i in range(3):
        resp = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp.status_code == 200:
            years = resp.json().get('years', [])
            count = sum(1 for y in years if y.get('label') == '2026-27')
            counts.append(count)
    
    if all(c == 1 for c in counts):
        print(f"✅ PASS: Idempotent seed - all 3 calls returned exactly 1 year with label '2026-27' (counts: {counts})\n")
    else:
        print(f"❌ FAIL: Duplicate detected - counts: {counts}\n")
    
    # Test 4: POST with bad label → 400
    print("TEST 4: POST /admin/academic-pacing/years - Bad label 'BAD' → 400")
    resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={"label": "BAD"}, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'YYYY' in error or 'YY' in error:
            print(f"✅ PASS: Bad label rejected with 400, error mentions 'YYYY-YY': {error}\n")
        else:
            print(f"❌ FAIL: Error doesn't mention YYYY-YY format: {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 5: POST with duplicate label → 400
    print("TEST 5: POST /admin/academic-pacing/years - Duplicate label '2026-27' → 400")
    resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={"label": "2026-27"}, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'already exists' in error.lower():
            print(f"✅ PASS: Duplicate rejected with 400, error: {error}\n")
        else:
            print(f"❌ FAIL: Error doesn't mention 'already exists': {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 6: POST valid new year → 200
    print("TEST 6: POST /admin/academic-pacing/years - Valid '2027-28' → 200")
    resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={
        "label": "2027-28",
        "teachingDays": 200,
        "notes": "test"
    }, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        year = data.get('year', {})
        print(f"✅ PASS: Created year: {year.get('label')}, teachingDays={year.get('teachingDays')}, notes='{year.get('notes')}'\n")
        year_2027_28_id = year.get('id')
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}\n")
        year_2027_28_id = None
    
    # Test 7: POST with isActive=true → deactivates others
    print("TEST 7: POST /admin/academic-pacing/years - '2028-29' with isActive=true → 200")
    resp = requests.post(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, json={
        "label": "2028-29",
        "teachingDays": 210,
        "isActive": True
    }, timeout=30)
    if resp.status_code == 200:
        print(f"✅ PASS: Created year 2028-29 with isActive=true")
        
        # Verify 2026-27 is now inactive
        resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp2.status_code == 200:
            years = resp2.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            year_2028_29 = next((y for y in years if y.get('label') == '2028-29'), None)
            
            if year_2026_27 and year_2028_29:
                if year_2028_29.get('isActive') == True and year_2026_27.get('isActive') == False:
                    print(f"✅ PASS: 2026-27 isActive={year_2026_27.get('isActive')}, 2028-29 isActive={year_2028_29.get('isActive')} (only one active)\n")
                else:
                    print(f"❌ FAIL: isActive flags incorrect - 2026-27: {year_2026_27.get('isActive')}, 2028-29: {year_2028_29.get('isActive')}\n")
        year_2028_29_id = resp.json().get('year', {}).get('id')
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
        year_2028_29_id = None
    
    # Test 8: PATCH to update teachingDays and notes
    print("TEST 8: PATCH /admin/academic-pacing/years/:id - Update 2026-27 → 200")
    resp = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_2026_27_id}", headers=headers, json={
        "teachingDays": 195,
        "notes": "updated"
    }, timeout=30)
    if resp.status_code == 200:
        year = resp.json().get('year', {})
        if year.get('teachingDays') == 195 and year.get('notes') == 'updated':
            print(f"✅ PASS: Updated teachingDays=195, notes='updated'\n")
        else:
            print(f"❌ FAIL: Update values incorrect: {year}\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    # Test 9: PATCH with bad label → 400
    print("TEST 9: PATCH /admin/academic-pacing/years/:id - Bad label 'BAD' → 400")
    resp = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_2026_27_id}", headers=headers, json={
        "label": "BAD"
    }, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        print(f"✅ PASS: Bad label rejected with 400: {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 10: PATCH with duplicate label → 400
    print("TEST 10: PATCH /admin/academic-pacing/years/:id - Duplicate label '2027-28' → 400")
    resp = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_2026_27_id}", headers=headers, json={
        "label": "2027-28"
    }, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'already exists' in error.lower():
            print(f"✅ PASS: Duplicate rejected: {error}\n")
        else:
            print(f"❌ FAIL: Error doesn't mention 'already exists': {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 11: PATCH isActive=true → deactivates others
    print("TEST 11: PATCH /admin/academic-pacing/years/:id - Set 2026-27 isActive=true → 200")
    resp = requests.patch(f"{BASE_URL}/admin/academic-pacing/years/{year_2026_27_id}", headers=headers, json={
        "isActive": True
    }, timeout=30)
    if resp.status_code == 200:
        # Verify 2028-29 is now inactive
        resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/years", headers=headers, timeout=30)
        if resp2.status_code == 200:
            years = resp2.json().get('years', [])
            year_2026_27 = next((y for y in years if y.get('label') == '2026-27'), None)
            year_2028_29 = next((y for y in years if y.get('label') == '2028-29'), None)
            
            if year_2026_27 and year_2028_29:
                if year_2026_27.get('isActive') == True and year_2028_29.get('isActive') == False:
                    print(f"✅ PASS: 2026-27 re-activated, 2028-29 deactivated\n")
                else:
                    print(f"❌ FAIL: isActive flags incorrect\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    # Test 12: DELETE year without allocations → 200
    print("TEST 12: DELETE /admin/academic-pacing/years/:id - Delete 2027-28 (no allocations) → 200")
    if year_2027_28_id:
        resp = requests.delete(f"{BASE_URL}/admin/academic-pacing/years/{year_2027_28_id}", headers=headers, timeout=30)
        if resp.status_code == 200:
            print(f"✅ PASS: Deleted year 2027-28 successfully\n")
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}\n")
    else:
        print(f"⚠️  SKIP: year_2027_28_id not available\n")
    
    # ========================================================================
    # SUBJECT PERIOD ALLOCATIONS TESTS
    # ========================================================================
    print("="*80)
    print("SUBJECT PERIOD ALLOCATIONS TESTS")
    print("="*80 + "\n")
    
    # Test 13: Auth gate
    print("TEST 13: GET /admin/academic-pacing/allocations - No token → 403")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId=test", timeout=30)
    if resp.status_code == 403:
        print(f"✅ PASS: Auth gate working\n")
    else:
        print(f"❌ FAIL: Expected 403, got {resp.status_code}\n")
    
    # Test 14: Missing yearId → 400
    print("TEST 14: GET /admin/academic-pacing/allocations - Missing yearId → 400")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        print(f"✅ PASS: Missing yearId rejected: {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 15: Fake yearId → 200 with rows:[]
    print("TEST 15: GET /admin/academic-pacing/allocations - Fake yearId → 200")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId=fake-uuid", headers=headers, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        rows = data.get('rows', [])
        print(f"✅ PASS: Returns 200 with {len(rows)} rows (from books, annualPeriods=0)\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    # Test 16: Valid yearId → 200 with rows
    print("TEST 16: GET /admin/academic-pacing/allocations - Valid yearId → 200 with rows")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_2026_27_id}", headers=headers, timeout=30)
    if resp.status_code != 200:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    else:
        data = resp.json()
        rows = data.get('rows', [])
        summary = data.get('summary')
        
        print(f"✅ PASS: Returns 200 with ok:true, rows:[...], summary:{{...}}")
        print(f"   - rows count: {len(rows)}")
        
        if len(rows) > 0:
            sample = rows[0]
            print(f"   - Sample row: classId={sample.get('classId')}, className={sample.get('className')}, subject={sample.get('subject')}")
            print(f"     bookIds={sample.get('bookIds')}, bookNames={sample.get('bookNames')}")
            print(f"     annualPeriods={sample.get('annualPeriods')}, allocationId='{sample.get('allocationId')}'")
            
            required = ['classId', 'className', 'subject', 'bookIds', 'bookNames', 'annualPeriods', 'allocationId']
            if all(f in sample for f in required):
                print(f"✅ PASS: All required fields present")
            else:
                print(f"❌ FAIL: Missing required fields")
            
            # Check sorting
            print(f"   - First 3 rows (sorted by classOrder, className, subject):")
            for i, r in enumerate(rows[:3]):
                print(f"     {i+1}. {r.get('className')} - {r.get('subject')}")
        
        if summary:
            print(f"   - Summary: year={summary.get('year', {}).get('label')}, totals={summary.get('totals')}")
        print()
    
    # Get a real classId and subject for allocation tests
    resp_classes = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
    if resp_classes.status_code != 200:
        print(f"⚠️  WARNING: Cannot get classes for allocation tests\n")
        return
    
    classes_data = resp_classes.json()
    classes = classes_data.get('classes', []) if isinstance(classes_data, dict) else classes_data
    
    if len(classes) == 0:
        print(f"⚠️  WARNING: No classes available for allocation tests\n")
        return
    
    test_class_id = classes[0].get('id')
    
    resp_alloc = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_2026_27_id}", headers=headers, timeout=30)
    if resp_alloc.status_code != 200:
        print(f"⚠️  WARNING: Cannot get allocations for tests\n")
        return
    
    alloc_rows = resp_alloc.json().get('rows', [])
    if len(alloc_rows) == 0:
        print(f"⚠️  WARNING: No allocation rows available\n")
        return
    
    test_subject = alloc_rows[0].get('subject')
    
    # Test 17: PUT missing fields → 400
    print("TEST 17: PUT /admin/academic-pacing/allocations - Missing fields → 400")
    resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={}, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        print(f"✅ PASS: Missing fields rejected: {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 18: PUT bad academicYearId → 400
    print("TEST 18: PUT /admin/academic-pacing/allocations - Bad academicYearId → 400")
    resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
        "academicYearId": "fake-uuid",
        "classId": test_class_id,
        "subject": test_subject,
        "annualPeriods": 100
    }, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'academic year not found' in error.lower():
            print(f"✅ PASS: Bad academicYearId rejected: {error}\n")
        else:
            print(f"❌ FAIL: Error doesn't mention 'Academic year not found': {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 19: PUT bad classId → 400
    print("TEST 19: PUT /admin/academic-pacing/allocations - Bad classId → 400")
    resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
        "academicYearId": year_2026_27_id,
        "classId": "fake-class-id",
        "subject": test_subject,
        "annualPeriods": 100
    }, timeout=30)
    if resp.status_code == 400:
        error = resp.json().get('error', '')
        if 'class not found' in error.lower():
            print(f"✅ PASS: Bad classId rejected: {error}\n")
        else:
            print(f"❌ FAIL: Error doesn't mention 'Class not found': {error}\n")
    else:
        print(f"❌ FAIL: Expected 400, got {resp.status_code}\n")
    
    # Test 20: PUT valid → 200 (create)
    print("TEST 20: PUT /admin/academic-pacing/allocations - Valid (create) → 200")
    resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
        "academicYearId": year_2026_27_id,
        "classId": test_class_id,
        "subject": test_subject,
        "annualPeriods": 180
    }, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        allocation = data.get('allocation', {})
        print(f"✅ PASS: Created allocation: annualPeriods={allocation.get('annualPeriods')}, allocationId={allocation.get('id')}\n")
        test_allocation_id = allocation.get('id')
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}\n")
        test_allocation_id = None
    
    # Test 21: PUT again (upsert) → 200
    print("TEST 21: PUT /admin/academic-pacing/allocations - Repeat (upsert) → 200")
    resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
        "academicYearId": year_2026_27_id,
        "classId": test_class_id,
        "subject": test_subject,
        "annualPeriods": 200
    }, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        allocation = data.get('allocation', {})
        print(f"✅ PASS: Updated allocation (upsert): annualPeriods={allocation.get('annualPeriods')}")
        
        # Verify only one row exists
        resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_2026_27_id}", headers=headers, timeout=30)
        if resp2.status_code == 200:
            rows = resp2.json().get('rows', [])
            matching_rows = [r for r in rows if r.get('classId') == test_class_id and r.get('subject') == test_subject]
            if len(matching_rows) == 1 and matching_rows[0].get('annualPeriods') == 200:
                print(f"✅ PASS: Only one row with annualPeriods=200 (no duplicate)\n")
            else:
                print(f"❌ FAIL: Duplicate or incorrect data: {len(matching_rows)} rows\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    # Test 22: GET allocations - verify summary reflects upsert
    print("TEST 22: GET /admin/academic-pacing/allocations - Verify summary")
    resp = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_2026_27_id}", headers=headers, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        summary = data.get('summary')
        if summary:
            totals = summary.get('totals', {})
            print(f"✅ PASS: Summary totals: totalPlanned={totals.get('totalPlanned')}, totalSubjects={totals.get('totalSubjects')}")
            if totals.get('totalPlanned', 0) >= 200:
                print(f"✅ PASS: Summary.totals.totalPlanned reflects upsert\n")
            else:
                print(f"❌ FAIL: Summary doesn't reflect upsert\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    # Test 23: DELETE allocation → 200
    print("TEST 23: DELETE /admin/academic-pacing/allocations/:id - Valid → 200")
    if test_allocation_id:
        resp = requests.delete(f"{BASE_URL}/admin/academic-pacing/allocations/{test_allocation_id}", headers=headers, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: Deleted allocation: ok={data.get('ok')}, deleted={data.get('deleted')}")
            
            # Verify row shows annualPeriods=0, allocationId=''
            resp2 = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_2026_27_id}", headers=headers, timeout=30)
            if resp2.status_code == 200:
                rows = resp2.json().get('rows', [])
                matching_row = next((r for r in rows if r.get('classId') == test_class_id and r.get('subject') == test_subject), None)
                if matching_row and matching_row.get('annualPeriods') == 0 and matching_row.get('allocationId') == '':
                    print(f"✅ PASS: After delete, row shows annualPeriods=0, allocationId=''\n")
                else:
                    print(f"❌ FAIL: Delete not reflected correctly\n")
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    else:
        print(f"⚠️  SKIP: test_allocation_id not available\n")
    
    # Test 24: DELETE year with allocations → 400
    print("TEST 24: DELETE /admin/academic-pacing/years/:id - With allocations → 400")
    # First create an allocation for 2028-29
    if year_2028_29_id:
        resp = requests.put(f"{BASE_URL}/admin/academic-pacing/allocations", headers=headers, json={
            "academicYearId": year_2028_29_id,
            "classId": test_class_id,
            "subject": test_subject,
            "annualPeriods": 100
        }, timeout=30)
        
        if resp.status_code == 200:
            # Now try to delete the year
            resp2 = requests.delete(f"{BASE_URL}/admin/academic-pacing/years/{year_2028_29_id}", headers=headers, timeout=30)
            if resp2.status_code == 400:
                error = resp2.json().get('error', '')
                if 'cannot delete' in error.lower() and 'allocation' in error.lower():
                    print(f"✅ PASS: Delete refused: {error}\n")
                else:
                    print(f"❌ FAIL: Error doesn't mention allocations: {error}\n")
            else:
                print(f"❌ FAIL: Expected 400, got {resp2.status_code}\n")
    else:
        print(f"⚠️  SKIP: year_2028_29_id not available\n")
    
    # ========================================================================
    # REGRESSION TESTS
    # ========================================================================
    print("="*80)
    print("REGRESSION TESTS")
    print("="*80 + "\n")
    
    print("TEST 25: GET /api/classes - Still works")
    resp = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=30)
    if resp.status_code == 200:
        classes_data = resp.json()
        classes = classes_data.get('classes', []) if isinstance(classes_data, dict) else classes_data
        print(f"✅ PASS: Returns {len(classes)} classes\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    print("TEST 26: GET /api/admin/panchapadi-lessons?limit=5&light=1 - Still works")
    resp = requests.get(f"{BASE_URL}/admin/panchapadi-lessons?limit=5&light=1", headers=headers, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        lessons = data.get('lessons', [])
        print(f"✅ PASS: Returns paginated lessons (count: {len(lessons)})\n")
    else:
        print(f"❌ FAIL: Expected 200, got {resp.status_code}\n")
    
    print("="*80)
    print("TEST COMPLETE")
    print("="*80 + "\n")

if __name__ == "__main__":
    test_academic_pacing_focused()
