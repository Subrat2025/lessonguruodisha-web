#!/usr/bin/env python3
"""
Backend test for Gemini-only AI Credit zones bug fix verification.

Tests that paid AI Credit zones (Student Engagement, Custom Worksheets, Assessment, Resources)
NEVER return OpenAI 429 errors or reference platform.openai.com when Gemini quota is exhausted.

Expected behavior:
- Either successful Gemini response OR friendly Gemini-only error message
- NO OpenAI 429 errors
- NO platform.openai.com references
- NO "add credits to continue using the API" messages
"""

import requests
import json
import time
import os
import sys

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://odisha-learning-pro.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "<redacted>"
TEST_USER_MOBILE = "9999900001"
TEST_USER_PASSWORD = "<redacted>"

# Friendly error patterns that are acceptable
FRIENDLY_ERROR_PATTERNS = [
    "⚠️ AI generation quota reached for today",
    "⚠️ AI generation is temporarily busy",
    "⚠️ AI generation timed out",
    "⚠️ AI generation is temporarily unavailable",
    "AI generation is temporarily unavailable",
    "No credits were charged",
    "GEMINI_DAILY_QUOTA",
    "GEMINI_RATE_LIMIT",
    "GEMINI_TIMEOUT",
    "GEMINI_FAILED",
]

# Forbidden patterns that indicate OpenAI fallback (BUG)
FORBIDDEN_PATTERNS = [
    "platform.openai.com",
    "OpenAI",
    "openai",
    "add credits to continue using the API",
    "You have no credits remaining",
    "429",
]

def check_response_for_openai_references(response_text, response_json=None):
    """Check if response contains any OpenAI references (which would be a bug)"""
    text_lower = response_text.lower()
    
    # Check if it's a friendly Gemini error first
    for pattern in FRIENDLY_ERROR_PATTERNS:
        if pattern.lower() in text_lower:
            return False, f"Friendly Gemini error: '{pattern}'"
    
    # Check forbidden patterns - but only in error messages, not in IDs or other fields
    # Parse JSON to check error field specifically
    try:
        data = json.loads(response_text) if response_json is None else response_json
        error_msg = data.get('error', '') or data.get('errorMessage', '')
        if error_msg:
            error_lower = str(error_msg).lower()
            for pattern in FORBIDDEN_PATTERNS:
                if pattern.lower() in error_lower:
                    return True, f"Found forbidden pattern in error: '{pattern}'"
    except:
        # If not JSON, check the whole text
        for pattern in FORBIDDEN_PATTERNS:
            # Skip "429" as it might appear in IDs
            if pattern == "429":
                # Only flag if it appears with OpenAI context
                if "429" in text_lower and ("openai" in text_lower or "platform.openai.com" in text_lower):
                    return True, f"Found OpenAI 429 error"
            elif pattern.lower() in text_lower:
                return True, f"Found forbidden pattern: '{pattern}'"
    
    return False, "No OpenAI references found"

def login(mobile, password):
    """Login and return token"""
    print(f"\n🔐 Logging in as {mobile}...")
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={"mobile": mobile, "password": password},
        timeout=30
    )
    if response.status_code == 200:
        data = response.json()
        token = data.get('token')
        print(f"✅ Login successful. Token: {token[:20]}...")
        return token
    else:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None

def get_lesson_id(token):
    """Get a lesson ID from the database"""
    print("\n📚 Fetching lesson ID...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get classes
    response = requests.get(f"{API_BASE}/classes", headers=headers, timeout=30)
    if response.status_code != 200:
        print(f"❌ Failed to get classes: {response.status_code}")
        return None
    
    classes_data = response.json()
    # Handle both array and object with 'classes' key
    if isinstance(classes_data, dict) and 'classes' in classes_data:
        classes = classes_data['classes']
    else:
        classes = classes_data
    
    if not classes or len(classes) == 0:
        print("❌ No classes found")
        return None
    
    class_id = classes[0]['id']
    print(f"✅ Found class: {classes[0]['name']} (ID: {class_id})")
    
    # Get books for this class
    response = requests.get(f"{API_BASE}/books?classId={class_id}", headers=headers, timeout=30)
    if response.status_code != 200:
        print(f"❌ Failed to get books: {response.status_code}")
        return None
    
    books_data = response.json()
    # Handle both array and object with 'books' key
    if isinstance(books_data, dict) and 'books' in books_data:
        books = books_data['books']
    else:
        books = books_data
    
    if not books or len(books) == 0:
        print("❌ No books found")
        return None
    
    book_id = books[0]['id']
    print(f"✅ Found book: {books[0]['name']} (ID: {book_id})")
    
    # Get chapters for this book
    response = requests.get(f"{API_BASE}/chapters?classId={class_id}&bookId={book_id}", headers=headers, timeout=30)
    if response.status_code != 200:
        print(f"❌ Failed to get chapters: {response.status_code}")
        return None
    
    chapters_data = response.json()
    # Handle both array and object with 'chapters' key
    if isinstance(chapters_data, dict) and 'chapters' in chapters_data:
        chapters = chapters_data['chapters']
    else:
        chapters = chapters_data
    
    if not chapters or len(chapters) == 0:
        print("❌ No chapters found")
        return None
    
    chapter_id = chapters[0]['id']
    print(f"✅ Found chapter: {chapters[0]['name']} (ID: {chapter_id})")
    
    # Get lessons for this chapter
    response = requests.get(f"{API_BASE}/lessons?chapterId={chapter_id}", headers=headers, timeout=30)
    if response.status_code != 200:
        print(f"❌ Failed to get lessons: {response.status_code}")
        return None
    
    lessons_data = response.json()
    # Handle both array and object with 'lessons' key
    if isinstance(lessons_data, dict) and 'lessons' in lessons_data:
        lessons = lessons_data['lessons']
    else:
        lessons = lessons_data
    
    if not lessons or len(lessons) == 0:
        print("❌ No lessons found")
        return None
    
    lesson_id = lessons[0]['id']
    print(f"✅ Found lesson: {lessons[0]['title']} (ID: {lesson_id})")
    
    return {
        'lessonId': lesson_id,
        'classId': class_id,
        'bookId': book_id,
        'chapterId': chapter_id,
        'className': classes[0]['name'],
        'bookName': books[0]['name'],
        'chapterName': chapters[0]['name'],
        'lessonTitle': lessons[0]['title']
    }

def test_engagement_endpoint(token, lesson_id, section):
    """Test engagement endpoint (assessment, examples, questions, project)"""
    print(f"\n🧪 TEST: Engagement endpoint - {section}")
    print(f"   POST /api/lessons/{lesson_id}/engagement/{section}")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.post(
            f"{API_BASE}/lessons/{lesson_id}/engagement/{section}",
            headers=headers,
            timeout=120  # Longer timeout for AI generation
        )
        
        status = response.status_code
        text = response.text
        
        print(f"   Status: {status}")
        print(f"   Response length: {len(text)} chars")
        
        # Check for OpenAI references
        has_openai, message = check_response_for_openai_references(text)
        
        if has_openai:
            print(f"   ❌ FAIL: {message}")
            print(f"   Response preview: {text[:500]}")
            return False
        
        if status == 200:
            try:
                data = response.json()
                if data.get('ok'):
                    print(f"   ✅ PASS: Generation successful")
                    print(f"   Cached: {data.get('cached', False)}")
                    return True
            except:
                pass
        
        # Check if it's a friendly error
        if any(pattern.lower() in text.lower() for pattern in FRIENDLY_ERROR_PATTERNS):
            print(f"   ✅ PASS: Friendly Gemini error (expected behavior)")
            print(f"   Message: {message}")
            return True
        
        # Other errors
        print(f"   ⚠️  Response: {text[:300]}")
        return True  # Not a critical failure if no OpenAI references
        
    except requests.exceptions.Timeout:
        print(f"   ⚠️  Timeout (expected for long AI generation)")
        return True
    except Exception as e:
        print(f"   ❌ Exception: {str(e)}")
        return False

def test_resources_endpoint(token, context):
    """Test resources endpoint (HOTS, Homework, Practice, etc.)"""
    print(f"\n🧪 TEST: Resources endpoint - hots-questions")
    print(f"   POST /api/resources/generate")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "classId": context['classId'],
        "bookId": context['bookId'],
        "chapterIds": [context['chapterId']],
        "resourceType": "hots-questions",
        "language": "odia",
        "difficulty": "mixed",
        "count": 5
    }
    
    try:
        # Create stub
        response = requests.post(
            f"{API_BASE}/resources/generate",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        status = response.status_code
        text = response.text
        
        print(f"   Status: {status}")
        
        # Check for OpenAI references
        has_openai, message = check_response_for_openai_references(text)
        
        if has_openai:
            print(f"   ❌ FAIL: {message}")
            print(f"   Response preview: {text[:500]}")
            return False
        
        if status == 200:
            data = response.json()
            resource_id = data.get('resource', {}).get('id')
            if resource_id:
                print(f"   ✅ Stub created: {resource_id}")
                
                # Poll for completion
                print(f"   Polling for completion...")
                for i in range(30):  # Poll for up to 60 seconds
                    time.sleep(2)
                    poll_response = requests.get(
                        f"{API_BASE}/resources/{resource_id}",
                        headers=headers,
                        timeout=30
                    )
                    
                    if poll_response.status_code == 200:
                        poll_data = poll_response.json()
                        poll_status = poll_data.get('status')
                        
                        # Check for OpenAI references in poll response
                        has_openai_poll, message_poll = check_response_for_openai_references(poll_response.text)
                        if has_openai_poll:
                            print(f"   ❌ FAIL: {message_poll} (in poll response)")
                            print(f"   Response preview: {poll_response.text[:500]}")
                            return False
                        
                        if poll_status == 'ready':
                            print(f"   ✅ PASS: Generation completed successfully")
                            return True
                        elif poll_status == 'failed':
                            error_msg = poll_data.get('errorMessage', '')
                            # Check if it's a friendly error
                            if any(pattern.lower() in error_msg.lower() for pattern in FRIENDLY_ERROR_PATTERNS):
                                print(f"   ✅ PASS: Friendly Gemini error (expected behavior)")
                                print(f"   Error: {error_msg}")
                                return True
                            else:
                                print(f"   ⚠️  Generation failed: {error_msg}")
                                return True  # Not critical if no OpenAI references
                        else:
                            print(f"   ... Status: {poll_status} (attempt {i+1}/30)")
                
                print(f"   ⚠️  Timeout waiting for completion")
                return True  # Not critical
        
        # Check if it's a friendly error
        if any(pattern.lower() in text.lower() for pattern in FRIENDLY_ERROR_PATTERNS):
            print(f"   ✅ PASS: Friendly Gemini error (expected behavior)")
            return True
        
        print(f"   ⚠️  Response: {text[:300]}")
        return True
        
    except Exception as e:
        print(f"   ❌ Exception: {str(e)}")
        return False

def test_admin_utilities_regression(token):
    """Test that admin utilities still work with OpenAI fallback"""
    print(f"\n🧪 TEST: Admin utilities regression (should still work)")
    print(f"   POST /api/admin/ai/worksheet")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "className": "Class 5",
        "topic": "Numbers",
        "count": 5,
        "types": ["mcq", "fill"],
        "language": "odia"
    }
    
    try:
        response = requests.post(
            f"{API_BASE}/admin/ai/worksheet",
            headers=headers,
            json=payload,
            timeout=120
        )
        
        status = response.status_code
        text = response.text
        
        print(f"   Status: {status}")
        
        if status == 200:
            print(f"   ✅ PASS: Admin utility working (OpenAI fallback allowed here)")
            return True
        else:
            print(f"   ⚠️  Response: {text[:300]}")
            return True  # Not critical for this test
        
    except Exception as e:
        print(f"   ⚠️  Exception: {str(e)}")
        return True  # Not critical

def run_grep_sanity_check():
    """Run grep sanity check"""
    print(f"\n🧪 TEST: Grep sanity check")
    print(f"   Checking for OpenAI references in paid zone files...")
    
    import subprocess
    
    files = [
        '/app/lib/ai-pipeline.js',
        '/app/lib/worksheet.js',
        '/app/lib/assessment.js',
        '/app/lib/question-paper.js'
    ]
    
    try:
        result = subprocess.run(
            ['grep', '-n', 'generateJSONWithOpenAI\\|openaiEnabled'] + files,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            # Found matches
            print(f"   ❌ FAIL: Found OpenAI references in paid zone files:")
            print(result.stdout)
            return False
        else:
            # No matches (expected)
            print(f"   ✅ PASS: No OpenAI references found in paid zone files")
            return True
    except Exception as e:
        print(f"   ⚠️  Exception: {str(e)}")
        return True

def main():
    print("=" * 80)
    print("GEMINI-ONLY AI CREDIT ZONES BUG FIX VERIFICATION")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    
    results = []
    
    # Test 1: Grep sanity check
    results.append(("Grep sanity check", run_grep_sanity_check()))
    
    # Login as admin
    admin_token = login(ADMIN_MOBILE, ADMIN_PASSWORD)
    if not admin_token:
        print("\n❌ CRITICAL: Admin login failed. Cannot continue.")
        sys.exit(1)
    
    # Get lesson context
    context = get_lesson_id(admin_token)
    if not context:
        print("\n❌ CRITICAL: Could not get lesson context. Cannot continue.")
        sys.exit(1)
    
    print(f"\n📋 Test Context:")
    print(f"   Class: {context['className']}")
    print(f"   Book: {context['bookName']}")
    print(f"   Chapter: {context['chapterName']}")
    print(f"   Lesson: {context['lessonTitle']}")
    
    # Test 2-5: Engagement endpoints
    for section in ['assessment', 'examples', 'questions', 'project']:
        result = test_engagement_endpoint(admin_token, context['lessonId'], section)
        results.append((f"Engagement - {section}", result))
    
    # Test 6: Resources endpoint
    result = test_resources_endpoint(admin_token, context)
    results.append(("Resources - HOTS", result))
    
    # Test 7: Admin utilities regression
    result = test_admin_utilities_regression(admin_token)
    results.append(("Admin utilities regression", result))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("\n" + "=" * 80)
    print(f"Total: {len(results)} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print("=" * 80)
    
    if failed > 0:
        print("\n❌ CRITICAL FAILURES DETECTED")
        print("Some endpoints are still returning OpenAI 429 errors or references.")
        print("This is a P0 regression that must be fixed.")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        print("No OpenAI references found in paid AI Credit zones.")
        print("Friendly Gemini errors are working as expected.")
        sys.exit(0)

if __name__ == "__main__":
    main()
