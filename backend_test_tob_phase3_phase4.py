#!/usr/bin/env python3
"""
TOB Phase-3 Revenue + Phase-4 Secure Download Backend Test
Test date: 2026-06
Base URL: https://odisha-learning-pro.preview.emergentagent.com
Admin: 9692604577 / Subrat@909e
Teacher (owner): 9444106792 / Test@1234 (OWNS chapter:5:MATH:1)
"""

import requests
import json
import time
from urllib.parse import urljoin

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
TEACHER_MOBILE = "9444106792"
TEACHER_PASSWORD = "Test@1234"

def login(mobile, password):
    """Login and return Bearer token"""
    url = urljoin(BASE_URL, "/api/auth/login")
    response = requests.post(url, json={"mobile": mobile, "password": password})
    if response.status_code == 200:
        data = response.json()
        return data.get("token")
    else:
        print(f"❌ Login failed for {mobile}: {response.status_code} {response.text}")
        return None

def register_new_teacher():
    """Register a new teacher for non-owner test"""
    url = urljoin(BASE_URL, "/api/auth/register")
    # Generate a unique mobile number
    import random
    mobile = f"9{random.randint(100000000, 999999999)}"
    payload = {
        "name": "Test Non-Owner Teacher",
        "mobile": mobile,
        "password": "Test@1234",
        "consent": True
    }
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        data = response.json()
        return data.get("token"), mobile
    else:
        print(f"❌ Registration failed: {response.status_code} {response.text}")
        return None, None

print("=" * 80)
print("TOB PHASE-3 REVENUE + PHASE-4 SECURE DOWNLOAD BACKEND TEST")
print("=" * 80)
print()

# ============================================================================
# TEST 1: REVENUE ENDPOINT
# ============================================================================
print("TEST 1: REVENUE ENDPOINT")
print("-" * 80)

try:
    # 1a. Non-admin should get 403
    print("1a. Testing non-admin access (should be 403)...")
    teacher_token = login(TEACHER_MOBILE, TEACHER_PASSWORD)
    if not teacher_token:
        print("❌ FAIL: Could not login as teacher")
    else:
        url = urljoin(BASE_URL, "/api/tob/admin/revenue")
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(url, headers=headers)
        if response.status_code == 403:
            print(f"✅ PASS: Non-admin correctly blocked with 403")
        else:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
    
    # 1b. Admin should get 200 with correct structure
    print("\n1b. Testing admin access (should be 200 with correct structure)...")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ FAIL: Could not login as admin")
    else:
        url = urljoin(BASE_URL, "/api/tob/admin/revenue")
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS: Admin revenue endpoint returned 200")
            
            # Check structure
            required_card_fields = ['today', 'last7', 'month', 'total', 'orders', 'avgOrder', 'pctPack', 'pctSingle']
            cards = data.get('cards', {})
            
            missing_fields = [f for f in required_card_fields if f not in cards]
            if missing_fields:
                print(f"❌ FAIL: Missing card fields: {missing_fields}")
            else:
                print(f"✅ PASS: All card fields present: {required_card_fields}")
                
                # Check that all are numbers
                all_numbers = all(isinstance(cards[f], (int, float)) for f in required_card_fields)
                if all_numbers:
                    print(f"✅ PASS: All card values are numbers")
                else:
                    print(f"❌ FAIL: Some card values are not numbers")
            
            # Check daily array
            daily = data.get('daily', [])
            if isinstance(daily, list) and len(daily) == 30:
                print(f"✅ PASS: daily is a 30-element array")
                if len(daily) > 0:
                    sample = daily[0]
                    if 'date' in sample and 'amount' in sample:
                        print(f"✅ PASS: daily elements have date and amount fields")
                    else:
                        print(f"❌ FAIL: daily elements missing date or amount")
            else:
                print(f"❌ FAIL: daily is not a 30-element array (got {len(daily)} elements)")
            
            # Check top arrays
            for key in ['topClasses', 'topSubjects', 'topItems']:
                if key in data and isinstance(data[key], list):
                    print(f"✅ PASS: {key} is an array")
                else:
                    print(f"❌ FAIL: {key} is missing or not an array")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}: {response.text}")

except Exception as e:
    print(f"❌ EXCEPTION in TEST 1: {e}")

print()

# ============================================================================
# TEST 2: GET CHAPTER ITEM ID
# ============================================================================
print("TEST 2: GET CHAPTER ITEM ID")
print("-" * 80)

ch1_id = None
set_id = None

try:
    url = urljoin(BASE_URL, "/api/tob/admin/files?class=5&subject=MATH")
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS: Files endpoint returned 200")
        
        buckets = data.get('buckets', {})
        term1 = buckets.get('Term1', [])
        sets = buckets.get('Sets', [])
        
        if len(term1) > 0:
            ch1_id = term1[0].get('id')
            print(f"✅ PASS: Got Ch1 itemId: {ch1_id}")
        else:
            print(f"❌ FAIL: Term1 is empty")
        
        if len(sets) > 0:
            set_id = sets[0].get('id')
            print(f"✅ PASS: Got Set itemId: {set_id}")
        else:
            print(f"❌ FAIL: Sets is empty")
    else:
        print(f"❌ FAIL: Files endpoint returned {response.status_code}: {response.text}")

except Exception as e:
    print(f"❌ EXCEPTION in TEST 2: {e}")

print()

# ============================================================================
# TEST 3: SECURE DOWNLOAD (OWNER)
# ============================================================================
print("TEST 3: SECURE DOWNLOAD (OWNER)")
print("-" * 80)

if not ch1_id:
    print("❌ SKIP: No Ch1 itemId available")
else:
    try:
        # Test with answers=without
        print("3a. Testing download with answers=without...")
        url = urljoin(BASE_URL, f"/api/tob/store/download?itemId={ch1_id}&answers=without")
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS: Download endpoint returned 200")
            
            if 'url' in data and 'expiresInSec' in data:
                print(f"✅ PASS: Response has url and expiresInSec fields")
                
                if data['expiresInSec'] == 600:
                    print(f"✅ PASS: expiresInSec is 600")
                else:
                    print(f"❌ FAIL: expiresInSec is {data['expiresInSec']}, expected 600")
                
                # Now fetch the file
                file_url = urljoin(BASE_URL, data['url'])
                print(f"3b. Fetching file from: {data['url']}")
                file_response = requests.get(file_url)
                
                if file_response.status_code == 200:
                    print(f"✅ PASS: File endpoint returned 200")
                    
                    content_type = file_response.headers.get('Content-Type', '')
                    if content_type == 'application/pdf':
                        print(f"✅ PASS: Content-Type is application/pdf (NOT text/html)")
                    else:
                        print(f"❌ FAIL: Content-Type is {content_type}, expected application/pdf")
                    
                    # Check if body starts with %PDF
                    body = file_response.content
                    if body[:4] == b'%PDF':
                        print(f"✅ PASS: Body starts with %PDF")
                    else:
                        print(f"❌ FAIL: Body does not start with %PDF (starts with {body[:20]})")
                else:
                    print(f"❌ FAIL: File endpoint returned {file_response.status_code}")
            else:
                print(f"❌ FAIL: Response missing url or expiresInSec: {data}")
        else:
            print(f"❌ FAIL: Download endpoint returned {response.status_code}: {response.text}")
        
        # Test with answers=with
        print("\n3c. Testing download with answers=with...")
        url = urljoin(BASE_URL, f"/api/tob/store/download?itemId={ch1_id}&answers=with")
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS: Download endpoint (answers=with) returned 200")
            
            if 'url' in data:
                file_url = urljoin(BASE_URL, data['url'])
                file_response = requests.get(file_url)
                
                if file_response.status_code == 200:
                    print(f"✅ PASS: File endpoint returned 200")
                    
                    content_type = file_response.headers.get('Content-Type', '')
                    if content_type == 'application/pdf':
                        print(f"✅ PASS: Content-Type is application/pdf")
                    else:
                        print(f"❌ FAIL: Content-Type is {content_type}")
                    
                    body = file_response.content
                    if body[:4] == b'%PDF':
                        print(f"✅ PASS: Body starts with %PDF")
                    else:
                        print(f"❌ FAIL: Body does not start with %PDF")
                else:
                    print(f"❌ FAIL: File endpoint returned {file_response.status_code}")
        else:
            print(f"❌ FAIL: Download endpoint returned {response.status_code}: {response.text}")

    except Exception as e:
        print(f"❌ EXCEPTION in TEST 3: {e}")

print()

# ============================================================================
# TEST 4: PURCHASE CHECK (NON-OWNER)
# ============================================================================
print("TEST 4: PURCHASE CHECK (NON-OWNER)")
print("-" * 80)

if not ch1_id:
    print("❌ SKIP: No Ch1 itemId available")
else:
    try:
        print("4a. Registering a new non-owner teacher...")
        non_owner_token, non_owner_mobile = register_new_teacher()
        
        if not non_owner_token:
            print("❌ FAIL: Could not register non-owner teacher")
        else:
            print(f"✅ PASS: Registered non-owner teacher: {non_owner_mobile}")
            
            print("4b. Testing download as non-owner (should be 403 NOT_PURCHASED)...")
            url = urljoin(BASE_URL, f"/api/tob/store/download?itemId={ch1_id}&answers=with")
            headers = {"Authorization": f"Bearer {non_owner_token}"}
            response = requests.get(url, headers=headers)
            
            if response.status_code == 403:
                print(f"✅ PASS: Non-owner correctly blocked with 403")
                
                try:
                    data = response.json()
                    if data.get('code') == 'NOT_PURCHASED':
                        print(f"✅ PASS: Error code is NOT_PURCHASED")
                    else:
                        print(f"❌ FAIL: Error code is {data.get('code')}, expected NOT_PURCHASED")
                except:
                    print(f"⚠️  WARNING: Could not parse error code from response")
            else:
                print(f"❌ FAIL: Expected 403, got {response.status_code}: {response.text}")

    except Exception as e:
        print(f"❌ EXCEPTION in TEST 4: {e}")

print()

# ============================================================================
# TEST 5: EXPIRED/INVALID TOKEN
# ============================================================================
print("TEST 5: EXPIRED/INVALID TOKEN")
print("-" * 80)

try:
    url = urljoin(BASE_URL, "/api/tob/store/file?token=bogus.deadbeef")
    response = requests.get(url)
    
    if response.status_code == 410:
        print(f"✅ PASS: Invalid token correctly returned 410")
        
        try:
            data = response.json()
            code = data.get('code', '')
            if code in ['BAD_TOKEN', 'EXPIRED']:
                print(f"✅ PASS: Error code is {code}")
            else:
                print(f"⚠️  WARNING: Error code is {code}, expected BAD_TOKEN or EXPIRED")
        except:
            print(f"⚠️  WARNING: Could not parse error code from response")
    else:
        print(f"❌ FAIL: Expected 410, got {response.status_code}: {response.text}")

except Exception as e:
    print(f"❌ EXCEPTION in TEST 5: {e}")

print()

# ============================================================================
# TEST 6: RATE LIMIT (10 downloads, then 11th should fail)
# ============================================================================
print("TEST 6: RATE LIMIT")
print("-" * 80)

if not ch1_id:
    print("❌ SKIP: No Ch1 itemId available")
else:
    try:
        print("6a. Performing 10 successful downloads...")
        successful_downloads = 0
        
        for i in range(10):
            # Get download token
            url = urljoin(BASE_URL, f"/api/tob/store/download?itemId={ch1_id}&answers=without")
            headers = {"Authorization": f"Bearer {teacher_token}"}
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                file_url = urljoin(BASE_URL, data['url'])
                
                # Fetch the file to log the download
                file_response = requests.get(file_url)
                
                if file_response.status_code == 200:
                    successful_downloads += 1
                    print(f"  Download {i+1}/10: ✅ Success")
                else:
                    print(f"  Download {i+1}/10: ❌ File fetch failed with {file_response.status_code}")
            else:
                print(f"  Download {i+1}/10: ❌ Token request failed with {response.status_code}")
            
            # Small delay to avoid overwhelming the server
            time.sleep(0.2)
        
        print(f"\n✅ Completed {successful_downloads}/10 downloads")
        
        print("\n6b. Testing 11th download (should be 429 RATE_LIMIT)...")
        url = urljoin(BASE_URL, f"/api/tob/store/download?itemId={ch1_id}&answers=without")
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(url, headers=headers)
        
        if response.status_code == 429:
            print(f"✅ PASS: 11th download correctly blocked with 429")
            
            try:
                data = response.json()
                if data.get('code') == 'RATE_LIMIT':
                    print(f"✅ PASS: Error code is RATE_LIMIT")
                else:
                    print(f"❌ FAIL: Error code is {data.get('code')}, expected RATE_LIMIT")
            except:
                print(f"⚠️  WARNING: Could not parse error code from response")
        else:
            print(f"❌ FAIL: Expected 429, got {response.status_code}: {response.text}")

    except Exception as e:
        print(f"❌ EXCEPTION in TEST 6: {e}")

print()

# ============================================================================
# TEST 7: SAMPLE ENDPOINT
# ============================================================================
print("TEST 7: SAMPLE ENDPOINT")
print("-" * 80)

if not set_id:
    print("❌ SKIP: No Set itemId available")
else:
    try:
        url = urljoin(BASE_URL, f"/api/tob/store/sample?itemId={set_id}")
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            print(f"✅ PASS: Sample endpoint returned 200")
            
            content_type = response.headers.get('Content-Type', '')
            if content_type.startswith('image/png'):
                print(f"✅ PASS: Content-Type is image/png")
            else:
                print(f"❌ FAIL: Content-Type is {content_type}, expected image/png")
        else:
            print(f"❌ FAIL: Sample endpoint returned {response.status_code}: {response.text}")

    except Exception as e:
        print(f"❌ EXCEPTION in TEST 7: {e}")

print()

# ============================================================================
# CLEANUP: TURN OFF PAYWALL
# ============================================================================
print("CLEANUP: TURN OFF PAYWALL")
print("-" * 80)

try:
    url = urljoin(BASE_URL, "/api/tob/admin/sell-config")
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "paywallOn": False,
        "freeClasses": []
    }
    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code == 200:
        print(f"✅ PASS: Paywall turned off successfully")
    else:
        print(f"❌ FAIL: Could not turn off paywall: {response.status_code} {response.text}")

except Exception as e:
    print(f"❌ EXCEPTION in CLEANUP: {e}")

print()
print("=" * 80)
print("TOB PHASE-3 REVENUE + PHASE-4 SECURE DOWNLOAD TEST COMPLETE")
print("=" * 80)
