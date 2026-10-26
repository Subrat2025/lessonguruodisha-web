// End-to-end tests for the Cloud Library API: calls the real Next.js route handlers with
// real Request objects against an in-memory MongoDB fake (and a fake R2 when TEST_FAKE_R2=1).
//
//   TEST_DEPS=/path/with/node_modules node --import ./register.mjs --test cloud-files.test.mjs
//   TEST_FAKE_R2=1 TEST_DEPS=... node --import ./register.mjs --test cloud-files.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
process.env.NEXT_PUBLIC_BASE_URL = 'https://lessonguruodisha.in'
const R2 = process.env.TEST_FAKE_R2 === '1'

const { __db: db } = await import('@/lib/mongodb')
const filesRoute = await import('@/app/api/cloud/files/route.js')
const fileRoute = await import('@/app/api/cloud/files/[id]/route.js')
const linkRoute = await import('@/app/api/cloud/files/[id]/link/route.js')
const dlRoute = await import('@/app/api/cloud/files/[id]/download/route.js')
const fakeStorage = R2 ? await import('@/lib/storage') : null

const BASE = 'https://lessonguruodisha.in/api/cloud/files'
const future = new Date(Date.now() + 100 * 864e5).toISOString()
await db.collection('users').insertMany([
  { id: 'u-free', name: 'Free Teacher', activeSessionId: 's1', lastLoginAt: new Date() },
  { id: 'u-prem', name: 'Premium Teacher', activeSessionId: 's2', lastLoginAt: new Date(), subscription: { status: 'active', plan: 'yearly', expiryDate: future } },
  { id: 'u-other', name: 'Other Teacher', activeSessionId: 's3', lastLoginAt: new Date() },
])
const tok = (id, sessionId) => jwt.sign({ id, role: 'teacher', sessionId }, 'test-secret')
const T = { free: tok('u-free', 's1'), prem: tok('u-prem', 's2'), other: tok('u-other', 's3'), stale: tok('u-free', 'old-session') }

function pdf(bytes, seed = '') {
  const head = Buffer.from(`%PDF-1.7\n% ${seed}\n`)
  const body = crypto.createHash('sha256').update(seed).digest()
  const buf = Buffer.alloc(bytes)
  head.copy(buf)
  for (let i = head.length; i < bytes; i++) buf[i] = body[i % body.length]
  return buf
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const auth = (t) => ({ authorization: 'Bearer ' + t })

async function upload(token, buf, name, extra = {}) {
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), name)
  for (const [k, v] of Object.entries(extra)) fd.append(k, v)
  const res = await filesRoute.POST(new Request(BASE, { method: 'POST', headers: auth(token), body: fd }))
  return { res, json: await res.json() }
}
const list = async (token, qs = '') => {
  const res = await filesRoute.GET(new Request(BASE + qs, { headers: auth(token) }))
  return { res, json: await res.json() }
}
const ctx = (id) => ({ params: Promise.resolve({ id }) })
const download = (id, { token, t, dl } = {}) => dlRoute.GET(
  new Request(`${BASE}/${id}/download${t ? '?t=' + encodeURIComponent(t) : ''}${dl ? (t ? '&' : '?') + 'dl=1' : ''}`, { headers: token ? auth(token) : {} }),
  ctx(id))

const big = pdf(2.5 * 1024 * 1024 | 0, 'big-lesson-plan')
let bigId, smallId

test('requires login', async () => {
  const res = await filesRoute.GET(new Request(BASE))
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'UNAUTHORIZED')
})

test('rejects a token from a replaced session (single-device login)', async () => {
  const { res, json } = await list(T.stale)
  assert.equal(res.status, 401)
  assert.equal(json.code, 'SESSION_REPLACED')
})

test('uploads a multi-chunk PDF via multipart', async () => {
  const { res, json } = await upload(T.free, big, 'ପଞ୍ଚପଦୀ Class 5 / Maths.pdf', { source: 'app-auto', sourcePath: '/panchapadi' })
  assert.equal(res.status, 201, JSON.stringify(json))
  assert.equal(json.duplicate, false)
  assert.equal(json.file.ext, 'pdf')
  assert.equal(json.file.kind, 'pdf')
  assert.equal(json.file.bytes, big.length)
  assert.equal(json.file.name, 'ପଞ୍ଚପଦୀ Class 5 _ Maths.pdf')
  assert.equal(json.file.source, 'app-auto')
  assert.equal(json.file.sourcePath, '/panchapadi')
  assert.equal(json.usage.bytes, big.length)
  assert.equal(json.usage.plan, 'free')
  assert.ok(!('key' in json.file) && !('userId' in json.file), 'internal fields must not leak')
  bigId = json.file.id
  const stored = await db.collection('cloudFiles').findOne({ id: bigId })
  if (R2) {
    assert.equal(stored.storage, 'r2')
    assert.equal(stored.key, `cloud/u-free/${bigId}.pdf`)
    assert.ok(fakeStorage.calls.some(c => c[0] === 'upload' && c[1] === stored.key && c[2] === 'private'))
  } else {
    assert.equal(stored.storage, 'db')
    assert.equal(await db.collection('cloudFileChunks').countDocuments({ fileId: bigId }), 3)
  }
})

test('same bytes twice are de-duplicated', async () => {
  const { res, json } = await upload(T.free, big, 'copy.pdf')
  assert.equal(res.status, 200)
  assert.equal(json.duplicate, true)
  assert.equal(json.file.id, bigId)
  assert.equal(json.usage.count, 1)
})

test('uploads via JSON dataUrl (Android app path)', async () => {
  const buf = pdf(4000, 'question-paper')
  const res = await filesRoute.POST(new Request(BASE, {
    method: 'POST', headers: { ...auth(T.free), 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl: 'data:application/pdf;base64,' + buf.toString('base64'), name: 'Question Paper.pdf', source: 'app-auto' }),
  }))
  const json = await res.json()
  assert.equal(res.status, 201, JSON.stringify(json))
  smallId = json.file.id
})

test('rejects files that are not documents', async () => {
  const fd = new FormData()
  fd.append('file', new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }), 'evil.pdf')
  const res = await filesRoute.POST(new Request(BASE, { method: 'POST', headers: auth(T.free), body: fd }))
  assert.equal(res.status, 415)
  assert.equal((await res.json()).code, 'UNSUPPORTED_TYPE')
})

test('lists, searches and filters', async () => {
  let { json } = await list(T.free)
  assert.equal(json.total, 2)
  assert.equal(json.files[0].id, smallId, 'newest first')
  assert.equal(json.usage.count, 2)
  ;({ json } = await list(T.free, '?q=' + encodeURIComponent('ପଞ୍ଚପଦୀ')))
  assert.deepEqual(json.files.map(f => f.id), [bigId])
  ;({ json } = await list(T.free, '?q=' + encodeURIComponent('(.*')))
  assert.equal(json.total, 0, 'regex input is escaped')
  ;({ json } = await list(T.free, '?kind=image'))
  assert.equal(json.total, 0)
  ;({ json } = await list(T.free, '?sort=size&limit=1'))
  assert.equal(json.files.length, 1)
  assert.equal(json.files[0].id, bigId)
})

test('owner downloads exact bytes with a unicode filename', async () => {
  const res = await download(bigId, { token: T.free })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/pdf')
  assert.match(res.headers.get('content-disposition'), /^inline; filename="[^"]+"; filename\*=UTF-8''%E0%AC/)
  assert.equal(res.headers.get('cache-control'), 'private, no-store')
  const body = Buffer.from(await res.arrayBuffer())
  assert.equal(sha(body), sha(big))
  const forced = await download(bigId, { token: T.free, dl: true })
  assert.match(forced.headers.get('content-disposition'), /^attachment;/)
  const f = await db.collection('cloudFiles').findOne({ id: bigId })
  assert.ok(f.openCount >= 1)
})

test("other teachers can't see, download or change my files", async () => {
  assert.equal((await list(T.other)).json.total, 0)
  assert.equal((await download(bigId, { token: T.other })).status, 404)
  const del = await fileRoute.DELETE(new Request(`${BASE}/${bigId}`, { method: 'DELETE', headers: auth(T.other) }), ctx(bigId))
  assert.equal(del.status, 404)
  const bad = await fileRoute.GET(new Request(`${BASE}/../x`, { headers: auth(T.free) }), ctx('../../etc'))
  assert.equal(bad.status, 404)
})

test('signed open and share links', async () => {
  const mk = async (body) => {
    const res = await linkRoute.POST(new Request(`${BASE}/${bigId}/link`, { method: 'POST', headers: { ...auth(T.free), 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(bigId))
    return res.json()
  }
  const open = await mk({ purpose: 'open' })
  assert.ok(open.url.startsWith(`https://lessonguruodisha.in/api/cloud/files/${bigId}/download?t=`))
  assert.ok(new Date(open.expiresAt) - Date.now() <= 15 * 60e3 + 1000)
  const t = new URL(open.url).searchParams.get('t')
  const ok = await download(bigId, { t })
  assert.equal(ok.status, 200)
  assert.equal(sha(Buffer.from(await ok.arrayBuffer())), sha(big))

  const share = await mk({ purpose: 'share', hours: 9999 })
  assert.ok(new Date(share.expiresAt) - Date.now() <= 168 * 3600e3 + 1000, 'share links are capped at 7 days')

  assert.equal((await download(bigId, { t: t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA') })).status, 410, 'tampered')
  assert.equal((await download(smallId, { t })).status, 410, 'token for another file')
  const [payload, sig] = t.split('.')
  const p = JSON.parse(Buffer.from(payload, 'base64url').toString())
  const forged = Buffer.from(JSON.stringify({ ...p, e: p.e + 1e6 })).toString('base64url') + '.' + sig
  assert.equal((await download(bigId, { t: forged })).status, 410, 'extended expiry without a valid signature')
})

test('rename, star and revoke links', async () => {
  const link = await (await linkRoute.POST(new Request(`${BASE}/${smallId}/link`, { method: 'POST', headers: auth(T.free), body: '{}' }), ctx(smallId))).json()
  const t = new URL(link.url).searchParams.get('t')
  const patch = (body) => fileRoute.PATCH(new Request(`${BASE}/${smallId}`, { method: 'PATCH', headers: { ...auth(T.free), 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(smallId))
  let res = await patch({ name: 'Unit Test 2.docx', starred: true, tags: ['Class 6', 'Class 6', ' Maths '] })
  let json = await res.json()
  assert.equal(res.status, 200)
  assert.equal(json.file.name, 'Unit Test 2.pdf', 'extension follows the real type')
  assert.equal(json.file.starred, true)
  assert.deepEqual(json.file.tags, ['Class 6', 'Maths'])
  assert.equal((await list(T.free, '?starred=1')).json.total, 1)
  assert.equal((await download(smallId, { t })).status, 200)
  res = await patch({ revokeLinks: true })
  assert.equal(res.status, 200)
  assert.equal((await download(smallId, { t })).status, 410, 'revoked')
  assert.equal((await patch({})).status, 400)
})

test('enforces per-file size limit and storage quota', async () => {
  await db.collection('settings').insertOne({ key: 'cloud_files', value: { freeMb: 3, premiumMb: 50, maxFileMb: 2 } })
  let r = await upload(T.free, pdf(2.2 * 1024 * 1024 | 0, 'too-big'), 'big.pdf')
  assert.equal(r.res.status, 413)
  assert.equal(r.json.code, 'FILE_TOO_LARGE')
  // free user already has ~2.5 MB of 3 MB
  r = await upload(T.free, pdf(900 * 1024, 'over-quota'), 'more.pdf')
  assert.equal(r.res.status, 413)
  assert.equal(r.json.code, 'QUOTA_EXCEEDED')
  assert.match(r.json.error, /Premium/)
  // premium user has room
  r = await upload(T.prem, pdf(900 * 1024, 'over-quota'), 'more.pdf')
  assert.equal(r.res.status, 201)
  assert.equal(r.json.usage.plan, 'premium')
  assert.equal(r.json.usage.quotaBytes, 50 * 1024 * 1024)
  await db.collection('settings').deleteMany({ key: 'cloud_files' })
})

test('delete removes bytes and frees quota', async () => {
  const res = await fileRoute.DELETE(new Request(`${BASE}/${bigId}`, { method: 'DELETE', headers: auth(T.free) }), ctx(bigId))
  const json = await res.json()
  assert.equal(res.status, 200)
  assert.equal(json.usage.count, 1)
  assert.equal(json.usage.bytes, 4000)
  if (R2) assert.ok(fakeStorage.calls.some(c => c[0] === 'delete' && c[1] === `cloud/u-free/${bigId}.pdf`))
  else assert.equal(await db.collection('cloudFileChunks').countDocuments({ fileId: bigId }), 0)
  assert.equal((await download(bigId, { token: T.free })).status, 404)
})
