#!/usr/bin/env python3
"""Debug script to investigate failing tests"""

import requests
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin123"

# Login
resp = requests.post(f"{BASE_URL}/auth/login", json={
    "mobile": ADMIN_MOBILE,
    "password": ADMIN_PASSWORD
}, timeout=30)
token = resp.json()["token"]

# Get the assessment ID from the last test
assessment_id = "5c6f1227-c9bc-421c-908e-9c114fccfd86"

print("="*80)
print("DEBUG 1: Check HTML mode=full for answer key wrapper")
print("="*80)

resp = requests.get(
    f"{BASE_URL}/assessments/{assessment_id}/html?mode=full",
    headers={"Authorization": f"Bearer {token}"},
    timeout=30
)

html = resp.text

# Check for various answer key markers
markers = [
    "<!--LG_ANSWER_KEY_START-->",
    "<!--LG_ANSWER_KEY_END-->",
    '<div id="lg-answer-key">',
    '<div class="answer-key">',
    'answer-key',
    'Answer Key',
    'ଉତ୍ତର'
]

print("\nMarker presence check:")
for marker in markers:
    count = html.count(marker)
    print(f"  {marker}: {'✅ FOUND' if count > 0 else '❌ NOT FOUND'} ({count} occurrences)")

# Save HTML to file for inspection
with open("/tmp/assessment_full.html", "w") as f:
    f.write(html)
print("\n✅ Full HTML saved to /tmp/assessment_full.html")

print("\n" + "="*80)
print("DEBUG 2: Check error for invalid book ID")
print("="*80)

payload = {
    "classId": "06bc2266-ce12-49e7-a40e-b1d05659ee60",
    "bookId": "does-not-exist",
    "chapterIds": ["516d4fa2-4fbb-4eb8-be95-35d965655523"],
    "assessmentType": "fa1",
    "totalMarks": 25,
    "writtenTypes": ["mcq", "fill"],
    "language": "odia"
}

resp = requests.post(
    f"{BASE_URL}/assessments/build",
    json=payload,
    headers={"Authorization": f"Bearer {token}"},
    timeout=30
)

print(f"\nStatus code: {resp.status_code}")
print(f"Response: {json.dumps(resp.json(), indent=2)}")
