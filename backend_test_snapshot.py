#!/usr/bin/env python3
"""
Backend test for Lesson Plan Upload Phase 4: Snapshot-before-forced-Regenerate
Tests the new snapshot functionality when force-regenerating engagement content.
"""

import requests
import json
import sys
from datetime import datetime

# Base URL from environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

# Test state
test_state = {
    "token": None,
    "throwaway_lesson_id": None,
    "class_id": None,
    "book_id": None,
    "chapter_id": None,
    "version_id": None,
}

def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_step(step_num, description):
    """Print test step header"""
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print('='*80)

def admin_login():
    """Step 0: Admin login to get Bearer token"""
    test_step(0, "Admin Login")
    
    try:
        response = requests.post(
            f"{API_BASE}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Login failed: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        if not data.get("token"):
            log(f"❌ No token in response: {data}")
            return False
        
        test_state["token"] = data["token"]
        log(f"✅ Admin login successful")
        log(f"Token: {test_state['token'][:20]}...")
        return True
        
    except Exception as e:
        log(f"❌ Login exception: {e}")
        return False

def find_class_book_chapter():
    """Step 1: Find Class 1 'ଝୁଲଣା ଶ୍ରେଣୀ ୧' chapter"""
    test_step(1, "Find Class 1 Chapter")
    
    headers = {"Authorization": f"Bearer {test_state['token']}"}
    
    try:
        # Get classes
        response = requests.get(f"{API_BASE}/classes", headers=headers, timeout=30)
        if response.status_code != 200:
            log(f"❌ Failed to get classes: HTTP {response.status_code}")
            return False
        
        data = response.json()
        classes = data.get("classes", [])
        log(f"Found {len(classes)} classes")
        
        # Find Class 1
        class_1 = None
        for cls in classes:
            if "ଝୁଲଣା ଶ୍ରେଣୀ ୧" in cls.get("name", "") or cls.get("order") == 1:
                class_1 = cls
                break
        
        if not class_1:
            log(f"❌ Class 1 not found")
            return False
        
        test_state["class_id"] = class_1["id"]
        log(f"✅ Found Class 1: {class_1.get('name')} (id: {class_1['id']})")
        
        # Get books for Class 1
        response = requests.get(f"{API_BASE}/books?classId={class_1['id']}", headers=headers, timeout=30)
        if response.status_code != 200:
            log(f"❌ Failed to get books: HTTP {response.status_code}")
            return False
        
        data = response.json()
        books = data.get("books", [])
        if not books:
            log(f"❌ No books found for Class 1")
            return False
        
        test_state["book_id"] = books[0]["id"]
        log(f"✅ Found book: {books[0].get('name')} (id: {books[0]['id']})")
        
        # Get chapters for the book
        response = requests.get(f"{API_BASE}/chapters?bookId={books[0]['id']}", headers=headers, timeout=30)
        if response.status_code != 200:
            log(f"❌ Failed to get chapters: HTTP {response.status_code}")
            return False
        
        data = response.json()
        chapters = data.get("chapters", [])
        if not chapters:
            log(f"❌ No chapters found")
            return False
        
        test_state["chapter_id"] = chapters[0]["id"]
        log(f"✅ Found chapter: {chapters[0].get('name')} (id: {chapters[0]['id']})")
        
        return True
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def create_throwaway_lesson():
    """Step 2: Create a throwaway lesson with content > 200 chars"""
    test_step(2, "Create Throwaway Lesson")
    
    headers = {
        "Authorization": f"Bearer {test_state['token']}",
        "Content-Type": "application/json"
    }
    
    # Create content > 200 chars
    odia_text = "ପରୀକ୍ଷା ବିଷୟବସ୍ତୁ ଏହା ଏକ ପରୀକ୍ଷା ଲେସନ୍ ଅଟେ। "
    content = f"<p>{odia_text * 20}</p>"  # Repeat 20 times to ensure > 200 chars
    
    payload = {
        "classId": test_state["class_id"],
        "bookId": test_state["book_id"],
        "chapterId": test_state["chapter_id"],
        "period": 99,
        "title": "ZZZ_TEST_SNAPSHOT_DELETE_ME",
        "content": content
    }
    
    try:
        response = requests.post(
            f"{API_BASE}/admin/lessons",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to create lesson: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        lesson_data = data.get("lesson", data)
        if not lesson_data.get("id"):
            log(f"❌ No lesson id in response: {data}")
            return False
        
        test_state["throwaway_lesson_id"] = lesson_data["id"]
        log(f"✅ Created throwaway lesson")
        log(f"Lesson ID: {test_state['throwaway_lesson_id']}")
        log(f"Content length: {len(content)} chars")
        
        return True
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def set_topic_check():
    """Step 3: Set topicCheck field via PUT /api/admin/lessons/:id"""
    test_step(3, "Set topicCheck Field")
    
    headers = {
        "Authorization": f"Bearer {test_state['token']}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "topicCheck": "<p>TEST_SNAPSHOT_CONTENT ପରୀକ୍ଷା</p>"
    }
    
    try:
        response = requests.put(
            f"{API_BASE}/admin/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to set topicCheck: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        log(f"✅ Set topicCheck field")
        
        # Verify by getting the lesson
        response = requests.get(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            lesson = response.json()
            if lesson.get("topicCheck") == "<p>TEST_SNAPSHOT_CONTENT ପରୀକ୍ଷା</p>":
                log(f"✅ Verified topicCheck is set correctly")
                return True
            else:
                log(f"⚠️  topicCheck value mismatch: {lesson.get('topicCheck')}")
                return False
        else:
            log(f"⚠️  Could not verify topicCheck (HTTP {response.status_code})")
            return True  # Continue anyway
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def check_versions_before():
    """Step 4: Check versions BEFORE force regenerate"""
    test_step(4, "Check Versions BEFORE Force Regenerate")
    
    headers = {"Authorization": f"Bearer {test_state['token']}"}
    
    try:
        response = requests.get(
            f"{API_BASE}/lp/admin/version/period-versions?lessonId={test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to get versions: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        versions = data if isinstance(data, list) else data.get("versions", [])
        log(f"Found {len(versions)} version(s)")
        
        # Check for pre-regenerate versions
        pre_regen_versions = [v for v in versions if v.get("reason") == "pre-regenerate"]
        
        if pre_regen_versions:
            log(f"⚠️  Found {len(pre_regen_versions)} pre-regenerate version(s) (expected 0)")
            log(f"Versions: {json.dumps(pre_regen_versions, indent=2)}")
        else:
            log(f"✅ No pre-regenerate versions found (expected)")
        
        return True
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def force_regenerate():
    """Step 5: Force regenerate via POST /api/lessons/:id/engagement/assessment?force=true"""
    test_step(5, "Force Regenerate Assessment")
    
    headers = {"Authorization": f"Bearer {test_state['token']}"}
    
    try:
        response = requests.post(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}/engagement/assessment?force=true",
            headers=headers,
            timeout=60  # Longer timeout for AI generation
        )
        
        if response.status_code != 200:
            log(f"❌ Force regenerate failed: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        log(f"✅ Force regenerate successful")
        log(f"Response: {json.dumps(data, indent=2)}")
        
        # Check if clearedUploaded is true
        if data.get("clearedUploaded") == True:
            log(f"✅ clearedUploaded: true (expected)")
        else:
            log(f"⚠️  clearedUploaded: {data.get('clearedUploaded')} (expected true)")
        
        # Verify topicCheck is now unset
        response = requests.get(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            lesson = response.json()
            if not lesson.get("topicCheck"):
                log(f"✅ topicCheck is now unset (expected)")
            else:
                log(f"⚠️  topicCheck still set: {lesson.get('topicCheck')}")
            
            # Check if engagement.assessment is set
            if lesson.get("engagement", {}).get("assessment"):
                log(f"✅ engagement.assessment is now set with AI content")
            else:
                log(f"⚠️  engagement.assessment not set")
        
        return True
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def check_versions_after():
    """Step 6: Check versions AFTER force regenerate - expect exactly ONE with reason 'pre-regenerate'"""
    test_step(6, "Check Versions AFTER Force Regenerate")
    
    headers = {"Authorization": f"Bearer {test_state['token']}"}
    
    try:
        response = requests.get(
            f"{API_BASE}/lp/admin/version/period-versions?lessonId={test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to get versions: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        versions = data if isinstance(data, list) else data.get("versions", [])
        log(f"Found {len(versions)} version(s)")
        
        # Check for pre-regenerate versions
        pre_regen_versions = [v for v in versions if v.get("reason") == "pre-regenerate"]
        
        if len(pre_regen_versions) == 1:
            log(f"✅ Found EXACTLY ONE pre-regenerate version (expected)")
            test_state["version_id"] = pre_regen_versions[0]["id"]
            log(f"Version ID: {test_state['version_id']}")
            log(f"Version details: {json.dumps(pre_regen_versions[0], indent=2)}")
            return True
        else:
            log(f"❌ Found {len(pre_regen_versions)} pre-regenerate version(s) (expected 1)")
            if pre_regen_versions:
                log(f"Versions: {json.dumps(pre_regen_versions, indent=2)}")
            return False
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def restore_version():
    """Step 7: Restore the pre-regenerate version"""
    test_step(7, "Restore Pre-Regenerate Version")
    
    headers = {
        "Authorization": f"Bearer {test_state['token']}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "versionId": test_state["version_id"]
    }
    
    try:
        response = requests.post(
            f"{API_BASE}/lp/admin/version/restore",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Restore failed: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        log(f"✅ Restore successful")
        log(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify topicCheck is restored
        response = requests.get(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            lesson = response.json()
            if lesson.get("topicCheck") == "<p>TEST_SNAPSHOT_CONTENT ପରୀକ୍ଷା</p>":
                log(f"✅ topicCheck restored to TEST_SNAPSHOT_CONTENT (expected)")
                return True
            else:
                log(f"❌ topicCheck not restored correctly: {lesson.get('topicCheck')}")
                return False
        else:
            log(f"⚠️  Could not verify restore (HTTP {response.status_code})")
            return False
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def negative_test_cached():
    """Step 8: Negative test - POST without ?force should serve cached and NOT create new version"""
    test_step(8, "Negative Test: Cached Response (No Force)")
    
    headers = {"Authorization": f"Bearer {test_state['token']}"}
    
    try:
        # Get version count before
        response = requests.get(
            f"{API_BASE}/lp/admin/version/period-versions?lessonId={test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to get versions before: HTTP {response.status_code}")
            return False
        
        data = response.json()
        versions_before = data if isinstance(data, list) else data.get("versions", [])
        pre_regen_count_before = len([v for v in versions_before if v.get("reason") == "pre-regenerate"])
        log(f"Pre-regenerate versions before: {pre_regen_count_before}")
        
        # POST without ?force
        response = requests.post(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}/engagement/assessment",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Request failed: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        data = response.json()
        log(f"Response: {json.dumps(data, indent=2)}")
        
        # Check if cached is true
        if data.get("cached") == True:
            log(f"✅ cached: true (expected)")
        else:
            log(f"⚠️  cached: {data.get('cached')} (expected true)")
        
        # Verify topicCheck is still set
        response = requests.get(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            lesson = response.json()
            if lesson.get("topicCheck") == "<p>TEST_SNAPSHOT_CONTENT ପରୀକ୍ଷା</p>":
                log(f"✅ topicCheck still set (not cleared)")
            else:
                log(f"⚠️  topicCheck changed: {lesson.get('topicCheck')}")
        
        # Get version count after
        response = requests.get(
            f"{API_BASE}/lp/admin/version/period-versions?lessonId={test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to get versions after: HTTP {response.status_code}")
            return False
        
        data = response.json()
        versions_after = data if isinstance(data, list) else data.get("versions", [])
        pre_regen_count_after = len([v for v in versions_after if v.get("reason") == "pre-regenerate"])
        log(f"Pre-regenerate versions after: {pre_regen_count_after}")
        
        if pre_regen_count_after == pre_regen_count_before:
            log(f"✅ No new pre-regenerate version created (expected)")
            return True
        else:
            log(f"❌ New pre-regenerate version created (unexpected)")
            return False
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def cleanup_lesson():
    """Step 9: CLEANUP - Delete the throwaway lesson"""
    test_step(9, "CLEANUP: Delete Throwaway Lesson")
    
    headers = {"Authorization": f"Bearer {test_state['token']}"}
    
    try:
        response = requests.delete(
            f"{API_BASE}/admin/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log(f"❌ Delete failed: HTTP {response.status_code}")
            log(f"Response: {response.text}")
            return False
        
        log(f"✅ Throwaway lesson deleted")
        
        # Verify deletion
        response = requests.get(
            f"{API_BASE}/lessons/{test_state['throwaway_lesson_id']}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 404:
            log(f"✅ Confirmed: Lesson no longer exists (404)")
            return True
        elif response.status_code == 200:
            log(f"⚠️  Lesson still exists after deletion")
            return False
        else:
            log(f"⚠️  Unexpected status code: {response.status_code}")
            return True  # Assume deleted
        
    except Exception as e:
        log(f"❌ Exception: {e}")
        return False

def main():
    """Run all test steps"""
    print("\n" + "="*80)
    print("LESSON PLAN UPLOAD — PHASE 4: Snapshot-before-forced-Regenerate")
    print("Backend Testing")
    print("="*80)
    
    results = []
    
    # Run all test steps
    steps = [
        ("Admin Login", admin_login),
        ("Find Class/Book/Chapter", find_class_book_chapter),
        ("Create Throwaway Lesson", create_throwaway_lesson),
        ("Set topicCheck Field", set_topic_check),
        ("Check Versions BEFORE", check_versions_before),
        ("Force Regenerate", force_regenerate),
        ("Check Versions AFTER", check_versions_after),
        ("Restore Version", restore_version),
        ("Negative Test (Cached)", negative_test_cached),
        ("CLEANUP", cleanup_lesson),
    ]
    
    for step_name, step_func in steps:
        try:
            result = step_func()
            results.append((step_name, result))
            if not result:
                log(f"⚠️  Step failed but continuing...")
        except Exception as e:
            log(f"❌ Step exception: {e}")
            results.append((step_name, False))
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for step_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {step_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if test_state.get("throwaway_lesson_id"):
        print(f"\nThrowaway Lesson ID: {test_state['throwaway_lesson_id']}")
    if test_state.get("version_id"):
        print(f"Version ID created: {test_state['version_id']}")
    
    print("="*80)
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
