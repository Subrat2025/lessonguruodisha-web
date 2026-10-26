#!/usr/bin/env python3
"""
Cleanup script for SSO Toolkit frontend testing
Deletes test users and SSO audit/nonce rows from MongoDB
"""

import pymongo
import sys

# MongoDB connection
MONGO_URL = 'mongodb://localhost:27017'
DB_NAME = 'edumaster_odisha'

# Test phone numbers to delete (from test runs)
TEST_PHONES = [
    '9909772626',  # First test run
    '9795382571',  # Second test run
    '9284402423',  # Third test run
    '9605176958',  # Fourth test run
    '9313465503',  # Fifth test run (final)
]

def cleanup():
    client = pymongo.MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    print('=== SSO TOOLKIT TEST DATA CLEANUP ===\n')
    
    # 1. Delete test users
    print('1. Deleting test users...')
    for phone in TEST_PHONES:
        result = db.users.delete_one({'mobile': phone})
        if result.deleted_count > 0:
            print(f'   Deleted user with phone: {phone}')
        else:
            print(f'   No user found with phone: {phone}')
    
    # 2. Delete all sso_nonces (they have TTL anyway, but clean up for testing)
    print('\n2. Deleting sso_nonces...')
    result = db.sso_nonces.delete_many({})
    print(f'   Deleted {result.deleted_count} sso_nonces entries')
    
    # 3. Delete sso_audit entries for test phones (last 4 digits)
    print('\n3. Deleting sso_audit entries for test phones...')
    test_last4 = [phone[-4:] for phone in TEST_PHONES]
    result = db.sso_audit.delete_many({'phoneLast4': {'$in': test_last4}})
    print(f'   Deleted {result.deleted_count} sso_audit entries')
    
    # 4. Delete sso_rate entries (rate limit tracking)
    print('\n4. Deleting sso_rate entries...')
    result = db.sso_rate.delete_many({})
    print(f'   Deleted {result.deleted_count} sso_rate entries')
    
    print('\n=== CLEANUP COMPLETE ===')
    
    client.close()

if __name__ == '__main__':
    try:
        cleanup()
    except Exception as e:
        print(f'ERROR: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
