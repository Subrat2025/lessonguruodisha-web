#!/usr/bin/env python3
"""
Backend test for Assessment Store ZIP-DISABLED upload changes.
Tests the new ZIP rejection logic and 10MB enforcement while ensuring PDF direct-upload still works.
"""

import requests
import json
import os
import hmac
import hashlib
import base64

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def login_admin():
    """Login as admin and return token"""
    try:
        response = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            print(f"✅ Admin login successful, token: {token[:20]}...")
            return token
        else:
            print(f"❌ Admin login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Admin login error: {str(e)}")
        return None

def test_1_zip_signature_rejected(token):
    """TEST 1: POST /api/admin/assess/upload-signature with kind:zip → 400 ZIP_DISABLED"""
    print("\n" + "="*80)
    print("TEST 1: ZIP signature request should be rejected with ZIP_DISABLED")
    print("="*80)
    
    try:
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-signature",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "file_name": "Lesson_Guru_All.zip",
                "kind": "zip"
            },
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 400:
            data = response.json()
            if data.get('code') == 'ZIP_DISABLED':
                print("✅ TEST 1 PASSED: ZIP upload correctly rejected with ZIP_DISABLED code")
                return True
            else:
                print(f"❌ TEST 1 FAILED: Expected code 'ZIP_DISABLED', got: {data.get('code')}")
                return False
        else:
            print(f"❌ TEST 1 FAILED: Expected 400, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ TEST 1 ERROR: {str(e)}")
        return False

def test_2_pdf_signature_success(token):
    """TEST 2: POST /api/admin/assess/upload-signature with kind:pdf → 200 with signature"""
    print("\n" + "="*80)
    print("TEST 2: PDF signature request should succeed with valid signature")
    print("="*80)
    
    try:
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-signature",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "file_name": "SomeDoc.pdf",
                "class": "Class 3",
                "subject": "English",
                "kind": "pdf"
            },
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}...")
        
        if response.status_code == 200:
            data = response.json()
            signature = data.get('signature', '')
            upload_url = data.get('upload_url', '')
            public_id = data.get('public_id', '')
            folder = data.get('folder', '')
            type_val = data.get('type', '')
            
            # Validate signature is 40-hex
            is_valid_sig = len(signature) == 40 and all(c in '0123456789abcdef' for c in signature.lower())
            
            # Validate upload_url contains "/image/upload"
            has_image_upload = '/image/upload' in upload_url
            
            # Validate type is "authenticated"
            is_authenticated = type_val == 'authenticated'
            
            print(f"  Signature: {signature} (40-hex: {is_valid_sig})")
            print(f"  Upload URL: {upload_url} (has /image/upload: {has_image_upload})")
            print(f"  Public ID: {public_id}")
            print(f"  Folder: {folder}")
            print(f"  Type: {type_val} (authenticated: {is_authenticated})")
            
            if is_valid_sig and has_image_upload and is_authenticated and public_id and folder:
                print("✅ TEST 2 PASSED: PDF signature generated correctly")
                return True, data
            else:
                print(f"❌ TEST 2 FAILED: Missing or invalid fields")
                return False, None
        else:
            print(f"❌ TEST 2 FAILED: Expected 200, got {response.status_code}")
            return False, None
            
    except Exception as e:
        print(f"❌ TEST 2 ERROR: {str(e)}")
        return False, None

def test_3_zip_complete_rejected(token):
    """TEST 3: POST /api/admin/assess/upload-complete with kind:zip → 400 ZIP_DISABLED"""
    print("\n" + "="*80)
    print("TEST 3: ZIP upload-complete should be rejected with ZIP_DISABLED")
    print("="*80)
    
    try:
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-complete",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "kind": "zip",
                "public_id": "whatever",
                "resource_type": "raw"
            },
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 400:
            data = response.json()
            if data.get('code') == 'ZIP_DISABLED':
                print("✅ TEST 3 PASSED: ZIP upload-complete correctly rejected with ZIP_DISABLED code")
                return True
            else:
                print(f"❌ TEST 3 FAILED: Expected code 'ZIP_DISABLED', got: {data.get('code')}")
                return False
        else:
            print(f"❌ TEST 3 FAILED: Expected 400, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ TEST 3 ERROR: {str(e)}")
        return False

def test_4_too_large_rejected(token):
    """TEST 4: POST /api/admin/assess/upload-complete with bytes:11000000 → 400 TOO_LARGE"""
    print("\n" + "="*80)
    print("TEST 4: Upload-complete with >10MB should be rejected with TOO_LARGE")
    print("="*80)
    
    try:
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-complete",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "public_id": "x",
                "bytes": 11000000,
                "kind": "pdf"
            },
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 400:
            data = response.json()
            if data.get('code') == 'TOO_LARGE':
                print("✅ TEST 4 PASSED: Large file correctly rejected with TOO_LARGE code")
                return True
            else:
                print(f"❌ TEST 4 FAILED: Expected code 'TOO_LARGE', got: {data.get('code')}")
                return False
        else:
            print(f"❌ TEST 4 FAILED: Expected 400, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ TEST 4 ERROR: {str(e)}")
        return False

def test_5_full_pdf_regression(token):
    """TEST 5: REGRESSION - Full PDF upload path must still work"""
    print("\n" + "="*80)
    print("TEST 5: REGRESSION - Full PDF upload path (signature → Cloudinary → complete)")
    print("="*80)
    
    try:
        # Since all catalog docs have file_name=None, we'll create a new doc with class/subject
        test_file_name = f"QA_TEST_ZIP_DISABLED_{int(os.urandom(4).hex(), 16)}.pdf"
        test_class = "Class 3"
        test_subject = "English"
        
        print(f"\nUsing test file: {test_file_name}")
        print(f"Class: {test_class}, Subject: {test_subject}")
        
        # Step 1: Get upload signature
        print("\nStep 1: Getting upload signature...")
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-signature",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "file_name": test_file_name,
                "class": test_class,
                "subject": test_subject,
                "kind": "pdf"
            },
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ Failed to get signature: {response.status_code} - {response.text}")
            return False, None
        
        sig_data = response.json()
        upload_url = sig_data.get('upload_url')
        api_key = sig_data.get('api_key')
        timestamp = sig_data.get('timestamp')
        signature = sig_data.get('signature')
        public_id = sig_data.get('public_id')
        folder = sig_data.get('folder')
        type_val = sig_data.get('type')
        tags = sig_data.get('tags')
        
        print(f"  Upload URL: {upload_url}")
        print(f"  Public ID: {public_id}")
        print(f"  Signature: {signature}")
        
        # Step 2: Create a tiny valid PDF (more complete structure)
        print("\nStep 2: Creating tiny valid PDF...")
        pdf_content = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000317 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
410
%%EOF
"""
        print(f"  PDF size: {len(pdf_content)} bytes")
        
        # Step 3: Upload to Cloudinary
        print("\nStep 3: Uploading to Cloudinary...")
        files = {
            'file': ('test.pdf', pdf_content, 'application/pdf')
        }
        data = {
            'api_key': api_key,
            'timestamp': timestamp,
            'signature': signature,
            'public_id': public_id,
            'folder': folder,
            'type': type_val,
            'tags': tags
        }
        
        response = requests.post(upload_url, files=files, data=data, timeout=60)
        
        print(f"  Cloudinary status: {response.status_code}")
        print(f"  Cloudinary response: {response.text[:500]}...")
        
        if response.status_code != 200:
            print(f"❌ Cloudinary upload failed: {response.status_code}")
            return False, None
        
        cloudinary_data = response.json()
        cld_public_id = cloudinary_data.get('public_id')
        cld_version = cloudinary_data.get('version')
        cld_bytes = cloudinary_data.get('bytes')
        cld_resource_type = cloudinary_data.get('resource_type')
        
        print(f"  Cloudinary public_id: {cld_public_id}")
        print(f"  Cloudinary version: {cld_version}")
        print(f"  Cloudinary bytes: {cld_bytes}")
        
        # Step 4: Call upload-complete (will create new doc since no catalog match)
        print("\nStep 4: Calling upload-complete...")
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-complete",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "public_id": cld_public_id,
                "version": cld_version,
                "bytes": cld_bytes,
                "resource_type": cld_resource_type,
                "format": "pdf",
                "kind": "pdf",
                "file_name": test_file_name,
                "class": test_class,
                "subject": test_subject,
                "replace": True
            },
            timeout=30
        )
        
        print(f"  Upload-complete status: {response.status_code}")
        print(f"  Upload-complete response: {response.text[:500]}...")
        
        if response.status_code != 200:
            print(f"❌ Upload-complete failed: {response.status_code}")
            return False, None
        
        complete_data = response.json()
        created = complete_data.get('created')
        doc_id = complete_data.get('document', {}).get('id')
        has_file = complete_data.get('document', {}).get('cld_public_id') is not None
        
        if created and has_file:
            print(f"  ✅ Document created: {doc_id}")
            print(f"  ✅ Document has file: {has_file}")
            print("✅ TEST 5 PASSED: Full PDF upload path working correctly")
            return True, doc_id
        else:
            print(f"❌ Document not created or no file")
            return False, None
            
    except Exception as e:
        print(f"❌ TEST 5 ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def test_6_auth_required():
    """TEST 6: AUTH - upload-signature & upload-complete without admin token → 403"""
    print("\n" + "="*80)
    print("TEST 6: AUTH - Endpoints should require admin token")
    print("="*80)
    
    all_passed = True
    
    # Test upload-signature without token
    try:
        print("\n6a: Testing upload-signature without token...")
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-signature",
            json={"file_name": "test.pdf", "kind": "pdf"},
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 403 or response.status_code == 401:
            print("  ✅ Correctly rejected (403/401)")
        else:
            print(f"  ❌ Expected 403/401, got {response.status_code}")
            all_passed = False
            
    except Exception as e:
        print(f"  ❌ ERROR: {str(e)}")
        all_passed = False
    
    # Test upload-complete without token
    try:
        print("\n6b: Testing upload-complete without token...")
        response = requests.post(
            f"{API_BASE}/admin/assess/upload-complete",
            json={"public_id": "test", "kind": "pdf"},
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 403 or response.status_code == 401:
            print("  ✅ Correctly rejected (403/401)")
        else:
            print(f"  ❌ Expected 403/401, got {response.status_code}")
            all_passed = False
            
    except Exception as e:
        print(f"  ❌ ERROR: {str(e)}")
        all_passed = False
    
    if all_passed:
        print("\n✅ TEST 6 PASSED: Auth correctly required for both endpoints")
    else:
        print("\n❌ TEST 6 FAILED: Auth not properly enforced")
    
    return all_passed

def main():
    print("="*80)
    print("ASSESSMENT STORE ZIP-DISABLED UPLOAD BACKEND TEST")
    print("="*80)
    print(f"API Base: {API_BASE}")
    print(f"Admin: {ADMIN_MOBILE}")
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Could not login as admin")
        return
    
    # Run tests
    results = {}
    
    results['test_1'] = test_1_zip_signature_rejected(token)
    results['test_2'], sig_data = test_2_pdf_signature_success(token)
    results['test_3'] = test_3_zip_complete_rejected(token)
    results['test_4'] = test_4_too_large_rejected(token)
    results['test_5'], test_doc_id = test_5_full_pdf_regression(token)
    results['test_6'] = test_6_auth_required()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if test_doc_id:
        print(f"\n⚠️  NOTE: Document {test_doc_id} now has a test file attached.")
        print(f"   Main agent can reset it by clearing cld_public_id field if needed.")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - ZIP-DISABLED upload changes working correctly!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - see details above")

if __name__ == '__main__':
    main()
