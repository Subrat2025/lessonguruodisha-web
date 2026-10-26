#!/usr/bin/env python3
"""
Backend test for Ajira Pathya Jojana gap-day roll-forward fix (Sept 21-26, 2026).
Tests the fix that borrows the NEXT available date's lesson plan for gap dates
and remaps dateISO/dateText/dayName to the requested date.
"""

import requests
import json
import sys

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def login_admin():
    """Login as admin and return the token."""
    print("=" * 80)
    print("LOGGING IN AS ADMIN")
    print("=" * 80)
    
    url = f"{BASE_URL}/auth/login"
    payload = {
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Login Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful. Token obtained (length: {len(token)})")
                return token
            else:
                print(f"❌ Login failed: No token in response")
                print(f"Response: {json.dumps(data, indent=2)}")
                return None
        else:
            print(f"❌ Login failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def test_gap_date(token, date, expected_classes_min, test_name):
    """Test a gap date (2026-09-21 through 2026-09-26)."""
    print("\n" + "=" * 80)
    print(f"TEST: {test_name}")
    print(f"Date: {date}")
    print("=" * 80)
    
    url = f"{BASE_URL}/ajira-pathya-jojana?date={date}"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        classes = data.get("classes", [])
        rolled_forward = data.get("rolledForward", False)
        
        print(f"Classes count: {len(classes)}")
        print(f"rolledForward: {rolled_forward}")
        
        # Check classes count
        if len(classes) < expected_classes_min:
            print(f"❌ FAILED: Expected at least {expected_classes_min} classes, got {len(classes)}")
            return False
        
        # Check rolledForward flag
        if not rolled_forward:
            print(f"❌ FAILED: Expected rolledForward=true, got {rolled_forward}")
            return False
        
        # Check dateISO and dateText in returned classes
        expected_date_text = date.split('-')[2] + '.' + date.split('-')[1] + '.' + date.split('-')[0]
        
        all_dates_correct = True
        for i, cls in enumerate(classes):
            cls_date_iso = cls.get("dateISO")
            cls_date_text = cls.get("dateText")
            
            if cls_date_iso != date:
                print(f"❌ FAILED: Class {i} has dateISO={cls_date_iso}, expected {date}")
                all_dates_correct = False
            
            if cls_date_text != expected_date_text:
                print(f"❌ FAILED: Class {i} has dateText={cls_date_text}, expected {expected_date_text}")
                all_dates_correct = False
        
        if not all_dates_correct:
            return False
        
        # Sample first class for verification
        if classes:
            first_class = classes[0]
            print(f"\nSample first class:")
            print(f"  dateISO: {first_class.get('dateISO')}")
            print(f"  dateText: {first_class.get('dateText')}")
            print(f"  dayName: {first_class.get('dayName')}")
            print(f"  className: {first_class.get('className')}")
            print(f"  periods count: {len(first_class.get('periods', []))}")
        
        print(f"✅ PASSED: {test_name}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False

def test_out_of_scope_date(token, date, test_name):
    """Test a date that is out of scope (should NOT be rolled forward)."""
    print("\n" + "=" * 80)
    print(f"TEST: {test_name}")
    print(f"Date: {date}")
    print("=" * 80)
    
    url = f"{BASE_URL}/ajira-pathya-jojana?date={date}"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        classes = data.get("classes", [])
        rolled_forward = data.get("rolledForward", False)
        
        print(f"Classes count: {len(classes)}")
        print(f"rolledForward: {rolled_forward}")
        
        # Check that rolledForward is false
        if rolled_forward:
            print(f"❌ FAILED: Expected rolledForward=false, got {rolled_forward}")
            return False
        
        # Check that classes count is 0 (no data for this date)
        if len(classes) != 0:
            print(f"❌ FAILED: Expected 0 classes (out of scope), got {len(classes)}")
            return False
        
        print(f"✅ PASSED: {test_name}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False

def test_normal_date(token, date, expected_classes_min, test_name):
    """Test a normal date with real data (should NOT be rolled forward)."""
    print("\n" + "=" * 80)
    print(f"TEST: {test_name}")
    print(f"Date: {date}")
    print("=" * 80)
    
    url = f"{BASE_URL}/ajira-pathya-jojana?date={date}"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        classes = data.get("classes", [])
        rolled_forward = data.get("rolledForward", False)
        
        print(f"Classes count: {len(classes)}")
        print(f"rolledForward: {rolled_forward}")
        
        # Check classes count
        if len(classes) < expected_classes_min:
            print(f"❌ FAILED: Expected at least {expected_classes_min} classes, got {len(classes)}")
            return False
        
        # Check rolledForward flag (should be false for normal dates)
        if rolled_forward:
            print(f"❌ FAILED: Expected rolledForward=false, got {rolled_forward}")
            return False
        
        # Check dateISO and dateText in returned classes
        expected_date_text = date.split('-')[2] + '.' + date.split('-')[1] + '.' + date.split('-')[0]
        
        all_dates_correct = True
        for i, cls in enumerate(classes):
            cls_date_iso = cls.get("dateISO")
            cls_date_text = cls.get("dateText")
            
            if cls_date_iso != date:
                print(f"❌ FAILED: Class {i} has dateISO={cls_date_iso}, expected {date}")
                all_dates_correct = False
            
            if cls_date_text != expected_date_text:
                print(f"❌ FAILED: Class {i} has dateText={cls_date_text}, expected {expected_date_text}")
                all_dates_correct = False
        
        if not all_dates_correct:
            return False
        
        # Sample first class for verification
        if classes:
            first_class = classes[0]
            print(f"\nSample first class:")
            print(f"  dateISO: {first_class.get('dateISO')}")
            print(f"  dateText: {first_class.get('dateText')}")
            print(f"  dayName: {first_class.get('dayName')}")
            print(f"  className: {first_class.get('className')}")
            print(f"  periods count: {len(first_class.get('periods', []))}")
        
        print(f"✅ PASSED: {test_name}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False

def test_week_view(token, start_date, test_name):
    """Test week view endpoint."""
    print("\n" + "=" * 80)
    print(f"TEST: {test_name}")
    print(f"Start Date: {start_date}")
    print("=" * 80)
    
    url = f"{BASE_URL}/ajira-pathya-jojana/week?startDate={start_date}"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        days = data.get("days", [])
        
        print(f"Days count: {len(days)}")
        
        if len(days) != 6:
            print(f"❌ FAILED: Expected 6 days (Mon-Sat), got {len(days)}")
            return False
        
        # For the gap week (starting 2026-09-21), check that each day has classes
        if start_date == "2026-09-21":
            print("\nChecking gap week (2026-09-21 to 2026-09-26):")
            expected_dates = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"]
            
            for i, day in enumerate(days):
                day_date = day.get("dateISO")
                classes = day.get("classes", [])
                
                print(f"\n  Day {i+1}: {day_date}")
                print(f"    Classes count: {len(classes)}")
                
                if day_date != expected_dates[i]:
                    print(f"    ❌ FAILED: Expected dateISO={expected_dates[i]}, got {day_date}")
                    return False
                
                if len(classes) == 0:
                    print(f"    ❌ FAILED: Expected classes > 0, got 0")
                    return False
                
                # Check that each class has the correct dateText
                expected_date_text = day_date.split('-')[2] + '.' + day_date.split('-')[1] + '.' + day_date.split('-')[0]
                
                for j, cls in enumerate(classes):
                    cls_date_text = cls.get("dateText")
                    if cls_date_text != expected_date_text:
                        print(f"    ❌ FAILED: Class {j} has dateText={cls_date_text}, expected {expected_date_text}")
                        return False
                
                # Sample first class
                if classes:
                    first_class = classes[0]
                    print(f"    Sample: dateText={first_class.get('dateText')}, dayName={first_class.get('dayName')}")
        
        # For normal week (starting 2026-09-28), just verify structure
        else:
            print("\nChecking normal week:")
            for i, day in enumerate(days):
                day_date = day.get("dateISO")
                classes = day.get("classes", [])
                print(f"  Day {i+1}: {day_date}, classes: {len(classes)}")
        
        print(f"✅ PASSED: {test_name}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception - {e}")
        return False

def main():
    print("\n" + "=" * 80)
    print("AJIRA PATHYA JOJANA GAP-DAY ROLL-FORWARD FIX TEST")
    print("Testing dates 2026-09-21 through 2026-09-26")
    print("=" * 80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ CRITICAL: Failed to login. Cannot proceed with tests.")
        sys.exit(1)
    
    results = []
    
    # Test 1: Gap date 2026-09-21 (Monday)
    results.append(("Test 1: Gap date 2026-09-21", 
                    test_gap_date(token, "2026-09-21", 8, "Gap date 2026-09-21 (Monday)")))
    
    # Test 2: Gap date 2026-09-24 (Thursday)
    results.append(("Test 2: Gap date 2026-09-24", 
                    test_gap_date(token, "2026-09-24", 1, "Gap date 2026-09-24 (Thursday)")))
    
    # Test 3: Gap date 2026-09-26 (Saturday)
    results.append(("Test 3: Gap date 2026-09-26", 
                    test_gap_date(token, "2026-09-26", 1, "Gap date 2026-09-26 (Saturday)")))
    
    # Test 4: Out-of-scope date 2026-09-20 (Sunday, NOT rolled forward)
    results.append(("Test 4: Out-of-scope 2026-09-20", 
                    test_out_of_scope_date(token, "2026-09-20", "Out-of-scope 2026-09-20 (Sunday)")))
    
    # Test 5: Normal date 2026-09-28 (real data, unchanged)
    results.append(("Test 5: Normal date 2026-09-28", 
                    test_normal_date(token, "2026-09-28", 1, "Normal date 2026-09-28 (real data)")))
    
    # Test 6: Normal date 2026-09-19 (real data)
    results.append(("Test 6: Normal date 2026-09-19", 
                    test_normal_date(token, "2026-09-19", 1, "Normal date 2026-09-19 (real data)")))
    
    # Test 7: Week view for gap week (2026-09-21 to 2026-09-26)
    results.append(("Test 7: Week view gap week", 
                    test_week_view(token, "2026-09-21", "Week view for gap week (2026-09-21)")))
    
    # Test 8: Week view for normal week (2026-09-28)
    results.append(("Test 8: Week view normal week", 
                    test_week_view(token, "2026-09-28", "Week view for normal week (2026-09-28)")))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("\n" + "=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
