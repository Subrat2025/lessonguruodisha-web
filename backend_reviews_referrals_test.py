#!/usr/bin/env python3
"""
Backend regression test for Reviews + Referrals + modified Register endpoints
Lesson Guru Odisha (Next.js app)
"""
import requests
import random
import os
import re

# Base URL from environment or fallback
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
if not BASE_URL.startswith('http'):
    BASE_URL = f'https://{BASE_URL}'
API_BASE = f'{BASE_URL}/api'

# Admin credentials from test_credentials.md
ADMIN_MOBILE = '9692604577'
ADMIN_PASSWORD = '<redacted>'

print(f"🧪 Testing API at: {API_BASE}\n")

# Track created resources for cleanup
created_users = []
created_reviews = []

def generate_mobile():
    """Generate a unique 10-digit mobile number"""
    return '99' + ''.join([str(random.randint(0, 9)) for _ in range(8)])

def test_health():
    """Test 0: Health check"""
    try:
        r = requests.get(f'{API_BASE}/', timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('ok') == True, "Health check failed"
        print("✅ Test 0: Health check passed")
        return True
    except Exception as e:
        print(f"❌ Test 0 FAILED: {e}")
        return False

def test_admin_login():
    """Test 1: Admin login"""
    try:
        r = requests.post(f'{API_BASE}/auth/login', json={
            'mobile': ADMIN_MOBILE,
            'password': ADMIN_PASSWORD
        }, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert 'token' in data, "No token in response"
        assert data['user']['role'] == 'admin', "User is not admin"
        print(f"✅ Test 1: Admin login successful (mobile: {ADMIN_MOBILE})")
        return data['token']
    except Exception as e:
        print(f"❌ Test 1 FAILED: {e}")
        return None

# ===== MODIFIED REGISTER ENDPOINT TESTS =====

def test_register_without_ref():
    """Test 2: Register new user WITHOUT ref code"""
    try:
        mobile = generate_mobile()
        r = requests.post(f'{API_BASE}/auth/register', json={
            'name': 'Test User 1',
            'mobile': mobile,
            'password': 'test1234'
        }, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert 'token' in data, "No token in response"
        assert 'user' in data, "No user in response"
        user = data['user']
        
        # Verify referralCode exists and matches pattern
        assert 'referralCode' in user, "No referralCode in user"
        code = user['referralCode']
        assert re.match(r'^LG[A-Z2-9]{6}$', code), f"Invalid referralCode format: {code}"
        
        # Verify referredBy is null
        assert user.get('referredBy') is None, f"Expected referredBy=null, got {user.get('referredBy')}"
        
        created_users.append({'id': user['id'], 'mobile': mobile, 'token': data['token'], 'referralCode': code})
        print(f"✅ Test 2: Register without ref passed (mobile: {mobile}, code: {code}, referredBy: null)")
        return data['token'], user['id'], code
    except Exception as e:
        print(f"❌ Test 2 FAILED: {e}")
        return None, None, None

def test_register_with_valid_ref(ref_code):
    """Test 3: Register new user WITH valid ref code"""
    try:
        mobile = generate_mobile()
        r = requests.post(f'{API_BASE}/auth/register', json={
            'name': 'Test User 2',
            'mobile': mobile,
            'password': 'test1234',
            'ref': ref_code
        }, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert 'token' in data, "No token in response"
        user = data['user']
        
        # Verify referralCode exists
        assert 'referralCode' in user, "No referralCode in user"
        code = user['referralCode']
        assert re.match(r'^LG[A-Z2-9]{6}$', code), f"Invalid referralCode format: {code}"
        
        # Verify referredBy is set to referrer's id
        assert user.get('referredBy') is not None, "Expected referredBy to be set"
        
        created_users.append({'id': user['id'], 'mobile': mobile, 'token': data['token'], 'referralCode': code})
        print(f"✅ Test 3: Register with valid ref passed (mobile: {mobile}, referredBy: {user['referredBy']})")
        return data['token'], user['id']
    except Exception as e:
        print(f"❌ Test 3 FAILED: {e}")
        return None, None

def test_register_with_invalid_ref():
    """Test 4: Register new user WITH invalid ref code"""
    try:
        mobile = generate_mobile()
        r = requests.post(f'{API_BASE}/auth/register', json={
            'name': 'Test User 3',
            'mobile': mobile,
            'password': 'test1234',
            'ref': 'INVALID-CODE'
        }, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        user = data['user']
        
        # Verify referredBy is null (invalid ref should be ignored)
        assert user.get('referredBy') is None, f"Expected referredBy=null for invalid ref, got {user.get('referredBy')}"
        
        created_users.append({'id': user['id'], 'mobile': mobile, 'token': data['token'], 'referralCode': user['referralCode']})
        print(f"✅ Test 4: Register with invalid ref passed (referredBy: null as expected)")
        return data['token'], user['id']
    except Exception as e:
        print(f"❌ Test 4 FAILED: {e}")
        return None, None

def test_register_validation():
    """Test 5: Register validation (missing fields, invalid mobile, short password)"""
    try:
        # Missing fields
        r = requests.post(f'{API_BASE}/auth/register', json={
            'name': 'Test',
            'mobile': generate_mobile()
        }, timeout=10)
        assert r.status_code == 400, f"Expected 400 for missing password, got {r.status_code}"
        
        # Invalid mobile (not 10 digits)
        r = requests.post(f'{API_BASE}/auth/register', json={
            'name': 'Test',
            'mobile': '123',
            'password': 'test1234'
        }, timeout=10)
        assert r.status_code == 400, f"Expected 400 for invalid mobile, got {r.status_code}"
        
        # Password too short
        r = requests.post(f'{API_BASE}/auth/register', json={
            'name': 'Test',
            'mobile': generate_mobile(),
            'password': '123'
        }, timeout=10)
        assert r.status_code == 400, f"Expected 400 for short password, got {r.status_code}"
        
        print("✅ Test 5: Register validation passed (all negative cases work)")
        return True
    except Exception as e:
        print(f"❌ Test 5 FAILED: {e}")
        return False

# ===== REVIEWS ENDPOINT TESTS =====

def test_reviews_unauthenticated():
    """Test 6: POST /api/reviews without auth"""
    try:
        r = requests.post(f'{API_BASE}/reviews', json={
            'rating': 5,
            'comment': 'Great app'
        }, timeout=10)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("✅ Test 6: POST /reviews without auth returns 401")
        return True
    except Exception as e:
        print(f"❌ Test 6 FAILED: {e}")
        return False

def test_reviews_invalid_rating(user_token):
    """Test 7: POST /api/reviews with invalid rating"""
    try:
        r = requests.post(f'{API_BASE}/reviews', json={
            'rating': 6,
            'comment': 'Test'
        }, headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 400, f"Expected 400 for rating=6, got {r.status_code}"
        print("✅ Test 7: POST /reviews with rating=6 returns 400")
        return True
    except Exception as e:
        print(f"❌ Test 7 FAILED: {e}")
        return False

def test_reviews_create(user_token):
    """Test 8: POST /api/reviews to create review"""
    try:
        r = requests.post(f'{API_BASE}/reviews', json={
            'rating': 4,
            'comment': 'Great app, very helpful for teachers!'
        }, headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('ok') == True, "Expected ok=true"
        assert data.get('action') == 'created', f"Expected action='created', got {data.get('action')}"
        review = data.get('review')
        assert review is not None, "No review in response"
        assert review['rating'] == 4, f"Expected rating=4, got {review['rating']}"
        assert review['visible'] == True, f"Expected visible=true, got {review['visible']}"
        
        created_reviews.append(review['id'])
        print(f"✅ Test 8: POST /reviews create passed (id: {review['id']}, rating: 4, visible: true)")
        return review['id']
    except Exception as e:
        print(f"❌ Test 8 FAILED: {e}")
        return None

def test_reviews_update(user_token):
    """Test 9: POST /api/reviews again to update (upsert)"""
    try:
        r = requests.post(f'{API_BASE}/reviews', json={
            'rating': 5,
            'comment': 'Updated review - excellent platform!'
        }, headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('action') == 'updated', f"Expected action='updated', got {data.get('action')}"
        review = data.get('review')
        assert review['rating'] == 5, f"Expected rating=5, got {review['rating']}"
        print(f"✅ Test 9: POST /reviews update passed (rating updated to 5)")
        return True
    except Exception as e:
        print(f"❌ Test 9 FAILED: {e}")
        return False

def test_reviews_get_me(user_token):
    """Test 10: GET /api/reviews/me"""
    try:
        r = requests.get(f'{API_BASE}/reviews/me', 
                        headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        review = data.get('review')
        assert review is not None, "No review returned"
        assert review['rating'] == 5, f"Expected rating=5, got {review['rating']}"
        print(f"✅ Test 10: GET /reviews/me passed (rating: 5)")
        return True
    except Exception as e:
        print(f"❌ Test 10 FAILED: {e}")
        return False

def test_reviews_public():
    """Test 11: GET /api/reviews/public (no auth)"""
    try:
        r = requests.get(f'{API_BASE}/reviews/public', timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert 'reviews' in data, "No reviews in response"
        assert 'count' in data, "No count in response"
        assert 'avg' in data, "No avg in response"
        assert data['count'] >= 1, f"Expected count >= 1, got {data['count']}"
        # Verify the review we created is in the list
        reviews = data['reviews']
        found = any(r['rating'] == 5 for r in reviews)
        assert found, "Our review not found in public list"
        print(f"✅ Test 11: GET /reviews/public passed (count: {data['count']}, avg: {data['avg']})")
        return True
    except Exception as e:
        print(f"❌ Test 11 FAILED: {e}")
        return False

def test_admin_reviews_get(admin_token):
    """Test 12: GET /api/admin/reviews (admin)"""
    try:
        r = requests.get(f'{API_BASE}/admin/reviews', 
                        headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert 'reviews' in data, "No reviews in response"
        assert 'count' in data, "No count in response"
        assert 'visibleCount' in data, "No visibleCount in response"
        assert data['count'] >= 1, f"Expected count >= 1, got {data['count']}"
        print(f"✅ Test 12: GET /admin/reviews passed (count: {data['count']}, visible: {data['visibleCount']})")
        return True
    except Exception as e:
        print(f"❌ Test 12 FAILED: {e}")
        return False

def test_admin_reviews_non_admin(user_token):
    """Test 13: GET /api/admin/reviews (non-admin) should return 403"""
    try:
        r = requests.get(f'{API_BASE}/admin/reviews', 
                        headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        print("✅ Test 13: GET /admin/reviews with non-admin returns 403")
        return True
    except Exception as e:
        print(f"❌ Test 13 FAILED: {e}")
        return False

def test_admin_reviews_patch_hide(admin_token, review_id):
    """Test 14: PATCH /api/admin/reviews/:id to hide review"""
    try:
        r = requests.patch(f'{API_BASE}/admin/reviews/{review_id}', 
                          json={'visible': False},
                          headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('ok') == True, "Expected ok=true"
        review = data.get('review')
        assert review['visible'] == False, f"Expected visible=false, got {review['visible']}"
        print(f"✅ Test 14: PATCH /admin/reviews/{review_id} hide passed")
        return True
    except Exception as e:
        print(f"❌ Test 14 FAILED: {e}")
        return False

def test_reviews_public_after_hide():
    """Test 15: GET /api/reviews/public should NOT include hidden review"""
    try:
        r = requests.get(f'{API_BASE}/reviews/public', timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        reviews = data['reviews']
        # Our review should not be in the list (it's hidden)
        found = any(r['rating'] == 5 and 'Updated review' in r.get('comment', '') for r in reviews)
        assert not found, "Hidden review should not appear in public list"
        print(f"✅ Test 15: GET /reviews/public correctly excludes hidden review")
        return True
    except Exception as e:
        print(f"❌ Test 15 FAILED: {e}")
        return False

def test_admin_reviews_patch_show(admin_token, review_id):
    """Test 16: PATCH /api/admin/reviews/:id to show review again"""
    try:
        r = requests.patch(f'{API_BASE}/admin/reviews/{review_id}', 
                          json={'visible': True},
                          headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        review = data.get('review')
        assert review['visible'] == True, f"Expected visible=true, got {review['visible']}"
        print(f"✅ Test 16: PATCH /admin/reviews/{review_id} show passed")
        return True
    except Exception as e:
        print(f"❌ Test 16 FAILED: {e}")
        return False

def test_reviews_public_after_show():
    """Test 17: GET /api/reviews/public should include review again"""
    try:
        r = requests.get(f'{API_BASE}/reviews/public', timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        reviews = data['reviews']
        # Our review should be back in the list
        found = any(r['rating'] == 5 for r in reviews)
        assert found, "Review should appear in public list after being shown"
        print(f"✅ Test 17: GET /reviews/public correctly includes shown review")
        return True
    except Exception as e:
        print(f"❌ Test 17 FAILED: {e}")
        return False

def test_admin_reviews_delete(admin_token, review_id):
    """Test 18: DELETE /api/admin/reviews/:id"""
    try:
        # Get count before delete
        r = requests.get(f'{API_BASE}/admin/reviews', 
                        headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        count_before = r.json()['count']
        
        # Delete
        r = requests.delete(f'{API_BASE}/admin/reviews/{review_id}', 
                           headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('ok') == True, "Expected ok=true"
        
        # Verify count decreased
        r = requests.get(f'{API_BASE}/admin/reviews', 
                        headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        count_after = r.json()['count']
        assert count_after == count_before - 1, f"Expected count to decrease by 1"
        
        print(f"✅ Test 18: DELETE /admin/reviews/{review_id} passed (count: {count_before} → {count_after})")
        return True
    except Exception as e:
        print(f"❌ Test 18 FAILED: {e}")
        return False

def test_admin_reviews_delete_nonexistent(admin_token):
    """Test 19: DELETE /api/admin/reviews/:id for non-existent review"""
    try:
        r = requests.delete(f'{API_BASE}/admin/reviews/nonexistent-id', 
                           headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"
        print("✅ Test 19: DELETE /admin/reviews/nonexistent returns 404")
        return True
    except Exception as e:
        print(f"❌ Test 19 FAILED: {e}")
        return False

# ===== REFERRALS ENDPOINT TESTS =====

def test_referrals_me_unauthenticated():
    """Test 20: GET /api/me/referral without auth"""
    try:
        r = requests.get(f'{API_BASE}/me/referral', timeout=10)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("✅ Test 20: GET /me/referral without auth returns 401")
        return True
    except Exception as e:
        print(f"❌ Test 20 FAILED: {e}")
        return False

def test_referrals_me(user_token, expected_invited=0):
    """Test 21: GET /api/me/referral (auth)"""
    try:
        r = requests.get(f'{API_BASE}/me/referral', 
                        headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        # Verify response structure
        assert 'code' in data, "No code in response"
        assert 'link' in data, "No link in response"
        assert 'totalInvited' in data, "No totalInvited in response"
        assert 'subscribedCount' in data, "No subscribedCount in response"
        assert 'joined' in data, "No joined in response"
        
        # Verify code format
        code = data['code']
        assert re.match(r'^LG[A-Z2-9]{6}$', code), f"Invalid referralCode format: {code}"
        
        # Verify link contains ref parameter
        link = data['link']
        assert f'?ref={code}' in link, f"Link should contain ?ref={code}"
        
        # Verify totalInvited
        assert data['totalInvited'] >= expected_invited, f"Expected totalInvited >= {expected_invited}, got {data['totalInvited']}"
        
        print(f"✅ Test 21: GET /me/referral passed (code: {code}, totalInvited: {data['totalInvited']}, subscribedCount: {data['subscribedCount']})")
        return data
    except Exception as e:
        print(f"❌ Test 21 FAILED: {e}")
        return None

def test_referrals_me_with_referred_users(referrer_token):
    """Test 22: GET /api/me/referral for user who has referred others"""
    try:
        r = requests.get(f'{API_BASE}/me/referral', 
                        headers={'Authorization': f'Bearer {referrer_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        # Verify at least one referred user
        assert data['totalInvited'] >= 1, f"Expected totalInvited >= 1, got {data['totalInvited']}"
        
        # Verify joined array structure
        joined = data['joined']
        assert len(joined) >= 1, f"Expected at least 1 joined user, got {len(joined)}"
        
        # Verify mobile masking (99****1234 pattern)
        first_user = joined[0]
        assert 'name' in first_user, "No name in joined user"
        assert 'mobile' in first_user, "No mobile in joined user"
        assert 'joinedAt' in first_user, "No joinedAt in joined user"
        assert 'subscribed' in first_user, "No subscribed in joined user"
        
        mobile = first_user['mobile']
        assert '****' in mobile, f"Mobile should be masked, got {mobile}"
        assert re.match(r'^\d{2}\*{4}\d{4}$', mobile), f"Invalid mobile mask pattern: {mobile}"
        
        print(f"✅ Test 22: GET /me/referral with referred users passed (totalInvited: {data['totalInvited']}, mobile masked: {mobile})")
        return True
    except Exception as e:
        print(f"❌ Test 22 FAILED: {e}")
        return False

def test_admin_referrals_get(admin_token):
    """Test 23: GET /api/admin/referrals (admin)"""
    try:
        r = requests.get(f'{API_BASE}/admin/referrals', 
                        headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        # Verify response structure
        assert 'leaderboard' in data, "No leaderboard in response"
        assert 'totalReferrals' in data, "No totalReferrals in response"
        assert 'totalSubscribed' in data, "No totalSubscribed in response"
        assert 'ambassadors' in data, "No ambassadors in response"
        
        leaderboard = data['leaderboard']
        if len(leaderboard) > 0:
            # Verify leaderboard is sorted by total desc
            for i in range(len(leaderboard) - 1):
                assert leaderboard[i]['total'] >= leaderboard[i+1]['total'], "Leaderboard not sorted by total desc"
            
            # Verify first entry structure
            first = leaderboard[0]
            assert 'userId' in first, "No userId in leaderboard entry"
            assert 'name' in first, "No name in leaderboard entry"
            assert 'mobile' in first, "No mobile in leaderboard entry"
            assert 'code' in first, "No code in leaderboard entry"
            assert 'total' in first, "No total in leaderboard entry"
            assert 'subscribed' in first, "No subscribed in leaderboard entry"
            assert 'recent' in first, "No recent in leaderboard entry"
            
            print(f"✅ Test 23: GET /admin/referrals passed (ambassadors: {data['ambassadors']}, totalReferrals: {data['totalReferrals']})")
        else:
            print(f"✅ Test 23: GET /admin/referrals passed (no referrals yet)")
        return True
    except Exception as e:
        print(f"❌ Test 23 FAILED: {e}")
        return False

def test_admin_referrals_non_admin(user_token):
    """Test 24: GET /api/admin/referrals (non-admin) should return 403"""
    try:
        r = requests.get(f'{API_BASE}/admin/referrals', 
                        headers={'Authorization': f'Bearer {user_token}'}, timeout=10)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
        print("✅ Test 24: GET /admin/referrals with non-admin returns 403")
        return True
    except Exception as e:
        print(f"❌ Test 24 FAILED: {e}")
        return False

# ===== CLEANUP =====

def cleanup(admin_token):
    """Cleanup: Delete test users and reviews"""
    print("\n🧹 Cleaning up test data...")
    
    # Delete test users
    for user in created_users:
        try:
            r = requests.delete(f'{API_BASE}/admin/users/{user["id"]}', 
                               headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
            if r.status_code == 200:
                print(f"  ✓ Deleted user {user['mobile']}")
            else:
                print(f"  ⚠ Failed to delete user {user['mobile']}: {r.status_code}")
        except Exception as e:
            print(f"  ⚠ Error deleting user {user['mobile']}: {e}")
    
    # Delete remaining test reviews (if any)
    for review_id in created_reviews:
        try:
            r = requests.delete(f'{API_BASE}/admin/reviews/{review_id}', 
                               headers={'Authorization': f'Bearer {admin_token}'}, timeout=10)
            if r.status_code == 200:
                print(f"  ✓ Deleted review {review_id}")
        except Exception as e:
            # Review might already be deleted, ignore
            pass
    
    print("✅ Cleanup complete\n")

# ===== MAIN TEST RUNNER =====

def main():
    print("=" * 80)
    print("BACKEND REGRESSION TEST: Reviews + Referrals + Modified Register")
    print("=" * 80)
    print()
    
    results = []
    
    # Test 0: Health check
    results.append(test_health())
    
    # Test 1: Admin login
    admin_token = test_admin_login()
    if not admin_token:
        print("\n❌ CRITICAL: Admin login failed. Cannot continue.")
        return
    
    print("\n" + "=" * 80)
    print("MODIFIED REGISTER ENDPOINT TESTS")
    print("=" * 80 + "\n")
    
    # Test 2: Register without ref
    user1_token, user1_id, user1_ref_code = test_register_without_ref()
    results.append(user1_token is not None)
    
    # Test 3: Register with valid ref
    if user1_ref_code:
        user2_token, user2_id = test_register_with_valid_ref(user1_ref_code)
        results.append(user2_token is not None)
    else:
        print("⚠ Skipping Test 3 (no ref code from Test 2)")
        results.append(False)
        user2_token = None
    
    # Test 4: Register with invalid ref
    user3_token, user3_id = test_register_with_invalid_ref()
    results.append(user3_token is not None)
    
    # Test 5: Register validation
    results.append(test_register_validation())
    
    print("\n" + "=" * 80)
    print("REVIEWS ENDPOINT TESTS")
    print("=" * 80 + "\n")
    
    # Test 6: POST /reviews unauthenticated
    results.append(test_reviews_unauthenticated())
    
    # Test 7: POST /reviews with invalid rating
    if user1_token:
        results.append(test_reviews_invalid_rating(user1_token))
    else:
        print("⚠ Skipping Test 7 (no user token)")
        results.append(False)
    
    # Test 8: POST /reviews create
    review_id = None
    if user1_token:
        review_id = test_reviews_create(user1_token)
        results.append(review_id is not None)
    else:
        print("⚠ Skipping Test 8 (no user token)")
        results.append(False)
    
    # Test 9: POST /reviews update
    if user1_token:
        results.append(test_reviews_update(user1_token))
    else:
        print("⚠ Skipping Test 9 (no user token)")
        results.append(False)
    
    # Test 10: GET /reviews/me
    if user1_token:
        results.append(test_reviews_get_me(user1_token))
    else:
        print("⚠ Skipping Test 10 (no user token)")
        results.append(False)
    
    # Test 11: GET /reviews/public
    results.append(test_reviews_public())
    
    # Test 12: GET /admin/reviews (admin)
    results.append(test_admin_reviews_get(admin_token))
    
    # Test 13: GET /admin/reviews (non-admin)
    if user1_token:
        results.append(test_admin_reviews_non_admin(user1_token))
    else:
        print("⚠ Skipping Test 13 (no user token)")
        results.append(False)
    
    # Test 14: PATCH /admin/reviews/:id hide
    if review_id:
        results.append(test_admin_reviews_patch_hide(admin_token, review_id))
    else:
        print("⚠ Skipping Test 14 (no review id)")
        results.append(False)
    
    # Test 15: GET /reviews/public after hide
    results.append(test_reviews_public_after_hide())
    
    # Test 16: PATCH /admin/reviews/:id show
    if review_id:
        results.append(test_admin_reviews_patch_show(admin_token, review_id))
    else:
        print("⚠ Skipping Test 16 (no review id)")
        results.append(False)
    
    # Test 17: GET /reviews/public after show
    results.append(test_reviews_public_after_show())
    
    # Test 18: DELETE /admin/reviews/:id
    if review_id:
        results.append(test_admin_reviews_delete(admin_token, review_id))
        # Remove from cleanup list since we just deleted it
        if review_id in created_reviews:
            created_reviews.remove(review_id)
    else:
        print("⚠ Skipping Test 18 (no review id)")
        results.append(False)
    
    # Test 19: DELETE /admin/reviews/:id nonexistent
    results.append(test_admin_reviews_delete_nonexistent(admin_token))
    
    print("\n" + "=" * 80)
    print("REFERRALS ENDPOINT TESTS")
    print("=" * 80 + "\n")
    
    # Test 20: GET /me/referral unauthenticated
    results.append(test_referrals_me_unauthenticated())
    
    # Test 21: GET /me/referral (any user)
    if user1_token:
        referral_data = test_referrals_me(user1_token, expected_invited=1)
        results.append(referral_data is not None)
    else:
        print("⚠ Skipping Test 21 (no user token)")
        results.append(False)
    
    # Test 22: GET /me/referral with referred users
    if user1_token:
        results.append(test_referrals_me_with_referred_users(user1_token))
    else:
        print("⚠ Skipping Test 22 (no user token)")
        results.append(False)
    
    # Test 23: GET /admin/referrals (admin)
    results.append(test_admin_referrals_get(admin_token))
    
    # Test 24: GET /admin/referrals (non-admin)
    if user1_token:
        results.append(test_admin_referrals_non_admin(user1_token))
    else:
        print("⚠ Skipping Test 24 (no user token)")
        results.append(False)
    
    # Cleanup
    cleanup(admin_token)
    
    # Summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(results)
    total = len(results)
    print(f"\n✅ PASSED: {passed}/{total} tests")
    if passed < total:
        print(f"❌ FAILED: {total - passed}/{total} tests")
    print()
    
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
    else:
        print("⚠️  SOME TESTS FAILED")
    print()

if __name__ == '__main__':
    main()
