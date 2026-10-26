#!/usr/bin/env python3
"""
Backend test for NEW worksheet-library endpoints:
- GET /api/worksheets/mine (global library)
- GET /api/worksheets/:id (by id, owner check)

Admin: 9692604577 / <redacted>
"""

import requests
import json
import sys
from typing import Dict, Any

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def login(mobile: str, password: str) -> str:
    """Login and return JWT token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code != 200:
            print(f"❌ Login failed: {resp.status_code} {resp.text[:200]}")
            sys.exit(1)
        data = resp.json()
        token = data.get("token")
        if not token:
            print(f"❌ No token in login response: {data}")
            sys.exit(1)
        print(f"✅ Login successful (mobile={mobile})")
        return token
    except Exception as e:
        print(f"❌ Login exception: {e}")
        sys.exit(1)

def test_worksheets_mine_no_auth():
    """TEST 4: GET /api/worksheets/mine WITHOUT token → 401"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/worksheets/mine WITHOUT auth → 401")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/worksheets/mine", timeout=30)
        if resp.status_code == 401:
            print(f"✅ PASS: Correctly rejected with 401 (no auth)")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_worksheets_mine(token: str) -> Dict[str, Any]:
    """TEST 1: GET /api/worksheets/mine → 200 { ok:true, items:[...] }"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/worksheets/mine (admin token)")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/worksheets/mine", headers=headers, timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return {"success": False, "items": []}
        
        data = resp.json()
        
        # Check response structure
        if not data.get("ok"):
            print(f"❌ FAIL: Response missing 'ok:true': {data}")
            return {"success": False, "items": []}
        
        items = data.get("items", [])
        print(f"✅ PASS: Status 200, ok:true")
        print(f"✅ Total worksheets: {len(items)}")
        
        if len(items) == 0:
            print("⚠️  WARNING: No worksheets found (empty library). This is acceptable but limits further testing.")
            return {"success": True, "items": []}
        
        # Validate first item structure
        first = items[0]
        required_fields = ["id", "lessonId", "type", "format", "status"]
        missing = [f for f in required_fields if f not in first]
        
        if missing:
            print(f"❌ FAIL: First item missing required fields: {missing}")
            print(f"First item: {json.dumps(first, indent=2)}")
            return {"success": False, "items": items}
        
        print(f"✅ PASS: First item has all required fields: {required_fields}")
        print(f"   Sample: id={first['id'][:20]}..., lessonId={first.get('lessonId', 'N/A')[:20]}..., type={first.get('type')}, format={first.get('format')}, status={first.get('status')}")
        
        # Count by status
        status_counts = {}
        for item in items:
            status = item.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"✅ Status breakdown: {status_counts}")
        
        return {"success": True, "items": items}
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return {"success": False, "items": []}

def test_worksheet_by_id(token: str, worksheet_id: str, expected_status: int = 200) -> Dict[str, Any]:
    """TEST 2: GET /api/worksheets/:id → 200 { ok:true, worksheet:{...} }"""
    print("\n" + "="*80)
    print(f"TEST 2: GET /api/worksheets/{worksheet_id[:20]}... (expected {expected_status})")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/worksheets/{worksheet_id}", headers=headers, timeout=30)
        
        if resp.status_code != expected_status:
            print(f"❌ FAIL: Expected {expected_status}, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return {"success": False}
        
        if expected_status == 404:
            print(f"✅ PASS: Correctly returned 404 (not found / not owner)")
            return {"success": True}
        
        data = resp.json()
        
        # Check response structure
        if not data.get("ok"):
            print(f"❌ FAIL: Response missing 'ok:true': {data}")
            return {"success": False}
        
        worksheet = data.get("worksheet")
        if not worksheet:
            print(f"❌ FAIL: Response missing 'worksheet' object: {data}")
            return {"success": False}
        
        print(f"✅ PASS: Status 200, ok:true, worksheet object present")
        
        # Check for content (questions or sections)
        has_questions = "questions" in worksheet and isinstance(worksheet["questions"], list)
        has_sections = "sections" in worksheet and isinstance(worksheet["sections"], list)
        
        if has_questions:
            print(f"✅ PASS: Worksheet has 'questions' array (length: {len(worksheet['questions'])})")
        elif has_sections:
            print(f"✅ PASS: Worksheet has 'sections' array (length: {len(worksheet['sections'])})")
        else:
            print(f"⚠️  WARNING: Worksheet has neither 'questions' nor 'sections' array")
            print(f"   Worksheet keys: {list(worksheet.keys())}")
        
        # Show key fields
        print(f"   id: {worksheet.get('id', 'N/A')[:30]}...")
        print(f"   lessonId: {worksheet.get('lessonId', 'N/A')[:30]}...")
        print(f"   type: {worksheet.get('type', 'N/A')}")
        print(f"   format: {worksheet.get('format', 'N/A')}")
        print(f"   status: {worksheet.get('status', 'N/A')}")
        print(f"   title: {worksheet.get('title', 'N/A')[:50]}...")
        
        return {"success": True, "worksheet": worksheet}
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return {"success": False}

def test_worksheet_not_found(token: str):
    """TEST 3: GET /api/worksheets/{random-uuid} → 404"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/worksheets/{random-uuid} → 404")
    print("="*80)
    random_id = "00000000-0000-0000-0000-000000000000"
    result = test_worksheet_by_id(token, random_id, expected_status=404)
    return result["success"]

def main():
    print("="*80)
    print("BACKEND TEST: NEW Worksheet Library Endpoints")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: 9692604577 / <redacted>")
    
    # Login
    token = login("9692604577", "<redacted>")
    
    # TEST 4: No auth
    test4_pass = test_worksheets_mine_no_auth()
    
    # TEST 1: GET /api/worksheets/mine
    test1_result = test_worksheets_mine(token)
    test1_pass = test1_result["success"]
    items = test1_result["items"]
    
    # TEST 2: GET /api/worksheets/:id (using a ready worksheet from test 1)
    test2_pass = False
    if items:
        # Find a worksheet with status 'ready'
        ready_worksheets = [w for w in items if w.get("status") == "ready"]
        if ready_worksheets:
            ready_id = ready_worksheets[0]["id"]
            test2_result = test_worksheet_by_id(token, ready_id, expected_status=200)
            test2_pass = test2_result["success"]
        else:
            print("\n⚠️  WARNING: No 'ready' worksheets found. Using first worksheet regardless of status.")
            first_id = items[0]["id"]
            test2_result = test_worksheet_by_id(token, first_id, expected_status=200)
            test2_pass = test2_result["success"]
    else:
        print("\n⚠️  WARNING: No worksheets in library. Skipping TEST 2.")
        test2_pass = None  # Not applicable
    
    # TEST 3: GET /api/worksheets/{random-uuid} → 404
    test3_pass = test_worksheet_not_found(token)
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    results = [
        ("TEST 1: GET /api/worksheets/mine (with auth)", test1_pass),
        ("TEST 2: GET /api/worksheets/:id (ready worksheet)", test2_pass),
        ("TEST 3: GET /api/worksheets/{random-uuid} → 404", test3_pass),
        ("TEST 4: GET /api/worksheets/mine (no auth) → 401", test4_pass),
    ]
    
    for test_name, passed in results:
        if passed is None:
            status = "⚠️  SKIPPED (no data)"
        elif passed:
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
        print(f"{status}: {test_name}")
    
    # Overall result
    all_pass = all(p for p in [test1_pass, test2_pass, test3_pass, test4_pass] if p is not None)
    
    if all_pass:
        print("\n🎉 ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
