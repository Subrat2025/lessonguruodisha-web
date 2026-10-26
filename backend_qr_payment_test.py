#!/usr/bin/env python3
"""
Backend Test: QR Code Manual UPI Subscription Payment API
Tests all 14 scenarios for the new QR payment flow.
DOES NOT test existing Razorpay flow (must remain unaffected).
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test results
test_results = []

def log_test(test_num, description, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"Test {test_num}: {status} - {description}"
    if details:
        result += f"\n  Details: {details}"
    print(result)
    test_results.append({"test": test_num, "description": description, "passed": passed, "details": details})
    return passed

def main():
    print("=" * 80)
    print("QR CODE PAYMENT API - COMPREHENSIVE BACKEND TEST")
    print("=" * 80)
    print()

    # ========== SETUP: Admin Login ==========
    print("SETUP: Admin Login")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ Admin login failed: {response.status_code} - {response.text}")
            sys.exit(1)
        
        admin_token = response.json().get("token")
        admin_user_id = response.json().get("user", {}).get("id")
        if not admin_token:
            print("❌ No token in admin login response")
            sys.exit(1)
        
        print(f"✅ Admin logged in successfully. Token: {admin_token[:20]}...")
        print(f"   Admin User ID: {admin_user_id}")
    except Exception as e:
        print(f"❌ Admin login exception: {e}")
        sys.exit(1)

    # ========== SETUP: Create Non-Admin Test User ==========
    print("\nSETUP: Create Non-Admin Test User")
    non_admin_token = None
    non_admin_user_id = None
    try:
        # Generate unique mobile for test user
        test_mobile = f"99{datetime.now().strftime('%H%M%S%f')[:8]}"
        response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "QR Test User",
            "mobile": test_mobile,
            "password": "test1234"
        }, timeout=30)
        
        if response.status_code == 200:
            non_admin_token = response.json().get("token")
            non_admin_user_id = response.json().get("user", {}).get("id")
            print(f"✅ Non-admin user created: {test_mobile}")
            print(f"   Non-admin User ID: {non_admin_user_id}")
        else:
            print(f"⚠️  Could not create non-admin user: {response.status_code}")
            print(f"   Will skip cross-user ownership tests")
    except Exception as e:
        print(f"⚠️  Non-admin user creation exception: {e}")
        print(f"   Will skip cross-user ownership tests")

    # ========== SETUP: Get Valid Paid Plan ==========
    print("\nSETUP: Get Valid Paid Plan")
    plan_id = None
    plan_name = None
    plan_price = None
    try:
        response = requests.get(f"{BASE_URL}/plans", timeout=30)
        if response.status_code != 200:
            print(f"❌ Failed to get plans: {response.status_code}")
            sys.exit(1)
        
        data = response.json()
        plans = data.get("plans", []) if isinstance(data, dict) else data
        # Find a paid plan (price > 0 and enabled !== false)
        for plan in plans:
            if plan.get("id") != "free" and float(plan.get("price", 0)) > 0 and plan.get("enabled") != False:
                plan_id = plan["id"]
                plan_name = plan["name"]
                plan_price = plan["price"]
                break
        
        if not plan_id:
            print("❌ No valid paid plan found")
            sys.exit(1)
        
        print(f"✅ Found valid paid plan: {plan_name} (ID: {plan_id}, Price: ₹{plan_price})")
    except Exception as e:
        print(f"❌ Get plans exception: {e}")
        sys.exit(1)

    print("\n" + "=" * 80)
    print("STARTING QR PAYMENT API TESTS")
    print("=" * 80)

    # ========== TEST 1: GET /api/qr-payment/config ==========
    print("\n[TEST 1] GET /api/qr-payment/config")
    try:
        response = requests.get(
            f"{BASE_URL}/qr-payment/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            whatsapp_ok = data.get("whatsappNumber") == "8093414633"
            qr_url_ok = data.get("qrImageUrl") and len(data.get("qrImageUrl", "")) > 0
            passed = whatsapp_ok and qr_url_ok
            
            log_test(1, "GET /api/qr-payment/config", passed,
                    f"whatsappNumber={data.get('whatsappNumber')}, qrImageUrl={data.get('qrImageUrl')}, enabled={data.get('enabled')}")
        else:
            log_test(1, "GET /api/qr-payment/config", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test(1, "GET /api/qr-payment/config", False, f"Exception: {e}")

    # ========== TEST 2: POST /api/qr-payment/quote ==========
    print("\n[TEST 2] POST /api/qr-payment/quote")
    expected_amount = None
    # Use non-admin user for quote/submit tests (admin already has subscription)
    test_token = non_admin_token if non_admin_token else admin_token
    test_user_id = non_admin_user_id if non_admin_user_id else admin_user_id
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/quote",
            headers={"Authorization": f"Bearer {test_token}"},
            json={"planId": plan_id},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            amount = data.get("amount")
            passed = isinstance(amount, (int, float)) and amount > 0
            expected_amount = int(amount)
            
            log_test(2, "POST /api/qr-payment/quote", passed,
                    f"planId={data.get('planId')}, planName={data.get('planName')}, amount={amount}, planDays={data.get('planDays')}")
        else:
            log_test(2, "POST /api/qr-payment/quote", False, f"Status: {response.status_code}, Body: {response.text}")
    except Exception as e:
        log_test(2, "POST /api/qr-payment/quote", False, f"Exception: {e}")

    if not expected_amount:
        print("\n❌ CRITICAL: Could not get expected amount from quote. Cannot continue.")
        sys.exit(1)

    # ========== TEST 3: POST /api/qr-payment/submit (with server-computed amount) ==========
    print("\n[TEST 3] POST /api/qr-payment/submit (server-computed amount)")
    payment_id = None
    reference_id = None
    # Generate unique UTR for this test run
    unique_utr = f"UTRTEST{datetime.now().strftime('%H%M%S%f')[:10]}"
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers={"Authorization": f"Bearer {test_token}"},
            json={
                "planId": plan_id,
                "utrNumber": unique_utr,
                "amountPaid": 999999,  # Client sends wrong amount
                "paymentDate": "2026-08-28",
                "paymentTime": "18:30"
            },
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            reference_id = data.get("referenceId")
            payment_id = data.get("id")
            
            # CRITICAL: Check server-computed amount
            server_amount = data.get("expectedAmount")
            amount_ok = server_amount == expected_amount
            
            # Check referenceId format: QR-YYYYMMDD-XXXXXX
            import re
            ref_ok = bool(re.match(r'^QR-\d{8}-[A-Z0-9]{6}$', reference_id or ''))
            
            status_ok = data.get("status") == "PENDING"
            
            passed = amount_ok and ref_ok and status_ok and payment_id
            
            log_test(3, "POST /api/qr-payment/submit (server-computed amount)", passed,
                    f"referenceId={reference_id}, status={data.get('status')}, expectedAmount={server_amount} (should be {expected_amount}), id={payment_id}, amountMatch={amount_ok}, refFormat={ref_ok}")
        else:
            log_test(3, "POST /api/qr-payment/submit", False, f"Status: {response.status_code}, Body: {response.text}")
    except Exception as e:
        log_test(3, "POST /api/qr-payment/submit", False, f"Exception: {e}")

    if not payment_id or not reference_id:
        print("\n❌ CRITICAL: Could not create payment record. Cannot continue.")
        sys.exit(1)

    # ========== TEST 4: Duplicate UTR → 409 ==========
    print("\n[TEST 4] Duplicate UTR → 409")
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers={"Authorization": f"Bearer {test_token}"},
            json={
                "planId": plan_id,
                "utrNumber": unique_utr,  # Same UTR as test 3
                "amountPaid": 100,
                "paymentDate": "2026-08-28",
                "paymentTime": "18:30"
            },
            timeout=30
        )
        
        passed = response.status_code == 409
        log_test(4, "Duplicate UTR → 409", passed,
                f"Status: {response.status_code}, Message: {response.json().get('error', '') if response.status_code == 409 else response.text}")
    except Exception as e:
        log_test(4, "Duplicate UTR → 409", False, f"Exception: {e}")

    # ========== TEST 5: Invalid UTR → 400 ==========
    print("\n[TEST 5] Invalid UTR (too short) → 400")
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers={"Authorization": f"Bearer {test_token}"},
            json={
                "planId": plan_id,
                "utrNumber": "ab",  # Too short (< 6 chars)
                "amountPaid": 100,
                "paymentDate": "2026-08-28",
                "paymentTime": "18:30"
            },
            timeout=30
        )
        
        passed = response.status_code == 400
        log_test(5, "Invalid UTR (too short) → 400", passed,
                f"Status: {response.status_code}, Message: {response.json().get('error', '') if response.status_code == 400 else response.text}")
    except Exception as e:
        log_test(5, "Invalid UTR → 400", False, f"Exception: {e}")

    # ========== TEST 6: GET /api/qr-payment/my ==========
    print("\n[TEST 6] GET /api/qr-payment/my")
    try:
        response = requests.get(
            f"{BASE_URL}/qr-payment/my",
            headers={"Authorization": f"Bearer {test_token}"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            payments = data.get("payments", [])
            
            # Check if our submitted record is present
            found = any(p.get("referenceId") == reference_id for p in payments)
            
            # Check that screenshotData is NOT present (excluded for performance)
            no_screenshot_data = all("screenshotData" not in p for p in payments)
            
            passed = found and no_screenshot_data
            
            log_test(6, "GET /api/qr-payment/my", passed,
                    f"Found {len(payments)} payments, referenceId present={found}, screenshotData excluded={no_screenshot_data}")
        else:
            log_test(6, "GET /api/qr-payment/my", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test(6, "GET /api/qr-payment/my", False, f"Exception: {e}")

    # ========== TEST 7: POST /api/qr-payment/{id}/whatsapp-sent ==========
    print("\n[TEST 7] POST /api/qr-payment/{id}/whatsapp-sent")
    try:
        response = requests.post(
            f"{BASE_URL}/qr-payment/{payment_id}/whatsapp-sent",
            headers={"Authorization": f"Bearer {test_token}"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            passed = data.get("ok") == True
            
            log_test(7, "POST /api/qr-payment/{id}/whatsapp-sent", passed,
                    f"ok={data.get('ok')}")
        else:
            log_test(7, "POST /api/qr-payment/{id}/whatsapp-sent", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test(7, "POST /api/qr-payment/{id}/whatsapp-sent", False, f"Exception: {e}")

    # ========== TEST 8: Admin list: GET /api/admin/qr-payments ==========
    print("\n[TEST 8] Admin list: GET /api/admin/qr-payments (all, filtered by status, search)")
    try:
        # Test 8a: Get all
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            payments = data.get("payments", [])
            summary = data.get("summary", {})
            
            # Check summary structure
            summary_ok = all(k in summary for k in ["PENDING", "VERIFIED", "REJECTED", "verifiedAmount"])
            
            # Check if our record is present
            found = any(p.get("referenceId") == reference_id for p in payments)
            
            passed = summary_ok and found
            
            print(f"  8a: All payments - Found {len(payments)} payments, summary={summary}, record present={found}")
        else:
            passed = False
            print(f"  8a: All payments - Status: {response.status_code}")
        
        # Test 8b: Filter by status=PENDING
        response2 = requests.get(
            f"{BASE_URL}/admin/qr-payments?status=PENDING",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if response2.status_code == 200:
            data2 = response2.json()
            payments2 = data2.get("payments", [])
            all_pending = all(p.get("status") == "PENDING" for p in payments2)
            print(f"  8b: Filter status=PENDING - Found {len(payments2)} payments, all pending={all_pending}")
            passed = passed and all_pending
        else:
            passed = False
            print(f"  8b: Filter status=PENDING - Status: {response2.status_code}")
        
        # Test 8c: Search by UTR
        response3 = requests.get(
            f"{BASE_URL}/admin/qr-payments?search={unique_utr}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        if response3.status_code == 200:
            data3 = response3.json()
            payments3 = data3.get("payments", [])
            found_by_search = any(p.get("utrNumber") == unique_utr for p in payments3)
            print(f"  8c: Search UTR - Found {len(payments3)} payments, UTR found={found_by_search}")
            passed = passed and found_by_search
        else:
            passed = False
            print(f"  8c: Search UTR - Status: {response3.status_code}")
        
        log_test(8, "Admin list: GET /api/admin/qr-payments (all, filtered, search)", passed,
                f"All tests passed")
    except Exception as e:
        log_test(8, "Admin list: GET /api/admin/qr-payments", False, f"Exception: {e}")

    # ========== TEST 9: Admin get one: GET /api/admin/qr-payments/{id} ==========
    print("\n[TEST 9] Admin get one: GET /api/admin/qr-payments/{id}")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/{payment_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            payment = data.get("payment", {})
            
            # Check full record structure
            passed = payment.get("id") == payment_id and payment.get("referenceId") == reference_id
            
            log_test(9, "Admin get one: GET /api/admin/qr-payments/{id}", passed,
                    f"id={payment.get('id')}, referenceId={payment.get('referenceId')}, status={payment.get('status')}")
        else:
            log_test(9, "Admin get one: GET /api/admin/qr-payments/{id}", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test(9, "Admin get one: GET /api/admin/qr-payments/{id}", False, f"Exception: {e}")

    # ========== TEST 10: Admin verify: POST /api/admin/qr-payments/{id}/verify ==========
    print("\n[TEST 10] Admin verify: POST /api/admin/qr-payments/{id}/verify")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/qr-payments/{payment_id}/verify",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"adminNote": "ok verified"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            
            # Check response
            ok = data.get("ok") == True
            status = data.get("status") == "VERIFIED"
            has_dates = data.get("startDate") and data.get("expiryDate")
            
            passed = ok and status and has_dates
            
            print(f"  Verify response: ok={ok}, status={status}, startDate={data.get('startDate')}, expiryDate={data.get('expiryDate')}")
            
            # Now check the record is updated
            response2 = requests.get(
                f"{BASE_URL}/admin/qr-payments/{payment_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30
            )
            
            if response2.status_code == 200:
                payment = response2.json().get("payment", {})
                verified_ok = payment.get("status") == "VERIFIED"
                verified_by_ok = payment.get("verifiedBy") == admin_user_id
                activated_ok = payment.get("activatedPaymentId") is not None
                
                print(f"  Record updated: status={payment.get('status')}, verifiedBy={payment.get('verifiedBy')}, activatedPaymentId={payment.get('activatedPaymentId')}")
                
                passed = passed and verified_ok and verified_by_ok and activated_ok
            
            # Check user subscription is active
            response3 = requests.get(
                f"{BASE_URL}/auth/me",
                headers={"Authorization": f"Bearer {test_token}"},
                timeout=30
            )
            
            if response3.status_code == 200:
                user = response3.json().get("user", {})
                subscription = user.get("subscription", {})
                sub_active = subscription.get("status") == "active"
                expiry_future = subscription.get("expiryDate") is not None
                
                print(f"  User subscription: status={subscription.get('status')}, expiryDate={subscription.get('expiryDate')}")
                
                passed = passed and sub_active and expiry_future
            
            log_test(10, "Admin verify: POST /api/admin/qr-payments/{id}/verify", passed,
                    f"Verification successful, record updated, subscription activated")
        else:
            log_test(10, "Admin verify: POST /api/admin/qr-payments/{id}/verify", False, f"Status: {response.status_code}, Body: {response.text}")
    except Exception as e:
        log_test(10, "Admin verify: POST /api/admin/qr-payments/{id}/verify", False, f"Exception: {e}")

    # ========== TEST 11: Verify idempotency: POST /api/admin/qr-payments/{id}/verify again → 409 ==========
    print("\n[TEST 11] Verify idempotency: POST /api/admin/qr-payments/{id}/verify again → 409")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/qr-payments/{payment_id}/verify",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"adminNote": "trying again"},
            timeout=30
        )
        
        passed = response.status_code == 409
        log_test(11, "Verify idempotency → 409", passed,
                f"Status: {response.status_code}, Message: {response.json().get('error', '') if response.status_code == 409 else response.text}")
    except Exception as e:
        log_test(11, "Verify idempotency → 409", False, f"Exception: {e}")

    # ========== TEST 12: Reject flow ==========
    print("\n[TEST 12] Reject flow: submit → reject → re-submit with same UTR")
    reject_payment_id = None
    reject_utr = f"UTRREJECT{datetime.now().strftime('%H%M%S%f')[:8]}"
    try:
        # 12a: Submit a fresh record
        response = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers={"Authorization": f"Bearer {test_token}"},
            json={
                "planId": plan_id,
                "utrNumber": reject_utr,
                "amountPaid": 100,
                "paymentDate": "2026-08-28",
                "paymentTime": "19:00"
            },
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            reject_payment_id = response.json().get("id")
            print(f"  12a: Fresh record created: id={reject_payment_id}")
        else:
            passed = False
            print(f"  12a: Failed to create record: {response.status_code}")
        
        # 12b: Reject it
        if reject_payment_id:
            response2 = requests.post(
                f"{BASE_URL}/admin/qr-payments/{reject_payment_id}/reject",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"adminNote": "not found"},
                timeout=30
            )
            
            if response2.status_code == 200:
                data2 = response2.json()
                status_ok = data2.get("status") == "REJECTED"
                print(f"  12b: Record rejected: status={data2.get('status')}")
                passed = passed and status_ok
            else:
                passed = False
                print(f"  12b: Failed to reject: {response2.status_code}")
        
        # 12c: Re-submit with same UTR (should be allowed since rejected UTRs don't block)
        response3 = requests.post(
            f"{BASE_URL}/qr-payment/submit",
            headers={"Authorization": f"Bearer {test_token}"},
            json={
                "planId": plan_id,
                "utrNumber": reject_utr,  # Same UTR as rejected record
                "amountPaid": 100,
                "paymentDate": "2026-08-28",
                "paymentTime": "19:30"
            },
            timeout=30
        )
        
        if response3.status_code == 200:
            print(f"  12c: Re-submit with rejected UTR allowed: {response3.status_code}")
            passed = passed and True
        else:
            passed = False
            print(f"  12c: Re-submit failed: {response3.status_code}, Body: {response3.text}")
        
        log_test(12, "Reject flow: submit → reject → re-submit", passed,
                f"All steps passed")
    except Exception as e:
        log_test(12, "Reject flow", False, f"Exception: {e}")

    # ========== TEST 13: Admin settings: GET + PUT /api/admin/qr-payment-settings ==========
    print("\n[TEST 13] Admin settings: GET + PUT /api/admin/qr-payment-settings")
    try:
        # 13a: GET settings
        response = requests.get(
            f"{BASE_URL}/admin/qr-payment-settings",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        passed = response.status_code == 200
        if passed:
            data = response.json()
            settings = data.get("settings", {})
            print(f"  13a: GET settings: {settings}")
        else:
            passed = False
            print(f"  13a: GET settings failed: {response.status_code}")
        
        # 13b: PUT settings
        response2 = requests.put(
            f"{BASE_URL}/admin/qr-payment-settings",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "whatsappNumber": "8093414633",
                "payeeName": "Lesson Guru Odisha",
                "enabled": True
            },
            timeout=30
        )
        
        if response2.status_code == 200:
            data2 = response2.json()
            ok = data2.get("ok") == True
            settings2 = data2.get("settings", {})
            print(f"  13b: PUT settings: ok={ok}, settings={settings2}")
            passed = passed and ok
        else:
            passed = False
            print(f"  13b: PUT settings failed: {response2.status_code}")
        
        log_test(13, "Admin settings: GET + PUT /api/admin/qr-payment-settings", passed,
                f"Both GET and PUT working")
    except Exception as e:
        log_test(13, "Admin settings", False, f"Exception: {e}")

    # ========== TEST 14: Security: no auth → 401/403, non-admin → 403 ==========
    print("\n[TEST 14] Security: no auth → 401/403, non-admin → 403")
    try:
        # 14a: No auth on admin endpoint
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments",
            timeout=30
        )
        
        passed = response.status_code in [401, 403]
        print(f"  14a: No auth on admin endpoint: {response.status_code} (expected 401/403)")
        
        # 14b: Non-admin on admin endpoint (if we have non-admin user)
        if non_admin_token:
            response2 = requests.get(
                f"{BASE_URL}/admin/qr-payments",
                headers={"Authorization": f"Bearer {non_admin_token}"},
                timeout=30
            )
            
            non_admin_blocked = response2.status_code == 403
            print(f"  14b: Non-admin on admin endpoint: {response2.status_code} (expected 403)")
            passed = passed and non_admin_blocked
            
            # 14c: Non-admin can only see their own records
            response3 = requests.get(
                f"{BASE_URL}/qr-payment/my",
                headers={"Authorization": f"Bearer {non_admin_token}"},
                timeout=30
            )
            
            if response3.status_code == 200:
                data3 = response3.json()
                payments3 = data3.get("payments", [])
                
                # Non-admin should see their own records (not test user's records)
                # All records should belong to non-admin user
                all_own_records = all(p.get("userId") == non_admin_user_id for p in payments3)
                print(f"  14c: Non-admin /qr-payment/my: Found {len(payments3)} payments, all own records={all_own_records}")
                passed = passed and all_own_records
            else:
                print(f"  14c: Non-admin /qr-payment/my failed: {response3.status_code}")
        else:
            print(f"  14b-c: Skipped (no non-admin user)")
        
        log_test(14, "Security: no auth → 401/403, non-admin → 403", passed,
                f"All security checks passed")
    except Exception as e:
        log_test(14, "Security checks", False, f"Exception: {e}")

    # ========== SUMMARY ==========
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    total_tests = len(test_results)
    passed_tests = sum(1 for r in test_results if r["passed"])
    failed_tests = total_tests - passed_tests
    
    print(f"\nTotal Tests: {total_tests}")
    print(f"Passed: {passed_tests} ✅")
    print(f"Failed: {failed_tests} ❌")
    print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
    
    print("\nDetailed Results:")
    for result in test_results:
        status = "✅" if result["passed"] else "❌"
        print(f"{status} Test {result['test']}: {result['description']}")
    
    if failed_tests > 0:
        print("\n" + "=" * 80)
        print("FAILED TESTS DETAILS:")
        print("=" * 80)
        for result in test_results:
            if not result["passed"]:
                print(f"\nTest {result['test']}: {result['description']}")
                print(f"  {result['details']}")
    
    print("\n" + "=" * 80)
    if failed_tests == 0:
        print("✅ ALL TESTS PASSED!")
    else:
        print(f"❌ {failed_tests} TEST(S) FAILED")
    print("=" * 80)
    
    sys.exit(0 if failed_tests == 0 else 1)

if __name__ == "__main__":
    main()
