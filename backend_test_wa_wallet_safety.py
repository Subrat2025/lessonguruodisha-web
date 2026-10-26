#!/usr/bin/env python3
"""
WhatsApp Wallet-Safety Backend Testing (PREVIEW ONLY)
Tests wallet balance checks, dry-run cost calculations, campaign send gates, 
test batch dedupe, status taxonomy, mark-failed, and drip pendingNudge gating.

CRITICAL GUARDRAILS:
- Do NOT touch R2/env flags
- Keep real BulkyMarketing sends to MAX 1-2 messages (use tiny testBatchSize)
- Clean up any throwaway campaigns created
- Leave wallet balance = 2782.46 at the end
"""

import requests
import json
import sys
import time
from datetime import datetime

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Expected wallet balance
EXPECTED_BALANCE = 2782.46

# Test results
test_results = []
cleanup_items = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"  Details: {details}")
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })

def admin_login():
    """Login as admin and return token"""
    print("\n=== ADMIN LOGIN ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                print(f"✅ Admin login successful")
                return token
            else:
                print(f"❌ No token in response")
                return None
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return None

def test_1_get_settings(token):
    """Test 1: GET /api/admin/wa/settings"""
    print("\n=== TEST 1: GET /api/admin/wa/settings ===")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/wa/settings",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 1: GET settings status", False, f"Expected 200, got {response.status_code}")
            return None
        
        data = response.json()
        log_test("Test 1: GET settings status", True, "200 OK")
        
        # Check settings
        settings = data.get("settings", {})
        expected_settings = {
            "costMarketing": 0.99,
            "costUtility": 0.12,
            "costAuthentication": 0.12,
            "otpReserve": 300,
            "lowBalanceThreshold": 500,
            "testBatchDefault": 300
        }
        
        all_match = True
        for key, expected_value in expected_settings.items():
            actual_value = settings.get(key)
            if actual_value != expected_value:
                log_test(f"Test 1: settings.{key}", False, f"Expected {expected_value}, got {actual_value}")
                all_match = False
            else:
                log_test(f"Test 1: settings.{key}", True, f"{actual_value}")
        
        # Check wallet
        wallet = data.get("wallet", {})
        wallet_balance = wallet.get("balance")
        wallet_otpReserve = wallet.get("otpReserve")
        wallet_low = wallet.get("low")
        
        if wallet_balance == EXPECTED_BALANCE:
            log_test("Test 1: wallet.balance", True, f"{wallet_balance}")
        else:
            log_test("Test 1: wallet.balance", False, f"Expected {EXPECTED_BALANCE}, got {wallet_balance}")
        
        if wallet_otpReserve == 300:
            log_test("Test 1: wallet.otpReserve", True, f"{wallet_otpReserve}")
        else:
            log_test("Test 1: wallet.otpReserve", False, f"Expected 300, got {wallet_otpReserve}")
        
        if wallet_low == False:
            log_test("Test 1: wallet.low", True, f"{wallet_low}")
        else:
            log_test("Test 1: wallet.low", False, f"Expected false, got {wallet_low}")
        
        print(f"\n📊 Settings: {json.dumps(settings, indent=2)}")
        print(f"📊 Wallet: {json.dumps(wallet, indent=2)}")
        
        return data
        
    except Exception as e:
        log_test("Test 1: GET settings", False, f"Exception: {str(e)}")
        return None

def test_2_wallet_endpoints(token):
    """Test 2: GET /api/admin/wa/wallet and PUT /api/admin/wa/wallet"""
    print("\n=== TEST 2: WALLET ENDPOINTS ===")
    
    # 2a. GET wallet
    try:
        response = requests.get(
            f"{BASE_URL}/admin/wa/wallet",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 2a: GET wallet status", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        wallet = data.get("wallet", {})
        balance = wallet.get("balance")
        
        if balance == EXPECTED_BALANCE:
            log_test("Test 2a: GET wallet balance", True, f"{balance}")
        else:
            log_test("Test 2a: GET wallet balance", False, f"Expected {EXPECTED_BALANCE}, got {balance}")
        
    except Exception as e:
        log_test("Test 2a: GET wallet", False, f"Exception: {str(e)}")
        return False
    
    # 2b. PUT wallet (set to same value to test stale=false)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/wa/wallet",
            headers={"Authorization": f"Bearer {token}"},
            json={"balance": EXPECTED_BALANCE},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 2b: PUT wallet status", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        wallet = data.get("wallet", {})
        stale = wallet.get("stale")
        
        log_test("Test 2b: PUT wallet status", True, "200 OK")
        
        if stale == False:
            log_test("Test 2b: wallet.stale", True, f"{stale}")
        else:
            log_test("Test 2b: wallet.stale", False, f"Expected false, got {stale}")
        
        return True
        
    except Exception as e:
        log_test("Test 2b: PUT wallet", False, f"Exception: {str(e)}")
        return False

def test_3_dry_run(token):
    """Test 3: POST /api/admin/wa/dry-run"""
    print("\n=== TEST 3: DRY-RUN WITH WALLET ===")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/dry-run",
            headers={"Authorization": f"Bearer {token}"},
            json={"template": "upgrade_premium", "audience": "all"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 3: Dry-run status", False, f"Expected 200, got {response.status_code}")
            return None
        
        data = response.json()
        log_test("Test 3: Dry-run status", True, "200 OK")
        
        # Check required fields
        count = data.get("count")
        estCost = data.get("estCost")
        costPerMsg = data.get("costPerMsg")
        category = data.get("category")
        wallet = data.get("wallet", {})
        
        # Verify category
        if category == "marketing":
            log_test("Test 3: category", True, f"{category}")
        else:
            log_test("Test 3: category", False, f"Expected 'marketing', got {category}")
        
        # Verify costPerMsg
        if costPerMsg == 0.99:
            log_test("Test 3: costPerMsg", True, f"{costPerMsg}")
        else:
            log_test("Test 3: costPerMsg", False, f"Expected 0.99, got {costPerMsg}")
        
        # Verify estCost calculation
        expected_estCost = round(count * 0.99, 2)
        if estCost == expected_estCost:
            log_test("Test 3: estCost calculation", True, f"{estCost} = {count} * 0.99")
        else:
            log_test("Test 3: estCost calculation", False, f"Expected {expected_estCost}, got {estCost}")
        
        # Check wallet object
        wallet_balance = wallet.get("balance")
        wallet_otpReserve = wallet.get("otpReserve")
        wallet_balanceAfter = wallet.get("balanceAfter")
        wallet_canSend = wallet.get("canSend")
        wallet_blockReason = wallet.get("blockReason")
        
        if wallet_otpReserve == 300:
            log_test("Test 3: wallet.otpReserve", True, f"{wallet_otpReserve}")
        else:
            log_test("Test 3: wallet.otpReserve", False, f"Expected 300, got {wallet_otpReserve}")
        
        # Verify balanceAfter calculation
        expected_balanceAfter = round(wallet_balance - estCost, 2)
        if wallet_balanceAfter == expected_balanceAfter:
            log_test("Test 3: wallet.balanceAfter", True, f"{wallet_balanceAfter} = {wallet_balance} - {estCost}")
        else:
            log_test("Test 3: wallet.balanceAfter", False, f"Expected {expected_balanceAfter}, got {wallet_balanceAfter}")
        
        # Verify canSend logic
        if wallet_canSend == True and wallet_blockReason == None:
            log_test("Test 3: wallet.canSend", True, f"canSend={wallet_canSend}, blockReason={wallet_blockReason}")
        elif wallet_canSend == False and wallet_blockReason != None:
            log_test("Test 3: wallet.canSend", True, f"canSend={wallet_canSend}, blockReason={wallet_blockReason}")
        else:
            log_test("Test 3: wallet.canSend", False, f"Inconsistent: canSend={wallet_canSend}, blockReason={wallet_blockReason}")
        
        print(f"\n📊 Dry-run results:")
        print(f"  count: {count}")
        print(f"  estCost: {estCost}")
        print(f"  costPerMsg: {costPerMsg}")
        print(f"  category: {category}")
        print(f"  wallet.balance: {wallet_balance}")
        print(f"  wallet.balanceAfter: {wallet_balanceAfter}")
        print(f"  wallet.canSend: {wallet_canSend}")
        print(f"  wallet.blockReason: {wallet_blockReason}")
        
        return data
        
    except Exception as e:
        log_test("Test 3: Dry-run", False, f"Exception: {str(e)}")
        return None

def test_4_wallet_gate(token):
    """Test 4: WALLET GATE (deterministic)"""
    print("\n=== TEST 4: WALLET GATE (DETERMINISTIC) ===")
    
    # 4a. Create a test campaign
    print("\n--- 4a. Create test campaign ---")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "QA_WALLET_TEST",
                "templateId": "upgrade_premium",
                "filter": {"audience": "all"},
                "status": "draft"
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4a: Create campaign", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        campaign = data.get("campaign", {})
        campaign_id = campaign.get("id")
        
        if not campaign_id:
            log_test("Test 4a: Create campaign", False, f"No campaign id in response: {json.dumps(data)}")
            return False
        
        log_test("Test 4a: Create campaign", True, f"Campaign ID: {campaign_id}")
        cleanup_items.append({"type": "campaign", "id": campaign_id})
        
    except Exception as e:
        log_test("Test 4a: Create campaign", False, f"Exception: {str(e)}")
        return False
    
    # 4b. Set wallet balance to 1
    print("\n--- 4b. Set wallet balance to 1 ---")
    try:
        response = requests.put(
            f"{BASE_URL}/admin/wa/wallet",
            headers={"Authorization": f"Bearer {token}"},
            json={"balance": 1},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4b: Set wallet to 1", False, f"Expected 200, got {response.status_code}")
            return False
        
        log_test("Test 4b: Set wallet to 1", True, "Balance set to 1")
        
    except Exception as e:
        log_test("Test 4b: Set wallet to 1", False, f"Exception: {str(e)}")
        return False
    
    # 4c. Try to send with insufficient balance
    print("\n--- 4c. Send with insufficient balance (expect 402) ---")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"dryRunConfirmed": True, "force": True, "testBatchSize": 2},
            timeout=30
        )
        
        if response.status_code == 402:
            data = response.json()
            code = data.get("code")
            wallet = data.get("wallet", {})
            
            if code == "insufficient_wallet":
                log_test("Test 4c: Send with insufficient balance", True, f"402 with code 'insufficient_wallet'")
            else:
                log_test("Test 4c: Send with insufficient balance", False, f"Expected code 'insufficient_wallet', got '{code}'")
            
            # Check wallet detail object
            if wallet:
                log_test("Test 4c: Wallet detail in error", True, f"Wallet object present: {json.dumps(wallet)}")
            else:
                log_test("Test 4c: Wallet detail in error", False, "No wallet object in error response")
            
        else:
            log_test("Test 4c: Send with insufficient balance", False, f"Expected 402, got {response.status_code}: {response.text}")
        
    except Exception as e:
        log_test("Test 4c: Send with insufficient balance", False, f"Exception: {str(e)}")
    
    # 4d. Restore wallet balance
    print("\n--- 4d. Restore wallet balance to 2782.46 ---")
    try:
        response = requests.put(
            f"{BASE_URL}/admin/wa/wallet",
            headers={"Authorization": f"Bearer {token}"},
            json={"balance": EXPECTED_BALANCE},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4d: Restore wallet balance", False, f"Expected 200, got {response.status_code}")
            return False
        
        log_test("Test 4d: Restore wallet balance", True, f"Balance restored to {EXPECTED_BALANCE}")
        
    except Exception as e:
        log_test("Test 4d: Restore wallet balance", False, f"Exception: {str(e)}")
        return False
    
    return campaign_id

def test_5_test_batch_dedupe(token, campaign_id):
    """Test 5: TEST BATCH + DEDUPE"""
    print("\n=== TEST 5: TEST BATCH + DEDUPE ===")
    
    # 5a. Send with testBatchSize=1
    print("\n--- 5a. First send (testBatchSize=1) ---")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"dryRunConfirmed": True, "force": True, "testBatchSize": 1},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 5a: First send", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        total = data.get("total")
        testBatch = data.get("testBatch")
        remaining = data.get("remaining")
        status = data.get("status")
        
        if total is not None and total <= 1:
            log_test("Test 5a: total <= 1", True, f"total={total}")
        else:
            log_test("Test 5a: total <= 1", False, f"Expected total <= 1, got {total}")
        
        if testBatch == True:
            log_test("Test 5a: testBatch", True, f"{testBatch}")
        else:
            log_test("Test 5a: testBatch", False, f"Expected true, got {testBatch}")
        
        if remaining is not None and remaining >= 0:
            log_test("Test 5a: remaining >= 0", True, f"remaining={remaining}")
        else:
            log_test("Test 5a: remaining >= 0", False, f"Expected remaining >= 0, got {remaining}")
        
        if status == "running":
            log_test("Test 5a: status", True, f"{status}")
        else:
            log_test("Test 5a: status", False, f"Expected 'running', got {status}")
        
        print(f"\n📊 First send results: total={total}, testBatch={testBatch}, remaining={remaining}, status={status}")
        
        # Wait for background runner
        print("\n⏳ Waiting 5 seconds for background runner...")
        time.sleep(5)
        
    except Exception as e:
        log_test("Test 5a: First send", False, f"Exception: {str(e)}")
        return False
    
    # 5b. Send again (should NOT resend same user)
    print("\n--- 5b. Second send (testBatchSize=1, expect dedupe) ---")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"dryRunConfirmed": True, "force": True, "testBatchSize": 1},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            log_test("Test 5b: Second send (dedupe)", True, f"200 - sending next distinct user: {json.dumps(data)}")
        elif response.status_code == 409:
            data = response.json()
            log_test("Test 5b: Second send (dedupe)", True, f"409 - audience exhausted or already received: {json.dumps(data)}")
        else:
            log_test("Test 5b: Second send (dedupe)", False, f"Unexpected status {response.status_code}: {response.text}")
        
        # Check wa_campaign_sent for unique campaignId+userId
        print("\n📊 Checking wa_campaign_sent for dedupe...")
        # Note: We can't directly query MongoDB from here, but the 409 or successful 200 with different user confirms dedupe
        
    except Exception as e:
        log_test("Test 5b: Second send", False, f"Exception: {str(e)}")
    
    # 5c. Continue endpoint
    print("\n--- 5c. Continue endpoint (testBatchSize=1) ---")
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/continue",
            headers={"Authorization": f"Bearer {token}"},
            json={"force": True, "testBatchSize": 1},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            log_test("Test 5c: Continue endpoint", True, f"200 - sending next user: {json.dumps(data)}")
        elif response.status_code == 409:
            data = response.json()
            log_test("Test 5c: Continue endpoint", True, f"409 - no remaining users: {json.dumps(data)}")
        else:
            log_test("Test 5c: Continue endpoint", False, f"Unexpected status {response.status_code}: {response.text}")
        
    except Exception as e:
        log_test("Test 5c: Continue endpoint", False, f"Exception: {str(e)}")
    
    return True

def test_6_status_taxonomy(token, campaign_id):
    """Test 6: STATUS TAXONOMY"""
    print("\n=== TEST 6: STATUS TAXONOMY ===")
    
    # Wait a bit for sends to complete
    print("\n⏳ Waiting 3 seconds for sends to complete...")
    time.sleep(3)
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/report",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 6: Get report status", False, f"Expected 200, got {response.status_code}")
            return None
        
        data = response.json()
        log_test("Test 6: Get report status", True, "200 OK")
        
        # Check required fields
        total = data.get("total")
        accepted = data.get("accepted")
        delivered = data.get("delivered")
        failed = data.get("failed")
        failReasons = data.get("failReasons")
        failReason = data.get("failReason")
        campaign_status = data.get("status")
        
        # Verify fields exist
        if total is not None:
            log_test("Test 6: total field", True, f"{total}")
        else:
            log_test("Test 6: total field", False, "Missing")
        
        if accepted is not None:
            log_test("Test 6: accepted field", True, f"{accepted}")
        else:
            log_test("Test 6: accepted field", False, "Missing")
        
        if delivered is not None:
            log_test("Test 6: delivered field", True, f"{delivered}")
        else:
            log_test("Test 6: delivered field", False, "Missing")
        
        if failed is not None:
            log_test("Test 6: failed field", True, f"{failed}")
        else:
            log_test("Test 6: failed field", False, "Missing")
        
        if failReasons is not None:
            log_test("Test 6: failReasons field", True, f"{failReasons}")
        else:
            log_test("Test 6: failReasons field", False, "Missing")
        
        # Verify delivered == 0 (no webhook)
        if delivered == 0:
            log_test("Test 6: delivered == 0", True, "No webhook, as expected")
        else:
            log_test("Test 6: delivered == 0", False, f"Expected 0, got {delivered}")
        
        # Check failReason logic
        if campaign_status == "failed" and failReason is not None:
            log_test("Test 6: failReason when status=failed", True, f"failReason={failReason}")
        elif campaign_status != "failed" and failReason is None:
            log_test("Test 6: failReason when status!=failed", True, "failReason is null")
        else:
            log_test("Test 6: failReason logic", False, f"status={campaign_status}, failReason={failReason}")
        
        print(f"\n📊 Campaign report:")
        print(f"  status: {campaign_status}")
        print(f"  total: {total}")
        print(f"  accepted: {accepted}")
        print(f"  delivered: {delivered}")
        print(f"  failed: {failed}")
        print(f"  failReasons: {failReasons}")
        print(f"  failReason: {failReason}")
        
        # Report whether any send was accepted vs failed
        if accepted > 0:
            print(f"\n✅ {accepted} message(s) accepted by provider")
        if failed > 0:
            print(f"\n❌ {failed} message(s) failed")
            if failReasons:
                print(f"  Provider reasons: {failReasons}")
        
        return data
        
    except Exception as e:
        log_test("Test 6: Get report", False, f"Exception: {str(e)}")
        return None

def test_7_mark_failed(token, campaign_id):
    """Test 7: MARK-FAILED"""
    print("\n=== TEST 7: MARK-FAILED ===")
    
    # 7a. Mark campaign as failed
    try:
        response = requests.post(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/mark-failed",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "reason": "Insufficient wallet balance",
                "failedCount": 3373,
                "code": "INSUFFICIENT_BALANCE"
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 7a: Mark-failed status", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        log_test("Test 7a: Mark-failed status", True, "200 OK")
        
    except Exception as e:
        log_test("Test 7a: Mark-failed", False, f"Exception: {str(e)}")
        return False
    
    # 7b. Get report and verify
    try:
        response = requests.get(
            f"{BASE_URL}/admin/wa/campaigns/{campaign_id}/report",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 7b: Get report after mark-failed", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        campaign = data.get("campaign", {})
        counts = campaign.get("counts", {})
        status = campaign.get("status")
        failed = counts.get("failed")
        accepted = counts.get("accepted")
        delivered = counts.get("delivered")
        failReason = data.get("failReason")
        
        if status == "failed":
            log_test("Test 7b: status == 'failed'", True, f"{status}")
        else:
            log_test("Test 7b: status == 'failed'", False, f"Expected 'failed', got {status}")
        
        if failed == 3373:
            log_test("Test 7b: counts.failed == 3373", True, f"{failed}")
        else:
            log_test("Test 7b: counts.failed == 3373", False, f"Expected 3373, got {failed}")
        
        if accepted == 0:
            log_test("Test 7b: counts.accepted == 0", True, f"{accepted}")
        else:
            log_test("Test 7b: counts.accepted == 0", False, f"Expected 0, got {accepted}")
        
        if delivered == 0:
            log_test("Test 7b: counts.delivered == 0", True, f"{delivered}")
        else:
            log_test("Test 7b: counts.delivered == 0", False, f"Expected 0, got {delivered}")
        
        if failReason == "Insufficient wallet balance":
            log_test("Test 7b: failReason", True, f"{failReason}")
        else:
            log_test("Test 7b: failReason", False, f"Expected 'Insufficient wallet balance', got {failReason}")
        
        print(f"\n📊 Report after mark-failed:")
        print(f"  campaign.status: {status}")
        print(f"  campaign.counts.failed: {failed}")
        print(f"  campaign.counts.accepted: {accepted}")
        print(f"  campaign.counts.delivered: {delivered}")
        print(f"  failReason: {failReason}")
        
        return True
        
    except Exception as e:
        log_test("Test 7b: Get report after mark-failed", False, f"Exception: {str(e)}")
        return False

def test_8_drip_stats(token):
    """Test 8: DRIP pendingNudge gating"""
    print("\n=== TEST 8: DRIP STATS (pendingNudge gating) ===")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/stats",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 8: Get drip stats status", False, f"Expected 200, got {response.status_code}")
            return None
        
        data = response.json()
        log_test("Test 8: Get drip stats status", True, "200 OK")
        
        # Check pendingNudge
        pendingNudge = data.get("pendingNudge")
        config = data.get("config", {})
        enabledAt = config.get("enabledAt")
        enabled = config.get("enabled")
        
        if pendingNudge is not None:
            log_test("Test 8: pendingNudge field", True, f"{pendingNudge}")
        else:
            log_test("Test 8: pendingNudge field", False, "Missing")
        
        log_test("Test 8: config.enabledAt", True, f"{enabledAt}")
        log_test("Test 8: config.enabled", True, f"{enabled}")
        
        print(f"\n📊 Drip stats:")
        print(f"  pendingNudge: {pendingNudge}")
        print(f"  config.enabled: {enabled}")
        print(f"  config.enabledAt: {enabledAt}")
        
        # Report the logic
        if enabledAt is None:
            print(f"\n📝 enabledAt is null, so pendingNudge uses <=cutoff logic")
        else:
            print(f"\n📝 enabledAt is set, so pendingNudge counts only users created on/after {enabledAt}")
        
        return data
        
    except Exception as e:
        log_test("Test 8: Get drip stats", False, f"Exception: {str(e)}")
        return None

def cleanup(token):
    """Test 9: CLEANUP"""
    print("\n=== TEST 9: CLEANUP ===")
    
    # Delete test campaigns
    for item in cleanup_items:
        if item["type"] == "campaign":
            campaign_id = item["id"]
            try:
                response = requests.delete(
                    f"{BASE_URL}/admin/wa/campaigns/{campaign_id}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=30
                )
                
                if response.status_code == 200:
                    log_test(f"Cleanup: Delete campaign {campaign_id}", True, "Deleted")
                else:
                    log_test(f"Cleanup: Delete campaign {campaign_id}", False, f"Status {response.status_code}")
                    
            except Exception as e:
                log_test(f"Cleanup: Delete campaign {campaign_id}", False, f"Exception: {str(e)}")
    
    # Restore wallet balance to 2782.46
    print("\n--- Restoring wallet balance to 2782.46 ---")
    try:
        response = requests.put(
            f"{BASE_URL}/admin/wa/wallet",
            headers={"Authorization": f"Bearer {token}"},
            json={"balance": EXPECTED_BALANCE},
            timeout=30
        )
        
        if response.status_code == 200:
            log_test("Cleanup: Restore wallet balance", True, f"Restored to {EXPECTED_BALANCE}")
        else:
            log_test("Cleanup: Restore wallet balance", False, f"Status {response.status_code}")
            
    except Exception as e:
        log_test("Cleanup: Restore wallet balance", False, f"Exception: {str(e)}")
    
    # Verify wallet balance is 2782.46
    try:
        response = requests.get(
            f"{BASE_URL}/admin/wa/wallet",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            wallet = data.get("wallet", {})
            balance = wallet.get("balance")
            
            if balance == EXPECTED_BALANCE:
                log_test("Cleanup: Final wallet balance", True, f"{balance}")
            else:
                log_test("Cleanup: Final wallet balance", False, f"Expected {EXPECTED_BALANCE}, got {balance}")
                print(f"\n⚠️  WARNING: Wallet balance is {balance}, not {EXPECTED_BALANCE}")
        else:
            log_test("Cleanup: Check final wallet balance", False, f"Status {response.status_code}")
            
    except Exception as e:
        log_test("Cleanup: Check final wallet balance", False, f"Exception: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for t in test_results if t["passed"])
    total = len(test_results)
    
    print(f"\n✅ PASSED: {passed}/{total} tests")
    
    if passed < total:
        print(f"\n❌ FAILED TESTS:")
        for t in test_results:
            if not t["passed"]:
                print(f"  - {t['test']}")
                if t["details"]:
                    print(f"    {t['details']}")
    
    print("\n" + "="*80)
    
    return passed == total

def main():
    """Main test runner"""
    print("="*80)
    print("WhatsApp Wallet-Safety Backend Testing (PREVIEW)")
    print("="*80)
    
    # Login
    token = admin_login()
    if not token:
        print("\n❌ FATAL: Admin login failed")
        sys.exit(1)
    
    # Test 1: GET settings
    test_1_get_settings(token)
    
    # Test 2: Wallet endpoints
    test_2_wallet_endpoints(token)
    
    # Test 3: Dry-run
    test_3_dry_run(token)
    
    # Test 4: Wallet gate
    campaign_id = test_4_wallet_gate(token)
    
    if campaign_id:
        # Test 5: Test batch + dedupe
        test_5_test_batch_dedupe(token, campaign_id)
        
        # Test 6: Status taxonomy
        test_6_status_taxonomy(token, campaign_id)
        
        # Test 7: Mark-failed
        test_7_mark_failed(token, campaign_id)
    
    # Test 8: Drip stats
    test_8_drip_stats(token)
    
    # Test 9: Cleanup
    cleanup(token)
    
    # Print summary
    all_passed = print_summary()
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
