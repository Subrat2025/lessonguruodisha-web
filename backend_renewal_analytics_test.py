#!/usr/bin/env python3
"""
Backend test for NEW renewal popup analytics endpoints (2026-06).
Tests ONLY:
  1) POST /api/renewal/track (public)
  2) GET /api/admin/renewal/analytics (admin only)
"""
import requests
import json
import sys
from datetime import datetime

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_renewal_analytics():
    """Test the two new renewal analytics endpoints."""
    
    log("=" * 80)
    log("RENEWAL POPUP ANALYTICS ENDPOINTS TEST")
    log("=" * 80)
    
    # -------------------------------------------------------------------------
    # STEP 1: Login as admin to get bearer token
    # -------------------------------------------------------------------------
    log("\n[STEP 1] Admin login to get bearer token...")
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if resp.status_code != 200:
            log(f"❌ Admin login failed: {resp.status_code} {resp.text[:200]}")
            return False
        data = resp.json()
        admin_token = data.get("token")
        if not admin_token:
            log(f"❌ No token in login response: {data}")
            return False
        log(f"✅ Admin login successful, token: {admin_token[:20]}...")
    except Exception as e:
        log(f"❌ Admin login exception: {e}")
        return False
    
    # -------------------------------------------------------------------------
    # STEP 2: Test POST /api/renewal/track (public endpoint)
    # -------------------------------------------------------------------------
    log("\n[STEP 2] Testing POST /api/renewal/track (public endpoint)...")
    
    # Test 2a: Valid event "shown" with plan
    log("\n[TEST 2a] POST {event:'shown', plan:'monthly'} → expect 200 {ok:true}")
    try:
        resp = requests.post(
            f"{BASE_URL}/renewal/track",
            json={"event": "shown", "plan": "monthly"},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code != 200:
            log(f"❌ TEST 2a FAILED: Expected 200, got {resp.status_code}")
            return False
        data = resp.json()
        if not data.get("ok"):
            log(f"❌ TEST 2a FAILED: Expected ok:true, got {data}")
            return False
        log("✅ TEST 2a PASSED: shown event tracked")
    except Exception as e:
        log(f"❌ TEST 2a EXCEPTION: {e}")
        return False
    
    # Test 2b: Valid event "cta_click" with plan
    log("\n[TEST 2b] POST {event:'cta_click', plan:'monthly'} → expect 200 {ok:true}")
    try:
        resp = requests.post(
            f"{BASE_URL}/renewal/track",
            json={"event": "cta_click", "plan": "monthly"},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code != 200:
            log(f"❌ TEST 2b FAILED: Expected 200, got {resp.status_code}")
            return False
        data = resp.json()
        if not data.get("ok"):
            log(f"❌ TEST 2b FAILED: Expected ok:true, got {data}")
            return False
        log("✅ TEST 2b PASSED: cta_click event tracked")
    except Exception as e:
        log(f"❌ TEST 2b EXCEPTION: {e}")
        return False
    
    # Test 2c: Valid event "checkout_open" with plan
    log("\n[TEST 2c] POST {event:'checkout_open', plan:'yearly'} → expect 200 {ok:true}")
    try:
        resp = requests.post(
            f"{BASE_URL}/renewal/track",
            json={"event": "checkout_open", "plan": "yearly"},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code != 200:
            log(f"❌ TEST 2c FAILED: Expected 200, got {resp.status_code}")
            return False
        data = resp.json()
        if not data.get("ok"):
            log(f"❌ TEST 2c FAILED: Expected ok:true, got {data}")
            return False
        log("✅ TEST 2c PASSED: checkout_open event tracked")
    except Exception as e:
        log(f"❌ TEST 2c EXCEPTION: {e}")
        return False
    
    # Test 2d: Valid event "paid" with plan and amount
    log("\n[TEST 2d] POST {event:'paid', plan:'yearly', amount:199} → expect 200 {ok:true}")
    try:
        resp = requests.post(
            f"{BASE_URL}/renewal/track",
            json={"event": "paid", "plan": "yearly", "amount": 199},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code != 200:
            log(f"❌ TEST 2d FAILED: Expected 200, got {resp.status_code}")
            return False
        data = resp.json()
        if not data.get("ok"):
            log(f"❌ TEST 2d FAILED: Expected ok:true, got {data}")
            return False
        log("✅ TEST 2d PASSED: paid event tracked with amount 199")
    except Exception as e:
        log(f"❌ TEST 2d EXCEPTION: {e}")
        return False
    
    # Test 2e: Invalid event "bogus"
    log("\n[TEST 2e] POST {event:'bogus'} → expect 400 {error}")
    try:
        resp = requests.post(
            f"{BASE_URL}/renewal/track",
            json={"event": "bogus"},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code != 400:
            log(f"❌ TEST 2e FAILED: Expected 400, got {resp.status_code}")
            return False
        data = resp.json()
        if "error" not in data:
            log(f"❌ TEST 2e FAILED: Expected error field, got {data}")
            return False
        log("✅ TEST 2e PASSED: invalid event rejected with 400")
    except Exception as e:
        log(f"❌ TEST 2e EXCEPTION: {e}")
        return False
    
    # Test 2f: Missing event
    log("\n[TEST 2f] POST {} (missing event) → expect 400 {error}")
    try:
        resp = requests.post(
            f"{BASE_URL}/renewal/track",
            json={},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code != 400:
            log(f"❌ TEST 2f FAILED: Expected 400, got {resp.status_code}")
            return False
        data = resp.json()
        if "error" not in data:
            log(f"❌ TEST 2f FAILED: Expected error field, got {data}")
            return False
        log("✅ TEST 2f PASSED: missing event rejected with 400")
    except Exception as e:
        log(f"❌ TEST 2f EXCEPTION: {e}")
        return False
    
    # -------------------------------------------------------------------------
    # STEP 3: Test GET /api/admin/renewal/analytics WITHOUT admin token
    # -------------------------------------------------------------------------
    log("\n[STEP 3] Testing GET /api/admin/renewal/analytics WITHOUT admin token...")
    log("\n[TEST 3] GET /api/admin/renewal/analytics without token → expect 401 or 403")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/renewal/analytics",
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:300]}")
        if resp.status_code not in [401, 403]:
            log(f"❌ TEST 3 FAILED: Expected 401 or 403, got {resp.status_code}")
            return False
        log("✅ TEST 3 PASSED: analytics endpoint requires admin auth")
    except Exception as e:
        log(f"❌ TEST 3 EXCEPTION: {e}")
        return False
    
    # -------------------------------------------------------------------------
    # STEP 4: Test GET /api/admin/renewal/analytics WITH admin token
    # -------------------------------------------------------------------------
    log("\n[STEP 4] Testing GET /api/admin/renewal/analytics WITH admin token...")
    log("\n[TEST 4] GET /api/admin/renewal/analytics with admin token → expect 200 with proper structure")
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/renewal/analytics",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        log(f"Status: {resp.status_code}")
        log(f"Response: {resp.text[:1000]}")
        if resp.status_code != 200:
            log(f"❌ TEST 4 FAILED: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Verify required keys
        required_keys = ["counts", "revenue", "conversion", "trend", "range"]
        for key in required_keys:
            if key not in data:
                log(f"❌ TEST 4 FAILED: Missing required key '{key}' in response")
                return False
        
        # Verify counts structure
        counts = data.get("counts", {})
        required_count_keys = ["shown", "cta_click", "checkout_open", "paid"]
        for key in required_count_keys:
            if key not in counts:
                log(f"❌ TEST 4 FAILED: Missing count key '{key}' in counts")
                return False
        
        # Verify conversion structure
        conversion = data.get("conversion", {})
        required_conversion_keys = ["shownToClickPct", "clickToCheckoutPct", "checkoutToPaidPct", "shownToPaidPct"]
        for key in required_conversion_keys:
            if key not in conversion:
                log(f"❌ TEST 4 FAILED: Missing conversion key '{key}' in conversion")
                return False
        
        # Verify trend is an array
        trend = data.get("trend", [])
        if not isinstance(trend, list):
            log(f"❌ TEST 4 FAILED: trend should be an array, got {type(trend)}")
            return False
        
        # Verify range structure
        range_data = data.get("range", {})
        if "from" not in range_data or "to" not in range_data:
            log(f"❌ TEST 4 FAILED: range should have 'from' and 'to' keys")
            return False
        
        # Verify data from our POSTs above
        log(f"\nCounts: {counts}")
        log(f"Revenue: {data.get('revenue')}")
        log(f"Conversion: {conversion}")
        log(f"Trend length: {len(trend)}")
        
        # After the POSTs above, expect counts.shown>=1, counts.paid>=1, revenue>=199
        if counts.get("shown", 0) < 1:
            log(f"❌ TEST 4 FAILED: Expected counts.shown>=1, got {counts.get('shown')}")
            return False
        
        if counts.get("paid", 0) < 1:
            log(f"❌ TEST 4 FAILED: Expected counts.paid>=1, got {counts.get('paid')}")
            return False
        
        if data.get("revenue", 0) < 199:
            log(f"❌ TEST 4 FAILED: Expected revenue>=199, got {data.get('revenue')}")
            return False
        
        log("✅ TEST 4 PASSED: analytics endpoint returns proper structure with expected data")
        log(f"   - counts.shown: {counts.get('shown')}")
        log(f"   - counts.cta_click: {counts.get('cta_click')}")
        log(f"   - counts.checkout_open: {counts.get('checkout_open')}")
        log(f"   - counts.paid: {counts.get('paid')}")
        log(f"   - revenue: {data.get('revenue')}")
        log(f"   - shownToClickPct: {conversion.get('shownToClickPct')}%")
        log(f"   - clickToCheckoutPct: {conversion.get('clickToCheckoutPct')}%")
        log(f"   - checkoutToPaidPct: {conversion.get('checkoutToPaidPct')}%")
        log(f"   - shownToPaidPct: {conversion.get('shownToPaidPct')}%")
        
    except Exception as e:
        log(f"❌ TEST 4 EXCEPTION: {e}")
        return False
    
    # -------------------------------------------------------------------------
    # ALL TESTS PASSED
    # -------------------------------------------------------------------------
    log("\n" + "=" * 80)
    log("✅ ALL RENEWAL ANALYTICS TESTS PASSED")
    log("=" * 80)
    log("\nSUMMARY:")
    log("  ✅ POST /api/renewal/track - valid events (shown, cta_click, checkout_open, paid)")
    log("  ✅ POST /api/renewal/track - invalid event rejection (bogus)")
    log("  ✅ POST /api/renewal/track - missing event rejection")
    log("  ✅ GET /api/admin/renewal/analytics - auth required (401/403 without token)")
    log("  ✅ GET /api/admin/renewal/analytics - proper response structure")
    log("  ✅ GET /api/admin/renewal/analytics - data verification (counts, revenue)")
    log("\nNOTE: Test rows remain in renewal_events collection. Clean up if needed.")
    return True

if __name__ == "__main__":
    try:
        success = test_renewal_analytics()
        sys.exit(0 if success else 1)
    except Exception as e:
        log(f"❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
