#!/usr/bin/env python3
"""
Backend test for enriched Panchapadi upload preview endpoint.
Tests POST /api/admin/panchapadi-lessons/preview with per-period section validation.
"""

import requests
import json
import sys
from datetime import datetime

# Read base URL from .env
BASE_URL = None
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
            break

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in .env")
    sys.exit(1)

API_BASE = f"{BASE_URL}/api"
print(f"🔗 Testing against: {API_BASE}\n")

# Admin credentials
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Test results
tests_passed = 0
tests_failed = 0
test_results = []

def log_test(name, passed, detail=""):
    global tests_passed, tests_failed
    if passed:
        tests_passed += 1
        print(f"✅ {name}")
        test_results.append(f"✅ {name}")
    else:
        tests_failed += 1
        print(f"❌ {name}")
        if detail:
            print(f"   {detail}")
        test_results.append(f"❌ {name}: {detail}")

def test_preview_endpoint():
    """Test the enriched preview endpoint with single-period and multi-period HTML"""
    
    print("=" * 80)
    print("TEST 1: Admin Login")
    print("=" * 80)
    
    try:
        r = requests.post(f"{API_BASE}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if r.status_code != 200:
            log_test("Admin login", False, f"Status {r.status_code}: {r.text[:200]}")
            return None
        
        data = r.json()
        token = data.get('token')
        if not token:
            log_test("Admin login", False, "No token in response")
            return None
        
        log_test("Admin login", True, f"Token: {token[:20]}...")
        return token
        
    except Exception as e:
        log_test("Admin login", False, str(e))
        return None

    print()

def test_single_period_preview(token):
    """Test 1: Single-period Panchapadi HTML preview"""
    
    print("\n" + "=" * 80)
    print("TEST 2: Single-Period Panchapadi HTML Preview")
    print("=" * 80)
    
    # Single-period HTML with full Panchapadi structure
    html1 = """<!doctype html><html><head><meta charset="utf-8">
<meta name="em-class" content="Class 1"><meta name="em-book" content="Mathematics">
<meta name="em-chapter" content="Numbers"><meta name="em-chapter-order" content="1">
<meta name="em-period" content="1"><title>Single Period Test</title></head><body>
<h1>Numbers 1-10 · Period 1</h1>
<h2>Learning Outcomes</h2>
<table>
<tr><th>Curricular goal</th><td>CG-8 goal</td></tr>
<tr><th>Competency</th><td>C-1.1 comp</td></tr>
<tr><th>Learning-outcome codes</th><td>M.101</td></tr>
</table>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>T</p><h3>Student</h3><p>S</p><h3>Assessment Evidence</h3><p>E</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>T</p><h3>Student</h3><p>S</p><h3>Assessment Evidence</h3><p>E</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>T</p><h3>Student</h3><p>S</p><h3>Assessment Evidence</h3><p>E</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>T</p><h3>Student</h3><p>S</p><h3>Assessment Evidence</h3><p>E</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>T</p><h3>Student</h3><p>S</p><h3>Assessment Evidence</h3><p>E</p>
<h2>Teaching Learning Materials</h2><ul><li>Chart</li></ul>
<h2>Assessment</h2><table><tr><th>Assessment questions</th><td>Q1</td></tr>
<tr><th>Support</th><td>S</td></tr><tr><th>Enrichment</th><td>E</td></tr>
<tr><th>Homework</th><td>H</td></tr><tr><th>Teacher reflection</th><td>R</td></tr></table>
</body></html>"""
    
    try:
        r = requests.post(
            f"{API_BASE}/admin/panchapadi-lessons/preview",
            headers={"Authorization": f"Bearer {token}"},
            json={"html": html1, "filename": "single-period-test.html"},
            timeout=15
        )
        
        if r.status_code != 200:
            log_test("Single-period preview request", False, f"Status {r.status_code}: {r.text[:300]}")
            return None
        
        log_test("Single-period preview request", True)
        data = r.json()
        
        # Verify response structure
        log_test("Response has 'isBundle' field", 'isBundle' in data)
        log_test("isBundle === false", data.get('isBundle') == False)
        
        log_test("Response has 'periodCount' field", 'periodCount' in data)
        log_test("periodCount === 1", data.get('periodCount') == 1)
        
        log_test("Response has 'periods' array", 'periods' in data and isinstance(data['periods'], list))
        
        if not data.get('periods'):
            log_test("periods array length === 1", False, "periods array is empty")
            return data
        
        log_test("periods array length === 1", len(data['periods']) == 1)
        
        period = data['periods'][0]
        
        # Verify period structure
        log_test("period has 'period' field", 'period' in period)
        log_test("period.period === 1", period.get('period') == 1)
        
        log_test("period has 'topic' field", 'topic' in period)
        topic = period.get('topic', '')
        log_test("period.topic non-empty", len(topic) > 0)
        print(f"   Topic: {topic[:80]}...")
        
        log_test("period has 'topicTruncated' field", 'topicTruncated' in period)
        truncated = period.get('topicTruncated', '')
        log_test("topicTruncated ≤ 124 chars", len(truncated) <= 124)
        
        # Verify sections object
        log_test("period has 'sections' object", 'sections' in period and isinstance(period['sections'], dict))
        
        if 'sections' in period:
            sections = period['sections']
            required_keys = [
                'adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasara',
                'tlm', 'curricularGoal', 'competency', 'loCodes',
                'assessment', 'support', 'enrichment', 'homework',
                'teacherReflection', 'studentEngagement'
            ]
            
            for key in required_keys:
                has_key = key in sections
                log_test(f"sections.{key} exists", has_key)
                if has_key:
                    is_bool = isinstance(sections[key], bool)
                    log_test(f"sections.{key} is boolean", is_bool)
            
            # Verify Panchapadi stages are detected
            log_test("sections.adhiti === true", sections.get('adhiti') == True)
            log_test("sections.bodha === true", sections.get('bodha') == True)
            log_test("sections.abhyasa === true", sections.get('abhyasa') == True)
            log_test("sections.prayoga === true", sections.get('prayoga') == True)
            log_test("sections.prasara === true", sections.get('prasara') == True)
            
            # Verify other sections
            log_test("sections.tlm === true", sections.get('tlm') == True)
            log_test("sections.curricularGoal === true", sections.get('curricularGoal') == True)
            log_test("sections.competency === true", sections.get('competency') == True)
            log_test("sections.assessment === true", sections.get('assessment') == True)
            log_test("sections.support === true", sections.get('support') == True)
            log_test("sections.enrichment === true", sections.get('enrichment') == True)
            log_test("sections.homework === true", sections.get('homework') == True)
            log_test("sections.teacherReflection === true", sections.get('teacherReflection') == True)
        
        # Verify stageCount
        log_test("period has 'stageCount' field", 'stageCount' in period)
        log_test("stageCount === 5", period.get('stageCount') == 5)
        
        # Verify codes object
        log_test("period has 'codes' object", 'codes' in period and isinstance(period['codes'], dict))
        if 'codes' in period:
            codes = period['codes']
            log_test("codes.cg is number", 'cg' in codes and isinstance(codes['cg'], (int, float)))
            log_test("codes.comp is number", 'comp' in codes and isinstance(codes['comp'], (int, float)))
            log_test("codes.lo is number", 'lo' in codes and isinstance(codes['lo'], (int, float)))
            log_test("codes.old is number", 'old' in codes and isinstance(codes['old'], (int, float)))
        
        # Verify hasContent
        log_test("period has 'hasContent' field", 'hasContent' in period)
        log_test("hasContent === true", period.get('hasContent') == True)
        
        # Verify existingVersion
        log_test("period has 'existingVersion' field", 'existingVersion' in period)
        existing = period.get('existingVersion')
        log_test("existingVersion is null or object", existing is None or isinstance(existing, dict))
        
        # Verify regression fields
        log_test("Response has 'detected' field", 'detected' in data)
        if 'detected' in data:
            log_test("detected.em exists", 'em' in data['detected'])
            log_test("detected.sniffed exists", 'sniffed' in data['detected'])
        
        log_test("Response has 'resolved' field", 'resolved' in data)
        if 'resolved' in data:
            resolved = data['resolved']
            log_test("resolved.classId exists", 'classId' in resolved)
            log_test("resolved.className exists", 'className' in resolved)
            log_test("resolved.bookId exists", 'bookId' in resolved)
            log_test("resolved.bookName exists", 'bookName' in resolved)
            log_test("resolved.chapterId exists", 'chapterId' in resolved)
            log_test("resolved.chapterName exists", 'chapterName' in resolved)
            log_test("resolved.chapterOrder exists", 'chapterOrder' in resolved)
        
        log_test("Response has 'existingCount' field", 'existingCount' in data)
        log_test("Response has 'existing' array", 'existing' in data and isinstance(data['existing'], list))
        log_test("Response has 'maxVersionPerPeriod' field", 'maxVersionPerPeriod' in data)
        log_test("Response has 'ready' field", 'ready' in data and isinstance(data['ready'], bool))
        
        print(f"\n📊 Single-period preview response summary:")
        print(f"   isBundle: {data.get('isBundle')}")
        print(f"   periodCount: {data.get('periodCount')}")
        print(f"   periods.length: {len(data.get('periods', []))}")
        print(f"   ready: {data.get('ready')}")
        print(f"   existingCount: {data.get('existingCount')}")
        
        return data
        
    except Exception as e:
        log_test("Single-period preview", False, str(e))
        return None

def test_multi_period_bundle_preview(token):
    """Test 2: Multi-period bundle HTML preview (3 periods)"""
    
    print("\n" + "=" * 80)
    print("TEST 3: Multi-Period Bundle HTML Preview (3 periods)")
    print("=" * 80)
    
    # Multi-period bundle with 3 periods separated by <!-- PERIOD N --> markers
    html2 = """<!doctype html><html><head><meta charset="utf-8">
<title>Bundle Test</title>
<style>body { font-family: 'Noto Sans Oriya', sans-serif; }</style>
</head><body>

<!-- PERIOD 1 -->
<p>ଗଣିତ · Class 1 · Period 1</p>
<h1>Numbers 1-10</h1>
<h2>Learning Outcomes</h2>
<table><tr><th>Curricular goal</th><td>CG-1</td></tr>
<tr><th>Competency</th><td>C-1.1</td></tr>
<tr><th>Learning-outcome codes</th><td>M.101</td></tr></table>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>Intro</p><h3>Student</h3><p>Listen</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>Explain</p><h3>Student</h3><p>Understand</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>Guide</p><h3>Student</h3><p>Practice</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>Apply</p><h3>Student</h3><p>Do</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>Extend</p><h3>Student</h3><p>Explore</p>
<h2>Teaching Learning Materials</h2><ul><li>Chart</li></ul>
<h2>Assessment</h2><p>Q1</p>

<!-- PERIOD 2 -->
<p>ଗଣିତ · Class 1 · Period 2</p>
<h1>Numbers 11-20</h1>
<h2>Learning Outcomes</h2>
<table><tr><th>Curricular goal</th><td>CG-2</td></tr>
<tr><th>Competency</th><td>C-1.2</td></tr>
<tr><th>Learning-outcome codes</th><td>M.102</td></tr></table>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>Intro2</p><h3>Student</h3><p>Listen2</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>Explain2</p><h3>Student</h3><p>Understand2</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>Guide2</p><h3>Student</h3><p>Practice2</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>Apply2</p><h3>Student</h3><p>Do2</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>Extend2</p><h3>Student</h3><p>Explore2</p>
<h2>Teaching Learning Materials</h2><ul><li>Blocks</li></ul>
<h2>Assessment</h2><p>Q2</p>

<!-- PERIOD 3 -->
<p>ଗଣିତ · Class 1 · Period 3</p>
<h1>Addition Basics</h1>
<h2>Learning Outcomes</h2>
<table><tr><th>Curricular goal</th><td>CG-3</td></tr>
<tr><th>Competency</th><td>C-1.3</td></tr>
<tr><th>Learning-outcome codes</th><td>M.103</td></tr></table>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>Intro3</p><h3>Student</h3><p>Listen3</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>Explain3</p><h3>Student</h3><p>Understand3</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>Guide3</p><h3>Student</h3><p>Practice3</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>Apply3</p><h3>Student</h3><p>Do3</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>Extend3</p><h3>Student</h3><p>Explore3</p>
<h2>Teaching Learning Materials</h2><ul><li>Counters</li></ul>
<h2>Assessment</h2><p>Q3</p>

</body></html>"""
    
    try:
        r = requests.post(
            f"{API_BASE}/admin/panchapadi-lessons/preview",
            headers={"Authorization": f"Bearer {token}"},
            json={"html": html2, "filename": "bundle-3-periods.html"},
            timeout=15
        )
        
        if r.status_code != 200:
            log_test("Multi-period bundle preview request", False, f"Status {r.status_code}: {r.text[:300]}")
            return None
        
        log_test("Multi-period bundle preview request", True)
        data = r.json()
        
        # Verify bundle detection
        log_test("isBundle === true", data.get('isBundle') == True)
        log_test("periodCount === 3", data.get('periodCount') == 3)
        
        log_test("periods array exists", 'periods' in data and isinstance(data['periods'], list))
        
        if not data.get('periods'):
            log_test("periods.length === 3", False, "periods array is empty")
            return data
        
        log_test("periods.length === 3", len(data['periods']) == 3)
        
        # Verify each period has correct structure
        for i, period in enumerate(data['periods'], 1):
            print(f"\n   Verifying Period {i}:")
            
            log_test(f"Period {i} has 'period' field", 'period' in period)
            log_test(f"Period {i}.period === {i}", period.get('period') == i)
            
            log_test(f"Period {i} has 'topic' field", 'topic' in period)
            log_test(f"Period {i} has 'topicTruncated' field", 'topicTruncated' in period)
            
            log_test(f"Period {i} has 'sections' object", 'sections' in period and isinstance(period['sections'], dict))
            
            if 'sections' in period:
                sections = period['sections']
                required_keys = [
                    'adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasara',
                    'tlm', 'curricularGoal', 'competency', 'loCodes',
                    'assessment', 'support', 'enrichment', 'homework',
                    'teacherReflection', 'studentEngagement'
                ]
                all_keys_present = all(key in sections for key in required_keys)
                log_test(f"Period {i} sections has all 15 keys", all_keys_present)
                
                all_booleans = all(isinstance(sections[key], bool) for key in required_keys if key in sections)
                log_test(f"Period {i} sections all values are boolean", all_booleans)
            
            log_test(f"Period {i} has 'stageCount' field", 'stageCount' in period)
            log_test(f"Period {i} has 'codes' object", 'codes' in period and isinstance(period['codes'], dict))
            log_test(f"Period {i} has 'hasContent' field", 'hasContent' in period)
            log_test(f"Period {i} has 'existingVersion' field", 'existingVersion' in period)
        
        # Verify different period values
        period_numbers = [p.get('period') for p in data['periods']]
        log_test("Period numbers are [1, 2, 3]", period_numbers == [1, 2, 3])
        
        print(f"\n📊 Multi-period bundle preview response summary:")
        print(f"   isBundle: {data.get('isBundle')}")
        print(f"   periodCount: {data.get('periodCount')}")
        print(f"   periods.length: {len(data.get('periods', []))}")
        print(f"   Period numbers: {period_numbers}")
        
        return data
        
    except Exception as e:
        log_test("Multi-period bundle preview", False, str(e))
        return None

def test_duplicate_detection(token):
    """Test 3: Duplicate detection after creating actual rows"""
    
    print("\n" + "=" * 80)
    print("TEST 4: Duplicate Detection")
    print("=" * 80)
    
    # First, get a valid class/book/chapter to use
    try:
        # Get Class 1
        r = requests.get(f"{API_BASE}/classes", timeout=10)
        if r.status_code != 200:
            log_test("Get classes for duplicate test", False, f"Status {r.status_code}")
            return
        try:
            classes = r.json()
        except:
            log_test("Get classes for duplicate test", False, "Invalid JSON response")
            return
        # Handle both array and {classes: [...]} response formats
        if isinstance(classes, dict) and 'classes' in classes:
            classes = classes['classes']
        class1 = next((c for c in classes if 'Class 1' in c.get('name', '')), None)
        if not class1:
            log_test("Find Class 1", False, "Class 1 not found")
            return
        log_test("Find Class 1", True, f"ID: {class1['id']}")
        
        # Get a book for Class 1
        r = requests.get(f"{API_BASE}/books?classId={class1['id']}", timeout=10)
        if r.status_code != 200:
            log_test("Get books for Class 1", False, f"Status {r.status_code}")
            return
        try:
            books = r.json()
        except:
            log_test("Get books for Class 1", False, "Invalid JSON response")
            return
        # Handle both array and {books: [...]} response formats
        if isinstance(books, dict) and 'books' in books:
            books = books['books']
        if not books:
            log_test("Find book for Class 1", False, "No books found")
            return
        book = books[0]
        log_test("Find book for Class 1", True, f"ID: {book['id']}, Name: {book['name']}")
        
        # Get a chapter for this book
        r = requests.get(f"{API_BASE}/chapters?classId={class1['id']}&bookId={book['id']}", timeout=10)
        if r.status_code != 200:
            log_test("Get chapters", False, f"Status {r.status_code}")
            return
        try:
            chapters = r.json()
        except:
            log_test("Get chapters", False, "Invalid JSON response")
            return
        # Handle both array and {chapters: [...]} response formats
        if isinstance(chapters, dict) and 'chapters' in chapters:
            chapters = chapters['chapters']
        if not chapters:
            log_test("Find chapter", False, "No chapters found")
            return
        chapter = chapters[0]
        log_test("Find chapter", True, f"ID: {chapter['id']}, Name: {chapter['name']}")
        
        # Create the bundle HTML with explicit IDs
        bundle_html = """<!doctype html><html><head><meta charset="utf-8">
<title>Duplicate Test Bundle</title></head><body>

<!-- PERIOD 1 -->
<p>Test Period 1</p>
<h1>Duplicate Test Topic 1</h1>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>T1</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>T1</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>T1</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>T1</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>T1</p>

<!-- PERIOD 2 -->
<p>Test Period 2</p>
<h1>Duplicate Test Topic 2</h1>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>T2</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>T2</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>T2</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>T2</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>T2</p>

<!-- PERIOD 3 -->
<p>Test Period 3</p>
<h1>Duplicate Test Topic 3</h1>
<h2>ଅଧୀତି · Adhiti</h2><p>5 min</p><h3>Teacher</h3><p>T3</p>
<h2>ବୋଧ · Bodha</h2><p>10 min</p><h3>Teacher</h3><p>T3</p>
<h2>ଅଭ୍ୟାସ · Abhyasa</h2><p>8 min</p><h3>Teacher</h3><p>T3</p>
<h2>ପ୍ରୟୋଗ · Prayoga</h2><p>7 min</p><h3>Teacher</h3><p>T3</p>
<h2>ପ୍ରସାର · Prasara</h2><p>5 min</p><h3>Teacher</h3><p>T3</p>

</body></html>"""
        
        # Step 1: Create the bundle (actual DB write)
        print("\n   Step 1: Creating bundle in DB...")
        r = requests.post(
            f"{API_BASE}/admin/panchapadi-lessons",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "html": bundle_html,
                "filename": "duplicate-test-bundle.html",
                "classId": class1['id'],
                "bookId": book['id'],
                "chapterId": chapter['id'],
                "writeMode": "replace"
            },
            timeout=20
        )
        
        if r.status_code != 200:
            log_test("Create bundle for duplicate test", False, f"Status {r.status_code}: {r.text[:300]}")
            return
        
        create_data = r.json()
        log_test("Create bundle for duplicate test", True, f"Created {create_data.get('count')} periods")
        
        created_ids = []
        # Store IDs for cleanup
        if create_data.get('ok'):
            print(f"   Created periods: {create_data.get('periods')}")
        
        # Step 2: Preview the SAME bundle again (should detect duplicates)
        print("\n   Step 2: Previewing same bundle (should detect duplicates)...")
        r = requests.post(
            f"{API_BASE}/admin/panchapadi-lessons/preview",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "html": bundle_html,
                "filename": "duplicate-test-bundle.html",
                "classId": class1['id'],
                "bookId": book['id'],
                "chapterId": chapter['id']
            },
            timeout=15
        )
        
        if r.status_code != 200:
            log_test("Preview with duplicates", False, f"Status {r.status_code}: {r.text[:300]}")
            return
        
        preview_data = r.json()
        log_test("Preview with duplicates request", True)
        
        # Verify duplicate detection
        log_test("existingCount === 3", preview_data.get('existingCount') == 3)
        log_test("existing.length === 3", len(preview_data.get('existing', [])) == 3)
        log_test("maxVersionPerPeriod is non-empty", len(preview_data.get('maxVersionPerPeriod', {})) > 0)
        
        # Verify each period has existingVersion
        if 'periods' in preview_data:
            for i, period in enumerate(preview_data['periods'], 1):
                existing_ver = period.get('existingVersion')
                is_object = existing_ver is not None and isinstance(existing_ver, dict)
                log_test(f"Period {i} existingVersion is non-null object", is_object)
                
                if is_object:
                    log_test(f"Period {i} existingVersion has 'id'", 'id' in existing_ver)
                    log_test(f"Period {i} existingVersion has 'version'", 'version' in existing_ver)
                    log_test(f"Period {i} existingVersion has 'status'", 'status' in existing_ver)
                    print(f"   Period {i} existing: id={existing_ver.get('id')[:8]}..., version={existing_ver.get('version')}, status={existing_ver.get('status')}")
                    
                    # Store ID for cleanup
                    if existing_ver.get('id'):
                        created_ids.append(existing_ver['id'])
        
        print(f"\n📊 Duplicate detection summary:")
        print(f"   existingCount: {preview_data.get('existingCount')}")
        print(f"   existing.length: {len(preview_data.get('existing', []))}")
        print(f"   maxVersionPerPeriod: {preview_data.get('maxVersionPerPeriod')}")
        
        # Step 3: Cleanup - delete the created rows
        print("\n   Step 3: Cleanup - deleting created rows...")
        deleted_count = 0
        for lesson_id in created_ids:
            try:
                r = requests.delete(
                    f"{API_BASE}/admin/panchapadi-lessons/{lesson_id}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10
                )
                if r.status_code == 200:
                    deleted_count += 1
            except Exception as e:
                print(f"   Warning: Failed to delete {lesson_id}: {e}")
        
        log_test(f"Cleanup: deleted {deleted_count} rows", deleted_count == len(created_ids))
        
    except Exception as e:
        import traceback
        log_test("Duplicate detection test", False, f"{str(e)}\n{traceback.format_exc()}")

def test_regression(token):
    """Test 4: Regression tests for existing endpoints"""
    
    print("\n" + "=" * 80)
    print("TEST 5: Regression Tests")
    print("=" * 80)
    
    # Test 1: GET /panchapadi-lessons/browse
    try:
        r = requests.get(
            f"{API_BASE}/panchapadi-lessons/browse",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if r.status_code != 200:
            log_test("GET /panchapadi-lessons/browse", False, f"Status {r.status_code}")
        else:
            data = r.json()
            log_test("GET /panchapadi-lessons/browse returns 200", True)
            
            # Check if response has expected structure
            if isinstance(data, list):
                log_test("Browse returns array", True)
                if len(data) > 0:
                    first = data[0]
                    log_test("Browse items have 'topicTitle' field", 'topicTitle' in first)
                    print(f"   Found {len(data)} Panchapadi lessons")
            elif isinstance(data, dict) and 'classes' in data:
                log_test("Browse returns grouped structure", True)
                print(f"   Found {len(data.get('classes', []))} classes with Panchapadi lessons")
    
    except Exception as e:
        log_test("GET /panchapadi-lessons/browse", False, str(e))
    
    # Test 2: Verify download endpoint exists and requires auth
    # We'll test the endpoint structure without creating a test lesson
    try:
        # Try to download a non-existent lesson (should get 404, not 500)
        r = requests.get(
            f"{API_BASE}/panchapadi-lessons/test-id-12345/download/html",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        # Should get 404 (not found) or 403 (disabled), not 500 (server error)
        if r.status_code in [403, 404]:
            log_test("Download HTML endpoint exists and handles requests", True, f"Status {r.status_code}")
        else:
            log_test("Download HTML endpoint exists and handles requests", False, f"Unexpected status {r.status_code}")
    
    except Exception as e:
        log_test("Download HTML endpoint test", False, str(e))

def main():
    print("🧪 Panchapadi Upload Preview Endpoint Test")
    print("=" * 80)
    print(f"Testing enriched preview endpoint with per-period section validation")
    print(f"Base URL: {API_BASE}")
    print("=" * 80)
    
    # Test 1: Admin login
    token = test_preview_endpoint()
    if not token:
        print("\n❌ Cannot proceed without admin token")
        sys.exit(1)
    
    # Test 2: Single-period preview
    test_single_period_preview(token)
    
    # Test 3: Multi-period bundle preview
    test_multi_period_bundle_preview(token)
    
    # Test 4: Duplicate detection
    test_duplicate_detection(token)
    
    # Test 5: Regression tests
    test_regression(token)
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    print(f"✅ Passed: {tests_passed}")
    print(f"❌ Failed: {tests_failed}")
    print(f"📈 Success Rate: {tests_passed}/{tests_passed + tests_failed} ({100 * tests_passed // (tests_passed + tests_failed) if tests_passed + tests_failed > 0 else 0}%)")
    print("=" * 80)
    
    if tests_failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
