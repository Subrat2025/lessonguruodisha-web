// Screenshots of every Admin Dashboard section of the website, rendered by the real site code
// (local `next dev`) with API responses replaced by clearly-fake sample data.
// Usage: node adminshots.js <outDir> <siteBaseUrl> [mocks.js] [--probe]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = process.argv[2]
const SITE = process.argv[3]
const MOCKS = process.argv[4] && !process.argv[4].startsWith('--') ? require(path.resolve(process.argv[4])) : { routes: [] }
const PROBE = process.argv.includes('--probe')
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const ORIGIN = 'https://lessonguruodisha.com'
const W = +(process.env.W || 1440), H = +(process.env.H || 900)

const TABS = [['analytics', '📊 Analytics'], ['aicredits', '💎 AI Credits'], ['resources', '📚 Resources'], ['wsanalytics', '📈 WS Analytics'], ['adminassess', '🎯 Assessments'], ['officialpapers', '📋 Instant Papers'], ['shortlessonplans', '⭐ Short Lesson Plans'], ['mcmnotes', '📘 MCM Notes'], ['mcmtest', '🧠 MCM Test'], ['ajira', '🌅 Ajira Pathya Jojana'], ['lp', '🚀 Landing Page'], ['offers', '🔥 Offers'], ['msgqueue', '📣 Message Queue'], ['whatsapp', '📱 WhatsApp Campaigns'], ['revenue', '💰 Revenue'], ['qrpayments', '📱 QR Payments'], ['otphealth', '📲 OTP Health'], ['users', '👥 Users'], ['deletions', '🗑️ Account Deletions'], ['userprofiles', '🗓️ User Profiles'], ['security', '🔐 Security'], ['docsec', '📄 Doc Security'], ['reviews', '⭐ Reviews'], ['referrals', '🎁 Referrals'], ['answerkey', '📝 Answer Keys'], ['store', '🛍️ Store'], ['abp', '📘 Panchapadi (ABP)'], ['tob', '📋 Teacher Observation'], ['lomaster', '📗 LO Master (OCF-SE 2026-27)'], ['prompt', '📣 Prompt'], ['inbox', '📩 Inbox'], ['planmgr', '💎 Plans'], ['curriculum', '🗂️ Curriculum'], ['curriculumbackfill', '🔄 Curriculum Backfill'], ['unresolved', '🈳 WS Language'], ['panchahtml', '📘 Panchapadi HTML'], ['aigen', '🤖 AI Lesson Generator'], ['pacing', '📅 Academic Pacing'], ['add', '➕ Add Lesson'], ['html', '📄 HTML Import'], ['5e', '🎓 Class 9-10 5E'], ['qbimport', '📚 QB Import'], ['qa', '📝 Q&A Worksheets'], ['pdfs', '📕 Books & PDFs'], ['drive', '☁️ Drive Books'], ['sections', '📚 Sections Upload'], ['bulk', '⚡ CSV/JSON'], ['bulkch', '📑 Bulk Chapters'], ['bulkp', '🔢 Bulk Periods'], ['ai', '✨ AI Studio'], ['locorrect', '🎯 LO Code Correction'], ['loreconcile', '🔧 LO Reconcile'], ['subrecovery', '🔄 Subscription Recovery'], ['renewalanalytics', '🔁 Renewal Funnel'], ['ads', '📢 Advertisements'], ['assessstore', '🛒 Assessment Store'], ['r2migration', '🗄️ R2 Migration'], ['logs', '📋 Logs']]

const ADMIN = { id: 'admin-demo', name: 'Demo Admin', mobile: '9000000000', role: 'admin', school: 'Lesson Guru HQ',
  subscription: { plan: 'lifetime', status: 'active', expiryDate: '2099-01-01T00:00:00.000Z' }, securitySetupCompleted: true }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 2), locale: 'en-IN', timezoneId: 'Asia/Kolkata' })
  const unmocked = new Map()
  await ctx.route('**/*', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    if (u.origin !== ORIGIN) {
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.host)) return route.continue().catch(() => route.abort())
      return route.abort()
    }
    if (u.pathname.startsWith('/api/')) {
      const p = u.pathname.slice(4)
      if (p === '/auth/me') return route.fulfill({ json: { user: ADMIN } })
      for (const [re, fn] of MOCKS.routes) {
        const m = p.match(re)
        if (m) return route.fulfill({ json: typeof fn === 'function' ? fn(m, u, req) : fn })
      }
      unmocked.set(req.method() + ' ' + p, (unmocked.get(req.method() + ' ' + p) || 0) + 1)
      return route.fulfill({ json: req.method() === 'GET' ? {} : { ok: true } })
    }
    try { return route.fulfill({ response: await route.fetch({ url: SITE + u.pathname + u.search, timeout: 300000 }) }) } catch (e) { return route.abort() }
  })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('em_token', 'demo-admin-token')
      localStorage.setItem('em_install_dismissed', '1')
      localStorage.setItem('em_ref_prompt_at', String(Date.now()))
    } catch (e) {}
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]))
  await page.goto(ORIGIN + '/admin', { waitUntil: 'load', timeout: 300000 })
  await page.waitForSelector('text=Admin Dashboard', { timeout: 120000 })
  await page.waitForTimeout(2500)
  const report = []
  let i = 0
  for (const [id, label] of TABS) {
    i++
    if (ONLY && !ONLY.includes(id)) continue
    errors.length = 0
    const btn = page.locator('button', { hasText: label }).first()
    try {
      await btn.click({ timeout: 15000 })
    } catch (e) {
      report.push([id, 'NO BUTTON']); continue
    }
    await page.waitForTimeout(+(process.env.WAIT || 2200))
    const crashed = await page.locator('text=/Application error|Something went wrong|Unhandled Runtime Error/').count()
    const name = `admin-${String(i).padStart(2, '0')}-${id}`
    if (!PROBE) {
      // show only the active section's pill, and hide floating overlays (bottom bar, WhatsApp button, toasts)
      await page.evaluate((label) => {
        window.__hidden = []
        const hide = (el) => { window.__hidden.push([el, el.style.display]); el.style.display = 'none' }
        document.querySelectorAll('.scroll-hide button').forEach(b => { if (b.textContent.trim().indexOf(label) !== 0) hide(b) })
        document.querySelectorAll('body *').forEach(el => { if (getComputedStyle(el).position === 'fixed') hide(el) })
        window.scrollTo(0, 0)
      }, label)
      await page.waitForTimeout(300)
      const full = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true, clip: { x: 0, y: 0, width: W, height: Math.min(full, +(process.env.MAXH || 2200)) } })
      await page.evaluate(() => { (window.__hidden || []).forEach(([el, d]) => { el.style.display = d }) })
    }
    report.push([id, crashed ? 'CRASH' : 'ok', errors.slice(0, 2).join(' | ')])
    if (crashed) { // recover for the next tab
      await page.goto(ORIGIN + '/admin', { waitUntil: 'load', timeout: 300000 })
      await page.waitForSelector('text=Admin Dashboard', { timeout: 120000 })
      await page.waitForTimeout(1500)
    }
  }
  for (const r of report) console.log(r.join('\t'))
  if (PROBE) {
    console.log('\nUNMOCKED API CALLS:')
    for (const [k, n] of [...unmocked].sort()) console.log(n, k)
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
