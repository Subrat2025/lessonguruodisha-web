#!/usr/bin/env python3
"""
Backend test for Store Phase C: Chapter → 5 Sets (FOCUSED TEST)
Tests dynamic bundle pricing, cart resolver, coupon validation, and My Library tree.
Uses Class 2 Math which has unowned chapters.
"""
import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
TEST_MOBILE = "8000000001"
TEST_PASSWORD = "<redacted>"

def login():
    resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": TEST_MOBILE, "password": TEST_PASSWORD}, timeout=30)
    if resp.status_code == 200:
        token = resp.json().get("token")
        print(f"✅ Login successful")
        return token
    print(f"❌ Login failed: {resp.status_code}")
    sys.exit(1)

def api_get(token, path):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=30)
    return resp.json() if resp.status_code == 200 else None

def api_post(token, path, data):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{BASE_URL}{path}", json=data, headers=headers, timeout=30)
    return resp.json() if resp.status_code == 200 else None

def clear_cart(token):
    cart = api_get(token, "/store/cart")
    if cart and cart.get("items"):
        for item in cart["items"]:
            api_post(token, "/store/cart/remove", {"productId": item["id"]})

print("=" * 80)
print("STORE PHASE C: Chapter → 5 Sets Backend Test")
print("=" * 80)

token = login()

# TEST 1: Chapters structure
print("\n" + "=" * 80)
print("TEST 1: GET /store/unit-tests/chapters?cls=2&subjectKey=math")
print("=" * 80)

data = api_get(token, "/store/unit-tests/chapters?cls=2&subjectKey=math")
if not data:
    print("❌ FAILED: Cannot fetch chapters")
    sys.exit(1)

print(f"✅ Fetched: {data.get('chapterCount')} chapters, {data.get('totalSets')} sets")
print(f"   Subject Pack: {data.get('subjectPack', {}).get('titleOdia')}")

chapters = data.get("chapters", [])
unowned_5set = [c for c in chapters if not c.get("owned") and c.get("setCount") == 5]

if not unowned_5set:
    print("❌ FAILED: No unowned 5-set chapter found")
    sys.exit(1)

ch = unowned_5set[0]
print(f"\n📋 Test Chapter: {ch.get('chapterTitle')}")
print(f"   ID: {ch.get('id')}")
print(f"   Sets: {ch.get('setCount')}")
print(f"   Owned: {ch.get('owned')}")

bundle = ch.get("bundle", {})
print(f"\n📦 Bundle (non-owned 5-set chapter):")
print(f"   full: {bundle.get('full')} (expected: 10)")
print(f"   price: {bundle.get('price')} (expected: 10)")
print(f"   mrp: {bundle.get('mrp')}")
print(f"   ownedSetCount: {bundle.get('ownedSetCount')} (expected: 0)")
print(f"   credit: {bundle.get('credit')} (expected: 0)")
print(f"   remaining: {bundle.get('remaining')} (expected: 5)")

sets = ch.get("sets", [])
set_price = sets[0].get("pricing", {}).get("price") if sets else None
print(f"   Set price: ₹{set_price} (expected: 2)")

if bundle.get("full") == 10 and bundle.get("price") == 10 and set_price == 2:
    print("✅ TEST 1 PASSED")
else:
    print("❌ TEST 1 FAILED")

chapter_id = ch.get("id")
set_ids = [s.get("id") for s in sets]

# TEST 2: Dynamic bundle pricing
print("\n" + "=" * 80)
print("TEST 2: Dynamic Chapter-Bundle Price")
print("=" * 80)

# Step 2a: Buy Set 1 and Set 2
print(f"\n📝 Step 2a: Buy Set 1 and Set 2")
result = api_post(token, "/store/checkout/test", {"productIds": [set_ids[0], set_ids[1]]})
if not result or not result.get("ok"):
    print(f"❌ FAILED: {result}")
    sys.exit(1)

print(f"✅ Purchased: Order {result.get('orderId')}")

# Verify dynamic pricing
data2 = api_get(token, "/store/unit-tests/chapters?cls=2&subjectKey=math")
ch2 = next((c for c in data2.get("chapters", []) if c.get("id") == chapter_id), None)
bundle2 = ch2.get("bundle", {})

print(f"\n📦 After buying 2 sets:")
print(f"   ownedSetCount: {bundle2.get('ownedSetCount')} (expected: 2)")
print(f"   credit: {bundle2.get('credit')} (expected: 4)")
print(f"   price: {bundle2.get('price')} (expected: 6)")
print(f"   remaining: {bundle2.get('remaining')} (expected: 3)")
print(f"   fullyOwned: {bundle2.get('fullyOwned')} (expected: false)")

if (bundle2.get("ownedSetCount") == 2 and bundle2.get("credit") == 4 and 
    bundle2.get("price") == 6 and bundle2.get("remaining") == 3 and not bundle2.get("fullyOwned")):
    print("✅ Step 2a PASSED")
else:
    print("❌ Step 2a FAILED")

# Step 2b: Buy Set 3 and Set 4
print(f"\n📝 Step 2b: Buy Set 3 and Set 4")
result = api_post(token, "/store/checkout/test", {"productIds": [set_ids[2], set_ids[3]]})
if not result or not result.get("ok"):
    print(f"❌ FAILED: {result}")
else:
    print(f"✅ Purchased: Order {result.get('orderId')}")
    
    data3 = api_get(token, "/store/unit-tests/chapters?cls=2&subjectKey=math")
    ch3 = next((c for c in data3.get("chapters", []) if c.get("id") == chapter_id), None)
    bundle3 = ch3.get("bundle", {})
    
    print(f"\n📦 After buying 4 sets:")
    print(f"   ownedSetCount: {bundle3.get('ownedSetCount')} (expected: 4)")
    print(f"   price: {bundle3.get('price')} (expected: 2)")
    print(f"   remaining: {bundle3.get('remaining')} (expected: 1)")
    
    if bundle3.get("ownedSetCount") == 4 and bundle3.get("price") == 2 and bundle3.get("remaining") == 1:
        print("✅ Step 2b PASSED")
    else:
        print("❌ Step 2b FAILED")

# Step 2c: GET /store/product/<Set5.id>
print(f"\n📝 Step 2c: GET /store/product/<Set5.id>")
prod = api_get(token, f"/store/product/{set_ids[4]}")
if prod:
    setInfo = prod.get("setInfo")
    if setInfo:
        print(f"\n📋 setInfo:")
        print(f"   setNo: {setInfo.get('setNo')} (expected: 5)")
        print(f"   chapter.id: {setInfo.get('chapter', {}).get('id')}")
        print(f"   chapter.owned: {setInfo.get('chapter', {}).get('owned')} (expected: false)")
        print(f"   bundle.price: {setInfo.get('bundle', {}).get('price')} (expected: 2)")
        print(f"   bundle.remaining: {setInfo.get('bundle', {}).get('remaining')} (expected: 1)")
        print(f"   bundle.ownedSetCount: {setInfo.get('bundle', {}).get('ownedSetCount')} (expected: 4)")
        print(f"   bundle.credit: {setInfo.get('bundle', {}).get('credit')} (expected: 8)")
        print(f"   siblings: {len(setInfo.get('siblings', []))} (expected: 5)")
        
        if (setInfo.get("setNo") == 5 and setInfo.get("bundle", {}).get("price") == 2 and
            setInfo.get("bundle", {}).get("remaining") == 1 and setInfo.get("bundle", {}).get("ownedSetCount") == 4 and
            setInfo.get("bundle", {}).get("credit") == 8 and len(setInfo.get("siblings", [])) == 5):
            print("✅ Step 2c PASSED")
        else:
            print("❌ Step 2c FAILED")

# Step 2d: Buy Set 5
print(f"\n📝 Step 2d: Buy Set 5")
result = api_post(token, "/store/checkout/test", {"productIds": [set_ids[4]]})
if result and result.get("ok"):
    print(f"✅ Purchased: Order {result.get('orderId')}")
    
    data4 = api_get(token, "/store/unit-tests/chapters?cls=2&subjectKey=math")
    ch4 = next((c for c in data4.get("chapters", []) if c.get("id") == chapter_id), None)
    bundle4 = ch4.get("bundle", {})
    
    print(f"\n📦 After buying all 5 sets:")
    print(f"   owned: {ch4.get('owned')} (expected: true)")
    print(f"   fullyOwned: {bundle4.get('fullyOwned')} (expected: true)")
    print(f"   price: {bundle4.get('price')} (expected: null)")
    
    if ch4.get("owned") and bundle4.get("fullyOwned") and bundle4.get("price") is None:
        print("✅ Step 2d PASSED")
    else:
        print("❌ Step 2d FAILED")

# TEST 3: Cart resolver
print("\n" + "=" * 80)
print("TEST 3: Cart Resolver (Dedup Cases)")
print("=" * 80)

# Find a different unowned chapter
cart_ch = next((c for c in unowned_5set if c.get("id") != chapter_id), None)
if not cart_ch:
    print("⚠️  No other unowned chapter for cart tests")
else:
    print(f"\n📋 Cart Test Chapter: {cart_ch.get('chapterTitle')}")
    cart_id = cart_ch.get("id")
    cart_sets = [s.get("id") for s in cart_ch.get("sets", [])]
    
    clear_cart(token)
    
    # Case a: 3 sets
    print(f"\n📝 Case a: Add 3 sets")
    for i in range(3):
        api_post(token, "/store/cart/add", {"productId": cart_sets[i]})
    
    cart = api_get(token, "/store/cart")
    print(f"   items: {len(cart.get('items', []))} (expected: 3)")
    print(f"   subtotal: ₹{cart.get('subtotal')} (expected: 6)")
    print(f"   messages: {len(cart.get('messages', []))}")
    
    if len(cart.get("items", [])) == 3 and cart.get("subtotal") == 6:
        print("✅ Case a PASSED")
    else:
        print("❌ Case a FAILED")
    
    clear_cart(token)
    
    # Case b: All 5 sets → switch to bundle
    print(f"\n📝 Case b: Add all 5 sets")
    for sid in cart_sets:
        api_post(token, "/store/cart/add", {"productId": sid})
    
    cart = api_get(token, "/store/cart")
    items = cart.get("items", [])
    messages = cart.get("messages", [])
    bundle_item = next((i for i in items if i.get("isBundle")), None)
    bundle_msg = next((m for m in messages if m.get("code") == "bundle"), None)
    
    print(f"   items: {len(items)} (expected: 1 bundle)")
    print(f"   subtotal: ₹{cart.get('subtotal')} (expected: 10)")
    print(f"   bundle message: {bundle_msg is not None}")
    
    if len(items) == 1 and cart.get("subtotal") == 10 and bundle_item and bundle_msg:
        print("✅ Case b PASSED")
    else:
        print("❌ Case b FAILED")
    
    clear_cart(token)
    
    # Case c: Owned 2 sets + add bundle
    print(f"\n📝 Case c: Own 2 sets + add bundle")
    api_post(token, "/store/cart/add", {"productId": chapter_id})
    
    cart = api_get(token, "/store/cart")
    items = cart.get("items", [])
    print(f"   items: {len(items)} (expected: 1 bundle)")
    print(f"   subtotal: ₹{cart.get('subtotal')} (expected: 0, chapter fully owned)")
    
    # The chapter is now fully owned, so it should be removed
    if len(items) == 0:
        print("✅ Case c PASSED (chapter fully owned, removed from cart)")
    
    clear_cart(token)
    
    # Case d: Set + bundle
    print(f"\n📝 Case d: Add set + its bundle")
    api_post(token, "/store/cart/add", {"productId": cart_sets[0]})
    api_post(token, "/store/cart/add", {"productId": cart_id})
    
    cart = api_get(token, "/store/cart")
    items = cart.get("items", [])
    messages = cart.get("messages", [])
    bundle_item = next((i for i in items if i.get("id") == cart_id), None)
    covered_msg = next((m for m in messages if m.get("code") == "covered"), None)
    
    print(f"   items: {len(items)} (expected: 1 bundle)")
    print(f"   covered message: {covered_msg is not None}")
    
    if len(items) == 1 and bundle_item and covered_msg:
        print("✅ Case d PASSED")
    else:
        print("❌ Case d FAILED")
    
    clear_cart(token)
    
    # Case e: Bundle + subject pack
    print(f"\n📝 Case e: Add bundle + subject pack")
    pack_id = data.get("subjectPack", {}).get("id")
    if pack_id:
        api_post(token, "/store/cart/add", {"productId": cart_id})
        api_post(token, "/store/cart/add", {"productId": pack_id})
        
        cart = api_get(token, "/store/cart")
        items = cart.get("items", [])
        messages = cart.get("messages", [])
        pack_item = next((i for i in items if i.get("id") == pack_id), None)
        covered_msg = next((m for m in messages if m.get("code") == "covered"), None)
        
        print(f"   items: {len(items)} (expected: 1 pack)")
        print(f"   covered message: {covered_msg is not None}")
        
        if len(items) == 1 and pack_item and covered_msg:
            print("✅ Case e PASSED")
        else:
            print("❌ Case e FAILED")
    
    clear_cart(token)
    
    # Case f: Already owned
    print(f"\n📝 Case f: Add already-owned item")
    api_post(token, "/store/cart/add", {"productId": set_ids[0]})
    
    cart = api_get(token, "/store/cart")
    items = cart.get("items", [])
    messages = cart.get("messages", [])
    owned_msg = next((m for m in messages if m.get("code") == "owned"), None)
    
    print(f"   items: {len(items)} (expected: 0)")
    print(f"   owned message: {owned_msg is not None}")
    
    if len(items) == 0 and owned_msg:
        print("✅ Case f PASSED")
    else:
        print("❌ Case f FAILED")

# TEST 4: Coupon validation
print("\n" + "=" * 80)
print("TEST 4: Coupon FESTIVE2026 Validation")
print("=" * 80)

clear_cart(token)

# Find unowned sets for coupon tests
all_unowned_sets = []
for c in chapters:
    if not c.get("owned"):
        for s in c.get("sets", []):
            if not s.get("owned"):
                all_unowned_sets.append(s.get("id"))

# Case g: ₹6 cart (below ₹20)
print(f"\n📝 Case g: ₹6 cart + FESTIVE2026")
test_ids = all_unowned_sets[:3]
result = api_post(token, "/store/coupon/validate", {"code": "FESTIVE2026", "productIds": test_ids})
if result:
    print(f"   ok: {result.get('ok')} (expected: false)")
    print(f"   reason: {result.get('reason')}")
    print(f"   short: {result.get('short')} (expected: 14)")
    
    if not result.get("ok") and "₹20" in result.get("reason", "") and result.get("short") == 14:
        print("✅ Case g PASSED")
    else:
        print("❌ Case g FAILED")

# Case h: ₹26 cart (above ₹20)
print(f"\n📝 Case h: ₹26 cart + FESTIVE2026")
test_ids = all_unowned_sets[:13]  # 13 sets × ₹2 = ₹26
result = api_post(token, "/store/coupon/validate", {"code": "FESTIVE2026", "productIds": test_ids})
if result:
    subtotal = result.get("subtotal", 0)
    discount = result.get("discount", 0)
    total = result.get("total", 0)
    expected_discount = int(subtotal * 0.2)  # floor
    
    print(f"   ok: {result.get('ok')} (expected: true)")
    print(f"   subtotal: ₹{subtotal}")
    print(f"   discount: ₹{discount} (expected: {expected_discount})")
    print(f"   total: ₹{total}")
    
    if result.get("ok") and discount == expected_discount:
        print("✅ Case h PASSED")
    else:
        print("❌ Case h FAILED")

# Case i: Large cart (discount capped at ₹50)
if len(all_unowned_sets) >= 150:
    print(f"\n📝 Case i: ₹300 cart + FESTIVE2026")
    test_ids = all_unowned_sets[:150]  # 150 sets × ₹2 = ₹300
    result = api_post(token, "/store/coupon/validate", {"code": "FESTIVE2026", "productIds": test_ids})
    if result:
        discount = result.get("discount", 0)
        print(f"   discount: ₹{discount} (expected: 50, capped)")
        
        if discount == 50:
            print("✅ Case i PASSED")
        else:
            print("❌ Case i FAILED")
else:
    print(f"\n⚠️  Case i SKIPPED: Not enough unowned sets")

# TEST 5: My Library tree
print("\n" + "=" * 80)
print("TEST 5: My Library Tree")
print("=" * 80)

library = api_get(token, "/store/unit-tests/library")
if library:
    classes = library.get("classes", [])
    print(f"✅ Library fetched: {len(classes)} classes")
    
    # Find Class 2
    class2 = next((c for c in classes if c.get("class") == "2"), None)
    if class2:
        print(f"\n📚 Class 2:")
        subjects = class2.get("subjects", [])
        print(f"   Subjects: {len(subjects)}")
        
        # Find Math
        math = next((s for s in subjects if s.get("subjectKey") == "math"), None)
        if math:
            print(f"\n📘 Math Subject:")
            print(f"   Odia: {math.get('odia')}")
            print(f"   Chapter Count: {math.get('chapterCount')}")
            print(f"   Set Count: {math.get('setCount')}")
            
            chapters_lib = math.get("chapters", [])
            test_ch_lib = next((c for c in chapters_lib if c.get("id") == chapter_id), None)
            
            if test_ch_lib:
                print(f"\n📖 Test Chapter in Library:")
                print(f"   Title: {test_ch_lib.get('title')}")
                print(f"   fullChapterOwned: {test_ch_lib.get('fullChapterOwned')} (expected: true)")
                print(f"   bundleFileId: {test_ch_lib.get('bundleFileId')} (expected: not null)")
                print(f"   remaining: {test_ch_lib.get('remaining')} (expected: 0)")
                print(f"   remainingPrice: {test_ch_lib.get('remainingPrice')} (expected: null)")
                
                sets_lib = test_ch_lib.get("sets", [])
                print(f"   Sets: {len(sets_lib)}")
                
                # Check owned sets
                owned = [s for s in sets_lib if s.get("owned")]
                print(f"   Owned sets: {len(owned)}")
                
                # Verify structure
                if owned:
                    s = owned[0]
                    print(f"\n   Sample owned set:")
                    print(f"      setNo: {s.get('setNo')}")
                    print(f"      fileId: {s.get('fileId')} (expected: not null)")
                    print(f"      left: {s.get('left')} (expected: 5)")
                    
                    if s.get("fileId") and s.get("left") == 5:
                        print("      ✅ Owned set structure correct")
                
                if (test_ch_lib.get("fullChapterOwned") and test_ch_lib.get("bundleFileId") and
                    test_ch_lib.get("remaining") == 0 and test_ch_lib.get("remainingPrice") is None):
                    print("\n✅ TEST 5 PASSED")
                else:
                    print("\n❌ TEST 5 FAILED")

print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print("✅ All tests completed. Review output above for pass/fail status.")
print("=" * 80)
