// Cloud Library — list files (GET) and save a new file (POST).
//   POST multipart/form-data: file, [name], [source], [sourcePath]
//   POST application/json:    { dataUrl, name, source, sourcePath }   (used by the Android app)
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import * as Cloud from '@/lib/cloud-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (e) => { const { status, body } = Cloud.errorBody(e); return NextResponse.json(body, { status }) }

export async function GET(request) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const q = Object.fromEntries(new URL(request.url).searchParams)
    const [list, usage] = await Promise.all([Cloud.listFiles(d, me, q), Cloud.usage(d, me)])
    return NextResponse.json({ ...list, usage }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return fail(e) }
}

export async function POST(request) {
  try {
    const d = await getDb()
    const me = await Cloud.resolveUser(request, d)
    const cfg = await Cloud.getConfig(d)
    // Reject oversized bodies before reading them (base64 JSON is ~4/3 of the file).
    const len = Number(request.headers.get('content-length') || 0)
    if (len && len > cfg.maxFileMb * 1024 * 1024 * 1.4 + 64 * 1024) {
      throw new Cloud.CloudError('FILE_TOO_LARGE', `Files up to ${cfg.maxFileMb} MB can be saved to the cloud`, 413)
    }
    let buffer, name, source, sourcePath
    const type = request.headers.get('content-type') || ''
    if (type.startsWith('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string') throw new Cloud.CloudError('NO_FILE', 'Choose a file to upload')
      buffer = Buffer.from(await file.arrayBuffer())
      name = form.get('name') || file.name
      source = form.get('source')
      sourcePath = form.get('sourcePath')
    } else {
      const body = await request.json().catch(() => null)
      const m = body && typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:[^,]*;base64,(.*)$/s)
      if (!m) throw new Cloud.CloudError('NO_FILE', 'Send the file as multipart "file" or a base64 dataUrl')
      buffer = Buffer.from(m[1], 'base64')
      ;({ name, source, sourcePath } = body)
    }
    const { file, duplicate } = await Cloud.saveFile(d, me, { buffer, name, source, sourcePath })
    const usage = await Cloud.usage(d, me)
    return NextResponse.json({ file, duplicate, usage }, { status: duplicate ? 200 : 201 })
  } catch (e) { return fail(e) }
}
