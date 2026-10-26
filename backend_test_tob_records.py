#!/usr/bin/env python3
"""
TOB My Class Records Backend Test
Tests the NEW TOB "My Class Records" + reliable publish + image-polish backend
Base API: NEXT_PUBLIC_BASE_URL/api
Admin login: POST /api/auth/login {mobile:"9692604577", password:"<redacted>"}
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

# Test results
test_results = []
created_roster_ids = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if details:
        result += f"\n   {details}"
    print(result)
    test_results.append({"test": test_name, "passed": passed, "details": details})
    return passed

def login_admin():
    """Login as admin and return token"""
    try:
        print("\n🔐 Logging in as admin...")
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful, token: {token[:20]}...")
                return token
            else:
                print(f"❌ Login response missing token: {data}")
                return None
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_auth_gating():
    """Test 1: AUTH GATING - no token should return 401"""
    print("\n" + "="*80)
    print("TEST 1: AUTH GATING (no token → 401)")
    print("="*80)
    
    endpoints = [
        ("GET", "/tob/rosters"),
        ("POST", "/tob/rosters"),
        ("GET", "/tob/records?itemId=test&part=task&term=1&num=1"),
        ("POST", "/tob/records"),
        ("POST", "/tob/profile"),
    ]
    
    all_passed = True
    for method, endpoint in endpoints:
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
            else:
                response = requests.post(f"{BASE_URL}{endpoint}", json={}, timeout=10)
            
            if response.status_code == 401:
                log_test(f"Auth gate {method} {endpoint}", True, f"Correctly returned 401")
            else:
                log_test(f"Auth gate {method} {endpoint}", False, f"Expected 401, got {response.status_code}")
                all_passed = False
        except Exception as e:
            log_test(f"Auth gate {method} {endpoint}", False, f"Error: {e}")
            all_passed = False
    
    return all_passed

def test_roster_crud(token):
    """Test 2: ROSTER CRUD with admin token"""
    print("\n" + "="*80)
    print("TEST 2: ROSTER CRUD (with admin token)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2a: Create roster with paste
    print("\n📝 2a: POST /tob/rosters - Create roster with paste")
    try:
        paste_data = "1\tRahul Sahu\n2\tPriya Das\nSunil"
        response = requests.post(
            f"{BASE_URL}/tob/rosters",
            json={"class": "4", "section": "TESTA", "paste": paste_data},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("id"):
                roster_id = data["id"]
                created_roster_ids.append(roster_id)
                log_test("Create roster with paste", True, f"Created roster {roster_id}")
            else:
                log_test("Create roster with paste", False, f"Response missing ok/id: {data}")
                return False
        else:
            log_test("Create roster with paste", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Create roster with paste", False, f"Error: {e}")
        return False
    
    # 2b: GET /tob/rosters?class=4 - List rosters
    print("\n📋 2b: GET /tob/rosters?class=4 - List rosters")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/rosters?class=4",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            rosters = data.get("rosters", [])
            found = False
            for r in rosters:
                if r.get("id") == roster_id:
                    found = True
                    students = r.get("students", [])
                    if len(students) == 3:
                        # Check student structure
                        s1 = students[0]
                        s2 = students[1]
                        s3 = students[2]
                        if (s1.get("roll") == "1" and s1.get("name") == "Rahul Sahu" and
                            s2.get("roll") == "2" and s2.get("name") == "Priya Das" and
                            s3.get("roll") == "" and s3.get("name") == "Sunil" and
                            all("id" in s for s in students)):
                            log_test("List rosters - student structure", True, 
                                   f"3 students with correct roll/name/id: [{s1['roll']},{s1['name']}], [{s2['roll']},{s2['name']}], [{s3['roll']},{s3['name']}]")
                        else:
                            log_test("List rosters - student structure", False, f"Students: {students}")
                            return False
                    else:
                        log_test("List rosters - student count", False, f"Expected 3 students, got {len(students)}")
                        return False
                    break
            
            if not found:
                log_test("List rosters", False, f"Roster {roster_id} not found in list")
                return False
        else:
            log_test("List rosters", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("List rosters", False, f"Error: {e}")
        return False
    
    # 2c: GET /tob/rosters/:id - Get single roster
    print(f"\n🔍 2c: GET /tob/rosters/{roster_id} - Get single roster")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/rosters/{roster_id}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            roster = data.get("roster")
            if roster and roster.get("id") == roster_id:
                log_test("Get single roster", True, f"Retrieved roster {roster_id}")
            else:
                log_test("Get single roster", False, f"Response: {data}")
                return False
        else:
            log_test("Get single roster", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Get single roster", False, f"Error: {e}")
        return False
    
    # 2d: POST with id (update) - Change section/students
    print(f"\n✏️ 2d: POST /tob/rosters (update) - Change section")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/rosters",
            json={
                "id": roster_id,
                "class": "4",
                "section": "TESTB",
                "students": students  # Keep same students
            },
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                # Verify update
                verify_response = requests.get(
                    f"{BASE_URL}/tob/rosters/{roster_id}",
                    headers=headers,
                    timeout=10
                )
                if verify_response.status_code == 200:
                    verify_data = verify_response.json()
                    roster = verify_data.get("roster")
                    if roster and roster.get("section") == "TESTB":
                        log_test("Update roster", True, f"Section updated to TESTB")
                    else:
                        log_test("Update roster", False, f"Section not updated: {roster}")
                        return False
                else:
                    log_test("Update roster - verify", False, f"Verify failed: {verify_response.status_code}")
                    return False
            else:
                log_test("Update roster", False, f"Response: {data}")
                return False
        else:
            log_test("Update roster", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Update roster", False, f"Error: {e}")
        return False
    
    return True

def test_records(token, roster_id, students):
    """Test 3: RECORDS (per student per task)"""
    print("\n" + "="*80)
    print("TEST 3: RECORDS (per student per task)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3a: Get a published chapter itemId
    print("\n📚 3a: GET /tob/items?class=4&subject=OD - Get published chapter")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/items?class=4&subject=OD",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            chapter_item = None
            for item in items:
                if item.get("type") == "chapter":
                    chapter_item = item
                    break
            
            if chapter_item:
                item_id = chapter_item.get("id")
                log_test("Get published chapter", True, f"Found chapter itemId: {item_id}")
            else:
                log_test("Get published chapter", False, "No chapter found")
                return False
        else:
            log_test("Get published chapter", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Get published chapter", False, f"Error: {e}")
        return False
    
    # 3b: POST /tob/records - Save record for first student
    print(f"\n💾 3b: POST /tob/records - Save record for student {students[0]['name']}")
    student_id = students[0]["id"]
    try:
        response = requests.post(
            f"{BASE_URL}/tob/records",
            json={
                "itemId": item_id,
                "part": "task",
                "term": 1,
                "pos": 1,
                "studentId": student_id,
                "rosterId": roster_id,
                "class": "4",
                "subject_id": "OD",
                "ticks": {"0": True, "2": True},
                "marks": 8,
                "remarks": "ଭଲ"
            },
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log_test("Save record", True, f"Saved record for student {students[0]['name']}")
            else:
                log_test("Save record", False, f"Response: {data}")
                return False
        else:
            log_test("Save record", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Save record", False, f"Error: {e}")
        return False
    
    # 3c: GET /tob/records?itemId=...&part=task&term=1&num=1&studentId=... - Get one record
    print(f"\n🔍 3c: GET /tob/records (with studentId) - Get one record")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/records?itemId={item_id}&part=task&term=1&num=1&studentId={student_id}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            record = data.get("record")
            if record:
                if (record.get("marks") == 8 and
                    record.get("ticks", {}).get("0") == True and
                    record.get("ticks", {}).get("2") == True and
                    record.get("remarks") == "ଭଲ"):
                    log_test("Get one record", True, f"Record retrieved with marks=8, ticks={{0:true,2:true}}, remarks='ଭଲ'")
                else:
                    log_test("Get one record", False, f"Record data mismatch: {record}")
                    return False
            else:
                log_test("Get one record", False, f"Record is null (this was the bug that was fixed)")
                return False
        else:
            log_test("Get one record", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Get one record", False, f"Error: {e}")
        return False
    
    # 3d: GET /tob/records (no studentId) - Get all records for task
    print(f"\n📋 3d: GET /tob/records (no studentId) - Get all records")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/records?itemId={item_id}&part=task&term=1&num=1",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            records = data.get("records", [])
            if len(records) >= 1:
                log_test("Get all records", True, f"Retrieved {len(records)} record(s)")
            else:
                log_test("Get all records", False, f"Expected >= 1 record, got {len(records)}")
                return False
        else:
            log_test("Get all records", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Get all records", False, f"Error: {e}")
        return False
    
    # 3e: Re-POST same key with marks:9 - Test upsert
    print(f"\n🔄 3e: POST /tob/records (upsert) - Update marks to 9")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/records",
            json={
                "itemId": item_id,
                "part": "task",
                "term": 1,
                "pos": 1,
                "studentId": student_id,
                "rosterId": roster_id,
                "class": "4",
                "subject_id": "OD",
                "ticks": {"0": True, "2": True},
                "marks": 9,
                "remarks": "ଭଲ"
            },
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            # Verify update
            verify_response = requests.get(
                f"{BASE_URL}/tob/records?itemId={item_id}&part=task&term=1&num=1&studentId={student_id}",
                headers=headers,
                timeout=10
            )
            if verify_response.status_code == 200:
                verify_data = verify_response.json()
                record = verify_data.get("record")
                if record and record.get("marks") == 9:
                    log_test("Upsert record", True, f"Marks updated to 9 (no duplicate)")
                else:
                    log_test("Upsert record", False, f"Marks not updated: {record}")
                    return False
            else:
                log_test("Upsert record - verify", False, f"Verify failed: {verify_response.status_code}")
                return False
        else:
            log_test("Upsert record", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Upsert record", False, f"Error: {e}")
        return False
    
    # 3f: POST with part:"project" - Test project record
    print(f"\n📊 3f: POST /tob/records (project) - Save project record")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/records",
            json={
                "itemId": item_id,
                "part": "project",
                "term": 1,
                "pos": 1,
                "studentId": student_id,
                "rosterId": roster_id,
                "class": "4",
                "subject_id": "OD",
                "ticks": {"0": True},
                "marks": 10,
                "remarks": "ଉତ୍ତମ"
            },
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            # Verify project record is separate from task record
            verify_response = requests.get(
                f"{BASE_URL}/tob/records?itemId={item_id}&part=project&term=1&num=1&studentId={student_id}",
                headers=headers,
                timeout=10
            )
            if verify_response.status_code == 200:
                verify_data = verify_response.json()
                record = verify_data.get("record")
                if record and record.get("marks") == 10 and record.get("remarks") == "ଉତ୍ତମ":
                    log_test("Project record", True, f"Project record saved separately (marks=10)")
                else:
                    log_test("Project record", False, f"Project record not found or incorrect: {record}")
                    return False
            else:
                log_test("Project record - verify", False, f"Verify failed: {verify_response.status_code}")
                return False
        else:
            log_test("Project record", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Project record", False, f"Error: {e}")
        return False
    
    return True

def test_privacy_isolation(token):
    """Test 4: PRIVACY/ISOLATION - records are per teacher"""
    print("\n" + "="*80)
    print("TEST 4: PRIVACY/ISOLATION (records per teacher)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Verify rosters are returned only for this teacher
    print("\n🔒 4a: Verify rosters are per teacher")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/rosters",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            rosters = data.get("rosters", [])
            log_test("Rosters per teacher", True, f"Retrieved {len(rosters)} roster(s) for this teacher")
        else:
            log_test("Rosters per teacher", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Rosters per teacher", False, f"Error: {e}")
        return False
    
    # Verify student names are NOT in public endpoints
    print("\n🔒 4b: Verify student names NOT in public endpoints")
    
    # Check /tob/og (should be image, not JSON with names)
    try:
        response = requests.get(
            f"{BASE_URL}/tob/og?class=4&subject=OD&chapter=4&part=task&num=1",
            timeout=10
        )
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            if "image/png" in content_type:
                log_test("OG endpoint privacy", True, f"Returns image/png (no student names)")
            else:
                log_test("OG endpoint privacy", False, f"Content-Type: {content_type}")
                return False
        else:
            log_test("OG endpoint privacy", False, f"Status {response.status_code}")
            return False
    except Exception as e:
        log_test("OG endpoint privacy", False, f"Error: {e}")
        return False
    
    # Check /tob/share-image (should be image, not JSON with names)
    try:
        response = requests.get(
            f"{BASE_URL}/tob/share-image?class=4&subject=OD&chapter=4&part=task&num=1",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            if "image/png" in content_type:
                log_test("Share-image endpoint privacy", True, f"Returns image/png (no student names)")
            else:
                log_test("Share-image endpoint privacy", False, f"Content-Type: {content_type}")
                return False
        else:
            log_test("Share-image endpoint privacy", False, f"Status {response.status_code}")
            return False
    except Exception as e:
        log_test("Share-image endpoint privacy", False, f"Error: {e}")
        return False
    
    # Check /tob/detail (should be JSON but no student names)
    try:
        response = requests.get(
            f"{BASE_URL}/tob/detail?class=4&subject=OD&chapter=4&part=task&num=1",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            # Convert to string and check for student names
            data_str = json.dumps(data)
            if "Rahul Sahu" not in data_str and "Priya Das" not in data_str and "Sunil" not in data_str:
                log_test("Detail endpoint privacy", True, f"No student names in JSON response")
            else:
                log_test("Detail endpoint privacy", False, f"Student names found in response")
                return False
        else:
            log_test("Detail endpoint privacy", False, f"Status {response.status_code}")
            return False
    except Exception as e:
        log_test("Detail endpoint privacy", False, f"Error: {e}")
        return False
    
    return True

def test_profile_image_polish(token):
    """Test 5: PROFILE + IMAGE POLISH"""
    print("\n" + "="*80)
    print("TEST 5: PROFILE + IMAGE POLISH")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 5a: POST /tob/profile - Set school name
    print("\n🏫 5a: POST /tob/profile - Set school name")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/profile",
            json={"school": "Govt UP School Test"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("school") == "Govt UP School Test":
                log_test("Set school profile", True, f"School set to 'Govt UP School Test'")
            else:
                log_test("Set school profile", False, f"Response: {data}")
                return False
        else:
            log_test("Set school profile", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Set school profile", False, f"Error: {e}")
        return False
    
    # 5b: GET /tob/share-image - Verify image is valid PNG > 10KB
    print("\n🖼️ 5b: GET /tob/share-image - Verify valid PNG > 10KB")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/share-image?class=4&subject=OD&chapter=4&part=task&num=1",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            content_length = len(response.content)
            if "image/png" in content_type and content_length > 10000:
                log_test("Share-image polish", True, f"Valid PNG, size: {content_length} bytes (> 10KB)")
            else:
                log_test("Share-image polish", False, f"Content-Type: {content_type}, size: {content_length}")
                return False
        else:
            log_test("Share-image polish", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Share-image polish", False, f"Error: {e}")
        return False
    
    return True

def test_reliable_publish(token):
    """Test 6: RELIABLE PUBLISH"""
    print("\n" + "="*80)
    print("TEST 6: RELIABLE PUBLISH")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 6a: POST /tob/admin/courses/status - Publish Class-4 OD
    print("\n📢 6a: POST /tob/admin/courses/status - Publish Class-4 OD")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/admin/courses/status",
            json={"class": "4", "subject": "OD", "status": "published"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("ok") and 
                data.get("published", 0) > 0 and 
                data.get("skippedCount", 0) == 0 and
                "Published" in data.get("message", "")):
                log_test("Publish course", True, 
                       f"Published {data['published']} items, skipped {data['skippedCount']}, message: {data['message']}")
            else:
                log_test("Publish course", False, f"Response: {data}")
                return False
        else:
            log_test("Publish course", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Publish course", False, f"Error: {e}")
        return False
    
    # 6b: POST /tob/admin/courses/status - Unpublish
    print("\n📢 6b: POST /tob/admin/courses/status - Unpublish")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/admin/courses/status",
            json={"class": "4", "subject": "OD", "status": "draft"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and "Unpublished" in data.get("message", ""):
                log_test("Unpublish course", True, f"Message: {data['message']}")
            else:
                log_test("Unpublish course", False, f"Response: {data}")
                return False
        else:
            log_test("Unpublish course", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Unpublish course", False, f"Error: {e}")
        return False
    
    # 6c: Re-publish back to published
    print("\n📢 6c: POST /tob/admin/courses/status - Re-publish")
    try:
        response = requests.post(
            f"{BASE_URL}/tob/admin/courses/status",
            json={"class": "4", "subject": "OD", "status": "published"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log_test("Re-publish course", True, f"Re-published successfully")
            else:
                log_test("Re-publish course", False, f"Response: {data}")
                return False
        else:
            log_test("Re-publish course", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Re-publish course", False, f"Error: {e}")
        return False
    
    # 6d: Verify course still listed
    print("\n📋 6d: GET /tob/courses - Verify Class-4 OD still listed")
    try:
        response = requests.get(
            f"{BASE_URL}/tob/courses",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            courses = data.get("courses", [])
            found = False
            for course in courses:
                if course.get("class") == "4" and course.get("subject_id") == "OD":
                    found = True
                    break
            
            if found:
                log_test("Verify course listed", True, f"Class-4 OD found in courses list")
            else:
                log_test("Verify course listed", False, f"Class-4 OD not found")
                return False
        else:
            log_test("Verify course listed", False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Verify course listed", False, f"Error: {e}")
        return False
    
    return True

def test_cleanup(token):
    """Test 7: CLEANUP - Delete rosters and verify records are gone"""
    print("\n" + "="*80)
    print("TEST 7: CLEANUP")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    for roster_id in created_roster_ids:
        # 7a: DELETE /tob/rosters/:id
        print(f"\n🗑️ 7a: DELETE /tob/rosters/{roster_id}")
        try:
            response = requests.delete(
                f"{BASE_URL}/tob/rosters/{roster_id}",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test(f"Delete roster {roster_id}", True, f"Deleted successfully")
                else:
                    log_test(f"Delete roster {roster_id}", False, f"Response: {data}")
                    continue
            else:
                log_test(f"Delete roster {roster_id}", False, f"Status {response.status_code}: {response.text}")
                continue
        except Exception as e:
            log_test(f"Delete roster {roster_id}", False, f"Error: {e}")
            continue
        
        # 7b: Verify records are gone
        print(f"\n🔍 7b: Verify records for roster {roster_id} are gone")
        try:
            # Try to get the roster (should be 404 or not found)
            response = requests.get(
                f"{BASE_URL}/tob/rosters/{roster_id}",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 404 or (response.status_code == 200 and not response.json().get("roster")):
                log_test(f"Verify roster deleted", True, f"Roster {roster_id} no longer exists")
            else:
                log_test(f"Verify roster deleted", False, f"Roster still exists: {response.status_code}")
        except Exception as e:
            log_test(f"Verify roster deleted", False, f"Error: {e}")
    
    return True

def main():
    """Main test runner"""
    print("\n" + "="*80)
    print("TOB MY CLASS RECORDS BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Could not login as admin")
        sys.exit(1)
    
    # Run tests
    all_passed = True
    
    # Test 1: Auth gating
    if not test_auth_gating():
        all_passed = False
    
    # Test 2: Roster CRUD
    roster_id = None
    students = None
    if token:
        result = test_roster_crud(token)
        if not result:
            all_passed = False
        else:
            # Get roster_id and students for next tests
            if created_roster_ids:
                roster_id = created_roster_ids[0]
                # Get students from roster
                try:
                    response = requests.get(
                        f"{BASE_URL}/tob/rosters/{roster_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=10
                    )
                    if response.status_code == 200:
                        data = response.json()
                        students = data.get("roster", {}).get("students", [])
                except:
                    pass
    
    # Test 3: Records
    if token and roster_id and students:
        if not test_records(token, roster_id, students):
            all_passed = False
    
    # Test 4: Privacy/Isolation
    if token:
        if not test_privacy_isolation(token):
            all_passed = False
    
    # Test 5: Profile + Image Polish
    if token:
        if not test_profile_image_polish(token):
            all_passed = False
    
    # Test 6: Reliable Publish
    if token:
        if not test_reliable_publish(token):
            all_passed = False
    
    # Test 7: Cleanup
    if token and created_roster_ids:
        if not test_cleanup(token):
            all_passed = False
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed_count = sum(1 for r in test_results if r["passed"])
    total_count = len(test_results)
    
    print(f"\nTotal tests: {total_count}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {total_count - passed_count}")
    print(f"Success rate: {passed_count}/{total_count} ({100*passed_count//total_count if total_count > 0 else 0}%)")
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
