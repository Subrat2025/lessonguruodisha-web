#!/usr/bin/env python3
"""
Backend test for Assessment Store — Download History + Leak-Trace lookup
Tests:
1. GET /api/assess/my/downloads (teacher download history)
2. GET /api/admin/assess/trace?copy_id=XXXXXXXX (leak-trace lookup)
"""

import requests
import os
import sys

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

def login(mobile, password):
    """Login and return token"""
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('token')
        else:
            print(f"❌ Login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_my_downloads():
    """Test GET /api/assess/my/downloads"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/assess/my/downloads (teacher download history)")
    print("="*80)
    
    # Test 1a: Without auth → 401
    print("\n1a. Without Authorization header → expect 401")
    try:
        resp = requests.get(f"{API_BASE}/assess/my/downloads", timeout=10)
        if resp.status_code == 401:
            print(f"✅ PASS: Got 401 without auth")
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"Response: {resp.text}")
    except Exception as e:
        print(f"❌ FAIL: Request error: {e}")
    
    # Test 1b: As admin → 200 with downloads
    print("\n1b. As admin 9999999999/admin123 → expect 200 with downloads")
    admin_token = login("9999999999", "admin123")
    if not admin_token:
        print("❌ FAIL: Could not login as admin")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{API_BASE}/assess/my/downloads", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        
        # Check response structure
        if 'downloads' not in data:
            print(f"❌ FAIL: Response missing 'downloads' field")
            print(f"Response: {data}")
            return False
        
        if 'total' not in data:
            print(f"❌ FAIL: Response missing 'total' field")
            print(f"Response: {data}")
            return False
        
        downloads = data['downloads']
        total = data['total']
        
        print(f"✅ PASS: Got 200 with downloads array")
        print(f"   Total downloads: {total}")
        print(f"   Downloads count: {len(downloads)}")
        
        # Check fields in each download row
        if len(downloads) > 0:
            sample = downloads[0]
            required_fields = ['copy_id', 'document_title', 'at']
            missing_fields = [f for f in required_fields if f not in sample]
            
            if missing_fields:
                print(f"❌ FAIL: Sample download missing fields: {missing_fields}")
                print(f"Sample: {sample}")
                return False
            
            print(f"✅ PASS: Sample download has required fields: copy_id, document_title, at")
            print(f"   Sample download:")
            print(f"     copy_id: {sample.get('copy_id')}")
            print(f"     document_title: {sample.get('document_title')}")
            print(f"     at: {sample.get('at')}")
            if 'pack_code' in sample:
                print(f"     pack_code: {sample.get('pack_code')}")
            if 'via' in sample:
                print(f"     via: {sample.get('via')}")
        else:
            print(f"   No downloads found (empty array is valid)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Request error: {e}")
        return False

def test_admin_trace():
    """Test GET /api/admin/assess/trace?copy_id=XXXXXXXX"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/admin/assess/trace?copy_id=XXXXXXXX (leak-trace lookup)")
    print("="*80)
    
    admin_token = login("9999999999", "admin123")
    if not admin_token:
        print("❌ FAIL: Could not login as admin")
        return False
    
    # Test 2a: As admin with copy_id=A754EF99 → 200 found=true, buyer.mobile="9999999999"
    print("\n2a. As admin with ?copy_id=A754EF99 → expect 200 found=true, buyer.mobile='9999999999'")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{API_BASE}/admin/assess/trace?copy_id=A754EF99", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        
        # Check response structure
        if 'found' not in data:
            print(f"❌ FAIL: Response missing 'found' field")
            print(f"Response: {data}")
            return False
        
        if not data['found']:
            print(f"❌ FAIL: Expected found=true, got found=false")
            print(f"Response: {data}")
            return False
        
        print(f"✅ PASS: Got 200 with found=true")
        
        # Check buyer object
        if 'buyer' not in data or not data['buyer']:
            print(f"❌ FAIL: Response missing 'buyer' object")
            print(f"Response: {data}")
            return False
        
        buyer = data['buyer']
        if buyer.get('mobile') != '9999999999':
            print(f"❌ FAIL: Expected buyer.mobile='9999999999', got '{buyer.get('mobile')}'")
            print(f"Buyer: {buyer}")
            return False
        
        print(f"✅ PASS: buyer.mobile === '9999999999'")
        print(f"   Buyer object:")
        print(f"     id: {buyer.get('id')}")
        print(f"     name: {buyer.get('name')}")
        print(f"     mobile: {buyer.get('mobile')}")
        print(f"     email: {buyer.get('email')}")
        
        # Report profile, order, copies
        if 'profile' in data and data['profile']:
            profile = data['profile']
            print(f"   Profile object:")
            print(f"     name_en: {profile.get('name_en')}")
            print(f"     school_en: {profile.get('school_en')}")
            print(f"     district: {profile.get('district')}")
            print(f"     status: {profile.get('status')}")
        else:
            print(f"   Profile: null")
        
        if 'order' in data and data['order']:
            order = data['order']
            print(f"   Order object:")
            print(f"     id: {order.get('id')}")
            print(f"     pack_code: {order.get('pack_code')}")
            print(f"     status: {order.get('status')}")
        else:
            print(f"   Order: null")
        
        if 'copies' in data:
            copies = data['copies']
            print(f"   Copies count: {len(copies)}")
            if len(copies) > 0:
                print(f"   Sample copy: {copies[0]}")
        else:
            print(f"   Copies: []")
        
        if 'downloads' in data:
            downloads = data['downloads']
            print(f"   Downloads count: {len(downloads)}")
        
    except Exception as e:
        print(f"❌ FAIL: Request error: {e}")
        return False
    
    # Test 2b: As admin with copy_id=ZZZZZZZZ → 200 found=false
    print("\n2b. As admin with ?copy_id=ZZZZZZZZ → expect 200 found=false")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{API_BASE}/admin/assess/trace?copy_id=ZZZZZZZZ", headers=headers, timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        
        if data.get('found') != False:
            print(f"❌ FAIL: Expected found=false, got found={data.get('found')}")
            print(f"Response: {data}")
            return False
        
        print(f"✅ PASS: Got 200 with found=false")
        
    except Exception as e:
        print(f"❌ FAIL: Request error: {e}")
        return False
    
    # Test 2c: As admin with NO copy_id param → 400
    print("\n2c. As admin with NO copy_id param → expect 400")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{API_BASE}/admin/assess/trace", headers=headers, timeout=10)
        
        if resp.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        print(f"✅ PASS: Got 400 without copy_id param")
        
    except Exception as e:
        print(f"❌ FAIL: Request error: {e}")
        return False
    
    # Test 2d: As normal user → 403
    print("\n2d. As normal user 9999900001/<redacted> → expect 403 (admin only)")
    user_token = login("9999900001", "<redacted>")
    if not user_token:
        print("❌ FAIL: Could not login as normal user")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {user_token}"}
        resp = requests.get(f"{API_BASE}/admin/assess/trace?copy_id=A754EF99", headers=headers, timeout=10)
        
        if resp.status_code != 403:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        print(f"✅ PASS: Got 403 for non-admin user")
        
    except Exception as e:
        print(f"❌ FAIL: Request error: {e}")
        return False
    
    return True

def main():
    print("\n" + "="*80)
    print("ASSESSMENT STORE — DOWNLOAD HISTORY + LEAK-TRACE LOOKUP BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    
    results = []
    
    # Test 1: GET /api/assess/my/downloads
    test1_pass = test_my_downloads()
    results.append(("GET /api/assess/my/downloads", test1_pass))
    
    # Test 2: GET /api/admin/assess/trace
    test2_pass = test_admin_trace()
    results.append(("GET /api/admin/assess/trace", test2_pass))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(passed for _, passed in results)
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
