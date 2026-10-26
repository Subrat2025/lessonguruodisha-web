#!/usr/bin/env python3
"""
Backend test for Panchapadi Assessment Table Row-Splitting with real Odisha textbook Odia labels.

Tests the parser's ability to correctly split assessment table rows into separate sections:
- assessment (ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ / ଏକ୍ଜିଟ୍ ଟିକେଟ୍)
- support (ସହାୟତା ଆବଶ୍ୟକ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ)
- enrichment (ଅଗ୍ରଣୀ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ)
- homework (ଗୃହକାର୍ଯ୍ୟ)
- teacherReflection (ଶିକ୍ଷକ ଆତ୍ମବିଚୋଚୋ)

Also tests LO code extraction (oldLoCodes, cgCodes, competencyCodes).
"""

import requests
import os
import sys

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test HTML payload with exact Odia labels from production uploads
TEST_HTML = """<!doctype html><html><head><meta charset="utf-8">
<meta name="em-class" content="Class 1"><meta name="em-book" content="Mathematics">
<meta name="em-chapter" content="Numbers"><meta name="em-chapter-order" content="1">
<meta name="em-period" content="7"><title>Assess Split Test</title></head><body>
<h1>Assess Split Period 7</h1>
<h2>Learning Outcomes</h2>
<table>
<tr><th>ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ Curricular goal</th><td>OCF-SE 2025 CG-8 goal. SCERT 2026 · LO CG-7</td></tr>
<tr><th>ଦକ୍ଷତା Competency</th><td>OCF-SE 2025 C-39 comp. SCERT 2026 · LO C-8.8</td></tr>
<tr><th>ଶିକ୍ଷଣ ଫଳାଫଳ ସଙ୍କେତ Learning-outcome codes</th><td>OCF-SE 2025 M.101 Preparatory M.101-M.112. SCERT 2026 · LO CD 8.8.1</td></tr>
</table>
<h2>Assessment</h2>
<table>
<tr><th>ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ / ଏକ୍ଜିଟ୍ ଟିକେଟ୍ Assessment questions</th><td>Q1 Q2 Q3</td></tr>
<tr><th>ସହାୟତା ଆବଶ୍ୟକ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ Support for learners needing help</th><td>Support content only</td></tr>
<tr><th>ଅଗ୍ରଣୀ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ Enrichment</th><td>Enrichment content only</td></tr>
<tr><th>ଗୃହକାର୍ଯ୍ୟ Homework / extension</th><td>Homework content only</td></tr>
<tr><th>ଶିକ୍ଷକ ଆତ୍ମବିଚୋଚୋ Teacher reflection</th><td>Reflection content only</td></tr>
</table>
</body></html>"""

def strip_html(text):
    """Strip HTML tags and normalize whitespace."""
    import re
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def main():
    print("=" * 80)
    print("PANCHAPADI ASSESSMENT TABLE ROW-SPLITTING TEST")
    print("=" * 80)
    
    token = None
    lesson_id = None
    
    try:
        # Test 1: Admin Login
        print("\n[Test 1] Admin Login")
        resp = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert 'token' in data, "No token in login response"
        token = data['token']
        print(f"✅ Admin login successful, token: {token[:20]}...")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test 2: POST /api/admin/panchapadi-lessons with test HTML
        print("\n[Test 2] POST /api/admin/panchapadi-lessons with test HTML")
        resp = requests.post(f"{API_BASE}/admin/panchapadi-lessons", json={
            "html": TEST_HTML,
            "filename": "assess-split-test.html",
            "status": "published",
            "allowPrint": False,
            "allowPdfDownload": False,
            "allowHtmlDownload": False,
            "allowRawDownload": False,
            "writeMode": "replace"
        }, headers=headers, timeout=30)
        assert resp.status_code == 200, f"Upload failed: {resp.status_code} {resp.text}"
        data = resp.json()
        print(f"   Response data: {data}")
        assert data.get('ok') == True, f"Upload not ok: {data}"
        # The response has the lesson ID directly in the root
        lesson_id = data.get('id')
        assert lesson_id, f"No lesson ID in response: {data}"
        print(f"✅ Lesson created with ID: {lesson_id}")
        print(f"   Class: {data.get('classLabel', 'N/A')}")
        print(f"   Book: {data.get('bookLabel', 'N/A')}")
        print(f"   Chapter: {data.get('chapterLabel', 'N/A')}")
        print(f"   Period: {data.get('period', 'N/A')}")
        
        # Test 3: GET /api/panchapadi-lessons/:id/meta → verify parsed sections
        print(f"\n[Test 3] GET /api/panchapadi-lessons/{lesson_id}/meta")
        resp = requests.get(f"{API_BASE}/panchapadi-lessons/{lesson_id}/meta", headers=headers, timeout=30)
        assert resp.status_code == 200, f"Meta fetch failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert 'parsed' in data, "No parsed data in response"
        parsed = data['parsed']
        assert 'sections' in parsed, "No sections in parsed data"
        sections = parsed['sections']
        
        print(f"✅ Meta fetched successfully")
        print(f"   Topic: {parsed.get('topic', 'N/A')}")
        print(f"   Sections found: {list(sections.keys())}")
        
        # ASSERTION 1: assessment.html must equal "Q1 Q2 Q3" (stripped) and NOT contain other rows' content
        print("\n[Assertion 1] Assessment section must contain ONLY 'Q1 Q2 Q3'")
        assert 'assessment' in sections, "❌ FAIL: assessment section not found"
        assessment_html = sections['assessment'].get('html', '')
        assessment_text = strip_html(assessment_html)
        print(f"   Assessment text (stripped): '{assessment_text}'")
        assert assessment_text == "Q1 Q2 Q3", f"❌ FAIL: Expected 'Q1 Q2 Q3', got '{assessment_text}'"
        assert "Support content" not in assessment_html, f"❌ FAIL: Assessment contains 'Support content'"
        assert "Enrichment content" not in assessment_html, f"❌ FAIL: Assessment contains 'Enrichment content'"
        assert "Homework content" not in assessment_html, f"❌ FAIL: Assessment contains 'Homework content'"
        assert "Reflection content" not in assessment_html, f"❌ FAIL: Assessment contains 'Reflection content'"
        print("✅ PASS: Assessment section contains ONLY 'Q1 Q2 Q3'")
        
        # ASSERTION 2: support.html must contain "Support content only" and NOT other rows' content
        print("\n[Assertion 2] Support section must contain ONLY 'Support content only'")
        assert 'support' in sections, "❌ FAIL: support section not found"
        support_html = sections['support'].get('html', '')
        support_text = strip_html(support_html)
        print(f"   Support text (stripped): '{support_text}'")
        assert "Support content only" in support_text, f"❌ FAIL: Support does not contain 'Support content only', got '{support_text}'"
        assert "Q1 Q2 Q3" not in support_html, f"❌ FAIL: Support contains 'Q1 Q2 Q3'"
        assert "Enrichment content" not in support_html, f"❌ FAIL: Support contains 'Enrichment content'"
        assert "Homework content" not in support_html, f"❌ FAIL: Support contains 'Homework content'"
        assert "Reflection content" not in support_html, f"❌ FAIL: Support contains 'Reflection content'"
        print("✅ PASS: Support section contains ONLY 'Support content only'")
        
        # ASSERTION 3: enrichment.html must contain "Enrichment content only" and NOT other rows' content
        print("\n[Assertion 3] Enrichment section must contain ONLY 'Enrichment content only'")
        assert 'enrichment' in sections, "❌ FAIL: enrichment section not found"
        enrichment_html = sections['enrichment'].get('html', '')
        enrichment_text = strip_html(enrichment_html)
        print(f"   Enrichment text (stripped): '{enrichment_text}'")
        assert "Enrichment content only" in enrichment_text, f"❌ FAIL: Enrichment does not contain 'Enrichment content only', got '{enrichment_text}'"
        assert "Q1 Q2 Q3" not in enrichment_html, f"❌ FAIL: Enrichment contains 'Q1 Q2 Q3'"
        assert "Support content" not in enrichment_html, f"❌ FAIL: Enrichment contains 'Support content'"
        assert "Homework content" not in enrichment_html, f"❌ FAIL: Enrichment contains 'Homework content'"
        assert "Reflection content" not in enrichment_html, f"❌ FAIL: Enrichment contains 'Reflection content'"
        print("✅ PASS: Enrichment section contains ONLY 'Enrichment content only'")
        
        # ASSERTION 4: homework.html must contain "Homework content only" and NOT other rows' content
        print("\n[Assertion 4] Homework section must contain ONLY 'Homework content only'")
        assert 'homework' in sections, "❌ FAIL: homework section not found"
        homework_html = sections['homework'].get('html', '')
        homework_text = strip_html(homework_html)
        print(f"   Homework text (stripped): '{homework_text}'")
        assert "Homework content only" in homework_text, f"❌ FAIL: Homework does not contain 'Homework content only', got '{homework_text}'"
        assert "Q1 Q2 Q3" not in homework_html, f"❌ FAIL: Homework contains 'Q1 Q2 Q3'"
        assert "Support content" not in homework_html, f"❌ FAIL: Homework contains 'Support content'"
        assert "Enrichment content" not in homework_html, f"❌ FAIL: Homework contains 'Enrichment content'"
        assert "Reflection content" not in homework_html, f"❌ FAIL: Homework contains 'Reflection content'"
        print("✅ PASS: Homework section contains ONLY 'Homework content only'")
        
        # ASSERTION 5: teacherReflection.html must contain "Reflection content only" and NOT other rows' content
        print("\n[Assertion 5] Teacher Reflection section must contain ONLY 'Reflection content only'")
        assert 'teacherReflection' in sections, "❌ FAIL: teacherReflection section not found"
        reflection_html = sections['teacherReflection'].get('html', '')
        reflection_text = strip_html(reflection_html)
        print(f"   Teacher Reflection text (stripped): '{reflection_text}'")
        assert "Reflection content only" in reflection_text, f"❌ FAIL: Teacher Reflection does not contain 'Reflection content only', got '{reflection_text}'"
        assert "Q1 Q2 Q3" not in reflection_html, f"❌ FAIL: Teacher Reflection contains 'Q1 Q2 Q3'"
        assert "Support content" not in reflection_html, f"❌ FAIL: Teacher Reflection contains 'Support content'"
        assert "Enrichment content" not in reflection_html, f"❌ FAIL: Teacher Reflection contains 'Enrichment content'"
        assert "Homework content" not in reflection_html, f"❌ FAIL: Teacher Reflection contains 'Homework content'"
        print("✅ PASS: Teacher Reflection section contains ONLY 'Reflection content only'")
        
        # ASSERTION 6: oldLoCodes must contain ["M.101", "M.112"] (order-independent)
        print("\n[Assertion 6] oldLoCodes must contain ['M.101', 'M.112']")
        old_lo_codes = parsed.get('oldLoCodes', [])
        print(f"   oldLoCodes: {old_lo_codes}")
        assert 'M.101' in old_lo_codes, f"❌ FAIL: 'M.101' not in oldLoCodes: {old_lo_codes}"
        assert 'M.112' in old_lo_codes, f"❌ FAIL: 'M.112' not in oldLoCodes: {old_lo_codes}"
        print("✅ PASS: oldLoCodes contains ['M.101', 'M.112']")
        
        # ASSERTION 7: cgCodes must contain ["CG-8", "CG-7"]
        print("\n[Assertion 7] cgCodes must contain ['CG-8', 'CG-7']")
        cg_codes = parsed.get('cgCodes', [])
        print(f"   cgCodes: {cg_codes}")
        assert 'CG-8' in cg_codes, f"❌ FAIL: 'CG-8' not in cgCodes: {cg_codes}"
        assert 'CG-7' in cg_codes, f"❌ FAIL: 'CG-7' not in cgCodes: {cg_codes}"
        print("✅ PASS: cgCodes contains ['CG-8', 'CG-7']")
        
        # ASSERTION 8: competencyCodes must contain ["C-39", "C-8.8"]
        print("\n[Assertion 8] competencyCodes must contain ['C-39', 'C-8.8']")
        comp_codes = parsed.get('competencyCodes', [])
        print(f"   competencyCodes: {comp_codes}")
        assert 'C-39' in comp_codes, f"❌ FAIL: 'C-39' not in competencyCodes: {comp_codes}"
        assert 'C-8.8' in comp_codes, f"❌ FAIL: 'C-8.8' not in competencyCodes: {comp_codes}"
        print("✅ PASS: competencyCodes contains ['C-39', 'C-8.8']")
        
        # Test 4: DELETE /api/admin/panchapadi-lessons/:id (cleanup)
        print(f"\n[Test 4] DELETE /api/admin/panchapadi-lessons/{lesson_id}")
        resp = requests.delete(f"{API_BASE}/admin/panchapadi-lessons/{lesson_id}", headers=headers, timeout=30)
        assert resp.status_code == 200, f"Delete failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data.get('ok') == True, f"Delete not ok: {data}"
        print(f"✅ Lesson deleted successfully")
        lesson_id = None  # Mark as cleaned up
        
        # Test 5: Regression - GET /api/panchapadi-lessons/browse still returns 200
        print("\n[Test 5] Regression - GET /api/panchapadi-lessons/browse")
        resp = requests.get(f"{API_BASE}/panchapadi-lessons/browse", headers=headers, timeout=30)
        assert resp.status_code == 200, f"Browse failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert 'classes' in data, "No classes in browse response"
        print(f"✅ Browse endpoint working, classes count: {len(data['classes'])}")
        
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED")
        print("=" * 80)
        print("\nSUMMARY:")
        print("  ✅ Assessment table rows correctly split into separate sections")
        print("  ✅ Each section contains ONLY its own content (no cross-contamination)")
        print("  ✅ oldLoCodes extracted correctly: ['M.101', 'M.112']")
        print("  ✅ cgCodes extracted correctly: ['CG-8', 'CG-7']")
        print("  ✅ competencyCodes extracted correctly: ['C-39', 'C-8.8']")
        print("  ✅ Cleanup successful")
        print("  ✅ Regression test passed")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Cleanup: delete lesson if it still exists
        if lesson_id and token:
            try:
                print(f"\n[Cleanup] Deleting lesson {lesson_id}")
                headers = {"Authorization": f"Bearer {token}"}
                resp = requests.delete(f"{API_BASE}/admin/panchapadi-lessons/{lesson_id}", headers=headers, timeout=30)
                if resp.status_code == 200:
                    print(f"✅ Cleanup successful")
                else:
                    print(f"⚠️ Cleanup failed: {resp.status_code} {resp.text}")
            except Exception as e:
                print(f"⚠️ Cleanup error: {e}")

if __name__ == "__main__":
    main()
