#!/usr/bin/env python3
"""
Backend Test: Class 9 & 10 5E HTML Lesson Plan Import
Focused regression test for the new 5E import endpoint.
"""
import requests
import json
import os
from datetime import datetime

# Read base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
if os.path.exists("/app/.env"):
    with open("/app/.env") as f:
        for line in f:
            if line.startswith("NEXT_PUBLIC_BASE_URL="):
                base = line.split("=", 1)[1].strip()
                BASE_URL = f"{base}/api"
                break

print(f"🔗 Base URL: {BASE_URL}")

# Admin credentials from test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test state
admin_token = None
test_chapter_id = None
test_book_id = None
test_class_id = None
test_lesson_ids = []
test_chapter_title = None

def login_admin():
    """Login as admin and get token"""
    global admin_token
    print("\n📝 Test 1: Admin Login")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "token" in data, "No token in response"
        admin_token = data["token"]
        print(f"✅ Admin login successful, token: {admin_token[:20]}...")
        return True
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return False

def test_5e_import_valid():
    """Test 2: POST /api/admin/import/5e with valid Class 9 payload"""
    global test_chapter_id, test_book_id, test_class_id, test_lesson_ids, test_chapter_title
    print("\n📝 Test 2: POST /api/admin/import/5e - Valid Class 9 payload")
    
    timestamp = int(datetime.now().timestamp())
    test_chapter_title = f"Test 5E Chapter {timestamp}"
    payload = {
        "meta": {
            "className": "Class 9",
            "subject": "English",
            "chapterNumber": 99,
            "chapterTitle": f"Test 5E Chapter {timestamp}"
        },
        "periods": [
            {
                "period": 1,
                "durationMin": 45,
                "topic": "Introduction to 5E Model - Engage Phase",
                "sections": {
                    "learningOutcomes": {
                        "items": ["Students will understand the 5E model", "Students will engage with the topic"],
                        "html": "<ul><li>Students will understand the 5E model</li><li>Students will engage with the topic</li></ul>"
                    },
                    "tlm": {
                        "items": ["Whiteboard", "Markers", "Chart paper"],
                        "html": "<ul><li>Whiteboard</li><li>Markers</li><li>Chart paper</li></ul>"
                    },
                    "hotsQuestions": {
                        "items": ["What is the 5E model?", "How does it help learning?"],
                        "html": "<ul><li>What is the 5E model?</li><li>How does it help learning?</li></ul>"
                    },
                    "homework": {
                        "items": ["Read chapter 1", "Complete worksheet"],
                        "html": "<p>Read chapter 1. Complete worksheet.</p>"
                    }
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": "Ask students about their prior knowledge", "student": "Share their experiences"},
                    {"stage": "EXPLORE", "time": "10 Min", "teacher": "Guide students to explore the concept", "student": "Work in groups to explore"},
                    {"stage": "EXPLAIN", "time": "10 Min", "teacher": "Explain the concept clearly", "student": "Listen and take notes"},
                    {"stage": "ELABORATE", "time": "15 Min", "teacher": "Provide examples and applications", "student": "Apply concepts to new situations"},
                    {"stage": "EVALUATE", "time": "5 Min", "teacher": "Assess student understanding", "student": "Demonstrate learning"}
                ]
            },
            {
                "period": 2,
                "durationMin": 45,
                "topic": "Explore Phase - Deep Dive",
                "sections": {
                    "learningOutcomes": {
                        "items": ["Students will explore concepts deeply"],
                        "html": "<ul><li>Students will explore concepts deeply</li></ul>"
                    },
                    "tlm": {
                        "items": ["Textbook", "Worksheets"],
                        "html": "<ul><li>Textbook</li><li>Worksheets</li></ul>"
                    }
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": "Review previous lesson", "student": "Recall and share"},
                    {"stage": "EXPLORE", "time": "15 Min", "teacher": "Facilitate exploration activities", "student": "Explore independently"},
                    {"stage": "EXPLAIN", "time": "10 Min", "teacher": "Clarify misconceptions", "student": "Ask questions"},
                    {"stage": "ELABORATE", "time": "10 Min", "teacher": "Extend learning", "student": "Practice skills"},
                    {"stage": "EVALUATE", "time": "5 Min", "teacher": "Quick assessment", "student": "Self-assess"}
                ]
            },
            {
                "period": 3,
                "durationMin": 45,
                "topic": "Explain Phase - Concept Clarity",
                "sections": {
                    "learningOutcomes": {
                        "items": ["Students will explain concepts clearly"],
                        "html": "<ul><li>Students will explain concepts clearly</li></ul>"
                    },
                    "tlm": {
                        "items": ["Projector", "Slides"],
                        "html": "<ul><li>Projector</li><li>Slides</li></ul>"
                    }
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": "Connect to real life", "student": "Share examples"},
                    {"stage": "EXPLORE", "time": "10 Min", "teacher": "Guide discovery", "student": "Discover patterns"},
                    {"stage": "EXPLAIN", "time": "15 Min", "teacher": "Detailed explanation", "student": "Understand deeply"},
                    {"stage": "ELABORATE", "time": "10 Min", "teacher": "Provide practice", "student": "Apply knowledge"},
                    {"stage": "EVALUATE", "time": "5 Min", "teacher": "Check understanding", "student": "Demonstrate mastery"}
                ]
            },
            {
                "period": 4,
                "durationMin": 45,
                "topic": "Elaborate Phase - Application",
                "sections": {
                    "learningOutcomes": {
                        "items": ["Students will apply concepts to new contexts"],
                        "html": "<ul><li>Students will apply concepts to new contexts</li></ul>"
                    },
                    "tlm": {
                        "items": ["Activity sheets", "Models"],
                        "html": "<ul><li>Activity sheets</li><li>Models</li></ul>"
                    }
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": "Pose challenging question", "student": "Think critically"},
                    {"stage": "EXPLORE", "time": "10 Min", "teacher": "Facilitate investigation", "student": "Investigate problem"},
                    {"stage": "EXPLAIN", "time": "10 Min", "teacher": "Connect to theory", "student": "Make connections"},
                    {"stage": "ELABORATE", "time": "15 Min", "teacher": "Complex applications", "student": "Solve complex problems"},
                    {"stage": "EVALUATE", "time": "5 Min", "teacher": "Assess application", "student": "Present solutions"}
                ]
            },
            {
                "period": 5,
                "durationMin": 45,
                "topic": "Evaluate Phase - Assessment",
                "sections": {
                    "learningOutcomes": {
                        "items": ["Students will demonstrate mastery"],
                        "html": "<ul><li>Students will demonstrate mastery</li></ul>"
                    },
                    "tlm": {
                        "items": ["Test papers", "Rubrics"],
                        "html": "<ul><li>Test papers</li><li>Rubrics</li></ul>"
                    }
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": "Review key concepts", "student": "Summarize learning"},
                    {"stage": "EXPLORE", "time": "10 Min", "teacher": "Final exploration", "student": "Explore independently"},
                    {"stage": "EXPLAIN", "time": "10 Min", "teacher": "Final clarifications", "student": "Ask final questions"},
                    {"stage": "ELABORATE", "time": "10 Min", "teacher": "Advanced applications", "student": "Tackle advanced problems"},
                    {"stage": "EVALUATE", "time": "10 Min", "teacher": "Comprehensive assessment", "student": "Complete assessment"}
                ]
            }
        ],
        "dedupeMode": "replace"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/import/5e",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True, "Expected ok:true"
        assert data.get("lessonsCreated") == 5, f"Expected 5 lessons created, got {data.get('lessonsCreated')}"
        assert data.get("lessonsReplaced") == 0, f"Expected 0 lessons replaced, got {data.get('lessonsReplaced')}"
        assert "classId" in data, "Missing classId"
        assert "bookId" in data, "Missing bookId"
        assert "chapterId" in data, "Missing chapterId"
        
        test_class_id = data["classId"]
        test_book_id = data["bookId"]
        test_chapter_id = data["chapterId"]
        
        print(f"✅ 5E import successful: {data.get('lessonsCreated')} lessons created")
        print(f"   classId: {test_class_id}, bookId: {test_book_id}, chapterId: {test_chapter_id}")
        return True
    except Exception as e:
        print(f"❌ 5E import failed: {e}")
        return False

def test_5e_import_skip_mode():
    """Test 3: Re-import with dedupeMode='skip' - should skip all 5 lessons"""
    print("\n📝 Test 3: POST /api/admin/import/5e - Skip mode (re-import)")
    
    # Use same chapter title as Test 2 to ensure we're testing the same chapter
    # We need to get the chapter title from the previous test
    # For simplicity, we'll use a fixed timestamp that we store globally
    global test_chapter_title
    if not test_chapter_title:
        print("⚠️ No chapter title from Test 2, skipping")
        return False
    
    payload = {
        "meta": {
            "className": "Class 9",
            "subject": "English",
            "chapterNumber": 99,
            "chapterTitle": test_chapter_title
        },
        "periods": [
            {
                "period": i,
                "durationMin": 45,
                "topic": f"Period {i}",
                "sections": {
                    "learningOutcomes": {"items": ["LO"], "html": "<ul><li>LO</li></ul>"}
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": "T", "student": "S"},
                    {"stage": "EXPLORE", "time": "10 Min", "teacher": "T", "student": "S"},
                    {"stage": "EXPLAIN", "time": "10 Min", "teacher": "T", "student": "S"},
                    {"stage": "ELABORATE", "time": "15 Min", "teacher": "T", "student": "S"},
                    {"stage": "EVALUATE", "time": "5 Min", "teacher": "T", "student": "S"}
                ]
            }
            for i in range(1, 6)
        ],
        "dedupeMode": "skip"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/import/5e",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("lessonsSkipped") == 5, f"Expected 5 lessons skipped, got {data.get('lessonsSkipped')}"
        assert data.get("lessonsCreated") == 0, f"Expected 0 lessons created, got {data.get('lessonsCreated')}"
        print(f"✅ Skip mode working: {data.get('lessonsSkipped')} lessons skipped")
        return True
    except Exception as e:
        print(f"❌ Skip mode test failed: {e}")
        return False

def test_5e_import_replace_mode():
    """Test 4: Re-import with dedupeMode='replace' - should replace all 5 lessons"""
    print("\n📝 Test 4: POST /api/admin/import/5e - Replace mode (re-import)")
    
    global test_chapter_title
    if not test_chapter_title:
        print("⚠️ No chapter title from Test 2, skipping")
        return False
    
    payload = {
        "meta": {
            "className": "Class 9",
            "subject": "English",
            "chapterNumber": 99,
            "chapterTitle": test_chapter_title
        },
        "periods": [
            {
                "period": i,
                "durationMin": 45,
                "topic": f"Updated Period {i}",
                "sections": {
                    "learningOutcomes": {
                        "items": [f"Updated LO {i}"],
                        "html": f"<ul><li>Updated LO {i}</li></ul>"
                    },
                    "tlm": {
                        "items": [f"Updated TLM {i}"],
                        "html": f"<ul><li>Updated TLM {i}</li></ul>"
                    }
                },
                "fiveE": [
                    {"stage": "ENGAGE", "time": "5 Min", "teacher": f"Updated engage {i}", "student": f"Updated student engage {i}"},
                    {"stage": "EXPLORE", "time": "10 Min", "teacher": f"Updated explore {i}", "student": f"Updated student explore {i}"},
                    {"stage": "EXPLAIN", "time": "10 Min", "teacher": f"Updated explain {i}", "student": f"Updated student explain {i}"},
                    {"stage": "ELABORATE", "time": "15 Min", "teacher": f"Updated elaborate {i}", "student": f"Updated student elaborate {i}"},
                    {"stage": "EVALUATE", "time": "5 Min", "teacher": f"Updated evaluate {i}", "student": f"Updated student evaluate {i}"}
                ]
            }
            for i in range(1, 6)
        ],
        "dedupeMode": "replace"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/import/5e",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("lessonsReplaced") == 5, f"Expected 5 lessons replaced, got {data.get('lessonsReplaced')}"
        assert data.get("lessonsCreated") == 0, f"Expected 0 lessons created, got {data.get('lessonsCreated')}"
        print(f"✅ Replace mode working: {data.get('lessonsReplaced')} lessons replaced")
        return True
    except Exception as e:
        print(f"❌ Replace mode test failed: {e}")
        return False

def test_5e_import_class7_rejection():
    """Test 5: POST with Class 7 should return 400"""
    print("\n📝 Test 5: POST /api/admin/import/5e - Class 7 rejection")
    
    payload = {
        "meta": {
            "className": "Class 7",
            "subject": "English",
            "chapterNumber": 1,
            "chapterTitle": "Test Chapter"
        },
        "periods": [{"period": 1, "durationMin": 45, "topic": "Test", "sections": {}, "fiveE": []}],
        "dedupeMode": "replace"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/import/5e",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        assert "Only Class 9" in data.get("error", ""), f"Expected error message about Class 9/10, got: {data.get('error')}"
        print(f"✅ Class 7 correctly rejected with 400: {data.get('error')}")
        return True
    except Exception as e:
        print(f"❌ Class 7 rejection test failed: {e}")
        return False

def test_5e_import_empty_periods():
    """Test 6: POST with empty periods should return 400"""
    print("\n📝 Test 6: POST /api/admin/import/5e - Empty periods rejection")
    
    payload = {
        "meta": {
            "className": "Class 9",
            "subject": "English",
            "chapterNumber": 1,
            "chapterTitle": "Test Chapter"
        },
        "periods": [],
        "dedupeMode": "replace"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/import/5e",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        assert "meta and periods" in data.get("error", ""), f"Expected error about meta/periods, got: {data.get('error')}"
        print(f"✅ Empty periods correctly rejected with 400: {data.get('error')}")
        return True
    except Exception as e:
        print(f"❌ Empty periods test failed: {e}")
        return False

def test_5e_import_no_auth():
    """Test 7: POST without auth should return 401"""
    print("\n📝 Test 7: POST /api/admin/import/5e - No auth rejection")
    
    payload = {
        "meta": {"className": "Class 9", "subject": "English", "chapterNumber": 1, "chapterTitle": "Test"},
        "periods": [{"period": 1, "durationMin": 45, "topic": "Test", "sections": {}, "fiveE": []}]
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/admin/import/5e", json=payload, timeout=10)
        # Backend may return 401 or 403 depending on auth check order
        assert resp.status_code in [401, 403], f"Expected 401 or 403, got {resp.status_code}"
        print(f"✅ No auth correctly rejected with {resp.status_code}")
        return True
    except Exception as e:
        print(f"❌ No auth test failed: {e}")
        return False

def test_5e_import_non_admin():
    """Test 8: POST with non-admin token should return 403"""
    print("\n📝 Test 8: POST /api/admin/import/5e - Non-admin rejection")
    
    # Create a regular user
    try:
        user_mobile = f"99{int(datetime.now().timestamp()) % 100000000}"
        reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": user_mobile,
            "password": "test123"
        }, timeout=10)
        assert reg_resp.status_code == 200, f"User registration failed: {reg_resp.status_code}"
        user_token = reg_resp.json()["token"]
        
        payload = {
            "meta": {"className": "Class 9", "subject": "English", "chapterNumber": 1, "chapterTitle": "Test"},
            "periods": [{"period": 1, "durationMin": 45, "topic": "Test", "sections": {}, "fiveE": []}]
        }
        
        resp = requests.post(
            f"{BASE_URL}/admin/import/5e",
            json=payload,
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print(f"✅ Non-admin correctly rejected with 403")
        return True
    except Exception as e:
        print(f"❌ Non-admin test failed: {e}")
        return False

def test_lesson_verification():
    """Test 9: Verify lesson docs have correct 5E structure"""
    print("\n📝 Test 9: GET /api/lessons?chapterId - Verify 5 lessons exist")
    
    try:
        resp = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter_id}", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        lessons = data.get("lessons", [])
        assert len(lessons) == 5, f"Expected 5 lessons, got {len(lessons)}"
        
        # Store lesson IDs for later tests
        global test_lesson_ids
        test_lesson_ids = [l["id"] for l in lessons]
        
        print(f"✅ Found 5 lessons in chapter")
        return True
    except Exception as e:
        print(f"❌ Lesson verification failed: {e}")
        return False

def test_lesson_detail_structure():
    """Test 10: GET /api/lessons/:id - Verify 5E structure"""
    print("\n📝 Test 10: GET /api/lessons/:id - Verify 5E structure")
    
    if not test_lesson_ids:
        print("⚠️ No lesson IDs available, skipping")
        return False
    
    lesson_id = test_lesson_ids[0]
    
    try:
        resp = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        lesson = data.get("lesson", {})
        
        # Verify format
        assert lesson.get("format") == "fiveE", f"Expected format='fiveE', got {lesson.get('format')}"
        
        # Verify fiveE structure
        fiveE = lesson.get("fiveE", {})
        assert "stages" in fiveE, "Missing fiveE.stages"
        assert "sections" in fiveE, "Missing fiveE.sections"
        
        stages = fiveE.get("stages", [])
        assert len(stages) == 5, f"Expected 5 stages, got {len(stages)}"
        
        # Verify stage structure
        for stage in stages:
            assert "stage" in stage, "Missing stage field"
            assert "time" in stage, "Missing time field"
            assert "teacher" in stage, "Missing teacher field"
            assert "student" in stage, "Missing student field"
        
        # Verify sections
        sections = fiveE.get("sections", {})
        assert "learningOutcomes" in sections, "Missing sections.learningOutcomes"
        assert "tlm" in sections, "Missing sections.tlm"
        
        # Verify backward compatibility fields
        assert "learningOutcomes" in lesson, "Missing top-level learningOutcomes"
        assert "tlm" in lesson, "Missing top-level tlm"
        assert "panchapadi" in lesson, "Missing panchapadi (back-compat)"
        
        panchapadi = lesson.get("panchapadi", {})
        assert "teacherActivityText" in panchapadi, "Missing panchapadi.teacherActivityText"
        assert "studentActivityText" in panchapadi, "Missing panchapadi.studentActivityText"
        assert len(panchapadi["teacherActivityText"]) > 0, "teacherActivityText is empty"
        assert len(panchapadi["studentActivityText"]) > 0, "studentActivityText is empty"
        
        print(f"✅ Lesson structure verified:")
        print(f"   - format: {lesson.get('format')}")
        print(f"   - fiveE.stages: {len(stages)} stages")
        print(f"   - fiveE.sections: {list(sections.keys())}")
        print(f"   - learningOutcomes: {len(lesson.get('learningOutcomes', []))} items")
        print(f"   - tlm: {len(lesson.get('tlm', []))} items")
        print(f"   - panchapadi.teacherActivityText: {len(panchapadi['teacherActivityText'])} chars")
        return True
    except Exception as e:
        print(f"❌ Lesson detail structure test failed: {e}")
        return False

def test_daily_plan_propagation():
    """Test 11: POST /api/daily-plan/generate - Verify 5E format propagates"""
    print("\n📝 Test 11: POST /api/daily-plan/generate - Verify 5E propagation")
    
    if not test_lesson_ids:
        print("⚠️ No lesson IDs available, skipping")
        return False
    
    payload = {
        "date": "2025-01-15",
        "schoolName": "Test School",
        "classType": "single",
        "slots": [
            {"lessonId": test_lesson_ids[0]}
        ]
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/daily-plan/generate",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        periods = data.get("periods", [])
        assert len(periods) > 0, "No periods in daily plan"
        
        period = periods[0]
        assert period.get("format") == "fiveE", f"Expected format='fiveE', got {period.get('format')}"
        assert "fiveE" in period, "Missing fiveE in period"
        
        fiveE = period.get("fiveE", {})
        assert "stages" in fiveE, "Missing fiveE.stages in daily plan"
        stages = fiveE.get("stages", [])
        assert len(stages) == 5, f"Expected 5 stages in daily plan, got {len(stages)}"
        
        print(f"✅ Daily plan propagation verified:")
        print(f"   - period.format: {period.get('format')}")
        print(f"   - period.fiveE.stages: {len(stages)} stages")
        return True
    except Exception as e:
        print(f"❌ Daily plan propagation test failed: {e}")
        return False

def test_cleanup():
    """Test 12: Cleanup - Delete test lessons"""
    print("\n📝 Test 12: Cleanup - Delete test lessons")
    
    if not test_lesson_ids:
        print("⚠️ No lesson IDs to cleanup")
        return True
    
    deleted_count = 0
    for lesson_id in test_lesson_ids:
        try:
            resp = requests.delete(
                f"{BASE_URL}/admin/lessons/{lesson_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            if resp.status_code == 200:
                deleted_count += 1
        except Exception as e:
            print(f"⚠️ Failed to delete lesson {lesson_id}: {e}")
    
    print(f"✅ Cleanup: Deleted {deleted_count}/{len(test_lesson_ids)} test lessons")
    return True

def main():
    print("=" * 80)
    print("🧪 BACKEND TEST: Class 9 & 10 5E HTML Lesson Plan Import")
    print("=" * 80)
    
    tests = [
        ("Admin Login", login_admin),
        ("5E Import - Valid Class 9", test_5e_import_valid),
        ("5E Import - Skip Mode", test_5e_import_skip_mode),
        ("5E Import - Replace Mode", test_5e_import_replace_mode),
        ("5E Import - Class 7 Rejection", test_5e_import_class7_rejection),
        ("5E Import - Empty Periods", test_5e_import_empty_periods),
        ("5E Import - No Auth", test_5e_import_no_auth),
        ("5E Import - Non-Admin", test_5e_import_non_admin),
        ("Lesson Verification", test_lesson_verification),
        ("Lesson Detail Structure", test_lesson_detail_structure),
        ("Daily Plan Propagation", test_daily_plan_propagation),
        ("Cleanup", test_cleanup),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ Test '{name}' crashed: {e}")
            failed += 1
    
    print("\n" + "=" * 80)
    print(f"📊 TEST SUMMARY: {passed}/{len(tests)} PASSED, {failed}/{len(tests)} FAILED")
    print("=" * 80)
    
    if failed == 0:
        print("✅ ALL TESTS PASSED")
        return 0
    else:
        print(f"❌ {failed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
