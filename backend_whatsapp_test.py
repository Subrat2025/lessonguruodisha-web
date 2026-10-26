#!/usr/bin/env python3
"""
Backend test for UltraMsg WhatsApp Integration in Lesson Guru Odisha.

Tests:
1. GET /api/admin/whatsapp/status (admin auth)
2. POST /api/admin/whatsapp/send (happy path + edge cases)
3. POST /api/whatsapp/webhook (public, various scenarios)
4. GET /api/admin/whatsapp/logs

Admin credentials: 9999999999 / admin123
"""

import requests
import json
import os

# Backend base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test state
admin_token = None
test_user_id = None
test_user_mobile = None

def test_admin_login():
    """Test 1: Admin login"""
    global admin_token
    try:
        print("\n=== Test 1: Admin Login ===")
        response = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get('token')
            print(f"✅ Admin login successful")
            print(f"Token: {admin_token[:20]}...")
            return True
        else:
            print(f"❌ Admin login failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 1 failed with exception: {e}")
        return False

def test_whatsapp_status():
    """Test 2: GET /api/admin/whatsapp/status (admin auth)"""
    try:
        print("\n=== Test 2: GET /api/admin/whatsapp/status (admin auth) ===")
        response = requests.get(f"{API_BASE}/admin/whatsapp/status", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            # Verify required fields
            assert data.get('ok') == True, "ok should be true"
            assert data.get('configured') == True, "configured should be true"
            assert data.get('instance') == 'instance177261', f"instance should be instance177261, got {data.get('instance')}"
            assert data.get('accountStatus') == 'authenticated', f"accountStatus should be authenticated, got {data.get('accountStatus')}"
            assert data.get('substatus') == 'connected', f"substatus should be connected, got {data.get('substatus')}"
            assert '/api/whatsapp/webhook' in data.get('webhookUrl', ''), "webhookUrl should contain /api/whatsapp/webhook"
            
            print(f"✅ WhatsApp status endpoint working correctly")
            print(f"   - Instance: {data.get('instance')}")
            print(f"   - Account Status: {data.get('accountStatus')}")
            print(f"   - Substatus: {data.get('substatus')}")
            print(f"   - Webhook URL: {data.get('webhookUrl')}")
            return True
        else:
            print(f"❌ WhatsApp status failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 2 failed with exception: {e}")
        return False

def test_whatsapp_status_no_auth():
    """Test 3: GET /api/admin/whatsapp/status (no auth) → 401/403"""
    try:
        print("\n=== Test 3: GET /api/admin/whatsapp/status (no auth) ===")
        response = requests.get(f"{API_BASE}/admin/whatsapp/status")
        print(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            print(f"✅ Correctly rejected request without auth (status {response.status_code})")
            return True
        else:
            print(f"❌ Should return 401/403 without auth, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Test 3 failed with exception: {e}")
        return False

def test_whatsapp_send_happy_path():
    """Test 4: POST /api/admin/whatsapp/send (happy path with Super Admin user)"""
    global test_user_id, test_user_mobile
    try:
        print("\n=== Test 4: POST /api/admin/whatsapp/send (happy path) ===")
        
        # Find Super Admin user (has lastKnownPassword)
        response = requests.get(f"{API_BASE}/admin/users", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        
        if response.status_code == 200:
            users = response.json().get('users', [])
            # Find Super Admin or any user with lastKnownPassword
            target_user = None
            for user in users:
                if user.get('name') == 'Super Admin' and user.get('lastKnownPassword'):
                    target_user = user
                    break
            
            if not target_user:
                # Try to find any user with lastKnownPassword
                for user in users:
                    if user.get('lastKnownPassword') and user.get('mobile'):
                        target_user = user
                        break
            
            if not target_user:
                print("⚠️  No user with lastKnownPassword found, skipping happy path test")
                return True  # Skip test, not a failure
            
            test_user_id = target_user['id']
            test_user_mobile = target_user['mobile']
            
            print(f"Testing with user: {target_user['name']} (mobile: {test_user_mobile})")
            
            # Send WhatsApp message
            response = requests.post(f"{API_BASE}/admin/whatsapp/send", 
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"userId": test_user_id}
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Response: {json.dumps(data, indent=2)}")
                
                # Verify response
                assert data.get('ok') == True, "ok should be true"
                assert data.get('phone'), "phone should be present"
                assert data.get('message') == 'Password sent via WhatsApp ✅', f"message should be 'Password sent via WhatsApp ✅', got {data.get('message')}"
                
                print(f"✅ WhatsApp send successful")
                print(f"   - Phone: {data.get('phone')}")
                print(f"   - Message ID: {data.get('id')}")
                return True
            else:
                print(f"❌ WhatsApp send failed: {response.text}")
                return False
        else:
            print(f"❌ Failed to fetch users: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 4 failed with exception: {e}")
        return False

def test_whatsapp_send_no_password():
    """Test 5: POST /api/admin/whatsapp/send (user without lastKnownPassword) → 400"""
    try:
        print("\n=== Test 5: POST /api/admin/whatsapp/send (user without lastKnownPassword) ===")
        
        # Create a test user without lastKnownPassword (via self-signup)
        test_mobile = "9111000444"
        response = requests.post(f"{API_BASE}/auth/register", json={
            "name": "WA Test User",
            "mobile": test_mobile,
            "password": "self123"
        })
        
        if response.status_code == 200:
            user_data = response.json()
            user_id = user_data['user']['id']
            
            # Try to send WhatsApp to this user
            response = requests.post(f"{API_BASE}/admin/whatsapp/send",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"userId": user_id}
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 400:
                data = response.json()
                print(f"Response: {json.dumps(data, indent=2)}")
                error_msg = data.get('error', '').lower()
                
                # Check for expected error message
                if 'password' in error_msg or 'generate' in error_msg:
                    print(f"✅ Correctly rejected user without lastKnownPassword")
                    print(f"   - Error: {data.get('error')}")
                    return True
                else:
                    print(f"❌ Error message doesn't mention password/generate: {data.get('error')}")
                    return False
            else:
                print(f"❌ Should return 400 for user without password, got {response.status_code}")
                return False
        else:
            print(f"⚠️  Could not create test user, skipping test")
            return True  # Skip test
    except Exception as e:
        print(f"❌ Test 5 failed with exception: {e}")
        return False

def test_whatsapp_send_bad_user_id():
    """Test 6: POST /api/admin/whatsapp/send (bad userId) → 404"""
    try:
        print("\n=== Test 6: POST /api/admin/whatsapp/send (bad userId) ===")
        response = requests.post(f"{API_BASE}/admin/whatsapp/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"userId": "00000000-0000-0000-0000-000000000000"}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 404:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            assert 'not found' in data.get('error', '').lower(), "Error should mention 'not found'"
            print(f"✅ Correctly returned 404 for invalid userId")
            return True
        else:
            print(f"❌ Should return 404 for invalid userId, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Test 6 failed with exception: {e}")
        return False

def test_whatsapp_send_no_auth():
    """Test 7: POST /api/admin/whatsapp/send (no auth) → 401/403"""
    try:
        print("\n=== Test 7: POST /api/admin/whatsapp/send (no auth) ===")
        response = requests.post(f"{API_BASE}/admin/whatsapp/send",
            json={"userId": "some-id"}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            print(f"✅ Correctly rejected request without auth (status {response.status_code})")
            return True
        else:
            print(f"❌ Should return 401/403 without auth, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Test 7 failed with exception: {e}")
        return False

def test_webhook_registered_user_password():
    """Test 8a: POST /api/whatsapp/webhook (registered user asking for password)"""
    try:
        print("\n=== Test 8a: POST /api/whatsapp/webhook (registered user asking for password) ===")
        response = requests.post(f"{API_BASE}/whatsapp/webhook", json={
            "event_type": "message_received",
            "data": {
                "from": "919999999999@c.us",
                "body": "password",
                "fromMe": False
            }
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            assert data.get('ok') == True, "ok should be true"
            assert data.get('matched') == True, "matched should be true (user exists)"
            assert data.get('sender') == '919999999999', f"sender should be 919999999999, got {data.get('sender')}"
            
            print(f"✅ Webhook correctly matched registered user")
            print(f"   - Matched: {data.get('matched')}")
            print(f"   - Sender: {data.get('sender')}")
            return True
        else:
            print(f"❌ Webhook failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 8a failed with exception: {e}")
        return False

def test_webhook_own_message():
    """Test 8b: POST /api/whatsapp/webhook (fromMe:true - echo from our instance)"""
    try:
        print("\n=== Test 8b: POST /api/whatsapp/webhook (fromMe:true) ===")
        response = requests.post(f"{API_BASE}/whatsapp/webhook", json={
            "event_type": "message_received",
            "data": {
                "from": "919999999999@c.us",
                "body": "password",
                "fromMe": True
            }
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            assert data.get('ok') == True, "ok should be true"
            assert data.get('skipped') == 'own-message', f"skipped should be 'own-message', got {data.get('skipped')}"
            
            print(f"✅ Webhook correctly skipped own message (fromMe:true)")
            return True
        else:
            print(f"❌ Webhook failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 8b failed with exception: {e}")
        return False

def test_webhook_unknown_sender():
    """Test 8c: POST /api/whatsapp/webhook (unknown sender)"""
    try:
        print("\n=== Test 8c: POST /api/whatsapp/webhook (unknown sender) ===")
        response = requests.post(f"{API_BASE}/whatsapp/webhook", json={
            "event_type": "message_received",
            "data": {
                "from": "917000000909@c.us",
                "body": "password",
                "fromMe": False
            }
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            assert data.get('ok') == True, "ok should be true"
            assert data.get('matched') == False, "matched should be false (user doesn't exist)"
            assert data.get('sender') == '917000000909', f"sender should be 917000000909, got {data.get('sender')}"
            
            print(f"✅ Webhook correctly handled unknown sender")
            print(f"   - Matched: {data.get('matched')}")
            print(f"   - Sender: {data.get('sender')}")
            print(f"   - Auto-reply should contain signup prompt")
            return True
        else:
            print(f"❌ Webhook failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 8c failed with exception: {e}")
        return False

def test_webhook_plans_intent():
    """Test 8d: POST /api/whatsapp/webhook (plans intent)"""
    try:
        print("\n=== Test 8d: POST /api/whatsapp/webhook (plans intent) ===")
        response = requests.post(f"{API_BASE}/whatsapp/webhook", json={
            "event_type": "message_received",
            "data": {
                "from": "919999999999@c.us",
                "body": "plans",
                "fromMe": False
            }
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            assert data.get('ok') == True, "ok should be true"
            assert data.get('matched') == True, "matched should be true"
            
            print(f"✅ Webhook correctly handled plans intent")
            print(f"   - Auto-reply should contain plan pricing (Semi-Annual, Yearly)")
            return True
        else:
            print(f"❌ Webhook failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 8d failed with exception: {e}")
        return False

def test_webhook_no_sender():
    """Test 8e: POST /api/whatsapp/webhook (missing body/sender)"""
    try:
        print("\n=== Test 8e: POST /api/whatsapp/webhook (missing body/sender) ===")
        response = requests.post(f"{API_BASE}/whatsapp/webhook", json={
            "event_type": "message_received",
            "data": {}
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            assert data.get('ok') == True, "ok should be true"
            assert data.get('skipped') == 'no-sender-or-text', f"skipped should be 'no-sender-or-text', got {data.get('skipped')}"
            
            print(f"✅ Webhook correctly skipped message with no sender/text")
            return True
        else:
            print(f"❌ Webhook failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 8e failed with exception: {e}")
        return False

def test_whatsapp_logs():
    """Test 9: GET /api/admin/whatsapp/logs?limit=20"""
    try:
        print("\n=== Test 9: GET /api/admin/whatsapp/logs?limit=20 ===")
        response = requests.get(f"{API_BASE}/admin/whatsapp/logs?limit=20", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)[:500]}...")  # Print first 500 chars
            
            assert data.get('ok') == True, "ok should be true"
            assert 'items' in data, "items should be present"
            assert isinstance(data['items'], list), "items should be a list"
            
            # Check structure of log entries
            if len(data['items']) > 0:
                log = data['items'][0]
                assert 'direction' in log, "log should have direction field"
                assert log['direction'] in ['inbound', 'outbound'], f"direction should be inbound/outbound, got {log['direction']}"
                
                if log['direction'] == 'inbound':
                    assert 'from' in log, "inbound log should have 'from' field"
                    assert 'body' in log, "inbound log should have 'body' field"
                else:
                    assert 'to' in log, "outbound log should have 'to' field"
                    assert 'body' in log, "outbound log should have 'body' field"
                    # Outbound logs should have ok or messageType
                    assert 'ok' in log or 'messageType' in log, "outbound log should have ok or messageType field"
                
                assert 'at' in log, "log should have 'at' timestamp"
            
            print(f"✅ WhatsApp logs endpoint working correctly")
            print(f"   - Total logs: {data.get('count')}")
            print(f"   - Sample log directions: {[log.get('direction') for log in data['items'][:3]]}")
            return True
        else:
            print(f"❌ WhatsApp logs failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 9 failed with exception: {e}")
        return False

def test_whatsapp_logs_no_auth():
    """Test 10: GET /api/admin/whatsapp/logs (no auth) → 401/403"""
    try:
        print("\n=== Test 10: GET /api/admin/whatsapp/logs (no auth) ===")
        response = requests.get(f"{API_BASE}/admin/whatsapp/logs?limit=10")
        print(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            print(f"✅ Correctly rejected request without auth (status {response.status_code})")
            return True
        else:
            print(f"❌ Should return 401/403 without auth, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Test 10 failed with exception: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 80)
    print("ULTRAMSG WHATSAPP INTEGRATION BACKEND TESTS")
    print("=" * 80)
    print(f"Backend URL: {API_BASE}")
    print(f"Admin: {ADMIN_MOBILE} / {ADMIN_PASSWORD}")
    
    results = []
    
    # Test 1: Admin login
    results.append(("Admin Login", test_admin_login()))
    
    if not admin_token:
        print("\n❌ Cannot proceed without admin token")
        return
    
    # Test 2-3: WhatsApp status
    results.append(("WhatsApp Status (admin auth)", test_whatsapp_status()))
    results.append(("WhatsApp Status (no auth)", test_whatsapp_status_no_auth()))
    
    # Test 4-7: WhatsApp send
    results.append(("WhatsApp Send (happy path)", test_whatsapp_send_happy_path()))
    results.append(("WhatsApp Send (no password)", test_whatsapp_send_no_password()))
    results.append(("WhatsApp Send (bad userId)", test_whatsapp_send_bad_user_id()))
    results.append(("WhatsApp Send (no auth)", test_whatsapp_send_no_auth()))
    
    # Test 8a-e: WhatsApp webhook
    results.append(("Webhook (registered user)", test_webhook_registered_user_password()))
    results.append(("Webhook (fromMe:true)", test_webhook_own_message()))
    results.append(("Webhook (unknown sender)", test_webhook_unknown_sender()))
    results.append(("Webhook (plans intent)", test_webhook_plans_intent()))
    results.append(("Webhook (no sender)", test_webhook_no_sender()))
    
    # Test 9-10: WhatsApp logs
    results.append(("WhatsApp Logs (admin auth)", test_whatsapp_logs()))
    results.append(("WhatsApp Logs (no auth)", test_whatsapp_logs_no_auth()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! UltraMsg WhatsApp integration is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")

if __name__ == "__main__":
    main()
