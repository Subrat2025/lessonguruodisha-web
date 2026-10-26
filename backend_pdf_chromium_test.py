#!/usr/bin/env python3
"""
Backend test for PDF Generation Bug Fix (Chromium Executable Not Found)
Tests the new resolution order: system chromium → @sparticuz/chromium → puppeteer
Container: aarch64 (arm64)
"""

import requests
import sys
import json
import time
import subprocess
from datetime import datetime

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Test state
admin_token = None
lesson_id = None
worksheet_id = None
initial_analytics_count = 0

def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_admin_login():
    """Test 1: Login as admin"""
    global admin_token
    log("TEST 1: Admin login with mobile 9999999999 / password admin123")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("token"):
                admin_token = data["token"]
                log(f"✅ Admin login successful, token: {admin_token[:20]}...")
                return True
            else:
                log(f"❌ Admin login failed: No token in response")
                return False
        else:
            log(f"❌ Admin login failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Admin login exception: {e}")
        return False

def test_find_worksheet():
    """Test 2: Find a lesson with worksheets"""
    global lesson_id, worksheet_id
    log("TEST 2: Find a lesson with worksheets")
    
    try:
        # Get classes
        response = requests.get(f"{BASE_URL}/classes", timeout=10)
        if response.status_code != 200:
            log(f"❌ Failed to get classes: {response.status_code}")
            return False
        
        classes = response.json().get("classes", [])
        log(f"   Found {len(classes)} classes")
        
        # Try to find a lesson with worksheets
        for cls in classes[:5]:  # Check first 5 classes
            class_id = cls.get("id")
            
            # Get books for this class
            response = requests.get(f"{BASE_URL}/books?classId={class_id}", timeout=10)
            if response.status_code != 200:
                continue
            
            books = response.json().get("books", [])
            
            for book in books[:3]:  # Check first 3 books
                book_id = book.get("id")
                
                # Get chapters
                response = requests.get(f"{BASE_URL}/chapters?bookId={book_id}", timeout=10)
                if response.status_code != 200:
                    continue
                
                chapters = response.json().get("chapters", [])
                
                for chapter in chapters[:3]:  # Check first 3 chapters
                    chapter_id = chapter.get("id")
                    
                    # Get lessons
                    response = requests.get(f"{BASE_URL}/lessons?chapterId={chapter_id}", timeout=10)
                    if response.status_code != 200:
                        continue
                    
                    lessons = response.json().get("lessons", [])
                    
                    for lesson in lessons:
                        lid = lesson.get("id")
                        
                        # Check if this lesson has worksheets
                        response = requests.get(
                            f"{BASE_URL}/lessons/{lid}/worksheets",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            worksheets = response.json().get("worksheets", [])
                            if worksheets:
                                lesson_id = lid
                                worksheet_id = worksheets[0].get("id")
                                log(f"✅ Found lesson {lesson_id} with worksheet {worksheet_id}")
                                log(f"   Class: {cls.get('name')}, Book: {book.get('name')}, Chapter: {chapter.get('name')}")
                                return True
        
        # If no existing worksheet found, try to generate one
        log("   No existing worksheets found, attempting to generate one...")
        
        # Get first available lesson
        for cls in classes[:3]:
            class_id = cls.get("id")
            response = requests.get(f"{BASE_URL}/books?classId={class_id}", timeout=10)
            if response.status_code != 200:
                continue
            
            books = response.json().get("books", [])
            for book in books[:2]:
                book_id = book.get("id")
                response = requests.get(f"{BASE_URL}/chapters?bookId={book_id}", timeout=10)
                if response.status_code != 200:
                    continue
                
                chapters = response.json().get("chapters", [])
                for chapter in chapters[:2]:
                    chapter_id = chapter.get("id")
                    response = requests.get(f"{BASE_URL}/lessons?chapterId={chapter_id}", timeout=10)
                    if response.status_code != 200:
                        continue
                    
                    lessons = response.json().get("lessons", [])
                    if lessons:
                        lid = lessons[0].get("id")
                        
                        # Try to generate a worksheet
                        log(f"   Attempting to generate worksheet for lesson {lid}...")
                        response = requests.post(
                            f"{BASE_URL}/lessons/{lid}/worksheets",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={
                                "type": "practice",
                                "format": "mcq",
                                "difficulty": "medium",
                                "count": 10,
                                "force": True
                            },
                            timeout=60
                        )
                        
                        if response.status_code == 200:
                            data = response.json()
                            if data.get("worksheet"):
                                lesson_id = lid
                                worksheet_id = data["worksheet"].get("id")
                                log(f"✅ Generated worksheet {worksheet_id} for lesson {lesson_id}")
                                return True
        
        log(f"❌ Could not find or generate any worksheets")
        return False
        
    except Exception as e:
        log(f"❌ Find worksheet exception: {e}")
        return False

def test_get_initial_analytics():
    """Test 3: Get initial analytics count"""
    global initial_analytics_count
    log("TEST 3: Get initial analytics count for pdf_download")
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/analytics/worksheets?limit=100",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            
            # Count pdf_download entries
            pdf_downloads = [item for item in items if item.get("status") == "pdf_download"]
            initial_analytics_count = len(pdf_downloads)
            
            log(f"✅ Initial pdf_download count: {initial_analytics_count}")
            return True
        else:
            log(f"❌ Failed to get analytics: {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Get analytics exception: {e}")
        return False

def test_restart_service():
    """Test 4: Restart nextjs service for cold-start test"""
    log("TEST 4: Restart nextjs service for cold-start test")
    
    try:
        result = subprocess.run(
            ["sudo", "supervisorctl", "restart", "nextjs"],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            log(f"✅ Service restarted successfully")
            log(f"   Output: {result.stdout.strip()}")
            
            # Wait for service to be ready
            log("   Waiting 20 seconds for service to compile and be ready...")
            time.sleep(20)
            
            return True
        else:
            log(f"❌ Service restart failed: {result.stderr}")
            return False
    except Exception as e:
        log(f"❌ Service restart exception: {e}")
        return False

def test_cold_start_pdf():
    """Test 5: Cold-start PDF generation (worksheet variant)"""
    log("TEST 5: Cold-start PDF generation (worksheet variant)")
    
    try:
        start_time = time.time()
        
        response = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets/{worksheet_id}/pdf?variant=worksheet",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            pdf_size = len(response.content)
            pdf_header = response.content[:10]
            
            log(f"✅ Cold-start PDF generation successful")
            log(f"   Status: {response.status_code}")
            log(f"   Content-Type: {content_type}")
            log(f"   PDF size: {pdf_size:,} bytes")
            log(f"   PDF header: {pdf_header}")
            log(f"   Response time: {elapsed:.2f}s")
            
            # Verify it's a valid PDF
            if not response.content.startswith(b'%PDF'):
                log(f"❌ Response does not start with %PDF magic bytes")
                return False
            
            if pdf_size < 5000:
                log(f"❌ PDF size too small ({pdf_size} bytes)")
                return False
            
            if "application/pdf" not in content_type:
                log(f"❌ Content-Type is not application/pdf")
                return False
            
            if elapsed > 30:
                log(f"❌ Response time exceeded 30s timeout")
                return False
            
            # Check for chromium errors in response
            response_text = response.content[:1000].decode('utf-8', errors='ignore')
            if "Chromium executable not found" in response_text or \
               "Failed to launch the browser process" in response_text or \
               "Syntax error: word unexpected" in response_text:
                log(f"❌ Chromium error found in response")
                return False
            
            log(f"✅ All cold-start PDF checks passed")
            return True
        else:
            log(f"❌ Cold-start PDF failed with status {response.status_code}")
            log(f"   Response: {response.text[:500]}")
            return False
            
    except Exception as e:
        log(f"❌ Cold-start PDF exception: {e}")
        return False

def test_warm_pdf():
    """Test 6: Warm PDF generation (worksheet variant)"""
    log("TEST 6: Warm PDF generation (worksheet variant)")
    
    try:
        start_time = time.time()
        
        response = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets/{worksheet_id}/pdf?variant=worksheet",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            pdf_size = len(response.content)
            
            log(f"✅ Warm PDF generation successful")
            log(f"   Status: {response.status_code}")
            log(f"   Content-Type: {content_type}")
            log(f"   PDF size: {pdf_size:,} bytes")
            log(f"   Response time: {elapsed:.2f}s")
            
            # Verify it's a valid PDF
            if not response.content.startswith(b'%PDF'):
                log(f"❌ Response does not start with %PDF magic bytes")
                return False
            
            if "application/pdf" not in content_type:
                log(f"❌ Content-Type is not application/pdf")
                return False
            
            if elapsed > 3:
                log(f"⚠️  Response time {elapsed:.2f}s exceeded 3s threshold (expected for warm cache)")
            
            # Check for chromium errors
            response_text = response.content[:1000].decode('utf-8', errors='ignore')
            if "Chromium executable not found" in response_text or \
               "Failed to launch the browser process" in response_text or \
               "Syntax error: word unexpected" in response_text:
                log(f"❌ Chromium error found in response")
                return False
            
            log(f"✅ All warm PDF checks passed")
            return True
        else:
            log(f"❌ Warm PDF failed with status {response.status_code}")
            log(f"   Response: {response.text[:500]}")
            return False
            
    except Exception as e:
        log(f"❌ Warm PDF exception: {e}")
        return False

def test_answers_variant_pdf():
    """Test 7: Answers variant PDF generation"""
    log("TEST 7: Answers variant PDF generation")
    
    try:
        start_time = time.time()
        
        response = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets/{worksheet_id}/pdf?variant=answers",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            pdf_size = len(response.content)
            
            log(f"✅ Answers variant PDF generation successful")
            log(f"   Status: {response.status_code}")
            log(f"   Content-Type: {content_type}")
            log(f"   PDF size: {pdf_size:,} bytes")
            log(f"   Response time: {elapsed:.2f}s")
            
            # Verify it's a valid PDF
            if not response.content.startswith(b'%PDF'):
                log(f"❌ Response does not start with %PDF magic bytes")
                return False
            
            if "application/pdf" not in content_type:
                log(f"❌ Content-Type is not application/pdf")
                return False
            
            # Check for chromium errors
            response_text = response.content[:1000].decode('utf-8', errors='ignore')
            if "Chromium executable not found" in response_text or \
               "Failed to launch the browser process" in response_text or \
               "Syntax error: word unexpected" in response_text:
                log(f"❌ Chromium error found in response")
                return False
            
            log(f"✅ All answers variant PDF checks passed")
            return True
        else:
            log(f"❌ Answers variant PDF failed with status {response.status_code}")
            log(f"   Response: {response.text[:500]}")
            return False
            
    except Exception as e:
        log(f"❌ Answers variant PDF exception: {e}")
        return False

def test_analytics_logging():
    """Test 8: Verify analytics logging"""
    log("TEST 8: Verify analytics logging (3 new pdf_download rows expected)")
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/analytics/worksheets?limit=100",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            
            # Count pdf_download entries
            pdf_downloads = [item for item in items if item.get("status") == "pdf_download"]
            final_count = len(pdf_downloads)
            delta = final_count - initial_analytics_count
            
            log(f"   Initial count: {initial_analytics_count}")
            log(f"   Final count: {final_count}")
            log(f"   Delta: {delta}")
            
            if delta >= 3:
                log(f"✅ Analytics logging verified: {delta} new pdf_download rows")
                
                # Check latest entries for correct variant field
                latest = sorted(pdf_downloads, key=lambda x: x.get("createdAt", ""), reverse=True)[:3]
                for entry in latest:
                    variant = entry.get("variant", "N/A")
                    status = entry.get("status", "N/A")
                    log(f"   - variant: {variant}, status: {status}")
                
                return True
            else:
                log(f"❌ Expected at least 3 new rows, got {delta}")
                return False
        else:
            log(f"❌ Failed to get analytics: {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Analytics logging exception: {e}")
        return False

def test_dashboard_regression():
    """Test 9: Regression test - Dashboard endpoint"""
    log("TEST 9: Regression test - GET /admin/analytics/dashboard")
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/analytics/dashboard?range=30d",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            kpis = data.get("kpis", {})
            
            if kpis:
                log(f"✅ Dashboard endpoint working")
                log(f"   KPIs count: {len(kpis)}")
                
                # Check for key metrics
                key_metrics = ["totalUsers", "totalWorksheetsGenerated", "pdfDownloadsInRange"]
                for metric in key_metrics:
                    if metric in kpis:
                        log(f"   - {metric}: {kpis[metric]}")
                
                return True
            else:
                log(f"❌ Dashboard returned empty kpis")
                return False
        else:
            log(f"❌ Dashboard failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Dashboard exception: {e}")
        return False

def test_worksheets_analytics_regression():
    """Test 10: Regression test - Worksheets analytics endpoint"""
    log("TEST 10: Regression test - GET /admin/analytics/worksheets")
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/analytics/worksheets?limit=5",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            
            if items:
                log(f"✅ Worksheets analytics endpoint working")
                log(f"   Items returned: {len(items)}")
                return True
            else:
                log(f"⚠️  Worksheets analytics returned empty items (may be expected if no data)")
                return True
        else:
            log(f"❌ Worksheets analytics failed with status {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Worksheets analytics exception: {e}")
        return False

def test_chromium_info():
    """Test 11: Check chromium executable info"""
    log("TEST 11: Check chromium executable info")
    
    try:
        # Check system chromium
        result = subprocess.run(
            ["which", "chromium"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            chromium_path = result.stdout.strip()
            log(f"✅ System chromium found at: {chromium_path}")
            
            # Get version
            result = subprocess.run(
                ["chromium", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                version = result.stdout.strip()
                log(f"   Version: {version}")
        else:
            log(f"⚠️  System chromium not found in PATH")
        
        # Check architecture
        result = subprocess.run(
            ["uname", "-m"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            arch = result.stdout.strip()
            log(f"   Container architecture: {arch}")
            
            if arch == "aarch64":
                log(f"   ✅ Confirmed aarch64 (arm64) architecture")
            else:
                log(f"   ⚠️  Architecture is {arch}, not aarch64")
        
        return True
        
    except Exception as e:
        log(f"⚠️  Chromium info check exception: {e}")
        return True  # Non-critical

def main():
    """Run all tests"""
    log("=" * 80)
    log("PDF GENERATION BUG FIX VERIFICATION (Chromium Executable Not Found)")
    log("Testing new resolution order: system chromium → @sparticuz/chromium → puppeteer")
    log("Container: aarch64 (arm64)")
    log("=" * 80)
    
    tests = [
        ("Admin Login", test_admin_login),
        ("Find Worksheet", test_find_worksheet),
        ("Get Initial Analytics", test_get_initial_analytics),
        ("Restart Service", test_restart_service),
        ("Cold-start PDF (worksheet)", test_cold_start_pdf),
        ("Warm PDF (worksheet)", test_warm_pdf),
        ("Answers Variant PDF", test_answers_variant_pdf),
        ("Analytics Logging", test_analytics_logging),
        ("Dashboard Regression", test_dashboard_regression),
        ("Worksheets Analytics Regression", test_worksheets_analytics_regression),
        ("Chromium Info", test_chromium_info),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        log("")
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
                # Don't stop on failure, continue testing
        except Exception as e:
            log(f"❌ Test '{test_name}' raised exception: {e}")
            failed += 1
    
    log("")
    log("=" * 80)
    log(f"TEST SUMMARY: {passed} passed, {failed} failed out of {len(tests)} tests")
    log("=" * 80)
    
    if failed == 0:
        log("✅ ALL TESTS PASSED")
        log("")
        log("KEY FINDINGS:")
        log("- Cold-start PDF generation working (after service restart)")
        log("- Warm PDF generation working (browser reuse)")
        log("- Answers variant PDF generation working")
        log("- No 'Chromium executable not found' errors")
        log("- Analytics logging working correctly")
        log("- Regression tests passed")
        log("")
        log("The user-reported issue 'Chromium executable not found' is RESOLVED.")
        sys.exit(0)
    else:
        log(f"❌ {failed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
