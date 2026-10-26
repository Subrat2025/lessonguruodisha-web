#!/usr/bin/env python3
"""
Phase 3 Backend Testing — New Subscription Structure (5 Plans with Free)
Tests the new pricing structure with free plan, originalPrice, enabled fields, and all related endpoints.
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def test_admin_login():
    """Test 1: Admin login with new credentials"""
    print("\n=== Test 1: Admin Login ===")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        print(f"Status: {response.status_code}")
        data = response.json()
        if response.status_code == 200 and data.get("token"):
            print("✅ PASS: Admin login successful")
            print(f"   User: {data.get('user', {}).get('name')}, Role: {data.get('user', {}).get('role')}")
            return data["token"]
        else:
            print(f"❌ FAIL: Admin login failed - {data}")
            return None
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return None

def test_get_plans():
    """Test 2: GET /api/plans returns 5 plans including free"""
    print("\n=== Test 2: GET /api/plans (5 plans with free) ===")
    try:
        response = requests.get(f"{BASE_URL}/plans")
        print(f"Status: {response.status_code}")
        data = response.json()
        plans = data.get("plans", [])
        print(f"Plans count: {len(plans)}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        if len(plans) != 5:
            print(f"❌ FAIL: Expected 5 plans, got {len(plans)}")
            return False
        
        # Check for free plan
        free_plan = next((p for p in plans if p.get("id") == "free"), None)
        if not free_plan:
            print("❌ FAIL: Free plan not found")
            return False
        print(f"   Free plan: {free_plan.get('name')}, price: {free_plan.get('price')}")
        
        # Check yearly.popular=true
        yearly_plan = next((p for p in plans if p.get("id") == "yearly"), None)
        if not yearly_plan:
            print("❌ FAIL: Yearly plan not found")
            return False
        if not yearly_plan.get("popular"):
            print(f"❌ FAIL: Yearly plan popular={yearly_plan.get('popular')}, expected True")
            return False
        print(f"   Yearly plan: popular={yearly_plan.get('popular')} ✅")
        
        # Check lifetime.originalPrice=4999
        lifetime_plan = next((p for p in plans if p.get("id") == "lifetime"), None)
        if not lifetime_plan:
            print("❌ FAIL: Lifetime plan not found")
            return False
        if lifetime_plan.get("originalPrice") != 4999:
            print(f"❌ FAIL: Lifetime originalPrice={lifetime_plan.get('originalPrice')}, expected 4999")
            return False
        print(f"   Lifetime plan: originalPrice={lifetime_plan.get('originalPrice')} ✅")
        
        print("✅ PASS: All 5 plans present with correct fields")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_create_order_free_plan(token):
    """Test 3: POST /api/razorpay/create-order with free plan should return 400"""
    print("\n=== Test 3: Create order for free plan (should fail) ===")
    try:
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            json={"planId": "free"},
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {response.status_code}")
            return False
        
        error_msg = data.get("error", "")
        if "free plan cannot be purchased" not in error_msg.lower():
            print(f"❌ FAIL: Expected 'Free plan cannot be purchased', got '{error_msg}'")
            return False
        
        print(f"   Error message: {error_msg}")
        print("✅ PASS: Free plan correctly rejected")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_create_order_yearly(token):
    """Test 4: POST /api/razorpay/create-order with yearly plan"""
    print("\n=== Test 4: Create order for yearly plan ===")
    try:
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            json={"planId": "yearly"},
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code} - {data}")
            return False
        
        order_id = data.get("orderId", "")
        amount = data.get("amount", 0)
        
        if not order_id.startswith("order_"):
            print(f"❌ FAIL: orderId should start with 'order_', got '{order_id}'")
            return False
        
        if amount != 49900:
            print(f"❌ FAIL: Expected amount 49900 paise, got {amount}")
            return False
        
        print(f"   Order ID: {order_id}")
        print(f"   Amount: {amount} paise (₹{amount/100})")
        print("✅ PASS: Yearly order created successfully")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_create_order_lifetime(token):
    """Test 5: POST /api/razorpay/create-order with lifetime plan"""
    print("\n=== Test 5: Create order for lifetime plan ===")
    try:
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            json={"planId": "lifetime"},
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code} - {data}")
            return False
        
        order_id = data.get("orderId", "")
        amount = data.get("amount", 0)
        
        if not order_id.startswith("order_"):
            print(f"❌ FAIL: orderId should start with 'order_', got '{order_id}'")
            return False
        
        if amount != 249900:
            print(f"❌ FAIL: Expected amount 249900 paise, got {amount}")
            return False
        
        print(f"   Order ID: {order_id}")
        print(f"   Amount: {amount} paise (₹{amount/100})")
        print("✅ PASS: Lifetime order created successfully")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_get_payments_without_auth():
    """Test 6: GET /api/me/payments without auth should return 401"""
    print("\n=== Test 6: GET /api/me/payments without auth ===")
    try:
        response = requests.get(f"{BASE_URL}/me/payments")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
            return False
        
        print("✅ PASS: Correctly returns 401 without auth")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_get_payments_with_auth(token):
    """Test 7: GET /api/me/payments with auth returns payments array"""
    print("\n=== Test 7: GET /api/me/payments with auth ===")
    try:
        response = requests.get(f"{BASE_URL}/me/payments",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        if "payments" not in data:
            print(f"❌ FAIL: Response should contain 'payments' key")
            return False
        
        payments = data.get("payments", [])
        if not isinstance(payments, list):
            print(f"❌ FAIL: 'payments' should be an array")
            return False
        
        print(f"   Payments count: {len(payments)}")
        print("✅ PASS: Payments endpoint working correctly")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_subscribe_free_plan(token):
    """Test 8: POST /api/subscribe with free plan should return 400"""
    print("\n=== Test 8: Subscribe to free plan (should fail) ===")
    try:
        response = requests.post(f"{BASE_URL}/subscribe", 
            json={"planId": "free"},
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {response.status_code}")
            return False
        
        error_msg = data.get("error", "")
        if "free plan cannot be subscribed" not in error_msg.lower():
            print(f"❌ FAIL: Expected 'Free plan cannot be subscribed', got '{error_msg}'")
            return False
        
        print(f"   Error message: {error_msg}")
        print("✅ PASS: Free plan subscription correctly rejected")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_plans_disable_enable(token):
    """Test 9: PUT /api/admin/plans to disable/enable monthly plan"""
    print("\n=== Test 9: Disable and re-enable monthly plan ===")
    try:
        # First, get current plans
        response = requests.get(f"{BASE_URL}/admin/plans",
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code != 200:
            print(f"❌ FAIL: Could not get admin plans - {response.status_code}")
            return False
        
        original_plans = response.json().get("plans", [])
        print(f"   Original plans count: {len(original_plans)}")
        
        # Disable monthly plan
        modified_plans = []
        for plan in original_plans:
            p = plan.copy()
            if p.get("id") == "monthly":
                p["enabled"] = False
                print(f"   Disabling monthly plan")
            modified_plans.append(p)
        
        response = requests.put(f"{BASE_URL}/admin/plans",
            json={"plans": modified_plans},
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code != 200:
            print(f"❌ FAIL: Could not update plans - {response.status_code}")
            return False
        print("   Plans updated (monthly disabled)")
        
        # Check public /plans endpoint - monthly should NOT appear
        response = requests.get(f"{BASE_URL}/plans")
        data = response.json()
        public_plans = data.get("plans", [])
        monthly_in_public = any(p.get("id") == "monthly" for p in public_plans)
        
        if monthly_in_public:
            print(f"❌ FAIL: Monthly plan still appears in public /plans endpoint")
            return False
        print(f"   Public plans count: {len(public_plans)} (monthly correctly excluded)")
        
        # Re-enable monthly plan
        for plan in modified_plans:
            if plan.get("id") == "monthly":
                plan["enabled"] = True
                print(f"   Re-enabling monthly plan")
        
        response = requests.put(f"{BASE_URL}/admin/plans",
            json={"plans": modified_plans},
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code != 200:
            print(f"❌ FAIL: Could not restore plans - {response.status_code}")
            return False
        print("   Plans restored (monthly enabled)")
        
        # Check public /plans endpoint - monthly should appear again
        response = requests.get(f"{BASE_URL}/plans")
        data = response.json()
        public_plans = data.get("plans", [])
        monthly_in_public = any(p.get("id") == "monthly" for p in public_plans)
        
        if not monthly_in_public:
            print(f"❌ FAIL: Monthly plan does not appear after re-enabling")
            return False
        print(f"   Public plans count: {len(public_plans)} (monthly correctly included)")
        
        print("✅ PASS: Plan enable/disable working correctly")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_admin_plans_new_fields(token):
    """Test 10: PUT /api/admin/plans with new fields (originalPrice, headline, savingsText)"""
    print("\n=== Test 10: Update plans with new fields ===")
    try:
        # Get current plans
        response = requests.get(f"{BASE_URL}/admin/plans",
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code != 200:
            print(f"❌ FAIL: Could not get admin plans - {response.status_code}")
            return False
        
        plans = response.json().get("plans", [])
        
        # Modify quarterly plan with new fields
        test_values = {
            "originalPrice": 350,
            "headline": "Test Headline for Quarterly",
            "savingsText": "Test Savings Text",
        }
        
        for plan in plans:
            if plan.get("id") == "quarterly":
                plan.update(test_values)
                print(f"   Updated quarterly plan with test values")
        
        # Update plans
        response = requests.put(f"{BASE_URL}/admin/plans",
            json={"plans": plans},
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code != 200:
            print(f"❌ FAIL: Could not update plans - {response.status_code}")
            return False
        
        # Verify changes persisted
        response = requests.get(f"{BASE_URL}/admin/plans",
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code != 200:
            print(f"❌ FAIL: Could not get updated plans - {response.status_code}")
            return False
        
        updated_plans = response.json().get("plans", [])
        quarterly = next((p for p in updated_plans if p.get("id") == "quarterly"), None)
        
        if not quarterly:
            print(f"❌ FAIL: Quarterly plan not found after update")
            return False
        
        # Check all fields persisted
        all_match = True
        for key, expected_value in test_values.items():
            actual_value = quarterly.get(key)
            if actual_value != expected_value:
                print(f"❌ FAIL: {key} = {actual_value}, expected {expected_value}")
                all_match = False
            else:
                print(f"   {key}: {actual_value} ✅")
        
        if not all_match:
            return False
        
        # Restore original values
        response = requests.get(f"{BASE_URL}/admin/plans",
            headers={"Authorization": f"Bearer {token}"}
        )
        plans = response.json().get("plans", [])
        for plan in plans:
            if plan.get("id") == "quarterly":
                plan["originalPrice"] = 297
                plan["headline"] = "Save ₹48 compared to Monthly"
                plan["savingsText"] = "Save ₹48 compared to Monthly"
        
        requests.put(f"{BASE_URL}/admin/plans",
            json={"plans": plans},
            headers={"Authorization": f"Bearer {token}"}
        )
        print("   Restored original quarterly plan values")
        
        print("✅ PASS: New plan fields persist correctly")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_classes():
    """Test 11: Regression - GET /api/classes returns 11 classes"""
    print("\n=== Test 11: Regression - GET /api/classes ===")
    try:
        response = requests.get(f"{BASE_URL}/classes")
        print(f"Status: {response.status_code}")
        data = response.json()
        classes = data.get("classes", [])
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        if len(classes) != 11:
            print(f"❌ FAIL: Expected 11 classes, got {len(classes)}")
            return False
        
        print(f"   Classes count: {len(classes)}")
        print("✅ PASS: Classes endpoint working")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_admin_users(token):
    """Test 12: Regression - GET /api/admin/users"""
    print("\n=== Test 12: Regression - GET /api/admin/users ===")
    try:
        response = requests.get(f"{BASE_URL}/admin/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        users = data.get("users", [])
        print(f"   Users count: {len(users)}")
        print("✅ PASS: Admin users endpoint working")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_contact():
    """Test 13: Regression - POST /api/contact"""
    print("\n=== Test 13: Regression - POST /api/contact ===")
    try:
        response = requests.post(f"{BASE_URL}/contact", json={
            "name": "Test User Phase 3",
            "mobile": "9876543210",
            "email": "test@example.com",
            "subject": "Phase 3 Test",
            "message": "Testing contact form in Phase 3"
        })
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        if not data.get("ok"):
            print(f"❌ FAIL: Expected ok:true")
            return False
        
        print(f"   Message: {data.get('message')}")
        print("✅ PASS: Contact endpoint working")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_webhook_signature():
    """Test 14: Regression - Webhook signature verification"""
    print("\n=== Test 14: Regression - Webhook signature verification ===")
    try:
        # Test without signature header
        response = requests.post(f"{BASE_URL}/razorpay/webhook",
            data=json.dumps({"event": "payment.captured"}),
            headers={"Content-Type": "application/json"}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAIL: Expected 400 for missing signature, got {response.status_code}")
            return False
        
        data = response.json()
        error = data.get("error", "")
        print(f"   Error: {error}")
        
        if "signature" not in error.lower() and "secret" not in error.lower():
            print(f"❌ FAIL: Expected signature/secret error")
            return False
        
        print("✅ PASS: Webhook signature verification working")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_regression_revenue(token):
    """Test 15: Regression - GET /api/admin/revenue"""
    print("\n=== Test 15: Regression - GET /api/admin/revenue ===")
    try:
        response = requests.get(f"{BASE_URL}/admin/revenue?range=30d",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        if "totals" not in data or "daily" not in data or "monthly" not in data:
            print(f"❌ FAIL: Missing required fields in response")
            return False
        
        totals = data.get("totals", {})
        print(f"   Lifetime amount: ₹{totals.get('lifetimeAmount', 0)}")
        print(f"   Lifetime count: {totals.get('lifetimeCount', 0)}")
        print("✅ PASS: Revenue endpoint working")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def main():
    print("=" * 70)
    print("PHASE 3 BACKEND TESTING — New Subscription Structure")
    print("Testing 5 plans (Free/Monthly/Quarterly/Yearly/Lifetime)")
    print("=" * 70)
    
    results = []
    
    # Test 1: Admin login
    token = test_admin_login()
    results.append(("Admin Login", token is not None))
    
    if not token:
        print("\n❌ CRITICAL: Cannot proceed without admin token")
        sys.exit(1)
    
    # Test 2-10: Phase 3 specific tests
    results.append(("GET /api/plans (5 plans)", test_get_plans()))
    results.append(("Create order - free plan (reject)", test_create_order_free_plan(token)))
    results.append(("Create order - yearly plan", test_create_order_yearly(token)))
    results.append(("Create order - lifetime plan", test_create_order_lifetime(token)))
    results.append(("GET /me/payments - no auth", test_get_payments_without_auth()))
    results.append(("GET /me/payments - with auth", test_get_payments_with_auth(token)))
    results.append(("Subscribe - free plan (reject)", test_subscribe_free_plan(token)))
    results.append(("Admin plans - disable/enable", test_admin_plans_disable_enable(token)))
    results.append(("Admin plans - new fields", test_admin_plans_new_fields(token)))
    
    # Test 11-15: Regression tests
    results.append(("Regression - Classes", test_regression_classes()))
    results.append(("Regression - Admin Users", test_regression_admin_users(token)))
    results.append(("Regression - Contact", test_regression_contact()))
    results.append(("Regression - Webhook", test_regression_webhook_signature()))
    results.append(("Regression - Revenue", test_regression_revenue(token)))
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("=" * 70)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("=" * 70)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
