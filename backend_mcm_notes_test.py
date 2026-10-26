#!/usr/bin/env python3
"""
MCM Notes Backend Test Suite
Tests all public + admin CRUD endpoints for MCM Notes feature.
Admin credentials: 9692604577 / <redacted>
IMPORTANT: Single-device login - token rotates on every login, so log in ONCE and reuse token.
"""

import requests
import json
import sys

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Global token (login once, reuse for entire run)
admin_token = None
created_note_id = None
created_note_key = None

def print_test(num, desc):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST {num}: {desc}")
    print('='*80)

def print_result(passed, message):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")
    return passed

def admin_login():
    """Login as admin and get token (ONCE for entire run)"""
    global admin_token
    print_test("SETUP", "Admin Login (Single-device login - token rotates)")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get("token")
            if admin_token:
                print_result(True, f"Admin login successful. Token obtained (length: {len(admin_token)})")
                print("⚠️  IMPORTANT: This token will be reused for ALL tests (single-device login)")
                return True
            else:
                print_result(False, "No token in response")
                return False
        else:
            print_result(False, f"Login failed: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Login exception: {str(e)}")
        return False

def test_1_public_list():
    """TEST 1: GET /api/mcm-notes → returns { notes: [...] } with seed notes"""
    print_test(1, "GET /api/mcm-notes (public list)")
    try:
        response = requests.get(f"{BASE_URL}/mcm-notes", timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            return print_result(False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        if "notes" not in data:
            return print_result(False, "Response missing 'notes' field")
        
        notes = data["notes"]
        if not isinstance(notes, list):
            return print_result(False, "'notes' is not a list")
        
        # Check for seed notes
        keys = [n.get("key") for n in notes]
        has_aug = "aug-2026" in keys
        has_july = "july-2026" in keys
        
        if not has_aug or not has_july:
            return print_result(False, f"Missing seed notes. Found keys: {keys}")
        
        # Check sorting (order desc)
        orders = [n.get("order", 0) for n in notes]
        is_sorted = all(orders[i] >= orders[i+1] for i in range(len(orders)-1))
        
        if not is_sorted:
            return print_result(False, f"Notes not sorted by order desc. Orders: {orders}")
        
        # Check viewCount field exists
        has_view_count = all("viewCount" in n for n in notes)
        if not has_view_count:
            return print_result(False, "Some notes missing viewCount field")
        
        print(f"Found {len(notes)} notes")
        print(f"Keys: {keys}")
        print(f"Orders: {orders}")
        return print_result(True, f"Public list OK: {len(notes)} notes, includes aug-2026 & july-2026, sorted by order desc, all have viewCount")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_2_public_get_seed():
    """TEST 2: GET /api/mcm-notes/july-2026 → returns { note, html } with full HTML"""
    print_test(2, "GET /api/mcm-notes/july-2026 (seed note)")
    try:
        response = requests.get(f"{BASE_URL}/mcm-notes/july-2026", timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            return print_result(False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        if "note" not in data or "html" not in data:
            return print_result(False, "Response missing 'note' or 'html' field")
        
        html = data["html"]
        if not html:
            return print_result(False, "HTML is empty")
        
        # Check if it's a full HTML document
        html_lower = html.lower()
        is_full_html = "<html" in html_lower or "<!doctype" in html_lower
        
        if not is_full_html:
            return print_result(False, f"HTML is not a full document (no <html or <!doctype). First 200 chars: {html[:200]}")
        
        print(f"HTML length: {len(html)} chars")
        print(f"HTML starts with: {html[:100]}")
        return print_result(True, f"Seed note OK: full HTML document ({len(html)} chars)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_3_public_get_nonexistent():
    """TEST 3: GET /api/mcm-notes/nonexistent-key → 404"""
    print_test(3, "GET /api/mcm-notes/nonexistent-key (should 404)")
    try:
        response = requests.get(f"{BASE_URL}/mcm-notes/nonexistent-key-12345", timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 404:
            return print_result(True, "Correctly returned 404 for nonexistent key")
        else:
            return print_result(False, f"Expected 404, got {response.status_code}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_4_view_counter():
    """TEST 4: POST /api/mcm-notes/july-2026/view → increment viewCount"""
    print_test(4, "POST /api/mcm-notes/july-2026/view (increment counter)")
    try:
        # Get initial viewCount
        response1 = requests.get(f"{BASE_URL}/mcm-notes", timeout=30)
        if response1.status_code != 200:
            return print_result(False, f"Failed to get initial list: {response1.status_code}")
        
        notes1 = response1.json()["notes"]
        july_note1 = next((n for n in notes1 if n.get("key") == "july-2026"), None)
        if not july_note1:
            return print_result(False, "july-2026 not found in list")
        
        initial_count = july_note1.get("viewCount", 0)
        print(f"Initial viewCount: {initial_count}")
        
        # Increment view
        response2 = requests.post(f"{BASE_URL}/mcm-notes/july-2026/view", timeout=30)
        print(f"View increment status: {response2.status_code}")
        
        if response2.status_code != 200:
            return print_result(False, f"View increment failed: {response2.status_code}")
        
        data2 = response2.json()
        if not data2.get("ok"):
            return print_result(False, "View increment response missing 'ok: true'")
        
        # Get updated viewCount
        response3 = requests.get(f"{BASE_URL}/mcm-notes", timeout=30)
        if response3.status_code != 200:
            return print_result(False, f"Failed to get updated list: {response3.status_code}")
        
        notes3 = response3.json()["notes"]
        july_note3 = next((n for n in notes3 if n.get("key") == "july-2026"), None)
        if not july_note3:
            return print_result(False, "july-2026 not found in updated list")
        
        updated_count = july_note3.get("viewCount", 0)
        print(f"Updated viewCount: {updated_count}")
        
        if updated_count > initial_count:
            return print_result(True, f"View counter incremented: {initial_count} → {updated_count}")
        else:
            return print_result(False, f"View counter did not increment: {initial_count} → {updated_count}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_5_admin_list():
    """TEST 5: GET /api/admin/mcm-notes (with admin token) → includes seed & DB notes"""
    print_test(5, "GET /api/admin/mcm-notes (admin list)")
    try:
        if not admin_token:
            return print_result(False, "No admin token available")
        
        response = requests.get(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            return print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
        
        data = response.json()
        if "notes" not in data:
            return print_result(False, "Response missing 'notes' field")
        
        notes = data["notes"]
        
        # Check for seed notes with correct markers
        seed_notes = [n for n in notes if n.get("source") == "seed"]
        db_notes = [n for n in notes if n.get("source") == "db"]
        
        print(f"Total notes: {len(notes)}")
        print(f"Seed notes: {len(seed_notes)}")
        print(f"DB notes: {len(db_notes)}")
        
        # Verify seed notes have readOnly:true
        seed_readonly = all(n.get("readOnly") == True for n in seed_notes)
        if not seed_readonly:
            return print_result(False, "Some seed notes missing readOnly:true")
        
        # Check for july-2026 and aug-2026 seed notes
        seed_keys = [n.get("key") for n in seed_notes]
        has_july = "july-2026" in seed_keys
        has_aug = "aug-2026" in seed_keys
        
        if not has_july or not has_aug:
            return print_result(False, f"Missing seed notes. Seed keys: {seed_keys}")
        
        return print_result(True, f"Admin list OK: {len(notes)} total ({len(seed_notes)} seed with readOnly:true, {len(db_notes)} DB)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_6_admin_create():
    """TEST 6: POST /api/admin/mcm-notes → create new note"""
    global created_note_id, created_note_key
    print_test(6, "POST /api/admin/mcm-notes (create new note)")
    try:
        if not admin_token:
            return print_result(False, "No admin token available")
        
        payload = {
            "monthEn": "September 2026",
            "monthLabel": "ସେପ୍ଟେମ୍ବର ୨୦୨୬",
            "year": "2026",
            "order": 202609,
            "title": "QA MCM Sept",
            "subtitle": "s",
            "tagline": "A · B",
            "gradient": "from-emerald-500 via-teal-600 to-cyan-700",
            "accent": "#0f766e",
            "badge": "MCM",
            "html": "<html><body><h1>QA</h1></body></html>",
            "published": True
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
            timeout=30
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code not in [200, 201]:
            return print_result(False, f"Expected 200/201, got {response.status_code}: {response.text}")
        
        data = response.json()
        if "note" not in data:
            return print_result(False, "Response missing 'note' field")
        
        note = data["note"]
        created_note_id = note.get("id")
        created_note_key = note.get("key")
        
        if not created_note_id:
            return print_result(False, "Created note missing 'id'")
        
        if created_note_key != "september-2026":
            return print_result(False, f"Expected key 'september-2026', got '{created_note_key}'")
        
        print(f"Created note ID: {created_note_id}")
        print(f"Created note key: {created_note_key}")
        return print_result(True, f"Note created: id={created_note_id}, key={created_note_key}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_7_verify_created():
    """TEST 7: Verify created note appears in public list at top and is retrievable"""
    print_test(7, "Verify created note in public list & retrievable")
    try:
        # Check public list
        response1 = requests.get(f"{BASE_URL}/mcm-notes", timeout=30)
        if response1.status_code != 200:
            return print_result(False, f"Failed to get public list: {response1.status_code}")
        
        notes = response1.json()["notes"]
        keys = [n.get("key") for n in notes]
        
        if "september-2026" not in keys:
            return print_result(False, f"september-2026 not in public list. Keys: {keys}")
        
        # Check if it's at top (highest order)
        sept_note = next((n for n in notes if n.get("key") == "september-2026"), None)
        if not sept_note:
            return print_result(False, "september-2026 not found")
        
        sept_order = sept_note.get("order", 0)
        is_at_top = notes[0].get("key") == "september-2026"
        
        print(f"september-2026 order: {sept_order}")
        print(f"Is at top: {is_at_top}")
        print(f"Top 3 keys: {[n.get('key') for n in notes[:3]]}")
        
        if not is_at_top:
            print("⚠️  Note: september-2026 not at top (order 202609 may not be highest)")
        
        # Get individual note
        response2 = requests.get(f"{BASE_URL}/mcm-notes/september-2026", timeout=30)
        if response2.status_code != 200:
            return print_result(False, f"Failed to get individual note: {response2.status_code}")
        
        data2 = response2.json()
        if "html" not in data2:
            return print_result(False, "Individual note missing 'html'")
        
        html = data2["html"]
        if "<h1>QA</h1>" not in html:
            return print_result(False, f"HTML doesn't match expected content: {html}")
        
        return print_result(True, f"Created note verified: in public list (order {sept_order}), retrievable with correct HTML")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_8_duplicate_key():
    """TEST 8: POST /api/admin/mcm-notes with same monthEn → 409"""
    print_test(8, "POST /api/admin/mcm-notes (duplicate key → 409)")
    try:
        if not admin_token:
            return print_result(False, "No admin token available")
        
        payload = {
            "monthEn": "September 2026",  # Same as test 6
            "title": "Another Sept Note",
            "html": "<html><body><h1>Duplicate</h1></body></html>",
            "published": True
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
            timeout=30
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 409:
            return print_result(True, "Correctly returned 409 for duplicate key")
        else:
            return print_result(False, f"Expected 409, got {response.status_code}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_9_missing_fields():
    """TEST 9: POST /api/admin/mcm-notes missing title or html → 400"""
    print_test(9, "POST /api/admin/mcm-notes (missing required fields → 400)")
    try:
        if not admin_token:
            return print_result(False, "No admin token available")
        
        # Test missing title
        payload1 = {
            "monthEn": "October 2026",
            "html": "<html><body><h1>Test</h1></body></html>",
            "published": True
        }
        
        response1 = requests.post(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload1,
            timeout=30
        )
        print(f"Missing title - Status: {response1.status_code}")
        
        if response1.status_code != 400:
            return print_result(False, f"Missing title: Expected 400, got {response1.status_code}")
        
        # Test missing html
        payload2 = {
            "monthEn": "October 2026",
            "title": "Test Title",
            "published": True
        }
        
        response2 = requests.post(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload2,
            timeout=30
        )
        print(f"Missing html - Status: {response2.status_code}")
        
        if response2.status_code != 400:
            return print_result(False, f"Missing html: Expected 400, got {response2.status_code}")
        
        return print_result(True, "Correctly returned 400 for missing title and missing html")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_10_admin_get_by_id():
    """TEST 10: GET /api/admin/mcm-notes/<id> → full doc incl html"""
    print_test(10, "GET /api/admin/mcm-notes/<id> (get by ID)")
    try:
        if not admin_token or not created_note_id:
            return print_result(False, "No admin token or created note ID")
        
        response = requests.get(
            f"{BASE_URL}/admin/mcm-notes/{created_note_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            return print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
        
        data = response.json()
        if "note" not in data:
            return print_result(False, "Response missing 'note' field")
        
        note = data["note"]
        if "html" not in note:
            return print_result(False, "Note missing 'html' field")
        
        if note.get("id") != created_note_id:
            return print_result(False, f"ID mismatch: expected {created_note_id}, got {note.get('id')}")
        
        html = note["html"]
        if "<h1>QA</h1>" not in html:
            return print_result(False, f"HTML doesn't match: {html}")
        
        return print_result(True, f"Get by ID OK: full doc with html ({len(html)} chars)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_11_update_unpublish():
    """TEST 11: PUT /api/admin/mcm-notes/<id> → update & unpublish"""
    print_test(11, "PUT /api/admin/mcm-notes/<id> (update & unpublish)")
    try:
        if not admin_token or not created_note_id:
            return print_result(False, "No admin token or created note ID")
        
        # Update note
        payload = {
            "title": "QA MCM Sept EDITED",
            "published": False
        }
        
        response1 = requests.put(
            f"{BASE_URL}/admin/mcm-notes/{created_note_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
            timeout=30
        )
        print(f"Update status: {response1.status_code}")
        
        if response1.status_code != 200:
            return print_result(False, f"Update failed: {response1.status_code}: {response1.text}")
        
        data1 = response1.json()
        note = data1.get("note", {})
        if note.get("title") != "QA MCM Sept EDITED":
            return print_result(False, f"Title not updated: {note.get('title')}")
        
        if note.get("published") != False:
            return print_result(False, f"Published not set to false: {note.get('published')}")
        
        print("✓ Note updated and unpublished")
        
        # Check public list (should NOT include unpublished note)
        response2 = requests.get(f"{BASE_URL}/mcm-notes", timeout=30)
        if response2.status_code != 200:
            return print_result(False, f"Failed to get public list: {response2.status_code}")
        
        public_notes = response2.json()["notes"]
        public_keys = [n.get("key") for n in public_notes]
        
        if "september-2026" in public_keys:
            return print_result(False, "Unpublished note still in public list")
        
        print("✓ Unpublished note NOT in public list")
        
        # Check admin list (should still show as draft)
        response3 = requests.get(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if response3.status_code != 200:
            return print_result(False, f"Failed to get admin list: {response3.status_code}")
        
        admin_notes = response3.json()["notes"]
        sept_admin = next((n for n in admin_notes if n.get("key") == "september-2026"), None)
        
        if not sept_admin:
            return print_result(False, "Note not in admin list")
        
        if sept_admin.get("published") != False:
            return print_result(False, "Note still marked as published in admin list")
        
        print("✓ Unpublished note still in admin list as draft")
        
        return print_result(True, "Update & unpublish OK: title updated, not in public list, still in admin list as draft")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_12_update_seed():
    """TEST 12: PUT /api/admin/mcm-notes/seed:july-2026 → 400"""
    print_test(12, "PUT /api/admin/mcm-notes/seed:july-2026 (seed not editable → 400)")
    try:
        if not admin_token:
            return print_result(False, "No admin token available")
        
        payload = {"title": "Edited Seed"}
        
        response = requests.put(
            f"{BASE_URL}/admin/mcm-notes/seed:july-2026",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
            timeout=30
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 400:
            return print_result(True, "Correctly returned 400 for seed edit attempt")
        else:
            return print_result(False, f"Expected 400, got {response.status_code}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_13_delete_seed():
    """TEST 13: DELETE /api/admin/mcm-notes/seed:july-2026 → 400"""
    print_test(13, "DELETE /api/admin/mcm-notes/seed:july-2026 (seed not deletable → 400)")
    try:
        if not admin_token:
            return print_result(False, "No admin token available")
        
        response = requests.delete(
            f"{BASE_URL}/admin/mcm-notes/seed:july-2026",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 400:
            return print_result(True, "Correctly returned 400 for seed delete attempt")
        else:
            return print_result(False, f"Expected 400, got {response.status_code}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_14_delete_created():
    """TEST 14: DELETE /api/admin/mcm-notes/<id> → 200, verify gone"""
    print_test(14, "DELETE /api/admin/mcm-notes/<id> (cleanup)")
    try:
        if not admin_token or not created_note_id:
            return print_result(False, "No admin token or created note ID")
        
        # Delete note
        response1 = requests.delete(
            f"{BASE_URL}/admin/mcm-notes/{created_note_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        print(f"Delete status: {response1.status_code}")
        print(f"Response: {response1.text[:500]}")
        
        if response1.status_code != 200:
            return print_result(False, f"Delete failed: {response1.status_code}: {response1.text}")
        
        data1 = response1.json()
        if not data1.get("ok"):
            return print_result(False, "Delete response missing 'ok: true'")
        
        print("✓ Note deleted")
        
        # Verify gone from admin list
        response2 = requests.get(
            f"{BASE_URL}/admin/mcm-notes",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        if response2.status_code != 200:
            return print_result(False, f"Failed to get admin list: {response2.status_code}")
        
        admin_notes = response2.json()["notes"]
        admin_keys = [n.get("key") for n in admin_notes]
        
        if "september-2026" in admin_keys:
            return print_result(False, "Deleted note still in admin list")
        
        print("✓ Note gone from admin list")
        
        return print_result(True, "Delete OK: note deleted and gone from admin list")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_15_no_auth():
    """TEST 15: GET /api/admin/mcm-notes without auth → 403"""
    print_test(15, "GET /api/admin/mcm-notes (no auth → 403)")
    try:
        response = requests.get(f"{BASE_URL}/admin/mcm-notes", timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 403:
            return print_result(True, "Correctly returned 403 for no auth")
        else:
            return print_result(False, f"Expected 403, got {response.status_code}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("MCM NOTES BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print("="*80)
    
    results = []
    
    # Setup: Login once
    if not admin_login():
        print("\n❌ FATAL: Admin login failed. Cannot proceed with tests.")
        sys.exit(1)
    
    # PUBLIC TESTS
    results.append(("Test 1: Public list", test_1_public_list()))
    results.append(("Test 2: Public get seed", test_2_public_get_seed()))
    results.append(("Test 3: Public get nonexistent", test_3_public_get_nonexistent()))
    results.append(("Test 4: View counter", test_4_view_counter()))
    
    # ADMIN TESTS
    results.append(("Test 5: Admin list", test_5_admin_list()))
    results.append(("Test 6: Admin create", test_6_admin_create()))
    results.append(("Test 7: Verify created", test_7_verify_created()))
    results.append(("Test 8: Duplicate key", test_8_duplicate_key()))
    results.append(("Test 9: Missing fields", test_9_missing_fields()))
    results.append(("Test 10: Admin get by ID", test_10_admin_get_by_id()))
    results.append(("Test 11: Update & unpublish", test_11_update_unpublish()))
    results.append(("Test 12: Update seed", test_12_update_seed()))
    results.append(("Test 13: Delete seed", test_13_delete_seed()))
    results.append(("Test 14: Delete created", test_14_delete_created()))
    results.append(("Test 15: No auth", test_15_no_auth()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
