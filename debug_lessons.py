#!/usr/bin/env python3
"""Debug script to check lessons data"""

import requests

BASE_URL = "https://odisha-learning-pro.preview.emergentagent.com/api"

# Get classes
r = requests.get(f"{BASE_URL}/classes", timeout=30)
classes = r.json()["classes"]
test_class = classes[0]  # Balvatika

# Get books
r = requests.get(f"{BASE_URL}/books?classId={test_class['id']}", timeout=30)
books = r.json()["books"]
test_book = books[0]

# Get chapters
r = requests.get(f"{BASE_URL}/chapters?classId={test_class['id']}&bookId={test_book['id']}", timeout=30)
chapters = r.json()["chapters"]
test_chapter = chapters[0]

print(f"Class: {test_class['name']}")
print(f"Book: {test_book['name']}")
print(f"Chapter: {test_chapter['name']}")
print(f"Chapter ID: {test_chapter['id']}")

# Get lessons
r = requests.get(f"{BASE_URL}/lessons?chapterId={test_chapter['id']}", timeout=30)
lessons = r.json()["lessons"]

print(f"\nTotal lessons: {len(lessons)}")
for i, lesson in enumerate(lessons):
    print(f"{i+1}. ID: {lesson['id']}, Period: {lesson['period']}, Title: {lesson['title']}")
