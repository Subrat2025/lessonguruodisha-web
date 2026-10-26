#!/usr/bin/env python3
"""
Backend test for Lesson Diary PDF endpoint after v2 template rewrite.
Only tests /api/instant-plan/pdf endpoint.
"""

import requests
import json
import io
import os
from pypdf import PdfReader

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

def test_lesson_diary_v2_pdf():
    print("\n" + "="*80)
    print("LESSON DIARY V2 PDF ENDPOINT TEST")
    print("="*80 + "\n")
    
    # Test 1: Admin Login
    print("Test 1: Admin Login")
    try:
        login_resp = requests.post(f"{API_URL}/auth/login", json={
            "mobile": "9692604577",
            "password": "<redacted>"
        }, timeout=30)
        
        if login_resp.status_code != 200:
            print(f"❌ FAIL: Login failed with status {login_resp.status_code}")
            print(f"Response: {login_resp.text}")
            return
        
        token = login_resp.json().get('token')
        if not token:
            print("❌ FAIL: No token in login response")
            return
        
        print(f"✅ PASS: Admin login successful, token: {token[:20]}...")
    except Exception as e:
        print(f"❌ FAIL: Login error: {e}")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Load sample plan from test_plan.json
    print("\nLoading sample plan from /app/scripts/test_plan.json...")
    try:
        with open('/app/scripts/test_plan.json', 'r') as f:
            test_data = json.load(f)
            sample_plan = test_data['plan']
        print(f"✅ Sample plan loaded: {len(sample_plan.get('periods', []))} period(s)")
    except Exception as e:
        print(f"❌ FAIL: Could not load test_plan.json: {e}")
        return
    
    # Test 2: Instant mode (default) - NO mode field
    print("\n" + "-"*80)
    print("Test 2: Instant mode (default) - POST with { plan, showWatermark: true } and NO mode field")
    print("-"*80)
    try:
        payload = {
            "plan": sample_plan,
            "showWatermark": True
            # NO mode field - should default to 'instant'
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            headers=headers, 
                            timeout=60)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            # Check Content-Type
            content_type = resp.headers.get('Content-Type', '')
            if content_type != 'application/pdf':
                print(f"❌ FAIL: Expected Content-Type: application/pdf, got {content_type}")
            else:
                print(f"✅ PASS: Content-Type is application/pdf")
            
            # Check Content-Disposition filename
            content_disp = resp.headers.get('Content-Disposition', '')
            if not content_disp.startswith('attachment; filename="Instant-Daily-Lesson-Plan-'):
                print(f"❌ FAIL: Filename should start with 'Instant-Daily-Lesson-Plan-', got: {content_disp}")
            else:
                print(f"✅ PASS: Filename starts with 'Instant-Daily-Lesson-Plan-'")
            
            # Check buffer size
            buffer_size = len(resp.content)
            if buffer_size < 50000:  # 50KB
                print(f"❌ FAIL: Buffer size {buffer_size} bytes < 50KB")
            else:
                print(f"✅ PASS: Buffer size {buffer_size} bytes (> 50KB)")
            
            # Check PDF magic bytes
            if resp.content[:4] != b'%PDF':
                print(f"❌ FAIL: First 4 bytes are not '%PDF', got: {resp.content[:4]}")
            else:
                print(f"✅ PASS: First 4 bytes are '%PDF'")
            
            # Save a copy
            with open('/tmp/instant_mode.pdf', 'wb') as f:
                f.write(resp.content)
            print("✅ Saved copy to /tmp/instant_mode.pdf")
            
            # Test 8a: PDF orientation for instant mode
            print("\nTest 8a: PDF orientation (instant mode) - verify MediaBox is landscape")
            try:
                pdf_reader = PdfReader(io.BytesIO(resp.content))
                page = pdf_reader.pages[0]
                width = float(page.mediabox.width)
                height = float(page.mediabox.height)
                print(f"MediaBox: width={width}, height={height}")
                
                if width > height:
                    print(f"✅ PASS: PDF is landscape (width {width} > height {height})")
                else:
                    print(f"❌ FAIL: PDF is not landscape (width {width} <= height {height})")
            except Exception as e:
                print(f"❌ FAIL: Could not verify PDF orientation: {e}")
    
    except Exception as e:
        print(f"❌ FAIL: Instant mode test error: {e}")
    
    # Test 3: Daily mode - with 7 periods
    print("\n" + "-"*80)
    print("Test 3: Daily mode - POST with { plan, mode: 'daily', showWatermark: true } where plan.periods[] has 7 items")
    print("-"*80)
    try:
        # Create a plan with 7 periods (duplicate the first period 6 more times)
        daily_plan = sample_plan.copy()
        if len(daily_plan.get('periods', [])) < 7:
            # Duplicate periods to make 7
            base_period = daily_plan['periods'][0].copy()
            daily_plan['periods'] = []
            for i in range(7):
                period = base_period.copy()
                period['periodNum'] = i + 1
                daily_plan['periods'].append(period)
        
        payload = {
            "plan": daily_plan,
            "mode": "daily",
            "showWatermark": True
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            headers=headers, 
                            timeout=60)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            print(f"✅ PASS: Status 200")
            
            # Check filename
            content_disp = resp.headers.get('Content-Disposition', '')
            if not content_disp.startswith('attachment; filename="Daily-7-Period-Lesson-'):
                print(f"❌ FAIL: Filename should start with 'Daily-7-Period-Lesson-', got: {content_disp}")
            else:
                print(f"✅ PASS: Filename starts with 'Daily-7-Period-Lesson-'")
            
            # Check PDF has at least 1 page
            try:
                pdf_reader = PdfReader(io.BytesIO(resp.content))
                page_count = len(pdf_reader.pages)
                if page_count >= 1:
                    print(f"✅ PASS: PDF has {page_count} page(s)")
                else:
                    print(f"❌ FAIL: PDF has 0 pages")
                
                # Test 8b: PDF orientation for daily mode
                print("\nTest 8b: PDF orientation (daily mode) - verify MediaBox is landscape")
                page = pdf_reader.pages[0]
                width = float(page.mediabox.width)
                height = float(page.mediabox.height)
                print(f"MediaBox: width={width}, height={height}")
                
                if width > height:
                    print(f"✅ PASS: PDF is landscape (width {width} > height {height})")
                else:
                    print(f"❌ FAIL: PDF is not landscape (width {width} <= height {height})")
            except Exception as e:
                print(f"❌ FAIL: Could not verify PDF pages: {e}")
            
            # Save a copy
            with open('/tmp/daily_mode.pdf', 'wb') as f:
                f.write(resp.content)
            print("✅ Saved copy to /tmp/daily_mode.pdf")
    
    except Exception as e:
        print(f"❌ FAIL: Daily mode test error: {e}")
    
    # Test 4: Multigrade mode - transform plan to multigrade shape
    print("\n" + "-"*80)
    print("Test 4: Multigrade mode - POST with { plan: multigradePlan, mode: 'multigrade' }")
    print("        where multigradePlan has top-level classes[] (no periods[])")
    print("-"*80)
    try:
        # Transform sample_plan to multigrade shape
        # Multigrade shape: { date, periodNumber, time, bookName, chapterName, classes: [ { ...period, className: '୩ୟ' }, { ...period, className: '୫ମ' } ] }
        base_period = sample_plan['periods'][0].copy()
        
        multigrade_plan = {
            "date": sample_plan.get('date', '2026-08-26'),
            "periodNumber": 1,
            "time": base_period.get('time', '45 min'),
            "bookName": sample_plan.get('bookName', 'Test Book'),
            "chapterName": sample_plan.get('chapterName', 'Test Chapter'),
            "classes": [
                {**base_period, "className": "୩ୟ"},
                {**base_period, "className": "୫ମ"}
            ]
            # NO periods[] at top level
        }
        
        payload = {
            "plan": multigrade_plan,
            "mode": "multigrade"
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            headers=headers, 
                            timeout=60)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            print(f"✅ PASS: Status 200")
            
            # Check filename
            content_disp = resp.headers.get('Content-Disposition', '')
            if not content_disp.startswith('attachment; filename="Multigrade-Lesson-'):
                print(f"❌ FAIL: Filename should start with 'Multigrade-Lesson-', got: {content_disp}")
            else:
                print(f"✅ PASS: Filename starts with 'Multigrade-Lesson-'")
            
            # Check PDF has at least 1 page
            try:
                pdf_reader = PdfReader(io.BytesIO(resp.content))
                page_count = len(pdf_reader.pages)
                if page_count >= 1:
                    print(f"✅ PASS: PDF has {page_count} page(s)")
                else:
                    print(f"❌ FAIL: PDF has 0 pages")
                
                # Test 8c: PDF orientation for multigrade mode
                print("\nTest 8c: PDF orientation (multigrade mode) - verify MediaBox is landscape")
                page = pdf_reader.pages[0]
                width = float(page.mediabox.width)
                height = float(page.mediabox.height)
                print(f"MediaBox: width={width}, height={height}")
                
                if width > height:
                    print(f"✅ PASS: PDF is landscape (width {width} > height {height})")
                else:
                    print(f"❌ FAIL: PDF is not landscape (width {width} <= height {height})")
            except Exception as e:
                print(f"❌ FAIL: Could not verify PDF pages: {e}")
            
            # Save a copy
            with open('/tmp/multigrade_mode.pdf', 'wb') as f:
                f.write(resp.content)
            print("✅ Saved copy to /tmp/multigrade_mode.pdf")
    
    except Exception as e:
        print(f"❌ FAIL: Multigrade mode test error: {e}")
    
    # Test 5: Mode fallback - invalid mode should coerce to 'instant'
    print("\n" + "-"*80)
    print("Test 5: Mode fallback - POST with { plan, mode: 'garbage' }")
    print("        Expect: 200 (should coerce to 'instant'), filename starts with 'Instant-'")
    print("-"*80)
    try:
        payload = {
            "plan": sample_plan,
            "mode": "garbage"
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            headers=headers, 
                            timeout=60)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            print(f"✅ PASS: Status 200 (mode coerced to 'instant')")
            
            # Check filename
            content_disp = resp.headers.get('Content-Disposition', '')
            if not content_disp.startswith('attachment; filename="Instant-'):
                print(f"❌ FAIL: Filename should start with 'Instant-', got: {content_disp}")
            else:
                print(f"✅ PASS: Filename starts with 'Instant-'")
    
    except Exception as e:
        print(f"❌ FAIL: Mode fallback test error: {e}")
    
    # Test 6: Auth required - without Authorization header
    print("\n" + "-"*80)
    print("Test 6: Auth required - POST without Authorization header")
    print("        Expect: 401 with { error: 'Login required to download PDF' }")
    print("-"*80)
    try:
        payload = {
            "plan": sample_plan,
            "showWatermark": True
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            timeout=30)
        
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            print(f"✅ PASS: Status 401")
            
            # Check error message
            try:
                resp_json = resp.json()
                if resp_json.get('error') == 'Login required to download PDF':
                    print(f"✅ PASS: Error message is 'Login required to download PDF'")
                else:
                    print(f"❌ FAIL: Expected error 'Login required to download PDF', got: {resp_json.get('error')}")
            except:
                print(f"❌ FAIL: Could not parse JSON response")
    
    except Exception as e:
        print(f"❌ FAIL: Auth required test error: {e}")
    
    # Test 7: Bad payload - plan without periods and without classes
    print("\n" + "-"*80)
    print("Test 7: Bad payload - POST { plan: {} } (no periods, no classes)")
    print("        Expect: 400 with error mentioning 'plan.periods[]' or 'plan.classes[]'")
    print("-"*80)
    try:
        payload = {
            "plan": {}
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            headers=headers, 
                            timeout=30)
        
        if resp.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            print(f"✅ PASS: Status 400")
            
            # Check error message
            try:
                resp_json = resp.json()
                error_msg = resp_json.get('error', '')
                if 'plan.periods[]' in error_msg or 'plan.classes[]' in error_msg:
                    print(f"✅ PASS: Error message mentions 'plan.periods[]' or 'plan.classes[]': {error_msg}")
                else:
                    print(f"❌ FAIL: Error message should mention 'plan.periods[]' or 'plan.classes[]', got: {error_msg}")
            except:
                print(f"❌ FAIL: Could not parse JSON response")
    
    except Exception as e:
        print(f"❌ FAIL: Bad payload test error: {e}")
    
    # Test 8: Auto-fill from profile - plan with NO schoolName and NO teacherName
    print("\n" + "-"*80)
    print("Test 8: Auto-fill from profile - POST with { plan } where plan has NO schoolName and NO teacherName")
    print("        The endpoint should silently fill them from the logged-in admin's me.school and me.name")
    print("        Expect: 200 (not 500)")
    print("-"*80)
    try:
        # Create a plan without schoolName and teacherName
        plan_no_names = sample_plan.copy()
        plan_no_names.pop('schoolName', None)
        plan_no_names.pop('teacherName', None)
        plan_no_names.pop('school', None)
        plan_no_names.pop('teacher', None)
        
        payload = {
            "plan": plan_no_names,
            "showWatermark": True
        }
        
        resp = requests.post(f"{API_URL}/instant-plan/pdf", 
                            json=payload, 
                            headers=headers, 
                            timeout=60)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
        else:
            print(f"✅ PASS: Status 200 (auto-fill from profile working)")
            print("Note: Since we can't inspect PDF text easily, we just confirm the endpoint returns 200 (not 500)")
    
    except Exception as e:
        print(f"❌ FAIL: Auto-fill test error: {e}")
    
    print("\n" + "="*80)
    print("LESSON DIARY V2 PDF ENDPOINT TEST COMPLETE")
    print("="*80 + "\n")

if __name__ == '__main__':
    test_lesson_diary_v2_pdf()
