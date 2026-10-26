// Verify Answer Key Cloudinary security posture (strict transformations OFF):
//  1) AK assets are stored as type 'authenticated' (private).
//  2) Unsigned authenticated delivery is rejected.
//  3) A signed blurred URL with the e_blur transformation stripped (attacker
//     trying to "unblur") is rejected (signature no longer matches).
//  4) A valid signed blurred URL is delivered (200).
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import { v2 as cloudinary } from 'cloudinary'

const env = fs.readFileSync('/app/.env', 'utf8')
env.split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2] })
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true })

function statusOf(url) { return new Promise(r => { https.get(url, x => { x.resume(); r(x.statusCode) }).on('error', () => r(0)) }) }

async function run() {
  // Minimal valid PDF
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 4>>\nstartxref\n0\n%%EOF')
  const fp = path.join(os.tmpdir(), `sec_${Date.now()}.pdf`); fs.writeFileSync(fp, pdf)
  const res = await new Promise((rs, rj) => cloudinary.uploader.upload(fp, { folder: 'lg-answer-key/_sectest', resource_type: 'image', type: 'authenticated', unique_filename: true, use_filename: true }, (e, r) => e ? rj(e) : rs(r)))
  fs.unlinkSync(fp)

  // 1) Confirm stored as authenticated
  const info = await cloudinary.api.resource(res.public_id, { resource_type: 'image', type: 'authenticated' }).catch(e => ({ error: e.message }))
  console.log('1) delivery type reported by Cloudinary:', info.type, info.type === 'authenticated' ? '=> OK authenticated/private' : '=> UNEXPECTED')

  // 4) valid signed blurred URL
  const signedBlur = cloudinary.url(res.public_id, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, format: 'jpg', page: 1, version: res.version, transformation: [{ width: 500, crop: 'fit' }, { effect: 'blur:2000' }, { quality: 30 }] })
  console.log('4) signed blurred URL status:', await statusOf(signedBlur), '(expect 200)')

  // 2) unsigned authenticated base delivery (no signature)
  const unsignedBase = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/authenticated/v${res.version}/${res.public_id}.jpg`
  console.log('2) unsigned authenticated delivery status:', await statusOf(unsignedBase), '(expect 401/403/404 — rejected)')

  // 3) take the signed blurred URL and STRIP the e_blur transform while keeping
  //    the old signature => signature mismatch => rejected.
  const tampered = signedBlur.replace(/e_blur:2000,?/,'').replace(/,e_blur:2000/,'')
  console.log('   tampered (e_blur removed) URL differs:', tampered !== signedBlur)
  console.log('3) signed URL with e_blur stripped status:', await statusOf(tampered), '(expect 401 — signature no longer valid)')

  // cleanup
  await cloudinary.uploader.destroy(res.public_id, { resource_type: 'image', type: 'authenticated' }).catch(() => {})
  console.log('done.')
}
run().catch(e => { console.error('ERROR', e); process.exit(1) })
