#!/usr/bin/env python3
"""
Backend test for Assessment Store A/F: WhatsApp verify-code + leak trace-upload + add_note
Test date: 2026-09-30
"""
import requests
import os
import base64
import uuid
from datetime import datetime
from pymongo import MongoClient

# Environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

# Test credentials
ADMIN_MOBILE = '9999999999'
ADMIN_PASSWORD = 'admin123'
TEST_USER_MOBILE = '9000000001'
TEST_USER_PASSWORD = '<redacted>'

# MongoDB client
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Test state
admin_token = None
user_token = None
user_id = None
synthetic_copy_id = None
synthetic_event_id = None
audit_ids = []

def login(mobile, password):
    """Login and return token"""
    try:
        resp = requests.post(f"{API_URL}/auth/login", json={'mobile': mobile, 'password': password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('token'), data.get('user', {}).get('id')
        else:
            print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text[:200]}")
            return None, None
    except Exception as e:
        print(f"❌ Login error for {mobile}: {e}")
        return None, None

def test_teacher_apply():
    """TEST 1: Create teacher profile"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/assess/teacher/apply - CREATE TEACHER PROFILE")
    print("="*80)
    
    try:
        headers = {'Authorization': f'Bearer {user_token}'}
        payload = {
            'name': 'Test Teacher',
            'school': 'Test School',
            'district': 'Khordha',
            'udise': '12345678901'
        }
        
        resp = requests.post(f"{API_URL}/assess/teacher/apply", json=payload, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Teacher profile created successfully")
            print(f"   Profile: {data.get('profile', {}).get('name')} - {data.get('profile', {}).get('school')}")
            return True
        else:
            print(f"❌ Failed to create teacher profile: {resp.text[:300]}")
            return False
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_verify_code_calls():
    """TEST 2: Call verify-code 6 times to trigger limit"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/assess/teacher/verify-code - CALL 6 TIMES")
    print("="*80)
    
    headers = {'Authorization': f'Bearer {user_token}'}
    codes = []
    
    for i in range(1, 7):
        try:
            resp = requests.post(f"{API_URL}/assess/teacher/verify-code", json={}, headers=headers, timeout=10)
            print(f"\nCall {i}: Status {resp.status_code}")
            
            if resp.status_code == 200:
                data = resp.json()
                code = data.get('code')
                wa_url = data.get('wa_url')
                remaining = data.get('remaining_today')
                
                print(f"✅ Success - Code: {code}, Remaining: {remaining}")
                print(f"   WA URL: {wa_url[:80]}...")
                
                # Verify code format (6-digit)
                if code and len(code) == 6 and code.isdigit():
                    print(f"   ✅ Code format valid (6-digit)")
                else:
                    print(f"   ❌ Code format invalid: {code}")
                
                # Verify wa_url format
                if wa_url and wa_url.startswith('https://wa.me/918093414633?text=') and 'LGO VERIFY' in wa_url:
                    print(f"   ✅ WA URL format valid")
                else:
                    print(f"   ❌ WA URL format invalid")
                
                codes.append(code)
                
            elif resp.status_code == 429:
                data = resp.json()
                error_code = data.get('code')
                error_msg = data.get('error')
                
                print(f"✅ 429 LIMIT REACHED as expected")
                print(f"   Code: {error_code}")
                print(f"   Error: {error_msg}")
                
                if error_code == 'CODE_LIMIT':
                    print(f"   ✅ Error code is 'CODE_LIMIT'")
                    return True
                else:
                    print(f"   ❌ Error code should be 'CODE_LIMIT', got: {error_code}")
                    return False
            else:
                print(f"❌ Unexpected status: {resp.text[:300]}")
                
        except Exception as e:
            print(f"❌ Exception on call {i}: {e}")
    
    print(f"\n❌ Did not receive 429 CODE_LIMIT after 6 calls")
    return False

def test_security_event():
    """TEST 3: Verify assess_security_events row exists"""
    print("\n" + "="*80)
    print("TEST 3: VERIFY assess_security_events ROW EXISTS")
    print("="*80)
    
    try:
        # Find security event for this user
        event = db.assess_security_events.find_one({
            'user_id': user_id,
            'type': 'many_wrong_codes'
        }, sort=[('created_at', -1)])
        
        if event:
            global synthetic_event_id
            synthetic_event_id = event.get('id')
            print(f"✅ Security event found")
            print(f"   Event ID: {synthetic_event_id}")
            print(f"   Type: {event.get('type')}")
            print(f"   Details: {event.get('details')}")
            print(f"   Status: {event.get('status')}")
            
            # Verify user is NOT locked
            user = db.users.find_one({'id': user_id})
            locked = user.get('assess_download_lock', {}).get('locked', False) if user else False
            
            if not locked:
                print(f"✅ User account is NOT locked (as expected)")
                return True
            else:
                print(f"❌ User account is locked (should NOT be locked by this rule)")
                return False
        else:
            print(f"❌ No security event found for user {user_id}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_admin_teachers_endpoint():
    """TEST 4: Admin GET /api/admin/assess/teachers includes verify_code"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/admin/assess/teachers - VERIFY verify_code FIELD")
    print("="*80)
    
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.get(f"{API_URL}/admin/assess/teachers", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            teachers = data.get('teachers', [])
            print(f"✅ Got {len(teachers)} teachers")
            
            # Find our test user's profile
            test_profile = None
            for t in teachers:
                if t.get('user_mobile') == TEST_USER_MOBILE:
                    test_profile = t
                    break
            
            if test_profile:
                print(f"✅ Found test user's profile")
                print(f"   Name: {test_profile.get('name')}")
                print(f"   Mobile: {test_profile.get('user_mobile')}")
                
                # Check if verify_code field is present
                if 'verify_code' in test_profile:
                    print(f"   ✅ verify_code field present: {test_profile.get('verify_code')}")
                else:
                    print(f"   ❌ verify_code field missing")
                    return False
                
                # Check if user_mobile field is present
                if 'user_mobile' in test_profile:
                    print(f"   ✅ user_mobile field present: {test_profile.get('user_mobile')}")
                else:
                    print(f"   ❌ user_mobile field missing")
                    return False
                
                return True
            else:
                print(f"❌ Test user's profile not found in response")
                return False
        else:
            print(f"❌ Failed: {resp.text[:300]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_trace_upload_with_copy_id():
    """TEST 5: Insert synthetic assess_copies row and test trace-upload"""
    print("\n" + "="*80)
    print("TEST 5: POST /api/admin/assess/trace-upload - WITH copy_id IN FILE")
    print("="*80)
    
    try:
        # Insert synthetic assess_copies row
        global synthetic_copy_id
        synthetic_copy_id = f"LG-TEST-{uuid.uuid4().hex[:8].upper()}"
        
        copy_doc = {
            'id': str(uuid.uuid4()),
            'copy_id': synthetic_copy_id,
            'user_id': user_id,
            'user_name': 'Test Teacher',
            'user_mobile': TEST_USER_MOBILE,
            'document_title': 'Doc X',
            'via': 'single',
            'oath_accepted_at': datetime.utcnow(),
            'at': datetime.utcnow()
        }
        
        db.assess_copies.insert_one(copy_doc)
        print(f"✅ Inserted synthetic assess_copies row: {synthetic_copy_id}")
        
        # Build a small buffer with copy_id
        file_content = f"This is a test PDF file.\ncopy_id:{synthetic_copy_id}\nSome more content here."
        file_base64 = base64.b64encode(file_content.encode()).decode()
        
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = {
            'kind': 'pdf',
            'file_base64': file_base64
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/trace-upload", json=payload, headers=headers, timeout=10)
        print(f"\nStatus: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Trace-upload successful")
            print(f"   copy_id: {data.get('copy_id')}")
            print(f"   found: {data.get('found')}")
            
            # Verify copy_id matches
            if data.get('copy_id') == synthetic_copy_id:
                print(f"   ✅ copy_id matches: {synthetic_copy_id}")
            else:
                print(f"   ❌ copy_id mismatch: expected {synthetic_copy_id}, got {data.get('copy_id')}")
                return False
            
            # Verify found is true
            if data.get('found') is True:
                print(f"   ✅ found is True")
            else:
                print(f"   ❌ found should be True, got: {data.get('found')}")
                return False
            
            # Verify buyer is populated
            buyer = data.get('buyer')
            if buyer and buyer.get('mobile') == TEST_USER_MOBILE:
                print(f"   ✅ buyer populated: {buyer.get('name')} ({buyer.get('mobile')})")
            else:
                print(f"   ❌ buyer not populated correctly")
                return False
            
            # Verify copies array is non-empty
            copies = data.get('copies', [])
            if len(copies) > 0:
                print(f"   ✅ copies array non-empty: {len(copies)} items")
            else:
                print(f"   ❌ copies array is empty")
                return False
            
            # Verify assess_admin_audit row was written
            audit = db.assess_admin_audit.find_one({
                'action': 'trace_upload',
                'copy_id': synthetic_copy_id
            }, sort=[('at', -1)])
            
            if audit:
                audit_ids.append(audit.get('id'))
                print(f"   ✅ assess_admin_audit row written: {audit.get('id')}")
                return True
            else:
                print(f"   ❌ assess_admin_audit row not found")
                return False
        else:
            print(f"❌ Failed: {resp.text[:300]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_trace_upload_no_copy_id():
    """TEST 6: Test trace-upload with no copy_id in file"""
    print("\n" + "="*80)
    print("TEST 6: POST /api/admin/assess/trace-upload - NO copy_id IN FILE")
    print("="*80)
    
    try:
        # Build a buffer without copy_id
        file_content = "hello no code here, just some random text"
        file_base64 = base64.b64encode(file_content.encode()).decode()
        
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = {
            'kind': 'pdf',
            'file_base64': file_base64
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/trace-upload", json=payload, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Response received")
            
            # Verify needs_manual is true
            if data.get('needs_manual') is True:
                print(f"   ✅ needs_manual is True")
            else:
                print(f"   ❌ needs_manual should be True, got: {data.get('needs_manual')}")
                return False
            
            # Verify message is present
            if data.get('message'):
                print(f"   ✅ message present: {data.get('message')[:80]}...")
                return True
            else:
                print(f"   ❌ message missing")
                return False
        else:
            print(f"❌ Failed: {resp.text[:300]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_trace_upload_image():
    """TEST 7: Test trace-upload with kind:'image'"""
    print("\n" + "="*80)
    print("TEST 7: POST /api/admin/assess/trace-upload - kind:'image'")
    print("="*80)
    
    try:
        # Build a small buffer (any content)
        file_content = "fake image data"
        file_base64 = base64.b64encode(file_content.encode()).decode()
        
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = {
            'kind': 'image',
            'file_base64': file_base64
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/trace-upload", json=payload, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Response received")
            
            # Verify needs_manual is true
            if data.get('needs_manual') is True:
                print(f"   ✅ needs_manual is True")
                return True
            else:
                print(f"   ❌ needs_manual should be True, got: {data.get('needs_manual')}")
                return False
        else:
            print(f"❌ Failed: {resp.text[:300]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_add_note():
    """TEST 8: Test add_note endpoint"""
    print("\n" + "="*80)
    print("TEST 8: POST /api/admin/assess/security/action - action:'add_note'")
    print("="*80)
    
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = {
            'user_id': user_id,
            'action': 'add_note',
            'note': 'test note',
            'copy_id': synthetic_copy_id
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/security/action", json=payload, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Response received")
            
            # Verify noted is true
            if data.get('noted') is True:
                print(f"   ✅ noted is True")
            else:
                print(f"   ❌ noted should be True, got: {data.get('noted')}")
                return False
            
            # Verify assess_admin_audit row was written
            audit = db.assess_admin_audit.find_one({
                'action': 'security_note',
                'target_user_id': user_id,
                'copy_id': synthetic_copy_id
            }, sort=[('at', -1)])
            
            if audit:
                audit_ids.append(audit.get('id'))
                print(f"   ✅ assess_admin_audit row written: {audit.get('id')}")
                return True
            else:
                print(f"   ❌ assess_admin_audit row not found")
                return False
        else:
            print(f"❌ Failed: {resp.text[:300]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_add_note_missing_note():
    """TEST 9: Test add_note without note field"""
    print("\n" + "="*80)
    print("TEST 9: POST /api/admin/assess/security/action - MISSING note")
    print("="*80)
    
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = {
            'user_id': user_id,
            'action': 'add_note',
            'copy_id': synthetic_copy_id
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/security/action", json=payload, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 400:
            print(f"✅ 400 error as expected")
            print(f"   Error: {resp.json().get('error')}")
            return True
        else:
            print(f"❌ Expected 400, got {resp.status_code}: {resp.text[:300]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_non_admin_access():
    """TEST 10: Test non-admin access to admin endpoints"""
    print("\n" + "="*80)
    print("TEST 10: NON-ADMIN ACCESS - trace-upload and add_note")
    print("="*80)
    
    try:
        # Test trace-upload with user token
        headers = {'Authorization': f'Bearer {user_token}'}
        payload = {
            'kind': 'pdf',
            'file_base64': base64.b64encode(b"test").decode()
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/trace-upload", json=payload, headers=headers, timeout=10)
        print(f"trace-upload with user token: Status {resp.status_code}")
        
        if resp.status_code in [401, 403]:
            print(f"   ✅ Correctly rejected with {resp.status_code}")
        else:
            print(f"   ❌ Should be 401/403, got {resp.status_code}")
            return False
        
        # Test add_note with user token
        payload = {
            'user_id': user_id,
            'action': 'add_note',
            'note': 'test'
        }
        
        resp = requests.post(f"{API_URL}/admin/assess/security/action", json=payload, headers=headers, timeout=10)
        print(f"add_note with user token: Status {resp.status_code}")
        
        if resp.status_code in [401, 403]:
            print(f"   ✅ Correctly rejected with {resp.status_code}")
            return True
        else:
            print(f"   ❌ Should be 401/403, got {resp.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def cleanup():
    """Clean up all test data"""
    print("\n" + "="*80)
    print("CLEANUP: Removing test data")
    print("="*80)
    
    try:
        # Remove synthetic assess_copies row
        if synthetic_copy_id:
            result = db.assess_copies.delete_many({'copy_id': synthetic_copy_id})
            print(f"✅ Deleted {result.deleted_count} assess_copies rows")
        
        # Remove security event
        if synthetic_event_id:
            result = db.assess_security_events.delete_many({'id': synthetic_event_id})
            print(f"✅ Deleted {result.deleted_count} assess_security_events rows")
        
        # Remove audit rows
        if audit_ids:
            result = db.assess_admin_audit.delete_many({'id': {'$in': audit_ids}})
            print(f"✅ Deleted {result.deleted_count} assess_admin_audit rows")
        
        # Unset verify_code fields from test teacher profile
        result = db.assess_teacher_profiles.update_one(
            {'user_id': user_id},
            {'$unset': {
                'verify_code': '',
                'verify_code_at': '',
                'verify_code_expires': '',
                'verify_code_window_start': '',
                'verify_code_count': ''
            }}
        )
        print(f"✅ Unset verify_code fields from teacher profile (matched: {result.matched_count})")
        
        print(f"✅ Cleanup complete")
        
    except Exception as e:
        print(f"❌ Cleanup error: {e}")

def main():
    """Run all tests"""
    global admin_token, user_token, user_id
    
    print("\n" + "="*80)
    print("ASSESSMENT STORE A/F: WhatsApp verify-code + leak trace-upload + add_note")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"API URL: {API_URL}")
    print(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Login
    print("\n" + "="*80)
    print("SETUP: Login")
    print("="*80)
    
    admin_token, _ = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ Admin login failed, aborting")
        return
    print(f"✅ Admin logged in")
    
    user_token, user_id = login(TEST_USER_MOBILE, TEST_USER_PASSWORD)
    if not user_token:
        print("❌ User login failed, aborting")
        return
    print(f"✅ User logged in (ID: {user_id})")
    
    # Run tests
    results = []
    
    results.append(("Teacher profile creation", test_teacher_apply()))
    results.append(("Verify-code 6 calls (429 CODE_LIMIT)", test_verify_code_calls()))
    results.append(("Security event exists (many_wrong_codes)", test_security_event()))
    results.append(("Admin teachers endpoint includes verify_code", test_admin_teachers_endpoint()))
    results.append(("Trace-upload with copy_id", test_trace_upload_with_copy_id()))
    results.append(("Trace-upload no copy_id (needs_manual)", test_trace_upload_no_copy_id()))
    results.append(("Trace-upload kind:image (needs_manual)", test_trace_upload_image()))
    results.append(("Add note endpoint", test_add_note()))
    results.append(("Add note missing note (400)", test_add_note_missing_note()))
    results.append(("Non-admin access (401/403)", test_non_admin_access()))
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    print(f"{'='*80}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == '__main__':
    main()
