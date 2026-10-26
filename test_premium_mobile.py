#!/usr/bin/env python3
"""
Premium Plans Page V2 - Mobile Testing Script
Tests 3 user types and verifies 5 specific points
"""

import asyncio
from playwright.async_api import async_playwright

async def test_premium_page():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        )
        page = await context.new_page()
        
        print("=" * 80)
        print("PREMIUM PLANS PAGE V2 - MOBILE TESTING")
        print("Testing 3 user types: FREE, PREMIUM, LIFETIME")
        print("Viewport: 390x844 (Mobile)")
        print("=" * 80)
        
        # Test accounts
        test_users = [
            {"type": "FREE", "mobile": "9444106792", "password": "Test@1234"},
            {"type": "PREMIUM", "mobile": "9999900001", "password": "Test@1234"},
            {"type": "LIFETIME", "mobile": "9999999999", "password": "admin123"}
        ]
        
        verification_results = {
            "point1_no_save_chips": [],
            "point2_most_chosen_ribbon": [],
            "point3_biggest_saving_badge": [],
            "point4_sticky_bar_label": [],
            "point5_compare_sheet": []
        }
        
        for user in test_users:
            try:
                print(f"\n{'=' * 80}")
                print(f"TESTING USER: {user['type']} ({user['mobile']})")
                print(f"{'=' * 80}")
                
                # Navigate to home page
                await page.goto("https://odisha-learning-pro.preview.emergentagent.com", wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(2000)
                
                # Logout if logged in
                try:
                    profile_nav = await page.query_selector('nav button:has-text("Profile")')
                    if profile_nav:
                        print("Logging out...")
                        await profile_nav.click(force=True)
                        await page.wait_for_timeout(1500)
                        
                        logout_button = await page.query_selector('button:has-text("Logout")')
                        if logout_button:
                            await logout_button.click(force=True)
                            await page.wait_for_timeout(2000)
                            print("✅ Logged out")
                except:
                    pass
                
                # Click Login button
                print("Step 1: Clicking Login button...")
                login_button = await page.wait_for_selector('button:has-text("Login")', timeout=10000)
                await login_button.click(force=True)
                await page.wait_for_timeout(2000)
                print("✅ Login button clicked")
                
                # Fill mobile number
                print(f"Step 2: Filling mobile number: {user['mobile']}")
                mobile_input = await page.wait_for_selector('input[placeholder*="Mobile"]', timeout=10000)
                await mobile_input.click(click_count=3)
                await mobile_input.fill("")
                await page.wait_for_timeout(300)
                await mobile_input.fill(user['mobile'])
                await page.wait_for_timeout(500)
                print("✅ Mobile number filled")
                
                # Fill password
                print(f"Step 3: Filling password...")
                all_inputs = await page.query_selector_all('input')
                if len(all_inputs) >= 2:
                    password_input = all_inputs[1]
                    await password_input.click()
                    await page.wait_for_timeout(300)
                    await password_input.fill(user['password'])
                    await page.wait_for_timeout(500)
                    print("✅ Password filled")
                else:
                    print("❌ Could not find password input")
                    continue
                
                # Click Login submit
                print("Step 4: Submitting login form...")
                login_submit = await page.wait_for_selector('button:has-text("🚀 Login")', timeout=10000)
                await login_submit.click(force=True)
                await page.wait_for_timeout(4000)
                print("✅ Login form submitted")
                
                # Navigate to Premium page
                print("Step 5: Navigating to Premium page...")
                await page.wait_for_timeout(2000)
                
                premium_nav = await page.query_selector('nav button:has-text("Premium")')
                if premium_nav:
                    await premium_nav.click(force=True)
                    await page.wait_for_timeout(3000)
                    print("✅ Clicked Premium nav button")
                else:
                    await page.goto("https://odisha-learning-pro.preview.emergentagent.com/premium", wait_until="networkidle")
                    await page.wait_for_timeout(2000)
                
                # Wait for page to render
                await page.wait_for_timeout(3000)
                
                print("Step 6: Capturing full-page mobile screenshot...")
                await page.evaluate("window.scrollTo(0, 0)")
                await page.wait_for_timeout(500)
                
                screenshot_path = f".screenshots/premium_plans_v2_{user['type'].lower()}_mobile.png"
                await page.screenshot(path=screenshot_path, full_page=True)
                print(f"✅ Screenshot saved: {screenshot_path}")
                
                # Get page text for verification
                page_text = await page.evaluate("() => document.body.innerText")
                
                # VERIFICATION POINT 1: NO save chips
                print("\n--- VERIFICATION POINT 1: NO 'You save' or 'Save' chips ---")
                you_save_count = page_text.count("You save")
                save_rupee_count = page_text.count("Save ₹")
                total_save_chips = you_save_count + save_rupee_count
                
                if total_save_chips == 0:
                    print(f"✅ PASS: NO save chips found")
                    verification_results["point1_no_save_chips"].append(f"{user['type']}: PASS")
                else:
                    print(f"❌ FAIL: Found {total_save_chips} save chips")
                    verification_results["point1_no_save_chips"].append(f"{user['type']}: FAIL - {total_save_chips} chips")
                
                # VERIFICATION POINT 2: MOST CHOSEN ribbon
                print("\n--- VERIFICATION POINT 2: Featured Yearly ribbon ---")
                has_most_chosen = "MOST CHOSEN" in page_text
                has_best_value = "Best value" in page_text or "BEST VALUE" in page_text
                
                if has_most_chosen and not has_best_value:
                    print(f"✅ PASS: Has 'MOST CHOSEN', no 'Best value'")
                    verification_results["point2_most_chosen_ribbon"].append(f"{user['type']}: PASS")
                elif has_best_value:
                    print(f"❌ FAIL: Has 'Best value'")
                    verification_results["point2_most_chosen_ribbon"].append(f"{user['type']}: FAIL")
                else:
                    print(f"⚠️  Ribbon text unclear")
                    verification_results["point2_most_chosen_ribbon"].append(f"{user['type']}: VERIFY")
                
                # VERIFICATION POINT 3: BIGGEST SAVING badge count
                print("\n--- VERIFICATION POINT 3: 'BIGGEST SAVING' badge ---")
                biggest_saving_count = page_text.count("BIGGEST SAVING")
                
                if biggest_saving_count == 1:
                    print(f"✅ PASS: 'BIGGEST SAVING' appears exactly once")
                    verification_results["point3_biggest_saving_badge"].append(f"{user['type']}: PASS")
                else:
                    print(f"❌ FAIL: 'BIGGEST SAVING' appears {biggest_saving_count} times")
                    verification_results["point3_biggest_saving_badge"].append(f"{user['type']}: FAIL - {biggest_saving_count}x")
                
                # VERIFICATION POINT 4: Sticky bar
                print("\n--- VERIFICATION POINT 4: Sticky bottom bar ---")
                await page.evaluate("window.scrollBy(0, 300)")
                await page.wait_for_timeout(1000)
                
                page_text_scrolled = await page.evaluate("() => document.body.innerText")
                has_most_chosen_sticky = "Most chosen" in page_text_scrolled
                has_best_value_sticky = "Best value" in page_text_scrolled
                
                if has_most_chosen_sticky and not has_best_value_sticky:
                    print(f"✅ PASS: Sticky bar has 'Most chosen'")
                    verification_results["point4_sticky_bar_label"].append(f"{user['type']}: PASS")
                elif has_best_value_sticky:
                    print(f"❌ FAIL: Sticky bar has 'Best value'")
                    verification_results["point4_sticky_bar_label"].append(f"{user['type']}: FAIL")
                else:
                    print(f"⚠️  Sticky bar unclear")
                    verification_results["point4_sticky_bar_label"].append(f"{user['type']}: VERIFY")
                
                await page.evaluate("window.scrollTo(0, 0)")
                await page.wait_for_timeout(500)
                
                # VERIFICATION POINT 5: Compare sheet
                print("\n--- VERIFICATION POINT 5: Compare plans sheet ---")
                compare_button = await page.query_selector('button:has-text("Compare")')
                if compare_button:
                    await compare_button.click(force=True)
                    await page.wait_for_timeout(2000)
                    
                    sheet_text = await page.evaluate("() => document.body.innerText")
                    has_save_yr = "Save/yr" in sheet_text or ("Save" in sheet_text and "year" in sheet_text)
                    
                    if not has_save_yr:
                        print(f"✅ PASS: No Save column")
                        verification_results["point5_compare_sheet"].append(f"{user['type']}: PASS")
                    else:
                        print(f"❌ FAIL: Has Save column")
                        verification_results["point5_compare_sheet"].append(f"{user['type']}: FAIL")
                    
                    await page.keyboard.press("Escape")
                    await page.wait_for_timeout(1000)
                else:
                    print("⚠️  Compare button not found")
                    verification_results["point5_compare_sheet"].append(f"{user['type']}: NOT FOUND")
                
                print(f"\n✅ {user['type']} user testing complete")
                
                # Logout
                await page.goto("https://odisha-learning-pro.preview.emergentagent.com")
                await page.wait_for_timeout(1000)
                
            except Exception as e:
                print(f"❌ ERROR testing {user['type']}: {e}")
        
        print("\n" + "=" * 80)
        print("VERIFICATION SUMMARY")
        print("=" * 80)
        
        print("\n1. NO 'You save' or 'Save' chips:")
        for result in verification_results["point1_no_save_chips"]:
            print(f"   {result}")
        
        print("\n2. Featured Yearly ribbon 'MOST CHOSEN':")
        for result in verification_results["point2_most_chosen_ribbon"]:
            print(f"   {result}")
        
        print("\n3. 'BIGGEST SAVING' badge exactly once:")
        for result in verification_results["point3_biggest_saving_badge"]:
            print(f"   {result}")
        
        print("\n4. Sticky bar 'Most chosen':")
        for result in verification_results["point4_sticky_bar_label"]:
            print(f"   {result}")
        
        print("\n5. Compare sheet NO Save column:")
        for result in verification_results["point5_compare_sheet"]:
            print(f"   {result}")
        
        print("\n" + "=" * 80)
        print("TESTING COMPLETE")
        print("=" * 80)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_premium_page())
