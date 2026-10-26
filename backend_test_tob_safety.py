#!/usr/bin/env python3
"""
Backend test for TOB one-ZIP importer safety fixes (Class 5 English)
Tests term-distinct Set dedupe + diary validator + RED reason
"""

import requests
import json
import os
from pymongo import MongoClient

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Test files
DEDUPE_ZIP = "/tmp/c5en_dedupe.zip"
DIARY_ZIP = "/tmp/c5en_diary.zip"

def authenticate():
    """Authenticate as admin and return bearer token"""
    print("\n=== AUTHENTICATING AS ADMIN ===")
    url = f"{BASE_URL}/api/auth/login"
    payload = {
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Authentication successful")
                return token
            else:
                print(f"❌ No token in response: {data}")
                return None
        else:
            print(f"❌ Authentication failed: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Authentication error: {e}")
        return None

def test_peek(token, zip_file, test_name):
    """POST /api/tob/admin/import-onezip/peek"""
    print(f"\n=== TEST: {test_name} - PEEK ===")
    url = f"{BASE_URL}/api/tob/admin/import-onezip/peek"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        with open(zip_file, 'rb') as f:
            files = {'file': (os.path.basename(zip_file), f, 'application/zip')}
            response = requests.post(url, headers=headers, files=files, timeout=30)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Peek successful")
            print(f"Response keys: {list(data.keys())}")
            
            if data.get('ok'):
                print(f"  ok: {data['ok']}")
                print(f"  class: {data.get('class')}")
                print(f"  subject_id: {data.get('subject_id')}")
                print(f"  rows count: {len(data.get('rows', []))}")
                
                if 'summary' in data:
                    print(f"  summary.duplicates: {data['summary'].get('duplicates')}")
                
                # Print row details
                for i, row in enumerate(data.get('rows', [])):
                    print(f"\n  Row {i+1}:")
                    print(f"    type: {row.get('type')}")
                    print(f"    setCode: {row.get('setCode')}")
                    print(f"    term: {row.get('term')}")
                    print(f"    chapterTitle: {row.get('chapterTitle')}")
                    print(f"    status: {row.get('status')}")
                    if row.get('reason'):
                        print(f"    reason: {row.get('reason')}")
                    if 'checks' in row:
                        print(f"    checks count: {len(row.get('checks', []))}")
                
                return data
            else:
                print(f"❌ ok=false in response")
                return data
        else:
            print(f"❌ Peek failed: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Peek error: {e}")
        return None

def test_commit(token, zip_file, class_num, subject, rows, publish=True):
    """POST /api/tob/admin/import-onezip/commit"""
    print(f"\n=== TEST: COMMIT (class={class_num}, subject={subject}) ===")
    url = f"{BASE_URL}/api/tob/admin/import-onezip/commit"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        with open(zip_file, 'rb') as f:
            files = {'file': (os.path.basename(zip_file), f, 'application/zip')}
            data = {
                'class': class_num,
                'subject': subject,
                'publish': 'true' if publish else 'false',
                'rows': json.dumps(rows)
            }
            response = requests.post(url, headers=headers, files=files, data=data, timeout=30)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Commit successful")
            print(f"  ok: {result.get('ok')}")
            print(f"  added: {result.get('added')}")
            print(f"  replaced: {result.get('replaced')}")
            print(f"  published: {result.get('published')}")
            return result
        else:
            print(f"❌ Commit failed: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Commit error: {e}")
        return None

def cleanup_test_data():
    """Delete committed Set A test items from MongoDB"""
    print("\n=== CLEANUP: Deleting Set A test items ===")
    
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        collection = db['tobItems']
        
        # Delete Set A items for Class 5 English
        result = collection.delete_many({
            'class': '5',
            'subject_id': 'E',
            'type': 'set',
            'setCode': 'A'
        })
        
        print(f"✅ Deleted {result.deleted_count} Set A test items")
        client.close()
        return result.deleted_count
    except Exception as e:
        print(f"❌ Cleanup error: {e}")
        return 0

def main():
    print("=" * 80)
    print("TOB ONE-ZIP IMPORTER SAFETY FIXES - BACKEND TEST")
    print("=" * 80)
    
    # Authenticate
    token = authenticate()
    if not token:
        print("\n❌ FAILED: Could not authenticate")
        return
    
    # TEST A: Term-distinct Set dedupe
    print("\n" + "=" * 80)
    print("TEST A: TERM-DISTINCT SET DEDUPE")
    print("=" * 80)
    
    # Step 1: First peek (should show 0 duplicates)
    print("\n--- Step 1: First peek (expect duplicates=0) ---")
    peek1_data = test_peek(token, DEDUPE_ZIP, "DEDUPE - First Peek")
    
    if not peek1_data:
        print("❌ TEST A FAILED: First peek failed")
        return
    
    # Verify expectations for first peek
    test_a_step1_pass = True
    
    if peek1_data.get('ok') != True:
        print("❌ Step 1 FAILED: ok is not true")
        test_a_step1_pass = False
    
    if peek1_data.get('class') != '5':
        print(f"❌ Step 1 FAILED: class is '{peek1_data.get('class')}', expected '5'")
        test_a_step1_pass = False
    
    if peek1_data.get('subject_id') != 'E':
        print(f"❌ Step 1 FAILED: subject_id is '{peek1_data.get('subject_id')}', expected 'E'")
        test_a_step1_pass = False
    
    rows = peek1_data.get('rows', [])
    if len(rows) != 3:
        print(f"❌ Step 1 FAILED: rows count is {len(rows)}, expected 3")
        test_a_step1_pass = False
    
    # Check for Set A with different terms
    set_a_rows = [r for r in rows if r.get('type') == 'set' and r.get('setCode') == 'A']
    if len(set_a_rows) != 3:
        print(f"❌ Step 1 FAILED: Set A rows count is {len(set_a_rows)}, expected 3")
        test_a_step1_pass = False
    
    terms = sorted([r.get('term') for r in set_a_rows])
    expected_terms = sorted(['full', '1', '2'])
    if terms != expected_terms:
        print(f"❌ Step 1 FAILED: terms are {terms}, expected {expected_terms}")
        test_a_step1_pass = False
    
    duplicates = peek1_data.get('summary', {}).get('duplicates', -1)
    if duplicates != 0:
        print(f"❌ Step 1 FAILED: summary.duplicates is {duplicates}, expected 0")
        test_a_step1_pass = False
    
    if test_a_step1_pass:
        print("✅ Step 1 PASSED: First peek shows 3 distinct Set A items (term full/1/2), duplicates=0")
    
    # Step 2: Commit
    print("\n--- Step 2: Commit (expect added=3, replaced=0, published=3) ---")
    commit_data = test_commit(token, DEDUPE_ZIP, '5', 'ENGLISH', rows, publish=True)
    
    if not commit_data:
        print("❌ TEST A FAILED: Commit failed")
        return
    
    test_a_step2_pass = True
    
    if commit_data.get('ok') != True:
        print("❌ Step 2 FAILED: ok is not true")
        test_a_step2_pass = False
    
    if commit_data.get('added') != 3:
        print(f"❌ Step 2 FAILED: added is {commit_data.get('added')}, expected 3")
        test_a_step2_pass = False
    
    if commit_data.get('replaced') != 0:
        print(f"❌ Step 2 FAILED: replaced is {commit_data.get('replaced')}, expected 0")
        test_a_step2_pass = False
    
    if commit_data.get('published') != 3:
        print(f"❌ Step 2 FAILED: published is {commit_data.get('published')}, expected 3")
        test_a_step2_pass = False
    
    if test_a_step2_pass:
        print("✅ Step 2 PASSED: Commit added 3 items, replaced 0, published 3")
    
    # Step 3: Re-peek (should show 3 duplicates)
    print("\n--- Step 3: Re-peek (expect duplicates=3) ---")
    peek2_data = test_peek(token, DEDUPE_ZIP, "DEDUPE - Re-peek")
    
    if not peek2_data:
        print("❌ TEST A FAILED: Re-peek failed")
        cleanup_test_data()
        return
    
    test_a_step3_pass = True
    
    duplicates2 = peek2_data.get('summary', {}).get('duplicates', -1)
    if duplicates2 != 3:
        print(f"❌ Step 3 FAILED: summary.duplicates is {duplicates2}, expected 3")
        test_a_step3_pass = False
    
    if test_a_step3_pass:
        print("✅ Step 3 PASSED: Re-peek shows all 3 items as duplicates")
    
    # TEST B: Diary validator + RED reason
    print("\n" + "=" * 80)
    print("TEST B: DIARY VALIDATOR + RED REASON")
    print("=" * 80)
    
    # Step 4: Peek diary zip
    print("\n--- Step 4: Peek diary zip (expect 2 chapters, Ch01 NOT red, Ch02 red with reason) ---")
    diary_data = test_peek(token, DIARY_ZIP, "DIARY")
    
    if not diary_data:
        print("❌ TEST B FAILED: Diary peek failed")
        cleanup_test_data()
        return
    
    test_b_pass = True
    
    if diary_data.get('ok') != True:
        print("❌ Step 4 FAILED: ok is not true")
        test_b_pass = False
    
    diary_rows = diary_data.get('rows', [])
    if len(diary_rows) != 2:
        print(f"❌ Step 4 FAILED: rows count is {len(diary_rows)}, expected 2")
        test_b_pass = False
    
    # Find Ch01 and Ch02
    # Since there are exactly 2 rows and they're in order, assume Row 1 = Ch01, Row 2 = Ch02
    ch01 = diary_rows[0] if len(diary_rows) >= 1 else None
    ch02 = diary_rows[1] if len(diary_rows) >= 2 else None
    
    # Check Ch01 status (should NOT be red)
    if ch01:
        ch01_status = ch01.get('status')
        print(f"\n  Ch01 status: {ch01_status}")
        if ch01_status == 'red':
            print(f"❌ Step 4 FAILED: Ch01 status is 'red', expected NOT red (yellow or green)")
            test_b_pass = False
        else:
            print(f"✅ Ch01 status is '{ch01_status}' (NOT red) - CORRECT")
    else:
        print("❌ Step 4 FAILED: Could not find Ch01 in rows")
        test_b_pass = False
    
    # Check Ch02 status (should be red with reason)
    if ch02:
        ch02_status = ch02.get('status')
        ch02_reason = ch02.get('reason', '')
        print(f"\n  Ch02 status: {ch02_status}")
        print(f"  Ch02 reason: {ch02_reason}")
        
        if ch02_status != 'red':
            print(f"❌ Step 4 FAILED: Ch02 status is '{ch02_status}', expected 'red'")
            test_b_pass = False
        else:
            print(f"✅ Ch02 status is 'red' - CORRECT")
        
        # Check reason contains required text
        reason_checks = [
            ('LO code', 'LO code' in ch02_reason or 'LO Code' in ch02_reason),
            ('E 9.9.9', 'E 9.9.9' in ch02_reason),
            ('not in the LO Master', 'not in the LO Master' in ch02_reason or 'not in LO Master' in ch02_reason)
        ]
        
        for check_name, check_result in reason_checks:
            if not check_result:
                print(f"❌ Step 4 FAILED: Ch02 reason does not contain '{check_name}'")
                test_b_pass = False
            else:
                print(f"✅ Ch02 reason contains '{check_name}' - CORRECT")
    else:
        print("❌ Step 4 FAILED: Could not find Ch02 in rows")
        test_b_pass = False
    
    if test_b_pass:
        print("\n✅ Step 4 PASSED: Diary validation working correctly")
    
    # CLEANUP
    print("\n" + "=" * 80)
    print("CLEANUP")
    print("=" * 80)
    deleted_count = cleanup_test_data()
    
    # SUMMARY
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    all_pass = test_a_step1_pass and test_a_step2_pass and test_a_step3_pass and test_b_pass
    
    print(f"\nTEST A - Step 1 (First peek): {'✅ PASS' if test_a_step1_pass else '❌ FAIL'}")
    print(f"TEST A - Step 2 (Commit): {'✅ PASS' if test_a_step2_pass else '❌ FAIL'}")
    print(f"TEST A - Step 3 (Re-peek): {'✅ PASS' if test_a_step3_pass else '❌ FAIL'}")
    print(f"TEST B - Step 4 (Diary): {'✅ PASS' if test_b_pass else '❌ FAIL'}")
    print(f"Cleanup: Deleted {deleted_count} items")
    
    if all_pass:
        print("\n🎉 ALL TESTS PASSED")
    else:
        print("\n❌ SOME TESTS FAILED")
    
    print("=" * 80)

if __name__ == "__main__":
    main()
