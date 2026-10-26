// One-off: create TEST_ accounts + set Answer Key beta-tester list.
// Safe: only upserts TEST_-prefixed users and the 'answer_key' settings doc.
// Does NOT touch lessons, Panchapadi, or any other data. Master switch stays OFF.
import fs from 'fs'
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'crypto'

const env = fs.readFileSync('/app/.env', 'utf8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2] })

const TEST_USERS = [
  { mobile: '8000000001', name: 'TEST_Teacher One', password: 'Test@1234' },
  { mobile: '8000000002', name: 'TEST_Teacher Two', password: 'Test@1234' },
]
const ADMIN_MOBILE = '9692604577'

async function run() {
  const c = new MongoClient(process.env.MONGO_URL)
  await c.connect()
  const db = c.db(process.env.DB_NAME)
  const now = new Date()
  const sub = { plan: 'yearly', startDate: now, expiryDate: new Date(Date.now() + 365 * 864e5), status: 'active' }

  for (const t of TEST_USERS) {
    const existing = await db.collection('users').findOne({ mobile: t.mobile })
    const password = await bcrypt.hash(t.password, 10)
    if (existing) {
      await db.collection('users').updateOne({ mobile: t.mobile }, { $set: { name: t.name, password, role: 'user', subscription: sub, suspended: false } })
      console.log('UPDATED test user', t.mobile)
    } else {
      await db.collection('users').insertOne({ id: randomUUID(), name: t.name, mobile: t.mobile, password, role: 'user', subscription: sub, mustChangePassword: false, createdAt: now })
      console.log('CREATED test user', t.mobile)
    }
  }

  // Merge beta list into the answer_key settings (keep enabled OFF).
  const doc = await db.collection('settings').findOne({ key: 'answer_key' })
  const cur = (doc && doc.value) || {}
  const beta = [...new Set([...(cur.betaTesters || []), ADMIN_MOBILE, ...TEST_USERS.map(t => t.mobile)].map(x => String(x).replace(/[^0-9]/g, '')).filter(Boolean))]
  const value = { ...cur, enabled: false, betaTesters: beta }
  await db.collection('settings').updateOne({ key: 'answer_key' }, { $set: { key: 'answer_key', value, updatedAt: now } }, { upsert: true })
  console.log('SET answer_key.enabled =', value.enabled, '| betaTesters =', beta)

  await c.close()
  console.log('done.')
}
run().catch(e => { console.error('ERROR', e); process.exit(1) })
