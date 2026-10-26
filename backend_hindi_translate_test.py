#!/usr/bin/env python3
"""
Backend test for POST /api/lo-codes/translate (Hindi curriculum translation)
Tests the NEW endpoint that translates Odia curriculum text to Hindi for lesson plans.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def print_test(num, desc):
    print(f"\n{'='*80}")
    print(f"TEST {num}: {desc}")
    print('='*80)

def print_pass(msg):
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    print(f"❌ FAIL: {msg}")

def has_devanagari(text):
    """Check if text contains Devanagari characters (U+0900–U+097F)"""
    if not text:
        return False
    return any('\u0900' <= char <= '\u097F' for char in text)

def main():
    print("\n" + "="*80)
    print("HINDI CURRICULUM TRANSLATION BACKEND TEST")
    print("Testing POST /api/lo-codes/translate endpoint")
    print("="*80)
    
    # Login to get admin token (SINGLE-DEVICE: log in once, reuse token)
    print("\n🔐 Logging in as admin...")
    try:
        login_resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if login_resp.status_code != 200:
            print(f"❌ Login failed: {login_resp.status_code} {login_resp.text}")
            sys.exit(1)
        
        token = login_resp.json().get('token')
        if not token:
            print(f"❌ No token in login response: {login_resp.json()}")
            sys.exit(1)
        
        print(f"✅ Login successful, token obtained")
    except Exception as e:
        print(f"❌ Login exception: {e}")
        sys.exit(1)
    
    headers_with_auth = {"Authorization": f"Bearer {token}"}
    
    # Track test results
    results = []
    
    # ========================================================================
    # TEST 1: POST /lo-codes/translate WITHOUT token -> 401
    # ========================================================================
    print_test(1, "POST /lo-codes/translate WITHOUT token -> 401")
    try:
        resp = requests.post(
            f"{BASE_URL}/lo-codes/translate",
            json={"lang": "hindi", "items": [{"key": "a", "text": "test"}]},
            timeout=10
        )
        
        if resp.status_code == 401:
            print_pass(f"Correctly rejected with 401: {resp.json()}")
            results.append(("Test 1", True, "401 without token"))
        else:
            print_fail(f"Expected 401, got {resp.status_code}: {resp.text}")
            results.append(("Test 1", False, f"Got {resp.status_code} instead of 401"))
    except Exception as e:
        print_fail(f"Exception: {e}")
        results.append(("Test 1", False, f"Exception: {e}"))
    
    # ========================================================================
    # TEST 2: WITH token, translate Odia to Hindi -> 200 with Devanagari
    # ========================================================================
    print_test(2, "WITH token, translate Odia to Hindi -> 200 with Devanagari")
    
    odia_text = "ଶିକ୍ଷାର୍ଥୀମାନେ ମୌଳିକ ଭାଷାତାତ୍ତ୍ୱିକ ଦିଗ ଚିହ୍ନିବାର ଦକ୍ଷତା ବିକଶିତ କରନ୍ତି"
    
    try:
        resp = requests.post(
            f"{BASE_URL}/lo-codes/translate",
            json={"lang": "hindi", "items": [{"key": "a", "text": odia_text}]},
            headers=headers_with_auth,
            timeout=30  # May take several seconds on first call (Gemini)
        )
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
            results.append(("Test 2", False, f"Got {resp.status_code} instead of 200"))
        else:
            data = resp.json()
            print(f"Response: {json.dumps(data, ensure_ascii=False, indent=2)}")
            
            # Check response structure
            if 'translations' not in data:
                print_fail("Response missing 'translations' field")
                results.append(("Test 2", False, "Missing 'translations' field"))
            elif 'a' not in data['translations']:
                print_fail("Response missing key 'a' in translations")
                results.append(("Test 2", False, "Missing key 'a' in translations"))
            else:
                translated = data['translations']['a']
                print(f"Original (Odia): {odia_text}")
                print(f"Translated: {translated}")
                
                # Validate: contains Devanagari
                has_dev = has_devanagari(translated)
                print(f"Contains Devanagari (U+0900–U+097F): {has_dev}")
                
                # Validate: NOT identical to input
                is_different = translated != odia_text
                print(f"Different from input: {is_different}")
                
                if has_dev and is_different:
                    print_pass("Translation contains Devanagari and is different from Odia input")
                    results.append(("Test 2", True, "Valid Hindi translation with Devanagari"))
                else:
                    issues = []
                    if not has_dev:
                        issues.append("No Devanagari characters")
                    if not is_different:
                        issues.append("Identical to input")
                    print_fail(f"Translation validation failed: {', '.join(issues)}")
                    results.append(("Test 2", False, f"Translation issues: {', '.join(issues)}"))
    except Exception as e:
        print_fail(f"Exception: {e}")
        results.append(("Test 2", False, f"Exception: {e}"))
    
    # ========================================================================
    # TEST 3: WITH token, lang='odia' -> 200 passthrough (returns original)
    # ========================================================================
    print_test(3, "WITH token, lang='odia' -> 200 passthrough")
    try:
        resp = requests.post(
            f"{BASE_URL}/lo-codes/translate",
            json={"lang": "odia", "items": [{"key": "a", "text": "x"}]},
            headers=headers_with_auth,
            timeout=10
        )
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
            results.append(("Test 3", False, f"Got {resp.status_code} instead of 200"))
        else:
            data = resp.json()
            print(f"Response: {json.dumps(data, ensure_ascii=False, indent=2)}")
            
            if 'translations' not in data:
                print_fail("Response missing 'translations' field")
                results.append(("Test 3", False, "Missing 'translations' field"))
            elif data['translations'].get('a') != 'x':
                print_fail(f"Expected passthrough 'x', got '{data['translations'].get('a')}'")
                results.append(("Test 3", False, f"Got '{data['translations'].get('a')}' instead of 'x'"))
            else:
                print_pass(f"Passthrough working: translations.a = 'x'")
                results.append(("Test 3", True, "Odia passthrough returns original"))
    except Exception as e:
        print_fail(f"Exception: {e}")
        results.append(("Test 3", False, f"Exception: {e}"))
    
    # ========================================================================
    # TEST 4: WITH token, empty items array -> 200 with empty translations
    # ========================================================================
    print_test(4, "WITH token, empty items array -> 200 with empty translations")
    try:
        resp = requests.post(
            f"{BASE_URL}/lo-codes/translate",
            json={"lang": "hindi", "items": []},
            headers=headers_with_auth,
            timeout=10
        )
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
            results.append(("Test 4", False, f"Got {resp.status_code} instead of 200"))
        else:
            data = resp.json()
            print(f"Response: {json.dumps(data, ensure_ascii=False, indent=2)}")
            
            if 'translations' not in data:
                print_fail("Response missing 'translations' field")
                results.append(("Test 4", False, "Missing 'translations' field"))
            elif data['translations'] != {}:
                print_fail(f"Expected empty object, got {data['translations']}")
                results.append(("Test 4", False, f"Got {data['translations']} instead of {{}}"))
            else:
                print_pass("Empty items returns empty translations object")
                results.append(("Test 4", True, "Empty items handled correctly"))
    except Exception as e:
        print_fail(f"Exception: {e}")
        results.append(("Test 4", False, f"Exception: {e}"))
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for test_name, success, detail in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {detail}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({100*passed//total if total else 0}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Hindi curriculum translation endpoint working correctly!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
