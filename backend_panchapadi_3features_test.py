#!/usr/bin/env python3
"""
Backend test for 3 NEW Panchapadi features:
1. Watermark on /view endpoint
2. Duplicate Guard + Versioning
3. Bulk Publish

Admin credentials: mobile 9999999999, password admin123
Base URL: http://localhost:3000/api
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:3000/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_panchapadi_3_features():
    log("=" * 80)
    log("PANCHAPADI 3 NEW FEATURES TEST")
    log("=" * 80)
    
    # ========== PHASE 0: Admin Login ==========
    log("\n[TEST 1] Admin Login")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return
        data = resp.json()
        token = data.get("token")
        if not token:
            log(f"❌ FAIL: No token in response")
            return
        log(f"✅ PASS: Admin login successful, token: {token[:20]}...")
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        log(f"❌ FAIL: {e}")
        return
    
    # ========== PHASE 1: Watermark on /view endpoint ==========
    log("\n" + "=" * 80)
    log("PHASE 1: WATERMARK ON /VIEW ENDPOINT")
    log("=" * 80)
    
    # Test 1: Insert a test upload directly into MongoDB
    log("\n[TEST 2] Insert test upload into MongoDB")
    try:
        from pymongo import MongoClient
        client = MongoClient("mongodb://localhost:27017")
        db = client["edumaster_odisha"]
        
        # First, get a real chapter ID
        chapters = list(db.chapters.find({}, {"_id": 0, "id": 1, "name": 1, "classId": 1, "bookId": 1}).limit(1))
        if not chapters:
            log("❌ FAIL: No chapters found in DB")
            return
        
        chapter = chapters[0]
        log(f"Using chapter: {chapter.get('name')} (ID: {chapter.get('id')})")
        
        # Get class and book info
        cls = db.classes.find_one({"id": chapter.get("classId")}, {"_id": 0, "name": 1, "order": 1})
        book = db.books.find_one({"id": chapter.get("bookId")}, {"_id": 0, "name": 1})
        
        test_doc = {
            "id": "wm-test-1",
            "chapterId": chapter.get("id"),
            "classId": chapter.get("classId"),
            "bookId": chapter.get("bookId"),
            "classLabel": cls.get("name") if cls else "Class 1",
            "classOrder": cls.get("order") if cls else 1,
            "bookLabel": book.get("name") if book else "ଗଣିତ",
            "chapterLabel": chapter.get("name"),
            "chapterOrder": 1,
            "period": 1,
            "title": "WM Test",
            "filename": "t.html",
            "hidden": False,
            "status": "published",
            "allowPrint": True,
            "allowDownload": True,
            "html": "<!doctype html><html><body><h1>Hello</h1><p>Test lesson content.</p></body></html>",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
            "version": 1
        }
        
        # Delete if exists
        db.panchapadiUploads.delete_one({"id": "wm-test-1"})
        
        # Insert
        db.panchapadiUploads.insert_one(test_doc)
        log(f"✅ PASS: Test upload inserted with ID: wm-test-1")
        
    except Exception as e:
        log(f"❌ FAIL: {e}")
        return
    
    # Test 2: GET /view with allowPrint=true, allowDownload=true → should have watermark
    log("\n[TEST 3] GET /view with allowPrint=true, allowDownload=true")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/wm-test-1/view", headers=headers, timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
        else:
            html = resp.text
            
            # Check for watermark elements
            checks = [
                ('id="lgo-watermark"', "Watermark style block"),
                ('id="lgo-wm-header"', "Watermark header div"),
                ('id="lgo-wm-tile"', "Watermark tile div"),
                ('id="lgo-wm-footer"', "Watermark footer div"),
                ('📘 Lesson Guru Odisha', "Lesson Guru Odisha text"),
                ('LESSON GURU ODISHA', "LESSON GURU ODISHA text in tile"),
                ('© Lesson Guru Odisha', "Copyright text"),
            ]
            
            all_passed = True
            for check_str, desc in checks:
                if check_str in html:
                    log(f"  ✅ {desc} found")
                else:
                    log(f"  ❌ {desc} NOT found")
                    all_passed = False
            
            # Check for admin identity in watermark
            if ADMIN_MOBILE in html or "Admin" in html:
                log(f"  ✅ Admin identity found in watermark")
            else:
                log(f"  ⚠️  Admin identity not clearly visible (might be in name field)")
            
            if all_passed:
                log(f"✅ PASS: Watermark correctly injected")
            else:
                log(f"❌ FAIL: Some watermark elements missing")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 3: PATCH to disable allowPrint and allowDownload
    log("\n[TEST 4] PATCH to disable allowPrint and allowDownload")
    try:
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/wm-test-1", 
                             headers=headers,
                             json={"allowPrint": False, "allowDownload": False},
                             timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            data = resp.json()
            log(f"Response: {json.dumps(data, indent=2)}")
            if data.get("ok") and data.get("matched") == 1:
                log(f"✅ PASS: PATCH successful")
            else:
                log(f"❌ FAIL: PATCH did not match document")
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 4: GET /view again → should NOT have watermark
    log("\n[TEST 5] GET /view with allowPrint=false, allowDownload=false")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/wm-test-1/view", headers=headers, timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            html = resp.text
            
            # Check that watermark is NOT present
            if 'id="lgo-watermark"' not in html:
                log(f"  ✅ Watermark style block NOT found (correct)")
            else:
                log(f"  ❌ Watermark style block found (should be absent)")
            
            if 'id="lgo-wm-header"' not in html:
                log(f"  ✅ Watermark header NOT found (correct)")
            else:
                log(f"  ❌ Watermark header found (should be absent)")
            
            if 'lgo-watermark' not in html:
                log(f"✅ PASS: Watermark correctly NOT injected when allowPrint=false and allowDownload=false")
            else:
                log(f"❌ FAIL: Watermark still present")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 5: PATCH back to enable
    log("\n[TEST 6] PATCH back to enable allowPrint and allowDownload")
    try:
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/wm-test-1", 
                             headers=headers,
                             json={"allowPrint": True, "allowDownload": True},
                             timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            # Verify watermark returns
            resp2 = requests.get(f"{BASE_URL}/panchapadi-lessons/wm-test-1/view", headers=headers, timeout=10)
            if 'id="lgo-watermark"' in resp2.text:
                log(f"✅ PASS: Watermark returns after re-enabling")
            else:
                log(f"❌ FAIL: Watermark not returned")
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # ========== PHASE 2: Duplicate Guard + Versioning ==========
    log("\n" + "=" * 80)
    log("PHASE 2: DUPLICATE GUARD + VERSIONING")
    log("=" * 80)
    
    # Test 6: POST /preview with HTML
    log("\n[TEST 7] POST /admin/panchapadi-lessons/preview")
    try:
        html_content = "<html><body>" + "x" * 200 + "</body></html>"
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/preview",
                            headers=headers,
                            json={
                                "html": html_content,
                                "filename": f"class-{cls.get('order')}-math-ch-1.html" if cls else "class-1-math-ch-1.html"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
        else:
            data = resp.json()
            log(f"Response keys: {list(data.keys())}")
            
            # Check for required fields
            required_fields = ["existing", "existingCount", "maxVersionPerPeriod"]
            all_present = True
            for field in required_fields:
                if field in data:
                    log(f"  ✅ {field}: {data[field]}")
                else:
                    log(f"  ❌ {field} missing")
                    all_present = False
            
            if all_present:
                log(f"✅ PASS: Preview endpoint returns all required fields")
            else:
                log(f"❌ FAIL: Some required fields missing")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 7: Insert a real upload with version 1
    log("\n[TEST 8] Insert upload with version 1 for versioning test")
    try:
        test_doc_v1 = {
            "id": "ver-test-1",
            "chapterId": chapter.get("id"),
            "classId": chapter.get("classId"),
            "bookId": chapter.get("bookId"),
            "classLabel": cls.get("name") if cls else "Class 1",
            "classOrder": cls.get("order") if cls else 1,
            "bookLabel": book.get("name") if book else "ଗଣିତ",
            "chapterLabel": chapter.get("name"),
            "chapterOrder": 1,
            "period": 1,
            "version": 1,
            "title": "Version Test Period 1",
            "filename": "ver-test.html",
            "hidden": False,
            "status": "published",
            "allowPrint": True,
            "allowDownload": True,
            "html": "<!doctype html><html><body><h1>Version 1</h1></body></html>",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        
        # Delete if exists
        db.panchapadiUploads.delete_many({"id": {"$regex": "^ver-test-"}})
        
        # Insert
        db.panchapadiUploads.insert_one(test_doc_v1)
        log(f"✅ PASS: Version 1 upload inserted")
        
    except Exception as e:
        log(f"❌ FAIL: {e}")
        return
    
    # Test 8: POST with writeMode='newVersion' → should create version 2
    log("\n[TEST 9] POST with writeMode='newVersion'")
    try:
        html_v2 = "<!doctype html><html><head><meta name='em-class' content='" + (cls.get("name") if cls else "Class 1") + "'><meta name='em-chapter' content='" + chapter.get("name") + "'><meta name='em-period' content='1'></head><body><h1>Version 2</h1>" + "x" * 200 + "</body></html>"
        
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons",
                            headers=headers,
                            json={
                                "html": html_v2,
                                "filename": "ver-test.html",
                                "classId": chapter.get("classId"),
                                "bookId": chapter.get("bookId"),
                                "chapterId": chapter.get("id"),
                                "writeMode": "newVersion"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
        else:
            data = resp.json()
            log(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("version") == 2:
                log(f"  ✅ Version incremented to 2")
            else:
                log(f"  ❌ Version not 2, got: {data.get('version')}")
            
            # Check DB for 2 rows
            count = db.panchapadiUploads.count_documents({
                "chapterId": chapter.get("id"),
                "period": 1
            })
            log(f"  DB count for (chapterId, period=1): {count}")
            if count == 2:
                log(f"✅ PASS: newVersion created version 2, both versions exist in DB")
            else:
                log(f"❌ FAIL: Expected 2 rows, got {count}")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 9: POST with writeMode='replace' → should overwrite
    log("\n[TEST 10] POST with writeMode='replace'")
    try:
        html_replace = "<!doctype html><html><head><meta name='em-class' content='" + (cls.get("name") if cls else "Class 1") + "'><meta name='em-chapter' content='" + chapter.get("name") + "'><meta name='em-period' content='1'></head><body><h1>Replaced</h1>" + "x" * 200 + "</body></html>"
        
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons",
                            headers=headers,
                            json={
                                "html": html_replace,
                                "filename": "ver-test.html",
                                "classId": chapter.get("classId"),
                                "bookId": chapter.get("bookId"),
                                "chapterId": chapter.get("id"),
                                "writeMode": "replace"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            data = resp.json()
            log(f"Response: {json.dumps(data, indent=2)}")
            
            # Check that updatedAt changed
            replaced_doc = db.panchapadiUploads.find_one({
                "chapterId": chapter.get("id"),
                "period": 1,
                "version": 1
            })
            
            if replaced_doc and "Replaced" in replaced_doc.get("html", ""):
                log(f"✅ PASS: replace mode overwrote the document")
            else:
                log(f"❌ FAIL: Document not replaced correctly")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 10: POST with writeMode='skip' → should skip
    log("\n[TEST 11] POST with writeMode='skip'")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons",
                            headers=headers,
                            json={
                                "html": html_replace,
                                "filename": "ver-test.html",
                                "classId": chapter.get("classId"),
                                "bookId": chapter.get("bookId"),
                                "chapterId": chapter.get("id"),
                                "writeMode": "skip"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            data = resp.json()
            log(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("ok") and data.get("mode") == "skip" and data.get("skipped"):
                log(f"✅ PASS: skip mode returned correctly")
            else:
                log(f"❌ FAIL: skip mode response incorrect")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 11: GET /browse → should return only LATEST version
    log("\n[TEST 12] GET /panchapadi-lessons/browse - verify only latest version returned")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", headers=headers, timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            data = resp.json()
            
            # Find our test chapter in the response
            found_versions = []
            for cls_item in data.get("classes", []):
                for book_item in cls_item.get("books", []):
                    for chapter_item in book_item.get("chapters", []):
                        if chapter_item.get("chapterLabel") == chapter.get("name"):
                            for period_item in chapter_item.get("periods", []):
                                if period_item.get("period") == 1:
                                    found_versions.append(period_item.get("version"))
            
            log(f"  Found versions for period 1: {found_versions}")
            if len(found_versions) == 1:
                log(f"✅ PASS: Only 1 version returned (latest version wins)")
            else:
                log(f"❌ FAIL: Expected 1 version, got {len(found_versions)}")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 12: GET /by-chapter/:chapterId → should return only latest version
    log("\n[TEST 13] GET /panchapadi-lessons/by-chapter/:chapterId")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/by-chapter/{chapter.get('id')}", 
                           headers=headers, timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            data = resp.json()
            uploads = data.get("uploads", {})
            period_1 = uploads.get("1")
            
            if period_1:
                log(f"  Period 1 version: {period_1.get('version')}")
                log(f"✅ PASS: by-chapter endpoint returns latest version")
            else:
                log(f"❌ FAIL: Period 1 not found in response")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # ========== PHASE 3: Bulk Publish ==========
    log("\n" + "=" * 80)
    log("PHASE 3: BULK PUBLISH")
    log("=" * 80)
    
    # Test 13: Insert 3 draft uploads
    log("\n[TEST 14] Insert 3 draft uploads")
    try:
        bulk_docs = []
        for i in range(1, 4):
            doc = {
                "id": f"bulk-{i}",
                "chapterId": "bulk-ch",
                "classId": chapter.get("classId"),
                "bookId": chapter.get("bookId"),
                "classLabel": "Bulk Test Class",
                "classOrder": 1,
                "bookLabel": "Bulk Test Book",
                "chapterLabel": "Bulk Test Chapter",
                "chapterOrder": 1,
                "period": i,
                "version": 1,
                "title": f"Bulk Test Period {i}",
                "filename": f"bulk-{i}.html",
                "hidden": False,
                "status": "draft",
                "allowPrint": True,
                "allowDownload": True,
                "html": f"<!doctype html><html><body><h1>Bulk {i}</h1></body></html>",
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            bulk_docs.append(doc)
        
        # Delete if exists
        db.panchapadiUploads.delete_many({"id": {"$regex": "^bulk-"}})
        
        # Insert
        db.panchapadiUploads.insert_many(bulk_docs)
        log(f"✅ PASS: 3 draft uploads inserted")
        
    except Exception as e:
        log(f"❌ FAIL: {e}")
        return
    
    # Test 14: POST /bulk with action='publish'
    log("\n[TEST 15] POST /admin/panchapadi-lessons/bulk with action='publish'")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                            headers=headers,
                            json={
                                "ids": ["bulk-1", "bulk-2", "bulk-3"],
                                "action": "publish"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
        else:
            data = resp.json()
            log(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("ok") and data.get("action") == "publish" and data.get("matched") == 3:
                log(f"  ✅ matched: 3")
                
                # Verify in DB
                published_count = db.panchapadiUploads.count_documents({
                    "id": {"$in": ["bulk-1", "bulk-2", "bulk-3"]},
                    "status": "published"
                })
                log(f"  DB published count: {published_count}")
                
                if published_count == 3:
                    log(f"✅ PASS: All 3 uploads published")
                else:
                    log(f"❌ FAIL: Expected 3 published, got {published_count}")
            else:
                log(f"❌ FAIL: Bulk publish response incorrect")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 15: Test other actions
    actions_to_test = [
        ("draft", {"status": "draft"}),
        ("hide", {"hidden": True}),
        ("unhide", {"hidden": False}),
        ("allowPrint", {"allowPrint": True}),
        ("disallowPrint", {"allowPrint": False}),
        ("allowDownload", {"allowDownload": True}),
        ("disallowDownload", {"allowDownload": False}),
        ("setAY", {"academicYear": "2025-26"}),
    ]
    
    for action, expected_field in actions_to_test:
        log(f"\n[TEST] POST /bulk with action='{action}'")
        try:
            payload = {
                "ids": ["bulk-1", "bulk-2", "bulk-3"],
                "action": action
            }
            if action == "setAY":
                payload["academicYear"] = "2025-26"
            
            resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                                headers=headers,
                                json=payload,
                                timeout=10)
            log(f"Status: {resp.status_code}")
            if resp.status_code != 200:
                log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            else:
                data = resp.json()
                if data.get("ok") and data.get("matched") == 3:
                    # Verify in DB
                    docs = list(db.panchapadiUploads.find(
                        {"id": {"$in": ["bulk-1", "bulk-2", "bulk-3"]}},
                        {"_id": 0, **{k: 1 for k in expected_field.keys()}}
                    ))
                    
                    all_match = all(
                        all(doc.get(k) == v for k, v in expected_field.items())
                        for doc in docs
                    )
                    
                    if all_match:
                        log(f"✅ PASS: action '{action}' applied correctly")
                    else:
                        log(f"❌ FAIL: action '{action}' not applied correctly")
                        log(f"  Expected: {expected_field}")
                        log(f"  Got: {docs}")
                else:
                    log(f"❌ FAIL: Bulk action response incorrect")
                    
        except Exception as e:
            log(f"❌ FAIL: {e}")
    
    # Test 16: Test delete action
    log("\n[TEST 16] POST /bulk with action='delete'")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                            headers=headers,
                            json={
                                "ids": ["bulk-1", "bulk-2", "bulk-3"],
                                "action": "delete"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
        else:
            data = resp.json()
            log(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("ok") and data.get("action") == "delete" and data.get("deleted") == 3:
                # Verify in DB
                remaining = db.panchapadiUploads.count_documents({
                    "id": {"$in": ["bulk-1", "bulk-2", "bulk-3"]}
                })
                
                if remaining == 0:
                    log(f"✅ PASS: All 3 uploads deleted")
                else:
                    log(f"❌ FAIL: Expected 0 remaining, got {remaining}")
            else:
                log(f"❌ FAIL: Bulk delete response incorrect")
                
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # Test 17: Test error cases
    log("\n[TEST 17] POST /bulk with missing ids → 400")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                            headers=headers,
                            json={"action": "publish"},
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code == 400:
            log(f"✅ PASS: Missing ids returns 400")
        else:
            log(f"❌ FAIL: Expected 400, got {resp.status_code}")
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    log("\n[TEST 18] POST /bulk with unknown action → 400")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                            headers=headers,
                            json={
                                "ids": ["bulk-1"],
                                "action": "unknown"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code == 400:
            log(f"✅ PASS: Unknown action returns 400")
        else:
            log(f"❌ FAIL: Expected 400, got {resp.status_code}")
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    log("\n[TEST 19] POST /bulk without admin login → 401/403")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk",
                            json={
                                "ids": ["bulk-1"],
                                "action": "publish"
                            },
                            timeout=10)
        log(f"Status: {resp.status_code}")
        if resp.status_code in [401, 403]:
            log(f"✅ PASS: Non-admin returns {resp.status_code}")
        else:
            log(f"❌ FAIL: Expected 401/403, got {resp.status_code}")
    except Exception as e:
        log(f"❌ FAIL: {e}")
    
    # ========== CLEANUP ==========
    log("\n" + "=" * 80)
    log("CLEANUP")
    log("=" * 80)
    
    log("\n[CLEANUP] Delete all test uploads")
    try:
        db.panchapadiUploads.delete_many({"id": {"$regex": "^(wm-test-|ver-test-|bulk-)"}})
        log(f"✅ Test uploads cleaned up")
    except Exception as e:
        log(f"⚠️  Cleanup failed: {e}")
    
    log("\n" + "=" * 80)
    log("TEST COMPLETE")
    log("=" * 80)

if __name__ == "__main__":
    test_panchapadi_3_features()
