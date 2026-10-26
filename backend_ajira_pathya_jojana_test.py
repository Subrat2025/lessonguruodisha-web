#!/usr/bin/env python3
"""
Backend Test: Ajira Pathya Jojana (Today's Lesson Plan) Endpoints
Tests the two new endpoints:
1. GET /api/ajira-pathya-jojana/range (public)
2. GET /api/ajira-pathya-jojana?date=YYYY-MM-DD (auth + premium gated)
"""

import requests
import sys
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_CREDS = {"mobile": "9692604577", "password": "<redacted>"}
PREMIUM_CREDS = {"mobile": "9999900001", "password": "<redacted>"}
EXPIRED_CREDS = {"mobile": "9000000099", "password": "test1234"}

def login(creds):
    """Login and return token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_range_endpoint():
    """Test A1: GET /api/ajira-pathya-jojana/range (public, no auth)"""
    print("\n" + "="*80)
    print("TEST A1: GET /api/ajira-pathya-jojana/range (public)")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana/range", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Verify structure
        if "firstDate" not in data or "lastDate" not in data or "availableDates" not in data:
            print(f"❌ FAIL: Missing required fields. Got: {data}")
            return False
        
        first_date = data["firstDate"]
        last_date = data["lastDate"]
        available_dates = data["availableDates"]
        
        print(f"firstDate: {first_date}")
        print(f"lastDate: {last_date}")
        print(f"availableDates count: {len(available_dates)}")
        
        # Verify expected values
        if first_date != "2026-04-02":
            print(f"❌ FAIL: Expected firstDate='2026-04-02', got '{first_date}'")
            return False
        
        if last_date != "2027-03-06":
            print(f"❌ FAIL: Expected lastDate='2027-03-06', got '{last_date}'")
            return False
        
        # Should have 180-200 distinct dates (190 days across 5 classes)
        if not (180 <= len(available_dates) <= 200):
            print(f"❌ FAIL: Expected 180-200 dates, got {len(available_dates)}")
            return False
        
        print(f"✅ PASS: Range endpoint working correctly")
        print(f"   - firstDate: {first_date}")
        print(f"   - lastDate: {last_date}")
        print(f"   - availableDates: {len(available_dates)} dates")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_no_auth():
    """Test B1: Call without token → 401"""
    print("\n" + "="*80)
    print("TEST B1: GET /api/ajira-pathya-jojana without auth → 401")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        print(f"✅ PASS: Correctly returns 401 Unauthorized without token")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_expired_user_no_date(token):
    """Test B2: Expired user without ?date → 402 SUBSCRIPTION_REQUIRED"""
    print("\n" + "="*80)
    print("TEST B2: Expired user without ?date → 402 SUBSCRIPTION_REQUIRED")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 402:
            print(f"❌ FAIL: Expected 402, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        if data.get("code") != "SUBSCRIPTION_REQUIRED":
            print(f"❌ FAIL: Expected code='SUBSCRIPTION_REQUIRED', got {data}")
            return False
        
        print(f"✅ PASS: Correctly returns 402 with SUBSCRIPTION_REQUIRED")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_expired_user_with_date(token):
    """Test B3: Expired user with ?date=2026-04-02 → 402 SUBSCRIPTION_REQUIRED"""
    print("\n" + "="*80)
    print("TEST B3: Expired user with ?date=2026-04-02 → 402 SUBSCRIPTION_REQUIRED")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana?date=2026-04-02", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 402:
            print(f"❌ FAIL: Expected 402, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        if data.get("code") != "SUBSCRIPTION_REQUIRED":
            print(f"❌ FAIL: Expected code='SUBSCRIPTION_REQUIRED', got {data}")
            return False
        
        print(f"✅ PASS: Correctly returns 402 with SUBSCRIPTION_REQUIRED")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_premium_user_valid_date(token):
    """Test B4: Premium user with ?date=2026-04-02 → 200 with 5 classes"""
    print("\n" + "="*80)
    print("TEST B4: Premium user with ?date=2026-04-02 → 200 with 5 classes")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana?date=2026-04-02", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Verify structure
        if "dateISO" not in data or "classes" not in data or "neighbours" not in data:
            print(f"❌ FAIL: Missing required fields. Got: {list(data.keys())}")
            return False
        
        date_iso = data["dateISO"]
        classes = data["classes"]
        neighbours = data["neighbours"]
        
        print(f"dateISO: {date_iso}")
        print(f"classes count: {len(classes)}")
        print(f"neighbours: {neighbours}")
        
        # Verify dateISO
        if date_iso != "2026-04-02":
            print(f"❌ FAIL: Expected dateISO='2026-04-02', got '{date_iso}'")
            return False
        
        # Verify 5 classes
        if len(classes) != 5:
            print(f"❌ FAIL: Expected 5 classes, got {len(classes)}")
            return False
        
        # Verify neighbours is null (data exists)
        if neighbours is not None:
            print(f"❌ FAIL: Expected neighbours=null when data exists, got {neighbours}")
            return False
        
        # Verify each class has periods
        all_periods_valid = True
        for cls in classes:
            class_code = cls.get("classCode")
            periods = cls.get("periods", [])
            print(f"  Class {class_code}: {len(periods)} periods")
            
            if len(periods) < 1:
                print(f"    ❌ FAIL: Class {class_code} has no periods")
                all_periods_valid = False
                continue
            
            # Verify each period has required fields
            for i, period in enumerate(periods):
                required_fields = ["periodNo", "time", "subject", "tlm", "lessonLines", 
                                 "loCode", "cgCodes", "panchapadi", "assessment", "homework"]
                missing = [f for f in required_fields if f not in period]
                if missing:
                    print(f"    ❌ FAIL: Period {i+1} missing fields: {missing}")
                    all_periods_valid = False
                
                # Verify panchapadi has 5 steps
                panchapadi = period.get("panchapadi", [])
                if len(panchapadi) != 5:
                    print(f"    ❌ FAIL: Period {i+1} panchapadi has {len(panchapadi)} steps, expected 5")
                    all_periods_valid = False
        
        if not all_periods_valid:
            return False
        
        # Verify Class 1 and 2 have 7 periods each
        class_1 = next((c for c in classes if c.get("classCode") == 1), None)
        class_2 = next((c for c in classes if c.get("classCode") == 2), None)
        
        if class_1 and len(class_1.get("periods", [])) != 7:
            print(f"❌ FAIL: Class 1 should have 7 periods, got {len(class_1.get('periods', []))}")
            return False
        
        if class_2 and len(class_2.get("periods", [])) != 7:
            print(f"❌ FAIL: Class 2 should have 7 periods, got {len(class_2.get('periods', []))}")
            return False
        
        # Verify Class 3, 4, 5 also have 7 periods (regression check)
        for class_code in [3, 4, 5]:
            cls = next((c for c in classes if c.get("classCode") == class_code), None)
            if cls and len(cls.get("periods", [])) != 7:
                print(f"❌ FAIL: Class {class_code} should have 7 periods, got {len(cls.get('periods', []))}")
                return False
        
        # Verify subjects include Odia and Math for Class 1
        if class_1:
            subjects = [p.get("subject") for p in class_1.get("periods", [])]
            print(f"  Class 1 subjects: {subjects}")
            
            has_odia = any("ଓଡ଼ିଆ" in s for s in subjects)
            has_math = any("ଗଣିତ" in s for s in subjects)
            
            if not has_odia:
                print(f"❌ FAIL: Class 1 should have Odia (ଓଡ଼ିଆ) subject")
                return False
            
            if not has_math:
                print(f"❌ FAIL: Class 1 should have Math (ଗଣିତ) subject")
                return False
        
        print(f"✅ PASS: Premium user can access lesson plans with correct structure")
        print(f"   - dateISO: {date_iso}")
        print(f"   - classes: {len(classes)}")
        print(f"   - All classes have 7 periods")
        print(f"   - All periods have required fields including 5-step panchapadi")
        print(f"   - Class 1 has Odia and Math subjects")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        import traceback
        traceback.print_exc()
        return False

def test_premium_user_sunday(token):
    """Test B5: Premium user with ?date=2026-08-02 (Sunday) → 200, classes=[], neighbours present"""
    print("\n" + "="*80)
    print("TEST B5: Premium user with ?date=2026-08-02 (Sunday) → 200, classes=[], neighbours")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana?date=2026-08-02", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        
        date_iso = data.get("dateISO")
        classes = data.get("classes", [])
        neighbours = data.get("neighbours")
        
        print(f"dateISO: {date_iso}")
        print(f"classes count: {len(classes)}")
        print(f"neighbours: {neighbours}")
        
        # Verify dateISO
        if date_iso != "2026-08-02":
            print(f"❌ FAIL: Expected dateISO='2026-08-02', got '{date_iso}'")
            return False
        
        # Verify classes is empty
        if len(classes) != 0:
            print(f"❌ FAIL: Expected empty classes[], got {len(classes)} classes")
            return False
        
        # Verify neighbours is present and has prevDate and nextDate
        if neighbours is None:
            print(f"❌ FAIL: Expected neighbours object, got null")
            return False
        
        if "prevDate" not in neighbours or "nextDate" not in neighbours:
            print(f"❌ FAIL: neighbours missing prevDate or nextDate: {neighbours}")
            return False
        
        prev_date = neighbours.get("prevDate")
        next_date = neighbours.get("nextDate")
        
        print(f"  prevDate: {prev_date}")
        print(f"  nextDate: {next_date}")
        
        # Verify both are non-null strings in YYYY-MM-DD format
        if not prev_date or not isinstance(prev_date, str):
            print(f"❌ FAIL: prevDate should be non-null string, got {prev_date}")
            return False
        
        if not next_date or not isinstance(next_date, str):
            print(f"❌ FAIL: nextDate should be non-null string, got {next_date}")
            return False
        
        # Verify format YYYY-MM-DD
        import re
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', prev_date):
            print(f"❌ FAIL: prevDate not in YYYY-MM-DD format: {prev_date}")
            return False
        
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', next_date):
            print(f"❌ FAIL: nextDate not in YYYY-MM-DD format: {next_date}")
            return False
        
        print(f"✅ PASS: Sunday (no data) returns empty classes with neighbours")
        print(f"   - classes: []")
        print(f"   - neighbours.prevDate: {prev_date}")
        print(f"   - neighbours.nextDate: {next_date}")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_bypass(token):
    """Test B6: Admin with ?date=2026-04-02 → 200 with 5 classes (bypasses premium)"""
    print("\n" + "="*80)
    print("TEST B6: Admin with ?date=2026-04-02 → 200 (bypasses premium)")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana?date=2026-04-02", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        classes = data.get("classes", [])
        
        print(f"classes count: {len(classes)}")
        
        if len(classes) != 5:
            print(f"❌ FAIL: Expected 5 classes, got {len(classes)}")
            return False
        
        print(f"✅ PASS: Admin can access lesson plans (bypasses premium check)")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_invalid_date_format(token):
    """Test B7: Invalid date format → 400"""
    print("\n" + "="*80)
    print("TEST B7: Invalid date format ?date=not-a-date → 400")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana?date=not-a-date", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        error = data.get("error", "")
        print(f"Error message: {error}")
        
        if "Invalid date" not in error:
            print(f"❌ FAIL: Expected 'Invalid date' in error message, got: {error}")
            return False
        
        print(f"✅ PASS: Invalid date format correctly rejected with 400")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_no_date(token):
    """Test B8: Admin without ?date (default = today IST) → 200"""
    print("\n" + "="*80)
    print("TEST B8: Admin without ?date (default = today IST) → 200")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/ajira-pathya-jojana", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        date_iso = data.get("dateISO")
        classes = data.get("classes", [])
        
        print(f"dateISO (today IST): {date_iso}")
        print(f"classes count: {len(classes)}")
        
        # Today is likely outside the data range (2026-04-02 to 2027-03-06)
        # So classes may be empty, but response should be 200 (not 500)
        print(f"✅ PASS: Admin can call without ?date, defaults to today IST")
        print(f"   - dateISO: {date_iso}")
        print(f"   - classes: {len(classes)} (may be empty if today is outside data range)")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def verify_collection_data():
    """Test C1-C3: Verify MongoDB collection data"""
    print("\n" + "="*80)
    print("TEST C1-C3: Verify MongoDB collection data")
    print("="*80)
    
    try:
        import subprocess
        
        # C1: Verify 950 documents
        print("\nC1: Verify collection has 950 documents")
        result = subprocess.run(
            ["mongosh", "mongodb://localhost:27017/edumaster_odisha", "--quiet", 
             "--eval", "db.ajira_lessons.countDocuments()"],
            capture_output=True, text=True, timeout=10
        )
        count = int(result.stdout.strip())
        print(f"Document count: {count}")
        
        if count != 950:
            print(f"❌ FAIL: Expected 950 documents, got {count}")
            return False
        
        print(f"✅ PASS: Collection has exactly 950 documents")
        
        # C2: Verify Class 1 at 2026-04-02 has 7 periods with Odia and Math
        print("\nC2: Verify Class 1 at 2026-04-02 has 7 periods with Odia and Math")
        result = subprocess.run(
            ["mongosh", "mongodb://localhost:27017/edumaster_odisha", "--quiet",
             "--eval", "JSON.stringify(db.ajira_lessons.findOne({classCode: 1, dateISO: '2026-04-02'}, {periods: 1}))"],
            capture_output=True, text=True, timeout=10
        )
        
        import json
        doc = json.loads(result.stdout.strip())
        periods = doc.get("periods", [])
        
        print(f"Class 1 periods count: {len(periods)}")
        
        if len(periods) != 7:
            print(f"❌ FAIL: Expected 7 periods, got {len(periods)}")
            return False
        
        subjects = [p.get("subject") for p in periods]
        print(f"Subjects: {subjects}")
        
        has_odia = any("ଓଡ଼ିଆ" in s for s in subjects)
        has_math = any("ଗଣିତ" in s for s in subjects)
        
        if not has_odia:
            print(f"❌ FAIL: Class 1 should have Odia (ଓଡ଼ିଆ) subject")
            return False
        
        if not has_math:
            print(f"❌ FAIL: Class 1 should have Math (ଗଣିତ) subject")
            return False
        
        print(f"✅ PASS: Class 1 has 7 periods with Odia and Math")
        
        # C3: Verify Class 3, 4, 5 each have 7 periods (regression check)
        print("\nC3: Verify Class 3, 4, 5 each have 7 periods (regression check)")
        for class_code in [3, 4, 5]:
            result = subprocess.run(
                ["mongosh", "mongodb://localhost:27017/edumaster_odisha", "--quiet",
                 "--eval", f"db.ajira_lessons.findOne({{classCode: {class_code}, dateISO: '2026-04-02'}}).periods.length"],
                capture_output=True, text=True, timeout=10
            )
            period_count = int(result.stdout.strip())
            print(f"Class {class_code} periods count: {period_count}")
            
            if period_count != 7:
                print(f"❌ FAIL: Class {class_code} should have 7 periods, got {period_count}")
                return False
        
        print(f"✅ PASS: Classes 3, 4, 5 each have 7 periods (regression check passed)")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("BACKEND TEST: Ajira Pathya Jojana Endpoints")
    print("="*80)
    
    results = []
    
    # Test A1: Range endpoint (public)
    results.append(("A1: Range endpoint (public)", test_range_endpoint()))
    
    # Test B1: No auth
    results.append(("B1: No auth → 401", test_no_auth()))
    
    # Login expired user
    print("\n" + "="*80)
    print("Logging in as EXPIRED user (9000000099)")
    print("="*80)
    expired_token = login(EXPIRED_CREDS)
    if not expired_token:
        print("❌ CRITICAL: Could not login as expired user")
        sys.exit(1)
    print(f"✅ Expired user token obtained")
    
    # Test B2-B3: Expired user
    results.append(("B2: Expired user without date → 402", test_expired_user_no_date(expired_token)))
    results.append(("B3: Expired user with date → 402", test_expired_user_with_date(expired_token)))
    
    # Login premium user
    print("\n" + "="*80)
    print("Logging in as PREMIUM user (9999900001)")
    print("="*80)
    premium_token = login(PREMIUM_CREDS)
    if not premium_token:
        print("❌ CRITICAL: Could not login as premium user")
        sys.exit(1)
    print(f"✅ Premium user token obtained")
    
    # Test B4-B5: Premium user
    results.append(("B4: Premium user valid date → 200", test_premium_user_valid_date(premium_token)))
    results.append(("B5: Premium user Sunday → 200 with neighbours", test_premium_user_sunday(premium_token)))
    
    # Login admin
    print("\n" + "="*80)
    print("Logging in as ADMIN (9692604577)")
    print("="*80)
    admin_token = login(ADMIN_CREDS)
    if not admin_token:
        print("❌ CRITICAL: Could not login as admin")
        sys.exit(1)
    print(f"✅ Admin token obtained")
    
    # Test B6-B8: Admin
    results.append(("B6: Admin bypass premium → 200", test_admin_bypass(admin_token)))
    results.append(("B7: Invalid date format → 400", test_invalid_date_format(admin_token)))
    results.append(("B8: Admin without date → 200", test_admin_no_date(admin_token)))
    
    # Test C1-C3: MongoDB data verification
    results.append(("C1-C3: MongoDB data verification", verify_collection_data()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
