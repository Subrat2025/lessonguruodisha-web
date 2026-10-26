#!/usr/bin/env python3
"""
Re-test pack secure-download scenarios after fix.
Previous issue: 500 error when downloading chapter owned ONLY via pack (no direct entitlement).
Fix: Server now lazily creates direct entitlement for pack-covered chapters via ensureEntitlement().
"""

import requests
import sys
import json

BASE = "https://odisha-learning-pro.preview.emergentagent.com/api"
TEST_BUYER = {"mobile": "8000000001", "password": "<redacted>"}

def login(mobile, password):
    """Login and return Bearer token"""
    r = requests.post(f"{BASE}/auth/login", json={"mobile": mobile, "password": password})
    if r.status_code != 200:
        print(f"❌ Login failed: {r.status_code} {r.text}")
        sys.exit(1)
    token = r.json().get("token")
    print(f"✅ Logged in as {mobile}")
    return token

def get_library(token):
    """Get library items"""
    r = requests.get(f"{BASE}/store/library", headers={"Authorization": f"Bearer {token}"})
    if r.status_code != 200:
        print(f"❌ Library fetch failed: {r.status_code}")
        return []
    return r.json().get("items", [])

def get_chapters(cls, subject, token=None):
    """Get chapters for class and subject"""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.get(f"{BASE}/store/unit-tests/chapters?cls={cls}&subjectKey={subject}", headers=headers)
    if r.status_code != 200:
        print(f"❌ Chapters fetch failed: {r.status_code}")
        return []
    return r.json().get("chapters", [])

def get_subjects(cls):
    """Get subjects for class"""
    r = requests.get(f"{BASE}/store/unit-tests/subjects?cls={cls}")
    if r.status_code != 200:
        print(f"❌ Subjects fetch failed: {r.status_code}")
        return None, []
    data = r.json()
    return data.get("classPack"), data.get("subjects", [])

def test_buy_pack(token, product_id):
    """Test-buy a pack"""
    r = requests.post(f"{BASE}/store/checkout/test", 
                     json={"productIds": [product_id]},
                     headers={"Authorization": f"Bearer {token}"})
    if r.status_code != 200:
        print(f"❌ Test purchase failed: {r.status_code} {r.text}")
        return None
    return r.json().get("orderId")

def secure_download_flow(token, chapter_id, file_id):
    """Full secure download flow: POST token -> GET download"""
    # Step 1: Get token
    r1 = requests.post(f"{BASE}/store/file/{chapter_id}/{file_id}/token?action=download",
                      headers={"Authorization": f"Bearer {token}"})
    if r1.status_code != 200:
        return {"step": "token", "status": r1.status_code, "error": r1.text}
    
    token_data = r1.json()
    dl_token = token_data.get("token")
    
    # Step 2: Download with token
    r2 = requests.get(f"{BASE}/store/download?token={dl_token}",
                     headers={"Authorization": f"Bearer {token}"})
    
    result = {
        "step": "download",
        "token_status": r1.status_code,
        "download_status": r2.status_code,
        "content_type": r2.headers.get("content-type", ""),
        "size": len(r2.content) if r2.status_code == 200 else 0
    }
    
    if r2.status_code != 200:
        result["error"] = r2.text
    
    return result

def main():
    print("=" * 80)
    print("PACK SECURE-DOWNLOAD RE-TEST (after fix)")
    print("=" * 80)
    
    # Login as TEST buyer
    token = login(TEST_BUYER["mobile"], TEST_BUYER["password"])
    
    # Get library to see what packs are owned
    print("\n📚 Fetching library...")
    library = get_library(token)
    print(f"Library has {len(library)} items")
    
    # Find owned packs
    owned_packs = [item for item in library if item.get("product", {}).get("type") in ["unit_test_pack"]]
    print(f"Owned packs: {len(owned_packs)}")
    
    # A) SUBJECT PACK DOWNLOADS
    print("\n" + "=" * 80)
    print("A) SUBJECT PACK DOWNLOADS")
    print("=" * 80)
    
    # Find Class 1 Math subject pack
    class_pack_cls1, subjects_cls1 = get_subjects(1)
    math_subject = next((s for s in subjects_cls1 if s.get("subjectKey") == "math"), None)
    
    if not math_subject:
        print("❌ Class 1 Math subject not found")
        sys.exit(1)
    
    subject_pack_id = math_subject.get("pack", {}).get("id")
    print(f"Class 1 Math subject pack ID: {subject_pack_id}")
    
    # Check if buyer owns the pack
    owns_subject_pack = any(item.get("product", {}).get("id") == subject_pack_id for item in library)
    
    if not owns_subject_pack:
        print("⚠️  Buyer doesn't own Class 1 Math subject pack. Test-buying it...")
        order_id = test_buy_pack(token, subject_pack_id)
        if order_id:
            print(f"✅ Test-bought subject pack. Order: {order_id}")
            # Refresh library
            library = get_library(token)
        else:
            print("❌ Failed to test-buy subject pack")
            sys.exit(1)
    else:
        print("✅ Buyer already owns Class 1 Math subject pack")
    
    # Get member chapters
    chapters_cls1_math = get_chapters(1, "math", token)
    print(f"Class 1 Math has {len(chapters_cls1_math)} chapters")
    
    # Filter chapters that are owned via pack (not individually bought)
    # We'll test at least 4 chapters
    # Get files from library
    library_map = {item["product"]["id"]: item["product"]["files"] for item in library if item.get("product", {}).get("type") == "unit_test"}
    
    test_chapters = []
    for ch in chapters_cls1_math:  # Check all chapters
        if ch.get("owned"):
            ch["files"] = library_map.get(ch["id"], [])
            # Check if this chapter has downloads left
            item = next((item for item in library if item.get("product", {}).get("id") == ch["id"]), None)
            if item:
                file_id = ch["files"][0]["id"] if ch["files"] else None
                if file_id:
                    downloads_used = item.get("downloadsUsed", {}).get(file_id, 0)
                    if downloads_used < 5:  # Has downloads left
                        test_chapters.append(ch)
            if len(test_chapters) >= 4:
                break
    
    if len(test_chapters) < 4:
        print(f"⚠️  Only found {len(test_chapters)} owned chapters, need at least 4")
        # Use what we have
    
    print(f"\nTesting {len(test_chapters)} chapters from subject pack:")
    
    subject_pack_results = []
    for i, ch in enumerate(test_chapters, 1):
        chapter_id = ch.get("id")
        chapter_title = ch.get("titleOdia", "")[:30]
        files = ch.get("files", [])
        
        if not files:
            print(f"  {i}. ⚠️  Chapter {chapter_title} has no files")
            continue
        
        file_id = files[0].get("id")
        print(f"  {i}. Testing chapter: {chapter_title}")
        print(f"     Chapter ID: {chapter_id}")
        print(f"     File ID: {file_id}")
        
        result = secure_download_flow(token, chapter_id, file_id)
        subject_pack_results.append({
            "chapter": chapter_title,
            "chapter_id": chapter_id,
            "result": result
        })
        
        if result["download_status"] == 200:
            print(f"     ✅ PASS: Token {result['token_status']}, Download {result['download_status']}, {result['content_type']}, {result['size']} bytes")
        else:
            print(f"     ❌ FAIL: Token {result['token_status']}, Download {result['download_status']}")
            if "error" in result:
                print(f"     Error: {result['error'][:200]}")
    
    # B) CLASS PACK DOWNLOADS
    print("\n" + "=" * 80)
    print("B) CLASS PACK DOWNLOADS")
    print("=" * 80)
    
    # Use the class pack we got earlier
    class_pack_id = class_pack_cls1.get("id") if class_pack_cls1 else None
    
    if not class_pack_id:
        print("❌ Class 1 class pack not found")
    else:
        print(f"Class 1 class pack ID: {class_pack_id}")
        
        # Check if buyer owns the class pack
        owns_class_pack = any(item.get("product", {}).get("id") == class_pack_id for item in library)
        
        if not owns_class_pack:
            print("⚠️  Buyer doesn't own Class 1 class pack. Test-buying it...")
            order_id = test_buy_pack(token, class_pack_id)
            if order_id:
                print(f"✅ Test-bought class pack. Order: {order_id}")
                # Refresh library
                library = get_library(token)
            else:
                print("❌ Failed to test-buy class pack")
        else:
            print("✅ Buyer already owns Class 1 class pack")
        
        # Test chapters from at least 2 different subjects
        # We already tested Math, let's test Odia
        print("\nTesting chapters from 2 different subjects:")
        
        class_pack_results = []
        
        # Test 1 Math chapter - find one with downloads left
        math_ch_with_downloads = None
        for ch in chapters_cls1_math:
            ch["files"] = library_map.get(ch["id"], [])
            if ch.get("owned") and ch["files"]:
                item = next((item for item in library if item.get("product", {}).get("id") == ch["id"]), None)
                if item:
                    file_id = ch["files"][0]["id"]
                    downloads_used = item.get("downloadsUsed", {}).get(file_id, 0)
                    if downloads_used < 5:
                        math_ch_with_downloads = ch
                        break
        
        if math_ch_with_downloads:
            ch = math_ch_with_downloads
            chapter_id = ch.get("id")
            chapter_title = ch.get("titleOdia", "")[:30]
            files = ch.get("files", [])
            
            if files:
                file_id = files[0].get("id")
                print(f"  1. Math chapter: {chapter_title}")
                result = secure_download_flow(token, chapter_id, file_id)
                class_pack_results.append({
                    "subject": "math",
                    "chapter": chapter_title,
                    "result": result
                })
                
                if result["download_status"] == 200:
                    print(f"     ✅ PASS: {result['download_status']}, {result['content_type']}, {result['size']} bytes")
                else:
                    print(f"     ❌ FAIL: {result['download_status']}")
        
        # Test 1 Odia chapter
        chapters_cls1_odia = get_chapters(1, "odia", token)
        if chapters_cls1_odia:
            ch = chapters_cls1_odia[0]
            ch["files"] = library_map.get(ch["id"], [])
            chapter_id = ch.get("id")
            chapter_title = ch.get("titleOdia", "")[:30]
            files = ch.get("files", [])
            
            if files:
                file_id = files[0].get("id")
                print(f"  2. Odia chapter: {chapter_title}")
                result = secure_download_flow(token, chapter_id, file_id)
                class_pack_results.append({
                    "subject": "odia",
                    "chapter": chapter_title,
                    "result": result
                })
                
                if result["download_status"] == 200:
                    print(f"     ✅ PASS: {result['download_status']}, {result['content_type']}, {result['size']} bytes")
                else:
                    print(f"     ❌ FAIL: {result['download_status']}")
    
    # C) RE-CONFIRM: downloadsUsed incremented
    print("\n" + "=" * 80)
    print("C) RE-CONFIRM: downloadsUsed incremented after download")
    print("=" * 80)
    
    # Find a chapter with downloads left
    test_ch_for_increment = None
    for ch in test_chapters:
        item = next((item for item in library if item.get("product", {}).get("id") == ch["id"]), None)
        if item and ch.get("files"):
            file_id = ch["files"][0]["id"]
            downloads_used = item.get("downloadsUsed", {}).get(file_id, 0)
            if downloads_used < 4:  # Leave room for one more download
                test_ch_for_increment = ch
                break
    
    if test_ch_for_increment:
        ch = test_ch_for_increment
        chapter_id = ch.get("id")
        files = ch.get("files", [])
        
        if files:
            file_id = files[0].get("id")
            
            # Get current library
            library_before = get_library(token)
            item_before = next((item for item in library_before if item.get("product", {}).get("id") == chapter_id), None)
            downloads_before = item_before.get("downloadsUsed", {}).get(file_id, 0) if item_before else 0
            
            print(f"Chapter: {ch.get('chapterTitle', '')[:30]}")
            print(f"Downloads before: {downloads_before}")
            
            # Download
            result = secure_download_flow(token, chapter_id, file_id)
            
            if result["download_status"] == 200:
                # Get library again
                library_after = get_library(token)
                item_after = next((item for item in library_after if item.get("product", {}).get("id") == chapter_id), None)
                downloads_after = item_after.get("downloadsUsed", {}).get(file_id, 0) if item_after else 0
                
                print(f"Downloads after: {downloads_after}")
                
                if downloads_after == downloads_before + 1:
                    print("✅ PASS: downloadsUsed incremented by 1")
                else:
                    print(f"❌ FAIL: Expected {downloads_before + 1}, got {downloads_after}")
            else:
                print(f"❌ Download failed: {result['download_status']}")
    else:
        print("⚠️  No chapters with downloads left to test increment")
    
    # D) RE-CONFIRM SECURITY: non-owner gets 404
    print("\n" + "=" * 80)
    print("D) RE-CONFIRM SECURITY: non-owner gets 404")
    print("=" * 80)
    
    # Find a chapter the buyer doesn't own (Class 3 Math)
    chapters_cls3_math = get_chapters(3, "math", token)
    unowned_chapter = None
    
    for ch in chapters_cls3_math:
        if not ch.get("owned"):
            unowned_chapter = ch
            break
    
    if unowned_chapter:
        chapter_id = unowned_chapter.get("id")
        chapter_title = unowned_chapter.get("chapterTitle", "")[:30]
        # Get files from product endpoint
        r = requests.get(f"{BASE}/store/product/{chapter_id}")
        if r.status_code == 200:
            prod = r.json().get("product", {})
            files = prod.get("files", [])
        else:
            files = []
        
        if files:
            file_id = files[0].get("id")
            print(f"Testing unowned chapter: {chapter_title}")
            print(f"Chapter ID: {chapter_id}")
            
            # Try to get token
            r = requests.post(f"{BASE}/store/file/{chapter_id}/{file_id}/token?action=download",
                            headers={"Authorization": f"Bearer {token}"})
            
            if r.status_code == 404:
                print("✅ PASS: Non-owner correctly denied with 404")
            else:
                print(f"❌ FAIL: Expected 404, got {r.status_code}")
        else:
            print(f"⚠️  Chapter {chapter_title} has no files")
    else:
        print("⚠️  Could not find unowned chapter to test security")
    
    # SUMMARY
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    # Count results
    subject_pack_pass = sum(1 for r in subject_pack_results if r["result"]["download_status"] == 200)
    subject_pack_fail = len(subject_pack_results) - subject_pack_pass
    
    print(f"\nA) SUBJECT PACK: {subject_pack_pass}/{len(subject_pack_results)} PASSED")
    if subject_pack_fail > 0:
        print(f"   ❌ {subject_pack_fail} FAILED")
        for r in subject_pack_results:
            if r["result"]["download_status"] != 200:
                print(f"      - {r['chapter']}: {r['result']['download_status']}")
    
    if 'class_pack_results' in locals():
        class_pack_pass = sum(1 for r in class_pack_results if r["result"]["download_status"] == 200)
        class_pack_fail = len(class_pack_results) - class_pack_pass
        print(f"\nB) CLASS PACK: {class_pack_pass}/{len(class_pack_results)} PASSED")
        if class_pack_fail > 0:
            print(f"   ❌ {class_pack_fail} FAILED")
    
    print("\nC) downloadsUsed increment: Tested above")
    print("D) Security (non-owner 404): Tested above")
    
    # Overall result
    all_pass = (subject_pack_fail == 0 and 
                ('class_pack_results' not in locals() or 
                 sum(1 for r in class_pack_results if r["result"]["download_status"] != 200) == 0))
    
    if all_pass:
        print("\n✅ ALL TESTS PASSED - Pack downloads working correctly after fix")
    else:
        print("\n❌ SOME TESTS FAILED - See details above")
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Test script error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
