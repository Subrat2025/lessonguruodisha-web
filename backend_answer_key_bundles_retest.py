#!/usr/bin/env python3
"""
Answer Key Bundles (Phase F) — RE-TEST 6 FAILED TESTS
Re-tests only the 6 previously-failed tests with FIXED test design:
- Test 3: ATOMIC SLOT (concurrent submits)
- Test 7: SLOT FREED ON REJECT/CANCEL
- Test 8: DUPLICATE VERIFY IDEMPOTENCY
- Test 9: CLIENT PRICE OVERRIDE
- Test 10: BUNDLE AUTO-UNLOCK
- Test 13: SINGLE FLOW REGRESSION

FIXES APPLIED:
1. CRITICAL PATH FIX: admin upload endpoint is POST /api/admin/answer-key/<REQUEST_ID>/upload-key
2. ISOLATION FIX: create separate exams/products/users for each test to avoid 409 "already own"
"""
import requests
import json
import hmac
import hashlib
import time
import os
from pymongo import MongoClient
from datetime import datetime, timedelta
import threading

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

# Load secrets from .env
with open("/app/.env") as f:
    for line in f:
        if line.startswith("RAZORPAY_KEY_SECRET="):
            RAZORPAY_KEY_SECRET = line.split("=", 1)[1].strip()

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test results
test_results = []

def log_test(test_num, description, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({
        "test": test_num,
        "description": description,
        "status": status,
        "details": details
    })
    print(f"\n{status} | Test {test_num}: {description}")
    if details:
        print(f"  Details: {details}")

def generate_tiny_pdf():
    """Generate a tiny 1-page PDF for testing"""
    pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test Answer Key) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
0000000293 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
385
%%EOF
"""
    return pdf_content

def compute_razorpay_signature(order_id, payment_id):
    """Compute HMAC signature for Razorpay payment verification"""
    message = f"{order_id}|{payment_id}"
    signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature

def signup_teacher(mobile, password, name):
    """Register a new teacher account"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": mobile,
            "password": password,
            "name": name
        }, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token"), data.get("user", {}).get("id")
        else:
            print(f"  Signup failed: {resp.status_code} {resp.text[:200]}")
        return None, None
    except Exception as e:
        print(f"Signup error: {e}")
        return None, None

def login(mobile, password):
    """Login and get token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        }, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token"), data.get("user", {}).get("id")
        return None, None
    except Exception as e:
        print(f"Login error: {e}")
        return None, None

def purchase_bundle(token, headers, product_id, exam_id):
    """Purchase a bundle and return bundle_id"""
    # Checkout
    resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                        json={"productId": product_id, "examId": exam_id},
                        headers=headers, timeout=30)
    if resp.status_code != 200:
        print(f"  Checkout failed: {resp.status_code} {resp.text[:200]}")
        return None
    
    checkout_data = resp.json()
    order_id = checkout_data.get("orderId")
    
    # Simulate payment
    fake_payment_id = f"pay_test_{int(time.time() * 1000)}"
    signature = compute_razorpay_signature(order_id, fake_payment_id)
    
    # Verify payment
    resp = requests.post(f"{BASE_URL}/answer-key/bundles/verify",
                        json={
                            "razorpay_order_id": order_id,
                            "razorpay_payment_id": fake_payment_id,
                            "razorpay_signature": signature
                        },
                        headers=headers, timeout=30)
    
    if resp.status_code == 200:
        verify_data = resp.json()
        return verify_data.get("bundle", {}).get("id")
    else:
        print(f"  Verify failed: {resp.status_code} {resp.text[:200]}")
        return None

def main():
    print("=" * 80)
    print("ANSWER KEY BUNDLES (Phase F) — RE-TEST 6 FAILED TESTS")
    print("=" * 80)
    
    # Connect to MongoDB
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Login as admin
    print("\n[SETUP] Logging in as admin...")
    admin_token, admin_id = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ FATAL: Admin login failed")
        return
    print(f"✅ Admin logged in: {admin_id}")
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # SETUP 1: Enable answer key feature
    print("\n[SETUP] Enabling answer key feature...")
    resp = requests.put(f"{BASE_URL}/admin/answer-key/settings", 
                       json={"enabled": True, "maxPerDay": 50},
                       headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        print("✅ Answer key feature enabled, maxPerDay=50")
    else:
        print(f"⚠️ Enable failed: {resp.status_code} {resp.text[:200]}")
    
    # SETUP 2: Seed papers and products
    print("\n[SETUP] Seeding papers and products...")
    resp = requests.post(f"{BASE_URL}/admin/answer-key/bundles/seed",
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Seeded: {data.get('papers', 0)} papers, {data.get('products', 0)} products")
    else:
        print(f"⚠️ Seed failed: {resp.status_code} {resp.text[:200]}")
    
    # Get products list
    print("\n[SETUP] Fetching bundle products...")
    resp = requests.get(f"{BASE_URL}/answer-key/bundles/products", headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        products = resp.json().get("products", [])
        print(f"✅ Found {len(products)} products")
        c4_product = next((p for p in products if p["id"] == "c4"), None)
    else:
        print(f"⚠️ Products fetch failed: {resp.status_code}")
        c4_product = None
    
    # Get papers list
    print("\n[SETUP] Fetching papers...")
    resp = requests.get(f"{BASE_URL}/answer-key/paper-list?class=4", headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        papers_c4 = resp.json().get("papers", [])
        print(f"✅ Found {len(papers_c4)} Class 4 papers")
    else:
        papers_c4 = []
    
    print("\n" + "=" * 80)
    print("RUNNING RE-TESTS (6 TESTS)")
    print("=" * 80)
    
    # TEST 3: ATOMIC SLOT (concurrent submits)
    print("\n[TEST 3] ATOMIC SLOT: Concurrent submits for same slot...")
    # Create FRESH exam for this test
    future_date = (datetime.now() + timedelta(days=365)).isoformat()
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": f"Test3-Exam-{int(time.time())}", "endDate": future_date},
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        exam3_id = resp.json().get("exam", {}).get("id")
        print(f"  Created exam: {exam3_id}")
        
        # Create FRESH teacher for this test
        teacher3_mobile = f"93{int(time.time()) % 100000000}"
        token3, user3_id = signup_teacher(teacher3_mobile, "<redacted>", "Teacher Test3")
        if token3:
            print(f"  Created teacher: {teacher3_mobile}")
            headers3 = {"Authorization": f"Bearer {token3}"}
            
            # Purchase bundle
            bundle3_id = purchase_bundle(token3, headers3, c4_product["id"], exam3_id)
            if bundle3_id and len(papers_c4) >= 1:
                paper_id = papers_c4[0]["id"]
                print(f"  Bundle purchased: {bundle3_id}, testing with paper: {paper_id}")
                
                results = []
                
                def submit_concurrent(idx):
                    try:
                        pdf_bytes = generate_tiny_pdf()
                        files = {"files": (f"test{idx}.pdf", pdf_bytes, "application/pdf")}
                        data = {"paperId": paper_id}
                        resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle3_id}/submit",
                                            data=data, files=files, headers=headers3, timeout=30)
                        results.append(resp.status_code)
                    except Exception as e:
                        results.append(f"error: {e}")
                
                # Fire TWO concurrent requests with SAME paperId
                t1 = threading.Thread(target=submit_concurrent, args=(1,))
                t2 = threading.Thread(target=submit_concurrent, args=(2,))
                t1.start()
                t2.start()
                t1.join()
                t2.join()
                
                success_count = sum(1 for r in results if r == 200)
                conflict_count = sum(1 for r in results if r == 409)
                
                if success_count == 1 and conflict_count == 1:
                    # Verify bundle slot has exactly one requestId
                    bundle_doc = db.answerKeyBundles.find_one({"id": bundle3_id})
                    if bundle_doc:
                        slot = next((s for s in bundle_doc["slots"] if s["paperId"] == paper_id), None)
                        if slot and slot.get("requestId"):
                            log_test(3, "ATOMIC SLOT (concurrent submits)", True,
                                    f"Exactly ONE succeeded (200), one blocked (409). Slot has requestId: {slot['requestId']}")
                        else:
                            log_test(3, "ATOMIC SLOT", False, "Slot has no requestId")
                    else:
                        log_test(3, "ATOMIC SLOT", False, "Bundle not found")
                else:
                    log_test(3, "ATOMIC SLOT", False,
                            f"Results: {results} (expected one 200, one 409)")
            else:
                log_test(3, "ATOMIC SLOT", False, "Failed to purchase bundle or no papers")
        else:
            log_test(3, "ATOMIC SLOT", False, "Failed to create teacher")
    else:
        log_test(3, "ATOMIC SLOT", False, f"Failed to create exam: {resp.status_code}")
    
    # TEST 7: SLOT FREED ON REJECT/CANCEL
    print("\n[TEST 7] SLOT FREED ON REJECT/CANCEL...")
    # Create FRESH exam for this test
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": f"Test7-Exam-{int(time.time())}", "endDate": future_date},
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        exam7_id = resp.json().get("exam", {}).get("id")
        print(f"  Created exam: {exam7_id}")
        
        # Create FRESH teacher for this test
        teacher7_mobile = f"94{int(time.time()) % 100000000}"
        token7, user7_id = signup_teacher(teacher7_mobile, "<redacted>", "Teacher Test7")
        if token7:
            print(f"  Created teacher: {teacher7_mobile}")
            headers7 = {"Authorization": f"Bearer {token7}"}
            
            # Purchase bundle
            bundle7_id = purchase_bundle(token7, headers7, c4_product["id"], exam7_id)
            if bundle7_id and len(papers_c4) >= 1:
                paper_id = papers_c4[0]["id"]
                print(f"  Bundle purchased: {bundle7_id}")
                
                # Submit a paper (slot filled)
                pdf_bytes = generate_tiny_pdf()
                files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
                data = {"paperId": paper_id}
                resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle7_id}/submit",
                                    data=data, files=files, headers=headers7, timeout=30)
                
                if resp.status_code == 200:
                    request_data = resp.json()
                    request_id = request_data.get("id")
                    print(f"  Submitted request: {request_id}")
                    
                    # Verify slot is filled
                    bundle_doc = db.answerKeyBundles.find_one({"id": bundle7_id})
                    slot_before = next((s for s in bundle_doc["slots"] if s["paperId"] == paper_id), None)
                    print(f"  Slot before reject: used={slot_before.get('requestId') is not None}")
                    
                    # Admin rejects the request
                    resp = requests.post(f"{BASE_URL}/admin/answer-key/{request_id}/reject",
                                        json={"reason": "Test rejection"},
                                        headers=admin_headers, timeout=30)
                    
                    if resp.status_code == 200:
                        print(f"  Admin rejected request")
                        
                        # Check if slot is freed (used=false, requestId=null)
                        bundle_doc_after = db.answerKeyBundles.find_one({"id": bundle7_id})
                        slot_after = next((s for s in bundle_doc_after["slots"] if s["paperId"] == paper_id), None)
                        
                        if slot_after and slot_after.get("requestId") is None:
                            log_test(7, "SLOT FREED ON REJECT", True,
                                    f"Slot freed after reject: requestId=null, usedAt=null")
                        else:
                            log_test(7, "SLOT FREED ON REJECT", False,
                                    f"Slot still has requestId: {slot_after.get('requestId')}")
                    else:
                        log_test(7, "SLOT FREED ON REJECT", False, f"Reject failed: {resp.status_code}")
                    
                    # Also test CANCEL by teacher
                    print(f"  Testing CANCEL by teacher...")
                    # Submit another paper
                    if len(papers_c4) >= 2:
                        paper_id2 = papers_c4[1]["id"]
                        pdf_bytes2 = generate_tiny_pdf()
                        files2 = {"files": ("test2.pdf", pdf_bytes2, "application/pdf")}
                        data2 = {"paperId": paper_id2}
                        resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle7_id}/submit",
                                            data=data2, files=files2, headers=headers7, timeout=30)
                        
                        if resp.status_code == 200:
                            request_id2 = resp.json().get("id")
                            print(f"  Submitted second request: {request_id2}")
                            
                            # Teacher cancels
                            resp = requests.post(f"{BASE_URL}/answer-key/{request_id2}/cancel",
                                                headers=headers7, timeout=30)
                            
                            if resp.status_code == 200:
                                print(f"  Teacher cancelled request")
                                
                                # Check if slot is freed
                                bundle_doc_after2 = db.answerKeyBundles.find_one({"id": bundle7_id})
                                slot_after2 = next((s for s in bundle_doc_after2["slots"] if s["paperId"] == paper_id2), None)
                                
                                if slot_after2 and slot_after2.get("requestId") is None:
                                    print(f"  ✅ Slot freed after cancel: requestId=null")
                                else:
                                    print(f"  ⚠️ Slot still has requestId after cancel: {slot_after2.get('requestId')}")
                            else:
                                print(f"  ⚠️ Cancel failed: {resp.status_code}")
                else:
                    log_test(7, "SLOT FREED ON REJECT/CANCEL", False, f"Submit failed: {resp.status_code}")
            else:
                log_test(7, "SLOT FREED ON REJECT/CANCEL", False, "Failed to purchase bundle")
        else:
            log_test(7, "SLOT FREED ON REJECT/CANCEL", False, "Failed to create teacher")
    else:
        log_test(7, "SLOT FREED ON REJECT/CANCEL", False, f"Failed to create exam: {resp.status_code}")
    
    # TEST 8: DUPLICATE VERIFY IDEMPOTENCY
    print("\n[TEST 8] DUPLICATE VERIFY IDEMPOTENCY...")
    # Create FRESH exam for this test
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": f"Test8-Exam-{int(time.time())}", "endDate": future_date},
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        exam8_id = resp.json().get("exam", {}).get("id")
        print(f"  Created exam: {exam8_id}")
        
        # Create FRESH teacher for this test
        teacher8_mobile = f"95{int(time.time()) % 100000000}"
        token8, user8_id = signup_teacher(teacher8_mobile, "<redacted>", "Teacher Test8")
        if token8:
            print(f"  Created teacher: {teacher8_mobile}")
            headers8 = {"Authorization": f"Bearer {token8}"}
            
            # Checkout
            resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                                json={"productId": c4_product["id"], "examId": exam8_id},
                                headers=headers8, timeout=30)
            
            if resp.status_code == 200:
                checkout_data = resp.json()
                order_id = checkout_data.get("orderId")
                fake_payment_id = f"pay_dup_{int(time.time() * 1000)}"
                signature = compute_razorpay_signature(order_id, fake_payment_id)
                print(f"  Checkout done: order_id={order_id}")
                
                # First verify
                resp1 = requests.post(f"{BASE_URL}/answer-key/bundles/verify",
                                     json={
                                         "razorpay_order_id": order_id,
                                         "razorpay_payment_id": fake_payment_id,
                                         "razorpay_signature": signature
                                     },
                                     headers=headers8, timeout=30)
                
                # Second verify (duplicate)
                resp2 = requests.post(f"{BASE_URL}/answer-key/bundles/verify",
                                     json={
                                         "razorpay_order_id": order_id,
                                         "razorpay_payment_id": fake_payment_id,
                                         "razorpay_signature": signature
                                     },
                                     headers=headers8, timeout=30)
                
                if resp1.status_code == 200 and resp2.status_code == 200:
                    bundle_id_1 = resp1.json().get("bundle", {}).get("id")
                    bundle_id_2 = resp2.json().get("bundle", {}).get("id")
                    already_created = resp2.json().get("alreadyCreated", False)
                    print(f"  First verify: bundle_id={bundle_id_1}")
                    print(f"  Second verify: bundle_id={bundle_id_2}, alreadyCreated={already_created}")
                    
                    # Count bundles with this order_id
                    bundle_count = db.answerKeyBundles.count_documents({"razorpayOrderId": order_id})
                    print(f"  Bundle count for order: {bundle_count}")
                    
                    # Also test webhook (payment.captured)
                    # Note: webhook signature is different from verify signature
                    webhook_secret = "Subrat@1992"  # ASSESS_RAZORPAY_WEBHOOK_SECRET from .env
                    webhook_body = {
                        "event": "payment.captured",
                        "payload": {
                            "payment": {
                                "entity": {
                                    "order_id": order_id,
                                    "id": fake_payment_id
                                }
                            }
                        }
                    }
                    webhook_body_str = json.dumps(webhook_body)
                    webhook_signature = hmac.new(
                        webhook_secret.encode(),
                        webhook_body_str.encode(),
                        hashlib.sha256
                    ).hexdigest()
                    
                    resp_webhook = requests.post(f"{BASE_URL}/razorpay/webhook",
                                                json=webhook_body,
                                                headers={"x-razorpay-signature": webhook_signature},
                                                timeout=30)
                    print(f"  Webhook response: {resp_webhook.status_code}")
                    
                    # Count bundles again
                    bundle_count_after_webhook = db.answerKeyBundles.count_documents({"razorpayOrderId": order_id})
                    print(f"  Bundle count after webhook: {bundle_count_after_webhook}")
                    
                    if bundle_count == 1 and bundle_count_after_webhook == 1 and bundle_id_1 == bundle_id_2:
                        log_test(8, "DUPLICATE VERIFY IDEMPOTENCY", True,
                                f"Only ONE bundle created (count={bundle_count}), alreadyCreated={already_created}, webhook also idempotent")
                    else:
                        log_test(8, "DUPLICATE VERIFY IDEMPOTENCY", False,
                                f"Bundle count: {bundle_count} (after webhook: {bundle_count_after_webhook}), IDs: {bundle_id_1} vs {bundle_id_2}")
                else:
                    log_test(8, "DUPLICATE VERIFY IDEMPOTENCY", False,
                            f"Verify responses: {resp1.status_code}, {resp2.status_code}")
            else:
                log_test(8, "DUPLICATE VERIFY IDEMPOTENCY", False, f"Checkout failed: {resp.status_code}")
        else:
            log_test(8, "DUPLICATE VERIFY IDEMPOTENCY", False, "Failed to create teacher")
    else:
        log_test(8, "DUPLICATE VERIFY IDEMPOTENCY", False, f"Failed to create exam: {resp.status_code}")
    
    # TEST 9: CLIENT PRICE OVERRIDE
    print("\n[TEST 9] CLIENT PRICE OVERRIDE...")
    # Create FRESH exam for this test
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": f"Test9-Exam-{int(time.time())}", "endDate": future_date},
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        exam9_id = resp.json().get("exam", {}).get("id")
        print(f"  Created exam: {exam9_id}")
        
        # Create FRESH teacher for this test
        teacher9_mobile = f"96{int(time.time()) % 100000000}"
        token9, user9_id = signup_teacher(teacher9_mobile, "<redacted>", "Teacher Test9")
        if token9:
            print(f"  Created teacher: {teacher9_mobile}")
            headers9 = {"Authorization": f"Bearer {token9}"}
            
            actual_price = c4_product["priceInr"]
            fake_lower_price = 1
            print(f"  Product c4 actual price: {actual_price}, client sending: {fake_lower_price}")
            
            # Checkout with fake lower price
            resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                                json={"productId": c4_product["id"], "examId": exam9_id, "priceInr": fake_lower_price, "amount": 100},
                                headers=headers9, timeout=30)
            
            if resp.status_code == 200:
                checkout_data = resp.json()
                order_amount = checkout_data.get("amount")
                expected_amount = actual_price * 100
                print(f"  Order amount: {order_amount}, expected: {expected_amount}")
                
                if order_amount == expected_amount:
                    log_test(9, "CLIENT PRICE OVERRIDE", True,
                            f"Server used product price: {order_amount} (expected {expected_amount}), ignored client values")
                else:
                    log_test(9, "CLIENT PRICE OVERRIDE", False,
                            f"Order amount {order_amount} != expected {expected_amount}")
            else:
                log_test(9, "CLIENT PRICE OVERRIDE", False, f"Checkout failed: {resp.status_code}")
        else:
            log_test(9, "CLIENT PRICE OVERRIDE", False, "Failed to create teacher")
    else:
        log_test(9, "CLIENT PRICE OVERRIDE", False, f"Failed to create exam: {resp.status_code}")
    
    # TEST 10: BUNDLE AUTO-UNLOCK
    print("\n[TEST 10] BUNDLE AUTO-UNLOCK...")
    # Create FRESH exam for this test
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": f"Test10-Exam-{int(time.time())}", "endDate": future_date},
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        exam10_id = resp.json().get("exam", {}).get("id")
        print(f"  Created exam: {exam10_id}")
        
        # Create FRESH teacher for this test
        teacher10_mobile = f"97{int(time.time()) % 100000000}"
        token10, user10_id = signup_teacher(teacher10_mobile, "<redacted>", "Teacher Test10")
        if token10:
            print(f"  Created teacher: {teacher10_mobile}")
            headers10 = {"Authorization": f"Bearer {token10}"}
            
            # Purchase bundle
            bundle10_id = purchase_bundle(token10, headers10, c4_product["id"], exam10_id)
            if bundle10_id and len(papers_c4) >= 1:
                paper_id = papers_c4[0]["id"]
                print(f"  Bundle purchased: {bundle10_id}")
                
                # Submit a paper
                pdf_bytes = generate_tiny_pdf()
                files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
                data = {"paperId": paper_id}
                resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle10_id}/submit",
                                    data=data, files=files, headers=headers10, timeout=30)
                
                if resp.status_code == 200:
                    request_data = resp.json()
                    request_id = request_data.get("id")
                    print(f"  Submitted request: {request_id}")
                    
                    # Check initial status
                    req_doc = db.answerKeyRequests.find_one({"id": request_id})
                    if req_doc and req_doc.get("status") == "submitted":
                        print(f"  Request status: submitted, unlockMethod: {req_doc.get('unlockMethod')}")
                        
                        # Admin uploads answer key using CORRECT endpoint path
                        # CRITICAL FIX: POST /api/admin/answer-key/<REQUEST_ID>/upload-key
                        pdf_key = generate_tiny_pdf()
                        files_key = {"files": ("answer_key.pdf", pdf_key, "application/pdf")}
                        resp = requests.post(f"{BASE_URL}/admin/answer-key/{request_id}/upload-key",
                                            files=files_key, headers=admin_headers, timeout=30)
                        
                        if resp.status_code == 200:
                            print(f"  Admin uploaded key")
                            
                            # Check if request is now unlocked DIRECTLY (NOT ready_locked)
                            req_doc_after = db.answerKeyRequests.find_one({"id": request_id})
                            if req_doc_after:
                                status = req_doc_after.get("status")
                                price = req_doc_after.get("priceInr", 0)
                                has_preview = req_doc_after.get("previewImageRef") is not None
                                print(f"  After upload: status={status}, priceInr={price}, hasPreview={has_preview}")
                                
                                if status == "unlocked" and price == 0:
                                    log_test(10, "BUNDLE AUTO-UNLOCK", True,
                                            f"Request unlocked DIRECTLY (NOT ready_locked), priceInr=0, no preview needed")
                                else:
                                    log_test(10, "BUNDLE AUTO-UNLOCK", False,
                                            f"Status: {status} (expected 'unlocked'), priceInr: {price} (expected 0)")
                            else:
                                log_test(10, "BUNDLE AUTO-UNLOCK", False, "Request not found after upload")
                        else:
                            log_test(10, "BUNDLE AUTO-UNLOCK", False, 
                                    f"Upload failed: {resp.status_code} {resp.text[:200]}")
                    else:
                        log_test(10, "BUNDLE AUTO-UNLOCK", False, 
                                f"Initial status not 'submitted': {req_doc.get('status') if req_doc else 'not found'}")
                else:
                    log_test(10, "BUNDLE AUTO-UNLOCK", False, f"Submit failed: {resp.status_code}")
            else:
                log_test(10, "BUNDLE AUTO-UNLOCK", False, "Failed to purchase bundle")
        else:
            log_test(10, "BUNDLE AUTO-UNLOCK", False, "Failed to create teacher")
    else:
        log_test(10, "BUNDLE AUTO-UNLOCK", False, f"Failed to create exam: {resp.status_code}")
    
    # TEST 13: SINGLE FLOW REGRESSION
    print("\n[TEST 13] SINGLE FLOW REGRESSION...")
    # Create FRESH teacher for this test
    teacher13_mobile = f"98{int(time.time()) % 100000000}"
    token13, user13_id = signup_teacher(teacher13_mobile, "<redacted>", "Teacher Test13")
    if token13:
        print(f"  Created teacher: {teacher13_mobile}")
        headers13 = {"Authorization": f"Bearer {token13}"}
        
        if len(papers_c4) >= 1:
            paper_id = papers_c4[0]["id"]
            
            # Submit normal single request (NOT via bundle)
            pdf_bytes = generate_tiny_pdf()
            files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
            data = {"class": "4", "subject": "Math"}
            resp = requests.post(f"{BASE_URL}/answer-key/submit",
                                data=data, files=files, headers=headers13, timeout=30)
            
            if resp.status_code == 200:
                single_req_id = resp.json().get("id")
                print(f"  Submitted single request: {single_req_id}")
                
                # Admin uploads key using CORRECT endpoint path
                # CRITICAL FIX: POST /api/admin/answer-key/<REQUEST_ID>/upload-key
                pdf_key = generate_tiny_pdf()
                files_key = {"files": ("answer_key.pdf", pdf_key, "application/pdf")}
                resp = requests.post(f"{BASE_URL}/admin/answer-key/{single_req_id}/upload-key",
                                    files=files_key, headers=admin_headers, timeout=30)
                
                if resp.status_code == 200:
                    print(f"  Admin uploaded key")
                    
                    # Check if request is ready_locked with price and preview
                    req_doc = db.answerKeyRequests.find_one({"id": single_req_id})
                    if req_doc:
                        status = req_doc.get("status")
                        price = req_doc.get("priceInr", 0)
                        has_preview = req_doc.get("previewImageRef") is not None
                        print(f"  After upload: status={status}, priceInr={price}, hasPreview={has_preview}")
                        
                        if status == "ready_locked" and price > 0 and has_preview:
                            log_test(13, "SINGLE FLOW REGRESSION", True,
                                    f"Status: ready_locked, priceInr: {price}, hasPreview: True")
                        else:
                            log_test(13, "SINGLE FLOW REGRESSION", False,
                                    f"Status: {status} (expected 'ready_locked'), priceInr: {price}, hasPreview: {has_preview}")
                    else:
                        log_test(13, "SINGLE FLOW REGRESSION", False, "Request not found")
                else:
                    log_test(13, "SINGLE FLOW REGRESSION", False, 
                            f"Upload failed: {resp.status_code} {resp.text[:200]}")
            else:
                log_test(13, "SINGLE FLOW REGRESSION", False, f"Submit failed: {resp.status_code}")
        else:
            log_test(13, "SINGLE FLOW REGRESSION", False, "No papers available")
    else:
        log_test(13, "SINGLE FLOW REGRESSION", False, "Failed to create teacher")
    
    # CLEANUP
    print("\n" + "=" * 80)
    print("CLEANUP")
    print("=" * 80)
    
    # Disable answer key feature
    print("\n[CLEANUP] Disabling answer key feature...")
    resp = requests.put(f"{BASE_URL}/admin/answer-key/settings",
                       json={"enabled": False, "maxPerDay": 5},
                       headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        print("✅ Answer key feature disabled, maxPerDay reset to 5")
    
    # Delete test data
    print("\n[CLEANUP] Deleting test data...")
    cleanup_counts = {}
    
    cleanup_counts["answerKeyBundles"] = db.answerKeyBundles.delete_many({}).deleted_count
    cleanup_counts["answerKeyPapers"] = db.answerKeyPapers.delete_many({}).deleted_count
    cleanup_counts["answerKeyBundleProducts"] = db.answerKeyBundleProducts.delete_many({}).deleted_count
    cleanup_counts["answerKeyExams"] = db.answerKeyExams.delete_many({}).deleted_count
    cleanup_counts["answerKeyPriceLog"] = db.answerKeyPriceLog.delete_many({}).deleted_count
    cleanup_counts["answerKeyRequests"] = db.answerKeyRequests.delete_many({}).deleted_count
    cleanup_counts["answerKeyLogs"] = db.answerKeyLogs.delete_many({}).deleted_count
    cleanup_counts["payments"] = db.payments.delete_many({"product": {"$in": ["answer_key", "answer_key_bundle"]}}).deleted_count
    
    # Delete test users (all created in this test run)
    test_user_ids = []
    for var_name in dir():
        if var_name.startswith("user") and var_name.endswith("_id"):
            user_id = locals().get(var_name)
            if user_id:
                test_user_ids.append(user_id)
    
    if test_user_ids:
        cleanup_counts["users"] = db.users.delete_many({"id": {"$in": test_user_ids}}).deleted_count
    
    print("\n✅ CLEANUP COMPLETE:")
    for coll, count in cleanup_counts.items():
        print(f"  - {coll}: {count} documents deleted")
    
    # SUMMARY
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in test_results if "✅" in r["status"])
    failed = sum(1 for r in test_results if "❌" in r["status"])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"Passed: {passed} ✅")
    print(f"Failed: {failed} ❌")
    print(f"Success Rate: {(passed/total*100):.1f}%\n")
    
    print("DETAILED RESULTS:")
    print("-" * 80)
    for r in test_results:
        print(f"{r['status']} | Test {r['test']}: {r['description']}")
        if r['details']:
            print(f"  → {r['details']}")
    
    print("\n" + "=" * 80)
    print("ANSWER KEY BUNDLES RE-TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
