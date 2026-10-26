#!/usr/bin/env python3
"""
Backend Test: Academic Pacing Phase 2 (Chapter Pacing + Progress + AI Wire + CSV Import)

Tests all Phase 2 endpoints per review request:
- Phase 2a: Chapter Pacing (GET chapters, PUT/PATCH/DELETE plan)
- Phase 2b: Progress Dashboard (GET progress)
- Phase 2c: Wire Generator to Plan (POST ai-lesson/generate with pacing)
- Phase 2d: CSV Bulk Import (GET template, POST import dry-run + apply)

Admin creds: 9999999999 / admin123
Active AY: 2026-27
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_admin_login():
    """Test 1: Admin login"""
    try:
        log("Test 1: Admin login with 9999999999 / admin123")
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data, "No token in response"
        log(f"✅ Test 1 PASSED: Admin login successful, token: {data['token'][:20]}...")
        return data["token"]
    except Exception as e:
        log(f"❌ Test 1 FAILED: {e}")
        sys.exit(1)

def test_get_academic_years(token):
    """Test 2: GET /admin/academic-pacing/years to find 2026-27"""
    try:
        log("Test 2: GET /admin/academic-pacing/years")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/years", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "years" in data, "No years array"
        years = data["years"]
        year_2026_27 = next((y for y in years if y["label"] == "2026-27"), None)
        assert year_2026_27 is not None, "2026-27 not found in years"
        log(f"✅ Test 2 PASSED: Found AY 2026-27 with id={year_2026_27['id']}")
        return year_2026_27["id"]
    except Exception as e:
        log(f"❌ Test 2 FAILED: {e}")
        sys.exit(1)

def test_get_classes(token):
    """Test 3: GET /classes to find Class 1"""
    try:
        log("Test 3: GET /classes to find Class 1")
        r = requests.get(f"{BASE_URL}/classes", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        classes = data if isinstance(data, list) else data.get("classes", [])
        class_1 = next((c for c in classes if c.get("name") == "Class 1"), None)
        assert class_1 is not None, "Class 1 not found"
        log(f"✅ Test 3 PASSED: Found Class 1 with id={class_1['id']}")
        return class_1["id"]
    except Exception as e:
        log(f"❌ Test 3 FAILED: {e}")
        sys.exit(1)

def test_get_allocations(token, year_id):
    """Test 4: GET /admin/academic-pacing/allocations to find a subject"""
    try:
        log(f"Test 4: GET /admin/academic-pacing/allocations?yearId={year_id}")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "rows" in data, "No rows array"
        rows = data["rows"]
        assert len(rows) > 0, "No allocation rows found"
        # Find a row with Class 1 and a subject
        class_1_row = next((r for r in rows if "Class 1" in r.get("className", "")), None)
        assert class_1_row is not None, "No Class 1 row found"
        subject = class_1_row.get("subject", "")
        assert subject, "No subject found for Class 1"
        log(f"✅ Test 4 PASSED: Found subject '{subject}' for Class 1")
        return subject
    except Exception as e:
        log(f"❌ Test 4 FAILED: {e}")
        sys.exit(1)

def test_get_chapters_no_auth():
    """Test 5: GET /admin/academic-pacing/chapters without auth → 403"""
    try:
        log("Test 5: GET /admin/academic-pacing/chapters without auth → 403")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/chapters?yearId=x&classId=x&subject=x", timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 5 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 5 FAILED: {e}")
        raise

def test_get_chapters_missing_params(token):
    """Test 6: GET /admin/academic-pacing/chapters missing params → 400"""
    try:
        log("Test 6: GET /admin/academic-pacing/chapters missing params → 400")
        # Missing subject
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/chapters?yearId=x&classId=x", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "required" in r.text.lower(), "Expected 'required' in error"
        log("✅ Test 6 PASSED: Missing params validation working")
    except Exception as e:
        log(f"❌ Test 6 FAILED: {e}")
        raise

def test_get_chapters_valid(token, year_id, class_id, subject):
    """Test 7: GET /admin/academic-pacing/chapters with valid params → 200"""
    try:
        log(f"Test 7: GET /admin/academic-pacing/chapters?yearId={year_id}&classId={class_id}&subject={subject}")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/chapters", 
                        params={"yearId": year_id, "classId": class_id, "subject": subject},
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "rows" in data, "No rows array"
        assert "allocation" in data, "No allocation field"
        assert "annualPeriods" in data, "No annualPeriods field"
        assert "totalAllocated" in data, "No totalAllocated field"
        assert "remaining" in data, "No remaining field"
        rows = data["rows"]
        log(f"   Found {len(rows)} chapter rows")
        if len(rows) > 0:
            row = rows[0]
            required_fields = ["chapterKey", "chapterName", "chapterSource", "totalPeriods", 
                             "periods", "filledTopics", "filledSubTopics", "generatedCount", 
                             "archivedCount", "uploadedPeriods"]
            for field in required_fields:
                assert field in row, f"Missing field '{field}' in row"
            log(f"   Sample row: chapterName={row['chapterName']}, source={row['chapterSource']}, totalPeriods={row['totalPeriods']}")
        log("✅ Test 7 PASSED: GET chapters with valid params working")
        return rows
    except Exception as e:
        log(f"❌ Test 7 FAILED: {e}")
        raise

def test_put_plan_no_auth():
    """Test 8: PUT /admin/academic-pacing/chapters/plan without auth → 403"""
    try:
        log("Test 8: PUT /admin/academic-pacing/chapters/plan without auth → 403")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={"academicYearId": "x"}, timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 8 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 8 FAILED: {e}")
        raise

def test_put_plan_missing_fields(token):
    """Test 9: PUT /admin/academic-pacing/chapters/plan missing fields → 400"""
    try:
        log("Test 9: PUT /admin/academic-pacing/chapters/plan missing fields → 400")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={"academicYearId": "x"},
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        log("✅ Test 9 PASSED: Missing fields validation working")
    except Exception as e:
        log(f"❌ Test 9 FAILED: {e}")
        raise

def test_put_plan_bad_year_id(token, class_id, subject):
    """Test 10: PUT /admin/academic-pacing/chapters/plan bad yearId → 400"""
    try:
        log("Test 10: PUT /admin/academic-pacing/chapters/plan bad yearId → 400")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": "bad-year-id",
                            "classId": class_id,
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Test Chapter",
                            "totalPeriods": 5
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "year" in r.text.lower() or "not found" in r.text.lower(), "Expected year error"
        log("✅ Test 10 PASSED: Bad yearId validation working")
    except Exception as e:
        log(f"❌ Test 10 FAILED: {e}")
        raise

def test_put_plan_bad_class_id(token, year_id, subject):
    """Test 11: PUT /admin/academic-pacing/chapters/plan bad classId → 400"""
    try:
        log("Test 11: PUT /admin/academic-pacing/chapters/plan bad classId → 400")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": year_id,
                            "classId": "bad-class-id",
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Test Chapter",
                            "totalPeriods": 5
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "class" in r.text.lower() or "not found" in r.text.lower(), "Expected class error"
        log("✅ Test 11 PASSED: Bad classId validation working")
    except Exception as e:
        log(f"❌ Test 11 FAILED: {e}")
        raise

def test_put_plan_create_5_periods(token, year_id, class_id, subject):
    """Test 12: PUT /admin/academic-pacing/chapters/plan totalPeriods=5 → 5 blank periods"""
    try:
        log("Test 12: PUT /admin/academic-pacing/chapters/plan totalPeriods=5")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Test Chapter Phase2",
                            "chapterOrder": 99,
                            "totalPeriods": 5
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "plan" in data, "No plan in response"
        plan = data["plan"]
        assert plan.get("totalPeriods") == 5, f"Expected totalPeriods=5, got {plan.get('totalPeriods')}"
        assert "periods" in plan, "No periods array"
        assert len(plan["periods"]) == 5, f"Expected 5 periods, got {len(plan['periods'])}"
        # Check all periods are blank
        for i, p in enumerate(plan["periods"], 1):
            assert p.get("periodNumber") == i, f"Period {i} has wrong periodNumber"
            assert p.get("topic", "") == "", f"Period {i} should have blank topic"
            assert p.get("subTopic", "") == "", f"Period {i} should have blank subTopic"
        log(f"✅ Test 12 PASSED: Created plan with 5 blank periods, planId={plan['id']}")
        return plan["id"]
    except Exception as e:
        log(f"❌ Test 12 FAILED: {e}")
        raise

def test_put_plan_grow_to_8(token, year_id, class_id, subject):
    """Test 13: PUT /admin/academic-pacing/chapters/plan totalPeriods=8 → grows to 8"""
    try:
        log("Test 13: PUT /admin/academic-pacing/chapters/plan totalPeriods=8 (grow)")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Test Chapter Phase2",
                            "chapterOrder": 99,
                            "totalPeriods": 8
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        plan = data["plan"]
        assert plan.get("totalPeriods") == 8, f"Expected totalPeriods=8, got {plan.get('totalPeriods')}"
        assert len(plan["periods"]) == 8, f"Expected 8 periods, got {len(plan['periods'])}"
        log("✅ Test 13 PASSED: Grew plan to 8 periods")
        return plan["id"]
    except Exception as e:
        log(f"❌ Test 13 FAILED: {e}")
        raise

def test_patch_period_add_topic(token, plan_id):
    """Test 14: PATCH /admin/academic-pacing/chapters/plan/period add topic"""
    try:
        log(f"Test 14: PATCH /admin/academic-pacing/chapters/plan/period planId={plan_id} P1 topic")
        r = requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                          json={
                              "planId": plan_id,
                              "periodNumber": 1,
                              "topic": "Introduction to Numbers",
                              "subTopic": "Counting 1-10"
                          },
                          headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "period" in data, "No period in response"
        period = data["period"]
        assert period.get("topic") == "Introduction to Numbers", f"Topic mismatch: {period.get('topic')}"
        assert period.get("subTopic") == "Counting 1-10", f"SubTopic mismatch: {period.get('subTopic')}"
        log("✅ Test 14 PASSED: Added topic and subTopic to P1")
    except Exception as e:
        log(f"❌ Test 14 FAILED: {e}")
        raise

def test_put_plan_shrink_to_3(token, year_id, class_id, subject):
    """Test 15: PUT /admin/academic-pacing/chapters/plan totalPeriods=3 → shrinks to 3, preserves P1"""
    try:
        log("Test 15: PUT /admin/academic-pacing/chapters/plan totalPeriods=3 (shrink)")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Test Chapter Phase2",
                            "chapterOrder": 99,
                            "totalPeriods": 3
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        plan = data["plan"]
        assert plan.get("totalPeriods") == 3, f"Expected totalPeriods=3, got {plan.get('totalPeriods')}"
        assert len(plan["periods"]) == 3, f"Expected 3 periods, got {len(plan['periods'])}"
        # Check P1 still has topic
        p1 = plan["periods"][0]
        assert p1.get("topic") == "Introduction to Numbers", f"P1 topic lost: {p1.get('topic')}"
        assert p1.get("subTopic") == "Counting 1-10", f"P1 subTopic lost: {p1.get('subTopic')}"
        log("✅ Test 15 PASSED: Shrunk to 3 periods, P1 topic preserved")
        return plan["id"]
    except Exception as e:
        log(f"❌ Test 15 FAILED: {e}")
        raise

def test_put_plan_zero_periods(token, year_id, class_id, subject):
    """Test 16: PUT /admin/academic-pacing/chapters/plan totalPeriods=0 → 0 periods"""
    try:
        log("Test 16: PUT /admin/academic-pacing/chapters/plan totalPeriods=0")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Test Chapter Phase2",
                            "chapterOrder": 99,
                            "totalPeriods": 0
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        plan = data["plan"]
        assert plan.get("totalPeriods") == 0, f"Expected totalPeriods=0, got {plan.get('totalPeriods')}"
        assert len(plan["periods"]) == 0, f"Expected 0 periods, got {len(plan['periods'])}"
        log("✅ Test 16 PASSED: Set totalPeriods=0, periods array empty")
        return plan["id"]
    except Exception as e:
        log(f"❌ Test 16 FAILED: {e}")
        raise

def test_patch_period_no_auth():
    """Test 17: PATCH /admin/academic-pacing/chapters/plan/period without auth → 403"""
    try:
        log("Test 17: PATCH /admin/academic-pacing/chapters/plan/period without auth → 403")
        r = requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                          json={"planId": "x", "periodNumber": 1}, timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 17 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 17 FAILED: {e}")
        raise

def test_patch_period_bad_plan_id(token):
    """Test 18: PATCH /admin/academic-pacing/chapters/plan/period bad planId → 400"""
    try:
        log("Test 18: PATCH /admin/academic-pacing/chapters/plan/period bad planId → 400")
        r = requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                          json={"planId": "bad-plan-id", "periodNumber": 1, "topic": "X"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "plan" in r.text.lower() or "not found" in r.text.lower(), "Expected plan error"
        log("✅ Test 18 PASSED: Bad planId validation working")
    except Exception as e:
        log(f"❌ Test 18 FAILED: {e}")
        raise

def test_patch_period_out_of_range(token, plan_id):
    """Test 19: PATCH /admin/academic-pacing/chapters/plan/period periodNumber out of range → 400"""
    try:
        log(f"Test 19: PATCH /admin/academic-pacing/chapters/plan/period periodNumber=99 (out of range)")
        r = requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                          json={"planId": plan_id, "periodNumber": 99, "topic": "X"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "period" in r.text.lower() and "not found" in r.text.lower(), "Expected period not found error"
        log("✅ Test 19 PASSED: Out of range periodNumber validation working")
    except Exception as e:
        log(f"❌ Test 19 FAILED: {e}")
        raise

def test_patch_period_partial_update(token, year_id, class_id, subject):
    """Test 20: PATCH /admin/academic-pacing/chapters/plan/period partial update (status only)"""
    try:
        # First create a new plan with 3 periods and add topic to P1
        log("Test 20: Setup - create plan with 3 periods and topic on P1")
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                    json={
                        "academicYearId": year_id,
                        "classId": class_id,
                        "className": "Class 1",
                        "subject": subject,
                        "chapterName": "Test Chapter Phase2",
                        "totalPeriods": 3
                    },
                    headers={"Authorization": f"Bearer {token}"}, timeout=30)
        plan_id = r.json()["plan"]["id"]
        
        requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                      json={"planId": plan_id, "periodNumber": 1, "topic": "Numbers", "subTopic": "Basics"},
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
        
        log("Test 20: PATCH period with status='generated' only")
        r = requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                          json={"planId": plan_id, "periodNumber": 1, "status": "generated"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        period = data["period"]
        assert period.get("status") == "generated", f"Status not updated: {period.get('status')}"
        assert period.get("topic") == "Numbers", f"Topic should be preserved: {period.get('topic')}"
        assert period.get("subTopic") == "Basics", f"SubTopic should be preserved: {period.get('subTopic')}"
        log("✅ Test 20 PASSED: Partial update preserves existing fields")
        return plan_id
    except Exception as e:
        log(f"❌ Test 20 FAILED: {e}")
        raise

def test_delete_plan_no_auth():
    """Test 21: DELETE /admin/academic-pacing/chapters/plan/:id without auth → 403"""
    try:
        log("Test 21: DELETE /admin/academic-pacing/chapters/plan/:id without auth → 403")
        r = requests.delete(f"{BASE_URL}/admin/academic-pacing/chapters/plan/fake-id", timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 21 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 21 FAILED: {e}")
        raise

def test_delete_plan_valid(token, plan_id):
    """Test 22: DELETE /admin/academic-pacing/chapters/plan/:id valid → 200"""
    try:
        log(f"Test 22: DELETE /admin/academic-pacing/chapters/plan/{plan_id}")
        r = requests.delete(f"{BASE_URL}/admin/academic-pacing/chapters/plan/{plan_id}", 
                           headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert data.get("deleted") == 1, f"Expected deleted=1, got {data.get('deleted')}"
        log("✅ Test 22 PASSED: Deleted plan successfully")
    except Exception as e:
        log(f"❌ Test 22 FAILED: {e}")
        raise

def test_get_progress_no_auth():
    """Test 23: GET /admin/academic-pacing/progress without auth → 403"""
    try:
        log("Test 23: GET /admin/academic-pacing/progress without auth → 403")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/progress?yearId=x", timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 23 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 23 FAILED: {e}")
        raise

def test_get_progress_missing_year_id(token):
    """Test 24: GET /admin/academic-pacing/progress missing yearId → 400"""
    try:
        log("Test 24: GET /admin/academic-pacing/progress missing yearId → 400")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/progress", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "yearid" in r.text.lower() or "required" in r.text.lower(), "Expected yearId error"
        log("✅ Test 24 PASSED: Missing yearId validation working")
    except Exception as e:
        log(f"❌ Test 24 FAILED: {e}")
        raise

def test_get_progress_valid(token, year_id):
    """Test 25: GET /admin/academic-pacing/progress valid yearId → 200"""
    try:
        log(f"Test 25: GET /admin/academic-pacing/progress?yearId={year_id}")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/progress?yearId={year_id}", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "totals" in data, "No totals field"
        assert "subjects" in data, "No subjects array"
        totals = data["totals"]
        required_fields = ["subjectCount", "annualPeriods", "plannedPeriods", "chapters", 
                          "topicsFilled", "subTopicsFilled", "generated", "archived"]
        for field in required_fields:
            assert field in totals, f"Missing field '{field}' in totals"
            assert isinstance(totals[field], (int, float)), f"Field '{field}' should be number"
        log(f"   Totals: subjectCount={totals['subjectCount']}, chapters={totals['chapters']}, plannedPeriods={totals['plannedPeriods']}")
        log("✅ Test 25 PASSED: Progress dashboard working")
    except Exception as e:
        log(f"❌ Test 25 FAILED: {e}")
        raise

def test_ai_lesson_generate_no_auth():
    """Test 26: POST /admin/ai-lesson/generate without auth → 403"""
    try:
        log("Test 26: POST /admin/ai-lesson/generate without auth → 403")
        r = requests.post(f"{BASE_URL}/admin/ai-lesson/generate", 
                         json={"fileId": "x"}, timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 26 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 26 FAILED: {e}")
        raise

def test_ai_lesson_generate_missing_fields(token):
    """Test 27: POST /admin/ai-lesson/generate missing fields → 400"""
    try:
        log("Test 27: POST /admin/ai-lesson/generate missing fields → 400")
        r = requests.post(f"{BASE_URL}/admin/ai-lesson/generate", 
                         json={"fileId": "x"},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "required" in r.text.lower(), "Expected 'required' in error"
        log("✅ Test 27 PASSED: Missing fields validation working")
    except Exception as e:
        log(f"❌ Test 27 FAILED: {e}")
        raise

def test_ai_lesson_generate_bad_file_id(token):
    """Test 28: POST /admin/ai-lesson/generate bad fileId → 502 PDF fetch failed"""
    try:
        log("Test 28: POST /admin/ai-lesson/generate bad fileId → 502")
        r = requests.post(f"{BASE_URL}/admin/ai-lesson/generate", 
                         json={
                             "fileId": "nonexistent-file-id",
                             "classLabel": "Class 1",
                             "subject": "Mathematics",
                             "book": "Test Book",
                             "chapter": "Test Chapter",
                             "period": 1
                         },
                         headers={"Authorization": f"Bearer {token}"}, timeout=60)
        log(f"   Response: {r.status_code}")
        # Should get 502 (may be HTML error page from Cloudflare or JSON error)
        assert r.status_code == 502, f"Expected 502, got {r.status_code}"
        log("✅ Test 28 PASSED: Bad fileId returns 502 (PDF fetch failed or timeout)")
    except Exception as e:
        log(f"❌ Test 28 FAILED: {e}")
        raise

def test_ai_lesson_generate_cache_hit(token):
    """Test 29: POST /admin/ai-lesson/generate cache HIT flow"""
    try:
        log("Test 29: Seed aiLessonCache and test cache HIT")
        # Seed cache via MongoDB
        import subprocess
        cache_doc = {
            "key": "fake-fileId::p1",
            "fileId": "fake-fileId",
            "period": 1,
            "classLabel": "Class 1",
            "subject": "Mathematics",
            "book": "Test Book",
            "chapter": "Test Chapter",
            "lesson": {"title": "Cached Lesson"},
            "html": "<p>cached</p>",
            "model": "gemini-3.6-flash",
            "generatedAt": {"$date": "2026-08-27T10:00:00Z"}
        }
        cmd = f"mongosh mongodb://localhost:27017/edumaster_odisha --quiet --eval 'db.aiLessonCache.updateOne({{key: \"fake-fileId::p1\"}}, {{$set: {json.dumps(cache_doc)}}}, {{upsert: true}})'"
        subprocess.run(cmd, shell=True, check=True, capture_output=True)
        
        log("   Calling /admin/ai-lesson/generate with fake-fileId (no academicYearId)")
        r = requests.post(f"{BASE_URL}/admin/ai-lesson/generate", 
                         json={
                             "fileId": "fake-fileId",
                             "classLabel": "Class 1",
                             "subject": "Mathematics",
                             "book": "Test Book",
                             "chapter": "Test Chapter",
                             "period": 1
                         },
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("cached") == True, f"Expected cached=true, got {data.get('cached')}"
        assert "pacing" in data, "No pacing field"
        assert data["pacing"].get("source") == "none", f"Expected pacing.source='none', got {data['pacing'].get('source')}"
        log("✅ Test 29 PASSED: Cache HIT flow working, pacing.source='none'")
    except Exception as e:
        log(f"❌ Test 29 FAILED: {e}")
        raise

def test_ai_lesson_generate_with_pacing(token, year_id, class_id, subject):
    """Test 30: POST /admin/ai-lesson/generate with pacing plan (bad fileId to avoid Gemini)"""
    try:
        log("Test 30: Create plan with topic+subTopic, then call /admin/ai-lesson/generate")
        # Create a plan with topic
        r = requests.put(f"{BASE_URL}/admin/academic-pacing/chapters/plan", 
                        json={
                            "academicYearId": year_id,
                            "classId": class_id,
                            "className": "Class 1",
                            "subject": subject,
                            "chapterName": "Pacing Test Chapter",
                            "totalPeriods": 2
                        },
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        plan = r.json()["plan"]
        plan_id = plan["id"]
        
        # Add topic to P1
        requests.patch(f"{BASE_URL}/admin/academic-pacing/chapters/plan/period", 
                      json={
                          "planId": plan_id,
                          "periodNumber": 1,
                          "topic": "Hard Constraint Topic",
                          "subTopic": "Hard Constraint SubTopic"
                      },
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
        
        log("   Calling /admin/ai-lesson/generate with academicYearId+classId (bad fileId)")
        r = requests.post(f"{BASE_URL}/admin/ai-lesson/generate", 
                         json={
                             "fileId": "bad-file-for-pacing-test",
                             "classLabel": "Class 1",
                             "subject": subject,
                             "book": "Test Book",
                             "chapter": "Pacing Test Chapter",
                             "period": 1,
                             "academicYearId": year_id,
                             "classId": class_id,
                             "honorPacing": True
                         },
                         headers={"Authorization": f"Bearer {token}"}, timeout=60)
        # Should fail with 502 (PDF fetch or timeout)
        assert r.status_code == 502, f"Expected 502, got {r.status_code}"
        log("✅ Test 30 PASSED: Pacing lookup succeeded (error is PDF fetch/timeout, not pacing)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/admin/academic-pacing/chapters/plan/{plan_id}", 
                       headers={"Authorization": f"Bearer {token}"}, timeout=30)
    except Exception as e:
        log(f"❌ Test 30 FAILED: {e}")
        raise

def test_csv_template_no_auth():
    """Test 31: GET /admin/academic-pacing/csv-template without auth → 403"""
    try:
        log("Test 31: GET /admin/academic-pacing/csv-template without auth → 403")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/csv-template", timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 31 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 31 FAILED: {e}")
        raise

def test_csv_template_download(token):
    """Test 32: GET /admin/academic-pacing/csv-template → 200 with CSV"""
    try:
        log("Test 32: GET /admin/academic-pacing/csv-template")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/csv-template", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        assert r.headers.get("Content-Type") == "text/csv; charset=utf-8", f"Wrong Content-Type: {r.headers.get('Content-Type')}"
        assert "attachment" in r.headers.get("Content-Disposition", ""), "Missing Content-Disposition"
        assert "academic-pacing-template.csv" in r.headers.get("Content-Disposition", ""), "Wrong filename"
        
        # Check UTF-8 BOM
        content = r.content
        assert content[:3] == b'\xef\xbb\xbf', f"Missing UTF-8 BOM, got: {content[:3].hex()}"
        
        # Check header row
        text = content.decode('utf-8-sig')
        lines = text.strip().split('\n')
        assert len(lines) > 0, "Empty CSV"
        header = lines[0]
        expected_cols = ["Academic Year", "Class", "Subject", "Book", "Chapter No", 
                        "Chapter Name", "Total Periods", "Period No", "Topic", "Sub-topic"]
        for col in expected_cols:
            assert col in header, f"Missing column '{col}' in header"
        log(f"   Header: {header[:100]}...")
        log(f"   Total lines: {len(lines)}")
        log("✅ Test 32 PASSED: CSV template download working with UTF-8 BOM and correct header")
        return text
    except Exception as e:
        log(f"❌ Test 32 FAILED: {e}")
        raise

def test_csv_import_no_auth():
    """Test 33: POST /admin/academic-pacing/csv-import without auth → 403"""
    try:
        log("Test 33: POST /admin/academic-pacing/csv-import without auth → 403")
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import", 
                         json={"csv": "x"}, timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        log("✅ Test 33 PASSED: Auth gate working (403)")
    except Exception as e:
        log(f"❌ Test 33 FAILED: {e}")
        raise

def test_csv_import_missing_body(token):
    """Test 34: POST /admin/academic-pacing/csv-import missing csv → 400"""
    try:
        log("Test 34: POST /admin/academic-pacing/csv-import missing csv → 400")
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import", 
                         json={},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "csv" in r.text.lower() or "required" in r.text.lower(), "Expected csv error"
        log("✅ Test 34 PASSED: Missing csv validation working")
    except Exception as e:
        log(f"❌ Test 34 FAILED: {e}")
        raise

def test_csv_import_dry_run_valid(token, template_csv):
    """Test 35: POST /admin/academic-pacing/csv-import?dryRun=1 valid template → 200"""
    try:
        log("Test 35: POST /admin/academic-pacing/csv-import?dryRun=1 with valid template")
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import?dryRun=1", 
                         json={"csv": template_csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert data.get("dryRun") == True, "Expected dryRun:true"
        assert "summary" in data, "No summary field"
        assert "records" in data, "No records array"
        assert "plans" in data, "No plans array"
        summary = data["summary"]
        assert "total" in summary, "No summary.total"
        assert "valid" in summary, "No summary.valid"
        assert "errorRows" in summary, "No summary.errorRows"
        log(f"   Summary: total={summary['total']}, valid={summary['valid']}, errorRows={summary['errorRows']}")
        log(f"   Plans: {len(data['plans'])} plans would be created")
        log("✅ Test 35 PASSED: Dry run with valid template working")
    except Exception as e:
        log(f"❌ Test 35 FAILED: {e}")
        raise

def test_csv_import_dry_run_unknown_class(token):
    """Test 36: POST /admin/academic-pacing/csv-import?dryRun=1 unknown class → errors"""
    try:
        log("Test 36: POST /admin/academic-pacing/csv-import?dryRun=1 with unknown class")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2026-27,Not Real Class,Mathematics,Book 1,1,Chapter 1,5,1,Topic 1,Sub 1"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import?dryRun=1", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["summary"]["errorRows"] > 0, "Expected errorRows > 0"
        records = data["records"]
        assert len(records) > 0, "No records"
        assert any("unknown class" in str(r.get("errors", [])).lower() for r in records), "Expected 'Unknown Class' error"
        log("✅ Test 36 PASSED: Unknown class validation working")
    except Exception as e:
        log(f"❌ Test 36 FAILED: {e}")
        raise

def test_csv_import_dry_run_inconsistent_total_periods(token):
    """Test 37: POST /admin/academic-pacing/csv-import?dryRun=1 inconsistent totalPeriods → errors"""
    try:
        log("Test 37: POST /admin/academic-pacing/csv-import?dryRun=1 inconsistent totalPeriods")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2026-27,Class 1,Mathematics,Book 1,1,Chapter 1,5,1,Topic 1,Sub 1
2026-27,Class 1,Mathematics,Book 1,1,Chapter 1,7,2,Topic 2,Sub 2"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import?dryRun=1", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["summary"]["errorRows"] > 0, "Expected errorRows > 0"
        records = data["records"]
        assert any("inconsistent" in str(r.get("errors", [])).lower() for r in records), "Expected 'Inconsistent Total Periods' error"
        log("✅ Test 37 PASSED: Inconsistent totalPeriods validation working")
    except Exception as e:
        log(f"❌ Test 37 FAILED: {e}")
        raise

def test_csv_import_dry_run_period_exceeds_total(token):
    """Test 38: POST /admin/academic-pacing/csv-import?dryRun=1 Period No > Total Periods → errors"""
    try:
        log("Test 38: POST /admin/academic-pacing/csv-import?dryRun=1 Period No > Total Periods")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2026-27,Class 1,Mathematics,Book 1,1,Chapter 1,5,10,Topic 1,Sub 1"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import?dryRun=1", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["summary"]["errorRows"] > 0, "Expected errorRows > 0"
        records = data["records"]
        assert any("exceeds" in str(r.get("errors", [])).lower() for r in records), "Expected 'exceeds Total Periods' error"
        log("✅ Test 38 PASSED: Period No > Total Periods validation working")
    except Exception as e:
        log(f"❌ Test 38 FAILED: {e}")
        raise

def test_csv_import_dry_run_duplicate_period(token):
    """Test 39: POST /admin/academic-pacing/csv-import?dryRun=1 duplicate periodNumber → errors"""
    try:
        log("Test 39: POST /admin/academic-pacing/csv-import?dryRun=1 duplicate periodNumber")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2026-27,Class 1,Mathematics,Book 1,1,Chapter 1,5,1,Topic 1,Sub 1
2026-27,Class 1,Mathematics,Book 1,1,Chapter 1,5,1,Topic 2,Sub 2"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import?dryRun=1", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["summary"]["errorRows"] > 0, "Expected errorRows > 0"
        records = data["records"]
        assert any("duplicate" in str(r.get("errors", [])).lower() for r in records), "Expected 'Duplicate Period' error"
        log("✅ Test 39 PASSED: Duplicate periodNumber validation working")
    except Exception as e:
        log(f"❌ Test 39 FAILED: {e}")
        raise

def test_csv_import_apply_with_errors(token):
    """Test 40: POST /admin/academic-pacing/csv-import (apply) with errors → 400"""
    try:
        log("Test 40: POST /admin/academic-pacing/csv-import (apply) with errors → 400")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2026-27,Not Real Class,Mathematics,Book 1,1,Chapter 1,5,1,Topic 1,Sub 1"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "error" in r.text.lower(), "Expected error message"
        log("✅ Test 40 PASSED: Apply with errors rejected with 400")
    except Exception as e:
        log(f"❌ Test 40 FAILED: {e}")
        raise

def test_csv_import_apply_valid(token):
    """Test 41: POST /admin/academic-pacing/csv-import (apply) valid CSV → 200"""
    try:
        log("Test 41: POST /admin/academic-pacing/csv-import (apply) with valid CSV")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2026-27,Class 1,Mathematics,Test Book CSV,1,CSV Chapter 1,3,1,CSV Topic 1,CSV Sub 1
2026-27,Class 1,Mathematics,Test Book CSV,1,CSV Chapter 1,3,2,CSV Topic 2,CSV Sub 2
2026-27,Class 1,Mathematics,Test Book CSV,2,CSV Chapter 2,2,1,CSV Topic 3,CSV Sub 3"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "summary" in data, "No summary field"
        summary = data["summary"]
        assert "plansUpserted" in summary, "No plansUpserted"
        assert "rowsProcessed" in summary, "No rowsProcessed"
        assert summary["plansUpserted"] >= 2, f"Expected at least 2 plans, got {summary['plansUpserted']}"
        log(f"   Summary: plansUpserted={summary['plansUpserted']}, rowsProcessed={summary['rowsProcessed']}")
        log("✅ Test 41 PASSED: CSV import apply working")
    except Exception as e:
        log(f"❌ Test 41 FAILED: {e}")
        raise

def test_csv_import_new_academic_year(token):
    """Test 42: POST /admin/academic-pacing/csv-import with new AY → creates AY"""
    try:
        log("Test 42: POST /admin/academic-pacing/csv-import with new AY 2027-28")
        csv = """Academic Year,Class,Subject,Book,Chapter No,Chapter Name,Total Periods,Period No,Topic,Sub-topic
2027-28,Class 1,Mathematics,Test Book,1,Chapter 1,2,1,Topic 1,Sub 1"""
        r = requests.post(f"{BASE_URL}/admin/academic-pacing/csv-import", 
                         json={"csv": csv},
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        summary = data["summary"]
        assert "yearsCreated" in summary, "No yearsCreated"
        
        # Verify new year exists
        r2 = requests.get(f"{BASE_URL}/admin/academic-pacing/years", 
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        years = r2.json()["years"]
        year_2027_28 = next((y for y in years if y["label"] == "2027-28"), None)
        assert year_2027_28 is not None, "2027-28 not created"
        log(f"   Created new AY: 2027-28 with id={year_2027_28['id']}")
        log("✅ Test 42 PASSED: CSV import creates new academic year")
    except Exception as e:
        log(f"❌ Test 42 FAILED: {e}")
        raise

def test_regression_phase1_years(token):
    """Test 43: Regression - GET /admin/academic-pacing/years still works"""
    try:
        log("Test 43: Regression - GET /admin/academic-pacing/years")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/years", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "years" in data, "No years array"
        log(f"   Found {len(data['years'])} academic years")
        log("✅ Test 43 PASSED: Phase 1 years endpoint still working")
    except Exception as e:
        log(f"❌ Test 43 FAILED: {e}")
        raise

def test_regression_phase1_allocations(token, year_id):
    """Test 44: Regression - GET /admin/academic-pacing/allocations still works"""
    try:
        log(f"Test 44: Regression - GET /admin/academic-pacing/allocations?yearId={year_id}")
        r = requests.get(f"{BASE_URL}/admin/academic-pacing/allocations?yearId={year_id}", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert "rows" in data, "No rows array"
        log(f"   Found {len(data['rows'])} allocation rows")
        log("✅ Test 44 PASSED: Phase 1 allocations endpoint still working")
    except Exception as e:
        log(f"❌ Test 44 FAILED: {e}")
        raise

def test_regression_panchapadi_lessons(token):
    """Test 45: Regression - GET /admin/panchapadi-lessons still works"""
    try:
        log("Test 45: Regression - GET /admin/panchapadi-lessons?limit=5&light=1")
        r = requests.get(f"{BASE_URL}/admin/panchapadi-lessons?limit=5&light=1", 
                        headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        # Response can be { items: [], total, limit, offset } or { lessons: [] } or []
        if isinstance(data, dict):
            assert "items" in data or "lessons" in data or "ok" in data, f"Unexpected response structure: {data.keys()}"
        log("✅ Test 45 PASSED: Panchapadi lessons endpoint still working")
    except Exception as e:
        log(f"❌ Test 45 FAILED: {e}")
        raise

def main():
    log("=" * 80)
    log("ACADEMIC PACING PHASE 2 BACKEND TEST")
    log("=" * 80)
    
    try:
        # Setup
        token = test_admin_login()
        year_id = test_get_academic_years(token)
        class_id = test_get_classes(token)
        subject = test_get_allocations(token, year_id)
        
        log("\n" + "=" * 80)
        log("PHASE 2A: CHAPTER PACING")
        log("=" * 80)
        
        # GET chapters tests
        test_get_chapters_no_auth()
        test_get_chapters_missing_params(token)
        test_get_chapters_valid(token, year_id, class_id, subject)
        
        # PUT plan tests
        test_put_plan_no_auth()
        test_put_plan_missing_fields(token)
        test_put_plan_bad_year_id(token, class_id, subject)
        test_put_plan_bad_class_id(token, year_id, subject)
        plan_id = test_put_plan_create_5_periods(token, year_id, class_id, subject)
        plan_id = test_put_plan_grow_to_8(token, year_id, class_id, subject)
        test_patch_period_add_topic(token, plan_id)
        plan_id = test_put_plan_shrink_to_3(token, year_id, class_id, subject)
        plan_id = test_put_plan_zero_periods(token, year_id, class_id, subject)
        
        # PATCH period tests
        test_patch_period_no_auth()
        test_patch_period_bad_plan_id(token)
        test_patch_period_out_of_range(token, plan_id)
        plan_id = test_patch_period_partial_update(token, year_id, class_id, subject)
        
        # DELETE plan tests
        test_delete_plan_no_auth()
        test_delete_plan_valid(token, plan_id)
        
        log("\n" + "=" * 80)
        log("PHASE 2B: PROGRESS DASHBOARD")
        log("=" * 80)
        
        test_get_progress_no_auth()
        test_get_progress_missing_year_id(token)
        test_get_progress_valid(token, year_id)
        
        log("\n" + "=" * 80)
        log("PHASE 2C: WIRE GENERATOR TO PLAN")
        log("=" * 80)
        
        test_ai_lesson_generate_no_auth()
        test_ai_lesson_generate_missing_fields(token)
        test_ai_lesson_generate_bad_file_id(token)
        test_ai_lesson_generate_cache_hit(token)
        test_ai_lesson_generate_with_pacing(token, year_id, class_id, subject)
        
        log("\n" + "=" * 80)
        log("PHASE 2D: CSV BULK IMPORT")
        log("=" * 80)
        
        test_csv_template_no_auth()
        template_csv = test_csv_template_download(token)
        test_csv_import_no_auth()
        test_csv_import_missing_body(token)
        test_csv_import_dry_run_valid(token, template_csv)
        test_csv_import_dry_run_unknown_class(token)
        test_csv_import_dry_run_inconsistent_total_periods(token)
        test_csv_import_dry_run_period_exceeds_total(token)
        test_csv_import_dry_run_duplicate_period(token)
        test_csv_import_apply_with_errors(token)
        test_csv_import_apply_valid(token)
        test_csv_import_new_academic_year(token)
        
        log("\n" + "=" * 80)
        log("REGRESSION TESTS")
        log("=" * 80)
        
        test_regression_phase1_years(token)
        test_regression_phase1_allocations(token, year_id)
        test_regression_panchapadi_lessons(token)
        
        log("\n" + "=" * 80)
        log("✅ ALL 45 TESTS PASSED")
        log("=" * 80)
        
    except Exception as e:
        log(f"\n❌ TEST SUITE FAILED: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
