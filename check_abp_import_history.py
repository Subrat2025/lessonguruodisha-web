#!/usr/bin/env python3
"""Check ABP import job history to see if there were previous successful imports"""

import requests
import json
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

def login_admin():
    resp = requests.post(
        f"{API_BASE}/auth/login",
        json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD},
        timeout=30
    )
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code}")
        return None
    return resp.json().get("token")

def get_import_jobs(token):
    resp = requests.get(
        f"{API_BASE}/abp/admin/import/jobs",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30
    )
    if resp.status_code != 200:
        print(f"Failed to get jobs: {resp.status_code}")
        return []
    return resp.json().get("jobs", [])

token = login_admin()
if token:
    jobs = get_import_jobs(token)
    print(f"\nFound {len(jobs)} import jobs\n")
    
    # Show recent Class 1 Odia imports
    for job in jobs[:10]:
        if job.get("class") == "1" and job.get("subject") == "ଓଡ଼ିଆ":
            print(f"Job ID: {job.get('id')}")
            print(f"  Status: {job.get('status')}")
            print(f"  Mode: {job.get('mode')}")
            print(f"  Created: {job.get('createdAt')}")
            imported = job.get('imported', {})
            print(f"  Imported: updated={imported.get('updated', 0)}, new={imported.get('new', 0)}, duplicates={imported.get('duplicates', 0)}")
            print()
