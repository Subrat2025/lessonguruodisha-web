#!/usr/bin/env python3
"""
Backend test for Date-Based Auto-Progression endpoint: POST /api/me/timetable/sync-to-date
Tests the new feature that walks timetable slots forward based on the date the teacher picks.
"""

import requests
import json
from datetime import datetime, timedelta
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_sync_to_date():
    """Test the new POST /api/me/timetable/sync-to-date endpoint"""
    
    # Generate random mobile for test teacher
    test_mobile = f"98{random.randint(10000000, 99999999)}"
    test_password = "test1234"
    
    log("=" * 80)
    log("TEST 1: Register fresh test teacher")
    log("=" * 80)
    
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Teacher Sync",
            "mobile": test_mobile,
            "password": test_password
        }, timeout=30)
        log(f"Register response: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: Register failed: {r.text}")
            return
        teacher_token = r.json()["token"]
        teacher_id = r.json()["user"]["id"]
        log(f"✅ Test teacher registered: {test_mobile}, ID: {teacher_id}")
    except Exception as e:
        log(f"❌ Test 1 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 2: Get classes, books, chapters, lessons for setup")
    log("=" * 80)
    
    try:
        # Get classes
        r = requests.get(f"{BASE_URL}/classes", timeout=30)
        classes = r.json()["classes"]
        test_class = classes[0]  # Use first class
        log(f"✅ Got {len(classes)} classes, using: {test_class['name']}")
        
        # Get books for this class
        r = requests.get(f"{BASE_URL}/books?classId={test_class['id']}", timeout=30)
        books = r.json()["books"]
        if not books:
            log(f"❌ No books found for class {test_class['name']}")
            return
        test_book = books[0]
        log(f"✅ Got {len(books)} books, using: {test_book['name']}")
        
        # Get chapters for this book
        r = requests.get(f"{BASE_URL}/chapters?classId={test_class['id']}&bookId={test_book['id']}", timeout=30)
        chapters = r.json()["chapters"]
        if not chapters:
            log(f"❌ No chapters found for book {test_book['name']}")
            return
        test_chapter = chapters[0]
        log(f"✅ Got {len(chapters)} chapters, using: {test_chapter['name']}")
        
        # Get lessons for this chapter
        r = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter['id']}", timeout=30)
        lessons = r.json()["lessons"]
        if len(lessons) < 3:
            log(f"❌ Need at least 3 lessons, found {len(lessons)}")
            return
        log(f"✅ Got {len(lessons)} lessons")
        log(f"   Lesson 1: {lessons[0]['title']} (period {lessons[0]['period']})")
        log(f"   Lesson 2: {lessons[1]['title']} (period {lessons[1]['period']})")
        log(f"   Lesson 3: {lessons[2]['title']} (period {lessons[2]['period']})")
        
    except Exception as e:
        log(f"❌ Test 2 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 3: Setup timetable with Monday slot pointing to lesson 1")
    log("=" * 80)
    
    today = datetime.now()
    # Find next Monday
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7  # If today is Monday, use next Monday
    next_monday = today + timedelta(days=days_until_monday)
    monday_iso = next_monday.strftime("%Y-%m-%d")
    
    log(f"Today: {today.strftime('%Y-%m-%d %A')}")
    log(f"Next Monday: {monday_iso}")
    
    try:
        # Setup timetable with Monday (weekday=1) having one period with lesson 1
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
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={
                "classType": "single",
                "classIds": [test_class["id"]],
                "weekly": weekly,
                "setupComplete": True
            }, timeout=30)
        
        log(f"PUT /me/timetable response: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: {r.text}")
            return
        
        timetable = r.json()["timetable"]
        log(f"✅ Timetable created with setupComplete=True")
        log(f"   Monday slot: lesson {lessons[0]['title']}")
        
        # Verify anchorDates are set
        if "anchorDates" in timetable and timetable["anchorDates"]:
            anchor_date = timetable["anchorDates"].get("1")
            log(f"✅ anchorDates initialized: Monday anchor = {anchor_date}")
        else:
            log(f"⚠️  anchorDates not set (backward compat mode)")
            
    except Exception as e:
        log(f"❌ Test 3 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 4: Validation errors")
    log("=" * 80)
    
    # Test 4a: Missing date
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={}, timeout=30)
        log(f"4a. Missing date: {r.status_code}")
        if r.status_code == 400:
            log(f"✅ Correctly rejected with 400: {r.json().get('error')}")
        else:
            log(f"❌ Expected 400, got {r.status_code}")
    except Exception as e:
        log(f"❌ Test 4a FAILED: {e}")
    
    # Test 4b: Invalid date format
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": "not-a-date"}, timeout=30)
        log(f"4b. Invalid date format: {r.status_code}")
        if r.status_code == 400:
            log(f"✅ Correctly rejected with 400: {r.json().get('error')}")
        else:
            log(f"❌ Expected 400, got {r.status_code}")
    except Exception as e:
        log(f"❌ Test 4b FAILED: {e}")
    
    # Test 4c: No auth
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            json={"date": monday_iso}, timeout=30)
        log(f"4c. No auth: {r.status_code}")
        if r.status_code == 401:
            log(f"✅ Correctly rejected with 401: {r.json().get('error')}")
        else:
            log(f"❌ Expected 401, got {r.status_code}")
    except Exception as e:
        log(f"❌ Test 4c FAILED: {e}")
    
    log("\n" + "=" * 80)
    log("TEST 5: Sync same day (next Monday) → no-op")
    log("=" * 80)
    
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": monday_iso}, timeout=30)
        
        log(f"Sync to {monday_iso}: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: {r.text}")
            return
        
        result = r.json()
        log(f"✅ Response: ok={result['ok']}, advanced={result['advanced']}, weeksDiff={result['weeksDiff']}")
        
        if result["weeksDiff"] == 0 and result["advanced"] == 0:
            log(f"✅ Correctly returned weeksDiff=0, advanced=0 (no-op)")
        else:
            log(f"❌ Expected weeksDiff=0 and advanced=0, got weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        # Verify lesson still on lesson 1
        timetable = result["timetable"]
        monday_slot = timetable["weekly"]["1"][0]
        if monday_slot["lessonId"] == lessons[0]["id"]:
            log(f"✅ Monday slot still on lesson 1: {lessons[0]['title']}")
        else:
            log(f"❌ Monday slot changed unexpectedly")
            
    except Exception as e:
        log(f"❌ Test 5 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 6: Sync forward 1 week → 1 advancement")
    log("=" * 80)
    
    monday_plus_7 = (next_monday + timedelta(days=7)).strftime("%Y-%m-%d")
    log(f"Syncing to: {monday_plus_7} (1 week forward)")
    
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": monday_plus_7}, timeout=30)
        
        log(f"Sync response: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: {r.text}")
            return
        
        result = r.json()
        log(f"✅ Response: ok={result['ok']}, advanced={result['advanced']}, weeksDiff={result['weeksDiff']}")
        
        if result["weeksDiff"] == 1:
            log(f"✅ Correctly calculated weeksDiff=1")
        else:
            log(f"❌ Expected weeksDiff=1, got {result['weeksDiff']}")
        
        if result["advanced"] == 1:
            log(f"✅ Advanced 1 slot")
            if "moves" in result and len(result["moves"]) > 0:
                move = result["moves"][0]
                log(f"   Move: period {move['periodNumber']} → {move.get('next', 'N/A')}")
        else:
            log(f"❌ Expected advanced=1, got {result['advanced']}")
        
        # Verify lesson advanced to lesson 2
        timetable = result["timetable"]
        monday_slot = timetable["weekly"]["1"][0]
        if monday_slot["lessonId"] == lessons[1]["id"]:
            log(f"✅ Monday slot advanced to lesson 2: {lessons[1]['title']}")
        else:
            log(f"❌ Expected lesson 2, got lessonId={monday_slot['lessonId']}")
        
        # Verify anchor date updated
        if timetable["anchorDates"]["1"] == monday_plus_7:
            log(f"✅ Anchor date updated to {monday_plus_7}")
        else:
            log(f"⚠️  Anchor date: {timetable['anchorDates']['1']}")
            
    except Exception as e:
        log(f"❌ Test 6 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 7: Sync forward 2 more weeks → 2 more advancements")
    log("=" * 80)
    
    monday_plus_21 = (next_monday + timedelta(days=21)).strftime("%Y-%m-%d")
    log(f"Syncing to: {monday_plus_21} (2 weeks forward from current anchor)")
    
    try:
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": monday_plus_21}, timeout=30)
        
        log(f"Sync response: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: {r.text}")
            return
        
        result = r.json()
        log(f"✅ Response: ok={result['ok']}, advanced={result['advanced']}, weeksDiff={result['weeksDiff']}")
        
        if result["weeksDiff"] == 2:
            log(f"✅ Correctly calculated weeksDiff=2")
        else:
            log(f"❌ Expected weeksDiff=2, got {result['weeksDiff']}")
        
        # Should advance 2 more times (from lesson 2 to lesson 3, then to lesson 4 if exists)
        timetable = result["timetable"]
        monday_slot = timetable["weekly"]["1"][0]
        
        # Check if we have at least 4 lessons
        if len(lessons) >= 4:
            if monday_slot["lessonId"] == lessons[3]["id"]:
                log(f"✅ Monday slot advanced to lesson 4: {lessons[3]['title']}")
            else:
                log(f"⚠️  Expected lesson 4, got lessonId={monday_slot['lessonId']}")
        else:
            log(f"⚠️  Only {len(lessons)} lessons available, cannot verify lesson 4")
            log(f"   Current lessonId: {monday_slot['lessonId']}")
            
    except Exception as e:
        log(f"❌ Test 7 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 8: Sync backward (past date) → no-op")
    log("=" * 80)
    
    monday_minus_14 = (next_monday - timedelta(days=14)).strftime("%Y-%m-%d")
    log(f"Syncing to: {monday_minus_14} (2 weeks in the past)")
    
    try:
        # Get current state
        r = requests.get(f"{BASE_URL}/me/timetable",
            headers={"Authorization": f"Bearer {teacher_token}"}, timeout=30)
        before_timetable = r.json()["timetable"]
        before_lesson_id = before_timetable["weekly"]["1"][0]["lessonId"]
        
        # Try to sync backward
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": monday_minus_14}, timeout=30)
        
        log(f"Sync response: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: {r.text}")
            return
        
        result = r.json()
        log(f"✅ Response: ok={result['ok']}, advanced={result['advanced']}, weeksDiff={result['weeksDiff']}")
        
        if result["weeksDiff"] == 0 and result["advanced"] == 0:
            log(f"✅ Correctly returned weeksDiff=0, advanced=0 (no reverse-advance)")
        else:
            log(f"❌ Expected no-op, got weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        # Verify lesson unchanged
        after_lesson_id = result["timetable"]["weekly"]["1"][0]["lessonId"]
        if after_lesson_id == before_lesson_id:
            log(f"✅ Lesson unchanged (no reverse-advance)")
        else:
            log(f"❌ Lesson changed unexpectedly")
            
    except Exception as e:
        log(f"❌ Test 8 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 9: Holidays should be skipped in week count")
    log("=" * 80)
    
    # Create a fresh teacher for this test
    test_mobile2 = f"97{random.randint(10000000, 99999999)}"
    
    try:
        # Register new teacher
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Teacher Holiday",
            "mobile": test_mobile2,
            "password": test_password
        }, timeout=30)
        teacher2_token = r.json()["token"]
        log(f"✅ New test teacher registered: {test_mobile2}")
        
        # Setup timetable with Monday slot
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
        log(f"✅ Timetable setup for teacher 2")
        
        # Mark next Monday as holiday
        next_monday_holiday = (next_monday + timedelta(days=7)).strftime("%Y-%m-%d")
        r = requests.post(f"{BASE_URL}/me/timetable/holiday",
            headers={"Authorization": f"Bearer {teacher2_token}"},
            json={"date": next_monday_holiday, "mark": True}, timeout=30)
        log(f"✅ Marked {next_monday_holiday} as holiday")
        
        # Sync to Monday two weeks from now
        monday_two_weeks = (next_monday + timedelta(days=14)).strftime("%Y-%m-%d")
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher2_token}"},
            json={"date": monday_two_weeks}, timeout=30)
        
        log(f"Sync to {monday_two_weeks}: {r.status_code}")
        if r.status_code != 200:
            log(f"ERROR: {r.text}")
            return
        
        result = r.json()
        log(f"✅ Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        # Should be weeksDiff=1 (not 2) because one Monday was a holiday
        if result["weeksDiff"] == 1:
            log(f"✅ Correctly skipped holiday: weeksDiff=1 (not 2)")
        else:
            log(f"❌ Expected weeksDiff=1 (holiday skipped), got {result['weeksDiff']}")
        
        # Lesson should advance by 1 (to lesson 2)
        monday_slot = result["timetable"]["weekly"]["1"][0]
        if monday_slot["lessonId"] == lessons[1]["id"]:
            log(f"✅ Advanced by 1 lesson only (holiday skipped)")
        else:
            log(f"⚠️  Lesson: {monday_slot['lessonId']}")
            
    except Exception as e:
        log(f"❌ Test 9 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 10: Chapter exhaustion → jumps to next chapter")
    log("=" * 80)
    
    try:
        # Get the last lesson of the first chapter
        last_lesson = lessons[-1]
        log(f"Last lesson of chapter: {last_lesson['title']} (period {last_lesson['period']})")
        
        # Get next chapter
        if len(chapters) < 2:
            log(f"⚠️  Only 1 chapter available, cannot test chapter jump")
        else:
            next_chapter = chapters[1]
            log(f"Next chapter: {next_chapter['name']}")
            
            # Get first lesson of next chapter
            r = requests.get(f"{BASE_URL}/lessons?chapterId={next_chapter['id']}", timeout=30)
            next_chapter_lessons = r.json()["lessons"]
            if not next_chapter_lessons:
                log(f"⚠️  Next chapter has no lessons, cannot test chapter jump")
            else:
                first_lesson_next_chapter = next_chapter_lessons[0]
                log(f"First lesson of next chapter: {first_lesson_next_chapter['title']}")
                
                # Create a fresh teacher for this test
                test_mobile3 = f"96{random.randint(10000000, 99999999)}"
                r = requests.post(f"{BASE_URL}/auth/register", json={
                    "name": "Test Teacher Chapter Jump",
                    "mobile": test_mobile3,
                    "password": test_password
                }, timeout=30)
                teacher3_token = r.json()["token"]
                log(f"✅ New test teacher registered: {test_mobile3}")
                
                # Setup timetable with Monday slot pointing to LAST lesson of first chapter
                weekly = {str(i): [] for i in range(7)}
                weekly["1"] = [{
                    "periodNumber": 1,
                    "time": "08:00",
                    "classId": test_class["id"],
                    "bookId": test_book["id"],
                    "chapterId": test_chapter["id"],
                    "lessonId": last_lesson["id"]
                }]
                
                r = requests.put(f"{BASE_URL}/me/timetable", 
                    headers={"Authorization": f"Bearer {teacher3_token}"},
                    json={
                        "classType": "single",
                        "classIds": [test_class["id"]],
                        "weekly": weekly,
                        "setupComplete": True
                    }, timeout=30)
                log(f"✅ Timetable setup with last lesson of chapter 1")
                
                # Sync forward 1 week
                monday_plus_7 = (next_monday + timedelta(days=7)).strftime("%Y-%m-%d")
                r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
                    headers={"Authorization": f"Bearer {teacher3_token}"},
                    json={"date": monday_plus_7}, timeout=30)
                
                log(f"Sync forward 1 week: {r.status_code}")
                if r.status_code != 200:
                    log(f"ERROR: {r.text}")
                    return
                
                result = r.json()
                log(f"✅ Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
                
                # Check if jumped to next chapter
                monday_slot = result["timetable"]["weekly"]["1"][0]
                if monday_slot["chapterId"] == next_chapter["id"]:
                    log(f"✅ Jumped to next chapter: {next_chapter['name']}")
                    if monday_slot["lessonId"] == first_lesson_next_chapter["id"]:
                        log(f"✅ Points to first lesson of next chapter: {first_lesson_next_chapter['title']}")
                    else:
                        log(f"⚠️  Chapter jumped but lesson mismatch")
                else:
                    log(f"❌ Did not jump to next chapter")
                
                # Check moves array
                if "moves" in result and len(result["moves"]) > 0:
                    move = result["moves"][0]
                    if move.get("jumpedChapter"):
                        log(f"✅ moves[0].jumpedChapter = true")
                    else:
                        log(f"❌ moves[0].jumpedChapter = false")
                        
    except Exception as e:
        log(f"❌ Test 10 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("TEST 11: Regression - Existing endpoints still work")
    log("=" * 80)
    
    try:
        # Test PUT /me/timetable
        r = requests.put(f"{BASE_URL}/me/timetable", 
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={
                "classType": "single",
                "classIds": [test_class["id"]],
                "weekly": {str(i): [] for i in range(7)},
                "setupComplete": False
            }, timeout=30)
        if r.status_code == 200:
            log(f"✅ PUT /me/timetable still works")
        else:
            log(f"❌ PUT /me/timetable failed: {r.status_code}")
        
        # Test POST /me/timetable/holiday
        r = requests.post(f"{BASE_URL}/me/timetable/holiday",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": "2026-12-25", "mark": True}, timeout=30)
        if r.status_code == 200:
            log(f"✅ POST /me/timetable/holiday still works")
        else:
            log(f"❌ POST /me/timetable/holiday failed: {r.status_code}")
        
        # Test GET /me/timetable
        r = requests.get(f"{BASE_URL}/me/timetable",
            headers={"Authorization": f"Bearer {teacher_token}"}, timeout=30)
        if r.status_code == 200:
            log(f"✅ GET /me/timetable still works")
            # Verify anchorDates are preserved
            tt = r.json()["timetable"]
            if "anchorDates" in tt:
                log(f"✅ anchorDates preserved in timetable")
        else:
            log(f"❌ GET /me/timetable failed: {r.status_code}")
            
    except Exception as e:
        log(f"❌ Test 11 FAILED: {e}")
        return
    
    log("\n" + "=" * 80)
    log("ALL TESTS COMPLETED")
    log("=" * 80)

if __name__ == "__main__":
    test_sync_to_date()
