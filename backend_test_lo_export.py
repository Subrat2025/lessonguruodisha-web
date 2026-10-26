#!/usr/bin/env python3
"""
Backend test for GET /api/admin/academic-resources/lo-export endpoint.

Tests the NEW read-only chapterwise LO → ZIP export endpoint.
Context: Reads academicResources docs where resourceType='chapter_wise_lo' and
returns a ZIP (application/zip) containing one HTML file per class + index.html.
Admin-only. On preview DB there is exactly 1 such doc (Class 1 Odia).

Test scenarios:
1) AUTH: call WITHOUT a token → expect 401 or 403 (admin guard)
2) HAPPY PATH (admin token): GET the endpoint → expect HTTP 200, Content-Type
   'application/zip', Content-Disposition attachment header with filename like
   chapterwise-lo-YYYY-MM-DD.zip, response headers X-LO-Chapters >= 1 and
   X-LO-Classes >= 1, and a NON-EMPTY binary body. Unzip the body and assert
   it contains 'index.html' and at least one file matching 'Class-*.html',
   and that the class HTML is non-empty and contains the string 'pcm-root'.
3) READ-ONLY: record academicResources document count BEFORE and AFTER calling
   the export; assert unchanged (the export must not create/modify/delete anything).
"""

import requests
import io
import zipfile
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

def login_admin():
    """Login as admin and return the Bearer token."""
    try:
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ Admin login successful: {ADMIN_MOBILE}")
                return token
            else:
                print(f"❌ Admin login failed: no token in response")
                return None
        else:
            print(f"❌ Admin login failed: {resp.status_code} {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Admin login exception: {e}")
        return None

def get_chapter_wise_lo_count(token):
    """Get the count of academicResources docs with resourceType='chapter_wise_lo'."""
    try:
        resp = requests.get(
            f"{BASE_URL}/api/admin/academic-resources?type=chapter_wise_lo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            total = data.get("total", 0)
            print(f"✅ chapter_wise_lo count: {total}")
            return total
        else:
            print(f"❌ Failed to get chapter_wise_lo count: {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ Exception getting chapter_wise_lo count: {e}")
        return None

def test_auth_no_token():
    """TEST 1: Call without token → expect 401 or 403."""
    print("\n" + "="*80)
    print("TEST 1: AUTH - Call without token (expect 401 or 403)")
    print("="*80)
    try:
        resp = requests.get(
            f"{BASE_URL}/api/admin/academic-resources/lo-export",
            timeout=15
        )
        status = resp.status_code
        print(f"Status code: {status}")
        
        if status in [401, 403]:
            print(f"✅ TEST 1 PASSED: Unauthenticated request blocked with {status}")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 401 or 403, got {status}")
            print(f"Response: {resp.text[:500]}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 EXCEPTION: {e}")
        return False

def test_happy_path(token):
    """TEST 2: Happy path with admin token."""
    print("\n" + "="*80)
    print("TEST 2: HAPPY PATH - Admin token (expect 200, ZIP with HTML files)")
    print("="*80)
    try:
        resp = requests.get(
            f"{BASE_URL}/api/admin/academic-resources/lo-export",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        status = resp.status_code
        print(f"Status code: {status}")
        
        if status != 200:
            print(f"❌ TEST 2 FAILED: Expected 200, got {status}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        # Check Content-Type
        content_type = resp.headers.get("Content-Type", "")
        print(f"Content-Type: {content_type}")
        if "application/zip" not in content_type:
            print(f"❌ TEST 2 FAILED: Expected Content-Type 'application/zip', got '{content_type}'")
            return False
        print("✅ Content-Type is 'application/zip'")
        
        # Check Content-Disposition
        content_disp = resp.headers.get("Content-Disposition", "")
        print(f"Content-Disposition: {content_disp}")
        if "attachment" not in content_disp:
            print(f"❌ TEST 2 FAILED: Expected 'attachment' in Content-Disposition")
            return False
        if "chapterwise-lo-" not in content_disp:
            print(f"❌ TEST 2 FAILED: Expected filename like 'chapterwise-lo-YYYY-MM-DD.zip'")
            return False
        print("✅ Content-Disposition has 'attachment' and filename pattern")
        
        # Check X-LO-Classes header
        x_lo_classes = resp.headers.get("X-LO-Classes", "")
        print(f"X-LO-Classes: {x_lo_classes}")
        try:
            classes_count = int(x_lo_classes)
            if classes_count < 1:
                print(f"❌ TEST 2 FAILED: X-LO-Classes should be >= 1, got {classes_count}")
                return False
            print(f"✅ X-LO-Classes = {classes_count} (>= 1)")
        except:
            print(f"❌ TEST 2 FAILED: X-LO-Classes header invalid: '{x_lo_classes}'")
            return False
        
        # Check X-LO-Chapters header
        x_lo_chapters = resp.headers.get("X-LO-Chapters", "")
        print(f"X-LO-Chapters: {x_lo_chapters}")
        try:
            chapters_count = int(x_lo_chapters)
            if chapters_count < 1:
                print(f"❌ TEST 2 FAILED: X-LO-Chapters should be >= 1, got {chapters_count}")
                return False
            print(f"✅ X-LO-Chapters = {chapters_count} (>= 1)")
        except:
            print(f"❌ TEST 2 FAILED: X-LO-Chapters header invalid: '{x_lo_chapters}'")
            return False
        
        # Check body is non-empty
        body = resp.content
        body_size = len(body)
        print(f"Response body size: {body_size} bytes")
        if body_size == 0:
            print(f"❌ TEST 2 FAILED: Response body is empty")
            return False
        print(f"✅ Response body is non-empty ({body_size} bytes)")
        
        # Unzip and verify contents
        print("\nUnzipping response body...")
        try:
            zip_buffer = io.BytesIO(body)
            with zipfile.ZipFile(zip_buffer, 'r') as zf:
                file_list = zf.namelist()
                print(f"ZIP contains {len(file_list)} files:")
                for fname in file_list:
                    print(f"  - {fname}")
                
                # Check for index.html
                if "index.html" not in file_list:
                    print(f"❌ TEST 2 FAILED: ZIP does not contain 'index.html'")
                    return False
                print("✅ ZIP contains 'index.html'")
                
                # Check for at least one Class-*.html file
                class_files = [f for f in file_list if f.startswith("Class-") and f.endswith(".html")]
                if len(class_files) == 0:
                    print(f"❌ TEST 2 FAILED: ZIP does not contain any 'Class-*.html' files")
                    return False
                print(f"✅ ZIP contains {len(class_files)} Class-*.html file(s): {class_files}")
                
                # Read the first class file and check for 'pcm-root'
                first_class_file = class_files[0]
                class_html = zf.read(first_class_file).decode('utf-8', errors='ignore')
                class_html_size = len(class_html)
                print(f"\nReading {first_class_file} ({class_html_size} bytes)...")
                
                if class_html_size == 0:
                    print(f"❌ TEST 2 FAILED: {first_class_file} is empty")
                    return False
                print(f"✅ {first_class_file} is non-empty ({class_html_size} bytes)")
                
                if "pcm-root" not in class_html:
                    print(f"❌ TEST 2 FAILED: {first_class_file} does not contain 'pcm-root'")
                    return False
                print(f"✅ {first_class_file} contains 'pcm-root' (CSS class)")
                
                # Also check index.html is non-empty
                index_html = zf.read("index.html").decode('utf-8', errors='ignore')
                index_html_size = len(index_html)
                print(f"\nReading index.html ({index_html_size} bytes)...")
                if index_html_size == 0:
                    print(f"❌ TEST 2 FAILED: index.html is empty")
                    return False
                print(f"✅ index.html is non-empty ({index_html_size} bytes)")
                
                print("\n✅ TEST 2 PASSED: All ZIP content checks passed")
                return True
                
        except zipfile.BadZipFile:
            print(f"❌ TEST 2 FAILED: Response body is not a valid ZIP file")
            return False
        except Exception as e:
            print(f"❌ TEST 2 FAILED: Exception while unzipping: {e}")
            return False
            
    except Exception as e:
        print(f"❌ TEST 2 EXCEPTION: {e}")
        return False

def test_read_only(token):
    """TEST 3: Verify the endpoint is read-only (no data changes)."""
    print("\n" + "="*80)
    print("TEST 3: READ-ONLY - Verify no data changes")
    print("="*80)
    try:
        # Get count BEFORE
        count_before = get_chapter_wise_lo_count(token)
        if count_before is None:
            print(f"❌ TEST 3 FAILED: Could not get count BEFORE export")
            return False
        print(f"Count BEFORE export: {count_before}")
        
        # Call the export endpoint
        print("\nCalling export endpoint...")
        resp = requests.get(
            f"{BASE_URL}/api/admin/academic-resources/lo-export",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        if resp.status_code != 200:
            print(f"❌ TEST 3 FAILED: Export call failed with {resp.status_code}")
            return False
        print(f"✅ Export call succeeded (200)")
        
        # Get count AFTER
        count_after = get_chapter_wise_lo_count(token)
        if count_after is None:
            print(f"❌ TEST 3 FAILED: Could not get count AFTER export")
            return False
        print(f"Count AFTER export: {count_after}")
        
        # Compare
        if count_before != count_after:
            print(f"❌ TEST 3 FAILED: Count changed from {count_before} to {count_after}")
            print(f"   The export endpoint MODIFIED data (not read-only)!")
            return False
        
        print(f"✅ TEST 3 PASSED: Count unchanged ({count_before} → {count_after})")
        print(f"   The export endpoint is READ-ONLY (no data changes)")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 EXCEPTION: {e}")
        return False

def main():
    print("="*80)
    print("BACKEND TEST: GET /api/admin/academic-resources/lo-export")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    print(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Login
    print("\n" + "="*80)
    print("SETUP: Admin login")
    print("="*80)
    token = login_admin()
    if not token:
        print("\n❌ SETUP FAILED: Could not login as admin")
        print("ABORTING ALL TESTS")
        return
    
    # Run tests
    results = {}
    
    results["TEST 1: AUTH (no token)"] = test_auth_no_token()
    results["TEST 2: HAPPY PATH (admin token)"] = test_happy_path(token)
    results["TEST 3: READ-ONLY (no data changes)"] = test_read_only(token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"FINAL RESULT: {passed}/{total} tests passed ({int(passed/total*100)}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! The lo-export endpoint is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) FAILED. Please review the output above.")

if __name__ == "__main__":
    main()
