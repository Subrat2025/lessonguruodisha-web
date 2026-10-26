/* Lesson plans: classes → books → chapters → periods → lesson reader (with PDF / Word download). */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui, od } = LG

  const GRADS = ['sunset', 'violet', 'teal', 'rose', 'blue', 'amber', 'green', 'fuchsia', 'indigo']
  const grad = (i) => GRADS[i % GRADS.length]
  const STEPS = [
    { k: 'prastabana', n: '୧', t: 'ଅଧୀତି', e: 'Adhiti', time: '୫ ମିନିଟ୍', g: 'sunset', ic: '🌅' },
    { k: 'anweshana', n: '୨', t: 'ବୋଧ', e: 'Bodha', time: '୧୫ ମିନିଟ୍', g: 'violet', ic: '💡' },
    { k: 'alochana', n: '୩', t: 'ଅଭ୍ୟାସ', e: 'Abhyasa', time: '୧୦ ମିନିଟ୍', g: 'teal', ic: '✍️' },
    { k: 'prayoga', n: '୪', t: 'ପ୍ରୟୋଗ', e: 'Prayoga', time: '୧୦ ମିନିଟ୍', g: 'blue', ic: '🛠️' },
    { k: 'mulyayana', n: '୫', t: 'ପ୍ରସାର', e: 'Prasara', time: '୫ ମିନିଟ୍', g: 'rose', ic: '🌱' },
  ]
  const FIVE_E = {
    ENGAGE: ['Engage', '🎯', 'rose'], EXPLORE: ['Explore', '🔍', 'amber'], EXPLAIN: ['Explain', '💡', 'green'],
    ELABORATE: ['Elaborate', '🚀', 'blue'], EVALUATE: ['Evaluate', '✅', 'fuchsia'],
  }

  // ---- shared data (cached; same public endpoints the website uses)
  const getClasses = () => LG.cached('classes', () => LG.api('/classes').then(d => (d.classes || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))))
  const getBooks = (classId) => LG.cached('books:' + classId, () => LG.api('/books', { query: { classId, counts: 1 } }).then(d => (d.books || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))))
  const getChapters = (classId, bookId) => LG.cached('ch:' + classId + ':' + bookId, () => LG.api('/chapters', { query: { classId, bookId, scope: 'lessons' } }).then(d => (d.chapters || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))))
  const getLessons = (chapterId) => LG.cached('ls:' + chapterId, () => LG.api('/lessons', { query: { chapterId } }).then(d => (d.lessons || []).slice().sort((a, b) => (a.period || 0) - (b.period || 0))), 3 * 60 * 1000)

  const className = (c) => (c && (c.name || '')) || ''
  function saveNav(context) { // keeps "Continue where you left off" on Home working
    LG.LS.set('lg_navState_v1', { ts: Date.now(), context })
  }
  function classForTile(classes, cls) {
    if (!cls) return null
    const want = String(cls).toUpperCase()
    return classes.find(c => want === 'B' ? /balvatika|ବାଳ|bal\s?vatika/i.test(c.name) : new RegExp('(^|\\D)' + want + '(\\D|$)').test(c.name.replace(/[୦-୯]/g, d => '୦୧୨୩୪୫୬୭୮୯'.indexOf(d))))
  }

  // ================================================================ CLASSES
  LG.page('classes', {
    paths: ['/lessons', '/books'], title: 'Lesson Plans', subtitle: 'ଶିକ୍ଷଣ ଯୋଜନା · all planning tools',
    async render(ctx) {
      if (ctx.params.classId) { ctx.push('books', { classId: ctx.params.classId }, { replace: true }); return }
      ctx.body.innerHTML = `<div class="tiles">${'<div class="sk-row" style="height:118px;border-radius:22px"></div>'.repeat(6)}</div>`
      const classes = await getClasses()
      const pre = classForTile(classes, ctx.params.cls)
      const tools = LG.TOOLS.filter(t => t.cat === 'plan' && t.id !== 'lessons')
      ctx.body.innerHTML = `
        <button class="sbox tap" data-pg-open="/search" style="width:100%;text-align:left">${icon('search', 20)}<span style="color:var(--muted);padding:15px 0">Search any lesson or topic…</span></button>
        <div class="sec-t"><h3>Planning tools</h3><small class="od">ଯୋଜନା ସାଧନ</small></div>
        <div class="ptools">${tools.map((t, i) => `<button class="ptool tap" data-go="${esc(t.path)}" style="animation-delay:${i * 40}ms">
          <span class="pt-ic" style="${LG.gStyle(t.g)}">${icon(t.i, 24)}</span>${t.b ? `<em class="badge ${t.b === 'NEW' ? 'new' : ''}">${t.b}</em>` : ''}
          <b>${esc(t.t)}</b><small class="od">${esc(t.o)}</small></button>`).join('')}</div>
        <div class="sec-t"><h3>Lesson plans by class</h3><small class="od">ଶ୍ରେଣୀ ବାଛନ୍ତୁ</small></div>
        <div class="tiles">${classes.map((c, i) => `
          <button class="tile tap" data-cid="${esc(c.id)}" style="${LG.gStyle(grad(i))};animation-delay:${i * 35}ms">
            <span class="t-big">${esc(c.emoji || (/balvatika/i.test(c.name) ? '🧸' : (c.name.match(/\d+/) || [''])[0]))}</span>
            <b>${esc(c.name)}</b><small class="od">${esc(c.nameOdia || '')}</small>
          </button>`).join('')}</div>`
      ctx.on('click', '[data-cid]', (b) => ctx.push('books', { classId: b.dataset.cid }))
      if (pre) ctx.push('books', { classId: pre.id })
    },
  })

  // ================================================================ BOOKS
  LG.page('books', {
    title: 'Books', tone: 'sunset',
    async render(ctx) {
      const { classId } = ctx.params
      ctx.body.innerHTML = ui.skeleton(6)
      const [classes, books] = await Promise.all([getClasses(), getBooks(classId)])
      const cls = classes.find(c => c.id === classId)
      ctx.title(className(cls) || 'Books', 'ବିଷୟ ବାଛନ୍ତୁ · Choose a subject')
      if (!books.length) { ctx.body.innerHTML = ui.empty('📚', 'No books yet', 'Books for this class are being added. Please check back soon.'); return }
      ctx.body.innerHTML = `<div class="list">${books.map((b, i) => ui.row({
        ic: b.emoji || 'book', g: grad(i + 2), t: b.name,
        s: [b.chaptersCount ? b.chaptersCount + ' chapters' : '', b.lessonsCount ? b.lessonsCount + ' lesson plans' : ''].filter(Boolean).join(' · '),
        attrs: `data-bid="${esc(b.id)}" style="animation-delay:${i * 30}ms"`,
      })).join('')}</div>`
      ctx.on('click', '[data-bid]', (b) => ctx.push('chapters', { classId, bookId: b.dataset.bid }))
    },
  })

  // ================================================================ CHAPTERS
  LG.page('chapters', {
    paths: ['/chapters'], title: 'Chapters', tone: 'teal',
    async render(ctx) {
      const { classId, bookId } = ctx.params
      if (!classId || !bookId) { ctx.push('classes', {}, { replace: true }); return }
      ctx.body.innerHTML = ui.skeleton(7)
      const [classes, books, chapters] = await Promise.all([getClasses(), getBooks(classId), getChapters(classId, bookId)])
      const cls = classes.find(c => c.id === classId), book = books.find(b => b.id === bookId)
      ctx.title(book ? book.name : 'Chapters', className(cls))
      saveNav({ class: { id: classId, name: className(cls) }, book: book && { id: bookId, name: book.name } })
      if (!chapters.length) { ctx.body.innerHTML = ui.empty('📖', 'No chapters yet', 'Lesson plans for this book are being added.'); return }
      ctx.body.innerHTML = `
        <div class="sec-t"><h3>${chapters.length} chapters</h3><small class="od">ଅଧ୍ୟାୟ ବାଛନ୍ତୁ</small></div>
        <div class="list">${chapters.map((c, i) => ui.row({
          ic: String(i + 1), g: grad(i), t: c.name || c.title,
          s: c.totalPeriods ? c.totalPeriods + ' periods' : '',
          attrs: `data-chid="${esc(c.id)}" style="animation-delay:${Math.min(i, 12) * 25}ms"`,
        })).join('')}</div>`
      ctx.on('click', '[data-chid]', (b) => ctx.push('periods', { classId, bookId, chapterId: b.dataset.chid }))
    },
  })

  // ================================================================ PERIODS (lesson list)
  LG.page('periods', {
    paths: ['/lesson-list'], title: 'Lesson plans', tone: 'night',
    async render(ctx) {
      const { classId, bookId, chapterId } = ctx.params
      if (!chapterId) { ctx.push('classes', {}, { replace: true }); return }
      ctx.body.innerHTML = ui.skeleton(6)
      const [lessons, chapters, books, classes] = await Promise.all([getLessons(chapterId), classId && bookId ? getChapters(classId, bookId) : [], classId ? getBooks(classId) : [], getClasses()])
      const ch = chapters.find(c => c.id === chapterId), book = books.find(b => b.id === bookId), cls = classes.find(c => c.id === classId)
      ctx.title(ch ? (ch.name || ch.title) : 'Lesson plans', [className(cls), book && book.name].filter(Boolean).join(' · '))
      saveNav({ class: cls && { id: classId, name: className(cls) }, book: book && { id: bookId, name: book.name }, chapter: ch && { id: chapterId, name: ch.name || ch.title } })
      if (!lessons.length) { ctx.body.innerHTML = ui.empty('🗓️', 'No lesson plans yet', 'Plans for this chapter are coming soon.'); return }
      const premium = LG.subInfo(LG.state.user).active || (LG.state.user && LG.state.user.role === 'admin')
      ctx.body.innerHTML = `
        ${premium ? '' : `<div class="card" style="background:linear-gradient(135deg,#FFF7ED,#FDF2F8);border-color:#FBCFE8;margin-bottom:12px;font-size:13.5px">👑 Full lesson plans open for Premium members. You can see a preview of each one.</div>`}
        <div class="list">${lessons.map((l, i) => ui.row({
          ic: 'P' + (l.period || i + 1), g: grad(i + 1), t: l.title || ('Period ' + (l.period || i + 1)),
          s: (l.loCodes && l.loCodes.length ? l.loCodes.slice(0, 3).join(' · ') : 'Period ' + od(l.period || i + 1)),
          attrs: `data-lid="${esc(l.id)}" style="animation-delay:${Math.min(i, 12) * 25}ms"`,
        })).join('')}</div>`
      ctx.on('click', '[data-lid]', (b) => ctx.push('lesson', { id: b.dataset.lid }))
    },
  })

  // ================================================================ LESSON READER
  let docCfg = null
  function downloadConfig() {
    if (!docCfg) {
      docCfg = Promise.all([
        LG.api('/settings/public').catch(() => ({})),
        LG.api('/document-security/lesson-plan/config').catch(() => ({})),
      ]).then(([s, c]) => {
        const st = s.settings || s, cf = c.config || c
        return { pdf: st.showPdf !== false && cf.allowPdf !== false, word: st.showWord !== false && cf.allowWord !== false }
      })
      docCfg.catch(() => { docCfg = null })
    }
    return docCfg
  }

  const list = (arr) => Array.isArray(arr) && arr.filter(Boolean).length ? `<ul>${arr.filter(Boolean).map(x => `<li>${LG.loPills(esc(x))}</li>`).join('')}</ul>` : ''
  const html = (h) => h ? LG.clean(h) : ''

  function stepsHtml(L) {
    if (L.format === 'fiveE' && L.fiveE && Array.isArray(L.fiveE.stages)) {
      return L.fiveE.stages.map((s) => {
        const [label, em, g] = FIVE_E[String(s.stage || '').toUpperCase()] || [s.stage, '⭐', 'violet']
        return `<div class="step">
          <div class="step-h" style="${LG.gStyle(g)}"><span class="step-n">${em}</span><b>${esc(label)}</b>${s.time ? `<em>${esc(s.time)}</em>` : ''}</div>
          ${s.teacher ? `<div class="step-b"><h4>👩‍🏫 Teacher</h4><div class="reader-in">${html(s.teacher)}</div></div>` : ''}
          ${s.student ? `<div class="step-b"><h4>🧒 Students</h4><div class="reader-in">${html(s.student)}</div></div>` : ''}
        </div>`
      }).join('')
    }
    if (L.panchapadi && typeof L.panchapadi === 'object') {
      return STEPS.map(s => {
        const p = L.panchapadi[s.k] || {}
        const ta = p.teacherActivity || p.teacherActivityText, sa = p.studentActivity || p.studentActivityText
        if (!ta && !sa) return ''
        return `<div class="step">
          <div class="step-h" style="${LG.gStyle(s.g)}"><span class="step-n">${s.n}</span><b class="od">${s.t} <small>(${s.e})</small></b><em class="od">${esc(p.timing || s.time)}</em></div>
          ${ta ? `<div class="step-b"><h4 class="od">👩‍🏫 ଶିକ୍ଷକଙ୍କ କାର୍ଯ୍ୟ</h4><div class="reader-in">${html(ta)}</div></div>` : ''}
          ${sa ? `<div class="step-b"><h4 class="od">🧒 ଶିକ୍ଷାର୍ଥୀଙ୍କ କାର୍ଯ୍ୟ</h4><div class="reader-in">${html(sa)}</div></div>` : ''}
        </div>`
      }).join('')
    }
    return L.content ? `<div class="reader">${html(L.content)}</div>` : ''
  }

  function extrasHtml(L) {
    const box = (em, t, inner) => inner ? `<div class="xbox"><h3>${em} ${t}</h3><div class="reader-in">${inner}</div></div>` : ''
    return [
      box('🎯', 'Learning Outcomes', list(L.learningOutcomes)),
      box('🧰', 'TLM', list(L.tlm)),
      box('🎲', 'Activities', list(L.activities)),
      box('❓', 'Assessment questions', list(L.assessmentQuestions)),
      box('📝', 'Worksheet', html(L.worksheet)),
      box('🏠', 'Homework', L.homework ? `<p>${esc(L.homework)}</p>` : ''),
      box('🗒️', 'Teacher notes', L.teacherNotes ? `<p>${esc(L.teacherNotes)}</p>` : ''),
    ].join('')
  }

  /** Builds the same kind of document the website sends to the secure download service. */
  function documentHtml(L, cls, book, ch) {
    const cell = 'border:1pt solid #000;padding:6pt;vertical-align:top'
    const meta = `<table style="width:100%;border-collapse:collapse;margin-bottom:10pt"><tr>
      <td style="${cell}"><b>ଶ୍ରେଣୀ:</b> ${esc(className(cls))}</td><td style="${cell}"><b>ବିଷୟ:</b> ${esc(book ? book.name : '')}</td></tr><tr>
      <td style="${cell}"><b>ଅଧ୍ୟାୟ:</b> ${esc(ch ? (ch.name || ch.title) : '')}</td><td style="${cell}"><b>ପିରିୟଡ୍:</b> ${esc(L.period || '')}</td></tr>
      ${L.topic ? `<tr><td colspan="2" style="${cell}"><b>ପ୍ରସଙ୍ଗ:</b> ${esc(L.topic)}</td></tr>` : ''}</table>`
    let rows = ''
    if (L.format === 'fiveE' && L.fiveE && Array.isArray(L.fiveE.stages)) {
      rows = L.fiveE.stages.map((s, i) => { const m = FIVE_E[String(s.stage || '').toUpperCase()] || [s.stage]; return `<tr><td style="${cell};background:#ede9fe;font-weight:bold;width:18%">${i + 1}. ${esc(m[0])}</td><td style="${cell};width:10%;text-align:center">${esc(s.time || '')}</td><td style="${cell}">${LG.clean(s.teacher || '')}</td><td style="${cell}">${LG.clean(s.student || '')}</td></tr>` }).join('')
    } else if (L.panchapadi) {
      rows = STEPS.map(s => { const p = L.panchapadi[s.k] || {}; return `<tr><td style="${cell};background:#ede9fe;font-weight:bold;width:18%">${s.n}. ${s.t} (${s.e})</td><td style="${cell};width:10%;text-align:center">${esc(p.timing || s.time)}</td><td style="${cell}">${LG.clean(p.teacherActivity || esc(p.teacherActivityText || ''))}</td><td style="${cell}">${LG.clean(p.studentActivity || esc(p.studentActivityText || ''))}</td></tr>` }).join('')
    }
    const table = rows ? `<table style="width:100%;border-collapse:collapse"><tr><th style="${cell};background:#ddd6fe">ସୋପାନ</th><th style="${cell};background:#ddd6fe">ସମୟ</th><th style="${cell};background:#ddd6fe">ଶିକ୍ଷକଙ୍କ କାର୍ଯ୍ୟ</th><th style="${cell};background:#ddd6fe">ଶିକ୍ଷାର୍ଥୀଙ୍କ କାର୍ଯ୍ୟ</th></tr>${rows}</table>` : LG.clean(L.content || '')
    const sec = (t, inner) => inner ? `<h3 style="margin:12pt 0 4pt">${t}</h3>${inner}` : ''
    const ul = (a) => Array.isArray(a) && a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''
    return `<h2 style="text-align:center;margin:0 0 8pt">${esc(L.title || 'ଶିକ୍ଷଣ ଯୋଜନା')}</h2>${meta}${table}
      ${sec('ଶିକ୍ଷଣ ଫଳାଫଳ (Learning Outcomes)', ul(L.learningOutcomes))}${sec('TLM', ul(L.tlm))}
      ${sec('ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ', ul(L.assessmentQuestions))}${sec('ଗୃହକାର୍ଯ୍ୟ (Homework)', L.homework ? `<p>${esc(L.homework)}</p>` : '')}
      ${LG.sigHtml()}`
  }

  async function download(ctx, data, format, btn) {
    const { lesson: L, class: cls, book, chapter: ch } = data
    const label = btn.innerHTML
    btn.disabled = true; btn.innerHTML = `<span class="spin-s"></span>Preparing…`
    try {
      const sd = await LG.api('/lesson-plans/secure-download', { method: 'POST', body: {
        format, innerHtml: documentHtml(L, cls, book, ch),
        lesson: { title: L.title, classId: cls && cls.id, className: className(cls), bookId: book && book.id, bookName: book && book.name, chapterId: ch && ch.id, chapterName: ch && (ch.name || ch.title), period: L.period, format: L.format || 'panchapadi' },
      } })
      const r = await LG.api(sd.downloadUrl.replace(/^\/api/, ''), { raw: true })
      const type = r.headers.get('content-type') || ''
      if (type.includes('json')) {
        const j = await r.json()
        if (j.fallback) throw new Error('The PDF service is busy right now. Please try again in a minute.')
        throw new Error(j.error || 'Download failed')
      }
      const blob = await r.blob()
      const base = `${className(cls)} ${book ? book.name : ''} P${L.period || ''} ${L.title || 'Lesson plan'}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)
      await LG.saveBlob(blob, base + (format === 'pdf' ? '.pdf' : '.doc'), { sourcePath: '/lesson' })
      LG.native.haptic('success')
      if (!window.LGApp) LG.toast('Downloaded ✅')
    } catch (e) {
      LG.toast(e.status === 403 ? 'Downloads are turned off for now' : (e.message || 'Download failed'))
    } finally { btn.disabled = false; btn.innerHTML = label; LG.hydrateIcons(btn) }
  }

  LG.page('lesson', {
    paths: ['/lesson'], title: 'Lesson plan', tone: 'night',
    async render(ctx) {
      const id = ctx.params.id
      if (!id) { ctx.push('classes', {}, { replace: true }); return }
      ctx.body.innerHTML = ui.skeleton(4)
      let data, locked = null
      try { data = await ctx.api('/lessons/' + encodeURIComponent(id)) } catch (e) {
        if (e.data && e.data.preview) { data = e.data; locked = e.status === 401 ? 'login' : 'premium' } else throw e
      }
      if (locked === 'premium' && LG.token()) { // subscription may have just been bought on the website
        await LG.refreshUser()
        try { data = await ctx.api('/lessons/' + encodeURIComponent(id)); locked = null } catch (e) { /* still locked */ }
      }
      const L = data.lesson || {}, cls = data.class, book = data.book, ch = data.chapter
      const sibs = (data.siblings || []).slice().sort((a, b) => (a.period || 0) - (b.period || 0))
      const at = sibs.findIndex(s => s.id === L.id)
      const prev = at > 0 ? sibs[at - 1] : null, next = at >= 0 && at < sibs.length - 1 ? sibs[at + 1] : null
      ctx.title(L.title || 'Lesson plan', [className(cls), book && book.name, L.period ? 'Period ' + L.period : ''].filter(Boolean).join(' · '))
      saveNav({ class: cls && { id: cls.id, name: className(cls) }, book: book && { id: book.id, name: book.name }, chapter: ch && { id: ch.id, name: ch.name || ch.title }, lesson: { id: L.id, title: L.title } })
      LG.LS.set('lgapp_last', { p: '/lesson?id=' + L.id, t: L.title, ts: Date.now() })

      const fav = !!(LG.state.user && (LG.state.user.favorites || []).includes(L.id))
      if (!locked) ctx.actions(`<button data-fav class="${fav ? 'on' : ''}" aria-label="Favourite">${icon('heart', 22, 2.2)}</button><button data-lshare aria-label="Share">${icon('share', 21)}</button>`)
      const cfg = locked ? { pdf: false, word: false } : await downloadConfig().catch(() => ({ pdf: true, word: true }))

      ctx.body.innerHTML = `
        <div class="meta-chips">${[ch && (ch.name || ch.title), L.topic, ...(L.loCodes || []).slice(0, 4)].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
        ${locked ? `${L.preview ? `<div class="reader" style="max-height:220px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 55%,transparent)">${html(L.preview)}</div>` : ''}${ui.gate(locked)}` : `
          <div id="cg"></div>
          ${stepsHtml(L)}
          ${extrasHtml(L)}
          ${cfg.pdf || cfg.word ? `<div class="dock">
            ${cfg.pdf ? ui.btn('PDF', 'data-dl="pdf"', 'primary', 'download') : ''}
            ${cfg.word ? ui.btn('Word', 'data-dl="docx"', 'soft', 'paper') : ''}
          </div>` : ''}`}
        <div class="pn">
          ${prev ? `<button class="tap" data-goto="${esc(prev.id)}"><small>← Previous</small><b>P${esc(prev.period)} · ${esc(prev.title || '')}</b></button>` : '<span></span>'}
          ${next ? `<button class="tap nx" data-goto="${esc(next.id)}"><small>Next →</small><b>P${esc(next.period)} · ${esc(next.title || '')}</b></button>` : '<span></span>'}
        </div>`
      ctx.body.scrollTop = 0
      ctx.on('click', '[data-goto]', (b) => ctx.push('lesson', { id: b.dataset.goto }, { replace: true }))
      ctx.on('click', '[data-dl]', (b) => download(ctx, data, b.dataset.dl, b))
      ctx.el.querySelector('.pg-act').onclick = async (e) => {
        const f = e.target.closest('[data-fav]'), s = e.target.closest('[data-lshare]')
        if (s) LG.native.share(L.title || 'Lesson plan', `📚 ${L.title || 'Lesson plan'}${cls ? ' · ' + className(cls) : ''}\nhttps://lessonguruodisha.in/lesson?id=${L.id}`)
        if (f) {
          const add = !f.classList.contains('on')
          f.classList.toggle('on', add); LG.native.haptic(add ? 'success' : 'tap')
          try {
            const r = await ctx.api('/me/favorites', { method: 'POST', body: { lessonId: L.id, add } })
            if (LG.state.user) { LG.state.user.favorites = r.favorites || []; LG.LS.set('lgapp_user', LG.state.user) }
            LG.toast(add ? 'Saved to favourites ❤️' : 'Removed from favourites')
          } catch (err) { f.classList.toggle('on', !add); LG.toast(err.message) }
        }
      }
      if (!locked && LG.token()) { // curriculum goal / competency card (when available for this subject)
        ctx.api('/lesson-curriculum', { method: 'POST', body: { lessonId: L.id } }).then(c => {
          if (!c || !c.eligible || !ctx.alive()) return
          const box = ctx.body.querySelector('#cg'); if (!box) return
          const los = (c.learningOutcomes || []).slice(0, 4)
          box.innerHTML = `<div class="xbox cg"><h3>🧭 Curriculum alignment</h3><div class="reader-in">
            ${c.cg ? `<p><b>CG:</b> ${esc(c.cg.code || '')} ${esc(c.cg.text || c.cg.description || '')}</p>` : ''}
            ${c.competency ? `<p><b>Competency:</b> ${esc(c.competency.code || '')} ${esc(c.competency.text || c.competency.description || '')}</p>` : ''}
            ${los.length ? `<ul>${los.map(x => `<li>${LG.loPills(esc(typeof x === 'string' ? x : [x.code, x.text || x.description].filter(Boolean).join(' ')))}</li>`).join('')}</ul>` : ''}
          </div></div>`
        }).catch(() => {})
      }
    },
  })

  LG.lessonData = { getClasses, getBooks, getChapters, getLessons, className }
})()
