// ============================================================================
//  GET /sso/toolkit?token=...  — Teacher Utility Toolkit auto-login bridge.
//
//  On success: mint a normal OTP-equivalent session (JWT) and redirect the
//  browser to /sso/continue#t=<jwt>&to=<dest> — a tiny client page that stores
//  the token in localStorage (em_token) exactly like OTP login, then forwards
//  to the destination (lessons home if Premium is active, else Premium plans).
//
//  On ANY error / disabled / rate-limit / admin / blocked: redirect to
//  /sso/expired and NEVER auto-login.
// ============================================================================
import { getDb } from '@/lib/mongodb'
import { signToken } from '@/lib/auth'
import { normalizeIndianMobile } from '@/lib/partner-grant'
import { isPreviewHost } from '@/lib/wa-allowlist'
import { v4 as uuidv4 } from 'uuid'
import {
  verifyToken, getSsoSettings, isSsoEnabledForHost, consumeNonce, checkRateLimit,
  audit, isAdminAccount, isBlockedAccount, isPremiumActive, createToolkitUser, ensureSsoIndexes,
  createHandoff,
} from '@/lib/sso-toolkit'

export const dynamic = 'force-dynamic'

const redir = (loc) => new Response(null, { status: 302, headers: { Location: loc, 'Cache-Control': 'no-store' } })
const EXPIRED = '/sso/expired'

// ⚡ Tiny self-contained HTML bridge (NO app bundle, NO React, NO extra redirect,
// NO handoff round-trip). Shows a branded loader instantly, writes the session
// token to localStorage from the RESPONSE BODY (never in a URL/log), warms the
// server, prefetches the destination, then goes straight there.
function bridgeHtml(token, dest) {
  const t = JSON.stringify(token)
  const d = JSON.stringify(dest)
  return `<!doctype html><html lang="or"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Lesson Guru</title><link rel="prefetch" href=${d}>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans Oriya',system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(180deg,#EEF2FF 0%,#F8FAFC 40%);color:#1E1B4B}.lg{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#2563EB,#7C3AED);box-shadow:0 10px 24px rgba(79,70,229,.35);margin-bottom:18px}.t{font-size:17px;font-weight:800}.s{font-size:13px;color:#64748B;margin:4px 0 18px}.sp{width:26px;height:26px;border:3px solid #DDD6FE;border-top-color:#7C3AED;border-radius:50%;animation:sp .7s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}</style></head>
<body>
<div class="lg"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg></div>
<div class="t">Lesson Guru ଖୋଲୁଛି…</div>
<div class="s">Signing you in</div>
<div class="sp"></div>
<script>(function(){try{localStorage.setItem('em_token',${t});}catch(e){}try{fetch('/api/ping',{cache:'force-cache'});}catch(e){}var D=${d};try{window.location.replace(D);}catch(e){window.location.href=D;}})();</script>
<noscript><div style="margin-top:16px"><a href="/login">Continue / ଆଗକୁ ବଢନ୍ତୁ</a></div></noscript>
</body></html>`
}
const bridgeResponse = (jwt, dest) => new Response(bridgeHtml(jwt, dest), {
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
})

export async function GET(request) {
  let hostType = 'live'
  let d = null
  try {
    const h = request.headers
    const host = String(h.get('x-forwarded-host') || h.get('host') || '').toLowerCase()
    hostType = isPreviewHost(host) ? 'preview' : 'live'
    const ip = String(h.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'

    d = await getDb()
    await ensureSsoIndexes(d)

    // 1) Rate limit per IP.
    const rl = await checkRateLimit(d, ip)
    if (!rl.allowed) {
      await audit(d, { result: 'rate_limited', hostType })
      return redir(EXPIRED)
    }

    // 2) Per-host kill switch.
    const settings = await getSsoSettings(d)
    if (!isSsoEnabledForHost(settings, hostType)) {
      await audit(d, { result: 'disabled', hostType })
      return redir(EXPIRED)
    }

    // 3) Verify token (signature, window<=60s, not expired, src, nonce present).
    const token = new URL(request.url).searchParams.get('token') || ''
    const v = verifyToken(token, process.env.SSO_TOOLKIT_SECRET)
    if (!v.ok) {
      await audit(d, { result: `invalid:${v.reason}`, hostType })
      return redir(EXPIRED)
    }

    // 4) Valid Indian mobile.
    const mobile = normalizeIndianMobile(v.claims.phone)
    if (!mobile) {
      await audit(d, { result: 'bad_phone', hostType })
      return redir(EXPIRED)
    }
    const last4 = mobile.slice(-4)

    // 5) One-time nonce (replay protection).
    const fresh = await consumeNonce(d, v.claims.nonce)
    if (!fresh) {
      await audit(d, { result: 'nonce_reuse', hostType, phoneLast4: last4 })
      return redir(EXPIRED)
    }

    // 7) Decide: auto-login vs "Confirm it's you" (phone-verification gap guard).
    //    The Toolkit does NOT verify phone ownership (mobile+password signup, no
    //    OTP), so a token alone must NEVER open an EXISTING account that has not
    //    yet been linked here via a real OTP login.
    let user = await d.collection('users').findOne({ mobile })
    if (user && isAdminAccount(user)) {
      await audit(d, { result: 'admin_blocked', hostType, phoneLast4: last4 })
      return redir(EXPIRED)
    }
    if (user && isBlockedAccount(user)) {
      await audit(d, { result: 'blocked', hostType, phoneLast4: last4 })
      return redir(EXPIRED)
    }

    let created = false
    if (!user) {
      // Brand-new account: no pre-existing owner to hijack -> create + link now.
      user = await createToolkitUser(d, { mobile, name: v.claims.name })
      created = true
    } else if (!user.toolkitLinked) {
      // Existing account, not yet linked -> require OTP confirmation first.
      // Pass a one-time handoff code in a normal query param (survives 302 in
      // all webviews; the phone stays server-side, not in the URL).
      const dest = isPremiumActive(user) ? '/lessons' : '/plans'
      const code = await createHandoff(d, { kind: 'confirm', phone: mobile, to: dest })
      await audit(d, { result: 'confirm_required', hostType, phoneLast4: last4 })
      return redir(`/sso/confirm?c=${encodeURIComponent(code)}`)
    }

    // 8) Mint a normal session — mirror OTP login exactly (rotate activeSessionId).
    const sessionId = uuidv4()
    await d.collection('users').updateOne(
      { id: user.id },
      { $set: { activeSessionId: sessionId, lastLoginAt: new Date() } },
    )
    const jwt = signToken({ id: user.id, role: user.role, sessionId })

    // 9) Destination: Premium active -> lessons home; else -> Premium plans.
    const dest = isPremiumActive(user) ? '/lessons' : '/plans'
    if (created) await audit(d, { result: 'linked', hostType, phoneLast4: last4 })
    await audit(d, { result: created ? 'ok_new' : 'ok', hostType, phoneLast4: last4 })

    // ⚡ FAST PATH: one server route + one navigation to the destination.
    // No /sso/continue page (no app bundle) and no /api/sso/handoff round-trip.
    // The JWT is delivered in the HTML body (never a URL/log) with no-store.
    return bridgeResponse(jwt, dest)
  } catch (e) {
    try { if (d) await audit(d, { result: 'error', hostType }) } catch (_) {}
    console.error('[sso/toolkit] error:', e?.message)
    return redir(EXPIRED)
  }
}
