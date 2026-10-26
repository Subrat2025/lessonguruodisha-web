#!/usr/bin/env python3
"""
Backend test for three new features:
1. Section Uploader role
2. WhatsApp Bot - Auto-reply DISABLED
3. WhatsApp Campaign - inactive-99 offer
4. Special99 plan verification
"""

import requests
import json
import time
import random

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_section_uploader_role():
    """Test FEATURE 1: Section Uploader role"""
    print("\n" + "="*80)
    print("FEATURE 1: SECTION UPLOADER ROLE")
    print("="*80)
    
    # Login as admin
    print("\n[Test 1] Admin login...")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        if res.status_code != 200:
            # Try alternate admin
            res = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": "9999999999",
                "password": "admin123"
            }, timeout=10)
        assert res.status_code == 200, f"Admin login failed: {res.status_code} {res.text}"
        admin_token = res.json()["token"]
        print(f"✅ Admin login successful")
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return False
    
    # Create a fresh user for section_uploader role
    print("\n[Test 2] Create user for section_uploader role...")
    try:
        test_mobile = f"90{random.randint(10000000, 99999999)}"
        res = requests.post(f"{BASE_URL}/admin/users", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Section Uploader Test",
                "mobile": test_mobile,
                "password": "test123",
                "role": "user"  # Create as user first
            }, timeout=10)
        assert res.status_code == 200, f"User creation failed: {res.status_code} {res.text}"
        user_data = res.json()
        user_id = user_data.get("user", {}).get("id") or user_data.get("id")
        print(f"✅ User created: {test_mobile}, id={user_id}")
    except Exception as e:
        print(f"❌ User creation failed: {e}")
        return False
    
    # Assign section_uploader role
    print("\n[Test 3] Assign section_uploader role...")
    try:
        res = requests.put(f"{BASE_URL}/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "section_uploader"}, timeout=10)
        assert res.status_code == 200, f"Role assignment failed: {res.status_code} {res.text}"
        print(f"✅ Role assigned to section_uploader")
    except Exception as e:
        print(f"❌ Role assignment failed: {e}")
        return False
    
    # Verify role is saved correctly (not coerced to "user")
    print("\n[Test 4] Verify role is section_uploader (not coerced to user)...")
    try:
        res = requests.get(f"{BASE_URL}/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert res.status_code == 200, f"Get users failed: {res.status_code}"
        users = res.json().get("users", [])
        section_user = next((u for u in users if u.get("mobile") == test_mobile), None)
        assert section_user is not None, "User not found in users list"
        assert section_user.get("role") == "section_uploader", f"Role is {section_user.get('role')}, expected section_uploader"
        print(f"✅ Role verified: {section_user.get('role')} (not coerced to 'user')")
    except Exception as e:
        print(f"❌ Role verification failed: {e}")
        return False
    
    # Login as section_uploader
    print("\n[Test 5] Login as section_uploader...")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_mobile,
            "password": "test123"
        }, timeout=10)
        assert res.status_code == 200, f"Section uploader login failed: {res.status_code} {res.text}"
        section_token = res.json()["token"]
        print(f"✅ Section uploader login successful")
    except Exception as e:
        print(f"❌ Section uploader login failed: {e}")
        return False
    
    # Test GET /api/admin/sections - should be ALLOWED
    print("\n[Test 6] GET /api/admin/sections as section_uploader (should be 200)...")
    try:
        res = requests.get(f"{BASE_URL}/admin/sections",
            headers={"Authorization": f"Bearer {section_token}"}, timeout=10)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        print(f"✅ GET /admin/sections allowed (200)")
    except Exception as e:
        print(f"❌ GET /admin/sections test failed: {e}")
        return False
    
    # Test POST /api/admin/sections - should be ALLOWED
    print("\n[Test 7] POST /api/admin/sections as section_uploader (should be 200/201)...")
    try:
        # First get a valid lesson to use
        res = requests.get(f"{BASE_URL}/lessons?chapterId=any", timeout=10)
        lessons = res.json().get("lessons", [])
        if not lessons:
            print("⚠️  No lessons found, skipping POST test")
        else:
            lesson = lessons[0]
            res = requests.post(f"{BASE_URL}/admin/sections",
                headers={"Authorization": f"Bearer {section_token}"},
                json={
                    "section": "teacherNotes",
                    "classId": lesson.get("classId"),
                    "bookId": lesson.get("bookId"),
                    "chapterId": lesson.get("chapterId"),
                    "lessonId": lesson.get("id"),
                    "contentHtml": "<p>Test section content</p>",
                    "title": "Test Section"
                }, timeout=10)
            assert res.status_code in [200, 201], f"Expected 200/201, got {res.status_code}: {res.text}"
            print(f"✅ POST /admin/sections allowed ({res.status_code})")
    except Exception as e:
        print(f"❌ POST /admin/sections test failed: {e}")
        return False
    
    # Test DELETE /api/admin/sections/:id - should be ALLOWED
    print("\n[Test 8] DELETE /api/admin/sections/:id as section_uploader (should be 200/404)...")
    try:
        # Try to delete a non-existent section (should get 404, but not 403)
        res = requests.delete(f"{BASE_URL}/admin/sections/fake-id-12345",
            headers={"Authorization": f"Bearer {section_token}"}, timeout=10)
        assert res.status_code in [200, 404], f"Expected 200/404, got {res.status_code}: {res.text}"
        print(f"✅ DELETE /admin/sections allowed ({res.status_code})")
    except Exception as e:
        print(f"❌ DELETE /admin/sections test failed: {e}")
        return False
    
    # Test GET /api/admin/users - should be 403 (DENIED)
    print("\n[Test 9] GET /api/admin/users as section_uploader (should be 403)...")
    try:
        res = requests.get(f"{BASE_URL}/admin/users",
            headers={"Authorization": f"Bearer {section_token}"}, timeout=10)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print(f"✅ GET /admin/users denied (403)")
    except Exception as e:
        print(f"❌ GET /admin/users test failed: {e}")
        return False
    
    # Test GET /api/admin/analytics - should be 403 (DENIED)
    print("\n[Test 10] GET /api/admin/analytics as section_uploader (should be 403)...")
    try:
        res = requests.get(f"{BASE_URL}/admin/analytics",
            headers={"Authorization": f"Bearer {section_token}"}, timeout=10)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print(f"✅ GET /admin/analytics denied (403)")
    except Exception as e:
        print(f"❌ GET /admin/analytics test failed: {e}")
        return False
    
    # Test as normal user - /api/admin/sections should be 403
    print("\n[Test 11] Create normal user and test /api/admin/sections (should be 403)...")
    try:
        normal_mobile = f"91{random.randint(10000000, 99999999)}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Normal User",
            "mobile": normal_mobile,
            "password": "test123"
        }, timeout=10)
        assert res.status_code == 200, f"Normal user registration failed: {res.status_code}"
        normal_token = res.json()["token"]
        
        res = requests.get(f"{BASE_URL}/admin/sections",
            headers={"Authorization": f"Bearer {normal_token}"}, timeout=10)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print(f"✅ Normal user denied access to /admin/sections (403)")
    except Exception as e:
        print(f"❌ Normal user test failed: {e}")
        return False
    
    print("\n✅ FEATURE 1: ALL SECTION UPLOADER TESTS PASSED")
    return True


def test_whatsapp_webhook_no_autoreply():
    """Test FEATURE 2: WhatsApp Bot - Auto-reply DISABLED"""
    print("\n" + "="*80)
    print("FEATURE 2: WHATSAPP BOT - AUTO-REPLY DISABLED")
    print("="*80)
    
    # Login as admin to check logs later
    print("\n[Test 12] Admin login for log verification...")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        if res.status_code != 200:
            res = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": "9999999999",
                "password": "admin123"
            }, timeout=10)
        assert res.status_code == 200, f"Admin login failed: {res.status_code}"
        admin_token = res.json()["token"]
        print(f"✅ Admin login successful")
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return False
    
    # Get initial log count
    print("\n[Test 13] Get initial whatsapp log count...")
    try:
        res = requests.get(f"{BASE_URL}/admin/whatsapp/logs?limit=100",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if res.status_code == 200:
            initial_logs = res.json().get("items", [])  # Changed from "logs" to "items"
            initial_count = len(initial_logs)
            initial_outbound = len([l for l in initial_logs if l.get("direction") == "outbound"])
            print(f"✅ Initial log count: {initial_count} (outbound: {initial_outbound})")
        else:
            initial_count = 0
            initial_outbound = 0
            print(f"⚠️  Could not get initial logs: {res.status_code}")
    except Exception as e:
        print(f"⚠️  Could not get initial logs: {e}")
        initial_count = 0
        initial_outbound = 0
    
    # POST to webhook with sample payload
    print("\n[Test 14] POST /api/whatsapp/webhook with sample payload...")
    try:
        test_phone = "919999999999"
        payload = {
            "event_type": "message_received",
            "data": {
                "from": f"{test_phone}@c.us",
                "body": "password",
                "fromMe": False
            }
        }
        res = requests.post(f"{BASE_URL}/whatsapp/webhook", json=payload, timeout=10)
        assert res.status_code == 200, f"Webhook failed: {res.status_code} {res.text}"
        data = res.json()
        print(f"✅ Webhook response: {json.dumps(data, indent=2)}")
        
        # Verify response structure
        assert data.get("ok") == True, f"Expected ok=true, got {data.get('ok')}"
        assert data.get("autoReply") == False, f"Expected autoReply=false, got {data.get('autoReply')}"
        assert data.get("reason") == "manual-mode", f"Expected reason='manual-mode', got {data.get('reason')}"
        assert "matched" in data, "Expected 'matched' field in response"
        # Sender can be with or without country code
        sender = data.get("sender", "")
        assert sender in [test_phone, test_phone.replace("91", "")], f"Expected sender to be {test_phone} or {test_phone.replace('91', '')}, got {sender}"
        print(f"✅ Response structure verified: ok={data.get('ok')}, autoReply={data.get('autoReply')}, reason={data.get('reason')}, matched={data.get('matched')}, sender={data.get('sender')}")
    except Exception as e:
        print(f"❌ Webhook test failed: {e}")
        return False
    
    # Wait a bit for log to be written
    time.sleep(2)
    
    # Verify NO outbound log entry was created (only inbound)
    print("\n[Test 15] Verify NO outbound whatsapp log entry created...")
    try:
        res = requests.get(f"{BASE_URL}/admin/whatsapp/logs?limit=100",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if res.status_code == 200:
            logs = res.json().get("items", [])  # Changed from "logs" to "items"
            current_count = len(logs)
            current_outbound = len([l for l in logs if l.get("direction") == "outbound"])
            
            # Check that we have at least one more log (the inbound one)
            assert current_count > initial_count, f"Expected more logs, got {current_count} vs {initial_count}"
            
            # Check that outbound count did NOT increase
            assert current_outbound == initial_outbound, f"Outbound logs increased! {current_outbound} vs {initial_outbound}"
            
            # Find the inbound log we just created
            recent_inbound = [l for l in logs if l.get("direction") == "inbound" and l.get("from") in [test_phone, test_phone.replace("91", "")]]
            assert len(recent_inbound) > 0, "Could not find our inbound log"
            
            print(f"✅ Verified: Only inbound log created, NO outbound log")
            print(f"   Total logs: {current_count} (was {initial_count})")
            print(f"   Outbound logs: {current_outbound} (was {initial_outbound})")
        else:
            print(f"⚠️  Could not verify logs: {res.status_code}")
    except Exception as e:
        print(f"❌ Log verification failed: {e}")
        return False
    
    print("\n✅ FEATURE 2: ALL WHATSAPP WEBHOOK TESTS PASSED")
    return True


def test_whatsapp_campaign():
    """Test FEATURE 3: WhatsApp Campaign - inactive-99 offer"""
    print("\n" + "="*80)
    print("FEATURE 3: WHATSAPP CAMPAIGN - INACTIVE-99 OFFER")
    print("="*80)
    
    # Login as admin
    print("\n[Test 16] Admin login...")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=10)
        if res.status_code != 200:
            res = requests.post(f"{BASE_URL}/auth/login", json={
                "mobile": "9999999999",
                "password": "admin123"
            }, timeout=10)
        assert res.status_code == 200, f"Admin login failed: {res.status_code}"
        admin_token = res.json()["token"]
        print(f"✅ Admin login successful")
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return False
    
    # Test GET /api/admin/whatsapp/campaign/inactive-99/preview
    print("\n[Test 17] GET /api/admin/whatsapp/campaign/inactive-99/preview...")
    try:
        res = requests.get(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/preview",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert res.status_code == 200, f"Preview failed: {res.status_code} {res.text}"
        data = res.json()
        print(f"✅ Preview response: ok={data.get('ok')}, total={data.get('total')}, totalRegistered={data.get('totalRegistered')}, sample count={len(data.get('sample', []))}")
        
        # Verify structure
        assert data.get("ok") == True, "Expected ok=true"
        assert "total" in data, "Expected 'total' field"
        assert "totalRegistered" in data, "Expected 'totalRegistered' field"
        assert "sample" in data, "Expected 'sample' field"
        assert isinstance(data.get("sample"), list), "Expected sample to be array"
        
        # Verify total <= totalRegistered
        assert data.get("total") <= data.get("totalRegistered"), f"total ({data.get('total')}) should be <= totalRegistered ({data.get('totalRegistered')})"
        print(f"✅ Structure verified: total={data.get('total')} <= totalRegistered={data.get('totalRegistered')}")
    except Exception as e:
        print(f"❌ Preview test failed: {e}")
        return False
    
    # Test POST with dryRun: true
    print("\n[Test 18] POST /api/admin/whatsapp/campaign/inactive-99/send with dryRun=true...")
    try:
        res = requests.post(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "messageBody": "Hi {name}, pay at {payLink}",
                "dryRun": True
            }, timeout=10)
        assert res.status_code == 200, f"Dry run failed: {res.status_code} {res.text}"
        data = res.json()
        print(f"✅ Dry run response: ok={data.get('ok')}, dryRun={data.get('dryRun')}, campaignId={data.get('campaignId')}, audienceCount={data.get('audienceCount')}")
        
        # Verify structure
        assert data.get("ok") == True, "Expected ok=true"
        assert data.get("dryRun") == True, "Expected dryRun=true"
        assert "campaignId" in data, "Expected campaignId"
        assert "audienceCount" in data, "Expected audienceCount"
        assert "samplePreview" in data, "Expected samplePreview"
        
        # Verify samplePreview has up to 3 items with rendered substitutions
        sample = data.get("samplePreview", [])
        assert len(sample) <= 3, f"Expected max 3 sample items, got {len(sample)}"
        if len(sample) > 0:
            first = sample[0]
            assert "name" in first, "Expected name in sample"
            assert "mobile" in first, "Expected mobile in sample"
            assert "renderedBody" in first, "Expected renderedBody in sample"
            # Verify {name} and {payLink} were substituted
            assert "{name}" not in first.get("renderedBody", ""), "Expected {name} to be substituted"
            assert "{payLink}" not in first.get("renderedBody", ""), "Expected {payLink} to be substituted"
            print(f"✅ Sample preview verified: {len(sample)} items with substitutions")
    except Exception as e:
        print(f"❌ Dry run test failed: {e}")
        return False
    
    # Test POST with too short messageBody (< 10 chars)
    print("\n[Test 19] POST with too short messageBody (should be 400)...")
    try:
        res = requests.post(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "messageBody": "test",
                "dryRun": True
            }, timeout=10)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        print(f"✅ Too short messageBody rejected (400)")
    except Exception as e:
        print(f"❌ Short message test failed: {e}")
        return False
    
    # Test POST with empty body
    print("\n[Test 20] POST with empty body (should be 400)...")
    try:
        res = requests.post(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={}, timeout=10)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        print(f"✅ Empty body rejected (400)")
    except Exception as e:
        print(f"❌ Empty body test failed: {e}")
        return False
    
    # Test POST with testMobile (fake number)
    print("\n[Test 21] POST with testMobile='9000000000' (fake number)...")
    try:
        res = requests.post(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "messageBody": "Test offer at {payLink}",
                "testMobile": "9000000000"
            }, timeout=10)
        assert res.status_code == 200, f"Test mobile send failed: {res.status_code} {res.text}"
        data = res.json()
        print(f"✅ Test mobile response: ok={data.get('ok')}, campaignId={data.get('campaignId')}, audienceCount={data.get('audienceCount')}")
        
        # Verify structure
        assert data.get("ok") == True, "Expected ok=true"
        assert "campaignId" in data, "Expected campaignId"
        assert "audienceCount" in data, "Expected audienceCount"
        # audienceCount should be 1 (just the test mobile)
        assert data.get("audienceCount") >= 1, f"Expected audienceCount >= 1, got {data.get('audienceCount')}"
        print(f"✅ Campaign created with audienceCount={data.get('audienceCount')}")
    except Exception as e:
        print(f"❌ Test mobile send failed: {e}")
        return False
    
    # Test POST without dryRun (LIVE mode, fire-and-forget)
    print("\n[Test 22] POST without dryRun (LIVE mode, fire-and-forget)...")
    try:
        res = requests.post(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "messageBody": "Big offer {payLink} for {name}"
            }, timeout=10)
        assert res.status_code == 200, f"Live send failed: {res.status_code} {res.text}"
        data = res.json()
        print(f"✅ Live send response: ok={data.get('ok')}, sending={data.get('sending')}, campaignId={data.get('campaignId')}, audienceCount={data.get('audienceCount')}")
        
        # Verify structure
        assert data.get("ok") == True, "Expected ok=true"
        assert data.get("sending") == True, "Expected sending=true (fire-and-forget)"
        assert "campaignId" in data, "Expected campaignId"
        assert "audienceCount" in data, "Expected audienceCount"
        
        campaign_id = data.get("campaignId")
        audience_count = data.get("audienceCount")
        print(f"✅ Fire-and-forget campaign started: campaignId={campaign_id}, audienceCount={audience_count}")
        
        # Wait a few seconds for campaign to appear in list
        print("   Waiting 3 seconds for campaign to process...")
        time.sleep(3)
        
        # Test GET /api/admin/whatsapp/campaign/list
        print("\n[Test 23] GET /api/admin/whatsapp/campaign/list...")
        res = requests.get(f"{BASE_URL}/admin/whatsapp/campaign/list",
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert res.status_code == 200, f"Campaign list failed: {res.status_code} {res.text}"
        data = res.json()
        print(f"✅ Campaign list response: ok={data.get('ok')}, items count={len(data.get('items', []))}")
        
        # Verify structure
        assert data.get("ok") == True, "Expected ok=true"
        assert "items" in data, "Expected items array"
        
        # Find our campaign
        items = data.get("items", [])
        our_campaign = next((c for c in items if c.get("id") == campaign_id), None)
        if our_campaign:
            print(f"✅ Campaign found in list: audienceCount={our_campaign.get('audienceCount')}, status={our_campaign.get('status')}")
            assert our_campaign.get("audienceCount") == audience_count, f"Expected audienceCount={audience_count}, got {our_campaign.get('audienceCount')}"
        else:
            print(f"⚠️  Campaign not found in list yet (may still be processing)")
    except Exception as e:
        print(f"❌ Live send test failed: {e}")
        return False
    
    # Test non-admin access (should be 403)
    print("\n[Test 24] Test non-admin access to campaign endpoints (should be 403)...")
    try:
        # Register a normal user
        normal_mobile = f"92{random.randint(10000000, 99999999)}"
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Normal User",
            "mobile": normal_mobile,
            "password": "test123"
        }, timeout=10)
        assert res.status_code == 200, f"Normal user registration failed: {res.status_code}"
        normal_token = res.json()["token"]
        
        # Try to access preview endpoint
        res = requests.get(f"{BASE_URL}/admin/whatsapp/campaign/inactive-99/preview",
            headers={"Authorization": f"Bearer {normal_token}"}, timeout=10)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print(f"✅ Non-admin denied access to campaign endpoints (403)")
    except Exception as e:
        print(f"❌ Non-admin test failed: {e}")
        return False
    
    print("\n✅ FEATURE 3: ALL WHATSAPP CAMPAIGN TESTS PASSED")
    return True


def test_special99_plan():
    """Test FEATURE 4: Special99 plan verification"""
    print("\n" + "="*80)
    print("FEATURE 4: SPECIAL99 PLAN VERIFICATION")
    print("="*80)
    
    # GET /api/plans
    print("\n[Test 25] GET /api/plans and verify special99 plan...")
    try:
        res = requests.get(f"{BASE_URL}/plans", timeout=10)
        assert res.status_code == 200, f"Get plans failed: {res.status_code} {res.text}"
        data = res.json()
        plans = data.get("plans", [])
        print(f"✅ Plans retrieved: {len(plans)} plans")
        
        # Find special99 plan
        special99 = next((p for p in plans if p.get("id") == "special99"), None)
        assert special99 is not None, "special99 plan not found in plans list"
        
        # Verify special99 plan details
        print(f"\n   special99 plan details:")
        print(f"   - id: {special99.get('id')}")
        print(f"   - name: {special99.get('name')}")
        print(f"   - price: {special99.get('price')}")
        print(f"   - days: {special99.get('days')}")
        print(f"   - enabled: {special99.get('enabled')}")
        print(f"   - popular: {special99.get('popular')}")
        
        assert special99.get("id") == "special99", f"Expected id='special99', got {special99.get('id')}"
        assert special99.get("price") == 99, f"Expected price=99, got {special99.get('price')}"
        assert special99.get("days") == 365, f"Expected days=365, got {special99.get('days')}"
        assert special99.get("enabled") == True, f"Expected enabled=true, got {special99.get('enabled')}"
        
        print(f"\n✅ special99 plan verified: id=special99, price=99, days=365, enabled=true")
    except Exception as e:
        print(f"❌ special99 plan verification failed: {e}")
        return False
    
    print("\n✅ FEATURE 4: SPECIAL99 PLAN VERIFICATION PASSED")
    return True


def main():
    print("\n" + "="*80)
    print("BACKEND TESTING: THREE NEW FEATURES")
    print("="*80)
    print("\nTesting:")
    print("1. Section Uploader role")
    print("2. WhatsApp Bot - Auto-reply DISABLED")
    print("3. WhatsApp Campaign - inactive-99 offer")
    print("4. Special99 plan verification")
    
    results = {
        "Section Uploader Role": False,
        "WhatsApp Webhook No Auto-reply": False,
        "WhatsApp Campaign": False,
        "Special99 Plan": False
    }
    
    try:
        results["Section Uploader Role"] = test_section_uploader_role()
    except Exception as e:
        print(f"\n❌ Section Uploader Role tests failed with exception: {e}")
    
    try:
        results["WhatsApp Webhook No Auto-reply"] = test_whatsapp_webhook_no_autoreply()
    except Exception as e:
        print(f"\n❌ WhatsApp Webhook tests failed with exception: {e}")
    
    try:
        results["WhatsApp Campaign"] = test_whatsapp_campaign()
    except Exception as e:
        print(f"\n❌ WhatsApp Campaign tests failed with exception: {e}")
    
    try:
        results["Special99 Plan"] = test_special99_plan()
    except Exception as e:
        print(f"\n❌ Special99 Plan tests failed with exception: {e}")
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for feature, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {feature}")
    
    print(f"\nTotal: {passed}/{total} features passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} feature(s) failed")
        return 1


if __name__ == "__main__":
    exit(main())
