import sys
sys.path.insert(0, '/app')
from lib.mongodb import getDb
import asyncio

async def check():
    db = await getDb()
    
    # Count AE items
    total = await db.tobItems.count_documents({'class': '5', 'subject_id': 'AE'})
    print(f"Total Class 5 AE items in DB: {total}")
    
    # Count by status
    published = await db.tobItems.count_documents({'class': '5', 'subject_id': 'AE', 'status': 'published'})
    draft = await db.tobItems.count_documents({'class': '5', 'subject_id': 'AE', 'status': 'draft'})
    print(f"  Published: {published}")
    print(f"  Draft: {draft}")
    
    # Count by type
    chapters = await db.tobItems.count_documents({'class': '5', 'subject_id': 'AE', 'type': 'chapter'})
    sets = await db.tobItems.count_documents({'class': '5', 'subject_id': 'AE', 'type': 'set'})
    registers = await db.tobItems.count_documents({'class': '5', 'subject_id': 'AE', 'type': 'register'})
    print(f"  Chapters: {chapters}")
    print(f"  Sets: {sets}")
    print(f"  Registers: {registers}")
    
    # Get a sample item
    sample = await db.tobItems.find_one({'class': '5', 'subject_id': 'AE'})
    if sample:
        print(f"\nSample item:")
        print(f"  id: {sample.get('id')}")
        print(f"  type: {sample.get('type')}")
        print(f"  status: {sample.get('status')}")
        print(f"  title: {sample.get('title', 'N/A')[:50]}")
        print(f"  marks: {sample.get('marks')}")
        print(f"  subject_printed: {sample.get('subject_printed')}")

asyncio.run(check())
