#!/usr/bin/env python3
"""
LessonGuru Store Round-4 Backend Test
Buyer-access safety net: owners keep access to purchases even when store master switch is OFF
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log_success(msg: str):
    print(f"{Colors.GREEN}✅ {msg}{Colors.RESET}")

def log_error(msg: str):
    print(f"{Colors.RED}❌ {msg}{Colors.RESET}")

def log_info(msg: str):
    print(f"{Colors.BLUE}ℹ️  {msg}{Colors.RESET}")

def log_warning(msg: str):
    print(f"{Colors.YELLOW}⚠️  {msg}{Colors.RESET}")

def login(mobile: str, password: str) -> Optional[str]:
    """Login and return JWT token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            log_success(f"Logged in as {mobile}")
            return token
        else:
            log_error(f"Login failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        log_error(f"Login exception: {e}")
        return None

def test_endpoint(url: str, method: str = "GET", headers: Optional[Dict] = None, json_data: Optional[Dict] = None, expected_status: int = 200, description: str = "") -> Dict[str, Any]:
    """Test an endpoint and return result"""
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=10)
        elif method == "PUT":
            resp = requests.put(url, headers=headers, json=json_data, timeout=10)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        success = resp.status_code == expected_status
        result = {
            "success": success,
            "status": resp.status_code,
            "expected": expected_status,
            "url": url,
            "description": description
        }
        
        try:
            result["data"] = resp.json()
        except:
            result["data"] = resp.text[:200] if resp.text else None
        
        if success:
            log_success(f"{description}: {resp.status_code}")
        else:
            log_error(f"{description}: Expected {expected_status}, got {resp.status_code}")
            if result["data"]:
                log_info(f"Response: {result['data']}")
        
        return result
    except Exception as e:
        log_error(f"{description}: Exception - {e}")
        return {"success": False, "error": str(e), "description": description}

def main():
    print("\n" + "="*80)
    print("LESSONGURU STORE ROUND-4 TEST: Buyer-Access Safety Net")
    print("="*80 + "\n")
    
    # Login as admin (who is also a beta tester)
    log_info("Logging in as admin/beta tester...")
    token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not token:
        log_error("Failed to login. Aborting tests.")
        sys.exit(1)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Store original settings for restoration
    original_settings = None
    real_product_id = None
    real_product_slug = None
    
    print("\n" + "="*80)
    print("PART 1: REGRESSION TESTING (Store ON - Must NOT Break)")
    print("="*80 + "\n")
    
    results_part1 = []
    
    # 1. GET /api/store/config -> enabled:true
    log_info("[1/6] Testing GET /api/store/config...")
    result = test_endpoint(
        f"{BASE_URL}/store/config",
        headers=headers,
        description="GET /store/config (store ON)"
    )
    results_part1.append(result)
    if result["success"] and result["data"]:
        enabled = result["data"].get("enabled")
        if enabled:
            log_success(f"Store enabled: {enabled}")
        else:
            log_error(f"Store should be enabled but got: {enabled}")
            result["success"] = False
    
    # 2. GET /api/store/products -> products array
    log_info("[2/6] Testing GET /api/store/products...")
    result = test_endpoint(
        f"{BASE_URL}/store/products",
        headers=headers,
        description="GET /store/products (store ON)"
    )
    results_part1.append(result)
    if result["success"] and result["data"]:
        products = result["data"].get("products", [])
        log_success(f"Products returned: {len(products)} products")
        if len(products) > 0:
            # Pick the first product for later tests
            real_product_id = products[0].get("id")
            real_product_slug = products[0].get("slug")
            log_info(f"Using product: {products[0].get('title')} (ID: {real_product_id}, slug: {real_product_slug})")
    
    # 3. GET /api/store/library
    log_info("[3/6] Testing GET /api/store/library...")
    result = test_endpoint(
        f"{BASE_URL}/store/library",
        headers=headers,
        description="GET /store/library (store ON)"
    )
    results_part1.append(result)
    
    # 4. GET /api/store/orders
    log_info("[4/6] Testing GET /api/store/orders...")
    result = test_endpoint(
        f"{BASE_URL}/store/orders",
        headers=headers,
        description="GET /store/orders (store ON)"
    )
    results_part1.append(result)
    
    # 5. GET /api/store/cart
    log_info("[5/6] Testing GET /api/store/cart...")
    result = test_endpoint(
        f"{BASE_URL}/store/cart",
        headers=headers,
        description="GET /store/cart (store ON)"
    )
    results_part1.append(result)
    
    # 6. POST /api/store/coupon/validate
    if real_product_id:
        log_info("[6/6] Testing POST /api/store/coupon/validate...")
        result = test_endpoint(
            f"{BASE_URL}/store/coupon/validate",
            method="POST",
            headers=headers,
            json_data={"code": "FESTIVE2026", "productIds": [real_product_id]},
            description="POST /store/coupon/validate (store ON)"
        )
        results_part1.append(result)
    else:
        log_warning("Skipping coupon validation test - no product ID available")
    
    # Summary for Part 1
    part1_passed = sum(1 for r in results_part1 if r.get("success"))
    part1_total = len(results_part1)
    print(f"\n{'='*80}")
    print(f"PART 1 SUMMARY: {part1_passed}/{part1_total} tests passed")
    print(f"{'='*80}\n")
    
    if part1_passed < part1_total:
        log_error("PART 1 FAILED - Regression tests did not pass. Aborting PART 2.")
        sys.exit(1)
    
    print("\n" + "="*80)
    print("PART 2: OFF-PATH BEHAVIOR (Store OFF - Buyer Access Safety Net)")
    print("="*80 + "\n")
    
    results_part2 = []
    
    # Step 1: GET current store settings
    log_info("[STEP 1] Getting current store settings...")
    result = test_endpoint(
        f"{BASE_URL}/admin/store/settings",
        headers=headers,
        description="GET /admin/store/settings"
    )
    if not result["success"]:
        log_error("Failed to get store settings. Aborting PART 2.")
        sys.exit(1)
    
    original_settings = result["data"].get("settings", {})
    log_success(f"Original settings retrieved: enabled={original_settings.get('enabled')}")
    log_info(f"Settings keys: {list(original_settings.keys())}")
    
    # Step 2: PUT store settings with enabled=false
    log_info("[STEP 2] Disabling store (enabled=false)...")
    modified_settings = original_settings.copy()
    modified_settings["enabled"] = False
    
    result = test_endpoint(
        f"{BASE_URL}/admin/store/settings",
        method="PUT",
        headers=headers,
        json_data=modified_settings,
        description="PUT /admin/store/settings (enabled=false)"
    )
    if not result["success"]:
        log_error("Failed to disable store. Aborting PART 2.")
        sys.exit(1)
    
    log_success("Store disabled successfully")
    
    # Step 3: Verify store is disabled (logged-out request)
    log_info("[STEP 3] Testing logged-out requests (store OFF)...")
    
    # 3a. GET /api/store/config (no auth) -> enabled:false
    log_info("[3a] GET /store/config (logged-out, store OFF)...")
    result = test_endpoint(
        f"{BASE_URL}/store/config",
        description="GET /store/config (logged-out, store OFF)"
    )
    results_part2.append(result)
    if result["success"] and result["data"]:
        enabled = result["data"].get("enabled")
        if enabled == False:
            log_success(f"Store correctly shows enabled: {enabled}")
        else:
            log_error(f"Store should be disabled but got enabled: {enabled}")
            result["success"] = False
    
    # 3b. GET /api/store/products (no auth) -> 404
    log_info("[3b] GET /store/products (logged-out, store OFF) -> expect 404...")
    result = test_endpoint(
        f"{BASE_URL}/store/products",
        expected_status=404,
        description="GET /store/products (logged-out, store OFF)"
    )
    results_part2.append(result)
    
    # 3c. GET /api/store/product/:slug (no auth) -> 404
    if real_product_slug:
        log_info(f"[3c] GET /store/product/{real_product_slug} (logged-out, store OFF) -> expect 404...")
        result = test_endpoint(
            f"{BASE_URL}/store/product/{real_product_slug}",
            expected_status=404,
            description=f"GET /store/product/{real_product_slug} (logged-out, store OFF)"
        )
        results_part2.append(result)
    
    # Step 4: Test as admin/beta tester (logged in, store OFF)
    log_info("[STEP 4] Testing as admin/beta tester (logged in, store OFF)...")
    
    # 4a. GET /api/store/library -> 200 (owners keep access)
    log_info("[4a] GET /store/library (admin, store OFF) -> expect 200...")
    result = test_endpoint(
        f"{BASE_URL}/store/library",
        headers=headers,
        description="GET /store/library (admin, store OFF)"
    )
    results_part2.append(result)
    
    # 4b. GET /api/store/orders -> 200 (owners keep access)
    log_info("[4b] GET /store/orders (admin, store OFF) -> expect 200...")
    result = test_endpoint(
        f"{BASE_URL}/store/orders",
        headers=headers,
        description="GET /store/orders (admin, store OFF)"
    )
    results_part2.append(result)
    
    # 4c. GET /api/store/products -> 200 (beta tester still sees catalog)
    log_info("[4c] GET /store/products (admin/beta, store OFF) -> expect 200...")
    result = test_endpoint(
        f"{BASE_URL}/store/products",
        headers=headers,
        description="GET /store/products (admin/beta, store OFF)"
    )
    results_part2.append(result)
    
    # CRITICAL RESTORE: Step 5
    log_info("[STEP 5 - CRITICAL] RESTORING store settings (enabled=true)...")
    restore_settings = original_settings.copy()
    restore_settings["enabled"] = True
    
    result = test_endpoint(
        f"{BASE_URL}/admin/store/settings",
        method="PUT",
        headers=headers,
        json_data=restore_settings,
        description="PUT /admin/store/settings (RESTORE enabled=true)"
    )
    if not result["success"]:
        log_error("CRITICAL: Failed to restore store settings!")
        log_error("Manual intervention required: PUT /api/admin/store/settings with enabled=true")
        sys.exit(1)
    
    log_success("Store settings restored successfully")
    
    # Verify restoration
    log_info("[STEP 6] Verifying store is enabled again...")
    result = test_endpoint(
        f"{BASE_URL}/store/config",
        headers=headers,
        description="GET /store/config (verify restoration)"
    )
    if result["success"] and result["data"]:
        enabled = result["data"].get("enabled")
        if enabled == True:
            log_success(f"✅ CONFIRMED: Store is enabled again: {enabled}")
        else:
            log_error(f"❌ CRITICAL: Store should be enabled but got: {enabled}")
            log_error("Manual intervention required!")
            sys.exit(1)
    
    # Summary for Part 2
    part2_passed = sum(1 for r in results_part2 if r.get("success"))
    part2_total = len(results_part2)
    print(f"\n{'='*80}")
    print(f"PART 2 SUMMARY: {part2_passed}/{part2_total} tests passed")
    print(f"{'='*80}\n")
    
    # Final Summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    print(f"PART 1 (Regression): {part1_passed}/{part1_total} passed")
    print(f"PART 2 (OFF-path): {part2_passed}/{part2_total} passed")
    print(f"TOTAL: {part1_passed + part2_passed}/{part1_total + part2_total} passed")
    print("="*80)
    
    # Report product used
    if real_product_id and real_product_slug:
        print(f"\n📦 Real product used for testing:")
        print(f"   ID: {real_product_id}")
        print(f"   Slug: {real_product_slug}")
    
    # Final restoration confirmation
    print(f"\n✅ CRITICAL CONFIRMATION: Store master switch restored to enabled=true")
    
    if part1_passed == part1_total and part2_passed == part2_total:
        log_success("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        log_error("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
