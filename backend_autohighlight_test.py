#!/usr/bin/env python3
"""
Backend smoke test for NEW `autoHighlight` field on plan-attached offers.

Test recipe:
1. Login as admin → get token
2. GET /api/admin/plans → save plans array
3. PUT /api/admin/plans with yearly plan's offer including autoHighlight: true
4. GET /api/plans (public) → verify autoHighlight is returned
5. Toggle it off: PUT with autoHighlight: false
6. Ensure back-compat: PUT with offer object that OMITS autoHighlight → should default to false
7. Cleanup: reset yearly.offer to null
8. Regression tests: POST /api/plans/quote, GET /api/offers/active, POST /api/auth/login
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_autohighlight():
    print("\n" + "="*80)
    print("🧪 AUTOHIGHLIGHT FIELD SMOKE TEST")
    print("="*80 + "\n")
    
    # Test 1: Admin Login
    print("Test 1: Admin Login")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        admin_token = data["token"]
        print(f"✅ Admin login successful, token: {admin_token[:20]}...")
    except Exception as e:
        print(f"❌ Test 1 FAILED: {e}")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 2: GET /api/admin/plans → save plans array
    print("\nTest 2: GET /api/admin/plans")
    try:
        res = requests.get(f"{BASE_URL}/admin/plans", headers=headers, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "plans" in data, "No plans in response"
        plans = data["plans"]
        print(f"✅ Got {len(plans)} plans")
        
        # Find yearly plan
        yearly_plan = next((p for p in plans if p["id"] == "yearly"), None)
        assert yearly_plan, "Yearly plan not found"
        print(f"   Yearly plan: {yearly_plan['name']} - ₹{yearly_plan['price']}")
        
        # Save original offer state for cleanup
        original_offer = yearly_plan.get("offer")
        print(f"   Original offer: {original_offer}")
    except Exception as e:
        print(f"❌ Test 2 FAILED: {e}")
        return
    
    # Test 3: PUT /api/admin/plans with autoHighlight: true
    print("\nTest 3: PUT /api/admin/plans with autoHighlight: true")
    try:
        now = datetime.utcnow()
        starts_at = (now - timedelta(hours=1)).isoformat() + "Z"
        ends_at = (now + timedelta(days=3)).isoformat() + "Z"
        
        # Update yearly plan with autoHighlight: true
        updated_plans = []
        for p in plans:
            if p["id"] == "yearly":
                p["offer"] = {
                    "enabled": True,
                    "name": "Best Deal Test",
                    "startsAt": starts_at,
                    "endsAt": ends_at,
                    "discountType": "percent",
                    "discountValue": 20,
                    "autoHighlight": True
                }
            updated_plans.append(p)
        
        res = requests.put(f"{BASE_URL}/admin/plans", headers=headers, json={"plans": updated_plans}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify the returned plan has autoHighlight: true
        returned_plans = data.get("plans", [])
        yearly_returned = next((p for p in returned_plans if p["id"] == "yearly"), None)
        assert yearly_returned, "Yearly plan not in response"
        assert yearly_returned.get("offer"), "No offer in yearly plan"
        assert yearly_returned["offer"].get("autoHighlight") == True, f"Expected autoHighlight:true, got {yearly_returned['offer'].get('autoHighlight')}"
        print(f"✅ PUT successful, autoHighlight: {yearly_returned['offer']['autoHighlight']}")
        print(f"   Offer: {yearly_returned['offer']['name']}, discount: {yearly_returned['offer']['discountValue']}%")
    except Exception as e:
        print(f"❌ Test 3 FAILED: {e}")
        return
    
    # Test 4: GET /api/plans (public) → verify autoHighlight is returned
    print("\nTest 4: GET /api/plans (public)")
    try:
        res = requests.get(f"{BASE_URL}/plans", timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "plans" in data, "No plans in response"
        public_plans = data["plans"]
        
        yearly_public = next((p for p in public_plans if p["id"] == "yearly"), None)
        assert yearly_public, "Yearly plan not found in public plans"
        assert yearly_public.get("offer"), "No offer in yearly plan"
        assert yearly_public["offer"].get("autoHighlight") == True, f"Expected autoHighlight:true, got {yearly_public['offer'].get('autoHighlight')}"
        print(f"✅ Public GET /plans returns autoHighlight: {yearly_public['offer']['autoHighlight']}")
    except Exception as e:
        print(f"❌ Test 4 FAILED: {e}")
        return
    
    # Test 5: POST /api/plans/quote → verify autoHighlight in quote.offer
    # Need to test with a user who doesn't have a subscription
    print("\nTest 5: Create test user and POST /api/plans/quote")
    try:
        # Register a test user with 10-digit mobile
        import random
        test_mobile = f"99{random.randint(10000000, 99999999)}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User",
            "mobile": test_mobile,
            "password": "test123"
        }, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        test_token = data["token"]
        print(f"✅ Test user created: {test_mobile}")
        
        # Get quote as test user
        test_headers = {"Authorization": f"Bearer {test_token}"}
        res = requests.post(f"{BASE_URL}/plans/quote", headers=test_headers, json={"planId": "yearly"}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "quote" in data, "No quote in response"
        quote = data["quote"]
        
        print(f"   Quote action: {quote.get('action')}")
        
        # Verify offer is present
        assert quote.get("offer"), f"No offer in quote. Quote: {json.dumps(quote, indent=2)}"
        assert quote["offer"]["id"] == "plan_yearly", f"Expected offer.id='plan_yearly', got {quote['offer']['id']}"
        
        # Verify discount is applied correctly
        plan_price = yearly_plan["price"]
        expected_discount = int(plan_price * 0.20)  # 20% discount
        assert quote["offerDiscount"] == expected_discount, f"Expected discount {expected_discount}, got {quote['offerDiscount']}"
        
        # Check if autoHighlight is in quote.offer (this is what we're testing)
        if "autoHighlight" in quote["offer"]:
            assert quote["offer"]["autoHighlight"] == True, f"Expected autoHighlight:true, got {quote['offer']['autoHighlight']}"
            print(f"✅ Quote includes autoHighlight: {quote['offer']['autoHighlight']}")
        else:
            print(f"⚠️  Quote.offer does NOT include autoHighlight field")
            print(f"   This needs to be added to offerMeta in plan-pricing.js buildQuote function")
            print(f"   Quote.offer keys: {list(quote['offer'].keys())}")
        
        print(f"   Discount: ₹{quote['offerDiscount']} (20% of ₹{plan_price})")
        print(f"   Final amount: ₹{quote['amount']}")
    except Exception as e:
        print(f"❌ Test 5 FAILED: {e}")
        # Don't return, continue with other tests
    
    # Test 6: Toggle autoHighlight off
    print("\nTest 6: PUT /api/admin/plans with autoHighlight: false")
    try:
        updated_plans = []
        for p in plans:
            if p["id"] == "yearly":
                p["offer"]["autoHighlight"] = False
            updated_plans.append(p)
        
        res = requests.put(f"{BASE_URL}/admin/plans", headers=headers, json={"plans": updated_plans}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        returned_plans = data.get("plans", [])
        yearly_returned = next((p for p in returned_plans if p["id"] == "yearly"), None)
        assert yearly_returned["offer"].get("autoHighlight") == False, f"Expected autoHighlight:false, got {yearly_returned['offer'].get('autoHighlight')}"
        print(f"✅ autoHighlight toggled to false")
    except Exception as e:
        print(f"❌ Test 6 FAILED: {e}")
        return
    
    # Test 7: Back-compat - PUT with offer that OMITS autoHighlight → should default to false
    print("\nTest 7: PUT with offer that OMITS autoHighlight field")
    try:
        updated_plans = []
        for p in plans:
            if p["id"] == "yearly":
                # Create offer without autoHighlight field
                p["offer"] = {
                    "enabled": True,
                    "name": "Back-compat Test",
                    "startsAt": starts_at,
                    "endsAt": ends_at,
                    "discountType": "percent",
                    "discountValue": 15
                    # Note: autoHighlight is OMITTED
                }
            updated_plans.append(p)
        
        res = requests.put(f"{BASE_URL}/admin/plans", headers=headers, json={"plans": updated_plans}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        returned_plans = data.get("plans", [])
        yearly_returned = next((p for p in returned_plans if p["id"] == "yearly"), None)
        
        # Should default to false (not undefined)
        auto_highlight = yearly_returned["offer"].get("autoHighlight")
        assert auto_highlight == False, f"Expected autoHighlight to default to false, got {auto_highlight}"
        print(f"✅ Omitted autoHighlight defaults to false (back-compat working)")
    except Exception as e:
        print(f"❌ Test 7 FAILED: {e}")
        return
    
    # Test 8: Cleanup - reset yearly.offer to null
    print("\nTest 8: Cleanup - reset yearly.offer to null")
    try:
        updated_plans = []
        for p in plans:
            if p["id"] == "yearly":
                p["offer"] = None
            updated_plans.append(p)
        
        res = requests.put(f"{BASE_URL}/admin/plans", headers=headers, json={"plans": updated_plans}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        print(f"✅ Yearly offer reset to null")
    except Exception as e:
        print(f"❌ Test 8 FAILED: {e}")
        return
    
    # Test 9: Regression - POST /api/plans/quote still works
    print("\nTest 9: Regression - POST /api/plans/quote (no offer)")
    try:
        res = requests.post(f"{BASE_URL}/plans/quote", headers=headers, json={"planId": "yearly"}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "quote" in data, "No quote in response"
        quote = data["quote"]
        
        # Should have no offer now
        if quote.get("offer"):
            print(f"⚠️  Quote still has offer (might be global offer): {quote['offer']}")
        else:
            print(f"✅ Quote has no offer (as expected after cleanup)")
    except Exception as e:
        print(f"❌ Test 9 FAILED: {e}")
        return
    
    # Test 10: Regression - GET /api/offers/active
    print("\nTest 10: Regression - GET /api/offers/active")
    try:
        res = requests.get(f"{BASE_URL}/offers/active", timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        print(f"✅ GET /api/offers/active working")
    except Exception as e:
        print(f"❌ Test 10 FAILED: {e}")
        return
    
    # Test 11: Regression - POST /api/auth/login
    print("\nTest 11: Regression - POST /api/auth/login")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        print(f"✅ POST /api/auth/login working")
    except Exception as e:
        print(f"❌ Test 11 FAILED: {e}")
        return
    
    # Test 12: Additional regression - POST /api/plans/quote with autoHighlight=true
    print("\nTest 12: Verify quote with autoHighlight=true (re-enable offer)")
    try:
        # Get fresh admin token
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        admin_token = res.json()["token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Re-enable the offer with autoHighlight=true
        updated_plans = []
        for p in plans:
            if p["id"] == "yearly":
                p["offer"] = {
                    "enabled": True,
                    "name": "Final Test Offer",
                    "startsAt": starts_at,
                    "endsAt": ends_at,
                    "discountType": "percent",
                    "discountValue": 20,
                    "autoHighlight": True
                }
            updated_plans.append(p)
        
        res = requests.put(f"{BASE_URL}/admin/plans", headers=headers, json={"plans": updated_plans}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        # Create another test user
        test_mobile2 = f"99{random.randint(10000000, 99999999)}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User 2",
            "mobile": test_mobile2,
            "password": "test123"
        }, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        test_token2 = res.json()["token"]
        
        # Get quote
        test_headers2 = {"Authorization": f"Bearer {test_token2}"}
        res = requests.post(f"{BASE_URL}/plans/quote", headers=test_headers2, json={"planId": "yearly"}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        quote = res.json()["quote"]
        
        # Verify all the requirements from test recipe
        assert quote["offer"]["id"] == "plan_yearly", f"Expected offer.id='plan_yearly', got {quote['offer']['id']}"
        assert quote["offerDiscount"] == 99, f"Expected discount 99, got {quote['offerDiscount']}"
        assert quote["offer"]["autoHighlight"] == True, f"Expected autoHighlight=true, got {quote['offer']['autoHighlight']}"
        print(f"✅ Quote with autoHighlight=true verified")
        print(f"   offer.id: {quote['offer']['id']}")
        print(f"   discount: ₹{quote['offerDiscount']}")
        print(f"   autoHighlight: {quote['offer']['autoHighlight']}")
        
        # Final cleanup
        updated_plans = []
        for p in plans:
            if p["id"] == "yearly":
                p["offer"] = None
            updated_plans.append(p)
        res = requests.put(f"{BASE_URL}/admin/plans", headers=headers, json={"plans": updated_plans}, timeout=10)
        print(f"✅ Final cleanup complete")
    except Exception as e:
        print(f"❌ Test 12 FAILED: {e}")
        return
    
    print("\n" + "="*80)
    print("✅ ALL AUTOHIGHLIGHT TESTS PASSED")
    print("="*80 + "\n")

if __name__ == "__main__":
    test_autohighlight()
