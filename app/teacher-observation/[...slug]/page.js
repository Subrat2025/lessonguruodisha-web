// === TOB === Teacher Observation — task / project DETAIL route (server shell).
// Catch-all under /teacher-observation/... so the base tool page is untouched.
// Exports generateMetadata so WhatsApp/OG link previews show a per-task image.
import TaskProjectDetail from '@/components/tob/TaskProjectDetail'

const SUB = { odia: 'OD', english: 'E', hindi: 'H', sanskrit: 'S', math: 'MATH', evs: 'EV', science: 'SC', social: 'SS' }

function parse(slug = []) {
  const p = (slug || []).map(x => String(x || '').toLowerCase())
  const o = { cls: '', subject: '', chapter: null, set: null, term: null, kind: 'task', pos: 1 }
  o.cls = (p[0] || '').replace(/^class-/, '')
  o.subject = SUB[p[1]] || (p[1] || '').toUpperCase()
  let i = 2
  if (p[i] && p[i].startsWith('ch-')) { o.chapter = parseInt(p[i].replace(/\D/g, ''), 10); i++ }
  else if (p[i] && p[i].startsWith('set-')) { o.set = p[i].replace(/^set-/, '').toUpperCase(); i++; if (p[i] && p[i].startsWith('term-')) { o.term = parseInt(p[i].replace(/\D/g, ''), 10); i++ } }
  if (p[i] === 'task' || p[i] === 'project') { o.kind = p[i]; i++ }
  if (p[i]) o.pos = parseInt(p[i], 10) || 1
  return o
}
function qstring(o) {
  const qp = new URLSearchParams({ class: o.cls, subject: o.subject, part: o.kind, num: String(o.pos) })
  if (o.chapter) qp.set('chapter', String(o.chapter))
  else if (o.set) { qp.set('set', o.set); qp.set('term', String(o.term || 1)) }
  return qp.toString()
}

export async function generateMetadata({ params }) {
  const o = parse(params?.slug)
  const BASE = process.env.NEXT_PUBLIC_BASE_URL || ''
  const qs = qstring(o)
  const ogUrl = `${BASE}/api/tob/og?${qs}`
  let title = 'ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ୨୫ ମାର୍କ · Teacher Observation'
  let desc = 'SCERT 2026-27 · Task & Project · LessonGuru Odisha'
  try {
    const r = await fetch(`${BASE}/api/tob/detail?${qs}`, { cache: 'no-store' })
    if (r.ok) {
      const { detail: d } = await r.json()
      if (d) {
        const lbl = d.part === 'B' ? `ପ୍ରକଳ୍ପ ${d.pos}` : `କାର୍ଯ୍ୟ ${d.pos}`
        const where = d.type === 'set' ? `ସେଟ୍ ${d.setCode} · ଟର୍ମ ${d.term}` : `ଅଧ୍ୟାୟ ${d.chapterNo}`
        title = `${lbl}: ${d.title}`
        desc = `ଶ୍ରେଣୀ ${d.class} ${d.subject_printed || d.subject_id} · ${where} · ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ୨୫ ମାର୍କ`
      }
    }
  } catch (_) {}
  return {
    title, description: desc,
    openGraph: { title, description: desc, type: 'article', images: [{ url: ogUrl, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description: desc, images: [ogUrl] },
  }
}

export default function Page({ params }) {
  return <TaskProjectDetail slug={params?.slug || []} />
}
