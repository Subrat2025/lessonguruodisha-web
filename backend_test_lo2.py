#!/usr/bin/env python3
"""
Chapterwise LO v2 Backend Test Suite
Tests the NEW "Chapterwise LO v2" endpoints as per review request.
Admin: 9692604577 / Subrat@909e
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def login_admin():
    """Login as admin and return token"""
    log("Logging in as admin...")
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    if r.status_code != 200:
        log(f"❌ Admin login failed: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    data = r.json()
    token = data.get("token")
    if not token:
        log(f"❌ No token in login response: {data}")
        sys.exit(1)
    log(f"✅ Admin logged in successfully")
    return token

def test_auth_status(token):
    """Test 1: AUTH - GET /api/admin/lo2/status with/without token"""
    log("\n=== TEST 1: AUTH - /api/admin/lo2/status ===")
    
    # Without token
    log("1a) Testing WITHOUT token (expect 401/403)...")
    r = requests.get(f"{BASE_URL}/api/admin/lo2/status")
    if r.status_code in [401, 403]:
        log(f"✅ PASS: Unauthenticated request blocked with {r.status_code}")
    else:
        log(f"❌ FAIL: Expected 401/403, got {r.status_code}")
        return False
    
    # With admin token
    log("1b) Testing WITH admin token (expect 200)...")
    r = requests.get(f"{BASE_URL}/api/admin/lo2/status", headers={
        "Authorization": f"Bearer {token}"
    })
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    if not data.get("ok"):
        log(f"❌ FAIL: Response not ok: {data}")
        return False
    
    classes = data.get("classes", [])
    if len(classes) != 7:
        log(f"❌ FAIL: Expected 7 classes, got {len(classes)}")
        return False
    
    log(f"✅ PASS: Got {len(classes)} classes")
    
    # Verify each class has lessons/periods/published/subjects
    for cls in classes:
        if not all(k in cls for k in ["class", "lessons", "periods", "published", "subjects"]):
            log(f"❌ FAIL: Class {cls.get('class')} missing required fields")
            return False
        log(f"  Class {cls['class']}: {cls['lessons']} lessons, {cls['periods']} periods, published={cls['published']}, {len(cls['subjects'])} subjects")
    
    # Verify Class 1 & 6 are published, others unpublished
    pub_classes = [c["class"] for c in classes if c["published"]]
    unpub_classes = [c["class"] for c in classes if not c["published"]]
    
    if set(pub_classes) != {"1", "6"}:
        log(f"❌ FAIL: Expected published classes [1, 6], got {pub_classes}")
        return False
    
    if set(unpub_classes) != {"2", "3", "4", "5", "7"}:
        log(f"❌ FAIL: Expected unpublished classes [2,3,4,5,7], got {unpub_classes}")
        return False
    
    log(f"✅ PASS: Published classes: {pub_classes}, Unpublished: {unpub_classes}")
    return True

def test_teacher_publish_gating():
    """Test 2: TEACHER PUBLISH GATING (no auth needed for /lo2/*)"""
    log("\n=== TEST 2: TEACHER PUBLISH GATING ===")
    
    # 2a) GET /api/lo2/classes => only published (1, 6)
    log("2a) Testing /api/lo2/classes (expect only published classes 1 & 6)...")
    r = requests.get(f"{BASE_URL}/api/lo2/classes")
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    classes = data.get("classes", [])
    class_nums = [c["class"] for c in classes]
    
    if "1" not in class_nums or "6" not in class_nums:
        log(f"❌ FAIL: Expected classes 1 and 6, got {class_nums}")
        return False
    
    # Should NOT contain unpublished classes
    unpublished = ["2", "3", "4", "5", "7"]
    for u in unpublished:
        if u in class_nums:
            log(f"❌ FAIL: Unpublished class {u} found in results")
            return False
    
    log(f"✅ PASS: /api/lo2/classes returns only published classes: {class_nums}")
    
    # 2b) GET /api/lo2/chapters?class=6&subject=science => non-empty (published)
    log("2b) Testing /api/lo2/chapters?class=6&subject=science (expect non-empty)...")
    r = requests.get(f"{BASE_URL}/api/lo2/chapters", params={"class": "6", "subject": "science"})
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    chapters = data.get("chapters", [])
    if len(chapters) == 0:
        log(f"❌ FAIL: Expected non-empty chapters for Class 6 Science, got empty")
        return False
    
    log(f"✅ PASS: Class 6 Science has {len(chapters)} chapters")
    
    # 2c) GET /api/lo2/chapters?class=2&subject=math => empty (unpublished)
    log("2c) Testing /api/lo2/chapters?class=2&subject=math (expect empty, class 2 unpublished)...")
    r = requests.get(f"{BASE_URL}/api/lo2/chapters", params={"class": "2", "subject": "math"})
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    chapters = data.get("chapters", [])
    if len(chapters) != 0:
        log(f"❌ FAIL: Expected empty chapters for unpublished Class 2, got {len(chapters)}")
        return False
    
    log(f"✅ PASS: Class 2 Math returns empty (unpublished)")
    
    # 2d) GET /api/lo2/chapter?id=<id> for published class => 200 with periods
    log("2d) Testing /api/lo2/chapter?id=<id> for published class 6...")
    # First get a chapter id from class 6
    r = requests.get(f"{BASE_URL}/api/lo2/chapters", params={"class": "6"})
    if r.status_code != 200:
        log(f"❌ FAIL: Could not get class 6 chapters: {r.status_code}")
        return False
    
    chapters = r.json().get("chapters", [])
    if len(chapters) == 0:
        log(f"❌ FAIL: No chapters found for class 6")
        return False
    
    chapter_id = chapters[0].get("id")
    if not chapter_id:
        log(f"❌ FAIL: No id in chapter: {chapters[0]}")
        return False
    
    log(f"  Using chapter id: {chapter_id}")
    r = requests.get(f"{BASE_URL}/api/lo2/chapter", params={"id": chapter_id})
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    chapter = data.get("chapter")
    if not chapter:
        log(f"❌ FAIL: No chapter in response: {data}")
        return False
    
    periods = chapter.get("periods", [])
    if len(periods) == 0:
        log(f"❌ FAIL: Expected periods in chapter, got empty")
        return False
    
    # Verify period structure
    period = periods[0]
    required_fields = ["no", "topic", "cg", "competency", "los", "oldLoCode"]
    for field in required_fields:
        if field not in period:
            log(f"❌ FAIL: Period missing field '{field}': {period}")
            return False
    
    log(f"✅ PASS: Chapter has {len(periods)} periods with correct structure")
    log(f"  Period 1: topic='{period['topic'][:30]}...', cg={period['cg']['code']}, competency={period['competency']['code']}, los={len(period['los'])}, oldLoCode={period['oldLoCode']}")
    
    # 2e) GET /api/lo2/chapter with bogus id => 404
    log("2e) Testing /api/lo2/chapter?id=bogus (expect 404)...")
    r = requests.get(f"{BASE_URL}/api/lo2/chapter", params={"id": "bogus-id-12345"})
    if r.status_code != 404:
        log(f"❌ FAIL: Expected 404, got {r.status_code}")
        return False
    
    log(f"✅ PASS: Bogus id returns 404")
    
    return True

def test_search():
    """Test 3: SEARCH - only published classes"""
    log("\n=== TEST 3: SEARCH ===")
    
    # 3a) Search with valid query (len >= 2)
    log("3a) Testing /api/lo2/search?q=CG-8 (expect results only from published classes 1,6)...")
    r = requests.get(f"{BASE_URL}/api/lo2/search", params={"q": "CG-8"})
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    results = data.get("results", [])
    
    if len(results) == 0:
        log(f"⚠️  WARNING: No results for 'CG-8' (might be valid if no such code exists)")
    else:
        log(f"  Found {len(results)} results")
        # Verify all results are from published classes (1 or 6)
        for result in results:
            cls = result.get("class")
            if cls not in ["1", "6"]:
                log(f"❌ FAIL: Result from unpublished class {cls}: {result}")
                return False
        
        log(f"✅ PASS: All {len(results)} results are from published classes (1 or 6)")
    
    # 3b) Search with short query (len < 2) => empty
    log("3b) Testing /api/lo2/search?q=a (len<2, expect empty)...")
    r = requests.get(f"{BASE_URL}/api/lo2/search", params={"q": "a"})
    if r.status_code != 200:
        log(f"❌ FAIL: Expected 200, got {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    results = data.get("results", [])
    if len(results) != 0:
        log(f"❌ FAIL: Expected empty results for short query, got {len(results)}")
        return False
    
    log(f"✅ PASS: Short query returns empty")
    
    return True

def test_import_upsert(token):
    """Test 4: IMPORT UPSERT / RE-UPLOAD SAFE"""
    log("\n=== TEST 4: IMPORT UPSERT / RE-UPLOAD SAFE ===")
    
    # Get baseline count for class 9
    log("4a) Getting baseline status for class 9...")
    r = requests.get(f"{BASE_URL}/api/admin/lo2/status", headers={
        "Authorization": f"Bearer {token}"
    })
    if r.status_code != 200:
        log(f"❌ FAIL: Could not get status: {r.status_code}")
        return False
    
    classes = r.json().get("classes", [])
    class9_before = next((c for c in classes if c["class"] == "9"), None)
    if class9_before:
        log(f"  Class 9 BEFORE: {class9_before['lessons']} lessons, {class9_before['periods']} periods")
    else:
        log(f"  Class 9 does not exist yet")
    
    # Create minimal valid HTML for class 9
    minimal_html = """
<div class="pcm-root">
<h1>ଗଣିତ · ନବମ ଶ୍ରେଣୀ ଗଣିତ<small>x</small></h1>
<table>
<tr class="ls">
<td colspan="6">
<span class="lname">ପାଠ ୧ — ଟେଷ୍ଟ</span>
<span class="lm">ୟୁନିଟ</span>
</td>
</tr>
<tr>
<td class="pn">୧</td>
<td class="tp">ଟପିକ</td>
<td>
<details class="ch cg">
<summary>CG-1</summary>
<span class="ch-exp">cg text</span>
</details>
</td>
<td>
<details class="ch c">
<summary>C-1.1</summary>
<span class="ch-exp">comp</span>
</details>
</td>
<td>
<details class="ch lo">
<summary>LO 1.1.1</summary>
<span class="ch-exp">lo text</span>
</details>
</td>
<td class="oldc">
<span class="ch old">M 901</span>
</td>
</tr>
</table>
</div>
"""
    
    # First import
    log("4b) First import of class 9 (expect created=1, lessons=1, periods=1)...")
    r = requests.post(f"{BASE_URL}/api/admin/lo2/import", 
        headers={"Authorization": f"Bearer {token}"},
        json={
            "classNo": "9",
            "fileName": "test-class9.html",
            "html": minimal_html
        })
    
    if r.status_code != 200:
        log(f"❌ FAIL: Import failed: {r.status_code}: {r.text[:500]}")
        return False
    
    data = r.json()
    if not data.get("ok"):
        log(f"❌ FAIL: Import not ok: {data}")
        return False
    
    created1 = data.get("created", 0)
    lessons1 = data.get("lessons", 0)
    periods1 = data.get("periods", 0)
    
    if created1 < 1:
        log(f"❌ FAIL: Expected created >= 1, got {created1}")
        return False
    
    if lessons1 != 1:
        log(f"❌ FAIL: Expected lessons=1, got {lessons1}")
        return False
    
    if periods1 != 1:
        log(f"❌ FAIL: Expected periods=1, got {periods1}")
        return False
    
    log(f"✅ PASS: First import - created={created1}, lessons={lessons1}, periods={periods1}")
    
    # Second import (same HTML) - should be UPSERT (updated, not created)
    log("4c) Second import of SAME HTML (expect created=0, updated>=1, no duplicates)...")
    r = requests.post(f"{BASE_URL}/api/admin/lo2/import", 
        headers={"Authorization": f"Bearer {token}"},
        json={
            "classNo": "9",
            "fileName": "test-class9-reimport.html",
            "html": minimal_html
        })
    
    if r.status_code != 200:
        log(f"❌ FAIL: Re-import failed: {r.status_code}: {r.text[:500]}")
        return False
    
    data = r.json()
    created2 = data.get("created", 0)
    updated2 = data.get("updated", 0)
    lessons2 = data.get("lessons", 0)
    
    if created2 != 0:
        log(f"❌ FAIL: Expected created=0 on re-import, got {created2}")
        return False
    
    if updated2 < 1:
        log(f"❌ FAIL: Expected updated >= 1 on re-import, got {updated2}")
        return False
    
    log(f"✅ PASS: Re-import - created={created2}, updated={updated2}, lessons={lessons2}")
    
    # Verify via status that class 9 has lessons=1 (not 2)
    log("4d) Verifying class 9 status (expect lessons=1, not 2)...")
    r = requests.get(f"{BASE_URL}/api/admin/lo2/status", headers={
        "Authorization": f"Bearer {token}"
    })
    if r.status_code != 200:
        log(f"❌ FAIL: Could not get status: {r.status_code}")
        return False
    
    classes = r.json().get("classes", [])
    class9_after = next((c for c in classes if c["class"] == "9"), None)
    
    if not class9_after:
        log(f"❌ FAIL: Class 9 not found in status after import")
        return False
    
    if class9_after["lessons"] != 1:
        log(f"❌ FAIL: Expected class 9 lessons=1, got {class9_after['lessons']} (duplicate created!)")
        return False
    
    log(f"✅ PASS: Class 9 has lessons={class9_after['lessons']} (UPSERT working, no duplicates)")
    log(f"  Class 9 AFTER: {class9_after['lessons']} lessons, {class9_after['periods']} periods, published={class9_after['published']}")
    
    return True

def test_publish(token):
    """Test 5: PUBLISH toggle"""
    log("\n=== TEST 5: PUBLISH TOGGLE ===")
    
    # 5a) Publish class 9
    log("5a) Publishing class 9 (expect published=true)...")
    r = requests.post(f"{BASE_URL}/api/admin/lo2/publish",
        headers={"Authorization": f"Bearer {token}"},
        json={"classNo": "9", "published": True})
    
    if r.status_code != 200:
        log(f"❌ FAIL: Publish failed: {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    if not data.get("ok") or data.get("published") != True:
        log(f"❌ FAIL: Publish response not ok: {data}")
        return False
    
    log(f"✅ PASS: Class 9 published")
    
    # 5b) Verify /api/lo2/classes now includes "9"
    log("5b) Verifying /api/lo2/classes includes '9'...")
    r = requests.get(f"{BASE_URL}/api/lo2/classes")
    if r.status_code != 200:
        log(f"❌ FAIL: Could not get classes: {r.status_code}")
        return False
    
    classes = r.json().get("classes", [])
    class_nums = [c["class"] for c in classes]
    
    if "9" not in class_nums:
        log(f"❌ FAIL: Class 9 not in published classes: {class_nums}")
        return False
    
    log(f"✅ PASS: Class 9 now visible in /api/lo2/classes: {class_nums}")
    
    # 5c) Unpublish class 9
    log("5c) Unpublishing class 9 (expect published=false)...")
    r = requests.post(f"{BASE_URL}/api/admin/lo2/publish",
        headers={"Authorization": f"Bearer {token}"},
        json={"classNo": "9", "published": False})
    
    if r.status_code != 200:
        log(f"❌ FAIL: Unpublish failed: {r.status_code}: {r.text[:200]}")
        return False
    
    data = r.json()
    if not data.get("ok") or data.get("published") != False:
        log(f"❌ FAIL: Unpublish response not ok: {data}")
        return False
    
    log(f"✅ PASS: Class 9 unpublished")
    
    # 5d) Verify /api/lo2/classes no longer includes "9"
    log("5d) Verifying /api/lo2/classes no longer includes '9'...")
    r = requests.get(f"{BASE_URL}/api/lo2/classes")
    if r.status_code != 200:
        log(f"❌ FAIL: Could not get classes: {r.status_code}")
        return False
    
    classes = r.json().get("classes", [])
    class_nums = [c["class"] for c in classes]
    
    if "9" in class_nums:
        log(f"❌ FAIL: Class 9 still in published classes after unpublish: {class_nums}")
        return False
    
    log(f"✅ PASS: Class 9 no longer visible in /api/lo2/classes: {class_nums}")
    
    return True

def main():
    log("=" * 80)
    log("CHAPTERWISE LO v2 BACKEND TEST SUITE")
    log("=" * 80)
    log(f"Base URL: {BASE_URL}")
    log(f"Admin: {ADMIN_MOBILE}")
    log("")
    
    try:
        # Login
        token = login_admin()
        
        # Run tests
        results = []
        
        results.append(("TEST 1: AUTH", test_auth_status(token)))
        results.append(("TEST 2: TEACHER PUBLISH GATING", test_teacher_publish_gating()))
        results.append(("TEST 3: SEARCH", test_search()))
        results.append(("TEST 4: IMPORT UPSERT", test_import_upsert(token)))
        results.append(("TEST 5: PUBLISH TOGGLE", test_publish(token)))
        
        # Summary
        log("\n" + "=" * 80)
        log("TEST SUMMARY")
        log("=" * 80)
        
        passed = sum(1 for _, result in results if result)
        total = len(results)
        
        for name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            log(f"{status}: {name}")
        
        log("")
        log(f"TOTAL: {passed}/{total} tests passed ({100*passed//total}%)")
        
        if passed == total:
            log("\n🎉 ALL TESTS PASSED!")
            log("\nFINAL STATE:")
            log("- Class 1 & 6: PUBLISHED (unchanged)")
            log("- Class 9: UNPUBLISHED (test data, invisible to teachers)")
            log("- loLessons: intact (no data wiped)")
            return 0
        else:
            log(f"\n❌ {total - passed} test(s) FAILED")
            return 1
            
    except Exception as e:
        log(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
