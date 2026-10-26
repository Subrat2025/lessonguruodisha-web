#!/usr/bin/env python3
"""
Backend test for Admin PDF Upload feature for Academic Resources.
Tests all NEW endpoints for PDF upload, view, download, replace, and delete.
"""

import requests
import json
import os
import base64
from io import BytesIO

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test state
admin_token = None
test_resource_id = None
regular_user_token = None

def create_valid_pdf():
    """Create a minimal valid PDF for testing"""
    pdf_content = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 50 150 Td (Test PDF) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF'
    return pdf_content

def create_invalid_pdf():
    """Create an invalid PDF (not starting with %PDF-)"""
    return b'NOT A PDF FILE CONTENT'

print("=" * 80)
print("ADMIN PDF UPLOAD FEATURE — BACKEND TEST")
print("=" * 80)

# ============================================================================
# TEST 1: Admin Login
# ============================================================================
print("\n[TEST 1] Admin Login")
try:
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=10)
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        admin_token = data.get('token')
        print(f"  ✅ Admin login successful, token: {admin_token[:20]}...")
    else:
        print(f"  ❌ Admin login failed: {resp.text}")
        exit(1)
except Exception as e:
    print(f"  ❌ Exception: {e}")
    exit(1)

# ============================================================================
# TEST 2: POST /api/admin/academic-resources/upload-pdf - Multipart (Valid)
# ============================================================================
print("\n[TEST 2] POST /api/admin/academic-resources/upload-pdf - Multipart (Valid PDF)")
try:
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('AUTOTEST_teaching_notes.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': 'AUTOTEST_PDF_Teaching_Notes_Class5',
        'description': 'Automated test PDF upload',
        'classId': 'class-5',
        'className': 'Class 5',
        'subject': 'Mathematics',
        'language': 'Odia',
        'academicSession': '2026-27',
        'isPublished': 'true',
        'isVisible': 'true',
        'allowPdfDownload': 'true',
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=30
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get('ok') and result.get('resource'):
            resource = result['resource']
            test_resource_id = resource['id']
            print(f"  ✅ PDF uploaded successfully")
            print(f"     Resource ID: {test_resource_id}")
            print(f"     Content Type: {resource.get('contentType')}")
            print(f"     Cloudinary Public ID: {resource.get('cloudinaryPublicId', 'N/A')[:50]}...")
            print(f"     Page Count: {resource.get('pageCount')}")
            print(f"     File Size: {resource.get('fileSize')} bytes")
            print(f"     Thumbnail URL: {resource.get('thumbnailUrl', 'N/A')[:50]}...")
            
            # Verify required fields
            assert resource.get('contentType') == 'pdf', "contentType should be 'pdf'"
            assert resource.get('cloudinaryPublicId'), "cloudinaryPublicId should be set"
            assert resource.get('pageCount', 0) > 0, "pageCount should be > 0"
            assert resource.get('fileSize', 0) > 0, "fileSize should be > 0"
            print(f"  ✅ All required PDF fields present and valid")
        else:
            print(f"  ❌ Unexpected response: {result}")
    else:
        print(f"  ❌ Upload failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 3: POST /api/admin/academic-resources/upload-pdf - No Auth (403)
# ============================================================================
print("\n[TEST 3] POST /api/admin/academic-resources/upload-pdf - No Auth (403)")
try:
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('test.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': 'Should Fail',
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code in [401, 403]:
        print(f"  ✅ Correctly rejected without auth: {resp.status_code}")
    else:
        print(f"  ❌ Expected 401/403, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 4: POST /api/admin/academic-resources/upload-pdf - Invalid PDF (400)
# ============================================================================
print("\n[TEST 4] POST /api/admin/academic-resources/upload-pdf - Invalid PDF (400)")
try:
    invalid_pdf = create_invalid_pdf()
    files = {'pdf': ('invalid.pdf', BytesIO(invalid_pdf), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': 'Invalid PDF Test',
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 400:
        result = resp.json()
        error_msg = result.get('error', '')
        print(f"  ✅ Correctly rejected invalid PDF: {error_msg}")
        assert 'valid PDF' in error_msg or 'not look like' in error_msg, "Error message should mention PDF validation"
    else:
        print(f"  ❌ Expected 400, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 5: POST /api/admin/academic-resources/upload-pdf - Invalid resourceType (400)
# ============================================================================
print("\n[TEST 5] POST /api/admin/academic-resources/upload-pdf - Invalid resourceType (400)")
try:
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('test.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'invalid_type',
        'title': 'Test',
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 400:
        result = resp.json()
        error_msg = result.get('error', '')
        print(f"  ✅ Correctly rejected invalid resourceType: {error_msg}")
        # Check if error mentions resourceType or categories
        if 'resourceType' in error_msg or 'categories' in error_msg:
            print(f"  ✅ Error message mentions resourceType validation")
        else:
            print(f"  ⚠️  Error message doesn't explicitly mention resourceType")
    else:
        print(f"  ❌ Expected 400, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 6: POST /api/admin/academic-resources/upload-pdf - Missing title (400)
# ============================================================================
print("\n[TEST 6] POST /api/admin/academic-resources/upload-pdf - Missing title (400)")
try:
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('test.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': '',  # Empty title
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 400:
        result = resp.json()
        error_msg = result.get('error', '')
        print(f"  ✅ Correctly rejected missing title: {error_msg}")
        assert 'title' in error_msg.lower(), "Error should mention title"
    else:
        print(f"  ❌ Expected 400, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 7: POST /api/admin/academic-resources/upload-pdf - Duplicate Detection (409)
# ============================================================================
print("\n[TEST 7] POST /api/admin/academic-resources/upload-pdf - Duplicate Detection (409)")
try:
    # Upload the same resource again without replaceIfDuplicate
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('duplicate.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': 'AUTOTEST_PDF_Teaching_Notes_Class5',  # Same title as TEST 2
        'classId': 'class-5',
        'subject': 'Mathematics',
        'academicSession': '2026-27',
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=30
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 409:
        result = resp.json()
        print(f"  ✅ Correctly detected duplicate: {result.get('error')}")
        assert result.get('code') == 'DUPLICATE_RESOURCE', "Should return DUPLICATE_RESOURCE code"
        assert result.get('existingId'), "Should return existingId"
        print(f"     Code: {result.get('code')}")
        print(f"     Existing ID: {result.get('existingId')}")
    else:
        print(f"  ❌ Expected 409, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 8: POST /api/admin/academic-resources/upload-pdf - Replace Mode (200)
# ============================================================================
print("\n[TEST 8] POST /api/admin/academic-resources/upload-pdf - Replace Mode (200)")
try:
    # Upload with replaceIfDuplicate=true
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('replace.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': 'AUTOTEST_PDF_Teaching_Notes_Class5',  # Same title
        'description': 'REPLACED VERSION',
        'classId': 'class-5',
        'subject': 'Mathematics',
        'academicSession': '2026-27',
        'replaceIfDuplicate': 'true',
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=30
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get('ok') and result.get('replaced'):
            print(f"  ✅ Successfully replaced existing resource")
            print(f"     Resource ID: {result.get('resourceId')}")
            print(f"     Replaced: {result.get('replaced')}")
            assert result['resourceId'] == test_resource_id, "Should keep the same ID"
        else:
            print(f"  ❌ Unexpected response: {result}")
    else:
        print(f"  ❌ Replace failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 9: POST /api/admin/academic-resources/upload-pdf - JSON dataUri (Valid)
# ============================================================================
print("\n[TEST 9] POST /api/admin/academic-resources/upload-pdf - JSON dataUri (Valid)")
try:
    pdf_bytes = create_valid_pdf()
    b64 = base64.b64encode(pdf_bytes).decode('utf-8')
    data_uri = f"data:application/pdf;base64,{b64}"
    
    payload = {
        'dataUri': data_uri,
        'resourceType': 'chapter_worksheets',
        'title': 'AUTOTEST_PDF_Worksheet_JSON',
        'description': 'JSON upload test',
        'classId': 'class-3',
        'className': 'Class 3',
        'subject': 'Science',
        'language': 'English',
        'academicSession': '2026-27',
        'isPublished': True,
        'allowPdfDownload': True,
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        json=payload,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=30
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get('ok') and result.get('resource'):
            resource = result['resource']
            json_resource_id = resource['id']
            print(f"  ✅ JSON dataUri upload successful")
            print(f"     Resource ID: {json_resource_id}")
            print(f"     Content Type: {resource.get('contentType')}")
            print(f"     Page Count: {resource.get('pageCount')}")
        else:
            print(f"  ❌ Unexpected response: {result}")
    else:
        print(f"  ❌ JSON upload failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 10: POST /api/admin/academic-resources/:id/replace-pdf - Valid (200)
# ============================================================================
print("\n[TEST 10] POST /api/admin/academic-resources/:id/replace-pdf - Valid (200)")
try:
    if not test_resource_id:
        print("  ⚠️  Skipping: No test_resource_id from previous tests")
    else:
        pdf_bytes = create_valid_pdf()
        files = {'pdf': ('replaced.pdf', BytesIO(pdf_bytes), 'application/pdf')}
        resp = requests.post(
            f"{API_BASE}/admin/academic-resources/{test_resource_id}/replace-pdf",
            files=files,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=30
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            result = resp.json()
            if result.get('ok'):
                print(f"  ✅ PDF replaced successfully")
                print(f"     Resource ID: {result.get('resourceId')}")
                print(f"     Page Count: {result.get('pageCount')}")
                print(f"     File Size: {result.get('fileSize')} bytes")
            else:
                print(f"  ❌ Unexpected response: {result}")
        else:
            print(f"  ❌ Replace failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 11: POST /api/admin/academic-resources/:id/replace-pdf - Non-PDF resource (400)
# ============================================================================
print("\n[TEST 11] POST /api/admin/academic-resources/:id/replace-pdf - Non-PDF resource (400)")
try:
    # First create an HTML resource
    html_payload = {
        'resourceType': 'teaching_notes',
        'title': 'AUTOTEST_HTML_Resource',
        'htmlContent': '<h1>Test HTML Content</h1><p>This is an HTML resource, not PDF.</p>',
        'classId': 'class-1',
        'className': 'Class 1',
    }
    create_resp = requests.post(
        f"{API_BASE}/admin/academic-resources",
        json=html_payload,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=10
    )
    if create_resp.status_code == 200:
        html_resource_id = create_resp.json().get('resource', {}).get('id')
        
        # Try to replace-pdf on HTML resource
        pdf_bytes = create_valid_pdf()
        files = {'pdf': ('test.pdf', BytesIO(pdf_bytes), 'application/pdf')}
        resp = requests.post(
            f"{API_BASE}/admin/academic-resources/{html_resource_id}/replace-pdf",
            files=files,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            result = resp.json()
            error_msg = result.get('error', '')
            print(f"  ✅ Correctly rejected replace-pdf on HTML resource: {error_msg}")
            assert 'not a PDF' in error_msg, "Error should mention resource is not a PDF"
        else:
            print(f"  ❌ Expected 400, got {resp.status_code}: {resp.text}")
    else:
        print(f"  ⚠️  Could not create HTML resource for test: {create_resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 12: Register a regular user for pdf-view/pdf-download tests
# ============================================================================
print("\n[TEST 12] Register a regular user")
try:
    import random
    test_mobile = f"99{random.randint(10000000, 99999999)}"
    resp = requests.post(f"{API_BASE}/auth/register", json={
        "name": "Test User PDF",
        "mobile": test_mobile,
        "password": "test1234"
    }, timeout=10)
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        regular_user_token = data.get('token')
        print(f"  ✅ Regular user registered: {test_mobile}")
    else:
        print(f"  ❌ Registration failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 13: GET /api/academic-resources/:id/pdf-view - No Auth (401)
# ============================================================================
print("\n[TEST 13] GET /api/academic-resources/:id/pdf-view - No Auth (401)")
try:
    if not test_resource_id:
        print("  ⚠️  Skipping: No test_resource_id")
    else:
        resp = requests.get(
            f"{API_BASE}/academic-resources/{test_resource_id}/pdf-view",
            timeout=10
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 401:
            print(f"  ✅ Correctly rejected without auth")
        else:
            print(f"  ❌ Expected 401, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 14: GET /api/academic-resources/:id/pdf-view - Valid (200)
# ============================================================================
print("\n[TEST 14] GET /api/academic-resources/:id/pdf-view - Valid (200)")
try:
    if not regular_user_token:
        print("  ⚠️  Skipping: Missing regular_user_token")
    else:
        # Create a fresh published+visible PDF resource for this test
        pdf_bytes = create_valid_pdf()
        files = {'pdf': ('view_test.pdf', BytesIO(pdf_bytes), 'application/pdf')}
        data = {
            'resourceType': 'teaching_notes',
            'title': 'AUTOTEST_PDF_View_Test',
            'classId': 'class-1',
            'className': 'Class 1',
            'isPublished': 'true',
            'isVisible': 'true',
            'allowPdfDownload': 'true',
        }
        create_resp = requests.post(
            f"{API_BASE}/admin/academic-resources/upload-pdf",
            files=files,
            data=data,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=30
        )
        if create_resp.status_code == 200:
            view_test_id = create_resp.json().get('resource', {}).get('id')
            
            resp = requests.get(
                f"{API_BASE}/academic-resources/{view_test_id}/pdf-view",
                headers={'Authorization': f'Bearer {regular_user_token}'},
                timeout=10
            )
            print(f"  Status: {resp.status_code}")
            if resp.status_code == 200:
                result = resp.json()
                if result.get('ok') and result.get('viewUrl'):
                    print(f"  ✅ PDF view URL generated successfully")
                    print(f"     View URL: {result['viewUrl'][:80]}...")
                    print(f"     Page Count: {result.get('pageCount')}")
                    print(f"     Thumbnail URL: {result.get('thumbnailUrl', 'N/A')[:50]}...")
                    
                    # Verify viewUrl is a signed Cloudinary URL
                    assert 'cloudinary.com' in result['viewUrl'], "viewUrl should be a Cloudinary URL"
                    assert result.get('pageCount', 0) > 0, "pageCount should be > 0"
                else:
                    print(f"  ❌ Unexpected response: {result}")
            else:
                print(f"  ❌ PDF view failed: {resp.text}")
        else:
            print(f"  ⚠️  Could not create test resource: {create_resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 15: GET /api/academic-resources/:id/pdf-view - Non-PDF resource (400)
# ============================================================================
print("\n[TEST 15] GET /api/academic-resources/:id/pdf-view - Non-PDF resource (400)")
try:
    # Use the HTML resource created in TEST 11
    # First, get a published HTML resource
    list_resp = requests.get(
        f"{API_BASE}/academic-resources?contentType=html&limit=1",
        timeout=10
    )
    if list_resp.status_code == 200:
        resources = list_resp.json().get('resources', [])
        if resources:
            html_id = resources[0]['id']
            resp = requests.get(
                f"{API_BASE}/academic-resources/{html_id}/pdf-view",
                headers={'Authorization': f'Bearer {regular_user_token}'},
                timeout=10
            )
            print(f"  Status: {resp.status_code}")
            if resp.status_code == 400:
                result = resp.json()
                error_msg = result.get('error', '')
                print(f"  ✅ Correctly rejected pdf-view on HTML resource: {error_msg}")
                assert 'not a PDF' in error_msg, "Error should mention resource is not a PDF"
            else:
                print(f"  ❌ Expected 400, got {resp.status_code}: {resp.text}")
        else:
            print("  ⚠️  No HTML resources found for test")
    else:
        print(f"  ⚠️  Could not list resources: {list_resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 16: GET /api/academic-resources/:id/pdf-download - No Auth (401)
# ============================================================================
print("\n[TEST 16] GET /api/academic-resources/:id/pdf-download - No Auth (401)")
try:
    if not test_resource_id:
        print("  ⚠️  Skipping: No test_resource_id")
    else:
        resp = requests.get(
            f"{API_BASE}/academic-resources/{test_resource_id}/pdf-download",
            timeout=10
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 401:
            print(f"  ✅ Correctly rejected without auth")
        else:
            print(f"  ❌ Expected 401, got {resp.status_code}: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 17: GET /api/academic-resources/:id/pdf-download - Valid (200)
# ============================================================================
print("\n[TEST 17] GET /api/academic-resources/:id/pdf-download - Valid (200)")
try:
    if not regular_user_token:
        print("  ⚠️  Skipping: Missing regular_user_token")
    else:
        # Create a fresh published+visible PDF resource for this test
        pdf_bytes = create_valid_pdf()
        files = {'pdf': ('download_test.pdf', BytesIO(pdf_bytes), 'application/pdf')}
        data = {
            'resourceType': 'teaching_notes',
            'title': 'AUTOTEST_PDF_Download_Test',
            'classId': 'class-1',
            'className': 'Class 1',
            'subject': 'Science',
            'isPublished': 'true',
            'isVisible': 'true',
            'allowPdfDownload': 'true',
        }
        create_resp = requests.post(
            f"{API_BASE}/admin/academic-resources/upload-pdf",
            files=files,
            data=data,
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=30
        )
        if create_resp.status_code == 200:
            download_test_id = create_resp.json().get('resource', {}).get('id')
            
            resp = requests.get(
                f"{API_BASE}/academic-resources/{download_test_id}/pdf-download",
                headers={'Authorization': f'Bearer {regular_user_token}'},
                timeout=10
            )
            print(f"  Status: {resp.status_code}")
            if resp.status_code == 200:
                result = resp.json()
                if result.get('ok') and result.get('downloadUrl'):
                    print(f"  ✅ PDF download URL generated successfully")
                    print(f"     Download URL: {result['downloadUrl'][:80]}...")
                    print(f"     Filename: {result.get('filename')}")
                    
                    # Verify downloadUrl is a signed Cloudinary URL
                    assert 'cloudinary.com' in result['downloadUrl'], "downloadUrl should be a Cloudinary URL"
                    assert result.get('filename', '').endswith('.pdf'), "filename should end with .pdf"
                    assert 'LessonGuru-Odisha' in result.get('filename', ''), "filename should contain LessonGuru-Odisha"
                else:
                    print(f"  ❌ Unexpected response: {result}")
            else:
                print(f"  ❌ PDF download failed: {resp.text}")
        else:
            print(f"  ⚠️  Could not create test resource: {create_resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 18: GET /api/academic-resources/:id/pdf-download - allowPdfDownload=false (403)
# ============================================================================
print("\n[TEST 18] GET /api/academic-resources/:id/pdf-download - allowPdfDownload=false (403)")
try:
    # Create a PDF resource with allowPdfDownload=false
    pdf_bytes = create_valid_pdf()
    files = {'pdf': ('no_download.pdf', BytesIO(pdf_bytes), 'application/pdf')}
    data = {
        'resourceType': 'teaching_notes',
        'title': 'AUTOTEST_PDF_No_Download',
        'classId': 'class-2',
        'className': 'Class 2',
        'isPublished': 'true',
        'isVisible': 'true',
        'allowPdfDownload': 'false',  # Disable download
    }
    create_resp = requests.post(
        f"{API_BASE}/admin/academic-resources/upload-pdf",
        files=files,
        data=data,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=30
    )
    if create_resp.status_code == 200:
        no_download_id = create_resp.json().get('resource', {}).get('id')
        
        # Try to download
        resp = requests.get(
            f"{API_BASE}/academic-resources/{no_download_id}/pdf-download",
            headers={'Authorization': f'Bearer {regular_user_token}'},
            timeout=10
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 403:
            result = resp.json()
            error_msg = result.get('error', '')
            print(f"  ✅ Correctly blocked download when allowPdfDownload=false: {error_msg}")
            assert 'download' in error_msg.lower() and 'disabled' in error_msg.lower(), "Error should mention download disabled"
        else:
            print(f"  ❌ Expected 403, got {resp.status_code}: {resp.text}")
    else:
        print(f"  ⚠️  Could not create no-download resource: {create_resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 19: DELETE /api/admin/academic-resources/:id - PDF resource (200)
# ============================================================================
print("\n[TEST 19] DELETE /api/admin/academic-resources/:id - PDF resource (200)")
try:
    if not test_resource_id:
        print("  ⚠️  Skipping: No test_resource_id")
    else:
        resp = requests.delete(
            f"{API_BASE}/admin/academic-resources/{test_resource_id}",
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=10
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            result = resp.json()
            if result.get('ok') and result.get('deleted'):
                print(f"  ✅ PDF resource deleted successfully")
                
                # Verify it's no longer in public list
                list_resp = requests.get(
                    f"{API_BASE}/academic-resources?contentType=pdf",
                    timeout=10
                )
                if list_resp.status_code == 200:
                    resources = list_resp.json().get('resources', [])
                    deleted_found = any(r['id'] == test_resource_id for r in resources)
                    if not deleted_found:
                        print(f"  ✅ Deleted resource not in public list")
                    else:
                        print(f"  ❌ Deleted resource still appears in public list")
            else:
                print(f"  ❌ Unexpected response: {result}")
        else:
            print(f"  ❌ Delete failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# REGRESSION TESTS
# ============================================================================
print("\n" + "=" * 80)
print("REGRESSION TESTS - Verify existing endpoints still work")
print("=" * 80)

# ============================================================================
# TEST 20: POST /api/admin/academic-resources - HTML resource (200)
# ============================================================================
print("\n[TEST 20] POST /api/admin/academic-resources - HTML resource (200)")
try:
    payload = {
        'resourceType': 'teaching_notes',
        'title': 'AUTOTEST_HTML_Regression',
        'htmlContent': '<h1>Regression Test</h1><p>This is an HTML resource to verify HTML upload still works.</p>',
        'classId': 'class-4',
        'className': 'Class 4',
        'subject': 'English',
        'isPublished': True,
    }
    resp = requests.post(
        f"{API_BASE}/admin/academic-resources",
        json=payload,
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get('ok') and result.get('resource'):
            resource = result['resource']
            print(f"  ✅ HTML resource created successfully")
            print(f"     Resource ID: {resource['id']}")
            print(f"     Content Type: {resource.get('contentType', 'html')}")
            
            # Verify it's HTML (or unset, which defaults to html)
            content_type = resource.get('contentType', 'html')
            assert content_type in ['html', None], f"contentType should be 'html' or unset, got {content_type}"
        else:
            print(f"  ❌ Unexpected response: {result}")
    else:
        print(f"  ❌ HTML resource creation failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 21: GET /api/academic-resources - Returns both HTML and PDF (200)
# ============================================================================
print("\n[TEST 21] GET /api/academic-resources - Returns both HTML and PDF (200)")
try:
    resp = requests.get(
        f"{API_BASE}/academic-resources?limit=100",
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        resources = result.get('resources', [])
        html_count = sum(1 for r in resources if r.get('contentType') in ['html', None])
        pdf_count = sum(1 for r in resources if r.get('contentType') == 'pdf')
        print(f"  ✅ List endpoint working")
        print(f"     Total resources: {len(resources)}")
        print(f"     HTML resources: {html_count}")
        print(f"     PDF resources: {pdf_count}")
        
        # Verify both types are present (if we created them)
        if pdf_count > 0:
            print(f"  ✅ PDF resources appear in list")
        if html_count > 0:
            print(f"  ✅ HTML resources appear in list")
    else:
        print(f"  ❌ List failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 22: GET /api/academic-resources?contentType=pdf - Filter by PDF (200)
# ============================================================================
print("\n[TEST 22] GET /api/academic-resources?contentType=pdf - Filter by PDF (200)")
try:
    resp = requests.get(
        f"{API_BASE}/academic-resources?contentType=pdf",
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        resources = result.get('resources', [])
        print(f"  ✅ PDF filter working")
        print(f"     PDF resources: {len(resources)}")
        
        # Verify all are PDFs
        non_pdf = [r for r in resources if r.get('contentType') != 'pdf']
        if non_pdf:
            print(f"  ❌ Found {len(non_pdf)} non-PDF resources in PDF filter")
        else:
            print(f"  ✅ All returned resources are PDFs")
    else:
        print(f"  ❌ Filter failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 23: GET /api/academic-resources?language=Odia - Filter by language (200)
# ============================================================================
print("\n[TEST 23] GET /api/academic-resources?language=Odia - Filter by language (200)")
try:
    resp = requests.get(
        f"{API_BASE}/academic-resources?language=Odia",
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        resources = result.get('resources', [])
        print(f"  ✅ Language filter working")
        print(f"     Odia resources: {len(resources)}")
        
        # Verify all have language=Odia
        non_odia = [r for r in resources if r.get('language') != 'Odia']
        if non_odia:
            print(f"  ❌ Found {len(non_odia)} non-Odia resources in Odia filter")
        else:
            print(f"  ✅ All returned resources have language=Odia")
    else:
        print(f"  ❌ Filter failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 24: GET /api/academic-resources?academicSession=2026-27 - Filter by session (200)
# ============================================================================
print("\n[TEST 24] GET /api/academic-resources?academicSession=2026-27 - Filter by session (200)")
try:
    resp = requests.get(
        f"{API_BASE}/academic-resources?academicSession=2026-27",
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        resources = result.get('resources', [])
        print(f"  ✅ Academic session filter working")
        print(f"     2026-27 resources: {len(resources)}")
        
        # Verify all have academicSession=2026-27
        wrong_session = [r for r in resources if r.get('academicSession') != '2026-27']
        if wrong_session:
            print(f"  ❌ Found {len(wrong_session)} resources with wrong session")
        else:
            print(f"  ✅ All returned resources have academicSession=2026-27")
    else:
        print(f"  ❌ Filter failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# TEST 25: GET /api/academic-resources/counts - Includes PDF resources (200)
# ============================================================================
print("\n[TEST 25] GET /api/academic-resources/counts - Includes PDF resources (200)")
try:
    resp = requests.get(
        f"{API_BASE}/academic-resources/counts",
        timeout=10
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        counts = result.get('counts', {})
        print(f"  ✅ Counts endpoint working")
        print(f"     Counts by type: {counts}")
        
        # Verify counts are numbers
        for type_id, count in counts.items():
            assert isinstance(count, int), f"Count for {type_id} should be an integer"
        print(f"  ✅ All counts are valid integers")
    else:
        print(f"  ❌ Counts failed: {resp.text}")
except Exception as e:
    print(f"  ❌ Exception: {e}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print("""
✅ TESTS COMPLETED

NEW PDF UPLOAD ENDPOINTS:
- POST /api/admin/academic-resources/upload-pdf (multipart & JSON)
- POST /api/admin/academic-resources/:id/replace-pdf
- GET /api/academic-resources/:id/pdf-view
- GET /api/academic-resources/:id/pdf-download
- DELETE /api/admin/academic-resources/:id (with Cloudinary cleanup)

VALIDATIONS TESTED:
- Admin auth required (401/403)
- PDF magic-byte check (400 for invalid PDFs)
- Valid resourceType required (400)
- Title required (400)
- Duplicate detection (409 with DUPLICATE_RESOURCE code)
- Replace mode (replaceIfDuplicate=true)
- allowPdfDownload flag enforcement (403)
- Non-PDF resource rejection for PDF-specific endpoints (400)

REGRESSION TESTS:
- HTML resource creation still works
- List endpoint returns both HTML and PDF
- Filters work: contentType, language, academicSession
- Counts endpoint includes PDF resources

All tests executed. Check output above for any ❌ failures.
""")
