// Cloud Library — stream a file's bytes.
// Authorised by `Authorization: Bearer <jwt>` (owner) or `?t=<signed link>`.
// `?dl=1` forces a download; otherwise PDFs/images open inline.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Cloud from '@/lib/cloud-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request, { params }) {
  try {
    const d = await getDb()
    const { id } = await params
    const url = new URL(request.url)
    const t = url.searchParams.get('t')
    let file
    if (t) {
      file = await Cloud.fileFromLink(d, t)
      if (!file || file.id !== id) {
        return NextResponse.json({ error: 'This link has expired or is no longer valid', code: 'LINK_INVALID' }, { status: 410 })
      }
    } else {
      const me = await Cloud.resolveUser(request, d)
      file = await Cloud.getOwnedFile(d, me, id)
    }
    const blob = await Cloud.readBlob(d, file)
    if (!blob) return NextResponse.json({ error: 'File content is missing', code: 'BLOB_MISSING' }, { status: 404 })
    Cloud.markOpened(d, file).catch(() => {})
    const inline = url.searchParams.get('dl') !== '1' && (file.kind === 'pdf' || file.kind === 'image')
    const headers = {
      'Content-Type': file.mime,
      'Content-Disposition': Cloud.contentDisposition(file.name, inline),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    }
    if (blob.contentLength) headers['Content-Length'] = String(blob.contentLength)
    return new Response(blob.body, { status: 200, headers })
  } catch (e) {
    const { status, body } = Cloud.errorBody(e)
    return NextResponse.json(body, { status })
  }
}
