#!/usr/bin/env python3
"""
Backend test for Date-Based Auto-Progression endpoint: POST /api/me/timetable/sync-to-date
CORRECTED VERSION with proper test expectations
"""

import requests
import json
from datetime import datetime, timedelta
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_sync_to_date_corrected():
    """Test the new POST /api/me/timetable/sync-to-date endpoint with corrected expectations"""
    
    # Generate random mobile for test teacher
    test_mobile = f"95{random.randint(10000000, 99999999)}"
    test_password = "test1234"
    
    log("=" * 80)
    log("CORRECTED TEST SUITE FOR DATE-BASED AUTO-PROGRESSION")
    log("=" * 80)
    
    log("\n" + "=" * 80)
    log("SETUP: Register test teacher and get lesson data")
    log("=" * 80)
    
    try:
        # Register teacher
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Teacher Sync V2",
            "mobile": test_mobile,
            "password": test_password
        }, timeout=30)
        teacher_token = r.json()["token"]
        teacher_id = r.json()["user"]["id"]
        log(f"✅ Test teacher registered: {test_mobile}")
        
        # Get test data
        r = requests.get(f"{BASE_URL}/classes", timeout=30)
        test_class = r.json()["classes"][0]
        
        r = requests.get(f"{BASE_URL}/books?classId={test_class['id']}", timeout=30)
        test_book = r.json()["books"][0]
        
        r = requests.get(f"{BASE_URL}/chapters?classId={test_class['id']}&bookId={test_book['id']}", timeout=30)
        chapters = r.json()["chapters"]
        test_chapter = chapters[0]
        
        r = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter['id']}", timeout=30)
        lessons = r.json()["lessons"]
        
        log(f"✅ Using: {test_class['name']} / {test_book['name']} / {test_chapter['name']}")
        log(f"✅ Lessons available: {len(lessons)}")
        for i, l in enumerate(lessons[:3]):
            log(f"   {i+1}. Period {l['period']}: {l['title']}")
        
    except Exception as e:
        log(f"❌ SETUP FAILED: {e}")
        return
    
    # Calculate dates
    today = datetime.now()
    today_iso = today.strftime("%Y-%m-%d")
    
    # Find next Monday for consistent testing
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = today + timedelta(days=days_until_monday)
    monday_iso = next_monday.strftime("%Y-%m-%d")
    
    log(f"\n📅 Date reference:")
    log(f"   Today: {today_iso} ({today.strftime('%A')})")
    log(f"   Next Monday: {monday_iso}")
    
    log("\n" + "=" * 80)
    log("TEST 1: Setup timetable - anchor should be set to today")
    log("=" * 80)
    
    try:
        weekly = {str(i): [] for i in range(7)}
        weekly["1"] = [{  # Monday
            "periodNumber": 1,
            "time": "08:00",
            "classId": test_class["id"],
            "bookId": test_book["id"],
            "chapterId": test_chapter["id"],
            "lessonId": lessons[0]["id"]  # Period 1
        }]
        
        r = requests.put(f"{BASE_URL}/me/timetable", 
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={
                "classType": "single",
                "classIds": [test_class["id"]],
                "weekly": weekly,
                "setupComplete": True
            }, timeout=30)
        
        timetable = r.json()["timetable"]
        anchor = timetable["anchorDates"]["1"]
        log(f"✅ Timetable created")
        log(f"✅ Monday anchor date: {anchor}")
        log(f"✅ Monday slot: Period {lessons[0]['period']} - {lessons[0]['title']}")
        
        if anchor == today_iso:
            log(f"✅ Anchor correctly set to today")
        else:
            log(f"⚠️  Anchor is {anchor}, expected {today_iso}")
            
    except Exception as e:
        log(f"❌ TEST 1 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 2: Sync to same date as anchor → no-op")
    log("=" * 80)
    
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": anchor}, timeout=30)
        
        result = r.json()
        log(f"Sync to {anchor} (same as anchor)")
        log(f"Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        if result["weeksDiff"] == 0 and result["advanced"] == 0:
            log(f"✅ PASS: No-op as expected (same date as anchor)")
        else:
            log(f"❌ FAIL: Expected no-op, got weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        # Verify lesson unchanged
        current_lesson_id = result["timetable"]["weekly"]["1"][0]["lessonId"]
        if current_lesson_id == lessons[0]["id"]:
            log(f"✅ Lesson unchanged: Period {lessons[0]['period']}")
        else:
            log(f"❌ Lesson changed unexpectedly")
            
    except Exception as e:
        log(f"❌ TEST 2 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 3: Sync forward 1 week → 1 advancement")
    log("=" * 80)
    
    try:
        # Calculate 1 week forward from anchor
        anchor_date = datetime.strptime(anchor, "%Y-%m-%d")
        target_date = anchor_date + timedelta(days=7)
        target_iso = target_date.strftime("%Y-%m-%d")
        
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": target_iso}, timeout=30)
        
        result = r.json()
        log(f"Sync to {target_iso} (anchor + 7 days)")
        log(f"Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        if result["weeksDiff"] == 1:
            log(f"✅ PASS: weeksDiff=1 as expected")
        else:
            log(f"❌ FAIL: Expected weeksDiff=1, got {result['weeksDiff']}")
        
        if result["advanced"] == 1:
            log(f"✅ PASS: advanced=1 slot")
        else:
            log(f"❌ FAIL: Expected advanced=1, got {result['advanced']}")
        
        # Verify lesson advanced to period 2
        current_lesson_id = result["timetable"]["weekly"]["1"][0]["lessonId"]
        if current_lesson_id == lessons[1]["id"]:
            log(f"✅ Lesson advanced to Period {lessons[1]['period']}: {lessons[1]['title']}")
        else:
            log(f"⚠️  Lesson is now: {current_lesson_id}")
        
        # Verify anchor updated
        new_anchor = result["timetable"]["anchorDates"]["1"]
        if new_anchor == target_iso:
            log(f"✅ Anchor updated to {new_anchor}")
        else:
            log(f"⚠️  Anchor is {new_anchor}, expected {target_iso}")
            
    except Exception as e:
        log(f"❌ TEST 3 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 4: Sync forward 1 more week → 1 more advancement")
    log("=" * 80)
    
    try:
        # Get current anchor
        r = requests.get(f"{BASE_URL}/me/timetable",
            headers={"Authorization": f"Bearer {teacher_token}"}, timeout=30)
        current_anchor = r.json()["timetable"]["anchorDates"]["1"]
        
        # Calculate 1 week forward from current anchor
        anchor_date = datetime.strptime(current_anchor, "%Y-%m-%d")
        target_date = anchor_date + timedelta(days=7)
        target_iso = target_date.strftime("%Y-%m-%d")
        
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": target_iso}, timeout=30)
        
        result = r.json()
        log(f"Sync to {target_iso} (current anchor + 7 days)")
        log(f"Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        if result["weeksDiff"] == 1:
            log(f"✅ PASS: weeksDiff=1 as expected")
        else:
            log(f"❌ FAIL: Expected weeksDiff=1, got {result['weeksDiff']}")
        
        # Lesson should advance from period 2 to period 99 (since no period 3-98 exist)
        current_lesson_id = result["timetable"]["weekly"]["1"][0]["lessonId"]
        if current_lesson_id == lessons[2]["id"]:
            log(f"✅ Lesson advanced to Period {lessons[2]['period']}: {lessons[2]['title']}")
        else:
            log(f"⚠️  Lesson is now: {current_lesson_id}")
            
    except Exception as e:
        log(f"❌ TEST 4 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 5: Sync backward → no-op")
    log("=" * 80)
    
    try:
        # Get current state
        r = requests.get(f"{BASE_URL}/me/timetable",
            headers={"Authorization": f"Bearer {teacher_token}"}, timeout=30)
        before_lesson_id = r.json()["timetable"]["weekly"]["1"][0]["lessonId"]
        
        # Sync to a past date
        past_date = (datetime.strptime(anchor, "%Y-%m-%d") - timedelta(days=14)).strftime("%Y-%m-%d")
        
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": past_date}, timeout=30)
        
        result = r.json()
        log(f"Sync to {past_date} (past date)")
        log(f"Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        if result["weeksDiff"] == 0 and result["advanced"] == 0:
            log(f"✅ PASS: No reverse-advance (weeksDiff=0, advanced=0)")
        else:
            log(f"❌ FAIL: Expected no-op, got weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        after_lesson_id = result["timetable"]["weekly"]["1"][0]["lessonId"]
        if after_lesson_id == before_lesson_id:
            log(f"✅ Lesson unchanged")
        else:
            log(f"❌ Lesson changed unexpectedly")
            
    except Exception as e:
        log(f"❌ TEST 5 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 6: Holiday skipping - setup fresh teacher")
    log("=" * 80)
    
    test_mobile2 = f"94{random.randint(10000000, 99999999)}"
    
    try:
        # Register new teacher
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Teacher Holiday",
            "mobile": test_mobile2,
            "password": test_password
        }, timeout=30)
        teacher2_token = r.json()["token"]
        log(f"✅ New teacher registered: {test_mobile2}")
        
        # Setup timetable - anchor will be set to today
        weekly = {str(i): [] for i in range(7)}
        weekly["1"] = [{
            "periodNumber": 1,
            "time": "08:00",
            "classId": test_class["id"],
            "bookId": test_book["id"],
            "chapterId": test_chapter["id"],
            "lessonId": lessons[0]["id"]
        }]
        
        r = requests.put(f"{BASE_URL}/me/timetable", 
            headers={"Authorization": f"Bearer {teacher2_token}"},
            json={
                "classType": "single",
                "classIds": [test_class["id"]],
                "weekly": weekly,
                "setupComplete": True
            }, timeout=30)
        
        timetable = r.json()["timetable"]
        anchor2 = timetable["anchorDates"]["1"]
        log(f"✅ Timetable setup, anchor: {anchor2}")
        
        # Mark next Monday (anchor + 7 days) as holiday
        anchor2_date = datetime.strptime(anchor2, "%Y-%m-%d")
        holiday_date = anchor2_date + timedelta(days=7)
        holiday_iso = holiday_date.strftime("%Y-%m-%d")
        
        r = requests.post(f"{BASE_URL}/me/timetable/holiday",
            headers={"Authorization": f"Bearer {teacher2_token}"},
            json={"date": holiday_iso, "mark": True}, timeout=30)
        log(f"✅ Marked {holiday_iso} as holiday (anchor + 7 days)")
        
        # Sync to "Monday two weeks from now" = anchor + 14 days
        target_date = anchor2_date + timedelta(days=14)
        target_iso = target_date.strftime("%Y-%m-%d")
        
        log(f"\n📅 Holiday test dates:")
        log(f"   Anchor: {anchor2}")
        log(f"   Holiday: {holiday_iso} (anchor + 7)")
        log(f"   Target: {target_iso} (anchor + 14)")
        log(f"   Expected: weeksDiff=1 (one Monday is holiday, so only 1 counts)")
        
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher2_token}"},
            json={"date": target_iso}, timeout=30)
        
        result = r.json()
        log(f"\nSync to {target_iso}")
        log(f"Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        if result["weeksDiff"] == 1:
            log(f"✅ PASS: weeksDiff=1 (holiday correctly skipped)")
        else:
            log(f"❌ FAIL: Expected weeksDiff=1, got {result['weeksDiff']}")
            log(f"   This means holidays are NOT being skipped correctly!")
        
        # Lesson should advance by 1 (to period 2)
        current_lesson_id = result["timetable"]["weekly"]["1"][0]["lessonId"]
        if current_lesson_id == lessons[1]["id"]:
            log(f"✅ Lesson advanced by 1: Period {lessons[1]['period']}")
        else:
            log(f"⚠️  Lesson: {current_lesson_id}")
            
    except Exception as e:
        log(f"❌ TEST 6 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 7: Validation errors")
    log("=" * 80)
    
    try:
        # Missing date
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={}, timeout=30)
        if r.status_code == 400:
            log(f"✅ Missing date → 400: {r.json().get('error')}")
        else:
            log(f"❌ Expected 400, got {r.status_code}")
        
        # Invalid date format
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": "invalid"}, timeout=30)
        if r.status_code == 400:
            log(f"✅ Invalid date → 400: {r.json().get('error')}")
        else:
            log(f"❌ Expected 400, got {r.status_code}")
        
        # No auth
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            json={"date": today_iso}, timeout=30)
        if r.status_code == 401:
            log(f"✅ No auth → 401: {r.json().get('error')}")
        else:
            log(f"❌ Expected 401, got {r.status_code}")
            
    except Exception as e:
        log(f"❌ TEST 7 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 8: Regression - existing endpoints still work")
    log("=" * 80)
    
    try:
        # GET /me/timetable
        r = requests.get(f"{BASE_URL}/me/timetable",
            headers={"Authorization": f"Bearer {teacher_token}"}, timeout=30)
        if r.status_code == 200:
            log(f"✅ GET /me/timetable works")
        else:
            log(f"❌ GET /me/timetable failed: {r.status_code}")
        
        # POST /me/timetable/holiday
        r = requests.post(f"{BASE_URL}/me/timetable/holiday",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": "2026-12-25", "mark": True}, timeout=30)
        if r.status_code == 200:
            log(f"✅ POST /me/timetable/holiday works")
        else:
            log(f"❌ POST /me/timetable/holiday failed: {r.status_code}")
        
        # PUT /me/timetable
        r = requests.put(f"{BASE_URL}/me/timetable", 
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={
                "classType": "single",
                "classIds": [test_class["id"]],
                "weekly": {str(i): [] for i in range(7)},
                "setupComplete": False
            }, timeout=30)
        if r.status_code == 200:
            log(f"✅ PUT /me/timetable works")
        else:
            log(f"❌ PUT /me/timetable failed: {r.status_code}")
            
    except Exception as e:
        log(f"❌ TEST 8 FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST SUITE COMPLETED")
    log("=" * 80)

if __name__ == "__main__":
    test_sync_to_date_corrected()
