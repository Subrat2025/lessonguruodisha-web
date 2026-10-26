import fs from 'fs'
import { MongoClient } from 'mongodb'
import sharp from 'sharp'
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
const storage = await import('/app/lib/storage.js')

// index cache by public_id -> secure_url
const cache = JSON.parse(fs.readFileSync('/app/scripts/r2_resources_cache.json', 'utf-8'))
const byId = {}
for (const r of cache) byId[r.public_id] = r

const mongo = await MongoClient.connect(process.env.MONGO_URL)
const col = mongo.db(process.env.DB_NAME).collection('r2_migration')

// pick 3 edu-library (detailed) + 2 store covers (Odia titles)
const edu = await col.find({ top: 'lg-edu-library', status: 'done' }).sort({ srcBytes: -1 }).limit(3).toArray()
const covers = await col.find({ top: 'lg-store', status: 'done', publicId: { $regex: 'store-cover-(?!og-)', $options: '' } }).limit(8).toArray()
const coverPick = covers.filter(c => !/store-cover-og-/.test(c.publicId)).slice(0, 2)
const picks = [...edu, ...coverPick]

const rows = []
for (const d of picks) {
  const res = byId[d.publicId]
  if (!res) continue
  const origUrl = res.secure_url
  // download original, make q82 + q88
  const r = await fetch(origUrl); const buf = Buffer.from(await r.arrayBuffer())
  const q82 = await sharp(buf, { failOn: 'none' }).rotate().webp({ quality: 82 }).toBuffer()
  const q88 = await sharp(buf, { failOn: 'none' }).rotate().webp({ quality: 88 }).toBuffer()
  const base = `_samples/${d.publicId.replace(/[^a-z0-9]/gi, '_')}`
  await storage.upload(q82, { key: `${base}_q82.webp`, visibility: 'public', contentType: 'image/webp' })
  await storage.upload(q88, { key: `${base}_q88.webp`, visibility: 'public', contentType: 'image/webp' })
  rows.push({
    pid: d.publicId,
    orig: origUrl, origBytes: buf.length,
    q82: storage.getPublicUrl(`${base}_q82.webp`).split('?')[0], q82Bytes: q82.length,
    q88: storage.getPublicUrl(`${base}_q88.webp`).split('?')[0], q88Bytes: q88.length,
  })
}

const kb = (b) => (b / 1024).toFixed(0) + ' KB'
const html = `<!doctype html><html><head><meta charset="utf-8"><title>R2 webp quality samples</title>
<style>body{font-family:system-ui;margin:16px;background:#f8fafc}h1{font-size:18px}
.row{background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin:14px 0;padding:10px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.cell{text-align:center}.cell img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px}
.lbl{font-size:12px;color:#475569;margin:4px 0}.pid{font-size:12px;color:#0f172a;word-break:break-all;margin-bottom:6px}</style></head>
<body><h1>Odia / text image quality: Cloudinary original vs R2 webp q82 vs q88</h1>
<p style="font-size:13px;color:#475569">Zoom into Odia matras / printed text. Pick q82 or q88 (q88 = sharper, slightly larger).</p>
${rows.map(r => `<div class="row"><div class="pid">${r.pid}</div><div class="grid">
<div class="cell"><div class="lbl">Cloudinary ORIGINAL · ${kb(r.origBytes)}</div><img src="${r.orig}"></div>
<div class="cell"><div class="lbl">R2 webp q82 · ${kb(r.q82Bytes)}</div><img src="${r.q82}"></div>
<div class="cell"><div class="lbl">R2 webp q88 · ${kb(r.q88Bytes)}</div><img src="${r.q88}"></div>
</div></div>`).join('')}
</body></html>`

await storage.upload(Buffer.from(html, 'utf8'), { key: '_samples/compare.html', visibility: 'public', contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' })
console.log('COMPARISON PAGE:', storage.getPublicUrl('_samples/compare.html').split('?')[0])
console.log('\nSamples:')
for (const r of rows) console.log(`  ${r.pid}\n    orig ${kb(r.origBytes)} | q82 ${kb(r.q82Bytes)} | q88 ${kb(r.q88Bytes)}`)
await mongo.close()
