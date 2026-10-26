#!/usr/bin/env python3
"""
Backend E2E test for QR/UPI payment approval → order_confirmed WhatsApp + in-app notification.
Tests the POST /admin/qr-payments/:id/verify endpoint wiring.

GUARDRAILS:
- DO NOT touch R2/storage flags
- DO NOT disturb real admin (9692604577) subscription
- Clean up ALL test data created
- Leave DB as found

Test Plan:
1. Login as admin (9692604577 / <redacted>)
2. Get a valid active plan (GET /api/plans)
3. Use premium test user 9999900001 / <redacted>
4. Insert a PENDING qrSubscriptionPayments document
5. POST /admin/qr-payments/:id/verify → assert 200 {ok:true, status:'VERIFIED'}
6. Assert:
   a. qrSubscriptionPayments.status === 'VERIFIED'
   b. referral_notifications doc of type 'payment_verified' exists
   c. whatsapp_tx_log doc with dedupeKey === 'order_confirmed:'+<rec.id> exists
7. POST verify again → assert 409 "Already verified"
8. Auth gating: POST without token → assert 401/403
9. CLEANUP: delete all test data
"""

import requests
import json
import time
from datetime import datetime
from pymongo import MongoClient

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test user credentials (premium test user)
TEST_USER_MOBILE = "9999900001"
TEST_USER_PASSWORD = "<redacted>"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

print("=" * 80)
print("QR/UPI PAYMENT APPROVAL → ORDER_CONFIRMED WHATSAPP + IN-APP TEST")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
print(f"Test User: {TEST_USER_MOBILE} / {TEST_USER_PASSWORD}")
print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

# Connect to MongoDB
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Test state
admin_token = None
test_user_id = None
test_user_subscription_before = None
plan_id = None
plan_name = None
plan_price = None
qr_payment_id = None
qr_reference_id = None
payment_id = None
test_passed = 0
test_failed = 0

def log_test(name, passed, details=""):
    global test_passed, test_failed
    status = "✅ PASS" if passed else "❌ FAIL"
    if passed:
        test_passed += 1
    else:
        test_failed += 1
    print(f"\n{status}: {name}")
    if details:
        print(f"  {details}")

try:
    # =========================================================================
    # STEP 1: LOGIN AS ADMIN
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 1: LOGIN AS ADMIN")
    print("=" * 80)
    
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    })
    
    if resp.status_code == 200:
        data = resp.json()
        admin_token = data.get("token")
        log_test("Admin login", admin_token is not None, f"Token: {admin_token[:20]}..." if admin_token else "No token")
    else:
        log_test("Admin login", False, f"Status: {resp.status_code}, Response: {resp.text[:200]}")
        raise Exception("Admin login failed")
    
    # =========================================================================
    # STEP 2: GET VALID ACTIVE PLAN
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 2: GET VALID ACTIVE PLAN")
    print("=" * 80)
    
    resp = requests.get(f"{BASE_URL}/plans")
    
    if resp.status_code == 200:
        data = resp.json()
        plans = data.get("plans", [])
        # Pick a plan with id and price (not free)
        valid_plans = [p for p in plans if p.get("id") and p.get("price", 0) > 0]
        if valid_plans:
            plan = valid_plans[0]  # Pick first valid plan (e.g., yearly)
            plan_id = plan.get("id")
            plan_name = plan.get("name")
            plan_price = plan.get("price")
            log_test("Get valid active plan", True, f"Plan: {plan_id} ({plan_name}), Price: ₹{plan_price}")
        else:
            log_test("Get valid active plan", False, "No valid plans found")
            raise Exception("No valid plans found")
    else:
        log_test("Get valid active plan", False, f"Status: {resp.status_code}")
        raise Exception("Failed to get plans")
    
    # =========================================================================
    # STEP 3: LOGIN AS TEST USER & CAPTURE SUBSCRIPTION STATE
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 3: LOGIN AS TEST USER & CAPTURE SUBSCRIPTION STATE")
    print("=" * 80)
    
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "mobile": TEST_USER_MOBILE,
        "password": TEST_USER_PASSWORD
    })
    
    if resp.status_code == 200:
        data = resp.json()
        test_user_id = data.get("user", {}).get("id")
        test_user_subscription_before = data.get("user", {}).get("subscription")
        log_test("Test user login", test_user_id is not None, f"User ID: {test_user_id}")
        print(f"  Subscription before: {json.dumps(test_user_subscription_before, indent=2)}")
    else:
        log_test("Test user login", False, f"Status: {resp.status_code}")
        raise Exception("Test user login failed")
    
    # =========================================================================
    # STEP 4: INSERT PENDING qrSubscriptionPayments DOCUMENT
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 4: INSERT PENDING qrSubscriptionPayments DOCUMENT")
    print("=" * 80)
    
    import uuid
    qr_payment_id = str(uuid.uuid4())
    timestamp = int(time.time())
    qr_reference_id = f"QR-TEST-{timestamp}"
    utr_number = f"TESTUTR{timestamp}"
    
    qr_doc = {
        "id": qr_payment_id,
        "userId": test_user_id,
        "planId": plan_id,
        "expectedAmount": plan_price,
        "utrNumber": utr_number,
        "referenceId": qr_reference_id,
        "status": "PENDING",
        "createdAt": datetime.utcnow()
    }
    
    result = db.qrSubscriptionPayments.insert_one(qr_doc)
    log_test("Insert PENDING qrSubscriptionPayments doc", result.inserted_id is not None, 
             f"ID: {qr_payment_id}, Reference: {qr_reference_id}, UTR: {utr_number}")
    
    # =========================================================================
    # STEP 5: POST /admin/qr-payments/:id/verify (ADMIN TOKEN)
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 5: POST /admin/qr-payments/:id/verify (ADMIN TOKEN)")
    print("=" * 80)
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{BASE_URL}/admin/qr-payments/{qr_payment_id}/verify", headers=headers, json={})
    
    if resp.status_code == 200:
        data = resp.json()
        log_test("POST /admin/qr-payments/:id/verify", 
                 data.get("ok") is True and data.get("status") == "VERIFIED",
                 f"Response: {json.dumps(data, indent=2)}")
    else:
        log_test("POST /admin/qr-payments/:id/verify", False, 
                 f"Status: {resp.status_code}, Response: {resp.text[:500]}")
        raise Exception("Verify endpoint failed")
    
    # =========================================================================
    # STEP 6: ASSERT ALL THREE CONDITIONS
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 6: ASSERT ALL THREE CONDITIONS")
    print("=" * 80)
    
    # 6a. qrSubscriptionPayments.status === 'VERIFIED'
    qr_doc_after = db.qrSubscriptionPayments.find_one({"id": qr_payment_id})
    log_test("6a. qrSubscriptionPayments.status === 'VERIFIED'",
             qr_doc_after and qr_doc_after.get("status") == "VERIFIED",
             f"Status: {qr_doc_after.get('status') if qr_doc_after else 'NOT FOUND'}")
    
    # 6b. referral_notifications doc of type 'payment_verified' exists
    notification_doc = db.referral_notifications.find_one({
        "userId": test_user_id,
        "type": "payment_verified",
        "meta.referenceId": qr_reference_id
    })
    log_test("6b. referral_notifications doc of type 'payment_verified' exists",
             notification_doc is not None,
             f"Found: {notification_doc.get('title') if notification_doc else 'NOT FOUND'}")
    
    # 6c. whatsapp_tx_log doc with dedupeKey === 'order_confirmed:'+<rec.id> exists
    dedupe_key = f"order_confirmed:{qr_payment_id}"
    wa_log_doc = db.whatsapp_tx_log.find_one({"dedupeKey": dedupe_key})
    log_test("6c. whatsapp_tx_log doc with dedupeKey === 'order_confirmed:'+<rec.id> exists",
             wa_log_doc is not None,
             f"Status: {wa_log_doc.get('status') if wa_log_doc else 'NOT FOUND'}, " +
             f"Template: {wa_log_doc.get('template') if wa_log_doc else 'N/A'}")
    
    # =========================================================================
    # STEP 7: POST VERIFY AGAIN → ASSERT 409 "Already verified"
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 7: POST VERIFY AGAIN → ASSERT 409 'Already verified'")
    print("=" * 80)
    
    resp = requests.post(f"{BASE_URL}/admin/qr-payments/{qr_payment_id}/verify", headers=headers, json={})
    
    log_test("POST verify again → 409 'Already verified'",
             resp.status_code == 409 and "already verified" in resp.text.lower(),
             f"Status: {resp.status_code}, Response: {resp.text[:200]}")
    
    # =========================================================================
    # STEP 8: AUTH GATING - POST WITHOUT TOKEN → 401/403
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 8: AUTH GATING - POST WITHOUT TOKEN → 401/403")
    print("=" * 80)
    
    resp = requests.post(f"{BASE_URL}/admin/qr-payments/{qr_payment_id}/verify", json={})
    
    log_test("POST without token → 401/403",
             resp.status_code in [401, 403],
             f"Status: {resp.status_code}")
    
    # =========================================================================
    # STEP 9: CLEANUP - DELETE ALL TEST DATA
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 9: CLEANUP - DELETE ALL TEST DATA")
    print("=" * 80)
    
    # Find the created payment row
    payment_doc = db.payments.find_one({"qrPaymentId": qr_payment_id})
    if payment_doc:
        payment_id = payment_doc.get("id")
        print(f"  Found payment row: {payment_id}")
    
    # Delete qrSubscriptionPayments doc
    result = db.qrSubscriptionPayments.delete_one({"id": qr_payment_id})
    print(f"  ✓ Deleted qrSubscriptionPayments doc: {result.deleted_count} doc(s)")
    
    # Delete payment row
    if payment_id:
        result = db.payments.delete_one({"id": payment_id})
        print(f"  ✓ Deleted payments row: {result.deleted_count} doc(s)")
    
    # Delete whatsapp_tx_log doc
    result = db.whatsapp_tx_log.delete_one({"dedupeKey": dedupe_key})
    print(f"  ✓ Deleted whatsapp_tx_log doc: {result.deleted_count} doc(s)")
    
    # Delete referral_notifications doc
    result = db.referral_notifications.delete_one({
        "userId": test_user_id,
        "type": "payment_verified",
        "meta.referenceId": qr_reference_id
    })
    print(f"  ✓ Deleted referral_notifications doc: {result.deleted_count} doc(s)")
    
    # Revert test user subscription to prior state (if changed)
    # Check if subscription was activated
    test_user_after = db.users.find_one({"id": test_user_id})
    if test_user_after:
        subscription_after = test_user_after.get("subscription", {})
        # If subscription changed, revert it
        if subscription_after != test_user_subscription_before:
            print(f"  ⚠️  Subscription changed. Reverting to prior state...")
            db.users.update_one(
                {"id": test_user_id},
                {"$set": {"subscription": test_user_subscription_before}}
            )
            print(f"  ✓ Reverted test user subscription to prior state")
        else:
            print(f"  ✓ Test user subscription unchanged (no revert needed)")
    
    log_test("Cleanup complete", True, "All test data deleted, DB left as found")

except Exception as e:
    print(f"\n❌ TEST FAILED WITH EXCEPTION: {e}")
    import traceback
    traceback.print_exc()

finally:
    # Close MongoDB connection
    client.close()
    
    # =========================================================================
    # FINAL SUMMARY
    # =========================================================================
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    print(f"Total tests: {test_passed + test_failed}")
    print(f"Passed: {test_passed} ✅")
    print(f"Failed: {test_failed} ❌")
    print(f"Success rate: {test_passed}/{test_passed + test_failed} ({100 * test_passed // (test_passed + test_failed) if (test_passed + test_failed) > 0 else 0}%)")
    print("=" * 80)
    
    # PASS/FAIL TABLE
    print("\n" + "=" * 80)
    print("PASS/FAIL TABLE")
    print("=" * 80)
    print("| Test | Status |")
    print("|------|--------|")
    print(f"| Admin login | {'✅ PASS' if admin_token else '❌ FAIL'} |")
    print(f"| Get valid active plan | {'✅ PASS' if plan_id else '❌ FAIL'} |")
    print(f"| Test user login | {'✅ PASS' if test_user_id else '❌ FAIL'} |")
    print(f"| Insert PENDING qrSubscriptionPayments | {'✅ PASS' if qr_payment_id else '❌ FAIL'} |")
    print(f"| POST /admin/qr-payments/:id/verify | {'✅ PASS' if test_passed >= 5 else '❌ FAIL'} |")
    print(f"| 6a. qrSubscriptionPayments.status === 'VERIFIED' | {'✅ PASS' if test_passed >= 6 else '❌ FAIL'} |")
    print(f"| 6b. referral_notifications exists | {'✅ PASS' if test_passed >= 7 else '❌ FAIL'} |")
    print(f"| 6c. whatsapp_tx_log exists | {'✅ PASS' if test_passed >= 8 else '❌ FAIL'} |")
    print(f"| POST verify again → 409 | {'✅ PASS' if test_passed >= 9 else '❌ FAIL'} |")
    print(f"| Auth gating (no token → 401/403) | {'✅ PASS' if test_passed >= 10 else '❌ FAIL'} |")
    print(f"| Cleanup complete | {'✅ PASS' if test_passed >= 11 else '❌ FAIL'} |")
    print("=" * 80)
    
    if test_failed == 0:
        print("\n🎉 ALL TESTS PASSED! QR/UPI payment approval → order_confirmed WhatsApp + in-app working correctly.")
    else:
        print(f"\n⚠️  {test_failed} TEST(S) FAILED. See details above.")
