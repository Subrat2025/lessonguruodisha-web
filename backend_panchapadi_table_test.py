#!/usr/bin/env python3
"""
Backend test for Panchapadi TABLE-based parser

Tests the new table-based extraction logic that handles:
1. 5-column table for Panchapadi steps (Stage | Time | Teacher | Student | Evidence)
2. 2-column table for Assessment sub-sections (label | content)

BASE URL: use NEXT_PUBLIC_BASE_URL from /app/.env and prefix `/api`.
ADMIN LOGIN: POST /api/auth/login with mobile `9999999999`, password `admin123`.
"""

import requests
import json
import sys
from datetime import datetime

# Read BASE_URL from .env
BASE_URL = None
try:
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_BASE_URL='):
                BASE_URL = line.split('=', 1)[1].strip()
                break
except Exception as e:
    print(f"❌ Failed to read .env: {e}")
    sys.exit(1)

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in .env")
    sys.exit(1)

API_BASE = f"{BASE_URL}/api"
print(f"🔗 API Base URL: {API_BASE}\n")

# Table-based HTML matching the user's uploaded template
TABLE_HTML = """<!doctype html>
<html><head><meta charset="utf-8">
<meta name="em-class" content="Class 1">
<meta name="em-book" content="ଗଣିତ">
<meta name="em-chapter" content="ଫୁଲବୁଡ଼ି ବିଲେଇ">
<meta name="em-chapter-order" content="1">
<meta name="em-period" content="1">
<title>Table Based Test</title></head><body>
<h1>ଫୁଲବୁଡ଼ି ବିଲେଇକୁ ଝୋଳିବା (ପାଠ - ୧)</h1>
<p>Class 1 · ଗଣିତ · Period 1 of 10</p>
<h2>ପ୍ରସଙ୍ଗ / Topic</h2><p>PANCHAPADI LESSON PLAN</p>
<h2>Learning Outcomes</h2>
<table><tr><th>Curricular goal</th><td>OCF-SE 2025 CG-8 goal. SCERT 2026 · LO CG-7</td></tr>
<tr><th>Competency</th><td>OCF-SE 2025 C-39. SCERT 2026 · LO C-8.8. C-7.1</td></tr>
<tr><th>LO codes</th><td>OCF-SE 2025 M.101 · SCERT 2026 · LO CD 8.8.1 · CD 7.1</td></tr></table>
<table><thead><tr><th>ସୋପାନ Stage</th><th>ସମୟ Time</th><th>ଶିକ୍ଷକ କାର୍ଯ୍ୟ Teacher facilitation</th><th>ଶିକ୍ଷାର୍ଥୀ କାର୍ଯ୍ୟ Learner engagement</th><th>ମୂଲ୍ୟାୟନ ପ୍ରମାଣ Assessment evidence</th></tr></thead>
<tbody>
<tr><td>୧. ଅଧୀତି Aditi Introduction</td><td>୫ ମି</td><td>ଅଧୀତି ଶିକ୍ଷକ ଦେବ</td><td>ଅଧୀତି ଶିକ୍ଷାର୍ଥୀ ପ୍ରଣୋ</td><td>ଅଧୀତି ପ୍ରମାଣ</td></tr>
<tr><td>୨. ବୋଧ Bodh Conceptual</td><td>୧୨ ମି</td><td>ବୋଧ ଶିକ୍ଷକ ପ୍ରସ୍ତୁତି</td><td>ବୋଧ ଶିକ୍ଷାର୍ଥୀ କ୍ରିୟା</td><td>ବୋଧ ପ୍ରମାଣ</td></tr>
<tr><td>୩. ଅଭ୍ୟାସ Abhyas Practice</td><td>୧୦ ମି</td><td>ଅଭ୍ୟାସ ଶିକ୍ଷକ</td><td>ଅଭ୍ୟାସ ଶିକ୍ଷାର୍ଥୀ</td><td>ଅଭ୍ୟାସ ପ୍ରମାଣ</td></tr>
<tr><td>୪. ପ୍ରୟୋଗ Prayog Application</td><td>୧୦ ମି</td><td>ପ୍ରୟୋଗ ଶିକ୍ଷକ</td><td>ପ୍ରୟୋଗ ଶିକ୍ଷାର୍ଥୀ</td><td>ପ୍ରୟୋଗ ପ୍ରମାଣ</td></tr>
<tr><td>୫. ପ୍ରସାର Prasar Extension</td><td>୮ ମି</td><td>ପ୍ରସାର ଶିକ୍ଷକ</td><td>ପ୍ରସାର ଶିକ୍ଷାର୍ଥୀ</td><td>ପ୍ରସାର ପ୍ରମାଣ</td></tr>
</tbody></table>
<h2>Assessment</h2>
<table>
<tr><th>ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ / assessment questions</th><td>Q1 Q2 Q3</td></tr>
<tr><th>ସହଯୋଗ / support for learners needing help</th><td>Support content</td></tr>
<tr><th>ପ୍ରଗତି / enrichment</th><td>Enrichment content</td></tr>
<tr><th>ଗୃହକାର୍ଯ୍ୟ / homework / extension</th><td>Homework content</td></tr>
<tr><th>ଶିକ୍ଷକ ଆତ୍ମଚିନ୍ତନ / teacher reflection</th><td>Reflection content</td></tr>
<tr><th>ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର / teacher's signature</th><td>____________</td></tr>
<tr><th>ପ୍ରଧାନ ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର / headmaster's signature</th><td>____________</td></tr>
</table>
</body></html>"""

def test_table_based_panchapadi():
    """Test TABLE-based Panchapadi parser with comprehensive assertions"""
    
    print("=" * 80)
    print("TEST: TABLE-BASED PANCHAPADI PARSER")
    print("=" * 80)
    
    # Test 1: Admin Login
    print("\n[Test 1] Admin Login...")
    try:
        login_resp = requests.post(
            f"{API_BASE}/auth/login",
            json={"mobile": "9999999999", "password": "admin123"},
            timeout=10
        )
        if login_resp.status_code != 200:
            print(f"❌ Login failed: {login_resp.status_code} {login_resp.text}")
            return False
        
        token = login_resp.json().get("token")
        if not token:
            print("❌ No token in login response")
            return False
        
        print(f"✅ Admin login successful, token: {token[:20]}...")
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 2: Upload table-based HTML
    print("\n[Test 2] Upload table-based Panchapadi HTML...")
    try:
        upload_resp = requests.post(
            f"{API_BASE}/admin/panchapadi-lessons",
            json={
                "html": TABLE_HTML,
                "filename": "table-based-test.html",
                "status": "published",
                "allowPrint": False,
                "allowPdfDownload": False,
                "allowHtmlDownload": False,
                "allowRawDownload": False,
                "writeMode": "replace"
            },
            headers=headers,
            timeout=30
        )
        
        if upload_resp.status_code != 200:
            print(f"❌ Upload failed: {upload_resp.status_code} {upload_resp.text}")
            return False
        
        upload_data = upload_resp.json()
        lesson_id = upload_data.get("id")
        
        if not lesson_id:
            print(f"❌ No id in upload response: {upload_data}")
            return False
        
        print(f"✅ Upload successful, lesson ID: {lesson_id}")
    except Exception as e:
        print(f"❌ Upload exception: {e}")
        return False
    
    # Test 3: Get /meta and verify parsed structure
    print("\n[Test 3] GET /panchapadi-lessons/:id/meta and verify parsing...")
    try:
        meta_resp = requests.get(
            f"{API_BASE}/panchapadi-lessons/{lesson_id}/meta",
            headers=headers,
            timeout=10
        )
        
        if meta_resp.status_code != 200:
            print(f"❌ Meta fetch failed: {meta_resp.status_code} {meta_resp.text}")
            return False
        
        meta_data = meta_resp.json()
        parsed = meta_data.get("parsed", {})
        
        print(f"✅ Meta fetched successfully")
        print(f"   Parsed keys: {list(parsed.keys())}")
        
    except Exception as e:
        print(f"❌ Meta fetch exception: {e}")
        return False
    
    # ASSERTION 1: parsed.steps must be an object with all 5 steps
    print("\n[ASSERTION 1] Verify parsed.steps structure...")
    steps = parsed.get("steps", {})
    required_steps = ["adhiti", "bodha", "abhyasa", "prayoga", "prasara"]
    
    if not isinstance(steps, dict):
        print(f"❌ parsed.steps is not an object: {type(steps)}")
        return False
    
    for step_key in required_steps:
        if step_key not in steps:
            print(f"❌ Missing step: {step_key}")
            return False
        
        step = steps[step_key]
        
        # Check required fields
        if "teacher" not in step or not step["teacher"]:
            print(f"❌ Step {step_key} missing or empty teacher field")
            return False
        
        if "student" not in step or not step["student"]:
            print(f"❌ Step {step_key} missing or empty student field")
            return False
        
        if "evidence" not in step or not step["evidence"]:
            print(f"❌ Step {step_key} missing or empty evidence field")
            return False
        
        if "time" not in step or not step["time"]:
            print(f"❌ Step {step_key} missing or empty time field")
            return False
        
        # Verify content contains expected Odia text markers
        if "ଶିକ୍ଷକ" not in step["teacher"] and step_key not in step["teacher"].lower():
            print(f"⚠️  Step {step_key} teacher field may not contain expected content: {step['teacher']}")
        
        if "ଶିକ୍ଷାର୍ଥୀ" not in step["student"] and step_key not in step["student"].lower():
            print(f"⚠️  Step {step_key} student field may not contain expected content: {step['student']}")
        
        if "ପ୍ରମାଣ" not in step["evidence"] and step_key not in step["evidence"].lower():
            print(f"⚠️  Step {step_key} evidence field may not contain expected content: {step['evidence']}")
        
        print(f"   ✅ {step_key}: teacher={step['teacher'][:30]}..., student={step['student'][:30]}..., evidence={step['evidence'][:30]}..., time={step['time']}")
    
    print("✅ ASSERTION 1 PASSED: All 5 steps present with required fields")
    
    # ASSERTION 2: parsed.sections must include all assessment sub-sections
    print("\n[ASSERTION 2] Verify parsed.sections includes assessment sub-sections...")
    sections = parsed.get("sections", {})
    
    required_sections = {
        "assessment": "Q1 Q2 Q3",
        "support": "Support content",
        "enrichment": "Enrichment content",
        "homework": "Homework content",
        "teacherReflection": "Reflection content"
    }
    
    for section_key, expected_content in required_sections.items():
        if section_key not in sections:
            print(f"❌ Missing section: {section_key}")
            return False
        
        section_html = sections[section_key].get("html", "") if isinstance(sections[section_key], dict) else sections[section_key]
        
        if not section_html:
            print(f"❌ Section {section_key} is empty")
            return False
        
        if expected_content not in section_html:
            print(f"❌ Section {section_key} does not contain expected content '{expected_content}'")
            print(f"   Actual content: {section_html[:100]}...")
            return False
        
        print(f"   ✅ {section_key}: contains '{expected_content}'")
    
    print("✅ ASSERTION 2 PASSED: All assessment sub-sections present with correct content")
    
    # ASSERTION 3: No section should contain signature text
    print("\n[ASSERTION 3] Verify no section contains signature text...")
    signature_markers = ["ସ୍ୱାକ୍ଷର", "signature", "____________"]
    
    for section_key, section_value in sections.items():
        section_html = section_value.get("html", "") if isinstance(section_value, dict) else section_value
        
        for marker in signature_markers:
            if marker in section_html.lower():
                print(f"❌ Section {section_key} contains signature marker '{marker}'")
                print(f"   Content: {section_html[:200]}...")
                return False
    
    print("✅ ASSERTION 3 PASSED: No section contains signature text")
    
    # ASSERTION 4: Learning Outcomes section must NOT contain steps table
    print("\n[ASSERTION 4] Verify learningOutcomes section does not contain steps table...")
    lo_section = sections.get("learningOutcomes", {})
    lo_html = lo_section.get("html", "") if isinstance(lo_section, dict) else lo_section
    
    if lo_html:
        # Check for table headers that would indicate the steps table
        if "Teacher facilitation" in lo_html or "Learner engagement" in lo_html:
            print(f"❌ learningOutcomes section contains steps table headers")
            print(f"   Content: {lo_html[:300]}...")
            return False
        
        # Check for <table> tag with these headers
        if "<table>" in lo_html.lower() and ("teacher" in lo_html.lower() and "student" in lo_html.lower()):
            # More specific check: look for the 5-column structure
            if "ଶିକ୍ଷକ କାର୍ଯ୍ୟ" in lo_html or "ଶିକ୍ଷାର୍ଥୀ କାର୍ଯ୍ୟ" in lo_html:
                print(f"❌ learningOutcomes section contains steps table")
                print(f"   Content: {lo_html[:300]}...")
                return False
        
        print(f"   ✅ learningOutcomes section clean (no steps table)")
    else:
        print(f"   ℹ️  learningOutcomes section is empty or not present")
    
    print("✅ ASSERTION 4 PASSED: learningOutcomes does not contain steps table")
    
    # ASSERTION 5: Verify CG and Competency codes extraction
    print("\n[ASSERTION 5] Verify CG and Competency codes extraction...")
    cg_codes = parsed.get("cgCodes", [])
    competency_codes = parsed.get("competencyCodes", [])
    
    expected_cg = ["CG-8", "CG-7"]
    expected_comp = ["C-39", "C-8.8", "C-7.1"]
    
    for code in expected_cg:
        if code not in cg_codes:
            print(f"❌ Missing CG code: {code}")
            print(f"   Found: {cg_codes}")
            return False
    
    for code in expected_comp:
        if code not in competency_codes:
            print(f"❌ Missing Competency code: {code}")
            print(f"   Found: {competency_codes}")
            return False
    
    print(f"   ✅ cgCodes: {cg_codes}")
    print(f"   ✅ competencyCodes: {competency_codes}")
    print("✅ ASSERTION 5 PASSED: CG and Competency codes extracted correctly")
    
    # Test 4: Cleanup - Delete the test lesson
    print("\n[Test 4] Cleanup - Delete test lesson...")
    try:
        delete_resp = requests.delete(
            f"{API_BASE}/admin/panchapadi-lessons/{lesson_id}",
            headers=headers,
            timeout=10
        )
        
        if delete_resp.status_code != 200:
            print(f"⚠️  Delete failed: {delete_resp.status_code} {delete_resp.text}")
        else:
            print(f"✅ Test lesson deleted successfully")
    except Exception as e:
        print(f"⚠️  Delete exception: {e}")
    
    return True

if __name__ == "__main__":
    print(f"\n{'='*80}")
    print(f"PANCHAPADI TABLE-BASED PARSER TEST")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*80}\n")
    
    success = test_table_based_panchapadi()
    
    print(f"\n{'='*80}")
    if success:
        print("✅ ALL TESTS PASSED - TABLE-BASED PANCHAPADI PARSER WORKING")
    else:
        print("❌ TESTS FAILED - SEE DETAILS ABOVE")
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*80}\n")
    
    sys.exit(0 if success else 1)
