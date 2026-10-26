#!/usr/bin/env python3
"""
Answer Key Feature — Backend Testing (RETEST BLOCKED TESTS ONLY)
Tests 6, 8, 9, 10, 11, 12, 13 that were previously blocked by infrastructure issues.
Critical security tests (1,2,3,4,5,7,15) already PASSED — NOT retested.
"""
import requests
import json
import hmac
import hashlib
import os
import time
from io import BytesIO
from pymongo import MongoClient
from datetime import datetime
import uuid

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')
RZP_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'i1wjidyWgO9h5QUeXeVRUs6q')

# Admin credentials
ADMIN_MOBILE = '9999999999'
ADMIN_PASSWORD = 'admin123'

# Test tracking
test_results = []
test_users = []
test_requests = []

def log_test(test_num, name, passed, details=''):
    """Log test result"""
    status = '✅ PASS' if passed else '❌ FAIL'
    test_results.append({'num': test_num, 'name': name, 'passed': passed, 'details': details})
    print(f"\n{status} TEST {test_num}: {name}")
    if details:
        print(f"  {details}")

def create_minimal_pdf():
    """Create a minimal valid PDF (1 page)"""
    pdf_content = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Test Answer Key) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
306
%%EOF"""
    return pdf_content

def create_tiny_jpeg():
    """Create a minimal 2x2 JPEG"""
    # Minimal JPEG header + 2x2 red square
    jpeg_bytes = bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
        0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x03, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
        0xD2, 0xCF, 0x20, 0xFF, 0xD9
    ])
    return jpeg_bytes

def login(mobile, password):
    """Login and return token"""
    try:
        resp = requests.post(f"{API_URL}/auth/login", json={'mobile': mobile, 'password': password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('token')
        return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def create_test_user(mobile_suffix):
    """Create a test user and return (user_id, token)"""
    mobile = f"900{mobile_suffix:07d}"
    password = "<redacted>"
    name = f"TestUser{mobile_suffix}"
    
    try:
        # Register
        resp = requests.post(f"{API_URL}/auth/register", json={
            'mobile': mobile, 'password': password, 'name': name
        }, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            user_id = data.get('user', {}).get('id')
            token = data.get('token')
            test_users.append({'id': user_id, 'mobile': mobile})
            return user_id, token
        
        # Try login if already exists
        token = login(mobile, password)
        if token:
            # Get user ID from MongoDB
            client = MongoClient(MONGO_URL)
            db = client[DB_NAME]
            user = db.users.find_one({'mobile': mobile})
            if user:
                user_id = user['id']
                test_users.append({'id': user_id, 'mobile': mobile})
                return user_id, token
        
        return None, None
    except Exception as e:
        print(f"Create user error: {e}")
        return None, None

def compute_razorpay_signature(order_id, payment_id):
    """Compute HMAC SHA256 signature for Razorpay payment verification"""
    message = f"{order_id}|{payment_id}"
    signature = hmac.new(
        RZP_KEY_SECRET.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

def check_pdf_encrypted(pdf_bytes):
    """Check if PDF contains /Encrypt marker"""
    return b'/Encrypt' in pdf_bytes

def main():
    print("=" * 80)
    print("ANSWER KEY FEATURE — BACKEND RETEST (Tests 6, 8, 9, 10, 11, 12, 13)")
    print("Critical security tests (1,2,3,4,5,7,15) already PASSED — NOT retested")
    print("=" * 80)
    
    # MongoDB connection
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Admin login
    print("\n[SETUP] Admin login...")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ Admin login failed")
        return
    print(f"✅ Admin token: {admin_token[:20]}...")
    
    admin_headers = {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}
    
    # Enable feature
    print("\n[SETUP] Enabling Answer Key feature...")
    resp = requests.put(f"{API_URL}/admin/answer-key/settings", 
                       headers=admin_headers,
                       json={'enabled': True}, timeout=10)
    if resp.status_code == 200:
        print("✅ Feature enabled")
    else:
        print(f"❌ Failed to enable feature: {resp.status_code}")
        return
    
    # ========================================================================
    # TEST 6: LIMITS (maxUnpaidConcurrent=2, 3rd submit → 429)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 6: LIMITS (maxUnpaidConcurrent=2)")
    print("=" * 80)
    
    try:
        # Set maxUnpaidConcurrent=2
        resp = requests.put(f"{API_URL}/admin/answer-key/settings",
                           headers=admin_headers,
                           json={'maxUnpaidConcurrent': 2}, timeout=10)
        print(f"Set maxUnpaidConcurrent=2: {resp.status_code}")
        
        # Create test user
        user_id, user_token = create_test_user(60001)
        if not user_token:
            log_test(6, "LIMITS", False, "Failed to create test user")
        else:
            user_headers = {'Authorization': f'Bearer {user_token}'}
            
            # Submit 3 requests
            pdf_bytes = create_minimal_pdf()
            submitted_ids = []
            
            for i in range(3):
                files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
                data = {'class': 'Class I', 'subject': 'Mathematics', 'examName': f'Test {i+1}', 'language': 'Odia'}
                resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
                
                print(f"  Submit {i+1}: {resp.status_code}")
                
                if i < 2:
                    # First 2 should succeed
                    if resp.status_code == 200:
                        req_id = resp.json().get('id')
                        submitted_ids.append(req_id)
                        test_requests.append(req_id)
                        print(f"    ✅ Request {i+1} submitted: {req_id}")
                    else:
                        print(f"    ❌ Request {i+1} failed: {resp.text}")
                else:
                    # 3rd should fail with 429
                    if resp.status_code == 429:
                        resp_data = resp.json()
                        code = resp_data.get('code')
                        message = resp_data.get('error', '')
                        print(f"    ✅ 3rd request blocked: code={code}, message={message[:50]}...")
                        log_test(6, "LIMITS", True, f"3rd submit → 429 {code} with clear message")
                    else:
                        log_test(6, "LIMITS", False, f"3rd submit returned {resp.status_code} instead of 429")
    
    except Exception as e:
        log_test(6, "LIMITS", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 8: PHOTOS COMBINE (3-4 JPEGs → PDF, questionPageCount reflects combined pages)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 8: PHOTOS COMBINE")
    print("=" * 80)
    
    try:
        user_id, user_token = create_test_user(80001)
        if not user_token:
            log_test(8, "PHOTOS COMBINE", False, "Failed to create test user")
        else:
            user_headers = {'Authorization': f'Bearer {user_token}'}
            
            # Create 3 tiny JPEGs
            jpeg1 = create_tiny_jpeg()
            jpeg2 = create_tiny_jpeg()
            jpeg3 = create_tiny_jpeg()
            
            files = [
                ('files', ('photo1.jpg', BytesIO(jpeg1), 'image/jpeg')),
                ('files', ('photo2.jpg', BytesIO(jpeg2), 'image/jpeg')),
                ('files', ('photo3.jpg', BytesIO(jpeg3), 'image/jpeg'))
            ]
            data = {'class': 'Class II', 'subject': 'Science', 'examName': 'Photo Test', 'language': 'Odia'}
            
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=20)
            print(f"Submit 3 JPEGs: {resp.status_code}")
            
            if resp.status_code == 200:
                resp_data = resp.json()
                req_id = resp_data.get('id')
                test_requests.append(req_id)
                item = resp_data.get('item', {})
                page_count = item.get('questionPageCount')
                
                print(f"  Request ID: {req_id}")
                print(f"  questionPageCount: {page_count}")
                
                # Admin download question-file to verify it's a PDF
                resp_admin = requests.get(f"{API_URL}/admin/answer-key/{req_id}/question-file",
                                         headers=admin_headers, timeout=15)
                print(f"  Admin GET question-file: {resp_admin.status_code}")
                
                if resp_admin.status_code == 200:
                    content_type = resp_admin.headers.get('Content-Type', '')
                    pdf_bytes = resp_admin.content
                    is_pdf = content_type == 'application/pdf' and pdf_bytes.startswith(b'%PDF')
                    
                    print(f"  Content-Type: {content_type}")
                    print(f"  Is PDF: {is_pdf}")
                    print(f"  Size: {len(pdf_bytes)} bytes")
                    
                    if page_count >= 3 and is_pdf:
                        log_test(8, "PHOTOS COMBINE", True, f"3 JPEGs → {page_count}-page PDF, admin can download")
                    else:
                        log_test(8, "PHOTOS COMBINE", False, f"questionPageCount={page_count} (expected >=3) or not PDF")
                else:
                    log_test(8, "PHOTOS COMBINE", False, f"Admin question-file returned {resp_admin.status_code}")
            else:
                log_test(8, "PHOTOS COMBINE", False, f"Submit failed: {resp.status_code} {resp.text}")
    
    except Exception as e:
        log_test(8, "PHOTOS COMBINE", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 9: ADMIN FLOW (queue → start → upload-key → preview)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 9: ADMIN FLOW")
    print("=" * 80)
    
    try:
        user_id, user_token = create_test_user(90001)
        if not user_token:
            log_test(9, "ADMIN FLOW", False, "Failed to create test user")
        else:
            user_headers = {'Authorization': f'Bearer {user_token}'}
            
            # Submit request
            pdf_bytes = create_minimal_pdf()
            files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
            data = {'class': 'Class III', 'subject': 'English', 'examName': 'Admin Flow Test', 'language': 'English'}
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
            
            if resp.status_code != 200:
                log_test(9, "ADMIN FLOW", False, f"Submit failed: {resp.status_code}")
            else:
                req_id = resp.json().get('id')
                test_requests.append(req_id)
                print(f"  Submitted: {req_id}")
                
                # Admin GET queue
                resp = requests.get(f"{API_URL}/admin/answer-key/queue", headers=admin_headers, timeout=10)
                print(f"  Admin GET queue: {resp.status_code}")
                
                if resp.status_code == 200:
                    items = resp.json().get('items', [])
                    found = any(item['id'] == req_id for item in items)
                    print(f"    Found in queue: {found}")
                    
                    if not found:
                        log_test(9, "ADMIN FLOW", False, "Request not found in queue")
                    else:
                        # Admin POST start
                        resp = requests.post(f"{API_URL}/admin/answer-key/{req_id}/start",
                                           headers=admin_headers, timeout=10)
                        print(f"  Admin POST start: {resp.status_code}")
                        
                        if resp.status_code != 200:
                            log_test(9, "ADMIN FLOW", False, f"Start failed: {resp.status_code}")
                        else:
                            # Admin POST upload-key
                            answer_pdf = create_minimal_pdf()
                            files = {'files': ('answer.pdf', BytesIO(answer_pdf), 'application/pdf')}
                            resp = requests.post(f"{API_URL}/admin/answer-key/{req_id}/upload-key",
                                               headers={'Authorization': f'Bearer {admin_token}'},
                                               files=files, timeout=20)
                            print(f"  Admin POST upload-key: {resp.status_code}")
                            
                            if resp.status_code != 200:
                                log_test(9, "ADMIN FLOW", False, f"Upload-key failed: {resp.status_code} {resp.text}")
                            else:
                                resp_data = resp.json()
                                price_inr = resp_data.get('priceInr')
                                print(f"    priceInr: {price_inr}")
                                
                                # Check status in DB
                                req_doc = db.answerKeyRequests.find_one({'id': req_id})
                                status = req_doc.get('status')
                                has_preview = bool(req_doc.get('previewImageRef'))
                                document_id = req_doc.get('documentId')
                                
                                print(f"    status: {status}")
                                print(f"    hasPreview: {has_preview}")
                                print(f"    documentId: {document_id}")
                                
                                # Owner GET preview
                                resp = requests.get(f"{API_URL}/answer-key/{req_id}/preview",
                                                  headers=user_headers, timeout=15)
                                print(f"  Owner GET preview: {resp.status_code}")
                                
                                if resp.status_code == 200:
                                    content_type = resp.headers.get('Content-Type', '')
                                    is_jpeg = content_type == 'image/jpeg'
                                    print(f"    Content-Type: {content_type}")
                                    
                                    if status == 'ready_locked' and price_inr == 29 and has_preview and document_id and is_jpeg:
                                        log_test(9, "ADMIN FLOW", True, f"status=ready_locked, priceInr=29, hasPreview=True, documentId set, preview returns image/jpeg")
                                    else:
                                        log_test(9, "ADMIN FLOW", False, f"status={status}, priceInr={price_inr}, hasPreview={has_preview}, documentId={document_id}, preview={content_type}")
                                else:
                                    log_test(9, "ADMIN FLOW", False, f"Preview returned {resp.status_code}")
                else:
                    log_test(9, "ADMIN FLOW", False, f"Queue returned {resp.status_code}")
    
    except Exception as e:
        log_test(9, "ADMIN FLOW", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 10: DOWNLOAD SECURITY (encrypted PDF, downloadCount, limit)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 10: DOWNLOAD SECURITY")
    print("=" * 80)
    
    try:
        user_id, user_token = create_test_user(100001)
        if not user_token:
            log_test(10, "DOWNLOAD SECURITY", False, "Failed to create test user")
        else:
            user_headers = {'Authorization': f'Bearer {user_token}'}
            
            # Submit + admin process
            pdf_bytes = create_minimal_pdf()
            files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
            data = {'class': 'Class IV', 'subject': 'Mathematics', 'examName': 'Download Test', 'language': 'Odia'}
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
            
            if resp.status_code != 200:
                log_test(10, "DOWNLOAD SECURITY", False, f"Submit failed: {resp.status_code}")
            else:
                req_id = resp.json().get('id')
                test_requests.append(req_id)
                print(f"  Submitted: {req_id}")
                
                # Admin start + upload-key
                requests.post(f"{API_URL}/admin/answer-key/{req_id}/start", headers=admin_headers, timeout=10)
                answer_pdf = create_minimal_pdf()
                files = {'files': ('answer.pdf', BytesIO(answer_pdf), 'application/pdf')}
                resp = requests.post(f"{API_URL}/admin/answer-key/{req_id}/upload-key",
                                   headers={'Authorization': f'Bearer {admin_token}'},
                                   files=files, timeout=20)
                print(f"  Admin upload-key: {resp.status_code}")
                
                if resp.status_code != 200:
                    log_test(10, "DOWNLOAD SECURITY", False, f"Upload-key failed: {resp.status_code}")
                else:
                    # Checkout
                    resp = requests.post(f"{API_URL}/answer-key/{req_id}/checkout",
                                       headers=user_headers, json={}, timeout=10)
                    print(f"  Checkout: {resp.status_code}")
                    
                    if resp.status_code != 200:
                        log_test(10, "DOWNLOAD SECURITY", False, f"Checkout failed: {resp.status_code}")
                    else:
                        order_id = resp.json().get('orderId')
                        print(f"    orderId: {order_id}")
                        
                        # Verify (simulated payment)
                        fake_payment_id = f"pay_test_{uuid.uuid4().hex[:16]}"
                        signature = compute_razorpay_signature(order_id, fake_payment_id)
                        
                        resp = requests.post(f"{API_URL}/answer-key/{req_id}/verify",
                                           headers=user_headers,
                                           json={
                                               'razorpay_order_id': order_id,
                                               'razorpay_payment_id': fake_payment_id,
                                               'razorpay_signature': signature
                                           }, timeout=10)
                        print(f"  Verify: {resp.status_code}")
                        
                        if resp.status_code != 200:
                            log_test(10, "DOWNLOAD SECURITY", False, f"Verify failed: {resp.status_code} {resp.text}")
                        else:
                            print(f"    Unlocked: {resp.json()}")
                            
                            # Set downloadsPerKey=2
                            requests.put(f"{API_URL}/admin/answer-key/settings",
                                       headers=admin_headers,
                                       json={'downloadsPerKey': 2}, timeout=10)
                            print(f"  Set downloadsPerKey=2")
                            
                            # Download 1
                            resp = requests.post(f"{API_URL}/answer-key/{req_id}/download-token",
                                               headers=user_headers, json={}, timeout=10)
                            print(f"  Download-token 1: {resp.status_code}")
                            
                            if resp.status_code != 200:
                                log_test(10, "DOWNLOAD SECURITY", False, f"Download-token failed: {resp.status_code} {resp.text}")
                            else:
                                token1 = resp.json().get('token')
                                print(f"    token: {token1[:30]}...")
                                
                                resp = requests.get(f"{API_URL}/answer-key/download?token={token1}",
                                                  headers=user_headers, timeout=15)
                                print(f"  Download 1: {resp.status_code}")
                                
                                if resp.status_code != 200:
                                    log_test(10, "DOWNLOAD SECURITY", False, f"Download 1 failed: {resp.status_code}")
                                else:
                                    pdf1 = resp.content
                                    content_type = resp.headers.get('Content-Type', '')
                                    is_pdf = content_type == 'application/pdf'
                                    has_encrypt = check_pdf_encrypted(pdf1)
                                    
                                    print(f"    Content-Type: {content_type}")
                                    print(f"    Size: {len(pdf1)} bytes")
                                    print(f"    Has /Encrypt: {has_encrypt}")
                                    
                                    # Check downloadCount
                                    req_doc = db.answerKeyRequests.find_one({'id': req_id})
                                    download_count_1 = req_doc.get('downloadCount', 0)
                                    print(f"    downloadCount after 1st: {download_count_1}")
                                    
                                    # Download 2
                                    resp = requests.post(f"{API_URL}/answer-key/{req_id}/download-token",
                                                       headers=user_headers, json={}, timeout=10)
                                    if resp.status_code == 200:
                                        token2 = resp.json().get('token')
                                        resp = requests.get(f"{API_URL}/answer-key/download?token={token2}",
                                                          headers=user_headers, timeout=15)
                                        print(f"  Download 2: {resp.status_code}")
                                        
                                        if resp.status_code == 200:
                                            req_doc = db.answerKeyRequests.find_one({'id': req_id})
                                            download_count_2 = req_doc.get('downloadCount', 0)
                                            print(f"    downloadCount after 2nd: {download_count_2}")
                                            
                                            # Try 3rd download (should fail with 429)
                                            resp = requests.post(f"{API_URL}/answer-key/{req_id}/download-token",
                                                               headers=user_headers, json={}, timeout=10)
                                            print(f"  Download-token 3: {resp.status_code}")
                                            
                                            if resp.status_code == 429:
                                                print(f"    ✅ 3rd download blocked with 429")
                                                
                                                if is_pdf and has_encrypt and download_count_1 == 1 and download_count_2 == 2:
                                                    log_test(10, "DOWNLOAD SECURITY", True, 
                                                           f"PDF encrypted (/Encrypt present), downloadCount increments (1→2), downloadsPerKey=2 enforced (3rd → 429)")
                                                else:
                                                    log_test(10, "DOWNLOAD SECURITY", False,
                                                           f"is_pdf={is_pdf}, has_encrypt={has_encrypt}, counts={download_count_1},{download_count_2}")
                                            else:
                                                log_test(10, "DOWNLOAD SECURITY", False, f"3rd download-token returned {resp.status_code} instead of 429")
    
    except Exception as e:
        log_test(10, "DOWNLOAD SECURITY", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 11: REPLACE AFTER UNLOCK
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 11: REPLACE AFTER UNLOCK")
    print("=" * 80)
    
    try:
        user_id, user_token = create_test_user(110001)
        if not user_token:
            log_test(11, "REPLACE AFTER UNLOCK", False, "Failed to create test user")
        else:
            user_headers = {'Authorization': f'Bearer {user_token}'}
            
            # Submit + admin process + unlock
            pdf_bytes = create_minimal_pdf()
            files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
            data = {'class': 'Class V', 'subject': 'Science', 'examName': 'Replace Test', 'language': 'Odia'}
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
            
            if resp.status_code != 200:
                log_test(11, "REPLACE AFTER UNLOCK", False, f"Submit failed: {resp.status_code}")
            else:
                req_id = resp.json().get('id')
                test_requests.append(req_id)
                print(f"  Submitted: {req_id}")
                
                # Admin start + upload-key
                requests.post(f"{API_URL}/admin/answer-key/{req_id}/start", headers=admin_headers, timeout=10)
                answer_pdf = create_minimal_pdf()
                files = {'files': ('answer.pdf', BytesIO(answer_pdf), 'application/pdf')}
                requests.post(f"{API_URL}/admin/answer-key/{req_id}/upload-key",
                            headers={'Authorization': f'Bearer {admin_token}'},
                            files=files, timeout=20)
                
                # Checkout + verify
                resp = requests.post(f"{API_URL}/answer-key/{req_id}/checkout",
                                   headers=user_headers, json={}, timeout=10)
                order_id = resp.json().get('orderId')
                fake_payment_id = f"pay_test_{uuid.uuid4().hex[:16]}"
                signature = compute_razorpay_signature(order_id, fake_payment_id)
                requests.post(f"{API_URL}/answer-key/{req_id}/verify",
                            headers=user_headers,
                            json={
                                'razorpay_order_id': order_id,
                                'razorpay_payment_id': fake_payment_id,
                                'razorpay_signature': signature
                            }, timeout=10)
                print(f"  Unlocked")
                
                # Get initial state
                req_doc = db.answerKeyRequests.find_one({'id': req_id})
                version_before = req_doc.get('answerVersion', 0)
                status_before = req_doc.get('status')
                print(f"  Before replace: status={status_before}, answerVersion={version_before}")
                
                # Admin replace-key
                new_answer_pdf = create_minimal_pdf()
                files = {'files': ('answer_v2.pdf', BytesIO(new_answer_pdf), 'application/pdf')}
                resp = requests.post(f"{API_URL}/admin/answer-key/{req_id}/replace-key",
                                   headers={'Authorization': f'Bearer {admin_token}'},
                                   files=files, timeout=20)
                print(f"  Admin replace-key: {resp.status_code}")
                
                if resp.status_code != 200:
                    log_test(11, "REPLACE AFTER UNLOCK", False, f"Replace-key failed: {resp.status_code} {resp.text}")
                else:
                    # Check state after replace
                    req_doc = db.answerKeyRequests.find_one({'id': req_id})
                    version_after = req_doc.get('answerVersion', 0)
                    status_after = req_doc.get('status')
                    
                    print(f"  After replace: status={status_after}, answerVersion={version_after}")
                    
                    # Check no new payment created
                    payment_count = db.payments.count_documents({'answerKeyId': req_id, 'product': 'answer_key'})
                    print(f"  Payment count: {payment_count}")
                    
                    if status_after == 'unlocked' and version_after == version_before + 1 and payment_count == 1:
                        log_test(11, "REPLACE AFTER UNLOCK", True,
                               f"status stays 'unlocked', answerVersion {version_before}→{version_after}, no new payment (count={payment_count})")
                    else:
                        log_test(11, "REPLACE AFTER UNLOCK", False,
                               f"status={status_after}, version={version_before}→{version_after}, payments={payment_count}")
    
    except Exception as e:
        log_test(11, "REPLACE AFTER UNLOCK", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 12: ATTACH-EXISTING (different user, separate publicId)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 12: ATTACH-EXISTING")
    print("=" * 80)
    
    try:
        # Create source user + request
        source_user_id, source_token = create_test_user(120001)
        target_user_id, target_token = create_test_user(120002)
        
        if not source_token or not target_token:
            log_test(12, "ATTACH-EXISTING", False, "Failed to create test users")
        else:
            source_headers = {'Authorization': f'Bearer {source_token}'}
            target_headers = {'Authorization': f'Bearer {target_token}'}
            
            # Source user submits
            pdf_bytes = create_minimal_pdf()
            files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
            data = {'class': 'Class VI', 'subject': 'English', 'examName': 'Source', 'language': 'English'}
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=source_headers, files=files, data=data, timeout=15)
            
            if resp.status_code != 200:
                log_test(12, "ATTACH-EXISTING", False, f"Source submit failed: {resp.status_code}")
            else:
                source_req_id = resp.json().get('id')
                test_requests.append(source_req_id)
                print(f"  Source request: {source_req_id}")
                
                # Admin process source
                requests.post(f"{API_URL}/admin/answer-key/{source_req_id}/start", headers=admin_headers, timeout=10)
                answer_pdf = create_minimal_pdf()
                files = {'files': ('answer.pdf', BytesIO(answer_pdf), 'application/pdf')}
                requests.post(f"{API_URL}/admin/answer-key/{source_req_id}/upload-key",
                            headers={'Authorization': f'Bearer {admin_token}'},
                            files=files, timeout=20)
                print(f"  Source processed")
                
                # Get source publicId
                source_doc = db.answerKeyRequests.find_one({'id': source_req_id})
                source_public_id = source_doc.get('answerFileRef', {}).get('publicId')
                print(f"  Source publicId: {source_public_id}")
                
                # Target user submits
                files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
                data = {'class': 'Class VI', 'subject': 'English', 'examName': 'Target', 'language': 'English'}
                resp = requests.post(f"{API_URL}/answer-key/submit", headers=target_headers, files=files, data=data, timeout=15)
                
                if resp.status_code != 200:
                    log_test(12, "ATTACH-EXISTING", False, f"Target submit failed: {resp.status_code}")
                else:
                    target_req_id = resp.json().get('id')
                    test_requests.append(target_req_id)
                    print(f"  Target request: {target_req_id}")
                    
                    # Admin attach-existing
                    resp = requests.post(f"{API_URL}/admin/answer-key/{target_req_id}/attach-existing",
                                       headers=admin_headers,
                                       json={'sourceRequestId': source_req_id}, timeout=20)
                    print(f"  Admin attach-existing: {resp.status_code}")
                    
                    if resp.status_code != 200:
                        log_test(12, "ATTACH-EXISTING", False, f"Attach-existing failed: {resp.status_code} {resp.text}")
                    else:
                        # Check target publicId
                        target_doc = db.answerKeyRequests.find_one({'id': target_req_id})
                        target_public_id = target_doc.get('answerFileRef', {}).get('publicId')
                        target_status = target_doc.get('status')
                        
                        print(f"  Target publicId: {target_public_id}")
                        print(f"  Target status: {target_status}")
                        
                        # Check source unchanged
                        source_doc_after = db.answerKeyRequests.find_one({'id': source_req_id})
                        source_public_id_after = source_doc_after.get('answerFileRef', {}).get('publicId')
                        
                        print(f"  Source publicId after: {source_public_id_after}")
                        
                        if (target_public_id and source_public_id and 
                            target_public_id != source_public_id and 
                            target_status == 'ready_locked' and
                            source_public_id_after == source_public_id):
                            log_test(12, "ATTACH-EXISTING", True,
                                   f"Target publicId ({target_public_id[:30]}...) differs from source ({source_public_id[:30]}...), target status=ready_locked, source unchanged")
                        else:
                            log_test(12, "ATTACH-EXISTING", False,
                                   f"target_publicId={target_public_id}, source_publicId={source_public_id}, same={target_public_id==source_public_id}, target_status={target_status}")
    
    except Exception as e:
        log_test(12, "ATTACH-EXISTING", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 13: REJECT (requires reason, status=rejected, rejectReason stored)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 13: REJECT")
    print("=" * 80)
    
    try:
        user_id, user_token = create_test_user(130001)
        if not user_token:
            log_test(13, "REJECT", False, "Failed to create test user")
        else:
            user_headers = {'Authorization': f'Bearer {user_token}'}
            
            # Submit 2 requests
            pdf_bytes = create_minimal_pdf()
            
            # Request 1: reject without reason
            files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
            data = {'class': 'Class VII', 'subject': 'Mathematics', 'examName': 'Reject Test 1', 'language': 'Odia'}
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
            req_id_1 = resp.json().get('id')
            test_requests.append(req_id_1)
            print(f"  Request 1: {req_id_1}")
            
            # Admin reject without reason
            resp = requests.post(f"{API_URL}/admin/answer-key/{req_id_1}/reject",
                               headers=admin_headers,
                               json={}, timeout=10)
            print(f"  Reject without reason: {resp.status_code}")
            
            if resp.status_code == 400:
                print(f"    ✅ Correctly rejected with 400")
                reject_without_reason_ok = True
            else:
                print(f"    ❌ Expected 400, got {resp.status_code}")
                reject_without_reason_ok = False
            
            # Request 2: reject with reason
            files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
            data = {'class': 'Class VII', 'subject': 'Science', 'examName': 'Reject Test 2', 'language': 'Odia'}
            resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
            req_id_2 = resp.json().get('id')
            test_requests.append(req_id_2)
            print(f"  Request 2: {req_id_2}")
            
            # Admin reject with reason
            reason_text = "Question paper is not clear"
            resp = requests.post(f"{API_URL}/admin/answer-key/{req_id_2}/reject",
                               headers=admin_headers,
                               json={'reason': reason_text}, timeout=10)
            print(f"  Reject with reason: {resp.status_code}")
            
            if resp.status_code == 200:
                # Check status and rejectReason in DB
                req_doc = db.answerKeyRequests.find_one({'id': req_id_2})
                status = req_doc.get('status')
                reject_reason = req_doc.get('rejectReason')
                
                print(f"    status: {status}")
                print(f"    rejectReason: {reject_reason}")
                
                # Check answerKeyLogs for ADMIN_REJECT entry
                log_entry = db.answerKeyLogs.find_one({'requestId': req_id_2, 'action': 'ADMIN_REJECT'})
                has_log = bool(log_entry)
                print(f"    ADMIN_REJECT log entry: {has_log}")
                
                if reject_without_reason_ok and status == 'rejected' and reject_reason == reason_text and has_log:
                    log_test(13, "REJECT", True,
                           f"Reject without reason → 400, with reason → status=rejected, rejectReason stored, ADMIN_REJECT log entry exists")
                else:
                    log_test(13, "REJECT", False,
                           f"reject_without_reason_ok={reject_without_reason_ok}, status={status}, rejectReason={reject_reason}, has_log={has_log}")
            else:
                log_test(13, "REJECT", False, f"Reject with reason returned {resp.status_code}")
    
    except Exception as e:
        log_test(13, "REJECT", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # CLEANUP
    # ========================================================================
    print("\n" + "=" * 80)
    print("CLEANUP")
    print("=" * 80)
    
    try:
        # Delete test requests
        deleted_requests = db.answerKeyRequests.delete_many({'id': {'$in': test_requests}}).deleted_count
        print(f"Deleted answerKeyRequests: {deleted_requests}")
        
        # Delete logs
        deleted_logs = db.answerKeyLogs.delete_many({'requestId': {'$in': test_requests}}).deleted_count
        print(f"Deleted answerKeyLogs: {deleted_logs}")
        
        # Delete payments
        deleted_payments = db.payments.delete_many({'product': 'answer_key', 'answerKeyId': {'$in': test_requests}}).deleted_count
        print(f"Deleted payments (product=answer_key): {deleted_payments}")
        
        # Delete test users
        test_user_ids = [u['id'] for u in test_users]
        deleted_users = db.users.delete_many({'id': {'$in': test_user_ids}}).deleted_count
        print(f"Deleted test users: {deleted_users}")
        
        # Disable feature
        resp = requests.put(f"{API_URL}/admin/answer-key/settings",
                           headers=admin_headers,
                           json={'enabled': False}, timeout=10)
        print(f"Disabled feature: {resp.status_code}")
        
    except Exception as e:
        print(f"Cleanup error: {e}")
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for t in test_results if t['passed'])
    total = len(test_results)
    
    print(f"\nTests Passed: {passed}/{total}")
    print("\nDetailed Results:")
    print("-" * 80)
    
    for t in test_results:
        status = '✅ PASS' if t['passed'] else '❌ FAIL'
        print(f"{status} | Test {t['num']}: {t['name']}")
        if t['details']:
            print(f"       {t['details']}")
    
    print("\n" + "=" * 80)
    print(f"CLEANUP SUMMARY:")
    print(f"  - Deleted {deleted_requests} answerKeyRequests")
    print(f"  - Deleted {deleted_logs} answerKeyLogs")
    print(f"  - Deleted {deleted_payments} payments (product=answer_key)")
    print(f"  - Deleted {deleted_users} test users")
    print(f"  - Feature disabled: settings.enabled=false")
    print("=" * 80)

if __name__ == '__main__':
    main()
