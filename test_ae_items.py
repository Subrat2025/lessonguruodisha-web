import requests
import json

BASE_URL = "https://odisha-learning-pro.preview.emergentagant.com"
API_BASE = f"{BASE_URL}/api"

# Authenticate
response = requests.post(
    f"{API_BASE}/auth/login",
    json={"mobile": "9692604577", "password": "Subrat@909e"},
    timeout=30
)
token = response.json()['token']
headers = {'Authorization': f'Bearer {token}'}

# Get items
print("Getting AE items...")
response = requests.get(
    f"{API_BASE}/tob/items",
    params={'class': '5', 'subject': 'AE'},
    timeout=30
)
print(f"Status: {response.status_code}")
data = response.json()
items = data.get('items', [])
print(f"Total items: {len(items)}")

# Count by type
by_type = {}
for item in items:
    t = item.get('type', 'unknown')
    by_type[t] = by_type.get(t, 0) + 1

print(f"By type: {by_type}")

# Check first item marks
if items:
    print(f"\nFirst item:")
    print(f"  id: {items[0].get('id')}")
    print(f"  type: {items[0].get('type')}")
    print(f"  title: {items[0].get('title', 'N/A')[:50]}")
    print(f"  marks: {items[0].get('marks')}")
    print(f"  term: {items[0].get('term')}")

# Get admin items to check validation
print("\n\nGetting admin items...")
response = requests.get(
    f"{API_BASE}/tob/admin/items",
    params={'class': '5', 'subject': 'AE'},
    headers=headers,
    timeout=30
)
print(f"Status: {response.status_code}")
data = response.json()
items = data.get('items', [])
print(f"Total admin items: {len(items)}")

# Check validation status
by_status = {}
for item in items:
    validation = item.get('validation', {})
    status = validation.get('status', 'unknown')
    by_status[status] = by_status.get(status, 0) + 1

print(f"By validation status: {by_status}")
