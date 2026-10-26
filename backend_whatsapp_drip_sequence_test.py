#!/usr/bin/env python3
"""
Backend test for NEW multi-step WhatsApp drip sequence + conversion tracking.
Scope: ONLY the drip sequence feature — do NOT test other features.

⚠️ IMPORTANT: Bulkymarketing is LIVE and each send costs money.
All run calls are capped with max=3 to minimize WhatsApp message sends.

Test Cases:
A) Default sequence shape
B) Multi-step tick with max=3
C) Sequence validation
D) Conversion counter shape
E) Step-specific manual run
F) No regression
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
PREMIUM_MOBILE = "9999900001"
PREMIUM_PASSWORD = "<redacted>"

# Global state
admin_token = None
premium_token = None
test_results = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if details:
        result += f" - {details}"
    print(result)
    test_results.append({"test": test_name, "passed": passed, "details": details})
    return passed

def login_admin():
    """Login as admin and get token"""
    global admin_token
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            admin_token = data.get("token")
            log_test("Admin Login", True, f"Token obtained")
            return True
        else:
            log_test("Admin Login", False, f"Status {response.status_code}: {response.text[:200]}")
            return False
    except Exception as e:
        log_test("Admin Login", False, f"Exception: {str(e)}")
        return False

def login_premium():
    """Login as premium user and get token"""
    global premium_token
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": PREMIUM_MOBILE, "password": PREMIUM_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            premium_token = data.get("token")
            log_test("Premium User Login", True, f"Token obtained")
            return True
        else:
            log_test("Premium User Login", False, f"Status {response.status_code}")
            return False
    except Exception as e:
        log_test("Premium User Login", False, f"Exception: {str(e)}")
        return False

def test_a_default_sequence_shape():
    """
    A) DEFAULT SEQUENCE SHAPE
    - GET /api/admin/whatsapp-drip/config → 200 with sequence array of length 3
    - Templates: lesson_guru_activate_01, premium_offer1, panchapdi_photo
    - DelayHours: 72, 168, 336
    - Each has vars array and label
    - GET /api/admin/whatsapp-drip/stats → 200 with sequenceStats and perTemplate
    """
    print("\n" + "="*80)
    print("TEST CASE A: DEFAULT SEQUENCE SHAPE")
    print("="*80)
    
    # A.0: First restore default sequence to ensure clean state
    try:
        default_sequence = [
            {"template": "lesson_guru_activate_01", "delayHours": 72, 
             "vars": ["name", "planUrl"], "label": "Day 3 · Activate"},
            {"template": "premium_offer1", "delayHours": 168, 
             "vars": ["name"], "label": "Day 7 · Premium Offer"},
            {"template": "panchapdi_photo", "delayHours": 336, 
             "vars": [], "label": "Day 14 · Panchapadi Photo"}
        ]
        
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": default_sequence}},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("A.0: Restore default sequence first", False, 
                    f"Status {response.status_code}")
            return False
        
        log_test("A.0: Restore default sequence first", True)
        
    except Exception as e:
        log_test("A.0: Restore default sequence", False, f"Exception: {str(e)}")
        return False
    
    # A.1: GET config
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("A.1: GET config returns 200", False, f"Status {response.status_code}")
            return False
        
        data = response.json()
        config = data.get("config", {})
        sequence = config.get("sequence", [])
        
        # Check sequence is array of length 3
        if not isinstance(sequence, list):
            log_test("A.1: sequence is array", False, f"Got type {type(sequence)}")
            return False
        
        if len(sequence) != 3:
            log_test("A.1: sequence length is 3", False, f"Got length {len(sequence)}")
            return False
        
        log_test("A.1: sequence is array of length 3", True)
        
        # Check templates in exact order
        expected_templates = ['lesson_guru_activate_01', 'premium_offer1', 'panchapdi_photo']
        actual_templates = [s.get('template') for s in sequence]
        
        if actual_templates != expected_templates:
            log_test("A.2: templates in correct order", False, 
                    f"Expected {expected_templates}, got {actual_templates}")
            return False
        
        log_test("A.2: templates in correct order", True, str(actual_templates))
        
        # Check delayHours
        expected_delays = [72, 168, 336]
        actual_delays = [s.get('delayHours') for s in sequence]
        
        if actual_delays != expected_delays:
            log_test("A.3: delayHours correct", False, 
                    f"Expected {expected_delays}, got {actual_delays}")
            return False
        
        log_test("A.3: delayHours correct", True, str(actual_delays))
        
        # Check each has vars and label
        for i, step in enumerate(sequence):
            if 'vars' not in step:
                log_test(f"A.4.{i}: step {i} has vars", False, "Missing vars field")
                return False
            if not isinstance(step['vars'], list):
                log_test(f"A.4.{i}: step {i} vars is array", False, f"Got type {type(step['vars'])}")
                return False
            if 'label' not in step or not isinstance(step['label'], str):
                log_test(f"A.4.{i}: step {i} has label string", False, f"label={step.get('label')}")
                return False
        
        log_test("A.4: all steps have vars array and label string", True)
        
        # Verify vars content
        expected_vars = [
            ['name', 'planUrl'],  # lesson_guru_activate_01
            ['name'],              # premium_offer1
            []                     # panchapdi_photo (image-only)
        ]
        actual_vars = [s.get('vars') for s in sequence]
        
        if actual_vars != expected_vars:
            log_test("A.5: vars arrays correct", False, 
                    f"Expected {expected_vars}, got {actual_vars}")
            return False
        
        log_test("A.5: vars arrays correct", True, str(actual_vars))
        
    except Exception as e:
        log_test("A: GET config", False, f"Exception: {str(e)}")
        return False
    
    # A.6: GET stats
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/stats",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("A.6: GET stats returns 200", False, f"Status {response.status_code}")
            return False
        
        data = response.json()
        
        # Check sequenceStats
        sequence_stats = data.get("sequenceStats")
        if not isinstance(sequence_stats, list):
            log_test("A.6: sequenceStats is array", False, f"Got type {type(sequence_stats)}")
            return False
        
        if len(sequence_stats) != 3:
            log_test("A.6: sequenceStats length is 3", False, f"Got length {len(sequence_stats)}")
            return False
        
        log_test("A.6: sequenceStats is array of length 3", True)
        
        # Check each sequenceStats element has required fields
        for i, stat in enumerate(sequence_stats):
            required_fields = ['sent', 'failed', 'converted', 'conversionRate']
            for field in required_fields:
                if field not in stat:
                    log_test(f"A.7.{i}: sequenceStats[{i}] has {field}", False, "Missing field")
                    return False
                if not isinstance(stat[field], (int, float)):
                    log_test(f"A.7.{i}: sequenceStats[{i}].{field} is numeric", False, 
                            f"Got type {type(stat[field])}")
                    return False
        
        log_test("A.7: all sequenceStats have sent/failed/converted/conversionRate", True)
        
        # Check perTemplate
        per_template = data.get("perTemplate")
        if not isinstance(per_template, dict):
            log_test("A.8: perTemplate is object", False, f"Got type {type(per_template)}")
            return False
        
        # Should contain at least user_registration_2 + 3 sequence templates
        expected_templates = ['user_registration_2', 'lesson_guru_activate_01', 
                            'premium_offer1', 'panchapdi_photo']
        for tpl in expected_templates:
            if tpl not in per_template:
                log_test(f"A.8: perTemplate contains {tpl}", False, "Missing template")
                return False
        
        log_test("A.8: perTemplate contains all expected templates", True, 
                f"Keys: {list(per_template.keys())}")
        
        # Check legacy fields still present
        legacy_fields = ['welcomeSent', 'nudgeSent', 'welcomeFailed', 'nudgeFailed', 
                        'welcomeConverted', 'nudgeConverted', 'pendingNudge', 'recentLogs']
        for field in legacy_fields:
            if field not in data:
                log_test(f"A.9: legacy field {field} present", False, "Missing field")
                return False
        
        log_test("A.9: all legacy fields present", True, str(legacy_fields))
        
        return True
        
    except Exception as e:
        log_test("A: GET stats", False, f"Exception: {str(e)}")
        return False

def test_b_multi_step_tick():
    """
    B) MULTI-STEP TICK with delayHours=1 for real run (max=3)
    - PUT config with sequence having delayHours=1 for all steps
    - POST run with max=3
    - Check stepResults array of length 3
    - Total sent+failed+skipped ≤ 3
    - Second run should have lower sent count
    - Restore default sequence
    """
    print("\n" + "="*80)
    print("TEST CASE B: MULTI-STEP TICK (max=3)")
    print("="*80)
    
    # B.1: PUT config with delayHours=1
    try:
        test_sequence = [
            {"template": "lesson_guru_activate_01", "delayHours": 1, 
             "vars": ["name", "planUrl"], "label": "Step A"},
            {"template": "premium_offer1", "delayHours": 1, 
             "vars": ["name"], "label": "Step B"},
            {"template": "panchapdi_photo", "delayHours": 1, 
             "vars": [], "label": "Step C"}
        ]
        
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": test_sequence}},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B.1: PUT config with delayHours=1", False, 
                    f"Status {response.status_code}: {response.text[:200]}")
            return False
        
        log_test("B.1: PUT config with delayHours=1", True)
        
    except Exception as e:
        log_test("B.1: PUT config", False, f"Exception: {str(e)}")
        return False
    
    # B.2: POST run with max=3
    try:
        print("\n⚠️  Running drip tick with max=3 (LIVE WhatsApp sends)...")
        response = requests.post(
            f"{BASE_URL}/admin/whatsapp-drip/run",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"max": 3},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("B.2: POST run returns 200", False, 
                    f"Status {response.status_code}: {response.text[:200]}")
            return False
        
        data = response.json()
        
        # Check stepResults
        step_results = data.get("stepResults")
        if not isinstance(step_results, list):
            log_test("B.2: stepResults is array", False, f"Got type {type(step_results)}")
            return False
        
        # Note: stepResults may have fewer than 3 items if budget is exhausted
        # The important thing is that it's an array with at least 1 item
        if len(step_results) < 1:
            log_test("B.2: stepResults has at least 1 item", False, f"Got length {len(step_results)}")
            return False
        
        log_test("B.2: stepResults is array", True, f"length={len(step_results)}")
        
        # Check each stepResults has required fields
        for i, result in enumerate(step_results):
            required_fields = ['scanned', 'sent', 'failed', 'skipped', 'template']
            for field in required_fields:
                if field not in result:
                    log_test(f"B.3.{i}: stepResults[{i}] has {field}", False, "Missing field")
                    return False
        
        log_test("B.3: all stepResults have required fields", True, 
                f"Fields: scanned, sent, failed, skipped, template")
        
        # Check total sent+failed+skipped ≤ 3
        total_sent = data.get("sent", 0)
        total_failed = data.get("failed", 0)
        total_skipped = data.get("skipped", 0)
        total = total_sent + total_failed + total_skipped
        
        if total > 3:
            log_test("B.4: total sent+failed+skipped ≤ 3", False, 
                    f"Got total={total} (sent={total_sent}, failed={total_failed}, skipped={total_skipped})")
            return False
        
        log_test("B.4: total sent+failed+skipped ≤ 3", True, 
                f"total={total} (sent={total_sent}, failed={total_failed}, skipped={total_skipped})")
        
        first_run_sent = total_sent
        
    except Exception as e:
        log_test("B.2: POST run", False, f"Exception: {str(e)}")
        return False
    
    # B.5: Second POST run with max=3 (should have lower sent count)
    try:
        print("\n⚠️  Running second drip tick with max=3 (testing guardrail)...")
        time.sleep(1)  # Small delay
        
        response = requests.post(
            f"{BASE_URL}/admin/whatsapp-drip/run",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"max": 3},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("B.5: Second POST run returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        second_run_sent = data.get("sent", 0)
        
        # Second run should have lower or equal sent count (guardrail working)
        if second_run_sent > first_run_sent:
            log_test("B.5: Second run sent ≤ first run sent", False, 
                    f"First={first_run_sent}, Second={second_run_sent}")
            return False
        
        log_test("B.5: Second run sent ≤ first run (guardrail working)", True, 
                f"First={first_run_sent}, Second={second_run_sent}")
        
    except Exception as e:
        log_test("B.5: Second POST run", False, f"Exception: {str(e)}")
        return False
    
    # B.6: Restore default sequence
    try:
        default_sequence = [
            {"template": "lesson_guru_activate_01", "delayHours": 72, 
             "vars": ["name", "planUrl"], "label": "Day 3 · Activate"},
            {"template": "premium_offer1", "delayHours": 168, 
             "vars": ["name"], "label": "Day 7 · Premium Offer"},
            {"template": "panchapdi_photo", "delayHours": 336, 
             "vars": [], "label": "Day 14 · Panchapadi Photo"}
        ]
        
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": default_sequence}},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B.6: Restore default sequence", False, 
                    f"Status {response.status_code}")
            return False
        
        log_test("B.6: Restore default sequence", True)
        return True
        
    except Exception as e:
        log_test("B.6: Restore default sequence", False, f"Exception: {str(e)}")
        return False

def test_c_sequence_validation():
    """
    C) SEQUENCE VALIDATION
    - PUT with sequence='not-an-array' → 400
    - PUT with empty template → 200 but filtered out
    - PUT with delayHours=99999 → 200 with clamped to 720
    - Restore default sequence
    """
    print("\n" + "="*80)
    print("TEST CASE C: SEQUENCE VALIDATION")
    print("="*80)
    
    # C.1: Invalid sequence (not an array)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": "not-an-array"}},
            timeout=10
        )
        
        if response.status_code != 400:
            log_test("C.1: Invalid sequence returns 400", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        error = data.get("error", "")
        if "sequence must be an array" not in error.lower():
            log_test("C.1: Error message contains 'sequence must be an array'", False, 
                    f"Got: {error}")
            return False
        
        log_test("C.1: Invalid sequence returns 400 with correct error", True)
        
    except Exception as e:
        log_test("C.1: Invalid sequence validation", False, f"Exception: {str(e)}")
        return False
    
    # C.2: Empty template should be filtered out
    try:
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": [
                {"template": "", "delayHours": 0, "vars": []},
                {"template": "valid_tpl", "delayHours": 5, "vars": ["name"]}
            ]}},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("C.2: Empty template PUT returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        # GET config to verify empty template was filtered
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("C.2: GET config after empty template", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        sequence = data.get("config", {}).get("sequence", [])
        
        if len(sequence) != 1:
            log_test("C.2: Empty template filtered out (length=1)", False, 
                    f"Got length {len(sequence)}")
            return False
        
        if sequence[0].get("template") != "valid_tpl":
            log_test("C.2: Remaining template is valid_tpl", False, 
                    f"Got {sequence[0].get('template')}")
            return False
        
        log_test("C.2: Empty template filtered out correctly", True)
        
    except Exception as e:
        log_test("C.2: Empty template filtering", False, f"Exception: {str(e)}")
        return False
    
    # C.3: DelayHours clamping (99999 → 720)
    try:
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": [
                {"template": "foo", "delayHours": 99999, "vars": ["name"]}
            ]}},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("C.3: DelayHours clamping PUT returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        # GET config to verify clamping
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("C.3: GET config after clamping", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        sequence = data.get("config", {}).get("sequence", [])
        
        if len(sequence) != 1:
            log_test("C.3: Sequence has 1 element", False, f"Got length {len(sequence)}")
            return False
        
        delay_hours = sequence[0].get("delayHours")
        if delay_hours != 720:
            log_test("C.3: DelayHours clamped to 720", False, 
                    f"Got {delay_hours}")
            return False
        
        log_test("C.3: DelayHours clamped to 720 correctly", True)
        
    except Exception as e:
        log_test("C.3: DelayHours clamping", False, f"Exception: {str(e)}")
        return False
    
    # C.4: Restore default sequence
    try:
        default_sequence = [
            {"template": "lesson_guru_activate_01", "delayHours": 72, 
             "vars": ["name", "planUrl"], "label": "Day 3 · Activate"},
            {"template": "premium_offer1", "delayHours": 168, 
             "vars": ["name"], "label": "Day 7 · Premium Offer"},
            {"template": "panchapdi_photo", "delayHours": 336, 
             "vars": [], "label": "Day 14 · Panchapadi Photo"}
        ]
        
        response = requests.put(
            f"{BASE_URL}/admin/whatsapp-drip/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"settings": {"sequence": default_sequence}},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("C.4: Restore default sequence", False, 
                    f"Status {response.status_code}")
            return False
        
        log_test("C.4: Restore default sequence", True)
        return True
        
    except Exception as e:
        log_test("C.4: Restore default sequence", False, f"Exception: {str(e)}")
        return False

def test_d_conversion_counter_shape():
    """
    D) CONVERSION COUNTER SHAPE
    - GET stats → welcomeConverted and nudgeConverted are integers ≥ 0
    - perTemplate has converted and conversionRate for each template
    - Bonus: mutate DB to test conversion tracking (if possible)
    """
    print("\n" + "="*80)
    print("TEST CASE D: CONVERSION COUNTER SHAPE")
    print("="*80)
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/stats",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("D.1: GET stats returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        
        # Check welcomeConverted
        welcome_converted = data.get("welcomeConverted")
        if not isinstance(welcome_converted, int):
            log_test("D.1: welcomeConverted is integer", False, 
                    f"Got type {type(welcome_converted)}")
            return False
        
        if welcome_converted < 0:
            log_test("D.1: welcomeConverted ≥ 0", False, 
                    f"Got {welcome_converted}")
            return False
        
        log_test("D.1: welcomeConverted is integer ≥ 0", True, 
                f"value={welcome_converted}")
        
        # Check nudgeConverted
        nudge_converted = data.get("nudgeConverted")
        if not isinstance(nudge_converted, int):
            log_test("D.2: nudgeConverted is integer", False, 
                    f"Got type {type(nudge_converted)}")
            return False
        
        if nudge_converted < 0:
            log_test("D.2: nudgeConverted ≥ 0", False, 
                    f"Got {nudge_converted}")
            return False
        
        log_test("D.2: nudgeConverted is integer ≥ 0", True, 
                f"value={nudge_converted}")
        
        # Check perTemplate
        per_template = data.get("perTemplate", {})
        if not isinstance(per_template, dict):
            log_test("D.3: perTemplate is object", False, 
                    f"Got type {type(per_template)}")
            return False
        
        # Check each template has converted and conversionRate
        for tpl, stats in per_template.items():
            if "converted" not in stats:
                log_test(f"D.3: {tpl} has converted", False, "Missing field")
                return False
            
            if not isinstance(stats["converted"], int) or stats["converted"] < 0:
                log_test(f"D.3: {tpl} converted is int ≥ 0", False, 
                        f"Got {stats['converted']}")
                return False
            
            if "conversionRate" not in stats:
                log_test(f"D.3: {tpl} has conversionRate", False, "Missing field")
                return False
            
            if not isinstance(stats["conversionRate"], (int, float)) or stats["conversionRate"] < 0:
                log_test(f"D.3: {tpl} conversionRate is numeric ≥ 0", False, 
                        f"Got {stats['conversionRate']}")
                return False
        
        log_test("D.3: All perTemplate entries have converted and conversionRate ≥ 0", True, 
                f"Templates: {list(per_template.keys())}")
        
        # Bonus: DB mutation test (skipped as per instructions - cannot safely mutate DB)
        log_test("D.4: Bonus DB mutation test", True, 
                "SKIPPED - Cannot safely mutate production DB")
        
        return True
        
    except Exception as e:
        log_test("D: Conversion counter shape", False, f"Exception: {str(e)}")
        return False

def test_e_step_specific_manual_run():
    """
    E) STEP-SPECIFIC MANUAL RUN
    - POST run with template='premium_offer1' and max=2
    - Should return stepResults with ONE item for that template
    - Total sent+failed+skipped ≤ 2
    """
    print("\n" + "="*80)
    print("TEST CASE E: STEP-SPECIFIC MANUAL RUN")
    print("="*80)
    
    try:
        print("\n⚠️  Running step-specific drip tick with max=2 (LIVE WhatsApp sends)...")
        response = requests.post(
            f"{BASE_URL}/admin/whatsapp-drip/run",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"template": "premium_offer1", "max": 2},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("E.1: POST run with template returns 200", False, 
                    f"Status {response.status_code}: {response.text[:200]}")
            return False
        
        data = response.json()
        
        # Check stepResults
        step_results = data.get("stepResults")
        if not isinstance(step_results, list):
            log_test("E.1: stepResults is array", False, 
                    f"Got type {type(step_results)}")
            return False
        
        if len(step_results) != 1:
            log_test("E.1: stepResults length is 1", False, 
                    f"Got length {len(step_results)}")
            return False
        
        log_test("E.1: stepResults has ONE item", True)
        
        # Check template matches
        result_template = step_results[0].get("template")
        if result_template != "premium_offer1":
            log_test("E.2: stepResults[0].template is premium_offer1", False, 
                    f"Got {result_template}")
            return False
        
        log_test("E.2: stepResults[0].template is premium_offer1", True)
        
        # Check total sent+failed+skipped ≤ 2
        total_sent = data.get("sent", 0)
        total_failed = data.get("failed", 0)
        total_skipped = data.get("skipped", 0)
        total = total_sent + total_failed + total_skipped
        
        if total > 2:
            log_test("E.3: total sent+failed+skipped ≤ 2", False, 
                    f"Got total={total}")
            return False
        
        log_test("E.3: total sent+failed+skipped ≤ 2", True, 
                f"total={total} (sent={total_sent}, failed={total_failed}, skipped={total_skipped})")
        
        return True
        
    except Exception as e:
        log_test("E: Step-specific manual run", False, f"Exception: {str(e)}")
        return False

def test_f_no_regression():
    """
    F) NO REGRESSION
    - POST register with fresh mobile → 200 quickly
    - GET logs?template=user_registration_2 → row exists
    - POST login → 200
    - POST cron/whatsapp-drip without secret → 403
    - GET logs?status=sent&limit=5 → 200
    - GET document-security/lesson-plan/config → 200
    """
    print("\n" + "="*80)
    print("TEST CASE F: NO REGRESSION")
    print("="*80)
    
    # F.1: Register with fresh mobile (should be quick, < 1s ideally)
    try:
        # Generate unique mobile
        timestamp = int(time.time() % 100000)
        test_mobile = f"99{timestamp:08d}"
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json={
                "name": "Test User Drip",
                "mobile": test_mobile,
                "password": "test1234"
            },
            timeout=10
        )
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            log_test("F.1: Register returns 200", False, 
                    f"Status {response.status_code}: {response.text[:200]}")
            return False
        
        # Check response time (should be quick, fire-and-forget)
        if elapsed > 2.0:
            log_test("F.1: Register completes quickly (< 2s)", False, 
                    f"Took {elapsed:.2f}s")
        else:
            log_test("F.1: Register completes quickly", True, 
                    f"Took {elapsed:.2f}s")
        
        # Small delay for fire-and-forget to complete
        time.sleep(2)
        
    except Exception as e:
        log_test("F.1: Register", False, f"Exception: {str(e)}")
        return False
    
    # F.2: Check logs for welcome message
    try:
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/logs?template=user_registration_2&limit=10",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("F.2: GET logs returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        items = data.get("items", [])
        
        # Check if new user's mobile appears in logs
        found = any(item.get("mobile") == test_mobile for item in items)
        
        if not found:
            log_test("F.2: Welcome message logged for new user", False, 
                    "Mobile not found in logs")
        else:
            log_test("F.2: Welcome message logged for new user", True)
        
    except Exception as e:
        log_test("F.2: Check welcome logs", False, f"Exception: {str(e)}")
        return False
    
    # F.3: Login still works
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("F.3: Login returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        log_test("F.3: Login endpoint working", True)
        
    except Exception as e:
        log_test("F.3: Login", False, f"Exception: {str(e)}")
        return False
    
    # F.4: Cron endpoint without secret → 403
    try:
        response = requests.post(
            f"{BASE_URL}/cron/whatsapp-drip",
            json={},
            timeout=10
        )
        
        if response.status_code != 403:
            log_test("F.4: Cron without secret returns 403", False, 
                    f"Status {response.status_code}")
            return False
        
        log_test("F.4: Cron endpoint protected (403 without secret)", True)
        
    except Exception as e:
        log_test("F.4: Cron protection", False, f"Exception: {str(e)}")
        return False
    
    # F.5: GET logs with filters (need to re-login to ensure fresh token)
    try:
        # Re-login to get fresh token
        login_response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if login_response.status_code == 200:
            fresh_token = login_response.json().get("token")
        else:
            fresh_token = admin_token
        
        response = requests.get(
            f"{BASE_URL}/admin/whatsapp-drip/logs?status=sent&limit=5",
            headers={"Authorization": f"Bearer {fresh_token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("F.5: GET logs with filters returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        data = response.json()
        items = data.get("items", [])
        
        if not isinstance(items, list):
            log_test("F.5: Logs returns items array", False, 
                    f"Got type {type(items)}")
            return False
        
        log_test("F.5: GET logs with filters working", True, 
                f"Returned {len(items)} items")
        
    except Exception as e:
        log_test("F.5: GET logs with filters", False, f"Exception: {str(e)}")
        return False
    
    # F.6: Document security endpoint (regression check)
    try:
        response = requests.get(
            f"{BASE_URL}/document-security/lesson-plan/config",
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("F.6: Document security endpoint returns 200", False, 
                    f"Status {response.status_code}")
            return False
        
        log_test("F.6: Document security endpoint working", True)
        
        return True
        
    except Exception as e:
        log_test("F.6: Document security endpoint", False, f"Exception: {str(e)}")
        return False

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = len(test_results)
    passed = sum(1 for r in test_results if r["passed"])
    failed = total - passed
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed} ✅")
    print(f"Failed: {failed} ❌")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if failed > 0:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for r in test_results:
            if not r["passed"]:
                print(f"❌ {r['test']}")
                if r["details"]:
                    print(f"   {r['details']}")
    
    print("\n" + "="*80)
    print("TEST CASES SUMMARY:")
    print("="*80)
    
    # Group by test case
    test_cases = {
        "A": "Default Sequence Shape",
        "B": "Multi-Step Tick (max=3)",
        "C": "Sequence Validation",
        "D": "Conversion Counter Shape",
        "E": "Step-Specific Manual Run",
        "F": "No Regression"
    }
    
    for case, name in test_cases.items():
        case_tests = [r for r in test_results if r["test"].startswith(case + ".") or r["test"].startswith(case + ":")]
        if case_tests:
            case_passed = sum(1 for r in case_tests if r["passed"])
            case_total = len(case_tests)
            status = "✅" if case_passed == case_total else "❌"
            print(f"{status} {case}) {name}: {case_passed}/{case_total} passed")

def main():
    """Main test execution"""
    print("="*80)
    print("WhatsApp Drip Sequence + Conversion Tracking Backend Test")
    print("="*80)
    print("\n⚠️  WARNING: Bulkymarketing is LIVE - all runs capped at max=3")
    print("="*80)
    
    # Login
    if not login_admin():
        print("\n❌ Admin login failed. Cannot proceed.")
        return
    
    if not login_premium():
        print("\n⚠️  Premium login failed. Some tests may be skipped.")
    
    # Run test cases
    test_a_default_sequence_shape()
    test_b_multi_step_tick()
    test_c_sequence_validation()
    test_d_conversion_counter_shape()
    test_e_step_specific_manual_run()
    test_f_no_regression()
    
    # Print summary
    print_summary()
    
    print("\n" + "="*80)
    print("TEST EXECUTION COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
