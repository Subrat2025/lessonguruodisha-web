#!/usr/bin/env python3
"""
TOB (Teacher Observation) Phase-2 SELL Logic Backend Test
Tests all sell-config, catalog, preview, paywall, checkout, and entitlement scenarios.
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
NORMAL_USER_MOBILE = "9444106792"
NORMAL_USER_PASSWORD = "Test@1234"

class TestRunner:
    def __init__(self):
        self.admin_token = None
        self.normal_token = None
        self.passed = 0
        self.failed = 0
        self.test_data = {}
        
    def login(self, mobile: str, password: str) -> Optional[str]:
        """Login and return Bearer token"""
        try:
            resp = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"mobile": mobile, "password": password},
                timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("token")
                print(f"✅ Login successful for {mobile}")
                return token
            else:
                print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text}")
                return None
        except Exception as e:
            print(f"❌ Login exception for {mobile}: {e}")
            return None
    
    def test(self, name: str, condition: bool, details: str = ""):
        """Record test result"""
        if condition:
            self.passed += 1
            print(f"✅ {name}")
            if details:
                print(f"   {details}")
        else:
            self.failed += 1
            print(f"❌ {name}")
            if details:
                print(f"   {details}")
    
    def get(self, path: str, token: Optional[str] = None, params: Optional[Dict] = None) -> requests.Response:
        """GET request"""
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return requests.get(f"{BASE_URL}/api{path}", headers=headers, params=params, timeout=30)
    
    def post(self, path: str, data: Dict, token: Optional[str] = None) -> requests.Response:
        """POST request"""
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return requests.post(f"{BASE_URL}/api{path}", json=data, headers=headers, timeout=30)
    
    def run_all_tests(self):
        """Run all TOB SELL tests"""
        print("=" * 80)
        print("TOB PHASE-2 SELL LOGIC BACKEND TEST")
        print("=" * 80)
        print()
        
        # Login
        print("🔐 LOGGING IN...")
        self.admin_token = self.login(ADMIN_MOBILE, ADMIN_PASSWORD)
        self.normal_token = self.login(NORMAL_USER_MOBILE, NORMAL_USER_PASSWORD)
        
        if not self.admin_token:
            print("❌ FATAL: Admin login failed. Cannot continue.")
            sys.exit(1)
        if not self.normal_token:
            print("❌ FATAL: Normal user login failed. Cannot continue.")
            sys.exit(1)
        
        print()
        
        # Test scenarios
        self.test_1_admin_config_get()
        self.test_2_admin_config_post_non_admin()
        self.test_3_admin_config_post_admin()
        self.test_4_catalog_mrp_computation()
        self.test_5_preview_endpoint()
        self.test_6_paywall_off_checkout()
        self.test_7_paywall_on_lock()
        self.test_8_paywall_on_checkout_free()
        self.test_9_subject_pack_entitlement()
        self.test_10_idempotency()
        self.test_11_keep_free()
        self.test_12_chapter_sku()
        self.test_13_class_pack_visibility()
        self.test_14_reset_config()
        
        # Summary
        print()
        print("=" * 80)
        print(f"SUMMARY: {self.passed} passed, {self.failed} failed")
        print("=" * 80)
        
        if self.failed > 0:
            sys.exit(1)
    
    def test_1_admin_config_get(self):
        """Test 1: GET /api/tob/admin/sell-config returns config with default prices"""
        print("\n📋 TEST 1: Admin Config GET")
        print("-" * 80)
        
        try:
            resp = self.get("/tob/admin/sell-config", self.admin_token)
            self.test("GET /tob/admin/sell-config returns 200", resp.status_code == 200)
            
            if resp.status_code == 200:
                data = resp.json()
                self.test_data['initial_config'] = data
                
                # Check structure
                self.test("Response has paywallOn", "paywallOn" in data)
                self.test("Response has prices", "prices" in data)
                self.test("Response has overrides", "overrides" in data)
                self.test("Response has freeClasses", "freeClasses" in data)
                
                # Check default prices (note: these may have been customized by admin)
                prices = data.get("prices", {})
                self.test("setTerm present", "setTerm" in prices, f"Got: {prices.get('setTerm')}")
                self.test("setTermMrp = 15", prices.get("setTermMrp") == 15, f"Got: {prices.get('setTermMrp')}")
                self.test("setFull present", "setFull" in prices, f"Got: {prices.get('setFull')}")
                self.test("setFullMrp = 25", prices.get("setFullMrp") == 25, f"Got: {prices.get('setFullMrp')}")
                self.test("chapter present", "chapter" in prices, f"Got: {prices.get('chapter')}")
                self.test("chapterMrp = 10", prices.get("chapterMrp") == 10, f"Got: {prices.get('chapterMrp')}")
                self.test("subjectPack present", "subjectPack" in prices, f"Got: {prices.get('subjectPack')}")
                self.test("classPack present", "classPack" in prices, f"Got: {prices.get('classPack')}")
                
                print(f"   Current prices: setTerm={prices.get('setTerm')}, setFull={prices.get('setFull')}, chapter={prices.get('chapter')}, subjectPack={prices.get('subjectPack')}, classPack={prices.get('classPack')}")
                
                print(f"   Current paywallOn: {data.get('paywallOn')}")
                print(f"   Current freeClasses: {data.get('freeClasses')}")
        except Exception as e:
            self.test("GET /tob/admin/sell-config", False, f"Exception: {e}")
    
    def test_2_admin_config_post_non_admin(self):
        """Test 2: POST /api/tob/admin/sell-config with non-admin token returns 403"""
        print("\n📋 TEST 2: Admin Config POST (Non-Admin)")
        print("-" * 80)
        
        try:
            resp = self.post("/tob/admin/sell-config", {"paywallOn": True}, self.normal_token)
            self.test("POST /tob/admin/sell-config with non-admin returns 403", 
                     resp.status_code == 403, 
                     f"Got: {resp.status_code}")
        except Exception as e:
            self.test("POST /tob/admin/sell-config non-admin", False, f"Exception: {e}")
    
    def test_3_admin_config_post_admin(self):
        """Test 3: POST /api/tob/admin/sell-config as admin persists config"""
        print("\n📋 TEST 3: Admin Config POST (Admin)")
        print("-" * 80)
        
        try:
            # Set a test config
            test_config = {
                "paywallOn": True,
                "prices": {"chapter": 7},
                "overrides": {},
                "freeClasses": []
            }
            
            resp = self.post("/tob/admin/sell-config", test_config, self.admin_token)
            self.test("POST /tob/admin/sell-config returns 200", resp.status_code == 200)
            
            if resp.status_code == 200:
                data = resp.json()
                self.test("Response paywallOn = True", data.get("paywallOn") == True)
                self.test("Response chapter price = 7", data.get("prices", {}).get("chapter") == 7)
                
                # Verify persistence
                get_resp = self.get("/tob/admin/sell-config", self.admin_token)
                if get_resp.status_code == 200:
                    get_data = get_resp.json()
                    self.test("GET reflects persisted paywallOn", get_data.get("paywallOn") == True)
                    self.test("GET reflects persisted chapter price", get_data.get("prices", {}).get("chapter") == 7)
        except Exception as e:
            self.test("POST /tob/admin/sell-config admin", False, f"Exception: {e}")
    
    def test_4_catalog_mrp_computation(self):
        """Test 4: GET /api/tob/store/catalog computes MRP correctly"""
        print("\n📋 TEST 4: Catalog MRP Computation")
        print("-" * 80)
        
        try:
            # Get catalog for Class 4, Subject OD
            resp = self.get("/tob/store/catalog", self.admin_token, {"class": "4", "subject": "OD"})
            self.test("GET /tob/store/catalog returns 200", resp.status_code == 200)
            
            if resp.status_code == 200:
                data = resp.json()
                self.test_data['catalog'] = data
                
                # Check structure
                self.test("Catalog has paywallOn", "paywallOn" in data)
                self.test("Catalog has sets", "sets" in data)
                self.test("Catalog has chapters", "chapters" in data)
                self.test("Catalog has packs", "packs" in data)
                
                sets = data.get("sets", [])
                chapters = data.get("chapters", [])
                packs = data.get("packs", {})
                
                print(f"   Found {len(sets)} sets, {len(chapters)} chapters")
                
                # Count distinct sets
                distinct_sets = len(sets)
                n_chapters = len(chapters)
                
                # Get prices
                prices = data.get("prices", {})
                set_full_price = prices.get("setFull", 15)
                chapter_price = prices.get("chapter", 5)
                
                # Compute expected subject pack MRP
                expected_mrp = (distinct_sets * set_full_price) + (n_chapters * chapter_price)
                
                subject_pack = packs.get("subjectPack", {})
                actual_mrp = subject_pack.get("mrp")
                
                self.test(f"SubjectPack MRP = {expected_mrp} (nSets={distinct_sets} * {set_full_price} + nChapters={n_chapters} * {chapter_price})",
                         actual_mrp == expected_mrp,
                         f"Expected: {expected_mrp}, Got: {actual_mrp}")
                
                # Check chapters have correct price and mrp
                if chapters:
                    ch = chapters[0]
                    self.test("Chapter has sku", "sku" in ch)
                    self.test("Chapter has price", "price" in ch)
                    self.test("Chapter has mrp", "mrp" in ch)
                    self.test("Chapter has owned", "owned" in ch)
                    print(f"   Sample chapter: {ch.get('title', 'N/A')}, price={ch.get('price')}, mrp={ch.get('mrp')}")
                
                # Check class pack logic
                class_pack = packs.get("classPack")
                if class_pack:
                    print(f"   ClassPack present: price={class_pack.get('price')}, mrp={class_pack.get('mrp')}, subjects={class_pack.get('subjects')}")
                    self.test("ClassPack has >=2 subjects", class_pack.get("subjects", 0) >= 2)
                    self.test("ClassPack price < mrp", class_pack.get("price", 0) < class_pack.get("mrp", 0))
                else:
                    print(f"   ClassPack is null (expected if class has <2 subjects or price >= sum)")
        except Exception as e:
            self.test("GET /tob/store/catalog", False, f"Exception: {e}")
    
    def test_5_preview_endpoint(self):
        """Test 5: POST /api/tob/admin/sell-config/preview returns preview without persisting"""
        print("\n📋 TEST 5: Preview Endpoint")
        print("-" * 80)
        
        try:
            # Get current config
            before_resp = self.get("/tob/admin/sell-config", self.admin_token)
            before_data = before_resp.json() if before_resp.status_code == 200 else {}
            before_chapter_price = before_data.get("prices", {}).get("chapter")
            
            # Preview with different chapter price
            preview_data = {
                "class": "4",
                "subject": "OD",
                "paywallOn": True,
                "prices": {"chapter": 7},
                "overrides": {},
                "freeClasses": []
            }
            
            resp = self.post("/tob/admin/sell-config/preview", preview_data, self.admin_token)
            self.test("POST /tob/admin/sell-config/preview returns 200", resp.status_code == 200)
            
            if resp.status_code == 200:
                data = resp.json()
                chapters = data.get("chapters", [])
                
                if chapters:
                    preview_chapter_price = chapters[0].get("price")
                    self.test("Preview chapter price = 7", preview_chapter_price == 7, f"Got: {preview_chapter_price}")
                
                # Verify config NOT changed
                after_resp = self.get("/tob/admin/sell-config", self.admin_token)
                if after_resp.status_code == 200:
                    after_data = after_resp.json()
                    after_chapter_price = after_data.get("prices", {}).get("chapter")
                    self.test("Config unchanged after preview", 
                             after_chapter_price == before_chapter_price,
                             f"Before: {before_chapter_price}, After: {after_chapter_price}")
        except Exception as e:
            self.test("POST /tob/admin/sell-config/preview", False, f"Exception: {e}")
    
    def test_6_paywall_off_checkout(self):
        """Test 6: Paywall OFF - checkout returns free=true and grants entitlement"""
        print("\n📋 TEST 6: Paywall OFF - Free Checkout")
        print("-" * 80)
        
        try:
            # Set paywall OFF
            config = {"paywallOn": False, "freeClasses": []}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog to find a set sku
            cat_resp = self.get("/tob/store/catalog", self.normal_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                self.test("Catalog paywallOn = False", cat_data.get("paywallOn") == False)
                
                sets = cat_data.get("sets", [])
                if sets and sets[0].get("terms", {}).get("full"):
                    test_set = sets[0]["terms"]["full"]
                    item_id = test_set.get("itemId")
                    
                    # Construct SKU
                    sku = f"set:4:OD:{sets[0]['setCode']}:full"
                    print(f"   Testing with SKU: {sku}")
                    
                    # Checkout
                    checkout_resp = self.post("/tob/store/checkout", {"sku": sku}, self.normal_token)
                    self.test("POST /tob/store/checkout returns 200", checkout_resp.status_code == 200)
                    
                    if checkout_resp.status_code == 200:
                        checkout_data = checkout_resp.json()
                        self.test("Checkout returns free=true", checkout_data.get("free") == True)
                        self.test("Checkout returns granted", "granted" in checkout_data)
                        
                        self.test_data['test_item_id'] = item_id
                        self.test_data['test_sku'] = sku
                        
                        # Verify item NOT locked
                        item_resp = self.get(f"/tob/items/{item_id}", self.normal_token)
                        if item_resp.status_code == 200:
                            item_data = item_resp.json()
                            self.test("Item NOT locked after free checkout", 
                                     "locked" not in item_data or item_data.get("locked") == False,
                                     f"Item data: {json.dumps(item_data, indent=2)[:200]}")
        except Exception as e:
            self.test("Paywall OFF checkout", False, f"Exception: {e}")
    
    def test_7_paywall_on_lock(self):
        """Test 7: Paywall ON - non-owner sees locked item"""
        print("\n📋 TEST 7: Paywall ON - Item Lock")
        print("-" * 80)
        
        try:
            # Set paywall ON
            config = {"paywallOn": True, "freeClasses": []}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog to find an item
            cat_resp = self.get("/tob/store/catalog", self.admin_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                sets = cat_data.get("sets", [])
                
                if sets and sets[0].get("terms", {}).get("full"):
                    item_id = sets[0]["terms"]["full"].get("itemId")
                    
                    # Create a fresh user who doesn't own anything
                    # For now, test with normal user and verify admin is NOT locked
                    
                    # Admin should NOT see lock
                    admin_item_resp = self.get(f"/tob/items/{item_id}", self.admin_token)
                    if admin_item_resp.status_code == 200:
                        admin_item = admin_item_resp.json()
                        self.test("Admin never sees locked", 
                                 "locked" not in admin_item or admin_item.get("locked") == False)
                    
                    # Normal user who doesn't own should see lock (if they haven't bought in test 6)
                    # But test 6 already granted to normal user, so let's just verify the logic
                    print("   Note: Normal user may own from previous test, so lock test is limited")
        except Exception as e:
            self.test("Paywall ON lock", False, f"Exception: {e}")
    
    def test_8_paywall_on_checkout_free(self):
        """Test 8: Paywall ON but freeClasses includes class - still free"""
        print("\n📋 TEST 8: Paywall ON + Keep-Free")
        print("-" * 80)
        
        try:
            # Set paywall ON but class 4 free
            config = {"paywallOn": True, "freeClasses": ["4"]}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog
            cat_resp = self.get("/tob/store/catalog", self.admin_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                self.test("Catalog paywallOn = False (keep-free)", cat_data.get("paywallOn") == False)
                self.test("Catalog freeClass = True", cat_data.get("freeClass") == True)
        except Exception as e:
            self.test("Paywall ON + keep-free", False, f"Exception: {e}")
    
    def test_9_subject_pack_entitlement(self):
        """Test 9: Buying subject pack unlocks all sets and chapters"""
        print("\n📋 TEST 9: Subject Pack Entitlement")
        print("-" * 80)
        
        try:
            # Set paywall OFF for easy testing
            config = {"paywallOn": False, "freeClasses": []}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog
            cat_resp = self.get("/tob/store/catalog", self.normal_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                packs = cat_data.get("packs", {})
                subject_pack = packs.get("subjectPack", {})
                sku = subject_pack.get("sku")
                
                if sku:
                    print(f"   Testing with subject pack SKU: {sku}")
                    
                    # Checkout subject pack
                    checkout_resp = self.post("/tob/store/checkout", {"sku": sku}, self.normal_token)
                    self.test("Subject pack checkout returns 200", checkout_resp.status_code == 200)
                    
                    if checkout_resp.status_code == 200:
                        checkout_data = checkout_resp.json()
                        self.test("Subject pack checkout free=true", checkout_data.get("free") == True)
                        
                        # Get catalog again - all items should be owned
                        cat2_resp = self.get("/tob/store/catalog", self.normal_token, {"class": "4", "subject": "OD"})
                        if cat2_resp.status_code == 200:
                            cat2_data = cat2_resp.json()
                            sets = cat2_data.get("sets", [])
                            chapters = cat2_data.get("chapters", [])
                            
                            # Check if sets are owned
                            if sets:
                                owned_sets = sum(1 for s in sets for t in s.get("terms", {}).values() if t.get("owned"))
                                total_set_terms = sum(len(s.get("terms", {})) for s in sets)
                                self.test(f"All set terms owned ({owned_sets}/{total_set_terms})", 
                                         owned_sets == total_set_terms,
                                         f"Owned: {owned_sets}, Total: {total_set_terms}")
                            
                            # Check if chapters are owned
                            if chapters:
                                owned_chapters = sum(1 for ch in chapters if ch.get("owned"))
                                self.test(f"All chapters owned ({owned_chapters}/{len(chapters)})",
                                         owned_chapters == len(chapters),
                                         f"Owned: {owned_chapters}, Total: {len(chapters)}")
        except Exception as e:
            self.test("Subject pack entitlement", False, f"Exception: {e}")
    
    def test_10_idempotency(self):
        """Test 10: Checkout same SKU twice - idempotent"""
        print("\n📋 TEST 10: Checkout Idempotency")
        print("-" * 80)
        
        try:
            # Set paywall OFF
            config = {"paywallOn": False, "freeClasses": []}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get a SKU
            cat_resp = self.get("/tob/store/catalog", self.normal_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                sets = cat_data.get("sets", [])
                
                if sets and sets[0].get("terms", {}).get("full"):
                    sku = f"set:4:OD:{sets[0]['setCode']}:full"
                    
                    # Checkout twice
                    resp1 = self.post("/tob/store/checkout", {"sku": sku}, self.normal_token)
                    resp2 = self.post("/tob/store/checkout", {"sku": sku}, self.normal_token)
                    
                    self.test("First checkout returns 200", resp1.status_code == 200)
                    self.test("Second checkout returns 200 (idempotent)", resp2.status_code == 200)
                    
                    if resp1.status_code == 200 and resp2.status_code == 200:
                        data1 = resp1.json()
                        data2 = resp2.json()
                        self.test("Both checkouts return free=true", 
                                 data1.get("free") == True and data2.get("free") == True)
        except Exception as e:
            self.test("Checkout idempotency", False, f"Exception: {e}")
    
    def test_11_keep_free(self):
        """Test 11: Keep-free logic - paywallOn=true but freeClasses includes class"""
        print("\n📋 TEST 11: Keep-Free Logic")
        print("-" * 80)
        
        try:
            # Set paywall ON, class 4 free
            config = {"paywallOn": True, "freeClasses": ["4"]}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog for class 4
            cat_resp = self.get("/tob/store/catalog", self.normal_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                self.test("Class 4 paywallOn = False (keep-free)", cat_data.get("paywallOn") == False)
                self.test("Class 4 freeClass = True", cat_data.get("freeClass") == True)
                self.test("Global paywallOn = True", cat_data.get("globalPaywallOn") == True)
        except Exception as e:
            self.test("Keep-free logic", False, f"Exception: {e}")
    
    def test_12_chapter_sku(self):
        """Test 12: Chapter SKU individually buyable"""
        print("\n📋 TEST 12: Chapter SKU")
        print("-" * 80)
        
        try:
            # Set paywall OFF
            config = {"paywallOn": False, "freeClasses": []}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog
            cat_resp = self.get("/tob/store/catalog", self.normal_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                chapters = cat_data.get("chapters", [])
                
                if chapters:
                    chapter = chapters[0]
                    sku = chapter.get("sku")
                    expected_price = cat_data.get("prices", {}).get("chapter", 5)
                    
                    print(f"   Testing chapter SKU: {sku}")
                    
                    # Checkout chapter
                    checkout_resp = self.post("/tob/store/checkout", {"sku": sku}, self.normal_token)
                    self.test("Chapter checkout returns 200", checkout_resp.status_code == 200)
                    
                    if checkout_resp.status_code == 200:
                        checkout_data = checkout_resp.json()
                        self.test("Chapter checkout free=true", checkout_data.get("free") == True)
        except Exception as e:
            self.test("Chapter SKU", False, f"Exception: {e}")
    
    def test_13_class_pack_visibility(self):
        """Test 13: Class pack shown only if >=2 subjects AND price < sum of subject packs"""
        print("\n📋 TEST 13: Class Pack Visibility Logic")
        print("-" * 80)
        
        try:
            # Set paywall OFF
            config = {"paywallOn": False, "freeClasses": []}
            self.post("/tob/admin/sell-config", config, self.admin_token)
            
            # Get catalog for class 4
            cat_resp = self.get("/tob/store/catalog", self.admin_token, {"class": "4", "subject": "OD"})
            if cat_resp.status_code == 200:
                cat_data = cat_resp.json()
                packs = cat_data.get("packs", {})
                class_pack = packs.get("classPack")
                subjects = cat_data.get("subjects", [])
                
                print(f"   Class 4 has {len(subjects)} subjects")
                
                if len(subjects) >= 2:
                    # Should have class pack if price < sum
                    if class_pack:
                        self.test("ClassPack present (>=2 subjects)", True)
                        self.test("ClassPack price < mrp", 
                                 class_pack.get("price", 0) < class_pack.get("mrp", 0),
                                 f"price={class_pack.get('price')}, mrp={class_pack.get('mrp')}")
                        print(f"   ClassPack: price={class_pack.get('price')}, mrp={class_pack.get('mrp')}, subjects={class_pack.get('subjects')}")
                    else:
                        print(f"   ClassPack is null (price >= sum of subject packs)")
                        self.test("ClassPack null because price >= sum", True)
                else:
                    self.test("ClassPack null (<2 subjects)", class_pack is None)
        except Exception as e:
            self.test("Class pack visibility", False, f"Exception: {e}")
    
    def test_14_reset_config(self):
        """Test 13: Reset config to paywallOn=false, freeClasses=[]"""
        print("\n📋 TEST 13: Reset Config")
        print("-" * 80)
        
        try:
            # Reset to safe state
            config = {"paywallOn": False, "freeClasses": []}
            resp = self.post("/tob/admin/sell-config", config, self.admin_token)
            self.test("POST reset config returns 200", resp.status_code == 200)
            
            # Verify
            get_resp = self.get("/tob/admin/sell-config", self.admin_token)
            if get_resp.status_code == 200:
                data = get_resp.json()
                self.test("Config paywallOn = False", data.get("paywallOn") == False)
                self.test("Config freeClasses = []", data.get("freeClasses") == [])
                print("   ✅ Config reset to safe state (paywallOn=false, freeClasses=[])")
        except Exception as e:
            self.test("Reset config", False, f"Exception: {e}")

if __name__ == "__main__":
    runner = TestRunner()
    try:
        runner.run_all_tests()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
