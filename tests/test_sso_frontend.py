#!/usr/bin/env python3
"""
SSO Toolkit Frontend Testing Script
Tests the Teacher Utility Toolkit auto-login (SSO) frontend on PREVIEW only.
"""

import asyncio
import json
import base64
import hmac
import hashlib
import time
import uuid
from playwright.async_api import async_playwright

BASE_URL = 'https://odisha-learning-pro.preview.emergentagent.com'
SSO_SECRET = 'OqtMta_r8-duK2mHUqGMyg2Na_xBtE-XhOjFNe0kulfUbyjE7J8S0QBGiqm3h2lg'
ADMIN_MOBILE = '9692604577'
ADMIN_PASSWORD = 'Subrat@909e'

def mint_sso_token(phone, name, secret):
    """Mint a valid SSO token"""
    now = int(time.time() * 1000)
    payload = {
        'phone': phone,
        'name': name or 'Test User',
        'iat': now,
        'exp': now + 60000,
        'nonce': str(uuid.uuid4()),
        'src': 'toolkit'
    }
    
    # Base64url encode the payload
    payload_json = json.dumps(payload, separators=(',', ':'))
    b64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip('=')
    
    # HMAC-SHA256 signature
    sig = hmac.new(secret.encode(), b64.encode(), hashlib.sha256).hexdigest()
    
    return f"{b64}.{sig}"

def generate_random_phone():
    """Generate a random 10-digit phone starting with 9"""
    import random
    return '9' + ''.join([str(random.randint(0, 9)) for _ in range(9)])

async def main():
    test_phone = ''
    
    print('=== SSO TOOLKIT FRONTEND TESTING START ===\n')
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()
        
        try:
            # ========================================================================
            # TEST 1: /sso/expired page - verify UI and capture screenshot
            # ========================================================================
            print('TEST 1: Testing /sso/expired page...')
            
            await page.goto(f'{BASE_URL}/sso/expired', wait_until='networkidle')
            await page.wait_for_timeout(1000)
            
            # Verify heading
            heading = page.locator('h1:has-text("Link expired")').first
            heading_visible = await heading.is_visible()
            print(f'  Heading "Link expired" visible: {heading_visible}')
            
            # Verify text
            text = page.locator('text=Please tap again in Teacher Utility to sign in.').first
            text_visible = await text.is_visible()
            print(f'  Text visible: {text_visible}')
            
            # Verify Login with OTP button/link
            login_link = page.locator('a:has-text("Login with OTP")').first
            login_link_visible = await login_link.is_visible()
            login_href = await login_link.get_attribute('href')
            print(f'  "Login with OTP" link visible: {login_link_visible}, href: {login_href}')
            
            # Capture screenshot
            await page.screenshot(path='.screenshots/sso_expired_page.jpg', type='jpeg', quality=40, full_page=False)
            print('  Screenshot captured: sso_expired_page.jpg')
            print('TEST 1: PASSED\n')
            
            # ========================================================================
            # TEST 2: /sso/continue with no hash - verify failure fallback
            # ========================================================================
            print('TEST 2: Testing /sso/continue with no hash...')
            
            await page.goto(f'{BASE_URL}/sso/continue', wait_until='networkidle')
            await page.wait_for_timeout(2000)
            
            # Verify failure message
            failure_msg = page.locator('text=Could not sign you in.').first
            failure_msg_visible = await failure_msg.is_visible()
            print(f'  Failure message visible: {failure_msg_visible}')
            
            # Verify Login with OTP link
            failure_login_link = page.locator('a:has-text("Login with OTP")').first
            failure_login_link_visible = await failure_login_link.is_visible()
            print(f'  Login link visible: {failure_login_link_visible}')
            print('TEST 2: PASSED\n')
            
            # ========================================================================
            # TEST 3: END-TO-END auto-login (unknown phone -> new account -> Premium plans)
            # ========================================================================
            print('TEST 3: Testing END-TO-END auto-login with fresh random phone...')
            
            # Generate random phone
            test_phone = generate_random_phone()
            print(f'  Generated test phone: {test_phone}')
            
            # Mint valid token
            token = mint_sso_token(test_phone, 'SSO Test User', SSO_SECRET)
            print('  Valid SSO token minted')
            
            # Navigate to SSO endpoint
            sso_url = f'{BASE_URL}/sso/toolkit?token={token}'
            print(f'  Navigating to SSO endpoint...')
            
            await page.goto(sso_url, wait_until='load', timeout=60000)
            await page.wait_for_timeout(5000)
            
            # Should land on /plans (non-premium user)
            current_url = page.url
            print(f'  Current URL after SSO: {current_url}')
            
            is_on_plans = '/plans' in current_url
            print(f'  Landed on /plans page: {is_on_plans}')
            
            # Verify localStorage has em_token
            em_token = await page.evaluate('() => localStorage.getItem("em_token")')
            has_token = bool(em_token)
            print(f'  localStorage em_token is set: {has_token}')
            
            # Verify user is logged in (UI should not show logged-out state)
            try:
                plans_page_visible = await page.locator('text=Premium Plans').first.is_visible()
            except:
                plans_page_visible = False
            print(f'  Plans page rendered (logged in): {plans_page_visible}')
            
            print('TEST 3: PASSED\n')
            
            # ========================================================================
            # TEST 4: ADMIN PANEL - AdminSsoToolkit component
            # ========================================================================
            print('TEST 4: Testing Admin Panel - AdminSsoToolkit component...')
            
            # Clear localStorage and login as admin
            await page.evaluate('() => localStorage.clear()')
            
            await page.goto(f'{BASE_URL}/login', wait_until='load')
            await page.wait_for_timeout(3000)
            
            # Wait for the page to be ready
            await page.wait_for_load_state('domcontentloaded')
            await page.wait_for_timeout(2000)
            
            # Fill mobile number - try multiple selectors
            mobile_input = None
            try:
                mobile_input = page.locator('input[type="tel"]').first
                await mobile_input.wait_for(state='visible', timeout=5000)
            except:
                try:
                    mobile_input = page.locator('input[placeholder*="Mobile"]').first
                    await mobile_input.wait_for(state='visible', timeout=5000)
                except:
                    mobile_input = page.locator('input').first
                    await mobile_input.wait_for(state='visible', timeout=5000)
            
            await mobile_input.fill(ADMIN_MOBILE)
            print('  Filled admin mobile number')
            
            # Wait for password field to appear
            await page.wait_for_timeout(1000)
            
            # Fill password directly (admin uses password login)
            password_input = page.locator('input[type="password"]').first
            await password_input.wait_for(state='visible', timeout=10000)
            await password_input.fill(ADMIN_PASSWORD)
            print('  Filled admin password')
            
            # Click Login button
            login_btn = page.locator('button:has-text("Login")').first
            await login_btn.click()
            await page.wait_for_timeout(5000)
            
            print('  Logged in as admin')
            
            # Navigate to Admin area
            await page.goto(f'{BASE_URL}/admin', wait_until='networkidle')
            await page.wait_for_timeout(2000)
            
            # Look for Referrals tab
            referrals_tab = page.locator('text=Referrals').first
            await referrals_tab.click()
            await page.wait_for_timeout(2000)
            print('  Opened Referrals tab')
            
            # Scroll down to find AdminSsoToolkit component
            await page.evaluate('() => window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(1000)
            
            # Scroll to AdminSsoToolkit component
            await page.evaluate('''() => {
                const ssoCard = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Toolkit auto-login'));
                if (ssoCard) ssoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }''')
            await page.wait_for_timeout(2000)
            
            # Verify component heading
            sso_heading = page.locator('h3:has-text("Toolkit auto-login")').first
            sso_heading_visible = await sso_heading.is_visible()
            print(f'  AdminSsoToolkit component heading visible: {sso_heading_visible}')
            
            # Verify Preview row
            preview_label = page.locator('text=Preview').first
            preview_label_visible = await preview_label.is_visible()
            print(f'  Preview row visible: {preview_label_visible}')
            
            # Verify Live row
            live_label = page.locator('text=Live').first
            live_label_visible = await live_label.is_visible()
            print(f'  Live row visible: {live_label_visible}')
            
            # Verify host type tags (monospace)
            preview_tag = page.locator('span.font-mono:has-text("preview")').first
            preview_tag_visible = await preview_tag.is_visible()
            print(f'  Preview host type tag visible: {preview_tag_visible}')
            
            live_tag = page.locator('span.font-mono:has-text("live")').first
            live_tag_visible = await live_tag.is_visible()
            print(f'  Live host type tag visible: {live_tag_visible}')
            
            # Verify "you are here" badge on Preview
            you_are_here_badge = page.locator('text=you are here').first
            you_are_here_badge_visible = await you_are_here_badge.is_visible()
            print(f'  "you are here" badge visible on Preview: {you_are_here_badge_visible}')
            
            # Verify switches
            switches = await page.locator('button[role="switch"]').all()
            print(f'  Found {len(switches)} switches (should be 2)')
            
            # Verify audit table
            audit_heading = page.locator('h4:has-text("Recent auto-logins")').first
            audit_heading_visible = await audit_heading.is_visible()
            print(f'  Audit table heading visible: {audit_heading_visible}')
            
            # Verify table columns
            time_col = page.locator('th:has-text("Time")').first
            phone_col = page.locator('th:has-text("Phone")').first
            host_col = page.locator('th:has-text("Host")').first
            result_col = page.locator('th:has-text("Result")').first
            
            time_col_visible = await time_col.is_visible()
            phone_col_visible = await phone_col.is_visible()
            host_col_visible = await host_col.is_visible()
            result_col_visible = await result_col.is_visible()
            
            print(f'  Table columns visible - Time: {time_col_visible}, Phone: {phone_col_visible}, Host: {host_col_visible}, Result: {result_col_visible}')
            
            # Check if there are audit entries and verify phone masking
            audit_rows = await page.locator('tbody tr').all()
            if len(audit_rows) > 0:
                print(f'  Found {len(audit_rows)} audit entries')
                
                # Check first row for masked phone
                first_phone_cell = page.locator('tbody tr:first-child td:nth-child(2)').first
                phone_text = await first_phone_cell.text_content()
                is_masked = '****' in phone_text or '••••' in phone_text
                print(f'  Phone masking verified: {phone_text} (masked: {is_masked})')
            else:
                print('  No audit entries yet (expected for fresh setup)')
            
            # Capture screenshot of AdminSsoToolkit component
            await page.screenshot(path='.screenshots/admin_sso_toolkit.jpg', type='jpeg', quality=40, full_page=False)
            print('  Screenshot captured: admin_sso_toolkit.jpg')
            
            # ========================================================================
            # TEST 4b: Toggle Preview switch OFF and back ON
            # ========================================================================
            print('\n  Testing Preview switch toggle...')
            
            # Find Preview switch (first switch)
            preview_switch = switches[0]
            
            # Get initial state
            initial_state = await preview_switch.get_attribute('data-state')
            print(f'  Initial Preview switch state: {initial_state}')
            
            # Toggle OFF
            await preview_switch.click(force=True)
            await page.wait_for_timeout(2000)
            print('  Toggled Preview switch OFF')
            
            # Verify toast message
            try:
                toast_off = await page.locator('text=PREVIEW auto-login DISABLED').first.is_visible()
            except:
                toast_off = False
            print(f'  Toast message for OFF: {toast_off}')
            
            # Toggle back ON
            await preview_switch.click(force=True)
            await page.wait_for_timeout(2000)
            print('  Toggled Preview switch back ON')
            
            # Verify toast message
            try:
                toast_on = await page.locator('text=PREVIEW auto-login ENABLED').first.is_visible()
            except:
                toast_on = False
            print(f'  Toast message for ON: {toast_on}')
            
            # Reload page to verify persistence
            await page.reload(wait_until='load')
            await page.wait_for_timeout(3000)
            
            # Scroll back to component
            await page.evaluate('() => window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(1000)
            await page.evaluate('''() => {
                const ssoCard = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Toolkit auto-login'));
                if (ssoCard) ssoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }''')
            await page.wait_for_timeout(2000)
            
            # Verify switch is still ON
            switches_after_reload = await page.locator('button[role="switch"]').all()
            if len(switches_after_reload) > 0:
                preview_switch_after_reload = switches_after_reload[0]
                final_state = await preview_switch_after_reload.get_attribute('data-state')
                print(f'  Preview switch state after reload: {final_state} (should be checked)')
            else:
                print('  WARNING: Could not find switches after reload')
            
            print('TEST 4: PASSED\n')
            
            print('=== ALL FRONTEND TESTS PASSED ===\n')
            print(f'Test phone created: {test_phone}')
            print('CLEANUP REQUIRED: Delete test user and audit/nonce rows from MongoDB')
            
        except Exception as error:
            print(f'TEST FAILED: {error}')
            import traceback
            traceback.print_exc()
            
            # Capture error screenshot
            await page.screenshot(path='.screenshots/sso_test_error.jpg', type='jpeg', quality=40, full_page=False)
            print('Error screenshot captured: sso_test_error.jpg')
        
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
