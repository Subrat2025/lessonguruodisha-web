// Account deletion — the signed-in teacher's own request.
//   GET  → { request | null }
//   POST { confirm: 'DELETE', reason? } → records the request and signs the teacher out everywhere
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Cloud from '@/lib/cloud-files'
import * as Deletion from '@/lib/account-deletion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (e) => { const { status, body } = Deletion.errorBody(e); return NextResponse.json(body, { status }) }

export async function GET(request) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    return NextResponse.json({ request: Deletion.publicRequest(await Deletion.getOpenRequest(d, me.id)), slaDays: Deletion.SLA_DAYS })
  } catch (e) { return fail(e) }
}

export async function POST(request) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const body = await request.json().catch(() => ({}))
    if (body.confirm !== 'DELETE') {
      throw new Deletion.DeletionError('CONFIRM_REQUIRED', 'Type DELETE to confirm', 400)
    }
    const r = await Deletion.requestDeletion(d, me, { reason: body.reason })
    return NextResponse.json({ ...r, slaDays: Deletion.SLA_DAYS }, { status: r.existing ? 200 : 201 })
  } catch (e) { return fail(e) }
}
