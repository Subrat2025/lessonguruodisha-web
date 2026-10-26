#!/usr/bin/env python3
import requests
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Login
print("Logging in...")
resp = requests.post(f"{BASE_URL}/auth/login", json={"mobile": "9999900001", "password": "<redacted>"}, timeout=10)
token = resp.json().get("token")
print(f"Token: {token[:20]}...")

# Test Bx: Cancel when no schedule exists
print("\n--- Test Bx: Cancel when no schedule exists ---")
try:
    resp = requests.post(
        f"{BASE_URL}/subscription/cancel-scheduled-downgrade",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()

# Test Ex: Invalid planId
print("\n--- Test Ex: Invalid planId ---")
try:
    resp = requests.post(
        f"{BASE_URL}/subscription/schedule-downgrade",
        json={"planId": "plan-does-not-exist"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()

# Test Ey: Current plan id
print("\n--- Test Ey: Current plan id ---")
try:
    # Get current plan
    me_resp = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    current_plan = me_resp.json().get("user", {}).get("subscription", {}).get("plan")
    print(f"Current plan: {current_plan}")
    
    resp = requests.post(
        f"{BASE_URL}/subscription/schedule-downgrade",
        json={"planId": current_plan},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()
