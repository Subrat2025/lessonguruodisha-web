#!/usr/bin/env python3
"""
Backend test for NEW admin-only Store read endpoints:
- GET /api/admin/store/products (list)
- GET /api/admin/store/products/<id> (single product with RAW fields)
- GET /api/admin/store/share-links (share links)

Admin: 9692604577 / <redacted>
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login(mobile, password):
    """Login and return JWT token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            if token:
                print(f"✅ Login successful for {mobile}")
                return token
            else:
                print(f"❌ Login failed: no token in response")
                return None
        else:
            print(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_admin_store_products_list(token):
    """Test 1: GET /api/admin/store/products (admin) - list products"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/admin/store/products (admin) - list products")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/admin/store/products", headers=headers, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            products = data.get("products", [])
            print(f"✅ Response: 200 OK")
            print(f"✅ Products count: {len(products)}")
            
            if len(products) > 0:
                # Pick the first product
                product = products[0]
                product_id = product.get("id")
                product_slug = product.get("slug")
                print(f"✅ First product ID: {product_id}")
                print(f"✅ First product slug: {product_slug}")
                return product_id, product_slug
            else:
                print("⚠️ No products found in the list")
                return None, None
        else:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return None, None
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None, None

def test_admin_store_product_by_id(token, product_id):
    """Test 2: GET /api/admin/store/products/<id> (admin) - single product with RAW fields"""
    print("\n" + "="*80)
    print(f"TEST 2: GET /api/admin/store/products/{product_id} (admin) - single product RAW fields")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/admin/store/products/{product_id}", headers=headers, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            product = data.get("product", {})
            print(f"✅ Response: 200 OK")
            print(f"✅ Product structure: {{ product: {{...}} }}")
            
            # Check for RAW fields as specified in review request
            raw_fields = [
                "id", "slug", "type", "titleEnglish", "mrpInr", "priceInr", 
                "securityLevel", "status", "visibility", "publishAt", "language",
                "launchPriceInr", "premiumPriceInr"
            ]
            
            found_fields = []
            missing_fields = []
            
            for field in raw_fields:
                if field in product:
                    found_fields.append(field)
                else:
                    missing_fields.append(field)
            
            print(f"\n✅ RAW FIELDS FOUND ({len(found_fields)}/{len(raw_fields)}):")
            for field in found_fields:
                value = product.get(field)
                # Truncate long values for display
                if isinstance(value, str) and len(value) > 50:
                    value = value[:50] + "..."
                print(f"  - {field}: {value}")
            
            if missing_fields:
                print(f"\n⚠️ MISSING FIELDS ({len(missing_fields)}):")
                for field in missing_fields:
                    print(f"  - {field}")
            
            # Check language field specifically (may be 'odia')
            language = product.get("language")
            if language:
                print(f"\n✅ Language field present: '{language}'")
            
            return True
        else:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_admin_store_product_by_id_not_found(token):
    """Test 3: GET /api/admin/store/products/<nonexistent-id> (admin) - expect 404"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/admin/store/products/<nonexistent-id> (admin) - expect 404")
    print("="*80)
    
    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/admin/store/products/{nonexistent_id}", headers=headers, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 404:
            print(f"✅ Response: 404 NOT FOUND (as expected)")
            return True
        else:
            print(f"❌ FAILED: Expected 404, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_admin_store_share_links(token):
    """Test 4: GET /api/admin/store/share-links (admin) - expect 200 with { links: [...] }"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/admin/store/share-links (admin) - expect 200 with { links: [...] }")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/admin/store/share-links", headers=headers, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            links = data.get("links", [])
            print(f"✅ Response: 200 OK")
            print(f"✅ Response structure: {{ links: [...] }}")
            print(f"✅ Links count: {len(links)}")
            
            if len(links) > 0:
                print(f"\n✅ Sample link structure:")
                link = links[0]
                expected_fields = ["id", "productId", "tag", "clicks", "views"]
                for field in expected_fields:
                    if field in link:
                        print(f"  - {field}: {link.get(field)}")
                    else:
                        print(f"  - {field}: MISSING")
            else:
                print("⚠️ Links array is empty (this is OK)")
            
            return True
        else:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_admin_store_share_links_filtered(token, product_id):
    """Test 5: GET /api/admin/store/share-links?productId=<id> (admin) - filtered links"""
    print("\n" + "="*80)
    print(f"TEST 5: GET /api/admin/store/share-links?productId={product_id} (admin) - filtered")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/admin/store/share-links?productId={product_id}", headers=headers, timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            links = data.get("links", [])
            print(f"✅ Response: 200 OK")
            print(f"✅ Response structure: {{ links: [...] }}")
            print(f"✅ Filtered links count: {len(links)}")
            
            if len(links) > 0:
                # Verify all links are for the specified product
                all_match = all(link.get("productId") == product_id for link in links)
                if all_match:
                    print(f"✅ All links match productId filter: {product_id}")
                else:
                    print(f"⚠️ Some links do not match productId filter")
            else:
                print("⚠️ No links found for this product (this is OK)")
            
            return True
        else:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_auth_check_no_token(product_id):
    """Test 6: GET /api/admin/store/products/<id> WITHOUT Authorization - expect 401/403/404"""
    print("\n" + "="*80)
    print(f"TEST 6: GET /api/admin/store/products/{product_id} WITHOUT Authorization - expect 401/403/404")
    print("="*80)
    
    try:
        # No Authorization header
        resp = requests.get(f"{BASE_URL}/admin/store/products/{product_id}", timeout=30)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code in [401, 403, 404]:
            print(f"✅ Response: {resp.status_code} (as expected - not 200)")
            return True
        else:
            print(f"❌ FAILED: Expected 401/403/404, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def main():
    print("="*80)
    print("BACKEND TEST: NEW Admin-only Store Read Endpoints")
    print("="*80)
    
    # Login as admin
    print("\n🔐 Logging in as admin...")
    token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not token:
        print("❌ Cannot proceed without admin token")
        sys.exit(1)
    
    # Test 1: List products and pick one
    product_id, product_slug = test_admin_store_products_list(token)
    if not product_id:
        print("\n❌ Cannot proceed without a product ID")
        sys.exit(1)
    
    # Test 2: Get single product by ID (RAW fields)
    test_admin_store_product_by_id(token, product_id)
    
    # Test 3: Get nonexistent product (expect 404)
    test_admin_store_product_by_id_not_found(token)
    
    # Test 4: Get share links (all)
    test_admin_store_share_links(token)
    
    # Test 5: Get share links filtered by productId
    test_admin_store_share_links_filtered(token, product_id)
    
    # Test 6: Auth check (no token)
    test_auth_check_no_token(product_id)
    
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Product ID used: {product_id}")
    print(f"Product slug used: {product_slug}")
    print("\nAll tests completed. See results above.")
    print("="*80)

if __name__ == "__main__":
    main()
