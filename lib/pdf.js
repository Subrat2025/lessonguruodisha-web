// Server-side PDF renderer.
// Uses `puppeteer` + `@sparticuz/chromium` — a serverless-friendly bundled
// Chromium binary that ships INSIDE node_modules and unpacks to /tmp at runtime.
// This makes the endpoint work in BOTH the local preview container and any
// production deployment (Emergent, Docker, Vercel, VPS, etc.) without needing
// system chromium.
//
// Resolution order:
//   1. @sparticuz/chromium (portable, bundled in node_modules)
//   2. puppeteer.executablePath() (auto-downloaded chromium in ~/.cache)
//   3. System chromium at well-known paths (fallback for preview / VPS)
//   4. Clear actionable error listing every path tried

import puppeteer from 'puppeteer'
import { existsSync } from 'fs'

const SYSTEM_CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/root/bin/chromium',
  '/snap/bin/chromium',
  '/usr/lib/chromium/chromium',
  '/usr/local/bin/chromium',
].filter(Boolean)

// Resolve executable path + launch args once (cached).
let _resolved = null // { executablePath, extraArgs }
const resolveExecutable = async () => {
  if (_resolved) return _resolved
  // 1. PREFER system Chromium at known paths — it is arch-native (works on
  //    both x86_64 and arm64 containers).  This is the ONLY resolution that
  //    works on aarch64 hosts because @sparticuz/chromium and puppeteer's
  //    downloaded Chromium currently ship x86_64-only binaries.
  for (const p of SYSTEM_CHROMIUM_CANDIDATES) {
    try { if (existsSync(p)) { _resolved = { executablePath: p, extraArgs: [] }; return _resolved } } catch (_err) { /* skip */ }
  }
  // 2. Fallback: @sparticuz/chromium (x86_64 only — used only if no system chromium)
  try {
    const mod = await import('@sparticuz/chromium')
    const chromium = mod.default || mod
    const p = await chromium.executablePath()
    if (p && existsSync(p)) {
      _resolved = {
        executablePath: p,
        extraArgs: Array.isArray(chromium.args) ? chromium.args : [],
      }
      return _resolved
    }
  } catch (_err) { /* skip */ }
  // 3. Fallback: puppeteer's downloaded chromium
  try {
    const p = puppeteer.executablePath()
    if (p && existsSync(p)) { _resolved = { executablePath: p, extraArgs: [] }; return _resolved }
  } catch (_err) { /* skip */ }
  // 4. Give up with actionable error
  throw new Error(
    'Chromium executable not found. Tried these system paths: ' +
    SYSTEM_CHROMIUM_CANDIDATES.join(', ') +
    ' plus @sparticuz/chromium and puppeteer.executablePath(). ' +
    'On a Linux container run: `apt-get install -y chromium` (arch-native) — required for aarch64 hosts. ' +
    'Contact Emergent Support if this happens on production.'
  )
}

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
]

let _browser = null
let _launching = null

const getBrowser = async () => {
  if (_browser && _browser.connected) return _browser
  if (_launching) return _launching
  const { executablePath, extraArgs } = await resolveExecutable()
  // Merge args, dedupe (sparticuz includes ~40 args tuned for serverless)
  const args = Array.from(new Set([...(extraArgs || []), ...DEFAULT_ARGS]))
  _launching = puppeteer.launch({
    executablePath,
    headless: 'new',
    args,
  }).then(b => {
    _browser = b
    _launching = null
    b.on('disconnected', () => { if (_browser === b) _browser = null })
    return b
  }).catch(e => {
    _launching = null
    _browser = null
    throw e
  })
  return _launching
}

/**
 * Render HTML → PDF Buffer.
 * @param {string} html Full HTML document string
 * @param {object} opts { headerTemplate, footerTemplate, format='A4', margin, fitPages, hideSelector }
 * @returns {Promise<Buffer>}
 */
export async function htmlToPDFBuffer(html, opts = {}) {
  let attempt = 0
  // Retry once if the browser is in a bad state (killed / crashed).
  while (true) {
    try {
      const browser = await getBrowser()
      const page = await browser.newPage()
      try {
        // Use 'load' + explicit fonts.ready wait instead of 'networkidle0' —
        // Odia fonts are base64-embedded, so we don't need to wait for network
        // silence. Also bumped timeout 20s → 60s since long assessments with
        // many questions + QR + watermark can take ~15-25s to render in prod.
        page.setDefaultNavigationTimeout(60000)
        page.setDefaultTimeout(60000)
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
        // Wait for all @font-face declarations (embedded base64 + Google Fonts)
        // to finish loading so Odia glyphs render as proper script, not tofu.
        try {
          await Promise.race([
            page.evaluate(() => document.fonts && document.fonts.ready),
            new Promise(res => setTimeout(res, 5000)), // 5s hard cap on fonts.ready
          ])
        } catch (_err) { /* older chromium — skip */ }
        const render = (p) => p.pdf({
          format: opts.format || 'A4',
          landscape: !!opts.landscape,
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: !!(opts.headerTemplate || opts.footerTemplate),
          headerTemplate: opts.headerTemplate || '<div></div>',
          footerTemplate: opts.footerTemplate || '<div></div>',
          margin: opts.margin || { top: '18mm', right: '10mm', bottom: '18mm', left: '10mm' },
        })
        // opts.fitPages > 0: shrink the content until it fills exactly that many pages
        if (opts.fitPages > 0) {
          const { renderFitted } = await import('./pdf-fit.js')
          return await renderFitted(page, render, opts.fitPages, { hideSelector: opts.hideSelector })
        }
        return Buffer.from(await render(page))
      } finally {
        try { await page.close() } catch (_err) { /* ignore */ }
      }
    } catch (e) {
      if (attempt === 0 && /Target closed|Protocol error|Browser has been closed|Session closed|Connection closed/i.test(String(e.message))) {
        try { if (_browser) await _browser.close() } catch (_err) { /* ignore */ }
        _browser = null
        attempt++
        continue
      }
      throw e
    }
  }
}

/**
 * Render HTML → image Buffer (webp or png) via the shared Chromium.
 * Used for store product COVER generation. Odia/Devanagari shape correctly
 * because we render with real Chromium (not satori/next-og).
 * @param {string} html Full HTML document
 * @param {object} opts { width=800, height=1000, type='webp', quality=80, scale=1 }
 */
export async function htmlToImageBuffer(html, opts = {}) {
  const width = opts.width || 800
  const height = opts.height || 1000
  const type = opts.type === 'png' ? 'png' : 'webp'
  const quality = opts.quality != null ? opts.quality : 80
  let attempt = 0
  while (true) {
    try {
      const browser = await getBrowser()
      const page = await browser.newPage()
      try {
        await page.setViewport({ width, height, deviceScaleFactor: opts.scale || 1 })
        page.setDefaultTimeout(60000)
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
        try {
          await Promise.race([
            page.evaluate(() => document.fonts && document.fonts.ready),
            new Promise(res => setTimeout(res, 5000)),
          ])
        } catch (_err) { /* older chromium — skip */ }
        const shotOpts = { type, clip: { x: 0, y: 0, width, height } }
        if (type === 'webp') shotOpts.quality = quality
        const buf = await page.screenshot(shotOpts)
        return Buffer.from(buf)
      } finally {
        try { await page.close() } catch (_err) { /* ignore */ }
      }
    } catch (e) {
      if (attempt === 0 && /Target closed|Protocol error|Browser has been closed|Session closed|Connection closed/i.test(String(e.message))) {
        try { if (_browser) await _browser.close() } catch (_err) { /* ignore */ }
        _browser = null
        attempt++
        continue
      }
      throw e
    }
  }
}

// Graceful shutdown
if (typeof process !== 'undefined' && !process.__pdfCleanupHooked) {
  process.__pdfCleanupHooked = true
  const close = async () => { try { if (_browser) await _browser.close() } catch (_err) { /* ignore */ } }
  process.on('beforeExit', close)
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
}
