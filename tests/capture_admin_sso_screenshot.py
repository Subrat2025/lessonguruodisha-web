#!/usr/bin/env python3
"""
Capture AdminSsoToolkit component screenshot
"""

import asyncio
from playwright.async_api import async_playwright

BASE_URL = 'https://odisha-learning-pro.preview.emergentagent.com'
ADMIN_MOBILE = '9692604577'
ADMIN_PASSWORD = 'Subrat@909e'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()
        
        try:
            print('Logging in as admin...')
            
            # Go to login page first (before trying to access localStorage)
            await page.goto(f'{BASE_URL}/login', wait_until='load')
            await page.wait_for_timeout(2000)
            
            # Clear localStorage after page is loaded
            try:
                await page.evaluate('() => localStorage.clear()')
            except:
                pass  # Ignore if localStorage is not accessible yet
            
            await page.wait_for_timeout(1000)
            
            # Fill mobile number
            mobile_input = page.locator('input[type="tel"]').first
            await mobile_input.wait_for(state='visible', timeout=10000)
            await mobile_input.fill(ADMIN_MOBILE)
            
            # Fill password
            await page.wait_for_timeout(1000)
            password_input = page.locator('input[type="password"]').first
            await password_input.wait_for(state='visible', timeout=10000)
            await password_input.fill(ADMIN_PASSWORD)
            
            # Click Login
            login_btn = page.locator('button:has-text("Login")').first
            await login_btn.click()
            await page.wait_for_timeout(5000)
            
            print('Navigating to Admin panel...')
            
            # Navigate to Admin area
            await page.goto(f'{BASE_URL}/admin', wait_until='load')
            await page.wait_for_timeout(2000)
            
            # Click Referrals tab
            referrals_tab = page.locator('text=Referrals').first
            await referrals_tab.click()
            await page.wait_for_timeout(2000)
            
            print('Scrolling to AdminSsoToolkit component...')
            
            # Scroll to bottom first
            await page.evaluate('() => window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(1000)
            
            # Find and scroll to AdminSsoToolkit component
            await page.evaluate('''() => {
                const ssoCard = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Toolkit auto-login'));
                if (ssoCard) {
                    ssoCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }''')
            await page.wait_for_timeout(2000)
            
            # Scroll up a bit to show the full component
            await page.evaluate('() => window.scrollBy(0, -100)')
            await page.wait_for_timeout(1000)
            
            print('Capturing screenshot...')
            
            # Capture screenshot
            await page.screenshot(path='.screenshots/admin_sso_toolkit_full.jpg', type='jpeg', quality=40, full_page=False)
            print('Screenshot captured: admin_sso_toolkit_full.jpg')
            
        except Exception as e:
            print(f'ERROR: {e}')
            import traceback
            traceback.print_exc()
        
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
