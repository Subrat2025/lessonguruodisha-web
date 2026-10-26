#!/usr/bin/env python3
"""
Backend PDF Generation Test — Bug Fix Verification
Tests the fixed PDF generation endpoint with puppeteer + chromium resolution.
"""
import requests
import time
import json
from pymongo import MongoClient

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def test_pdf_generation():
    print("\n" + "="*80)
    print("PDF GENERATION BUG FIX VERIFICATION TEST")
    print("="*80)
    
    # Test 1: Admin Login
    print("\n[Test 1] Admin Login...")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "token" in data, "No token in response"
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"✅ Login successful, token: {token[:20]}...")
    except Exception as e:
        print(f"❌ Test 1 FAILED: {e}")
        return
    
    # Test 2: Find or create a worksheet
    print("\n[Test 2] Finding or creating a worksheet...")
    try:
        # Get classes
        resp = requests.get(f"{BASE_URL}/classes", headers=headers, timeout=10)
        assert resp.status_code == 200, f"Classes fetch failed: {resp.status_code}"
        data = resp.json()
        classes = data.get("classes", data) if isinstance(data, dict) and "classes" in data else data
        assert len(classes) > 0, "No classes found"
        class_id = classes[0]["id"]
        print(f"   Found {len(classes)} classes, using classId: {class_id}")
        
        # Get books for this class
        resp = requests.get(f"{BASE_URL}/books?classId={class_id}", headers=headers, timeout=10)
        assert resp.status_code == 200, f"Books fetch failed: {resp.status_code}"
        data = resp.json()
        books = data.get("books", data) if isinstance(data, dict) and "books" in data else data
        assert len(books) > 0, "No books found"
        book_id = books[0]["id"]
        print(f"   Found {len(books)} books, using bookId: {book_id}")
        
        # Get chapters for this book
        resp = requests.get(f"{BASE_URL}/chapters?bookId={book_id}", headers=headers, timeout=10)
        assert resp.status_code == 200, f"Chapters fetch failed: {resp.status_code}"
        data = resp.json()
        chapters = data.get("chapters", data) if isinstance(data, dict) and "chapters" in data else data
        assert len(chapters) > 0, "No chapters found"
        chapter_id = chapters[0]["id"]
        print(f"   Found {len(chapters)} chapters, using chapterId: {chapter_id}")
        
        # Get lessons for this chapter
        resp = requests.get(f"{BASE_URL}/lessons?chapterId={chapter_id}", headers=headers, timeout=10)
        assert resp.status_code == 200, f"Lessons fetch failed: {resp.status_code}"
        data = resp.json()
        lessons = data.get("lessons", data) if isinstance(data, dict) and "lessons" in data else data
        assert len(lessons) > 0, "No lessons found"
        lesson_id = lessons[0]["id"]
        print(f"   Found {len(lessons)} lessons, using lessonId: {lesson_id}")
        
        # Get existing worksheets for this lesson
        resp = requests.get(f"{BASE_URL}/lessons/{lesson_id}/worksheets", headers=headers, timeout=10)
        assert resp.status_code == 200, f"Worksheets fetch failed: {resp.status_code}"
        data = resp.json()
        worksheets = data.get("items", []) if isinstance(data, dict) else data
        
        if len(worksheets) > 0:
            worksheet_id = worksheets[0]["id"]
            print(f"✅ Found existing worksheet: {worksheet_id}")
        else:
            # Create a new worksheet
            print("   No worksheets found, creating one...")
            resp = requests.post(f"{BASE_URL}/lessons/{lesson_id}/worksheets", 
                json={
                    "type": "practice",
                    "format": "mcq",
                    "difficulty": "medium",
                    "count": 10,
                    "force": True
                },
                headers=headers,
                timeout=60  # AI generation can take time
            )
            assert resp.status_code == 200, f"Worksheet creation failed: {resp.status_code} {resp.text}"
            data = resp.json()
            assert data.get("ok"), "Worksheet creation not ok"
            worksheet_id = data["worksheet"]["id"]
            print(f"✅ Created new worksheet: {worksheet_id}")
        
    except Exception as e:
        print(f"❌ Test 2 FAILED: {e}")
        return
    
    # Test 3: Get initial analytics count
    print("\n[Test 3] Getting initial analytics count...")
    try:
        client = MongoClient("mongodb://localhost:27017")
        db = client["edumaster_odisha"]
        initial_count = db.worksheetAnalytics.count_documents({"status": "pdf_download"})
        print(f"✅ Initial analytics count: {initial_count}")
    except Exception as e:
        print(f"❌ Test 3 FAILED: {e}")
        return
    
    # Test 4: Restart Next.js service (cold start)
    print("\n[Test 4] Restarting Next.js service for cold-start test...")
    try:
        import subprocess
        result = subprocess.run(["sudo", "supervisorctl", "restart", "nextjs"], 
                              capture_output=True, text=True, timeout=10)
        print(f"   Restart output: {result.stdout}")
        print("   Waiting 5 seconds for service to start...")
        time.sleep(5)
        print("✅ Service restarted")
    except Exception as e:
        print(f"❌ Test 4 FAILED: {e}")
        return
    
    # Test 5: Cold-start PDF render (worksheet variant)
    print("\n[Test 5] Cold-start PDF render (worksheet variant)...")
    try:
        start_time = time.time()
        resp = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets/{worksheet_id}/pdf?variant=worksheet",
            headers=headers,
            timeout=30
        )
        elapsed = time.time() - start_time
        
        assert resp.status_code == 200, f"PDF generation failed: {resp.status_code} {resp.text}"
        assert resp.headers.get("Content-Type") == "application/pdf", f"Wrong content type: {resp.headers.get('Content-Type')}"
        
        # Check PDF magic bytes
        content = resp.content
        assert content[:4] == b'%PDF', f"Invalid PDF magic bytes: {content[:10]}"
        assert len(content) >= 5000, f"PDF too small: {len(content)} bytes"
        
        # Check for chromium error in response
        if b"Chromium executable not found" in content or b"PDF generation failed" in content:
            print(f"❌ CRITICAL: Chromium error found in PDF response!")
            return
        
        print(f"✅ Cold-start PDF generated successfully")
        print(f"   Response time: {elapsed:.2f}s")
        print(f"   PDF size: {len(content)} bytes")
        print(f"   Content-Type: {resp.headers.get('Content-Type')}")
        
    except Exception as e:
        print(f"❌ Test 5 FAILED: {e}")
        return
    
    # Test 6: Warm-cache PDF render (same worksheet variant)
    print("\n[Test 6] Warm-cache PDF render (worksheet variant)...")
    try:
        start_time = time.time()
        resp = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets/{worksheet_id}/pdf?variant=worksheet",
            headers=headers,
            timeout=10
        )
        elapsed = time.time() - start_time
        
        assert resp.status_code == 200, f"PDF generation failed: {resp.status_code} {resp.text}"
        assert resp.headers.get("Content-Type") == "application/pdf", f"Wrong content type: {resp.headers.get('Content-Type')}"
        
        content = resp.content
        assert content[:4] == b'%PDF', f"Invalid PDF magic bytes: {content[:10]}"
        assert len(content) >= 5000, f"PDF too small: {len(content)} bytes"
        
        # Check for chromium error
        if b"Chromium executable not found" in content or b"PDF generation failed" in content:
            print(f"❌ CRITICAL: Chromium error found in PDF response!")
            return
        
        print(f"✅ Warm-cache PDF generated successfully")
        print(f"   Response time: {elapsed:.2f}s (should be < 3s)")
        print(f"   PDF size: {len(content)} bytes")
        
        if elapsed >= 3.0:
            print(f"   ⚠️  WARNING: Warm cache took longer than expected ({elapsed:.2f}s)")
        
    except Exception as e:
        print(f"❌ Test 6 FAILED: {e}")
        return
    
    # Test 7: Answer-key variant PDF render
    print("\n[Test 7] Answer-key variant PDF render...")
    try:
        start_time = time.time()
        resp = requests.get(
            f"{BASE_URL}/lessons/{lesson_id}/worksheets/{worksheet_id}/pdf?variant=answers",
            headers=headers,
            timeout=10
        )
        elapsed = time.time() - start_time
        
        assert resp.status_code == 200, f"PDF generation failed: {resp.status_code} {resp.text}"
        assert resp.headers.get("Content-Type") == "application/pdf", f"Wrong content type: {resp.headers.get('Content-Type')}"
        
        content = resp.content
        assert content[:4] == b'%PDF', f"Invalid PDF magic bytes: {content[:10]}"
        assert len(content) >= 5000, f"PDF too small: {len(content)} bytes"
        
        # Check for chromium error
        if b"Chromium executable not found" in content or b"PDF generation failed" in content:
            print(f"❌ CRITICAL: Chromium error found in PDF response!")
            return
        
        print(f"✅ Answer-key PDF generated successfully")
        print(f"   Response time: {elapsed:.2f}s")
        print(f"   PDF size: {len(content)} bytes")
        
    except Exception as e:
        print(f"❌ Test 7 FAILED: {e}")
        return
    
    # Test 8: Verify analytics logging
    print("\n[Test 8] Verifying analytics logging...")
    try:
        # Wait a moment for async analytics to be written
        time.sleep(1)
        
        final_count = db.worksheetAnalytics.count_documents({"status": "pdf_download"})
        delta = final_count - initial_count
        
        print(f"   Initial count: {initial_count}")
        print(f"   Final count: {final_count}")
        print(f"   Delta: {delta}")
        
        # We made 3 PDF requests (2 worksheet + 1 answers)
        assert delta >= 3, f"Expected at least 3 new analytics rows, got {delta}"
        
        # Check the latest analytics entries
        latest = list(db.worksheetAnalytics.find(
            {"status": "pdf_download", "worksheetId": worksheet_id}
        ).sort("createdAt", -1).limit(3))
        
        print(f"   Latest analytics entries:")
        for entry in latest:
            print(f"     - variant: {entry.get('variant')}, status: {entry.get('status')}, createdAt: {entry.get('createdAt')}")
        
        # Verify we have both variants
        variants = [e.get("variant") for e in latest]
        assert "worksheet" in variants, "Missing 'worksheet' variant in analytics"
        assert "answers" in variants, "Missing 'answers' variant in analytics"
        
        print(f"✅ Analytics logging verified: {delta} new rows added")
        
    except Exception as e:
        print(f"❌ Test 8 FAILED: {e}")
        return
    
    # Test 9: Regression - Admin analytics dashboard
    print("\n[Test 9] Regression test - GET /admin/analytics/dashboard...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/analytics/dashboard?range=30d", 
                          headers=headers, timeout=10)
        assert resp.status_code == 200, f"Dashboard failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "kpis" in data, "Missing 'kpis' in dashboard response"
        print(f"✅ Dashboard endpoint working")
        print(f"   KPIs keys: {list(data['kpis'].keys())}")
        
    except Exception as e:
        print(f"❌ Test 9 FAILED: {e}")
        return
    
    # Test 10: Regression - Admin analytics worksheets
    print("\n[Test 10] Regression test - GET /admin/analytics/worksheets...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/analytics/worksheets?limit=5", 
                          headers=headers, timeout=10)
        assert resp.status_code == 200, f"Worksheets analytics failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "items" in data, "Missing 'items' in worksheets analytics response"
        print(f"✅ Worksheets analytics endpoint working")
        print(f"   Items count: {len(data['items'])}")
        
    except Exception as e:
        print(f"❌ Test 10 FAILED: {e}")
        return
    
    print("\n" + "="*80)
    print("✅ ALL PDF GENERATION TESTS PASSED")
    print("="*80)
    print("\nSUMMARY:")
    print(f"  - Cold-start PDF generation: WORKING")
    print(f"  - Warm-cache PDF generation: WORKING")
    print(f"  - Answer-key variant: WORKING")
    print(f"  - No chromium errors: VERIFIED")
    print(f"  - Analytics logging: WORKING ({delta} new rows)")
    print(f"  - Dashboard endpoint: WORKING")
    print(f"  - Worksheets analytics endpoint: WORKING")
    print("\n✅ PDF generation bug fix is VERIFIED and WORKING correctly!")

if __name__ == "__main__":
    test_pdf_generation()
