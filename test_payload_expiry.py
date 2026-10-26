#!/usr/bin/env python3
"""
Debug test for payload expiry
"""
import requests
import subprocess

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

PREMIUM_USER_MOBILE = "9999900001"
PREMIUM_USER_PASSWORD = "<redacted>"

def login(mobile, password):
    resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.status_code}")
        return None
    return resp.json().get("token")

# Login
token = login(PREMIUM_USER_MOBILE, PREMIUM_USER_PASSWORD)
print(f"✅ Logged in, token: {token[:20]}...")

# Generate a doc
payload = {
    "format": "pdf",
    "innerHtml": "<h1>Payload Expiry Test</h1><p>This document's payload will be deleted.</p>",
    "lesson": {
        "classId": "C1",
        "className": "Class 1",
        "bookId": "B1",
        "bookName": "Odia",
        "chapterId": "Ch1",
        "chapterName": "Chapter 1",
        "period": 99,
        "title": "Payload Expiry Test"
    }
}
resp = requests.post(
    f"{API_BASE}/lesson-plans/secure-download",
    json=payload,
    headers={"Authorization": f"Bearer {token}"},
    timeout=60
)
print(f"Generate response: {resp.status_code}")
doc_id = resp.json().get("documentId")
print(f"✅ Generated doc: {doc_id}")

# Check if payload exists BEFORE deletion
mongo_check_before = f"""
use edumaster_odisha;
db.lesson_plan_document_payloads.findOne({{ documentId: '{doc_id}' }});
"""
result = subprocess.run(
    ["mongosh", "--quiet", "--eval", mongo_check_before],
    capture_output=True,
    text=True,
    timeout=10
)
print(f"Payload BEFORE deletion:\n{result.stdout}")

# Delete the payload
mongo_delete = f"""
use edumaster_odisha;
db.lesson_plan_document_payloads.deleteOne({{ documentId: '{doc_id}' }});
"""
result = subprocess.run(
    ["mongosh", "--quiet", "--eval", mongo_delete],
    capture_output=True,
    text=True,
    timeout=10
)
print(f"Delete result:\n{result.stdout}")

# Check if payload exists AFTER deletion
mongo_check_after = f"""
use edumaster_odisha;
db.lesson_plan_document_payloads.findOne({{ documentId: '{doc_id}' }});
"""
result = subprocess.run(
    ["mongosh", "--quiet", "--eval", mongo_check_after],
    capture_output=True,
    text=True,
    timeout=10
)
print(f"Payload AFTER deletion:\n{result.stdout}")

# Try to regenerate
resp = requests.post(
    f"{API_BASE}/lesson-plans/documents/{doc_id}/regenerate",
    headers={"Authorization": f"Bearer {token}"},
    timeout=30
)
print(f"\nRegenerate response: {resp.status_code}")
print(f"Response body: {resp.json()}")
