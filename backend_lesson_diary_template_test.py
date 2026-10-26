#!/usr/bin/env python3
"""
Backend Test: Lesson Diary PDF/HTML — NEW 15-column template (Sl.No + Assessment removed)

Tests POST /api/instant-plan/pdf and POST /api/instant-plan/html endpoints
with all three modes: 'instant', 'daily', 'multigrade'

Assertions:
- Without Authorization header → 401
- With auth + valid body → /pdf returns 200, Content-Type application/pdf, body > 800 bytes, starts with '%PDF'
- With auth + valid body → /html returns 200 JSON with non-empty html string
- CRITICAL: Verify NEW 15-column template in HTML:
  * MUST NOT contain 'ମୂଲ୍ୟାୟନ' or 'Assessment' column header
  * MUST NOT contain 'କ୍ରମ' or 'Sl.' header
  * MUST contain 'Material' band and 'TLM' header
  * MUST contain 'Adhiti','Bodha','Abhyasa','Prayoga','Prasara' step headers
  * Should contain colspan="5" (lesson details), colspan="4" (curriculum), and Panchapadi band
- With auth but plan missing both periods[] and classes[] → 400
- Test all three modes ('instant','daily','multigrade') for both endpoints
"""

import requests
import os
import sys

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def login(mobile, password):
    """Login and return token"""
    resp = requests.post(f"{API_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    return data.get('token')

def test_lesson_diary_endpoints():
    """Test POST /api/instant-plan/pdf and POST /api/instant-plan/html"""
    
    print("\n" + "="*80)
    print("LESSON DIARY PDF/HTML — NEW 15-COLUMN TEMPLATE TEST")
    print("="*80)
    
    # Test 1: Admin Login
    print("\n[Test 1] Admin Login")
    token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not token:
        print("❌ FAILED: Could not login")
        return False
    print(f"✅ PASSED: Admin login successful, token: {token[:20]}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Sample plan payloads for each mode
    instant_plan = {
        "mode": "instant",
        "showWatermark": True,
        "plan": {
            "date": "2026-08-26",
            "className": "Class 5",
            "subject": "EVS",
            "periods": [
                {
                    "periodNum": 1,
                    "className": "Class 5",
                    "subject": "EVS",
                    "chapterName": "Water is Life",
                    "topic": "Sources of water",
                    "loCodes": ["E-510", "E-511"],
                    "loDescription": "Understand water scarcity",
                    "cgCode": "CG-2",
                    "curricularGoal": "Conserve natural resources",
                    "competencyCode": "C-2.13",
                    "competency": "Describe water conservation",
                    "tlm": ["Globe", "Chart"],
                    "panchapadi": {
                        "adhiti": {"teacherActivity": "Bring a glass of water", "duration": "5 min"},
                        "bodha": {"teacherActivity": "Show globe", "studentActivity": "Group discussion", "duration": "12 min"},
                        "abhyasa": {"teacherActivity": "Textbook ex 1-2", "duration": "10 min"},
                        "prayoga": {"studentActivity": "List water-waste spots", "duration": "10 min"},
                        "prasara": {"studentActivity": "Homework: water diary", "duration": "8 min"}
                    }
                }
            ]
        }
    }
    
    daily_plan = {
        "mode": "daily",
        "showWatermark": True,
        "plan": {
            "date": "2026-08-26",
            "className": "Class 5",
            "subject": "EVS",
            "periods": [
                {
                    "periodNum": 1,
                    "className": "Class 5",
                    "subject": "EVS",
                    "chapterName": "Water is Life",
                    "topic": "Sources of water",
                    "loCodes": ["E-510"],
                    "tlm": ["Globe"],
                    "panchapadi": {
                        "adhiti": {"teacherActivity": "intro", "duration": "5 min"}
                    }
                }
            ]
        }
    }
    
    multigrade_plan = {
        "mode": "multigrade",
        "plan": {
            "date": "2026-08-26",
            "periodNumber": 3,
            "classes": [
                {
                    "className": "Class 3",
                    "subject": "Odia",
                    "chapterName": "ch1",
                    "topic": "t1",
                    "loCodes": ["O-101"],
                    "tlm": ["chart"],
                    "panchapadi": {"adhiti": {"teacherActivity": "intro", "duration": "5 min"}}
                },
                {
                    "className": "Class 4",
                    "subject": "Math",
                    "chapterName": "ch2",
                    "topic": "t2",
                    "loCodes": ["M-201"],
                    "tlm": ["blocks"],
                    "panchapadi": {"adhiti": {"teacherActivity": "intro2", "duration": "5 min"}}
                }
            ]
        }
    }
    
    # Test 2: POST /api/instant-plan/pdf without auth → 401
    print("\n[Test 2] POST /api/instant-plan/pdf without auth → 401")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/pdf", json=instant_plan, timeout=30)
        if resp.status_code == 401:
            print(f"✅ PASSED: Got 401 without auth")
        else:
            print(f"❌ FAILED: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 3: POST /api/instant-plan/html without auth → 401
    print("\n[Test 3] POST /api/instant-plan/html without auth → 401")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/html", json=instant_plan, timeout=30)
        if resp.status_code == 401:
            print(f"✅ PASSED: Got 401 without auth")
        else:
            print(f"❌ FAILED: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 4: POST /api/instant-plan/pdf with mode='instant' → 200 PDF
    print("\n[Test 4] POST /api/instant-plan/pdf with mode='instant' → 200 PDF")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/pdf", json=instant_plan, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
        
        content_type = resp.headers.get('Content-Type', '')
        if 'application/pdf' not in content_type:
            print(f"❌ FAILED: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        pdf_bytes = resp.content
        if len(pdf_bytes) < 800:
            print(f"❌ FAILED: PDF too small: {len(pdf_bytes)} bytes")
            return False
        
        if not pdf_bytes.startswith(b'%PDF'):
            print(f"❌ FAILED: PDF does not start with %PDF magic bytes")
            return False
        
        print(f"✅ PASSED: Got PDF, {len(pdf_bytes)} bytes, Content-Type: {content_type}, starts with %PDF")
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 5: POST /api/instant-plan/html with mode='instant' → 200 JSON with html
    print("\n[Test 5] POST /api/instant-plan/html with mode='instant' → 200 JSON with html")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/html", json=instant_plan, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        html = data.get('html', '')
        if not html:
            print(f"❌ FAILED: html field is empty")
            return False
        
        print(f"✅ PASSED: Got JSON with html field, length: {len(html)} chars")
        
        # CRITICAL: Verify NEW 15-column template
        print("\n[Test 5a] Verify NEW 15-column template structure")
        
        # MUST NOT contain Assessment column
        if 'ମୂଲ୍ୟାୟନ' in html or 'Assessment' in html:
            print(f"❌ FAILED: HTML contains 'ମୂଲ୍ୟାୟନ' or 'Assessment' column (should be removed)")
            return False
        print(f"✅ PASSED: No 'ମୂଲ୍ୟାୟନ' or 'Assessment' column found")
        
        # MUST NOT contain Sl.No header (but 'କ୍ରମ' can appear in 'ପାଠ୍ୟକ୍ରମ' which means curriculum)
        # Check for standalone 'Sl.' or 'Sl.No' or 'Serial' in table headers
        import re
        # Check if there's a column with Sl.No or Serial Number
        sl_no_pattern = r'<th[^>]*>.*?(Sl\.|Serial|S\.No).*?</th>'
        if re.search(sl_no_pattern, html, re.IGNORECASE | re.DOTALL):
            print(f"❌ FAILED: HTML contains 'Sl.' or 'Serial' column header (should be removed)")
            return False
        print(f"✅ PASSED: No 'Sl.No' or 'Serial' column header found")
        
        # MUST contain Material band
        if 'Material' not in html:
            print(f"❌ FAILED: HTML does not contain 'Material' band")
            return False
        print(f"✅ PASSED: 'Material' band found")
        
        # MUST contain TLM header
        if 'TLM' not in html:
            print(f"❌ FAILED: HTML does not contain 'TLM' header")
            return False
        print(f"✅ PASSED: 'TLM' header found")
        
        # MUST contain Panchapadi step headers
        required_steps = ['Adhiti', 'Bodha', 'Abhyasa', 'Prayoga', 'Prasara']
        for step in required_steps:
            if step not in html:
                print(f"❌ FAILED: HTML does not contain '{step}' step header")
                return False
        print(f"✅ PASSED: All Panchapadi step headers found: {', '.join(required_steps)}")
        
        # Should contain colspan="5" (lesson details)
        if 'colspan="5"' not in html:
            print(f"⚠️  WARNING: HTML does not contain colspan=\"5\" (lesson details band)")
        else:
            print(f"✅ PASSED: colspan=\"5\" found (lesson details band)")
        
        # Should contain colspan="4" (curriculum)
        if 'colspan="4"' not in html:
            print(f"⚠️  WARNING: HTML does not contain colspan=\"4\" (curriculum band)")
        else:
            print(f"✅ PASSED: colspan=\"4\" found (curriculum band)")
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 6: POST /api/instant-plan/pdf with mode='daily' → 200 PDF
    print("\n[Test 6] POST /api/instant-plan/pdf with mode='daily' → 200 PDF")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/pdf", json=daily_plan, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
        
        content_type = resp.headers.get('Content-Type', '')
        if 'application/pdf' not in content_type:
            print(f"❌ FAILED: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        pdf_bytes = resp.content
        if len(pdf_bytes) < 800:
            print(f"❌ FAILED: PDF too small: {len(pdf_bytes)} bytes")
            return False
        
        if not pdf_bytes.startswith(b'%PDF'):
            print(f"❌ FAILED: PDF does not start with %PDF magic bytes")
            return False
        
        print(f"✅ PASSED: Got PDF for daily mode, {len(pdf_bytes)} bytes")
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 7: POST /api/instant-plan/html with mode='daily' → 200 JSON
    print("\n[Test 7] POST /api/instant-plan/html with mode='daily' → 200 JSON")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/html", json=daily_plan, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        html = data.get('html', '')
        if not html:
            print(f"❌ FAILED: html field is empty")
            return False
        
        print(f"✅ PASSED: Got JSON with html field for daily mode, length: {len(html)} chars")
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 8: POST /api/instant-plan/pdf with mode='multigrade' → 200 PDF
    print("\n[Test 8] POST /api/instant-plan/pdf with mode='multigrade' → 200 PDF")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/pdf", json=multigrade_plan, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
        
        content_type = resp.headers.get('Content-Type', '')
        if 'application/pdf' not in content_type:
            print(f"❌ FAILED: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        pdf_bytes = resp.content
        if len(pdf_bytes) < 800:
            print(f"❌ FAILED: PDF too small: {len(pdf_bytes)} bytes")
            return False
        
        if not pdf_bytes.startswith(b'%PDF'):
            print(f"❌ FAILED: PDF does not start with %PDF magic bytes")
            return False
        
        print(f"✅ PASSED: Got PDF for multigrade mode, {len(pdf_bytes)} bytes")
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 9: POST /api/instant-plan/html with mode='multigrade' → 200 JSON
    print("\n[Test 9] POST /api/instant-plan/html with mode='multigrade' → 200 JSON")
    try:
        resp = requests.post(f"{API_URL}/instant-plan/html", json=multigrade_plan, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        html = data.get('html', '')
        if not html:
            print(f"❌ FAILED: html field is empty")
            return False
        
        print(f"✅ PASSED: Got JSON with html field for multigrade mode, length: {len(html)} chars")
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 10: POST /api/instant-plan/pdf with missing periods[] and classes[] → 400
    print("\n[Test 10] POST /api/instant-plan/pdf with missing periods[] and classes[] → 400")
    try:
        bad_plan = {
            "mode": "instant",
            "plan": {
                "date": "2026-08-26",
                "className": "Class 5"
                # Missing periods[] and classes[]
            }
        }
        resp = requests.post(f"{API_URL}/instant-plan/pdf", json=bad_plan, headers=headers, timeout=30)
        if resp.status_code == 400:
            print(f"✅ PASSED: Got 400 for missing periods[] and classes[]")
        else:
            print(f"❌ FAILED: Expected 400, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    # Test 11: POST /api/instant-plan/html with missing periods[] and classes[] → 400
    print("\n[Test 11] POST /api/instant-plan/html with missing periods[] and classes[] → 400")
    try:
        bad_plan = {
            "mode": "instant",
            "plan": {
                "date": "2026-08-26",
                "className": "Class 5"
                # Missing periods[] and classes[]
            }
        }
        resp = requests.post(f"{API_URL}/instant-plan/html", json=bad_plan, headers=headers, timeout=30)
        if resp.status_code == 400:
            print(f"✅ PASSED: Got 400 for missing periods[] and classes[]")
        else:
            print(f"❌ FAILED: Expected 400, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False
    
    print("\n" + "="*80)
    print("✅ ALL 11 LESSON DIARY PDF/HTML TESTS PASSED")
    print("="*80)
    return True

if __name__ == '__main__':
    try:
        success = test_lesson_diary_endpoints()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ TEST SUITE FAILED WITH EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
