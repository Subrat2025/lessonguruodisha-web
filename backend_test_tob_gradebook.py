#!/usr/bin/env python3
"""
TOB Phase D HPC Gradebook + Refactored My Class Records Dispatch — Backend Test
Tests the gradebook GET/POST/export endpoints and verifies the refactored dispatch
(rosters/records/profile moved from route.js to lib/tob/records.js).
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test data tracking for cleanup
test_rosters = []
test_gradebook_rows = []

def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_login():
    """Login as admin and return token"""
    log("TEST: Admin login")
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        
        if r.status_code != 200:
            log(f"❌ Login failed: {r.status_code}")
            return None
        
        data = r.json()
        if not data.get("token"):
            log(f"❌ No token in response: {data}")
            return None
        
        log(f"✅ Login successful, token received")
        return data["token"]
    except Exception as e:
        log(f"❌ Login exception: {e}")
        return None

def test_auth_gating(token):
    """A) REFACTOR REGRESSION - Test auth gating (401 without token)"""
    log("\n=== A) REFACTOR REGRESSION - AUTH GATING ===")
    
    endpoints = [
        ("GET", "/tob/rosters", None),
        ("POST", "/tob/rosters", {"class": "4", "section": "TEST"}),
        ("GET", "/tob/records", {"itemId": "test", "part": "task", "term": "1", "num": "1"}),
        ("POST", "/tob/records", {"itemId": "test", "part": "task"}),
        ("POST", "/tob/profile", {"school": "Test"}),
        ("GET", "/tob/gradebook", {"rosterId": "test", "subject": "OD"}),
    ]
    
    passed = 0
    failed = 0
    
    for method, path, payload in endpoints:
        try:
            if method == "GET":
                r = requests.get(f"{BASE_URL}{path}", params=payload, timeout=10)
            else:
                r = requests.post(f"{BASE_URL}{path}", json=payload, timeout=10)
            
            if r.status_code == 401:
                log(f"✅ {method} {path} → 401 (correct)")
                passed += 1
            else:
                log(f"❌ {method} {path} → {r.status_code} (expected 401)")
                failed += 1
        except Exception as e:
            log(f"❌ {method} {path} exception: {e}")
            failed += 1
    
    log(f"\nAuth gating: {passed} passed, {failed} failed")
    return passed, failed

def test_roster_crud(token):
    """A) REFACTOR REGRESSION - Test roster CRUD with token"""
    log("\n=== A) REFACTOR REGRESSION - ROSTER CRUD ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    roster_id = None
    
    # 1. Create roster with paste
    log("TEST: POST /tob/rosters (create with paste)")
    try:
        r = requests.post(f"{BASE_URL}/tob/rosters", json={
            "class": "4",
            "section": "RD",
            "paste": "1\tRahul\n2\tPriya\nSunil"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok") and data.get("id"):
                roster_id = data["id"]
                test_rosters.append(roster_id)
                log(f"✅ Roster created: {roster_id}")
                passed += 1
            else:
                log(f"❌ Roster creation failed: {data}")
                failed += 1
        else:
            log(f"❌ POST /tob/rosters → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST /tob/rosters exception: {e}")
        failed += 1
    
    if not roster_id:
        log("❌ Cannot continue without roster_id")
        return passed, failed, None, []
    
    # 2. List rosters (filter by class=4)
    log("TEST: GET /tob/rosters?class=4")
    try:
        r = requests.get(f"{BASE_URL}/tob/rosters", params={"class": "4"}, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            rosters = data.get("rosters", [])
            found = any(r["id"] == roster_id for r in rosters)
            if found:
                # Check students
                roster = next(r for r in rosters if r["id"] == roster_id)
                students = roster.get("students", [])
                if len(students) == 3:
                    log(f"✅ Roster found with 3 students: {[s.get('name') for s in students]}")
                    passed += 1
                else:
                    log(f"❌ Expected 3 students, got {len(students)}")
                    failed += 1
            else:
                log(f"❌ Roster {roster_id} not found in list")
                failed += 1
        else:
            log(f"❌ GET /tob/rosters → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ GET /tob/rosters exception: {e}")
        failed += 1
    
    # 3. Get single roster
    log(f"TEST: GET /tob/rosters/{roster_id}")
    try:
        r = requests.get(f"{BASE_URL}/tob/rosters/{roster_id}", headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("roster", {}).get("id") == roster_id:
                log(f"✅ Single roster retrieved")
                passed += 1
            else:
                log(f"❌ Roster data mismatch")
                failed += 1
        else:
            log(f"❌ GET /tob/rosters/{roster_id} → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ GET /tob/rosters/{roster_id} exception: {e}")
        failed += 1
    
    # Get students for later use
    students = []
    try:
        r = requests.get(f"{BASE_URL}/tob/rosters/{roster_id}", headers=headers, timeout=10)
        if r.status_code == 200:
            students = r.json().get("roster", {}).get("students", [])
    except:
        pass
    
    log(f"\nRoster CRUD: {passed} passed, {failed} failed")
    return passed, failed, roster_id, students

def test_records(token, roster_id, students):
    """A) REFACTOR REGRESSION - Test records save/get"""
    log("\n=== A) REFACTOR REGRESSION - RECORDS ===")
    
    if not roster_id or not students:
        log("❌ Cannot test records without roster and students")
        return 0, 1
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    
    # Get a published chapter itemId from Class 4 OD
    log("TEST: Get published chapter itemId")
    item_id = None
    try:
        r = requests.get(f"{BASE_URL}/tob/items", params={"class": "4", "subject": "OD"}, headers=headers, timeout=10)
        if r.status_code == 200:
            items = r.json().get("items", [])
            chapters = [i for i in items if i.get("type") == "chapter"]
            if chapters:
                item_id = chapters[0]["id"]
                log(f"✅ Found chapter itemId: {item_id}")
            else:
                log(f"❌ No chapters found")
                return 0, 1
        else:
            log(f"❌ GET /tob/items → {r.status_code}")
            return 0, 1
    except Exception as e:
        log(f"❌ GET /tob/items exception: {e}")
        return 0, 1
    
    student_id = students[0]["id"]
    
    # Save a record
    log("TEST: POST /tob/records (save record)")
    try:
        r = requests.post(f"{BASE_URL}/tob/records", json={
            "itemId": item_id,
            "part": "task",
            "term": 1,
            "pos": 1,
            "studentId": student_id,
            "rosterId": roster_id,
            "class": "4",
            "subject_id": "OD",
            "ticks": {"0": True},
            "marks": 9,
            "remarks": "hi"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok"):
                log(f"✅ Record saved")
                passed += 1
            else:
                log(f"❌ Record save failed: {data}")
                failed += 1
        else:
            log(f"❌ POST /tob/records → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST /tob/records exception: {e}")
        failed += 1
    
    # Get the record back
    log("TEST: GET /tob/records (get record)")
    try:
        r = requests.get(f"{BASE_URL}/tob/records", params={
            "itemId": item_id,
            "part": "task",
            "term": "1",
            "num": "1",
            "studentId": student_id
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            record = data.get("record")
            if record and record.get("marks") == 9:
                log(f"✅ Record retrieved with marks=9")
                passed += 1
            else:
                log(f"❌ Record not found or marks mismatch: {record}")
                failed += 1
        else:
            log(f"❌ GET /tob/records → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ GET /tob/records exception: {e}")
        failed += 1
    
    log(f"\nRecords: {passed} passed, {failed} failed")
    return passed, failed

def test_profile(token):
    """A) REFACTOR REGRESSION - Test profile save"""
    log("\n=== A) REFACTOR REGRESSION - PROFILE ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    
    log("TEST: POST /tob/profile")
    try:
        r = requests.post(f"{BASE_URL}/tob/profile", json={
            "school": "Test School"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok") and data.get("school") == "Test School":
                log(f"✅ Profile saved")
                passed += 1
            else:
                log(f"❌ Profile save failed: {data}")
                failed += 1
        else:
            log(f"❌ POST /tob/profile → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST /tob/profile exception: {e}")
        failed += 1
    
    log(f"\nProfile: {passed} passed, {failed} failed")
    return passed, failed

def test_gradebook_preparatory(token, roster_id, students):
    """B) GRADEBOOK — Preparatory (Class 4)"""
    log("\n=== B) GRADEBOOK — PREPARATORY (CLASS 4) ===")
    
    if not roster_id or not students:
        log("❌ Cannot test gradebook without roster and students")
        return 0, 1
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    
    # Get a published chapter itemId
    item_id = None
    try:
        r = requests.get(f"{BASE_URL}/tob/items", params={"class": "4", "subject": "OD"}, headers=headers, timeout=10)
        if r.status_code == 200:
            items = r.json().get("items", [])
            chapters = [i for i in items if i.get("type") == "chapter"]
            if chapters:
                item_id = chapters[0]["id"]
        else:
            log(f"❌ Cannot get items")
            return 0, 1
    except Exception as e:
        log(f"❌ GET /tob/items exception: {e}")
        return 0, 1
    
    student_id = students[0]["id"]
    
    # 1. Save several task marks for term 1
    log("TEST: Save task marks (pos 1, 2, 3)")
    marks_list = [8, 9, 7]
    for pos, marks in enumerate(marks_list, 1):
        try:
            r = requests.post(f"{BASE_URL}/tob/records", json={
                "itemId": item_id,
                "part": "task",
                "term": 1,
                "pos": pos,
                "studentId": student_id,
                "rosterId": roster_id,
                "class": "4",
                "subject_id": "OD",
                "marks": marks
            }, headers=headers, timeout=10)
            
            if r.status_code == 200 and r.json().get("ok"):
                log(f"✅ Task pos {pos} marks={marks} saved")
            else:
                log(f"❌ Task pos {pos} save failed")
        except Exception as e:
            log(f"❌ Task pos {pos} exception: {e}")
    
    # 2. Save a project mark
    log("TEST: Save project mark")
    try:
        r = requests.post(f"{BASE_URL}/tob/records", json={
            "itemId": item_id,
            "part": "project",
            "term": 1,
            "pos": 1,
            "studentId": student_id,
            "rosterId": roster_id,
            "class": "4",
            "subject_id": "OD",
            "marks": 12
        }, headers=headers, timeout=10)
        
        if r.status_code == 200 and r.json().get("ok"):
            log(f"✅ Project marks=12 saved")
        else:
            log(f"❌ Project save failed")
    except Exception as e:
        log(f"❌ Project save exception: {e}")
    
    # 3. GET gradebook
    log("TEST: GET /tob/gradebook")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook", params={
            "rosterId": roster_id,
            "subject": "OD"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            fw = data.get("fw", {})
            suggest = data.get("suggest", {})
            
            # Check framework
            if fw.get("stage") == "Preparatory" and fw.get("marks") == True:
                log(f"✅ Framework: stage=Preparatory, marks=true")
                passed += 1
            else:
                log(f"❌ Framework mismatch: {fw}")
                failed += 1
            
            # Check written/project values
            if fw.get("written") == 10 and fw.get("project") == 15:
                log(f"✅ Framework: written=10, project=15")
                passed += 1
            else:
                log(f"❌ Framework values: written={fw.get('written')}, project={fw.get('project')}")
                failed += 1
            
            # Check suggest
            student_suggest = suggest.get(student_id, {}).get("1", {})
            written_avg = student_suggest.get("written")
            project_avg = student_suggest.get("project")
            
            if written_avg is not None and 7 <= written_avg <= 9:
                log(f"✅ Suggest written≈{written_avg} (avg of 8,9,7)")
                passed += 1
            else:
                log(f"❌ Suggest written={written_avg} (expected ≈8)")
                failed += 1
            
            if project_avg == 12:
                log(f"✅ Suggest project={project_avg}")
                passed += 1
            else:
                log(f"❌ Suggest project={project_avg} (expected 12)")
                failed += 1
        else:
            log(f"❌ GET /tob/gradebook → {r.status_code}")
            failed += 4
    except Exception as e:
        log(f"❌ GET /tob/gradebook exception: {e}")
        failed += 4
    
    # 4. POST gradebook (save marks)
    log("TEST: POST /tob/gradebook (save marks)")
    try:
        r = requests.post(f"{BASE_URL}/tob/gradebook", json={
            "rosterId": roster_id,
            "subject_id": "OD",
            "term": 1,
            "studentId": student_id,
            "class": "4",
            "written": 8,
            "project": 12,
            "fa": 20,
            "sa": 40
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok"):
                log(f"✅ Gradebook row saved")
                passed += 1
                test_gradebook_rows.append({"rosterId": roster_id, "subject": "OD", "term": 1, "studentId": student_id})
            else:
                log(f"❌ Gradebook save failed: {data}")
                failed += 1
        else:
            log(f"❌ POST /tob/gradebook → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST /tob/gradebook exception: {e}")
        failed += 1
    
    # 5. GET gradebook again to verify saved values
    log("TEST: GET /tob/gradebook (verify saved)")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook", params={
            "rosterId": roster_id,
            "subject": "OD"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            saved = data.get("saved", {})
            key = f"{student_id}|1"
            row = saved.get(key, {})
            
            if row.get("written") == 8 and row.get("project") == 12 and row.get("fa") == 20 and row.get("sa") == 40:
                log(f"✅ Saved row verified: written=8, project=12, fa=20, sa=40")
                passed += 1
            else:
                log(f"❌ Saved row mismatch: {row}")
                failed += 1
        else:
            log(f"❌ GET /tob/gradebook → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ GET /tob/gradebook exception: {e}")
        failed += 1
    
    # 6. Test upsert (call POST again, should not duplicate)
    log("TEST: POST /tob/gradebook again (upsert)")
    try:
        r = requests.post(f"{BASE_URL}/tob/gradebook", json={
            "rosterId": roster_id,
            "subject_id": "OD",
            "term": 1,
            "studentId": student_id,
            "class": "4",
            "written": 8,
            "project": 12,
            "fa": 20,
            "sa": 40
        }, headers=headers, timeout=10)
        
        if r.status_code == 200 and r.json().get("ok"):
            # Verify no duplicate
            r2 = requests.get(f"{BASE_URL}/tob/gradebook", params={
                "rosterId": roster_id,
                "subject": "OD"
            }, headers=headers, timeout=10)
            
            if r2.status_code == 200:
                saved = r2.json().get("saved", {})
                key = f"{student_id}|1"
                if key in saved and saved[key].get("written") == 8:
                    log(f"✅ Upsert works (no duplicate)")
                    passed += 1
                else:
                    log(f"❌ Upsert failed")
                    failed += 1
            else:
                log(f"❌ Cannot verify upsert")
                failed += 1
        else:
            log(f"❌ POST /tob/gradebook (upsert) failed")
            failed += 1
    except Exception as e:
        log(f"❌ Upsert exception: {e}")
        failed += 1
    
    # 7. Export xlsx
    log("TEST: GET /tob/gradebook/export?format=xlsx")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook/export", params={
            "rosterId": roster_id,
            "subject": "OD",
            "format": "xlsx"
        }, headers=headers, timeout=30)
        
        if r.status_code == 200:
            content_type = r.headers.get("Content-Type", "")
            size = len(r.content)
            if "spreadsheetml" in content_type and size > 3000:
                log(f"✅ Excel export: {size} bytes, content-type={content_type}")
                passed += 1
            else:
                log(f"❌ Excel export: size={size}, content-type={content_type}")
                failed += 1
        else:
            log(f"❌ GET /tob/gradebook/export (xlsx) → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ Excel export exception: {e}")
        failed += 1
    
    # 8. Export pdf
    log("TEST: GET /tob/gradebook/export?format=pdf")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook/export", params={
            "rosterId": roster_id,
            "subject": "OD",
            "format": "pdf"
        }, headers=headers, timeout=30)
        
        if r.status_code == 200:
            content_type = r.headers.get("Content-Type", "")
            size = len(r.content)
            if "application/pdf" in content_type and size > 10000:
                log(f"✅ PDF export: {size} bytes, content-type={content_type}")
                passed += 1
            else:
                log(f"❌ PDF export: size={size}, content-type={content_type}")
                failed += 1
        else:
            log(f"❌ GET /tob/gradebook/export (pdf) → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ PDF export exception: {e}")
        failed += 1
    
    # 9. Export without token (should be 401)
    log("TEST: GET /tob/gradebook/export without token")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook/export", params={
            "rosterId": roster_id,
            "subject": "OD",
            "format": "pdf"
        }, timeout=10)
        
        if r.status_code == 401:
            log(f"✅ Export without token → 401")
            passed += 1
        else:
            log(f"❌ Export without token → {r.status_code} (expected 401)")
            failed += 1
    except Exception as e:
        log(f"❌ Export without token exception: {e}")
        failed += 1
    
    log(f"\nGradebook Preparatory: {passed} passed, {failed} failed")
    return passed, failed

def test_gradebook_foundational(token):
    """C) GRADEBOOK — Foundational (Class 1)"""
    log("\n=== C) GRADEBOOK — FOUNDATIONAL (CLASS 1) ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    roster_id = None
    student_id = None
    
    # 1. Create Class 1 roster
    log("TEST: POST /tob/rosters (Class 1)")
    try:
        r = requests.post(f"{BASE_URL}/tob/rosters", json={
            "class": "1",
            "section": "F",
            "paste": "1\tBabu\n2\tMira"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok") and data.get("id"):
                roster_id = data["id"]
                test_rosters.append(roster_id)
                log(f"✅ Class 1 roster created: {roster_id}")
                passed += 1
            else:
                log(f"❌ Roster creation failed: {data}")
                failed += 1
        else:
            log(f"❌ POST /tob/rosters → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST /tob/rosters exception: {e}")
        failed += 1
    
    if not roster_id:
        log("❌ Cannot continue without roster_id")
        return passed, failed
    
    # Get students
    try:
        r = requests.get(f"{BASE_URL}/tob/rosters/{roster_id}", headers=headers, timeout=10)
        if r.status_code == 200:
            students = r.json().get("roster", {}).get("students", [])
            if students:
                student_id = students[0]["id"]
    except:
        pass
    
    if not student_id:
        log("❌ Cannot get student_id")
        return passed, failed
    
    # 2. GET gradebook (check framework)
    log("TEST: GET /tob/gradebook (Class 1)")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook", params={
            "rosterId": roster_id,
            "subject": "OD"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            fw = data.get("fw", {})
            
            # Check framework
            if fw.get("stage") == "Foundational" and fw.get("marks") == False:
                log(f"✅ Framework: stage=Foundational, marks=false")
                passed += 1
            else:
                log(f"❌ Framework mismatch: {fw}")
                failed += 1
            
            # Check levels
            levels = fw.get("levels", [])
            expected_levels = ["ପ୍ରାରମ୍ଭ", "ପ୍ରଗତି", "ନିପୁଣ"]
            if levels == expected_levels:
                log(f"✅ Levels: {levels}")
                passed += 1
            else:
                log(f"❌ Levels mismatch: {levels}")
                failed += 1
        else:
            log(f"❌ GET /tob/gradebook → {r.status_code}")
            failed += 2
    except Exception as e:
        log(f"❌ GET /tob/gradebook exception: {e}")
        failed += 2
    
    # 3. POST gradebook (save level)
    log("TEST: POST /tob/gradebook (save level)")
    try:
        r = requests.post(f"{BASE_URL}/tob/gradebook", json={
            "rosterId": roster_id,
            "subject_id": "OD",
            "term": 1,
            "studentId": student_id,
            "class": "1",
            "level": "ପ୍ରଗତି"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok"):
                log(f"✅ Level saved")
                passed += 1
                test_gradebook_rows.append({"rosterId": roster_id, "subject": "OD", "term": 1, "studentId": student_id})
            else:
                log(f"❌ Level save failed: {data}")
                failed += 1
        else:
            log(f"❌ POST /tob/gradebook → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST /tob/gradebook exception: {e}")
        failed += 1
    
    # 4. GET gradebook again to verify saved level
    log("TEST: GET /tob/gradebook (verify level)")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook", params={
            "rosterId": roster_id,
            "subject": "OD"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            saved = data.get("saved", {})
            key = f"{student_id}|1"
            row = saved.get(key, {})
            
            if row.get("level") == "ପ୍ରଗତି":
                log(f"✅ Saved level verified: ପ୍ରଗତି")
                passed += 1
            else:
                log(f"❌ Saved level mismatch: {row}")
                failed += 1
        else:
            log(f"❌ GET /tob/gradebook → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ GET /tob/gradebook exception: {e}")
        failed += 1
    
    # 5. Export xlsx
    log("TEST: GET /tob/gradebook/export?format=xlsx (Class 1)")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook/export", params={
            "rosterId": roster_id,
            "subject": "OD",
            "format": "xlsx"
        }, headers=headers, timeout=30)
        
        if r.status_code == 200:
            size = len(r.content)
            log(f"✅ Excel export (Class 1): {size} bytes")
            passed += 1
        else:
            log(f"❌ GET /tob/gradebook/export (xlsx) → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ Excel export exception: {e}")
        failed += 1
    
    # 6. Export pdf
    log("TEST: GET /tob/gradebook/export?format=pdf (Class 1)")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook/export", params={
            "rosterId": roster_id,
            "subject": "OD",
            "format": "pdf"
        }, headers=headers, timeout=30)
        
        if r.status_code == 200:
            size = len(r.content)
            log(f"✅ PDF export (Class 1): {size} bytes")
            passed += 1
        else:
            log(f"❌ GET /tob/gradebook/export (pdf) → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ PDF export exception: {e}")
        failed += 1
    
    log(f"\nGradebook Foundational: {passed} passed, {failed} failed")
    return passed, failed

def test_validation(token, roster_id):
    """D) VALIDATION"""
    log("\n=== D) VALIDATION ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    
    # 1. GET gradebook without rosterId
    log("TEST: GET /tob/gradebook without rosterId")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook", params={
            "subject": "OD"
        }, headers=headers, timeout=10)
        
        if r.status_code == 400:
            log(f"✅ GET without rosterId → 400")
            passed += 1
        else:
            log(f"❌ GET without rosterId → {r.status_code} (expected 400)")
            failed += 1
    except Exception as e:
        log(f"❌ GET without rosterId exception: {e}")
        failed += 1
    
    # 2. GET gradebook without subject
    log("TEST: GET /tob/gradebook without subject")
    try:
        r = requests.get(f"{BASE_URL}/tob/gradebook", params={
            "rosterId": roster_id or "test"
        }, headers=headers, timeout=10)
        
        if r.status_code == 400:
            log(f"✅ GET without subject → 400")
            passed += 1
        else:
            log(f"❌ GET without subject → {r.status_code} (expected 400)")
            failed += 1
    except Exception as e:
        log(f"❌ GET without subject exception: {e}")
        failed += 1
    
    # 3. POST gradebook missing term
    log("TEST: POST /tob/gradebook missing term")
    try:
        r = requests.post(f"{BASE_URL}/tob/gradebook", json={
            "rosterId": roster_id or "test",
            "subject_id": "OD",
            "studentId": "test",
            "class": "4"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok") == False:
                log(f"✅ POST missing term → ok:false")
                passed += 1
            else:
                log(f"❌ POST missing term → ok:true (expected false)")
                failed += 1
        else:
            log(f"❌ POST missing term → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST missing term exception: {e}")
        failed += 1
    
    # 4. POST gradebook missing studentId
    log("TEST: POST /tob/gradebook missing studentId")
    try:
        r = requests.post(f"{BASE_URL}/tob/gradebook", json={
            "rosterId": roster_id or "test",
            "subject_id": "OD",
            "term": 1,
            "class": "4"
        }, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            if data.get("ok") == False:
                log(f"✅ POST missing studentId → ok:false")
                passed += 1
            else:
                log(f"❌ POST missing studentId → ok:true (expected false)")
                failed += 1
        else:
            log(f"❌ POST missing studentId → {r.status_code}")
            failed += 1
    except Exception as e:
        log(f"❌ POST missing studentId exception: {e}")
        failed += 1
    
    log(f"\nValidation: {passed} passed, {failed} failed")
    return passed, failed

def test_cleanup(token):
    """E) CLEANUP"""
    log("\n=== E) CLEANUP ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    passed = 0
    failed = 0
    
    # Delete rosters
    for roster_id in test_rosters:
        log(f"TEST: DELETE /tob/rosters/{roster_id}")
        try:
            r = requests.delete(f"{BASE_URL}/tob/rosters/{roster_id}", headers=headers, timeout=10)
            
            if r.status_code == 200:
                data = r.json()
                if data.get("ok"):
                    log(f"✅ Roster {roster_id} deleted")
                    passed += 1
                else:
                    log(f"❌ Roster {roster_id} delete failed: {data}")
                    failed += 1
            else:
                log(f"❌ DELETE /tob/rosters/{roster_id} → {r.status_code}")
                failed += 1
        except Exception as e:
            log(f"❌ DELETE /tob/rosters/{roster_id} exception: {e}")
            failed += 1
        
        # Verify roster is deleted
        try:
            r = requests.get(f"{BASE_URL}/tob/rosters/{roster_id}", headers=headers, timeout=10)
            if r.status_code == 404:
                log(f"✅ Roster {roster_id} confirmed deleted (404)")
                passed += 1
            else:
                log(f"❌ Roster {roster_id} still exists: {r.status_code}")
                failed += 1
        except Exception as e:
            log(f"❌ Verify roster deleted exception: {e}")
            failed += 1
    
    log(f"\nCleanup: {passed} passed, {failed} failed")
    log(f"\nNOTE: Gradebook rows ({len(test_gradebook_rows)}) cannot be deleted via API (as per spec)")
    log(f"Gradebook rows left in database: {test_gradebook_rows}")
    return passed, failed

def main():
    """Main test runner"""
    log("=" * 80)
    log("TOB PHASE D HPC GRADEBOOK + REFACTORED DISPATCH — BACKEND TEST")
    log("=" * 80)
    
    # Login
    token = test_login()
    if not token:
        log("\n❌ FATAL: Cannot proceed without token")
        sys.exit(1)
    
    total_passed = 0
    total_failed = 0
    
    # A) REFACTOR REGRESSION
    p, f = test_auth_gating(token)
    total_passed += p
    total_failed += f
    
    p, f, roster_id, students = test_roster_crud(token)
    total_passed += p
    total_failed += f
    
    if roster_id and students:
        p, f = test_records(token, roster_id, students)
        total_passed += p
        total_failed += f
    
    p, f = test_profile(token)
    total_passed += p
    total_failed += f
    
    # B) GRADEBOOK — Preparatory
    if roster_id and students:
        p, f = test_gradebook_preparatory(token, roster_id, students)
        total_passed += p
        total_failed += f
    
    # C) GRADEBOOK — Foundational
    p, f = test_gradebook_foundational(token)
    total_passed += p
    total_failed += f
    
    # D) VALIDATION
    p, f = test_validation(token, roster_id)
    total_passed += p
    total_failed += f
    
    # E) CLEANUP
    p, f = test_cleanup(token)
    total_passed += p
    total_failed += f
    
    # Summary
    log("\n" + "=" * 80)
    log("FINAL SUMMARY")
    log("=" * 80)
    log(f"Total Passed: {total_passed}")
    log(f"Total Failed: {total_failed}")
    log(f"Success Rate: {total_passed}/{total_passed + total_failed} ({100 * total_passed / (total_passed + total_failed):.1f}%)")
    
    if total_failed == 0:
        log("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        log(f"\n❌ {total_failed} TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
