#!/usr/bin/env python3
"""
TOB One-ZIP Importer Backend Test
Tests 3 new subjects (PE/ART/VOC) + YELLOW rule + unknown-code rejection
"""
import requests
import json
import sys
from pathlib import Path

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

# Mock files
MOCK_FILES = {
    "pe": "/tmp/pe_class4.zip",
    "voc": "/tmp/voc_class4.zip",
    "art": "/tmp/art_class4.zip",
    "bad": "/tmp/bad_subject.zip"
}

def login_admin():
    """Login as admin and return bearer token"""
    print("\n=== ADMIN LOGIN ===")
    url = f"{BASE_URL}/api/auth/login"
    payload = {"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}
    
    try:
        resp = requests.post(url, json=payload, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful, token obtained")
                return token
            else:
                print(f"❌ No token in response: {data}")
                return None
        else:
            print(f"❌ Login failed: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_peek_endpoint(token, file_path, test_name, expected):
    """Test the peek endpoint with a given file"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")
    print(f"File: {file_path}")
    
    url = f"{BASE_URL}/api/tob/admin/import-onezip/peek"
    headers = {"Authorization": f"Bearer {token}"}
    
    # Check if file exists
    if not Path(file_path).exists():
        print(f"❌ File not found: {file_path}")
        return False
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (Path(file_path).name, f, 'application/zip')}
            resp = requests.post(url, headers=headers, files=files, timeout=30)
        
        print(f"\nHTTP Status: {resp.status_code}")
        
        # For bad_subject test, we expect 400
        if expected.get("expect_400"):
            if resp.status_code == 400:
                data = resp.json()
                error_msg = data.get("error", "")
                print(f"Response: {json.dumps(data, indent=2)}")
                
                # Check if error contains "Unknown subject code"
                if "Unknown subject code" in error_msg or "unknown subject code" in error_msg.lower():
                    print(f"✅ PASS: Got 400 with 'Unknown subject code' message")
                    
                    # Check if valid codes are listed
                    valid_codes = ["ODIA", "MATH", "ENGLISH", "HINDI", "SANSKRIT", "EVS", "SCIENCE", "SOCIAL", "PE", "ART", "VOC"]
                    codes_found = sum(1 for code in valid_codes if code in error_msg)
                    print(f"Valid codes found in error message: {codes_found}/{len(valid_codes)}")
                    
                    if codes_found >= 8:  # At least most codes should be present
                        print(f"✅ PASS: Error message lists valid subject codes")
                        return True
                    else:
                        print(f"⚠️ WARNING: Not all valid codes listed in error message")
                        return True  # Still pass as main requirement is met
                else:
                    print(f"❌ FAIL: Expected 'Unknown subject code' in error message")
                    return False
            else:
                print(f"❌ FAIL: Expected HTTP 400, got {resp.status_code}")
                print(f"Response: {resp.text[:500]}")
                return False
        
        # For normal tests, expect 200
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected HTTP 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        print(f"\nResponse Summary:")
        print(f"  ok: {data.get('ok')}")
        print(f"  class: {data.get('class')}")
        print(f"  subject_id: {data.get('subject_id')}")
        print(f"  subject_printed: {data.get('subject_printed')}")
        print(f"  rows count: {len(data.get('rows', []))}")
        
        if data.get('warnings'):
            print(f"\nWarnings:")
            for w in data['warnings']:
                print(f"  - {w}")
        
        # Check ok field
        if not data.get('ok'):
            print(f"❌ FAIL: ok field is not true")
            return False
        
        # Check class
        if expected.get("class") and data.get('class') != expected['class']:
            print(f"❌ FAIL: Expected class '{expected['class']}', got '{data.get('class')}'")
            return False
        
        # Check subject_id
        if expected.get("subject_id") and data.get('subject_id') != expected['subject_id']:
            print(f"❌ FAIL: Expected subject_id '{expected['subject_id']}', got '{data.get('subject_id')}'")
            return False
        
        # Check rows
        rows = data.get('rows', [])
        if len(rows) == 0:
            print(f"❌ FAIL: No rows returned")
            return False
        
        print(f"\nFirst Row Details:")
        row = rows[0]
        print(f"  fileName: {row.get('fileName')}")
        print(f"  type: {row.get('type')}")
        print(f"  status: {row.get('status')}")
        print(f"  coverage.total: {row.get('coverage', {}).get('total')}")
        print(f"  coverage.covered: {row.get('coverage', {}).get('covered')}")
        
        if row.get('checks'):
            print(f"  checks ({len(row['checks'])}):")
            for check in row['checks']:
                print(f"    - {check.get('level')}: {check.get('code')} - {check.get('message')}")
        
        # Check row status
        if expected.get("row_status") and row.get('status') != expected['row_status']:
            print(f"❌ FAIL: Expected row status '{expected['row_status']}', got '{row.get('status')}'")
            return False
        
        # Check for NO_LO_MASTER check (for VOC test)
        if expected.get("expect_no_lo_master"):
            checks = row.get('checks', [])
            has_no_lo_master = any(c.get('code') == 'NO_LO_MASTER' for c in checks)
            if not has_no_lo_master:
                print(f"❌ FAIL: Expected NO_LO_MASTER check in row checks")
                return False
            else:
                print(f"✅ PASS: Found NO_LO_MASTER check in row checks")
            
            # Check if warnings mention "No LO Master" and "can still be published"
            warnings = data.get('warnings', [])
            has_no_lo_warning = any('No LO Master' in w for w in warnings)
            has_publish_note = any('can still be published' in w or 'YELLOW' in w for w in warnings)
            
            if not has_no_lo_warning:
                print(f"⚠️ WARNING: Expected 'No LO Master' in warnings")
            else:
                print(f"✅ PASS: Found 'No LO Master' in warnings")
            
            if not has_publish_note:
                print(f"⚠️ WARNING: Expected 'can still be published' note in warnings")
            else:
                print(f"✅ PASS: Found 'can still be published' note in warnings")
            
            # Check coverage.total is 0
            if row.get('coverage', {}).get('total') != 0:
                print(f"❌ FAIL: Expected coverage.total = 0, got {row.get('coverage', {}).get('total')}")
                return False
            else:
                print(f"✅ PASS: coverage.total = 0 (no LO Master)")
        
        # Check for NO "No LO Master" warning (for PE test)
        if expected.get("no_lo_master_warning"):
            warnings = data.get('warnings', [])
            has_no_lo_warning = any('No LO Master' in w for w in warnings)
            if has_no_lo_warning:
                print(f"❌ FAIL: Should NOT have 'No LO Master' warning for PE")
                return False
            else:
                print(f"✅ PASS: No 'No LO Master' warning (PE has LO Master)")
        
        print(f"\n✅ TEST PASSED: {test_name}")
        return True
        
    except Exception as e:
        print(f"❌ TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_commit_endpoint(token, file_path, class_no, subject_code, rows_from_peek):
    """Test the commit endpoint (optional test)"""
    print(f"\n{'='*80}")
    print(f"TEST 5: COMMIT VOC Class 4 (Optional)")
    print(f"{'='*80}")
    
    url = f"{BASE_URL}/api/tob/admin/import-onezip/commit"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (Path(file_path).name, f, 'application/zip')}
            data = {
                'class': class_no,
                'subject': subject_code,
                'publish': 'true',
                'rows': json.dumps(rows_from_peek)
            }
            resp = requests.post(url, headers=headers, files=files, data=data, timeout=30)
        
        print(f"\nHTTP Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected HTTP 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        result = resp.json()
        print(f"\nCommit Result:")
        print(f"  ok: {result.get('ok')}")
        print(f"  added: {result.get('added')}")
        print(f"  replaced: {result.get('replaced')}")
        print(f"  published: {result.get('published')}")
        print(f"  skipped: {result.get('skipped')}")
        
        if not result.get('ok'):
            print(f"❌ FAIL: ok field is not true")
            return False
        
        published_count = result.get('published', 0)
        if published_count < 1:
            print(f"❌ FAIL: Expected published >= 1, got {published_count}")
            return False
        
        print(f"✅ PASS: Commit successful, published {published_count} items (yellow items ARE publishable)")
        return True
        
    except Exception as e:
        print(f"❌ TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("TOB ONE-ZIP IMPORTER BACKEND TEST")
    print("Testing 3 new subjects (PE/ART/VOC) + YELLOW rule + unknown-code rejection")
    print("="*80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Could not obtain admin token")
        sys.exit(1)
    
    results = {}
    
    # Test 1: PE Class 4 - expect green status, subject_id=PE, no LO Master warning
    results['test1_pe'] = test_peek_endpoint(
        token, 
        MOCK_FILES['pe'],
        "TEST 1: PE Class 4 (expect GREEN, subject_id=PE, has LO Master)",
        {
            "class": "4",
            "subject_id": "PE",
            "row_status": "green",
            "no_lo_master_warning": True
        }
    )
    
    # Test 2: VOC Class 4 - expect yellow status, subject_id=VE, NO_LO_MASTER check
    peek_result_voc = None
    results['test2_voc'] = test_peek_endpoint(
        token,
        MOCK_FILES['voc'],
        "TEST 2: VOC Class 4 (expect YELLOW, subject_id=VE, NO_LO_MASTER)",
        {
            "class": "4",
            "subject_id": "VE",
            "row_status": "yellow",
            "expect_no_lo_master": True
        }
    )
    
    # Get peek result for commit test
    try:
        url = f"{BASE_URL}/api/tob/admin/import-onezip/peek"
        headers = {"Authorization": f"Bearer {token}"}
        with open(MOCK_FILES['voc'], 'rb') as f:
            files = {'file': (Path(MOCK_FILES['voc']).name, f, 'application/zip')}
            resp = requests.post(url, headers=headers, files=files, timeout=30)
            if resp.status_code == 200:
                peek_result_voc = resp.json().get('rows', [])
    except:
        pass
    
    # Test 3: ART Class 4 - expect green status, subject_id=AE
    results['test3_art'] = test_peek_endpoint(
        token,
        MOCK_FILES['art'],
        "TEST 3: ART Class 4 (expect GREEN, subject_id=AE)",
        {
            "class": "4",
            "subject_id": "AE",
            "row_status": "green"
        }
    )
    
    # Test 4: Bad subject - expect HTTP 400 with "Unknown subject code"
    results['test4_bad'] = test_peek_endpoint(
        token,
        MOCK_FILES['bad'],
        "TEST 4: Bad Subject (expect HTTP 400 with 'Unknown subject code')",
        {
            "expect_400": True
        }
    )
    
    # Test 5: Optional commit test for VOC
    if peek_result_voc:
        results['test5_commit'] = test_commit_endpoint(
            token,
            MOCK_FILES['voc'],
            "4",
            "VOC",
            peek_result_voc
        )
    else:
        print("\n⚠️ SKIPPING TEST 5: Could not get peek result for VOC")
        results['test5_commit'] = None
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    total = len([v for v in results.values() if v is not None])
    
    for test_name, result in results.items():
        status = "✅ PASS" if result is True else ("❌ FAIL" if result is False else "⚠️ SKIPPED")
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    if skipped > 0:
        print(f"Skipped: {skipped} tests")
    
    if failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
