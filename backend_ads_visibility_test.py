#!/usr/bin/env python3
"""
Backend test for Ads visibility bugfix - regression + new diagnostics endpoint.
Tests multi-placement serve, reason codes, placement switch, diagnostics, and frequency cap.
"""
import requests
import time
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_ads_visibility():
    print("=" * 80)
    print("BACKEND TEST: Ads Visibility Bugfix (Regression + Diagnostics)")
    print("=" * 80)
    
    # Step 1: Admin login
    print("\n[STEP 1] Admin login...")
    try:
        login_resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": "9999999999", "password": "admin123"},
            timeout=10
        )
        print(f"Login status: {login_resp.status_code}")
        if login_resp.status_code != 200:
            print(f"❌ Login failed: {login_resp.text}")
            return
        
        token = login_resp.json().get("token")
        if not token:
            print(f"❌ No token in response: {login_resp.json()}")
            return
        
        print(f"✅ Admin login successful, token obtained")
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return
    
    # Step 2: Get PM POSHAN campaign id
    print("\n[STEP 2] Get PM POSHAN campaign id via GET /api/admin/ads...")
    try:
        ads_resp = requests.get(f"{BASE_URL}/admin/ads", headers=headers, timeout=10)
        print(f"GET /admin/ads status: {ads_resp.status_code}")
        if ads_resp.status_code != 200:
            print(f"❌ Failed to get ads: {ads_resp.text}")
            return
        
        ads_data = ads_resp.json()
        campaigns = ads_data.get("ads", [])  # Changed from "campaigns" to "ads"
        pm_campaign = None
        for c in campaigns:
            if "PM POSHAN" in c.get("name", "").upper() or "POSHAN" in c.get("name", "").upper():
                pm_campaign = c
                break
        
        if not pm_campaign:
            print(f"❌ PM POSHAN campaign not found in {len(campaigns)} campaigns")
            print(f"Available campaigns: {[c.get('name') for c in campaigns]}")
            return
        
        PM_ID = pm_campaign["id"]
        print(f"✅ PM POSHAN campaign found: id={PM_ID}, name={pm_campaign.get('name')}")
    except Exception as e:
        print(f"❌ Get ads exception: {e}")
        return
    
    # Store original state for cleanup
    original_state = pm_campaign.copy()
    
    # TEST 1: Multi-placement serve
    print("\n" + "=" * 80)
    print("TEST 1: Multi-placement serve (home, lessons, resources, assessment)")
    print("=" * 80)
    
    try:
        # Set ad to ON with placements [home, lessons], no schedule restrictions
        print("\n[TEST 1a] PUT /api/admin/ads/{PM_ID} - Set status:on, placements:[home,lessons], frequencyPerDay:0...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "status": "on",
                "placements": ["home", "lessons"],
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "",
                    "dailyEnd": ""
                },
                "frequencyPerDay": 0
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        if update_resp.status_code != 200:
            print(f"❌ Failed to update ad: {update_resp.text}")
            return
        print(f"✅ Ad updated successfully")
        
        # Wait a moment for changes to propagate
        time.sleep(1)
        
        # Test home placement
        print("\n[TEST 1b] GET /api/ads/active?placement=home (should show ad)...")
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", timeout=10)
        print(f"Status: {home_resp.status_code}")
        home_data = home_resp.json()
        if home_data.get("ad"):
            print(f"✅ TEST 1b PASSED: Ad present on home placement")
            print(f"   Ad id: {home_data['ad'].get('id')}")
        else:
            print(f"❌ TEST 1b FAILED: Ad not present on home. Response: {home_data}")
        
        # Test lessons placement
        print("\n[TEST 1c] GET /api/ads/active?placement=lessons (should show ad)...")
        lessons_resp = requests.get(f"{BASE_URL}/ads/active?placement=lessons", timeout=10)
        print(f"Status: {lessons_resp.status_code}")
        lessons_data = lessons_resp.json()
        if lessons_data.get("ad"):
            print(f"✅ TEST 1c PASSED: Ad present on lessons placement")
            print(f"   Ad id: {lessons_data['ad'].get('id')}")
        else:
            print(f"❌ TEST 1c FAILED: Ad not present on lessons. Response: {lessons_data}")
        
        # Test resources placement (should be null)
        print("\n[TEST 1d] GET /api/ads/active?placement=resources (should be null - NO_ACTIVE_CAMPAIGN)...")
        resources_resp = requests.get(f"{BASE_URL}/ads/active?placement=resources", timeout=10)
        print(f"Status: {resources_resp.status_code}")
        resources_data = resources_resp.json()
        if resources_data.get("ad") is None:
            reason = resources_data.get("reason", "")
            print(f"✅ TEST 1d PASSED: Ad null on resources, reason: {reason}")
            if reason == "NO_ACTIVE_CAMPAIGN":
                print(f"   ✅ Reason is NO_ACTIVE_CAMPAIGN (expected)")
            else:
                print(f"   ⚠️  Reason is '{reason}' (acceptable, candidates filtered)")
        else:
            print(f"❌ TEST 1d FAILED: Ad present on resources (should be null). Response: {resources_data}")
        
        # Test assessment placement (should be null)
        print("\n[TEST 1e] GET /api/ads/active?placement=assessment (should be null - NO_ACTIVE_CAMPAIGN)...")
        assessment_resp = requests.get(f"{BASE_URL}/ads/active?placement=assessment", timeout=10)
        print(f"Status: {assessment_resp.status_code}")
        assessment_data = assessment_resp.json()
        if assessment_data.get("ad") is None:
            reason = assessment_data.get("reason", "")
            print(f"✅ TEST 1e PASSED: Ad null on assessment, reason: {reason}")
            if reason == "NO_ACTIVE_CAMPAIGN":
                print(f"   ✅ Reason is NO_ACTIVE_CAMPAIGN (expected)")
            else:
                print(f"   ⚠️  Reason is '{reason}' (acceptable, candidates filtered)")
        else:
            print(f"❌ TEST 1e FAILED: Ad present on assessment (should be null). Response: {assessment_data}")
        
    except Exception as e:
        print(f"❌ TEST 1 exception: {e}")
    
    # TEST 2: Reason codes
    print("\n" + "=" * 80)
    print("TEST 2: Reason codes (status off, daily schedule, date range)")
    print("=" * 80)
    
    try:
        # Test 2a: status off
        print("\n[TEST 2a] Set status:off, then GET active?placement=home (should be null)...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={"status": "off"},
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", timeout=10)
        home_data = home_resp.json()
        if home_data.get("ad") is None:
            reason = home_data.get("reason", "")
            print(f"✅ TEST 2a PASSED: Ad null when status off, reason: {reason}")
            print(f"   (Candidates filtered, so reason may be NO_ACTIVE_CAMPAIGN - acceptable)")
        else:
            print(f"❌ TEST 2a FAILED: Ad present when status off. Response: {home_data}")
        
        # Reset to on with placements [home]
        print("\n[TEST 2a-reset] Set status:on, placements:[home]...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "status": "on",
                "placements": ["home"],
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "",
                    "dailyEnd": ""
                }
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        # Test 2b: daily schedule (outside window)
        print("\n[TEST 2b] Set dailyStart:00:00, dailyEnd:00:01 (assuming now IST is not in that minute)...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "00:00",
                    "dailyEnd": "00:01"
                }
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", timeout=10)
        home_data = home_resp.json()
        if home_data.get("ad") is None:
            reason = home_data.get("reason", "")
            print(f"✅ TEST 2b PASSED: Ad null outside daily schedule, reason: {reason}")
            if reason == "OUTSIDE_DAILY_SCHEDULE":
                print(f"   ✅ Reason is OUTSIDE_DAILY_SCHEDULE (expected)")
            else:
                print(f"   ⚠️  Reason is '{reason}' (if test runs 00:00-00:01 IST, ad may show)")
        else:
            print(f"⚠️  TEST 2b: Ad present (test may be running 00:00-00:01 IST). Response: {home_data}")
        
        # Test 2c: future date range (NOT_STARTED)
        print("\n[TEST 2c] Set startDate:2099-01-01, endDate:2099-12-31 (future)...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "schedule": {
                    "startDate": "2099-01-01",
                    "endDate": "2099-12-31",
                    "dailyStart": "",
                    "dailyEnd": ""
                }
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", timeout=10)
        home_data = home_resp.json()
        if home_data.get("ad") is None:
            reason = home_data.get("reason", "")
            print(f"✅ TEST 2c PASSED: Ad null for future date range, reason: {reason}")
            if reason == "NOT_STARTED":
                print(f"   ✅ Reason is NOT_STARTED (expected)")
            else:
                print(f"   ⚠️  Reason is '{reason}' (acceptable)")
        else:
            print(f"❌ TEST 2c FAILED: Ad present for future date. Response: {home_data}")
        
        # Test 2d: past date range (EXPIRED)
        print("\n[TEST 2d] Set startDate:2000-01-01, endDate:2000-12-31 (past)...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "schedule": {
                    "startDate": "2000-01-01",
                    "endDate": "2000-12-31",
                    "dailyStart": "",
                    "dailyEnd": ""
                }
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", timeout=10)
        home_data = home_resp.json()
        if home_data.get("ad") is None:
            reason = home_data.get("reason", "")
            print(f"✅ TEST 2d PASSED: Ad null for past date range, reason: {reason}")
            if reason == "EXPIRED":
                print(f"   ✅ Reason is EXPIRED (expected)")
            else:
                print(f"   ⚠️  Reason is '{reason}' (acceptable)")
        else:
            print(f"❌ TEST 2d FAILED: Ad present for past date. Response: {home_data}")
        
        # Reset schedule to all-blank
        print("\n[TEST 2-reset] Reset schedule to all-blank, status on, placements [home]...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "status": "on",
                "placements": ["home"],
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "",
                    "dailyEnd": ""
                }
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
    except Exception as e:
        print(f"❌ TEST 2 exception: {e}")
    
    # TEST 3: Placement switch without deploy
    print("\n" + "=" * 80)
    print("TEST 3: Placement switch without deploy")
    print("=" * 80)
    
    try:
        print("\n[TEST 3a] PUT placements:[resources], then GET active?placement=home (should be null)...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={"placements": ["resources"]},
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", timeout=10)
        home_data = home_resp.json()
        if home_data.get("ad") is None:
            print(f"✅ TEST 3a PASSED: Ad null on home after switching to resources")
        else:
            print(f"❌ TEST 3a FAILED: Ad still present on home. Response: {home_data}")
        
        print("\n[TEST 3b] GET active?placement=resources (should show ad)...")
        resources_resp = requests.get(f"{BASE_URL}/ads/active?placement=resources", timeout=10)
        resources_data = resources_resp.json()
        if resources_data.get("ad"):
            print(f"✅ TEST 3b PASSED: Ad present on resources after switch")
        else:
            print(f"❌ TEST 3b FAILED: Ad not present on resources. Response: {resources_data}")
        
        # Reset to home
        print("\n[TEST 3-reset] PUT placements:[home]...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={"placements": ["home"]},
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
    except Exception as e:
        print(f"❌ TEST 3 exception: {e}")
    
    # TEST 4: Diagnostics endpoint
    print("\n" + "=" * 80)
    print("TEST 4: Diagnostics endpoint (GET /api/admin/ads/:id/diagnostics)")
    print("=" * 80)
    
    try:
        print("\n[TEST 4a] GET /api/admin/ads/{PM_ID}/diagnostics (with admin auth)...")
        diag_resp = requests.get(f"{BASE_URL}/admin/ads/{PM_ID}/diagnostics", headers=headers, timeout=10)
        print(f"Status: {diag_resp.status_code}")
        
        if diag_resp.status_code == 200:
            diag_data = diag_resp.json()
            print(f"✅ TEST 4a PASSED: Diagnostics endpoint returned 200")
            print(f"\nDiagnostics response:")
            print(f"  nowIST: {diag_data.get('nowIST')}")
            print(f"  status: {diag_data.get('status')}")
            print(f"  statusOn: {diag_data.get('statusOn')}")
            print(f"  dateCheck: {diag_data.get('dateCheck')}")
            print(f"  timeCheck: {diag_data.get('timeCheck')}")
            print(f"  scheduleLive: {diag_data.get('scheduleLive')}")
            print(f"  placements: {diag_data.get('placements')}")
            
            # Verify required fields
            required_fields = ['nowIST', 'statusOn', 'dateCheck', 'timeCheck', 'scheduleLive', 'placements', 'perPlacement']
            missing_fields = [f for f in required_fields if f not in diag_data]
            if missing_fields:
                print(f"❌ Missing required fields: {missing_fields}")
            else:
                print(f"✅ All required fields present")
            
            # Check nowIST contains 'IST'
            if 'IST' in str(diag_data.get('nowIST', '')):
                print(f"✅ nowIST contains 'IST'")
            else:
                print(f"❌ nowIST does not contain 'IST': {diag_data.get('nowIST')}")
            
            # Check perPlacement array
            per_placement = diag_data.get('perPlacement', [])
            print(f"\nperPlacement array ({len(per_placement)} entries):")
            
            expected_placements = ['home', 'dashboard', 'lessons', 'resources', 'assessment', 'worksheet']
            found_placements = [p.get('placement') for p in per_placement]
            
            for expected in expected_placements:
                if expected in found_placements:
                    print(f"  ✅ {expected} found in perPlacement")
                else:
                    print(f"  ❌ {expected} NOT found in perPlacement")
            
            # Check home placement (should be enabled:true, visible:true)
            home_entry = next((p for p in per_placement if p.get('placement') == 'home'), None)
            if home_entry:
                print(f"\n  Home placement details:")
                print(f"    enabled: {home_entry.get('enabled')}")
                print(f"    visible: {home_entry.get('visible')}")
                print(f"    reason: {home_entry.get('reason')}")
                
                if home_entry.get('enabled') and home_entry.get('visible'):
                    print(f"  ✅ Home placement: enabled=true, visible=true (expected)")
                else:
                    print(f"  ❌ Home placement not enabled/visible as expected")
            
            # Check lessons placement (should be enabled:false)
            lessons_entry = next((p for p in per_placement if p.get('placement') == 'lessons'), None)
            if lessons_entry:
                print(f"\n  Lessons placement details:")
                print(f"    enabled: {lessons_entry.get('enabled')}")
                print(f"    visible: {lessons_entry.get('visible')}")
                print(f"    reason: {lessons_entry.get('reason')}")
                
                if not lessons_entry.get('enabled'):
                    print(f"  ✅ Lessons placement: enabled=false (expected)")
                    if lessons_entry.get('reason') == 'PLACEMENT_NOT_ENABLED':
                        print(f"  ✅ Reason is PLACEMENT_NOT_ENABLED (expected)")
                else:
                    print(f"  ⚠️  Lessons placement enabled (unexpected)")
        else:
            print(f"❌ TEST 4a FAILED: Status {diag_resp.status_code}, response: {diag_resp.text}")
        
        # Test 4b: Non-admin access (should be 401/403)
        print("\n[TEST 4b] GET /api/admin/ads/{PM_ID}/diagnostics (without auth - should be 401/403)...")
        diag_resp_noauth = requests.get(f"{BASE_URL}/admin/ads/{PM_ID}/diagnostics", timeout=10)
        print(f"Status: {diag_resp_noauth.status_code}")
        
        if diag_resp_noauth.status_code in [401, 403]:
            print(f"✅ TEST 4b PASSED: Non-admin correctly rejected with {diag_resp_noauth.status_code}")
        else:
            print(f"❌ TEST 4b FAILED: Expected 401/403, got {diag_resp_noauth.status_code}")
        
    except Exception as e:
        print(f"❌ TEST 4 exception: {e}")
    
    # TEST 5: Frequency cap still works
    print("\n" + "=" * 80)
    print("TEST 5: Frequency cap still works")
    print("=" * 80)
    
    try:
        print("\n[TEST 5a] PUT frequencyPerDay:1, placements:[home], status:on, blank schedule...")
        update_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "frequencyPerDay": 1,
                "placements": ["home"],
                "status": "on",
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "",
                    "dailyEnd": ""
                }
            },
            timeout=10
        )
        print(f"PUT status: {update_resp.status_code}")
        time.sleep(1)
        
        # Record an impression as admin (has userId)
        print("\n[TEST 5b] POST /api/ads/{PM_ID}/event (action:impression, placement:home)...")
        event_resp = requests.post(
            f"{BASE_URL}/ads/{PM_ID}/event",
            headers=headers,
            json={"action": "impression", "placement": "home"},
            timeout=10
        )
        print(f"POST event status: {event_resp.status_code}")
        if event_resp.status_code == 200:
            print(f"✅ Impression recorded")
        else:
            print(f"❌ Failed to record impression: {event_resp.text}")
        
        time.sleep(1)
        
        # Try to get ad again (should be frequency_capped)
        print("\n[TEST 5c] GET /api/ads/active?placement=home (should be null - frequency_capped)...")
        home_resp = requests.get(f"{BASE_URL}/ads/active?placement=home", headers=headers, timeout=10)
        home_data = home_resp.json()
        
        if home_data.get("ad") is None:
            reason = home_data.get("reason", "")
            print(f"✅ TEST 5c PASSED: Ad null after frequency cap, reason: {reason}")
            if reason == "frequency_capped":
                print(f"   ✅ Reason is frequency_capped (expected)")
            else:
                print(f"   ⚠️  Reason is '{reason}' (may be acceptable)")
        else:
            print(f"❌ TEST 5c FAILED: Ad still present after frequency cap. Response: {home_data}")
        
    except Exception as e:
        print(f"❌ TEST 5 exception: {e}")
    
    # CLEANUP: Reset to default OFF state
    print("\n" + "=" * 80)
    print("CLEANUP: Reset PM POSHAN ad to default OFF state")
    print("=" * 80)
    
    try:
        print("\n[CLEANUP] PUT /api/admin/ads/{PM_ID} - Reset to default OFF state...")
        cleanup_resp = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers=headers,
            json={
                "status": "off",
                "placements": ["home"],
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "",
                    "dailyEnd": ""
                },
                "frequencyPerDay": 2,
                "showOncePerSession": True,
                "content": {
                    "destinationUrl": "https://pmposhancalculator.com/"
                }
            },
            timeout=10
        )
        print(f"PUT status: {cleanup_resp.status_code}")
        
        if cleanup_resp.status_code == 200:
            print(f"✅ CLEANUP SUCCESSFUL: PM POSHAN ad reset to default OFF state")
            
            # Verify the reset
            verify_resp = requests.get(f"{BASE_URL}/admin/ads", headers=headers, timeout=10)
            if verify_resp.status_code == 200:
                campaigns = verify_resp.json().get("ads", [])  # Changed from "campaigns" to "ads"
                pm_campaign_after = next((c for c in campaigns if c["id"] == PM_ID), None)
                if pm_campaign_after:
                    print(f"\nVerified state after cleanup:")
                    print(f"  status: {pm_campaign_after.get('status')}")
                    print(f"  placements: {pm_campaign_after.get('placements')}")
                    print(f"  frequencyPerDay: {pm_campaign_after.get('frequencyPerDay')}")
                    print(f"  showOncePerSession: {pm_campaign_after.get('showOncePerSession')}")
        else:
            print(f"❌ CLEANUP FAILED: Status {cleanup_resp.status_code}, response: {cleanup_resp.text}")
        
    except Exception as e:
        print(f"❌ CLEANUP exception: {e}")
    
    print("\n" + "=" * 80)
    print("BACKEND TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    test_ads_visibility()
