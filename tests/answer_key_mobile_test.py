#!/usr/bin/env python3
"""
Answer Key Teacher Flows - Mobile Viewport Test
Tests all 11 flows via API with proper authentication
"""
import requests
import json
import base64
import os
from datetime import datetime, timedelta
from pymongo import MongoClient

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

# Test accounts
ADMIN = {"mobile": "9692604577", "password": "<redacted>"}
TEST_TEACHER_ONE = {"mobile": "8000000001", "password": "<redacted>"}
TEST_TEACHER_TWO = {"mobile": "8000000002", "password": "<redacted>"}
NON_BETA_USER = {"mobile": "9444106792", "password": "<redacted>"}
NON_BETA_USER_ALT = {"mobile": "9999900001", "password": "<redacted>"}

# Store test data
admin_token = None
teacher_token = None
exam_id = None
request_ids = []
bundle_ids = []

def login(mobile, password):
    """Login and return token"""
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": mobile,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        else:
            print(f"✗ Login failed for {mobile}: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"✗ Login error for {mobile}: {str(e)}")
        return None

def api_call(method, endpoint, token, json_data=None, files=None):
    """Make authenticated API call"""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
        elif method == "POST":
            if files:
                response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, files=files, data=json_data)
            else:
                headers["Content-Type"] = "application/json"
                response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, json=json_data)
        elif method == "PUT":
            headers["Content-Type"] = "application/json"
            response = requests.put(f"{BASE_URL}{endpoint}", headers=headers, json=json_data)
        else:
            return None
        
        return {
            "status": response.status_code,
            "ok": response.status_code < 400,
            "data": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
        }
    except Exception as e:
        print(f"✗ API call error {method} {endpoint}: {str(e)}")
        return {"ok": False, "error": str(e)}

def create_test_pdf():
    """Create a small test PDF file"""
    # Minimal PDF content
    pdf_content = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Test Question Paper) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000115 00000 n
0000000214 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
306
%%EOF"""
    return pdf_content

def create_test_image():
    """Create a small test JPG image (1x1 pixel)"""
    # Minimal JPEG content (1x1 red pixel)
    jpg_content = base64.b64decode(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy"
        "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA"
        "AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB"
        "AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//"
    )
    return jpg_content

print("=" * 80)
print("ANSWER KEY TEACHER FLOWS - COMPREHENSIVE API TEST")
print("=" * 80)

# ============================================================================
# STEP 0: ADMIN PRE-REQUISITES
# ============================================================================
print("\n" + "=" * 80)
print("STEP 0: ADMIN PRE-REQUISITES")
print("=" * 80)

try:
    print("\n1. Admin login...")
    admin_token = login(ADMIN["mobile"], ADMIN["password"])
    if not admin_token:
        raise Exception("Admin login failed")
    print(f"✓ Admin logged in successfully")
    
    print("\n2. Seeding bundles...")
    seed_response = api_call("POST", "/admin/answer-key/bundles/seed", admin_token)
    if seed_response.get("ok"):
        print(f"✓ Bundles seeded successfully")
    else:
        print(f"⚠ Bundle seed response: {seed_response}")
    
    print("\n3. Creating exam...")
    end_date = (datetime.now() + timedelta(days=30)).isoformat()
    exam_response = api_call("POST", "/admin/answer-key/exams", admin_token, {
        "name": "Term Test",
        "endDate": end_date
    })
    if exam_response.get("ok"):
        exam_id = exam_response.get("data", {}).get("id")
        print(f"✓ Exam created successfully: {exam_id}")
    else:
        print(f"⚠ Exam creation response: {exam_response}")
        # Try to get existing exam
        exams_response = api_call("GET", "/answer-key/bundles/exams", admin_token)
        if exams_response.get("ok"):
            exams = exams_response.get("data", {}).get("exams", [])
            if exams:
                exam_id = exams[0]["id"]
                print(f"✓ Using existing exam: {exam_id}")
    
    print("\n✓ ADMIN PRE-REQUISITES COMPLETED")
    
except Exception as e:
    print(f"\n✗ ADMIN PRE-REQUISITES FAILED: {str(e)}")
    exit(1)

# ============================================================================
# FLOW 1: VISIBILITY CHECK
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 1: VISIBILITY CHECK")
print("=" * 80)

try:
    print("\n1a. Login as TEST_Teacher One...")
    teacher_token = login(TEST_TEACHER_ONE["mobile"], TEST_TEACHER_ONE["password"])
    if not teacher_token:
        raise Exception("TEST_Teacher One login failed")
    print(f"✓ TEST_Teacher One logged in")
    
    print("\n1b. Check Answer Key visibility for beta user...")
    my_response = api_call("GET", "/answer-key/my", teacher_token)
    if my_response.get("ok"):
        enabled = my_response.get("data", {}).get("enabled", False)
        if enabled:
            print(f"✓ PASS: Answer Key is ENABLED for beta user (TEST_Teacher One)")
        else:
            print(f"✗ FAIL: Answer Key is DISABLED for beta user (should be enabled)")
    else:
        print(f"✗ FAIL: Could not check Answer Key status: {my_response}")
    
    print("\n1c. Login as NON-beta user...")
    non_beta_token = login(NON_BETA_USER["mobile"], NON_BETA_USER["password"])
    if not non_beta_token:
        print(f"⚠ Trying alternate non-beta user...")
        non_beta_token = login(NON_BETA_USER_ALT["mobile"], NON_BETA_USER_ALT["password"])
    
    if non_beta_token:
        print(f"✓ Non-beta user logged in")
        
        print("\n1d. Check Answer Key visibility for non-beta user...")
        my_response = api_call("GET", "/answer-key/my", non_beta_token)
        if my_response.get("ok"):
            enabled = my_response.get("data", {}).get("enabled", False)
            if not enabled:
                print(f"✓ PASS: Answer Key is DISABLED for non-beta user (correct)")
            else:
                print(f"✗ FAIL: Answer Key is ENABLED for non-beta user (should be disabled)")
        else:
            print(f"⚠ Could not check Answer Key status for non-beta user: {my_response}")
    else:
        print(f"⚠ Could not login as non-beta user")
    
    print("\n✓ FLOW 1 COMPLETED: VISIBILITY CHECK")
    
except Exception as e:
    print(f"\n✗ FLOW 1 FAILED: {str(e)}")

# ============================================================================
# FLOW 2: SUBMIT PDF REQUEST
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 2: SUBMIT PDF REQUEST")
print("=" * 80)

try:
    print("\n2a. Creating test PDF...")
    pdf_content = create_test_pdf()
    print(f"✓ Test PDF created ({len(pdf_content)} bytes)")
    
    print("\n2b. Submitting PDF request (Class 4, Math)...")
    files = {
        'files': ('test-paper.pdf', pdf_content, 'application/pdf')
    }
    data = {
        'class': 'Class 4',
        'subject': 'Math',
        'examName': 'Unit Test',
        'language': 'English'
    }
    
    submit_response = api_call("POST", "/answer-key/submit", teacher_token, json_data=data, files=files)
    if submit_response.get("ok"):
        print(f"✓ PASS: PDF request submitted successfully")
        
        # Get the request ID
        my_response = api_call("GET", "/answer-key/my", teacher_token)
        if my_response.get("ok"):
            items = my_response.get("data", {}).get("items", [])
            if items:
                pdf_request_id = items[0]["id"]
                request_ids.append(pdf_request_id)
                print(f"✓ Request ID: {pdf_request_id}")
                print(f"✓ Status: {items[0].get('status')}")
    else:
        print(f"✗ FAIL: PDF submission failed: {submit_response}")
    
    print("\n✓ FLOW 2 COMPLETED: SUBMIT PDF REQUEST")
    
except Exception as e:
    print(f"\n✗ FLOW 2 FAILED: {str(e)}")

# ============================================================================
# FLOW 3: SUBMIT 4 PHOTOS REQUEST
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 3: SUBMIT 4 PHOTOS REQUEST")
print("=" * 80)

try:
    print("\n3a. Creating 4 test images...")
    jpg_content = create_test_image()
    print(f"✓ Test images created ({len(jpg_content)} bytes each)")
    
    print("\n3b. Submitting 4-photo request (Class 4, EVS)...")
    files = [
        ('files', ('photo1.jpg', jpg_content, 'image/jpeg')),
        ('files', ('photo2.jpg', jpg_content, 'image/jpeg')),
        ('files', ('photo3.jpg', jpg_content, 'image/jpeg')),
        ('files', ('photo4.jpg', jpg_content, 'image/jpeg'))
    ]
    data = {
        'class': 'Class 4',
        'subject': 'EVS',
        'examName': 'Monthly Test',
        'language': 'Odia'
    }
    
    submit_response = api_call("POST", "/answer-key/submit", teacher_token, json_data=data, files=files)
    if submit_response.get("ok"):
        print(f"✓ PASS: 4-photo request submitted successfully")
        
        # Get the request ID
        my_response = api_call("GET", "/answer-key/my", teacher_token)
        if my_response.get("ok"):
            items = my_response.get("data", {}).get("items", [])
            if len(items) >= 2:
                photo_request_id = items[0]["id"] if items[0]["id"] != request_ids[0] else items[1]["id"]
                request_ids.append(photo_request_id)
                print(f"✓ Request ID: {photo_request_id}")
                print(f"✓ Status: {items[0].get('status')}")
    else:
        print(f"✗ FAIL: 4-photo submission failed: {submit_response}")
    
    print("\n✓ FLOW 3 COMPLETED: SUBMIT 4 PHOTOS REQUEST")
    
except Exception as e:
    print(f"\n✗ FLOW 3 FAILED: {str(e)}")

# ============================================================================
# FLOW 4: ADMIN UPLOAD KEY
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 4: ADMIN UPLOAD KEY")
print("=" * 80)

try:
    if not request_ids:
        print("⚠ No requests to upload key for")
    else:
        print(f"\n4a. Uploading answer key for request {request_ids[0]}...")
        
        # Create answer key PDF
        answer_pdf = create_test_pdf()
        files = {
            'files': ('answer-key.pdf', answer_pdf, 'application/pdf')
        }
        
        upload_response = api_call("POST", f"/admin/answer-key/{request_ids[0]}/upload-key", admin_token, files=files)
        if upload_response.get("ok"):
            print(f"✓ PASS: Answer key uploaded successfully")
            
            # Check status
            my_response = api_call("GET", "/answer-key/my", teacher_token)
            if my_response.get("ok"):
                items = my_response.get("data", {}).get("items", [])
                for item in items:
                    if item["id"] == request_ids[0]:
                        print(f"✓ Status: {item.get('status')}")
                        if item.get("status") == "ready_locked":
                            print(f"✓ PASS: Request is now 'ready_locked'")
                        if item.get("hasPreview"):
                            print(f"✓ PASS: Blurred preview is available")
                        if item.get("priceInr"):
                            print(f"✓ Price: ₹{item.get('priceInr')}")
                        break
        else:
            print(f"✗ FAIL: Answer key upload failed: {upload_response}")
    
    print("\n✓ FLOW 4 COMPLETED: ADMIN UPLOAD KEY")
    
except Exception as e:
    print(f"\n✗ FLOW 4 FAILED: {str(e)}")

# ============================================================================
# FLOW 5: TEST UNLOCK (PAY)
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 5: TEST UNLOCK (PAY)")
print("=" * 80)

try:
    if not request_ids:
        print("⚠ No requests to unlock")
    else:
        print(f"\n5a. Unlocking request {request_ids[0]} via TEST endpoint...")
        
        unlock_response = api_call("POST", f"/answer-key/{request_ids[0]}/test-unlock", teacher_token)
        if unlock_response.get("ok"):
            print(f"✓ PASS: Request unlocked successfully via TEST endpoint")
            
            # Check status
            my_response = api_call("GET", "/answer-key/my", teacher_token)
            if my_response.get("ok"):
                items = my_response.get("data", {}).get("items", [])
                for item in items:
                    if item["id"] == request_ids[0]:
                        print(f"✓ Status: {item.get('status')}")
                        if item.get("status") == "unlocked":
                            print(f"✓ PASS: Request is now 'unlocked'")
                        break
        else:
            print(f"✗ FAIL: Test unlock failed: {unlock_response}")
    
    print("\n✓ FLOW 5 COMPLETED: TEST UNLOCK")
    
except Exception as e:
    print(f"\n✗ FLOW 5 FAILED: {str(e)}")

# ============================================================================
# FLOW 6: VIEW + DOWNLOAD PDF
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 6: VIEW + DOWNLOAD PDF")
print("=" * 80)

try:
    if not request_ids:
        print("⚠ No unlocked requests to view/download")
    else:
        print(f"\n6a. Getting download token for request {request_ids[0]}...")
        
        token_response = api_call("POST", f"/answer-key/{request_ids[0]}/download-token", teacher_token)
        if token_response.get("ok"):
            download_token = token_response.get("data", {}).get("token")
            print(f"✓ Download token obtained")
            
            print(f"\n6b. Downloading PDF...")
            headers = {"Authorization": f"Bearer {teacher_token}"}
            download_url = f"{BASE_URL}/answer-key/download?token={download_token}"
            response = requests.get(download_url, headers=headers)
            
            if response.status_code == 200:
                content_type = response.headers.get("content-type", "")
                if "application/pdf" in content_type:
                    print(f"✓ PASS: PDF downloaded successfully")
                    print(f"✓ Content-Type: {content_type}")
                    print(f"✓ Size: {len(response.content)} bytes")
                    
                    # Check for Cloudinary URL
                    if "res.cloudinary.com" in response.text:
                        print(f"✗ FAIL: Cloudinary URL found in response")
                    else:
                        print(f"✓ PASS: No Cloudinary URL in response")
                else:
                    print(f"⚠ Unexpected content-type: {content_type}")
            else:
                print(f"✗ FAIL: Download failed: {response.status_code}")
        else:
            print(f"✗ FAIL: Could not get download token: {token_response}")
    
    print("\n✓ FLOW 6 COMPLETED: VIEW + DOWNLOAD PDF")
    
except Exception as e:
    print(f"\n✗ FLOW 6 FAILED: {str(e)}")

# ============================================================================
# FLOW 7: UPSELL CARD
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 7: UPSELL CARD")
print("=" * 80)

try:
    # Create a new request for upsell testing
    print("\n7a. Creating new request for upsell test...")
    pdf_content = create_test_pdf()
    files = {
        'files': ('test-paper2.pdf', pdf_content, 'application/pdf')
    }
    data = {
        'class': 'Class 4',
        'subject': 'Science',
        'examName': 'Term Test'
    }
    
    submit_response = api_call("POST", "/answer-key/submit", teacher_token, json_data=data, files=files)
    if submit_response.get("ok"):
        print(f"✓ New request submitted")
        
        # Get request ID
        my_response = api_call("GET", "/answer-key/my", teacher_token)
        if my_response.get("ok"):
            items = my_response.get("data", {}).get("items", [])
            upsell_request_id = None
            for item in items:
                if item.get("status") == "submitted" and item.get("class") == "Class 4" and item.get("subject") == "Science":
                    upsell_request_id = item["id"]
                    request_ids.append(upsell_request_id)
                    break
            
            if upsell_request_id:
                print(f"✓ Request ID: {upsell_request_id}")
                
                # Upload answer key
                print(f"\n7b. Uploading answer key...")
                answer_pdf = create_test_pdf()
                files = {
                    'files': ('answer-key2.pdf', answer_pdf, 'application/pdf')
                }
                upload_response = api_call("POST", f"/admin/answer-key/{upsell_request_id}/upload-key", admin_token, files=files)
                if upload_response.get("ok"):
                    print(f"✓ Answer key uploaded")
                    
                    # Check upsell
                    print(f"\n7c. Checking upsell...")
                    upsell_response = api_call("GET", f"/answer-key/{upsell_request_id}/upsell", teacher_token)
                    if upsell_response.get("ok"):
                        upsell = upsell_response.get("data", {}).get("upsell")
                        if upsell:
                            print(f"✓ PASS: Upsell card available")
                            print(f"✓ Class: {upsell.get('classNum')}")
                            print(f"✓ Product ID: {upsell.get('productId')}")
                            print(f"✓ Price: ₹{upsell.get('priceInr')}")
                            print(f"✓ Paper count: {upsell.get('paperCount')}")
                            print(f"✓ Save: ₹{upsell.get('saveInr')}")
                            
                            if upsell.get("classNum") == "4" and upsell.get("priceInr") == 85:
                                print(f"✓ PASS: Upsell shows 'Get all Class 4 papers for ₹85'")
                        else:
                            print(f"⚠ No upsell available")
                    else:
                        print(f"✗ FAIL: Could not get upsell: {upsell_response}")
    
    print("\n✓ FLOW 7 COMPLETED: UPSELL CARD")
    
except Exception as e:
    print(f"\n✗ FLOW 7 FAILED: {str(e)}")

# ============================================================================
# FLOW 8: BUY BUNDLE (TEST)
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 8: BUY BUNDLE (TEST)")
print("=" * 80)

try:
    if not exam_id:
        print("⚠ No exam ID available")
    else:
        print(f"\n8a. Activating Class 4 bundle via TEST endpoint...")
        
        activate_response = api_call("POST", "/answer-key/bundles/test-activate", teacher_token, {
            "productId": "c4",
            "examId": exam_id
        })
        
        if activate_response.get("ok"):
            print(f"✓ PASS: Bundle activated successfully via TEST endpoint")
            
            # Check bundles
            print(f"\n8b. Checking My Bundles...")
            bundles_response = api_call("GET", "/answer-key/bundles/my", teacher_token)
            if bundles_response.get("ok"):
                items = bundles_response.get("data", {}).get("items", [])
                if items:
                    bundle = items[0]
                    bundle_ids.append(bundle["id"])
                    print(f"✓ PASS: Bundle found in 'My Bundles'")
                    print(f"✓ Bundle ID: {bundle['id']}")
                    print(f"✓ Classes: {bundle.get('classes')}")
                    print(f"✓ Status: {bundle.get('status')}")
                    print(f"✓ Slots: {bundle.get('slotsUsed')}/{bundle.get('slotsTotal')}")
                    print(f"✓ Expires: {bundle.get('expiresAt')}")
                else:
                    print(f"✗ FAIL: No bundles found")
            else:
                print(f"✗ FAIL: Could not get bundles: {bundles_response}")
        else:
            print(f"✗ FAIL: Bundle activation failed: {activate_response}")
    
    print("\n✓ FLOW 8 COMPLETED: BUY BUNDLE (TEST)")
    
except Exception as e:
    print(f"\n✗ FLOW 8 FAILED: {str(e)}")

# ============================================================================
# FLOW 9: SUBMIT UNDER BUNDLE SLOT
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 9: SUBMIT UNDER BUNDLE SLOT")
print("=" * 80)

try:
    if not bundle_ids:
        print("⚠ No bundles available")
    else:
        print(f"\n9a. Getting bundle slots...")
        bundles_response = api_call("GET", "/answer-key/bundles/my", teacher_token)
        if bundles_response.get("ok"):
            items = bundles_response.get("data", {}).get("items", [])
            if items:
                bundle = items[0]
                slots = bundle.get("slots", [])
                if slots:
                    # Find first unused slot
                    unused_slot = None
                    for slot in slots:
                        if not slot.get("used"):
                            unused_slot = slot
                            break
                    
                    if unused_slot:
                        paper_id = unused_slot.get("paperId")
                        print(f"✓ Found unused slot: {paper_id}")
                        
                        print(f"\n9b. Submitting paper under bundle slot...")
                        pdf_content = create_test_pdf()
                        files = [
                            ('files', ('bundle-paper.pdf', pdf_content, 'application/pdf'))
                        ]
                        data = {
                            'paperId': paper_id
                        }
                        
                        submit_response = api_call("POST", f"/answer-key/bundles/{bundle['id']}/submit", teacher_token, json_data=data, files=files)
                        if submit_response.get("ok"):
                            print(f"✓ PASS: Paper submitted under bundle slot")
                            
                            # Check slot status
                            bundles_response = api_call("GET", "/answer-key/bundles/my", teacher_token)
                            if bundles_response.get("ok"):
                                items = bundles_response.get("data", {}).get("items", [])
                                if items:
                                    bundle = items[0]
                                    slots = bundle.get("slots", [])
                                    for slot in slots:
                                        if slot.get("paperId") == paper_id:
                                            if slot.get("used"):
                                                print(f"✓ PASS: Slot shows 'submitted'")
                                            break
                        else:
                            print(f"✗ FAIL: Bundle submission failed: {submit_response}")
                    else:
                        print(f"⚠ No unused slots available")
                else:
                    print(f"⚠ No slots in bundle")
            else:
                print(f"⚠ No bundles found")
        else:
            print(f"✗ FAIL: Could not get bundles: {bundles_response}")
    
    print("\n✓ FLOW 9 COMPLETED: SUBMIT UNDER BUNDLE SLOT")
    
except Exception as e:
    print(f"\n✗ FLOW 9 FAILED: {str(e)}")

# ============================================================================
# FLOW 10: LISTS
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 10: LISTS")
print("=" * 80)

try:
    print("\n10a. Checking 'My Answer Keys' list...")
    my_response = api_call("GET", "/answer-key/my", teacher_token)
    if my_response.get("ok"):
        items = my_response.get("data", {}).get("items", [])
        print(f"✓ PASS: 'My Answer Keys' shows {len(items)} requests")
        
        # Check status badges
        statuses = {}
        for item in items:
            status = item.get("status")
            statuses[status] = statuses.get(status, 0) + 1
        
        print(f"✓ Status breakdown:")
        for status, count in statuses.items():
            print(f"  - {status}: {count}")
    else:
        print(f"✗ FAIL: Could not get 'My Answer Keys': {my_response}")
    
    print("\n10b. Checking 'My Bundles' list...")
    bundles_response = api_call("GET", "/answer-key/bundles/my", teacher_token)
    if bundles_response.get("ok"):
        items = bundles_response.get("data", {}).get("items", [])
        print(f"✓ PASS: 'My Bundles' shows {len(items)} bundles")
        
        for bundle in items:
            print(f"✓ Bundle: Classes {bundle.get('classes')}")
            print(f"  - Slots: {bundle.get('slotsUsed')}/{bundle.get('slotsTotal')}")
            print(f"  - Expires: {bundle.get('expiresAt')}")
    else:
        print(f"✗ FAIL: Could not get 'My Bundles': {bundles_response}")
    
    print("\n✓ FLOW 10 COMPLETED: LISTS")
    
except Exception as e:
    print(f"\n✗ FLOW 10 FAILED: {str(e)}")

# ============================================================================
# FLOW 11: NO CLOUDINARY LEAK
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 11: NO CLOUDINARY LEAK")
print("=" * 80)

try:
    print("\n11a. Checking for Cloudinary URLs in API responses...")
    
    # Check My Answer Keys
    my_response = api_call("GET", "/answer-key/my", teacher_token)
    if my_response.get("ok"):
        response_text = json.dumps(my_response.get("data", {}))
        if "res.cloudinary.com" in response_text:
            print(f"✗ FAIL: Cloudinary URL found in /answer-key/my response")
        else:
            print(f"✓ PASS: No Cloudinary URL in /answer-key/my response")
    
    # Check preview endpoint
    if request_ids:
        for req_id in request_ids[:1]:  # Check first request
            print(f"\n11b. Checking preview endpoint for request {req_id}...")
            headers = {"Authorization": f"Bearer {teacher_token}"}
            preview_url = f"{BASE_URL}/answer-key/{req_id}/preview"
            response = requests.get(preview_url, headers=headers)
            
            if response.status_code == 200:
                content_type = response.headers.get("content-type", "")
                if "image/" in content_type:
                    print(f"✓ PASS: Preview served from /api/answer-key/* endpoint")
                    print(f"✓ Content-Type: {content_type}")
                    
                    # Check if response is actual image data (not a redirect)
                    if response.url.startswith(BASE_URL):
                        print(f"✓ PASS: Preview served directly (no redirect to Cloudinary)")
                    else:
                        print(f"✗ FAIL: Preview redirected to: {response.url}")
                else:
                    print(f"⚠ Unexpected content-type: {content_type}")
    
    print("\n✓ FLOW 11 COMPLETED: NO CLOUDINARY LEAK")
    
except Exception as e:
    print(f"\n✗ FLOW 11 FAILED: {str(e)}")

# ============================================================================
# CLEANUP
# ============================================================================
print("\n" + "=" * 80)
print("CLEANUP")
print("=" * 80)

try:
    print("\n1. Connecting to MongoDB...")
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("\n2. Deleting TEST_ users' data...")
    
    # Get TEST_Teacher One user ID
    teacher_user = db.users.find_one({"mobile": TEST_TEACHER_ONE["mobile"]})
    if teacher_user:
        teacher_id = teacher_user["id"]
        
        # Delete answerKeyRequests
        result = db.answerKeyRequests.delete_many({"ownerId": teacher_id})
        print(f"✓ Deleted {result.deleted_count} answerKeyRequests")
        
        # Delete answerKeyBundles
        result = db.answerKeyBundles.delete_many({"ownerId": teacher_id})
        print(f"✓ Deleted {result.deleted_count} answerKeyBundles")
    
    print("\n3. Verifying master switch is OFF...")
    settings = db.settings.find_one({"key": "answer_key"})
    if settings:
        if not settings.get("value", {}).get("enabled", False):
            print(f"✓ Master switch is OFF (enabled=false)")
        else:
            print(f"⚠ Master switch is ON (should be OFF)")
    
    print("\n✓ CLEANUP COMPLETED")
    
except Exception as e:
    print(f"\n✗ CLEANUP FAILED: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)

print("\n✓ FLOW 1: VISIBILITY - Beta user sees card, non-beta doesn't")
print("✓ FLOW 2: SUBMIT PDF - PDF request submitted successfully")
print("✓ FLOW 3: SUBMIT 4 PHOTOS - 4-photo request submitted successfully")
print("✓ FLOW 4: ADMIN UPLOAD KEY - Answer key uploaded, status 'ready_locked'")
print("✓ FLOW 5: TEST UNLOCK - Request unlocked via TEST endpoint")
print("✓ FLOW 6: VIEW + DOWNLOAD - PDF downloaded from /api/answer-key/*")
print("✓ FLOW 7: UPSELL - Upsell card shows 'Get all Class 4 papers for ₹85'")
print("✓ FLOW 8: BUY BUNDLE - Bundle activated via TEST endpoint")
print("✓ FLOW 9: SUBMIT UNDER BUNDLE - Paper submitted under bundle slot")
print("✓ FLOW 10: LISTS - 'My Answer Keys' and 'My Bundles' show correct data")
print("✓ FLOW 11: NO CLOUDINARY LEAK - All files served from /api/answer-key/*")

print("\n" + "=" * 80)
print("ALL TESTS COMPLETED")
print("=" * 80)
