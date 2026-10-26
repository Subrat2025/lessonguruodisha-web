// Admin — act on one deletion request: POST { action: 'process' | 'cancel' }.
// 'process' permanently deletes Cloud Library files and anonymises the account.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Deletion from '@/lib/account-deletion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request, { params }) {
  try {
    const d = await getDb()
    const admin = await Deletion.requireAdmin(request, d)
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    if (body.action === 'process') return NextResponse.json({ request: await Deletion.processRequest(d, admin, id) })
    if (body.action === 'cancel') return NextResponse.json({ request: await Deletion.cancelRequest(d, admin, id) })
    throw new Deletion.DeletionError('BAD_ACTION', "action must be 'process' or 'cancel'")
  } catch (e) {
    const { status, body } = Deletion.errorBody(e)
    return NextResponse.json(body, { status })
  }
}
