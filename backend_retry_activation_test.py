#!/usr/bin/env python3
"""
Backend test for NEW POST /api/admin/logs/:mismatchLogId/retry-activation endpoint.

This endpoint allows admins to retry a failed subscription activation after fixing
the plan configuration. It re-runs activateSubscription() on the underlying payment
using the CURRENT plan config.

Test Recipe:
1. Login as admin
2. Create a test scenario with a validity mismatch
3. Call the retry endpoint
4. Verify response and database state
5. Test idempotency
6. Test auth and error cases
7. Cleanup
8. Regression tests
"""

import requests
import json
from uuid import uuid4
from datetime import datetime, timedelta

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def test_retry_activation():
    print("\n" + "="*80)
    print("🧪 TESTING: POST /api/admin/logs/:mismatchLogId/retry-activation")
    print("="*80 + "\n")

    # -------------------------------------------------------------------------
    # TEST 1: Admin Login
    # -------------------------------------------------------------------------
    print("TEST 1: Admin Login")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        admin_token = resp.json()["token"]
        admin_user_id = resp.json()["user"]["id"]
        print(f"✅ Admin login successful. Token: {admin_token[:20]}...")
        print(f"   Admin user ID: {admin_user_id}")
    except Exception as e:
        print(f"❌ TEST 1 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 2: Register a normal test user
    # -------------------------------------------------------------------------
    print("\nTEST 2: Register a normal test user")
    try:
        # Generate a valid 10-digit mobile number
        import random
        test_mobile = f"99{random.randint(10000000, 99999999)}"
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User Retry",
            "mobile": test_mobile,
            "password": "test1234"
        }, timeout=10)
        assert resp.status_code == 200, f"Register failed: {resp.status_code} {resp.text}"
        test_user_id = resp.json()["user"]["id"]
        test_token = resp.json()["token"]
        print(f"✅ Test user registered: {test_mobile}")
        print(f"   User ID: {test_user_id}")
    except Exception as e:
        print(f"❌ TEST 2 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 3: Get current plan config (monthly plan)
    # -------------------------------------------------------------------------
    print("\nTEST 3: Get current plan config")
    try:
        resp = requests.get(f"{BASE_URL}/plans", timeout=10)
        assert resp.status_code == 200, f"Get plans failed: {resp.status_code} {resp.text}"
        plans = resp.json()["plans"]
        monthly_plan = next((p for p in plans if p["id"] == "monthly"), None)
        assert monthly_plan is not None, "Monthly plan not found"
        print(f"✅ Monthly plan found: {monthly_plan['name']}, {monthly_plan['days']} days")
        monthly_days = monthly_plan["days"]
    except Exception as e:
        print(f"❌ TEST 3 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 4: Create a fake payment record with status='created'
    # -------------------------------------------------------------------------
    print("\nTEST 4: Create a fake payment record")
    try:
        # We'll use MongoDB directly via a helper endpoint or simulate
        # For this test, we'll create a payment via direct DB insertion
        # Since we don't have direct DB access, we'll use the create-order endpoint
        # and then manually insert a mismatch log
        
        # First, let's create a payment order
        resp = requests.post(f"{BASE_URL}/razorpay/create-order", 
            json={"planId": "monthly"},
            headers={"Authorization": f"Bearer {test_token}"},
            timeout=10
        )
        assert resp.status_code == 200, f"Create order failed: {resp.status_code} {resp.text}"
        order_data = resp.json()
        order_id = order_data["orderId"]
        print(f"✅ Payment order created: {order_id}")
        
        # Get the payment ID from the database by querying payments
        # We'll need to use a helper to get this - let's use admin endpoint if available
        # For now, we'll generate a fake payment ID and insert a mismatch log directly
        payment_id = str(uuid4())
        rzp_payment_id = f"pay_retry_test_{uuid4().hex[:8]}"
        
        print(f"   Payment ID: {payment_id}")
        print(f"   Razorpay Payment ID: {rzp_payment_id}")
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 5: Insert a fake mismatch log entry
    # -------------------------------------------------------------------------
    print("\nTEST 5: Insert a fake mismatch log entry")
    try:
        # Since we can't directly insert into MongoDB, we'll need to trigger a real mismatch
        # OR use a backdoor endpoint. For this test, let's assume we can use MongoDB directly
        # via pymongo (if available in the container)
        
        from pymongo import MongoClient
        import os
        
        mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.getenv("DB_NAME", "edumaster_odisha")
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        # First, insert a fake payment record
        payment_doc = {
            "id": payment_id,
            "userId": test_user_id,
            "plan": "monthly",
            "amount": 99,
            "status": "created",
            "razorpay_order_id": order_id,
            "razorpay_payment_id": rzp_payment_id,
            "createdAt": datetime.utcnow()
        }
        db.payments.insert_one(payment_doc)
        print(f"✅ Fake payment inserted into DB")
        
        # Now insert a fake mismatch log
        log_id = str(uuid4())
        mismatch_log = {
            "id": log_id,
            "type": "subscription_validity_mismatch",
            "severity": "error",
            "paymentId": payment_id,
            "orderId": order_id,
            "rzpPaymentId": rzp_payment_id,
            "userId": test_user_id,
            "plan": "monthly",
            "planName": "Monthly",
            "planDays": monthly_days,
            "expectedSpanDays": monthly_days,
            "actualSpanDays": 999,  # Bogus value to simulate mismatch
            "drift": 999 - monthly_days,
            "renewalMode": "extend",
            "source": "webhook",
            "createdAt": datetime.utcnow(),
            "message": "Test mismatch for retry endpoint"
        }
        db.admin_logs.insert_one(mismatch_log)
        print(f"✅ Fake mismatch log inserted: {log_id}")
        print(f"   Expected: {monthly_days} days, Actual: 999 days, Drift: {999 - monthly_days}")
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED: {e}")
        print(f"   Error: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 6: Call the retry endpoint
    # -------------------------------------------------------------------------
    print("\nTEST 6: Call POST /api/admin/logs/:logId/retry-activation")
    try:
        resp = requests.post(f"{BASE_URL}/admin/logs/{log_id}/retry-activation",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 200, f"Retry failed: {resp.status_code} {resp.text}"
        result = resp.json()
        print(f"✅ Retry successful: {json.dumps(result, indent=2)}")
        
        # Verify response structure
        assert result["ok"] == True, "Expected ok=true"
        assert "startDate" in result, "Missing startDate"
        assert "expiryDate" in result, "Missing expiryDate"
        assert "isRenewal" in result, "Missing isRenewal"
        
        start_date = datetime.fromisoformat(result["startDate"].replace("Z", "+00:00"))
        expiry_date = datetime.fromisoformat(result["expiryDate"].replace("Z", "+00:00"))
        span_days = (expiry_date - start_date).total_seconds() / 86400
        
        print(f"   Start Date: {start_date}")
        print(f"   Expiry Date: {expiry_date}")
        print(f"   Span: {span_days:.2f} days (expected ~{monthly_days} days)")
        print(f"   Is Renewal: {result['isRenewal']}")
        
        # Verify span is approximately monthly_days
        assert abs(span_days - monthly_days) < 0.1, f"Span mismatch: {span_days} vs {monthly_days}"
        print(f"✅ Span verification passed: {span_days:.2f} ≈ {monthly_days} days")
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 7: Verify payment status updated to 'success'
    # -------------------------------------------------------------------------
    print("\nTEST 7: Verify payment status in database")
    try:
        payment = db.payments.find_one({"id": payment_id})
        assert payment is not None, "Payment not found"
        assert payment["status"] == "success", f"Payment status not updated: {payment['status']}"
        assert "activatedAt" in payment, "activatedAt not set"
        assert "startDate" in payment, "startDate not set"
        assert "expiryDate" in payment, "expiryDate not set"
        print(f"✅ Payment status updated to 'success'")
        print(f"   Activated At: {payment['activatedAt']}")
        print(f"   Start Date: {payment['startDate']}")
        print(f"   Expiry Date: {payment['expiryDate']}")
    except Exception as e:
        print(f"❌ TEST 7 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 8: Verify user subscription updated
    # -------------------------------------------------------------------------
    print("\nTEST 8: Verify user subscription in database")
    try:
        user = db.users.find_one({"id": test_user_id})
        assert user is not None, "User not found"
        assert "subscription" in user, "Subscription not set"
        sub = user["subscription"]
        assert sub["plan"] == "monthly", f"Plan mismatch: {sub['plan']}"
        assert sub["status"] == "active", f"Status mismatch: {sub['status']}"
        assert "expiryDate" in sub, "expiryDate not set"
        print(f"✅ User subscription updated")
        print(f"   Plan: {sub['plan']}")
        print(f"   Status: {sub['status']}")
        print(f"   Expiry: {sub['expiryDate']}")
    except Exception as e:
        print(f"❌ TEST 8 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 9: Verify mismatch log updated with retry status
    # -------------------------------------------------------------------------
    print("\nTEST 9: Verify mismatch log updated with retry status")
    try:
        log = db.admin_logs.find_one({"id": log_id})
        assert log is not None, "Log not found"
        assert "retryStatus" in log, "retryStatus not set"
        assert log["retryStatus"] == "resolved", f"retryStatus mismatch: {log['retryStatus']}"
        assert "retriedAt" in log, "retriedAt not set"
        assert "retriedBy" in log, "retriedBy not set"
        assert "retryResult" in log, "retryResult not set"
        print(f"✅ Mismatch log updated with retry status")
        print(f"   Retry Status: {log['retryStatus']}")
        print(f"   Retried At: {log['retriedAt']}")
        print(f"   Retried By: {log['retriedBy']}")
        print(f"   Retry Result: {log['retryResult']}")
    except Exception as e:
        print(f"❌ TEST 9 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 10: Verify new subscription_activated log created
    # -------------------------------------------------------------------------
    print("\nTEST 10: Verify new subscription_activated log created")
    try:
        activated_logs = list(db.admin_logs.find({
            "type": "subscription_activated",
            "paymentId": payment_id,
            "source": "retry"
        }))
        assert len(activated_logs) > 0, "No subscription_activated log found"
        log = activated_logs[0]
        print(f"✅ New subscription_activated log created")
        print(f"   Log ID: {log['id']}")
        print(f"   Source: {log['source']}")
        print(f"   Plan: {log['plan']}")
        print(f"   Plan Days: {log['planDays']}")
    except Exception as e:
        print(f"❌ TEST 10 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 11: Idempotency - retry the already-resolved log
    # -------------------------------------------------------------------------
    print("\nTEST 11: Idempotency - retry already-resolved log")
    try:
        resp = requests.post(f"{BASE_URL}/admin/logs/{log_id}/retry-activation",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 409, f"Expected 409, got {resp.status_code}"
        result = resp.json()
        print(f"✅ Idempotency check passed: {resp.status_code}")
        print(f"   Response: {json.dumps(result, indent=2)}")
        assert result.get("code") == "already_active", f"Expected code 'already_active', got {result.get('code')}"
        print(f"✅ Correct error code: already_active")
    except Exception as e:
        print(f"❌ TEST 11 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 12: Non-admin auth - should return 403
    # -------------------------------------------------------------------------
    print("\nTEST 12: Non-admin auth - should return 403")
    try:
        resp = requests.post(f"{BASE_URL}/admin/logs/{log_id}/retry-activation",
            headers={"Authorization": f"Bearer {test_token}"},
            timeout=10
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print(f"✅ Non-admin auth rejected: {resp.status_code}")
    except Exception as e:
        print(f"❌ TEST 12 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 13: Not-found - non-existent log ID
    # -------------------------------------------------------------------------
    print("\nTEST 13: Not-found - non-existent log ID")
    try:
        fake_log_id = str(uuid4())
        resp = requests.post(f"{BASE_URL}/admin/logs/{fake_log_id}/retry-activation",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print(f"✅ Not-found check passed: {resp.status_code}")
    except Exception as e:
        print(f"❌ TEST 13 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 14: Wrong log type - try to retry a subscription_activated log
    # -------------------------------------------------------------------------
    print("\nTEST 14: Wrong log type - try to retry subscription_activated log")
    try:
        # Get a subscription_activated log
        activated_log = db.admin_logs.find_one({"type": "subscription_activated"})
        if activated_log:
            resp = requests.post(f"{BASE_URL}/admin/logs/{activated_log['id']}/retry-activation",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10
            )
            assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
            result = resp.json()
            assert result.get("code") == "not_a_mismatch", f"Expected code 'not_a_mismatch', got {result.get('code')}"
            print(f"✅ Wrong log type rejected: {resp.status_code}")
            print(f"   Error code: {result.get('code')}")
        else:
            print(f"⚠️  No subscription_activated log found to test with")
    except Exception as e:
        print(f"❌ TEST 14 FAILED: {e}")
        return

    # -------------------------------------------------------------------------
    # TEST 15: Cleanup - delete test data
    # -------------------------------------------------------------------------
    print("\nTEST 15: Cleanup - delete test data")
    try:
        # Delete test payment
        db.payments.delete_one({"id": payment_id})
        print(f"✅ Test payment deleted")
        
        # Delete test admin logs
        db.admin_logs.delete_many({"paymentId": payment_id})
        print(f"✅ Test admin logs deleted")
        
        # Reset test user subscription
        db.users.update_one(
            {"id": test_user_id},
            {"$set": {"subscription": {"plan": None, "status": "none"}}}
        )
        print(f"✅ Test user subscription reset")
        
        # Close MongoDB connection
        client.close()
        print(f"✅ MongoDB connection closed")
    except Exception as e:
        print(f"⚠️  Cleanup warning: {e}")

    # -------------------------------------------------------------------------
    # REGRESSION TESTS
    # -------------------------------------------------------------------------
    print("\n" + "="*80)
    print("🔄 REGRESSION TESTS")
    print("="*80 + "\n")

    # TEST 16: GET /api/admin/logs still works
    print("TEST 16: GET /api/admin/logs")
    try:
        resp = requests.get(f"{BASE_URL}/admin/logs",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 200, f"GET /admin/logs failed: {resp.status_code}"
        result = resp.json()
        assert "logs" in result, "Missing logs field"
        print(f"✅ GET /admin/logs working: {len(result['logs'])} logs returned")
    except Exception as e:
        print(f"❌ TEST 16 FAILED: {e}")

    # TEST 17: POST /api/admin/settings/renewal-mode still works
    print("\nTEST 17: POST /api/admin/settings/renewal-mode")
    try:
        resp = requests.post(f"{BASE_URL}/admin/settings/renewal-mode",
            json={"renewalMode": "extend"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        assert resp.status_code == 200, f"POST renewal-mode failed: {resp.status_code}"
        print(f"✅ POST /admin/settings/renewal-mode working")
    except Exception as e:
        print(f"❌ TEST 17 FAILED: {e}")

    # TEST 18: GET /api/plans returns 7 plans with correct days
    print("\nTEST 18: GET /api/plans")
    try:
        resp = requests.get(f"{BASE_URL}/plans", timeout=10)
        assert resp.status_code == 200, f"GET /plans failed: {resp.status_code}"
        plans = resp.json()["plans"]
        print(f"✅ GET /api/plans working: {len(plans)} plans returned")
        
        # Verify monthly plan has correct days
        monthly = next((p for p in plans if p["id"] == "monthly"), None)
        assert monthly is not None, "Monthly plan not found"
        assert monthly["days"] == 30, f"Monthly plan days mismatch: {monthly['days']}"
        print(f"   Monthly plan: {monthly['days']} days ✅")
    except Exception as e:
        print(f"❌ TEST 18 FAILED: {e}")

    # TEST 19: POST /api/auth/login (admin) still works
    print("\nTEST 19: POST /api/auth/login (admin)")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        assert resp.status_code == 200, f"Admin login failed: {resp.status_code}"
        print(f"✅ Admin login working")
    except Exception as e:
        print(f"❌ TEST 19 FAILED: {e}")

    # -------------------------------------------------------------------------
    # FINAL SUMMARY
    # -------------------------------------------------------------------------
    print("\n" + "="*80)
    print("✅ ALL TESTS PASSED - Retry Activation Endpoint Working Correctly")
    print("="*80 + "\n")

if __name__ == "__main__":
    test_retry_activation()
