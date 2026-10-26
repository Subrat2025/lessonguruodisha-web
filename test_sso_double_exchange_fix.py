#!/usr/bin/env python3
"""
SSO /sso/continue double-exchange fix regression test (PREVIEW ONLY).
Tests the fix for "Could not sign you in" clobber + "Signing you in..." hang.

Goal: Prove the issues are gone by auto-logging in 10 times in FRESH browser
contexts using the already-linked real account 7008144614.
"""
import asyncio
import json
import base64
import hmac
import hashlib
import time
import uuid
from datetime import datetime
from playwright.async_api import async_playwright
from pymongo import MongoClient

# Config
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
SSO_SECRET = "OqtMta_r8-duK2mHUqGMyg2Na_xBtE-XhOjFNe0kulfUbyjE7J8S0QBGiqm3h2lg"
TEST_PHONE = "7008144614"
TEST_NAME = "Subrat"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

def mint_sso_token(phone, name, secret):
    """Mint a fresh SSO token with unique nonce."""
    now = int(time.time() * 1000)  # milliseconds
    nonce = str(uuid.uuid4())
    
    payload = {
        "phone": phone,
        "name": name,
        "iat": now,
        "exp": now + 60000,  # 60 seconds
        "nonce": nonce,
        "src": "toolkit"
    }
    
    # base64url encode
    payload_json = json.dumps(payload, separators=(',', ':'))
    b64_payload = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip('=')
    
    # HMAC-SHA256 signature
    sig = hmac.new(secret.encode(), b64_payload.encode(), hashlib.sha256).hexdigest()
    
    token = f"{b64_payload}.{sig}"
    return token, nonce

async def run_single_test(run_number, capture_screenshot=False):
    """Run a single auto-login test in a fresh browser context."""
    result = {
        "run": run_number,
        "success": False,
        "final_path": None,
        "time_to_land": None,
        "error": None,
        "em_token_set": False
    }
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        try:
            # Fresh context (clean cookies + localStorage)
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                ignore_https_errors=True
            )
            page = await context.new_page()
            
            # Mint fresh token
            token, nonce = mint_sso_token(TEST_PHONE, TEST_NAME, SSO_SECRET)
            result["nonce"] = nonce
            
            # Navigate to SSO entry point
            start_time = time.time()
            sso_url = f"{BASE_URL}/sso/toolkit?token={token}"
            
            print(f"  Run #{run_number}: Navigating to /sso/toolkit...")
            await page.goto(sso_url, wait_until="domcontentloaded", timeout=10000)
            
            # Wait for redirect to complete (max 8 seconds as per watchdog)
            try:
                await page.wait_for_function(
                    """() => {
                        const path = window.location.pathname;
                        return path === '/plans' || path === '/lessons';
                    }""",
                    timeout=8000
                )
                
                end_time = time.time()
                result["time_to_land"] = round(end_time - start_time, 2)
                result["final_path"] = await page.evaluate("window.location.pathname")
                
                # Check localStorage em_token
                em_token = await page.evaluate("localStorage.getItem('em_token')")
                result["em_token_set"] = bool(em_token)
                
                # Check for error messages
                error_text = await page.evaluate("""() => {
                    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
                    const bodyText = document.body.innerText.toLowerCase();
                    
                    // Check for specific error messages
                    if (bodyText.includes('could not sign you in') || 
                        bodyText.includes("couldn't finish sign-in") ||
                        bodyText.includes('signing you in')) {
                        return bodyText;
                    }
                    
                    return errorElements.map(el => el.textContent).join(', ');
                }""")
                
                if error_text and ('could not sign you in' in error_text.lower() or 
                                   "couldn't finish" in error_text.lower() or
                                   'signing you in' in error_text.lower()):
                    result["error"] = f"Error message found: {error_text[:200]}"
                    result["success"] = False
                else:
                    result["success"] = True
                
                # Capture screenshot if requested
                if capture_screenshot:
                    screenshot_path = f".screenshots/sso_run_{run_number}_landed.jpg"
                    await page.screenshot(path=screenshot_path, quality=40, full_page=False)
                    print(f"  Screenshot saved: {screenshot_path}")
                
            except Exception as e:
                result["error"] = f"Timeout or navigation error: {str(e)}"
                result["success"] = False
                
                # Try to capture current state
                try:
                    result["final_path"] = await page.evaluate("window.location.pathname")
                    body_text = await page.evaluate("document.body.innerText")
                    if 'signing you in' in body_text.lower():
                        result["error"] = "HUNG on 'Signing you in...' spinner"
                except:
                    pass
        
        except Exception as e:
            result["error"] = f"Browser error: {str(e)}"
            result["success"] = False
        
        finally:
            await browser.close()
    
    return result

async def main():
    print("=" * 80)
    print("SSO /sso/continue DOUBLE-EXCHANGE FIX - REGRESSION TEST")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test phone: {TEST_PHONE}")
    print(f"Test runs: 10 (each in fresh browser context)")
    print()
    
    # Run 10 tests
    results = []
    for i in range(1, 11):
        # Capture screenshots for runs 1, 5, and 10
        capture = i in [1, 5, 10]
        result = await run_single_test(i, capture_screenshot=capture)
        results.append(result)
        
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        print(f"  {status} - Run #{i}: {result['final_path']} in {result['time_to_land']}s (em_token: {result['em_token_set']})")
        if result["error"]:
            print(f"    Error: {result['error']}")
        print()
        
        # Small delay between runs
        await asyncio.sleep(0.5)
    
    # Summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in results if r["success"])
    failed = sum(1 for r in results if not r["success"])
    
    print(f"✅ Passed: {passed}/10")
    print(f"❌ Failed: {failed}/10")
    print()
    
    if passed == 10:
        print("🎉 SUCCESS: All 10 runs logged in successfully!")
        print("   - No 'Could not sign you in' errors")
        print("   - No 'Signing you in...' hangs")
        print("   - All runs landed on /plans or /lessons within ~8s")
    else:
        print("⚠️  FAILURE: Some runs failed")
        print("\nFailed runs:")
        for r in results:
            if not r["success"]:
                print(f"  - Run #{r['run']}: {r['error']}")
    
    print()
    print("Detailed results:")
    for r in results:
        print(f"  Run #{r['run']}: success={r['success']}, path={r['final_path']}, time={r['time_to_land']}s, em_token={r['em_token_set']}")
    
    return passed, failed

if __name__ == "__main__":
    passed, failed = asyncio.run(main())
    exit(0 if failed == 0 else 1)
