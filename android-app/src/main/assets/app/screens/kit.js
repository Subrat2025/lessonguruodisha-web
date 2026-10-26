/* Shared pieces for the tool screens: curriculum picker, printable documents, website fallback. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui } = LG
  const LEVELS = ['class', 'book', 'chapter', 'lesson']

  /**
   * Bottom-sheet picker: class → book → chapter → lesson. `to` is the deepest level needed.
   * Resolves with { class, book, chapter, lesson } (objects with id + name), or null if closed.
   */
  LG.pick = function ({ to = 'lesson', title } = {}) {
    const D = LG.lessonData
    const depth = LEVELS.indexOf(to)
    return new Promise((resolve) => {
      const path = []
      let done = false
      const bg = LG.sheet('<div id="pk"></div>', () => {})
      const finish = (v) => { if (done) return; done = true; bg.remove(); resolve(v) }
      new MutationObserver((m, o) => { if (!bg.isConnected) { o.disconnect(); if (!done) { done = true; resolve(null) } } }).observe(document.body, { childList: true })
      const box = bg.querySelector('#pk')
      const sh = bg.querySelector('.sheet'); sh.style.maxHeight = '80vh'; sh.style.overflowY = 'auto'
      const head = (t) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">${path.length ? `<button class="tap" data-up style="width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:#F3F0FF;transform:rotate(180deg)">${icon('chev', 20, 2.4)}</button>` : ''}<b style="font-size:16px">${esc(t)}</b></div>`
      const rows = (items, f) => `<div class="list">${items.map(f).join('')}</div>`
      const show = async () => {
        box.innerHTML = ui.skeleton(4)
        try {
          const lvl = path.length
          if (lvl === 0) { const cs = await D.getClasses(); box.innerHTML = head(title || 'Choose class') + rows(cs, (c, i) => ui.row({ ic: (c.name.match(/\d+/) || ['B'])[0], g: ['sunset', 'violet', 'teal', 'rose'][i % 4], t: c.name, attrs: `data-pick="${esc(c.id)}" data-name="${esc(c.name)}"` })) }
          else if (lvl === 1) { const bs = await D.getBooks(path[0].id); box.innerHTML = head(path[0].name) + rows(bs, (b, i) => ui.row({ ic: b.emoji || 'book', g: ['teal', 'blue', 'amber'][i % 3], t: b.name, attrs: `data-pick="${esc(b.id)}" data-name="${esc(b.name)}"` })) }
          else if (lvl === 2) { const ch = await D.getChapters(path[0].id, path[1].id); box.innerHTML = head(path[1].name) + rows(ch, (c, i) => ui.row({ ic: String(i + 1), g: 'violet', t: c.name || c.title, attrs: `data-pick="${esc(c.id)}" data-name="${esc(c.name || c.title)}"` })) }
          else { const ls = await D.getLessons(path[2].id); box.innerHTML = head(path[2].name) + rows(ls, (l, i) => ui.row({ ic: 'P' + (l.period || i + 1), g: 'rose', t: l.title || 'Period ' + l.period, attrs: `data-pick="${esc(l.id)}" data-name="${esc(l.title || '')}" data-period="${esc(l.period || '')}"` })) }
          LG.hydrateIcons(box)
        } catch (e) { LG.showError(box, e, show) }
      }
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-up]')) { path.pop(); return show() }
        const b = e.target.closest('[data-pick]'); if (!b) return
        path.push({ id: b.dataset.pick, name: b.dataset.name, period: b.dataset.period })
        LG.native.haptic('tap')
        if (path.length > depth) {
          const out = {}; LEVELS.forEach((k, i) => { out[k] = path[i] || null })
          out.label = path.map((p, i) => i === 3 ? 'P' + p.period : p.name).join(' · ')
          return finish(out)
        }
        show()
      })
      show()
    })
  }

  /** Print the visible screen's .print-area through Android's print dialog (Save as PDF / printer). */
  /** Teacher (left) and headmaster (right) signature row, used on every lesson-plan page. */
  LG.sigHtml = () => `<table class="print-sig" style="width:100%;margin-top:18px;font-size:10pt;page-break-inside:avoid;border-collapse:collapse"><tr>
    <td style="text-align:center;font-weight:700;border-top:1px solid #000;padding-top:6px;width:42%">ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର<br><span style="font-weight:400;font-size:8.5pt">Teacher's signature</span></td>
    <td style="width:16%"></td>
    <td style="text-align:center;font-weight:700;border-top:1px solid #000;padding-top:6px;width:42%">ପ୍ରଧାନ ଶିକ୍ଷକଙ୍କ ସ୍ୱାକ୍ଷର<br><span style="font-weight:400;font-size:8.5pt">Headmaster's signature</span></td>
  </tr></table>`

  /**
   * Print the visible screen's .print-area through Android's print dialog (Save as PDF / printer).
   * { lesson: true } = a lesson plan: signatures at the bottom and shrunk to fit ONE A4 page.
   */
  LG.printNow = function (title, { lesson = false } = {}) {
    const pages = document.querySelectorAll('.pg.in')
    const area = pages.length ? pages[pages.length - 1].querySelector('.print-area') : document.querySelector('.print-area')
    let sig = null
    if (area && lesson) {
      sig = document.createElement('div'); sig.className = 'print-only'; sig.innerHTML = LG.sigHtml()
      area.appendChild(sig)
      // A4 portrait at 10 mm margins = 190 × 277 mm; shrink the plan until it fits that height
      area.style.width = '190mm'; area.style.zoom = '1'
      const mm = area.getBoundingClientRect().width / 190
      const h = area.scrollHeight
      area.style.zoom = String(Math.min(1, (277 * mm * 0.98) / h))
    }
    document.body.classList.add('printing')
    const restore = () => {
      document.body.classList.remove('printing')
      if (sig) sig.remove()
      if (area && lesson) { area.style.width = ''; area.style.zoom = '' }
      document.removeEventListener('visibilitychange', onVis)
    }
    const onVis = () => { if (document.visibilityState === 'visible') setTimeout(restore, 400) }
    if (window.LGApp) {
      LGApp.print(title || 'Lesson Guru')
      document.addEventListener('visibilitychange', onVis) // the print dialog covers the app; restore when it closes
      setTimeout(restore, 60000)
    } else { window.print(); restore() }
  }

  /** Download a file from an /api path with the teacher's login, then save it on the phone + Cloud. */
  LG.downloadApi = async function (path, name, opts = {}) {
    const r = await LG.api(path.replace(/^\/api/, ''), { raw: true, method: opts.method, body: opts.body })
    const type = r.headers.get('content-type') || ''
    if (type.includes('json')) { const j = await r.json(); throw new Error(j.error || j.message || 'Download not available') }
    const cd = r.headers.get('content-disposition') || ''
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i)
    const fname = name || (m ? decodeURIComponent(m[1]) : 'LessonGuru-' + Date.now())
    await LG.saveBlob(await r.blob(), fname, { sourcePath: opts.sourcePath || '' })
    LG.native.haptic('success')
    return fname
  }

  /** "Open full version on the website" card for rarely used extras that stay on the website for now. */
  LG.ui.webLink = (path, label, sub) => `<button class="row tap" data-web="${esc(path)}" style="background:linear-gradient(135deg,#F5F3FF,#FDF2F8)">
      <span class="row-ic" style="${LG.gStyle('slate')}">${icon('open', 20)}</span>
      <span class="row-t"><b>${esc(label)}</b><small>${esc(sub || 'Opens the full website version')}</small></span><span class="row-chev">${icon('chev', 18, 2.4)}</span></button>`
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-web]'); if (!t) return
    LG.native.haptic('tap'); location.href = t.dataset.web
  })

  /** In-app yes/no dialog (window.confirm is not shown inside the Android app). */
  LG.confirm = (title, text, okLabel = 'OK') => new Promise((resolve) => {
    const bg = LG.sheet(`<b style="font-size:17px">${esc(title)}</b><p style="color:var(--ink-2);font-size:14px;margin:8px 0 18px">${esc(text)}</p>
      <div class="dock" style="position:static;padding:0;background:none">${ui.btn('Cancel', 'data-act="no"', 'soft')}${ui.btn(esc(okLabel), 'data-act="yes"', 'primary')}</div>`, (act, el) => { el.remove(); resolve(act === 'yes') })
    new MutationObserver((m, o) => { if (!bg.isConnected) { o.disconnect(); resolve(false) } }).observe(document.body, { childList: true })
  })

  /** Segmented step indicator for multi-step tools. */
  LG.ui.steps = (labels, at) => `<div class="stepper">${labels.map((l, i) => `<span class="${i < at ? 'done' : i === at ? 'on' : ''}"><i>${i < at ? '✓' : i + 1}</i>${esc(l)}</span>`).join('')}</div>`

  /** Select box styled like the inputs. options: [[value,label]] */
  LG.ui.select = ({ id, label, options, value = '', attrs = '' }) => `<label class="fld"><span>${esc(label)}</span><div class="fld-in"><select id="${id}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>`
})()
