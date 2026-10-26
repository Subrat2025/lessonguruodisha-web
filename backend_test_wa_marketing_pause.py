#!/usr/bin/env python3
"""
Backend test for WhatsApp Marketing Pause feature (131049).
Tests the manual pause/unpause functionality for marketing messages.

Test Plan (from review request):
STEP 1 — Admin login + find real recipient via dry-run
STEP 2 — Manual pause: POST /api/admin/wa/marketing-pause
STEP 3 — Verify pause reflected in dry-run breakdown (marketing template)
STEP 4 — UTILITY exemption: verify marketingPaused == 0 for utility templates
STEP 5 — Unpause: POST /api/admin/wa/marketing-pause with action=unpause
STEP 6 — Validation: test invalid mobiles
"""

import requests
import os
import sys
import time

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f'{BASE_URL}/api'

# Test credentials
ADMIN_MOBILE = '9692604577'
ADMIN_PASSWORD = '<redacted>'

# Test user mobiles (seeded test users from the review request)
TEST_MOBILES = ['9000000099', '9999900001']

def log(msg):
    print(f'[TEST] {msg}')

def test_step(step_num, description):
    print(f'\n{"="*80}')
    print(f'STEP {step_num}: {description}')
    print(f'{"="*80}')

def main():
    try:
        # STEP 1: Admin login
        test_step(1, 'Admin Login + Find Real Recipient')
        
        log('Logging in as admin...')
        login_res = requests.post(f'{API_BASE}/auth/login', json={
            'mobile': ADMIN_MOBILE,
            'password': ADMIN_PASSWORD
        }, timeout=30)
        
        if login_res.status_code != 200:
            log(f'❌ Login failed: {login_res.status_code}')
            log(f'Response: {login_res.text}')
            sys.exit(1)
        
        login_data = login_res.json()
        token = login_data.get('token')
        if not token:
            log(f'❌ No token in login response')
            sys.exit(1)
        
        log(f'✅ Admin login successful')
        headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
        
        # Initial dry-run to find real recipients
        log('Running initial dry-run to find recipients...')
        dryrun1_res = requests.post(f'{API_BASE}/admin/wa/dry-run', 
            headers=headers,
            json={'template': 'expired_premium_renewal', 'audience': 'expired'},
            timeout=30
        )
        
        if dryrun1_res.status_code != 200:
            log(f'❌ Initial dry-run failed: {dryrun1_res.status_code}')
            log(f'Response: {dryrun1_res.text}')
            sys.exit(1)
        
        dryrun1_data = dryrun1_res.json()
        breakdown1 = dryrun1_data.get('breakdown', {})
        
        log(f'✅ Initial dry-run successful')
        log(f'   breakdown.final: {breakdown1.get("final", 0)}')
        log(f'   breakdown.marketingPaused (initial): {breakdown1.get("marketingPaused", 0)}')
        
        initial_marketing_paused = breakdown1.get('marketingPaused', 0)
        
        # STEP 2: Manual pause
        test_step(2, 'Manual Pause - POST /api/admin/wa/marketing-pause')
        
        log(f'Pausing marketing for test users: {", ".join(TEST_MOBILES)}')
        pause_res = requests.post(f'{API_BASE}/admin/wa/marketing-pause',
            headers=headers,
            json={
                'mobiles': ', '.join(TEST_MOBILES),  # Comma-separated string
                'days': 7,
                'action': 'pause'
            },
            timeout=30
        )
        
        if pause_res.status_code != 200:
            log(f'❌ Pause request failed: {pause_res.status_code}')
            log(f'Response: {pause_res.text}')
            sys.exit(1)
        
        pause_data = pause_res.json()
        log(f'✅ Pause request successful')
        log(f'   Response: {pause_data}')
        
        # Assertions for STEP 2
        assert pause_data.get('ok') == True, 'Expected ok:true'
        assert pause_data.get('action') == 'pause', 'Expected action:"pause"'
        assert pause_data.get('days') == 7, 'Expected days:7'
        assert pause_data.get('matched', 0) >= 1, f'Expected matched >= 1, got {pause_data.get("matched")}'
        
        log(f'   ✅ ok: {pause_data.get("ok")}')
        log(f'   ✅ action: {pause_data.get("action")}')
        log(f'   ✅ days: {pause_data.get("days")}')
        log(f'   ✅ matched: {pause_data.get("matched")}')
        log(f'   ✅ numbers: {pause_data.get("numbers")}')
        log(f'   ✅ notFound: {pause_data.get("notFound")}')
        
        # STEP 3: Verify pause reflected in dry-run breakdown (marketing template)
        test_step(3, 'Verify Pause Reflected in Dry-Run Breakdown (Marketing Template)')
        
        log('Running dry-run with audience="all" to include paused users...')
        dryrun2_res = requests.post(f'{API_BASE}/admin/wa/dry-run',
            headers=headers,
            json={'template': 'expired_premium_renewal', 'audience': 'all'},
            timeout=30
        )
        
        if dryrun2_res.status_code != 200:
            log(f'❌ Dry-run failed: {dryrun2_res.status_code}')
            log(f'Response: {dryrun2_res.text}')
            sys.exit(1)
        
        dryrun2_data = dryrun2_res.json()
        breakdown2 = dryrun2_data.get('breakdown', {})
        
        log(f'✅ Dry-run successful')
        log(f'   breakdown.matched: {breakdown2.get("matched", 0)}')
        log(f'   breakdown.marketingPaused: {breakdown2.get("marketingPaused", 0)}')
        log(f'   breakdown.optOut: {breakdown2.get("optOut", 0)}')
        log(f'   breakdown.capPaused: {breakdown2.get("capPaused", 0)}')
        log(f'   breakdown.invalidMobile: {breakdown2.get("invalidMobile", 0)}')
        log(f'   breakdown.final: {breakdown2.get("final", 0)}')
        
        # Assertions for STEP 3
        marketing_paused = breakdown2.get('marketingPaused', 0)
        assert marketing_paused >= 1, f'Expected marketingPaused >= 1 (paused users in audience), got {marketing_paused}'
        
        # Verify final excludes paused users
        matched = breakdown2.get('matched', 0)
        opt_out = breakdown2.get('optOut', 0)
        cap_paused = breakdown2.get('capPaused', 0)
        invalid_mobile = breakdown2.get('invalidMobile', 0)
        final = breakdown2.get('final', 0)
        
        expected_final = matched - opt_out - marketing_paused - cap_paused - invalid_mobile
        log(f'   Expected final: {matched} - {opt_out} - {marketing_paused} - {cap_paused} - {invalid_mobile} = {expected_final}')
        log(f'   Actual final: {final}')
        
        assert final == expected_final, f'Expected final={expected_final}, got {final}'
        log(f'   ✅ breakdown.marketingPaused >= 1: {marketing_paused}')
        log(f'   ✅ breakdown.final excludes paused users')
        
        # STEP 4: UTILITY exemption
        test_step(4, 'UTILITY Exemption - Verify marketingPaused == 0 for Utility Templates')
        
        log('Running dry-run with utility template (plan_expiring_soon)...')
        dryrun3_res = requests.post(f'{API_BASE}/admin/wa/dry-run',
            headers=headers,
            json={'template': 'plan_expiring_soon', 'audience': 'all'},
            timeout=30
        )
        
        if dryrun3_res.status_code != 200:
            log(f'❌ Utility dry-run failed: {dryrun3_res.status_code}')
            log(f'Response: {dryrun3_res.text}')
            sys.exit(1)
        
        dryrun3_data = dryrun3_res.json()
        breakdown3 = dryrun3_data.get('breakdown', {})
        category = dryrun3_data.get('category', '')
        
        log(f'✅ Utility dry-run successful')
        log(f'   category: {category}')
        log(f'   breakdown.marketingPaused: {breakdown3.get("marketingPaused", 0)}')
        log(f'   breakdown.optOut: {breakdown3.get("optOut", 0)}')
        
        # Assertions for STEP 4
        assert category == 'utility', f'Expected category="utility", got "{category}"'
        assert breakdown3.get('marketingPaused', 0) == 0, f'Expected marketingPaused=0 for utility, got {breakdown3.get("marketingPaused")}'
        assert breakdown3.get('optOut', 0) == 0, f'Expected optOut=0 for utility, got {breakdown3.get("optOut")}'
        
        log(f'   ✅ category == "utility"')
        log(f'   ✅ breakdown.marketingPaused == 0 (utility is never paused)')
        log(f'   ✅ breakdown.optOut == 0 (utility is never opted out)')
        
        # STEP 5: Unpause
        test_step(5, 'Unpause - POST /api/admin/wa/marketing-pause with action=unpause')
        
        log(f'Unpausing marketing for test users: {", ".join(TEST_MOBILES)}')
        unpause_res = requests.post(f'{API_BASE}/admin/wa/marketing-pause',
            headers=headers,
            json={
                'mobiles': ', '.join(TEST_MOBILES),
                'action': 'unpause'
            },
            timeout=30
        )
        
        if unpause_res.status_code != 200:
            log(f'❌ Unpause request failed: {unpause_res.status_code}')
            log(f'Response: {unpause_res.text}')
            sys.exit(1)
        
        unpause_data = unpause_res.json()
        log(f'✅ Unpause request successful')
        log(f'   Response: {unpause_data}')
        
        # Assertions for STEP 5
        assert unpause_data.get('ok') == True, 'Expected ok:true'
        assert unpause_data.get('action') == 'unpause', 'Expected action:"unpause"'
        assert unpause_data.get('matched', 0) >= 1, f'Expected matched >= 1, got {unpause_data.get("matched")}'
        
        log(f'   ✅ ok: {unpause_data.get("ok")}')
        log(f'   ✅ action: {unpause_data.get("action")}')
        log(f'   ✅ matched: {unpause_data.get("matched")}')
        
        # Verify unpause reflected in dry-run
        log('Running dry-run to verify unpause...')
        dryrun4_res = requests.post(f'{API_BASE}/admin/wa/dry-run',
            headers=headers,
            json={'template': 'expired_premium_renewal', 'audience': 'all'},
            timeout=30
        )
        
        if dryrun4_res.status_code != 200:
            log(f'❌ Post-unpause dry-run failed: {dryrun4_res.status_code}')
            log(f'Response: {dryrun4_res.text}')
            sys.exit(1)
        
        dryrun4_data = dryrun4_res.json()
        breakdown4 = dryrun4_data.get('breakdown', {})
        
        log(f'✅ Post-unpause dry-run successful')
        log(f'   breakdown.marketingPaused (after unpause): {breakdown4.get("marketingPaused", 0)}')
        
        # marketingPaused should have dropped (those users no longer paused)
        final_marketing_paused = breakdown4.get('marketingPaused', 0)
        log(f'   Initial marketingPaused: {initial_marketing_paused}')
        log(f'   After pause: {marketing_paused}')
        log(f'   After unpause: {final_marketing_paused}')
        
        # The count should be lower than when paused (may not be exactly initial if other users were paused)
        assert final_marketing_paused < marketing_paused, f'Expected marketingPaused to drop after unpause, got {final_marketing_paused} (was {marketing_paused})'
        log(f'   ✅ breakdown.marketingPaused dropped after unpause')
        
        # STEP 6: Validation
        test_step(6, 'Validation - Test Invalid Mobiles')
        
        log('Testing with invalid mobiles (abc, 123)...')
        invalid_res = requests.post(f'{API_BASE}/admin/wa/marketing-pause',
            headers=headers,
            json={
                'mobiles': 'abc, 123',
                'days': 7,
                'action': 'pause'
            },
            timeout=30
        )
        
        log(f'   Status code: {invalid_res.status_code}')
        
        # Assertions for STEP 6
        assert invalid_res.status_code == 400, f'Expected 400 for invalid mobiles, got {invalid_res.status_code}'
        
        invalid_data = invalid_res.json()
        log(f'   Response: {invalid_data}')
        log(f'   ✅ Returns 400 for invalid mobiles')
        log(f'   ✅ Error message: {invalid_data.get("error", "")}')
        
        # SUMMARY
        print(f'\n{"="*80}')
        print('✅ ALL TESTS PASSED')
        print(f'{"="*80}')
        print('\nSUMMARY:')
        print('✅ STEP 1: Admin login + initial dry-run successful')
        print('✅ STEP 2: Manual pause working (matched >= 1, action="pause", days=7)')
        print('✅ STEP 3: Pause reflected in dry-run breakdown (marketingPaused >= 1, final excludes paused)')
        print('✅ STEP 4: UTILITY exemption working (marketingPaused == 0 for utility templates)')
        print('✅ STEP 5: Unpause working (matched >= 1, marketingPaused dropped)')
        print('✅ STEP 6: Validation working (400 for invalid mobiles)')
        print('\nKEY FINDINGS:')
        print(f'- Initial marketingPaused: {initial_marketing_paused}')
        print(f'- After pause: {marketing_paused} (increased by paused users)')
        print(f'- After unpause: {final_marketing_paused} (dropped back down)')
        print(f'- Utility template: marketingPaused == 0 (exempt as required)')
        print(f'- Invalid mobiles: 400 error (validation working)')
        print('\n✅ NO CRITICAL ISSUES FOUND. WhatsApp marketing pause (131049) working correctly.')
        
    except AssertionError as e:
        log(f'❌ ASSERTION FAILED: {e}')
        sys.exit(1)
    except Exception as e:
        log(f'❌ TEST FAILED: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
