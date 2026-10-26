// Fake R2 (lib/storage.js surface) for tests: keeps objects in memory and records calls.
export const objects = new Map()
export const calls = []
export const r2Enabled = () => true
export const storageMode = () => 'gateway'
export async function upload(buf, { key, visibility, contentType }) {
  calls.push(['upload', key, visibility]); objects.set(visibility + ':' + key, { buf: Buffer.from(buf), contentType })
  return { key, bucket: visibility, bytes: buf.length }
}
export async function getPrivateFileBytes(key, { visibility }) {
  calls.push(['get', key, visibility]); const o = objects.get(visibility + ':' + key)
  if (!o) return null
  return { body: new Blob([o.buf]).stream(), contentType: o.contentType, contentLength: o.buf.length }
}
export async function deleteObject(key, { visibility }) { calls.push(['delete', key, visibility]); objects.delete(visibility + ':' + key); return { ok: true } }
