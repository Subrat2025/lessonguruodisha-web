#!/usr/bin/env python3
"""
Backend test for Assessment Community Library changes.
Tests the removal of Premium gates and privacy enhancements.
"""
import requests
import sys
import json
from pymongo import MongoClient

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "edumaster_odisha"

# Test credentials
PREMIUM_USER = {"mobile": "9999900001", "password": "<redacted>"}
ADMIN_USER = {"mobile": "9692604577", "password": "<redacted>"}

def test_login(creds):
    """Login and return token"""
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
        print(f"✅ Test: Login with {creds['mobile']} → {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            return data.get("token")
        else:
            print(f"❌ Login failed: {r.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def get_test_data_from_db():
    """Get real IDs from database for testing"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Get a Class 9 ID
        class9 = db.classes.find_one({"name": "Class 9"})
        class9_id = class9["id"] if class9 else None
        
        # Get an English book for Class 9
        english_book = None
        if class9_id:
            english_book = db.books.find_one({
                "classId": class9_id,
                "$or": [
                    {"name": {"$regex": "English", "$options": "i"}},
                    {"nameOdia": {"$regex": "ଇଂରାଜୀ", "$options": "i"}}
                ]
            })
        english_book_id = english_book["id"] if english_book else None
        
        # Get "The Priceless Gift" chapter
        priceless_chapter = None
        if english_book_id:
            priceless_chapter = db.chapters.find_one({
                "bookId": english_book_id,
                "$or": [
                    {"name": {"$regex": "Priceless Gift", "$options": "i"}},
                    {"nameOdia": {"$regex": "Priceless Gift", "$options": "i"}}
                ]
            })
        priceless_chapter_id = priceless_chapter["id"] if priceless_chapter else None
        
        # Get a ready assessment (not owned by premium user)
        assessment = db.assessments.find_one({
            "status": "ready",
            "userId": {"$ne": "premium-user-id"},  # Not owned by test user
            "$or": [{"hiddenByAdmin": {"$exists": False}}, {"hiddenByAdmin": False}]
        })
        assessment_id = assessment["id"] if assessment else None
        assessment_owner_id = assessment["userId"] if assessment else None
        
        # Get premium user's actual ID
        premium_user = db.users.find_one({"mobile": PREMIUM_USER["mobile"]})
        premium_user_id = premium_user["id"] if premium_user else None
        
        client.close()
        
        return {
            "class9_id": class9_id,
            "english_book_id": english_book_id,
            "priceless_chapter_id": priceless_chapter_id,
            "assessment_id": assessment_id,
            "assessment_owner_id": assessment_owner_id,
            "premium_user_id": premium_user_id
        }
    except Exception as e:
        print(f"⚠️ Could not fetch test data from DB: {e}")
        return {}

def main():
    print("=" * 80)
    print("ASSESSMENT COMMUNITY LIBRARY TESTING")
    print("=" * 80)
    
    # Get test data from database
    test_data = get_test_data_from_db()
    print(f"\n📊 Test Data Retrieved:")
    print(f"   Class 9 ID: {test_data.get('class9_id', 'N/A')}")
    print(f"   English Book ID: {test_data.get('english_book_id', 'N/A')}")
    print(f"   Priceless Gift Chapter ID: {test_data.get('priceless_chapter_id', 'N/A')}")
    print(f"   Assessment ID: {test_data.get('assessment_id', 'N/A')}")
    print(f"   Premium User ID: {test_data.get('premium_user_id', 'N/A')}")
    print()
    
    # Test 1: Login with Premium user
    print("\n" + "=" * 80)
    print("TEST 1: Login with Premium User")
    print("=" * 80)
    premium_token = test_login(PREMIUM_USER)
    if not premium_token:
        print("❌ CRITICAL: Cannot proceed without Premium user token")
        sys.exit(1)
    
    headers_premium = {"Authorization": f"Bearer {premium_token}"}
    
    # Test 2: GET /api/assessments/community (no filter) with Premium token
    print("\n" + "=" * 80)
    print("TEST 2: GET /api/assessments/community (no filter) with Premium token")
    print("Expected: HTTP 200, JSON with items/total/limit/skip, total > 0")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/assessments/community", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"✅ PASS: Got 200 response")
            print(f"   Response keys: {list(data.keys())}")
            print(f"   Total: {data.get('total', 0)}")
            print(f"   Items count: {len(data.get('items', []))}")
            print(f"   Limit: {data.get('limit')}")
            print(f"   Skip: {data.get('skip')}")
            
            if data.get('total', 0) > 0:
                print(f"✅ PASS: total > 0 ({data['total']} assessments found)")
                
                # Check first item structure
                if data.get('items'):
                    item = data['items'][0]
                    print(f"\n   First item structure:")
                    print(f"      id: {item.get('id', 'N/A')}")
                    print(f"      title: {item.get('title', 'N/A')[:50]}...")
                    print(f"      type: {item.get('type', 'N/A')}")
                    print(f"      userName: {item.get('userName', 'N/A')}")
                    print(f"      userMobile present: {'userMobile' in item}")
                    print(f"      ownerLabel: {item.get('ownerLabel', 'N/A')}")
                    print(f"      isMine: {item.get('isMine', 'N/A')}")
                    
                    # Privacy check
                    if 'userMobile' in item:
                        print(f"   ❌ FAIL: userMobile field is present (privacy leak!)")
                    else:
                        print(f"   ✅ PASS: userMobile field is absent (privacy protected)")
                    
                    # Check userName is first name only
                    user_name = item.get('userName', '')
                    if user_name:
                        words = user_name.split()
                        if len(words) == 1 and user_name not in ['Mr', 'Mrs', 'Miss', 'Dr', 'Shri', 'Smt', 'Sri']:
                            print(f"   ✅ PASS: userName is single word (first name only): '{user_name}'")
                        else:
                            print(f"   ⚠️ WARNING: userName might not be first name only: '{user_name}'")
            else:
                print(f"⚠️ WARNING: total = 0 (no assessments in community library)")
        else:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 3: GET /api/assessments/community without auth → 401
    print("\n" + "=" * 80)
    print("TEST 3: GET /api/assessments/community without auth")
    print("Expected: HTTP 401 (login required)")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/assessments/community", timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 401:
            print(f"✅ PASS: Got 401 Unauthorized (login required)")
        else:
            print(f"❌ FAIL: Expected 401, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 4: GET /api/assessments/community?type=fa1
    print("\n" + "=" * 80)
    print("TEST 4: GET /api/assessments/community?type=fa1")
    print("Expected: Only items where type === 'fa1'")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/assessments/community?type=fa1", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"✅ PASS: Got 200 response")
            print(f"   Total FA1 assessments: {data.get('total', 0)}")
            
            # Check all items have type='fa1'
            items = data.get('items', [])
            if items:
                all_fa1 = all(item.get('type') == 'fa1' for item in items)
                if all_fa1:
                    print(f"✅ PASS: All {len(items)} items have type='fa1'")
                else:
                    wrong_types = [item.get('type') for item in items if item.get('type') != 'fa1']
                    print(f"❌ FAIL: Found items with wrong types: {set(wrong_types)}")
            else:
                print(f"⚠️ WARNING: No FA1 assessments found (might be empty)")
        else:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 5: GET /api/assessments/community with classId, bookId, chapterId filters
    print("\n" + "=" * 80)
    print("TEST 5: GET /api/assessments/community with classId, bookId, chapterId filters")
    print("Expected: Items filtered by Class 9, English book, Priceless Gift chapter")
    print("=" * 80)
    
    # Use hardcoded IDs from database query
    priceless_chapter_id = "a8092463-fdc2-409c-b173-07907b8eeea7"
    english_book_id = "3958c3b2-7286-44c4-844e-c4ada05bcf75"
    class9_id = test_data.get('class9_id')
    
    if class9_id:
        try:
            params = {
                "classId": class9_id,
                "bookId": english_book_id,
                "chapterId": priceless_chapter_id
            }
            r = requests.get(f"{BASE_URL}/assessments/community", headers=headers_premium, params=params, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"✅ PASS: Got 200 response")
                print(f"   Total filtered assessments: {data.get('total', 0)}")
                
                # Check items match filters
                items = data.get('items', [])
                if items:
                    print(f"   Found {len(items)} items")
                    all_match = True
                    for i, item in enumerate(items[:5]):  # Check first 5
                        chapter_names = item.get('chapterNames', [])
                        print(f"   Item {i+1}: chapterNames = {chapter_names}")
                        if any('Priceless Gift' in str(name) for name in chapter_names):
                            print(f"      ✅ Contains 'Priceless Gift'")
                        else:
                            print(f"      ❌ Does not contain 'Priceless Gift'")
                            all_match = False
                    
                    if all_match:
                        print(f"✅ PASS: All items contain 'Priceless Gift' in chapterNames")
                    else:
                        print(f"❌ FAIL: Some items don't match the chapter filter")
                else:
                    print(f"⚠️ WARNING: No assessments found for these filters")
            else:
                print(f"❌ FAIL: Expected 200, got {r.status_code}")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
    else:
        print(f"⚠️ SKIP: Missing class9_id")
    
    # Test 6: GET /api/assessments/community?mine=1
    print("\n" + "=" * 80)
    print("TEST 6: GET /api/assessments/community?mine=1")
    print("Expected: Only items where isMine=true (owned by current user)")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/assessments/community?mine=1", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"✅ PASS: Got 200 response")
            print(f"   Total 'mine' assessments: {data.get('total', 0)}")
            
            # Check all items have isMine=true
            items = data.get('items', [])
            if items:
                all_mine = all(item.get('isMine') == True for item in items)
                if all_mine:
                    print(f"✅ PASS: All {len(items)} items have isMine=true")
                else:
                    not_mine = [item.get('id') for item in items if not item.get('isMine')]
                    print(f"❌ FAIL: Found {len(not_mine)} items with isMine=false")
            else:
                print(f"⚠️ WARNING: No 'mine' assessments found (user might not have created any)")
        else:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 7: Privacy check - detailed verification
    print("\n" + "=" * 80)
    print("TEST 7: Privacy Verification - userName and userMobile")
    print("Expected: userName = first name only, userMobile absent")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/assessments/community?limit=10", headers=headers_premium, timeout=10)
        if r.status_code == 200:
            data = r.json()
            items = data.get('items', [])
            
            privacy_pass = True
            for i, item in enumerate(items):
                print(f"\n   Item {i+1}:")
                print(f"      userName: '{item.get('userName', 'N/A')}'")
                print(f"      ownerLabel: '{item.get('ownerLabel', 'N/A')}'")
                print(f"      isMine: {item.get('isMine', False)}")
                
                # Check userMobile is absent
                if 'userMobile' in item:
                    print(f"      ❌ FAIL: userMobile field is present!")
                    privacy_pass = False
                else:
                    print(f"      ✅ PASS: userMobile field is absent")
                
                # Check userName format (should be first name only or "Teacher")
                user_name = item.get('userName', '')
                if user_name and user_name != 'Teacher':
                    words = user_name.split()
                    salutations = ['Mr', 'Mrs', 'Miss', 'Dr', 'Shri', 'Smt', 'Sri', 'Mr.', 'Mrs.', 'Miss.', 'Dr.', 'Shri.', 'Smt.', 'Sri.']
                    if len(words) == 1 and user_name not in salutations:
                        print(f"      ✅ PASS: userName is single word (first name)")
                    else:
                        print(f"      ⚠️ WARNING: userName format unexpected: '{user_name}'")
                        privacy_pass = False
            
            if privacy_pass:
                print(f"\n✅ PASS: All privacy checks passed")
            else:
                print(f"\n❌ FAIL: Some privacy checks failed")
        else:
            print(f"❌ FAIL: Could not fetch items for privacy check")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 8: GET /api/assessments/:id as Premium user for assessment NOT owned by them
    print("\n" + "=" * 80)
    print("TEST 8: GET /api/assessments/:id (not owned by user)")
    print("Expected: HTTP 200 (Premium gate removed)")
    print("=" * 80)
    
    if test_data.get('assessment_id'):
        try:
            r = requests.get(f"{BASE_URL}/assessments/{test_data['assessment_id']}", headers=headers_premium, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                assessment = data.get('assessment', {})
                print(f"✅ PASS: Got 200 response (Premium gate removed)")
                print(f"   Assessment ID: {assessment.get('id', 'N/A')}")
                print(f"   Title: {assessment.get('title', 'N/A')[:50]}...")
                
                # Check privacy
                if 'userMobile' in assessment:
                    print(f"   ❌ FAIL: userMobile field is present in detail view!")
                else:
                    print(f"   ✅ PASS: userMobile field is absent")
                
                user_name = assessment.get('userName', '')
                if user_name:
                    words = user_name.split()
                    if len(words) == 1:
                        print(f"   ✅ PASS: userName is first name only: '{user_name}'")
                    else:
                        print(f"   ⚠️ WARNING: userName might not be first name only: '{user_name}'")
            elif r.status_code == 402:
                print(f"❌ FAIL: Got 402 (Premium gate still active!)")
                print(f"   Response: {r.text[:200]}")
            else:
                print(f"⚠️ WARNING: Got {r.status_code} (might be 404 if assessment not found)")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
    else:
        print(f"⚠️ SKIP: No assessment ID available for testing")
    
    # Test 9: POST /api/assessments/:id/duplicate (not owned by user)
    print("\n" + "=" * 80)
    print("TEST 9: POST /api/assessments/:id/duplicate (not owned by user)")
    print("Expected: HTTP 200 with cloned doc (Premium gate removed)")
    print("=" * 80)
    
    if test_data.get('assessment_id'):
        try:
            r = requests.post(f"{BASE_URL}/assessments/{test_data['assessment_id']}/duplicate", 
                            headers=headers_premium, json={}, timeout=15)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"✅ PASS: Got 200 response (Premium gate removed)")
                print(f"   ok: {data.get('ok')}")
                
                cloned = data.get('assessment', {})
                if cloned:
                    print(f"   Cloned assessment ID: {cloned.get('id', 'N/A')}")
                    print(f"   Cloned title: {cloned.get('title', 'N/A')[:60]}...")
                    print(f"   userId: {cloned.get('userId', 'N/A')}")
                    
                    # Verify clone belongs to caller
                    if cloned.get('userId') == test_data.get('premium_user_id'):
                        print(f"   ✅ PASS: Clone belongs to caller (userId matches)")
                    else:
                        print(f"   ⚠️ WARNING: Clone userId doesn't match caller")
                    
                    # Clean up - delete the cloned assessment
                    try:
                        del_r = requests.delete(f"{BASE_URL}/assessments/{cloned['id']}", 
                                              headers=headers_premium, timeout=10)
                        if del_r.status_code == 200:
                            print(f"   🧹 Cleanup: Deleted cloned assessment")
                        else:
                            print(f"   ⚠️ Cleanup failed: {del_r.status_code}")
                    except:
                        pass
            elif r.status_code == 402:
                print(f"❌ FAIL: Got 402 (Premium gate still active!)")
                print(f"   Response: {r.text[:200]}")
            else:
                print(f"⚠️ WARNING: Got {r.status_code}")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
    else:
        print(f"⚠️ SKIP: No assessment ID available for testing")
    
    # Test 10: Regression - GET /api/lessons?limit=5
    print("\n" + "=" * 80)
    print("TEST 10: Regression - GET /api/lessons?limit=5")
    print("Expected: { lessons, total, limit, skip }")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/lessons?limit=5", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            required_keys = ['lessons', 'total', 'limit', 'skip']
            has_all_keys = all(key in data for key in required_keys)
            if has_all_keys:
                print(f"✅ PASS: Response has all required keys: {required_keys}")
                print(f"   Total: {data.get('total')}, Limit: {data.get('limit')}, Skip: {data.get('skip')}")
                print(f"   Lessons count: {len(data.get('lessons', []))}")
            else:
                missing = [k for k in required_keys if k not in data]
                print(f"❌ FAIL: Missing keys: {missing}")
        else:
            print(f"⚠️ WARNING: Got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 11: Regression - GET /api/books (without counts)
    print("\n" + "=" * 80)
    print("TEST 11: Regression - GET /api/books (without counts)")
    print("Expected: Books without counts by default")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/books?limit=5", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            books = data.get('books', [])
            if books:
                first_book = books[0]
                has_counts = 'chapterCount' in first_book or 'lessonCount' in first_book
                if not has_counts:
                    print(f"✅ PASS: Books returned without counts (default behavior)")
                else:
                    print(f"⚠️ WARNING: Books have counts (unexpected)")
            else:
                print(f"⚠️ WARNING: No books returned")
        else:
            print(f"⚠️ WARNING: Got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 12: Regression - GET /api/books?counts=1
    print("\n" + "=" * 80)
    print("TEST 12: Regression - GET /api/books?counts=1")
    print("Expected: Books with counts")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/books?counts=1&limit=5", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            books = data.get('books', [])
            if books:
                first_book = books[0]
                has_counts = 'chaptersCount' in first_book or 'lessonsCount' in first_book
                if has_counts:
                    print(f"✅ PASS: Books returned with counts")
                    print(f"   First book: chaptersCount={first_book.get('chaptersCount')}, lessonsCount={first_book.get('lessonsCount')}")
                else:
                    print(f"❌ FAIL: Books don't have counts (expected with ?counts=1)")
            else:
                print(f"⚠️ WARNING: No books returned")
        else:
            print(f"⚠️ WARNING: Got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 13: Regression - GET /api/chapters
    print("\n" + "=" * 80)
    print("TEST 13: Regression - GET /api/chapters")
    print("Expected: { chapters, total, limit, skip }")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/chapters?limit=5", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            required_keys = ['chapters', 'total', 'limit', 'skip']
            has_all_keys = all(key in data for key in required_keys)
            if has_all_keys:
                print(f"✅ PASS: Response has all required keys: {required_keys}")
                print(f"   Total: {data.get('total')}, Limit: {data.get('limit')}, Skip: {data.get('skip')}")
                print(f"   Chapters count: {len(data.get('chapters', []))}")
            else:
                missing = [k for k in required_keys if k not in data]
                print(f"❌ FAIL: Missing keys: {missing}")
        else:
            print(f"⚠️ WARNING: Got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    # Test 14: Regression - GET /api/lessons (no filter) should return 400
    print("\n" + "=" * 80)
    print("TEST 14: Regression - GET /api/lessons (no filter)")
    print("Expected: HTTP 400 (scoping filter required)")
    print("=" * 80)
    try:
        r = requests.get(f"{BASE_URL}/lessons", headers=headers_premium, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 400:
            print(f"✅ PASS: Got 400 (scoping filter required)")
            print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ FAIL: Expected 400, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
    
    print("\n" + "=" * 80)
    print("TESTING COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
