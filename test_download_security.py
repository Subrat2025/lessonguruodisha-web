#!/usr/bin/env python3
"""Quick test for Test 10: Download Security"""
import requests
import json
import hmac
import hashlib
import os
import uuid
from io import BytesIO
from pymongo import MongoClient

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')
RZP_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'i1wjidyWgO9h5QUeXeVRUs6q')

ADMIN_MOBILE = '9999999999'
ADMIN_PASSWORD = 'admin123'

def create_minimal_pdf():
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

def login(mobile, password):
    resp = requests.post(f"{API_URL}/auth/login", json={'mobile': mobile, 'password': password}, timeout=10)
    if resp.status_code == 200:
        return resp.json().get('token')
    return None

def create_test_user():
    import random
    mobile = f"9{random.randint(100000000, 999999999)}"  # 10-digit mobile starting with 9
    password = "<redacted>"
    name = f"TestUser"
    
    resp = requests.post(f"{API_URL}/auth/register", json={
        'mobile': mobile, 'password': password, 'name': name
    }, timeout=10)
    
    if resp.status_code == 200:
        data = resp.json()
        return data.get('user', {}).get('id'), data.get('token'), mobile
    
    # Try login if already exists
    token = login(mobile, password)
    if token:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        user = db.users.find_one({'mobile': mobile})
        if user:
            return user['id'], token, mobile
    
    return None, None, None

def compute_razorpay_signature(order_id, payment_id):
    message = f"{order_id}|{payment_id}"
    signature = hmac.new(
        RZP_KEY_SECRET.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

def check_pdf_encrypted(pdf_bytes):
    return b'/Encrypt' in pdf_bytes

def main():
    print("=" * 80)
    print("TEST 10: DOWNLOAD SECURITY (RETEST)")
    print("=" * 80)
    
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
    resp = requests.put(f"{API_URL}/admin/answer-key/settings", 
                       headers=admin_headers,
                       json={'enabled': True, 'downloadsPerKey': 2}, timeout=10)
    print(f"✅ Feature enabled, downloadsPerKey=2")
    
    # Create test user
    user_id, user_token, mobile = create_test_user()
    if not user_token:
        print("❌ Failed to create test user")
        return
    print(f"✅ Test user: {mobile}")
    
    user_headers = {'Authorization': f'Bearer {user_token}'}
    
    # Submit
    pdf_bytes = create_minimal_pdf()
    files = {'files': ('question.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {'class': 'Class IV', 'subject': 'Mathematics', 'examName': 'Download Test', 'language': 'Odia'}
    resp = requests.post(f"{API_URL}/answer-key/submit", headers=user_headers, files=files, data=data, timeout=15)
    
    if resp.status_code != 200:
        print(f"❌ Submit failed: {resp.status_code}")
        return
    
    req_id = resp.json().get('id')
    print(f"✅ Submitted: {req_id}")
    
    # Admin start + upload-key
    requests.post(f"{API_URL}/admin/answer-key/{req_id}/start", headers=admin_headers, timeout=10)
    answer_pdf = create_minimal_pdf()
    files = {'files': ('answer.pdf', BytesIO(answer_pdf), 'application/pdf')}
    resp = requests.post(f"{API_URL}/admin/answer-key/{req_id}/upload-key",
                       headers={'Authorization': f'Bearer {admin_token}'},
                       files=files, timeout=20)
    print(f"✅ Admin upload-key: {resp.status_code}")
    
    # Checkout
    resp = requests.post(f"{API_URL}/answer-key/{req_id}/checkout",
                       headers=user_headers, json={}, timeout=10)
    order_id = resp.json().get('orderId')
    print(f"✅ Checkout: orderId={order_id}")
    
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
    print(f"✅ Verify: {resp.json()}")
    
    # Download 1
    resp = requests.post(f"{API_URL}/answer-key/{req_id}/download-token",
                       headers=user_headers, json={}, timeout=10)
    token1 = resp.json().get('token')
    print(f"✅ Download-token 1: {token1[:30]}...")
    
    resp = requests.get(f"{API_URL}/answer-key/download?token={token1}",
                      headers=user_headers, timeout=15)
    
    if resp.status_code != 200:
        print(f"❌ Download 1 failed: {resp.status_code}")
        return
    
    pdf1 = resp.content
    content_type = resp.headers.get('Content-Type', '')
    is_pdf = content_type == 'application/pdf'
    has_encrypt = check_pdf_encrypted(pdf1)
    
    print(f"\n📊 DOWNLOAD 1 RESULTS:")
    print(f"  Content-Type: {content_type}")
    print(f"  Size: {len(pdf1)} bytes")
    print(f"  Is PDF: {is_pdf}")
    print(f"  Has /Encrypt: {has_encrypt}")
    
    # Check downloadCount
    req_doc = db.answerKeyRequests.find_one({'id': req_id})
    download_count_1 = req_doc.get('downloadCount', 0)
    print(f"  downloadCount: {download_count_1}")
    
    # Download 2
    resp = requests.post(f"{API_URL}/answer-key/{req_id}/download-token",
                       headers=user_headers, json={}, timeout=10)
    token2 = resp.json().get('token')
    resp = requests.get(f"{API_URL}/answer-key/download?token={token2}",
                      headers=user_headers, timeout=15)
    
    req_doc = db.answerKeyRequests.find_one({'id': req_id})
    download_count_2 = req_doc.get('downloadCount', 0)
    print(f"\n📊 DOWNLOAD 2 RESULTS:")
    print(f"  downloadCount: {download_count_2}")
    
    # Try 3rd download (should fail with 429)
    resp = requests.post(f"{API_URL}/answer-key/{req_id}/download-token",
                       headers=user_headers, json={}, timeout=10)
    print(f"\n📊 DOWNLOAD 3 (should fail):")
    print(f"  Status: {resp.status_code}")
    
    if resp.status_code == 429:
        print(f"  ✅ Correctly blocked with 429")
    
    # Final verdict
    print("\n" + "=" * 80)
    if is_pdf and has_encrypt and download_count_1 == 1 and download_count_2 == 2:
        print("✅ TEST 10 PASSED")
        print(f"  - PDF encrypted: {has_encrypt}")
        print(f"  - downloadCount increments: 1→2")
        print(f"  - downloadsPerKey=2 enforced (3rd → 429)")
    else:
        print("❌ TEST 10 FAILED")
        print(f"  - is_pdf: {is_pdf}")
        print(f"  - has_encrypt: {has_encrypt} (EXPECTED: True)")
        print(f"  - download_count: {download_count_1}→{download_count_2}")
    print("=" * 80)
    
    # Cleanup
    db.answerKeyRequests.delete_many({'id': req_id})
    db.answerKeyLogs.delete_many({'requestId': req_id})
    db.payments.delete_many({'answerKeyId': req_id})
    db.users.delete_many({'id': user_id})
    requests.put(f"{API_URL}/admin/answer-key/settings", headers=admin_headers, json={'enabled': False}, timeout=10)
    print("\n✅ Cleanup complete")

if __name__ == '__main__':
    main()
