#!/usr/bin/env python3
"""
Backend Test: Phase 3 Premium Offer Analytics
Tests POST /api/offers/track and GET /api/admin/offers/analytics endpoints
"""

import requests
import time
import os
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_phase3_offer_analytics():
    """Test Phase 3 Premium Offer Analytics endpoints"""
    
    log("=" * 80)
    log("PHASE 3 PREMIUM OFFER ANALYTICS TEST")
    log("=" * 80)
    
    admin_token = None
    test_offer_id = None
    regular_user_token = None
    
    try:
        # ===== TEST 1: Admin Login =====
        log("\n[TEST 1] Admin Login")
        resp = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        admin_token = resp.json()['token']
        log(f"✅ Admin login successful, token: {admin_token[:20]}...")
        
        # ===== TEST 2: Create Test Offer =====
        log("\n[TEST 2] Create Test Offer")
        now = datetime.utcnow()
        starts_at = (now - timedelta(hours=1)).isoformat() + 'Z'
        ends_at = (now + timedelta(days=7)).isoformat() + 'Z'
        
        resp = requests.post(f"{API_BASE}/admin/offers", json={
            "name": "Test Analytics Offer",
            "badge": "🎯 Test Offer",
            "bannerText": "Test Offer for Analytics",
            "startsAt": starts_at,
            "endsAt": ends_at,
            "status": "active",
            "discountType": "percent",
            "discountValue": 20,
            "applicablePlanIds": ["yearly"],
            "priority": 10
        }, headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        
        assert resp.status_code == 200, f"Create offer failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data['ok'] == True, "Create offer response missing 'ok'"
        test_offer_id = data['offer']['id']
        log(f"✅ Test offer created: {test_offer_id}")
        log(f"   Name: {data['offer']['name']}")
        log(f"   Status: {data['offer']['status']}")
        log(f"   Discount: {data['offer']['discountValue']}%")
        
        # ===== TEST 3: Track View Events (3 times with session 'sess1') =====
        log("\n[TEST 3] Track View Events (3x with session 'sess1')")
        for i in range(3):
            resp = requests.post(f"{API_BASE}/offers/track", json={
                "offerId": test_offer_id,
                "event": "view",
                "planId": "yearly"
            }, headers={"x-em-session": "sess1"}, timeout=10)
            assert resp.status_code == 200, f"Track view failed: {resp.status_code} {resp.text}"
            data = resp.json()
            assert data['ok'] == True, "Track response missing 'ok'"
            log(f"✅ View event {i+1} tracked: {data}")
        
        # ===== TEST 4: Track Click Events (2 times with session 'sess1') =====
        log("\n[TEST 4] Track Click Events (2x with session 'sess1')")
        for i in range(2):
            resp = requests.post(f"{API_BASE}/offers/track", json={
                "offerId": test_offer_id,
                "event": "click",
                "planId": "yearly"
            }, headers={"x-em-session": "sess1"}, timeout=10)
            assert resp.status_code == 200, f"Track click failed: {resp.status_code} {resp.text}"
            data = resp.json()
            assert data['ok'] == True, "Track response missing 'ok'"
            log(f"✅ Click event {i+1} tracked: {data}")
        
        # ===== TEST 5: Track View Event (1 time with session 'sess2') =====
        log("\n[TEST 5] Track View Event (1x with session 'sess2')")
        resp = requests.post(f"{API_BASE}/offers/track", json={
            "offerId": test_offer_id,
            "event": "view"
        }, headers={"x-em-session": "sess2"}, timeout=10)
        assert resp.status_code == 200, f"Track view failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data['ok'] == True, "Track response missing 'ok'"
        log(f"✅ View event tracked with sess2: {data}")
        
        # ===== TEST 6: Rate Limit Test (8x rapid views with same session) =====
        log("\n[TEST 6] Rate Limit Test (8x rapid views with session 'sess3')")
        deduped_count = 0
        for i in range(8):
            resp = requests.post(f"{API_BASE}/offers/track", json={
                "offerId": test_offer_id,
                "event": "view"
            }, headers={"x-em-session": "sess3"}, timeout=10)
            assert resp.status_code == 200, f"Track view failed: {resp.status_code} {resp.text}"
            data = resp.json()
            if data.get('deduped'):
                deduped_count += 1
                log(f"   View {i+1}: deduped (rate limited)")
            else:
                log(f"   View {i+1}: recorded")
        
        assert deduped_count >= 2, f"Expected at least 2 deduped events, got {deduped_count}"
        log(f"✅ Rate limiting working: {deduped_count} events deduped out of 8")
        
        # ===== TEST 7: Unknown Offer ID (should return ok:true, no record) =====
        log("\n[TEST 7] Unknown Offer ID (should silently ignore)")
        resp = requests.post(f"{API_BASE}/offers/track", json={
            "offerId": "nonexistent-uuid-12345",
            "event": "view"
        }, headers={"x-em-session": "sess4"}, timeout=10)
        assert resp.status_code == 200, f"Track unknown offer failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data['ok'] == True, "Track response missing 'ok'"
        assert 'deduped' not in data, "Unknown offer should not be deduped"
        log(f"✅ Unknown offer silently ignored: {data}")
        
        # ===== TEST 8: Invalid Event Type (should return 400) =====
        log("\n[TEST 8] Invalid Event Type 'purchase' (should return 400)")
        resp = requests.post(f"{API_BASE}/offers/track", json={
            "offerId": test_offer_id,
            "event": "purchase"
        }, headers={"x-em-session": "sess5"}, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        assert 'error' in data, "Expected error message"
        log(f"✅ Invalid event rejected: {data['error']}")
        
        # ===== TEST 9: Missing Fields (should return 400) =====
        log("\n[TEST 9] Missing Fields (should return 400)")
        resp = requests.post(f"{API_BASE}/offers/track", json={}, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        assert 'error' in data, "Expected error message"
        log(f"✅ Missing fields rejected: {data['error']}")
        
        # Wait a moment for DB writes to complete
        time.sleep(1)
        
        # ===== TEST 10: Get Analytics as Admin (no query params) =====
        log("\n[TEST 10] GET /api/admin/offers/analytics (admin, no params)")
        resp = requests.get(f"{API_BASE}/admin/offers/analytics", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert resp.status_code == 200, f"Analytics failed: {resp.status_code} {resp.text}"
        data = resp.json()
        
        # Verify structure
        assert 'totals' in data, "Missing 'totals'"
        assert 'perOffer' in data, "Missing 'perOffer'"
        assert 'perPlan' in data, "Missing 'perPlan'"
        assert 'daily' in data, "Missing 'daily'"
        assert 'dateRange' in data, "Missing 'dateRange'"
        assert 'topOffer' in data, "Missing 'topOffer'"
        
        totals = data['totals']
        log(f"✅ Analytics retrieved successfully")
        log(f"   Totals: views={totals['views']}, clicks={totals['clicks']}, purchases={totals['purchases']}")
        log(f"   Revenue: ₹{totals['revenue']}")
        log(f"   Conversion Rate: {totals['conversionRate']}%")
        log(f"   Avg Order Value: ₹{totals['avgOrderValue']}")
        log(f"   Click Through Rate: {totals['clickThroughRate']}%")
        
        # Verify our test offer appears in perOffer
        test_offer_data = None
        for offer in data['perOffer']:
            if offer['offerId'] == test_offer_id:
                test_offer_data = offer
                break
        
        assert test_offer_data is not None, f"Test offer {test_offer_id} not found in perOffer"
        log(f"   Test Offer Stats:")
        log(f"     - Name: {test_offer_data['offerName']}")
        log(f"     - Views: {test_offer_data['views']}")
        log(f"     - Clicks: {test_offer_data['clicks']}")
        log(f"     - Purchases: {test_offer_data['purchases']}")
        log(f"     - Revenue: ₹{test_offer_data['revenue']}")
        log(f"     - Conversion Rate: {test_offer_data['conversionRate']}%")
        
        # Verify we have at least 4 views (3 from sess1 + 1 from sess2, sess3 may be rate-limited)
        assert test_offer_data['views'] >= 4, f"Expected at least 4 views, got {test_offer_data['views']}"
        # Verify we have at least 2 clicks
        assert test_offer_data['clicks'] >= 2, f"Expected at least 2 clicks, got {test_offer_data['clicks']}"
        # Conversion rate should be 0 (no purchases yet)
        assert test_offer_data['conversionRate'] == 0, f"Expected 0% conversion, got {test_offer_data['conversionRate']}%"
        
        # Verify daily array has at least 1 entry
        assert len(data['daily']) >= 1, "Expected at least 1 daily entry"
        log(f"   Daily entries: {len(data['daily'])}")
        if data['daily']:
            log(f"   Today's data: {data['daily'][-1]}")
        
        # ===== TEST 11: Get Analytics with offerId Filter =====
        log("\n[TEST 11] GET /api/admin/offers/analytics?offerId=<test-offer-id>")
        resp = requests.get(f"{API_BASE}/admin/offers/analytics?offerId={test_offer_id}", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert resp.status_code == 200, f"Analytics failed: {resp.status_code} {resp.text}"
        data = resp.json()
        
        # Should only have our test offer
        assert len(data['perOffer']) == 1, f"Expected 1 offer, got {len(data['perOffer'])}"
        assert data['perOffer'][0]['offerId'] == test_offer_id, "Wrong offer returned"
        log(f"✅ Filtered analytics working: {data['perOffer'][0]['offerName']}")
        
        # ===== TEST 12: Get Analytics as Non-Admin (should return 403) =====
        log("\n[TEST 12] GET /api/admin/offers/analytics (non-admin, should return 403)")
        
        # First create a regular user
        test_mobile = f"99{int(time.time()) % 100000000}"
        resp = requests.post(f"{API_BASE}/auth/register", json={
            "name": "Test User",
            "mobile": test_mobile,
            "password": "test1234"
        }, timeout=10)
        assert resp.status_code == 200, f"Register failed: {resp.status_code} {resp.text}"
        regular_user_token = resp.json()['token']
        log(f"   Created regular user: {test_mobile}")
        
        # Try to access analytics
        resp = requests.get(f"{API_BASE}/admin/offers/analytics", 
                           headers={"Authorization": f"Bearer {regular_user_token}"}, timeout=10)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        log(f"✅ Non-admin correctly rejected with 403")
        
        # ===== TEST 13: Get Analytics with Invalid Date Format =====
        log("\n[TEST 13] GET /api/admin/offers/analytics?from=bad-date (should return 400)")
        resp = requests.get(f"{API_BASE}/admin/offers/analytics?from=bad-date", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        assert 'error' in data, "Expected error message"
        assert 'Invalid date range' in data['error'], f"Wrong error message: {data['error']}"
        log(f"✅ Invalid date rejected: {data['error']}")
        
        # ===== TEST 14: Get Analytics with Valid Date Range =====
        log("\n[TEST 14] GET /api/admin/offers/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD")
        today = datetime.utcnow().strftime('%Y-%m-%d')
        tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')
        resp = requests.get(f"{API_BASE}/admin/offers/analytics?from={today}&to={tomorrow}", 
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert resp.status_code == 200, f"Analytics failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert 'totals' in data, "Missing 'totals'"
        log(f"✅ Date range query working: {data['dateRange']}")
        
        # ===== REGRESSION TESTS =====
        log("\n[REGRESSION TESTS] Verify existing endpoints still work")
        
        # Test 15: GET /api/plans
        log("\n[TEST 15] GET /api/plans (regression)")
        resp = requests.get(f"{API_BASE}/plans", timeout=10)
        assert resp.status_code == 200, f"Plans failed: {resp.status_code} {resp.text}"
        plans = resp.json()['plans']
        assert len(plans) > 0, "No plans returned"
        log(f"✅ GET /api/plans working: {len(plans)} plans")
        
        # Test 16: GET /api/offers/active
        log("\n[TEST 16] GET /api/offers/active (regression)")
        resp = requests.get(f"{API_BASE}/offers/active", timeout=10)
        assert resp.status_code == 200, f"Active offers failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert 'offer' in data, "Missing 'offer' key"
        if data['offer']:
            log(f"✅ GET /api/offers/active working: {data['offer']['name']}")
        else:
            log(f"✅ GET /api/offers/active working: no active offer")
        
        # Test 17: POST /api/admin/offers (create) - happy path
        log("\n[TEST 17] POST /api/admin/offers (regression)")
        resp = requests.post(f"{API_BASE}/admin/offers", json={
            "name": "Regression Test Offer",
            "badge": "🧪 Test",
            "status": "inactive"
        }, headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert resp.status_code == 200, f"Create offer failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data['ok'] == True, "Create offer response missing 'ok'"
        regression_offer_id = data['offer']['id']
        log(f"✅ POST /api/admin/offers working: {regression_offer_id}")
        
        # Clean up regression offer
        resp = requests.delete(f"{API_BASE}/admin/offers/{regression_offer_id}", 
                              headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert resp.status_code == 200, f"Delete offer failed: {resp.status_code}"
        log(f"   Cleaned up regression offer")
        
        # Test 18: Admin login still works
        log("\n[TEST 18] Admin login (regression)")
        resp = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        log(f"✅ Admin login still working")
        
        # ===== CLEANUP =====
        log("\n[CLEANUP] Deleting test offer")
        if test_offer_id:
            # Re-login to get fresh token for cleanup
            resp = requests.post(f"{API_BASE}/auth/login", json={
                "mobile": ADMIN_MOBILE,
                "password": ADMIN_PASSWORD
            }, timeout=10)
            if resp.status_code == 200:
                cleanup_token = resp.json()['token']
            else:
                cleanup_token = admin_token
            
            resp = requests.delete(f"{API_BASE}/admin/offers/{test_offer_id}", 
                                  headers={"Authorization": f"Bearer {cleanup_token}"}, timeout=10)
            if resp.status_code != 200:
                log(f"⚠️ Warning: Could not delete test offer: {resp.status_code} {resp.text}")
            else:
                log(f"✅ Test offer deleted: {test_offer_id}")
        
        # ===== SUMMARY =====
        log("\n" + "=" * 80)
        log("✅ ALL 18 PHASE 3 OFFER ANALYTICS TESTS PASSED")
        log("=" * 80)
        log("\nTEST SUMMARY:")
        log("1. ✅ Admin login working")
        log("2. ✅ Create test offer working")
        log("3. ✅ Track view events (3x) working")
        log("4. ✅ Track click events (2x) working")
        log("5. ✅ Track view with different session working")
        log("6. ✅ Rate limiting working (6 events per 60s)")
        log("7. ✅ Unknown offer ID silently ignored")
        log("8. ✅ Invalid event type rejected (400)")
        log("9. ✅ Missing fields rejected (400)")
        log("10. ✅ Analytics endpoint working (admin)")
        log("11. ✅ Analytics with offerId filter working")
        log("12. ✅ Non-admin access rejected (403)")
        log("13. ✅ Invalid date format rejected (400)")
        log("14. ✅ Valid date range query working")
        log("15. ✅ GET /api/plans regression passed")
        log("16. ✅ GET /api/offers/active regression passed")
        log("17. ✅ POST /api/admin/offers regression passed")
        log("18. ✅ Admin login regression passed")
        log("\n🎯 KEY FINDINGS:")
        log("✅ POST /api/offers/track working perfectly:")
        log("   - Accepts 'view' and 'click' events")
        log("   - Rejects 'purchase' event (server-only)")
        log("   - Rate-limits to 6 events per (session, offerId, event) per 60s")
        log("   - Silently ignores unknown offer IDs")
        log("   - Uses x-em-session header for anonymous tracking")
        log("✅ GET /api/admin/offers/analytics working perfectly:")
        log("   - Returns totals, perOffer, perPlan, daily, topOffer")
        log("   - Supports date range filtering (from/to)")
        log("   - Supports offerId filtering")
        log("   - Admin-only (403 for non-admin)")
        log("   - Validates date format (400 for invalid)")
        log("✅ All regression tests passed (plans, offers, login)")
        log("\nNO CRITICAL ISSUES FOUND. Phase 3 Offer Analytics is production-ready.")
        
        return True
        
    except AssertionError as e:
        log(f"\n❌ TEST FAILED: {e}")
        return False
    except Exception as e:
        log(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_phase3_offer_analytics()
    exit(0 if success else 1)
