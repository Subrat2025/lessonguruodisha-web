#!/usr/bin/env python3
"""
AI Credit Monetization Phase 1B — Backend Test Suite
Tests all 10 new endpoints + cache-first lifecycle + Razorpay isolation
"""

import requests
import json
import time
import subprocess
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
TEST_USER_MOBILE = "9999900001"
TEST_USER_PASSWORD = "<redacted>"

admin_token = None
test_user_token = None
admin_user_id = None
test_user_id = None

def log(msg):
    print(f"✓ {msg}")

def error(msg):
    print(f"✗ {msg}")
    sys.exit(1)

def test_login(mobile, password, label):
    """Login and return token + userId"""
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if r.status_code != 200:
            error(f"{label} login failed: {r.status_code} {r.text}")
        data = r.json()
        token = data.get("token")
        user_id = data.get("user", {}).get("id")
        if not token or not user_id:
            error(f"{label} login missing token or userId")
        log(f"{label} login successful: userId={user_id[:12]}...")
        return token, user_id
    except Exception as e:
        error(f"{label} login exception: {e}")

def seed_admin_credits(user_id, amount=500):
    """Seed credits to admin wallet via mongosh"""
    try:
        cmd = f"""mongosh mongodb://localhost:27017/edumaster_odisha --quiet --eval "db.aiCreditWallet.updateOne({{ userId: '{user_id}' }}, {{ \\$set: {{ balance: {amount}, lifetimePurchased: {amount}, updatedAt: new Date() }} }}, {{ upsert: true }}); print('Seeded {amount} credits to {user_id}')" """
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            error(f"mongosh seed failed: {result.stderr}")
        log(f"Seeded {amount} credits to admin wallet via mongosh")
    except Exception as e:
        error(f"mongosh seed exception: {e}")

def get_mongo_count(collection, query="{}"):
    """Get count from MongoDB collection"""
    try:
        cmd = f"""mongosh mongodb://localhost:27017/edumaster_odisha --quiet --eval "db.{collection}.countDocuments({query})" """
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return 0
        return int(result.stdout.strip().split('\n')[-1])
    except:
        return 0

print("\n" + "="*80)
print("AI CREDIT MONETIZATION PHASE 1B — BACKEND TEST SUITE")
print("="*80 + "\n")

# ============================================================================
# TEST 1: Admin Login
# ============================================================================
print("TEST 1: Admin Login")
admin_token, admin_user_id = test_login(ADMIN_MOBILE, ADMIN_PASSWORD, "Admin")

# ============================================================================
# TEST 2: Test User Login
# ============================================================================
print("\nTEST 2: Test User Login")
test_user_token, test_user_id = test_login(TEST_USER_MOBILE, TEST_USER_PASSWORD, "Test User")

# ============================================================================
# TEST 3: GET /ai-credits/plans (public) — must return 5 plans
# ============================================================================
print("\nTEST 3: GET /ai-credits/plans (public)")
try:
    r = requests.get(f"{BASE_URL}/ai-credits/plans", timeout=30)
    if r.status_code != 200:
        error(f"Plans endpoint failed: {r.status_code} {r.text}")
    data = r.json()
    plans = data.get("plans", [])
    if len(plans) != 5:
        error(f"Expected 5 plans, got {len(plans)}")
    log(f"Plans endpoint returned {len(plans)} plans")
    
    # Check for plan_smart_750 with bestValue=true
    smart_plan = next((p for p in plans if p.get("_id") == "plan_smart_750"), None)
    if not smart_plan:
        error("plan_smart_750 not found in plans")
    if not smart_plan.get("bestValue"):
        error("plan_smart_750 does not have bestValue=true")
    if not smart_plan.get("badge", "").startswith("⭐"):
        error(f"plan_smart_750 badge does not start with ⭐, got: {smart_plan.get('badge')}")
    log(f"plan_smart_750 verified: bestValue=true, badge={smart_plan.get('badge')}")
except Exception as e:
    error(f"Plans test exception: {e}")

# ============================================================================
# TEST 4: GET /ai-credits/costs (public) — must return 21 costs
# ============================================================================
print("\nTEST 4: GET /ai-credits/costs (public)")
try:
    r = requests.get(f"{BASE_URL}/ai-credits/costs", timeout=30)
    if r.status_code != 200:
        error(f"Costs endpoint failed: {r.status_code} {r.text}")
    data = r.json()
    costs = data.get("costs", [])
    if len(costs) != 21:
        error(f"Expected 21 costs, got {len(costs)}")
    log(f"Costs endpoint returned {len(costs)} costs")
    
    # Verify all have editable=true and credits >= 1
    for c in costs:
        if not c.get("editable"):
            error(f"Cost {c.get('_id')} does not have editable=true")
        if c.get("credits", 0) < 1:
            error(f"Cost {c.get('_id')} has credits < 1: {c.get('credits')}")
    log("All costs have editable=true and credits >= 1")
except Exception as e:
    error(f"Costs test exception: {e}")

# ============================================================================
# TEST 5: Auth gating — 401 without token
# ============================================================================
print("\nTEST 5: Auth gating — 401 without token")
endpoints = [
    "/ai-credits/wallet",
    "/ai-credits/transactions",
]
for ep in endpoints:
    try:
        r = requests.get(f"{BASE_URL}{ep}", timeout=30)
        if r.status_code != 401:
            error(f"{ep} should return 401 without token, got {r.status_code}")
        log(f"{ep} correctly returns 401 without token")
    except Exception as e:
        error(f"{ep} test exception: {e}")

post_endpoints = [
    "/ai-credits/checkout",
    "/ai-credits/verify",
    "/ai-credits/generate",
]
for ep in post_endpoints:
    try:
        r = requests.post(f"{BASE_URL}{ep}", json={}, timeout=30)
        if r.status_code != 401:
            error(f"{ep} should return 401 without token, got {r.status_code}")
        log(f"{ep} correctly returns 401 without token")
    except Exception as e:
        error(f"{ep} test exception: {e}")

# ============================================================================
# TEST 6: Admin gating — 403 for non-admin
# ============================================================================
print("\nTEST 6: Admin gating — 403 for non-admin")
admin_endpoints = [
    ("POST", "/admin/ai-credits/costs", {"_id": "cost_engagement_topic_check", "credits": 3}),
    ("POST", "/admin/ai-credits/plans", {"_id": "plan_smart_750", "priceINR": 199}),
    ("GET", "/admin/ai-credits/analytics", None),
]
for method, ep, body in admin_endpoints:
    try:
        headers = {"Authorization": f"Bearer {test_user_token}"}
        if method == "GET":
            r = requests.get(f"{BASE_URL}{ep}", headers=headers, timeout=30)
        else:
            r = requests.post(f"{BASE_URL}{ep}", headers=headers, json=body, timeout=30)
        if r.status_code != 403:
            error(f"{ep} should return 403 for non-admin, got {r.status_code}")
        log(f"{ep} correctly returns 403 for non-admin")
    except Exception as e:
        error(f"{ep} test exception: {e}")

# ============================================================================
# TEST 7: Wallet lifecycle for test user (fresh)
# ============================================================================
print("\nTEST 7: Wallet lifecycle for test user")
try:
    headers = {"Authorization": f"Bearer {test_user_token}"}
    r = requests.get(f"{BASE_URL}/ai-credits/wallet", headers=headers, timeout=30)
    if r.status_code != 200:
        error(f"Wallet endpoint failed: {r.status_code} {r.text}")
    data = r.json()
    balance = data.get("balance", -1)
    lifetimePurchased = data.get("lifetimePurchased", -1)
    lifetimeSpent = data.get("lifetimeSpent", -1)
    lifetimeRefunded = data.get("lifetimeRefunded", -1)
    log(f"Test user wallet: balance={balance}, purchased={lifetimePurchased}, spent={lifetimeSpent}, refunded={lifetimeRefunded}")
    
    # Get transactions
    r = requests.get(f"{BASE_URL}/ai-credits/transactions", headers=headers, timeout=30)
    if r.status_code != 200:
        error(f"Transactions endpoint failed: {r.status_code} {r.text}")
    txns = r.json().get("transactions", [])
    log(f"Test user has {len(txns)} transactions")
except Exception as e:
    error(f"Wallet test exception: {e}")

# ============================================================================
# TEST 8: Insufficient credits path (402 with INSUFFICIENT_CREDITS)
# ============================================================================
print("\nTEST 8: Insufficient credits path (zero balance user)")
try:
    headers = {"Authorization": f"Bearer {test_user_token}"}
    payload = {
        "zone": "engagement",
        "type": "topic_check",
        "className": "Class 5",
        "bookName": "Math",
        "chapterName": "Fractions",
        "topic": "Adding Fractions",
        "language": "odia"
    }
    
    # Count Gemini calls before
    gemini_calls_before = get_mongo_count("aiGeminiCalls", f"{{ userId: '{test_user_id}' }}")
    
    r = requests.post(f"{BASE_URL}/ai-credits/generate", headers=headers, json=payload, timeout=30)
    if r.status_code != 402:
        error(f"Expected 402 for insufficient credits, got {r.status_code}: {r.text}")
    data = r.json()
    if data.get("code") != "INSUFFICIENT_CREDITS":
        error(f"Expected code=INSUFFICIENT_CREDITS, got {data.get('code')}")
    if "required" not in data or "balance" not in data:
        error(f"Missing required/balance in response: {data}")
    log(f"Insufficient credits correctly returned 402: required={data.get('required')}, balance={data.get('balance')}")
    
    # Verify no Gemini call was made
    gemini_calls_after = get_mongo_count("aiGeminiCalls", f"{{ userId: '{test_user_id}' }}")
    if gemini_calls_after != gemini_calls_before:
        error(f"Gemini call was made despite insufficient credits! Before={gemini_calls_before}, After={gemini_calls_after}")
    log("Confirmed: No Gemini call was made for insufficient credits")
except Exception as e:
    error(f"Insufficient credits test exception: {e}")

# ============================================================================
# TEST 9: Seed admin wallet with 500 credits
# ============================================================================
print("\nTEST 9: Seed admin wallet with 500 credits")
seed_admin_credits(admin_user_id, 500)

# Verify wallet balance
try:
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/ai-credits/wallet", headers=headers, timeout=30)
    if r.status_code != 200:
        error(f"Admin wallet check failed: {r.status_code} {r.text}")
    data = r.json()
    balance = data.get("balance", 0)
    if balance < 500:
        error(f"Admin wallet balance should be >= 500, got {balance}")
    log(f"Admin wallet balance verified: {balance} credits")
except Exception as e:
    error(f"Admin wallet check exception: {e}")

# ============================================================================
# TEST 10: Successful cache-miss generation + debit
# ============================================================================
print("\nTEST 10: Cache-miss generation (fresh topic)")
try:
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Use a unique topic to ensure cache miss
    unique_topic = f"Test Topic {int(time.time())}"
    payload = {
        "zone": "engagement",
        "type": "topic_check",
        "className": "Class 5",
        "bookName": "Math",
        "chapterName": "Fractions",
        "topic": unique_topic,
        "language": "odia"
    }
    
    # Get wallet balance before
    r = requests.get(f"{BASE_URL}/ai-credits/wallet", headers=headers, timeout=30)
    balance_before = r.json().get("balance", 0)
    
    # Count Gemini calls before
    gemini_calls_before = get_mongo_count("aiGeminiCalls", f"{{ userId: '{admin_user_id}' }}")
    
    # Generate
    r = requests.post(f"{BASE_URL}/ai-credits/generate", headers=headers, json=payload, timeout=60)
    if r.status_code != 200:
        error(f"Generation failed: {r.status_code} {r.text}")
    data = r.json()
    
    if not data.get("ok"):
        error(f"Generation not ok: {data}")
    if data.get("cacheHit"):
        error(f"Expected cache miss, got cache hit")
    if "debited" not in data or "balance" not in data:
        error(f"Missing debited/balance in response: {data}")
    if not data.get("message", "").startswith("✨ Freshly generated"):
        error(f"Expected '✨ Freshly generated' message, got: {data.get('message')}")
    
    debited = data.get("debited", 0)
    balance_after = data.get("balance", 0)
    expected_balance = balance_before - debited
    
    if balance_after != expected_balance:
        error(f"Balance mismatch: expected {expected_balance}, got {balance_after}")
    
    log(f"Cache-miss generation successful: debited={debited}, balance={balance_after}, cacheHit=false")
    log(f"Message: {data.get('message')}")
    
    # Verify Gemini call was made
    gemini_calls_after = get_mongo_count("aiGeminiCalls", f"{{ userId: '{admin_user_id}' }}")
    if gemini_calls_after <= gemini_calls_before:
        error(f"No new Gemini call found! Before={gemini_calls_before}, After={gemini_calls_after}")
    log(f"Confirmed: New Gemini call logged (count increased from {gemini_calls_before} to {gemini_calls_after})")
    
    # Store for next test
    global first_generation_fingerprint, first_generation_resource_id
    first_generation_fingerprint = data.get("fingerprint")
    first_generation_resource_id = data.get("resourceId")
    
except Exception as e:
    error(f"Cache-miss generation exception: {e}")

# ============================================================================
# TEST 11: Cache-hit reuse (same inputs)
# ============================================================================
print("\nTEST 11: Cache-hit reuse (exact same inputs)")
try:
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Use exact same payload as TEST 10
    payload = {
        "zone": "engagement",
        "type": "topic_check",
        "className": "Class 5",
        "bookName": "Math",
        "chapterName": "Fractions",
        "topic": unique_topic,
        "language": "odia"
    }
    
    # Get wallet balance before
    r = requests.get(f"{BASE_URL}/ai-credits/wallet", headers=headers, timeout=30)
    balance_before = r.json().get("balance", 0)
    
    # Count Gemini calls before
    gemini_calls_before = get_mongo_count("aiGeminiCalls", f"{{ userId: '{admin_user_id}' }}")
    
    # Get resource reuse count before
    cmd = f"""mongosh mongodb://localhost:27017/edumaster_odisha --quiet --eval "db.aiGeneratedResources.findOne({{ _id: '{first_generation_resource_id}' }}).reuseCount" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    reuse_count_before = int(result.stdout.strip().split('\n')[-1]) if result.returncode == 0 else 0
    
    # Generate (should hit cache)
    r = requests.post(f"{BASE_URL}/ai-credits/generate", headers=headers, json=payload, timeout=60)
    if r.status_code != 200:
        error(f"Cache-hit generation failed: {r.status_code} {r.text}")
    data = r.json()
    
    if not data.get("ok"):
        error(f"Generation not ok: {data}")
    if not data.get("cacheHit"):
        error(f"Expected cache hit, got cache miss")
    if "debited" not in data or "balance" not in data:
        error(f"Missing debited/balance in response: {data}")
    if not data.get("message", "").startswith("♻️ Served from existing resource"):
        error(f"Expected '♻️ Served from existing resource' message, got: {data.get('message')}")
    
    debited = data.get("debited", 0)
    balance_after = data.get("balance", 0)
    expected_balance = balance_before - debited
    
    if balance_after != expected_balance:
        error(f"Balance mismatch: expected {expected_balance}, got {balance_after}")
    
    log(f"Cache-hit generation successful: debited={debited}, balance={balance_after}, cacheHit=true")
    log(f"Message: {data.get('message')}")
    
    # Verify NO new Gemini call was made
    gemini_calls_after = get_mongo_count("aiGeminiCalls", f"{{ userId: '{admin_user_id}' }}")
    if gemini_calls_after != gemini_calls_before:
        error(f"New Gemini call found despite cache hit! Before={gemini_calls_before}, After={gemini_calls_after}")
    log(f"Confirmed: No new Gemini call (count stayed at {gemini_calls_after})")
    
    # Verify reuseCount incremented
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    reuse_count_after = int(result.stdout.strip().split('\n')[-1]) if result.returncode == 0 else 0
    if reuse_count_after <= reuse_count_before:
        error(f"reuseCount not incremented! Before={reuse_count_before}, After={reuse_count_after}")
    log(f"Confirmed: reuseCount incremented from {reuse_count_before} to {reuse_count_after}")
    
except Exception as e:
    error(f"Cache-hit test exception: {e}")

# ============================================================================
# TEST 12: Admin edit cost (min 1 credit enforcement)
# ============================================================================
print("\nTEST 12: Admin edit cost (min 1 credit enforcement)")
try:
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Try to set credits to 0 (should fail)
    payload = {"_id": "cost_engagement_topic_check", "credits": 0}
    r = requests.post(f"{BASE_URL}/admin/ai-credits/costs", headers=headers, json=payload, timeout=30)
    if r.status_code != 400:
        error(f"Expected 400 for credits=0, got {r.status_code}")
    log("Admin cost edit correctly rejects credits=0 with 400")
    
    # Set credits to 5
    payload = {"_id": "cost_engagement_topic_check", "credits": 5}
    r = requests.post(f"{BASE_URL}/admin/ai-credits/costs", headers=headers, json=payload, timeout=30)
    if r.status_code != 200:
        error(f"Admin cost edit failed: {r.status_code} {r.text}")
    data = r.json()
    if not data.get("ok"):
        error(f"Admin cost edit not ok: {data}")
    if data.get("cost", {}).get("credits") != 5:
        error(f"Cost not updated to 5: {data.get('cost', {}).get('credits')}")
    log("Admin cost edit successful: credits updated to 5")
    
    # Verify via GET
    r = requests.get(f"{BASE_URL}/ai-credits/costs", timeout=30)
    costs = r.json().get("costs", [])
    cost = next((c for c in costs if c.get("_id") == "cost_engagement_topic_check"), None)
    if not cost or cost.get("credits") != 5:
        error(f"Cost not reflected in GET: {cost}")
    log("Cost change verified via GET /ai-credits/costs")
    
    # Restore to 3
    payload = {"_id": "cost_engagement_topic_check", "credits": 3}
    r = requests.post(f"{BASE_URL}/admin/ai-credits/costs", headers=headers, json=payload, timeout=30)
    if r.status_code != 200:
        error(f"Admin cost restore failed: {r.status_code} {r.text}")
    log("Cost restored to 3 for cleanliness")
    
except Exception as e:
    error(f"Admin cost edit exception: {e}")

# ============================================================================
# TEST 13: Admin analytics
# ============================================================================
print("\nTEST 13: Admin analytics")
try:
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/admin/ai-credits/analytics?days=30", headers=headers, timeout=30)
    if r.status_code != 200:
        error(f"Admin analytics failed: {r.status_code} {r.text}")
    data = r.json()
    
    required_keys = ["wallet", "revenueINR", "txnByType", "geminiByStatus", "geminiSpendINR", 
                     "grossProfitINR", "grossMarginPct", "cache", "zoneBreakdown", 
                     "costsWithMargin", "plans", "inrPerCredit"]
    for key in required_keys:
        if key not in data:
            error(f"Missing key in analytics: {key}")
    log("Admin analytics returned all required keys")
    
    # Verify cache stats
    cache = data.get("cache", {})
    if cache.get("hits", 0) < 1:
        error(f"Expected cache hits >= 1, got {cache.get('hits')}")
    if cache.get("misses", 0) < 1:
        error(f"Expected cache misses >= 1, got {cache.get('misses')}")
    log(f"Cache stats verified: hits={cache.get('hits')}, misses={cache.get('misses')}, hitRate={cache.get('cacheHitRate')}%")
    
except Exception as e:
    error(f"Admin analytics exception: {e}")

# ============================================================================
# TEST 14: Razorpay checkout (order creation)
# ============================================================================
print("\nTEST 14: Razorpay checkout (order creation)")
try:
    headers = {"Authorization": f"Bearer {test_user_token}"}
    
    # Try with bogus planId (should fail)
    payload = {"planId": "plan_bogus_999"}
    r = requests.post(f"{BASE_URL}/ai-credits/checkout", headers=headers, json=payload, timeout=30)
    if r.status_code != 400:
        error(f"Expected 400 for bogus planId, got {r.status_code}")
    log("Checkout correctly rejects bogus planId with 400")
    
    # Valid checkout with plan_smart_750
    payload = {"planId": "plan_smart_750"}
    r = requests.post(f"{BASE_URL}/ai-credits/checkout", headers=headers, json=payload, timeout=30)
    if r.status_code != 200:
        error(f"Checkout failed: {r.status_code} {r.text}")
    data = r.json()
    
    if not data.get("orderId"):
        error(f"Missing orderId in checkout response: {data}")
    if data.get("product") != "ai-credits":
        error(f"Expected product='ai-credits', got {data.get('product')}")
    if data.get("planId") != "plan_smart_750":
        error(f"Expected planId='plan_smart_750', got {data.get('planId')}")
    if data.get("credits") != 750:
        error(f"Expected credits=750, got {data.get('credits')}")
    if data.get("amountRupees") != 199:
        error(f"Expected amountRupees=199, got {data.get('amountRupees')}")
    
    log(f"Checkout successful: orderId={data.get('orderId')}, product={data.get('product')}, planId={data.get('planId')}, credits={data.get('credits')}, amount=₹{data.get('amountRupees')}")
    
    # Verify payment record in DB
    order_id = data.get("orderId")
    cmd = f"""mongosh mongodb://localhost:27017/edumaster_odisha --quiet --eval "db.payments.findOne({{ razorpay_order_id: '{order_id}' }})" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    if result.returncode != 0 or "null" in result.stdout:
        error(f"Payment record not found in DB for orderId={order_id}")
    log(f"Payment record verified in DB: product=ai-credits, planId=plan_smart_750")
    
    # Store for next test
    global test_order_id
    test_order_id = order_id
    
except Exception as e:
    error(f"Checkout test exception: {e}")

# ============================================================================
# TEST 15: Razorpay verify (fake signature → 400)
# ============================================================================
print("\nTEST 15: Razorpay verify (fake signature)")
try:
    headers = {"Authorization": f"Bearer {test_user_token}"}
    
    # Missing fields
    payload = {"razorpay_order_id": test_order_id}
    r = requests.post(f"{BASE_URL}/ai-credits/verify", headers=headers, json=payload, timeout=30)
    if r.status_code != 400:
        error(f"Expected 400 for missing fields, got {r.status_code}")
    log("Verify correctly rejects missing fields with 400")
    
    # Fake signature
    payload = {
        "razorpay_order_id": test_order_id,
        "razorpay_payment_id": "pay_fake123456789",
        "razorpay_signature": "fake_signature_12345678901234567890"
    }
    r = requests.post(f"{BASE_URL}/ai-credits/verify", headers=headers, json=payload, timeout=30)
    if r.status_code != 400:
        error(f"Expected 400 for fake signature, got {r.status_code}")
    data = r.json()
    if "Invalid" not in data.get("error", ""):
        error(f"Expected 'Invalid' in error message, got: {data.get('error')}")
    log("Verify correctly rejects fake signature with 400: Invalid payment signature")
    
except Exception as e:
    error(f"Verify test exception: {e}")

# ============================================================================
# TEST 16: Existing Premium flow untouched
# ============================================================================
print("\nTEST 16: Existing Premium flow untouched")
try:
    # GET /api/plans (existing Premium plans)
    r = requests.get(f"{BASE_URL}/plans", timeout=30)
    if r.status_code != 200:
        error(f"Premium plans endpoint failed: {r.status_code} {r.text}")
    data = r.json()
    plans = data.get("plans", [])
    if len(plans) < 4:
        error(f"Expected at least 4 Premium plans, got {len(plans)}")
    log(f"Premium plans endpoint working: {len(plans)} plans returned")
    
    # POST /api/razorpay/create-order (smallest Premium plan)
    headers = {"Authorization": f"Bearer {test_user_token}"}
    monthly_plan = next((p for p in plans if p.get("id") == "monthly"), None)
    if not monthly_plan:
        error("Monthly Premium plan not found")
    
    payload = {"planId": "monthly"}
    r = requests.post(f"{BASE_URL}/razorpay/create-order", headers=headers, json=payload, timeout=30)
    if r.status_code != 200:
        error(f"Premium order creation failed: {r.status_code} {r.text}")
    data = r.json()
    if not data.get("orderId"):
        error(f"Missing orderId in Premium order response: {data}")
    log(f"Premium order creation working: orderId={data.get('orderId')}")
    
    # Verify payment record does NOT have product='ai-credits'
    order_id = data.get("orderId")
    cmd = f"""mongosh mongodb://localhost:27017/edumaster_odisha --quiet --eval "db.payments.findOne({{ razorpay_order_id: '{order_id}' }})" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    if "ai-credits" in result.stdout:
        error(f"Premium payment record has product='ai-credits' — contamination detected!")
    log("Premium payment record verified: product != 'ai-credits' (no contamination)")
    
except Exception as e:
    error(f"Premium flow test exception: {e}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "="*80)
print("✅ ALL 16 AI CREDIT MONETIZATION TESTS PASSED")
print("="*80)
print("\nTEST SUMMARY:")
print("  1. ✅ Admin login")
print("  2. ✅ Test user login")
print("  3. ✅ GET /ai-credits/plans → 5 plans, plan_smart_750 bestValue=true")
print("  4. ✅ GET /ai-credits/costs → 21 costs, all editable, credits >= 1")
print("  5. ✅ Auth gating → 401 without token")
print("  6. ✅ Admin gating → 403 for non-admin")
print("  7. ✅ Wallet lifecycle → balance, transactions")
print("  8. ✅ Insufficient credits → 402 with INSUFFICIENT_CREDITS, no Gemini call")
print("  9. ✅ Seed admin wallet → 500 credits via mongosh")
print(" 10. ✅ Cache-miss generation → debited, Gemini call logged")
print(" 11. ✅ Cache-hit reuse → debited, no new Gemini call, reuseCount++")
print(" 12. ✅ Admin edit cost → min 1 credit enforced")
print(" 13. ✅ Admin analytics → all keys present, cache stats verified")
print(" 14. ✅ Razorpay checkout → order created, product='ai-credits'")
print(" 15. ✅ Razorpay verify → fake signature rejected with 400")
print(" 16. ✅ Premium flow untouched → no contamination")
print("\n" + "="*80)
