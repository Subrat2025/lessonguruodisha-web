#!/usr/bin/env python3
"""
Backend test for Chapter-wise LO Code cascading search endpoints
ROOT-CAUSE FIX: Tests orphan row cleanup and coded-fallback logic
"""
import requests
import sys
import urllib.parse

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login_admin():
    """Login as admin and return token"""
    print("\n=== ADMIN LOGIN ===")
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        print(f"Login status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            print(f"✅ Admin login successful, token: {token[:20]}...")
            return token
        else:
            print(f"❌ Login failed: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def test_1_classes_without_auth():
    """TEST 1: GET /lo-search/classes WITHOUT auth -> 401"""
    print("\n=== TEST 1: GET /lo-search/classes WITHOUT auth ===")
    try:
        resp = requests.get(f"{BASE_URL}/lo-search/classes", timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 401:
            print("✅ TEST 1 PASSED: Correctly returned 401 without auth")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 EXCEPTION: {e}")
        return False

def test_2_classes_with_auth(token):
    """TEST 2: GET /lo-search/classes WITH admin auth -> 200, includes "Class 1" """
    print("\n=== TEST 2: GET /lo-search/classes WITH admin auth ===")
    try:
        resp = requests.get(
            f"{BASE_URL}/lo-search/classes",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            classes = data.get("classes", [])
            print(f"Classes: {classes}")
            if "Class 1" in classes:
                print("✅ TEST 2 PASSED: Got 200 with 'Class 1' in classes")
                return True
            else:
                print(f"❌ TEST 2 FAILED: 'Class 1' not in classes: {classes}")
                return False
        else:
            print(f"❌ TEST 2 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 EXCEPTION: {e}")
        return False

def test_3_subjects(token):
    """TEST 3: GET /lo-search/subjects?className=Class 1 -> 200, includes "Odia" """
    print("\n=== TEST 3: GET /lo-search/subjects?className=Class 1 ===")
    try:
        params = {"className": "Class 1"}
        resp = requests.get(
            f"{BASE_URL}/lo-search/subjects",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            subjects = data.get("subjects", [])
            print(f"Subjects: {subjects}")
            if "Odia" in subjects:
                print("✅ TEST 3 PASSED: Got 200 with 'Odia' in subjects")
                return True
            else:
                print(f"❌ TEST 3 FAILED: 'Odia' not in subjects: {subjects}")
                return False
        else:
            print(f"❌ TEST 3 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 3 EXCEPTION: {e}")
        return False

def test_4_topics(token):
    """TEST 4: GET /lo-search/topics?className=Class 1&subject=Odia -> 200, ~28 topics"""
    print("\n=== TEST 4: GET /lo-search/topics?className=Class 1&subject=Odia ===")
    try:
        params = {"className": "Class 1", "subject": "Odia"}
        resp = requests.get(
            f"{BASE_URL}/lo-search/topics",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            topics = data.get("topics", [])
            print(f"Total topics: {len(topics)}")
            if len(topics) > 0:
                print(f"First topic: {topics[0].get('topic', '')}")
                print(f"Topics structure: {topics[0].keys() if topics else 'N/A'}")
            if len(topics) >= 20:  # ~28 expected
                print(f"✅ TEST 4 PASSED: Got {len(topics)} topics (expected ~28)")
                return True, topics
            else:
                print(f"❌ TEST 4 FAILED: Expected ~28 topics, got {len(topics)}")
                return False, topics
        else:
            print(f"❌ TEST 4 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False, []
    except Exception as e:
        print(f"❌ TEST 4 EXCEPTION: {e}")
        return False, []

def test_5_periods_orphan_check(token):
    """TEST 5: GET /lo-search/periods for topic 'ପାଠ ୨ — ଚକୁଳି କଲା ଟେଁ ଟାଁ' -> EXACTLY ONE period==14, id != ORPHAN-TEST-1"""
    print("\n=== TEST 5: GET /lo-search/periods (ORPHAN CHECK) ===")
    target_topic = "ପାଠ ୨ — ଚକୁଳି କଲା ଟେଁ ଟାଁ"
    print(f"Target topic: {target_topic}")
    try:
        params = {"className": "Class 1", "subject": "Odia", "topic": target_topic}
        resp = requests.get(
            f"{BASE_URL}/lo-search/periods",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            periods = data.get("periods", [])
            print(f"Total periods: {len(periods)}")
            
            # Find period 14
            period_14_entries = [p for p in periods if p.get("period") == 14]
            print(f"Period 14 entries: {len(period_14_entries)}")
            
            if len(period_14_entries) == 1:
                period_14 = period_14_entries[0]
                period_14_id = period_14.get("id")
                print(f"Period 14 ID: {period_14_id}")
                print(f"Period 14 full data: {period_14}")
                
                if period_14_id != "ORPHAN-TEST-1":
                    print(f"✅ TEST 5 PASSED: Exactly ONE period 14, id={period_14_id} (NOT ORPHAN-TEST-1)")
                    return True, period_14_id, periods
                else:
                    print(f"❌ TEST 5 FAILED: Period 14 id is ORPHAN-TEST-1 (orphan NOT purged)")
                    return False, period_14_id, periods
            elif len(period_14_entries) == 0:
                print(f"❌ TEST 5 FAILED: No period 14 found in periods list")
                return False, None, periods
            else:
                print(f"❌ TEST 5 FAILED: Multiple period 14 entries found: {len(period_14_entries)}")
                for p in period_14_entries:
                    print(f"  - id={p.get('id')}, period={p.get('period')}")
                return False, None, periods
        else:
            print(f"❌ TEST 5 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False, None, []
    except Exception as e:
        print(f"❌ TEST 5 EXCEPTION: {e}")
        return False, None, []

def test_6_detail_codes_present(token, period_id):
    """TEST 6: GET /lo-search/detail?id=<period-14 id> -> 200, codes present"""
    print(f"\n=== TEST 6: GET /lo-search/detail?id={period_id} ===")
    try:
        params = {"id": period_id}
        resp = requests.get(
            f"{BASE_URL}/lo-search/detail",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            detail = data.get("detail", {})
            
            cg_code = detail.get("cg", {}).get("code")
            competency_code = detail.get("competency", {}).get("code")
            lo_code = detail.get("lo", {}).get("code")
            lld_code = detail.get("lld", {}).get("code")
            
            print(f"cg.code: {cg_code}")
            print(f"competency.code: {competency_code}")
            print(f"lo.code: {lo_code}")
            print(f"lld.code: {lld_code}")
            
            # Check if codes are present (not None and not empty)
            codes_present = all([
                cg_code and cg_code != "",
                competency_code and competency_code != "",
                lo_code and lo_code != "",
                lld_code and lld_code != ""
            ])
            
            if codes_present:
                print(f"✅ TEST 6 PASSED: All codes present (cg, competency, lo, lld)")
                print(f"\n📋 PERIOD-14 DETAIL JSON:")
                import json
                print(json.dumps(detail, indent=2, ensure_ascii=False))
                return True
            else:
                print(f"❌ TEST 6 FAILED: Some codes missing or empty")
                return False
        else:
            print(f"❌ TEST 6 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 6 EXCEPTION: {e}")
        return False

def test_7_spot_check_periods(token, periods):
    """TEST 7: Spot-check periods 15, 20, 26 -> all have codes"""
    print("\n=== TEST 7: SPOT-CHECK periods 15, 20, 26 ===")
    target_periods = [15, 20, 26]
    results = []
    
    for period_num in target_periods:
        period_entries = [p for p in periods if p.get("period") == period_num]
        if not period_entries:
            print(f"⚠️  Period {period_num} not found in periods list")
            results.append(False)
            continue
        
        period_id = period_entries[0].get("id")
        print(f"\nChecking period {period_num} (id={period_id})...")
        
        try:
            params = {"id": period_id}
            resp = requests.get(
                f"{BASE_URL}/lo-search/detail",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                detail = data.get("detail", {})
                
                cg_code = detail.get("cg", {}).get("code")
                lo_code = detail.get("lo", {}).get("code")
                
                if cg_code or lo_code:
                    print(f"✅ Period {period_num}: codes present (cg={cg_code}, lo={lo_code})")
                    results.append(True)
                else:
                    print(f"❌ Period {period_num}: NO codes found")
                    results.append(False)
            else:
                print(f"❌ Period {period_num}: HTTP {resp.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ Period {period_num}: Exception {e}")
            results.append(False)
    
    if all(results):
        print(f"\n✅ TEST 7 PASSED: All spot-checked periods have codes")
        return True
    else:
        print(f"\n❌ TEST 7 FAILED: Some periods missing codes")
        return False

def test_8_orphan_404(token):
    """TEST 8: GET /lo-search/detail?id=ORPHAN-TEST-1 -> 404 (orphan purged)"""
    print("\n=== TEST 8: GET /lo-search/detail?id=ORPHAN-TEST-1 ===")
    try:
        params = {"id": "ORPHAN-TEST-1"}
        resp = requests.get(
            f"{BASE_URL}/lo-search/detail",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 404:
            print("✅ TEST 8 PASSED: ORPHAN-TEST-1 returns 404 (orphan purged)")
            return True
        else:
            print(f"❌ TEST 8 FAILED: Expected 404, got {resp.status_code}")
            if resp.status_code == 200:
                print(f"⚠️  ORPHAN-TEST-1 still exists: {resp.json()}")
            return False
    except Exception as e:
        print(f"❌ TEST 8 EXCEPTION: {e}")
        return False

def test_9_missing_params(token):
    """TEST 9: GET /lo-search/detail with missing params -> 400"""
    print("\n=== TEST 9: GET /lo-search/detail with missing params ===")
    try:
        # No id and no className
        resp = requests.get(
            f"{BASE_URL}/lo-search/detail",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 400:
            print("✅ TEST 9 PASSED: Missing params returns 400")
            return True
        else:
            print(f"❌ TEST 9 FAILED: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 9 EXCEPTION: {e}")
        return False

def test_10_nonexistent_id(token):
    """TEST 10: GET /lo-search/detail?id=nonexistent-uuid -> 404"""
    print("\n=== TEST 10: GET /lo-search/detail?id=nonexistent-uuid ===")
    try:
        params = {"id": "00000000-0000-0000-0000-000000000000"}
        resp = requests.get(
            f"{BASE_URL}/lo-search/detail",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 404:
            print("✅ TEST 10 PASSED: Nonexistent id returns 404")
            return True
        else:
            print(f"❌ TEST 10 FAILED: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 10 EXCEPTION: {e}")
        return False

def main():
    print("=" * 80)
    print("CHAPTER-WISE LO CODE CASCADING SEARCH - ORPHAN FIX TEST")
    print("=" * 80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Admin login failed")
        sys.exit(1)
    
    results = []
    
    # TEST 1: No auth -> 401
    results.append(("TEST 1: /classes without auth -> 401", test_1_classes_without_auth()))
    
    # TEST 2: With auth -> 200, includes "Class 1"
    results.append(("TEST 2: /classes with auth -> 200, Class 1", test_2_classes_with_auth(token)))
    
    # TEST 3: Subjects
    results.append(("TEST 3: /subjects -> 200, Odia", test_3_subjects(token)))
    
    # TEST 4: Topics
    test_4_result, topics = test_4_topics(token)
    results.append(("TEST 4: /topics -> 200, ~28 topics", test_4_result))
    
    # TEST 5: Periods - ORPHAN CHECK (CRITICAL)
    test_5_result, period_14_id, periods = test_5_periods_orphan_check(token)
    results.append(("TEST 5: /periods -> EXACTLY ONE period 14, NOT ORPHAN-TEST-1", test_5_result))
    
    # TEST 6: Detail codes present (CRITICAL)
    if period_14_id:
        results.append(("TEST 6: /detail period-14 -> codes present", test_6_detail_codes_present(token, period_14_id)))
    else:
        print("\n⚠️  TEST 6 SKIPPED: No valid period-14 id from TEST 5")
        results.append(("TEST 6: /detail period-14 -> codes present", False))
    
    # TEST 7: Spot-check periods 15, 20, 26
    if periods:
        results.append(("TEST 7: Spot-check periods 15,20,26 -> codes", test_7_spot_check_periods(token, periods)))
    else:
        print("\n⚠️  TEST 7 SKIPPED: No periods from TEST 5")
        results.append(("TEST 7: Spot-check periods 15,20,26 -> codes", False))
    
    # TEST 8: ORPHAN-TEST-1 -> 404 (CRITICAL)
    results.append(("TEST 8: /detail ORPHAN-TEST-1 -> 404", test_8_orphan_404(token)))
    
    # TEST 9: Missing params -> 400
    results.append(("TEST 9: /detail missing params -> 400", test_9_missing_params(token)))
    
    # TEST 10: Nonexistent id -> 404
    results.append(("TEST 10: /detail nonexistent id -> 404", test_10_nonexistent_id(token)))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = 0
    failed = 0
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("\n" + "=" * 80)
    print(f"TOTAL: {passed} passed, {failed} failed out of {len(results)} tests")
    print("=" * 80)
    
    if failed == 0:
        print("\n🎉 ALL TESTS PASSED! Orphan cleanup fix is working correctly.")
        sys.exit(0)
    else:
        print(f"\n⚠️  {failed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
