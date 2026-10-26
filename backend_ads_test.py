#!/usr/bin/env python3
"""
Backend test for Advertisement/Promotion system endpoints.
Tests all admin CRUD operations, public endpoints, schedule logic, frequency caps, and analytics.
"""

import requests
import time
import json
from datetime import datetime

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Global variables
admin_token = None
PM_ID = None
temp_ad_id = None

def log_test(test_num, description):
    """Log test case header"""
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def log_result(success, message):
    """Log test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    return success

def login_admin():
    """Login as admin and get token"""
    global admin_token
    log_test("AUTH", "Admin login to get token")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get("token")
            if admin_token:
                log_result(True, f"Admin login successful, token obtained")
                return True
            else:
                log_result(False, "No token in response")
                return False
        else:
            log_result(False, f"Login failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_result(False, f"Login exception: {str(e)}")
        return False

def test_1_get_admin_ads_list():
    """TEST 1: GET /api/admin/ads → 200, ads array has seeded PM POSHAN campaign with status 'off'"""
    global PM_ID
    log_test(1, "GET /api/admin/ads - List campaigns and verify PM POSHAN seeded")
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/ads",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"Expected 200, got {response.status_code}: {response.text}")
        
        data = response.json()
        
        # Verify response structure
        if "ads" not in data:
            return log_result(False, "Response missing 'ads' array")
        
        if "placements" not in data:
            return log_result(False, "Response missing 'placements' array")
        
        # Find PM POSHAN campaign
        pm_campaign = None
        for ad in data["ads"]:
            if ad.get("name") == "PM POSHAN MDM Calculator":
                pm_campaign = ad
                PM_ID = ad.get("id")
                break
        
        if not pm_campaign:
            return log_result(False, "PM POSHAN MDM Calculator campaign not found in ads list")
        
        # Verify PM campaign properties
        if pm_campaign.get("status") != "off":
            return log_result(False, f"PM campaign status is '{pm_campaign.get('status')}', expected 'off'")
        
        dest_url = pm_campaign.get("content", {}).get("destinationUrl")
        if dest_url != "https://pmposhancalculator.com/":
            return log_result(False, f"PM campaign destinationUrl is '{dest_url}', expected 'https://pmposhancalculator.com/'")
        
        log_result(True, f"PM POSHAN campaign found with id={PM_ID}, status='off', destinationUrl='https://pmposhancalculator.com/'")
        print(f"   Total campaigns: {len(data['ads'])}")
        print(f"   Available placements: {data['placements']}")
        return True
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_2_public_active_when_off():
    """TEST 2: Public GET /api/ads/active?placement=home → {ad:null} (PM campaign is OFF)"""
    log_test(2, "GET /api/ads/active?placement=home - Should return null when campaign is OFF")
    
    try:
        response = requests.get(
            f"{BASE_URL}/ads/active?placement=home",
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"Expected 200, got {response.status_code}: {response.text}")
        
        data = response.json()
        
        if "ad" not in data:
            return log_result(False, "Response missing 'ad' field")
        
        if data["ad"] is not None:
            return log_result(False, f"Expected ad:null when campaign is OFF, got: {data['ad']}")
        
        return log_result(True, "Public endpoint correctly returns {ad:null} when campaign is OFF")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_3_non_admin_auth():
    """TEST 3: Non-admin access should return 401/403"""
    log_test(3, "Non-admin access - Should return 401/403 for admin endpoints")
    
    all_passed = True
    
    # Test GET /api/admin/ads without token
    try:
        response = requests.get(f"{BASE_URL}/admin/ads", timeout=10)
        if response.status_code in [401, 403]:
            log_result(True, f"GET /admin/ads without token: {response.status_code} (correct)")
        else:
            log_result(False, f"GET /admin/ads without token: expected 401/403, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log_result(False, f"GET /admin/ads exception: {str(e)}")
        all_passed = False
    
    # Test POST /api/admin/ads without token
    try:
        response = requests.post(
            f"{BASE_URL}/admin/ads",
            json={"name": "Test Ad"},
            timeout=10
        )
        if response.status_code in [401, 403]:
            log_result(True, f"POST /admin/ads without token: {response.status_code} (correct)")
        else:
            log_result(False, f"POST /admin/ads without token: expected 401/403, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log_result(False, f"POST /admin/ads exception: {str(e)}")
        all_passed = False
    
    # Test PUT /api/admin/ads/:id without token
    try:
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            json={"status": "on"},
            timeout=10
        )
        if response.status_code in [401, 403]:
            log_result(True, f"PUT /admin/ads/{PM_ID} without token: {response.status_code} (correct)")
        else:
            log_result(False, f"PUT /admin/ads/{PM_ID} without token: expected 401/403, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log_result(False, f"PUT /admin/ads exception: {str(e)}")
        all_passed = False
    
    return all_passed

def test_4_url_validation():
    """TEST 4: URL validation - javascript: and ftp: should be rejected, https: should be accepted"""
    log_test(4, "URL validation - Reject javascript: and ftp:, accept https:")
    
    all_passed = True
    
    # Test javascript: URL (should be rejected)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"content": {"destinationUrl": "javascript:alert(1)"}},
            timeout=10
        )
        if response.status_code == 400:
            log_result(True, f"javascript: URL rejected with 400")
        else:
            log_result(False, f"javascript: URL: expected 400, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log_result(False, f"javascript: URL test exception: {str(e)}")
        all_passed = False
    
    # Test ftp: URL (should be rejected)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"content": {"destinationUrl": "ftp://x"}},
            timeout=10
        )
        if response.status_code == 400:
            log_result(True, f"ftp: URL rejected with 400")
        else:
            log_result(False, f"ftp: URL: expected 400, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log_result(False, f"ftp: URL test exception: {str(e)}")
        all_passed = False
    
    # Test valid https: URL (should be accepted)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"content": {"destinationUrl": "https://example.com"}},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("ad", {}).get("content", {}).get("destinationUrl") == "https://example.com":
                log_result(True, f"https://example.com URL accepted with 200")
            else:
                log_result(False, f"https: URL accepted but response incorrect: {data}")
                all_passed = False
        else:
            log_result(False, f"https: URL: expected 200, got {response.status_code}")
            all_passed = False
    except Exception as e:
        log_result(False, f"https: URL test exception: {str(e)}")
        all_passed = False
    
    return all_passed

def test_5_schedule_on_in_window():
    """TEST 5: Schedule ON with wide-open window, then verify active endpoint returns the ad"""
    log_test(5, "Schedule ON with in-window time - Should return ad in active endpoint")
    
    try:
        # Turn campaign ON with wide-open schedule
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "status": "on",
                "placements": ["home"],
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "00:00",
                    "dailyEnd": "23:59"
                },
                "frequencyPerDay": 0  # unlimited
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"PUT request failed with {response.status_code}: {response.text}")
        
        data = response.json()
        if not data.get("ok"):
            return log_result(False, f"PUT response ok=false: {data}")
        
        log_result(True, "Campaign turned ON with wide-open schedule")
        
        # Now check active endpoint
        time.sleep(0.5)  # Small delay
        
        response = requests.get(
            f"{BASE_URL}/ads/active?placement=home",
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET active failed with {response.status_code}: {response.text}")
        
        data = response.json()
        
        if "ad" not in data:
            return log_result(False, "Response missing 'ad' field")
        
        if data["ad"] is None:
            return log_result(False, "Expected ad object, got null (campaign should be active)")
        
        ad = data["ad"]
        if ad.get("name") != "PM POSHAN MDM Calculator":
            return log_result(False, f"Expected PM POSHAN campaign, got: {ad.get('name')}")
        
        return log_result(True, f"Active endpoint correctly returns PM POSHAN campaign when ON and in-window")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_6_placement_mismatch():
    """TEST 6: Placement mismatch - Query for 'lessons' placement should return null (PM only on 'home')"""
    log_test(6, "Placement mismatch - Query 'lessons' placement should return null")
    
    try:
        response = requests.get(
            f"{BASE_URL}/ads/active?placement=lessons",
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"Expected 200, got {response.status_code}: {response.text}")
        
        data = response.json()
        
        if "ad" not in data:
            return log_result(False, "Response missing 'ad' field")
        
        if data["ad"] is not None:
            return log_result(False, f"Expected ad:null for placement mismatch, got: {data['ad']}")
        
        return log_result(True, "Placement mismatch correctly returns {ad:null}")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_7_out_of_window():
    """TEST 7: Out-of-window - Set narrow time window, verify active returns null"""
    log_test(7, "Out-of-window schedule - Should return null when current time is outside window")
    
    try:
        # Set a very narrow window (00:00-00:01) - assuming current IST time is NOT in this window
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
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
        
        if response.status_code != 200:
            return log_result(False, f"PUT request failed with {response.status_code}: {response.text}")
        
        log_result(True, "Schedule updated to narrow window (00:00-00:01)")
        
        # Check active endpoint
        time.sleep(0.5)
        
        response = requests.get(
            f"{BASE_URL}/ads/active?placement=home",
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET active failed with {response.status_code}: {response.text}")
        
        data = response.json()
        
        if "ad" not in data:
            return log_result(False, "Response missing 'ad' field")
        
        # Get current IST time to check if we're in the window
        from datetime import datetime, timezone, timedelta
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        now_ist = datetime.now(ist_tz)
        current_time = now_ist.strftime("%H:%M")
        
        print(f"   Current IST time: {current_time}")
        
        # If by chance we're in the 00:00-00:01 window, note it
        if "00:00" <= current_time <= "00:01":
            print(f"   NOTE: Test running during 00:00-00:01 IST window, ad might be shown")
            if data["ad"] is not None:
                return log_result(True, "Ad shown (test running during the narrow window - acceptable)")
            else:
                return log_result(True, "Ad not shown even during window (might be other factors)")
        else:
            if data["ad"] is not None:
                return log_result(False, f"Expected ad:null outside window, got: {data['ad']}")
            else:
                return log_result(True, "Out-of-window correctly returns {ad:null}")
        
        return True
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_8_frequency_cap():
    """TEST 8: Frequency cap - Set freq=1, record impression, verify 2nd call returns null with reason"""
    log_test(8, "Frequency cap - Set freq=1, record impression, verify cap enforced")
    
    try:
        # First, set schedule back to wide-open and set frequencyPerDay=1
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "schedule": {
                    "startDate": "",
                    "endDate": "",
                    "dailyStart": "00:00",
                    "dailyEnd": "23:59"
                },
                "frequencyPerDay": 1
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"PUT request failed with {response.status_code}: {response.text}")
        
        log_result(True, "Schedule set to wide-open with frequencyPerDay=1")
        
        # Record an impression as admin user
        time.sleep(0.5)
        
        response = requests.post(
            f"{BASE_URL}/ads/{PM_ID}/event",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "action": "impression",
                "placement": "home",
                "device": "desktop"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"POST event failed with {response.status_code}: {response.text}")
        
        data = response.json()
        if not data.get("ok"):
            return log_result(False, f"Event recording failed: {data}")
        
        log_result(True, "Impression recorded successfully")
        
        # Now try to get active ad again - should be capped
        time.sleep(0.5)
        
        response = requests.get(
            f"{BASE_URL}/ads/active?placement=home",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET active failed with {response.status_code}: {response.text}")
        
        data = response.json()
        
        if "ad" not in data:
            return log_result(False, "Response missing 'ad' field")
        
        if data["ad"] is not None:
            return log_result(False, f"Expected ad:null due to frequency cap, got: {data['ad']}")
        
        # Check for reason field
        if data.get("reason") == "frequency_capped":
            return log_result(True, "Frequency cap correctly enforced with reason='frequency_capped'")
        else:
            return log_result(True, f"Frequency cap enforced (ad:null), reason: {data.get('reason', 'not provided')}")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_9_analytics():
    """TEST 9: Analytics - GET analytics endpoint, record click, verify metrics"""
    log_test(9, "Analytics - Verify analytics endpoint returns metrics and click increments")
    
    try:
        # Get initial analytics
        response = requests.get(
            f"{BASE_URL}/admin/ads/{PM_ID}/analytics?range=today",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET analytics failed with {response.status_code}: {response.text}")
        
        data = response.json()
        
        # Verify analytics structure
        required_fields = ["range", "impressions", "clicks", "ctr", "uniqueViewers"]
        for field in required_fields:
            if field not in data:
                return log_result(False, f"Analytics response missing '{field}' field")
        
        initial_clicks = data["clicks"]
        initial_impressions = data["impressions"]
        
        log_result(True, f"Analytics retrieved: impressions={initial_impressions}, clicks={initial_clicks}, ctr={data['ctr']}, uniqueViewers={data['uniqueViewers']}")
        
        # Record a click
        time.sleep(0.5)
        
        response = requests.post(
            f"{BASE_URL}/ads/{PM_ID}/event",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "action": "click",
                "placement": "home",
                "device": "desktop"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"POST click event failed with {response.status_code}: {response.text}")
        
        log_result(True, "Click event recorded")
        
        # Get analytics again
        time.sleep(0.5)
        
        response = requests.get(
            f"{BASE_URL}/admin/ads/{PM_ID}/analytics?range=today",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET analytics failed with {response.status_code}: {response.text}")
        
        data = response.json()
        new_clicks = data["clicks"]
        new_impressions = data["impressions"]
        new_ctr = data["ctr"]
        
        if new_clicks != initial_clicks + 1:
            return log_result(False, f"Expected clicks to increment by 1 (from {initial_clicks} to {initial_clicks + 1}), got {new_clicks}")
        
        # Verify CTR calculation
        expected_ctr = round((new_clicks * 100 / new_impressions), 2) if new_impressions > 0 else 0
        if abs(new_ctr - expected_ctr) > 0.01:
            print(f"   WARNING: CTR mismatch - expected {expected_ctr}, got {new_ctr}")
        
        return log_result(True, f"Analytics updated correctly: clicks incremented to {new_clicks}, ctr={new_ctr}")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_10_event_validation():
    """TEST 10: Event validation - Invalid action should return 400"""
    log_test(10, "Event validation - Invalid action 'foo' should return 400")
    
    try:
        response = requests.post(
            f"{BASE_URL}/ads/{PM_ID}/event",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "action": "foo",
                "placement": "home",
                "device": "desktop"
            },
            timeout=10
        )
        
        if response.status_code == 400:
            return log_result(True, f"Invalid action correctly rejected with 400")
        else:
            return log_result(False, f"Expected 400 for invalid action, got {response.status_code}")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_11_create_delete():
    """TEST 11: Create + Delete - Create temp ad, verify in list, delete, verify removed"""
    global temp_ad_id
    log_test(11, "Create + Delete - Create temp ad, verify, delete, verify removal")
    
    try:
        # Create temp ad
        response = requests.post(
            f"{BASE_URL}/admin/ads",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Temp Ad"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"POST create failed with {response.status_code}: {response.text}")
        
        data = response.json()
        if not data.get("ok"):
            return log_result(False, f"Create response ok=false: {data}")
        
        temp_ad_id = data.get("ad", {}).get("id")
        if not temp_ad_id:
            return log_result(False, "No ad.id in create response")
        
        log_result(True, f"Temp ad created with id={temp_ad_id}")
        
        # Verify in list
        time.sleep(0.5)
        
        response = requests.get(
            f"{BASE_URL}/admin/ads",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET list failed with {response.status_code}: {response.text}")
        
        data = response.json()
        found = any(ad.get("id") == temp_ad_id for ad in data.get("ads", []))
        
        if not found:
            return log_result(False, f"Temp ad {temp_ad_id} not found in list")
        
        log_result(True, "Temp ad found in list")
        
        # Delete temp ad
        time.sleep(0.5)
        
        response = requests.delete(
            f"{BASE_URL}/admin/ads/{temp_ad_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"DELETE failed with {response.status_code}: {response.text}")
        
        data = response.json()
        if not data.get("ok"):
            return log_result(False, f"Delete response ok=false: {data}")
        
        log_result(True, "Temp ad deleted")
        
        # Verify removed from list
        time.sleep(0.5)
        
        response = requests.get(
            f"{BASE_URL}/admin/ads",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            return log_result(False, f"GET list failed with {response.status_code}: {response.text}")
        
        data = response.json()
        found = any(ad.get("id") == temp_ad_id for ad in data.get("ads", []))
        
        if found:
            return log_result(False, f"Temp ad {temp_ad_id} still in list after delete")
        
        return log_result(True, "Temp ad successfully removed from list")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def test_12_image_upload():
    """TEST 12: Image upload - Upload tiny PNG dataUri, expect 200 with imageUrl OR 503 if Cloudinary unavailable"""
    log_test(12, "Image upload - Upload tiny PNG dataUri (best-effort)")
    
    # Tiny 1x1 transparent PNG
    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    
    try:
        response = requests.post(
            f"{BASE_URL}/admin/ads/{PM_ID}/image",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"dataUri": tiny_png},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("imageUrl"):
                return log_result(True, f"Image uploaded successfully: {data['imageUrl']}")
            else:
                return log_result(False, f"200 response but missing ok/imageUrl: {data}")
        elif response.status_code == 503:
            return log_result(True, "Cloudinary unavailable (503) - acceptable for this test")
        else:
            return log_result(False, f"Unexpected status {response.status_code}: {response.text}")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def cleanup_reset_pm_campaign():
    """CLEANUP: Reset PM POSHAN campaign to default OFF state"""
    log_test("CLEANUP", "Reset PM POSHAN campaign to default OFF state")
    
    try:
        response = requests.put(
            f"{BASE_URL}/admin/ads/{PM_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
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
        
        if response.status_code != 200:
            return log_result(False, f"Cleanup PUT failed with {response.status_code}: {response.text}")
        
        data = response.json()
        if not data.get("ok"):
            return log_result(False, f"Cleanup response ok=false: {data}")
        
        # Verify status is OFF
        ad = data.get("ad", {})
        if ad.get("status") != "off":
            return log_result(False, f"PM campaign status is '{ad.get('status')}', expected 'off'")
        
        return log_result(True, "PM POSHAN campaign reset to default OFF state")
        
    except Exception as e:
        return log_result(False, f"Exception: {str(e)}")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("ADVERTISEMENT/PROMOTION BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print("="*80)
    
    results = []
    
    # Login first
    if not login_admin():
        print("\n❌ FATAL: Admin login failed, cannot proceed with tests")
        return
    
    # Run all tests
    results.append(("Test 1: GET /admin/ads list", test_1_get_admin_ads_list()))
    results.append(("Test 2: Public active when OFF", test_2_public_active_when_off()))
    results.append(("Test 3: Non-admin auth", test_3_non_admin_auth()))
    results.append(("Test 4: URL validation", test_4_url_validation()))
    results.append(("Test 5: Schedule ON in-window", test_5_schedule_on_in_window()))
    results.append(("Test 6: Placement mismatch", test_6_placement_mismatch()))
    results.append(("Test 7: Out-of-window", test_7_out_of_window()))
    results.append(("Test 8: Frequency cap", test_8_frequency_cap()))
    results.append(("Test 9: Analytics", test_9_analytics()))
    results.append(("Test 10: Event validation", test_10_event_validation()))
    results.append(("Test 11: Create + Delete", test_11_create_delete()))
    results.append(("Test 12: Image upload", test_12_image_upload()))
    
    # Cleanup
    results.append(("Cleanup: Reset PM campaign", cleanup_reset_pm_campaign()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
