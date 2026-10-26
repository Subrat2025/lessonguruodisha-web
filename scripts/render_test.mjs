import fs from 'fs'
import { MongoClient } from 'mongodb'
import sharp from 'sharp'
import { PDFiumLibrary } from '@hyzyla/pdfium'
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
sharp.concurrency(1); sharp.cache(false)
const storage = await import('/app/lib/storage.js')
const mongo = await MongoClient.connect(process.env.MONGO_URL)
const col = mongo.db(process.env.DB_NAME).collection('r2_migration')

// 3 official-paper PDFs (Odia question papers) from R2 private
const docs = await col.find({ top: 'lg-official-papers', status: 'done' }).limit(3).toArray()
console.log('picked', docs.length, 'official-paper PDFs')

const library = await PDFiumLibrary.init()
const rows = []
for (let i = 0; i < docs.length; i++) {
  const d = docs[i]
  const key = d.targets[0].key
  const got = await storage.getPrivateFileBuffer(key)
  if (!got) { console.log('  missing in R2:', key); continue }
  const t0 = Date.now()
  const pdoc = await library.loadDocument(got.buffer)
  const pageCount = pdoc.getPageCount()
  const page = pdoc.getPage(0)
  const res = await page.render({ scale: 2.2, render: async (o) => o.data }) // raw BGRA
  const bgra = Buffer.from(res.data)
  for (let p = 0; p < bgra.length; p += 4) { const b = bgra[p]; bgra[p] = bgra[p + 2]; bgra[p + 2] = b } // BGRA -> RGBA
  const png = await sharp(bgra, { raw: { width: res.width, height: res.height, channels: 4 } })
    .resize({ width: 1000, withoutEnlargement: true })
    .jpeg({ quality: 85 }).toBuffer()
  const ms = Date.now() - t0
  pdoc.destroy()
  const outKey = `_rendertest/${i + 1}.jpg`
  await storage.upload(png, { key: outKey, visibility: 'public', contentType: 'image/jpeg' })
  rows.push({ key, pages: pageCount, w: res.width, h: res.height, jpgKB: (png.length / 1024).toFixed(0), ms, url: storage.getPublicUrl(outKey).split('?')[0] })
  console.log(`  rendered ${key} | pages=${pageCount} src=${res.width}x${res.height} ${(png.length / 1024).toFixed(0)}KB in ${ms}ms`)
}
library.destroy()

const html = `<!doctype html><html><head><meta charset="utf-8"><title>PDFium Odia render test</title>
<style>body{font-family:system-ui;margin:16px;background:#f8fafc}img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px}
.row{background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin:14px 0;padding:10px}.k{font-size:12px;color:#334155;word-break:break-all}</style></head>
<body><h1>@hyzyla/pdfium — page 1 render of 3 Odia official papers</h1>
<p style="font-size:13px;color:#475569">Check Odia letters, matras, maths symbols and diagrams render cleanly (no boxes/broken glyphs).</p>
${rows.map((r, i) => `<div class="row"><div class="k">#${i + 1} ${r.key} · ${r.pages} pages · rendered ${r.w}x${r.h} · ${r.jpgKB} KB · ${r.ms} ms</div><img src="${r.url}"></div>`).join('')}
</body></html>`
await storage.upload(Buffer.from(html, 'utf8'), { key: '_rendertest/index.html', visibility: 'public', contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' })
console.log('\nRENDER TEST PAGE:', storage.getPublicUrl('_rendertest/index.html').split('?')[0])
await mongo.close()
