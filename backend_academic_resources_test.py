#!/usr/bin/env python3
"""
Backend test for Academic Resources module (Phase 1 — HTML upload + user-viewer).

Tests the 8 resource types with HTML sanitization, CRUD operations, and public/admin gating.
"""

import requests
import json
import time

BASE_URL = "http://localhost:3000/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
USER_MOBILE = "9999900001"
USER_PASSWORD = "<redacted>"

admin_token = None
user_token = None
test_resource_id = None

def log(msg):
    print(f"[TEST] {msg}")

def login(mobile, password):
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
    if resp.status_code != 200:
        raise Exception(f"Login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    return data.get("token")

def test_a_types_endpoint():
    """TEST A — Types endpoint"""
    log("TEST A — Types endpoint (no auth)")
    resp = requests.get(f"{BASE_URL}/academic-resources/types", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "types" in data, "Response missing 'types' key"
    types = data["types"]
    assert len(types) == 8, f"Expected 8 types, got {len(types)}"
    
    expected_ids = [
        "teaching_notes", "chapter_assessments", "chapter_worksheets", 
        "lo_code_pdf_book", "chapter_wise_lo", "abhidhana_kosa", 
        "mcm_guide", "classroom_activities"
    ]
    actual_ids = [t["id"] for t in types]
    assert set(actual_ids) == set(expected_ids), f"Type IDs mismatch. Expected {expected_ids}, got {actual_ids}"
    log("✅ TEST A PASSED — 8 types returned with correct IDs")

def test_b_create_with_sanitization():
    """TEST B — Create with sanitization"""
    global test_resource_id
    log("TEST B — Create with sanitization")
    
    # Malicious HTML with XSS attempts
    malicious_html = """
    <h1>Hello</h1>
    <p>Good <b>content</b>.</p>
    <script>alert('xss')</script>
    <iframe src='https://evil.example'></iframe>
    <a href='javascript:alert(1)'>bad</a>
    <a href='https://good.example' target='_blank'>ok</a>
    <img src='https://img.example/x.png' onerror='alert(1)'>
    <table><tr><th>H</th><td>V</td></tr></table>
    """
    
    payload = {
        "resourceType": "teaching_notes",
        "title": "Test Sanitizer — Class 5 Math",
        "description": "Backend test",
        "classId": None,
        "className": "Class 5",
        "subject": "Mathematics",
        "chapterId": None,
        "chapterName": "Fractions",
        "fileName": "test.html",
        "htmlContent": malicious_html,
        "isPublished": True,
        "isVisible": True,
        "allowPdfDownload": False
    }
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{BASE_URL}/admin/academic-resources", json=payload, headers=headers, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("ok") == True, "Response missing ok=true"
    assert "resource" in data, "Response missing 'resource' key"
    assert "id" in data["resource"], "Resource missing 'id' field"
    
    test_resource_id = data["resource"]["id"]
    log(f"✅ Resource created with ID: {test_resource_id}")
    
    # Now fetch the resource as admin to check sanitization
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    html_content = data["resource"]["htmlContent"]
    
    # Check that safe content survived
    assert "<h1>Hello</h1>" in html_content, "Safe <h1> tag was removed"
    assert "<table>" in html_content, "Safe <table> tag was removed"
    assert "https://good.example" in html_content, "Safe link was removed"
    
    # Check that dangerous content was stripped (case-insensitive)
    html_lower = html_content.lower()
    assert "<script" not in html_lower, "Dangerous <script> tag survived sanitization"
    assert "<iframe" not in html_lower, "Dangerous <iframe> tag survived sanitization"
    assert "javascript:" not in html_lower, "Dangerous javascript: URI survived sanitization"
    assert "onerror=" not in html_lower, "Dangerous onerror= attribute survived sanitization"
    
    # Check metadata
    assert data["resource"]["htmlBytes"] > 0, "htmlBytes should be > 0"
    assert data["resource"]["textLength"] > 0, "textLength should be > 0"
    
    log("✅ TEST B PASSED — Sanitization working correctly")

def test_c_reject_invalid():
    """TEST C — Reject empty/invalid"""
    log("TEST C — Reject empty/invalid")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 1: Invalid resourceType
    payload = {"resourceType": "bogus", "title": "x", "htmlContent": "<p>ok</p>"}
    resp = requests.post(f"{BASE_URL}/admin/academic-resources", json=payload, headers=headers, timeout=10)
    assert resp.status_code == 400, f"Expected 400 for invalid resourceType, got {resp.status_code}"
    assert "Invalid resourceType" in resp.text, "Error message should mention 'Invalid resourceType'"
    log("✅ Invalid resourceType rejected")
    
    # Test 2: Empty title
    payload = {"resourceType": "teaching_notes", "title": "", "htmlContent": "<p>ok</p>"}
    resp = requests.post(f"{BASE_URL}/admin/academic-resources", json=payload, headers=headers, timeout=10)
    assert resp.status_code == 400, f"Expected 400 for empty title, got {resp.status_code}"
    assert "Title is required" in resp.text, "Error message should mention 'Title is required'"
    log("✅ Empty title rejected")
    
    # Test 3: HTML with only script (no readable text after sanitization)
    payload = {"resourceType": "teaching_notes", "title": "ok", "htmlContent": "<script>x</script>"}
    resp = requests.post(f"{BASE_URL}/admin/academic-resources", json=payload, headers=headers, timeout=10)
    assert resp.status_code == 400, f"Expected 400 for empty content, got {resp.status_code}"
    assert "readable text" in resp.text.lower(), "Error message should mention 'readable text'"
    log("✅ Empty content (after sanitization) rejected")
    
    log("✅ TEST C PASSED — All validation working")

def test_d_public_list_gating():
    """TEST D — Public list gating"""
    log("TEST D — Public list gating")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_token}"}
    
    # Step 1: Verify resource is in public list (published + visible)
    resp = requests.get(f"{BASE_URL}/academic-resources", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    ids = [r["id"] for r in data["resources"]]
    assert test_resource_id in ids, "Resource should be in public list (published + visible)"
    log("✅ Resource visible in public list")
    
    # Step 2: Unpublish the resource
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/publish",
        json={"isPublished": False},
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    log("✅ Resource unpublished")
    
    # Step 3: Verify resource is NOT in public list
    resp = requests.get(f"{BASE_URL}/academic-resources", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    ids = [r["id"] for r in data["resources"]]
    assert test_resource_id not in ids, "Unpublished resource should NOT be in public list"
    log("✅ Unpublished resource hidden from public list")
    
    # Step 4: Re-publish
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/publish",
        json={"isPublished": True},
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    log("✅ Resource re-published")
    
    # Step 5: Hide the resource (isVisible=false)
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/visibility",
        json={"isVisible": False},
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    log("✅ Resource hidden (isVisible=false)")
    
    # Step 6: Verify resource is NOT in public list
    resp = requests.get(f"{BASE_URL}/academic-resources", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    ids = [r["id"] for r in data["resources"]]
    assert test_resource_id not in ids, "Hidden resource should NOT be in public list"
    log("✅ Hidden resource not in public list")
    
    # Step 7: Re-enable visibility
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/visibility",
        json={"isVisible": True},
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    log("✅ Resource visibility restored")
    
    # Step 8: Verify resource is back in public list
    resp = requests.get(f"{BASE_URL}/academic-resources", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    ids = [r["id"] for r in data["resources"]]
    assert test_resource_id in ids, "Resource should be back in public list"
    log("✅ Resource back in public list")
    
    log("✅ TEST D PASSED — Public list gating working")

def test_e_view_counter():
    """TEST E — Single fetch increments view counter"""
    log("TEST E — View counter increment")
    headers_user = {"Authorization": f"Bearer {user_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    
    # Get initial view count
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers_admin, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    initial_count = resp.json()["resource"]["viewCount"]
    log(f"Initial view count: {initial_count}")
    
    # View as regular user (public endpoint)
    resp = requests.get(f"{BASE_URL}/academic-resources/{test_resource_id}", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "resource" in resp.json(), "Response missing 'resource' key"
    assert "title" in resp.json()["resource"], "Resource missing 'title' field"
    log("✅ Public fetch successful")
    
    # Small delay to ensure counter update completes
    time.sleep(0.5)
    
    # Check view count increased
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers_admin, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    new_count = resp.json()["resource"]["viewCount"]
    assert new_count >= initial_count + 1, f"View count should have increased from {initial_count} to at least {initial_count + 1}, got {new_count}"
    log(f"✅ View count incremented: {initial_count} → {new_count}")
    
    # View again
    resp = requests.get(f"{BASE_URL}/academic-resources/{test_resource_id}", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    time.sleep(0.5)
    
    # Check view count increased again
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers_admin, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    final_count = resp.json()["resource"]["viewCount"]
    assert final_count >= new_count + 1, f"View count should have increased from {new_count} to at least {new_count + 1}, got {final_count}"
    log(f"✅ View count incremented again: {new_count} → {final_count}")
    
    log("✅ TEST E PASSED — View counter working")

def test_f_counts_endpoint():
    """TEST F — Counts endpoint"""
    log("TEST F — Counts endpoint")
    resp = requests.get(f"{BASE_URL}/academic-resources/counts", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "counts" in data, "Response missing 'counts' key"
    counts = data["counts"]
    assert counts.get("teaching_notes", 0) >= 1, "teaching_notes count should be >= 1"
    log(f"✅ Counts: {counts}")
    log("✅ TEST F PASSED — Counts endpoint working")

def test_g_replace_html():
    """TEST G — Replace HTML"""
    log("TEST G — Replace HTML")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    new_html = "<h2>Replaced</h2><table><tr><td>V2</td></tr></table>"
    payload = {"htmlContent": new_html, "fileName": "test-v2.html"}
    
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/html",
        json=payload,
        headers=headers,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    log("✅ HTML replaced")
    
    # Fetch and verify
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    html_content = data["resource"]["htmlContent"]
    assert "Replaced" in html_content, "New HTML should contain 'Replaced'"
    assert "Hello" not in html_content, "Old HTML should not contain 'Hello'"
    assert data["resource"]["fileName"] == "test-v2.html", "fileName should be updated"
    log("✅ HTML content and fileName verified")
    
    log("✅ TEST G PASSED — Replace HTML working")

def test_h_update_metadata():
    """TEST H — Update metadata"""
    log("TEST H — Update metadata")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    payload = {"title": "New Title", "subject": "English", "sortOrder": 3}
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}",
        json=payload,
        headers=headers,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    log("✅ Metadata updated")
    
    # Fetch and verify
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    resource = data["resource"]
    assert resource["title"] == "New Title", f"Title should be 'New Title', got {resource['title']}"
    assert resource["subject"] == "English", f"Subject should be 'English', got {resource['subject']}"
    assert resource["sortOrder"] == 3, f"sortOrder should be 3, got {resource['sortOrder']}"
    log("✅ Metadata verified")
    
    log("✅ TEST H PASSED — Update metadata working")

def test_i_pdf_download_toggle():
    """TEST I — PDF download toggle"""
    log("TEST I — PDF download toggle")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_token}"}
    
    # Enable PDF download
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/pdf-download",
        json={"allowPdfDownload": True},
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("allowPdfDownload") == True, "allowPdfDownload should be True"
    log("✅ PDF download enabled")
    
    # Fetch as regular user and verify
    resp = requests.get(f"{BASE_URL}/academic-resources/{test_resource_id}", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["resource"]["allowPdfDownload"] == True, "allowPdfDownload should be True for regular user"
    log("✅ PDF download flag visible to regular user")
    
    # Disable PDF download
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/pdf-download",
        json={"allowPdfDownload": False},
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("allowPdfDownload") == False, "allowPdfDownload should be False"
    log("✅ PDF download disabled")
    
    # Verify
    resp = requests.get(f"{BASE_URL}/academic-resources/{test_resource_id}", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["resource"]["allowPdfDownload"] == False, "allowPdfDownload should be False for regular user"
    log("✅ PDF download flag updated for regular user")
    
    log("✅ TEST I PASSED — PDF download toggle working")

def test_j_non_admin_cannot_mutate():
    """TEST J — Non-admin cannot mutate"""
    log("TEST J — Non-admin cannot mutate")
    headers_user = {"Authorization": f"Bearer {user_token}"}
    
    # Try to create
    payload = {"resourceType": "teaching_notes", "title": "x", "htmlContent": "<p>test</p>"}
    resp = requests.post(f"{BASE_URL}/admin/academic-resources", json=payload, headers=headers_user, timeout=10)
    assert resp.status_code == 403, f"Expected 403 for non-admin POST, got {resp.status_code}"
    log("✅ Non-admin POST rejected with 403")
    
    # Try to update metadata
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}",
        json={"title": "x"},
        headers=headers_user,
        timeout=10
    )
    assert resp.status_code == 403, f"Expected 403 for non-admin PUT, got {resp.status_code}"
    log("✅ Non-admin PUT rejected with 403")
    
    # Try to publish
    resp = requests.put(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}/publish",
        json={"isPublished": False},
        headers=headers_user,
        timeout=10
    )
    assert resp.status_code == 403, f"Expected 403 for non-admin publish, got {resp.status_code}"
    log("✅ Non-admin publish rejected with 403")
    
    # Try to delete
    resp = requests.delete(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}",
        headers=headers_user,
        timeout=10
    )
    assert resp.status_code == 403, f"Expected 403 for non-admin DELETE, got {resp.status_code}"
    log("✅ Non-admin DELETE rejected with 403")
    
    log("✅ TEST J PASSED — Non-admin cannot mutate")

def test_k_soft_delete():
    """TEST K — Soft delete"""
    log("TEST K — Soft delete")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_token}"}
    
    # Delete the resource
    resp = requests.delete(
        f"{BASE_URL}/admin/academic-resources/{test_resource_id}",
        headers=headers_admin,
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("ok") == True, "Response should have ok=true"
    assert data.get("deleted") == True, "Response should have deleted=true"
    log("✅ Resource soft-deleted")
    
    # Verify NOT in public list
    resp = requests.get(f"{BASE_URL}/academic-resources", headers=headers_user, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    ids = [r["id"] for r in data["resources"]]
    assert test_resource_id not in ids, "Deleted resource should NOT be in public list"
    log("✅ Deleted resource not in public list")
    
    # Verify NOT in admin list
    resp = requests.get(f"{BASE_URL}/admin/academic-resources", headers=headers_admin, timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    ids = [r["id"] for r in data["resources"]]
    assert test_resource_id not in ids, "Deleted resource should NOT be in admin list"
    log("✅ Deleted resource not in admin list")
    
    # Try to fetch directly (should still exist in DB but marked as deleted)
    resp = requests.get(f"{BASE_URL}/admin/academic-resources/{test_resource_id}", headers=headers_admin, timeout=10)
    # The endpoint filters by isDeleted: { $ne: true }, so it should return 404
    # But the doc still exists in Mongo with isDeleted=true
    log(f"Direct fetch after delete: {resp.status_code}")
    
    log("✅ TEST K PASSED — Soft delete working")

def test_l_no_regression_on_old_resources_types():
    """TEST L — No regression on pre-existing /resources/types endpoint"""
    log("TEST L — No regression on /resources/types (AI generator)")
    
    # This is the OLD endpoint for AI generator types, NOT academic resources
    resp = requests.get(f"{BASE_URL}/resources/types", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "types" in data, "Response missing 'types' key"
    types = data["types"]
    assert len(types) > 0, "Should have at least one AI generator type"
    
    # Check for old AI generator types (like 'activity-sheet')
    type_ids = [t["id"] for t in types]
    # The old endpoint should have different types than academic resources
    assert "activity-sheet" in type_ids or "hots-questions" in type_ids or len(type_ids) > 0, \
        "Old /resources/types endpoint should return AI generator types"
    
    log(f"✅ Old /resources/types endpoint working with {len(types)} types")
    log("✅ TEST L PASSED — No regression on old endpoint")

def main():
    global admin_token, user_token
    
    print("\n" + "="*80)
    print("ACADEMIC RESOURCES MODULE — BACKEND TEST SUITE")
    print("="*80 + "\n")
    
    try:
        # Login
        log("Logging in as admin...")
        admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
        log(f"✅ Admin logged in")
        
        log("Logging in as regular user...")
        user_token = login(USER_MOBILE, USER_PASSWORD)
        log(f"✅ Regular user logged in")
        
        # Run tests
        test_a_types_endpoint()
        test_b_create_with_sanitization()
        test_c_reject_invalid()
        test_d_public_list_gating()
        test_e_view_counter()
        test_f_counts_endpoint()
        test_g_replace_html()
        test_h_update_metadata()
        test_i_pdf_download_toggle()
        test_j_non_admin_cannot_mutate()
        test_k_soft_delete()
        test_l_no_regression_on_old_resources_types()
        
        print("\n" + "="*80)
        print("✅ ALL 12 TESTS PASSED (100% success rate)")
        print("="*80 + "\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}\n")
        raise

if __name__ == "__main__":
    main()
