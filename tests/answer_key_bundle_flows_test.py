#!/usr/bin/env python3
"""
Answer Key Bundle Flows Test (Flows 8-9)
"""
import requests
import json
from datetime import datetime, timedelta
from pymongo import MongoClient
import os

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "edumaster_odisha")

# Test accounts
ADMIN = {"mobile": "9692604577", "password": "<redacted>"}
TEST_TEACHER_ONE = {"mobile": "8000000001", "password": "<redacted>"}

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
        return None
    except Exception as e:
        print(f"✗ Login error: {str(e)}")
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
        else:
            return None
        
        return {
            "status": response.status_code,
            "ok": response.status_code < 400,
            "data": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
        }
    except Exception as e:
        print(f"✗ API call error: {str(e)}")
        return {"ok": False, "error": str(e)}

def create_test_pdf():
    """Create a small test PDF file"""
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

print("=" * 80)
print("ANSWER KEY BUNDLE FLOWS TEST (FLOWS 8-9)")
print("=" * 80)

# Login
print("\n1. Logging in...")
admin_token = login(ADMIN["mobile"], ADMIN["password"])
teacher_token = login(TEST_TEACHER_ONE["mobile"], TEST_TEACHER_ONE["password"])

if not admin_token or not teacher_token:
    print("✗ Login failed")
    exit(1)

print("✓ Logged in successfully")

# Get or create exam
print("\n2. Getting/creating exam...")
exams_response = api_call("GET", "/answer-key/bundles/exams", teacher_token)
exam_id = None

if exams_response.get("ok"):
    exams = exams_response.get("data", {}).get("exams", [])
    if exams:
        exam_id = exams[0]["id"]
        print(f"✓ Using existing exam: {exam_id}")
    else:
        # Create exam
        end_date = (datetime.now() + timedelta(days=30)).isoformat()
        exam_response = api_call("POST", "/admin/answer-key/exams", admin_token, {
            "name": "Term Test Bundle",
            "endDate": end_date
        })
        if exam_response.get("ok"):
            exam_id = exam_response.get("data", {}).get("id")
            print(f"✓ Exam created: {exam_id}")
        else:
            print(f"✗ Exam creation failed: {exam_response}")

if not exam_id:
    print("✗ No exam ID available")
    exit(1)

# ============================================================================
# FLOW 8: BUY BUNDLE (TEST)
# ============================================================================
print("\n" + "=" * 80)
print("FLOW 8: BUY BUNDLE (TEST)")
print("=" * 80)

print("\n8a. Activating Class 4 bundle via TEST endpoint...")
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
            bundle_id = bundle["id"]
            print(f"✓ PASS: Bundle found in 'My Bundles'")
            print(f"✓ Bundle ID: {bundle_id}")
            print(f"✓ Classes: {bundle.get('classes')}")
            print(f"✓ Status: {bundle.get('status')}")
            print(f"✓ Slots: {bundle.get('slotsUsed')}/{bundle.get('slotsTotal')}")
            print(f"✓ Expires: {bundle.get('expiresAt')}")
            
            # ============================================================================
            # FLOW 9: SUBMIT UNDER BUNDLE SLOT
            # ============================================================================
            print("\n" + "=" * 80)
            print("FLOW 9: SUBMIT UNDER BUNDLE SLOT")
            print("=" * 80)
            
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
                    print(f"\n9a. Found unused slot: {paper_id}")
                    print(f"    Class: {unused_slot.get('class')}")
                    
                    print(f"\n9b. Submitting paper under bundle slot...")
                    pdf_content = create_test_pdf()
                    files = [
                        ('files', ('bundle-paper.pdf', pdf_content, 'application/pdf'))
                    ]
                    data = {
                        'paperId': paper_id
                    }
                    
                    submit_response = api_call("POST", f"/answer-key/bundles/{bundle_id}/submit", teacher_token, json_data=data, files=files)
                    if submit_response.get("ok"):
                        print(f"✓ PASS: Paper submitted under bundle slot")
                        
                        # Check slot status
                        print(f"\n9c. Verifying slot status...")
                        bundles_response = api_call("GET", "/answer-key/bundles/my", teacher_token)
                        if bundles_response.get("ok"):
                            items = bundles_response.get("data", {}).get("items", [])
                            if items:
                                bundle = items[0]
                                slots = bundle.get("slots", [])
                                for slot in slots:
                                    if slot.get("paperId") == paper_id:
                                        if slot.get("used"):
                                            print(f"✓ PASS: Slot shows 'submitted' (used=true)")
                                        else:
                                            print(f"✗ FAIL: Slot not marked as used")
                                        break
                                
                                print(f"✓ Slots used: {bundle.get('slotsUsed')}/{bundle.get('slotsTotal')}")
                    else:
                        print(f"✗ FAIL: Bundle submission failed: {submit_response}")
                else:
                    print(f"⚠ No unused slots available")
            else:
                print(f"⚠ No slots in bundle")
        else:
            print(f"✗ FAIL: No bundles found")
    else:
        print(f"✗ FAIL: Could not get bundles: {bundles_response}")
else:
    print(f"✗ FAIL: Bundle activation failed: {activate_response}")

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
    
    print("\n2. Deleting TEST_ users' bundle data...")
    teacher_user = db.users.find_one({"mobile": TEST_TEACHER_ONE["mobile"]})
    if teacher_user:
        teacher_id = teacher_user["id"]
        
        # Delete answerKeyBundles
        result = db.answerKeyBundles.delete_many({"ownerId": teacher_id})
        print(f"✓ Deleted {result.deleted_count} answerKeyBundles")
        
        # Delete bundle requests
        result = db.answerKeyRequests.delete_many({"ownerId": teacher_id, "unlockMethod": "bundle"})
        print(f"✓ Deleted {result.deleted_count} bundle answerKeyRequests")
    
    print("\n✓ CLEANUP COMPLETED")
    
except Exception as e:
    print(f"\n✗ CLEANUP FAILED: {str(e)}")

print("\n" + "=" * 80)
print("BUNDLE FLOWS TEST COMPLETED")
print("=" * 80)
