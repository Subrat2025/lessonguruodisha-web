// Cloud Library — one file: metadata (GET), rename/star/tags/revoke links (PATCH), delete (DELETE).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Cloud from '@/lib/cloud-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (e) => { const { status, body } = Cloud.errorBody(e); return NextResponse.json(body, { status }) }

export async function GET(request, { params }) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const { id } = await params
    return NextResponse.json({ file: Cloud.publicFile(await Cloud.getOwnedFile(d, me, id)) })
  } catch (e) { return fail(e) }
}

export async function PATCH(request, { params }) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    return NextResponse.json({ file: await Cloud.updateFile(d, me, id, body) })
  } catch (e) { return fail(e) }
}

export async function DELETE(request, { params }) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const { id } = await params
    const r = await Cloud.deleteFile(d, me, id)
    return NextResponse.json({ ...r, usage: await Cloud.usage(d, me) })
  } catch (e) { return fail(e) }
}
