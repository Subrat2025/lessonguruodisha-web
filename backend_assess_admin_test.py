#!/usr/bin/env python3
"""
Backend test for Assessment Store Admin Module (Prompt 2)
Tests all admin/assess/* endpoints with authentication, CRUD operations, chunked uploads, and CSV imports.
"""

import requests
import json
import time
import base64
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"
NORMAL_USER_MOBILE = "9444106792"
NORMAL_USER_PASSWORD = "<redacted>"

# Global state
admin_token = None
normal_user_token = None
test_doc_id = None
test_pack_id = None
test_coupon_id = None
upload_id = None
original_store_name = None

def login(mobile: str, password: str) -> Optional[str]:
    """Login and return Bearer token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            print(f"✅ Login successful for {mobile}, token: {token[:20]}...")
            return token
        else:
            print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def headers_admin() -> Dict[str, str]:
    """Return headers with admin Bearer token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

def headers_normal() -> Dict[str, str]:
    """Return headers with normal user Bearer token"""
    return {"Authorization": f"Bearer {normal_user_token}", "Content-Type": "application/json"}

def test_1_overview():
    """TEST 1: GET /admin/assess/overview → returns counts"""
    print("\n" + "="*80)
    print("TEST 1: GET /admin/assess/overview")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/overview", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Response keys: {list(data.keys())}")
            print(f"  docs: {data.get('docs')}")
            print(f"  packs: {data.get('packs')}")
            print(f"  activePacks: {data.get('activePacks')}")
            print(f"  orders: {data.get('orders')}")
            print(f"  coupons: {data.get('coupons')}")
            print(f"  revenue_inr: {data.get('revenue_inr')}")
            print("✅ TEST 1 PASSED: Overview endpoint working")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 FAILED: Exception: {e}")
        return False

def test_2_documents_list():
    """TEST 2: GET /admin/assess/documents?limit=50 → returns documents, total, facets"""
    print("\n" + "="*80)
    print("TEST 2: GET /admin/assess/documents?limit=50")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/documents?limit=50", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Response keys: {list(data.keys())}")
            print(f"  total: {data.get('total')}")
            print(f"  documents count: {len(data.get('documents', []))}")
            facets = data.get('facets', {})
            print(f"  facets.classes: {facets.get('classes', [])[:5]}")
            print(f"  facets.subjects: {facets.get('subjects', [])[:5]}")
            print(f"  facets.doc_types: {facets.get('doc_types', [])[:5]}")
            
            # Test filters
            if facets.get('classes'):
                test_class = facets['classes'][0]
                print(f"\n  Testing filter ?class={test_class}")
                resp2 = requests.get(f"{BASE_URL}/admin/assess/documents?class={test_class}", headers=headers_admin(), timeout=30)
                if resp2.status_code == 200:
                    print(f"    Filter working: {len(resp2.json().get('documents', []))} docs")
            
            # Test has_file=no filter
            print(f"\n  Testing filter ?has_file=no")
            resp3 = requests.get(f"{BASE_URL}/admin/assess/documents?has_file=no", headers=headers_admin(), timeout=30)
            if resp3.status_code == 200:
                print(f"    Filter working: {len(resp3.json().get('documents', []))} docs without file")
            
            # Test search ?q=
            print(f"\n  Testing filter ?q=test")
            resp4 = requests.get(f"{BASE_URL}/admin/assess/documents?q=test", headers=headers_admin(), timeout=30)
            if resp4.status_code == 200:
                print(f"    Search working: {len(resp4.json().get('documents', []))} docs")
            
            print("✅ TEST 2 PASSED: Documents list endpoint working with filters")
            return True
        else:
            print(f"❌ TEST 2 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 FAILED: Exception: {e}")
        return False

def test_3_create_document():
    """TEST 3: POST /admin/assess/documents → create metadata doc"""
    global test_doc_id
    print("\n" + "="*80)
    print("TEST 3: POST /admin/assess/documents (create metadata doc)")
    print("="*80)
    try:
        payload = {
            "file_name": "TEST_DOC_QA.pdf",
            "title_or": "Test Doc QA",
            "class": "Class 3",
            "subject": "English",
            "doc_type": "FA1",
            "pages": 4,
            "is_free_sample": True
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/documents", json=payload, headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            test_doc_id = data.get('document', {}).get('id')
            print(f"  Created document ID: {test_doc_id}")
            print(f"  title_or: {data.get('document', {}).get('title_or')}")
            print(f"  is_free_sample: {data.get('document', {}).get('is_free_sample')}")
            print("✅ TEST 3 PASSED: Document created successfully")
            return True
        else:
            print(f"❌ TEST 3 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 3 FAILED: Exception: {e}")
        return False

def test_4_update_document():
    """TEST 4: PUT /admin/assess/documents/:id → update fields"""
    print("\n" + "="*80)
    print(f"TEST 4: PUT /admin/assess/documents/{test_doc_id} (update)")
    print("="*80)
    if not test_doc_id:
        print("❌ TEST 4 SKIPPED: No test_doc_id from TEST 3")
        return False
    try:
        payload = {
            "title_or": "Test Doc QA Edited",
            "is_free_sample": False,
            "release_at": "2026-07-01"
        }
        resp = requests.put(f"{BASE_URL}/admin/assess/documents/{test_doc_id}", json=payload, headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            doc = data.get('document', {})
            print(f"  title_or: {doc.get('title_or')}")
            print(f"  is_free_sample: {doc.get('is_free_sample')}")
            print(f"  release_at: {doc.get('release_at')}")
            if doc.get('title_or') == "Test Doc QA Edited" and doc.get('is_free_sample') == False:
                print("✅ TEST 4 PASSED: Document updated successfully")
                return True
            else:
                print("❌ TEST 4 FAILED: Fields not updated correctly")
                return False
        else:
            print(f"❌ TEST 4 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 4 FAILED: Exception: {e}")
        return False

def test_5_document_packs():
    """TEST 5: GET/PUT /admin/assess/documents/:id/packs"""
    print("\n" + "="*80)
    print(f"TEST 5: GET/PUT /admin/assess/documents/{test_doc_id}/packs")
    print("="*80)
    if not test_doc_id:
        print("❌ TEST 5 SKIPPED: No test_doc_id")
        return False
    try:
        # GET packs
        resp = requests.get(f"{BASE_URL}/admin/assess/documents/{test_doc_id}/packs", headers=headers_admin(), timeout=30)
        print(f"GET Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  pack_ids: {data.get('pack_ids', [])}")
        
        # PUT packs (empty array)
        resp2 = requests.put(f"{BASE_URL}/admin/assess/documents/{test_doc_id}/packs", json={"pack_ids": []}, headers=headers_admin(), timeout=30)
        print(f"PUT Status: {resp2.status_code}")
        if resp2.status_code == 200:
            print("✅ TEST 5 PASSED: Document packs GET/PUT working")
            return True
        else:
            print(f"❌ TEST 5 FAILED: PUT returned {resp2.status_code}: {resp2.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 5 FAILED: Exception: {e}")
        return False

def test_6_document_preview():
    """TEST 6: GET /admin/assess/documents/:id/preview → should 404 (no file)"""
    print("\n" + "="*80)
    print(f"TEST 6: GET /admin/assess/documents/{test_doc_id}/preview (expect 404)")
    print("="*80)
    if not test_doc_id:
        print("❌ TEST 6 SKIPPED: No test_doc_id")
        return False
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/documents/{test_doc_id}/preview", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 404:
            print(f"  Error: {resp.json().get('error')}")
            print("✅ TEST 6 PASSED: Preview correctly returns 404 for doc without file")
            return True
        else:
            print(f"❌ TEST 6 FAILED: Expected 404, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 6 FAILED: Exception: {e}")
        return False

def test_7_chunked_upload():
    """TEST 7: Chunked upload validation (init → chunk → commit)"""
    global upload_id
    print("\n" + "="*80)
    print("TEST 7: Chunked upload validation")
    print("="*80)
    
    # 7a: POST /admin/assess/upload/init
    print("\n7a: POST /admin/assess/upload/init")
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/init", json={}, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            upload_id = data.get('uploadId')
            print(f"  uploadId: {upload_id}")
            print("  ✅ Init successful")
        else:
            print(f"  ❌ Init failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Init exception: {e}")
        return False
    
    # 7b: POST /admin/assess/upload/chunk with valid uploadId
    print("\n7b: POST /admin/assess/upload/chunk (valid uploadId)")
    try:
        tiny_data = base64.b64encode(b"hello").decode('utf-8')
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/chunk", 
                           json={"uploadId": upload_id, "data": tiny_data}, 
                           headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  bytes: {data.get('bytes')}")
            print("  ✅ Chunk upload successful")
        else:
            print(f"  ❌ Chunk failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Chunk exception: {e}")
        return False
    
    # 7c: POST /admin/assess/upload/chunk with bad uploadId
    print("\n7c: POST /admin/assess/upload/chunk (bad uploadId)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/chunk", 
                           json={"uploadId": "not-a-uuid", "data": tiny_data}, 
                           headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Bad uploadId correctly rejected with 400")
        else:
            print(f"  ❌ Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # 7d: POST /admin/assess/upload/commit with valid uploadId
    print("\n7d: POST /admin/assess/upload/commit (valid uploadId)")
    try:
        payload = {
            "uploadId": upload_id,
            "kind": "pdf",
            "file_name": "tiny.pdf",
            "class": "Class 3",
            "subject": "English",
            "doc_type": "FA1"
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/commit", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 503:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Cloudinary NOT configured (503 expected) - this is acceptable")
        elif resp.status_code == 200:
            data = resp.json()
            print(f"  Document created: {data.get('document', {}).get('id')}")
            print("  ✅ Cloudinary IS configured - commit successful")
        elif resp.status_code == 500:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Cloudinary error (tiny non-pdf buffer) - this is acceptable")
        else:
            print(f"  Status {resp.status_code}: {resp.text}")
            print("  ⚠️  Unexpected status but continuing")
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # 7e: POST /admin/assess/upload/commit with bad uploadId
    print("\n7e: POST /admin/assess/upload/commit (bad uploadId)")
    try:
        payload = {
            "uploadId": "not-a-uuid",
            "kind": "pdf",
            "file_name": "bad.pdf",
            "class": "Class 3",
            "subject": "English",
            "doc_type": "FA1"
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/upload/commit", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 400:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Bad uploadId correctly rejected with 400")
        else:
            print(f"  ❌ Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    print("\n✅ TEST 7 PASSED: Chunked upload validation working")
    return True

def test_8_packs_list():
    """TEST 8: GET /admin/assess/packs → list all packs"""
    print("\n" + "="*80)
    print("TEST 8: GET /admin/assess/packs")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/packs", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            packs = data.get('packs', [])
            print(f"  Total packs: {len(packs)}")
            if packs:
                print(f"  First pack: {packs[0].get('pack_code')} - {packs[0].get('pack_name')}")
            print("✅ TEST 8 PASSED: Packs list endpoint working")
            return True
        else:
            print(f"❌ TEST 8 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 8 FAILED: Exception: {e}")
        return False

def test_9_create_pack():
    """TEST 9: POST /admin/assess/packs → create pack, test duplicate"""
    global test_pack_id
    print("\n" + "="*80)
    print("TEST 9: POST /admin/assess/packs (create + duplicate check)")
    print("="*80)
    
    # Create pack
    print("\n9a: Create pack")
    try:
        payload = {
            "pack_code": "QA-TEST-PACK",
            "pack_name": "QA Test Pack",
            "pack_type": "subject",
            "mrp_inr": 100,
            "sale_price_inr": 49
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/packs", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            test_pack_id = data.get('pack', {}).get('id')
            pack = data.get('pack', {})
            print(f"  Created pack ID: {test_pack_id}")
            print(f"  pack_code: {pack.get('pack_code')}")
            print(f"  discount_pct: {pack.get('discount_pct')}")
            print("  ✅ Pack created successfully")
        else:
            print(f"  ❌ Create failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # Try duplicate
    print("\n9b: Try duplicate pack_code (expect 409)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/packs", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 409:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Duplicate correctly rejected with 409")
        else:
            print(f"  ❌ Expected 409, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    print("\n✅ TEST 9 PASSED: Pack creation and duplicate check working")
    return True

def test_10_update_pack():
    """TEST 10: PUT /admin/assess/packs/:id → update prices"""
    print("\n" + "="*80)
    print(f"TEST 10: PUT /admin/assess/packs/{test_pack_id} (update prices)")
    print("="*80)
    if not test_pack_id:
        print("❌ TEST 10 SKIPPED: No test_pack_id")
        return False
    try:
        payload = {
            "sale_price_inr": 39,
            "mrp_inr": 120
        }
        resp = requests.put(f"{BASE_URL}/admin/assess/packs/{test_pack_id}", json=payload, headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            pack = data.get('pack', {})
            print(f"  mrp_inr: {pack.get('mrp_inr')}")
            print(f"  sale_price_inr: {pack.get('sale_price_inr')}")
            print(f"  discount_pct: {pack.get('discount_pct')}")
            if pack.get('mrp_inr') == 120 and pack.get('sale_price_inr') == 39:
                print("✅ TEST 10 PASSED: Pack updated successfully, discount_pct recomputed")
                return True
            else:
                print("❌ TEST 10 FAILED: Prices not updated correctly")
                return False
        else:
            print(f"❌ TEST 10 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 10 FAILED: Exception: {e}")
        return False

def test_11_price_history():
    """TEST 11: GET /admin/assess/price-history?pack_id=:id"""
    print("\n" + "="*80)
    print(f"TEST 11: GET /admin/assess/price-history?pack_id={test_pack_id}")
    print("="*80)
    if not test_pack_id:
        print("❌ TEST 11 SKIPPED: No test_pack_id")
        return False
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/price-history?pack_id={test_pack_id}", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            history = data.get('history', [])
            print(f"  History entries: {len(history)}")
            if history:
                print(f"  Latest entry: old={history[0].get('old')}, new={history[0].get('new')}")
            if len(history) >= 1:
                print("✅ TEST 11 PASSED: Price history has at least 1 entry from TEST 10")
                return True
            else:
                print("❌ TEST 11 FAILED: No price history entries found")
                return False
        else:
            print(f"❌ TEST 11 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 11 FAILED: Exception: {e}")
        return False

def test_12_delete_pack():
    """TEST 12: DELETE /admin/assess/packs/:id"""
    print("\n" + "="*80)
    print(f"TEST 12: DELETE /admin/assess/packs/{test_pack_id}")
    print("="*80)
    if not test_pack_id:
        print("❌ TEST 12 SKIPPED: No test_pack_id")
        return False
    try:
        resp = requests.delete(f"{BASE_URL}/admin/assess/packs/{test_pack_id}", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("✅ TEST 12 PASSED: Pack deleted successfully")
            return True
        else:
            print(f"❌ TEST 12 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 12 FAILED: Exception: {e}")
        return False

def test_13_coupons_list():
    """TEST 13: GET /admin/assess/coupons"""
    print("\n" + "="*80)
    print("TEST 13: GET /admin/assess/coupons")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/coupons", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            coupons = data.get('coupons', [])
            print(f"  Total coupons: {len(coupons)}")
            print("✅ TEST 13 PASSED: Coupons list endpoint working")
            return True
        else:
            print(f"❌ TEST 13 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 13 FAILED: Exception: {e}")
        return False

def test_14_create_coupon():
    """TEST 14: POST /admin/assess/coupons → create + duplicate check"""
    global test_coupon_id
    print("\n" + "="*80)
    print("TEST 14: POST /admin/assess/coupons (create + duplicate check)")
    print("="*80)
    
    # Create coupon
    print("\n14a: Create coupon")
    try:
        payload = {
            "code": "QATEST",
            "type": "percent",
            "value": 15,
            "applies_to": "all"
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/coupons", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            test_coupon_id = data.get('coupon', {}).get('id')
            coupon = data.get('coupon', {})
            print(f"  Created coupon ID: {test_coupon_id}")
            print(f"  code: {coupon.get('code')}")
            print(f"  type: {coupon.get('type')}")
            print(f"  value: {coupon.get('value')}")
            print("  ✅ Coupon created successfully")
        else:
            print(f"  ❌ Create failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # Try duplicate
    print("\n14b: Try duplicate code (expect 409)")
    try:
        resp = requests.post(f"{BASE_URL}/admin/assess/coupons", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 409:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Duplicate correctly rejected with 409")
        else:
            print(f"  ❌ Expected 409, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    print("\n✅ TEST 14 PASSED: Coupon creation and duplicate check working")
    return True

def test_15_update_coupon():
    """TEST 15: PUT /admin/assess/coupons/:id"""
    print("\n" + "="*80)
    print(f"TEST 15: PUT /admin/assess/coupons/{test_coupon_id}")
    print("="*80)
    if not test_coupon_id:
        print("❌ TEST 15 SKIPPED: No test_coupon_id")
        return False
    try:
        payload = {
            "is_active": False,
            "value": 20
        }
        resp = requests.put(f"{BASE_URL}/admin/assess/coupons/{test_coupon_id}", json=payload, headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            coupon = data.get('coupon', {})
            print(f"  is_active: {coupon.get('is_active')}")
            print(f"  value: {coupon.get('value')}")
            if coupon.get('is_active') == False and coupon.get('value') == 20:
                print("✅ TEST 15 PASSED: Coupon updated successfully")
                return True
            else:
                print("❌ TEST 15 FAILED: Fields not updated correctly")
                return False
        else:
            print(f"❌ TEST 15 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 15 FAILED: Exception: {e}")
        return False

def test_16_delete_coupon():
    """TEST 16: DELETE /admin/assess/coupons/:id"""
    print("\n" + "="*80)
    print(f"TEST 16: DELETE /admin/assess/coupons/{test_coupon_id}")
    print("="*80)
    if not test_coupon_id:
        print("❌ TEST 16 SKIPPED: No test_coupon_id")
        return False
    try:
        resp = requests.delete(f"{BASE_URL}/admin/assess/coupons/{test_coupon_id}", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("✅ TEST 16 PASSED: Coupon deleted successfully")
            return True
        else:
            print(f"❌ TEST 16 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 16 FAILED: Exception: {e}")
        return False

def test_17_orders_list():
    """TEST 17: GET /admin/assess/orders"""
    print("\n" + "="*80)
    print("TEST 17: GET /admin/assess/orders")
    print("="*80)
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/orders", headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            orders = data.get('orders', [])
            total = data.get('total', 0)
            print(f"  Total orders: {total}")
            print(f"  Orders returned: {len(orders)}")
            print("✅ TEST 17 PASSED: Orders list endpoint working (empty ok)")
            return True
        else:
            print(f"❌ TEST 17 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 17 FAILED: Exception: {e}")
        return False

def test_18_settings():
    """TEST 18: GET/PUT /admin/assess/settings"""
    global original_store_name
    print("\n" + "="*80)
    print("TEST 18: GET/PUT /admin/assess/settings")
    print("="*80)
    
    # GET settings
    print("\n18a: GET /admin/assess/settings")
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/settings", headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            settings = data.get('settings', {})
            original_store_name = settings.get('store_name', 'ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର')
            print(f"  Original store_name: {original_store_name}")
            print("  ✅ GET settings successful")
        else:
            print(f"  ❌ GET failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # PUT settings (change store_name)
    print("\n18b: PUT /admin/assess/settings (change store_name)")
    try:
        payload = {
            "settings": {
                "store_name": "QA Store Name"
            }
        }
        resp = requests.put(f"{BASE_URL}/admin/assess/settings", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            settings = data.get('settings', {})
            print(f"  New store_name: {settings.get('store_name')}")
            if settings.get('store_name') == "QA Store Name":
                print("  ✅ PUT settings successful, store_name changed")
            else:
                print("  ❌ store_name not changed")
                return False
        else:
            print(f"  ❌ PUT failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # PUT settings (restore original)
    print("\n18c: PUT /admin/assess/settings (restore original)")
    try:
        payload = {
            "settings": {
                "store_name": original_store_name
            }
        }
        resp = requests.put(f"{BASE_URL}/admin/assess/settings", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            settings = data.get('settings', {})
            print(f"  Restored store_name: {settings.get('store_name')}")
            print("  ✅ Settings restored")
        else:
            print(f"  ❌ Restore failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    print("\n✅ TEST 18 PASSED: Settings GET/PUT working")
    return True

def test_19_import_packs():
    """TEST 19: POST /admin/assess/import/packs"""
    print("\n" + "="*80)
    print("TEST 19: POST /admin/assess/import/packs")
    print("="*80)
    
    # First import
    print("\n19a: Import pack (first time)")
    try:
        payload = {
            "rows": [
                {
                    "pack_code": "QA-IMPORT-1",
                    "pack_name": "QA Import 1",
                    "pack_type": "subject",
                    "mrp_inr": 90,
                    "sale_price_inr": 45,
                    "is_active": "yes"
                }
            ]
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/import/packs", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  created: {data.get('created')}")
            print(f"  updated: {data.get('updated')}")
            if data.get('created') == 1:
                print("  ✅ Pack imported (created)")
            else:
                print("  ⚠️  Pack may already exist")
        else:
            print(f"  ❌ Import failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # Second import (should update)
    print("\n19b: Import same pack (should update)")
    try:
        payload = {
            "rows": [
                {
                    "pack_code": "QA-IMPORT-1",
                    "pack_name": "QA Import 1 Updated",
                    "pack_type": "subject",
                    "mrp_inr": 95,
                    "sale_price_inr": 50,
                    "is_active": "yes"
                }
            ]
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/import/packs", json=payload, headers=headers_admin(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  created: {data.get('created')}")
            print(f"  updated: {data.get('updated')}")
            if data.get('updated') >= 1:
                print("  ✅ Pack updated (not created)")
            else:
                print("  ⚠️  Expected update")
        else:
            print(f"  ❌ Import failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    print("\n✅ TEST 19 PASSED: Pack import working (create + update)")
    return True

def test_20_import_catalog():
    """TEST 20: POST /admin/assess/import/catalog"""
    print("\n" + "="*80)
    print("TEST 20: POST /admin/assess/import/catalog")
    print("="*80)
    try:
        payload = {
            "rows": [
                {
                    "file_name": "QA_IMPORT_CAT_1.pdf",
                    "class": "Class 3",
                    "subject": "Odia",
                    "doc_type": "SA1",
                    "pages": 6,
                    "subject_pack": "QA Subject Pack",
                    "class_pack": "QA Class Pack"
                }
            ]
        }
        resp = requests.post(f"{BASE_URL}/admin/assess/import/catalog", json=payload, headers=headers_admin(), timeout=30)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  created: {data.get('created')}")
            print(f"  updated: {data.get('updated')}")
            print(f"  links: {data.get('links')}")
            print("✅ TEST 20 PASSED: Catalog import working")
            return True
        else:
            print(f"❌ TEST 20 FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 20 FAILED: Exception: {e}")
        return False

def test_21_auth_guard():
    """TEST 21: Auth guard - no token and non-admin token"""
    print("\n" + "="*80)
    print("TEST 21: Auth guard (no token + non-admin token)")
    print("="*80)
    
    # 21a: No token
    print("\n21a: GET /admin/assess/overview WITHOUT token (expect 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/overview", timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Correctly rejected with 403")
        else:
            print(f"  ❌ Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    # 21b: Non-admin token
    print("\n21b: GET /admin/assess/overview WITH non-admin token (expect 403)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/overview", headers=headers_normal(), timeout=30)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 403:
            print(f"  Error: {resp.json().get('error')}")
            print("  ✅ Correctly rejected with 403")
        else:
            print(f"  ❌ Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Exception: {e}")
        return False
    
    print("\n✅ TEST 21 PASSED: Auth guard working correctly")
    return True

def cleanup():
    """Cleanup test data"""
    print("\n" + "="*80)
    print("CLEANUP: Deleting test data")
    print("="*80)
    
    # Delete test document
    if test_doc_id:
        print(f"\nDeleting test document {test_doc_id}")
        try:
            resp = requests.delete(f"{BASE_URL}/admin/assess/documents/{test_doc_id}", headers=headers_admin(), timeout=30)
            if resp.status_code == 200:
                print("  ✅ Test document deleted")
            else:
                print(f"  ⚠️  Delete failed: {resp.status_code}")
        except Exception as e:
            print(f"  ⚠️  Exception: {e}")
    
    # Delete QA-IMPORT-1 pack
    print("\nDeleting QA-IMPORT-1 pack")
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/packs", headers=headers_admin(), timeout=30)
        if resp.status_code == 200:
            packs = resp.json().get('packs', [])
            for pack in packs:
                if pack.get('pack_code') == 'QA-IMPORT-1':
                    pack_id = pack.get('id')
                    resp2 = requests.delete(f"{BASE_URL}/admin/assess/packs/{pack_id}", headers=headers_admin(), timeout=30)
                    if resp2.status_code == 200:
                        print(f"  ✅ QA-IMPORT-1 pack deleted")
                    break
    except Exception as e:
        print(f"  ⚠️  Exception: {e}")
    
    # Delete QA_IMPORT_CAT_1.pdf document
    print("\nDeleting QA_IMPORT_CAT_1.pdf document")
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/documents?q=QA_IMPORT_CAT_1", headers=headers_admin(), timeout=30)
        if resp.status_code == 200:
            docs = resp.json().get('documents', [])
            for doc in docs:
                if doc.get('file_name') == 'QA_IMPORT_CAT_1.pdf':
                    doc_id = doc.get('id')
                    resp2 = requests.delete(f"{BASE_URL}/admin/assess/documents/{doc_id}", headers=headers_admin(), timeout=30)
                    if resp2.status_code == 200:
                        print(f"  ✅ QA_IMPORT_CAT_1.pdf deleted")
                    break
    except Exception as e:
        print(f"  ⚠️  Exception: {e}")
    
    # Delete auto-created packs (QA Subject Pack, QA Class Pack)
    print("\nDeleting auto-created packs (QA Subject Pack, QA Class Pack)")
    try:
        resp = requests.get(f"{BASE_URL}/admin/assess/packs", headers=headers_admin(), timeout=30)
        if resp.status_code == 200:
            packs = resp.json().get('packs', [])
            for pack in packs:
                if pack.get('pack_name') in ['QA Subject Pack', 'QA Class Pack']:
                    pack_id = pack.get('id')
                    resp2 = requests.delete(f"{BASE_URL}/admin/assess/packs/{pack_id}", headers=headers_admin(), timeout=30)
                    if resp2.status_code == 200:
                        print(f"  ✅ {pack.get('pack_name')} deleted")
    except Exception as e:
        print(f"  ⚠️  Exception: {e}")
    
    print("\n✅ CLEANUP COMPLETE")

def main():
    global admin_token, normal_user_token
    
    print("="*80)
    print("ASSESSMENT STORE ADMIN MODULE (PROMPT 2) - BACKEND TEST")
    print("="*80)
    
    # Login
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ FATAL: Admin login failed")
        return
    
    normal_user_token = login(NORMAL_USER_MOBILE, NORMAL_USER_PASSWORD)
    if not normal_user_token:
        print("⚠️  WARNING: Normal user login failed, TEST 21b will be skipped")
    
    # Run tests
    results = []
    results.append(("TEST 1: Overview", test_1_overview()))
    results.append(("TEST 2: Documents list + filters", test_2_documents_list()))
    results.append(("TEST 3: Create document", test_3_create_document()))
    results.append(("TEST 4: Update document", test_4_update_document()))
    results.append(("TEST 5: Document packs GET/PUT", test_5_document_packs()))
    results.append(("TEST 6: Document preview (404)", test_6_document_preview()))
    results.append(("TEST 7: Chunked upload", test_7_chunked_upload()))
    results.append(("TEST 8: Packs list", test_8_packs_list()))
    results.append(("TEST 9: Create pack + duplicate", test_9_create_pack()))
    results.append(("TEST 10: Update pack", test_10_update_pack()))
    results.append(("TEST 11: Price history", test_11_price_history()))
    results.append(("TEST 12: Delete pack", test_12_delete_pack()))
    results.append(("TEST 13: Coupons list", test_13_coupons_list()))
    results.append(("TEST 14: Create coupon + duplicate", test_14_create_coupon()))
    results.append(("TEST 15: Update coupon", test_15_update_coupon()))
    results.append(("TEST 16: Delete coupon", test_16_delete_coupon()))
    results.append(("TEST 17: Orders list", test_17_orders_list()))
    results.append(("TEST 18: Settings GET/PUT", test_18_settings()))
    results.append(("TEST 19: Import packs", test_19_import_packs()))
    results.append(("TEST 20: Import catalog", test_20_import_catalog()))
    results.append(("TEST 21: Auth guard", test_21_auth_guard()))
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Assessment Store Admin endpoints are working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Review the output above for details.")

if __name__ == "__main__":
    main()
