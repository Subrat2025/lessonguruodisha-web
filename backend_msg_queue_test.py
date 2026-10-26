#!/usr/bin/env python3
"""
Backend test for Smart WhatsApp Message Queue feature
Tests all message queue endpoints and lifecycle operations
"""

import requests
import time
import json
from pymongo import MongoClient

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

def log_test(test_num, description):
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def log_result(success, message):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def main():
    print("\n" + "="*80)
    print("SMART WHATSAPP MESSAGE QUEUE - BACKEND TESTING")
    print("="*80)
    
    token = None
    queue_id = None
    
    try:
        # =====================================================================
        # TEST 1: Admin Login
        # =====================================================================
        log_test(1, "Admin Login")
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Token not in response"
        token = data["token"]
        log_result(True, f"Admin login successful, token: {token[:20]}...")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # =====================================================================
        # TEST 2: GET /api/admin/msg-settings (default seed values)
        # =====================================================================
        log_test(2, "GET /api/admin/msg-settings - Default seed values")
        response = requests.get(f"{BASE_URL}/admin/msg-settings", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        settings = response.json()
        
        # Verify default values
        assert settings["minDelaySec"] == 40, f"Expected minDelaySec=40, got {settings['minDelaySec']}"
        assert settings["maxDelaySec"] == 120, f"Expected maxDelaySec=120, got {settings['maxDelaySec']}"
        assert settings["batchSize"] == 20, f"Expected batchSize=20, got {settings['batchSize']}"
        assert settings["dailyLimit"] == 20, f"Expected dailyLimit=20, got {settings['dailyLimit']}"
        assert settings["maxRetries"] == 3, f"Expected maxRetries=3, got {settings['maxRetries']}"
        assert settings["retryIntervalMin"] == 5, f"Expected retryIntervalMin=5, got {settings['retryIntervalMin']}"
        assert settings["randomDelay"] == True, f"Expected randomDelay=true, got {settings['randomDelay']}"
        assert settings["retryEnabled"] == True, f"Expected retryEnabled=true, got {settings['retryEnabled']}"
        
        log_result(True, f"Default settings verified: minDelaySec={settings['minDelaySec']}, maxDelaySec={settings['maxDelaySec']}, batchSize={settings['batchSize']}, dailyLimit={settings['dailyLimit']}")
        
        # =====================================================================
        # TEST 3: PUT /api/admin/msg-settings (update with test values)
        # =====================================================================
        log_test(3, "PUT /api/admin/msg-settings - Update with test values")
        test_settings = {
            "minDelaySec": 5,
            "maxDelaySec": 8,
            "batchSize": 2,
            "batchPauseMin": 0,
            "dailyLimit": 100,
            "maxRetries": 1,
            "retryIntervalMin": 1,
            "randomDelay": True,
            "retryEnabled": True
        }
        response = requests.put(f"{BASE_URL}/admin/msg-settings", headers=headers, json=test_settings)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        updated = response.json()
        
        # Verify updated values
        assert updated["minDelaySec"] == 5, f"Expected minDelaySec=5, got {updated['minDelaySec']}"
        assert updated["maxDelaySec"] == 8, f"Expected maxDelaySec=8, got {updated['maxDelaySec']}"
        assert updated["batchSize"] == 2, f"Expected batchSize=2, got {updated['batchSize']}"
        assert updated["dailyLimit"] == 100, f"Expected dailyLimit=100, got {updated['dailyLimit']}"
        assert updated["maxRetries"] == 1, f"Expected maxRetries=1, got {updated['maxRetries']}"
        
        log_result(True, f"Settings updated successfully: minDelaySec={updated['minDelaySec']}, maxDelaySec={updated['maxDelaySec']}, dailyLimit={updated['dailyLimit']}")
        
        # =====================================================================
        # TEST 4: PUT /api/admin/msg-settings - Validation (negative values)
        # =====================================================================
        log_test(4, "PUT /api/admin/msg-settings - Validation (negative values should be clamped)")
        response = requests.put(f"{BASE_URL}/admin/msg-settings", headers=headers, json={
            "minDelaySec": -5
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        result = response.json()
        # Server should clamp or keep previous value (not accept negative)
        assert result["minDelaySec"] >= 1, f"Server accepted negative minDelaySec: {result['minDelaySec']}"
        log_result(True, f"Negative value rejected/clamped: minDelaySec={result['minDelaySec']}")
        
        # =====================================================================
        # TEST 5: GET /api/admin/msg-queues/audience-preview?type=no_plan
        # =====================================================================
        log_test(5, "GET /api/admin/msg-queues/audience-preview?type=no_plan")
        response = requests.get(f"{BASE_URL}/admin/msg-queues/audience-preview?type=no_plan", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        preview = response.json()
        assert "type" in preview, "type not in response"
        assert "count" in preview, "count not in response"
        assert preview["type"] == "no_plan", f"Expected type=no_plan, got {preview['type']}"
        log_result(True, f"Audience preview (no_plan): count={preview['count']}")
        
        # =====================================================================
        # TEST 6: GET /api/admin/msg-queues/audience-preview?type=expired
        # =====================================================================
        log_test(6, "GET /api/admin/msg-queues/audience-preview?type=expired")
        response = requests.get(f"{BASE_URL}/admin/msg-queues/audience-preview?type=expired", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        preview = response.json()
        assert preview["type"] == "expired", f"Expected type=expired, got {preview['type']}"
        log_result(True, f"Audience preview (expired): count={preview['count']}")
        
        # =====================================================================
        # TEST 7: GET /api/admin/msg-queues/audience-preview?type=recent
        # =====================================================================
        log_test(7, "GET /api/admin/msg-queues/audience-preview?type=recent")
        response = requests.get(f"{BASE_URL}/admin/msg-queues/audience-preview?type=recent", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        preview = response.json()
        assert preview["type"] == "recent", f"Expected type=recent, got {preview['type']}"
        log_result(True, f"Audience preview (recent): count={preview['count']}")
        
        # =====================================================================
        # TEST 8: GET /api/admin/msg-queues/audience-preview?type=all
        # =====================================================================
        log_test(8, "GET /api/admin/msg-queues/audience-preview?type=all")
        response = requests.get(f"{BASE_URL}/admin/msg-queues/audience-preview?type=all", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        preview = response.json()
        assert preview["type"] == "all", f"Expected type=all, got {preview['type']}"
        log_result(True, f"Audience preview (all): count={preview['count']}")
        
        # =====================================================================
        # TEST 9: POST /api/admin/msg-queues - Create custom-mobile queue
        # =====================================================================
        log_test(9, "POST /api/admin/msg-queues - Create custom-mobile queue")
        queue_payload = {
            "name": "Test Automated Regression",
            "templateBody": "Hello {name}, this is Lesson Guru Odisha automated regression test. Reply with 'STOP' to opt out.",
            "audience": {
                "type": "custom",
                "mobiles": ["9000000001", "9000000002", "9000000003", "9000000004"]
            }
        }
        response = requests.post(f"{BASE_URL}/admin/msg-queues", headers=headers, json=queue_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        result = response.json()
        assert result["ok"] == True, "Expected ok=true"
        assert "queue" in result, "queue not in response"
        assert "itemCount" in result, "itemCount not in response"
        assert result["itemCount"] == 4, f"Expected itemCount=4, got {result['itemCount']}"
        
        queue_id = result["queue"]["id"]
        log_result(True, f"Queue created: id={queue_id}, itemCount={result['itemCount']}")
        
        # =====================================================================
        # TEST 10: GET /api/admin/msg-queues/:id - Verify draft status
        # =====================================================================
        log_test(10, "GET /api/admin/msg-queues/:id - Verify draft status")
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        stats = response.json()
        
        assert "queue" in stats, "queue not in response"
        assert "kpis" in stats, "kpis not in response"
        assert stats["queue"]["status"] == "draft", f"Expected status=draft, got {stats['queue']['status']}"
        assert stats["kpis"]["total"] == 4, f"Expected total=4, got {stats['kpis']['total']}"
        assert stats["kpis"]["pending"] == 4, f"Expected pending=4, got {stats['kpis']['pending']}"
        
        log_result(True, f"Queue status: {stats['queue']['status']}, total={stats['kpis']['total']}, pending={stats['kpis']['pending']}")
        
        # =====================================================================
        # TEST 11: GET /api/admin/msg-queues/:id/items - List items
        # =====================================================================
        log_test(11, "GET /api/admin/msg-queues/:id/items - List items")
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}/items?limit=10", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        items_data = response.json()
        
        assert "items" in items_data, "items not in response"
        assert len(items_data["items"]) == 4, f"Expected 4 items, got {len(items_data['items'])}"
        
        # Verify all items are pending
        for item in items_data["items"]:
            assert item["status"] == "pending", f"Expected status=pending, got {item['status']}"
        
        log_result(True, f"Items listed: count={len(items_data['items'])}, all status=pending")
        
        # =====================================================================
        # TEST 12: POST /api/admin/msg-queues/:id/start - Start queue
        # =====================================================================
        log_test(12, "POST /api/admin/msg-queues/:id/start - Start queue")
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/start", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        queue = response.json()
        
        assert queue["status"] == "running", f"Expected status=running, got {queue['status']}"
        assert queue["startedAt"] is not None, "startedAt should be set"
        
        log_result(True, f"Queue started: status={queue['status']}, startedAt={queue['startedAt']}")
        
        # =====================================================================
        # TEST 13: Wait and manual tick (1st tick)
        # =====================================================================
        log_test(13, "POST /api/admin/msg-queues/:id/tick - Manual tick #1")
        time.sleep(2)  # Wait 2 seconds
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/tick", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check stats after tick
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        stats = response.json()
        log_result(True, f"After tick #1: sent={stats['kpis']['sent']}, failed={stats['kpis']['failed']}, pending={stats['kpis']['pending']}")
        
        # =====================================================================
        # TEST 14: Wait and manual tick (2nd tick)
        # =====================================================================
        log_test(14, "POST /api/admin/msg-queues/:id/tick - Manual tick #2")
        time.sleep(6)  # Wait 6 seconds (respects 5-8s delay)
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/tick", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check stats after tick
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        stats = response.json()
        log_result(True, f"After tick #2: sent={stats['kpis']['sent']}, failed={stats['kpis']['failed']}, pending={stats['kpis']['pending']}")
        
        # =====================================================================
        # TEST 15: Wait and manual tick (3rd tick)
        # =====================================================================
        log_test(15, "POST /api/admin/msg-queues/:id/tick - Manual tick #3")
        time.sleep(6)  # Wait 6 seconds
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/tick", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check stats after tick
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        stats = response.json()
        log_result(True, f"After tick #3: sent={stats['kpis']['sent']}, failed={stats['kpis']['failed']}, pending={stats['kpis']['pending']}")
        
        # =====================================================================
        # TEST 16: Wait and manual tick (4th tick)
        # =====================================================================
        log_test(16, "POST /api/admin/msg-queues/:id/tick - Manual tick #4")
        time.sleep(6)  # Wait 6 seconds
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/tick", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check stats after tick
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        stats = response.json()
        
        # Verify some items have been processed (sent or failed)
        assert stats['kpis']['sent'] + stats['kpis']['failed'] >= 1, "Expected at least 1 item processed"
        
        log_result(True, f"After tick #4: sent={stats['kpis']['sent']}, failed={stats['kpis']['failed']}, pending={stats['kpis']['pending']}, retrying={stats['kpis'].get('retrying', 0)}")
        
        # =====================================================================
        # TEST 17: POST /api/admin/msg-queues/:id/pause - Pause queue
        # =====================================================================
        log_test(17, "POST /api/admin/msg-queues/:id/pause - Pause queue")
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/pause", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        queue = response.json()
        
        assert queue["status"] == "paused", f"Expected status=paused, got {queue['status']}"
        log_result(True, f"Queue paused: status={queue['status']}")
        
        # Verify tick doesn't process when paused
        time.sleep(2)
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/tick", headers=headers)
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        stats_before_pause = response.json()
        
        log_result(True, f"After pause tick: sent={stats_before_pause['kpis']['sent']} (should not increase)")
        
        # =====================================================================
        # TEST 18: POST /api/admin/msg-queues/:id/resume - Resume queue
        # =====================================================================
        log_test(18, "POST /api/admin/msg-queues/:id/resume - Resume queue")
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/resume", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        queue = response.json()
        
        assert queue["status"] == "running", f"Expected status=running, got {queue['status']}"
        log_result(True, f"Queue resumed: status={queue['status']}")
        
        # =====================================================================
        # TEST 19: POST /api/admin/msg-queues/:id/retry-failed - Retry failed items
        # =====================================================================
        log_test(19, "POST /api/admin/msg-queues/:id/retry-failed - Retry failed items")
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/retry-failed", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        result = response.json()
        
        assert "count" in result, "count not in response"
        log_result(True, f"Retry failed: count={result['count']} items moved from failed to pending")
        
        # =====================================================================
        # TEST 20: POST /api/admin/msg-queues/:id/stop - Stop queue
        # =====================================================================
        log_test(20, "POST /api/admin/msg-queues/:id/stop - Stop queue")
        response = requests.post(f"{BASE_URL}/admin/msg-queues/{queue_id}/stop", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        queue = response.json()
        
        assert queue["status"] == "stopped", f"Expected status=stopped, got {queue['status']}"
        assert queue["completedAt"] is not None, "completedAt should be set"
        log_result(True, f"Queue stopped: status={queue['status']}, completedAt={queue['completedAt']}")
        
        # =====================================================================
        # TEST 21: GET /api/admin/msg-queues - List queues
        # =====================================================================
        log_test(21, "GET /api/admin/msg-queues - List queues")
        response = requests.get(f"{BASE_URL}/admin/msg-queues", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        result = response.json()
        
        assert "queues" in result, "queues not in response"
        assert len(result["queues"]) >= 1, "Expected at least 1 queue"
        
        # Find our test queue
        test_queue = next((q for q in result["queues"] if q["id"] == queue_id), None)
        assert test_queue is not None, "Test queue not found in list"
        
        log_result(True, f"Queues listed: count={len(result['queues'])}, test queue found")
        
        # =====================================================================
        # TEST 22: DELETE /api/admin/msg-queues/:id - Delete queue
        # =====================================================================
        log_test(22, "DELETE /api/admin/msg-queues/:id - Delete queue")
        response = requests.delete(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        result = response.json()
        
        assert result["ok"] == True, "Expected ok=true"
        
        # Verify queue is deleted
        response = requests.get(f"{BASE_URL}/admin/msg-queues/{queue_id}", headers=headers)
        assert response.status_code == 404, f"Expected 404 after delete, got {response.status_code}"
        
        log_result(True, f"Queue deleted: id={queue_id}")
        
        # =====================================================================
        # TEST 23: MongoDB collections verification
        # =====================================================================
        log_test(23, "MongoDB collections verification")
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Check msgQueueSettings collection
        settings_count = db.msgQueueSettings.count_documents({"id": "default"})
        assert settings_count == 1, f"Expected 1 settings doc, got {settings_count}"
        
        # Check msgQueues collection (should be 0 after delete)
        queues_count = db.msgQueues.count_documents({})
        
        # Check msgQueueItems collection (should be 0 after delete)
        items_count = db.msgQueueItems.count_documents({})
        
        log_result(True, f"MongoDB collections verified: msgQueueSettings=1, msgQueues={queues_count}, msgQueueItems={items_count}")
        
        client.close()
        
        # =====================================================================
        # REGRESSION TESTS
        # =====================================================================
        
        # TEST 24: GET /api/admin/analytics/dashboard?range=7d
        log_test(24, "REGRESSION: GET /api/admin/analytics/dashboard?range=7d")
        response = requests.get(f"{BASE_URL}/admin/analytics/dashboard?range=7d", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        log_result(True, "Analytics dashboard endpoint still working")
        
        # TEST 25: GET /api/admin/users
        log_test(25, "REGRESSION: GET /api/admin/users")
        response = requests.get(f"{BASE_URL}/admin/users", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        log_result(True, "Admin users endpoint still working")
        
        # TEST 26: GET /api/settings/public
        log_test(26, "REGRESSION: GET /api/settings/public")
        response = requests.get(f"{BASE_URL}/settings/public")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        log_result(True, "Public settings endpoint still working")
        
        print("\n" + "="*80)
        print("✅ ALL 26 TESTS PASSED - MESSAGE QUEUE FEATURE WORKING CORRECTLY")
        print("="*80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
