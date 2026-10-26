// One-time seed for Assessment Store (Prompt 1): packs + documents + links.
// Reads the two CSVs (already downloaded to /tmp) and writes ONLY to assess_* collections.
const { MongoClient } = require('mongodb')
const fs = require('fs')
const crypto = require('crypto')

const uuid = () => crypto.randomUUID()
const parseCsv = (txt) => {
  const lines = txt.replace(/\r/g, '').split('\n').filter(l => l.trim().length)
  const splitRow = (line) => {
    const out = []; let cur = ''; let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out
  }
  const headers = splitRow(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells = splitRow(line)
    const o = {}
    headers.forEach((h, i) => { o[h] = (cells[i] ?? '').trim() })
    return o
  })
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

;(async () => {
  const c = new MongoClient('mongodb://localhost:27017'); await c.connect()
  const d = c.db('edumaster_odisha')
  const priceRows = parseCsv(fs.readFileSync('/tmp/price.csv', 'utf8'))
  const catRows = parseCsv(fs.readFileSync('/tmp/cat.csv', 'utf8'))

  // Reset ONLY assess_* store-catalog collections (safe; additive module).
  await Promise.all([
    d.collection('assess_packs').deleteMany({}),
    d.collection('assess_documents').deleteMany({}),
    d.collection('assess_pack_items').deleteMany({}),
  ])

  // ---- Packs from price_list.csv ----
  const packByName = new Map()
  const packByCode = new Map()
  let sort = 0
  for (const r of priceRows) {
    const mrp = parseInt(r.mrp_inr) || 0
    const sale = parseInt(r.sale_price_inr) || 0
    const doc = {
      id: uuid(),
      pack_code: r.pack_code,
      pack_name: r.pack_name,
      pack_name_or: r.pack_name,
      pack_type: r.pack_type || 'subject',
      includes_text: r.includes || '',
      description_or: r.includes || '',
      mrp_inr: mrp,
      sale_price_inr: sale,
      discount_pct: parseInt(r.discount_pct) || (mrp ? Math.round((mrp - sale) / mrp * 100) : 0),
      is_free: sale === 0,
      is_active: (r.is_active || 'yes').toLowerCase() !== 'no',
      note: r.note || '',
      sort_order: sort++,
      offer_price_inr: null, offer_start: null, offer_end: null, offer_label: null,
      created_at: new Date(), updated_at: new Date(),
    }
    await d.collection('assess_packs').insertOne(doc)
    packByName.set(r.pack_name, doc)
    packByCode.set(r.pack_code, doc)
  }

  // Helper: find or create an inactive pack by NAME (price 0) for catalog links.
  const ensurePack = async (name, type) => {
    if (!name) return null
    if (packByName.has(name)) return packByName.get(name)
    const doc = {
      id: uuid(), pack_code: 'AUTO-' + slug(name), pack_name: name, pack_name_or: name,
      pack_type: type, includes_text: '', description_or: '', mrp_inr: 0, sale_price_inr: 0,
      discount_pct: 0, is_free: true, is_active: false, note: 'auto-created from catalog',
      sort_order: sort++, offer_price_inr: null, offer_start: null, offer_end: null, offer_label: null,
      created_at: new Date(), updated_at: new Date(),
    }
    await d.collection('assess_packs').insertOne(doc)
    packByName.set(name, doc)
    return doc
  }

  // ---- Documents from assessment_catalog.csv ----
  const links = []
  for (const r of catRows) {
    const doc = {
      id: uuid(),
      file_name: r.file_name,
      title_or: r.file_name.replace(/_/g, ' ').replace(/\.pdf$/i, ''),
      class: r.class,
      subject: r.subject,
      doc_type: r.doc_type,
      pages: parseInt(r.pages) || 0,
      set_b: (r.set_b || 'no').toLowerCase() === 'yes',
      is_free_sample: (r.is_free_sample || 'no').toLowerCase() === 'yes',
      cld_public_id: null, cld_resource_type: null, cld_version: null, bytes: 0,
      preview_public_id: null, release_at: null, exam_window_note: '',
      created_at: new Date(),
    }
    await d.collection('assess_documents').insertOne(doc)
    const sp = await ensurePack(r.subject_pack, 'subject')
    const cp = await ensurePack(r.class_pack, 'class')
    if (sp) links.push({ pack_id: sp.id, document_id: doc.id })
    if (cp) links.push({ pack_id: cp.id, document_id: doc.id })
  }
  if (links.length) await d.collection('assess_pack_items').insertMany(links)

  // ---- Settings defaults ----
  const setDefault = async (key, value) => {
    await d.collection('assess_settings').updateOne({ key }, { $setOnInsert: { key, value } }, { upsert: true })
  }
  await setDefault('store_name', 'ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର')
  await setDefault('whatsapp_number', '918093414633')
  await setDefault('support_email', 'support@lessonguruodisha.in')
  await setDefault('store_hours', 'ସୋମ – ଶନି · ସକାଳ ୧୦ଟା – ସନ୍ଧ୍ୟା ୭ଟା')
  await setDefault('oath_full_every_download', false)
  await setDefault('launch_banner_active', true)
  await setDefault('launch_banner_text', '🎉 ଆରମ୍ଭ ଅଫର୍ — LAUNCH100 କୋଡ୍ ବ୍ୟବହାର କରି Complete Pack ₹100 ଛାଡ଼!')
  await setDefault('footer_note', 'Lesson Guru Odisha — ସ୍ୱାଧୀନ ଶିକ୍ଷକ ସହାୟକ ସାମଗ୍ରୀ, SCERT ଓଡ଼ିଶା CCE ଢାଞ୍ଚା ଅନୁଯାୟୀ । ସରକାରୀ ପ୍ରକାଶନ ନୁହେଁ ।')
  await setDefault('daily_download_limit', 5)

  // ---- Coupons (inactive pre-created) ----
  await d.collection('assess_coupons').deleteMany({ code: { $in: ['LAUNCH100', 'TEACHER20', 'SCHOOL10'] } })
  await d.collection('assess_coupons').insertMany([
    { id: uuid(), code: 'LAUNCH100', type: 'flat', value: 100, applies_to: 'pack_codes', pack_codes: ['COMPLETE'], min_order_inr: 0, valid_from: null, valid_till: null, max_uses: 0, used_count: 0, is_active: false },
    { id: uuid(), code: 'TEACHER20', type: 'percent', value: 20, applies_to: 'pack_type', pack_types: ['subject', 'class'], min_order_inr: 0, valid_from: null, valid_till: new Date('2026-12-31'), max_uses: 0, used_count: 0, is_active: false },
    { id: uuid(), code: 'SCHOOL10', type: 'percent', value: 10, applies_to: 'pack_type', pack_types: ['school'], min_order_inr: 0, valid_from: null, valid_till: null, max_uses: 0, used_count: 0, is_active: false },
  ])

  const [np, nd, nl] = await Promise.all([
    d.collection('assess_packs').countDocuments(),
    d.collection('assess_documents').countDocuments(),
    d.collection('assess_pack_items').countDocuments(),
  ])
  console.log('SEED DONE → packs:', np, 'documents:', nd, 'links:', nl)
  await c.close()
})().catch(e => { console.error(e); process.exit(1) })
