#!/usr/bin/env python3
"""
Backend test for TOB PE (Physical Education) marks framework
Tests the generic components model via real HTTP admin endpoints
"""

import requests
import json
import sys

# Configuration
BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"
TEST_ZIP = "/app/scripts/testdata/Class5_PE.zip"

def get_admin_token():
    """Get admin bearer token"""
    try:
        print("🔐 Authenticating as admin...")
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ Login failed: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return None
        
        data = response.json()
        if not data.get("token"):
            print(f"❌ Login failed: {data}")
            return None
        
        print(f"✅ Admin authenticated successfully")
        print(f"   User: {data.get('user', {}).get('name')} ({data.get('user', {}).get('role')})")
        return data["token"]
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_a_peek(token):
    """TEST A: POST /api/tob/admin/import-onezip/peek"""
    print("\n" + "="*80)
    print("TEST A: PEEK ENDPOINT (0 RED)")
    print("="*80)
    
    try:
        with open(TEST_ZIP, 'rb') as f:
            files = {'file': ('Class5_PE.zip', f, 'application/zip')}
            headers = {'Authorization': f'Bearer {token}'}
            
            print(f"📤 POST /api/tob/admin/import-onezip/peek")
            print(f"   File: {TEST_ZIP}")
            
            response = requests.post(
                f"{BASE_URL}/api/tob/admin/import-onezip/peek",
                files=files,
                headers=headers,
                timeout=60
            )
            
            print(f"📥 Response: HTTP {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ PEEK FAILED: HTTP {response.status_code}")
                print(f"Response: {response.text}")
                return None
            
            data = response.json()
            
            # Verify response structure
            if not data.get("ok"):
                print(f"❌ PEEK FAILED: ok={data.get('ok')}")
                print(f"Response: {json.dumps(data, indent=2)}")
                return None
            
            # Check expected values
            print(f"\n📊 PEEK RESULTS:")
            print(f"   ok: {data.get('ok')} {'✅' if data.get('ok') else '❌'}")
            print(f"   class: {data.get('class')} {'✅' if data.get('class') == '5' else '❌'}")
            print(f"   subject_id: {data.get('subject_id')} {'✅' if data.get('subject_id') == 'PE' else '❌'}")
            print(f"   subject_printed: {data.get('subject_printed')}")
            
            summary = data.get('summary', {})
            print(f"\n   Summary:")
            print(f"   - total: {summary.get('total')} {'✅' if summary.get('total') == 38 else '❌ EXPECTED 38'}")
            print(f"   - chapters: {summary.get('chapters')} {'✅' if summary.get('chapters') == 7 else '❌ EXPECTED 7'}")
            print(f"   - sets: {summary.get('sets')} {'✅' if summary.get('sets') == 30 else '❌ EXPECTED 30'}")
            print(f"   - registers: {summary.get('registers')} {'✅' if summary.get('registers') == 1 else '❌ EXPECTED 1'}")
            print(f"   - green: {summary.get('green')}")
            print(f"   - yellow: {summary.get('yellow')}")
            print(f"   - red: {summary.get('red')} {'✅' if summary.get('red') == 0 else '❌ EXPECTED 0'}")
            
            # Verify all critical requirements
            checks = [
                data.get('ok') == True,
                data.get('class') == '5',
                data.get('subject_id') == 'PE',
                summary.get('total') == 38,
                summary.get('chapters') == 7,
                summary.get('sets') == 30,
                summary.get('registers') == 1,
                summary.get('red') == 0
            ]
            
            if all(checks):
                print(f"\n✅ TEST A PASSED: Peek returned 38 items (7 chapters, 30 sets, 1 register), 0 RED")
            else:
                print(f"\n❌ TEST A FAILED: Some requirements not met")
                return None
            
            return data.get('rows', [])
            
    except Exception as e:
        print(f"❌ TEST A ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_b_commit(token, rows):
    """TEST B: POST /api/tob/admin/import-onezip/commit"""
    print("\n" + "="*80)
    print("TEST B: COMMIT & PUBLISH")
    print("="*80)
    
    try:
        with open(TEST_ZIP, 'rb') as f:
            files = {
                'file': ('Class5_PE.zip', f, 'application/zip')
            }
            data_fields = {
                'class': '5',
                'subject': 'PE',
                'publish': 'true',
                'rows': json.dumps(rows)
            }
            headers = {'Authorization': f'Bearer {token}'}
            
            print(f"📤 POST /api/tob/admin/import-onezip/commit")
            print(f"   File: {TEST_ZIP}")
            print(f"   class: 5")
            print(f"   subject: PE")
            print(f"   publish: true")
            print(f"   rows: {len(rows)} items from peek")
            
            response = requests.post(
                f"{BASE_URL}/api/tob/admin/import-onezip/commit",
                files=files,
                data=data_fields,
                headers=headers,
                timeout=60
            )
            
            print(f"📥 Response: HTTP {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ COMMIT FAILED: HTTP {response.status_code}")
                print(f"Response: {response.text}")
                return False
            
            result = response.json()
            
            if not result.get("ok"):
                print(f"❌ COMMIT FAILED: ok={result.get('ok')}")
                print(f"Response: {json.dumps(result, indent=2)}")
                return False
            
            # Check expected values
            added = result.get('added', 0)
            replaced = result.get('replaced', 0)
            skipped = result.get('skipped', 0)
            published = result.get('published', 0)
            
            print(f"\n📊 COMMIT RESULTS:")
            print(f"   ok: {result.get('ok')} ✅")
            print(f"   added: {added}")
            print(f"   replaced: {replaced}")
            print(f"   skipped: {skipped} {'✅' if skipped == 0 else '❌ EXPECTED 0'}")
            print(f"   published: {published} {'✅' if published >= 37 else '❌ EXPECTED >= 37'}")
            print(f"   added + replaced: {added + replaced} {'✅' if added + replaced == 38 else '❌ EXPECTED 38'}")
            
            # Verify requirements
            if (added + replaced) == 38 and skipped == 0 and published >= 37:
                print(f"\n✅ TEST B PASSED: Imported 38 items (added {added}, replaced {replaced}), published {published}")
                return True
            else:
                print(f"\n❌ TEST B FAILED: Requirements not met")
                return False
            
    except Exception as e:
        print(f"❌ TEST B ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_c_store(token):
    """TEST C: Store verification"""
    print("\n" + "="*80)
    print("TEST C: STORE VERIFICATION")
    print("="*80)
    
    try:
        # C1: GET /api/tob/courses
        print(f"\n📤 C1: GET /api/tob/courses")
        response = requests.get(
            f"{BASE_URL}/api/tob/courses",
            timeout=30
        )
        
        print(f"📥 Response: HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ C1 FAILED: HTTP {response.status_code}")
            return False
        
        courses_data = response.json()
        
        # Handle different response formats
        if isinstance(courses_data, dict):
            courses = courses_data.get('courses', [])
        else:
            courses = courses_data
        
        print(f"   Total courses: {len(courses)}")
        
        # Find Class 5 PE course
        pe_course = None
        for course in courses:
            # Handle both string and dict formats
            if isinstance(course, str):
                continue
            if course.get('class') == '5' and course.get('subject_id') == 'PE':
                pe_course = course
                break
        
        if not pe_course:
            print(f"❌ C1 FAILED: Class 5 PE course NOT FOUND")
            print(f"Available courses: {json.dumps(courses, indent=2)}")
            return False
        
        print(f"✅ C1 PASSED: Class 5 PE course found")
        print(f"   class: {pe_course.get('class')}")
        print(f"   subject_id: {pe_course.get('subject_id')}")
        print(f"   subject_printed: {pe_course.get('subject_printed')}")
        
        # C2: GET /api/tob/items per term
        print(f"\n📤 C2: GET /api/tob/items per term")
        
        term_counts = {}
        for term in ['1', '2', 'full']:
            response = requests.get(
                f"{BASE_URL}/api/tob/items",
                params={'class': '5', 'subject': 'PE', 'term': term},
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ C2 FAILED: HTTP {response.status_code} for term={term}")
                return False
            
            items = response.json()
            term_counts[term] = len(items)
            print(f"   term={term}: {len(items)} items")
        
        print(f"✅ C2 PASSED: Items retrieved per term")
        
        # C3: Verify PE marks structure (component-based)
        print(f"\n📤 C3: Verify PE marks structure (component-based)")
        
        response = requests.get(
            f"{BASE_URL}/api/tob/items",
            params={'class': '5', 'subject': 'PE'},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ C3 FAILED: HTTP {response.status_code}")
            return False
        
        items_data = response.json()
        
        # Handle different response formats
        if isinstance(items_data, dict):
            all_items = items_data.get('items', [])
        else:
            all_items = items_data
        
        print(f"   Total PE items: {len(all_items)}")
        
        # Check first few items for marks structure
        sample_size = min(5, len(all_items))
        print(f"   Checking first {sample_size} items for marks structure...")
        
        component_based_count = 0
        has_written_project = 0
        
        for i, item in enumerate(all_items[:sample_size]):
            marks = item.get('marks', {})
            
            # PE should have component-based marks
            # Expected: components with Odia labels (ମୌଳିକ ଗତିବିଧି, ଖେଳ ଓ କ୍ରୀଡ଼ା, ଯୋଗ)
            # and performance (ପ୍ରଦର୍ଶନ) as separate field
            
            has_components = 'components' in marks or 'parts' in marks
            has_performance = 'performance' in marks
            has_written = 'written' in marks
            has_project = 'project' in marks
            
            if i == 0:
                print(f"\n   Sample item marks structure:")
                print(f"   {json.dumps(marks, indent=4, ensure_ascii=False)}")
            
            if has_components or has_performance:
                component_based_count += 1
            
            if has_written or has_project:
                has_written_project += 1
        
        print(f"\n   Component-based items: {component_based_count}/{sample_size}")
        print(f"   Items with written/project: {has_written_project}/{sample_size}")
        
        if component_based_count > 0 and has_written_project == 0:
            print(f"✅ C3 PASSED: PE items use component-based marks (NOT written/project)")
            return True
        else:
            print(f"❌ C3 FAILED: PE items do not have expected component-based marks structure")
            return False
        
    except Exception as e:
        print(f"❌ TEST C ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_d_regression(token):
    """TEST D: Regression check (AE and MATH still 0 RED)"""
    print("\n" + "="*80)
    print("TEST D: REGRESSION CHECK (AE & MATH)")
    print("="*80)
    
    try:
        headers = {'Authorization': f'Bearer {token}'}
        
        # Check AE
        print(f"\n📤 D1: GET /api/tob/admin/items?class=5&subject=AE")
        response = requests.get(
            f"{BASE_URL}/api/tob/admin/items",
            params={'class': '5', 'subject': 'AE'},
            headers=headers,
            timeout=30
        )
        
        print(f"📥 Response: HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ D1 FAILED: HTTP {response.status_code}")
            return False
        
        ae_data = response.json()
        
        # Handle different response formats
        if isinstance(ae_data, dict):
            ae_items = ae_data.get('items', [])
        else:
            ae_items = ae_data
        
        ae_red_count = sum(1 for item in ae_items if isinstance(item, dict) and item.get('validation', {}).get('status') == 'red')
        
        print(f"   Total AE items: {len(ae_items)}")
        print(f"   RED items: {ae_red_count} {'✅' if ae_red_count == 0 else '❌ EXPECTED 0'}")
        
        # Check MATH
        print(f"\n📤 D2: GET /api/tob/admin/items?class=5&subject=MATH")
        response = requests.get(
            f"{BASE_URL}/api/tob/admin/items",
            params={'class': '5', 'subject': 'MATH'},
            headers=headers,
            timeout=30
        )
        
        print(f"📥 Response: HTTP {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ D2 FAILED: HTTP {response.status_code}")
            return False
        
        math_data = response.json()
        
        # Handle different response formats
        if isinstance(math_data, dict):
            math_items = math_data.get('items', [])
        else:
            math_items = math_data
        
        math_red_count = sum(1 for item in math_items if isinstance(item, dict) and item.get('validation', {}).get('status') == 'red')
        
        print(f"   Total MATH items: {len(math_items)}")
        print(f"   RED items: {math_red_count} {'✅' if math_red_count == 0 else '❌ EXPECTED 0'}")
        
        if ae_red_count == 0 and math_red_count == 0:
            print(f"\n✅ TEST D PASSED: No regression - AE and MATH both have 0 RED items")
            return True
        else:
            print(f"\n❌ TEST D FAILED: Regression detected")
            return False
        
    except Exception as e:
        print(f"❌ TEST D ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("TOB PE (Physical Education) MARKS FRAMEWORK - BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test ZIP: {TEST_ZIP}")
    print(f"Admin: {ADMIN_MOBILE}")
    
    # Get admin token
    token = get_admin_token()
    if not token:
        print("\n❌ FATAL: Could not authenticate as admin")
        sys.exit(1)
    
    # TEST A: Peek
    rows = test_a_peek(token)
    if not rows:
        print("\n❌ FATAL: TEST A failed, cannot proceed")
        sys.exit(1)
    
    # TEST B: Commit
    if not test_b_commit(token, rows):
        print("\n❌ FATAL: TEST B failed")
        sys.exit(1)
    
    # TEST C: Store verification
    if not test_c_store(token):
        print("\n❌ FATAL: TEST C failed")
        sys.exit(1)
    
    # TEST D: Regression check
    if not test_d_regression(token):
        print("\n❌ FATAL: TEST D failed")
        sys.exit(1)
    
    # Final summary
    print("\n" + "="*80)
    print("🎉 ALL TESTS PASSED (4/4)")
    print("="*80)
    print("✅ TEST A: Peek - 38 items (7 chapters, 30 sets, 1 register), 0 RED")
    print("✅ TEST B: Commit - 38 items imported and published")
    print("✅ TEST C: Store - Class 5 PE course visible, items have component-based marks")
    print("✅ TEST D: Regression - AE and MATH both have 0 RED items")
    print("\n✅ PE marks framework working correctly via HTTP endpoints")
    print("✅ PE items left published on preview (no cleanup required)")
    print("="*80)

if __name__ == "__main__":
    main()
