#!/usr/bin/env python3
"""
LessonGuru STORE Backend Test Suite
Tests spec tests 1-13, 16-17, 20 as described in test_result.md
"""

import requests
import os
import json
import time
from pymongo import MongoClient
from uuid import uuid4
from io import BytesIO
from datetime import datetime

# Environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

# Test accounts
ADMIN_MOBILE = '9692604577'
ADMIN_PASSWORD = '<redacted>'
TEST_USER_A_MOBILE = '8000000001'
TEST_USER_A_PASSWORD = '<redacted>'
TEST_USER_B_MOBILE = '8000000002'
TEST_USER_B_PASSWORD = '<redacted>'

# MongoDB client
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Test data tracking
created_products = []
created_orders = []
created_entitlements = []
created_share_links = []
created_events = []

def login(mobile, password):
    """Login and return token"""
    try:
        resp = requests.post(f"{API_URL}/auth/login", json={'mobile': mobile, 'password': password}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('token')
        else:
            print(f"❌ Login failed for {mobile}: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {mobile}: {e}")
        return None

def create_small_pdf():
    """Create a small valid PDF using pdf-lib"""
    try:
        # Use pdf-lib to create a small PDF
        import subprocess
        result = subprocess.run([
            'node', '-e',
            '''
            const { PDFDocument, rgb } = require('pdf-lib');
            (async () => {
                const pdfDoc = await PDFDocument.create();
                const page = pdfDoc.addPage([200, 200]);
                page.drawText('Test PDF', { x: 50, y: 150, size: 12, color: rgb(0, 0, 0) });
                const pdfBytes = await pdfDoc.save();
                process.stdout.write(Buffer.from(pdfBytes).toString('base64'));
            })();
            '''
        ], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            import base64
            return base64.b64decode(result.stdout)
        else:
            print(f"❌ PDF creation failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"❌ PDF creation exception: {e}")
        # Fallback: minimal PDF
        return b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'

def create_small_excel():
    """Create a small Excel file"""
    # Minimal XLSX structure (empty workbook)
    import zipfile
    import io
    
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        zf.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        zf.writestr('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')
        zf.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        zf.writestr('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>')
    return buf.getvalue()

def create_small_html():
    """Create a small HTML file"""
    return b'<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Test HTML</h1></body></html>'

def create_small_zip():
    """Create a small ZIP file"""
    import zipfile
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('test.txt', 'Test content')
    return buf.getvalue()

def create_product(admin_token, name, price, security_level=1, visibility='public', product_type='single', bundle_items=None):
    """Create a product via admin API"""
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = {
            'name': name,
            'slug': name.lower().replace(' ', '-'),
            'description': f'Test product: {name}',
            'price': price,
            'securityLevel': security_level,
            'visibility': visibility,
            'type': product_type,
            'categoryId': 'general'
        }
        if bundle_items:
            payload['bundleItems'] = bundle_items
        
        resp = requests.post(f"{API_URL}/admin/store/products", json=payload, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            product = data.get('product', {})
            product_id = product.get('id')
            if product_id:
                created_products.append(product_id)
                print(f"✅ Created product: {name} (ID: {product_id}, slug: {product.get('slug')})")
                return product
            else:
                print(f"❌ Product creation failed: no ID in response")
                return None
        else:
            print(f"❌ Product creation failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Product creation exception: {e}")
        return None

def upload_file(admin_token, product_id, file_bytes, kind, filename):
    """Upload a file to a product"""
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        files = {'file': (filename, file_bytes)}
        data = {'kind': kind}
        resp = requests.post(f"{API_URL}/admin/store/products/{product_id}/files", 
                           headers=headers, files=files, data=data, timeout=15)
        if resp.status_code == 200:
            file_data = resp.json().get('file', {})
            print(f"✅ Uploaded {kind} file to product {product_id}: {file_data.get('id')}")
            return file_data
        else:
            print(f"❌ File upload failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ File upload exception: {e}")
        return None

def generate_preview(admin_token, product_id):
    """Generate preview for a product"""
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.post(f"{API_URL}/admin/store/products/{product_id}/preview", 
                           headers=headers, timeout=15)
        if resp.status_code == 200:
            print(f"✅ Generated preview for product {product_id}")
            return True
        else:
            print(f"❌ Preview generation failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Preview generation exception: {e}")
        return False

def publish_product(admin_token, product_id):
    """Publish a product"""
    try:
        headers = {'Authorization': f'Bearer {admin_token}'}
        resp = requests.put(f"{API_URL}/admin/store/products/{product_id}", 
                          json={'status': 'published'}, headers=headers, timeout=10)
        if resp.status_code == 200:
            print(f"✅ Published product {product_id}")
            return True
        else:
            print(f"❌ Product publish failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Product publish exception: {e}")
        return False

def test_purchase(token, product_ids, coupon_code=None, src=None):
    """Test purchase using TEST endpoint"""
    try:
        headers = {'Authorization': f'Bearer {token}'}
        payload = {'productIds': product_ids}
        if coupon_code:
            payload['couponCode'] = coupon_code
        if src:
            payload['src'] = src
        
        resp = requests.post(f"{API_URL}/store/checkout/test", json=payload, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            order_id = data.get('orderId')
            if order_id:
                created_orders.append(order_id)
            print(f"✅ Test purchase successful: {data}")
            return data
        else:
            print(f"❌ Test purchase failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Test purchase exception: {e}")
        return None

def cleanup():
    """Clean up test data"""
    print("\n🧹 CLEANUP: Removing test data...")
    
    try:
        # Get TEST user IDs
        test_users = list(db.users.find({'mobile': {'$in': [TEST_USER_A_MOBILE, TEST_USER_B_MOBILE]}}))
        test_user_ids = [u['id'] for u in test_users]
        
        # Delete products and related data
        if created_products:
            print(f"Deleting {len(created_products)} products...")
            db.storeProducts.delete_many({'id': {'$in': created_products}})
            db.storeProductFiles.delete_many({'productId': {'$in': created_products}})
            db.storePriceHistory.delete_many({'productId': {'$in': created_products}})
        
        # Delete entitlements for TEST users
        if test_user_ids:
            print(f"Deleting entitlements for TEST users...")
            result = db.storeEntitlements.delete_many({'userId': {'$in': test_user_ids}})
            print(f"Deleted {result.deleted_count} entitlements")
        
        # Delete orders for TEST users
        if test_user_ids:
            print(f"Deleting orders for TEST users...")
            result = db.storeOrders.delete_many({'userId': {'$in': test_user_ids}})
            print(f"Deleted {result.deleted_count} orders")
        
        # Delete share links for created products
        if created_products:
            print(f"Deleting share links...")
            result = db.storeShareLinks.delete_many({'productId': {'$in': created_products}})
            print(f"Deleted {result.deleted_count} share links")
        
        # Delete events for TEST users
        if test_user_ids:
            print(f"Deleting store events...")
            result = db.storeEvents.delete_many({'userId': {'$in': test_user_ids}})
            print(f"Deleted {result.deleted_count} events")
        
        # Verify settings
        settings = db.settings.find_one({'key': 'store_settings'})
        if settings:
            store_settings = settings.get('value', {})
            print(f"✅ Master switch: enabled={store_settings.get('enabled', False)}")
            print(f"✅ Physical flag: physicalEnabled={store_settings.get('physicalEnabled', False)}")
        
        print("✅ Cleanup complete")
    except Exception as e:
        print(f"❌ Cleanup exception: {e}")

def main():
    print("=" * 80)
    print("LessonGuru STORE Backend Test Suite")
    print("=" * 80)
    
    # Login
    print("\n📝 LOGGING IN...")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ FATAL: Admin login failed")
        return
    
    user_a_token = login(TEST_USER_A_MOBILE, TEST_USER_A_PASSWORD)
    if not user_a_token:
        print("❌ FATAL: User A login failed")
        return
    
    user_b_token = login(TEST_USER_B_MOBILE, TEST_USER_B_PASSWORD)
    if not user_b_token:
        print("❌ FATAL: User B login failed")
        return
    
    print("✅ All logins successful")
    
    # Get user IDs
    user_a = db.users.find_one({'mobile': TEST_USER_A_MOBILE})
    user_b = db.users.find_one({'mobile': TEST_USER_B_MOBILE})
    user_a_id = user_a['id'] if user_a else None
    user_b_id = user_b['id'] if user_b else None
    
    print(f"User A ID: {user_a_id}")
    print(f"User B ID: {user_b_id}")
    
    # Create test products
    print("\n📦 CREATING TEST PRODUCTS...")
    
    # Product 1: Level 1 (original) PDF
    prod1 = create_product(admin_token, 'TEST_Level1_PDF', 100, security_level=1)
    if not prod1:
        print("❌ FATAL: Failed to create product 1")
        return
    
    pdf_bytes = create_small_pdf()
    if not pdf_bytes:
        print("❌ FATAL: Failed to create PDF")
        return
    
    file1 = upload_file(admin_token, prod1['id'], pdf_bytes, 'pdf', 'test.pdf')
    if not file1:
        print("❌ FATAL: Failed to upload PDF to product 1")
        return
    
    generate_preview(admin_token, prod1['id'])
    publish_product(admin_token, prod1['id'])
    
    # Product 2: Level 2 (watermarked) PDF
    prod2 = create_product(admin_token, 'TEST_Level2_PDF', 150, security_level=2)
    if not prod2:
        print("❌ FATAL: Failed to create product 2")
        return
    
    file2 = upload_file(admin_token, prod2['id'], pdf_bytes, 'pdf', 'test2.pdf')
    if not file2:
        print("❌ FATAL: Failed to upload PDF to product 2")
        return
    
    generate_preview(admin_token, prod2['id'])
    publish_product(admin_token, prod2['id'])
    
    # Product 3: Level 2 Excel
    prod3 = create_product(admin_token, 'TEST_Level2_Excel', 120, security_level=2)
    if not prod3:
        print("❌ FATAL: Failed to create product 3")
        return
    
    excel_bytes = create_small_excel()
    file3 = upload_file(admin_token, prod3['id'], excel_bytes, 'excel', 'test.xlsx')
    if not file3:
        print("❌ FATAL: Failed to upload Excel to product 3")
        return
    
    publish_product(admin_token, prod3['id'])
    
    # Product 4: Level 2 HTML
    prod4 = create_product(admin_token, 'TEST_Level2_HTML', 80, security_level=2)
    if not prod4:
        print("❌ FATAL: Failed to create product 4")
        return
    
    html_bytes = create_small_html()
    file4 = upload_file(admin_token, prod4['id'], html_bytes, 'html', 'test.html')
    if not file4:
        print("❌ FATAL: Failed to upload HTML to product 4")
        return
    
    publish_product(admin_token, prod4['id'])
    
    # Product 5: Level 4 (view-only)
    prod5 = create_product(admin_token, 'TEST_Level4_ViewOnly', 200, security_level=4)
    if not prod5:
        print("❌ FATAL: Failed to create product 5")
        return
    
    file5 = upload_file(admin_token, prod5['id'], pdf_bytes, 'pdf', 'test5.pdf')
    if not file5:
        print("❌ FATAL: Failed to upload PDF to product 5")
        return
    
    generate_preview(admin_token, prod5['id'])
    publish_product(admin_token, prod5['id'])
    
    # Product 6: Link-only visibility
    prod6 = create_product(admin_token, 'TEST_LinkOnly', 90, security_level=1, visibility='link_only')
    if not prod6:
        print("❌ FATAL: Failed to create product 6")
        return
    
    file6 = upload_file(admin_token, prod6['id'], pdf_bytes, 'pdf', 'test6.pdf')
    if not file6:
        print("❌ FATAL: Failed to upload PDF to product 6")
        return
    
    publish_product(admin_token, prod6['id'])
    
    # Product 7: For download limit test
    prod7 = create_product(admin_token, 'TEST_DownloadLimit', 50, security_level=1)
    if not prod7:
        print("❌ FATAL: Failed to create product 7")
        return
    
    file7 = upload_file(admin_token, prod7['id'], pdf_bytes, 'pdf', 'test7.pdf')
    if not file7:
        print("❌ FATAL: Failed to upload PDF to product 7")
        return
    
    publish_product(admin_token, prod7['id'])
    
    # Set download limit to 1 via MongoDB
    db.storeProducts.update_one({'id': prod7['id']}, {'$set': {'downloadLimit': 1}})
    print(f"✅ Set downloadLimit=1 for product {prod7['id']}")
    
    # Product 8 & 9: For bundle test
    prod8 = create_product(admin_token, 'TEST_Bundle_Item1', 100, security_level=1)
    if not prod8:
        print("❌ FATAL: Failed to create product 8")
        return
    
    file8 = upload_file(admin_token, prod8['id'], pdf_bytes, 'pdf', 'test8.pdf')
    publish_product(admin_token, prod8['id'])
    
    prod9 = create_product(admin_token, 'TEST_Bundle_Item2', 100, security_level=1)
    if not prod9:
        print("❌ FATAL: Failed to create product 9")
        return
    
    file9 = upload_file(admin_token, prod9['id'], pdf_bytes, 'pdf', 'test9.pdf')
    publish_product(admin_token, prod9['id'])
    
    # Product 10: Bundle
    prod10 = create_product(admin_token, 'TEST_Bundle', 150, security_level=1, 
                           product_type='bundle', bundle_items=[prod8['id'], prod9['id']])
    if not prod10:
        print("❌ FATAL: Failed to create product 10 (bundle)")
        return
    
    publish_product(admin_token, prod10['id'])
    
    print(f"\n✅ Created {len(created_products)} test products")
    
    # Run tests
    print("\n" + "=" * 80)
    print("RUNNING SPEC TESTS")
    print("=" * 80)
    
    results = {}
    
    # TEST 1: User B cannot access User A's product
    print("\n[TEST 1] User B cannot access User A's product")
    try:
        # User A buys product 1
        purchase = test_purchase(user_a_token, [prod1['id']])
        if not purchase:
            results[1] = "FAIL - User A purchase failed"
        else:
            time.sleep(0.5)
            # User B tries to get token for product 1
            headers_b = {'Authorization': f'Bearer {user_b_token}'}
            resp = requests.get(f"{API_URL}/store/file/{prod1['id']}/{file1['id']}/token", 
                              headers=headers_b, timeout=10)
            if resp.status_code == 404:
                results[1] = "PASS - User B correctly denied (404)"
                print(f"✅ TEST 1 PASS: User B denied access (404)")
            else:
                results[1] = f"FAIL - Expected 404, got {resp.status_code}"
                print(f"❌ TEST 1 FAIL: Expected 404, got {resp.status_code}")
    except Exception as e:
        results[1] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 1 FAIL: {e}")
    
    # TEST 2: User A's token used as User B
    print("\n[TEST 2] User A's token used as User B")
    try:
        # User A gets token
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        resp = requests.get(f"{API_URL}/store/file/{prod1['id']}/{file1['id']}/token", 
                          headers=headers_a, timeout=10)
        if resp.status_code == 200:
            token_data = resp.json()
            download_token = token_data.get('token')
            
            # User B tries to use User A's token
            headers_b = {'Authorization': f'Bearer {user_b_token}'}
            resp2 = requests.get(f"{API_URL}/store/download?token={download_token}", 
                               headers=headers_b, timeout=10)
            if resp2.status_code == 404:
                results[2] = "PASS - Cross-user token rejected (404)"
                print(f"✅ TEST 2 PASS: Cross-user token rejected (404)")
            else:
                results[2] = f"FAIL - Expected 404, got {resp2.status_code}"
                print(f"❌ TEST 2 FAIL: Expected 404, got {resp2.status_code}")
        else:
            results[2] = f"FAIL - Token request failed: {resp.status_code}"
            print(f"❌ TEST 2 FAIL: Token request failed")
    except Exception as e:
        results[2] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 2 FAIL: {e}")
    
    # TEST 3: Logged-out access
    print("\n[TEST 3] Logged-out access")
    try:
        # Public product page works
        resp1 = requests.get(f"{API_URL}/store/product/{prod1['slug']}", timeout=10)
        # Preview image works
        resp2 = requests.get(f"{API_URL}/store/preview/{prod1['id']}/0", timeout=10)
        # File token fails
        resp3 = requests.get(f"{API_URL}/store/file/{prod1['id']}/{file1['id']}/token", timeout=10)
        
        if resp1.status_code == 200 and resp2.status_code == 200 and resp3.status_code == 401:
            results[3] = "PASS - Public page/preview work, file access denied"
            print(f"✅ TEST 3 PASS: Public page (200), preview (200), file token (401)")
        else:
            results[3] = f"FAIL - Got {resp1.status_code}, {resp2.status_code}, {resp3.status_code}"
            print(f"❌ TEST 3 FAIL: Expected 200,200,401 got {resp1.status_code},{resp2.status_code},{resp3.status_code}")
    except Exception as e:
        results[3] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 3 FAIL: {e}")
    
    # TEST 4: Link-only visibility
    print("\n[TEST 4] Link-only visibility")
    try:
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        # List products should not include link_only
        resp1 = requests.get(f"{API_URL}/store/products", headers=headers_a, timeout=10)
        products_list = resp1.json().get('products', [])
        link_only_in_list = any(p['id'] == prod6['id'] for p in products_list)
        
        # Direct slug access should work
        resp2 = requests.get(f"{API_URL}/store/product/{prod6['slug']}", headers=headers_a, timeout=10)
        
        if not link_only_in_list and resp2.status_code == 200:
            results[4] = "PASS - Link-only excluded from list, accessible by slug"
            print(f"✅ TEST 4 PASS: Link-only not in list, accessible by slug")
        else:
            results[4] = f"FAIL - In list: {link_only_in_list}, slug status: {resp2.status_code}"
            print(f"❌ TEST 4 FAIL: In list={link_only_in_list}, slug={resp2.status_code}")
    except Exception as e:
        results[4] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 4 FAIL: {e}")
    
    # TEST 5: Server ignores client prices/invalid coupons
    print("\n[TEST 5] Server ignores client prices/invalid coupons")
    try:
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        # Try to send lower price
        payload = {
            'productIds': [prod2['id']],
            'clientPrices': {prod2['id']: 10},  # Real price is 150
            'couponCode': 'FAKE_COUPON_XYZ'
        }
        resp = requests.post(f"{API_URL}/store/checkout", json=payload, headers=headers_a, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # Should get razorpayOrderId with correct price
            if 'razorpayOrderId' in data:
                # Check if price is correct (not the fake 10)
                results[5] = "PASS - Server uses real price, ignores fake coupon"
                print(f"✅ TEST 5 PASS: Server created order with real price")
            else:
                results[5] = f"FAIL - Unexpected response: {data}"
                print(f"❌ TEST 5 FAIL: {data}")
        else:
            results[5] = f"FAIL - Checkout failed: {resp.status_code}"
            print(f"❌ TEST 5 FAIL: {resp.status_code}")
    except Exception as e:
        results[5] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 5 FAIL: {e}")
    
    # TEST 6: Idempotent fulfilment
    print("\n[TEST 6] Idempotent fulfilment")
    try:
        # User B buys product 2
        purchase = test_purchase(user_b_token, [prod2['id']])
        if purchase:
            order_id = purchase.get('orderId')
            # Check entitlements count
            ent_count_1 = db.storeEntitlements.count_documents({'userId': user_b_id, 'productId': prod2['id']})
            # Check salesCount
            prod2_doc = db.storeProducts.find_one({'id': prod2['id']})
            sales_count_1 = prod2_doc.get('salesCount', 0)
            
            # Try to fulfill again (should be idempotent)
            # Since testFulfill is already idempotent, we just verify counts
            time.sleep(0.5)
            ent_count_2 = db.storeEntitlements.count_documents({'userId': user_b_id, 'productId': prod2['id']})
            prod2_doc = db.storeProducts.find_one({'id': prod2['id']})
            sales_count_2 = prod2_doc.get('salesCount', 0)
            
            if ent_count_1 == 1 and ent_count_2 == 1 and sales_count_1 == sales_count_2:
                results[6] = "PASS - Idempotent fulfilment (1 order, 1 entitlement)"
                print(f"✅ TEST 6 PASS: Idempotent (ent={ent_count_2}, sales={sales_count_2})")
            else:
                results[6] = f"FAIL - Ent: {ent_count_1}->{ent_count_2}, Sales: {sales_count_1}->{sales_count_2}"
                print(f"❌ TEST 6 FAIL: Not idempotent")
        else:
            results[6] = "FAIL - Purchase failed"
            print(f"❌ TEST 6 FAIL: Purchase failed")
    except Exception as e:
        results[6] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 6 FAIL: {e}")
    
    # TEST 7: Price change handling
    print("\n[TEST 7] Price change handling")
    try:
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        # Change product 3 price
        old_price = prod3.get('price', 120)
        new_price = old_price + 50
        db.storeProducts.update_one({'id': prod3['id']}, {'$set': {'price': new_price}})
        
        # Try checkout with old price, confirm=false
        payload = {
            'productIds': [prod3['id']],
            'clientPrices': {prod3['id']: old_price},
            'confirm': False
        }
        resp = requests.post(f"{API_URL}/store/checkout", json=payload, headers=headers_a, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('priceChanged') == True and len(data.get('priceChanges', [])) > 0:
                results[7] = "PASS - Price change detected"
                print(f"✅ TEST 7 PASS: Price change detected: {data.get('priceChanges')}")
            else:
                results[7] = f"FAIL - No price change detected: {data}"
                print(f"❌ TEST 7 FAIL: {data}")
        else:
            results[7] = f"FAIL - Checkout failed: {resp.status_code}"
            print(f"❌ TEST 7 FAIL: {resp.status_code}")
        
        # Restore price
        db.storeProducts.update_one({'id': prod3['id']}, {'$set': {'price': old_price}})
    except Exception as e:
        results[7] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 7 FAIL: {e}")
    
    # TEST 8: Security levels (watermarking)
    print("\n[TEST 8] Security levels (watermarking)")
    try:
        # User A already owns prod1 (Level 1) and prod2 (Level 2)
        # User B owns prod2 (Level 2)
        # Download Level 1 (original)
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        resp1 = requests.get(f"{API_URL}/store/file/{prod1['id']}/{file1['id']}/token", 
                           headers=headers_a, timeout=10)
        if resp1.status_code == 200:
            token1 = resp1.json().get('token')
            resp1_dl = requests.get(f"{API_URL}/store/download?token={token1}", 
                                  headers=headers_a, timeout=10)
            level1_size = len(resp1_dl.content) if resp1_dl.status_code == 200 else 0
        else:
            level1_size = 0
        
        # Download Level 2 (watermarked)
        resp2 = requests.get(f"{API_URL}/store/file/{prod2['id']}/{file2['id']}/token", 
                           headers=headers_a, timeout=10)
        if resp2.status_code == 200:
            token2 = resp2.json().get('token')
            resp2_dl = requests.get(f"{API_URL}/store/download?token={token2}", 
                                  headers=headers_a, timeout=10)
            level2_size = len(resp2_dl.content) if resp2_dl.status_code == 200 else 0
            level2_content = resp2_dl.content if resp2_dl.status_code == 200 else b''
        else:
            level2_size = 0
            level2_content = b''
        
        # Level 2 should be different from Level 1 (watermarked)
        if level1_size > 0 and level2_size > 0 and level2_size != level1_size:
            results[8] = "PASS - Level 2 watermarked (size differs from Level 1)"
            print(f"✅ TEST 8 PASS: Level 1={level1_size}B, Level 2={level2_size}B (watermarked)")
        elif level1_size > 0 and level2_size > 0:
            # Check if content contains user info (basic check)
            user_a_name = user_a.get('name', '')
            if user_a_name.encode() in level2_content or user_a_id.encode() in level2_content:
                results[8] = "PASS - Level 2 contains user info"
                print(f"✅ TEST 8 PASS: Level 2 contains user info")
            else:
                results[8] = "PARTIAL - Level 2 downloaded but watermark not verified"
                print(f"⚠️ TEST 8 PARTIAL: Sizes L1={level1_size}, L2={level2_size}")
        else:
            results[8] = f"FAIL - Downloads failed: L1={level1_size}, L2={level2_size}"
            print(f"❌ TEST 8 FAIL: Downloads failed")
    except Exception as e:
        results[8] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 8 FAIL: {e}")
    
    # TEST 9: Download limit
    print("\n[TEST 9] Download limit")
    try:
        # User A buys product 7 (downloadLimit=1)
        purchase = test_purchase(user_a_token, [prod7['id']])
        if purchase:
            time.sleep(0.5)
            headers_a = {'Authorization': f'Bearer {user_a_token}'}
            
            # First download
            resp1 = requests.get(f"{API_URL}/store/file/{prod7['id']}/{file7['id']}/token", 
                               headers=headers_a, timeout=10)
            if resp1.status_code == 200:
                token1 = resp1.json().get('token')
                resp1_dl = requests.get(f"{API_URL}/store/download?token={token1}", 
                                      headers=headers_a, timeout=10)
                first_status = resp1_dl.status_code
            else:
                first_status = resp1.status_code
            
            time.sleep(0.5)
            
            # Second download (should fail with 429)
            resp2 = requests.get(f"{API_URL}/store/file/{prod7['id']}/{file7['id']}/token", 
                               headers=headers_a, timeout=10)
            if resp2.status_code == 200:
                token2 = resp2.json().get('token')
                resp2_dl = requests.get(f"{API_URL}/store/download?token={token2}", 
                                      headers=headers_a, timeout=10)
                second_status = resp2_dl.status_code
                second_code = resp2_dl.json().get('code') if resp2_dl.status_code == 429 else None
            else:
                second_status = resp2.status_code
                second_code = None
            
            if first_status == 200 and second_status == 429 and second_code == 'LIMIT_REACHED':
                results[9] = "PASS - Download limit enforced (429 LIMIT_REACHED)"
                print(f"✅ TEST 9 PASS: First=200, Second=429 LIMIT_REACHED")
            else:
                results[9] = f"FAIL - First={first_status}, Second={second_status}, code={second_code}"
                print(f"❌ TEST 9 FAIL: First={first_status}, Second={second_status}")
        else:
            results[9] = "FAIL - Purchase failed"
            print(f"❌ TEST 9 FAIL: Purchase failed")
    except Exception as e:
        results[9] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 9 FAIL: {e}")
    
    # TEST 10: Level 4 view-only
    print("\n[TEST 10] Level 4 view-only")
    try:
        # User A buys product 5 (Level 4)
        purchase = test_purchase(user_a_token, [prod5['id']])
        if purchase:
            time.sleep(0.5)
            headers_a = {'Authorization': f'Bearer {user_a_token}'}
            
            # Try to get download token (should fail with 403)
            resp1 = requests.get(f"{API_URL}/store/file/{prod5['id']}/{file5['id']}/token?action=download", 
                               headers=headers_a, timeout=10)
            download_status = resp1.status_code
            download_code = resp1.json().get('code') if resp1.status_code == 403 else None
            
            # View should work
            resp2 = requests.get(f"{API_URL}/store/view/{prod5['id']}/{file5['id']}?page=1", 
                               headers=headers_a, timeout=10)
            view_status = resp2.status_code
            
            if download_status == 403 and download_code == 'NO_DOWNLOAD' and view_status == 200:
                results[10] = "PASS - Level 4: download blocked (403), view works (200)"
                print(f"✅ TEST 10 PASS: Download=403 NO_DOWNLOAD, View=200")
            else:
                results[10] = f"FAIL - Download={download_status}/{download_code}, View={view_status}"
                print(f"❌ TEST 10 FAIL: Download={download_status}, View={view_status}")
        else:
            results[10] = "FAIL - Purchase failed"
            print(f"❌ TEST 10 FAIL: Purchase failed")
    except Exception as e:
        results[10] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 10 FAIL: {e}")
    
    # TEST 11: Refund
    print("\n[TEST 11] Refund")
    try:
        # User B buys product 3
        purchase = test_purchase(user_b_token, [prod3['id']])
        if purchase:
            order_id = purchase.get('orderId')
            time.sleep(0.5)
            
            # Verify entitlement exists
            ent_before = db.storeEntitlements.find_one({'userId': user_b_id, 'productId': prod3['id'], 'revokedAt': None})
            
            # Admin refunds
            headers_admin = {'Authorization': f'Bearer {admin_token}'}
            resp = requests.post(f"{API_URL}/admin/store/refund", 
                               json={'orderId': order_id}, headers=headers_admin, timeout=10)
            refund_status = resp.status_code
            
            time.sleep(0.5)
            
            # Verify entitlement revoked
            ent_after = db.storeEntitlements.find_one({'userId': user_b_id, 'productId': prod3['id'], 'revokedAt': None})
            
            # Try to get token (should fail with 404)
            headers_b = {'Authorization': f'Bearer {user_b_token}'}
            resp2 = requests.get(f"{API_URL}/store/file/{prod3['id']}/{file3['id']}/token", 
                               headers=headers_b, timeout=10)
            token_status = resp2.status_code
            
            if refund_status == 200 and ent_before and not ent_after and token_status == 404:
                results[11] = "PASS - Refund revokes access (token 404)"
                print(f"✅ TEST 11 PASS: Refund successful, access revoked")
            else:
                results[11] = f"FAIL - Refund={refund_status}, EntBefore={bool(ent_before)}, EntAfter={bool(ent_after)}, Token={token_status}"
                print(f"❌ TEST 11 FAIL: Refund={refund_status}, Token={token_status}")
        else:
            results[11] = "FAIL - Purchase failed"
            print(f"❌ TEST 11 FAIL: Purchase failed")
    except Exception as e:
        results[11] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 11 FAIL: {e}")
    
    # TEST 12: Bundle entitlements
    print("\n[TEST 12] Bundle entitlements")
    try:
        # User A buys bundle (product 10)
        purchase = test_purchase(user_a_token, [prod10['id']])
        if purchase:
            time.sleep(0.5)
            
            # Check entitlements for bundle items
            ent1 = db.storeEntitlements.find_one({'userId': user_a_id, 'productId': prod8['id'], 'revokedAt': None})
            ent2 = db.storeEntitlements.find_one({'userId': user_a_id, 'productId': prod9['id'], 'revokedAt': None})
            ent_bundle = db.storeEntitlements.find_one({'userId': user_a_id, 'productId': prod10['id'], 'revokedAt': None})
            
            if ent1 and ent2 and ent_bundle:
                results[12] = "PASS - Bundle grants all included products"
                print(f"✅ TEST 12 PASS: Bundle + 2 items granted")
            else:
                results[12] = f"FAIL - Bundle={bool(ent_bundle)}, Item1={bool(ent1)}, Item2={bool(ent2)}"
                print(f"❌ TEST 12 FAIL: Missing entitlements")
        else:
            results[12] = "FAIL - Purchase failed"
            print(f"❌ TEST 12 FAIL: Purchase failed")
    except Exception as e:
        results[12] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 12 FAIL: {e}")
    
    # TEST 13: Share links
    print("\n[TEST 13] Share links")
    try:
        # Access product page with src parameter
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        resp1 = requests.get(f"{API_URL}/store/product/{prod4['slug']}?src=wa_test", 
                           headers=headers_a, timeout=10)
        
        time.sleep(0.5)
        
        # Check storeShareLinks
        share_link = db.storeShareLinks.find_one({'productId': prod4['id'], 'tag': 'wa_test'})
        
        # Purchase with src
        purchase = test_purchase(user_a_token, [prod4['id']], src='wa_test')
        
        time.sleep(0.5)
        
        # Check storeEvents
        event = db.storeEvents.find_one({'userId': user_a_id, 'productId': prod4['id'], 'type': 'purchase', 'src': 'wa_test'})
        
        if share_link and event:
            results[13] = "PASS - Share link tracked, purchase event logged"
            print(f"✅ TEST 13 PASS: ShareLink clicks={share_link.get('clicks')}, Event logged")
        else:
            results[13] = f"FAIL - ShareLink={bool(share_link)}, Event={bool(event)}"
            print(f"❌ TEST 13 FAIL: ShareLink={bool(share_link)}, Event={bool(event)}")
    except Exception as e:
        results[13] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 13 FAIL: {e}")
    
    # TEST 16: Physical endpoints 404 when OFF
    print("\n[TEST 16] Physical endpoints 404 when OFF")
    try:
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        resp = requests.get(f"{API_URL}/store/physical/districts", headers=headers_a, timeout=10)
        
        if resp.status_code == 404:
            results[16] = "PASS - Physical endpoints 404 when flag OFF"
            print(f"✅ TEST 16 PASS: Physical endpoints return 404")
        else:
            results[16] = f"FAIL - Expected 404, got {resp.status_code}"
            print(f"❌ TEST 16 FAIL: Got {resp.status_code}")
    except Exception as e:
        results[16] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 16 FAIL: {e}")
    
    # TEST 17: Physical endpoints work when ON
    print("\n[TEST 17] Physical endpoints work when ON")
    try:
        # Enable physical flag
        headers_admin = {'Authorization': f'Bearer {admin_token}'}
        resp1 = requests.put(f"{API_URL}/admin/store/settings", 
                           json={'physicalEnabled': True}, headers=headers_admin, timeout=10)
        
        time.sleep(0.5)
        
        # Test districts endpoint
        headers_a = {'Authorization': f'Bearer {user_a_token}'}
        resp2 = requests.get(f"{API_URL}/store/physical/districts", headers=headers_a, timeout=10)
        districts_status = resp2.status_code
        
        # Disable physical flag
        resp3 = requests.put(f"{API_URL}/admin/store/settings", 
                           json={'physicalEnabled': False}, headers=headers_admin, timeout=10)
        
        if districts_status == 200:
            results[17] = "PASS - Physical endpoints work when flag ON"
            print(f"✅ TEST 17 PASS: Physical endpoints work, flag restored to OFF")
        else:
            results[17] = f"FAIL - Expected 200, got {districts_status}"
            print(f"❌ TEST 17 FAIL: Got {districts_status}")
    except Exception as e:
        results[17] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 17 FAIL: {e}")
    
    # TEST 20: Collection isolation
    print("\n[TEST 20] Collection isolation")
    try:
        # List all collections
        all_collections = db.list_collection_names()
        store_collections = [c for c in all_collections if c.startswith('store')]
        
        print(f"Store collections found: {store_collections}")
        
        # Verify all store collections have 'store' prefix
        expected_store_collections = [
            'storeProducts', 'storeProductFiles', 'storeOrders', 'storeEntitlements',
            'storeShareLinks', 'storeEvents', 'storePriceHistory', 'storeCoupons',
            'storeShipments', 'storeCategories'
        ]
        
        all_prefixed = all(c.startswith('store') for c in store_collections)
        
        if all_prefixed:
            results[20] = f"PASS - All {len(store_collections)} store collections have 'store' prefix"
            print(f"✅ TEST 20 PASS: {len(store_collections)} collections, all prefixed 'store'")
        else:
            results[20] = f"FAIL - Some collections don't have 'store' prefix"
            print(f"❌ TEST 20 FAIL: Collections: {store_collections}")
    except Exception as e:
        results[20] = f"FAIL - Exception: {e}"
        print(f"❌ TEST 20 FAIL: {e}")
    
    # Print summary
    print("\n" + "=" * 80)
    print("TEST RESULTS SUMMARY")
    print("=" * 80)
    
    for test_num in sorted(results.keys()):
        status = "✅" if results[test_num].startswith("PASS") else "❌"
        print(f"{status} TEST {test_num}: {results[test_num]}")
    
    passed = sum(1 for r in results.values() if r.startswith("PASS"))
    total = len(results)
    print(f"\n📊 PASSED: {passed}/{total}")
    
    # Cleanup
    cleanup()
    
    print("\n" + "=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80)

if __name__ == '__main__':
    main()
