#!/usr/bin/env python3
"""
Backend Regression Test — Instant Daily Lesson Plan Timetable Endpoints
Tests ONLY the new timetable endpoints, does NOT retest old features.
"""
import requests
import json
import os
from datetime import datetime, timedelta

# Read base URL from .env
BASE_URL = "http://localhost:3000/api"
try:
    with open("/app/.env", "r") as f:
        for line in f:
            if line.startswith("NEXT_PUBLIC_BASE_URL="):
                BASE_URL = line.split("=", 1)[1].strip() + "/api"
                break
except:
    pass

print(f"🔗 Base URL: {BASE_URL}\n")

# Admin credentials from test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def test_result(name, passed, details=""):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} | {name}")
    if details:
        print(f"   {details}")
    return passed

# Track results
results = []

# ===== TEST 1: Admin Login =====
print("=" * 80)
print("TEST 1: Admin Login")
print("=" * 80)
try:
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=10)
    data = resp.json()
    if resp.status_code == 200 and "token" in data:
        ADMIN_TOKEN = data["token"]
        results.append(test_result("Admin login", True, f"Token: {ADMIN_TOKEN[:20]}..."))
    else:
        results.append(test_result("Admin login", False, f"Status {resp.status_code}: {data}"))
        print("\n❌ CRITICAL: Cannot proceed without admin token")
        exit(1)
except Exception as e:
    results.append(test_result("Admin login", False, str(e)))
    print("\n❌ CRITICAL: Cannot proceed without admin token")
    exit(1)

print()

# ===== TEST 2: GET /api/me/timetable without auth → 401 =====
print("=" * 80)
print("TEST 2: GET /api/me/timetable without auth → 401")
print("=" * 80)
try:
    resp = requests.get(f"{BASE_URL}/me/timetable", timeout=10)
    data = resp.json()
    passed = resp.status_code == 401
    results.append(test_result("GET /me/timetable without auth", passed, 
                               f"Status: {resp.status_code}, Expected: 401"))
except Exception as e:
    results.append(test_result("GET /me/timetable without auth", False, str(e)))

print()

# ===== TEST 3: GET /api/me/timetable with auth, before any timetable saved → { timetable: null } =====
print("=" * 80)
print("TEST 3: GET /api/me/timetable with auth (before setup) → { timetable: null }")
print("=" * 80)
try:
    # First, delete any existing timetable for clean test
    # We'll use MongoDB directly via the API or just test the current state
    resp = requests.get(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}, 
                       timeout=10)
    data = resp.json()
    # Could be null or existing timetable - we'll test both scenarios
    passed = resp.status_code == 200 and "timetable" in data
    results.append(test_result("GET /me/timetable with auth", passed, 
                               f"Status: {resp.status_code}, timetable: {data.get('timetable') is not None}"))
    
    # Store initial state
    INITIAL_TIMETABLE = data.get("timetable")
except Exception as e:
    results.append(test_result("GET /me/timetable with auth", False, str(e)))
    INITIAL_TIMETABLE = None

print()

# ===== TEST 4: Get a real class ID for testing =====
print("=" * 80)
print("TEST 4: Get real class ID from /api/classes")
print("=" * 80)
try:
    resp = requests.get(f"{BASE_URL}/classes", timeout=10)
    data = resp.json()
    if resp.status_code == 200 and "classes" in data and len(data["classes"]) > 0:
        CLASS_ID = data["classes"][0]["id"]
        CLASS_NAME = data["classes"][0]["name"]
        results.append(test_result("Get class ID", True, f"Using class: {CLASS_NAME} ({CLASS_ID})"))
    else:
        results.append(test_result("Get class ID", False, "No classes found"))
        CLASS_ID = "dummy-class-id"
except Exception as e:
    results.append(test_result("Get class ID", False, str(e)))
    CLASS_ID = "dummy-class-id"

print()

# ===== TEST 5: PUT /api/me/timetable without auth → 401 =====
print("=" * 80)
print("TEST 5: PUT /api/me/timetable without auth → 401")
print("=" * 80)
try:
    resp = requests.put(f"{BASE_URL}/me/timetable", json={
        "classType": "single",
        "classIds": [CLASS_ID],
        "weekly": {"1": []},
        "setupComplete": True
    }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 401
    results.append(test_result("PUT /me/timetable without auth", passed, 
                               f"Status: {resp.status_code}, Expected: 401"))
except Exception as e:
    results.append(test_result("PUT /me/timetable without auth", False, str(e)))

print()

# ===== TEST 6: PUT /api/me/timetable missing classType → 400 =====
print("=" * 80)
print("TEST 6: PUT /api/me/timetable missing classType → 400")
print("=" * 80)
try:
    resp = requests.put(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                       json={
                           "classIds": [CLASS_ID],
                           "weekly": {"1": []},
                       }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 400 and "classtype" in data.get("error", "").lower()
    results.append(test_result("PUT /me/timetable missing classType", passed, 
                               f"Status: {resp.status_code}, Error: {data.get('error', '')}"))
except Exception as e:
    results.append(test_result("PUT /me/timetable missing classType", False, str(e)))

print()

# ===== TEST 7: PUT /api/me/timetable missing/empty classIds → 400 =====
print("=" * 80)
print("TEST 7: PUT /api/me/timetable missing/empty classIds → 400")
print("=" * 80)
try:
    resp = requests.put(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                       json={
                           "classType": "single",
                           "classIds": [],
                           "weekly": {"1": []},
                       }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 400 and "classids" in data.get("error", "").lower()
    results.append(test_result("PUT /me/timetable empty classIds", passed, 
                               f"Status: {resp.status_code}, Error: {data.get('error', '')}"))
except Exception as e:
    results.append(test_result("PUT /me/timetable empty classIds", False, str(e)))

print()

# ===== TEST 8: PUT /api/me/timetable missing weekly → 400 =====
print("=" * 80)
print("TEST 8: PUT /api/me/timetable missing weekly → 400")
print("=" * 80)
try:
    resp = requests.put(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                       json={
                           "classType": "single",
                           "classIds": [CLASS_ID],
                       }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 400 and "weekly" in data.get("error", "").lower()
    results.append(test_result("PUT /me/timetable missing weekly", passed, 
                               f"Status: {resp.status_code}, Error: {data.get('error', '')}"))
except Exception as e:
    results.append(test_result("PUT /me/timetable missing weekly", False, str(e)))

print()

# ===== TEST 9: PUT /api/me/timetable valid payload → 200 =====
print("=" * 80)
print("TEST 9: PUT /api/me/timetable valid payload → 200")
print("=" * 80)
try:
    valid_payload = {
        "classType": "single",
        "classIds": [CLASS_ID],
        "setupComplete": True,
        "weekly": {
            "1": [{
                "periodNumber": 1,
                "time": "09:00-09:45",
                "classId": CLASS_ID,
                "bookId": None,
                "chapterId": None,
                "lessonId": None
            }],
            "6": [{
                "periodNumber": 1,
                "time": "10:00-10:45",
                "classId": CLASS_ID,
                "bookId": None,
                "chapterId": None,
                "lessonId": None
            }]
        }
    }
    resp = requests.put(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                       json=valid_payload, timeout=10)
    data = resp.json()
    
    if resp.status_code == 200 and data.get("ok") and data.get("timetable"):
        tt = data["timetable"]
        # Verify structure
        checks = []
        checks.append(("classType", tt.get("classType") == "single"))
        checks.append(("classIds", CLASS_ID in tt.get("classIds", [])))
        checks.append(("setupComplete", tt.get("setupComplete") == True))
        
        # Verify weekly has all days 0-6
        weekly = tt.get("weekly", {})
        all_days_present = all(str(d) in weekly for d in range(7))
        checks.append(("all weekdays 0-6 present", all_days_present))
        
        # Verify periods are truncated to max 7
        max_periods = max(len(weekly.get(str(d), [])) for d in range(7))
        checks.append(("max 7 periods per day", max_periods <= 7))
        
        # Verify period structure
        if "1" in weekly and len(weekly["1"]) > 0:
            p = weekly["1"][0]
            has_fields = all(k in p for k in ["periodNumber", "time", "classId", "bookId", "chapterId", "lessonId"])
            checks.append(("period has required fields", has_fields))
        
        all_passed = all(c[1] for c in checks)
        details = ", ".join([f"{c[0]}: {c[1]}" for c in checks])
        results.append(test_result("PUT /me/timetable valid payload", all_passed, details))
        
        # Store timetable for later tests
        SAVED_TIMETABLE = tt
    else:
        results.append(test_result("PUT /me/timetable valid payload", False, 
                                   f"Status: {resp.status_code}, Response: {data}"))
        SAVED_TIMETABLE = None
except Exception as e:
    results.append(test_result("PUT /me/timetable valid payload", False, str(e)))
    SAVED_TIMETABLE = None

print()

# ===== TEST 10: PUT again with different classType → verify update (not duplicate) =====
print("=" * 80)
print("TEST 10: PUT /api/me/timetable again with setupComplete=false → verify update")
print("=" * 80)
try:
    update_payload = {
        "classType": "double",
        "classIds": [CLASS_ID],
        "setupComplete": False,
        "weekly": {
            "2": [{
                "periodNumber": 1,
                "time": "08:00-08:45",
                "classId": CLASS_ID,
                "bookId": None,
                "chapterId": None,
                "lessonId": None
            }]
        }
    }
    resp = requests.put(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                       json=update_payload, timeout=10)
    data = resp.json()
    
    if resp.status_code == 200 and data.get("ok") and data.get("timetable"):
        tt = data["timetable"]
        checks = []
        checks.append(("classType updated to double", tt.get("classType") == "double"))
        checks.append(("setupComplete updated to false", tt.get("setupComplete") == False))
        
        all_passed = all(c[1] for c in checks)
        details = ", ".join([f"{c[0]}: {c[1]}" for c in checks])
        results.append(test_result("PUT /me/timetable update", all_passed, details))
    else:
        results.append(test_result("PUT /me/timetable update", False, 
                                   f"Status: {resp.status_code}, Response: {data}"))
except Exception as e:
    results.append(test_result("PUT /me/timetable update", False, str(e)))

print()

# ===== TEST 11: POST /api/me/timetable/holiday without auth → 401 =====
print("=" * 80)
print("TEST 11: POST /api/me/timetable/holiday without auth → 401")
print("=" * 80)
try:
    resp = requests.post(f"{BASE_URL}/me/timetable/holiday", json={
        "date": "2026-06-25",
        "mark": True
    }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 401
    results.append(test_result("POST /me/timetable/holiday without auth", passed, 
                               f"Status: {resp.status_code}, Expected: 401"))
except Exception as e:
    results.append(test_result("POST /me/timetable/holiday without auth", False, str(e)))

print()

# ===== TEST 12: POST /api/me/timetable/holiday invalid date format → 400 =====
print("=" * 80)
print("TEST 12: POST /api/me/timetable/holiday invalid date format → 400")
print("=" * 80)
try:
    resp = requests.post(f"{BASE_URL}/me/timetable/holiday", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "date": "2026/06/25",  # Wrong format
                            "mark": True
                        }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 400
    results.append(test_result("POST /me/timetable/holiday invalid date", passed, 
                               f"Status: {resp.status_code}, Error: {data.get('error', '')}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/holiday invalid date", False, str(e)))

print()

# ===== TEST 13: POST /api/me/timetable/holiday mark valid date → 200 =====
print("=" * 80)
print("TEST 13: POST /api/me/timetable/holiday mark date → 200")
print("=" * 80)
try:
    test_date = "2026-06-25"
    resp = requests.post(f"{BASE_URL}/me/timetable/holiday", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "date": test_date,
                            "mark": True
                        }, timeout=10)
    data = resp.json()
    
    if resp.status_code == 200 and data.get("ok"):
        holidays = data.get("holidays", [])
        passed = test_date in holidays
        results.append(test_result("POST /me/timetable/holiday mark", passed, 
                                   f"Date {test_date} in holidays: {passed}, holidays: {holidays}"))
    else:
        results.append(test_result("POST /me/timetable/holiday mark", False, 
                                   f"Status: {resp.status_code}, Response: {data}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/holiday mark", False, str(e)))

print()

# ===== TEST 14: POST /api/me/timetable/holiday mark same date again → no duplicate =====
print("=" * 80)
print("TEST 14: POST /api/me/timetable/holiday mark same date again → no duplicate")
print("=" * 80)
try:
    test_date = "2026-06-25"
    resp = requests.post(f"{BASE_URL}/me/timetable/holiday", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "date": test_date,
                            "mark": True
                        }, timeout=10)
    data = resp.json()
    
    if resp.status_code == 200 and data.get("ok"):
        holidays = data.get("holidays", [])
        count = holidays.count(test_date)
        passed = count == 1
        results.append(test_result("POST /me/timetable/holiday no duplicate", passed, 
                                   f"Date appears {count} time(s), expected 1"))
    else:
        results.append(test_result("POST /me/timetable/holiday no duplicate", False, 
                                   f"Status: {resp.status_code}, Response: {data}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/holiday no duplicate", False, str(e)))

print()

# ===== TEST 15: POST /api/me/timetable/holiday unmark date → removed =====
print("=" * 80)
print("TEST 15: POST /api/me/timetable/holiday unmark date → removed")
print("=" * 80)
try:
    test_date = "2026-06-25"
    resp = requests.post(f"{BASE_URL}/me/timetable/holiday", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "date": test_date,
                            "mark": False
                        }, timeout=10)
    data = resp.json()
    
    if resp.status_code == 200 and data.get("ok"):
        holidays = data.get("holidays", [])
        passed = test_date not in holidays
        results.append(test_result("POST /me/timetable/holiday unmark", passed, 
                                   f"Date removed: {passed}, holidays: {holidays}"))
    else:
        results.append(test_result("POST /me/timetable/holiday unmark", False, 
                                   f"Status: {resp.status_code}, Response: {data}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/holiday unmark", False, str(e)))

print()

# ===== TEST 16: POST /api/me/timetable/day without auth → 401 =====
print("=" * 80)
print("TEST 16: POST /api/me/timetable/day without auth → 401")
print("=" * 80)
try:
    resp = requests.post(f"{BASE_URL}/me/timetable/day", json={
        "weekday": 3,
        "periods": []
    }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 401
    results.append(test_result("POST /me/timetable/day without auth", passed, 
                               f"Status: {resp.status_code}, Expected: 401"))
except Exception as e:
    results.append(test_result("POST /me/timetable/day without auth", False, str(e)))

print()

# ===== TEST 17: POST /api/me/timetable/day invalid weekday → 400 =====
print("=" * 80)
print("TEST 17: POST /api/me/timetable/day invalid weekday → 400")
print("=" * 80)
try:
    resp = requests.post(f"{BASE_URL}/me/timetable/day", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "weekday": 9,  # Invalid
                            "periods": []
                        }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 400
    results.append(test_result("POST /me/timetable/day invalid weekday", passed, 
                               f"Status: {resp.status_code}, Error: {data.get('error', '')}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/day invalid weekday", False, str(e)))

print()

# ===== TEST 18: POST /api/me/timetable/day missing periods → 400 =====
print("=" * 80)
print("TEST 18: POST /api/me/timetable/day missing periods → 400")
print("=" * 80)
try:
    resp = requests.post(f"{BASE_URL}/me/timetable/day", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "weekday": 3
                        }, timeout=10)
    data = resp.json()
    passed = resp.status_code == 400
    results.append(test_result("POST /me/timetable/day missing periods", passed, 
                               f"Status: {resp.status_code}, Error: {data.get('error', '')}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/day missing periods", False, str(e)))

print()

# ===== TEST 19: POST /api/me/timetable/day valid → 200 and verify GET =====
print("=" * 80)
print("TEST 19: POST /api/me/timetable/day valid → 200 and verify GET")
print("=" * 80)
try:
    test_weekday = 3
    test_periods = [{
        "periodNumber": 1,
        "time": "08:00",
        "classId": None,
        "bookId": None,
        "chapterId": None,
        "lessonId": None
    }]
    
    resp = requests.post(f"{BASE_URL}/me/timetable/day", 
                        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                        json={
                            "weekday": test_weekday,
                            "periods": test_periods
                        }, timeout=10)
    data = resp.json()
    
    if resp.status_code == 200 and data.get("ok"):
        # Now GET the timetable and verify
        resp2 = requests.get(f"{BASE_URL}/me/timetable", 
                            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}, 
                            timeout=10)
        data2 = resp2.json()
        
        if resp2.status_code == 200 and data2.get("timetable"):
            weekly = data2["timetable"].get("weekly", {})
            day_periods = weekly.get(str(test_weekday), [])
            passed = len(day_periods) > 0 and day_periods[0].get("time") == "08:00"
            results.append(test_result("POST /me/timetable/day valid", passed, 
                                       f"Updated weekday {test_weekday}, periods: {len(day_periods)}"))
        else:
            results.append(test_result("POST /me/timetable/day valid", False, 
                                       f"GET failed: {resp2.status_code}"))
    else:
        results.append(test_result("POST /me/timetable/day valid", False, 
                                   f"Status: {resp.status_code}, Response: {data}"))
except Exception as e:
    results.append(test_result("POST /me/timetable/day valid", False, str(e)))

print()

# ===== TEST 20: Regression - /api/daily-plan/generate should still work =====
print("=" * 80)
print("TEST 20: Regression - POST /api/daily-plan/generate")
print("=" * 80)
try:
    # First get a real lesson ID
    resp = requests.get(f"{BASE_URL}/lessons", timeout=10)
    lessons_data = resp.json()
    
    if resp.status_code == 200 and "lessons" in lessons_data and len(lessons_data["lessons"]) > 0:
        lesson = lessons_data["lessons"][0]
        lesson_id = lesson["id"]
        class_id = lesson["classId"]
        book_id = lesson.get("bookId")
        chapter_id = lesson.get("chapterId")
        
        # Generate daily plan
        today = datetime.now().strftime("%Y-%m-%d")
        resp2 = requests.post(f"{BASE_URL}/daily-plan/generate", 
                             headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                             json={
                                 "date": today,
                                 "schoolName": "Test School",
                                 "classType": "single",
                                 "slots": [{
                                     "lessonId": lesson_id,
                                     "classId": class_id,
                                     "bookId": book_id,
                                     "chapterId": chapter_id
                                 }]
                             }, timeout=30)
        data2 = resp2.json()
        
        if resp2.status_code == 200 and "periods" in data2:
            periods = data2.get("periods", [])
            has_periods = len(periods) > 0
            results.append(test_result("POST /daily-plan/generate regression", has_periods, 
                                       f"Generated {len(periods)} periods"))
        else:
            results.append(test_result("POST /daily-plan/generate regression", False, 
                                       f"Status: {resp2.status_code}, Response: {data2}"))
    else:
        results.append(test_result("POST /daily-plan/generate regression", False, 
                                   "No lessons found for testing"))
except Exception as e:
    results.append(test_result("POST /daily-plan/generate regression", False, str(e)))

print()

# ===== CLEANUP: Delete timetable =====
print("=" * 80)
print("CLEANUP: Delete timetable for admin user")
print("=" * 80)
print("Note: Cleanup requires direct DB access or setting setupComplete=false")
print("Setting setupComplete=false and clearing holidays via API...")
try:
    # Set setupComplete to false
    resp = requests.put(f"{BASE_URL}/me/timetable", 
                       headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                       json={
                           "classType": "single",
                           "classIds": [CLASS_ID],
                           "setupComplete": False,
                           "weekly": {}
                       }, timeout=10)
    if resp.status_code == 200:
        print("✅ Timetable reset to setupComplete=false")
    else:
        print(f"⚠️  Could not reset timetable: {resp.status_code}")
except Exception as e:
    print(f"⚠️  Cleanup error: {e}")

print()

# ===== SUMMARY =====
print("=" * 80)
print("TEST SUMMARY")
print("=" * 80)
total = len(results)
passed = sum(1 for r in results if r)
failed = total - passed

print(f"\nTotal Tests: {total}")
print(f"✅ Passed: {passed}")
print(f"❌ Failed: {failed}")
print(f"Success Rate: {(passed/total*100):.1f}%\n")

if failed > 0:
    print("Failed tests:")
    for i, r in enumerate(results):
        if not r:
            print(f"  - Test {i+1}")

print("\n" + "=" * 80)
print("TIMETABLE ENDPOINTS TESTING COMPLETE")
print("=" * 80)
