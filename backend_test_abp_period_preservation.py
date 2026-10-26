#!/usr/bin/env python3
"""
ABP Enhancement Test — Re-import PRESERVES period IDs (teacher "taught" marks survive)

Tests that re-uploading the same ABP zip in "update" mode now PRESERVES period IDs
so teacher "taught" marks (abpProgress keyed by periodId) survive the re-import.

Environment: PREVIEW only
Base URL: from .env NEXT_PUBLIC_BASE_URL
Admin: 9692604577 / Subrat@909e
Test zip: /tmp/o.zip (Class 1 Odia, ~30 chapters)
"""

import os
import sys
import json
import time
import requests
from pathlib import Path

# Read environment
env_path = Path("/app/.env")
env_vars = {}
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            env_vars[key.strip()] = val.strip().strip('"')

BASE_URL = env_vars.get("NEXT_PUBLIC_BASE_URL", "https://odisha-learning-pro.preview.emergentagent.com")
API_BASE = f"{BASE_URL}/api"

# Admin credentials
ADMIN_MOBILE = "9692604577"
ADMIN_PASSWORD = "Subrat@909e"

# Test zip file
ZIP_FILE = "/tmp/o.zip"

def log(msg):
    print(f"[ABP-PERIOD-TEST] {msg}", flush=True)

def login_admin():
    """Login as admin and return Bearer token"""
    log("Logging in as admin...")
    resp = requests.post(
        f"{API_BASE}/auth/login",
        json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
        timeout=30
    )
    if resp.status_code != 200:
        log(f"❌ Admin login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    data = resp.json()
    token = data.get("token")
    if not token:
        log(f"❌ No token in login response: {data}")
        sys.exit(1)
    log(f"✅ Admin logged in successfully")
    return token

def get_class1_odia_chapters(token):
    """Get all Class 1 Odia chapters"""
    log("Fetching Class 1 Odia chapters...")
    resp = requests.get(
        f"{API_BASE}/abp/admin/chapters",
        params={"class": "1"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30
    )
    if resp.status_code != 200:
        log(f"❌ Failed to fetch chapters: {resp.status_code} {resp.text}")
        return []
    data = resp.json()
    chapters = data.get("chapters", [])
    # Filter for Odia subject (ଓଡ଼ିଆ)
    odia_chapters = [c for c in chapters if c.get("subject") == "ଓଡ଼ିଆ"]
    log(f"✅ Found {len(odia_chapters)} Class 1 Odia chapters")
    return odia_chapters

def get_chapter_detail(token, chapter_id):
    """Get chapter detail with periods"""
    log(f"Fetching chapter detail for {chapter_id}...")
    resp = requests.get(
        f"{API_BASE}/abp/chapters/{chapter_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30
    )
    if resp.status_code != 200:
        log(f"❌ Failed to fetch chapter detail: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    chapter = data.get("chapter")
    periods = data.get("periods", [])
    log(f"✅ Chapter has {len(periods)} periods")
    return {"chapter": chapter, "periods": periods}

def mark_period_taught(token, chapter_id, period_id, taught=True):
    """Mark a period as taught"""
    log(f"Marking period {period_id} as taught={taught}...")
    resp = requests.post(
        f"{API_BASE}/abp/chapters/{chapter_id}/taught",
        json={"periodId": period_id, "taught": taught},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30
    )
    if resp.status_code != 200:
        log(f"❌ Failed to mark period taught: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Period marked as taught={taught}")
    return True

def get_chapter_progress(token, chapter_id):
    """Get chapter progress (taught periods)"""
    log(f"Fetching chapter progress for {chapter_id}...")
    resp = requests.get(
        f"{API_BASE}/abp/chapters/{chapter_id}/progress",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30
    )
    if resp.status_code != 200:
        log(f"❌ Failed to fetch progress: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    taught = data.get("taught", [])
    log(f"✅ Progress: {len(taught)} periods taught")
    return taught

def reimport_zip(token, zip_path, class_num, subject, book=""):
    """Re-import the same zip in update mode"""
    log(f"Re-importing zip: {zip_path} (class={class_num}, subject={subject}, mode=update)...")
    
    if not os.path.exists(zip_path):
        log(f"❌ Zip file not found: {zip_path}")
        return None
    
    with open(zip_path, "rb") as f:
        files = {"file": (os.path.basename(zip_path), f, "application/zip")}
        data = {
            "mode": "update",
            "class": str(class_num),
            "subject": subject,
            "book": book
        }
        
        resp = requests.post(
            f"{API_BASE}/abp/admin/import",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {token}"},
            timeout=60
        )
    
    if resp.status_code != 200:
        log(f"❌ Import failed: {resp.status_code} {resp.text}")
        return None
    
    result = resp.json()
    job_id = result.get("jobId")
    if not job_id:
        log(f"❌ No jobId in import response: {result}")
        return None
    
    log(f"✅ Import started, jobId: {job_id}")
    return job_id

def poll_import_job(token, job_id, max_wait=90):
    """Poll import job until done or timeout"""
    log(f"Polling import job {job_id} (max {max_wait}s)...")
    start = time.time()
    
    while time.time() - start < max_wait:
        resp = requests.get(
            f"{API_BASE}/abp/admin/import/jobs/{job_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ Failed to fetch job status: {resp.status_code} {resp.text}")
            return None
        
        data = resp.json()
        job = data.get("job")
        if not job:
            log(f"❌ No job in response: {data}")
            return None
        
        status = job.get("status")
        log(f"  Job status: {status} (done: {job.get('done', 0)}/{job.get('total', 0)})")
        
        if status == "done":
            log(f"✅ Import job completed")
            return job
        
        if status == "error":
            log(f"❌ Import job failed: {job.get('fatalError', 'unknown error')}")
            return None
        
        time.sleep(2)
    
    log(f"❌ Import job timed out after {max_wait}s")
    return None

def run_test():
    """Main test flow"""
    log("=" * 80)
    log("ABP ENHANCEMENT TEST — Re-import PRESERVES period IDs")
    log("=" * 80)
    
    # Step 1: Login
    token = login_admin()
    
    # Step 2: Get Class 1 Odia chapters
    chapters = get_class1_odia_chapters(token)
    if not chapters:
        log("❌ No Class 1 Odia chapters found")
        return False
    
    # Find a chapter with >= 2 periods
    target_chapter = None
    for ch in chapters:
        detail = get_chapter_detail(token, ch["id"])
        if detail and len(detail["periods"]) >= 2:
            target_chapter = detail
            break
    
    if not target_chapter:
        log("❌ No chapter with >= 2 periods found")
        return False
    
    chapter = target_chapter["chapter"]
    periods = target_chapter["periods"]
    chapter_id = chapter["id"]
    
    log(f"\n📚 Selected chapter: {chapter.get('title', 'Unknown')} (ID: {chapter_id})")
    log(f"   Number: {chapter.get('number')}, Periods: {len(periods)}")
    
    # Step 3: Record original period IDs
    log("\n📝 Recording original period IDs...")
    original_periods = {}
    for p in periods:
        period_num = p.get("number")
        period_id = p.get("id")
        original_periods[period_num] = period_id
        log(f"   Period {period_num}: {period_id}")
    
    if len(original_periods) < 2:
        log("❌ Need at least 2 periods")
        return False
    
    # Step 4: Mark first period as taught
    first_period = periods[0]
    first_period_id = first_period["id"]
    first_period_num = first_period["number"]
    
    log(f"\n✏️ Marking period {first_period_num} (ID: {first_period_id}) as taught...")
    if not mark_period_taught(token, chapter_id, first_period_id, taught=True):
        log("❌ Failed to mark period as taught")
        return False
    
    # Verify taught mark
    taught_before = get_chapter_progress(token, chapter_id)
    if not taught_before or first_period_id not in taught_before:
        log(f"❌ Period {first_period_id} not in taught list: {taught_before}")
        return False
    
    log(f"✅ Confirmed period {first_period_id} is marked as taught")
    
    # Step 5: Re-import the same zip in update mode
    log(f"\n🔄 Re-importing zip file...")
    job_id = reimport_zip(token, ZIP_FILE, class_num=1, subject="ଓଡ଼ିଆ", book="")
    if not job_id:
        log("❌ Failed to start import")
        return False
    
    # Step 6: Poll until import completes
    job = poll_import_job(token, job_id, max_wait=90)
    if not job:
        log("❌ Import job did not complete successfully")
        return False
    
    # Step 7: Verify import stats
    imported = job.get("imported", {})
    updated = imported.get("updated", 0)
    new = imported.get("new", 0)
    duplicates = imported.get("duplicates", 0)
    
    log(f"\n📊 Import stats:")
    log(f"   Updated: {updated}")
    log(f"   New: {new}")
    log(f"   Duplicates: {duplicates}")
    
    if updated < 25:  # Expect ~30 chapters updated
        log(f"⚠️ Warning: Expected ~30 updated, got {updated}")
    
    if new != 0:
        log(f"❌ FAIL: Expected 0 new chapters, got {new}")
        return False
    
    if duplicates != 0:
        log(f"❌ FAIL: Expected 0 duplicates, got {duplicates}")
        return False
    
    log(f"✅ Import stats look good (updated={updated}, new=0, duplicates=0)")
    
    # Step 8: CORE ASSERTION A - Verify period IDs are preserved
    log(f"\n🔍 CORE ASSERTION A: Verifying period IDs are preserved...")
    detail_after = get_chapter_detail(token, chapter_id)
    if not detail_after:
        log("❌ Failed to fetch chapter detail after import")
        return False
    
    periods_after = detail_after["periods"]
    assertion_a_pass = True
    
    for p in periods_after:
        period_num = p.get("number")
        period_id = p.get("id")
        original_id = original_periods.get(period_num)
        
        if original_id:
            if period_id == original_id:
                log(f"   ✅ Period {period_num}: ID preserved ({period_id})")
            else:
                log(f"   ❌ Period {period_num}: ID CHANGED! Original: {original_id}, New: {period_id}")
                assertion_a_pass = False
        else:
            log(f"   ℹ️ Period {period_num}: New period (ID: {period_id})")
    
    if not assertion_a_pass:
        log("❌ FAIL: CORE ASSERTION A - Period IDs were NOT preserved")
        return False
    
    log("✅ PASS: CORE ASSERTION A - All period IDs preserved")
    
    # Step 9: CORE ASSERTION B - Verify taught mark survived
    log(f"\n🔍 CORE ASSERTION B: Verifying taught mark survived...")
    taught_after = get_chapter_progress(token, chapter_id)
    
    if not taught_after:
        log(f"❌ FAIL: No taught periods after import")
        return False
    
    if first_period_id not in taught_after:
        log(f"❌ FAIL: Period {first_period_id} NOT in taught list after import")
        log(f"   Taught before: {taught_before}")
        log(f"   Taught after: {taught_after}")
        return False
    
    log(f"✅ PASS: CORE ASSERTION B - Taught mark survived (period {first_period_id} still in taught list)")
    
    # Step 10: Sanity check - total chapter count
    log(f"\n🔍 Sanity check: Verifying total Class 1 Odia chapter count...")
    chapters_after = get_class1_odia_chapters(token)
    if len(chapters_after) != len(chapters):
        log(f"⚠️ Warning: Chapter count changed from {len(chapters)} to {len(chapters_after)}")
    else:
        log(f"✅ Chapter count unchanged: {len(chapters_after)}")
    
    # Step 11: Cleanup - remove taught mark
    log(f"\n🧹 Cleanup: Removing test taught mark...")
    if not mark_period_taught(token, chapter_id, first_period_id, taught=False):
        log("⚠️ Warning: Failed to remove taught mark (non-fatal)")
    else:
        log("✅ Taught mark removed")
    
    # Final verification
    taught_final = get_chapter_progress(token, chapter_id)
    if taught_final and first_period_id in taught_final:
        log(f"⚠️ Warning: Period {first_period_id} still in taught list after cleanup")
    else:
        log(f"✅ Cleanup verified: period {first_period_id} removed from taught list")
    
    log("\n" + "=" * 80)
    log("✅ ALL TESTS PASSED")
    log("=" * 80)
    log("\nSummary:")
    log(f"  ✅ CORE ASSERTION A: Period IDs preserved (byte-identical)")
    log(f"  ✅ CORE ASSERTION B: Taught mark survived re-import")
    log(f"  ✅ Import stats: {updated} updated, 0 new, 0 duplicates")
    log(f"  ✅ Cleanup: Test taught mark removed")
    
    return True

if __name__ == "__main__":
    try:
        success = run_test()
        sys.exit(0 if success else 1)
    except Exception as e:
        log(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
