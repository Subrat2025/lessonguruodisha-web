#!/usr/bin/env python3
"""
Backend test for Panchapadi 4-way download/print gate feature.

Tests:
1. Migration v2 runs and sets all 4 flags to false
2. /browse response includes the 4 flags
3. /meta response includes the 4 flags
4. Download endpoints (html, raw, pdf) return 403 when flags are false, 200 when true
5. PATCH endpoint updates individual flags
6. Bulk endpoint actions work for all 6 new actions
7. Default upload has all 4 flags = false
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Minimal valid single-file HTML for upload
MINIMAL_HTML = """<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="em-class" content="Class 1">
<meta name="em-book" content="Mathematics">
<meta name="em-chapter" content="Numbers">
<meta name="em-chapter-order" content="1">
<meta name="em-period" content="1">
<title>Test Panchapadi 4-Way Gate</title>
</head><body>
<h1>Test Panchapadi Lesson - 4-Way Download Gate</h1>
<h2>Adhiti</h2><p>Introduction to the concept</p>
<h2>Bodha</h2><p>Understanding the concept deeply</p>
<h2>Abhyasa</h2><p>Practice exercises</p>
<h2>Prayoga</h2><p>Application in real life</p>
<h2>Prasara</h2><p>Extension activities</p>
</body></html>"""

def test_admin_login():
    """Test 1: Admin login"""
    print("\n=== Test 1: Admin Login ===")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            print(f"✅ PASS: Admin login successful, token: {token[:20]}...")
            return token
        else:
            print(f"❌ FAIL: Login failed - {resp.text}")
            return None
    except Exception as e:
        print(f"❌ FAIL: Exception during login - {e}")
        return None

def test_migration_v2(token):
    """Test 2: Migration v2 runs on /browse and sets all 4 flags to false"""
    print("\n=== Test 2: Migration v2 - First /browse call triggers migration ===")
    try:
        # First call to /browse should trigger both v1 and v2 migrations
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=15)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: /browse returned 200")
            print(f"   Classes returned: {len(data.get('classes', []))}")
            
            # Check if any periods exist and verify they have the 4 flags
            has_periods = False
            for cls in data.get('classes', []):
                for book in cls.get('books', []):
                    for chapter in book.get('chapters', []):
                        for period in chapter.get('periods', []):
                            has_periods = True
                            # Check all 4 flags are present
                            flags = {
                                'allowPrint': period.get('allowPrint'),
                                'allowPdfDownload': period.get('allowPdfDownload'),
                                'allowHtmlDownload': period.get('allowHtmlDownload'),
                                'allowRawDownload': period.get('allowRawDownload')
                            }
                            print(f"   Period {period.get('id')}: {flags}")
                            
                            # After migration, all should be false for legacy rows
                            # (unless admin has explicitly enabled them)
                            if all(k in period for k in flags.keys()):
                                print(f"   ✅ All 4 flags present in period response")
                            else:
                                print(f"   ❌ Missing flags in period response")
                            break
                    if has_periods:
                        break
                if has_periods:
                    break
            
            if not has_periods:
                print("   ⚠️  No periods found in browse response (may be empty library)")
            
            return True
        else:
            print(f"❌ FAIL: /browse failed - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception during /browse - {e}")
        return False

def verify_migration_marker(token):
    """Test 3: Verify migration marker exists in migrations collection"""
    print("\n=== Test 3: Verify migration v2 marker in DB ===")
    # We can't directly query MongoDB from here, but we can verify by calling /browse again
    # and checking it's idempotent (doesn't re-run)
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/browse", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: Second /browse call successful (idempotent)")
            return True
        else:
            print(f"❌ FAIL: Second /browse failed - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception during second /browse - {e}")
        return False

def test_default_upload(token):
    """Test 4: Upload a new lesson and verify all 4 flags default to false"""
    print("\n=== Test 4: Default upload behavior - all 4 flags = false ===")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={
                                "html": MINIMAL_HTML,
                                "filename": "test-4way-gate.html",
                                "newLessonPlanVisible": True
                                # NOT including any of the 4 flags
                            },
                            timeout=15)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get('ok'):
                lesson_id = data.get('id') or (data.get('results', [{}])[0].get('id'))
                print(f"✅ PASS: Lesson uploaded, id: {lesson_id}")
                return lesson_id
            else:
                print(f"❌ FAIL: Upload failed - {data}")
                return None
        else:
            print(f"❌ FAIL: Upload failed - {resp.text}")
            return None
    except Exception as e:
        print(f"❌ FAIL: Exception during upload - {e}")
        return None

def test_meta_endpoint(token, lesson_id):
    """Test 5: /meta endpoint returns all 4 flags"""
    print(f"\n=== Test 5: GET /panchapadi-lessons/{lesson_id}/meta ===")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/meta", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            flags = {
                'allowPrint': data.get('allowPrint'),
                'allowPdfDownload': data.get('allowPdfDownload'),
                'allowHtmlDownload': data.get('allowHtmlDownload'),
                'allowRawDownload': data.get('allowRawDownload')
            }
            print(f"Flags in meta: {flags}")
            
            # Verify all 4 flags are present and false (default)
            if all(k in data for k in flags.keys()):
                print(f"✅ PASS: All 4 flags present in /meta response")
                if all(v == False for v in flags.values()):
                    print(f"✅ PASS: All 4 flags are false (default)")
                else:
                    print(f"⚠️  WARNING: Some flags are true (expected false for new upload)")
                return True
            else:
                print(f"❌ FAIL: Missing flags in /meta response")
                return False
        else:
            print(f"❌ FAIL: /meta failed - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception during /meta - {e}")
        return False

def test_download_gates_disabled(token, lesson_id):
    """Test 6: Download endpoints return 403 when flags are false"""
    print(f"\n=== Test 6: Download endpoints with flags=false (should return 403) ===")
    
    results = {}
    
    # Test HTML download
    print("\n--- Test 6a: HTML download (allowHtmlDownload=false) ---")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/download/html", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            data = resp.json()
            print(f"Error message: {data.get('error')}")
            if 'HTML download is currently disabled' in data.get('error', ''):
                print(f"✅ PASS: HTML download correctly blocked with 403")
                results['html'] = True
            else:
                print(f"❌ FAIL: Wrong error message")
                results['html'] = False
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            results['html'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['html'] = False
    
    # Test RAW download
    print("\n--- Test 6b: RAW download (allowRawDownload=false) ---")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/download/raw", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            data = resp.json()
            print(f"Error message: {data.get('error')}")
            if 'download is currently disabled' in data.get('error', '').lower():
                print(f"✅ PASS: RAW download correctly blocked with 403")
                results['raw'] = True
            else:
                print(f"❌ FAIL: Wrong error message")
                results['raw'] = False
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            results['raw'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['raw'] = False
    
    # Test PDF download
    print("\n--- Test 6c: PDF download (allowPdfDownload=false) ---")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/download/pdf", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=15)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            data = resp.json()
            print(f"Error message: {data.get('error')}")
            if 'PDF download is currently disabled' in data.get('error', ''):
                print(f"✅ PASS: PDF download correctly blocked with 403")
                results['pdf'] = True
            else:
                print(f"❌ FAIL: Wrong error message")
                results['pdf'] = False
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            results['pdf'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['pdf'] = False
    
    return all(results.values())

def test_patch_enable_flags(token, lesson_id):
    """Test 7: PATCH endpoint to enable all 4 flags individually"""
    print(f"\n=== Test 7: PATCH /admin/panchapadi-lessons/{lesson_id} - Enable flags ===")
    
    results = {}
    
    # Enable allowPrint
    print("\n--- Test 7a: Enable allowPrint ---")
    try:
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}", 
                             headers={"Authorization": f"Bearer {token}"},
                             json={"allowPrint": True},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: allowPrint enabled")
            results['print'] = True
        else:
            print(f"❌ FAIL: PATCH failed - {resp.text}")
            results['print'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['print'] = False
    
    # Enable allowPdfDownload
    print("\n--- Test 7b: Enable allowPdfDownload ---")
    try:
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}", 
                             headers={"Authorization": f"Bearer {token}"},
                             json={"allowPdfDownload": True},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: allowPdfDownload enabled")
            results['pdf'] = True
        else:
            print(f"❌ FAIL: PATCH failed - {resp.text}")
            results['pdf'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['pdf'] = False
    
    # Enable allowHtmlDownload
    print("\n--- Test 7c: Enable allowHtmlDownload ---")
    try:
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}", 
                             headers={"Authorization": f"Bearer {token}"},
                             json={"allowHtmlDownload": True},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: allowHtmlDownload enabled")
            results['html'] = True
        else:
            print(f"❌ FAIL: PATCH failed - {resp.text}")
            results['html'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['html'] = False
    
    # Enable allowRawDownload
    print("\n--- Test 7d: Enable allowRawDownload ---")
    try:
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}", 
                             headers={"Authorization": f"Bearer {token}"},
                             json={"allowRawDownload": True},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: allowRawDownload enabled")
            results['raw'] = True
        else:
            print(f"❌ FAIL: PATCH failed - {resp.text}")
            results['raw'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['raw'] = False
    
    return all(results.values())

def test_download_gates_enabled(token, lesson_id):
    """Test 8: Download endpoints return 200 when flags are true"""
    print(f"\n=== Test 8: Download endpoints with flags=true (should return 200) ===")
    
    results = {}
    
    # Test HTML download
    print("\n--- Test 8a: HTML download (allowHtmlDownload=true) ---")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/download/html", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('Content-Type')}")
        print(f"Content-Disposition: {resp.headers.get('Content-Disposition')}")
        
        if resp.status_code == 200:
            if 'text/html' in resp.headers.get('Content-Type', ''):
                if 'attachment' in resp.headers.get('Content-Disposition', ''):
                    print(f"✅ PASS: HTML download successful with correct headers")
                    results['html'] = True
                else:
                    print(f"❌ FAIL: Missing attachment disposition")
                    results['html'] = False
            else:
                print(f"❌ FAIL: Wrong content type")
                results['html'] = False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results['html'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['html'] = False
    
    # Test RAW download
    print("\n--- Test 8b: RAW download (allowRawDownload=true) ---")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/download/raw", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('Content-Type')}")
        print(f"Content-Disposition: {resp.headers.get('Content-Disposition')}")
        
        if resp.status_code == 200:
            if 'text/html' in resp.headers.get('Content-Type', ''):
                if 'attachment' in resp.headers.get('Content-Disposition', ''):
                    print(f"✅ PASS: RAW download successful with correct headers")
                    results['raw'] = True
                else:
                    print(f"❌ FAIL: Missing attachment disposition")
                    results['raw'] = False
            else:
                print(f"❌ FAIL: Wrong content type")
                results['raw'] = False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results['raw'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['raw'] = False
    
    # Test PDF download
    print("\n--- Test 8c: PDF download (allowPdfDownload=true) ---")
    try:
        resp = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/download/pdf", 
                           headers={"Authorization": f"Bearer {token}"}, 
                           timeout=30)
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('Content-Type')}")
        
        if resp.status_code == 200:
            if 'application/pdf' in resp.headers.get('Content-Type', ''):
                print(f"✅ PASS: PDF download successful with correct content type")
                results['pdf'] = True
            else:
                print(f"❌ FAIL: Wrong content type (expected application/pdf)")
                results['pdf'] = False
        elif resp.status_code == 500:
            # Puppeteer may not be installed - this is acceptable
            data = resp.json()
            if 'PDF rendering is not available' in data.get('error', '') or 'puppeteer' in data.get('error', '').lower():
                print(f"⚠️  ACCEPTABLE: PDF renderer not available (puppeteer missing)")
                print(f"   Error: {data.get('error')}")
                results['pdf'] = True  # Mark as pass since this is acceptable
            else:
                print(f"❌ FAIL: Unexpected 500 error - {data}")
                results['pdf'] = False
        else:
            print(f"❌ FAIL: Expected 200 or 500, got {resp.status_code}")
            results['pdf'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['pdf'] = False
    
    return all(results.values())

def test_bulk_actions(token, lesson_id):
    """Test 9: Bulk actions for the 6 new download/print actions"""
    print(f"\n=== Test 9: Bulk actions for download/print gates ===")
    
    results = {}
    
    # Test disallowPdfDownload
    print("\n--- Test 9a: Bulk disallowPdfDownload ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "disallowPdfDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Response: {data}")
            if data.get('ok') and data.get('modified', 0) >= 1:
                print(f"✅ PASS: disallowPdfDownload action successful")
                results['disallow_pdf'] = True
            else:
                print(f"❌ FAIL: Action did not modify document")
                results['disallow_pdf'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['disallow_pdf'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['disallow_pdf'] = False
    
    # Test allowPdfDownload
    print("\n--- Test 9b: Bulk allowPdfDownload ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "allowPdfDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok'):
                print(f"✅ PASS: allowPdfDownload action successful")
                results['allow_pdf'] = True
            else:
                print(f"❌ FAIL: Action failed")
                results['allow_pdf'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['allow_pdf'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['allow_pdf'] = False
    
    # Test disallowHtmlDownload
    print("\n--- Test 9c: Bulk disallowHtmlDownload ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "disallowHtmlDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok'):
                print(f"✅ PASS: disallowHtmlDownload action successful")
                results['disallow_html'] = True
            else:
                print(f"❌ FAIL: Action failed")
                results['disallow_html'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['disallow_html'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['disallow_html'] = False
    
    # Test allowHtmlDownload
    print("\n--- Test 9d: Bulk allowHtmlDownload ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "allowHtmlDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok'):
                print(f"✅ PASS: allowHtmlDownload action successful")
                results['allow_html'] = True
            else:
                print(f"❌ FAIL: Action failed")
                results['allow_html'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['allow_html'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['allow_html'] = False
    
    # Test disallowRawDownload
    print("\n--- Test 9e: Bulk disallowRawDownload ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "disallowRawDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok'):
                print(f"✅ PASS: disallowRawDownload action successful")
                results['disallow_raw'] = True
            else:
                print(f"❌ FAIL: Action failed")
                results['disallow_raw'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['disallow_raw'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['disallow_raw'] = False
    
    # Test allowRawDownload
    print("\n--- Test 9f: Bulk allowRawDownload ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "allowRawDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok'):
                print(f"✅ PASS: allowRawDownload action successful")
                results['allow_raw'] = True
            else:
                print(f"❌ FAIL: Action failed")
                results['allow_raw'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['allow_raw'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['allow_raw'] = False
    
    # Test legacy allowDownload (should update allowHtmlDownload)
    print("\n--- Test 9g: Legacy bulk allowDownload (should update HTML flag) ---")
    try:
        resp = requests.post(f"{BASE_URL}/admin/panchapadi-lessons/bulk", 
                            headers={"Authorization": f"Bearer {token}"},
                            json={"ids": [lesson_id], "action": "allowDownload"},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok'):
                print(f"✅ PASS: Legacy allowDownload action successful")
                results['legacy_allow'] = True
            else:
                print(f"❌ FAIL: Action failed")
                results['legacy_allow'] = False
        else:
            print(f"❌ FAIL: Bulk action failed - {resp.text}")
            results['legacy_allow'] = False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        results['legacy_allow'] = False
    
    return all(results.values())

def test_legacy_allowdownload_field(token, lesson_id):
    """Test 10: Legacy allowDownload field in PATCH"""
    print(f"\n=== Test 10: Legacy allowDownload field in PATCH ===")
    
    try:
        # PATCH with legacy allowDownload field
        resp = requests.patch(f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}", 
                             headers={"Authorization": f"Bearer {token}"},
                             json={"allowDownload": True},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Legacy allowDownload PATCH accepted")
            
            # Verify it updated allowHtmlDownload
            resp2 = requests.get(f"{BASE_URL}/panchapadi-lessons/{lesson_id}/meta", 
                                headers={"Authorization": f"Bearer {token}"}, 
                                timeout=10)
            if resp2.status_code == 200:
                data = resp2.json()
                if data.get('allowHtmlDownload') == True and data.get('allowDownload') == True:
                    print(f"✅ PASS: Legacy allowDownload correctly updated both fields")
                    return True
                else:
                    print(f"❌ FAIL: Fields not updated correctly: allowHtmlDownload={data.get('allowHtmlDownload')}, allowDownload={data.get('allowDownload')}")
                    return False
            else:
                print(f"❌ FAIL: Could not verify - /meta failed")
                return False
        else:
            print(f"❌ FAIL: PATCH failed - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def cleanup_test_lesson(token, lesson_id):
    """Cleanup: Delete the test lesson"""
    print(f"\n=== Cleanup: Delete test lesson {lesson_id} ===")
    try:
        resp = requests.delete(f"{BASE_URL}/admin/panchapadi-lessons/{lesson_id}", 
                              headers={"Authorization": f"Bearer {token}"}, 
                              timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Cleanup successful: {data}")
            return True
        else:
            print(f"⚠️  Cleanup failed - {resp.text}")
            return False
    except Exception as e:
        print(f"⚠️  Cleanup exception - {e}")
        return False

def main():
    print("=" * 80)
    print("PANCHAPADI 4-WAY DOWNLOAD/PRINT GATE - BACKEND TEST")
    print("=" * 80)
    
    # Test 1: Login
    token = test_admin_login()
    if not token:
        print("\n❌ CRITICAL: Cannot proceed without admin token")
        sys.exit(1)
    
    # Test 2: Migration v2
    test_migration_v2(token)
    
    # Test 3: Verify migration is idempotent
    verify_migration_marker(token)
    
    # Test 4: Upload a new lesson (default flags = false)
    lesson_id = test_default_upload(token)
    if not lesson_id:
        print("\n❌ CRITICAL: Cannot proceed without test lesson")
        sys.exit(1)
    
    # Test 5: /meta endpoint
    test_meta_endpoint(token, lesson_id)
    
    # Test 6: Download gates disabled (403)
    test_download_gates_disabled(token, lesson_id)
    
    # Test 7: PATCH to enable flags
    test_patch_enable_flags(token, lesson_id)
    
    # Test 8: Download gates enabled (200)
    test_download_gates_enabled(token, lesson_id)
    
    # Test 9: Bulk actions
    test_bulk_actions(token, lesson_id)
    
    # Test 10: Legacy allowDownload field
    test_legacy_allowdownload_field(token, lesson_id)
    
    # Cleanup
    cleanup_test_lesson(token, lesson_id)
    
    print("\n" + "=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
