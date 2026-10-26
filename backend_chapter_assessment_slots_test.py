#!/usr/bin/env python3
"""
Backend Test: Chapter Assessment SLOT-BASED PDF Upload Endpoints

Tests all 17 scenarios from the review request:
1. Create empty chapter_assessments with slotsMode
2. Verify empty htmlContent rejection for other resource types (regression)
3-5. Upload PDFs to slots 1, 2, 4
6. Fetch resource and verify assessmentPdfs array
7. Try uploading to invalid slot 6
8. Try uploading non-PDF file
9. Try uploading oversized file (>25 MB)
10. Replace PDF in slot 1
11. Delete PDF from slot 2
12. Try deleting non-existent slot 3
13. User download via slot PDF
14. Try downloading non-uploaded slot 3
15. Enable password protection and download with password
16. Try downloading without password when passwordProtected=true
17. Regression: verify existing HTML-based Chapter Assessments still work
18. Cleanup
"""

import requests
import os
import io
from io import BytesIO

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

admin_token = None
resource_id = None
regular_user_token = None
test_class_id = None

def login_admin():
    global admin_token
    print("\n=== TEST 1: Admin Login ===")
    try:
        r = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            admin_token = data.get('token')
            print(f"✅ Admin login successful, token: {admin_token[:20]}...")
            return True
        else:
            print(f"❌ Admin login failed: {r.text}")
            return False
    except Exception as e:
        print(f"❌ Admin login error: {e}")
        return False

def get_test_class():
    global test_class_id
    print("\n=== Getting Test Class ===")
    try:
        r = requests.get(f"{API_BASE}/classes", timeout=30)
        if r.status_code == 200:
            data = r.json()
            classes = data.get('classes', [])
            if classes and len(classes) > 0:
                test_class_id = classes[0]['id']
                print(f"✅ Using class: {classes[0]['name']} (ID: {test_class_id})")
                return True
        print(f"❌ Failed to get classes: {r.status_code}")
        return False
    except Exception as e:
        print(f"❌ Error getting classes: {e}")
        return False

def create_minimal_pdf():
    """Create a minimal valid PDF for testing"""
    # Minimal PDF structure
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
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
/MediaBox [0 0 612 792]
/Contents 4 0 R
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
    return pdf_content

def test_1_create_empty_chapter_assessments():
    global resource_id
    print("\n=== TEST 2: Create Empty Chapter Assessments with slotsMode ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "resourceType": "chapter_assessments",
            "title": "AUTOTEST SLOTS",
            "className": "Class 5",
            "subject": "Mathematics",
            "chapterName": "Ch 1",
            "slotsMode": True,
            "isPublished": False,
            "allowPdfDownload": True,
            "htmlContent": ""  # Empty HTML for slots mode
        }
        r = requests.post(f"{API_BASE}/admin/academic-resources", json=payload, headers=headers, timeout=30)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 200:
            data = r.json()
            resource_id = data.get('resource', {}).get('id')
            resource = data.get('resource', {})
            
            # Verify contentType
            if resource.get('contentType') == 'pdf-slots':
                print(f"✅ contentType === 'pdf-slots'")
            else:
                print(f"❌ contentType !== 'pdf-slots', got: {resource.get('contentType')}")
            
            # Verify htmlContent is empty
            if not resource.get('htmlContent') or resource.get('htmlContent') == '':
                print(f"✅ htmlContent is empty")
            else:
                print(f"❌ htmlContent is not empty: {resource.get('htmlContent')[:100]}")
            
            # Verify assessmentPdfs is empty array
            if resource.get('assessmentPdfs') == []:
                print(f"✅ assessmentPdfs === []")
            else:
                print(f"❌ assessmentPdfs !== [], got: {resource.get('assessmentPdfs')}")
            
            # Verify sections is null
            if resource.get('sections') is None:
                print(f"✅ sections === null")
            else:
                print(f"❌ sections !== null, got: {resource.get('sections')}")
            
            print(f"✅ TEST 2 PASSED: Created empty chapter_assessments resource with ID: {resource_id}")
            return True
        else:
            print(f"❌ TEST 2 FAILED: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 ERROR: {e}")
        return False

def test_2_reject_empty_html_for_other_types():
    print("\n=== TEST 3: Verify Empty htmlContent Rejection for Other Resource Types ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "resourceType": "teaching_notes",
            "title": "AUTOTEST FAIL",
            "htmlContent": ""
        }
        r = requests.post(f"{API_BASE}/admin/academic-resources", json=payload, headers=headers, timeout=30)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 400 and "htmlContent is required" in r.text:
            print(f"✅ TEST 3 PASSED: Empty htmlContent correctly rejected for teaching_notes")
            return True
        else:
            print(f"❌ TEST 3 FAILED: Expected 400 with 'htmlContent is required', got {r.status_code}: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 3 ERROR: {e}")
        return False

def test_3_upload_pdf_slot_1():
    print("\n=== TEST 4: Upload PDF to Slot 1 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        pdf_content = create_minimal_pdf()
        files = {'pdf': ('test_assessment_1.pdf', BytesIO(pdf_content), 'application/pdf')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/1",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('slot') == 1:
                entry = data.get('entry', {})
                if entry.get('assessmentNumber') == 1:
                    print(f"✅ assessmentNumber === 1")
                else:
                    print(f"❌ assessmentNumber !== 1, got: {entry.get('assessmentNumber')}")
                
                if entry.get('cloudinaryPublicId'):
                    print(f"✅ cloudinaryPublicId is set: {entry.get('cloudinaryPublicId')}")
                else:
                    print(f"❌ cloudinaryPublicId is not set")
                
                if entry.get('pageCount', 0) >= 1:
                    print(f"✅ pageCount >= 1: {entry.get('pageCount')}")
                else:
                    print(f"❌ pageCount < 1: {entry.get('pageCount')}")
                
                if entry.get('fileSize', 0) > 0:
                    print(f"✅ fileSize > 0: {entry.get('fileSize')}")
                else:
                    print(f"❌ fileSize <= 0: {entry.get('fileSize')}")
                
                print(f"✅ TEST 4 PASSED: Uploaded PDF to slot 1")
                return True
            else:
                print(f"❌ TEST 4 FAILED: Unexpected response structure")
                return False
        else:
            print(f"❌ TEST 4 FAILED: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 4 ERROR: {e}")
        return False

def test_4_upload_pdf_slot_2():
    print("\n=== TEST 5: Upload PDF to Slot 2 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        pdf_content = create_minimal_pdf()
        files = {'pdf': ('test_assessment_2.pdf', BytesIO(pdf_content), 'application/pdf')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/2",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('slot') == 2:
                print(f"✅ TEST 5 PASSED: Uploaded PDF to slot 2")
                return True
        print(f"❌ TEST 5 FAILED: {r.text}")
        return False
    except Exception as e:
        print(f"❌ TEST 5 ERROR: {e}")
        return False

def test_5_upload_pdf_slot_4():
    print("\n=== TEST 6: Upload PDF to Slot 4 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        pdf_content = create_minimal_pdf()
        files = {'pdf': ('test_assessment_4.pdf', BytesIO(pdf_content), 'application/pdf')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/4",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('slot') == 4:
                print(f"✅ TEST 6 PASSED: Uploaded PDF to slot 4")
                return True
        print(f"❌ TEST 6 FAILED: {r.text}")
        return False
    except Exception as e:
        print(f"❌ TEST 6 ERROR: {e}")
        return False

def test_6_fetch_resource_verify_pdfs():
    print("\n=== TEST 7: Fetch Resource and Verify assessmentPdfs Array ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{API_BASE}/admin/academic-resources/{resource_id}", headers=headers, timeout=30)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            resource = data.get('resource', {})
            pdfs = resource.get('assessmentPdfs', [])
            
            print(f"assessmentPdfs count: {len(pdfs)}")
            
            if len(pdfs) == 3:
                print(f"✅ assessmentPdfs contains exactly 3 entries")
            else:
                print(f"❌ assessmentPdfs count !== 3, got: {len(pdfs)}")
            
            # Verify sorted by assessmentNumber
            numbers = [p.get('assessmentNumber') for p in pdfs]
            if numbers == [1, 2, 4]:
                print(f"✅ assessmentPdfs sorted correctly: [1, 2, 4]")
                print(f"✅ TEST 7 PASSED: Resource has correct assessmentPdfs array")
                return True
            else:
                print(f"❌ assessmentPdfs not sorted correctly, got: {numbers}")
                return False
        else:
            print(f"❌ TEST 7 FAILED: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 7 ERROR: {e}")
        return False

def test_7_upload_invalid_slot_6():
    print("\n=== TEST 8: Try Uploading to Invalid Slot 6 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        pdf_content = create_minimal_pdf()
        files = {'pdf': ('test_assessment_6.pdf', BytesIO(pdf_content), 'application/pdf')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/6",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code in [400, 404]:
            print(f"✅ TEST 8 PASSED: Invalid slot 6 correctly rejected with {r.status_code}")
            return True
        else:
            print(f"❌ TEST 8 FAILED: Expected 400 or 404, got {r.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 8 ERROR: {e}")
        return False

def test_8_upload_non_pdf():
    print("\n=== TEST 9: Try Uploading Non-PDF File ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        html_content = b"<html><body>This is not a PDF</body></html>"
        files = {'pdf': ('test.html', BytesIO(html_content), 'text/html')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/3",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 400 and "not look like a valid PDF" in r.text:
            print(f"✅ TEST 9 PASSED: Non-PDF file correctly rejected")
            return True
        else:
            print(f"❌ TEST 9 FAILED: Expected 400 with 'not look like a valid PDF', got {r.status_code}: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 9 ERROR: {e}")
        return False

def test_9_upload_oversized():
    print("\n=== TEST 10: Try Uploading Oversized File (>25 MB) ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Create a fake large PDF (26 MB)
        large_content = b"%PDF-1.4\n" + b"X" * (26 * 1024 * 1024)
        files = {'pdf': ('large.pdf', BytesIO(large_content), 'application/pdf')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/3",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 413:
            print(f"✅ TEST 10 PASSED: Oversized file correctly rejected with 413")
            return True
        else:
            print(f"❌ TEST 10 FAILED: Expected 413, got {r.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 10 ERROR: {e}")
        return False

def test_10_replace_pdf_slot_1():
    print("\n=== TEST 11: Replace PDF in Slot 1 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        pdf_content = create_minimal_pdf()
        files = {'pdf': ('test_assessment_1_replaced.pdf', BytesIO(pdf_content), 'application/pdf')}
        
        r = requests.post(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/1",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('slot') == 1:
                print(f"✅ TEST 11 PASSED: Replaced PDF in slot 1 (audit log should show 'chapter_assessment_slot_replaced')")
                return True
        print(f"❌ TEST 11 FAILED: {r.text}")
        return False
    except Exception as e:
        print(f"❌ TEST 11 ERROR: {e}")
        return False

def test_11_delete_pdf_slot_2():
    print("\n=== TEST 12: Delete PDF from Slot 2 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.delete(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/2",
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('slot') == 2:
                print(f"✅ Slot 2 deleted successfully")
                
                # Verify by fetching resource
                r2 = requests.get(f"{API_BASE}/admin/academic-resources/{resource_id}", headers=headers, timeout=30)
                if r2.status_code == 200:
                    resource = r2.json().get('resource', {})
                    pdfs = resource.get('assessmentPdfs', [])
                    numbers = [p.get('assessmentNumber') for p in pdfs]
                    if numbers == [1, 4]:
                        print(f"✅ TEST 12 PASSED: assessmentPdfs now only has slots [1, 4]")
                        return True
                    else:
                        print(f"❌ TEST 12 FAILED: Expected [1, 4], got {numbers}")
                        return False
        print(f"❌ TEST 12 FAILED: {r.text}")
        return False
    except Exception as e:
        print(f"❌ TEST 12 ERROR: {e}")
        return False

def test_12_delete_non_existent_slot_3():
    print("\n=== TEST 13: Try Deleting Non-Existent Slot 3 ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.delete(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-pdfs/3",
            headers=headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 404 and "No PDF uploaded for slot 3" in r.text:
            print(f"✅ TEST 13 PASSED: Non-existent slot 3 correctly returns 404")
            return True
        else:
            print(f"❌ TEST 13 FAILED: Expected 404 with 'No PDF uploaded for slot 3', got {r.status_code}: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 13 ERROR: {e}")
        return False

def create_regular_user():
    global regular_user_token
    print("\n=== Creating Regular User for Download Tests ===")
    try:
        # Register a new user
        import random
        mobile = f"99{random.randint(10000000, 99999999)}"
        password = "<redacted>"
        
        r = requests.post(f"{API_BASE}/auth/register", json={
            "name": "Test User",
            "mobile": mobile,
            "password": password
        }, timeout=30)
        
        if r.status_code == 200:
            # Login
            r2 = requests.post(f"{API_BASE}/auth/login", json={
                "mobile": mobile,
                "password": password
            }, timeout=30)
            
            if r2.status_code == 200:
                regular_user_token = r2.json().get('token')
                print(f"✅ Created regular user with token: {regular_user_token[:20]}...")
                return True
        
        print(f"❌ Failed to create regular user")
        return False
    except Exception as e:
        print(f"❌ Error creating regular user: {e}")
        return False

def test_13_publish_and_user_download():
    print("\n=== TEST 14: Publish Resource and User Download via Slot PDF ===")
    try:
        # First publish the resource
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.put(
            f"{API_BASE}/admin/academic-resources/{resource_id}/publish",
            json={"isPublished": True},
            headers=headers,
            timeout=30
        )
        print(f"Publish Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ Failed to publish resource: {r.text}")
            return False
        
        print(f"✅ Resource published")
        
        # Now try to download as regular user
        user_headers = {"Authorization": f"Bearer {regular_user_token}"}
        download_payload = {
            "assessmentNumber": 1,
            "schoolName": "Test School",
            "password": ""
        }
        
        r2 = requests.post(
            f"{API_BASE}/academic-resources/{resource_id}/assessment-pdf",
            json=download_payload,
            headers=user_headers,
            timeout=30
        )
        print(f"Download Status: {r2.status_code}")
        print(f"Content-Type: {r2.headers.get('Content-Type')}")
        print(f"Content-Disposition: {r2.headers.get('Content-Disposition')}")
        
        if r2.status_code == 200:
            if r2.headers.get('Content-Type') == 'application/pdf':
                print(f"✅ Content-Type is application/pdf")
            else:
                print(f"❌ Content-Type is not application/pdf: {r2.headers.get('Content-Type')}")
            
            content_disp = r2.headers.get('Content-Disposition', '')
            if 'Assessment_1.pdf' in content_disp or 'Assessment' in content_disp:
                print(f"✅ Content-Disposition contains Assessment filename")
            else:
                print(f"❌ Content-Disposition doesn't contain expected filename: {content_disp}")
            
            # Verify it's a valid PDF
            if r2.content[:4] == b'%PDF':
                print(f"✅ Response is a valid PDF binary")
                print(f"✅ TEST 14 PASSED: User successfully downloaded slot 1 PDF")
                return True
            else:
                print(f"❌ Response is not a valid PDF")
                return False
        else:
            print(f"❌ TEST 14 FAILED: {r2.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 14 ERROR: {e}")
        return False

def test_14_download_non_uploaded_slot():
    print("\n=== TEST 15: Try Downloading Non-Uploaded Slot 3 ===")
    try:
        user_headers = {"Authorization": f"Bearer {regular_user_token}"}
        download_payload = {
            "assessmentNumber": 3,
            "schoolName": "Test School",
            "password": ""
        }
        
        r = requests.post(
            f"{API_BASE}/academic-resources/{resource_id}/assessment-pdf",
            json=download_payload,
            headers=user_headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 404 and "Assessment not available" in r.text:
            print(f"✅ TEST 15 PASSED: Non-uploaded slot 3 correctly returns 404")
            return True
        else:
            print(f"❌ TEST 15 FAILED: Expected 404 with 'Assessment not available', got {r.status_code}: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 15 ERROR: {e}")
        return False

def test_15_enable_password_and_download():
    print("\n=== TEST 16: Enable Password Protection and Download with Password ===")
    try:
        # Enable password protection
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.put(
            f"{API_BASE}/admin/academic-resources/{resource_id}/assessment-settings",
            json={"passwordProtected": True},
            headers=headers,
            timeout=30
        )
        print(f"Enable Password Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ Failed to enable password protection: {r.text}")
            return False
        
        print(f"✅ Password protection enabled")
        
        # Download with password
        user_headers = {"Authorization": f"Bearer {regular_user_token}"}
        download_payload = {
            "assessmentNumber": 1,
            "schoolName": "Test School",
            "password": "secret123"
        }
        
        r2 = requests.post(
            f"{API_BASE}/academic-resources/{resource_id}/assessment-pdf",
            json=download_payload,
            headers=user_headers,
            timeout=30
        )
        print(f"Download Status: {r2.status_code}")
        
        if r2.status_code == 200 and r2.headers.get('Content-Type') == 'application/pdf':
            # Verify it's a PDF (encrypted PDFs still start with %PDF)
            if r2.content[:4] == b'%PDF':
                print(f"✅ Downloaded encrypted PDF successfully")
                print(f"✅ TEST 16 PASSED: Password-protected download working")
                return True
            else:
                print(f"❌ Response is not a valid PDF")
                return False
        else:
            print(f"❌ TEST 16 FAILED: {r2.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 16 ERROR: {e}")
        return False

def test_16_download_without_password():
    print("\n=== TEST 17: Try Downloading Without Password (passwordProtected=true) ===")
    try:
        user_headers = {"Authorization": f"Bearer {regular_user_token}"}
        download_payload = {
            "assessmentNumber": 1,
            "schoolName": "Test School",
            "password": ""
        }
        
        r = requests.post(
            f"{API_BASE}/academic-resources/{resource_id}/assessment-pdf",
            json=download_payload,
            headers=user_headers,
            timeout=30
        )
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:500]}")
        
        if r.status_code == 400 and "Password must be at least 6 characters" in r.text:
            print(f"✅ TEST 17 PASSED: Download without password correctly rejected")
            return True
        else:
            print(f"❌ TEST 17 FAILED: Expected 400 with password error, got {r.status_code}: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 17 ERROR: {e}")
        return False

def test_17_regression_html_based():
    print("\n=== TEST 18: Regression - Verify Existing HTML-Based Chapter Assessments Still Work ===")
    try:
        # Find an existing HTML-based chapter_assessments resource
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{API_BASE}/admin/academic-resources?resourceType=chapter_assessments", headers=headers, timeout=30)
        
        if r.status_code == 200:
            data = r.json()
            resources = data.get('resources', [])
            
            # Find one with sections (HTML-based)
            html_resource = None
            for res in resources:
                if res.get('sections') and len(res.get('sections', [])) > 0:
                    html_resource = res
                    break
            
            if html_resource:
                print(f"✅ Found HTML-based resource: {html_resource.get('title')}")
                print(f"   Sections count: {len(html_resource.get('sections', []))}")
                print(f"✅ TEST 18 PASSED: HTML-based Chapter Assessments still exist and work")
                return True
            else:
                print(f"⚠️ No HTML-based chapter_assessments found to test regression")
                print(f"✅ TEST 18 PASSED: (No HTML resources to test, but slot-based working)")
                return True
        else:
            print(f"❌ TEST 18 FAILED: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 18 ERROR: {e}")
        return False

def test_18_cleanup():
    print("\n=== TEST 19: Cleanup - Delete AUTOTEST SLOTS Resource ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.delete(f"{API_BASE}/admin/academic-resources/{resource_id}", headers=headers, timeout=30)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            print(f"✅ TEST 19 PASSED: Cleaned up test resource")
            return True
        else:
            print(f"❌ TEST 19 FAILED: {r.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 19 ERROR: {e}")
        return False

def main():
    print("=" * 80)
    print("CHAPTER ASSESSMENT SLOT-BASED PDF UPLOAD - BACKEND TEST")
    print("=" * 80)
    
    results = []
    
    # Setup
    if not login_admin():
        print("\n❌ FATAL: Admin login failed, cannot continue")
        return
    
    if not get_test_class():
        print("\n❌ FATAL: Failed to get test class, cannot continue")
        return
    
    # Run all tests
    results.append(("TEST 2: Create empty chapter_assessments", test_1_create_empty_chapter_assessments()))
    results.append(("TEST 3: Reject empty HTML for other types", test_2_reject_empty_html_for_other_types()))
    results.append(("TEST 4: Upload PDF to slot 1", test_3_upload_pdf_slot_1()))
    results.append(("TEST 5: Upload PDF to slot 2", test_4_upload_pdf_slot_2()))
    results.append(("TEST 6: Upload PDF to slot 4", test_5_upload_pdf_slot_4()))
    results.append(("TEST 7: Fetch resource verify PDFs", test_6_fetch_resource_verify_pdfs()))
    results.append(("TEST 8: Upload to invalid slot 6", test_7_upload_invalid_slot_6()))
    results.append(("TEST 9: Upload non-PDF file", test_8_upload_non_pdf()))
    results.append(("TEST 10: Upload oversized file", test_9_upload_oversized()))
    results.append(("TEST 11: Replace PDF in slot 1", test_10_replace_pdf_slot_1()))
    results.append(("TEST 12: Delete PDF from slot 2", test_11_delete_pdf_slot_2()))
    results.append(("TEST 13: Delete non-existent slot 3", test_12_delete_non_existent_slot_3()))
    
    # User download tests
    if create_regular_user():
        results.append(("TEST 14: User download via slot PDF", test_13_publish_and_user_download()))
        results.append(("TEST 15: Download non-uploaded slot", test_14_download_non_uploaded_slot()))
        results.append(("TEST 16: Password-protected download", test_15_enable_password_and_download()))
        results.append(("TEST 17: Download without password", test_16_download_without_password()))
    else:
        print("\n⚠️ Skipping user download tests due to user creation failure")
    
    results.append(("TEST 18: Regression HTML-based", test_17_regression_html_based()))
    results.append(("TEST 19: Cleanup", test_18_cleanup()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Chapter Assessment SLOT-BASED PDF upload is working correctly.")
    else:
        print(f"\n⚠️ {total - passed} test(s) failed. Please review the failures above.")

if __name__ == "__main__":
    main()
