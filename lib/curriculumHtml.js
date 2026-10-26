// ============================================================
//  Curriculum HTML Exporter
// ------------------------------------------------------------
//  Renders Admin-downloadable HTML files for a curriculum chapter.
//  Two flavors:
//    • renderChapterContentHTML() → FULL page: chapter meta + every lesson
//        with Prasanga/Topic, LO codes, Panchapadi Sopana (5 steps with
//        Teacher/Student activities + timing), TLM chips, homework.
//    • renderChapterIndexHTML()  → LIGHTWEIGHT list of lessons/prasangas
//        + LO codes only.  Ideal as a chapter cover / table-of-contents.
//
//  Both files:
//    • embed Noto Sans Oriya (base64) so Odia glyphs render everywhere
//      → no "tofu boxes" regardless of the OS/browser
//    • self-contained (no external CSS/JS/images) → safe to email/zip
//    • print-friendly A4 CSS
// ============================================================
import { fontFaceCSS } from './paperGenerator/fontLoader.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const PANCHAPADI_STEPS = [
  { key: 'prastabana', label: 'ଅଧୀତି',   en: 'Adhiti · Introduction' },
  { key: 'anweshana',  label: 'ବୋଧ',     en: 'Bodha · Comprehension' },
  { key: 'alochana',   label: 'ଅଭ୍ୟାସ',  en: 'Abhyasa · Practice' },
  { key: 'prayoga',    label: 'ପ୍ରୟୋଗ',  en: 'Prayoga · Application' },
  { key: 'mulyayana',  label: 'ପ୍ରସାର',  en: 'Prasar · Extension' },
]

// URL-safe slugger — trims Odia/Devanagari, keeps ASCII alnum + dashes.
// Used for filenames so downloads travel safely across OS/email.
export function slugify(input) {
  const raw = String(input || 'file').trim().toLowerCase()
  // Transliterate stripping of non-ASCII glyphs; fall back to a stable hash
  // so pure-Odia titles still produce a unique-ish slug.
  let s = raw.replace(/[^\x20-\x7e]+/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!s) {
    let h = 0
    for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) & 0xffffffff
    s = 'ch-' + Math.abs(h).toString(36)
  }
  return s.slice(0, 60)
}

// ---- Shared CSS ------------------------------------------------
function sharedCss() {
  return `
${fontFaceCSS('Odia')}
* { box-sizing: border-box; }
@page { size: A4; margin: 12mm; }
html, body {
  margin: 0; padding: 0;
  font-family: 'Noto Sans Oriya', 'Noto Sans', 'Segoe UI', Tahoma, sans-serif;
  color: #111;
  background: #fff;
  line-height: 1.4;
}
.container { max-width: 900px; margin: 0 auto; padding: 20px 24px 40px; }
.brand-bar {
  background: linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #9333ea 100%);
  color: #fff; padding: 14px 24px; border-radius: 8px;
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.brand-bar .brand-title { font-size: 18px; font-weight: 900; letter-spacing: 0.5px; }
.brand-bar .brand-subtitle { font-size: 11px; opacity: 0.9; }
.brand-bar .brand-right { font-size: 11px; text-align: right; opacity: 0.95; }
.meta-card {
  border: 1px solid #e5e7eb; background: #fafafa;
  border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;
  font-size: 13px;
}
.meta-card .meta-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin: 3px 0; }
.meta-card .meta-label { font-weight: 700; color: #4c1d95; min-width: 90px; }
h1.chapter-title { font-size: 22px; font-weight: 900; color: #111; margin: 0 0 8px; }
h2.section-title { font-size: 16px; font-weight: 800; color: #3730a3; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; }
h3.lesson-title { font-size: 15px; font-weight: 800; color: #111; margin: 0 0 6px; }

.lesson-card {
  border: 1px solid #cbd5e1; border-radius: 8px;
  padding: 12px 14px; margin: 12px 0;
  background: #fff; break-inside: avoid; page-break-inside: avoid;
}
.lesson-header {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding-bottom: 8px; border-bottom: 1px dashed #cbd5e1; margin-bottom: 10px;
}
.period-badge {
  display: inline-block; padding: 2px 10px;
  border-radius: 12px; background: #dbeafe; color: #1e40af;
  font-weight: 800; font-size: 11px;
}
.lesson-topic { color: #6b7280; font-size: 12px; }

.lo-chips { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 4px 0 10px; }
.lo-chip {
  display: inline-block; padding: 2px 8px;
  border: 1px solid #6366f1; background: #eef2ff;
  color: #3730a3; border-radius: 12px;
  font-size: 11px; font-weight: 700;
}

.tp-panchapadi { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
.tp-panchapadi th, .tp-panchapadi td { border: 1px solid #94a3b8; padding: 5px 7px; vertical-align: top; }
.tp-panchapadi th { background: #fef3c7; text-align: center; font-weight: 700; color: #111; }
.tp-panchapadi th .th-en { display: block; font-size: 9.5px; font-weight: 500; color: #6b7280; }
.tp-step-label { text-align: center; font-weight: 700; width: 18%; }
.tp-step-en { font-size: 10px; font-weight: 500; color: #6b7280; }
.tp-step-time { text-align: center; width: 10%; color: #4c1d95; font-weight: 700; }
.tp-empty { color: #9ca3af; font-style: italic; }
.tp-empty-block { padding: 8px 10px; color: #6b7280; font-style: italic; font-size: 12px; background: #f9fafb; border-radius: 6px; }

.tlm-chips { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 6px 0; }
.tlm-chip {
  display: inline-block; padding: 3px 10px;
  border: 1px solid #10b981; background: #ecfdf5; color: #065f46;
  border-radius: 12px; font-size: 11px; font-weight: 600;
}

.subheading { font-size: 12px; font-weight: 700; color: #3730a3; margin: 8px 0 4px; }
.homework-box {
  background: #fff7ed; border: 1px solid #fdba74;
  border-radius: 6px; padding: 8px 12px; font-size: 12px;
  color: #7c2d12; margin: 8px 0;
}

/* Chapter index-file styles */
.toc { list-style: none; padding: 0; margin: 0; }
.toc li {
  padding: 8px 12px; margin-bottom: 6px;
  background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px;
  display: flex; gap: 10px; align-items: baseline;
}
.toc .toc-period {
  min-width: 44px; padding: 2px 8px; text-align: center;
  background: #ede9fe; color: #6d28d9;
  border-radius: 8px; font-weight: 800; font-size: 11px;
}
.toc .toc-title { font-weight: 700; font-size: 13px; color: #111; flex: 1; }
.toc .toc-topic { color: #6b7280; font-size: 11px; }
.toc .toc-lo { margin-left: auto; }

.footer {
  margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb;
  font-size: 10px; color: #9ca3af; text-align: center;
}
`
}

function metaCard({ book, chapter, cls }) {
  return `
    <div class="meta-card">
      <div class="meta-row"><span class="meta-label">📚 ଶ୍ରେଣୀ · Class:</span> <span>${esc(cls?.name || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">📘 ପୁସ୍ତକ · Book:</span> <span>${esc(book?.name || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">📄 ଅଧ୍ୟାୟ · Chapter:</span> <span><b>#${esc(chapter?.order ?? '')}</b> · ${esc(chapter?.name || '—')}</span></div>
    </div>`
}

function brandBar(rightHtml = '') {
  return `
    <div class="brand-bar">
      <div>
        <div class="brand-title">LESSON GURU ODISHA</div>
        <div class="brand-subtitle">Curriculum Export · ପାଠ୍ୟକ୍ରମ ଡାଉନ୍‌ଲୋଡ୍</div>
      </div>
      <div class="brand-right">${rightHtml || `Generated: ${new Date().toISOString().slice(0, 10)}`}</div>
    </div>`
}

function loChipsHtml(codes = []) {
  const arr = Array.isArray(codes) ? codes.filter(Boolean) : []
  if (!arr.length) return '<span class="tp-empty">—</span>'
  return `<span class="lo-chips">${arr.map(c => `<span class="lo-chip">${esc(c)}</span>`).join('')}</span>`
}

function buildSteps(lesson) {
  const isFiveE = lesson?.format === 'fiveE' && Array.isArray(lesson?.fiveE?.stages) && lesson.fiveE.stages.length > 0
  return PANCHAPADI_STEPS.map((s, idx) => {
    if (isFiveE) {
      const stage = lesson.fiveE.stages[idx] || {}
      return {
        label: s.label, en: stage.name || s.en,
        time: stage.minutes ? `${stage.minutes} min` : (stage.timing || ''),
        teacher: stripHtml(stage.teacher || ''),
        student: stripHtml(stage.student || ''),
      }
    }
    const d = lesson?.panchapadi?.[s.key] || {}
    return {
      label: s.label, en: s.en,
      time: d.timing || d.duration || d.minutes || '',
      teacher: stripHtml(d.teacherActivityText || d.teacherActivity || ''),
      student: stripHtml(d.studentActivityText || d.studentActivity || ''),
    }
  })
}

function panchapadiTableHtml(lesson) {
  const steps = buildSteps(lesson)
  const hasAny = steps.some(s => s.teacher || s.student)
  if (!hasAny) return '<div class="tp-empty-block">Panchapadi Sopana: Not specified</div>'
  return `
    <table class="tp-panchapadi">
      <thead>
        <tr>
          <th>ସୋପାନ<span class="th-en">Step</span></th>
          <th>ସମୟ<span class="th-en">Time</span></th>
          <th>ଶିକ୍ଷଣ-ଶିକ୍ଷଣ ପ୍ରକ୍ରିୟା<span class="th-en">Teaching-Learning Process</span></th>
        </tr>
      </thead>
      <tbody>
        ${steps.map(s => `
          <tr>
            <td class="tp-step-label"><b>${esc(s.label)}</b><br/><span class="tp-step-en">${esc(s.en)}</span></td>
            <td class="tp-step-time">${esc(s.time || '—')}</td>
            <td>
              ${s.teacher ? `<div><b>ଶିକ୍ଷକ · Teacher:</b> ${esc(s.teacher)}</div>` : ''}
              ${s.student ? `<div style="margin-top:3px;"><b>ଛାତ୍ର · Student:</b> ${esc(s.student)}</div>` : ''}
              ${(!s.teacher && !s.student) ? '<span class="tp-empty">Not specified</span>' : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`
}

function tlmHtml(tlm) {
  const arr = Array.isArray(tlm) ? tlm.filter(t => String(t || '').trim()) : []
  if (!arr.length) return '<div class="tp-empty-block">TLM: Not specified</div>'
  return `<div class="tlm-chips">${arr.map(t => `<span class="tlm-chip">✓ ${esc(t)}</span>`).join('')}</div>`
}

// -------------------------------------------------------------
//  Full chapter content (content.html)
// -------------------------------------------------------------
export function renderChapterContentHTML({ cls, book, chapter, lessons = [] }) {
  const orderedLessons = [...lessons].sort((a, b) => (a.period || 0) - (b.period || 0))
  const lessonsHtml = orderedLessons.length ? orderedLessons.map(l => `
    <div class="lesson-card">
      <div class="lesson-header">
        <span class="period-badge">P${esc(l.period ?? '?')}</span>
        <h3 class="lesson-title">${esc(l.title || 'Lesson')}</h3>
      </div>
      ${l.topic ? `<div class="lesson-topic"><b>ପ୍ରସଙ୍ଗ · Topic:</b> ${esc(l.topic)}</div>` : ''}
      <div class="subheading">🎯 ଶିକ୍ଷଣ ଫଳ · Learning Outcomes</div>
      ${loChipsHtml(l.loCodes && l.loCodes.length ? l.loCodes : (l.loCode ? [l.loCode] : []))}
      <div class="subheading">📖 ପଞ୍ଚପଦୀ ସୋପାନ · Panchapadi Sopana</div>
      ${panchapadiTableHtml(l)}
      <div class="subheading">🎨 ଶିକ୍ଷଣ-ଶିକ୍ଷଣ ସାମଗ୍ରୀ · TLM</div>
      ${tlmHtml(l.tlm)}
      ${l.homework ? `<div class="subheading">📝 ଗୃହକାର୍ଯ୍ୟ · Homework</div><div class="homework-box">${esc(l.homework)}</div>` : ''}
    </div>`).join('') : '<div class="tp-empty-block">No lessons in this chapter.</div>'

  return `<!doctype html>
<html lang="or">
<head>
<meta charset="utf-8" />
<title>${esc(cls?.name || '')} · ${esc(book?.name || '')} · ${esc(chapter?.name || 'Chapter')}</title>
<style>${sharedCss()}</style>
</head>
<body>
<div class="container">
  ${brandBar(`<div><b>${esc(cls?.name || '')}</b></div><div>${esc(book?.name || '')}</div>`)}
  <h1 class="chapter-title">Chapter #${esc(chapter?.order ?? '')} · ${esc(chapter?.name || '')}</h1>
  ${metaCard({ cls, book, chapter })}
  <h2 class="section-title">📚 Chapter Content · ${orderedLessons.length} lesson${orderedLessons.length === 1 ? '' : 's'}</h2>
  ${lessonsHtml}
  <div class="footer">Lesson Guru Odisha · lessonguruodisha.in · Curriculum Export · ${new Date().toISOString().slice(0, 10)}</div>
</div>
</body>
</html>`
}

// -------------------------------------------------------------
//  Lightweight chapter index (index.html)
// -------------------------------------------------------------
export function renderChapterIndexHTML({ cls, book, chapter, lessons = [] }) {
  const orderedLessons = [...lessons].sort((a, b) => (a.period || 0) - (b.period || 0))
  const toc = orderedLessons.length ? `
    <ul class="toc">
      ${orderedLessons.map(l => `
        <li>
          <span class="toc-period">P${esc(l.period ?? '?')}</span>
          <div style="flex:1;">
            <div class="toc-title">${esc(l.title || 'Lesson')}</div>
            ${l.topic ? `<div class="toc-topic">${esc(l.topic)}</div>` : ''}
          </div>
          <div class="toc-lo">${loChipsHtml(l.loCodes && l.loCodes.length ? l.loCodes : (l.loCode ? [l.loCode] : []))}</div>
        </li>`).join('')}
    </ul>` : '<div class="tp-empty-block">No lessons in this chapter.</div>'

  return `<!doctype html>
<html lang="or">
<head>
<meta charset="utf-8" />
<title>${esc(chapter?.name || 'Chapter')} · Index</title>
<style>${sharedCss()}</style>
</head>
<body>
<div class="container">
  ${brandBar(`<div><b>${esc(cls?.name || '')}</b></div><div>${esc(book?.name || '')}</div>`)}
  <h1 class="chapter-title">Chapter #${esc(chapter?.order ?? '')} · ${esc(chapter?.name || '')}</h1>
  ${metaCard({ cls, book, chapter })}
  <h2 class="section-title">📋 Lesson Index · ${orderedLessons.length} lesson${orderedLessons.length === 1 ? '' : 's'}</h2>
  ${toc}
  <div class="footer">Lesson Guru Odisha · lessonguruodisha.in · Curriculum Export · ${new Date().toISOString().slice(0, 10)}</div>
</div>
</body>
</html>`
}
