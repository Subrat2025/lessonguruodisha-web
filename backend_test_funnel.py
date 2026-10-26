#!/usr/bin/env python3
"""
Backend test for Store Analytics Funnel — Day-One Funnel Tracking
Tests the new funnel tracking feature with TEST account exclusion.
"""

import requests
import json
import time
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
TEST_MOBILE = "8000000001"
TEST_PASSWORD = "<redacted>"

class FunnelTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.admin_token = None
        self.test_token = None
        self.test_results = []
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
        
    def login(self, mobile: str, password: str) -> Optional[str]:
        """Login and get JWT token"""
        try:
            self.log(f"Logging in as {mobile}...")
            url = f"{self.base_url}/auth/login"
            payload = {"mobile": mobile, "password": password}
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                if token:
                    self.log(f"✅ Login successful for {mobile}")
                    return token
                else:
                    self.log(f"❌ No token in login response for {mobile}", "ERROR")
                    return None
            else:
                self.log(f"❌ Login failed for {mobile}: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ Login exception for {mobile}: {str(e)}", "ERROR")
            return None
    
    def get_funnel(self, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get funnel data from admin endpoint"""
        try:
            url = f"{self.base_url}/admin/store/funnel"
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": True, "status": response.status_code, "text": response.text}
        except Exception as e:
            self.log(f"❌ Get funnel exception: {str(e)}", "ERROR")
            return {"error": True, "exception": str(e)}
    
    def get_products(self, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get store products list"""
        try:
            url = f"{self.base_url}/store/products"
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                return response.json()
            else:
                self.log(f"❌ Get products failed: {response.status_code}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ Get products exception: {str(e)}", "ERROR")
            return None
    
    def get_product_detail(self, slug: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get product detail"""
        try:
            url = f"{self.base_url}/store/product/{slug}"
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                return response.json()
            else:
                self.log(f"❌ Get product detail failed: {response.status_code}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ Get product detail exception: {str(e)}", "ERROR")
            return None
    
    def add_to_cart(self, product_id: str, token: str) -> bool:
        """Add product to cart"""
        try:
            url = f"{self.base_url}/store/cart/add"
            headers = {"Authorization": f"Bearer {token}"}
            payload = {"productId": product_id}
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            
            if response.status_code == 200:
                return True
            else:
                self.log(f"❌ Add to cart failed: {response.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Add to cart exception: {str(e)}", "ERROR")
            return False
    
    def checkout(self, product_ids: list, token: str, confirm: bool = False) -> Optional[Dict[str, Any]]:
        """Initiate checkout"""
        try:
            url = f"{self.base_url}/store/checkout"
            headers = {"Authorization": f"Bearer {token}"}
            payload = {"productIds": product_ids, "confirm": confirm}
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            
            if response.status_code in [200, 400]:  # 400 is ok for priceChanged/error
                return response.json()
            else:
                self.log(f"❌ Checkout failed: {response.status_code}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ Checkout exception: {str(e)}", "ERROR")
            return None
    
    def test_1_admin_endpoint_access(self) -> bool:
        """TEST 1: GET /api/admin/store/funnel access control"""
        self.log("\n" + "="*80)
        self.log("TEST 1: Admin Endpoint Access Control")
        self.log("="*80)
        
        try:
            # Test 1a: Anonymous access (no token) - should be blocked
            self.log("\n1a) Testing anonymous access (no token)...")
            result = self.get_funnel(token=None)
            if result and result.get("error") and result.get("status") in [401, 403, 404]:
                self.log(f"✅ PASS: Anonymous access blocked with {result.get('status')}")
            else:
                self.log(f"❌ FAIL: Anonymous access should be blocked, got: {result}", "ERROR")
                return False
            
            # Test 1b: Admin access - should work
            self.log("\n1b) Testing admin access...")
            result = self.get_funnel(token=self.admin_token)
            if result and not result.get("error"):
                self.log(f"✅ PASS: Admin access granted")
                
                # Verify response structure
                if "today" in result and "all" in result and "generatedAt" in result:
                    self.log(f"✅ PASS: Response has correct top-level keys (today, all, generatedAt)")
                    
                    # Verify today block structure
                    today = result["today"]
                    required_keys = ["views", "listViews", "productViews", "addToCart", "checkout", "paid", "rates"]
                    missing_keys = [k for k in required_keys if k not in today]
                    if not missing_keys:
                        self.log(f"✅ PASS: 'today' block has all required keys: {required_keys}")
                    else:
                        self.log(f"❌ FAIL: 'today' block missing keys: {missing_keys}", "ERROR")
                        return False
                    
                    # Verify rates structure
                    rates = today.get("rates", {})
                    rate_keys = ["viewToCart", "cartToCheckout", "checkoutToPaid", "viewToPaid"]
                    missing_rate_keys = [k for k in rate_keys if k not in rates]
                    if not missing_rate_keys:
                        self.log(f"✅ PASS: 'rates' object has all required keys: {rate_keys}")
                    else:
                        self.log(f"❌ FAIL: 'rates' object missing keys: {missing_rate_keys}", "ERROR")
                        return False
                    
                    # Verify all block structure (same as today)
                    all_block = result["all"]
                    missing_all_keys = [k for k in required_keys if k not in all_block]
                    if not missing_all_keys:
                        self.log(f"✅ PASS: 'all' block has all required keys: {required_keys}")
                    else:
                        self.log(f"❌ FAIL: 'all' block missing keys: {missing_all_keys}", "ERROR")
                        return False
                    
                    # Log current counts
                    self.log(f"\n📊 Current Funnel Counts (all-time):")
                    self.log(f"   views: {all_block.get('views')}")
                    self.log(f"   listViews: {all_block.get('listViews')}")
                    self.log(f"   productViews: {all_block.get('productViews')}")
                    self.log(f"   addToCart: {all_block.get('addToCart')}")
                    self.log(f"   checkout: {all_block.get('checkout')}")
                    self.log(f"   paid: {all_block.get('paid')}")
                    
                else:
                    self.log(f"❌ FAIL: Response missing top-level keys. Got: {list(result.keys())}", "ERROR")
                    return False
            else:
                self.log(f"❌ FAIL: Admin access failed: {result}", "ERROR")
                return False
            
            self.log("\n✅ TEST 1 PASSED: Admin endpoint access control working correctly")
            return True
            
        except Exception as e:
            self.log(f"❌ TEST 1 FAILED with exception: {str(e)}", "ERROR")
            return False
    
    def test_2_test_account_exclusion(self) -> bool:
        """TEST 2: TEST account activity must NOT increment funnel counts"""
        self.log("\n" + "="*80)
        self.log("TEST 2: TEST Account Exclusion (Critical)")
        self.log("="*80)
        
        try:
            # Get baseline funnel counts
            self.log("\n2a) Capturing baseline funnel counts...")
            baseline = self.get_funnel(token=self.admin_token)
            if not baseline or baseline.get("error"):
                self.log(f"❌ FAIL: Could not get baseline funnel counts", "ERROR")
                return False
            
            baseline_all = baseline["all"]
            self.log(f"📊 Baseline (all-time):")
            self.log(f"   views: {baseline_all.get('views')}")
            self.log(f"   listViews: {baseline_all.get('listViews')}")
            self.log(f"   productViews: {baseline_all.get('productViews')}")
            self.log(f"   addToCart: {baseline_all.get('addToCart')}")
            self.log(f"   checkout: {baseline_all.get('checkout')}")
            
            # Perform TEST account activities
            self.log("\n2b) Performing TEST account activities...")
            
            # Activity 1: GET /api/store/products (list view)
            self.log("   - GET /api/store/products (as TEST account)...")
            products_result = self.get_products(token=self.test_token)
            if not products_result:
                self.log(f"❌ FAIL: Could not get products list", "ERROR")
                return False
            self.log(f"   ✅ Products list retrieved")
            
            # Get a published product slug for detail view
            products = products_result.get("products", [])
            if not products:
                self.log(f"❌ FAIL: No products available for testing", "ERROR")
                return False
            
            test_product = products[0]
            product_slug = test_product.get("slug")
            product_id = test_product.get("id")
            self.log(f"   - Using product: {test_product.get('titleOdia', 'N/A')} (slug: {product_slug})")
            
            # Activity 2: GET /api/store/product/:slug (product view)
            self.log(f"   - GET /api/store/product/{product_slug} (as TEST account)...")
            product_detail = self.get_product_detail(slug=product_slug, token=self.test_token)
            if not product_detail:
                self.log(f"❌ FAIL: Could not get product detail", "ERROR")
                return False
            self.log(f"   ✅ Product detail retrieved")
            
            # Activity 3: POST /api/store/cart/add (add to cart)
            self.log(f"   - POST /api/store/cart/add (as TEST account)...")
            cart_result = self.add_to_cart(product_id=product_id, token=self.test_token)
            if not cart_result:
                self.log(f"❌ FAIL: Could not add to cart", "ERROR")
                return False
            self.log(f"   ✅ Product added to cart")
            
            # Activity 4: POST /api/store/checkout (checkout)
            self.log(f"   - POST /api/store/checkout (as TEST account)...")
            checkout_result = self.checkout(product_ids=[product_id], token=self.test_token, confirm=False)
            if not checkout_result:
                self.log(f"❌ FAIL: Could not initiate checkout", "ERROR")
                return False
            self.log(f"   ✅ Checkout initiated (result: {checkout_result.get('error', 'ok')})")
            
            # Wait a moment for events to be logged
            self.log("\n   ⏳ Waiting 2 seconds for events to be logged...")
            time.sleep(2)
            
            # Get updated funnel counts
            self.log("\n2c) Capturing updated funnel counts...")
            updated = self.get_funnel(token=self.admin_token)
            if not updated or updated.get("error"):
                self.log(f"❌ FAIL: Could not get updated funnel counts", "ERROR")
                return False
            
            updated_all = updated["all"]
            self.log(f"📊 Updated (all-time):")
            self.log(f"   views: {updated_all.get('views')}")
            self.log(f"   listViews: {updated_all.get('listViews')}")
            self.log(f"   productViews: {updated_all.get('productViews')}")
            self.log(f"   addToCart: {updated_all.get('addToCart')}")
            self.log(f"   checkout: {updated_all.get('checkout')}")
            
            # Verify counts did NOT increase
            self.log("\n2d) Verifying TEST account exclusion...")
            
            views_diff = updated_all.get("views", 0) - baseline_all.get("views", 0)
            listViews_diff = updated_all.get("listViews", 0) - baseline_all.get("listViews", 0)
            productViews_diff = updated_all.get("productViews", 0) - baseline_all.get("productViews", 0)
            addToCart_diff = updated_all.get("addToCart", 0) - baseline_all.get("addToCart", 0)
            checkout_diff = updated_all.get("checkout", 0) - baseline_all.get("checkout", 0)
            
            self.log(f"📈 Differences:")
            self.log(f"   views: +{views_diff}")
            self.log(f"   listViews: +{listViews_diff}")
            self.log(f"   productViews: +{productViews_diff}")
            self.log(f"   addToCart: +{addToCart_diff}")
            self.log(f"   checkout: +{checkout_diff}")
            
            all_zero = (views_diff == 0 and listViews_diff == 0 and productViews_diff == 0 
                       and addToCart_diff == 0 and checkout_diff == 0)
            
            if all_zero:
                self.log(f"\n✅ PASS: TEST account activity correctly EXCLUDED from funnel counts")
                self.log(f"   All counts remained unchanged (test=true events filtered out)")
            else:
                self.log(f"\n❌ FAIL: TEST account activity was NOT excluded!", "ERROR")
                self.log(f"   Expected all differences to be 0, but got non-zero changes", "ERROR")
                return False
            
            self.log("\n✅ TEST 2 PASSED: TEST account exclusion working correctly")
            return True
            
        except Exception as e:
            self.log(f"❌ TEST 2 FAILED with exception: {str(e)}", "ERROR")
            return False
    
    def test_3_real_tracking(self) -> bool:
        """TEST 3: Real user/anonymous activity SHOULD increment funnel counts"""
        self.log("\n" + "="*80)
        self.log("TEST 3: Real Tracking (Admin as Real User)")
        self.log("="*80)
        
        try:
            # Get baseline funnel counts
            self.log("\n3a) Capturing baseline funnel counts...")
            baseline = self.get_funnel(token=self.admin_token)
            if not baseline or baseline.get("error"):
                self.log(f"❌ FAIL: Could not get baseline funnel counts", "ERROR")
                return False
            
            baseline_all = baseline["all"]
            self.log(f"📊 Baseline (all-time):")
            self.log(f"   views: {baseline_all.get('views')}")
            self.log(f"   listViews: {baseline_all.get('listViews')}")
            self.log(f"   productViews: {baseline_all.get('productViews')}")
            self.log(f"   addToCart: {baseline_all.get('addToCart')}")
            
            # Perform real user activities (as admin, which is a real account)
            self.log("\n3b) Performing real user activities (as admin)...")
            
            # Activity 1: GET /api/store/products (list view)
            self.log("   - GET /api/store/products (as admin/real user)...")
            products_result = self.get_products(token=self.admin_token)
            if not products_result:
                self.log(f"❌ FAIL: Could not get products list", "ERROR")
                return False
            self.log(f"   ✅ Products list retrieved")
            
            # Get a published product slug for detail view
            products = products_result.get("products", [])
            if not products:
                self.log(f"❌ FAIL: No products available for testing", "ERROR")
                return False
            
            test_product = products[0]
            product_slug = test_product.get("slug")
            self.log(f"   - Using product: {test_product.get('titleOdia', 'N/A')} (slug: {product_slug})")
            
            # Activity 2: GET /api/store/product/:slug (product view)
            self.log(f"   - GET /api/store/product/{product_slug} (as admin/real user)...")
            product_detail = self.get_product_detail(slug=product_slug, token=self.admin_token)
            if not product_detail:
                self.log(f"❌ FAIL: Could not get product detail", "ERROR")
                return False
            self.log(f"   ✅ Product detail retrieved")
            
            # Wait a moment for events to be logged
            self.log("\n   ⏳ Waiting 2 seconds for events to be logged...")
            time.sleep(2)
            
            # Get updated funnel counts
            self.log("\n3c) Capturing updated funnel counts...")
            updated = self.get_funnel(token=self.admin_token)
            if not updated or updated.get("error"):
                self.log(f"❌ FAIL: Could not get updated funnel counts", "ERROR")
                return False
            
            updated_all = updated["all"]
            self.log(f"📊 Updated (all-time):")
            self.log(f"   views: {updated_all.get('views')}")
            self.log(f"   listViews: {updated_all.get('listViews')}")
            self.log(f"   productViews: {updated_all.get('productViews')}")
            self.log(f"   addToCart: {updated_all.get('addToCart')}")
            
            # Verify counts DID increase
            self.log("\n3d) Verifying real tracking...")
            
            views_diff = updated_all.get("views", 0) - baseline_all.get("views", 0)
            listViews_diff = updated_all.get("listViews", 0) - baseline_all.get("listViews", 0)
            productViews_diff = updated_all.get("productViews", 0) - baseline_all.get("productViews", 0)
            
            self.log(f"📈 Differences:")
            self.log(f"   views: +{views_diff}")
            self.log(f"   listViews: +{listViews_diff}")
            self.log(f"   productViews: +{productViews_diff}")
            
            # We expect:
            # - views to increase by 2 (1 list view + 1 product view)
            # - listViews to increase by 1
            # - productViews to increase by 1
            
            success = True
            
            if views_diff >= 2:
                self.log(f"   ✅ PASS: views increased by {views_diff} (expected >= 2)")
            else:
                self.log(f"   ❌ FAIL: views increased by {views_diff} (expected >= 2)", "ERROR")
                success = False
            
            if listViews_diff >= 1:
                self.log(f"   ✅ PASS: listViews increased by {listViews_diff} (expected >= 1)")
            else:
                self.log(f"   ❌ FAIL: listViews increased by {listViews_diff} (expected >= 1)", "ERROR")
                success = False
            
            if productViews_diff >= 1:
                self.log(f"   ✅ PASS: productViews increased by {productViews_diff} (expected >= 1)")
            else:
                self.log(f"   ❌ FAIL: productViews increased by {productViews_diff} (expected >= 1)", "ERROR")
                success = False
            
            if success:
                self.log(f"\n✅ PASS: Real user activity correctly TRACKED in funnel counts")
            else:
                self.log(f"\n❌ FAIL: Real user activity was NOT tracked correctly!", "ERROR")
                return False
            
            self.log("\n✅ TEST 3 PASSED: Real tracking working correctly")
            return True
            
        except Exception as e:
            self.log(f"❌ TEST 3 FAILED with exception: {str(e)}", "ERROR")
            return False
    
    def run_all_tests(self):
        """Run all tests"""
        self.log("\n" + "="*80)
        self.log("STORE ANALYTICS FUNNEL — Backend Testing")
        self.log("="*80)
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Admin: {ADMIN_MOBILE}")
        self.log(f"TEST account: {TEST_MOBILE}")
        
        # Login
        self.log("\n" + "="*80)
        self.log("SETUP: Logging in...")
        self.log("="*80)
        
        self.admin_token = self.login(ADMIN_MOBILE, ADMIN_PASSWORD)
        if not self.admin_token:
            self.log("❌ FATAL: Could not login as admin", "ERROR")
            return False
        
        self.test_token = self.login(TEST_MOBILE, TEST_PASSWORD)
        if not self.test_token:
            self.log("❌ FATAL: Could not login as TEST account", "ERROR")
            return False
        
        # Run tests
        results = []
        
        # Test 1: Admin endpoint access
        results.append(("TEST 1: Admin Endpoint Access", self.test_1_admin_endpoint_access()))
        
        # Test 2: TEST account exclusion (CRITICAL)
        results.append(("TEST 2: TEST Account Exclusion", self.test_2_test_account_exclusion()))
        
        # Test 3: Real tracking
        results.append(("TEST 3: Real Tracking", self.test_3_real_tracking()))
        
        # Summary
        self.log("\n" + "="*80)
        self.log("TEST SUMMARY")
        self.log("="*80)
        
        passed = sum(1 for _, result in results if result)
        total = len(results)
        
        for name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status}: {name}")
        
        self.log(f"\n📊 Results: {passed}/{total} tests passed")
        
        if passed == total:
            self.log("\n🎉 ALL TESTS PASSED! Store Analytics Funnel is working correctly.")
            return True
        else:
            self.log(f"\n❌ {total - passed} test(s) FAILED. Please review the errors above.", "ERROR")
            return False

def main():
    tester = FunnelTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)

if __name__ == "__main__":
    main()
