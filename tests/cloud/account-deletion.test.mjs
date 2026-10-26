// Account deletion flow (Google Play requirement), against the in-memory MongoDB fake.
//   TEST_DEPS=../.. node --import ./register.mjs --test account-deletion.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
const { __db: db } = await import('@/lib/mongodb')
const mine = await import('@/app/api/account/deletion/route.js')
const adminList = await import('@/app/api/admin/account-deletions/route.js')
const adminAct = await import('@/app/api/admin/account-deletions/[id]/route.js')
const files = await import('@/app/api/cloud/files/route.js')

await db.collection('users').insertMany([
  { id: 'u1', name: 'Teacher One', mobile: '9811111111', school: 'PS Puri', email: 't1@x.in', password: 'hash', role: 'user', activeSessionId: 's1', lastLoginAt: new Date() },
  { id: 'u2', name: 'Teacher Two', mobile: '9822222222', role: 'user', activeSessionId: 's2', lastLoginAt: new Date() },
  { id: 'adm', name: 'Admin', mobile: '9000000000', role: 'admin', activeSessionId: 'sa', lastLoginAt: new Date() },
])
await db.collection('payments').insertOne({ id: 'p1', userId: 'u1', amount: 199 })
const tok = (id, s) => jwt.sign({ id, sessionId: s }, 'test-secret')
const H = (t) => ({ authorization: 'Bearer ' + t, 'content-type': 'application/json' })
const post = (route, t, body, ctx) => route.POST(new Request('https://x/api', { method: 'POST', headers: H(t), body: JSON.stringify(body) }), ctx)
const get = (route, t, qs = '') => route.GET(new Request('https://x/api' + qs, { headers: H(t) }))
const ctx = (id) => ({ params: Promise.resolve({ id }) })

let reqId

test('teacher must confirm, then request is recorded and they are signed out', async () => {
  // a cloud file to be removed later
  const fd = new FormData(); fd.append('file', new Blob([Buffer.from('%PDF-1.4 mine')]), 'a.pdf')
  assert.equal((await files.POST(new Request('https://x/api/cloud/files', { method: 'POST', headers: { authorization: 'Bearer ' + tok('u1', 's1') }, body: fd }))).status, 201)

  let res = await post(mine, tok('u1', 's1'), { reason: 'not teaching' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'CONFIRM_REQUIRED')
  res = await post(mine, tok('u1', 's1'), { confirm: 'DELETE', reason: 'Not teaching any more' })
  const j = await res.json()
  assert.equal(res.status, 201)
  assert.equal(j.request.status, 'pending')
  assert.equal(j.slaDays, 30)
  reqId = j.request.id
  // old token no longer works
  res = await get(mine, tok('u1', 's1'))
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'SESSION_REPLACED')
})

test('admins cannot request deletion of an admin account', async () => {
  const res = await post(mine, tok('adm', 'sa'), { confirm: 'DELETE' })
  assert.equal(res.status, 403)
})

test('only admins can list and act', async () => {
  assert.equal((await get(adminList, tok('u2', 's2'))).status, 403)
  assert.equal((await post(adminAct, tok('u2', 's2'), { action: 'process' }, ctx(reqId))).status, 403)
  const j = await (await get(adminList, tok('adm', 'sa'), '?status=pending')).json()
  assert.equal(j.counts.pending, 1)
  assert.equal(j.requests[0].name, 'Teacher One')
  assert.equal(j.requests[0].overdue, false)
})

test('processing deletes cloud files and anonymises the account, keeping payments', async () => {
  const res = await post(adminAct, tok('adm', 'sa'), { action: 'process' }, ctx(reqId))
  const j = await res.json()
  assert.equal(res.status, 200, JSON.stringify(j))
  assert.equal(j.request.status, 'processed')
  assert.equal(j.request.result.filesDeleted, 1)
  const u = await db.collection('users').findOne({ id: 'u1' })
  assert.equal(u.name, 'Deleted user')
  assert.equal(u.mobile, 'deleted-u1')
  assert.equal(u.deleted, true)
  assert.equal(u.suspended, true)
  for (const k of ['school', 'email', 'password']) assert.ok(!(k in u), k + ' removed')
  assert.equal(await db.collection('cloudFiles').countDocuments({ userId: 'u1' }), 0)
  assert.equal(await db.collection('cloudFileChunks').countDocuments({}), 0)
  assert.equal(await db.collection('payments').countDocuments({ userId: 'u1' }), 1, 'payment records are retained')
  const again = await post(adminAct, tok('adm', 'sa'), { action: 'process' }, ctx(reqId))
  assert.equal(again.status, 409)
})

test('cancel a pending request', async () => {
  const r = await (await post(mine, tok('u2', 's2'), { confirm: 'DELETE' })).json()
  const res = await post(adminAct, tok('adm', 'sa'), { action: 'cancel' }, ctx(r.request.id))
  assert.equal((await res.json()).request.status, 'cancelled')
  const u = await db.collection('users').findOne({ id: 'u2' })
  assert.equal(u.name, 'Teacher Two', 'cancelled request leaves the account intact')
})
