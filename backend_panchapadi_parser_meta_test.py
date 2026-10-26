#!/usr/bin/env python3
"""
Backend test for Panchapadi Enhanced Parser + /meta endpoint

Tests two features:
FEATURE A — Enhanced parser (parsePanchapadi):
  - New sections extracted: ocfCurricularGoal, ocfCompetency, scertCurricularGoal, 
    scertCompetency, support, enrichment, teacherReflection, studentEngagement
  - Signature headings (Teacher Signature / Headmaster Signature / ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର / 
    ପ୍ରଧାନ ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର) are DROPPED from output
  - New parsed.steps map: each of {adhiti,bodha,abhyasa,prayoga,prasara} has 
    { teacher, student, evidence, time }

FEATURE B — /panchapadi-lessons/:id/meta returns the new fields in parsed

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

# Comprehensive test HTML that exercises every new feature
TEST_HTML = """<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="em-class" content="Class 1">
<meta name="em-book" content="Mathematics">
<meta name="em-chapter" content="Numbers 1 to 10">
<meta name="em-chapter-order" content="1">
<meta name="em-period" content="9">
<title>Comprehensive Parser Test</title>
</head><body>
<h1>ପଞ୍ଚପଦୀ Test · Recognising Numbers</h1>
<h2>ପ୍ରସଙ୍ଗ · Topic</h2><p>Counting from 1 to 10.</p>

<h2>OCF-SE 2025 Curricular Goal</h2><p>CG-1 Learners identify numbers.</p>
<h2>OCF-SE 2025 Competency</h2><p>C-1.1 Match numbers to quantities.</p>
<h2>SCERT 2026 · LO · Curricular Goal</h2><p>CG-EVS-2 Understand quantity.</p>
<h2>SCERT 2026 · LO · Competency</h2><p>C-2.3 Count using objects.</p>

<h2>ଅଧୀତି · Adhiti</h2>
<p>5 mins</p>
<h3>Teacher Activity</h3><p>Teacher shows number chart.</p>
<h3>Student Activity</h3><p>Students repeat numbers.</p>
<h3>Assessment Evidence</h3><p>Oral response.</p>

<h2>ବୋଧ · Bodha</h2>
<p>10 mins</p>
<h3>Teacher Activity</h3><p>Teacher demonstrates counting.</p>
<h3>Student Activity</h3><p>Students count objects.</p>
<h3>Assessment Evidence</h3><p>Correct counting.</p>

<h2>ଅଭ୍ୟାସ · Abhyasa</h2>
<p>8 mins</p>
<h3>Teacher Activity</h3><p>Teacher writes numbers on board.</p>
<h3>Student Activity</h3><p>Students copy numbers.</p>
<h3>Assessment Evidence</h3><p>Correctly written numbers.</p>

<h2>ପ୍ରୟୋଗ · Prayoga</h2>
<p>7 mins</p>
<h3>Teacher Activity</h3><p>Teacher gives real-world example.</p>
<h3>Student Activity</h3><p>Students count classroom items.</p>
<h3>Assessment Evidence</h3><p>Accurate count.</p>

<h2>ପ୍ରସାର · Prasara</h2>
<p>5 mins</p>
<h3>Teacher Activity</h3><p>Teacher extends to shopping context.</p>
<h3>Student Activity</h3><p>Students role-play buying.</p>
<h3>Assessment Evidence</h3><p>Role play observation.</p>

<h2>Teaching Learning Materials</h2><ul><li>Number cards</li><li>Objects</li></ul>
<h2>Assessment Questions</h2><p>Ask 5 counting questions.</p>
<h2>Support for Learners Needing Help</h2><p>Use fingers to count.</p>
<h2>Enrichment</h2><p>Count backwards.</p>
<h2>Homework</h2><p>Count items at home.</p>
<h2>Teacher Reflection</h2><p>Note engagement level.</p>
<h2>Student Engagement Zone</h2>
<h3>Topic Check</h3><p>Which number comes after 5?</p>
<h3>More Examples</h3><p>Count claps.</p>

<h2>ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର · Teacher Signature</h2><p>_______________</p>
<h2>ପ୍ରଧାନ ଶିକ୍ଷକ ସ୍ୱାକ୍ଷର · Headmaster Signature</h2><p>_______________</p>
</body></html>"""

def test_panchapadi_parser_meta():
    """Test enhanced Panchapadi parser + /meta endpoint"""
    
    print("=" * 80)
    print("PANCHAPADI ENHANCED PARSER + /META ENDPOINT TEST")
    print("=" * 80)
    print()
    
    # Test 1: Admin Login
    print("Test 1: Admin Login")
    try:
        resp = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        token = data.get('token')
        if not token:
            print(f"❌ No token in response: {data}")
            return False
        
        print(f"✅ Admin login successful, token: {token[:20]}...")
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    print()
    
    # Test 2: Upload comprehensive test HTML
    print("Test 2: Upload comprehensive test HTML via POST /api/admin/panchapadi-lessons")
    try:
        upload_payload = {
            "html": TEST_HTML,
            "filename": "parser-test-comprehensive.html",
            "status": "published",
            "allowPrint": False,
            "allowPdfDownload": False,
            "allowHtmlDownload": False,
            "allowRawDownload": False,
            "writeMode": "replace"
        }
        
        resp = requests.post(f"{API_BASE}/admin/panchapadi-lessons", 
                           json=upload_payload, 
                           headers=headers, 
                           timeout=15)
        
        if resp.status_code != 200:
            print(f"❌ Upload failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        lesson_id = data.get('id')
        if not lesson_id:
            print(f"❌ No id in upload response: {data}")
            return False
        
        print(f"✅ Upload successful, lesson ID: {lesson_id}")
        print(f"   Title: {data.get('title', 'N/A')}")
        print(f"   Period: {data.get('period', 'N/A')}")
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return False
    
    print()
    
    # Test 3: GET /api/panchapadi-lessons/:id/meta and verify parsed structure
    print("Test 3: GET /api/panchapadi-lessons/:id/meta - Verify parsed structure")
    try:
        resp = requests.get(f"{API_BASE}/panchapadi-lessons/{lesson_id}/meta", 
                          headers=headers, 
                          timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ GET /meta failed: {resp.status_code} - {resp.text}")
            return False
        
        meta = resp.json()
        parsed = meta.get('parsed', {})
        
        print(f"✅ GET /meta successful")
        print(f"   Meta topicTitle: {meta.get('topicTitle', 'N/A')}")
        print(f"   Parsed topic: {parsed.get('topic', 'N/A')}")
        print()
        
        # Test 3a: Verify parsed.sections keys include new sections
        print("Test 3a: Verify parsed.sections includes new section keys")
        sections = parsed.get('sections', {})
        required_keys = [
            'topic', 'ocfCurricularGoal', 'ocfCompetency', 
            'scertCurricularGoal', 'scertCompetency',
            'adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasara',
            'tlm', 'assessment', 'support', 'enrichment', 'homework',
            'teacherReflection', 'studentEngagement'
        ]
        
        missing_keys = [k for k in required_keys if k not in sections]
        if missing_keys:
            print(f"❌ Missing section keys: {missing_keys}")
            print(f"   Available keys: {list(sections.keys())}")
            return False
        
        print(f"✅ All required section keys present: {len(required_keys)} keys")
        print(f"   Keys: {', '.join(required_keys)}")
        print()
        
        # Test 3b: Verify signature sections are NOT in output
        print("Test 3b: Verify signature sections are DROPPED from output")
        signature_indicators = ['ସ୍ୱାକ୍ଷର', 'signature', '_______________']
        found_signatures = []
        
        for key, section in sections.items():
            section_text = section.get('text', '') + section.get('html', '')
            for indicator in signature_indicators:
                if indicator in section_text:
                    found_signatures.append(f"{key} contains '{indicator}'")
        
        if found_signatures:
            print(f"❌ Signature content found in sections:")
            for sig in found_signatures:
                print(f"   - {sig}")
            return False
        
        print(f"✅ No signature content found in any section")
        print(f"   Checked {len(sections)} sections for signature indicators")
        print()
        
        # Test 3c: Verify parsed.steps structure
        print("Test 3c: Verify parsed.steps has all 5 Panchapadi stages")
        steps = parsed.get('steps', {})
        required_steps = ['adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasara']
        
        missing_steps = [s for s in required_steps if s not in steps]
        if missing_steps:
            print(f"❌ Missing steps: {missing_steps}")
            print(f"   Available steps: {list(steps.keys())}")
            return False
        
        print(f"✅ All 5 Panchapadi steps present")
        print()
        
        # Test 3d: Verify each step has {teacher, student, evidence, time}
        print("Test 3d: Verify each step has {teacher, student, evidence, time}")
        all_steps_valid = True
        for step_name in required_steps:
            step = steps.get(step_name, {})
            teacher = step.get('teacher', '')
            student = step.get('student', '')
            evidence = step.get('evidence', '')
            time = step.get('time', '')
            
            # Check if all fields are present and non-empty
            if not teacher:
                print(f"❌ {step_name}: teacher field is empty")
                all_steps_valid = False
            if not student:
                print(f"❌ {step_name}: student field is empty")
                all_steps_valid = False
            if not evidence:
                print(f"❌ {step_name}: evidence field is empty")
                all_steps_valid = False
            if not time:
                print(f"❌ {step_name}: time field is empty")
                all_steps_valid = False
            
            if teacher and student and evidence and time:
                print(f"✅ {step_name}: all fields present")
                print(f"   - teacher: {teacher[:50]}...")
                print(f"   - student: {student[:50]}...")
                print(f"   - evidence: {evidence[:50]}...")
                print(f"   - time: {time}")
        
        if not all_steps_valid:
            return False
        
        print()
        
        # Test 3e: Verify parsed.cgCodes
        print("Test 3e: Verify parsed.cgCodes contains expected codes")
        cg_codes = parsed.get('cgCodes', [])
        expected_cg = ['CG-1', 'CG-EVS-2']
        
        missing_cg = [c for c in expected_cg if c not in cg_codes]
        if missing_cg:
            print(f"❌ Missing CG codes: {missing_cg}")
            print(f"   Found CG codes: {cg_codes}")
            return False
        
        print(f"✅ All expected CG codes present: {cg_codes}")
        print()
        
        # Test 3f: Verify parsed.competencyCodes
        print("Test 3f: Verify parsed.competencyCodes contains expected codes")
        comp_codes = parsed.get('competencyCodes', [])
        expected_comp = ['C-1.1', 'C-2.3']
        
        missing_comp = [c for c in expected_comp if c not in comp_codes]
        if missing_comp:
            print(f"❌ Missing Competency codes: {missing_comp}")
            print(f"   Found Competency codes: {comp_codes}")
            return False
        
        print(f"✅ All expected Competency codes present: {comp_codes}")
        print()
        
        # Test 3g: Verify parsed.topic
        print("Test 3g: Verify parsed.topic matches expected value")
        topic = parsed.get('topic', '')
        expected_topic = 'ପଞ୍ଚପଦୀ Test · Recognising Numbers'
        
        if topic != expected_topic:
            print(f"❌ Topic mismatch")
            print(f"   Expected: {expected_topic}")
            print(f"   Got: {topic}")
            return False
        
        print(f"✅ Topic matches: {topic}")
        print()
        
        # Test 3h: Verify meta.topicTitle matches parsed.topic
        print("Test 3h: Verify meta.topicTitle matches parsed.topic")
        meta_topic = meta.get('topicTitle', '')
        
        if meta_topic != topic:
            print(f"❌ meta.topicTitle doesn't match parsed.topic")
            print(f"   meta.topicTitle: {meta_topic}")
            print(f"   parsed.topic: {topic}")
            return False
        
        print(f"✅ meta.topicTitle matches parsed.topic: {meta_topic}")
        print()
        
    except Exception as e:
        print(f"❌ GET /meta error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 4: Cleanup - DELETE the test row
    print("Test 4: Cleanup - DELETE /api/admin/panchapadi-lessons/:id")
    try:
        resp = requests.delete(f"{API_BASE}/admin/panchapadi-lessons/{lesson_id}", 
                             headers=headers, 
                             timeout=10)
        
        if resp.status_code != 200:
            print(f"⚠️  Delete failed: {resp.status_code} - {resp.text}")
            print(f"   (Non-critical - test row may remain in DB)")
        else:
            print(f"✅ Test row deleted successfully")
    except Exception as e:
        print(f"⚠️  Delete error: {e}")
        print(f"   (Non-critical - test row may remain in DB)")
    
    print()
    
    # Test 5: Regression - Verify /panchapadi-lessons/browse still works
    print("Test 5: Regression - Verify /panchapadi-lessons/browse returns 200")
    try:
        resp = requests.get(f"{API_BASE}/panchapadi-lessons/browse", 
                          headers=headers, 
                          timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ Browse endpoint broken: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        classes = data.get('classes', [])
        print(f"✅ Browse endpoint working, returned {len(classes)} classes")
        
        # Check if topicTitle is present in period objects
        has_topic_title = False
        for cls in classes:
            for book in cls.get('books', []):
                for chapter in book.get('chapters', []):
                    for period in chapter.get('periods', []):
                        if 'topicTitle' in period:
                            has_topic_title = True
                            break
        
        if has_topic_title:
            print(f"✅ topicTitle field present in period objects")
        else:
            print(f"⚠️  No topicTitle found in periods (may be empty collection)")
        
    except Exception as e:
        print(f"❌ Browse endpoint error: {e}")
        return False
    
    print()
    
    # Test 6: Regression - Verify download gates still work
    print("Test 6: Regression - Upload test row with allowHtmlDownload=false")
    try:
        upload_payload = {
            "html": TEST_HTML,
            "filename": "download-gate-test.html",
            "status": "published",
            "allowPrint": False,
            "allowPdfDownload": False,
            "allowHtmlDownload": False,
            "allowRawDownload": False,
            "writeMode": "replace"
        }
        
        resp = requests.post(f"{API_BASE}/admin/panchapadi-lessons", 
                           json=upload_payload, 
                           headers=headers, 
                           timeout=15)
        
        if resp.status_code != 200:
            print(f"❌ Upload failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        gate_test_id = data.get('id')
        print(f"✅ Upload successful, ID: {gate_test_id}")
        
        # Try to download HTML (should be blocked)
        resp = requests.get(f"{API_BASE}/panchapadi-lessons/{gate_test_id}/download/html", 
                          headers=headers, 
                          timeout=10)
        
        if resp.status_code == 403:
            print(f"✅ HTML download correctly blocked (403)")
        else:
            print(f"❌ HTML download should return 403, got {resp.status_code}")
            # Cleanup
            requests.delete(f"{API_BASE}/admin/panchapadi-lessons/{gate_test_id}", 
                          headers=headers, timeout=10)
            return False
        
        # Cleanup
        resp = requests.delete(f"{API_BASE}/admin/panchapadi-lessons/{gate_test_id}", 
                             headers=headers, 
                             timeout=10)
        
        if resp.status_code == 200:
            print(f"✅ Gate test row deleted successfully")
        
    except Exception as e:
        print(f"❌ Download gate test error: {e}")
        return False
    
    print()
    print("=" * 80)
    print("✅ ALL TESTS PASSED - PANCHAPADI ENHANCED PARSER + /META ENDPOINT WORKING")
    print("=" * 80)
    return True

if __name__ == '__main__':
    try:
        success = test_panchapadi_parser_meta()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
