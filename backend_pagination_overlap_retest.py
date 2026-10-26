#!/usr/bin/env python3
"""
Pagination Overlap Retest for GET /api/admin/panchapadi-lessons

Tests the fix: .sort({ classOrder: 1, bookLabel: 1, chapterOrder: 1, period: 1, id: 1 })

5 Checks:
1. GET limit=10&offset=0 → collect ids into set A
2. GET limit=10&offset=10 → collect ids into set B
3. Assert A ∩ B is empty (no overlap)
4. GET limit=10&offset=20 → set C, assert C is disjoint from A and B
5. Full-scan GET limit=500&offset=0 → assert total unique ids == response.total
"""

import requests
import os
import sys

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

def test_pagination_overlap():
    print("=" * 80)
    print("PAGINATION OVERLAP RETEST - GET /api/admin/panchapadi-lessons")
    print("=" * 80)
    
    # Login as admin
    print("\n[Test 1] Admin Login")
    try:
        login_resp = requests.post(
            f"{API_BASE}/auth/login",
            json={"mobile": "9999999999", "password": "admin123"},
            timeout=30
        )
        if login_resp.status_code != 200:
            print(f"❌ FAIL: Login failed with status {login_resp.status_code}")
            print(f"Response: {login_resp.text}")
            return False
        
        token = login_resp.json().get('token')
        if not token:
            print("❌ FAIL: No token in login response")
            return False
        
        print(f"✅ PASS: Admin login successful, token received")
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        print(f"❌ FAIL: Login exception: {e}")
        return False
    
    # Check 1: GET limit=10&offset=0 → collect ids into set A
    print("\n[Check 1] GET /api/admin/panchapadi-lessons?limit=10&offset=0")
    try:
        resp_a = requests.get(
            f"{API_BASE}/admin/panchapadi-lessons?limit=10&offset=0",
            headers=headers,
            timeout=30
        )
        if resp_a.status_code != 200:
            print(f"❌ FAIL: Request failed with status {resp_a.status_code}")
            print(f"Response: {resp_a.text}")
            return False
        
        data_a = resp_a.json()
        items_a = data_a.get('items', [])
        total = data_a.get('total', 0)
        set_a = set(item['id'] for item in items_a)
        
        print(f"✅ PASS: Retrieved {len(items_a)} items, total={total}")
        print(f"   Set A size: {len(set_a)}")
        print(f"   First 3 IDs: {list(set_a)[:3]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Check 2: GET limit=10&offset=10 → collect ids into set B
    print("\n[Check 2] GET /api/admin/panchapadi-lessons?limit=10&offset=10")
    try:
        resp_b = requests.get(
            f"{API_BASE}/admin/panchapadi-lessons?limit=10&offset=10",
            headers=headers,
            timeout=30
        )
        if resp_b.status_code != 200:
            print(f"❌ FAIL: Request failed with status {resp_b.status_code}")
            print(f"Response: {resp_b.text}")
            return False
        
        data_b = resp_b.json()
        items_b = data_b.get('items', [])
        set_b = set(item['id'] for item in items_b)
        
        print(f"✅ PASS: Retrieved {len(items_b)} items")
        print(f"   Set B size: {len(set_b)}")
        print(f"   First 3 IDs: {list(set_b)[:3]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Check 3: Assert A ∩ B is empty (no overlap)
    print("\n[Check 3] Assert A ∩ B is empty (no overlap)")
    try:
        overlap_ab = set_a & set_b
        if overlap_ab:
            print(f"❌ FAIL: Found {len(overlap_ab)} overlapping IDs between page 1 and page 2")
            print(f"   Overlapping IDs: {overlap_ab}")
            return False
        else:
            print(f"✅ PASS: No overlap between page 1 (offset=0) and page 2 (offset=10)")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Check 4: GET limit=10&offset=20 → set C, assert C is disjoint from A and B
    print("\n[Check 4] GET /api/admin/panchapadi-lessons?limit=10&offset=20")
    try:
        resp_c = requests.get(
            f"{API_BASE}/admin/panchapadi-lessons?limit=10&offset=20",
            headers=headers,
            timeout=30
        )
        if resp_c.status_code != 200:
            print(f"❌ FAIL: Request failed with status {resp_c.status_code}")
            print(f"Response: {resp_c.text}")
            return False
        
        data_c = resp_c.json()
        items_c = data_c.get('items', [])
        set_c = set(item['id'] for item in items_c)
        
        print(f"✅ PASS: Retrieved {len(items_c)} items")
        print(f"   Set C size: {len(set_c)}")
        print(f"   First 3 IDs: {list(set_c)[:3]}")
        
        # Assert C is disjoint from A and B
        overlap_ac = set_a & set_c
        overlap_bc = set_b & set_c
        
        if overlap_ac:
            print(f"❌ FAIL: Found {len(overlap_ac)} overlapping IDs between page 1 and page 3")
            print(f"   Overlapping IDs: {overlap_ac}")
            return False
        
        if overlap_bc:
            print(f"❌ FAIL: Found {len(overlap_bc)} overlapping IDs between page 2 and page 3")
            print(f"   Overlapping IDs: {overlap_bc}")
            return False
        
        print(f"✅ PASS: Page 3 (offset=20) is disjoint from page 1 and page 2")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Check 5: Full-scan GET limit=500&offset=0 → assert total unique ids == response.total
    print("\n[Check 5] Full-scan GET /api/admin/panchapadi-lessons?limit=500&offset=0")
    try:
        resp_full = requests.get(
            f"{API_BASE}/admin/panchapadi-lessons?limit=500&offset=0",
            headers=headers,
            timeout=30
        )
        if resp_full.status_code != 200:
            print(f"❌ FAIL: Request failed with status {resp_full.status_code}")
            print(f"Response: {resp_full.text}")
            return False
        
        data_full = resp_full.json()
        items_full = data_full.get('items', [])
        total_reported = data_full.get('total', 0)
        
        # Collect all unique IDs
        all_ids = set(item['id'] for item in items_full)
        unique_count = len(all_ids)
        
        print(f"   Retrieved {len(items_full)} items")
        print(f"   Reported total: {total_reported}")
        print(f"   Unique IDs: {unique_count}")
        
        if unique_count != total_reported:
            print(f"❌ FAIL: Unique ID count ({unique_count}) does not match reported total ({total_reported})")
            print(f"   This indicates duplicate IDs in the full scan")
            return False
        
        if len(items_full) != unique_count:
            print(f"❌ FAIL: Retrieved {len(items_full)} items but only {unique_count} unique IDs")
            print(f"   This indicates duplicate IDs in the response")
            return False
        
        print(f"✅ PASS: Full-scan unique ID count ({unique_count}) matches reported total ({total_reported})")
        print(f"✅ PASS: No duplicate IDs in full scan")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    print("\n" + "=" * 80)
    print("✅ ALL 5 PAGINATION OVERLAP CHECKS PASSED")
    print("=" * 80)
    print("\nSUMMARY:")
    print("  ✅ Check 1: Page 1 (offset=0) retrieved successfully")
    print("  ✅ Check 2: Page 2 (offset=10) retrieved successfully")
    print("  ✅ Check 3: No overlap between page 1 and page 2")
    print("  ✅ Check 4: Page 3 (offset=20) is disjoint from page 1 and page 2")
    print("  ✅ Check 5: Full-scan unique ID count matches reported total")
    print("\n🎯 PAGINATION FIX VERIFIED: id: 1 tie-breaker is working correctly")
    return True

if __name__ == '__main__':
    try:
        success = test_pagination_overlap()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
