#!/usr/bin/env python3
"""
Answer Key Bundles (Phase F) — Backend Testing
Tests all 14 scenarios from test_result.md
"""
import requests
import json
import hmac
import hashlib
import time
import os
from pymongo import MongoClient
from datetime import datetime, timedelta
import io
import base64

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

# Load secrets from .env
with open("/app/.env") as f:
    for line in f:
        if line.startswith("RAZORPAY_KEY_SECRET="):
            RAZORPAY_KEY_SECRET = line.split("=", 1)[1].strip()
        elif line.startswith("WEBHOOK_CRON_SECRET="):
            WEBHOOK_CRON_SECRET = line.split("=", 1)[1].strip()

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
    # Minimal valid PDF structure
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

def main():
    print("=" * 80)
    print("ANSWER KEY BUNDLES (Phase F) — BACKEND TESTING")
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
                       json={"enabled": True},
                       headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        print("✅ Answer key feature enabled")
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
    
    # SETUP 3: Create active exam
    print("\n[SETUP] Creating active exam...")
    future_date = (datetime.now() + timedelta(days=365)).isoformat()
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": "SA-1 2026", "endDate": future_date},
                        headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        exam_data = resp.json()
        active_exam_id = exam_data.get("exam", {}).get("id")
        print(f"✅ Active exam created: {active_exam_id}")
    else:
        print(f"⚠️ Exam creation failed: {resp.status_code} {resp.text[:200]}")
        active_exam_id = None
    
    # SETUP 4: Register two fresh teacher accounts (A and B)
    print("\n[SETUP] Registering test teachers A and B...")
    teacher_a_mobile = f"90{int(time.time()) % 100000000}"
    teacher_b_mobile = f"91{int(time.time()) % 100000000}"
    
    token_a, user_a_id = signup_teacher(teacher_a_mobile, "<redacted>", "Teacher A")
    token_b, user_b_id = signup_teacher(teacher_b_mobile, "<redacted>", "Teacher B")
    
    if not token_a or not token_b:
        print("❌ FATAL: Failed to create test teachers")
        return
    
    print(f"✅ Teacher A: {teacher_a_mobile} (ID: {user_a_id})")
    print(f"✅ Teacher B: {teacher_b_mobile} (ID: {user_b_id})")
    
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    
    # Get products list
    print("\n[SETUP] Fetching bundle products...")
    resp = requests.get(f"{BASE_URL}/answer-key/bundles/products", headers=headers_a, timeout=30)
    if resp.status_code == 200:
        products = resp.json().get("products", [])
        print(f"✅ Found {len(products)} products")
        # Find specific products for testing
        c4_product = next((p for p in products if p["id"] == "c4"), None)
        c5_product = next((p for p in products if p["id"] == "c5"), None)
        primary_product = next((p for p in products if p["id"] == "primary"), None)
    else:
        print(f"⚠️ Products fetch failed: {resp.status_code}")
        c4_product = c5_product = primary_product = None
    
    # Get papers list
    print("\n[SETUP] Fetching papers...")
    resp = requests.get(f"{BASE_URL}/answer-key/paper-list?class=4", headers=headers_a, timeout=30)
    if resp.status_code == 200:
        papers_c4 = resp.json().get("papers", [])
        print(f"✅ Found {len(papers_c4)} Class 4 papers")
    else:
        papers_c4 = []
    
    resp = requests.get(f"{BASE_URL}/answer-key/paper-list?class=5", headers=headers_a, timeout=30)
    if resp.status_code == 200:
        papers_c5 = resp.json().get("papers", [])
        print(f"✅ Found {len(papers_c5)} Class 5 papers")
    else:
        papers_c5 = []
    
    # Helper function to purchase a bundle
    def purchase_bundle(token, headers, product_id, exam_id, user_id):
        """Purchase a bundle and return bundle_id"""
        # Checkout
        resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                            json={"productId": product_id, "examId": exam_id, "priceInr": 1},
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
    
    print("\n" + "=" * 80)
    print("RUNNING TESTS")
    print("=" * 80)
    
    # TEST 1: Cross-user bundle access
    print("\n[TEST 1] Cross-user bundle access...")
    bundle_a_id = None
    if c4_product and active_exam_id:
        bundle_a_id = purchase_bundle(token_a, headers_a, c4_product["id"], active_exam_id, user_a_id)
        if bundle_a_id:
            print(f"  Teacher A purchased bundle: {bundle_a_id}")
            
            # B tries to access A's bundle
            resp = requests.get(f"{BASE_URL}/answer-key/bundles/my", headers=headers_b, timeout=30)
            if resp.status_code == 200:
                b_bundles = resp.json().get("bundles", [])
                a_bundle_visible = any(b["id"] == bundle_a_id for b in b_bundles)
                
                if not a_bundle_visible:
                    log_test(1, "Cross-user bundle access (GET /my)", True, 
                            "B cannot see A's bundle in /my")
                else:
                    log_test(1, "Cross-user bundle access (GET /my)", False,
                            "B can see A's bundle in /my")
            
            # B tries to use A's bundle for submit
            if papers_c4:
                pdf_bytes = generate_tiny_pdf()
                files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
                data = {"paperId": papers_c4[0]["id"]}
                resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_a_id}/submit",
                                    data=data, files=files, headers=headers_b, timeout=30)
                
                if resp.status_code == 404:
                    log_test(1, "Cross-user bundle access (submit)", True,
                            "B cannot submit to A's bundle (404)")
                else:
                    log_test(1, "Cross-user bundle access (submit)", False,
                            f"Expected 404, got {resp.status_code}")
        else:
            log_test(1, "Cross-user bundle access", False, "Failed to purchase bundle for A")
    else:
        log_test(1, "Cross-user bundle access", False, "Missing c4 product or exam")
    
    # TEST 2: Same paper submitted twice
    print("\n[TEST 2] Same paper submitted twice under one bundle...")
    if bundle_a_id and papers_c4:
        paper_id = papers_c4[0]["id"]
        
        # First submit
        pdf_bytes = generate_tiny_pdf()
        files = {"files": ("test1.pdf", pdf_bytes, "application/pdf")}
        data = {"paperId": paper_id, "class": "4", "subject": "Math"}
        resp1 = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_a_id}/submit",
                             data=data, files=files, headers=headers_a, timeout=30)
        
        if resp1.status_code == 200:
            print(f"  First submit succeeded")
            
            # Second submit (same paper)
            pdf_bytes2 = generate_tiny_pdf()
            files2 = {"files": ("test2.pdf", pdf_bytes2, "application/pdf")}
            data2 = {"paperId": paper_id}
            resp2 = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_a_id}/submit",
                                 data=data2, files=files2, headers=headers_a, timeout=30)
            
            if resp2.status_code == 409:
                log_test(2, "Same paper twice", True, "Second submit blocked with 409")
            else:
                log_test(2, "Same paper twice", False, 
                        f"Expected 409, got {resp2.status_code}: {resp2.text[:200]}")
        else:
            log_test(2, "Same paper twice", False, 
                    f"First submit failed: {resp1.status_code}")
    else:
        log_test(2, "Same paper twice", False, "Missing bundle or papers")
    
    # TEST 3: Concurrent submits for same slot (atomic)
    print("\n[TEST 3] Concurrent submits for same slot...")
    # Purchase a fresh bundle for this test
    if c4_product and active_exam_id and len(papers_c4) >= 2:
        bundle_concurrent = purchase_bundle(token_a, headers_a, c4_product["id"], active_exam_id, user_a_id)
        if bundle_concurrent:
            paper_id = papers_c4[1]["id"]  # Use second paper
            
            import threading
            results = []
            
            def submit_concurrent(idx):
                try:
                    pdf_bytes = generate_tiny_pdf()
                    files = {"files": (f"test{idx}.pdf", pdf_bytes, "application/pdf")}
                    data = {"paperId": paper_id, "class": "4", "subject": "Math"}
                    resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_concurrent}/submit",
                                        data=data, files=files, headers=headers_a, timeout=30)
                    results.append(resp.status_code)
                except Exception as e:
                    results.append(f"error: {e}")
            
            # Fire two concurrent requests
            t1 = threading.Thread(target=submit_concurrent, args=(1,))
            t2 = threading.Thread(target=submit_concurrent, args=(2,))
            t1.start()
            t2.start()
            t1.join()
            t2.join()
            
            success_count = sum(1 for r in results if r == 200)
            conflict_count = sum(1 for r in results if r == 409)
            
            if success_count == 1 and conflict_count == 1:
                log_test(3, "Concurrent submits (atomic)", True,
                        f"Exactly one succeeded (200), one blocked (409)")
            else:
                log_test(3, "Concurrent submits (atomic)", False,
                        f"Results: {results} (expected one 200, one 409)")
        else:
            log_test(3, "Concurrent submits", False, "Failed to purchase bundle")
    else:
        log_test(3, "Concurrent submits", False, "Missing product/exam/papers")
    
    # TEST 4: Class 4 bundle cannot submit Class 5 paper
    print("\n[TEST 4] Class 4 bundle cannot submit Class 5 paper...")
    if bundle_a_id and papers_c5:
        paper_c5_id = papers_c5[0]["id"]
        pdf_bytes = generate_tiny_pdf()
        files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
        data = {"paperId": paper_c5_id}
        resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_a_id}/submit",
                            data=data, files=files, headers=headers_a, timeout=30)
        
        if resp.status_code == 400:
            error_msg = resp.json().get("error", "")
            if "not in this bundle" in error_msg.lower() or "paper" in error_msg.lower():
                log_test(4, "Class mismatch", True, "Class 5 paper rejected for Class 4 bundle (400)")
            else:
                log_test(4, "Class mismatch", False, f"Got 400 but wrong error: {error_msg}")
        else:
            log_test(4, "Class mismatch", False, f"Expected 400, got {resp.status_code}")
    else:
        log_test(4, "Class mismatch", False, "Missing bundle or Class 5 papers")
    
    # TEST 5: Primary bundle works for classes 1-5
    print("\n[TEST 5] Primary bundle works for classes 1-5...")
    if primary_product and active_exam_id:
        bundle_primary = purchase_bundle(token_a, headers_a, primary_product["id"], active_exam_id, user_a_id)
        if bundle_primary:
            success_classes = []
            for cls in [1, 2, 3, 4, 5]:
                resp = requests.get(f"{BASE_URL}/answer-key/paper-list?class={cls}", 
                                   headers=headers_a, timeout=30)
                if resp.status_code == 200:
                    papers = resp.json().get("papers", [])
                    if papers:
                        paper_id = papers[0]["id"]
                        pdf_bytes = generate_tiny_pdf()
                        files = {"files": (f"test_c{cls}.pdf", pdf_bytes, "application/pdf")}
                        data = {"paperId": paper_id, "class": "4", "subject": "Math"}
                        resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_primary}/submit",
                                            data=data, files=files, headers=headers_a, timeout=30)
                        if resp.status_code == 200:
                            success_classes.append(cls)
            
            if len(success_classes) == 5:
                log_test(5, "Primary bundle (classes 1-5)", True,
                        f"Successfully submitted papers for all classes: {success_classes}")
            else:
                log_test(5, "Primary bundle (classes 1-5)", False,
                        f"Only succeeded for classes: {success_classes}")
        else:
            log_test(5, "Primary bundle", False, "Failed to purchase primary bundle")
    else:
        log_test(5, "Primary bundle", False, "Missing primary product or exam")
    
    # TEST 6: Expired bundle cannot be used
    print("\n[TEST 6] Expired bundle cannot be used...")
    # Create exam with past endDate
    past_date = (datetime.now() - timedelta(days=1)).isoformat()
    resp = requests.post(f"{BASE_URL}/admin/answer-key/exams",
                        json={"name": "Past Exam", "endDate": past_date},
                        headers=admin_headers, timeout=30)
    
    if resp.status_code == 200:
        past_exam_id = resp.json().get("exam", {}).get("id")
        
        # Try to checkout with past exam
        resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                            json={"productId": c4_product["id"], "examId": past_exam_id, "priceInr": 85},
                            headers=headers_a, timeout=30)
        
        if resp.status_code == 400:
            log_test(6, "Expired exam checkout", True, "Past exam rejected at checkout (400)")
        else:
            # If checkout succeeded, try to use it
            if resp.status_code == 200:
                # Manually create bundle with past expiry and run cron
                bundle_doc = {
                    "id": f"test_expired_{int(time.time())}",
                    "ownerId": user_a_id,
                    "bundleProductId": c4_product["id"],
                    "examId": past_exam_id,
                    "classes": ["4"],
                    "slots": [{"class": "4", "paperId": papers_c4[0]["id"], "requestId": None, "usedAt": None}],
                    "priceInr": 85,
                    "purchasedAt": datetime.now(),
                    "expiresAt": datetime.now() - timedelta(days=1),
                    "status": "active",
                    "updatedAt": datetime.now()
                }
                db.answerKeyBundles.insert_one(bundle_doc)
                
                # Run expiry cron
                cron_headers = {"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}"}
                resp = requests.post(f"{BASE_URL}/answer-key/cron/expire-bundles",
                                    headers=cron_headers, timeout=30)
                
                if resp.status_code == 200:
                    # Check if bundle is now expired
                    updated_bundle = db.answerKeyBundles.find_one({"id": bundle_doc["id"]})
                    if updated_bundle and updated_bundle.get("status") == "expired":
                        # Try to submit to expired bundle
                        pdf_bytes = generate_tiny_pdf()
                        files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
                        data = {"paperId": papers_c4[0]["id"]}
                        resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_doc['id']}/submit",
                                            data=data, files=files, headers=headers_a, timeout=30)
                        
                        if resp.status_code == 400:
                            log_test(6, "Expired bundle", True, "Expired bundle rejected (400)")
                        else:
                            log_test(6, "Expired bundle", False, f"Expected 400, got {resp.status_code}")
                    else:
                        log_test(6, "Expired bundle", False, "Bundle not marked as expired")
                else:
                    log_test(6, "Expired bundle", False, f"Cron failed: {resp.status_code}")
            else:
                log_test(6, "Expired bundle", False, f"Unexpected checkout response: {resp.status_code}")
    else:
        log_test(6, "Expired bundle", False, "Failed to create past exam")
    
    # TEST 7: Reject/cancel frees slot
    print("\n[TEST 7] Reject/cancel frees slot...")
    # This test requires admin to reject a request - we'll verify the slot is freed
    # Create a bundle, submit a request, then admin rejects it
    if c4_product and active_exam_id and papers_c4:
        bundle_reject = purchase_bundle(token_a, headers_a, c4_product["id"], active_exam_id, user_a_id)
        if bundle_reject:
            paper_id = papers_c4[0]["id"]
            pdf_bytes = generate_tiny_pdf()
            files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
            data = {"paperId": paper_id, "class": "4", "subject": "Math"}
            resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_reject}/submit",
                                data=data, files=files, headers=headers_a, timeout=30)
            
            if resp.status_code == 200:
                request_data = resp.json()
                request_id = request_data.get("id")
                
                # Admin rejects the request
                resp = requests.post(f"{BASE_URL}/admin/answer-key/requests/{request_id}/reject",
                                    json={"reason": "Test rejection"},
                                    headers=admin_headers, timeout=30)
                
                if resp.status_code == 200:
                    # Check if slot is freed
                    bundle_doc = db.answerKeyBundles.find_one({"id": bundle_reject})
                    if bundle_doc:
                        slot = next((s for s in bundle_doc["slots"] if s["paperId"] == paper_id), None)
                        if slot and slot.get("requestId") is None:
                            log_test(7, "Reject frees slot", True, "Slot requestId set back to null")
                        else:
                            log_test(7, "Reject frees slot", False, f"Slot still has requestId: {slot}")
                    else:
                        log_test(7, "Reject frees slot", False, "Bundle not found")
                else:
                    log_test(7, "Reject frees slot", False, f"Reject failed: {resp.status_code}")
            else:
                log_test(7, "Reject frees slot", False, f"Submit failed: {resp.status_code}")
        else:
            log_test(7, "Reject frees slot", False, "Failed to purchase bundle")
    else:
        log_test(7, "Reject frees slot", False, "Missing prerequisites")
    
    # TEST 8: Duplicate verify creates only ONE bundle
    print("\n[TEST 8] Duplicate verify creates only ONE bundle...")
    if c4_product and active_exam_id:
        # Checkout
        resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                            json={"productId": c4_product["id"], "examId": active_exam_id, "priceInr": 85},
                            headers=headers_a, timeout=30)
        
        if resp.status_code == 200:
            checkout_data = resp.json()
            order_id = checkout_data.get("razorpayOrderId")
            fake_payment_id = f"pay_dup_{int(time.time() * 1000)}"
            signature = compute_razorpay_signature(order_id, fake_payment_id)
            
            # First verify
            resp1 = requests.post(f"{BASE_URL}/answer-key/bundles/verify",
                                 json={
                                     "razorpay_order_id": order_id,
                                     "razorpay_payment_id": fake_payment_id,
                                     "razorpay_signature": signature
                                 },
                                 headers=headers_a, timeout=30)
            
            # Second verify (duplicate)
            resp2 = requests.post(f"{BASE_URL}/answer-key/bundles/verify",
                                 json={
                                     "razorpay_order_id": order_id,
                                     "razorpay_payment_id": fake_payment_id,
                                     "razorpay_signature": signature
                                 },
                                 headers=headers_a, timeout=30)
            
            if resp1.status_code == 200 and resp2.status_code == 200:
                bundle_id_1 = resp1.json().get("bundleId")
                bundle_id_2 = resp2.json().get("bundleId")
                
                # Count bundles with this order_id
                bundle_count = db.answerKeyBundles.count_documents({"razorpayOrderId": order_id})
                
                if bundle_count == 1 and bundle_id_1 == bundle_id_2:
                    log_test(8, "Duplicate verify", True, "Only ONE bundle created, same ID returned")
                else:
                    log_test(8, "Duplicate verify", False, 
                            f"Found {bundle_count} bundles, IDs: {bundle_id_1} vs {bundle_id_2}")
            else:
                log_test(8, "Duplicate verify", False, 
                        f"Verify responses: {resp1.status_code}, {resp2.status_code}")
        else:
            log_test(8, "Duplicate verify", False, f"Checkout failed: {resp.status_code}")
    else:
        log_test(8, "Duplicate verify", False, "Missing prerequisites")
    
    # TEST 9: Client-supplied lower price ignored
    print("\n[TEST 9] Client-supplied lower price ignored...")
    if c4_product and active_exam_id:
        actual_price = c4_product["priceInr"]
        fake_lower_price = 1
        
        resp = requests.post(f"{BASE_URL}/answer-key/bundles/checkout",
                            json={"productId": c4_product["id"], "examId": active_exam_id, "priceInr": fake_lower_price},
                            headers=headers_a, timeout=30)
        
        if resp.status_code == 200:
            checkout_data = resp.json()
            order_amount = checkout_data.get("amount")
            expected_amount = actual_price * 100
            
            if order_amount == expected_amount:
                log_test(9, "Price validation", True, 
                        f"Server used product price: {order_amount} (expected {expected_amount})")
            else:
                log_test(9, "Price validation", False,
                        f"Order amount {order_amount} != expected {expected_amount}")
        else:
            log_test(9, "Price validation", False, f"Checkout failed: {resp.status_code}")
    else:
        log_test(9, "Price validation", False, "Missing prerequisites")
    
    # TEST 10: Bundle request auto-unlocks on admin upload
    print("\n[TEST 10] Bundle request auto-unlocks on admin upload...")
    if c4_product and active_exam_id and papers_c4:
        bundle_unlock = purchase_bundle(token_a, headers_a, c4_product["id"], active_exam_id, user_a_id)
        if bundle_unlock:
            paper_id = papers_c4[0]["id"]
            pdf_bytes = generate_tiny_pdf()
            files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
            data = {"paperId": paper_id, "class": "4", "subject": "Math"}
            resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_unlock}/submit",
                                data=data, files=files, headers=headers_a, timeout=30)
            
            if resp.status_code == 200:
                request_data = resp.json()
                request_id = request_data.get("id")
                
                # Check initial status
                req_doc = db.answerKeyRequests.find_one({"id": request_id})
                if req_doc and req_doc.get("status") == "submitted":
                    print(f"  Request status: submitted")
                    
                    # Admin uploads answer key
                    pdf_key = generate_tiny_pdf()
                    files_key = {"file": ("answer_key.pdf", pdf_key, "application/pdf")}
                    data_key = {"requestId": request_id}
                    resp = requests.post(f"{BASE_URL}/admin/answer-key/upload-key",
                                        data=data_key, files=files_key, headers=admin_headers, timeout=30)
                    
                    if resp.status_code == 200:
                        # Check if request is now unlocked
                        req_doc_after = db.answerKeyRequests.find_one({"id": request_id})
                        if req_doc_after:
                            status = req_doc_after.get("status")
                            price = req_doc_after.get("priceInr", 0)
                            
                            if status == "unlocked" and price == 0:
                                log_test(10, "Bundle request auto-unlock", True,
                                        "Request unlocked directly, priceInr=0")
                            else:
                                log_test(10, "Bundle request auto-unlock", False,
                                        f"Status: {status}, priceInr: {price}")
                        else:
                            log_test(10, "Bundle request auto-unlock", False, "Request not found after upload")
                    else:
                        log_test(10, "Bundle request auto-unlock", False, 
                                f"Upload failed: {resp.status_code}")
                else:
                    log_test(10, "Bundle request auto-unlock", False, 
                            f"Initial status not 'submitted': {req_doc.get('status') if req_doc else 'not found'}")
            else:
                log_test(10, "Bundle request auto-unlock", False, f"Submit failed: {resp.status_code}")
        else:
            log_test(10, "Bundle request auto-unlock", False, "Failed to purchase bundle")
    else:
        log_test(10, "Bundle request auto-unlock", False, "Missing prerequisites")
    
    # TEST 11: Locked single key + use-for-request
    print("\n[TEST 11] Locked single key + use-for-request...")
    # Create a normal single request (not via bundle)
    if papers_c4:
        paper_id = papers_c4[0]["id"]
        pdf_bytes = generate_tiny_pdf()
        files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
        data = {"paperId": paper_id, "class": "4", "subject": "Math"}
        resp = requests.post(f"{BASE_URL}/answer-key/submit",
                            data=data, files=files, headers=headers_a, timeout=30)
        
        if resp.status_code == 200:
            single_request_id = resp.json().get("requestId")
            
            # Admin uploads key (should become ready_locked)
            pdf_key = generate_tiny_pdf()
            files_key = {"file": ("answer_key.pdf", pdf_key, "application/pdf")}
            data_key = {"requestId": single_request_id}
            resp = requests.post(f"{BASE_URL}/admin/answer-key/upload-key",
                                data=data_key, files=files_key, headers=admin_headers, timeout=30)
            
            if resp.status_code == 200:
                req_doc = db.answerKeyRequests.find_one({"id": single_request_id})
                if req_doc and req_doc.get("status") == "ready_locked":
                    print(f"  Single request is ready_locked")
                    
                    # Buy a bundle covering this class
                    bundle_use = purchase_bundle(token_a, headers_a, c4_product["id"], active_exam_id, user_a_id)
                    if bundle_use:
                        # Use bundle to unlock this request
                        resp = requests.post(f"{BASE_URL}/answer-key/bundles/{bundle_use}/use-for-request",
                                            json={"requestId": single_request_id},
                                            headers=headers_a, timeout=30)
                        
                        if resp.status_code == 200:
                            # Check if request is now unlocked and slot consumed
                            req_doc_after = db.answerKeyRequests.find_one({"id": single_request_id})
                            bundle_doc = db.answerKeyBundles.find_one({"id": bundle_use})
                            
                            if req_doc_after and req_doc_after.get("status") == "unlocked":
                                # Check if a slot was consumed
                                used_slots = sum(1 for s in bundle_doc.get("slots", []) if s.get("requestId"))
                                if used_slots >= 1:
                                    log_test(11, "Locked single + use-for-request", True,
                                            "Request unlocked, slot consumed")
                                else:
                                    log_test(11, "Locked single + use-for-request", False,
                                            "Request unlocked but no slot consumed")
                            else:
                                log_test(11, "Locked single + use-for-request", False,
                                        f"Request status: {req_doc_after.get('status') if req_doc_after else 'not found'}")
                        else:
                            log_test(11, "Locked single + use-for-request", False,
                                    f"Use-for-request failed: {resp.status_code}")
                    else:
                        log_test(11, "Locked single + use-for-request", False, "Failed to purchase bundle")
                else:
                    log_test(11, "Locked single + use-for-request", False,
                            f"Single request status: {req_doc.get('status') if req_doc else 'not found'}")
            else:
                log_test(11, "Locked single + use-for-request", False,
                        f"Upload key failed: {resp.status_code}")
        else:
            log_test(11, "Locked single + use-for-request", False,
                    f"Single submit failed: {resp.status_code}")
    else:
        log_test(11, "Locked single + use-for-request", False, "Missing papers")
    
    # TEST 12: Savings recompute
    print("\n[TEST 12] Savings recompute when prices change...")
    # Get current products with savings
    resp = requests.get(f"{BASE_URL}/answer-key/bundles/products", headers=headers_a, timeout=30)
    if resp.status_code == 200:
        products_before = resp.json().get("products", [])
        c4_before = next((p for p in products_before if p["id"] == "c4"), None)
        
        if c4_before:
            separately_before = c4_before.get("separately", 0)
            print(f"  C4 separately before: {separately_before}")
            
            # Change longPriceInr
            resp = requests.put(f"{BASE_URL}/admin/answer-key/settings",
                               json={"longPriceInr": 99},
                               headers=admin_headers, timeout=30)
            
            if resp.status_code == 200:
                # Get products again
                resp = requests.get(f"{BASE_URL}/answer-key/bundles/products", headers=headers_a, timeout=30)
                if resp.status_code == 200:
                    products_after = resp.json().get("products", [])
                    c4_after = next((p for p in products_after if p["id"] == "c4"), None)
                    
                    if c4_after:
                        separately_after = c4_after.get("separately", 0)
                        print(f"  C4 separately after: {separately_after}")
                        
                        if separately_after != separately_before:
                            log_test(12, "Savings recompute (price change)", True,
                                    f"Separately changed from {separately_before} to {separately_after}")
                        else:
                            log_test(12, "Savings recompute (price change)", False,
                                    "Separately did not change")
                    else:
                        log_test(12, "Savings recompute", False, "C4 product not found after")
                else:
                    log_test(12, "Savings recompute", False, "Products fetch failed after")
                
                # Restore original price
                requests.put(f"{BASE_URL}/admin/answer-key/settings",
                           json={"longPriceInr": 49},
                           headers=admin_headers, timeout=30)
            else:
                log_test(12, "Savings recompute", False, f"Settings update failed: {resp.status_code}")
        else:
            log_test(12, "Savings recompute", False, "C4 product not found")
    else:
        log_test(12, "Savings recompute", False, f"Products fetch failed: {resp.status_code}")
    
    # TEST 13: Single answer key purchase still works
    print("\n[TEST 13] Single answer key purchase flow...")
    if papers_c4:
        paper_id = papers_c4[0]["id"]
        pdf_bytes = generate_tiny_pdf()
        files = {"files": ("test.pdf", pdf_bytes, "application/pdf")}
        data = {"paperId": paper_id, "class": "4", "subject": "Math"}
        resp = requests.post(f"{BASE_URL}/answer-key/submit",
                            data=data, files=files, headers=headers_b, timeout=30)
        
        if resp.status_code == 200:
            single_req_id = resp.json().get("id")
            
            # Admin uploads key
            pdf_key = generate_tiny_pdf()
            files_key = {"file": ("answer_key.pdf", pdf_key, "application/pdf")}
            data_key = {"requestId": single_req_id}
            resp = requests.post(f"{BASE_URL}/admin/answer-key/upload-key",
                                data=data_key, files=files_key, headers=admin_headers, timeout=30)
            
            if resp.status_code == 200:
                req_doc = db.answerKeyRequests.find_one({"id": single_req_id})
                if req_doc:
                    status = req_doc.get("status")
                    price = req_doc.get("priceInr", 0)
                    
                    if status == "ready_locked" and price > 0:
                        log_test(13, "Single answer key flow", True,
                                f"Status: ready_locked, priceInr: {price}")
                    else:
                        log_test(13, "Single answer key flow", False,
                                f"Status: {status}, priceInr: {price}")
                else:
                    log_test(13, "Single answer key flow", False, "Request not found")
            else:
                log_test(13, "Single answer key flow", False, f"Upload failed: {resp.status_code}")
        else:
            log_test(13, "Single answer key flow", False, f"Submit failed: {resp.status_code}")
    else:
        log_test(13, "Single answer key flow", False, "Missing papers")
    
    # TEST 14: Regression - other endpoints still work
    print("\n[TEST 14] Regression - other endpoints...")
    endpoints_ok = []
    
    # /api/ai-credits/checkout
    resp = requests.post(f"{BASE_URL}/ai-credits/checkout",
                        json={"credits": 100},
                        headers=headers_a, timeout=30)
    if resp.status_code in [200, 400]:  # 400 is ok if validation fails
        endpoints_ok.append("/ai-credits/checkout")
    
    # /api/razorpay/create-order (premium)
    resp = requests.post(f"{BASE_URL}/razorpay/create-order",
                        json={"planId": "monthly"},
                        headers=headers_a, timeout=30)
    if resp.status_code in [200, 400]:
        endpoints_ok.append("/razorpay/create-order")
    
    # /api/plans
    resp = requests.get(f"{BASE_URL}/plans", timeout=30)
    if resp.status_code == 200:
        endpoints_ok.append("/plans")
    
    if len(endpoints_ok) == 3:
        log_test(14, "Regression check", True, f"All endpoints responding: {endpoints_ok}")
    else:
        log_test(14, "Regression check", False, f"Only {len(endpoints_ok)}/3 endpoints ok: {endpoints_ok}")
    
    # CLEANUP
    print("\n" + "=" * 80)
    print("CLEANUP")
    print("=" * 80)
    
    # Disable answer key feature
    print("\n[CLEANUP] Disabling answer key feature...")
    resp = requests.put(f"{BASE_URL}/admin/answer-key/settings",
                       json={"enabled": False},
                       headers=admin_headers, timeout=30)
    if resp.status_code == 200:
        print("✅ Answer key feature disabled")
    
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
    cleanup_counts["users"] = db.users.delete_many({"id": {"$in": [user_a_id, user_b_id]}}).deleted_count
    
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
    print("ANSWER KEY BUNDLES (Phase F) TESTING COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
