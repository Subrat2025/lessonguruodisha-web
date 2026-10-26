#!/usr/bin/env python3
"""
Backend test for Store OG 1200x630 JPG backfill (PREVIEW)
Tests the OG image backfill job for 2 specific products
"""

import requests
import time
import sys

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImExY2I5ZTMyLTRmMjUtNDkzOC1hMTc1LTc1M2RkODA2MDliMCIsInJvbGUiOiJhZG1pbiIsInNlc3Npb25JZCI6IjRlYWVhZDUyLWNmZjAtNDY5NS04ZTBhLWEzMDhlN2IwZDkwNSIsImlhdCI6MTc5MTYxNzY2MiwiZXhwIjoxNzk0MjA5NjYyfQ.28wLIgVMGTiRI5Sx2o57upMbbn6tf_SozO3jiIm41rw"

# Test product IDs and slugs
PRODUCT_IDS = [
    "c95d1da2-d93d-4045-8bde-e27b0c536791",
    "deb53742-9ff5-44ea-8cbc-fc201924f682"
]
PRODUCT_SLUGS = {
    "c95d1da2-d93d-4045-8bde-e27b0c536791": "class-6-science-sa-1-2026-answer-key",
    "deb53742-9ff5-44ea-8cbc-fc201924f682": "class1-math-c12907"
}

def print_step(step_num, description):
    """Print test step header"""
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print('='*80)

def print_result(success, message):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def main():
    """Run all test steps"""
    all_passed = True
    job_id = None
    
    try:
        # STEP 1: Kick off backfill for 2 products
        print_step(1, "POST /api/admin/store/og-backfill with 2 product IDs")
        
        headers = {
            "Authorization": f"Bearer {ADMIN_BEARER_TOKEN}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "ids": PRODUCT_IDS
        }
        
        print(f"Request: POST {BASE_URL}/admin/store/og-backfill")
        print(f"Payload: {payload}")
        
        response = requests.post(
            f"{BASE_URL}/admin/store/og-backfill",
            json=payload,
            headers=headers,
            timeout=30
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        # Assert 200
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}")
            all_passed = False
            return 1
        print_result(True, "Status code 200")
        
        # Parse response
        data = response.json()
        
        # Assert ok:true
        if not data.get('ok'):
            print_result(False, f"Expected ok:true, got {data.get('ok')}")
            all_passed = False
            return 1
        print_result(True, "ok:true")
        
        # Assert jobId present
        job_id = data.get('jobId')
        if not job_id:
            print_result(False, "jobId not present in response")
            all_passed = False
            return 1
        print_result(True, f"jobId captured: {job_id}")
        
        # Assert total:2
        total = data.get('total')
        if total != 2:
            print_result(False, f"Expected total:2, got {total}")
            all_passed = False
            return 1
        print_result(True, "total:2")
        
        print(f"\n✅ STEP 1 COMPLETE: Backfill job started successfully")
        
        # STEP 2: Poll job until done (up to 90s)
        print_step(2, "Poll GET /api/admin/store/covers/jobs/<jobId> until done")
        
        max_polls = 18  # 18 * 5s = 90s
        poll_count = 0
        job_done = False
        job_data = None
        
        while poll_count < max_polls:
            poll_count += 1
            print(f"\nPoll #{poll_count} (waiting 5s between polls)...")
            
            if poll_count > 1:
                time.sleep(5)
            
            response = requests.get(
                f"{BASE_URL}/admin/store/covers/jobs/{job_id}",
                headers=headers,
                timeout=30
            )
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code != 200:
                print_result(False, f"Expected 200, got {response.status_code}")
                all_passed = False
                break
            
            job_data = response.json().get('job', {})
            print(f"Job status: {job_data.get('status')}, done: {job_data.get('done')}/{job_data.get('total')}, made: {job_data.get('made')}, failures: {len(job_data.get('failures', []))}")
            
            if job_data.get('status') == 'done':
                job_done = True
                print_result(True, "Job status === 'done'")
                break
        
        if not job_done:
            print_result(False, f"Job did not complete within 90s (polled {poll_count} times)")
            all_passed = False
            return 1
        
        # Assert job.done == 2
        if job_data.get('done') != 2:
            print_result(False, f"Expected job.done == 2, got {job_data.get('done')}")
            all_passed = False
        else:
            print_result(True, "job.done == 2")
        
        # Report job.made
        made = job_data.get('made', 0)
        print_result(True, f"job.made = {made}")
        
        # Assert job.failures == 0
        failures = job_data.get('failures', [])
        if len(failures) > 0:
            print_result(False, f"Expected 0 failures, got {len(failures)}")
            for failure in failures:
                print(f"  Failure reason: {failure}")
            all_passed = False
        else:
            print_result(True, "job.failures = 0 (no failures)")
        
        print(f"\n✅ STEP 2 COMPLETE: Job completed successfully")
        
        # STEP 3: Verify OG images are JPG in public R2
        print_step(3, "Verify OG images are JPG in public R2 (no auth)")
        
        for product_id in PRODUCT_IDS:
            slug = PRODUCT_SLUGS[product_id]
            print(f"\n--- Testing product: {slug} ---")
            
            # Get product detail
            print(f"GET /api/store/product/{slug}")
            response = requests.get(
                f"{BASE_URL}/store/product/{slug}",
                timeout=30
            )
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code != 200:
                print_result(False, f"Expected 200, got {response.status_code}")
                all_passed = False
                continue
            print_result(True, "Status 200")
            
            product = response.json().get('product', {})
            cover_og_url = product.get('coverOgUrl')
            
            # Assert coverOgUrl is non-null
            if not cover_og_url:
                print_result(False, "coverOgUrl is null or missing")
                all_passed = False
                continue
            print_result(True, f"coverOgUrl present: {cover_og_url}")
            
            # Assert ends with .jpg (may have ?v=... suffix)
            base_url = cover_og_url.split('?')[0]
            if not base_url.endswith('.jpg'):
                print_result(False, f"coverOgUrl does not end with .jpg: {base_url}")
                all_passed = False
                continue
            print_result(True, "coverOgUrl ends with .jpg")
            
            # Assert does NOT contain res.cloudinary.com
            if 'res.cloudinary.com' in cover_og_url:
                print_result(False, f"coverOgUrl contains res.cloudinary.com: {cover_og_url}")
                all_passed = False
                continue
            print_result(True, "coverOgUrl does NOT contain res.cloudinary.com (R2 URL)")
            
            # Fetch the OG image directly
            print(f"Fetching OG image: {cover_og_url}")
            response = requests.get(cover_og_url, allow_redirects=True, timeout=30)
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code != 200:
                print_result(False, f"Expected 200, got {response.status_code}")
                all_passed = False
                continue
            print_result(True, "OG image fetch status 200")
            
            # Assert Content-Type is image/jpeg
            content_type = response.headers.get('Content-Type', '')
            if 'image/jpeg' not in content_type:
                print_result(False, f"Expected Content-Type: image/jpeg, got {content_type}")
                all_passed = False
                continue
            print_result(True, f"Content-Type: {content_type}")
            
            # Assert body length > 1000 bytes
            body_length = len(response.content)
            if body_length <= 1000:
                print_result(False, f"Expected body length > 1000 bytes, got {body_length}")
                all_passed = False
                continue
            print_result(True, f"Body length: {body_length} bytes (> 1000)")
        
        print(f"\n✅ STEP 3 COMPLETE: OG images verified as JPG in R2")
        
        # STEP 4: Regression - verify coverUrl still present
        print_step(4, "Regression: Verify coverUrl still present (card cover unchanged)")
        
        slug = "class1-math-c12907"
        print(f"GET /api/store/product/{slug}")
        
        response = requests.get(
            f"{BASE_URL}/store/product/{slug}",
            timeout=30
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}")
            all_passed = False
            return 1
        print_result(True, "Status 200")
        
        product = response.json().get('product', {})
        cover_url = product.get('coverUrl')
        
        # Assert coverUrl is present
        if not cover_url:
            print_result(False, "coverUrl is null or missing")
            all_passed = False
            return 1
        print_result(True, f"coverUrl present: {cover_url}")
        
        # Assert product returns normally
        if not product.get('id'):
            print_result(False, "Product data incomplete (missing id)")
            all_passed = False
            return 1
        print_result(True, "Product returns normally with complete data")
        
        print(f"\n✅ STEP 4 COMPLETE: Regression test passed")
        
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        all_passed = False
        return 1
    
    # Final summary
    print(f"\n{'='*80}")
    print("FINAL SUMMARY")
    print('='*80)
    
    if all_passed:
        print("✅ ALL TESTS PASSED")
        print(f"\nKey findings:")
        print(f"- jobId: {job_id}")
        print(f"- job.done: 2")
        print(f"- job.made: {made}")
        print(f"- job.failures: 0")
        print(f"- Both products have JPG OG images in R2")
        print(f"- Both OG images fetched successfully (image/jpeg, >1000 bytes)")
        print(f"- Regression: coverUrl still present and working")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
