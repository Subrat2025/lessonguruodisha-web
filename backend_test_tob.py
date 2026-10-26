#!/usr/bin/env python3
"""
TOB Task/Project Detail Backend Test
Tests the NEW Teacher Observation (TOB) task/project DETAIL backend endpoints.
"""

import requests
import json
import sys
from typing import Optional

# Base URL
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"

# Test data
TEST_CLASS = "4"
TEST_SUBJECT = "OD"
TEST_CHAPTER = "4"
TEST_FREE_CHAPTER = "1"  # Free sample chapter
TEST_SET = "A"  # Free sample set
TEST_SET_B = "B"  # Non-free set

def login(mobile: str, password: str) -> Optional[str]:
    """Login and return Bearer token"""
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"❌ Login failed: {resp.status_code} {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_chapter_task_detail(token: Optional[str] = None):
    """Test 1: GET /api/tob/detail - CHAPTER task"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/tob/detail - CHAPTER task")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    # Test chapter 4 task 1
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        detail = data.get("detail", {})
        viewer = data.get("viewer", {})
        share = data.get("share", {})
        
        # Validate detail structure
        required_fields = ["title", "pos", "count", "los", "tiles", "blocks", "marks", "prev", "next"]
        missing = [f for f in required_fields if f not in detail]
        if missing:
            print(f"❌ FAIL: Missing fields in detail: {missing}")
            return False
        
        # Validate detail values
        if detail.get("pos") != 1:
            print(f"❌ FAIL: Expected pos=1, got {detail.get('pos')}")
            return False
        
        if not isinstance(detail.get("los"), list):
            print(f"❌ FAIL: los should be a list")
            return False
        
        # Check LO structure
        if detail.get("los"):
            lo = detail["los"][0]
            lo_fields = ["cg", "competency", "lo_code", "lo_text"]
            missing_lo = [f for f in lo_fields if f not in lo]
            if missing_lo:
                print(f"❌ FAIL: Missing LO fields: {missing_lo}")
                return False
        
        # Check blocks
        blocks = detail.get("blocks", {})
        if "task" not in blocks or not blocks["task"].get("html"):
            print(f"❌ FAIL: blocks.task.html should be non-empty")
            return False
        
        # Check viewer
        viewer_fields = ["loggedIn", "canSeeFull"]
        missing_viewer = [f for f in viewer_fields if f not in viewer]
        if missing_viewer:
            print(f"❌ FAIL: Missing viewer fields: {missing_viewer}")
            return False
        
        # Check share
        share_fields = ["url", "text"]
        missing_share = [f for f in share_fields if f not in share]
        if missing_share:
            print(f"❌ FAIL: Missing share fields: {missing_share}")
            return False
        
        print(f"✅ PASS: Chapter task detail structure correct")
        print(f"  - title: {detail.get('title')[:50]}...")
        print(f"  - pos: {detail.get('pos')}, count: {detail.get('count')}")
        print(f"  - los: {len(detail.get('los', []))} items")
        print(f"  - tiles: {len(detail.get('tiles', []))} items")
        print(f"  - blocks: {list(blocks.keys())}")
        print(f"  - viewer.loggedIn: {viewer.get('loggedIn')}, canSeeFull: {viewer.get('canSeeFull')}")
        print(f"  - share.url: {share.get('url')[:60]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_chapter_project_detail(token: Optional[str] = None):
    """Test 2: GET /api/tob/detail - CHAPTER project"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/tob/detail - CHAPTER project")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=project&num=1"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        detail = data.get("detail", {})
        blocks = detail.get("blocks", {})
        
        # Check project-specific blocks
        project_blocks = ["objective", "materials", "process"]
        found_blocks = [b for b in project_blocks if b in blocks]
        
        if not found_blocks:
            print(f"❌ FAIL: Expected at least one of {project_blocks}, got {list(blocks.keys())}")
            return False
        
        print(f"✅ PASS: Chapter project detail correct")
        print(f"  - title: {detail.get('title')[:50]}...")
        print(f"  - blocks: {list(blocks.keys())}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_free_chapter_access():
    """Test 3: Chapter 1 (free sample) - access without auth"""
    print("\n" + "="*80)
    print("TEST 3: Chapter 1 (free sample) - access without auth")
    print("="*80)
    
    # Test WITHOUT auth
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_FREE_CHAPTER}&part=task&num=1"
    print(f"\n📍 Testing WITHOUT auth: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        viewer = data.get("viewer", {})
        detail = data.get("detail", {})
        blocks = detail.get("blocks", {})
        
        # Chapter 1 should be free - canSeeFull should be TRUE
        if not viewer.get("canSeeFull"):
            print(f"❌ FAIL: Chapter 1 should be free (canSeeFull=true), got {viewer.get('canSeeFull')}")
            return False
        
        # Answer block should be present for free chapter
        if "answer" not in blocks:
            print(f"❌ FAIL: Chapter 1 (free) should have answer block, got blocks: {list(blocks.keys())}")
            return False
        
        print(f"✅ PASS: Chapter 1 (free sample) accessible without auth")
        print(f"  - viewer.canSeeFull: {viewer.get('canSeeFull')}")
        print(f"  - blocks: {list(blocks.keys())}")
        print(f"  - answer block present: {'answer' in blocks}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_locked_chapter_access():
    """Test 4: Chapter 4 WITHOUT auth - should be locked"""
    print("\n" + "="*80)
    print("TEST 4: Chapter 4 WITHOUT auth - should be locked")
    print("="*80)
    
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1"
    print(f"\n📍 Testing WITHOUT auth: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        viewer = data.get("viewer", {})
        detail = data.get("detail", {})
        blocks = detail.get("blocks", {})
        
        # Chapter 4 should be locked - canSeeFull should be FALSE
        if viewer.get("canSeeFull"):
            print(f"❌ FAIL: Chapter 4 should be locked (canSeeFull=false), got {viewer.get('canSeeFull')}")
            return False
        
        # Answer block should be ABSENT for locked chapter
        if "answer" in blocks:
            print(f"❌ FAIL: Chapter 4 (locked) should NOT have answer block, got blocks: {list(blocks.keys())}")
            return False
        
        print(f"✅ PASS: Chapter 4 (locked) correctly gated without auth")
        print(f"  - viewer.canSeeFull: {viewer.get('canSeeFull')}")
        print(f"  - blocks: {list(blocks.keys())}")
        print(f"  - answer block absent: {'answer' not in blocks}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_admin_access(token: str):
    """Test 5: Chapter 4 WITH admin token - should be unlocked"""
    print("\n" + "="*80)
    print("TEST 5: Chapter 4 WITH admin token - should be unlocked")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1"
    print(f"\n📍 Testing WITH admin token: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        viewer = data.get("viewer", {})
        detail = data.get("detail", {})
        blocks = detail.get("blocks", {})
        
        # Admin should have full access
        if not viewer.get("canSeeFull"):
            print(f"❌ FAIL: Admin should have canSeeFull=true, got {viewer.get('canSeeFull')}")
            return False
        
        if not viewer.get("isAdmin"):
            print(f"❌ FAIL: Admin should have isAdmin=true, got {viewer.get('isAdmin')}")
            return False
        
        # Answer block should be present for admin
        if "answer" not in blocks:
            print(f"❌ FAIL: Admin should see answer block, got blocks: {list(blocks.keys())}")
            return False
        
        print(f"✅ PASS: Admin has full access to Chapter 4")
        print(f"  - viewer.canSeeFull: {viewer.get('canSeeFull')}")
        print(f"  - viewer.isAdmin: {viewer.get('isAdmin')}")
        print(f"  - blocks: {list(blocks.keys())}")
        print(f"  - answer block present: {'answer' in blocks}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_set_term1_tasks(token: Optional[str] = None):
    """Test 6: SET term-1 tasks (A, term 1, task 1-5)"""
    print("\n" + "="*80)
    print("TEST 6: SET term-1 tasks (Set A, term 1, task 1-5)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    for num in [1, 5]:  # Test first and last
        url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=1&part=task&num={num}"
        print(f"\n📍 Testing: {url}")
        
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                return False
            
            data = resp.json()
            detail = data.get("detail", {})
            
            # Validate term
            if detail.get("term") != 1:
                print(f"❌ FAIL: Expected term=1, got {detail.get('term')}")
                return False
            
            # Validate pos
            if detail.get("pos") != num:
                print(f"❌ FAIL: Expected pos={num}, got {detail.get('pos')}")
                return False
            
            # Validate count
            if detail.get("count") != 5:
                print(f"❌ FAIL: Expected count=5, got {detail.get('count')}")
                return False
            
            # Validate prev/next
            if num == 1 and detail.get("prev") is not None:
                print(f"❌ FAIL: Task 1 should have prev=null, got {detail.get('prev')}")
                return False
            
            if num == 5 and detail.get("next") is not None:
                print(f"❌ FAIL: Task 5 should have next=null, got {detail.get('next')}")
                return False
            
            print(f"✅ PASS: Set A term-1 task {num} correct")
            print(f"  - term: {detail.get('term')}, pos: {detail.get('pos')}, count: {detail.get('count')}")
            print(f"  - prev: {detail.get('prev')}, next: {detail.get('next')}")
            
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            return False
    
    return True

def test_set_term1_project(token: Optional[str] = None):
    """Test 7: SET term-1 project (Set A, term 1, project 1)"""
    print("\n" + "="*80)
    print("TEST 7: SET term-1 project (Set A, term 1, project 1)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=1&part=project&num=1"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        detail = data.get("detail", {})
        
        # Validate term
        if detail.get("term") != 1:
            print(f"❌ FAIL: Expected term=1, got {detail.get('term')}")
            return False
        
        print(f"✅ PASS: Set A term-1 project correct")
        print(f"  - term: {detail.get('term')}, pos: {detail.get('pos')}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_set_term2_tasks(token: Optional[str] = None):
    """Test 8: SET term-2 tasks (Set A, term 2, task 1 and 5)"""
    print("\n" + "="*80)
    print("TEST 8: SET term-2 tasks (Set A, term 2, task 1 and 5)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    for num in [1, 5]:
        url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=2&part=task&num={num}"
        print(f"\n📍 Testing: {url}")
        
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                return False
            
            data = resp.json()
            detail = data.get("detail", {})
            
            # Validate term (this was a fixed bug)
            if detail.get("term") != 2:
                print(f"❌ FAIL: Expected term=2, got {detail.get('term')}")
                return False
            
            print(f"✅ PASS: Set A term-2 task {num} correct (term=2 confirmed)")
            print(f"  - term: {detail.get('term')}, pos: {detail.get('pos')}")
            
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            return False
    
    return True

def test_set_term2_project(token: Optional[str] = None):
    """Test 9: SET term-2 project (Set A, term 2, project 1)"""
    print("\n" + "="*80)
    print("TEST 9: SET term-2 project (Set A, term 2, project 1)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=2&part=project&num=1"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        detail = data.get("detail", {})
        
        # Validate term
        if detail.get("term") != 2:
            print(f"❌ FAIL: Expected term=2, got {detail.get('term')}")
            return False
        
        print(f"✅ PASS: Set A term-2 project correct")
        print(f"  - term: {detail.get('term')}, pos: {detail.get('pos')}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_set_free_access():
    """Test 10: Set A (free sample) - access without auth"""
    print("\n" + "="*80)
    print("TEST 10: Set A (free sample) - access without auth")
    print("="*80)
    
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=1&part=task&num=1"
    print(f"\n📍 Testing WITHOUT auth: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        viewer = data.get("viewer", {})
        detail = data.get("detail", {})
        blocks = detail.get("blocks", {})
        
        # Set A should be free
        if not viewer.get("canSeeFull"):
            print(f"❌ FAIL: Set A should be free (canSeeFull=true), got {viewer.get('canSeeFull')}")
            return False
        
        # Answer block should be present
        if "answer" not in blocks:
            print(f"❌ FAIL: Set A (free) should have answer block, got blocks: {list(blocks.keys())}")
            return False
        
        print(f"✅ PASS: Set A (free sample) accessible without auth")
        print(f"  - viewer.canSeeFull: {viewer.get('canSeeFull')}")
        print(f"  - answer block present: {'answer' in blocks}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_set_locked_access():
    """Test 11: Set B WITHOUT auth - should be locked"""
    print("\n" + "="*80)
    print("TEST 11: Set B WITHOUT auth - should be locked")
    print("="*80)
    
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET_B}&term=1&part=task&num=1"
    print(f"\n📍 Testing WITHOUT auth: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        viewer = data.get("viewer", {})
        detail = data.get("detail", {})
        blocks = detail.get("blocks", {})
        
        # Set B should be locked
        if viewer.get("canSeeFull"):
            print(f"❌ FAIL: Set B should be locked (canSeeFull=false), got {viewer.get('canSeeFull')}")
            return False
        
        # Answer block should be absent
        if "answer" in blocks:
            print(f"❌ FAIL: Set B (locked) should NOT have answer block, got blocks: {list(blocks.keys())}")
            return False
        
        print(f"✅ PASS: Set B (locked) correctly gated without auth")
        print(f"  - viewer.canSeeFull: {viewer.get('canSeeFull')}")
        print(f"  - answer block absent: {'answer' not in blocks}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_share_url_structure(token: Optional[str] = None):
    """Test 12: Share URL structure"""
    print("\n" + "="*80)
    print("TEST 12: Share URL structure")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    # Test set share URL
    url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=2&part=project&num=1"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        share = data.get("share", {})
        
        # Check share URL contains readable path
        share_url = share.get("url", "")
        if "/teacher-observation/class-4/odia/set-a/term-2/project/1" not in share_url:
            print(f"❌ FAIL: Share URL should contain readable path, got: {share_url}")
            return False
        
        # Check share text contains Odia label and URL
        share_text = share.get("text", "")
        if not share_text or share_url not in share_text:
            print(f"❌ FAIL: Share text should contain URL, got: {share_text[:100]}")
            return False
        
        print(f"✅ PASS: Share URL structure correct")
        print(f"  - share.url: {share_url}")
        print(f"  - share.text (first 100 chars): {share_text[:100]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_invalid_params():
    """Test 13: Invalid params should return 404"""
    print("\n" + "="*80)
    print("TEST 13: Invalid params should return 404")
    print("="*80)
    
    test_cases = [
        ("chapter=99", "Invalid chapter number"),
        ("set=Z", "Invalid set code"),
        ("chapter=4&part=task&num=99", "Invalid task number (out of range)"),
        ("chapter=4&part=task&num=0", "Invalid task number (zero)"),
    ]
    
    for params, description in test_cases:
        url = f"{BASE_URL}/tob/detail?class={TEST_CLASS}&subject={TEST_SUBJECT}&{params}"
        print(f"\n📍 Testing {description}: {url}")
        
        try:
            resp = requests.get(url, timeout=30)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code != 404:
                print(f"❌ FAIL: Expected 404, got {resp.status_code}")
                return False
            
            print(f"✅ PASS: {description} correctly returns 404")
            
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            return False
    
    return True

def test_og_image():
    """Test 14: GET /api/tob/og - OG image"""
    print("\n" + "="*80)
    print("TEST 14: GET /api/tob/og - OG image (public, no auth)")
    print("="*80)
    
    # Test chapter OG
    url = f"{BASE_URL}/tob/og?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1"
    print(f"\n📍 Testing chapter OG: {url}")
    
    try:
        resp = requests.get(url, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        if "image/png" not in content_type:
            print(f"❌ FAIL: Expected Content-Type image/png, got {content_type}")
            return False
        
        body_size = len(resp.content)
        if body_size < 10000:  # 10KB
            print(f"❌ FAIL: Expected body > 10KB, got {body_size} bytes")
            return False
        
        print(f"✅ PASS: Chapter OG image correct")
        print(f"  - Content-Type: {content_type}")
        print(f"  - Size: {body_size} bytes ({body_size/1024:.1f} KB)")
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Test set OG
    url = f"{BASE_URL}/tob/og?class={TEST_CLASS}&subject={TEST_SUBJECT}&set={TEST_SET}&term=2&part=project&num=1"
    print(f"\n📍 Testing set OG: {url}")
    
    try:
        resp = requests.get(url, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        if "image/png" not in content_type:
            print(f"❌ FAIL: Expected Content-Type image/png, got {content_type}")
            return False
        
        body_size = len(resp.content)
        if body_size < 10000:
            print(f"❌ FAIL: Expected body > 10KB, got {body_size} bytes")
            return False
        
        print(f"✅ PASS: Set OG image correct")
        print(f"  - Content-Type: {content_type}")
        print(f"  - Size: {body_size} bytes ({body_size/1024:.1f} KB)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_share_image():
    """Test 15: GET /api/tob/share-image - share image (student copy)"""
    print("\n" + "="*80)
    print("TEST 15: GET /api/tob/share-image - share image (student copy, public)")
    print("="*80)
    
    url = f"{BASE_URL}/tob/share-image?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        if "image/png" not in content_type:
            print(f"❌ FAIL: Expected Content-Type image/png, got {content_type}")
            return False
        
        body_size = len(resp.content)
        if body_size < 10000:
            print(f"❌ FAIL: Expected body > 10KB, got {body_size} bytes")
            return False
        
        print(f"✅ PASS: Share image correct")
        print(f"  - Content-Type: {content_type}")
        print(f"  - Size: {body_size} bytes ({body_size/1024:.1f} KB)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_task_pdf_no_auth():
    """Test 16: GET /api/tob/task/pdf - without auth should return 401"""
    print("\n" + "="*80)
    print("TEST 16: GET /api/tob/task/pdf - without auth (should return 401)")
    print("="*80)
    
    url = f"{BASE_URL}/tob/task/pdf?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1&copy=student"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
        
        print(f"✅ PASS: PDF endpoint correctly requires auth (401)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_task_pdf_with_admin(token: str):
    """Test 17: GET /api/tob/task/pdf - with admin token (student and teacher copy)"""
    print("\n" + "="*80)
    print("TEST 17: GET /api/tob/task/pdf - with admin token")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test student copy
    url = f"{BASE_URL}/tob/task/pdf?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1&copy=student"
    print(f"\n📍 Testing student copy: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        if "application/pdf" not in content_type:
            print(f"❌ FAIL: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        body_size = len(resp.content)
        if body_size < 5000:
            print(f"❌ FAIL: Expected body > 5KB, got {body_size} bytes")
            return False
        
        print(f"✅ PASS: Student PDF correct")
        print(f"  - Content-Type: {content_type}")
        print(f"  - Size: {body_size} bytes ({body_size/1024:.1f} KB)")
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Test teacher copy
    url = f"{BASE_URL}/tob/task/pdf?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_CHAPTER}&part=task&num=1&copy=teacher"
    print(f"\n📍 Testing teacher copy: {url}")
    
    try:
        resp = requests.get(url, headers=headers, timeout=60)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        content_type = resp.headers.get("Content-Type", "")
        if "application/pdf" not in content_type:
            print(f"❌ FAIL: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        body_size = len(resp.content)
        if body_size < 5000:
            print(f"❌ FAIL: Expected body > 5KB, got {body_size} bytes")
            return False
        
        print(f"✅ PASS: Teacher PDF correct")
        print(f"  - Content-Type: {content_type}")
        print(f"  - Size: {body_size} bytes ({body_size/1024:.1f} KB)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_task_pdf_free_chapter_no_auth():
    """Test 18: GET /api/tob/task/pdf - free chapter without auth (should still require login)"""
    print("\n" + "="*80)
    print("TEST 18: GET /api/tob/task/pdf - free chapter without auth (should still return 401)")
    print("="*80)
    
    url = f"{BASE_URL}/tob/task/pdf?class={TEST_CLASS}&subject={TEST_SUBJECT}&chapter={TEST_FREE_CHAPTER}&part=task&num=1&copy=student"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401 (endpoint requires login regardless), got {resp.status_code}")
            return False
        
        print(f"✅ PASS: PDF endpoint requires login even for free chapter (401)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_regression_endpoints():
    """Test 19: Regression - existing TOB endpoints still work"""
    print("\n" + "="*80)
    print("TEST 19: Regression - existing TOB endpoints")
    print("="*80)
    
    # Test /api/tob/courses
    url = f"{BASE_URL}/tob/courses"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        courses = data.get("courses", [])
        
        # Check if Class-4 OD course exists
        class4_od = [c for c in courses if c.get("class") == "4" and c.get("subject_id") == "OD"]
        if not class4_od:
            print(f"❌ FAIL: Class-4 OD course not found in courses")
            return False
        
        print(f"✅ PASS: /api/tob/courses working")
        print(f"  - Total courses: {len(courses)}")
        print(f"  - Class-4 OD found: {class4_od[0].get('subject_printed')}")
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Test /api/tob/items
    url = f"{BASE_URL}/tob/items?class={TEST_CLASS}&subject={TEST_SUBJECT}"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        items = data.get("items", [])
        
        if not items:
            print(f"❌ FAIL: No items found")
            return False
        
        print(f"✅ PASS: /api/tob/items working")
        print(f"  - Total items: {len(items)}")
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Test /api/tob/lomaster-summary
    url = f"{BASE_URL}/tob/lomaster-summary?class={TEST_CLASS}&subject={TEST_SUBJECT}"
    print(f"\n📍 Testing: {url}")
    
    try:
        resp = requests.get(url, timeout=30)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        print(f"✅ PASS: /api/tob/lomaster-summary working")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def main():
    print("\n" + "="*80)
    print("TOB TASK/PROJECT DETAIL BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_MOBILE}")
    print(f"Test Class: {TEST_CLASS}, Subject: {TEST_SUBJECT}")
    print("="*80)
    
    # Login as admin
    print("\n🔐 Logging in as admin...")
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ CRITICAL: Admin login failed. Cannot proceed with auth tests.")
        sys.exit(1)
    print(f"✅ Admin login successful")
    
    # Run all tests
    results = []
    
    # 1) GET /api/tob/detail — CHAPTER task & project
    results.append(("Chapter task detail", test_chapter_task_detail(admin_token)))
    results.append(("Chapter project detail", test_chapter_project_detail(admin_token)))
    results.append(("Free chapter access (no auth)", test_free_chapter_access()))
    results.append(("Locked chapter access (no auth)", test_locked_chapter_access()))
    results.append(("Admin access to locked chapter", test_admin_access(admin_token)))
    
    # 2) GET /api/tob/detail — SET term routing
    results.append(("Set term-1 tasks", test_set_term1_tasks(admin_token)))
    results.append(("Set term-1 project", test_set_term1_project(admin_token)))
    results.append(("Set term-2 tasks", test_set_term2_tasks(admin_token)))
    results.append(("Set term-2 project", test_set_term2_project(admin_token)))
    results.append(("Set A free access (no auth)", test_set_free_access()))
    results.append(("Set B locked access (no auth)", test_set_locked_access()))
    results.append(("Share URL structure", test_share_url_structure(admin_token)))
    
    # 3) Invalid params → 404
    results.append(("Invalid params (404)", test_invalid_params()))
    
    # 4) GET /api/tob/og
    results.append(("OG image", test_og_image()))
    
    # 5) GET /api/tob/share-image
    results.append(("Share image", test_share_image()))
    
    # 6) GET /api/tob/task/pdf
    results.append(("Task PDF no auth (401)", test_task_pdf_no_auth()))
    results.append(("Task PDF with admin", test_task_pdf_with_admin(admin_token)))
    results.append(("Task PDF free chapter no auth (401)", test_task_pdf_free_chapter_no_auth()))
    
    # 7) Regression
    results.append(("Regression endpoints", test_regression_endpoints()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
