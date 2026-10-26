// ============================================================================
//  GET/HEAD /api/ping — ultra-light liveness probe.
//
//  Dedicated route file so a warm-up ping does NOT compile/execute the giant
//  catch-all app/api/[[...path]]/route.js module (which pulls in the whole
//  backend + a MongoDB connect). Used by the /sso bridge pages to wake the
//  Node server while the "Signing you in…" screen shows, so the real app route
//  (/lessons, /plans) is already warm by the time we navigate.
// ============================================================================
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Cache-friendly: a tiny max-age lets edges/CDN serve repeat pings cheaply,
  // while the first hit from a cold client still reaches (and warms) the origin.
  return NextResponse.json({ ok: true, ts: Date.now() }, { headers: { 'Cache-Control': 'public, max-age=10' } })
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'public, max-age=10' } })
}
