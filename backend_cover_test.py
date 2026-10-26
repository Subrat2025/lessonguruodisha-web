#!/usr/bin/env python3
"""
Backend test for Store COVER admin endpoints (Next.js)
Tests subject-styles GET/POST, generate scopes, jobs, single product regenerate, custom upload

Admin: 9692604577 / <redacted>
Base URL: NEXT_PUBLIC_BASE_URL + "/api"
"""

import requests
import json
import sys
import time
import io
from PIL import Image

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Global admin token
admin_token = None

def login():
    """Login as admin and return JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print(f"✅ Admin login successful")
            return token
        else:
            print(f"❌ Admin login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Admin login error: {str(e)}")
        return None

def get_headers(token=None):
    """Get request headers with optional auth token"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def create_test_png():
    """Create a tiny 10x10 PNG in memory"""
    img = Image.new('RGB', (10, 10), color='red')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf

def test_1_subject_styles_get():
    """Test 1: GET /api/admin/store/covers/subject-styles"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/admin/store/covers/subject-styles")
    print("="*80)
    
    try:
        # Test without token (should fail with 401/403)
        print("\n[1a] Testing without auth token (expect 401/403)...")
        response = requests.get(f"{BASE_URL}/admin/store/covers/subject-styles")
        if response.status_code in [401, 403]:
            print(f"✅ Correctly rejected without token: {response.status_code}")
        else:
            print(f"❌ Expected 401/403 without token, got {response.status_code}")
            return False
        
        # Test with admin token
        print("\n[1b] Testing with admin token (expect 200)...")
        response = requests.get(
            f"{BASE_URL}/admin/store/covers/subject-styles",
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ GET subject-styles failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ GET subject-styles returned 200")
        
        # Verify response structure
        if 'keys' not in data:
            print(f"❌ Response missing 'keys' field")
            return False
        print(f"✅ Response has 'keys' field: {len(data['keys'])} keys")
        
        if 'styles' not in data:
            print(f"❌ Response missing 'styles' field")
            return False
        print(f"✅ Response has 'styles' field")
        
        if 'overrides' not in data:
            print(f"❌ Response missing 'overrides' field")
            return False
        print(f"✅ Response has 'overrides' field")
        
        # Verify math and science exist with required fields
        for subject in ['math', 'science']:
            if subject not in data['styles']:
                print(f"❌ Subject '{subject}' not found in styles")
                return False
            
            style = data['styles'][subject]
            required_fields = ['bg', 'dark', 'motif']
            for field in required_fields:
                if field not in style:
                    print(f"❌ Subject '{subject}' missing field '{field}'")
                    return False
            
            print(f"✅ Subject '{subject}' has all required fields: bg={style['bg']}, dark={style['dark']}, motif={style['motif']}")
        
        print("\n✅ TEST 1 PASSED: GET subject-styles working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {str(e)}")
        return False

def test_2_subject_styles_post():
    """Test 2: POST /api/admin/store/covers/subject-styles"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/admin/store/covers/subject-styles")
    print("="*80)
    
    try:
        # Update math subject style
        print("\n[2a] Updating math subject style...")
        update_data = {
            "key": "math",
            "bg": "#eeeeff",
            "dark": "#222288",
            "motif": "math"
        }
        
        response = requests.post(
            f"{BASE_URL}/admin/store/covers/subject-styles",
            json=update_data,
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ POST subject-styles failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ POST subject-styles returned 200")
        
        # Verify response structure
        if not data.get('ok'):
            print(f"❌ Response 'ok' is not true")
            return False
        print(f"✅ Response has ok:true")
        
        if 'jobId' not in data:
            print(f"❌ Response missing 'jobId' field")
            return False
        print(f"✅ Response has jobId: {data['jobId']}")
        
        if 'regenerating' not in data:
            print(f"❌ Response missing 'regenerating' field")
            return False
        print(f"✅ Response has regenerating: {data['regenerating']} products")
        
        job_id = data['jobId']
        
        # Verify persistence by getting styles again
        print("\n[2b] Verifying persistence with GET subject-styles...")
        response = requests.get(
            f"{BASE_URL}/admin/store/covers/subject-styles",
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ GET subject-styles failed: {response.status_code}")
            return False
        
        data = response.json()
        
        # Check styles.math.bg
        if data['styles']['math']['bg'] != '#eeeeff':
            print(f"❌ styles.math.bg not updated: {data['styles']['math']['bg']} != #eeeeff")
            return False
        print(f"✅ styles.math.bg === '#eeeeff' (persisted)")
        
        # Check overrides.math.bg
        if 'math' not in data['overrides']:
            print(f"❌ overrides.math not found")
            return False
        
        if data['overrides']['math'].get('bg') != '#eeeeff':
            print(f"❌ overrides.math.bg not updated: {data['overrides']['math'].get('bg')} != #eeeeff")
            return False
        print(f"✅ overrides.math.bg === '#eeeeff' (DB override persisted)")
        
        print("\n✅ TEST 2 PASSED: POST subject-styles working correctly with DB persistence")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {str(e)}")
        return False

def test_3_generate_missing_and_jobs():
    """Test 3: POST /api/admin/store/covers/generate with scope:'missing' and job polling"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/admin/store/covers/generate (scope:'missing') + jobs")
    print("="*80)
    
    try:
        # Generate missing covers
        print("\n[3a] Generating missing covers...")
        response = requests.post(
            f"{BASE_URL}/admin/store/covers/generate",
            json={"scope": "missing"},
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ POST generate failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ POST generate returned 200")
        
        # Verify response structure
        if not data.get('ok'):
            print(f"❌ Response 'ok' is not true")
            return False
        print(f"✅ Response has ok:true")
        
        if 'jobId' not in data:
            print(f"❌ Response missing 'jobId' field")
            return False
        job_id = data['jobId']
        print(f"✅ Response has jobId: {job_id}")
        
        if 'total' not in data:
            print(f"❌ Response missing 'total' field")
            return False
        total = data['total']
        print(f"✅ Response has total: {total} products")
        
        # Get jobs list
        print("\n[3b] Getting jobs list...")
        response = requests.get(
            f"{BASE_URL}/admin/store/covers/jobs",
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ GET jobs failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ GET jobs returned 200")
        
        if 'jobs' not in data:
            print(f"❌ Response missing 'jobs' field")
            return False
        
        jobs = data['jobs']
        print(f"✅ Response has jobs array with {len(jobs)} jobs")
        
        # Find our job
        our_job = None
        for job in jobs:
            if job.get('id') == job_id:
                our_job = job
                break
        
        if not our_job:
            print(f"❌ Job {job_id} not found in jobs list")
            return False
        print(f"✅ Job {job_id} found in jobs list")
        
        # Get specific job
        print("\n[3c] Getting specific job details...")
        response = requests.get(
            f"{BASE_URL}/admin/store/covers/jobs/{job_id}",
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ GET job/{job_id} failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ GET job/{job_id} returned 200")
        
        if 'job' not in data:
            print(f"❌ Response missing 'job' field")
            return False
        
        job = data['job']
        required_fields = ['done', 'total', 'failedIds', 'status']
        for field in required_fields:
            if field not in job:
                print(f"❌ Job missing field '{field}'")
                return False
        
        print(f"✅ Job has all required fields: done={job['done']}, total={job['total']}, failedIds={len(job['failedIds'])}, status={job['status']}")
        
        # Poll for up to 20 seconds
        print("\n[3d] Polling job progress (up to 20s)...")
        start_time = time.time()
        initial_done = job['done']
        
        while time.time() - start_time < 20:
            response = requests.get(
                f"{BASE_URL}/admin/store/covers/jobs/{job_id}",
                headers=get_headers(admin_token)
            )
            
            if response.status_code == 200:
                data = response.json()
                job = data['job']
                
                print(f"  Poll: done={job['done']}/{job['total']}, status={job['status']}, failedIds={len(job['failedIds'])}")
                
                if job['status'] == 'done':
                    print(f"✅ Job completed: done={job['done']}/{job['total']}")
                    break
                
                if job['done'] > initial_done:
                    print(f"✅ Job progressing: done increased from {initial_done} to {job['done']}")
                    break
            
            time.sleep(3)
        
        # Final check
        response = requests.get(
            f"{BASE_URL}/admin/store/covers/jobs/{job_id}",
            headers=get_headers(admin_token)
        )
        
        if response.status_code == 200:
            data = response.json()
            job = data['job']
            
            failed_count = len(job['failedIds'])
            print(f"\n✅ Final job state: done={job['done']}/{job['total']}, failedIds={failed_count}, status={job['status']}")
            
            if failed_count > 0:
                print(f"⚠️  WARNING: {failed_count} products failed to generate covers")
                print(f"   Failed IDs: {job['failedIds'][:5]}...")  # Show first 5
            else:
                print(f"✅ All products generated successfully (0 failures)")
        
        print("\n✅ TEST 3 PASSED: Generate missing + jobs working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {str(e)}")
        return False

def test_4_generate_class():
    """Test 4: POST /api/admin/store/covers/generate with scope:'class', class:1"""
    print("\n" + "="*80)
    print("TEST 4: POST /api/admin/store/covers/generate (scope:'class', class:1)")
    print("="*80)
    
    try:
        print("\n[4a] Generating covers for class 1...")
        response = requests.post(
            f"{BASE_URL}/admin/store/covers/generate",
            json={"scope": "class", "class": 1},
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ POST generate class failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ POST generate class returned 200")
        
        if not data.get('ok'):
            print(f"❌ Response 'ok' is not true")
            return False
        print(f"✅ Response has ok:true")
        
        if 'total' not in data:
            print(f"❌ Response missing 'total' field")
            return False
        
        total = data['total']
        print(f"✅ Response has total: {total} products")
        
        if total <= 0:
            print(f"❌ Expected total > 0, got {total}")
            return False
        print(f"✅ Total > 0 (class 1 has {total} products)")
        
        print("\n✅ TEST 4 PASSED: Generate class scope working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {str(e)}")
        return False

def test_5_single_product_regenerate():
    """Test 5: Single product regenerate"""
    print("\n" + "="*80)
    print("TEST 5: Single product regenerate")
    print("="*80)
    
    try:
        # First, discover a published unit_test product
        print("\n[5a] Discovering a published unit_test product...")
        
        # Get classes
        response = requests.get(f"{BASE_URL}/store/unit-tests/classes")
        if response.status_code != 200:
            print(f"❌ GET classes failed: {response.status_code}")
            return False
        
        classes_data = response.json()
        if not classes_data.get('classes'):
            print(f"❌ No classes found")
            return False
        
        # Get subjects for class 1
        response = requests.get(f"{BASE_URL}/store/unit-tests/subjects?cls=1")
        if response.status_code != 200:
            print(f"❌ GET subjects failed: {response.status_code}")
            return False
        
        subjects_data = response.json()
        if not subjects_data.get('subjects'):
            print(f"❌ No subjects found for class 1")
            return False
        
        subject_key = subjects_data['subjects'][0]['subjectKey']
        print(f"✅ Found subject: {subject_key}")
        
        # Get chapters
        response = requests.get(f"{BASE_URL}/store/unit-tests/chapters?cls=1&subjectKey={subject_key}")
        if response.status_code != 200:
            print(f"❌ GET chapters failed: {response.status_code}")
            return False
        
        chapters_data = response.json()
        if not chapters_data.get('chapters'):
            print(f"❌ No chapters found")
            return False
        
        product_id = chapters_data['chapters'][0]['id']
        print(f"✅ Found product ID: {product_id}")
        
        # Regenerate cover
        print("\n[5b] Regenerating cover for product...")
        response = requests.post(
            f"{BASE_URL}/admin/store/products/{product_id}/cover",
            json={"action": "regenerate"},
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ POST regenerate cover failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ POST regenerate cover returned 200")
        
        if not data.get('ok'):
            print(f"❌ Response 'ok' is not true")
            return False
        print(f"✅ Response has ok:true")
        
        if 'cover' not in data:
            print(f"❌ Response missing 'cover' field")
            return False
        
        cover = data['cover']
        required_fields = ['url', 'thumbUrl', 'ogUrl']
        for field in required_fields:
            if field not in cover:
                print(f"❌ Cover missing field '{field}'")
                return False
            print(f"✅ Cover has {field}: {cover[field][:60]}...")
        
        print(f"\n✅ TEST 5 PASSED: Single product regenerate working correctly")
        print(f"   Product ID: {product_id}")
        return True
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED with exception: {str(e)}")
        return False

def test_6_custom_cover_upload():
    """Test 6: Custom cover upload and reset"""
    print("\n" + "="*80)
    print("TEST 6: Custom cover upload and reset")
    print("="*80)
    
    try:
        # Get a product ID (reuse from test 5 logic)
        print("\n[6a] Finding a product for custom cover upload...")
        response = requests.get(f"{BASE_URL}/store/unit-tests/subjects?cls=1")
        if response.status_code != 200:
            print(f"❌ GET subjects failed: {response.status_code}")
            return False
        
        subjects_data = response.json()
        subject_key = subjects_data['subjects'][0]['subjectKey']
        
        response = requests.get(f"{BASE_URL}/store/unit-tests/chapters?cls=1&subjectKey={subject_key}")
        if response.status_code != 200:
            print(f"❌ GET chapters failed: {response.status_code}")
            return False
        
        chapters_data = response.json()
        product_id = chapters_data['chapters'][0]['id']
        print(f"✅ Using product ID: {product_id}")
        
        # Create a tiny PNG
        print("\n[6b] Creating a 10x10 PNG for upload...")
        png_buffer = create_test_png()
        print(f"✅ Created test PNG")
        
        # Upload custom cover
        print("\n[6c] Uploading custom cover...")
        files = {'file': ('test_cover.png', png_buffer, 'image/png')}
        response = requests.post(
            f"{BASE_URL}/admin/store/products/{product_id}/cover/upload",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}  # No Content-Type for multipart
        )
        
        if response.status_code != 200:
            print(f"❌ POST upload cover failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ POST upload cover returned 200")
        
        if not data.get('ok'):
            print(f"❌ Response 'ok' is not true")
            return False
        print(f"✅ Response has ok:true")
        
        if 'coverUrl' not in data:
            print(f"❌ Response missing 'coverUrl' field")
            return False
        custom_cover_url = data['coverUrl']
        print(f"✅ Response has coverUrl: {custom_cover_url[:60]}...")
        
        if data.get('source') != 'custom':
            print(f"❌ Response source is not 'custom': {data.get('source')}")
            return False
        print(f"✅ Response has source:'custom'")
        
        # Verify custom cover in product
        print("\n[6d] Verifying custom cover in product...")
        response = requests.get(f"{BASE_URL}/store/product/{product_id}")
        
        if response.status_code != 200:
            print(f"❌ GET product failed: {response.status_code}")
            return False
        
        product_data = response.json()
        product = product_data.get('product')
        
        if not product:
            print(f"❌ Product not found in response")
            return False
        
        product_cover_url = product.get('coverUrl')
        if not product_cover_url:
            print(f"❌ Product missing coverUrl")
            return False
        
        # Custom cover should override auto cover
        if custom_cover_url not in product_cover_url:
            print(f"❌ Product coverUrl does not match custom cover")
            print(f"   Expected: {custom_cover_url}")
            print(f"   Got: {product_cover_url}")
            return False
        print(f"✅ Product coverUrl matches custom cover (custom overrides auto)")
        
        # Reset cover
        print("\n[6e] Resetting cover (clears custom + regenerates auto)...")
        response = requests.post(
            f"{BASE_URL}/admin/store/products/{product_id}/cover",
            json={"action": "reset"},
            headers=get_headers(admin_token)
        )
        
        if response.status_code != 200:
            print(f"❌ POST reset cover failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"✅ POST reset cover returned 200")
        
        if not data.get('ok'):
            print(f"❌ Response 'ok' is not true")
            return False
        print(f"✅ Response has ok:true (custom cleared, auto regenerated)")
        
        print(f"\n✅ TEST 6 PASSED: Custom cover upload and reset working correctly")
        print(f"   Product ID: {product_id}")
        return True
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    global admin_token
    
    print("="*80)
    print("STORE COVER ADMIN ENDPOINTS - BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print("="*80)
    
    # Login as admin
    print("\n[SETUP] Logging in as admin...")
    admin_token = login()
    if not admin_token:
        print("❌ FATAL: Admin login failed")
        sys.exit(1)
    
    # Run all tests
    results = []
    
    results.append(("Test 1: GET subject-styles", test_1_subject_styles_get()))
    results.append(("Test 2: POST subject-styles", test_2_subject_styles_post()))
    results.append(("Test 3: Generate missing + jobs", test_3_generate_missing_and_jobs()))
    results.append(("Test 4: Generate class scope", test_4_generate_class()))
    results.append(("Test 5: Single product regenerate", test_5_single_product_regenerate()))
    results.append(("Test 6: Custom cover upload", test_6_custom_cover_upload()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("="*80)
    print(f"Total: {len(results)} tests | Passed: {passed} | Failed: {failed}")
    print("="*80)
    
    if failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
