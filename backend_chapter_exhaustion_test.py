#!/usr/bin/env python3
"""
Additional test for chapter exhaustion scenario
"""

import requests
import json
from datetime import datetime, timedelta
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_chapter_exhaustion():
    """Test chapter exhaustion → jumps to next chapter"""
    
    log("=" * 80)
    log("TEST: Chapter Exhaustion → Jump to Next Chapter")
    log("=" * 80)
    
    # Register test teacher
    test_mobile = f"93{random.randint(10000000, 99999999)}"
    
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test Teacher Chapter",
            "mobile": test_mobile,
            "password": "test1234"
        }, timeout=30)
        teacher_token = r.json()["token"]
        log(f"✅ Test teacher registered: {test_mobile}")
        
        # Get test data - find a book with multiple chapters
        r = requests.get(f"{BASE_URL}/classes", timeout=30)
        classes = r.json()["classes"]
        
        # Try to find a class with multiple chapters
        test_class = None
        test_book = None
        chapters = []
        
        for cls in classes:
            r = requests.get(f"{BASE_URL}/books?classId={cls['id']}", timeout=30)
            books = r.json()["books"]
            
            for book in books:
                r = requests.get(f"{BASE_URL}/chapters?classId={cls['id']}&bookId={book['id']}", timeout=30)
                chaps = r.json()["chapters"]
                
                if len(chaps) >= 2:
                    # Check if first chapter has lessons
                    r = requests.get(f"{BASE_URL}/lessons?chapterId={chaps[0]['id']}", timeout=30)
                    lessons1 = r.json()["lessons"]
                    
                    # Check if second chapter has lessons
                    r = requests.get(f"{BASE_URL}/lessons?chapterId={chaps[1]['id']}", timeout=30)
                    lessons2 = r.json()["lessons"]
                    
                    if len(lessons1) > 0 and len(lessons2) > 0:
                        test_class = cls
                        test_book = book
                        chapters = chaps
                        break
            
            if test_class:
                break
        
        if not test_class or len(chapters) < 2:
            log(f"⚠️  Could not find a book with 2+ chapters with lessons")
            log(f"   Skipping chapter exhaustion test")
            return
        
        log(f"✅ Using: {test_class['name']} / {test_book['name']}")
        log(f"✅ Chapter 1: {chapters[0]['name']}")
        log(f"✅ Chapter 2: {chapters[1]['name']}")
        
        # Get lessons for both chapters
        r = requests.get(f"{BASE_URL}/lessons?chapterId={chapters[0]['id']}", timeout=30)
        lessons_ch1 = r.json()["lessons"]
        
        r = requests.get(f"{BASE_URL}/lessons?chapterId={chapters[1]['id']}", timeout=30)
        lessons_ch2 = r.json()["lessons"]
        
        log(f"✅ Chapter 1 has {len(lessons_ch1)} lessons")
        log(f"✅ Chapter 2 has {len(lessons_ch2)} lessons")
        
        # Get the last lesson of chapter 1
        last_lesson_ch1 = lessons_ch1[-1]
        first_lesson_ch2 = lessons_ch2[0]
        
        log(f"✅ Last lesson of Chapter 1: Period {last_lesson_ch1['period']} - {last_lesson_ch1['title']}")
        log(f"✅ First lesson of Chapter 2: Period {first_lesson_ch2['period']} - {first_lesson_ch2['title']}")
        
        # Setup timetable with Monday slot pointing to LAST lesson of chapter 1
        today = datetime.now()
        today_iso = today.strftime("%Y-%m-%d")
        
        weekly = {str(i): [] for i in range(7)}
        weekly["1"] = [{
            "periodNumber": 1,
            "time": "08:00",
            "classId": test_class["id"],
            "bookId": test_book["id"],
            "chapterId": chapters[0]["id"],
            "lessonId": last_lesson_ch1["id"]
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
        log(f"✅ Timetable setup with last lesson of Chapter 1")
        log(f"   Anchor: {anchor}")
        
        # Sync forward 1 week
        anchor_date = datetime.strptime(anchor, "%Y-%m-%d")
        target_date = anchor_date + timedelta(days=7)
        target_iso = target_date.strftime("%Y-%m-%d")
        
        log(f"\nSyncing forward 1 week to {target_iso}...")
        
        r = requests.post(f"{BASE_URL}/me/timetable/sync-to-date",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"date": target_iso}, timeout=30)
        
        result = r.json()
        log(f"Response: weeksDiff={result['weeksDiff']}, advanced={result['advanced']}")
        
        # Check if jumped to next chapter
        monday_slot = result["timetable"]["weekly"]["1"][0]
        
        if monday_slot["chapterId"] == chapters[1]["id"]:
            log(f"✅ PASS: Jumped to Chapter 2: {chapters[1]['name']}")
            
            if monday_slot["lessonId"] == first_lesson_ch2["id"]:
                log(f"✅ PASS: Points to first lesson of Chapter 2: {first_lesson_ch2['title']}")
            else:
                log(f"⚠️  Lesson ID mismatch")
        else:
            log(f"❌ FAIL: Did not jump to Chapter 2")
            log(f"   Current chapterId: {monday_slot['chapterId']}")
            log(f"   Expected chapterId: {chapters[1]['id']}")
        
        # Check moves array
        if "moves" in result and len(result["moves"]) > 0:
            move = result["moves"][0]
            if move.get("jumpedChapter"):
                log(f"✅ PASS: moves[0].jumpedChapter = true")
            else:
                log(f"❌ FAIL: moves[0].jumpedChapter = false")
            
            log(f"   Move details: {move}")
        else:
            log(f"⚠️  No moves in response")
            
    except Exception as e:
        log(f"❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_chapter_exhaustion()
