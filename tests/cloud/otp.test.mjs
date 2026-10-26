// WhatsApp OTP sender + admin OTP Health, with BulkyMarketing's HTTP API stubbed.
//   TEST_DEPS=../.. node --import ./register.mjs --test otp.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
process.env.BULKY_APPKEY = 'app'
process.env.BULKY_AUTHKEY = 'auth'
let reply = { status: 200, body: { message_status: 'Success', message_id: 'wamid.123' } }
let templates = [{ name: 'otptemplate', status: 'APPROVED', category: 'AUTHENTICATION' }]
const calls = []
globalThis.fetch = async (url, opts) => {
  calls.push(String(url))
  if (String(url).endsWith('/get_templates')) return new Response(JSON.stringify({ templates }), { status: 200 })
  return new Response(JSON.stringify(reply.body), { status: reply.status })
}
const { sendBulkyOtp } = await import('@/lib/whatsapp-bulky.js')
const { __db: db } = await import('@/lib/mongodb')
const health = await import('@/app/api/admin/otp-health/route.js')
await db.collection('users').insertMany([
  { id: 'adm', role: 'admin', activeSessionId: 's', lastLoginAt: new Date() },
  { id: 't', role: 'user', activeSessionId: 's', lastLoginAt: new Date() },
])
const H = (id) => ({ authorization: 'Bearer ' + jwt.sign({ id, sessionId: 's' }, 'test-secret'), 'content-type': 'application/json' })

test('accepted send returns the provider message id', async () => {
  const r = await sendBulkyOtp({ to: '9876543210', code: '481516' })
  assert.equal(r.ok, true)
  assert.equal(r.providerRef, 'wamid.123')
})

test('HTTP 200 refusals (empty wallet) are failures, and the code never leaks', async () => {
  reply = { status: 200, body: { message_status: 'Success', message: 'Insufficient wallet balance for 481516' } }
  const r = await sendBulkyOtp({ to: '9876543210', code: '481516' })
  assert.equal(r.ok, false)
  assert.match(r.safeError, /refused/)
  assert.ok(!r.detail.includes('481516') && !r.safeError.includes('481516'), 'OTP masked')
  reply = { status: 200, body: { message_status: 'Failed', message: 'Template paused' } }
  assert.equal((await sendBulkyOtp({ to: '9876543210', code: '1' })).ok, false)
  reply = { status: 200, body: { message_status: 'Success', message_id: 'wamid.9' } }
})

test('missing keys / bad number fail without calling the provider', async () => {
  const n = calls.length
  assert.equal((await sendBulkyOtp({ to: '12345', code: '1' })).ok, false)
  assert.equal(calls.length, n)
})

test('OTP Health is admin-only and flags an unapproved template', async () => {
  assert.equal((await health.GET(new Request('https://x/api/admin/otp-health', { headers: H('t') }))).status, 403)
  await db.collection('otp_audit').insertMany([
    { at: new Date(), purpose: 'login', last4: '3210', result: 'sent', providerRef: 'wamid.1' },
    { at: new Date(), purpose: 'login', last4: '3210', result: 'failed', reason: 'send', detail: '{"message":"Insufficient wallet balance"}' },
    { at: new Date(), purpose: 'login', last4: '1111', result: 'blocked', reason: 'rate-15m' },
  ])
  let j = await (await health.GET(new Request('https://x/api/admin/otp-health', { headers: H('adm') }))).json()
  assert.equal(j.config.credentialsSet, true)
  assert.equal(j.template.status, 'APPROVED')
  assert.equal(j.last24h.counts['failed:send'], 1)
  assert.equal(j.recentProblems.length, 2)
  assert.ok(j.problems.some(p => p.includes('failed')))
  templates = [{ name: 'otptemplate', status: 'PAUSED' }]
  j = await (await health.GET(new Request('https://x/api/admin/otp-health', { headers: H('adm') }))).json()
  assert.ok(j.problems.some(p => p.includes('PAUSED')), JSON.stringify(j.problems))
})

test('admin test send reports the provider reply and is audited', async () => {
  const res = await health.POST(new Request('https://x/api/admin/otp-health', { method: 'POST', headers: H('adm'), body: JSON.stringify({ mobile: '9876543210' }) }))
  const j = await res.json()
  assert.equal(j.ok, true)
  assert.equal(j.providerRef, 'wamid.9')
  assert.equal(await db.collection('otp_audit').countDocuments({ purpose: 'admin-test' }), 1)
  assert.equal(await db.collection('otp_codes').countDocuments({}), 0, 'test code is never stored')
})
