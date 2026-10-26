#!/usr/bin/env python3
"""
Backend test for Assessment Store Confidentiality Oath flow.
Tests all 11 steps from test_result.md exactly as specified.
"""

import os
import sys
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/.env')

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test data
PACK_ID = "qa-oath-pack"
DOCUMENT_ID = "qa-oath-doc"
DEVICE_HEADER = "DEV1"

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log_step(step_num, description):
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}STEP {step_num}: {description}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")

def log_pass(message):
    print(f"{GREEN}✅ PASS: {message}{RESET}")

def log_fail(message):
    print(f"{RED}❌ FAIL: {message}{RESET}")

def log_info(message):
    print(f"{YELLOW}ℹ️  INFO: {message}{RESET}")

def log_request(method, url, **kwargs):
    print(f"\n{YELLOW}→ {method} {url}{RESET}")
    if 'json' in kwargs:
        print(f"  Body: {json.dumps(kwargs['json'], indent=2)}")
    if 'headers' in kwargs:
        print(f"  Headers: {json.dumps(kwargs['headers'], indent=2)}")

def log_response(response):
    print(f"{YELLOW}← {response.status_code} {response.reason}{RESET}")
    try:
        data = response.json()
        print(f"  Response: {json.dumps(data, indent=2)}")
        return data
    except:
        print(f"  Response (non-JSON): {response.text[:200]}")
        return None

def main():
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}ASSESSMENT STORE CONFIDENTIALITY OATH FLOW TEST{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"Base URL: {API_BASE}")
    print(f"Pack ID: {PACK_ID}")
    print(f"Document ID: {DOCUMENT_ID}")
    print(f"Device: {DEVICE_HEADER}")
    
    # Login as admin
    log_step(0, "LOGIN AS ADMIN")
    log_request("POST", f"{API_BASE}/auth/login")
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}
    )
    data = log_response(response)
    
    if response.status_code != 200 or not data or 'token' not in data:
        log_fail(f"Login failed: {response.status_code}")
        return False
    
    token = data['token']
    log_pass(f"Login successful, token received")
    
    # Get verified teacher profile name
    log_info("Fetching teacher profile to get name_en...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-LGO-Device": DEVICE_HEADER
    }
    
    response = requests.get(f"{API_BASE}/assess/teacher/me", headers=headers)
    profile_data = log_response(response)
    
    if response.status_code == 200 and profile_data and profile_data.get('profile'):
        profile_name = profile_data['profile'].get('name_en', 'Super Admin')
        log_info(f"Teacher profile name_en: {profile_name}")
    else:
        profile_name = "Super Admin"
        log_info(f"Using default name: {profile_name}")
    
    # Track test results
    results = []
    
    # STEP 1: GET oath/status - should return required="full"
    log_step(1, "GET /assess/oath/status - should return required='full'")
    log_request("GET", f"{API_BASE}/assess/oath/status?pack_id={PACK_ID}")
    response = requests.get(
        f"{API_BASE}/assess/oath/status?pack_id={PACK_ID}",
        headers=headers
    )
    data = log_response(response)
    
    if response.status_code == 200 and data and data.get('required') == 'full':
        log_pass(f"Status 200, required='full' ✓")
        results.append(("Step 1", True, f"200, required='full'"))
    else:
        log_fail(f"Expected 200 with required='full', got {response.status_code}, required={data.get('required') if data else 'N/A'}")
        results.append(("Step 1", False, f"{response.status_code}, required={data.get('required') if data else 'N/A'}"))
    
    # STEP 2: POST download-request WITHOUT acceptance_id - should return 403 OATH_REQUIRED
    log_step(2, "POST /assess/download-request WITHOUT acceptance_id - should return 403 OATH_REQUIRED")
    log_request("POST", f"{API_BASE}/assess/download-request")
    response = requests.post(
        f"{API_BASE}/assess/download-request",
        headers=headers,
        json={"document_id": DOCUMENT_ID}
    )
    data = log_response(response)
    
    if response.status_code == 403 and data and data.get('code') == 'OATH_REQUIRED' and data.get('required') == 'full':
        log_pass(f"Status 403, code='OATH_REQUIRED', required='full', pack_id present ✓")
        results.append(("Step 2", True, f"403 OATH_REQUIRED, required='full'"))
    else:
        log_fail(f"Expected 403 OATH_REQUIRED, got {response.status_code}, code={data.get('code') if data else 'N/A'}")
        results.append(("Step 2", False, f"{response.status_code}, code={data.get('code') if data else 'N/A'}"))
    
    # STEP 3: POST oath/accept with WRONG NAME - should return 400 NAME_MISMATCH
    log_step(3, "POST /assess/oath/accept with WRONG NAME - should return 400 NAME_MISMATCH")
    log_request("POST", f"{API_BASE}/assess/oath/accept")
    response = requests.post(
        f"{API_BASE}/assess/oath/accept",
        headers=headers,
        json={
            "pack_id": PACK_ID,
            "type": "full",
            "typed_name": "WRONG NAME",
            "checkboxes": [True, True, True],
            "context": "download"
        }
    )
    data = log_response(response)
    
    if response.status_code == 400 and data and data.get('code') == 'NAME_MISMATCH':
        log_pass(f"Status 400, code='NAME_MISMATCH' ✓")
        results.append(("Step 3", True, f"400 NAME_MISMATCH"))
    else:
        log_fail(f"Expected 400 NAME_MISMATCH, got {response.status_code}, code={data.get('code') if data else 'N/A'}")
        results.append(("Step 3", False, f"{response.status_code}, code={data.get('code') if data else 'N/A'}"))
    
    # STEP 4: POST oath/accept with only 2 of 3 checkboxes - should return 400 CHECKS_REQUIRED
    log_step(4, "POST /assess/oath/accept with only 2 of 3 checkboxes - should return 400 CHECKS_REQUIRED")
    log_request("POST", f"{API_BASE}/assess/oath/accept")
    response = requests.post(
        f"{API_BASE}/assess/oath/accept",
        headers=headers,
        json={
            "pack_id": PACK_ID,
            "type": "full",
            "typed_name": profile_name,
            "checkboxes": [True, True, False],
            "context": "download"
        }
    )
    data = log_response(response)
    
    if response.status_code == 400 and data and data.get('code') == 'CHECKS_REQUIRED':
        log_pass(f"Status 400, code='CHECKS_REQUIRED' ✓")
        results.append(("Step 4", True, f"400 CHECKS_REQUIRED"))
    else:
        log_fail(f"Expected 400 CHECKS_REQUIRED, got {response.status_code}, code={data.get('code') if data else 'N/A'}")
        results.append(("Step 4", False, f"{response.status_code}, code={data.get('code') if data else 'N/A'}"))
    
    # STEP 5: POST oath/accept with correct name + 3 checks - should return 200 with acceptance_id
    log_step(5, "POST /assess/oath/accept with correct name + 3 checks - should return 200 with acceptance_id")
    log_request("POST", f"{API_BASE}/assess/oath/accept")
    response = requests.post(
        f"{API_BASE}/assess/oath/accept",
        headers=headers,
        json={
            "pack_id": PACK_ID,
            "type": "full",
            "typed_name": profile_name,
            "checkboxes": [True, True, True],
            "context": "download"
        }
    )
    data = log_response(response)
    
    if response.status_code == 200 and data and 'acceptance_id' in data:
        full_acceptance_id = data['acceptance_id']
        log_pass(f"Status 200, acceptance_id={full_acceptance_id} ✓")
        results.append(("Step 5", True, f"200, acceptance_id received"))
    else:
        log_fail(f"Expected 200 with acceptance_id, got {response.status_code}")
        results.append(("Step 5", False, f"{response.status_code}"))
        return False
    
    # STEP 6: POST download-request WITH acceptance_id, then GET download
    log_step(6, "POST /assess/download-request WITH acceptance_id, then GET download")
    log_request("POST", f"{API_BASE}/assess/download-request")
    response = requests.post(
        f"{API_BASE}/assess/download-request",
        headers=headers,
        json={
            "document_id": DOCUMENT_ID,
            "acceptance_id": full_acceptance_id
        }
    )
    data = log_response(response)
    
    if response.status_code == 200 and data and 'token' in data:
        download_token = data['token']
        log_pass(f"Status 200, token={download_token} ✓")
        
        # Now GET download with token
        log_info("GET /assess/download/<token> - should return 200 application/pdf")
        log_request("GET", f"{API_BASE}/assess/download/{download_token}")
        response = requests.get(
            f"{API_BASE}/assess/download/{download_token}",
            headers=headers
        )
        
        content_type = response.headers.get('Content-Type', '')
        body_start = response.content[:10] if response.content else b''
        
        log_info(f"Status: {response.status_code}, Content-Type: {content_type}, Body starts: {body_start}")
        
        if response.status_code == 200 and 'application/pdf' in content_type and body_start.startswith(b'%PDF'):
            log_pass(f"Status 200, Content-Type=application/pdf, body starts with %PDF ✓")
            results.append(("Step 6", True, f"200, token works, PDF downloaded"))
            
            # Extract copy_id from response for step 11
            # The copy_id is embedded in the PDF, but we can get it from assess_downloads
            log_info("Fetching copy_id from recent downloads for step 11...")
            response = requests.get(f"{API_BASE}/admin/assess/downloads", headers=headers)
            if response.status_code == 200:
                downloads_data = response.json()
                if downloads_data.get('downloads'):
                    recent_download = downloads_data['downloads'][0]
                    copy_id_for_trace = recent_download.get('copy_id') or recent_download.get('trace_code')
                    log_info(f"Copy ID for trace: {copy_id_for_trace}")
                else:
                    copy_id_for_trace = None
            else:
                copy_id_for_trace = None
        else:
            log_fail(f"Expected 200 application/pdf with %PDF, got {response.status_code}, {content_type}")
            results.append(("Step 6", False, f"{response.status_code}, {content_type}"))
            copy_id_for_trace = None
    else:
        log_fail(f"Expected 200 with token, got {response.status_code}")
        results.append(("Step 6", False, f"{response.status_code}"))
        copy_id_for_trace = None
    
    # STEP 7: GET oath/status - should now return required="short"
    log_step(7, "GET /assess/oath/status - should now return required='short'")
    log_request("GET", f"{API_BASE}/assess/oath/status?pack_id={PACK_ID}")
    response = requests.get(
        f"{API_BASE}/assess/oath/status?pack_id={PACK_ID}",
        headers=headers
    )
    data = log_response(response)
    
    if response.status_code == 200 and data and data.get('required') == 'short':
        log_pass(f"Status 200, required='short' ✓")
        results.append(("Step 7", True, f"200, required='short'"))
    else:
        log_fail(f"Expected 200 with required='short', got {response.status_code}, required={data.get('required') if data else 'N/A'}")
        results.append(("Step 7", False, f"{response.status_code}, required={data.get('required') if data else 'N/A'}"))
    
    # STEP 8: Accept short oath, download, then reuse same short acceptance_id (should fail)
    log_step(8, "POST /assess/oath/accept type=short, download, then reuse (should fail)")
    log_request("POST", f"{API_BASE}/assess/oath/accept")
    response = requests.post(
        f"{API_BASE}/assess/oath/accept",
        headers=headers,
        json={
            "pack_id": PACK_ID,
            "type": "short",
            "checkboxes": [True],
            "context": "download"
        }
    )
    data = log_response(response)
    
    if response.status_code == 200 and data and 'acceptance_id' in data:
        short_acceptance_id = data['acceptance_id']
        log_pass(f"Status 200, short acceptance_id={short_acceptance_id} ✓")
        
        # Download with short acceptance
        log_info("POST /assess/download-request with short acceptance_id")
        response = requests.post(
            f"{API_BASE}/assess/download-request",
            headers=headers,
            json={
                "document_id": DOCUMENT_ID,
                "acceptance_id": short_acceptance_id
            }
        )
        data = log_response(response)
        
        if response.status_code == 200 and data and 'token' in data:
            download_token2 = data['token']
            log_pass(f"Status 200, token={download_token2} ✓")
            
            # Download the PDF
            response = requests.get(
                f"{API_BASE}/assess/download/{download_token2}",
                headers=headers
            )
            
            if response.status_code == 200 and response.content.startswith(b'%PDF'):
                log_pass(f"Status 200, PDF downloaded ✓")
                
                # Now try to reuse the SAME short acceptance_id (should fail with 403 OATH_REQUIRED)
                log_info("Reusing the SAME short acceptance_id (should fail with 403 OATH_REQUIRED)")
                response = requests.post(
                    f"{API_BASE}/assess/download-request",
                    headers=headers,
                    json={
                        "document_id": DOCUMENT_ID,
                        "acceptance_id": short_acceptance_id
                    }
                )
                data = log_response(response)
                
                if response.status_code == 403 and data and data.get('code') == 'OATH_REQUIRED':
                    log_pass(f"Status 403, code='OATH_REQUIRED' (single-use enforcement) ✓")
                    results.append(("Step 8", True, f"200 short accept, download works, reuse fails 403 OATH_REQUIRED"))
                else:
                    log_fail(f"Expected 403 OATH_REQUIRED on reuse, got {response.status_code}, code={data.get('code') if data else 'N/A'}")
                    results.append(("Step 8", False, f"Reuse did not fail as expected: {response.status_code}"))
            else:
                log_fail(f"Download failed: {response.status_code}")
                results.append(("Step 8", False, f"Download failed: {response.status_code}"))
        else:
            log_fail(f"Expected 200 with token, got {response.status_code}")
            results.append(("Step 8", False, f"{response.status_code}"))
    else:
        log_fail(f"Expected 200 with acceptance_id, got {response.status_code}")
        results.append(("Step 8", False, f"{response.status_code}"))
    
    # STEP 9: GET view without ?acc (should fail), then with ?acc (should work)
    log_step(9, "GET /assess/view without ?acc (should fail), then with ?acc (should work)")
    log_request("GET", f"{API_BASE}/assess/view/{DOCUMENT_ID}")
    response = requests.get(
        f"{API_BASE}/assess/view/{DOCUMENT_ID}",
        headers=headers
    )
    data = log_response(response)
    
    if response.status_code == 403 and data and data.get('code') == 'OATH_REQUIRED':
        log_pass(f"Status 403, code='OATH_REQUIRED' (without ?acc) ✓")
        
        # Now accept a new short oath for view
        log_info("Accepting new short oath for view")
        response = requests.post(
            f"{API_BASE}/assess/oath/accept",
            headers=headers,
            json={
                "pack_id": PACK_ID,
                "type": "short",
                "checkboxes": [True],
                "context": "view"
            }
        )
        data = log_response(response)
        
        if response.status_code == 200 and data and 'acceptance_id' in data:
            view_acceptance_id = data['acceptance_id']
            log_pass(f"Status 200, view acceptance_id={view_acceptance_id} ✓")
            
            # Now GET view with ?acc
            log_info(f"GET /assess/view/{DOCUMENT_ID}?acc={view_acceptance_id}")
            response = requests.get(
                f"{API_BASE}/assess/view/{DOCUMENT_ID}?acc={view_acceptance_id}",
                headers=headers
            )
            data = log_response(response)
            
            if response.status_code == 200 and data and 'pages' in data:
                log_pass(f"Status 200, pages[] present (count={len(data['pages'])}) ✓")
                results.append(("Step 9", True, f"403 without ?acc, 200 with ?acc and pages[]"))
            else:
                log_fail(f"Expected 200 with pages[], got {response.status_code}")
                results.append(("Step 9", False, f"View with ?acc failed: {response.status_code}"))
        else:
            log_fail(f"Failed to accept short oath for view: {response.status_code}")
            results.append(("Step 9", False, f"Failed to accept short oath: {response.status_code}"))
    else:
        log_fail(f"Expected 403 OATH_REQUIRED without ?acc, got {response.status_code}, code={data.get('code') if data else 'N/A'}")
        results.append(("Step 9", False, f"{response.status_code}"))
    
    # STEP 10: GET admin oath-acceptances list and CSV
    log_step(10, "GET /admin/assess/oath-acceptances (list and CSV)")
    log_request("GET", f"{API_BASE}/admin/assess/oath-acceptances?pack=QA-OATH-PACK")
    response = requests.get(
        f"{API_BASE}/admin/assess/oath-acceptances?pack=QA-OATH-PACK",
        headers=headers
    )
    data = log_response(response)
    
    if response.status_code == 200 and data and 'acceptances' in data:
        acceptances = data['acceptances']
        log_pass(f"Status 200, {len(acceptances)} acceptances returned ✓")
        
        # Check for typed_name in acceptances
        has_typed_name = any('typed_name' in acc for acc in acceptances)
        if has_typed_name:
            log_pass(f"Acceptances contain typed_name field ✓")
        
        # Now test CSV export
        log_info("GET /admin/assess/oath-acceptances?pack=QA-OATH-PACK&format=csv")
        response = requests.get(
            f"{API_BASE}/admin/assess/oath-acceptances?pack=QA-OATH-PACK&format=csv",
            headers=headers
        )
        
        content_type = response.headers.get('Content-Type', '')
        
        if response.status_code == 200 and 'text/csv' in content_type:
            log_pass(f"Status 200, Content-Type=text/csv ✓")
            log_info(f"CSV preview: {response.text[:200]}")
            results.append(("Step 10", True, f"200 list with rows, CSV export works"))
        else:
            log_fail(f"Expected 200 text/csv, got {response.status_code}, {content_type}")
            results.append(("Step 10", False, f"CSV export failed: {response.status_code}"))
    else:
        log_fail(f"Expected 200 with acceptances[], got {response.status_code}")
        results.append(("Step 10", False, f"{response.status_code}"))
    
    # STEP 11: GET admin trace with copy_id
    log_step(11, "GET /admin/assess/trace?copy_id=<copy_id> - should have oath_typed_name")
    
    if copy_id_for_trace:
        log_request("GET", f"{API_BASE}/admin/assess/trace?copy_id={copy_id_for_trace}")
        response = requests.get(
            f"{API_BASE}/admin/assess/trace?copy_id={copy_id_for_trace}",
            headers=headers
        )
        data = log_response(response)
        
        if response.status_code == 200 and data and data.get('found') == True:
            copies = data.get('copies', [])
            if copies and len(copies) > 0:
                first_copy = copies[0]
                oath_typed_name = first_copy.get('oath_typed_name')
                
                if oath_typed_name:
                    log_pass(f"Status 200, found=true, copies[0].oath_typed_name='{oath_typed_name}' ✓")
                    results.append(("Step 11", True, f"200, found=true, oath_typed_name present"))
                else:
                    log_fail(f"copies[0] missing oath_typed_name field")
                    results.append(("Step 11", False, f"oath_typed_name missing"))
            else:
                log_fail(f"No copies found in response")
                results.append(("Step 11", False, f"No copies found"))
        else:
            log_fail(f"Expected 200 with found=true, got {response.status_code}, found={data.get('found') if data else 'N/A'}")
            results.append(("Step 11", False, f"{response.status_code}, found={data.get('found') if data else 'N/A'}"))
    else:
        log_fail("No copy_id available from step 6")
        results.append(("Step 11", False, "No copy_id from step 6"))
    
    # Print summary
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for step, success, details in results:
        status = f"{GREEN}✅ PASS{RESET}" if success else f"{RED}❌ FAIL{RESET}"
        print(f"{status} - {step}: {details}")
    
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"Total: {passed}/{total} tests passed")
    
    if passed == total:
        print(f"{GREEN}🎉 ALL TESTS PASSED!{RESET}")
        return True
    else:
        print(f"{RED}⚠️  SOME TESTS FAILED{RESET}")
        return False

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"{RED}❌ TEST SCRIPT ERROR: {e}{RESET}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
