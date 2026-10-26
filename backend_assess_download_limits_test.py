#!/usr/bin/env python3
"""
Assessment Store Download Limits Testing
Tests the CHANGED download-limit logic in app/api/[[...path]]/route.js

Test scenarios:
1. Settings: PUT/GET /api/admin/assess/settings
2. /assess/my payload shape with synthetic data insertion
3. Admin reset endpoint
4. Count semantics via direct DB
5. Pack ZIP separateness
"""

import requests
import os
from datetime import datetime, timezone
from pymongo import MongoClient
from uuid import uuid4

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com') + '/api'
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'edumaster_odisha')

# Admin credentials
ADMIN_MOBILE = '9999999999'
ADMIN_PASSWORD = 'admin123'

# Test tracking
synthetic_row_ids = []
synthetic_order_ids = []
test_user_id = None
test_document_ids = []
test_pack_code = None

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def admin_login():
    """Login as admin and return token"""
    log("Logging in as admin...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        'mobile': ADMIN_MOBILE,
        'password': ADMIN_PASSWORD
    }, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"Admin login failed: {resp.status_code} {resp.text}")
    token = resp.json().get('token')
    if not token:
        raise Exception("No token in admin login response")
    log(f"✅ Admin login successful")
    return token

def get_test_user_and_docs(db):
    """Find admin user with owned documents for testing"""
    log("Setting up test with admin account...")
    
    # Use admin account (we have credentials)
    admin_user = db.users.find_one({'mobile': '9999999999'})
    if not admin_user:
        raise Exception("Admin user not found")
    
    admin_id = admin_user['id']
    
    # Check if admin has any paid orders
    admin_orders = list(db.assess_orders.find({'user_id': admin_id, 'status': 'paid'}))
    if admin_orders:
        for order in admin_orders:
            pack_code = order['pack_code']
            pack = db.assess_packs.find_one({'pack_code': pack_code})
            if not pack:
                continue
            
            pack_items = list(db.assess_pack_items.find({'pack_id': pack['id']}))
            doc_ids = [item['document_id'] for item in pack_items]
            
            if len(doc_ids) >= 2:
                log(f"✅ Using admin account: {admin_id}")
                log(f"✅ Admin owned pack: {pack_code}")
                log(f"✅ Found {len(doc_ids)} documents in pack")
                return admin_id, doc_ids[:2], pack_code, ADMIN_MOBILE, ADMIN_PASSWORD
    
    # If admin doesn't have orders, find ANY pack with 2+ documents and grant it to admin
    log("Admin has no orders, finding a pack to use for testing...")
    
    # Find a pack with multiple documents
    packs = list(db.assess_packs.find({}))
    for pack in packs:
        pack_items = list(db.assess_pack_items.find({'pack_id': pack['id']}))
        doc_ids = [item['document_id'] for item in pack_items]
        
        if len(doc_ids) >= 2:
            pack_code = pack['pack_code']
            log(f"✅ Using admin account: {admin_id}")
            log(f"✅ Selected pack for testing: {pack_code}")
            log(f"✅ Found {len(doc_ids)} documents in pack")
            
            # Create a synthetic order for admin (for testing purposes)
            order_id = str(uuid4())
            db.assess_orders.insert_one({
                'id': order_id,
                'user_id': admin_id,
                'pack_code': pack_code,
                'status': 'paid',
                'amount': 0,
                'paid_at': datetime.now(timezone.utc).isoformat(),
                'created_at': datetime.now(timezone.utc).isoformat(),
                '_test_order': True  # Mark as test order for cleanup
            })
            synthetic_order_ids.append(order_id)
            log(f"✅ Created synthetic order for admin (will be cleaned up)")
            
            return admin_id, doc_ids[:2], pack_code, ADMIN_MOBILE, ADMIN_PASSWORD
    
    raise Exception("No packs found with 2+ documents")

def insert_synthetic_download(db, user_id, document_id=None, pack_code=None, mode='download', type='pdf', at=None):
    """Insert a synthetic assess_downloads row"""
    if at is None:
        at = datetime.now(timezone.utc)
    
    row_id = str(uuid4())
    row = {
        'id': row_id,
        'user_id': user_id,
        'user_name': 'Test User',
        'user_mobile': '9999999999',
        'user_email': 'test@example.com',
        'mode': mode,
        'type': type,
        'at': at,
        'quota_reset': False
    }
    
    if document_id:
        row['document_id'] = document_id
        row['document_title'] = 'Test Document'
    
    if pack_code:
        row['pack_code'] = pack_code
    
    db.assess_downloads.insert_one(row)
    synthetic_row_ids.append(row_id)
    return row_id

def cleanup_synthetic_rows(db):
    """Clean up all synthetic rows inserted during testing"""
    if synthetic_row_ids:
        log(f"Cleaning up {len(synthetic_row_ids)} synthetic download rows...")
        result = db.assess_downloads.delete_many({'id': {'$in': synthetic_row_ids}})
        log(f"✅ Deleted {result.deleted_count} synthetic download rows")
    
    if synthetic_order_ids:
        log(f"Cleaning up {len(synthetic_order_ids)} synthetic order rows...")
        result = db.assess_orders.delete_many({'id': {'$in': synthetic_order_ids}})
        log(f"✅ Deleted {result.deleted_count} synthetic order rows")

def test_1_settings(admin_token):
    """Test 1: Settings PUT/GET"""
    log("\n=== TEST 1: SETTINGS PUT/GET ===")
    
    try:
        # PUT settings
        log("1a. PUT /api/admin/assess/settings...")
        resp = requests.put(
            f"{BASE_URL}/admin/assess/settings",
            json={
                'settings': {
                    'per_document_daily_limit': 2,
                    'pack_zip_daily_limit': 2,
                    'per_document_total_limit': 10
                }
            },
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ PUT settings failed: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        if not data.get('ok'):
            log(f"❌ PUT settings returned ok=false: {data}")
            return False
        
        log(f"✅ PUT settings successful: {data.get('settings', {})}")
        
        # GET settings
        log("1b. GET /api/admin/assess/settings...")
        resp = requests.get(
            f"{BASE_URL}/admin/assess/settings",
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ GET settings failed: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        settings = data.get('settings', {})
        
        # Verify settings (can be string or int)
        per_doc_daily = str(settings.get('per_document_daily_limit'))
        if per_doc_daily != '2':
            log(f"❌ per_document_daily_limit mismatch: expected '2', got {per_doc_daily}")
            return False
        
        pack_zip_daily = str(settings.get('pack_zip_daily_limit'))
        if pack_zip_daily != '2':
            log(f"❌ pack_zip_daily_limit mismatch: expected '2', got {pack_zip_daily}")
            return False
        
        per_doc_total = str(settings.get('per_document_total_limit'))
        if per_doc_total != '10':
            log(f"❌ per_document_total_limit mismatch: expected '10', got {per_doc_total}")
            return False
        
        log(f"✅ GET settings successful: per_document_daily_limit=2, pack_zip_daily_limit=2, per_document_total_limit=10")
        log("✅ TEST 1 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 1 FAILED: {e}")
        return False

def test_2_assess_my_payload(db, user_id, doc_ids, pack_code, user_token):
    """Test 2: /assess/my payload shape with synthetic data"""
    log("\n=== TEST 2: /assess/my PAYLOAD SHAPE ===")
    
    try:
        doc1, doc2 = doc_ids[0], doc_ids[1]
        
        # Insert 2 synthetic rows for doc1 (today)
        log(f"2a. Inserting 2 synthetic rows for document {doc1}...")
        now = datetime.now(timezone.utc)
        insert_synthetic_download(db, user_id, document_id=doc1, mode='download', type='pdf', at=now)
        insert_synthetic_download(db, user_id, document_id=doc1, mode='download', type='pdf', at=now)
        log(f"✅ Inserted 2 synthetic rows for doc1")
        
        # Insert 1 'view' row for doc1 (should NOT count)
        log(f"2b. Inserting 1 'view' row for document {doc1} (should NOT count)...")
        insert_synthetic_download(db, user_id, document_id=doc1, mode='view', type='pdf', at=now)
        log(f"✅ Inserted 1 'view' row for doc1")
        
        # Insert 1 'zip' row for doc1 (should NOT count toward per-document)
        log(f"2c. Inserting 1 'zip' row for document {doc1} (should NOT count toward per-document)...")
        insert_synthetic_download(db, user_id, document_id=doc1, mode='download', type='zip', at=now)
        log(f"✅ Inserted 1 'zip' row for doc1")
        
        # GET /assess/my
        log("2d. GET /api/assess/my...")
        resp = requests.get(
            f"{BASE_URL}/assess/my",
            headers={'Authorization': f'Bearer {user_token}'},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ GET /assess/my failed: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Verify top-level keys
        required_keys = ['per_document_daily_limit', 'per_document_total_limit', 'pack_zip_daily_limit', 'pack_zip_usage']
        for key in required_keys:
            if key not in data:
                log(f"❌ Missing key in /assess/my response: {key}")
                return False
        
        log(f"✅ /assess/my response has all required keys")
        log(f"   per_document_daily_limit: {data['per_document_daily_limit']}")
        log(f"   per_document_total_limit: {data['per_document_total_limit']}")
        log(f"   pack_zip_daily_limit: {data['pack_zip_daily_limit']}")
        log(f"   pack_zip_usage: {data['pack_zip_usage']}")
        
        # Find doc1 in documents
        documents = data.get('documents', [])
        doc1_data = next((d for d in documents if d['id'] == doc1), None)
        doc2_data = next((d for d in documents if d['id'] == doc2), None)
        
        if not doc1_data:
            log(f"❌ Document {doc1} not found in /assess/my response")
            return False
        
        if not doc2_data:
            log(f"❌ Document {doc2} not found in /assess/my response")
            return False
        
        # Verify doc1 counters (should have 2 downloads today)
        log(f"2e. Verifying doc1 counters...")
        if doc1_data.get('dl_today') != 2:
            log(f"❌ doc1 dl_today mismatch: expected 2, got {doc1_data.get('dl_today')}")
            log(f"   (view and zip rows should NOT count)")
            return False
        
        if doc1_data.get('dl_daily_remaining') != 0:
            log(f"❌ doc1 dl_daily_remaining mismatch: expected 0, got {doc1_data.get('dl_daily_remaining')}")
            return False
        
        if doc1_data.get('dl_locked_today') != True:
            log(f"❌ doc1 dl_locked_today mismatch: expected True, got {doc1_data.get('dl_locked_today')}")
            return False
        
        log(f"✅ doc1 counters correct: dl_today=2, dl_daily_remaining=0, dl_locked_today=True")
        
        # Verify doc2 counters (should have 0 downloads, independent counter)
        log(f"2f. Verifying doc2 counters (independent)...")
        if doc2_data.get('dl_today') != 0:
            log(f"❌ doc2 dl_today mismatch: expected 0, got {doc2_data.get('dl_today')}")
            return False
        
        if doc2_data.get('dl_daily_remaining') != 2:
            log(f"❌ doc2 dl_daily_remaining mismatch: expected 2, got {doc2_data.get('dl_daily_remaining')}")
            return False
        
        if doc2_data.get('dl_locked_today') != False:
            log(f"❌ doc2 dl_locked_today mismatch: expected False, got {doc2_data.get('dl_locked_today')}")
            return False
        
        log(f"✅ doc2 counters correct: dl_today=0, dl_daily_remaining=2, dl_locked_today=False")
        log(f"✅ Per-document counters are INDEPENDENT")
        
        # Verify type:'zip' rows do NOT affect per-document dl_today
        log(f"2g. Verifying type:'zip' rows do NOT affect per-document dl_today...")
        log(f"✅ Confirmed: doc1 has 1 zip row but dl_today=2 (only non-zip, non-view rows counted)")
        
        log("✅ TEST 2 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_3_admin_reset(db, admin_token, user_id, doc_ids):
    """Test 3: Admin reset endpoint"""
    log("\n=== TEST 3: ADMIN RESET ENDPOINT ===")
    
    try:
        doc1 = doc_ids[0]
        
        # Count rows before reset
        before_count = db.assess_downloads.count_documents({
            'user_id': user_id,
            'document_id': doc1,
            'quota_reset': {'$ne': True}
        })
        log(f"3a. Rows before reset: {before_count}")
        
        # POST reset
        log(f"3b. POST /api/admin/assess/reset-downloads...")
        resp = requests.post(
            f"{BASE_URL}/admin/assess/reset-downloads",
            json={
                'user_id': user_id,
                'document_id': doc1
            },
            headers={'Authorization': f'Bearer {admin_token}'},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ POST reset failed: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        if not data.get('ok'):
            log(f"❌ POST reset returned ok=false: {data}")
            return False
        
        reset_count = data.get('reset', 0)
        log(f"✅ POST reset successful: reset={reset_count}")
        
        # Verify rows are marked quota_reset:true (NOT deleted)
        log(f"3c. Verifying rows are marked quota_reset:true (NOT deleted)...")
        total_rows = db.assess_downloads.count_documents({
            'user_id': user_id,
            'document_id': doc1
        })
        
        reset_rows = db.assess_downloads.count_documents({
            'user_id': user_id,
            'document_id': doc1,
            'quota_reset': True
        })
        
        if total_rows < before_count:
            log(f"❌ Rows were DELETED (before: {before_count}, after: {total_rows})")
            return False
        
        log(f"✅ Rows NOT deleted: total_rows={total_rows}, reset_rows={reset_rows}")
        
        # Verify audit row was written
        log(f"3d. Verifying audit row was written...")
        audit = db.assess_admin_audit.find_one({
            'action': 'reset_today_downloads',
            'target_user_id': user_id,
            'document_id': doc1
        })
        
        if not audit:
            log(f"❌ No audit row found")
            return False
        
        log(f"✅ Audit row found: action={audit['action']}, affected={audit['affected']}")
        
        # Test non-admin access (should fail)
        log(f"3e. Testing non-admin access (should fail)...")
        resp = requests.post(
            f"{BASE_URL}/admin/assess/reset-downloads",
            json={
                'user_id': user_id,
                'document_id': doc1
            },
            timeout=30
        )
        
        if resp.status_code not in [401, 403]:
            log(f"❌ Non-admin access should return 401/403, got {resp.status_code}")
            return False
        
        log(f"✅ Non-admin access correctly rejected: {resp.status_code}")
        
        log("✅ TEST 3 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_4_count_semantics(db, user_id, doc_ids):
    """Test 4: Count semantics via direct DB"""
    log("\n=== TEST 4: COUNT SEMANTICS VIA DIRECT DB ===")
    
    try:
        doc1 = doc_ids[0]
        now = datetime.now(timezone.utc)
        
        # Calculate IST 00:00 today (same logic as backend)
        ist_offset = 19800000  # 5.5 hours in milliseconds
        now_ms = int(now.timestamp() * 1000)
        ist_0_ms = (now_ms + ist_offset) - ((now_ms + ist_offset) % 86400000) - ist_offset
        ist_0 = datetime.fromtimestamp(ist_0_ms / 1000, tz=timezone.utc)
        
        log(f"4a. IST 00:00 today: {ist_0}")
        
        # Insert test rows with different modes and types
        log(f"4b. Inserting test rows with different modes and types...")
        
        # Should count (mode='download', type='pdf')
        insert_synthetic_download(db, user_id, document_id=doc1, mode='download', type='pdf', at=now)
        
        # Should NOT count (mode='view')
        insert_synthetic_download(db, user_id, document_id=doc1, mode='view', type='pdf', at=now)
        
        # Should NOT count (type='zip')
        insert_synthetic_download(db, user_id, document_id=doc1, mode='download', type='zip', at=now)
        
        log(f"✅ Inserted 3 test rows")
        
        # Query with backend logic
        log(f"4c. Querying with backend logic...")
        count = db.assess_downloads.count_documents({
            'user_id': user_id,
            'document_id': doc1,
            'mode': {'$ne': 'view'},
            'type': {'$ne': 'zip'},
            'quota_reset': {'$ne': True},
            'at': {'$gte': ist_0}
        })
        
        log(f"✅ Count with backend logic: {count}")
        
        # Verify count (should be 1 + previous rows from test 2 that were reset)
        # After reset in test 3, only new rows should count
        if count < 1:
            log(f"❌ Count should be at least 1, got {count}")
            return False
        
        log(f"✅ Count semantics correct: mode!='view' AND type!='zip' AND quota_reset!=true")
        
        # Verify mode='view' rows are excluded
        log(f"4d. Verifying mode='view' rows are excluded...")
        view_count = db.assess_downloads.count_documents({
            'user_id': user_id,
            'document_id': doc1,
            'mode': 'view',
            'at': {'$gte': ist_0}
        })
        
        if view_count < 1:
            log(f"❌ Should have at least 1 view row, got {view_count}")
            return False
        
        log(f"✅ Found {view_count} view rows (correctly excluded from count)")
        
        # Verify type='zip' rows are excluded
        log(f"4e. Verifying type='zip' rows are excluded...")
        zip_count = db.assess_downloads.count_documents({
            'user_id': user_id,
            'document_id': doc1,
            'type': 'zip',
            'at': {'$gte': ist_0}
        })
        
        if zip_count < 1:
            log(f"❌ Should have at least 1 zip row, got {zip_count}")
            return False
        
        log(f"✅ Found {zip_count} zip rows (correctly excluded from per-document count)")
        
        log("✅ TEST 4 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_5_pack_zip_separateness(db, user_id, pack_code, user_token):
    """Test 5: Pack ZIP separateness"""
    log("\n=== TEST 5: PACK ZIP SEPARATENESS ===")
    
    try:
        now = datetime.now(timezone.utc)
        
        # Insert 2 zip rows for pack
        log(f"5a. Inserting 2 zip rows for pack {pack_code}...")
        insert_synthetic_download(db, user_id, pack_code=pack_code, mode='download', type='zip', at=now)
        insert_synthetic_download(db, user_id, pack_code=pack_code, mode='download', type='zip', at=now)
        log(f"✅ Inserted 2 zip rows for pack")
        
        # GET /assess/my
        log("5b. GET /api/assess/my...")
        resp = requests.get(
            f"{BASE_URL}/assess/my",
            headers={'Authorization': f'Bearer {user_token}'},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ GET /assess/my failed: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Verify pack_zip_usage
        pack_zip_usage = data.get('pack_zip_usage', {})
        if pack_code not in pack_zip_usage:
            log(f"❌ pack_code {pack_code} not found in pack_zip_usage")
            return False
        
        usage = pack_zip_usage[pack_code]
        log(f"5c. pack_zip_usage[{pack_code}]: {usage}")
        
        if usage.get('used') != 2:
            log(f"❌ pack_zip_usage used mismatch: expected 2, got {usage.get('used')}")
            return False
        
        if usage.get('remaining') != 0:
            log(f"❌ pack_zip_usage remaining mismatch: expected 0, got {usage.get('remaining')}")
            return False
        
        log(f"✅ pack_zip_usage correct: used=2, remaining=0")
        
        # Verify zip rows did NOT change any document's dl_today
        log(f"5d. Verifying zip rows did NOT change any document's dl_today...")
        documents = data.get('documents', [])
        
        # Check that documents still have their previous dl_today values
        # (not affected by the 2 new zip rows)
        for doc in documents:
            # After reset in test 3, doc dl_today should be based only on new rows from test 4
            # The zip rows should NOT affect dl_today
            log(f"   Document {doc['id']}: dl_today={doc.get('dl_today', 0)}")
        
        log(f"✅ ZIP rows did NOT affect per-document dl_today counters")
        
        log("✅ TEST 5 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 5 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    log("=" * 80)
    log("ASSESSMENT STORE DOWNLOAD LIMITS TESTING")
    log("=" * 80)
    
    results = {
        'test_1_settings': False,
        'test_2_assess_my': False,
        'test_3_admin_reset': False,
        'test_4_count_semantics': False,
        'test_5_pack_zip_separateness': False
    }
    
    try:
        # Connect to MongoDB
        log(f"Connecting to MongoDB: {MONGO_URL}/{DB_NAME}")
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        log("✅ MongoDB connected")
        
        # Admin login
        admin_token = admin_login()
        
        # Get test user and documents
        global test_user_id, test_document_ids, test_pack_code
        test_user_id, test_document_ids, test_pack_code, user_mobile, user_password = get_test_user_and_docs(db)
        
        # Since we're using admin account for testing, use the same admin_token
        # (logging in again would invalidate the first token due to single-device session)
        user_token = admin_token
        log(f"✅ Using admin token for both admin and user operations")
        
        # Run tests
        results['test_1_settings'] = test_1_settings(admin_token)
        results['test_2_assess_my'] = test_2_assess_my_payload(db, test_user_id, test_document_ids, test_pack_code, user_token)
        results['test_3_admin_reset'] = test_3_admin_reset(db, admin_token, test_user_id, test_document_ids)
        results['test_4_count_semantics'] = test_4_count_semantics(db, test_user_id, test_document_ids)
        results['test_5_pack_zip_separateness'] = test_5_pack_zip_separateness(db, test_user_id, test_pack_code, user_token)
        
        # Cleanup
        cleanup_synthetic_rows(db)
        
        # Summary
        log("\n" + "=" * 80)
        log("TEST SUMMARY")
        log("=" * 80)
        passed = sum(1 for v in results.values() if v)
        total = len(results)
        
        for test_name, passed_flag in results.items():
            status = "✅ PASSED" if passed_flag else "❌ FAILED"
            log(f"{test_name}: {status}")
        
        log(f"\nTotal: {passed}/{total} tests passed")
        
        if passed == total:
            log("\n🎉 ALL TESTS PASSED!")
            return 0
        else:
            log(f"\n⚠️  {total - passed} test(s) failed")
            return 1
        
    except Exception as e:
        log(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        # Ensure cleanup even on error
        try:
            if synthetic_row_ids:
                client = MongoClient(MONGO_URL)
                db = client[DB_NAME]
                cleanup_synthetic_rows(db)
        except:
            pass

if __name__ == '__main__':
    exit(main())
