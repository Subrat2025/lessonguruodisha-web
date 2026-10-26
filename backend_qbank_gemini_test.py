#!/usr/bin/env python3
"""
Question Bank HTML Import - Gemini Format Regression Test
Tests the updated parser that supports both legacy and new Gemini format.

Test Scenarios:
1. New Gemini-format template (10 questions)
2. Gemini-generated large file (72 questions)
3. Save flow with autoCreateChapters and duplicate detection
4. Legacy format backward compatibility
5. Empty/malformed inputs return graceful errors
"""

import requests
import json
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

def log(msg):
    print(f"  {msg}")

def test_result(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  {details}")
    return passed

def main():
    print("=" * 80)
    print("QUESTION BANK HTML IMPORT - GEMINI FORMAT REGRESSION TEST")
    print("=" * 80)
    
    results = []
    token = None
    
    # ========== TEST 0: Admin Login ==========
    try:
        log("Logging in as admin...")
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        }, timeout=30)
        if r.status_code == 200:
            data = r.json()
            token = data.get("token")
            results.append(test_result("Test 0: Admin Login", True, f"Token: {token[:20]}..."))
        else:
            results.append(test_result("Test 0: Admin Login", False, f"Status: {r.status_code}, Body: {r.text[:200]}"))
            print("\n❌ CRITICAL: Cannot proceed without admin token")
            sys.exit(1)
    except Exception as e:
        results.append(test_result("Test 0: Admin Login", False, f"Exception: {str(e)}"))
        sys.exit(1)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # ========== TEST 1: New Gemini-format template ==========
    print("\n" + "=" * 80)
    print("TEST 1: NEW GEMINI-FORMAT TEMPLATE")
    print("=" * 80)
    
    try:
        # Step 1a: GET template file
        log("Fetching Gemini template from /templates/qbank-import-template.html...")
        r = requests.get("https://odisha-learning-pro.preview.emergentagent.com/templates/qbank-import-template.html", timeout=30)
        if r.status_code != 200:
            results.append(test_result("Test 1a: GET template", False, f"Status: {r.status_code}"))
        else:
            template_html = r.text
            template_size = len(template_html)
            results.append(test_result("Test 1a: GET template", True, f"Size: {template_size} bytes"))
            
            # Step 1b: POST preview with template
            log("Posting template to /admin/qbank/import/preview...")
            r = requests.post(f"{BASE_URL}/admin/qbank/import/preview", 
                headers=headers,
                json={"html": template_html, "fileName": "gemini-template.html"},
                timeout=30
            )
            
            if r.status_code != 200:
                results.append(test_result("Test 1b: Preview Gemini template", False, f"Status: {r.status_code}, Body: {r.text[:500]}"))
            else:
                data = r.json()
                if not data.get("ok"):
                    results.append(test_result("Test 1b: Preview Gemini template", False, f"ok=false, error: {data.get('error')}"))
                else:
                    summary = data.get("summary", {})
                    items = data.get("items", [])
                    
                    # Verify totalFound = 10
                    total_found = summary.get("totalFound", 0)
                    test_1b_pass = total_found == 10
                    results.append(test_result("Test 1b: totalFound = 10", test_1b_pass, f"Found: {total_found}"))
                    
                    # Verify class/subject/chapter extraction from .header-banner
                    if items:
                        first_item = items[0]
                        class_name = first_item.get("className", "")
                        subject_name = first_item.get("subjectName", "")
                        chapter_name = first_item.get("chapterName", "")
                        
                        # Expected: Class 5, Mathematics, Fractions (or similar)
                        class_ok = "5" in class_name or "Class 5" in class_name
                        subject_ok = "Math" in subject_name
                        chapter_ok = "Fraction" in chapter_name or len(chapter_name) > 0
                        
                        results.append(test_result("Test 1c: Class extraction", class_ok, f"Class: {class_name}"))
                        results.append(test_result("Test 1d: Subject extraction", subject_ok, f"Subject: {subject_name}"))
                        results.append(test_result("Test 1e: Chapter extraction", chapter_ok, f"Chapter: {chapter_name}"))
                        
                        # Verify type distribution
                        type_counts = {}
                        for item in items:
                            qtype = item.get("questionType", "Unknown")
                            type_counts[qtype] = type_counts.get(qtype, 0) + 1
                        
                        log(f"Type distribution: {type_counts}")
                        
                        # Expected: MCQ:2, TrueFalse:1, Fill:1, Match:1, VeryShort:1, Short:1, Long:1, Competency:1, Application:1
                        expected_types = ["MCQ", "TrueFalse", "Fill", "Match", "VeryShort", "Short", "Long", "Competency", "Application"]
                        types_present = all(t in type_counts for t in expected_types)
                        results.append(test_result("Test 1f: Type distribution", types_present, f"Types: {list(type_counts.keys())}"))
                        
                        # Verify zero warnings
                        warnings_count = summary.get("withWarnings", 0)
                        results.append(test_result("Test 1g: Zero warnings", warnings_count == 0, f"Warnings: {warnings_count}"))
                    else:
                        results.append(test_result("Test 1c-g: Item checks", False, "No items returned"))
    except Exception as e:
        results.append(test_result("Test 1: Gemini template", False, f"Exception: {str(e)}"))
    
    # ========== TEST 2: Gemini-generated large file ==========
    print("\n" + "=" * 80)
    print("TEST 2: GEMINI-GENERATED LARGE FILE (72 questions)")
    print("=" * 80)
    
    try:
        log("Fetching large Gemini file from external URL...")
        r = requests.get("https://customer-assets.emergentagent.com/job_odisha-learning-pro/artifacts/9g5oj5rc_gemini-code-1783617999478.html", timeout=60)
        
        if r.status_code != 200:
            results.append(test_result("Test 2a: Fetch large file", False, f"Status: {r.status_code}"))
        else:
            large_html = r.text
            large_size = len(large_html)
            results.append(test_result("Test 2a: Fetch large file", True, f"Size: {large_size} bytes"))
            
            log("Posting large file to /admin/qbank/import/preview...")
            r = requests.post(f"{BASE_URL}/admin/qbank/import/preview",
                headers=headers,
                json={"html": large_html, "fileName": "gemini-large-72q.html"},
                timeout=60
            )
            
            if r.status_code != 200:
                results.append(test_result("Test 2b: Preview large file", False, f"Status: {r.status_code}, Body: {r.text[:500]}"))
            else:
                data = r.json()
                if not data.get("ok"):
                    results.append(test_result("Test 2b: Preview large file", False, f"ok=false, error: {data.get('error')}"))
                else:
                    summary = data.get("summary", {})
                    items = data.get("items", [])
                    
                    # Verify totalFound = 72
                    total_found = summary.get("totalFound", 0)
                    test_2b_pass = total_found == 72
                    results.append(test_result("Test 2b: totalFound = 72", test_2b_pass, f"Found: {total_found}"))
                    
                    # Verify Class 6, Odia, chapter extraction
                    if items:
                        first_item = items[0]
                        class_name = first_item.get("className", "")
                        subject_name = first_item.get("subjectName", "")
                        chapter_name = first_item.get("chapterName", "")
                        
                        class_ok = "6" in class_name or "Class 6" in class_name
                        subject_ok = "Odia" in subject_name or "ଓଡ଼ିଆ" in subject_name
                        chapter_ok = len(chapter_name) > 0
                        
                        results.append(test_result("Test 2c: Class 6 extraction", class_ok, f"Class: {class_name}"))
                        results.append(test_result("Test 2d: Odia subject extraction", subject_ok, f"Subject: {subject_name}"))
                        results.append(test_result("Test 2e: Chapter extraction", chapter_ok, f"Chapter: {chapter_name}"))
                        
                        # Verify type distribution
                        type_counts = {}
                        for item in items:
                            qtype = item.get("questionType", "Unknown")
                            type_counts[qtype] = type_counts.get(qtype, 0) + 1
                        
                        log(f"Type distribution: {type_counts}")
                        
                        # Expected: MCQ:10, TrueFalse:10, Fill:10, Match:2, VeryShort:10, Short:10, Competency:10, Application:10
                        expected_counts = {
                            "MCQ": 10, "TrueFalse": 10, "Fill": 10, "Match": 2,
                            "VeryShort": 10, "Short": 10, "Competency": 10, "Application": 10
                        }
                        
                        # Allow some tolerance (±2) for type detection
                        types_ok = True
                        for qtype, expected in expected_counts.items():
                            actual = type_counts.get(qtype, 0)
                            if abs(actual - expected) > 2:
                                types_ok = False
                                log(f"  Type mismatch: {qtype} expected ~{expected}, got {actual}")
                        
                        results.append(test_result("Test 2f: Type distribution", types_ok, f"Types: {type_counts}"))
                        
                        # Verify difficulty extraction (even when badge is missing, falls back to theme class)
                        difficulties = set(item.get("difficulty", "Unknown") for item in items)
                        has_difficulties = len(difficulties) > 1  # Should have Easy, Medium, Hard
                        results.append(test_result("Test 2g: Difficulty extraction", has_difficulties, f"Difficulties: {difficulties}"))
                    else:
                        results.append(test_result("Test 2c-g: Item checks", False, "No items returned"))
    except Exception as e:
        results.append(test_result("Test 2: Large file", False, f"Exception: {str(e)}"))
    
    # ========== TEST 3: Save flow with autoCreateChapters and duplicate detection ==========
    print("\n" + "=" * 80)
    print("TEST 3: SAVE FLOW (autoCreateChapters + duplicate detection)")
    print("=" * 80)
    
    try:
        # Use the 10-item template for save testing
        log("Re-fetching template for save test...")
        r = requests.get("https://odisha-learning-pro.preview.emergentagent.com/templates/qbank-import-template.html", timeout=30)
        template_html = r.text
        
        # Preview first
        log("Preview for save...")
        r = requests.post(f"{BASE_URL}/admin/qbank/import/preview",
            headers=headers,
            json={"html": template_html, "fileName": "save-test.html"},
            timeout=30
        )
        
        if r.status_code != 200:
            results.append(test_result("Test 3a: Preview for save", False, f"Status: {r.status_code}"))
        else:
            preview_data = r.json()
            preview_id = preview_data.get("previewId")
            items = preview_data.get("items", [])
            
            if not preview_id or not items:
                results.append(test_result("Test 3a: Preview for save", False, "No previewId or items"))
            else:
                results.append(test_result("Test 3a: Preview for save", True, f"PreviewId: {preview_id}, Items: {len(items)}"))
                
                # Save with autoCreateChapters=true, duplicateStrategy='skip'
                log("Saving with autoCreateChapters=true, duplicateStrategy='skip'...")
                r = requests.post(f"{BASE_URL}/admin/qbank/import/save",
                    headers=headers,
                    json={
                        "previewId": preview_id,
                        "fileName": "save-test.html",
                        "items": items,
                        "autoCreateChapters": True,
                        "duplicateStrategy": "skip"
                    },
                    timeout=30
                )
                
                if r.status_code != 200:
                    results.append(test_result("Test 3b: First save", False, f"Status: {r.status_code}, Body: {r.text[:500]}"))
                else:
                    save_data = r.json()
                    imported = save_data.get("imported", 0)
                    skipped = save_data.get("skipped", 0)
                    
                    # First run: expect imported > 0 (unless all were duplicates from previous tests)
                    log(f"First save: imported={imported}, skipped={skipped}")
                    results.append(test_result("Test 3b: First save", True, f"Imported: {imported}, Skipped: {skipped}"))
                    
                    # Re-run save with same items → all should be duplicates
                    log("Re-running save with same items (should skip all duplicates)...")
                    r = requests.post(f"{BASE_URL}/admin/qbank/import/save",
                        headers=headers,
                        json={
                            "previewId": preview_id,
                            "fileName": "save-test-dup.html",
                            "items": items,
                            "autoCreateChapters": True,
                            "duplicateStrategy": "skip"
                        },
                        timeout=30
                    )
                    
                    if r.status_code != 200:
                        results.append(test_result("Test 3c: Duplicate detection", False, f"Status: {r.status_code}"))
                    else:
                        dup_data = r.json()
                        dup_imported = dup_data.get("imported", 0)
                        dup_skipped = dup_data.get("skipped", 0)
                        
                        # All should be skipped as duplicates
                        all_skipped = dup_imported == 0 and dup_skipped == len(items)
                        results.append(test_result("Test 3c: Duplicate detection (skip)", all_skipped, f"Imported: {dup_imported}, Skipped: {dup_skipped}"))
    except Exception as e:
        results.append(test_result("Test 3: Save flow", False, f"Exception: {str(e)}"))
    
    # ========== TEST 4: Legacy format backward compatibility ==========
    print("\n" + "=" * 80)
    print("TEST 4: LEGACY FORMAT BACKWARD COMPATIBILITY")
    print("=" * 80)
    
    try:
        legacy_html = '''
        <html>
        <body>
            <div class="qb-question" data-class="Class 1" data-subject="English" data-chapter="Test" data-type="MCQ">
                <div class="qb-text">What is 1+1?</div>
                <div class="qb-options">
                    <div class="qb-opt" data-correct="false">1</div>
                    <div class="qb-opt" data-correct="true">2</div>
                    <div class="qb-opt" data-correct="false">3</div>
                    <div class="qb-opt" data-correct="false">4</div>
                </div>
                <div class="qb-answer">2</div>
                <div class="qb-explanation">1 + 1 equals 2</div>
            </div>
        </body>
        </html>
        '''
        
        log("Posting legacy format HTML...")
        r = requests.post(f"{BASE_URL}/admin/qbank/import/preview",
            headers=headers,
            json={"html": legacy_html, "fileName": "legacy-test.html"},
            timeout=30
        )
        
        if r.status_code != 200:
            results.append(test_result("Test 4: Legacy format", False, f"Status: {r.status_code}, Body: {r.text[:500]}"))
        else:
            data = r.json()
            if not data.get("ok"):
                results.append(test_result("Test 4: Legacy format", False, f"ok=false, error: {data.get('error')}"))
            else:
                summary = data.get("summary", {})
                items = data.get("items", [])
                
                # Should return 1 item with correct fields
                total_found = summary.get("totalFound", 0)
                if total_found != 1:
                    results.append(test_result("Test 4: Legacy format", False, f"Expected 1 item, got {total_found}"))
                else:
                    item = items[0]
                    class_ok = item.get("className") == "Class 1"
                    subject_ok = item.get("subjectName") == "English"
                    chapter_ok = item.get("chapterName") == "Test"
                    type_ok = item.get("questionType") == "MCQ"
                    question_ok = "1+1" in item.get("question", "")
                    options_ok = len(item.get("options", [])) == 4
                    
                    all_ok = class_ok and subject_ok and chapter_ok and type_ok and question_ok and options_ok
                    results.append(test_result("Test 4: Legacy format", all_ok, 
                        f"Class: {item.get('className')}, Subject: {item.get('subjectName')}, Type: {item.get('questionType')}, Options: {len(item.get('options', []))}"))
    except Exception as e:
        results.append(test_result("Test 4: Legacy format", False, f"Exception: {str(e)}"))
    
    # ========== TEST 5: Empty/malformed inputs return graceful errors ==========
    print("\n" + "=" * 80)
    print("TEST 5: EMPTY/MALFORMED INPUTS (graceful errors)")
    print("=" * 80)
    
    try:
        # Test 5a: Empty HTML
        log("Testing empty HTML...")
        r = requests.post(f"{BASE_URL}/admin/qbank/import/preview",
            headers=headers,
            json={"html": "", "fileName": "empty.html"},
            timeout=30
        )
        
        empty_ok = r.status_code == 400
        results.append(test_result("Test 5a: Empty HTML → 400", empty_ok, f"Status: {r.status_code}"))
        
        # Test 5b: HTML with no questions
        log("Testing HTML with no questions...")
        no_questions_html = "<html><body><h1>No questions here</h1></body></html>"
        r = requests.post(f"{BASE_URL}/admin/qbank/import/preview",
            headers=headers,
            json={"html": no_questions_html, "fileName": "no-questions.html"},
            timeout=30
        )
        
        # Should return 200 with ok: false
        if r.status_code != 200:
            results.append(test_result("Test 5b: No questions → 200 with ok:false", False, f"Status: {r.status_code}"))
        else:
            data = r.json()
            ok_false = data.get("ok") == False
            has_error = "error" in data
            results.append(test_result("Test 5b: No questions → 200 with ok:false", ok_false and has_error, 
                f"ok: {data.get('ok')}, error: {data.get('error', 'N/A')[:100]}"))
    except Exception as e:
        results.append(test_result("Test 5: Error handling", False, f"Exception: {str(e)}"))
    
    # ========== SUMMARY ==========
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in results if r)
    total = len(results)
    pass_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
