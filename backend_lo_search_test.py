#!/usr/bin/env python3
"""
Backend test for Chapter-wise LO Code cascading search endpoints (/lo-search/*)
Tests all 6 validation items from the review request.
"""

import requests
import json
import urllib.parse
from typing import Dict, Any

# Base URL (internal)
BASE_URL = "http://localhost:3000/api"

# Admin credentials (SINGLE-DEVICE - log in once, reuse token)
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def print_test(test_num: str, description: str):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def print_result(passed: bool, message: str):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")

def login_admin() -> str:
    """Login as admin and return token"""
    print_test("0", "ADMIN LOGIN (SINGLE-DEVICE)")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                print_result(True, f"Admin login successful, token obtained (length: {len(token)})")
                return token
            else:
                print_result(False, "No token in response")
                return None
        else:
            print_result(False, f"Login failed: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Login exception: {e}")
        return None

def test_1_classes_auth(token: str) -> bool:
    """Test 1: GET /lo-search/classes -> 401 WITHOUT token; WITH token 200 { classes:[...] } includes "Class 1" """
    print_test("1", "GET /lo-search/classes (Auth + Response)")
    
    all_passed = True
    
    # 1a: Without token -> 401
    try:
        response = requests.get(f"{BASE_URL}/lo-search/classes", timeout=10)
        print(f"\n1a. WITHOUT token - Status: {response.status_code}")
        if response.status_code == 401:
            print_result(True, "Correctly rejected without token (401)")
        else:
            print_result(False, f"Expected 401, got {response.status_code}")
            all_passed = False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        all_passed = False
    
    # 1b: With token -> 200 with classes including "Class 1"
    try:
        response = requests.get(
            f"{BASE_URL}/lo-search/classes",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"\n1b. WITH token - Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            classes = data.get('classes', [])
            print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
            
            if isinstance(classes, list):
                print_result(True, f"Got classes array with {len(classes)} items")
                
                if "Class 1" in classes:
                    print_result(True, '"Class 1" found in classes array')
                else:
                    print_result(False, f'"Class 1" NOT found. Classes: {classes}')
                    all_passed = False
            else:
                print_result(False, f"classes is not an array: {type(classes)}")
                all_passed = False
        else:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        all_passed = False
    
    return all_passed

def test_2_subjects(token: str) -> bool:
    """Test 2: GET /lo-search/subjects?className=Class 1 -> 200 { subjects:[...] } includes "Odia" """
    print_test("2", "GET /lo-search/subjects?className=Class%201")
    
    try:
        # URL-encode "Class 1" -> "Class%201"
        params = {"className": "Class 1"}
        response = requests.get(
            f"{BASE_URL}/lo-search/subjects",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            subjects = data.get('subjects', [])
            print(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
            
            if isinstance(subjects, list):
                print_result(True, f"Got subjects array with {len(subjects)} items")
                
                if "Odia" in subjects:
                    print_result(True, '"Odia" found in subjects array')
                    return True
                else:
                    print_result(False, f'"Odia" NOT found. Subjects: {subjects}')
                    return False
            else:
                print_result(False, f"subjects is not an array: {type(subjects)}")
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return False

def test_3_topics(token: str) -> tuple:
    """Test 3: GET /lo-search/topics?className=Class 1&subject=Odia -> 200 { topics:[{topic,prasang,periods}] } ~28 entries """
    print_test("3", "GET /lo-search/topics?className=Class%201&subject=Odia")
    
    try:
        params = {"className": "Class 1", "subject": "Odia"}
        response = requests.get(
            f"{BASE_URL}/lo-search/topics",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            topics = data.get('topics', [])
            print(f"Response (first 2 topics): {json.dumps(topics[:2], indent=2, ensure_ascii=False)}")
            print(f"Total topics: {len(topics)}")
            
            if isinstance(topics, list) and len(topics) > 0:
                print_result(True, f"Got topics array with {len(topics)} items (expected ~28)")
                
                # Validate structure of first topic
                first_topic = topics[0]
                has_topic = 'topic' in first_topic
                has_prasang = 'prasang' in first_topic
                has_periods = 'periods' in first_topic
                
                if has_topic and has_prasang and has_periods:
                    print_result(True, f"Topics have correct structure: topic, prasang, periods")
                    print(f"First topic: {first_topic.get('topic')}")
                    return (True, first_topic.get('topic'))
                else:
                    print_result(False, f"Topics missing fields. First topic: {first_topic}")
                    return (False, None)
            else:
                print_result(False, f"topics is empty or not an array: {topics}")
                return (False, None)
        else:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            return (False, None)
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return (False, None)

def test_4_periods(token: str, topic: str) -> tuple:
    """Test 4: GET /lo-search/periods?className=Class 1&subject=Odia&topic=<first topic> -> 200 { periods:[{id,seq,period,periodLabel,bishaya}] } non-empty """
    print_test("4", f"GET /lo-search/periods (topic: {topic})")
    
    try:
        params = {"className": "Class 1", "subject": "Odia", "topic": topic}
        response = requests.get(
            f"{BASE_URL}/lo-search/periods",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            periods = data.get('periods', [])
            print(f"Response (first 2 periods): {json.dumps(periods[:2], indent=2, ensure_ascii=False)}")
            print(f"Total periods: {len(periods)}")
            
            if isinstance(periods, list) and len(periods) > 0:
                print_result(True, f"Got periods array with {len(periods)} items (non-empty)")
                
                # Validate structure of first period
                first_period = periods[0]
                has_id = 'id' in first_period
                has_seq = 'seq' in first_period
                has_period = 'period' in first_period
                has_periodLabel = 'periodLabel' in first_period
                has_bishaya = 'bishaya' in first_period
                
                if has_id and has_seq and has_period and has_periodLabel and has_bishaya:
                    print_result(True, f"Periods have correct structure: id, seq, period, periodLabel, bishaya")
                    print(f"First period ID: {first_period.get('id')}")
                    return (True, first_period.get('id'))
                else:
                    print_result(False, f"Periods missing fields. First period: {first_period}")
                    return (False, None)
            else:
                print_result(False, f"periods is empty or not an array: {periods}")
                return (False, None)
        else:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            return (False, None)
    except Exception as e:
        print_result(False, f"Exception: {e}")
        return (False, None)

def test_5_detail(token: str, period_id: str, topic: str) -> bool:
    """Test 5: GET /lo-search/detail?id=<period id> AND with className/subject/topic/period params """
    print_test("5", "GET /lo-search/detail (by id AND by params)")
    
    all_passed = True
    
    # 5a: By ID
    try:
        params = {"id": period_id}
        response = requests.get(
            f"{BASE_URL}/lo-search/detail",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"\n5a. By ID - Status: {response.status_code}")
        print(f"URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            detail = data.get('detail', {})
            print(f"Response keys: {list(detail.keys())}")
            
            # Validate structure
            required_fields = ['cg', 'competency', 'competencyFramework', 'lo', 'lld', 'periodLabel', 'bishaya', 'topic', 'prasang']
            missing_fields = [f for f in required_fields if f not in detail]
            
            if not missing_fields:
                print_result(True, "Detail has all required fields")
                
                # Validate cg/competency/lo/lld structure (each should have code and text)
                code_fields = ['cg', 'competency', 'lo', 'lld']
                for field in code_fields:
                    obj = detail.get(field)
                    if obj and isinstance(obj, dict) and 'code' in obj and 'text' in obj:
                        print_result(True, f"{field} has code and text: {obj.get('code')}")
                    else:
                        print_result(False, f"{field} missing code/text structure: {obj}")
                        all_passed = False
            else:
                print_result(False, f"Detail missing fields: {missing_fields}")
                all_passed = False
        else:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        all_passed = False
    
    # 5b: By className/subject/topic/period
    try:
        params = {"className": "Class 1", "subject": "Odia", "topic": topic, "period": 1}
        response = requests.get(
            f"{BASE_URL}/lo-search/detail",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"\n5b. By params - Status: {response.status_code}")
        print(f"URL: {response.url}")
        
        if response.status_code == 200:
            data = response.json()
            detail = data.get('detail', {})
            print_result(True, f"Got detail by params: {list(detail.keys())}")
        else:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        all_passed = False
    
    return all_passed

def test_6_error_cases(token: str) -> bool:
    """Test 6: GET /lo-search/detail with missing params -> 400; with unknown id -> 404 """
    print_test("6", "GET /lo-search/detail (Error cases)")
    
    all_passed = True
    
    # 6a: Missing params (no id, no className/subject/topic/period)
    try:
        response = requests.get(
            f"{BASE_URL}/lo-search/detail",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"\n6a. Missing params - Status: {response.status_code}")
        
        if response.status_code == 400:
            print_result(True, "Correctly returned 400 for missing params")
        else:
            print_result(False, f"Expected 400, got {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        all_passed = False
    
    # 6b: Unknown id -> 404
    try:
        params = {"id": "nope"}
        response = requests.get(
            f"{BASE_URL}/lo-search/detail",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"\n6b. Unknown id - Status: {response.status_code}")
        
        if response.status_code == 404:
            print_result(True, "Correctly returned 404 for unknown id")
        else:
            print_result(False, f"Expected 404, got {response.status_code}: {response.text}")
            all_passed = False
    except Exception as e:
        print_result(False, f"Exception: {e}")
        all_passed = False
    
    return all_passed

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CHAPTER-WISE LO CODE CASCADING SEARCH ENDPOINTS TEST")
    print("Testing /lo-search/* endpoints (6 validation items)")
    print("="*80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Could not obtain admin token. Aborting tests.")
        return
    
    # Test results
    results = {}
    
    # Test 1: Classes (auth + response)
    results['test_1'] = test_1_classes_auth(token)
    
    # Test 2: Subjects
    results['test_2'] = test_2_subjects(token)
    
    # Test 3: Topics (returns first topic for next test)
    test_3_result, first_topic = test_3_topics(token)
    results['test_3'] = test_3_result
    
    if not first_topic:
        print("\n❌ FATAL: Could not get first topic. Aborting remaining tests.")
        print_summary(results)
        return
    
    # Test 4: Periods (returns first period id for next test)
    test_4_result, first_period_id = test_4_periods(token, first_topic)
    results['test_4'] = test_4_result
    
    if not first_period_id:
        print("\n❌ FATAL: Could not get first period id. Aborting remaining tests.")
        print_summary(results)
        return
    
    # Test 5: Detail (by id and by params)
    results['test_5'] = test_5_detail(token, first_period_id, first_topic)
    
    # Test 6: Error cases
    results['test_6'] = test_6_error_cases(token)
    
    # Print summary
    print_summary(results)

def print_summary(results: Dict[str, bool]):
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total if total > 0 else 0}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Chapter-wise LO Code cascading search endpoints are working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Review the output above for details.")

if __name__ == "__main__":
    main()
