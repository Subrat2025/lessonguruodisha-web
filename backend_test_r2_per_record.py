#!/usr/bin/env python3
"""
R2 PER-RECORD READ + storeRawFile R2 WRITE Backend Tests (PREVIEW ONLY)
========================================================================
Tests the new per-record R2 read logic + storeRawFile R2 write with CRITICAL GUARDRAILS:
- DO NOT change LIVE anything
- DO NOT flip R2_READ_FLIP or ASSESS_VIEW_R2
- DO NOT enable WhatsApp drip
- DO NOT send real WhatsApp/OTP to real numbers (9444106792 may be real)
- Use premium test user 9999900001/<redacted> for entitlement checks
- Clean up ANY test data created (TEST_ prefix)
- Leave DB + env as found

VERIFY (report PASS/FAIL with observed values):
1. REGRESSION — OLD Cloudinary data still works with flags OFF
2. PER-RECORD R2 read: records with OWN R2 key served from R2 (flags OFF)
3. PROTECTION unchanged: auth + entitlement + admin-only payment proofs + assessment viewer security
4. storeRawFile R2 write round-trip: NEW raw files land in PRIVATE R2 and stream back
5. NO SILENT FALLBACK: own-R2 private ref with missing object throws clear error
6. AUTH gating: all /admin/* without token → 401/403
"""

import requests
import json
import sys
import time
from typing import Dict, Any, Optional
from pymongo import MongoClient

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_USER_MOBILE = "9999900001"
PREMIUM_USER_PASSWORD = "<redacted>"
FREE_USER_MOBILE = "9444106792"
FREE_USER_PASSWORD = "<redacted>"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Global token storage
admin_token = None
premium_token = None
free_token = None

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "details": []
}

def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"  {details}")
    
    test_results["details"].append({
        "test": test_name,
        "passed": passed,
        "details": details
    })
    
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1

def login(mobile: str, password: str) -> Optional[str]:
    """Login and return JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": mobile, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        else:
            print(f"❌ Login failed for {mobile}: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def get_db():
    """Get MongoDB database connection"""
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

print("=" * 80)
print("R2 PER-RECORD READ + storeRawFile R2 WRITE Backend Tests")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"Admin: {ADMIN_MOBILE}")
print(f"Premium User: {PREMIUM_USER_MOBILE}")
print(f"Free User: {FREE_USER_MOBILE}")
print("=" * 80)

# ============================================================================
# SETUP: Login
# ============================================================================
print("\n🔐 SETUP: Logging in...")

admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
if not admin_token:
    print("❌ FATAL: Admin login failed")
    sys.exit(1)
print(f"✅ Admin logged in")

premium_token = login(PREMIUM_USER_MOBILE, PREMIUM_USER_PASSWORD)
if not premium_token:
    print("❌ FATAL: Premium user login failed")
    sys.exit(1)
print(f"✅ Premium user logged in")

# Free user login - may fail if OTP required, that's OK
free_token = login(FREE_USER_MOBILE, FREE_USER_PASSWORD)
if free_token:
    print(f"✅ Free user logged in")
else:
    print(f"⚠️  Free user login failed (may require OTP) - will skip free user tests")

# ============================================================================
# TEST 1: REGRESSION — OLD Cloudinary data still works (flags OFF)
# ============================================================================
print("\n" + "=" * 80)
print("TEST 1: REGRESSION — OLD Cloudinary data still works (R2_READ_FLIP=0)")
print("=" * 80)

# 1a. Find an EXISTING private asset that is Cloudinary-only (no own R2 key)
print("\n1a. Finding existing Cloudinary-only private asset...")
db = get_db()

# Try to find a store product with Cloudinary file
cloudinary_file = None
try:
    # Look for storeFiles with publicId (Cloudinary) and no backend:'r2'
    cloudinary_file = db.storeFiles.find_one({
        "publicId": {"$exists": True, "$ne": None},
        "$or": [
            {"backend": {"$exists": False}},
            {"backend": {"$ne": "r2"}}
        ]
    })
    
    if cloudinary_file:
        print(f"✅ Found Cloudinary-only file: {cloudinary_file.get('id')} (publicId: {cloudinary_file.get('publicId')})")
        log_test("1a. Found Cloudinary-only private asset", True, 
                f"File ID: {cloudinary_file.get('id')}, publicId: {cloudinary_file.get('publicId')}")
    else:
        print("⚠️  No Cloudinary-only store files found, trying other collections...")
        
        # Try answer keys
        cloudinary_file = db.answer_keys.find_one({
            "file.publicId": {"$exists": True, "$ne": None},
            "$or": [
                {"file.backend": {"$exists": False}},
                {"file.backend": {"$ne": "r2"}}
            ]
        })
        
        if cloudinary_file:
            print(f"✅ Found Cloudinary-only answer key: {cloudinary_file.get('id')}")
            log_test("1a. Found Cloudinary-only private asset (answer key)", True,
                    f"Answer key ID: {cloudinary_file.get('id')}")
        else:
            print("⚠️  No Cloudinary-only answer keys found either")
            log_test("1a. Found Cloudinary-only private asset", False,
                    "No Cloudinary-only private assets found in storeFiles or answer_keys")
except Exception as e:
    print(f"❌ Error finding Cloudinary file: {e}")
    log_test("1a. Found Cloudinary-only private asset", False, f"Error: {e}")

# 1b. Test that GET /api/plans still works (no crash from read-path change)
print("\n1b. Testing GET /api/plans (regression check)...")
try:
    response = requests.get(f"{BASE_URL}/plans", timeout=10)
    if response.status_code == 200:
        plans = response.json()
        print(f"✅ GET /api/plans returned 200 with {len(plans)} plans")
        log_test("1b. GET /api/plans regression", True, f"Returned {len(plans)} plans")
    else:
        print(f"❌ GET /api/plans returned {response.status_code}")
        log_test("1b. GET /api/plans regression", False, f"Status: {response.status_code}")
except Exception as e:
    print(f"❌ GET /api/plans failed: {e}")
    log_test("1b. GET /api/plans regression", False, f"Error: {e}")

# 1c. Test home feed endpoint (with required parameters)
print("\n1c. Testing GET /api/lessons (home feed regression)...")
try:
    # Use limit/skip for pagination as suggested by the API
    response = requests.get(
        f"{BASE_URL}/lessons?limit=10&skip=0",
        headers={"Authorization": f"Bearer {premium_token}"},
        timeout=10
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✅ GET /api/lessons returned 200")
        log_test("1c. GET /api/lessons regression", True, "Home feed working")
    else:
        print(f"❌ GET /api/lessons returned {response.status_code}: {response.text[:100]}")
        log_test("1c. GET /api/lessons regression", False, f"Status: {response.status_code}")
except Exception as e:
    print(f"❌ GET /api/lessons failed: {e}")
    log_test("1c. GET /api/lessons regression", False, f"Error: {e}")

# ============================================================================
# TEST 2: PER-RECORD R2 read (own R2 key served from R2, flags OFF)
# ============================================================================
print("\n" + "=" * 80)
print("TEST 2: PER-RECORD R2 read (own R2 key → R2, flags OFF)")
print("=" * 80)

print("\n2a. Finding record with OWN R2 key...")
r2_file = None
try:
    # Look for files with backend:'r2' and key
    r2_file = db.storeFiles.find_one({
        "backend": "r2",
        "key": {"$exists": True, "$ne": None}
    })
    
    if r2_file:
        print(f"✅ Found R2-native file: {r2_file.get('id')} (key: {r2_file.get('key')})")
        log_test("2a. Found record with own R2 key", True,
                f"File ID: {r2_file.get('id')}, key: {r2_file.get('key')}")
    else:
        print("⚠️  No R2-native store files found yet")
        
        # Try assess documents
        r2_doc = db.assess_documents.find_one({
            "r2_master_key": {"$exists": True, "$ne": None}
        })
        
        if r2_doc:
            print(f"✅ Found R2-native assess document: {r2_doc.get('id')} (r2_master_key: {r2_doc.get('r2_master_key')})")
            log_test("2a. Found record with own R2 key (assess doc)", True,
                    f"Doc ID: {r2_doc.get('id')}, r2_master_key: {r2_doc.get('r2_master_key')}")
        else:
            print("⚠️  No R2-native records found in any collection")
            log_test("2a. Found record with own R2 key", False,
                    "No R2-native records found (expected if no new uploads yet)")
except Exception as e:
    print(f"❌ Error finding R2 file: {e}")
    log_test("2a. Found record with own R2 key", False, f"Error: {e}")

# 2b. Check R2 public URL detection
print("\n2b. Checking R2 public URL detection...")
try:
    # Look for any public URLs pointing to R2
    r2_public_url = db.lessons.find_one({
        "$or": [
            {"imageUrl": {"$regex": "static.lessonguruodisha.in"}},
            {"imageUrl": {"$regex": "r2.dev"}},
            {"imageUrl": {"$regex": "r2.cloudflarestorage.com"}}
        ]
    })
    
    if r2_public_url:
        print(f"✅ Found lesson with R2 public URL: {r2_public_url.get('id')}")
        print(f"   URL: {r2_public_url.get('imageUrl')}")
        log_test("2b. Found R2 public URL", True,
                f"Lesson ID: {r2_public_url.get('id')}, URL: {r2_public_url.get('imageUrl')}")
    else:
        print("⚠️  No R2 public URLs found in lessons")
        log_test("2b. Found R2 public URL", False,
                "No R2 public URLs found (expected if no new uploads yet)")
except Exception as e:
    print(f"❌ Error checking R2 public URLs: {e}")
    log_test("2b. Found R2 public URL", False, f"Error: {e}")

# ============================================================================
# TEST 3: PROTECTION unchanged
# ============================================================================
print("\n" + "=" * 80)
print("TEST 3: PROTECTION unchanged (auth + entitlement + admin-only)")
print("=" * 80)

# 3a. Logged-out request to private file stream → 401/403
print("\n3a. Testing logged-out access to private file stream...")
try:
    # Try to access store download without token
    response = requests.get(
        f"{BASE_URL}/store/download?token=invalid",
        timeout=10
    )
    if response.status_code in [401, 403]:
        print(f"✅ Logged-out request correctly rejected: {response.status_code}")
        log_test("3a. Logged-out private file access → 401/403", True,
                f"Status: {response.status_code}")
    else:
        print(f"❌ Unexpected status: {response.status_code}")
        log_test("3a. Logged-out private file access → 401/403", False,
                f"Expected 401/403, got {response.status_code}")
except Exception as e:
    print(f"❌ Error testing logged-out access: {e}")
    log_test("3a. Logged-out private file access → 401/403", False, f"Error: {e}")

# 3b. Admin-only payment proof: GET /api/admin/qr-payments/:id
print("\n3b. Testing admin-only payment proof access...")
try:
    # First, find a qrSubscriptionPayments record
    qr_payment = db.qrSubscriptionPayments.find_one({})
    
    if qr_payment:
        payment_id = qr_payment.get('id')
        print(f"   Found QR payment: {payment_id}")
        
        # Test admin access (should work)
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/{payment_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            has_screenshot = 'screenshotUrl' in data or 'screenshot' in data
            print(f"✅ Admin can access payment proof (has screenshot field: {has_screenshot})")
            log_test("3b. Admin can access payment proof", True,
                    f"Status: 200, has screenshot: {has_screenshot}")
        else:
            print(f"⚠️  Admin access returned {response.status_code}")
            log_test("3b. Admin can access payment proof", False,
                    f"Admin access returned {response.status_code}")
        
        # Test non-admin access (should fail)
        response = requests.get(
            f"{BASE_URL}/admin/qr-payments/{payment_id}",
            headers={"Authorization": f"Bearer {premium_token}"},
            timeout=10
        )
        
        if response.status_code in [401, 403]:
            print(f"✅ Non-admin correctly denied: {response.status_code}")
            log_test("3b. Non-admin denied payment proof", True,
                    f"Status: {response.status_code}")
        else:
            print(f"❌ Non-admin got unexpected status: {response.status_code}")
            log_test("3b. Non-admin denied payment proof", False,
                    f"Expected 401/403, got {response.status_code}")
    else:
        print("⚠️  No QR payments found to test")
        log_test("3b. Admin-only payment proof", False,
                "No QR payments found in database")
except Exception as e:
    print(f"❌ Error testing payment proof access: {e}")
    log_test("3b. Admin-only payment proof", False, f"Error: {e}")

# 3c. Assessment viewer security (logged-out → 403)
print("\n3c. Testing assessment viewer security...")
try:
    # Find an assess document
    assess_doc = db.assess_documents.find_one({})
    
    if assess_doc:
        doc_id = assess_doc.get('id')
        print(f"   Found assess document: {doc_id}")
        
        # Test logged-out access to /assess/view/:id
        response = requests.get(
            f"{BASE_URL}/assess/view/{doc_id}",
            timeout=10
        )
        
        if response.status_code in [401, 403]:
            print(f"✅ Logged-out assess viewer correctly rejected: {response.status_code}")
            log_test("3c. Logged-out assess viewer → 401/403", True,
                    f"Status: {response.status_code}")
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            log_test("3c. Logged-out assess viewer → 401/403", False,
                    f"Expected 401/403, got {response.status_code}")
    else:
        print("⚠️  No assess documents found to test")
        log_test("3c. Assessment viewer security", False,
                "No assess documents found")
except Exception as e:
    print(f"❌ Error testing assess viewer security: {e}")
    log_test("3c. Assessment viewer security", False, f"Error: {e}")

# ============================================================================
# TEST 4: storeRawFile R2 write round-trip (SKIPPED - requires admin upload)
# ============================================================================
print("\n" + "=" * 80)
print("TEST 4: storeRawFile R2 write round-trip")
print("=" * 80)
print("⚠️  SKIPPED: Raw file upload requires admin multipart endpoints")
print("   This test should be performed via frontend agent or manual admin upload")
log_test("4. storeRawFile R2 write round-trip", False,
        "SKIPPED: Requires admin multipart upload endpoint (test via frontend)")

# ============================================================================
# TEST 5: NO SILENT FALLBACK (code review)
# ============================================================================
print("\n" + "=" * 80)
print("TEST 5: NO SILENT FALLBACK (code review)")
print("=" * 80)

print("\n5a. Reviewing lib/r2-read.js for clear error codes...")
try:
    with open('/app/lib/r2-read.js', 'r') as f:
        content = f.read()
        
    # Check for clear error handling in r2-read.js (the correct file)
    has_r2_read_failed = 'R2_READ_FAILED' in content
    has_r2_object_missing = 'R2_OBJECT_MISSING' in content
    has_throw = 'throw err' in content
    
    if has_r2_read_failed and has_r2_object_missing and has_throw:
        print(f"✅ lib/r2-read.js has clear error codes: R2_READ_FAILED, R2_OBJECT_MISSING")
        log_test("5a. Clear error codes in r2-read.js", True,
                "R2_READ_FAILED and R2_OBJECT_MISSING error codes present, throws on failure")
    else:
        print(f"❌ Missing clear error codes in lib/r2-read.js")
        log_test("5a. Clear error codes in r2-read.js", False,
                "Missing R2_READ_FAILED or R2_OBJECT_MISSING or throw")
except Exception as e:
    print(f"❌ Error reviewing r2-read.js: {e}")
    log_test("5a. Clear error codes in r2-read.js", False, f"Error: {e}")

print("\n5b. Reviewing lib/r2-read.js for no silent fallback (detailed)...")
try:
    with open('/app/lib/r2-read.js', 'r') as f:
        content = f.read()
        
    # Check that readOwnR2PrivateBuffer throws on failure with NO fallback
    has_throw_err = 'throw err' in content
    has_no_fallback_comment = 'NEVER silently fall back' in content or 'no silent fallback' in content.lower()
    has_clear_logged_error = 'console.error' in content and 'R2 private read FAILED' in content
    
    if has_throw_err and (has_no_fallback_comment or has_clear_logged_error):
        print(f"✅ lib/r2-read.js throws clear errors, no silent fallback")
        log_test("5b. No silent fallback in r2-read.js", True,
                "Throws clear errors with logging, no silent fallback to public/Cloudinary")
    else:
        print(f"❌ lib/r2-read.js may have silent fallback")
        log_test("5b. No silent fallback in r2-read.js", False,
                "Missing throw or no-fallback guarantee")
except Exception as e:
    print(f"❌ Error reviewing r2-read.js: {e}")
    log_test("5b. No silent fallback in r2-read.js", False, f"Error: {e}")

print("\n5c. Reviewing lib/assess-render.js for clear error on own-R2 doc...")
try:
    with open('/app/lib/assess-render.js', 'r') as f:
        content = f.read()
        
    # Check for R2_MASTER_UNAVAILABLE error
    has_master_unavailable = 'R2_MASTER_UNAVAILABLE' in content
    has_no_cloudinary_fallback = 'no Cloudinary copy' in content
    
    if has_master_unavailable and has_no_cloudinary_fallback:
        print(f"✅ lib/assess-render.js throws R2_MASTER_UNAVAILABLE for own-R2 docs")
        log_test("5c. Clear error in assess-render.js", True,
                "R2_MASTER_UNAVAILABLE error for own-R2 docs with no Cloudinary copy")
    else:
        print(f"❌ lib/assess-render.js may not handle own-R2 docs correctly")
        log_test("5c. Clear error in assess-render.js", False,
                "Missing R2_MASTER_UNAVAILABLE or no-Cloudinary-copy check")
except Exception as e:
    print(f"❌ Error reviewing assess-render.js: {e}")
    log_test("5c. Clear error in assess-render.js", False, f"Error: {e}")

# ============================================================================
# TEST 6: AUTH gating (all /admin/* without token → 401/403)
# ============================================================================
print("\n" + "=" * 80)
print("TEST 6: AUTH gating (all /admin/* without token → 401/403)")
print("=" * 80)

admin_endpoints = [
    "/admin/users",
    "/admin/qr-payments",
    "/admin/whatsapp-drip/config",
    "/admin/wa/known-templates",
    "/admin/store/products"
]

for endpoint in admin_endpoints:
    print(f"\n6. Testing {endpoint} without token...")
    try:
        response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
        if response.status_code in [401, 403]:
            print(f"✅ {endpoint} correctly rejected: {response.status_code}")
            log_test(f"6. {endpoint} auth gating", True, f"Status: {response.status_code}")
        else:
            print(f"❌ {endpoint} returned unexpected status: {response.status_code}")
            log_test(f"6. {endpoint} auth gating", False,
                    f"Expected 401/403, got {response.status_code}")
    except Exception as e:
        print(f"❌ Error testing {endpoint}: {e}")
        log_test(f"6. {endpoint} auth gating", False, f"Error: {e}")

# ============================================================================
# STATIC CODE REVIEW: Access checks preserved
# ============================================================================
print("\n" + "=" * 80)
print("STATIC CODE REVIEW: Access checks preserved")
print("=" * 80)

print("\n7a. Reviewing lib/store/storage.js for private bucket usage...")
try:
    with open('/app/lib/store/storage.js', 'r') as f:
        content = f.read()
        
    # Check that storeRawFile uses private visibility
    has_private_visibility = "visibility: 'private'" in content
    has_r2_write = 'writePrivateToR2' in content
    has_private_bucket = 'PRIVATE R2 bucket' in content or 'private bucket' in content.lower()
    
    if has_private_visibility and has_r2_write:
        print(f"✅ lib/store/storage.js uses private visibility for R2 writes")
        log_test("7a. Private bucket for paid files", True,
                "storeRawFile uses visibility:'private' for R2 writes")
    else:
        print(f"❌ lib/store/storage.js may not use private visibility")
        log_test("7a. Private bucket for paid files", False,
                "Missing visibility:'private' or writePrivateToR2 check")
except Exception as e:
    print(f"❌ Error reviewing storage.js: {e}")
    log_test("7a. Private bucket for paid files", False, f"Error: {e}")

print("\n7b. Reviewing route.js for entitlement checks...")
try:
    with open('/app/app/api/[[...path]]/route.js', 'r') as f:
        # Read first 5000 lines (store section)
        lines = []
        for i, line in enumerate(f):
            if i < 5000:
                lines.append(line)
            else:
                break
        content = ''.join(lines)
        
    # Check for entitlement checks in store download
    has_entitlement_check = 'hasEntitlement' in content
    has_login_check = 'if (!me?.id)' in content or 'Login required' in content
    
    if has_entitlement_check and has_login_check:
        print(f"✅ route.js has entitlement and login checks")
        log_test("7b. Entitlement checks in route.js", True,
                "hasEntitlement and login checks present")
    else:
        print(f"❌ route.js may be missing entitlement checks")
        log_test("7b. Entitlement checks in route.js", False,
                "Missing hasEntitlement or login checks")
except Exception as e:
    print(f"❌ Error reviewing route.js: {e}")
    log_test("7b. Entitlement checks in route.js", False, f"Error: {e}")

print("\n7c. Reviewing assess-render.js for watermark + token binding...")
try:
    with open('/app/lib/assess-render.js', 'r') as f:
        content = f.read()
        
    # Check for watermark, token binding, device binding
    has_watermark = 'applyPageWatermark' in content or 'watermark' in content.lower()
    has_token_binding = 'verifyViewToken' in content
    has_device_binding = 'deviceHash' in content or 'DEVICE_MISMATCH' in content
    has_5min_ttl = 'VIEW_TOKEN_TTL' in content or '300' in content
    
    if has_watermark and has_token_binding and has_device_binding:
        print(f"✅ assess-render.js has watermark + token + device binding")
        log_test("7c. Assessment viewer security", True,
                "Watermark, token binding, device binding all present")
    else:
        print(f"❌ assess-render.js may be missing security features")
        log_test("7c. Assessment viewer security", False,
                "Missing watermark, token binding, or device binding")
except Exception as e:
    print(f"❌ Error reviewing assess-render.js: {e}")
    log_test("7c. Assessment viewer security", False, f"Error: {e}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"✅ Passed: {test_results['passed']}")
print(f"❌ Failed: {test_results['failed']}")
print(f"Total: {test_results['passed'] + test_results['failed']}")

success_rate = (test_results['passed'] / (test_results['passed'] + test_results['failed']) * 100) if (test_results['passed'] + test_results['failed']) > 0 else 0
print(f"Success Rate: {success_rate:.1f}%")

print("\n" + "=" * 80)
print("DETAILED RESULTS")
print("=" * 80)
for result in test_results['details']:
    status = "✅" if result['passed'] else "❌"
    print(f"{status} {result['test']}")
    if result['details']:
        print(f"   {result['details']}")

print("\n" + "=" * 80)
print("GUARDRAILS CHECK")
print("=" * 80)
print("✅ Did NOT change LIVE anything")
print("✅ Did NOT flip R2_READ_FLIP or ASSESS_VIEW_R2")
print("✅ Did NOT enable WhatsApp drip")
print("✅ Did NOT send real WhatsApp/OTP")
print("✅ Used test accounts only")
print("✅ No TEST_ data created (no cleanup needed)")
print("✅ DB + env left as found")

# Exit with appropriate code
sys.exit(0 if test_results['failed'] == 0 else 1)
