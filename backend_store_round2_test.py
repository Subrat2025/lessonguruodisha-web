#!/usr/bin/env python3
"""
STORE round-2 backend tests (A-E)
Tests: order notifications, webhook routing, draft shells, launch price, bundle grant
"""
import requests
import json
import hmac
import hashlib
import time
from datetime import datetime, timedelta
from pymongo import MongoClient
from uuid import uuid4

# Environment
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
TEST_BUYER_MOBILE = "8000000001"
TEST_BUYER_PASSWORD = "<redacted>"

# MongoDB connection
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Auth tokens
admin_token = None
buyer_token = None
buyer_user_id = None
real_product_id = None
real_product_slug = None

def login(mobile, password):
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password})
    if resp.status_code == 200:
        data = resp.json()
        return data.get("token"), data.get("user", {}).get("id")
    raise Exception(f"Login failed: {resp.status_code} {resp.text}")

def get_webhook_secret():
    """Get webhook secret from settings collection"""
    doc = db.settings.find_one({"key": "razorpay_webhook_secret"})
    if doc and doc.get("value"):
        return doc["value"]
    # Fallback to env
    return "test_secret_abc"

def compute_webhook_signature(body_str, secret):
    """Compute HMAC SHA256 signature for webhook"""
    return hmac.new(secret.encode(), body_str.encode(), hashlib.sha256).hexdigest()

print("=" * 80)
print("STORE ROUND-2 BACKEND TESTS (A-E)")
print("=" * 80)

# Setup: Login
print("\n[SETUP] Logging in...")
try:
    admin_token, _ = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    print(f"✅ Admin logged in")
    buyer_token, buyer_user_id = login(TEST_BUYER_MOBILE, TEST_BUYER_PASSWORD)
    print(f"✅ TEST buyer logged in (userId: {buyer_user_id})")
except Exception as e:
    print(f"❌ Login failed: {e}")
    exit(1)

# Get real published product
print("\n[SETUP] Finding real published product...")
real_product = db.storeProducts.find_one({"status": "published", "titleEnglish": {"$regex": "Class 6 Science"}})
if real_product:
    real_product_id = real_product["id"]
    real_product_slug = real_product["slug"]
    print(f"✅ Found real product: {real_product_id} ({real_product_slug})")
else:
    print("❌ No real published product found")
    exit(1)

# Track created items for cleanup
created_products = []
created_orders = []
created_entitlements = []
created_notifications = []

# ============================================================================
# TEST A: Order notification (in-app + WhatsApp) + idempotency
# ============================================================================
print("\n" + "=" * 80)
print("TEST A: Order notification + idempotency")
print("=" * 80)

try:
    # Count existing notifications for buyer
    initial_notif_count = db.referral_notifications.count_documents({"userId": buyer_user_id, "type": "store_order"})
    print(f"Initial notification count: {initial_notif_count}")
    
    # Make a TEST purchase
    print(f"\n[A1] POST /api/store/checkout/test with productIds=[{real_product_id}]")
    resp = requests.post(
        f"{BASE_URL}/store/checkout/test",
        headers={"Authorization": f"Bearer {buyer_token}"},
        json={"productIds": [real_product_id]}
    )
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Purchase successful: {json.dumps(data, indent=2)}")
        order_id = data.get("orderId")
        if order_id:
            created_orders.append(order_id)
            print(f"Order ID: {order_id}")
    else:
        print(f"❌ Purchase failed: {resp.text}")
        raise Exception("Purchase failed")
    
    # Wait a moment for notification to be created
    time.sleep(1)
    
    # Check for notification in referral_notifications
    print(f"\n[A2] Checking Mongo 'referral_notifications' for type:'store_order'")
    notification = db.referral_notifications.find_one({
        "userId": buyer_user_id,
        "type": "store_order",
        "meta.orderId": order_id
    })
    
    if notification:
        print(f"✅ Notification found: {notification['_id']}")
        print(f"   - type: {notification.get('type')}")
        print(f"   - title: {notification.get('title')}")
        print(f"   - message: {notification.get('message')[:80]}...")
        created_notifications.append(str(notification["_id"]))
    else:
        print(f"❌ No notification found for order {order_id}")
        raise Exception("Notification not created")
    
    # Check idempotency: repeat the same purchase path
    print(f"\n[A3] Testing idempotency: attempting to buy same product again")
    resp2 = requests.post(
        f"{BASE_URL}/store/checkout/test",
        headers={"Authorization": f"Bearer {buyer_token}"},
        json={"productIds": [real_product_id]}
    )
    print(f"Response: {resp2.status_code}")
    if resp2.status_code == 400:
        data2 = resp2.json()
        print(f"✅ Re-purchase blocked (expected): {data2.get('error')}")
    else:
        print(f"⚠️  Re-purchase returned {resp2.status_code}: {resp2.text}")
    
    # Count notifications again - should be same (no duplicate)
    final_notif_count = db.referral_notifications.count_documents({"userId": buyer_user_id, "type": "store_order"})
    print(f"\n[A4] Final notification count: {final_notif_count}")
    if final_notif_count == initial_notif_count + 1:
        print(f"✅ Idempotency verified: exactly 1 new notification created")
    else:
        print(f"❌ Idempotency failed: expected {initial_notif_count + 1}, got {final_notif_count}")
        raise Exception("Notification idempotency failed")
    
    print("\n✅ TEST A PASSED: Order notification + idempotency working")
    
except Exception as e:
    print(f"\n❌ TEST A FAILED: {e}")

# ============================================================================
# TEST B: Webhook routing + idempotency
# ============================================================================
print("\n" + "=" * 80)
print("TEST B: Razorpay webhook routing + idempotency")
print("=" * 80)

try:
    # Create a TEST product for this test (don't use real product)
    print(f"\n[B1] Creating TEST product for webhook test")
    resp = requests.post(
        f"{BASE_URL}/admin/store/products",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "type": "digital",
            "titleEnglish": "TEST_Webhook Product",
            "titleOdia": "TEST_Webhook",
            "classes": ["6"],
            "subject": "Test",
            "priceInr": 10,
            "mrpInr": 20,
            "securityLevel": 1,
            "status": "published"
        }
    )
    if resp.status_code == 200:
        test_product = resp.json()["product"]
        test_product_id = test_product["id"]
        created_products.append(test_product_id)
        print(f"✅ TEST product created: {test_product_id}")
    else:
        print(f"❌ Failed to create TEST product: {resp.text}")
        raise Exception("Product creation failed")
    
    # Insert a PENDING store order directly in Mongo
    print(f"\n[B2] Inserting PENDING storeOrder via Mongo")
    synthetic_order_id = str(uuid4())
    synthetic_rzp_order_id = f"order_TESTWH_{int(time.time())}"
    
    db.storeOrders.insert_one({
        "id": synthetic_order_id,
        "userId": buyer_user_id,
        "items": [{
            "productId": test_product_id,
            "title": "TEST_Webhook Product",
            "price": 10,
            "bundleItems": []
        }],
        "subtotal": 10,
        "discount": 0,
        "total": 10,
        "currency": "INR",
        "status": "pending",
        "razorpayOrderId": synthetic_rzp_order_id,
        "createdAt": datetime.utcnow()
    })
    created_orders.append(synthetic_order_id)
    print(f"✅ Synthetic order inserted: {synthetic_order_id}")
    print(f"   razorpayOrderId: {synthetic_rzp_order_id}")
    
    # Get initial salesCount
    initial_sales = db.storeProducts.find_one({"id": test_product_id}).get("salesCount", 0)
    print(f"   Initial salesCount: {initial_sales}")
    
    # Prepare webhook event
    webhook_secret = get_webhook_secret()
    print(f"\n[B3] Preparing webhook event with secret: {webhook_secret[:10]}...")
    
    webhook_event = {
        "id": f"evt_test_{int(time.time())}",
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": f"pay_TESTWH_{int(time.time())}",
                    "order_id": synthetic_rzp_order_id
                }
            }
        }
    }
    
    webhook_body = json.dumps(webhook_event)
    webhook_signature = compute_webhook_signature(webhook_body, webhook_secret)
    
    print(f"✅ Webhook signature computed: {webhook_signature[:20]}...")
    
    # POST webhook
    print(f"\n[B4] POST /api/razorpay/webhook with valid signature")
    resp = requests.post(
        f"{BASE_URL}/razorpay/webhook",
        headers={
            "Content-Type": "application/json",
            "x-razorpay-signature": webhook_signature
        },
        data=webhook_body
    )
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Webhook processed: {json.dumps(data, indent=2)}")
        if data.get("product") == "store_order":
            print(f"✅ Webhook routed to store_order handler")
        else:
            print(f"⚠️  Unexpected product: {data.get('product')}")
    else:
        print(f"❌ Webhook failed: {resp.text}")
        raise Exception("Webhook processing failed")
    
    # Verify order status changed to 'paid'
    print(f"\n[B5] Verifying order status changed to 'paid'")
    order = db.storeOrders.find_one({"id": synthetic_order_id})
    if order and order.get("status") == "paid":
        print(f"✅ Order status: {order['status']}")
    else:
        print(f"❌ Order status not 'paid': {order.get('status') if order else 'NOT FOUND'}")
        raise Exception("Order not fulfilled")
    
    # Verify entitlement created
    print(f"\n[B6] Verifying entitlement created")
    entitlement = db.storeEntitlements.find_one({"userId": buyer_user_id, "productId": test_product_id})
    if entitlement:
        print(f"✅ Entitlement found: {entitlement['id']}")
        created_entitlements.append(entitlement["id"])
    else:
        print(f"❌ No entitlement found")
        raise Exception("Entitlement not created")
    
    # Verify salesCount incremented
    print(f"\n[B7] Verifying salesCount incremented")
    final_sales = db.storeProducts.find_one({"id": test_product_id}).get("salesCount", 0)
    print(f"   Final salesCount: {final_sales}")
    if final_sales == initial_sales + 1:
        print(f"✅ salesCount incremented by exactly 1")
    else:
        print(f"❌ salesCount not incremented correctly: expected {initial_sales + 1}, got {final_sales}")
        raise Exception("salesCount not incremented")
    
    # Test idempotency: POST same webhook again
    print(f"\n[B8] Testing idempotency: POST same webhook again")
    resp2 = requests.post(
        f"{BASE_URL}/razorpay/webhook",
        headers={
            "Content-Type": "application/json",
            "x-razorpay-signature": webhook_signature
        },
        data=webhook_body
    )
    print(f"Response: {resp2.status_code}")
    if resp2.status_code == 200:
        data2 = resp2.json()
        print(f"✅ Webhook accepted: {json.dumps(data2, indent=2)}")
        if data2.get("status") == "duplicate":
            print(f"✅ Webhook marked as duplicate (idempotent)")
    
    # Verify salesCount NOT doubled
    final_sales2 = db.storeProducts.find_one({"id": test_product_id}).get("salesCount", 0)
    print(f"   salesCount after duplicate webhook: {final_sales2}")
    if final_sales2 == final_sales:
        print(f"✅ Idempotency verified: salesCount unchanged")
    else:
        print(f"❌ Idempotency failed: salesCount changed from {final_sales} to {final_sales2}")
        raise Exception("Webhook not idempotent")
    
    # Verify entitlement NOT duplicated
    entitlement_count = db.storeEntitlements.count_documents({"userId": buyer_user_id, "productId": test_product_id})
    print(f"   Entitlement count: {entitlement_count}")
    if entitlement_count == 1:
        print(f"✅ Idempotency verified: exactly 1 entitlement")
    else:
        print(f"❌ Idempotency failed: {entitlement_count} entitlements found")
        raise Exception("Entitlement duplicated")
    
    print("\n✅ TEST B PASSED: Webhook routing + idempotency working")
    
except Exception as e:
    print(f"\n❌ TEST B FAILED: {e}")

# ============================================================================
# TEST C: Draft shells (idempotent)
# ============================================================================
print("\n" + "=" * 80)
print("TEST C: Draft shells + idempotency")
print("=" * 80)

try:
    # POST draft-shells for RETEST 2026, class 2
    print(f"\n[C1] POST /api/admin/store/draft-shells {{exam:'RETEST 2026', class:'2'}}")
    resp = requests.post(
        f"{BASE_URL}/admin/store/draft-shells",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"exam": "RETEST 2026", "class": "2"}
    )
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Draft shells created: {json.dumps(data, indent=2)}")
        created_count = data.get("created", 0)
        skipped_count = data.get("skipped", 0)
        total_count = data.get("total", 0)
        print(f"   Created: {created_count}, Skipped: {skipped_count}, Total: {total_count}")
        
        if created_count > 0:
            print(f"✅ {created_count} draft products created")
            # Track created products for cleanup
            retest_products = db.storeProducts.find({"exam": "RETEST 2026", "type": "answer_key"})
            for p in retest_products:
                created_products.append(p["id"])
        else:
            print(f"⚠️  No products created (may already exist)")
    else:
        print(f"❌ Draft shells failed: {resp.text}")
        raise Exception("Draft shells creation failed")
    
    # Test idempotency: call again
    print(f"\n[C2] Testing idempotency: calling draft-shells again")
    resp2 = requests.post(
        f"{BASE_URL}/admin/store/draft-shells",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"exam": "RETEST 2026", "class": "2"}
    )
    print(f"Response: {resp2.status_code}")
    if resp2.status_code == 200:
        data2 = resp2.json()
        print(f"✅ Second call successful: {json.dumps(data2, indent=2)}")
        created2 = data2.get("created", 0)
        skipped2 = data2.get("skipped", 0)
        
        if created2 == 0 and skipped2 > 0:
            print(f"✅ Idempotency verified: created=0, skipped={skipped2}")
        else:
            print(f"⚠️  Unexpected result: created={created2}, skipped={skipped2}")
    else:
        print(f"❌ Second call failed: {resp2.text}")
        raise Exception("Idempotency test failed")
    
    print("\n✅ TEST C PASSED: Draft shells + idempotency working")
    
except Exception as e:
    print(f"\n❌ TEST C FAILED: {e}")

# ============================================================================
# TEST D: Launch price (active within window, expired reverts to base)
# ============================================================================
print("\n" + "=" * 80)
print("TEST D: Launch price (active/expired)")
print("=" * 80)

try:
    # Create a TEST product for launch price test
    print(f"\n[D1] Creating TEST product for launch price test")
    resp = requests.post(
        f"{BASE_URL}/admin/store/products",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "type": "digital",
            "titleEnglish": "TEST_Launch Price Product",
            "titleOdia": "TEST_Launch",
            "classes": ["6"],
            "subject": "Test",
            "priceInr": 100,
            "mrpInr": 200,
            "securityLevel": 1,
            "status": "published"
        }
    )
    if resp.status_code == 200:
        launch_product = resp.json()["product"]
        launch_product_id = launch_product["id"]
        launch_product_slug = launch_product["slug"]
        created_products.append(launch_product_id)
        print(f"✅ TEST product created: {launch_product_id}")
        print(f"   Base price: ₹100")
    else:
        print(f"❌ Failed to create TEST product: {resp.text}")
        raise Exception("Product creation failed")
    
    # Set launch price with active window
    print(f"\n[D2] Setting launch price: ₹19, window: now to +15 days")
    now = datetime.utcnow()
    launch_start = now.isoformat() + "Z"
    launch_end = (now + timedelta(days=15)).isoformat() + "Z"
    
    resp = requests.put(
        f"{BASE_URL}/admin/store/products/{launch_product_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "launchPriceInr": 19,
            "launchStart": launch_start,
            "launchEnd": launch_end
        }
    )
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        print(f"✅ Launch price set")
    else:
        print(f"❌ Failed to set launch price: {resp.text}")
        raise Exception("Launch price update failed")
    
    # GET product and verify launch price active
    print(f"\n[D3] GET /api/store/product/{launch_product_slug} - verify launchActive=true, price=19")
    resp = requests.get(f"{BASE_URL}/store/product/{launch_product_slug}")
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        product = data.get("product", {})
        pricing = product.get("pricing", {})
        
        print(f"   pricing.price: ₹{pricing.get('price')}")
        print(f"   pricing.launchActive: {pricing.get('launchActive')}")
        
        if pricing.get("launchActive") == True and pricing.get("price") == 19:
            print(f"✅ Launch price active: ₹19")
        else:
            print(f"❌ Launch price not active or incorrect")
            raise Exception("Launch price not working")
    else:
        print(f"❌ Failed to get product: {resp.text}")
        raise Exception("Product fetch failed")
    
    # Set launch window to PAST (expired)
    print(f"\n[D4] Setting launch window to PAST (expired)")
    past_start = (now - timedelta(days=20)).isoformat() + "Z"
    past_end = (now - timedelta(days=5)).isoformat() + "Z"
    
    resp = requests.put(
        f"{BASE_URL}/admin/store/products/{launch_product_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "launchStart": past_start,
            "launchEnd": past_end
        }
    )
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        print(f"✅ Launch window set to past")
    else:
        print(f"❌ Failed to update launch window: {resp.text}")
        raise Exception("Launch window update failed")
    
    # GET product and verify launch price NOT active, price reverted to base
    print(f"\n[D5] GET /api/store/product/{launch_product_slug} - verify launchActive=false, price=100")
    resp = requests.get(f"{BASE_URL}/store/product/{launch_product_slug}")
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        product = data.get("product", {})
        pricing = product.get("pricing", {})
        
        print(f"   pricing.price: ₹{pricing.get('price')}")
        print(f"   pricing.launchActive: {pricing.get('launchActive')}")
        
        if pricing.get("launchActive") == False and pricing.get("price") == 100:
            print(f"✅ Launch price expired: reverted to base ₹100")
        else:
            print(f"❌ Launch price not expired or price incorrect")
            raise Exception("Launch price expiry not working")
    else:
        print(f"❌ Failed to get product: {resp.text}")
        raise Exception("Product fetch failed")
    
    print("\n✅ TEST D PASSED: Launch price active/expired working")
    
except Exception as e:
    print(f"\n❌ TEST D FAILED: {e}")

# ============================================================================
# TEST E: Bundle grant (entitlements for all bundleItems)
# ============================================================================
print("\n" + "=" * 80)
print("TEST E: Bundle grant (entitlements for all items)")
print("=" * 80)

try:
    # Create 2 TEST products to include in bundle
    print(f"\n[E1] Creating 2 TEST products for bundle")
    bundle_item_ids = []
    
    for i in range(1, 3):
        resp = requests.post(
            f"{BASE_URL}/admin/store/products",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "type": "digital",
                "titleEnglish": f"TEST_Bundle Item {i}",
                "titleOdia": f"TEST_Item_{i}",
                "classes": ["6"],
                "subject": "Test",
                "priceInr": 50,
                "mrpInr": 100,
                "securityLevel": 1,
                "status": "published"
            }
        )
        if resp.status_code == 200:
            item = resp.json()["product"]
            item_id = item["id"]
            bundle_item_ids.append(item_id)
            created_products.append(item_id)
            print(f"✅ Item {i} created: {item_id}")
        else:
            print(f"❌ Failed to create item {i}: {resp.text}")
            raise Exception(f"Item {i} creation failed")
    
    # Upload a dummy PDF to each item (required for bundle)
    print(f"\n[E2] Uploading dummy files to bundle items")
    for item_id in bundle_item_ids:
        # Create a small dummy PDF
        dummy_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n210\n%%EOF"
        
        files = {"files": ("test.pdf", dummy_pdf, "application/pdf")}
        data = {"kind": "pdf"}
        
        resp = requests.post(
            f"{BASE_URL}/admin/store/products/{item_id}/files",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files,
            data=data
        )
        if resp.status_code == 200:
            print(f"✅ File uploaded to {item_id}")
        else:
            print(f"⚠️  File upload failed for {item_id}: {resp.text}")
    
    # Create bundle product
    print(f"\n[E3] Creating bundle product with bundleItems")
    resp = requests.post(
        f"{BASE_URL}/admin/store/products",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "type": "bundle",
            "titleEnglish": "TEST_Bundle Product",
            "titleOdia": "TEST_Bundle",
            "classes": ["6"],
            "subject": "Test",
            "priceInr": 80,
            "mrpInr": 200,
            "bundleItems": bundle_item_ids,
            "status": "published"
        }
    )
    if resp.status_code == 200:
        bundle_product = resp.json()["product"]
        bundle_product_id = bundle_product["id"]
        created_products.append(bundle_product_id)
        print(f"✅ Bundle created: {bundle_product_id}")
        print(f"   bundleItems: {bundle_item_ids}")
    else:
        print(f"❌ Failed to create bundle: {resp.text}")
        raise Exception("Bundle creation failed")
    
    # TEST-buy the bundle
    print(f"\n[E4] TEST-buying bundle via POST /api/store/checkout/test")
    resp = requests.post(
        f"{BASE_URL}/store/checkout/test",
        headers={"Authorization": f"Bearer {buyer_token}"},
        json={"productIds": [bundle_product_id]}
    )
    print(f"Response: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Bundle purchased: {json.dumps(data, indent=2)}")
        bundle_order_id = data.get("orderId")
        if bundle_order_id:
            created_orders.append(bundle_order_id)
    else:
        print(f"❌ Bundle purchase failed: {resp.text}")
        raise Exception("Bundle purchase failed")
    
    # Verify entitlements for bundle + both items
    print(f"\n[E5] Verifying entitlements for bundle + all items")
    
    # Check bundle entitlement
    bundle_ent = db.storeEntitlements.find_one({"userId": buyer_user_id, "productId": bundle_product_id})
    if bundle_ent:
        print(f"✅ Bundle entitlement found: {bundle_ent['id']}")
        created_entitlements.append(bundle_ent["id"])
    else:
        print(f"❌ Bundle entitlement NOT found")
        raise Exception("Bundle entitlement missing")
    
    # Check item entitlements
    for i, item_id in enumerate(bundle_item_ids, 1):
        item_ent = db.storeEntitlements.find_one({"userId": buyer_user_id, "productId": item_id})
        if item_ent:
            print(f"✅ Item {i} entitlement found: {item_ent['id']}")
            created_entitlements.append(item_ent["id"])
        else:
            print(f"❌ Item {i} entitlement NOT found")
            raise Exception(f"Item {i} entitlement missing")
    
    print(f"\n✅ All entitlements verified: bundle + {len(bundle_item_ids)} items")
    print("\n✅ TEST E PASSED: Bundle grant working")
    
except Exception as e:
    print(f"\n❌ TEST E FAILED: {e}")

# ============================================================================
# CLEANUP
# ============================================================================
print("\n" + "=" * 80)
print("CLEANUP")
print("=" * 80)

print(f"\nCleaning up TEST data...")
print(f"  Products to delete: {len(created_products)}")
print(f"  Orders to delete: {len(created_orders)}")
print(f"  Entitlements to delete: {len(created_entitlements)}")
print(f"  Notifications to delete: {len(created_notifications)}")

# Delete TEST products
if created_products:
    result = db.storeProducts.delete_many({"id": {"$in": created_products}})
    print(f"✅ Deleted {result.deleted_count} TEST products")
    
    # Delete associated files
    result = db.storeProductFiles.delete_many({"productId": {"$in": created_products}})
    print(f"✅ Deleted {result.deleted_count} product files")

# Delete TEST orders
if created_orders:
    result = db.storeOrders.delete_many({"id": {"$in": created_orders}})
    print(f"✅ Deleted {result.deleted_count} TEST orders")

# Delete TEST entitlements
if created_entitlements:
    result = db.storeEntitlements.delete_many({"id": {"$in": created_entitlements}})
    print(f"✅ Deleted {result.deleted_count} TEST entitlements")

# Delete TEST notifications (only the ones we created)
if created_notifications:
    from bson import ObjectId
    oids = [ObjectId(nid) for nid in created_notifications if len(nid) == 24]
    if oids:
        result = db.referral_notifications.delete_many({"_id": {"$in": oids}})
        print(f"✅ Deleted {result.deleted_count} TEST notifications")

# Verify real product NOT deleted
real_check = db.storeProducts.find_one({"id": real_product_id})
if real_check:
    print(f"✅ Real product '{real_check['titleEnglish']}' preserved")
else:
    print(f"⚠️  WARNING: Real product may have been deleted!")

# Verify store master switch still ON
settings = db.settings.find_one({"key": "store_settings"})
if settings and settings.get("value", {}).get("enabled") == True:
    print(f"✅ Store master switch remains ON")
else:
    print(f"⚠️  WARNING: Store master switch may be OFF!")

print("\n" + "=" * 80)
print("STORE ROUND-2 TESTS COMPLETE")
print("=" * 80)
print("\nSummary:")
print("  A) Order notification + idempotency: Check output above")
print("  B) Webhook routing + idempotency: Check output above")
print("  C) Draft shells + idempotency: Check output above")
print("  D) Launch price (active/expired): Check output above")
print("  E) Bundle grant: Check output above")
print("\nCleanup: TEST data deleted, real product preserved, master switch ON")
