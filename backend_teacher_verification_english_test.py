#!/usr/bin/env python3
"""
Backend test for Teacher Verification → ENGLISH-ONLY form (Assessment Store)
Tests all 4 tasks from review request with exact error validation.
"""
import requests
import time
import random
from urllib.parse import urlparse, parse_qs, unquote

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Generate random 10-digit mobile starting with 9
TEST_MOBILE = f"9{random.randint(100000000, 999999999)}"
TEST_PASSWORD = "<redacted>"

print("=" * 80)
print("BACKEND TEST: Teacher Verification → ENGLISH-ONLY form")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"Test mobile: {TEST_MOBILE}")
print()

# Track test data for cleanup
test_user_id = None
test_profile_id = None
admin_token = None
user_token = None

try:
    # ========== SETUP: Register fresh user ==========
    print("SETUP: Registering fresh test user...")
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "name": "Test Teacher English",
        "mobile": TEST_MOBILE,
        "password": TEST_PASSWORD
    }, timeout=30)
    print(f"  Register response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        user_token = data.get("token")
        test_user_id = data.get("user", {}).get("id")
        print(f"  ✅ User registered: {test_user_id}")
        print(f"  Token: {user_token[:20]}...")
    else:
        print(f"  ❌ Registration failed: {resp.text}")
        raise Exception("User registration failed")
    
    time.sleep(0.5)  # Rate limit spacing
    
    # ========== SETUP: Admin login ==========
    print("\nSETUP: Admin login...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=30)
    print(f"  Admin login response: {resp.status_code}")
    if resp.status_code == 200:
        admin_token = resp.json().get("token")
        print(f"  ✅ Admin logged in")
        print(f"  Token: {admin_token[:20]}...")
    else:
        print(f"  ❌ Admin login failed: {resp.text}")
        raise Exception("Admin login failed")
    
    time.sleep(0.5)
    
    # ========== TASK 1: POST /assess/teacher/apply VALIDATION ==========
    print("\n" + "=" * 80)
    print("TASK 1: POST /assess/teacher/apply — English-only validation")
    print("=" * 80)
    
    headers = {"Authorization": f"Bearer {user_token}"}
    
    # Test 1a: name_en with Odia characters
    print("\n1a) Testing name_en with Odia characters...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "ସୁକାନ୍ତ",
        "school_en": "Govt School",
        "district": "Khordha",
        "block": "Balianta",
        "udise": "21012345678",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 400 and resp.json().get("error") == "Please enter your full name in English letters":
        print("  ✅ PASS: Correct error for Odia name_en")
    else:
        print(f"  ❌ FAIL: Expected 400 with 'Please enter your full name in English letters', got {resp.status_code}: {resp.json()}")
    
    time.sleep(0.5)
    
    # Test 1b: empty school_en
    print("\n1b) Testing empty school_en...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant",
        "school_en": "",
        "district": "Khordha",
        "block": "Balianta",
        "udise": "21012345678",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 400 and resp.json().get("error") == "Please enter your school name in English letters":
        print("  ✅ PASS: Correct error for empty school_en")
    else:
        print(f"  ❌ FAIL: Expected 400 with 'Please enter your school name in English letters', got {resp.status_code}: {resp.json()}")
    
    time.sleep(0.5)
    
    # Test 1c: empty district
    print("\n1c) Testing empty district...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant",
        "school_en": "Govt School",
        "district": "",
        "block": "Balianta",
        "udise": "21012345678",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 400 and resp.json().get("error") == "Please select your district":
        print("  ✅ PASS: Correct error for empty district")
    else:
        print(f"  ❌ FAIL: Expected 400 with 'Please select your district', got {resp.status_code}: {resp.json()}")
    
    time.sleep(0.5)
    
    # Test 1d: empty block
    print("\n1d) Testing empty block...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant",
        "school_en": "Govt School",
        "district": "Khordha",
        "block": "",
        "udise": "21012345678",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 400 and resp.json().get("error") == "Please enter your block":
        print("  ✅ PASS: Correct error for empty block")
    else:
        print(f"  ❌ FAIL: Expected 400 with 'Please enter your block', got {resp.status_code}: {resp.json()}")
    
    time.sleep(0.5)
    
    # Test 1e: invalid udise (not 11 digits)
    print("\n1e) Testing invalid udise (not 11 digits)...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant",
        "school_en": "Govt School",
        "district": "Khordha",
        "block": "Balianta",
        "udise": "123",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 400 and resp.json().get("error") == "UDISE code must be exactly 11 digits":
        print("  ✅ PASS: Correct error for invalid udise")
    else:
        print(f"  ❌ FAIL: Expected 400 with 'UDISE code must be exactly 11 digits', got {resp.status_code}: {resp.json()}")
    
    time.sleep(0.5)
    
    # Test 1f: invalid mobile
    print("\n1f) Testing invalid mobile...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant",
        "school_en": "Govt School",
        "district": "Khordha",
        "block": "Balianta",
        "udise": "21012345678",
        "mobile": "12345"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 400 and resp.json().get("error") == "Enter a valid 10-digit mobile number":
        print("  ✅ PASS: Correct error for invalid mobile")
    else:
        print(f"  ❌ FAIL: Expected 400 with 'Enter a valid 10-digit mobile number', got {resp.status_code}: {resp.json()}")
    
    time.sleep(0.5)
    
    # Test 1g: VALID submission
    print("\n1g) Testing VALID submission...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant Kumar Sahoo",
        "school_en": "Govt UP School, Kaipadar",
        "district": "Khordha",
        "block": "Balianta",
        "cluster": "Kaipadar Cluster",
        "udise": "21012345678",
        "employee_id": "EMP12345",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    print(f"  Response: {data}")
    if resp.status_code == 200 and data.get("ok") and data.get("profile"):
        profile = data["profile"]
        test_profile_id = profile.get("id")
        print(f"  ✅ PASS: Profile created successfully")
        print(f"  Profile ID: {test_profile_id}")
        print(f"  Status: {profile.get('status')}")
        # Verify all fields persisted
        checks = [
            ("name_en", "Sukant Kumar Sahoo"),
            ("school_en", "Govt UP School, Kaipadar"),
            ("district", "Khordha"),
            ("block", "Balianta"),
            ("cluster", "Kaipadar Cluster"),
            ("udise", "21012345678"),
            ("employee_id", "EMP12345"),
            ("mobile", "9876543210"),
            ("status", "pending")
        ]
        all_ok = True
        for field, expected in checks:
            actual = profile.get(field)
            if actual == expected:
                print(f"    ✅ {field}: {actual}")
            else:
                print(f"    ❌ {field}: expected '{expected}', got '{actual}'")
                all_ok = False
        if all_ok:
            print("  ✅ ALL FIELDS PERSISTED CORRECTLY")
        else:
            print("  ❌ SOME FIELDS NOT PERSISTED CORRECTLY")
    else:
        print(f"  ❌ FAIL: Expected 200 with profile, got {resp.status_code}: {data}")
    
    time.sleep(0.5)
    
    # ========== TASK 2: POST /assess/teacher/verify-code ==========
    print("\n" + "=" * 80)
    print("TASK 2: POST /assess/teacher/verify-code — WhatsApp text uses name_en")
    print("=" * 80)
    
    print("\n2a) Testing verify-code after valid apply...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/verify-code", json={}, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    print(f"  Response: {data}")
    if resp.status_code == 200 and data.get("ok") and data.get("code") and data.get("wa_url"):
        code = data["code"]
        wa_url = data["wa_url"]
        remaining = data.get("remaining_today")
        print(f"  ✅ PASS: verify-code returned successfully")
        print(f"  Code: {code} (length: {len(code)})")
        print(f"  Remaining today: {remaining}")
        print(f"  WA URL: {wa_url}")
        
        # Decode wa_url text parameter
        parsed = urlparse(wa_url)
        query_params = parse_qs(parsed.query)
        wa_text = unquote(query_params.get("text", [""])[0])
        print(f"  Decoded text: '{wa_text}'")
        
        # Expected: "LGO VERIFY {code} Sukant Kumar Sahoo 21012345678"
        expected_text = f"LGO VERIFY {code} Sukant Kumar Sahoo 21012345678"
        if wa_text == expected_text:
            print(f"  ✅ PASS: WA text matches expected (uses name_en)")
            print(f"    Expected: '{expected_text}'")
            print(f"    Actual:   '{wa_text}'")
        else:
            print(f"  ❌ FAIL: WA text does NOT match expected")
            print(f"    Expected: '{expected_text}'")
            print(f"    Actual:   '{wa_text}'")
        
        # Verify code is 6 digits
        if len(code) == 6 and code.isdigit():
            print(f"  ✅ PASS: Code is 6 digits")
        else:
            print(f"  ❌ FAIL: Code is not 6 digits: {code}")
    else:
        print(f"  ❌ FAIL: Expected 200 with code and wa_url, got {resp.status_code}: {data}")
    
    time.sleep(0.5)
    
    # Test 2b: 6th generation (CODE_LIMIT) - but be careful with rate limits
    print("\n2b) Testing 6th generation (CODE_LIMIT)...")
    print("  NOTE: Calling verify-code 5 more times to reach limit (with delays for rate limiting)...")
    for i in range(2, 6):  # Already called once, so 2-6 = 5 more calls
        print(f"  Call {i}/5...")
        resp = requests.post(f"{BASE_URL}/assess/teacher/verify-code", json={}, headers=headers, timeout=30)
        if resp.status_code == 200:
            print(f"    ✅ Call {i}: 200 OK, remaining: {resp.json().get('remaining_today')}")
        else:
            print(f"    ⚠️  Call {i}: {resp.status_code} - {resp.json()}")
        time.sleep(1.5)  # Longer delay to avoid rate limiting
    
    # 6th call should return 429 CODE_LIMIT
    print("  Call 6/6 (should hit limit)...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/verify-code", json={}, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    print(f"  Response: {data}")
    if resp.status_code == 429 and data.get("code") == "CODE_LIMIT":
        error_msg = data.get("error", "")
        expected_msg = "Too many codes generated — please try again after 24 hours."
        print(f"  ✅ PASS: 6th call returned 429 CODE_LIMIT")
        print(f"  Error message: '{error_msg}'")
        if error_msg == expected_msg:
            print(f"  ✅ PASS: Error message is in English as expected")
        else:
            print(f"  ⚠️  NOTE: Error message differs from expected English message")
            print(f"    Expected: '{expected_msg}'")
            print(f"    Actual:   '{error_msg}'")
    else:
        print(f"  ❌ FAIL: Expected 429 with CODE_LIMIT, got {resp.status_code}: {data}")
    
    time.sleep(1)
    
    # ========== TASK 3: Verified teacher no re-approval ==========
    print("\n" + "=" * 80)
    print("TASK 3: Verified teacher may update Cluster/Employee ID without re-approval")
    print("=" * 80)
    
    # First, approve the profile as admin
    print("\n3a) Approving test teacher profile as admin...")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{BASE_URL}/admin/assess/teachers/{test_profile_id}/approve", 
                        json={}, headers=admin_headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    print(f"  Response: {data}")
    if resp.status_code == 200 and data.get("ok"):
        profile = data.get("profile", {})
        print(f"  ✅ PASS: Profile approved successfully")
        print(f"  Status: {profile.get('status')}")
    else:
        print(f"  ❌ FAIL: Expected 200 with ok:true, got {resp.status_code}: {data}")
    
    time.sleep(0.5)
    
    # Now apply again with new cluster/employee_id
    print("\n3b) Applying again with new cluster/employee_id...")
    resp = requests.post(f"{BASE_URL}/assess/teacher/apply", json={
        "name_en": "Sukant Kumar Sahoo",
        "school_en": "Govt UP School, Kaipadar",
        "district": "Khordha",
        "block": "Balianta",
        "cluster": "New Cluster",
        "udise": "21012345678",
        "employee_id": "EMP99999",
        "mobile": "9876543210"
    }, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    print(f"  Response: {data}")
    if resp.status_code == 200 and data.get("ok") and data.get("profile"):
        profile = data["profile"]
        status = profile.get("status")
        cluster = profile.get("cluster")
        employee_id = profile.get("employee_id")
        note = data.get("note")
        print(f"  ✅ PASS: Apply returned successfully")
        print(f"  Status: {status}")
        print(f"  Cluster: {cluster}")
        print(f"  Employee ID: {employee_id}")
        print(f"  Note: {note}")
        
        # Verify status stayed 'approved'
        if status == "approved":
            print(f"  ✅ PASS: Status remained 'approved' (not reset to pending)")
        else:
            print(f"  ❌ FAIL: Status changed to '{status}', expected 'approved'")
        
        # Verify cluster/employee_id updated
        if cluster == "New Cluster" and employee_id == "EMP99999":
            print(f"  ✅ PASS: Cluster and Employee ID updated correctly")
        else:
            print(f"  ❌ FAIL: Cluster or Employee ID not updated correctly")
        
        # Verify note
        if note == "Already verified":
            print(f"  ✅ PASS: Note is 'Already verified'")
        else:
            print(f"  ⚠️  NOTE: Note is '{note}', expected 'Already verified'")
    else:
        print(f"  ❌ FAIL: Expected 200 with profile, got {resp.status_code}: {data}")
    
    time.sleep(0.5)
    
    # ========== TASK 4: Admin list + search ==========
    print("\n" + "=" * 80)
    print("TASK 4: Admin GET /admin/assess/teachers returns + searches new fields")
    print("=" * 80)
    
    print("\n4a) GET /admin/assess/teachers?status=approved...")
    resp = requests.get(f"{BASE_URL}/admin/assess/teachers?status=approved", 
                       headers=admin_headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    if resp.status_code == 200 and "teachers" in data:
        teachers = data["teachers"]
        print(f"  ✅ PASS: Got {len(teachers)} approved teachers")
        
        # Find our test teacher
        test_teacher = None
        for t in teachers:
            if t.get("mobile") == "9876543210" or t.get("id") == test_profile_id:
                test_teacher = t
                break
        
        if test_teacher:
            print(f"  ✅ PASS: Found test teacher in response")
            print(f"  Test teacher fields:")
            fields = ["name_en", "school_en", "district", "block", "cluster", "udise", 
                     "employee_id", "mobile", "verify_code", "status"]
            for field in fields:
                value = test_teacher.get(field)
                print(f"    {field}: {value}")
            
            # Verify all required fields are present
            missing = [f for f in fields if f not in test_teacher]
            if not missing:
                print(f"  ✅ PASS: All required fields present")
            else:
                print(f"  ❌ FAIL: Missing fields: {missing}")
        else:
            print(f"  ⚠️  WARNING: Test teacher not found in approved list")
    else:
        print(f"  ❌ FAIL: Expected 200 with teachers array, got {resp.status_code}: {data}")
    
    time.sleep(0.5)
    
    # Test 4b: Search by cluster
    print("\n4b) GET /admin/assess/teachers?q=Kaipadar (search by cluster)...")
    resp = requests.get(f"{BASE_URL}/admin/assess/teachers?q=Kaipadar", 
                       headers=admin_headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    if resp.status_code == 200 and "teachers" in data:
        teachers = data["teachers"]
        print(f"  ✅ PASS: Got {len(teachers)} teachers matching 'Kaipadar'")
        
        # Check if our test teacher is in results
        found = any(t.get("id") == test_profile_id or t.get("mobile") == "9876543210" 
                   for t in teachers)
        if found:
            print(f"  ✅ PASS: Test teacher found in search results")
        else:
            print(f"  ⚠️  WARNING: Test teacher not found in search results")
            print(f"  (This might be OK if cluster was updated to 'New Cluster')")
    else:
        print(f"  ❌ FAIL: Expected 200 with teachers array, got {resp.status_code}: {data}")
    
    time.sleep(0.5)
    
    # Test 4c: Search by employee_id
    print("\n4c) GET /admin/assess/teachers?q=EMP99999 (search by employee_id)...")
    resp = requests.get(f"{BASE_URL}/admin/assess/teachers?q=EMP99999", 
                       headers=admin_headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    data = resp.json()
    if resp.status_code == 200 and "teachers" in data:
        teachers = data["teachers"]
        print(f"  ✅ PASS: Got {len(teachers)} teachers matching 'EMP99999'")
        
        # Check if our test teacher is in results
        found = any(t.get("id") == test_profile_id or t.get("mobile") == "9876543210" 
                   for t in teachers)
        if found:
            print(f"  ✅ PASS: Test teacher found in search results")
        else:
            print(f"  ❌ FAIL: Test teacher not found in search results")
    else:
        print(f"  ❌ FAIL: Expected 200 with teachers array, got {resp.status_code}: {data}")
    
    print("\n" + "=" * 80)
    print("ALL TESTS COMPLETED")
    print("=" * 80)

except Exception as e:
    print(f"\n❌ TEST FAILED WITH EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

finally:
    # ========== CLEANUP ==========
    print("\n" + "=" * 80)
    print("CLEANUP: Deleting test data...")
    print("=" * 80)
    
    try:
        if test_profile_id and admin_token:
            print(f"\nDeleting test teacher profile: {test_profile_id}...")
            from pymongo import MongoClient
            client = MongoClient("mongodb://localhost:27017")
            db = client["edumaster_odisha"]
            
            # Delete teacher profile
            result = db.assess_teacher_profiles.delete_one({"id": test_profile_id})
            print(f"  Deleted {result.deleted_count} teacher profile(s)")
            
            # Delete user
            if test_user_id:
                result = db.users.delete_one({"id": test_user_id})
                print(f"  Deleted {result.deleted_count} user(s)")
            
            # Delete any security events
            result = db.assess_security_events.delete_many({"user_id": test_user_id})
            print(f"  Deleted {result.deleted_count} security event(s)")
            
            client.close()
            print("  ✅ Cleanup completed")
        else:
            print("  ⚠️  No test data to clean up")
    except Exception as e:
        print(f"  ⚠️  Cleanup failed: {e}")

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)
