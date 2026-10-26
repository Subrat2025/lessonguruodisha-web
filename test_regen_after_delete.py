#!/usr/bin/env python3
import requests

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

PREMIUM_USER_MOBILE = "9999900001"
PREMIUM_USER_PASSWORD = "<redacted>"

def login(mobile, password):
    resp = requests.post(f"{API_BASE}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
    return resp.json().get("token")

token = login(PREMIUM_USER_MOBILE, PREMIUM_USER_PASSWORD)

# Try to regenerate the document with deleted payload
doc_id = "LG-LP-20260809-CAMQSR"

resp = requests.post(
    f"{API_BASE}/lesson-plans/documents/{doc_id}/regenerate",
    headers={"Authorization": f"Bearer {token}"},
    timeout=30
)

print(f"Status: {resp.status_code}")
print(f"Response: {resp.json()}")
