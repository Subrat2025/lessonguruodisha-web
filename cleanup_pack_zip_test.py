#!/usr/bin/env python3
"""
Cleanup script for Assessment Store Pack ZIP Download test
- Reset uploaded document (clear cld fields)
- Delete test pack_jobs
- Verify final state
"""

import requests
import sys

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Document to reset
DOC_ID = "9f927990-ff23-49a8-aacf-5d6b6aabad48"

def admin_login():
    """Login as admin"""
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "mobile": ADMIN_MOBILE,
        "password": ADMIN_PASSWORD
    }, timeout=30)
    if resp.status_code == 200:
        return resp.json().get("token")
    return None

def reset_document(admin_token):
    """Reset document by clearing cld fields"""
    print(f"\n1. Resetting document {DOC_ID}...")
    
    # Get current document state
    resp = requests.get(f"{API_BASE}/admin/assess/documents",
                       headers={"Authorization": f"Bearer {admin_token}"},
                       params={"q": DOC_ID},
                       timeout=30)
    
    if resp.status_code != 200:
        print(f"   ❌ Failed to get document: {resp.status_code}")
        return False
    
    docs = resp.json().get("documents", [])
    doc = next((d for d in docs if d["id"] == DOC_ID), None)
    
    if not doc:
        print(f"   ❌ Document not found")
        return False
    
    print(f"   Current state: cld_public_id={doc.get('cld_public_id', 'NONE')[:50]}")
    
    # Clear cld fields by updating document
    # Note: The PUT endpoint doesn't support clearing cld fields directly
    # We would need to use MongoDB directly or delete and recreate
    # For now, we'll just report the state
    
    print(f"   ⚠️  Document has file attached. Manual cleanup needed:")
    print(f"      - cld_public_id: {doc.get('cld_public_id')}")
    print(f"      - To reset: Use MongoDB to set cld_public_id=null, cld_version=null, bytes=0")
    
    return True

def get_overview(admin_token):
    """Get overview stats"""
    resp = requests.get(f"{API_BASE}/admin/assess/overview",
                       headers={"Authorization": f"Bearer {admin_token}"},
                       timeout=30)
    
    if resp.status_code == 200:
        data = resp.json()
        return {
            "docs": data.get("docs", 0),
            "docsWithFile": data.get("docsWithFile", 0)
        }
    return None

def main():
    print("="*80)
    print("Assessment Store Pack ZIP Download - Cleanup")
    print("="*80)
    
    admin_token = admin_login()
    if not admin_token:
        print("❌ Admin login failed")
        sys.exit(1)
    
    print("✅ Admin login successful")
    
    # Get initial state
    print("\n2. Getting initial state...")
    initial_stats = get_overview(admin_token)
    if initial_stats:
        print(f"   Total docs: {initial_stats['docs']}")
        print(f"   Docs with file: {initial_stats['docsWithFile']}")
    
    # Reset document
    reset_document(admin_token)
    
    # Get final state
    print("\n3. Getting final state...")
    final_stats = get_overview(admin_token)
    if final_stats:
        print(f"   Total docs: {final_stats['docs']}")
        print(f"   Docs with file: {final_stats['docsWithFile']}")
    
    print("\n" + "="*80)
    print("CLEANUP SUMMARY")
    print("="*80)
    print(f"Document ID: {DOC_ID}")
    print(f"Status: File attached, manual cleanup needed")
    print(f"\nTest pack_jobs: Need MongoDB access to delete")
    print(f"  - Use: db.assess_pack_jobs.deleteMany({{user_id: {{$in: [...]}}}})")
    print(f"\nFinal state:")
    print(f"  - Total docs: {final_stats['docs']} (expected: 315)")
    print(f"  - Docs with file: {final_stats['docsWithFile']} (expected: 0 after manual cleanup)")
    print("="*80)

if __name__ == "__main__":
    main()
