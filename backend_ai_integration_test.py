#!/usr/bin/env python3
"""
Backend AI Integration Test - Verify Gemini.js still works after code change
Tests the 3 admin AI endpoints with real Gemini/OpenAI integration.
Admin: 9692604577 / <redacted>
"""

import requests
import json
import sys
import os

# Base URL from .env
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

def login_admin():
    """Login as admin and return Bearer token"""
    print("\n🔐 Logging in as admin...")
    url = f"{BASE_URL}/auth/login"
    payload = {"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD}
    
    try:
        resp = requests.post(url, json=payload, timeout=30)
        print(f"   Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"   ❌ Login failed: {resp.text}")
            return None
        
        data = resp.json()
        token = data.get("token")
        
        if not token:
            print(f"   ❌ No token in response: {data}")
            return None
        
        print(f"   ✅ Login successful, token obtained")
        return token
    
    except Exception as e:
        print(f"   ❌ Login exception: {e}")
        return None

def test_ai_status(token):
    """Test 1: GET /api/admin/ai/status"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/admin/ai/status")
    print("="*80)
    
    url = f"{BASE_URL}/admin/ai/status"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 500:
            print(f"❌ FAIL: Got 500 error")
            print(f"Response: {resp.text}")
            return False
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        print(f"\n📊 Response data:")
        print(json.dumps(data, indent=2))
        
        # Verify structure
        if not data.get("enabled"):
            print(f"⚠️  WARNING: Gemini not enabled")
        
        if "model" not in data:
            print(f"❌ FAIL: Missing 'model' field")
            return False
        
        if "fallback" not in data:
            print(f"❌ FAIL: Missing 'fallback' object")
            return False
        
        fallback = data.get("fallback", {})
        if "provider" not in fallback:
            print(f"❌ FAIL: Missing 'fallback.provider' field")
            return False
        
        print(f"\n✅ PASS: AI status endpoint working")
        print(f"   - Enabled: {data.get('enabled')} (gemini)")
        print(f"   - Model: {data.get('model')}")
        print(f"   - Fallback: {fallback}")
        print(f"   - No 500 error ✅")
        
        return True
    
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_lesson_plan(token):
    """Test 2: POST /api/admin/ai/lesson-plan"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/admin/ai/lesson-plan")
    print("="*80)
    
    url = f"{BASE_URL}/admin/ai/lesson-plan"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "className": "Class 6",
        "chapterName": "Light and Shadow",
        "topic": "Shadows and transparent/opaque objects",
        "period": 1,
        "language": "English"
    }
    
    print(f"\n📤 Request payload:")
    print(json.dumps(payload, indent=2))
    
    try:
        print(f"\n⏳ Calling AI endpoint (may take 10-30 seconds)...")
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        
        # Check for ok:true
        if not data.get("ok"):
            print(f"❌ FAIL: Response missing 'ok:true'")
            print(f"Response: {json.dumps(data, indent=2)[:500]}")
            return False
        
        # Check for data field
        if "data" not in data:
            print(f"❌ FAIL: Response missing 'data' field")
            print(f"Response: {json.dumps(data, indent=2)[:500]}")
            return False
        
        lesson_data = data.get("data", {})
        
        # Check for non-empty content
        if not lesson_data:
            print(f"❌ FAIL: 'data' field is empty")
            return False
        
        # Extract a short excerpt (~200 chars)
        excerpt = json.dumps(lesson_data, indent=2)[:200]
        
        print(f"\n✅ PASS: Lesson plan generated successfully")
        print(f"   - HTTP Status: 200 ✅")
        print(f"   - ok: true ✅")
        print(f"   - data: non-empty ✅")
        print(f"\n📄 Excerpt of generated content (~200 chars):")
        print(f"   {excerpt}...")
        
        # Check for panchapadi structure
        if "panchapadi" in lesson_data:
            panchapadi = lesson_data.get("panchapadi", {})
            steps = ["prastabana", "anweshana", "alochana", "prayoga", "mulyayana"]
            found_steps = [s for s in steps if s in panchapadi]
            print(f"\n   - Panchapadi steps found: {len(found_steps)}/5")
            if len(found_steps) == 5:
                print(f"   - All 5 Panchapadi steps present ✅")
        
        # Check for any error/warning messages
        if "error" in data:
            print(f"\n⚠️  WARNING: Error field present: {data.get('error')}")
        
        return True
    
    except requests.exceptions.Timeout:
        print(f"❌ FAIL: Request timed out after 60 seconds")
        return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_worksheet(token):
    """Test 3: POST /api/admin/ai/worksheet"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/admin/ai/worksheet")
    print("="*80)
    
    url = f"{BASE_URL}/admin/ai/worksheet"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "className": "Class 6",
        "topic": "Light and Shadow",
        "count": 5,
        "types": ["mcq", "short"],
        "language": "English"
    }
    
    print(f"\n📤 Request payload:")
    print(json.dumps(payload, indent=2))
    
    try:
        print(f"\n⏳ Calling AI endpoint (may take 10-30 seconds)...")
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        
        # Check for ok:true
        if not data.get("ok"):
            print(f"❌ FAIL: Response missing 'ok:true'")
            print(f"Response: {json.dumps(data, indent=2)[:500]}")
            return False
        
        # Check for data field
        if "data" not in data:
            print(f"❌ FAIL: Response missing 'data' field")
            print(f"Response: {json.dumps(data, indent=2)[:500]}")
            return False
        
        worksheet_data = data.get("data", {})
        
        # Check for non-empty content
        if not worksheet_data:
            print(f"❌ FAIL: 'data' field is empty")
            return False
        
        # Extract a short excerpt (~200 chars)
        excerpt = json.dumps(worksheet_data, indent=2)[:200]
        
        print(f"\n✅ PASS: Worksheet generated successfully")
        print(f"   - HTTP Status: 200 ✅")
        print(f"   - ok: true ✅")
        print(f"   - data: non-empty ✅")
        print(f"\n📄 Excerpt of generated content (~200 chars):")
        print(f"   {excerpt}...")
        
        # Check for questions array
        if "questions" in worksheet_data:
            questions = worksheet_data.get("questions", [])
            print(f"\n   - Questions array found: {len(questions)} questions")
            if len(questions) > 0:
                print(f"   - Non-empty questions array ✅")
                # Show first question
                if len(questions) > 0:
                    first_q = questions[0]
                    print(f"   - First question: {json.dumps(first_q, indent=2)[:150]}...")
        
        # Check for any error/warning messages
        if "error" in data:
            print(f"\n⚠️  WARNING: Error field present: {data.get('error')}")
        
        return True
    
    except requests.exceptions.Timeout:
        print(f"❌ FAIL: Request timed out after 60 seconds")
        return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("AI INTEGRATION TEST - Verify Gemini.js after code change")
    print("Testing: lib/gemini.js (removed require('@google/genai/package.json'))")
    print("Admin: 9692604577 / <redacted>")
    print("="*80)
    
    # Login
    token = login_admin()
    if not token:
        print("\n❌ FATAL: Could not login as admin")
        sys.exit(1)
    
    # Run tests
    results = {}
    
    results["ai_status"] = test_ai_status(token)
    results["lesson_plan"] = test_lesson_plan(token)
    results["worksheet"] = test_worksheet(token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - AI integration working correctly after code change")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
