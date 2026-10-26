#!/usr/bin/env python3
"""
Backend API Test Suite for Lesson Guru Odisha - Phase 2
Tests Razorpay LIVE, User CRUD, Revenue, Plans, Contact, Inbox, Settings
"""

import requests
import json
import sys
import hmac
import hashlib
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
PRIMARY_ADMIN_MOBILE = "9692604577"
PRIMARY_ADMIN_PASSWORD = "<redacted>"
LEGACY_ADMIN_MOBILE = "9999999999"
LEGACY_ADMIN_PASSWORD = "admin123"

# Global variables for test state
primary_admin_token = None
legacy_admin_token = None
test_user_token = None
test_user_id = None
test_user_mobile = None
test_contact_message_id = None
test_razorpay_order_id = None

def log(message, status="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{status}] {message}")

# ===== REGRESSION TESTS =====

def test_regression_classes():
    """Regression: GET /api/classes returns 11 classes"""
    log("Testing regression: GET /classes returns 11 classes...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/classes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "classes" in data, "Response should contain classes"
        classes = data["classes"]
        assert len(classes) == 11, f"Expected 11 classes, got {len(classes)}"
        log(f"✅ Regression: Classes count correct (11 classes)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression: Classes test failed: {str(e)}", "FAIL")
        return False

def test_regression_plans():
    """Regression: GET /api/plans returns 4 plans with correct prices"""
    log("Testing regression: GET /plans returns 4 plans...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "plans" in data, "Response should contain plans"
        plans = data["plans"]
        assert len(plans) == 4, f"Expected 4 plans, got {len(plans)}"
        
        # Check prices
        plan_dict = {p["id"]: p for p in plans}
        assert plan_dict["monthly"]["price"] == 99, "Monthly should be ₹99"
        assert plan_dict["quarterly"]["price"] == 299, "Quarterly should be ₹299"
        assert plan_dict["yearly"]["price"] == 499, "Yearly should be ₹499"
        assert plan_dict["lifetime"]["price"] == 1499, "Lifetime should be ₹1499"
        
        log(f"✅ Regression: Plans correct (monthly ₹99, quarterly ₹299, yearly ₹499, lifetime ₹1499)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression: Plans test failed: {str(e)}", "FAIL")
        return False

# ===== AUTH TESTS (NEW PRIMARY ADMIN) =====

def test_primary_admin_login():
    """Test 1: Login as new primary admin (9692604577 / <redacted>)"""
    global primary_admin_token
    log("Testing primary admin login (9692604577)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": PRIMARY_ADMIN_MOBILE,
            "password": PRIMARY_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert data["user"]["role"] == "admin", "User should be admin"
        assert data["user"]["mobile"] == PRIMARY_ADMIN_MOBILE, "Mobile should match"
        
        primary_admin_token = data["token"]
        log("✅ Primary admin login passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Primary admin login failed: {str(e)}", "FAIL")
        return False

def test_legacy_admin_login():
    """Test 2: Login as legacy admin (9999999999 / admin123) - backward compatibility"""
    global legacy_admin_token
    log("Testing legacy admin login (9999999999)...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": LEGACY_ADMIN_MOBILE,
            "password": LEGACY_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert data["user"]["role"] == "admin", "User should be admin"
        
        legacy_admin_token = data["token"]
        log("✅ Legacy admin login passed (backward compatibility confirmed)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Legacy admin login failed: {str(e)}", "FAIL")
        return False

def test_auth_me_primary_admin():
    """Test 3: GET /auth/me with primary admin token"""
    log("Testing /auth/me with primary admin token...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "user" in data, "Response should contain user"
        assert data["user"]["mobile"] == PRIMARY_ADMIN_MOBILE, "Mobile should match"
        assert data["user"]["role"] == "admin", "Role should be admin"
        log("✅ /auth/me with primary admin passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ /auth/me with primary admin failed: {str(e)}", "FAIL")
        return False

# ===== RAZORPAY TESTS =====

def test_razorpay_config():
    """Test 4: GET /razorpay/config returns enabled:true with keyId"""
    log("Testing Razorpay config...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/razorpay/config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "enabled" in data, "Response should contain enabled"
        assert data["enabled"] == True, "Razorpay should be enabled"
        assert "keyId" in data, "Response should contain keyId"
        assert data["keyId"].startswith("rzp_live_"), f"KeyId should start with rzp_live_, got {data['keyId']}"
        log(f"✅ Razorpay config passed (enabled: true, keyId: {data['keyId']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay config failed: {str(e)}", "FAIL")
        return False

def test_razorpay_create_order_monthly():
    """Test 5: POST /razorpay/create-order for monthly plan (creates real RZP order)"""
    global test_razorpay_order_id
    log("Testing Razorpay create order for monthly plan...", "TEST")
    try:
        # First create a test user
        test_mobile = f"88{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Priya Sharma",
            "mobile": test_mobile,
            "password": "test1234"
        })
        assert reg_response.status_code == 200, "User registration failed"
        user_token = reg_response.json()["token"]
        
        # Create order
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            headers=headers,
            json={"planId": "monthly"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "orderId" in data, "Response should contain orderId"
        assert data["orderId"].startswith("order_"), f"OrderId should start with 'order_', got {data['orderId']}"
        assert "amount" in data, "Response should contain amount"
        assert data["amount"] == 9900, f"Amount should be 9900 paise (₹99), got {data['amount']}"
        assert data["currency"] == "INR", "Currency should be INR"
        assert data["keyId"].startswith("rzp_live_"), "KeyId should be live key"
        assert data["planName"] == "Monthly Plan", "Plan name should match"
        
        test_razorpay_order_id = data["orderId"]
        log(f"✅ Razorpay create order passed (orderId: {data['orderId']}, amount: ₹99)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay create order failed: {str(e)}", "FAIL")
        return False

def test_razorpay_create_order_quarterly():
    """Test 6: POST /razorpay/create-order for quarterly plan"""
    log("Testing Razorpay create order for quarterly plan...", "TEST")
    try:
        test_mobile = f"87{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Amit Patel",
            "mobile": test_mobile,
            "password": "test1234"
        })
        user_token = reg_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            headers=headers,
            json={"planId": "quarterly"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["orderId"].startswith("order_"), "OrderId should start with 'order_'"
        assert data["amount"] == 29900, f"Amount should be 29900 paise (₹299), got {data['amount']}"
        log(f"✅ Razorpay create order quarterly passed (orderId: {data['orderId']}, amount: ₹299)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay create order quarterly failed: {str(e)}", "FAIL")
        return False

def test_razorpay_create_order_yearly():
    """Test 7: POST /razorpay/create-order for yearly plan"""
    log("Testing Razorpay create order for yearly plan...", "TEST")
    try:
        test_mobile = f"86{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Sunita Rao",
            "mobile": test_mobile,
            "password": "test1234"
        })
        user_token = reg_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            headers=headers,
            json={"planId": "yearly"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["orderId"].startswith("order_"), "OrderId should start with 'order_'"
        assert data["amount"] == 49900, f"Amount should be 49900 paise (₹499), got {data['amount']}"
        log(f"✅ Razorpay create order yearly passed (orderId: {data['orderId']}, amount: ₹499)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay create order yearly failed: {str(e)}", "FAIL")
        return False

def test_razorpay_create_order_lifetime():
    """Test 8: POST /razorpay/create-order for lifetime plan"""
    log("Testing Razorpay create order for lifetime plan...", "TEST")
    try:
        test_mobile = f"85{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Vikram Singh",
            "mobile": test_mobile,
            "password": "test1234"
        })
        user_token = reg_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(f"{BASE_URL}/razorpay/create-order", 
            headers=headers,
            json={"planId": "lifetime"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["orderId"].startswith("order_"), "OrderId should start with 'order_'"
        assert data["amount"] == 149900, f"Amount should be 149900 paise (₹1499), got {data['amount']}"
        log(f"✅ Razorpay create order lifetime passed (orderId: {data['orderId']}, amount: ₹1499)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay create order lifetime failed: {str(e)}", "FAIL")
        return False

def test_razorpay_verify_invalid_signature():
    """Test 9: POST /razorpay/verify with FAKE signature returns 400"""
    log("Testing Razorpay verify with invalid signature...", "TEST")
    try:
        test_mobile = f"84{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User Verify",
            "mobile": test_mobile,
            "password": "test1234"
        })
        user_token = reg_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(f"{BASE_URL}/razorpay/verify", 
            headers=headers,
            json={
                "razorpay_order_id": "order_fake123",
                "razorpay_payment_id": "pay_fake456",
                "razorpay_signature": "fake_signature_12345",
                "planId": "monthly"
            })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Response should contain error"
        log("✅ Razorpay verify invalid signature passed (correctly rejected)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay verify invalid signature failed: {str(e)}", "FAIL")
        return False

def test_razorpay_webhook_no_signature():
    """Test 10: POST /razorpay/webhook without signature returns 400"""
    log("Testing Razorpay webhook without signature...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/razorpay/webhook", 
            json={"event": "payment.captured", "payload": {}})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Response should contain error"
        log("✅ Razorpay webhook without signature passed (correctly rejected)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay webhook without signature failed: {str(e)}", "FAIL")
        return False

def test_razorpay_webhook_wrong_signature():
    """Test 11: POST /razorpay/webhook with wrong signature returns 400"""
    log("Testing Razorpay webhook with wrong signature...", "TEST")
    try:
        headers = {"x-razorpay-signature": "wrong_signature_12345"}
        response = requests.post(f"{BASE_URL}/razorpay/webhook", 
            headers=headers,
            json={"event": "payment.captured", "payload": {}})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Response should contain error"
        log("✅ Razorpay webhook wrong signature passed (correctly rejected)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Razorpay webhook wrong signature failed: {str(e)}", "FAIL")
        return False

# ===== CONTACT TESTS =====

def test_contact_create():
    """Test 12: POST /contact creates message (no auth required)"""
    global test_contact_message_id
    log("Testing contact form submission...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/contact", json={
            "name": "Ramesh Kumar",
            "mobile": "9876543210",
            "email": "ramesh@example.com",
            "subject": "Need help with subscription",
            "message": "I am unable to activate my subscription. Please help."
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        assert "message" in data, "Should return success message"
        log("✅ Contact form submission passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Contact form submission failed: {str(e)}", "FAIL")
        return False

def test_contact_validation():
    """Test 13: POST /contact with missing fields returns 400"""
    log("Testing contact form validation...", "TEST")
    try:
        response = requests.post(f"{BASE_URL}/contact", json={
            "name": "Test User"
            # Missing mobile and message
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        log("✅ Contact form validation passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Contact form validation failed: {str(e)}", "FAIL")
        return False

# ===== ADMIN USER CRUD TESTS =====

def test_admin_users_list():
    """Test 14: GET /admin/users returns user list"""
    log("Testing admin users list...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/users", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "users" in data, "Response should contain users"
        users = data["users"]
        assert len(users) >= 2, f"Should have at least 2 users (admins + test users)"
        # Check password not included
        if users:
            assert "password" not in users[0], "Password should not be in response"
        log(f"✅ Admin users list passed ({len(users)} users found)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin users list failed: {str(e)}", "FAIL")
        return False

def test_admin_users_search():
    """Test 15: GET /admin/users?search=... filters by name or mobile"""
    log("Testing admin users search...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/users?search=9692604577", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "users" in data, "Response should contain users"
        users = data["users"]
        # Should find primary admin
        found = any(u["mobile"] == PRIMARY_ADMIN_MOBILE for u in users)
        assert found, "Should find primary admin by mobile search"
        log(f"✅ Admin users search passed (found {len(users)} users)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin users search failed: {str(e)}", "FAIL")
        return False

def test_admin_create_user():
    """Test 16: POST /admin/users creates user with optional subscription"""
    global test_user_id, test_user_mobile, test_user_token
    log("Testing admin create user with subscription...", "TEST")
    try:
        test_user_mobile = f"83{datetime.now().strftime('%H%M%S%f')[:8]}"
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/users",
            headers=headers,
            json={
                "name": "Kavita Devi",
                "mobile": test_user_mobile,
                "password": "test1234",
                "role": "user",
                "planId": "monthly",
                "daysOverride": 30
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "user" in data, "Response should contain user"
        user = data["user"]
        assert user["mobile"] == test_user_mobile, "Mobile should match"
        assert user["subscription"]["status"] == "active", "Subscription should be active"
        assert user["subscription"]["plan"] == "monthly", "Plan should be monthly"
        
        # Check expiry is ~30 days in future
        expiry = datetime.fromisoformat(user["subscription"]["expiryDate"].replace("Z", "+00:00"))
        now = datetime.now(expiry.tzinfo)
        days_diff = (expiry - now).days
        assert 28 <= days_diff <= 32, f"Expiry should be ~30 days, got {days_diff} days"
        
        test_user_id = user["id"]
        
        # Login as this user to get token
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": "test1234"
        })
        test_user_token = login_response.json()["token"]
        
        log(f"✅ Admin create user passed (user: {test_user_mobile}, subscription: active)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin create user failed: {str(e)}", "FAIL")
        return False

def test_admin_update_user():
    """Test 17: PUT /admin/users/:id updates name/role"""
    log("Testing admin update user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/users/{test_user_id}",
            headers=headers,
            json={
                "name": "Kavita Devi Updated",
                "role": "user"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        log("✅ Admin update user passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin update user failed: {str(e)}", "FAIL")
        return False

def test_admin_reset_password():
    """Test 18: PUT /admin/users/:id/reset-password resets password"""
    log("Testing admin reset password...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/users/{test_user_id}/reset-password",
            headers=headers,
            json={"newPassword": "newpass1234"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        # Verify new password works
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": "newpass1234"
        })
        assert login_response.status_code == 200, "Login with new password should work"
        
        log("✅ Admin reset password passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin reset password failed: {str(e)}", "FAIL")
        return False

def test_admin_suspend_user():
    """Test 19: PUT /admin/users/:id/suspend suspends user"""
    log("Testing admin suspend user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/users/{test_user_id}/suspend",
            headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        # Verify login fails with 403
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": "newpass1234"
        })
        assert login_response.status_code == 403, f"Expected 403 for suspended user, got {login_response.status_code}"
        login_data = login_response.json()
        assert "suspended" in login_data.get("error", "").lower(), "Error should mention suspension"
        
        log("✅ Admin suspend user passed (login blocked with 403)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin suspend user failed: {str(e)}", "FAIL")
        return False

def test_admin_unsuspend_user():
    """Test 20: PUT /admin/users/:id/unsuspend unsuspends user"""
    log("Testing admin unsuspend user...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/users/{test_user_id}/unsuspend",
            headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        # Verify login works again
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_user_mobile,
            "password": "newpass1234"
        })
        assert login_response.status_code == 200, "Login should work after unsuspend"
        
        log("✅ Admin unsuspend user passed (login works again)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin unsuspend user failed: {str(e)}", "FAIL")
        return False

def test_admin_activate_subscription():
    """Test 21: PUT /admin/users/:id/activate-subscription manually activates subscription"""
    log("Testing admin activate subscription...", "TEST")
    try:
        # Create a user without subscription
        new_mobile = f"82{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Ravi Kumar",
            "mobile": new_mobile,
            "password": "test1234"
        })
        new_user_id = reg_response.json()["user"]["id"]
        
        # Activate subscription
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/users/{new_user_id}/activate-subscription",
            headers=headers,
            json={
                "planId": "yearly",
                "daysOverride": 365
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        log("✅ Admin activate subscription passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin activate subscription failed: {str(e)}", "FAIL")
        return False

def test_admin_deactivate_subscription():
    """Test 22: PUT /admin/users/:id/deactivate-subscription cancels subscription"""
    log("Testing admin deactivate subscription...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/users/{test_user_id}/deactivate-subscription",
            headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        log("✅ Admin deactivate subscription passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin deactivate subscription failed: {str(e)}", "FAIL")
        return False

def test_admin_delete_user():
    """Test 23: DELETE /admin/users/:id deletes user (cannot delete self or primary admin)"""
    log("Testing admin delete user...", "TEST")
    try:
        # Create a user to delete
        del_mobile = f"81{datetime.now().strftime('%H%M%S%f')[:8]}"
        reg_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Delete Me",
            "mobile": del_mobile,
            "password": "test1234"
        })
        del_user_id = reg_response.json()["user"]["id"]
        
        # Delete user
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.delete(f"{BASE_URL}/admin/users/{del_user_id}",
            headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        log("✅ Admin delete user passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin delete user failed: {str(e)}", "FAIL")
        return False

def test_admin_cannot_delete_primary_admin():
    """Test 24: DELETE /admin/users/:id cannot delete primary admin (9692604577)"""
    log("Testing admin cannot delete primary admin...", "TEST")
    try:
        # Get primary admin user ID
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        users_response = requests.get(f"{BASE_URL}/admin/users?search=9692604577", headers=headers)
        users = users_response.json()["users"]
        primary_admin_id = next(u["id"] for u in users if u["mobile"] == PRIMARY_ADMIN_MOBILE)
        
        # Try to delete (should fail)
        response = requests.delete(f"{BASE_URL}/admin/users/{primary_admin_id}",
            headers=headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error"
        
        log("✅ Admin cannot delete primary admin passed (correctly blocked)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin cannot delete primary admin failed: {str(e)}", "FAIL")
        return False

# ===== ADMIN REVENUE TESTS =====

def test_admin_revenue_30d():
    """Test 25: GET /admin/revenue?range=30d returns revenue data"""
    log("Testing admin revenue dashboard (30d)...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/revenue?range=30d", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "totals" in data, "Response should contain totals"
        assert "daily" in data, "Response should contain daily"
        assert "monthly" in data, "Response should contain monthly"
        assert "planBreakdown" in data, "Response should contain planBreakdown"
        
        totals = data["totals"]
        assert "rangeAmount" in totals, "Totals should have rangeAmount"
        assert "rangeCount" in totals, "Totals should have rangeCount"
        assert "lifetimeAmount" in totals, "Totals should have lifetimeAmount"
        assert "lifetimeCount" in totals, "Totals should have lifetimeCount"
        assert "todayAmount" in totals, "Totals should have todayAmount"
        assert "thisMonthAmount" in totals, "Totals should have thisMonthAmount"
        
        log(f"✅ Admin revenue 30d passed (lifetime: ₹{totals['lifetimeAmount']}, count: {totals['lifetimeCount']})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin revenue 30d failed: {str(e)}", "FAIL")
        return False

def test_admin_revenue_7d():
    """Test 26: GET /admin/revenue?range=7d"""
    log("Testing admin revenue dashboard (7d)...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/revenue?range=7d", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["range"] == "7d", "Range should be 7d"
        log("✅ Admin revenue 7d passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin revenue 7d failed: {str(e)}", "FAIL")
        return False

def test_admin_revenue_all():
    """Test 27: GET /admin/revenue?range=all"""
    log("Testing admin revenue dashboard (all)...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/revenue?range=all", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["range"] == "all", "Range should be all"
        log("✅ Admin revenue all passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin revenue all failed: {str(e)}", "FAIL")
        return False

# ===== ADMIN PLAN MANAGER TESTS =====

def test_admin_get_plans():
    """Test 28: GET /admin/plans returns plans from settings"""
    log("Testing admin get plans...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/plans", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "plans" in data, "Response should contain plans"
        plans = data["plans"]
        assert len(plans) == 4, f"Should have 4 plans, got {len(plans)}"
        log(f"✅ Admin get plans passed ({len(plans)} plans)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin get plans failed: {str(e)}", "FAIL")
        return False

def test_admin_update_plans():
    """Test 29: PUT /admin/plans updates plans (modify and restore)"""
    log("Testing admin update plans...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        
        # Get current plans
        get_response = requests.get(f"{BASE_URL}/admin/plans", headers=headers)
        original_plans = get_response.json()["plans"]
        
        # Modify monthly plan price
        modified_plans = original_plans.copy()
        for plan in modified_plans:
            if plan["id"] == "monthly":
                plan["price"] = 199  # Change from 99 to 199
        
        # Update plans
        response = requests.put(f"{BASE_URL}/admin/plans",
            headers=headers,
            json={"plans": modified_plans})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "plans" in data, "Response should contain plans"
        
        # Verify change
        verify_response = requests.get(f"{BASE_URL}/admin/plans", headers=headers)
        verify_plans = verify_response.json()["plans"]
        monthly = next(p for p in verify_plans if p["id"] == "monthly")
        assert monthly["price"] == 199, f"Monthly price should be 199, got {monthly['price']}"
        
        # Restore original prices
        restore_response = requests.put(f"{BASE_URL}/admin/plans",
            headers=headers,
            json={"plans": original_plans})
        assert restore_response.status_code == 200, "Restore should succeed"
        
        log("✅ Admin update plans passed (modified and restored)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin update plans failed: {str(e)}", "FAIL")
        return False

# ===== ADMIN CONTACT INBOX TESTS =====

def test_admin_get_contact_messages_new():
    """Test 30: GET /admin/contact-messages?status=new returns new messages"""
    log("Testing admin get contact messages (new)...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/contact-messages?status=new", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "messages" in data, "Response should contain messages"
        assert "newCount" in data, "Response should contain newCount"
        messages = data["messages"]
        log(f"✅ Admin get contact messages passed ({len(messages)} messages, {data['newCount']} new)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin get contact messages failed: {str(e)}", "FAIL")
        return False

def test_admin_update_contact_message_status():
    """Test 31: PUT /admin/contact-messages/:id updates status"""
    log("Testing admin update contact message status...", "TEST")
    try:
        # Get a message ID
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        get_response = requests.get(f"{BASE_URL}/admin/contact-messages?status=all", headers=headers)
        messages = get_response.json()["messages"]
        if not messages:
            log("⚠️ No contact messages found, skipping", "WARN")
            return True
        
        message_id = messages[0]["id"]
        
        # Update status
        response = requests.put(f"{BASE_URL}/admin/contact-messages/{message_id}",
            headers=headers,
            json={"status": "read"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        log("✅ Admin update contact message status passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin update contact message status failed: {str(e)}", "FAIL")
        return False

def test_admin_delete_contact_message():
    """Test 32: DELETE /admin/contact-messages/:id deletes message"""
    log("Testing admin delete contact message...", "TEST")
    try:
        # Create a message to delete
        contact_response = requests.post(f"{BASE_URL}/contact", json={
            "name": "Delete Test",
            "mobile": "9999999998",
            "message": "This message will be deleted"
        })
        
        # Get the message
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        get_response = requests.get(f"{BASE_URL}/admin/contact-messages?status=all", headers=headers)
        messages = get_response.json()["messages"]
        if not messages:
            log("⚠️ No contact messages found, skipping", "WARN")
            return True
        
        message_id = messages[0]["id"]
        
        # Delete
        response = requests.delete(f"{BASE_URL}/admin/contact-messages/{message_id}",
            headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        log("✅ Admin delete contact message passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin delete contact message failed: {str(e)}", "FAIL")
        return False

# ===== ADMIN SETTINGS TESTS =====

def test_admin_get_settings():
    """Test 33: GET /admin/settings returns all settings"""
    log("Testing admin get settings...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "settings" in data, "Response should contain settings"
        log(f"✅ Admin get settings passed ({len(data['settings'])} settings)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin get settings failed: {str(e)}", "FAIL")
        return False

def test_admin_put_settings():
    """Test 34: PUT /admin/settings creates/updates setting"""
    log("Testing admin put settings...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/settings",
            headers=headers,
            json={
                "key": "test_setting",
                "value": "hello_world"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("ok") == True, "Should return ok:true"
        
        # Verify setting was saved
        get_response = requests.get(f"{BASE_URL}/admin/settings", headers=headers)
        settings = get_response.json()["settings"]
        assert "test_setting" in settings, "Setting should be saved"
        assert settings["test_setting"] == "hello_world", "Setting value should match"
        
        log("✅ Admin put settings passed", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin put settings failed: {str(e)}", "FAIL")
        return False

def test_admin_put_settings_cannot_set_plans():
    """Test 35: PUT /admin/settings with key='plans' should be rejected"""
    log("Testing admin put settings cannot set plans key...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.put(f"{BASE_URL}/admin/settings",
            headers=headers,
            json={
                "key": "plans",
                "value": []
            })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Should return error"
        log("✅ Admin put settings cannot set plans passed (correctly blocked)", "PASS")
        return True
    except Exception as e:
        log(f"❌ Admin put settings cannot set plans failed: {str(e)}", "FAIL")
        return False

# ===== REGRESSION: BULK IMPORT =====

def test_regression_bulk_import():
    """Regression: POST /admin/bulk-import still works"""
    log("Testing regression: bulk import...", "TEST")
    try:
        headers = {"Authorization": f"Bearer {primary_admin_token}"}
        response = requests.post(f"{BASE_URL}/admin/bulk-import",
            headers=headers,
            json={
                "rows": [{
                    "className": "Class 1",
                    "bookName": "Test Book Regression",
                    "chapterName": "Test Chapter Regression",
                    "period": 1,
                    "title": "Test Lesson Regression",
                    "content": "Test content",
                    "learningOutcomes": ["Test LO"]
                }],
                "dedupeMode": "skip"
            })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "rows" in data, "Response should contain rows"
        assert "lessonsCreated" in data or "lessonsSkipped" in data, "Should have lesson stats"
        log(f"✅ Regression: Bulk import passed (created: {data.get('lessonsCreated', 0)}, skipped: {data.get('lessonsSkipped', 0)})", "PASS")
        return True
    except Exception as e:
        log(f"❌ Regression: Bulk import failed: {str(e)}", "FAIL")
        return False

def run_all_tests():
    """Run all backend tests"""
    log("=" * 80, "INFO")
    log("Starting Lesson Guru Odisha Phase 2 Backend Test Suite", "INFO")
    log(f"Base URL: {BASE_URL}", "INFO")
    log("=" * 80, "INFO")
    
    tests = [
        # Regression tests
        ("Regression: Classes (11)", test_regression_classes),
        ("Regression: Plans (4 with correct prices)", test_regression_plans),
        
        # Auth tests (new primary admin)
        ("Primary Admin Login (9692604577)", test_primary_admin_login),
        ("Legacy Admin Login (9999999999)", test_legacy_admin_login),
        ("Auth Me Primary Admin", test_auth_me_primary_admin),
        
        # Razorpay tests
        ("Razorpay Config", test_razorpay_config),
        ("Razorpay Create Order Monthly", test_razorpay_create_order_monthly),
        ("Razorpay Create Order Quarterly", test_razorpay_create_order_quarterly),
        ("Razorpay Create Order Yearly", test_razorpay_create_order_yearly),
        ("Razorpay Create Order Lifetime", test_razorpay_create_order_lifetime),
        ("Razorpay Verify Invalid Signature", test_razorpay_verify_invalid_signature),
        ("Razorpay Webhook No Signature", test_razorpay_webhook_no_signature),
        ("Razorpay Webhook Wrong Signature", test_razorpay_webhook_wrong_signature),
        
        # Contact tests
        ("Contact Create", test_contact_create),
        ("Contact Validation", test_contact_validation),
        
        # Admin User CRUD tests
        ("Admin Users List", test_admin_users_list),
        ("Admin Users Search", test_admin_users_search),
        ("Admin Create User", test_admin_create_user),
        ("Admin Update User", test_admin_update_user),
        ("Admin Reset Password", test_admin_reset_password),
        ("Admin Suspend User", test_admin_suspend_user),
        ("Admin Unsuspend User", test_admin_unsuspend_user),
        ("Admin Activate Subscription", test_admin_activate_subscription),
        ("Admin Deactivate Subscription", test_admin_deactivate_subscription),
        ("Admin Delete User", test_admin_delete_user),
        ("Admin Cannot Delete Primary Admin", test_admin_cannot_delete_primary_admin),
        
        # Admin Revenue tests
        ("Admin Revenue 30d", test_admin_revenue_30d),
        ("Admin Revenue 7d", test_admin_revenue_7d),
        ("Admin Revenue All", test_admin_revenue_all),
        
        # Admin Plan Manager tests
        ("Admin Get Plans", test_admin_get_plans),
        ("Admin Update Plans", test_admin_update_plans),
        
        # Admin Contact Inbox tests
        ("Admin Get Contact Messages", test_admin_get_contact_messages_new),
        ("Admin Update Contact Message Status", test_admin_update_contact_message_status),
        ("Admin Delete Contact Message", test_admin_delete_contact_message),
        
        # Admin Settings tests
        ("Admin Get Settings", test_admin_get_settings),
        ("Admin Put Settings", test_admin_put_settings),
        ("Admin Put Settings Cannot Set Plans", test_admin_put_settings_cannot_set_plans),
        
        # Regression: Bulk import
        ("Regression: Bulk Import", test_regression_bulk_import),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            log(f"❌ Test '{name}' crashed: {str(e)}", "FAIL")
            failed += 1
    
    log("=" * 80, "INFO")
    log(f"Test Results: {passed} passed, {failed} failed out of {len(tests)} total", "INFO")
    log(f"Success Rate: {(passed/len(tests)*100):.1f}%", "INFO")
    log("=" * 80, "INFO")
    
    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
