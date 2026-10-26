// ============================================================
// LessonGuru Odisha — Font loader for PDF rendering.
// Base64-encodes the Noto Sans TTFs bundled in /app/public/fonts
// so the generated HTML is fully self-contained.  This survives
// container respawns (fonts live in /app which is persistent) and
// works even when the OS-level `fonts-noto-core` package has been
// wiped — Chromium reads the font straight from the CSS data URL.
//
// Cache is process-lifetime; ~100–230KB per font once loaded.
// ============================================================

import { readFileSync } from 'node:fs'
import path from 'node:path'

const FONT_DIR = path.resolve(process.cwd(), 'public', 'fonts')

const _cache = new Map()   // { key: base64 string }
const _missing = new Set() // files that are absent — logged once, then silent

function loadBase64(file) {
  if (_cache.has(file)) return _cache.get(file)
  if (_missing.has(file)) return ''
  try {
    const buf = readFileSync(path.join(FONT_DIR, file))
    const b64 = buf.toString('base64')
    _cache.set(file, b64)
    return b64
  } catch (err) {
    _missing.add(file)
    console.warn(`[fontLoader] Missing bundled font: /public/fonts/${file}. Falling back to local() only.`)
    return ''
  }
}

function faceRule(family, file, weight = 400) {
  const b64 = loadBase64(file)
  const localA = family.replace(/ /g, ' ') + (weight === 700 ? ' Bold' : '')
  const localB = family.replace(/ /g, '') + (weight === 700 ? '-Bold' : '-Regular')
  const src = b64
    ? `local('${localA}'), local('${localB}'), url(data:font/truetype;base64,${b64}) format('truetype')`
    : `local('${localA}'), local('${localB}')`
  return `@font-face { font-family: '${family}'; src: ${src}; font-weight: ${weight}; font-style: normal; font-display: block; }`
}

// Return @font-face declarations for the required language(s).
// Latin is always included as a fallback because MCQ options may
// contain digits / units / dashes.
export function fontFaceCSS(language = 'Odia') {
  const rules = []
  // Embed ALL supported Indic scripts + Latin every time so a mixed-language
  // document (e.g. a Hindi lesson plan with Odia Panchapadi step labels) never
  // falls back to a missing system font and renders boxes. `language` is kept
  // for API compatibility but no longer restricts which faces are embedded.
  rules.push(faceRule('Noto Sans Oriya', 'NotoSansOriya-Regular.ttf', 400))
  rules.push(faceRule('Noto Sans Oriya', 'NotoSansOriya-Bold.ttf', 700))
  rules.push(faceRule('Noto Sans Devanagari', 'NotoSansDevanagari-Regular.ttf', 400))
  rules.push(faceRule('Noto Sans Devanagari', 'NotoSansDevanagari-Bold.ttf', 700))
  // Latin fallback for numbers / units / punctuation appearing inside any language.
  rules.push(faceRule('Noto Sans', 'NotoSans-Regular.ttf', 400))
  rules.push(faceRule('Noto Sans', 'NotoSans-Bold.ttf', 700))
  return rules.join('\n')
}
