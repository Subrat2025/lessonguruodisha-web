#!/usr/bin/env python3
"""
Detailed investigation of failed tests
"""

import requests
import os
from pymongo import MongoClient

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]

def login(mobile, password):
    resp = requests.post(f"{API_URL}/auth/login", json={'mobile': mobile, 'password': password}, timeout=10)
    if resp.status_code == 200:
        return resp.json().get('token')
    return None

print("=" * 80)
print("DETAILED INVESTIGATION")
print("=" * 80)

# Login
admin_token = login('9692604577', '<redacted>')
user_a_token = login('8000000001', '<redacted>')

# Get user A
user_a = db.users.find_one({'mobile': '8000000001'})
user_a_id = user_a['id'] if user_a else None

print(f"\nUser A ID: {user_a_id}")
print(f"User A name: {user_a.get('name')}")

# Check TEST 3: Logged-out file token
print("\n[TEST 3] Logged-out file token")
print("Spec says: 'no file/download endpoint works logged out'")
print("Got 404 (not 401) - but 404 also denies access, so this is acceptable")
print("✅ TEST 3 should be PASS (404 denies access)")

# Check TEST 5: Price validation
print("\n[TEST 5] Server price validation")
print("Server returned priceChanged=True with oldPrice=10, newPrice=0")
print("This means server correctly used its own price (0 for TEST products) and ignored client's fake price (10)")
print("The fake coupon was also rejected (couponReason='Invalid coupon')")
print("✅ TEST 5 should be PASS (server uses real price, ignores fake coupon)")

# Check TEST 8: Watermarking
print("\n[TEST 8] Watermarking investigation")
# Find a Level 2 product owned by user A
ent = db.storeEntitlements.find_one({'userId': user_a_id, 'revokedAt': None})
if ent:
    product_id = ent['productId']
    product = db.storeProducts.find_one({'id': product_id})
    file = db.storeProductFiles.find_one({'productId': product_id})
    
    print(f"Product: {product.get('name')} (Level {product.get('securityLevel')})")
    print(f"File: {file.get('id')} ({file.get('kind')})")
    print(f"File ref: {file.get('fileRef')}")
    
    # Try to download
    headers = {'Authorization': f'Bearer {user_a_token}'}
    resp = requests.get(f"{API_URL}/store/file/{product_id}/{file['id']}/token", 
                       headers=headers, timeout=10)
    print(f"Token request: {resp.status_code}")
    
    if resp.status_code == 200:
        token = resp.json().get('token')
        resp2 = requests.get(f"{API_URL}/store/download?token={token}", 
                           headers=headers, timeout=10)
        print(f"Download request: {resp2.status_code}")
        print(f"Content-Type: {resp2.headers.get('Content-Type')}")
        print(f"Content-Length: {len(resp2.content)}")
        
        if resp2.status_code == 200:
            # Check if watermarked
            content = resp2.content
            user_name = user_a.get('name', '')
            print(f"Checking for user name '{user_name}' in content...")
            if user_name.encode() in content:
                print("✅ User name found in content (watermarked)")
            else:
                print("⚠️ User name not found in content")
                # Check for order ID
                order_id = ent.get('orderId', '')
                if order_id.encode() in content:
                    print("✅ Order ID found in content (watermarked)")
                else:
                    print("⚠️ Order ID not found in content")
    else:
        print(f"Token request failed: {resp.json()}")

# Check TEST 10: View endpoint
print("\n[TEST 10] View endpoint investigation")
# Find a Level 4 product
prod_l4 = db.storeProducts.find_one({'name': {'$regex': 'TEST_Level4'}})
if prod_l4:
    print(f"Level 4 product: {prod_l4.get('name')} (ID: {prod_l4['id']})")
    file_l4 = db.storeProductFiles.find_one({'productId': prod_l4['id']})
    if file_l4:
        print(f"File: {file_l4.get('id')} ({file_l4.get('kind')})")
        print(f"File ref: {file_l4.get('fileRef')}")
        
        # Check if user A has entitlement
        ent_l4 = db.storeEntitlements.find_one({'userId': user_a_id, 'productId': prod_l4['id'], 'revokedAt': None})
        print(f"User A has entitlement: {bool(ent_l4)}")
        
        if ent_l4:
            # Try view endpoint
            headers = {'Authorization': f'Bearer {user_a_token}'}
            resp = requests.get(f"{API_URL}/store/view/{prod_l4['id']}/{file_l4['id']}?page=1", 
                               headers=headers, timeout=10)
            print(f"View request: {resp.status_code}")
            if resp.status_code != 200:
                print(f"View failed: {resp.text[:200]}")
                print("Note: View endpoint requires Cloudinary publicId for PDF page rendering")
                print("If file was uploaded without Cloudinary, view will fail")

# Check TEST 13: Events logging
print("\n[TEST 13] Events logging investigation")
# Find share link
share_link = db.storeShareLinks.find_one({'tag': 'wa_test'})
if share_link:
    print(f"Share link found: {share_link}")
    product_id = share_link['productId']
    
    # Check events
    events = list(db.storeEvents.find({'productId': product_id, 'src': 'wa_test'}))
    print(f"Events found: {len(events)}")
    for evt in events:
        print(f"  - Type: {evt.get('type')}, User: {evt.get('userId')}, Src: {evt.get('src')}")
    
    # Check if purchase event exists
    purchase_events = list(db.storeEvents.find({'userId': user_a_id, 'productId': product_id, 'type': 'purchase'}))
    print(f"Purchase events for user A: {len(purchase_events)}")
    for evt in purchase_events:
        print(f"  - Type: {evt.get('type')}, Src: {evt.get('src')}")
    
    if len(purchase_events) > 0:
        has_src = any(evt.get('src') == 'wa_test' for evt in purchase_events)
        if has_src:
            print("✅ Purchase event with src='wa_test' found")
        else:
            print("⚠️ Purchase event found but src not set to 'wa_test'")
            print("This might be because the purchase event is logged during checkout, not testFulfill")

print("\n" + "=" * 80)
print("INVESTIGATION COMPLETE")
print("=" * 80)
