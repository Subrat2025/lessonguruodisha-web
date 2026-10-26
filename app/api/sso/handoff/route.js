// POST /api/sso/handoff  { code }
//   kind 'login'   -> returns { token, to }. Uses a short grace window so a
//                     duplicate read (React dev double-invoke) returns the SAME
//                     token instead of a 410 that would clobber the login.
//   kind 'confirm' -> returns { phone, to } (not consumed; needed for OTP + link).
// Codes are random (24 bytes), short-lived, and stored server-side so neither the
// session JWT nor the phone ever travels in a URL / server log.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { readHandoff, consumeLoginHandoff } from '@/lib/sso-toolkit'

export const dynamic = 'force-dynamic'
const json = (b, init) => NextResponse.json(b, init)

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const code = String(body?.code || '').trim()
    if (!code) return json({ error: 'Missing code' }, { status: 400 })
    const d = await getDb()

    // Requester identity for the grace re-read (same IP + same UA only).
    const ip = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const ua = String(request.headers.get('user-agent') || '')

    // LOGIN: grace-window consume (idempotent for the same requester, <=10s).
    const login = await consumeLoginHandoff(d, code, { ip, ua })
    if (login) return json({ ok: true, kind: 'login', token: login.token, to: login.to })

    // CONFIRM: not consumed here (needed through the OTP + link step).
    const doc = await readHandoff(d, code, { kind: 'confirm' })
    if (doc) return json({ ok: true, kind: 'confirm', phone: doc.phone, to: doc.to || '/' })

    return json({ error: 'expired' }, { status: 410 })
  } catch (e) {
    console.error('[sso/handoff] failed:', e?.message)
    return json({ error: 'Failed' }, { status: 500 })
  }
}
