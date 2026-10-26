// Admin — list account deletion requests (?status=pending|processed|cancelled).
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Deletion from '@/lib/account-deletion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  try {
    const d = await getDb()
    await Deletion.requireAdmin(request, d)
    const status = new URL(request.url).searchParams.get('status') || 'pending'
    return NextResponse.json({ ...(await Deletion.listRequests(d, { status })), slaDays: Deletion.SLA_DAYS })
  } catch (e) {
    const { status, body } = Deletion.errorBody(e)
    return NextResponse.json(body, { status })
  }
}
