#!/usr/bin/env python3
"""
Additional test to verify migration v3 worked on existing rows.
This checks the migrations collection and verifies all rows have topicTitle.
"""

import requests
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

def test_migration_v3_verification():
    print("\n" + "="*80)
    print("PANCHAPADI MIGRATION V3 VERIFICATION")
    print("="*80)
    
    # Admin Login
    print("\n[Test 1] Admin Login...")
    try:
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": "9999999999",
            "password": "admin123"
        }, timeout=30)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code}"
        token = login_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ PASS: Admin login successful")
    except Exception as e:
        print(f"❌ FAIL: Admin login failed - {e}")
        return
    
    # Get all Panchapadi lessons (admin view)
    print("\n[Test 2] Get all Panchapadi lessons (admin view)...")
    try:
        admin_resp = requests.get(f"{BASE_URL}/admin/panchapadi-lessons", headers=headers, timeout=30)
        assert admin_resp.status_code == 200, f"Admin list failed: {admin_resp.status_code}"
        admin_data = admin_resp.json()
        total_count = admin_data.get('count', 0)
        lessons = admin_data.get('lessons', [])
        print(f"✅ PASS: Found {total_count} total Panchapadi lessons in database")
        
        if total_count == 0:
            print("⚠️  INFO: No existing Panchapadi lessons found - migration v3 had nothing to backfill")
            print("   This is expected if the panchapadiUploads collection is empty")
            return
        
        # Check if all lessons have topicTitle field
        missing_topic = []
        has_topic = []
        for lesson in lessons:
            if 'topicTitle' not in lesson:
                missing_topic.append(lesson.get('id', 'unknown'))
            elif lesson.get('topicTitle') is None or lesson.get('topicTitle') == '':
                # Empty string is acceptable if HTML has no headings
                has_topic.append(lesson.get('id'))
            else:
                has_topic.append(lesson.get('id'))
        
        print(f"\n   Lessons with topicTitle field: {len(has_topic)}")
        print(f"   Lessons missing topicTitle field: {len(missing_topic)}")
        
        if missing_topic:
            print(f"   ❌ FAIL: {len(missing_topic)} lessons missing topicTitle field")
            print(f"   Missing IDs: {missing_topic[:5]}")  # Show first 5
            return
        else:
            print("   ✅ PASS: All lessons have topicTitle field")
        
        # Sample a few lessons to verify topicTitle content
        print("\n[Test 3] Sample topicTitle values...")
        sample_size = min(5, len(lessons))
        for i, lesson in enumerate(lessons[:sample_size]):
            topic = lesson.get('topicTitle', '')
            period = lesson.get('period', '?')
            chapter = lesson.get('chapterLabel', 'Unknown')
            print(f"   {i+1}. Period {period} · {chapter}")
            print(f"      topicTitle: '{topic}'")
        
        print("\n✅ PASS: Migration v3 successfully backfilled topicTitle for all existing rows")
        
    except Exception as e:
        print(f"❌ FAIL: Admin list test failed - {e}")
        return
    
    print("\n" + "="*80)
    print("✅ MIGRATION V3 VERIFICATION COMPLETE")
    print("="*80)

if __name__ == "__main__":
    test_migration_v3_verification()
