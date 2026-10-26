/* Phase 2 tools: Panchapadi, Question Papers, Assessments, Question Bank, LO codes. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui, od } = LG
  const GR = ['sunset', 'violet', 'teal', 'rose', 'blue', 'amber', 'green', 'fuchsia', 'indigo']
  const g = (i) => GR[i % GR.length]

  // ---------------------------------------------------------------- shared
  const costs = () => LG.cached('ai-costs', () => LG.api('/ai-credits/costs').then(d => d.costs || []), 30 * 60 * 1000)
  async function costOf(zone, type) {
    try { const c = (await costs()).find(x => x.zone === zone && x.type === type && x.active !== false); return c ? c.credits : null } catch (e) { return null }
  }
  function creditMsg(e) {
    if (e.status === 402 && e.data && e.data.code === 'INSUFFICIENT_AI_CREDITS') {
      return `Not enough AI credits: you have ${e.data.availableCredits || 0}, this needs ${e.data.requiredCredits || '?'}.${LG.direct ? ' You can add credits in AI Wallet.' : LG.noBuy()}`
    }
    if (e.data && e.data.code === 'NO_LESSON_CONTENT') return 'There is no lesson content for the chosen chapters yet. Please choose other chapters.'
    return e.message
  }
  function multiSheet(title, items, selected) { // items: [{id, name}]
    return new Promise((resolve) => {
      const sel = new Set(selected || [])
      const bg = LG.sheet(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:16px">${esc(title)}</b><button class="link-btn" data-all>Select all</button></div>
        <div class="list ms" style="max-height:56vh;overflow:auto">${items.map((it, i) => `<button class="row tap" data-id="${esc(it.id)}"><span class="row-ic" style="${LG.gStyle(g(i))}"><em>${i + 1}</em></span><span class="row-t"><b>${esc(it.name)}</b></span><span class="ck">${icon('check', 18, 3)}</span></button>`).join('')}</div>
        <div style="margin-top:12px">${ui.btn('Done', 'data-done', 'primary wide', 'check')}</div>`, () => {})
      const paint = () => bg.querySelectorAll('[data-id]').forEach(b => b.classList.toggle('on', sel.has(b.dataset.id)))
      bg.addEventListener('click', (e) => {
        const r = e.target.closest('[data-id]'), a = e.target.closest('[data-all]'), d = e.target.closest('[data-done]')
        if (r) { sel.has(r.dataset.id) ? sel.delete(r.dataset.id) : sel.add(r.dataset.id); LG.native.haptic('tap'); paint() }
        if (a) { if (sel.size === items.length) sel.clear(); else items.forEach(it => sel.add(it.id)); paint() }
        if (d) { bg.remove(); resolve(Array.from(sel)) }
      })
      paint(); LG.hydrateIcons(bg)
    })
  }
  const chips = (list, val, attr, multi) => `<div class="chips" style="flex-wrap:wrap;margin:-4px 0 16px">${list.map(([k, l]) => `<button class="chip tap ${multi ? (val.includes(k) ? 'on' : '') : (k === val ? 'on' : '')}" ${attr}="${esc(k)}">${esc(l)}</button>`).join('')}</div>`
  const label = (t, sub) => `<div class="sec-t" style="margin:8px 2px 10px"><h3>${esc(t)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`

  /** Class/book + chapters section used by the paper and assessment builders. */
  function scopeHtml(st) {
    return `${label('Class & subject')}
      <button class="pick-card tap ${st.book ? 'set' : ''}" data-scope>${icon('book', 22)}<span style="flex:1">${st.book ? `${esc(st.cls.name)} · ${esc(st.book.name)}<small>Tap to change</small>` : 'Choose class & subject'}</span>${icon('chev', 18, 2.4)}</button>
      ${st.book ? `${label('Chapters', st.chapterIds.length ? st.chapterIds.length + ' selected' : 'Pick one or more')}
      <button class="pick-card tap ${st.chapterIds.length ? 'set' : ''}" data-chs>${icon('layers', 22)}<span style="flex:1">${st.chapterIds.length ? esc(st.chapterNames().slice(0, 3).join(', ')) + (st.chapterIds.length > 3 ? ` +${st.chapterIds.length - 3}` : '') + '<small>Tap to change</small>' : 'Choose chapters'}</span>${icon('chev', 18, 2.4)}</button>` : ''}`
  }
  function wireScope(ctx, st, redraw) {
    ctx.on('click', '[data-scope]', async () => {
      const r = await LG.pick({ to: 'book', title: 'Choose class' }); if (!r) return
      st.cls = r.class; st.book = r.book; st.chapterIds = []
      st.chapters = await LG.lessonData.getChapters(r.class.id, r.book.id).catch(() => [])
      redraw()
    })
    ctx.on('click', '[data-chs]', async () => {
      const ids = await multiSheet('Choose chapters', st.chapters.map(c => ({ id: c.id, name: c.name || c.title })), st.chapterIds)
      st.chapterIds = ids; redraw()
    })
    st.chapterNames = () => st.chapters.filter(c => st.chapterIds.includes(c.id)).map(c => c.name || c.title)
  }

  // ================================================================ PANCHAPADI
  const browse = () => LG.cached('pp-browse', () => LG.api('/panchapadi-lessons/browse').then(d => d.classes || []), 5 * 60 * 1000)
  const sortBy = (a, k) => a.slice().sort((x, y) => (x[k] || 0) - (y[k] || 0))
  const count = (c) => c.books.reduce((s, b) => s + b.chapters.reduce((t, ch) => t + ch.periods.length, 0), 0)
  const ppClasses = async () => sortBy(await browse(), 'classOrder').filter(c => count(c) > 0) // only classes that have plans
  const stripPeriod = (p) => String(p.topicTitle || p.title || '').replace(/^\s*period\s*\d+\s*[:\-–.]?\s*/i, '') || p.title || 'Period ' + p.period

  LG.page('pp-home', {
    paths: ['/panchapadi', '/panchapadi-html'], title: 'Panchapadi', subtitle: 'ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ଯୋଜନା', tone: 'sunset', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(6)
      const classes = await ppClasses()
      if (!classes.length) { ctx.body.innerHTML = ui.empty('📘', 'No Panchapadi plans yet', 'New plans are being added. Please check back soon.'); return }
      ctx.body.innerHTML = `
        <div class="glow-card card" style="margin-bottom:16px"><div style="position:relative;z-index:1"><b style="font-size:17px">5-step lesson plans ✨</b><p class="od" style="margin:4px 0 0;opacity:.92;font-size:13.5px">ଅଧୀତି · ବୋଧ · ଅଭ୍ୟାସ · ପ୍ରୟୋଗ · ପ୍ରସାର</p></div></div>
        <div class="tiles">${classes.map((c, i) => {
          const n = count(c)
          return `<button class="tile tap" data-ci="${i}" style="${LG.gStyle(g(i))}"><span class="t-big">${esc((String(c.classLabel).match(/\d+/) || ['🧸'])[0])}</span><b>${esc(c.classLabel)}</b><small>${n} plans</small></button>`
        }).join('')}</div>`
      ctx.on('click', '[data-ci]', (b) => ctx.push('pp-books', { ci: b.dataset.ci }))
    },
  })
  LG.page('pp-books', {
    title: 'Panchapadi', tone: 'sunset',
    async render(ctx) {
      const c = (await ppClasses())[+ctx.params.ci]
      ctx.title(c.classLabel, 'ବିଷୟ ବାଛନ୍ତୁ')
      const extras = []
      c.books.forEach((b, bi) => b.chapters.forEach(ch => ch.periods.filter(p => p.separateEntry).forEach(p => extras.push({ p, bi, b }))))
      ctx.body.innerHTML = `<div class="list">${c.books.map((b, i) => ui.row({ ic: 'book', g: g(i + 2), t: b.bookLabel, s: b.chapters.length + ' chapters', attrs: `data-bi="${i}"` })).join('')}</div>
        ${extras.length ? label('Extra / alternate plans') + `<div class="list">${extras.map(({ p, b }, i) => ui.row({ ic: 'spark', g: 'fuchsia', t: p.separateLabel || stripPeriod(p), s: b.bookLabel, attrs: `data-pid="${esc(p.id)}"` })).join('')}</div>` : ''}`
      ctx.on('click', '[data-bi]', (b) => ctx.push('pp-chapters', { ci: ctx.params.ci, bi: b.dataset.bi }))
      ctx.on('click', '[data-pid]', (b) => ctx.push('pp-view', { id: b.dataset.pid }))
    },
  })
  LG.page('pp-chapters', {
    title: 'Chapters', tone: 'teal',
    async render(ctx) {
      const c = (await ppClasses())[+ctx.params.ci], b = c.books[+ctx.params.bi]
      ctx.title(b.bookLabel, c.classLabel)
      const chs = sortBy(b.chapters, 'chapterOrder')
      ctx.body.innerHTML = `<div class="list">${chs.map((ch, i) => ui.row({ ic: String(i + 1), g: g(i), t: ch.chapterLabel, s: ch.periods.length + ' periods' + (ch.chapterDescription ? ' · ' + ch.chapterDescription : ''), attrs: `data-chi="${i}"` })).join('')}</div>`
      ctx.on('click', '[data-chi]', (x) => {
        const ch = chs[+x.dataset.chi]
        ctx.push('pp-periods', { ci: ctx.params.ci, bi: ctx.params.bi, chi: x.dataset.chi, t: ch.chapterLabel })
      })
    },
  })
  LG.page('pp-periods', {
    title: 'Periods', tone: 'night',
    async render(ctx) {
      const c = (await ppClasses())[+ctx.params.ci], b = c.books[+ctx.params.bi]
      const ch = sortBy(b.chapters, 'chapterOrder')[+ctx.params.chi]
      ctx.title(ch.chapterLabel, `${c.classLabel} · ${b.bookLabel}`)
      ctx.body.innerHTML = `<div class="list">${sortBy(ch.periods, 'period').map((p, i) => ui.row({ ic: 'P' + (p.period || i + 1), g: g(i + 1), t: stripPeriod(p), s: p.academicYear ? 'AY ' + p.academicYear : '', attrs: `data-pid="${esc(p.id)}"` })).join('')}</div>`
      ctx.on('click', '[data-pid]', (x) => ctx.push('pp-view', { id: x.dataset.pid }))
    },
  })
  LG.page('pp-view', {
    title: 'Panchapadi', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(4)
      const m = await ctx.api('/panchapadi-lessons/' + encodeURIComponent(ctx.params.id) + '/meta')
      const P = m.parsed || {}
      ctx.title(m.topicTitle || m.title || 'Panchapadi', [m.classLabel, m.bookLabel, m.period ? 'Period ' + m.period : ''].filter(Boolean).join(' · '))
      const order = (P.order && P.order.length ? P.order : Object.keys(P.sections || {}).map(k => ({ key: k, label: k })))
      const COLORS = { adhiti: 'sunset', bodha: 'violet', abhyasa: 'teal', prayoga: 'blue', prasara: 'rose' }
      const codes = [...(P.loCodes || []), ...(P.cgCodes || []), ...(P.competencyCodes || [])].slice(0, 6)
      const canPdf = m.allowPdfDownload !== false && m.allowDownload !== false
      const canPrint = m.allowPrint !== false
      ctx.body.innerHTML = `<div class="print-area">
          <div class="meta-chips">${[m.chapterLabel, ...codes].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
          ${order.map(o => {
            const sec = (P.sections || {})[o.key]; if (!sec || !(sec.html || sec.text)) return ''
            const body = sec.html ? LG.clean(sec.html) : `<p>${esc(sec.text)}</p>`
            return COLORS[o.key]
              ? `<div class="step"><div class="step-h" style="${LG.gStyle(COLORS[o.key])}"><span class="step-n">${esc(o.icon || '★')}</span><b class="od">${esc(o.label || o.key)}</b>${(P.steps || {})[o.key] && P.steps[o.key].time ? `<em>${esc(P.steps[o.key].time)}</em>` : ''}</div><div class="step-b"><div class="reader-in">${body}</div></div></div>`
              : `<div class="xbox"><h3 class="od">${esc(o.icon || '📌')} ${esc(o.label || o.key)}</h3><div class="reader-in">${body}</div></div>`
          }).join('')}
        </div>
        ${canPdf || canPrint ? `<div class="dock">${canPdf ? ui.btn('PDF', 'data-pdf', 'primary', 'download') : ''}${canPrint ? ui.btn('Print', 'data-print', 'soft', 'paper') : ''}</div>` : ''}`
      ctx.on('click', '[data-print]', () => LG.printNow(m.title, { lesson: true }))
      ctx.on('click', '[data-pdf]', async (b) => {
        const l = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Preparing…'
        try { await LG.downloadApi(`/panchapadi-lessons/${encodeURIComponent(m.id)}/download/pdf`, null, { sourcePath: '/panchapadi' }) } catch (e) { LG.toast(e.status === 403 ? 'PDF download is turned off for this plan' : e.message) }
        b.disabled = false; b.innerHTML = l; LG.hydrateIcons(b)
      })
    },
  })

  // ================================================================ QUESTION PAPERS
  const QTYPES = [['mcq', 'MCQ', 1], ['fill', 'Fill in blanks', 1], ['truefalse', 'True / False', 1], ['match', 'Match', 2], ['veryshort', 'Very short', 2], ['short', 'Short answer', 3], ['long', 'Long answer', 5], ['casebased', 'Case based', 4], ['assertion', 'Assertion-reason', 1], ['competency', 'Competency', 4], ['hots', 'HOTS', 3]]
  const LANGS = [['odia', 'ଓଡ଼ିଆ Odia'], ['english', 'English'], ['hindi', 'हिन्दी Hindi'], ['sanskrit', 'संस्कृत Sanskrit'], ['odia-math', 'Odia (Maths)']]
  const statusBadge = (s) => s === 'ready' ? '<span class="badge-g">Ready</span>' : s === 'failed' ? '<span class="badge-r">Failed</span>' : '<span class="badge-a">Making…</span>'

  LG.page('qp-home', {
    paths: ['/question-papers'], title: 'Question Papers', subtitle: 'ପ୍ରଶ୍ନପତ୍ର', tone: 'teal', login: true,
    async render(ctx) {
      ctx.actions(`<button data-new aria-label="New paper">${icon('spark', 22)}</button>`)
      ctx.body.innerHTML = ui.skeleton(4)
      const d = await ctx.api('/question-papers')
      const items = d.items || []
      ctx.body.innerHTML = `
        <button class="card glow-card tap" data-new style="width:100%;text-align:left;margin-bottom:16px"><div style="position:relative;z-index:1;display:flex;align-items:center;gap:14px"><span style="font-size:34px">📝</span><span><b style="font-size:17px">Make a new question paper</b><small style="display:block;opacity:.9">Pick chapters & question types · ready-to-print PDF</small></span></div></button>
        ${label('My papers', items.length ? items.length + ' saved' : '')}
        ${items.length ? `<div class="list">${items.map((p, i) => `<button class="row tap" data-qp="${esc(p.id)}"><span class="row-ic" style="${LG.gStyle(g(i))}">${icon('paper', 22)}</span><span class="row-t"><b>${esc(p.title || 'Question paper')}</b><small>${esc([p.className, p.bookName, p.totalMarks ? p.totalMarks + ' marks' : ''].filter(Boolean).join(' · '))}</small></span>${statusBadge(p.status)}</button>`).join('')}</div>`
          : ui.empty('🗂️', 'No papers yet', 'Your question papers will be saved here.')}`
      ctx.on('click', '[data-new]', () => ctx.push('qp-new'))
      ctx.on('click', '[data-qp]', (b) => ctx.push('qp-view', { id: b.dataset.qp }))
      if (items.some(p => p.status === 'generating')) { const t = setTimeout(() => ctx.alive() && ctx.refresh(), 5000); return () => clearTimeout(t) }
    },
    onResume(ctx) { ctx.refresh() },
  })

  LG.page('qp-new', {
    title: 'New question paper', subtitle: 'ନୂଆ ପ୍ରଶ୍ନପତ୍ର', tone: 'teal', login: true,
    async render(ctx) {
      const st = { cls: null, book: null, chapters: [], chapterIds: [], difficulty: 'mixed', language: 'odia', assessmentType: '', mix: { mcq: 5, fill: 5, short: 4, long: 2 }, versions: 1 }
      const cost = await costOf('question_paper', 'question_paper')
      const draw = () => {
        const marks = QTYPES.reduce((s, [k, , m]) => s + (st.mix[k] || 0) * m, 0), qn = QTYPES.reduce((s, [k]) => s + (st.mix[k] || 0), 0)
        ctx.body.innerHTML = `
          ${scopeHtml(st)}
          ${label('Difficulty')}${chips([['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['mixed', 'Mixed']], st.difficulty, 'data-dif')}
          ${ui.select({ id: 'lang', label: 'Language', options: LANGS, value: st.language })}
          ${label('Exam type', 'optional')}${chips([['', 'Practice'], ['fa1', 'FA-1'], ['fa2', 'FA-2'], ['sa1', 'SA-1'], ['sa2', 'SA-2']], st.assessmentType, 'data-at')}
          ${label('Questions', `${qn} questions · ${marks} marks`)}
          <div class="card" style="padding:6px 14px">${QTYPES.map(([k, l, m]) => `<div class="mixrow"><span><b>${esc(l)}</b><small>${m} mark${m > 1 ? 's' : ''} each</small></span><button class="tap" data-dec="${k}">−</button><em>${st.mix[k] || 0}</em><button class="tap" data-inc="${k}">+</button></div>`).join('')}</div>
          <div class="form-err" style="margin-top:14px"></div>
          <div style="margin-top:16px">${ui.btn('Make question paper' + (cost ? ` · ${cost} credits` : ''), 'data-gen', 'primary wide', 'spark')}</div>`
        LG.hydrateIcons(ctx.body)
      }
      wireScope(ctx, st, draw)
      ctx.on('click', '[data-dif]', (b) => { st.difficulty = b.dataset.dif; draw() })
      ctx.on('click', '[data-at]', (b) => { st.assessmentType = b.dataset.at; draw() })
      ctx.on('click', '[data-inc]', (b) => { const k = b.dataset.inc; st.mix[k] = Math.min(30, (st.mix[k] || 0) + 1); LG.native.haptic('tap'); draw() })
      ctx.on('click', '[data-dec]', (b) => { const k = b.dataset.dec; st.mix[k] = Math.max(0, (st.mix[k] || 0) - 1); LG.native.haptic('tap'); draw() })
      ctx.body.addEventListener('change', (e) => { if (e.target.id === 'lang') st.language = e.target.value })
      ctx.on('click', '[data-gen]', async (b) => {
        const err = ctx.body.querySelector('.form-err'), fail = (m) => { err.textContent = m; err.classList.add('on'); LG.native.haptic('error') }
        if (!st.book) return fail('Choose the class and subject')
        if (!st.chapterIds.length) return fail('Choose at least one chapter')
        const mix = Object.fromEntries(Object.entries(st.mix).filter(([, n]) => n > 0))
        if (!Object.keys(mix).length) return fail('Add at least one question')
        b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Starting…'
        try {
          const d = await ctx.api('/question-papers/generate', { method: 'POST', body: {
            classId: st.cls.id, bookId: st.book.id, chapterIds: st.chapterIds, questionMix: mix, difficulty: st.difficulty, language: st.language,
            teacherContext: '', forceRegenerate: false, assessmentType: st.assessmentType || null, numVersions: 1,
            requestId: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()) } })
          ctx.push('qp-view', { id: d.questionPaper.id }, { replace: true })
        } catch (e) { b.disabled = false; draw(); fail(creditMsg(e)) }
      })
      draw()
    },
  })

  function questionHtml(q, i, showAns) {
    const text = q.q || q.question || q.text || ''
    const opts = Array.isArray(q.options) ? q.options : []
    return `<div class="qitem"><div class="qh"><span class="qn">${i + 1}</span><div class="qt">${LG.loPills(esc(text))}</div><b style="font-size:12px;color:var(--muted)">[${esc(q.marks || '')}]</b></div>
      ${opts.length ? `<div class="opts">${opts.map((o, k) => { const t = typeof o === 'string' ? o : (o.text || ''); const ok = showAns && (typeof o === 'object' ? o.correct : (q.answer && String(q.answer).trim() === t.trim())); return `<span class="${ok ? 'ok' : ''}">${'abcdefgh'[k]}) ${esc(t)}</span>` }).join('')}</div>` : ''}
      ${showAns && q.answer && !opts.length ? `<div class="qm"><em style="background:#DCFCE7;color:#166534">Ans: ${esc(String(q.answer).slice(0, 300))}</em></div>` : ''}
      <div class="qm">${[q.type, q.chapterName, q.loCode, q.bloomLevel].filter(Boolean).map(x => `<em>${esc(x)}</em>`).join('')}</div></div>`
  }

  LG.page('qp-view', {
    title: 'Question paper', tone: 'teal', login: true,
    async render(ctx) {
      let timer, showAns = false, polls = 0
      const load = async () => {
        const { questionPaper: p } = await ctx.api('/question-papers/' + encodeURIComponent(ctx.params.id))
        if (!ctx.alive()) return
        if (p.status === 'generating') {
          const steps = ['preparing', 'drafting', 'enhancing', 'ready']
          const at = Math.max(0, steps.indexOf(String(p.progress || 'preparing').split('-')[0]))
          ctx.title('Making your paper…', p.draftTitle || '')
          ctx.body.innerHTML = `<div class="pg-empty"><div class="e-em">✍️</div><b>Writing your questions</b><p>This usually takes 30–90 seconds. You can leave this screen; the paper is saved in "My papers".</p></div>
            ${ui.steps(['Preparing', 'Drafting', 'Polishing', 'Ready'], at)}
            ${p.draftReady && (p.draftQuestions || []).length ? label('First draft') + p.draftQuestions.slice(0, 5).map((q, i) => questionHtml(q, i, false)).join('') : ''}`
          if (++polls < 80) timer = setTimeout(() => load().catch(e => LG.showError(ctx.body, e, load)), 3000)
          return
        }
        if (p.status === 'failed') { ctx.title('Paper not ready'); ctx.body.innerHTML = ui.empty('😕', 'Could not make this paper', p.errorMessage || 'Please try again with different chapters.', ui.btn('Try again', 'data-regen', 'primary', 'refund')); LG.hydrateIcons(ctx.body); return }
        ctx.title(p.title || 'Question paper', [p.className, p.bookName].filter(Boolean).join(' · '))
        LG.native.haptic('success')
        const draw = () => {
          ctx.body.innerHTML = `
            <div class="card" style="display:flex;gap:10px;justify-content:space-around;text-align:center;margin-bottom:12px">
              <div><b style="font-size:20px">${esc(p.totalMarks || '–')}</b><small style="display:block;color:var(--muted)">Marks</small></div>
              <div><b style="font-size:20px">${esc(p.durationMin || '–')}</b><small style="display:block;color:var(--muted)">Minutes</small></div>
              <div><b style="font-size:20px">${(p.questions || []).length}</b><small style="display:block;color:var(--muted)">Questions</small></div></div>
            ${p.instructions ? `<div class="xbox"><h3>📋 Instructions</h3><div class="reader-in">${Array.isArray(p.instructions) ? `<ol>${p.instructions.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : `<p>${esc(p.instructions)}</p>`}</div></div>` : ''}
            <label style="display:flex;align-items:center;gap:10px;margin:4px 2px 12px;font-size:14px;font-weight:600"><input type="checkbox" id="ans" ${showAns ? 'checked' : ''} style="width:20px;height:20px;accent-color:#7C3AED"> Show answers</label>
            ${(p.questions || []).map((q, i) => questionHtml(q, i, showAns)).join('')}
            <div class="dock">${ui.btn('Paper PDF', 'data-pdf="paper"', 'primary', 'download')}${ui.btn('With answers', 'data-pdf="paper+answers"', 'soft', 'check')}</div>
            ${ui.btn('Answer key only (PDF)', 'data-pdf="answers-only"', 'ghost wide', 'paper')}`
          LG.hydrateIcons(ctx.body)
        }
        ctx.body.onchange = (e) => { if (e.target.id === 'ans') { showAns = e.target.checked; draw() } }
        draw()
      }
      ctx.on('click', '[data-pdf]', async (b) => {
        const l = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Preparing…'
        try { await LG.downloadApi(`/question-papers/${encodeURIComponent(ctx.params.id)}/pdf?mode=${encodeURIComponent(b.dataset.pdf)}`, null, { sourcePath: '/question-papers' }) } catch (e) { LG.toast(e.message) }
        b.disabled = false; b.innerHTML = l; LG.hydrateIcons(b)
      })
      ctx.on('click', '[data-regen]', async () => {
        try { await ctx.api('/question-papers/' + encodeURIComponent(ctx.params.id) + '/regenerate', { method: 'POST' }); polls = 0; load() } catch (e) { LG.toast(creditMsg(e)) }
      })
      ctx.body.innerHTML = ui.skeleton(4)
      await load()
      return () => clearTimeout(timer)
    },
  })

  // ================================================================ ASSESSMENTS
  const ATYPES = [['fa1', 'FA-1'], ['fa2', 'FA-2'], ['fa3', 'FA-3'], ['fa4', 'FA-4'], ['sa1', 'SA-1'], ['sa2', 'SA-2'], ['unit', 'Unit test'], ['practice', 'Practice'], ['revision', 'Revision']]
  const WTYPES = [['mcq', 'MCQ'], ['fill', 'Fill blanks'], ['match', 'Match'], ['truefalse', 'True/False'], ['oneword', 'One word'], ['vsa', 'Very short'], ['sa', 'Short'], ['la', 'Long'], ['competency', 'Competency'], ['hots', 'HOTS'], ['casestudy', 'Case study'], ['picture', 'Picture'], ['diagram', 'Diagram'], ['activity', 'Activity'], ['project', 'Project']]
  const DIFFS = [['balanced', 'Balanced 30·50·20', { easy: 30, medium: 50, hard: 20 }], ['easy', 'Easier 50·35·15', { easy: 50, medium: 35, hard: 15 }], ['hard', 'Challenging 20·40·40', { easy: 20, medium: 40, hard: 40 }]]

  LG.page('as-home', {
    paths: ['/assessments'], title: 'Assessments', subtitle: 'ମୂଲ୍ୟାୟନ', tone: 'rose', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(4)
      const d = await ctx.api('/assessments').catch(() => ({ items: [] }))
      const items = d.items || []
      ctx.body.innerHTML = `
        <button class="card glow-card tap" data-new style="width:100%;text-align:left;margin-bottom:16px"><div style="position:relative;z-index:1;display:flex;align-items:center;gap:14px"><span style="font-size:34px">🎯</span><span><b style="font-size:17px">Build an assessment</b><small style="display:block;opacity:.9">FA / SA / unit tests with answer key & blueprint</small></span></div></button>
        ${label('My assessments', items.length ? String(items.length) : '')}
        ${items.length ? `<div class="list">${items.map((a, i) => `<button class="row tap" data-as="${esc(a.id)}"><span class="row-ic" style="${LG.gStyle(g(i + 3))}">${icon('target', 22)}</span><span class="row-t"><b>${esc(a.title || 'Assessment')}</b><small>${esc([a.className, a.bookName, a.totalMarks ? a.totalMarks + ' marks' : ''].filter(Boolean).join(' · '))}</small></span>${statusBadge(a.status)}</button>`).join('')}</div>` : ui.empty('🎯', 'No assessments yet', 'Build your first one. It takes about a minute.')}
        <div style="margin-top:16px">${ui.webLink('/assessments', 'Community & official papers', 'Browse papers shared by other teachers')}</div>`
      ctx.on('click', '[data-new]', () => ctx.push('as-new'))
      ctx.on('click', '[data-as]', (b) => ctx.push('as-view', { id: b.dataset.as }))
    },
    onResume(ctx) { ctx.refresh() },
  })

  LG.page('as-new', {
    title: 'Build assessment', subtitle: 'ମୂଲ୍ୟାୟନ ପ୍ରସ୍ତୁତ', tone: 'rose', login: true,
    async render(ctx) {
      const st = { cls: null, book: null, chapters: [], chapterIds: [], type: 'fa1', marks: 25, written: ['mcq', 'fill', 'sa', 'la'], oral: [], diff: 'balanced', language: 'auto', key: true, blueprint: true }
      const draw = async () => {
        const typeKey = /^sa/.test(st.type) ? 'sa_assessment' : /^fa/.test(st.type) ? 'fa_assessment' : 'assessment_paper'
        const cost = await costOf('assessment', typeKey)
        ctx.body.innerHTML = `
          ${scopeHtml(st)}
          ${label('Type')}${chips(ATYPES, st.type, 'data-type')}
          ${label('Total marks')}${chips([['25', '25'], ['50', '50'], ['80', '80'], ['100', '100']], String(st.marks), 'data-marks')}
          ${label('Question types', st.written.length + ' chosen')}${chips(WTYPES, st.written, 'data-w', true)}
          ${label('Teacher-conducted', 'optional')}${chips([['oral', 'Oral'], ['practical', 'Practical']], st.oral, 'data-o', true)}
          ${label('Difficulty', 'easy · medium · hard %')}${chips(DIFFS.map(d => [d[0], d[1]]), st.diff, 'data-diff')}
          ${ui.select({ id: 'lang', label: 'Language', options: [['auto', 'Same as the subject'], ['odia', 'ଓଡ଼ିଆ Odia'], ['english', 'English'], ['hindi', 'हिन्दी Hindi'], ['sanskrit', 'संस्कृत Sanskrit']], value: st.language })}
          <div class="card" style="padding:4px 14px;margin-bottom:6px">
            <label class="tg"><span>Answer key</span><input type="checkbox" data-tg="key" ${st.key ? 'checked' : ''}></label>
            <label class="tg"><span>Blueprint</span><input type="checkbox" data-tg="blueprint" ${st.blueprint ? 'checked' : ''}></label>
          </div>
          <div class="form-err" style="margin-top:12px"></div>
          <div style="margin-top:14px">${ui.btn('Build assessment' + (cost ? ` · ${cost} credits` : ''), 'data-build', 'primary wide', 'spark')}</div>`
        LG.hydrateIcons(ctx.body)
      }
      wireScope(ctx, st, draw)
      ctx.on('click', '[data-type]', (b) => { st.type = b.dataset.type; draw() })
      ctx.on('click', '[data-marks]', (b) => { st.marks = +b.dataset.marks; draw() })
      ctx.on('click', '[data-diff]', (b) => { st.diff = b.dataset.diff; draw() })
      const toggle = (arr, k) => { const i = arr.indexOf(k); i >= 0 ? arr.splice(i, 1) : arr.push(k) }
      ctx.on('click', '[data-w]', (b) => { toggle(st.written, b.dataset.w); LG.native.haptic('tap'); draw() })
      ctx.on('click', '[data-o]', (b) => { toggle(st.oral, b.dataset.o); draw() })
      ctx.body.addEventListener('change', (e) => { if (e.target.id === 'lang') st.language = e.target.value; if (e.target.dataset && e.target.dataset.tg) st[e.target.dataset.tg] = e.target.checked })
      ctx.on('click', '[data-build]', async (b) => {
        const err = ctx.body.querySelector('.form-err'), fail = (m) => { err.textContent = m; err.classList.add('on'); LG.native.haptic('error') }
        if (!st.book) return fail('Choose the class and subject')
        if (!st.chapterIds.length) return fail('Choose at least one chapter')
        if (!st.written.length) return fail('Choose at least one question type')
        b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Building… this takes about a minute'
        const body = { classId: st.cls.id, bookId: st.book.id, chapterIds: st.chapterIds, assessmentType: st.type, totalMarks: st.marks, writtenTypes: st.written, teacherConducted: st.oral,
          difficulty: DIFFS.find(d => d[0] === st.diff)[2], includeAnswerKey: st.key, includeBlueprint: st.blueprint, includeObservation: false, includeRubrics: false }
        if (st.language !== 'auto') { body.language = st.language; body.strictLanguageLock = true }
        try {
          const d = await ctx.api('/assessments/build', { method: 'POST', body })
          LG.native.haptic('success')
          ctx.push('as-view', { id: d.assessment.id }, { replace: true })
        } catch (e) { b.disabled = false; draw(); fail(creditMsg(e)) }
      })
      draw()
    },
  })

  LG.page('as-view', {
    title: 'Assessment', tone: 'rose', login: true,
    async render(ctx) {
      const id = encodeURIComponent(ctx.params.id)
      ctx.body.innerHTML = ui.skeleton(4)
      const r = await ctx.api('/assessments/' + id + '/html?mode=paper', { raw: true })
      const html = await r.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const styles = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n').replace(/(^|})\s*(body|html)\b/g, '$1 .doc')
      const title = (doc.querySelector('title') || {}).textContent || 'Assessment'
      ctx.title(title)
      ctx.body.innerHTML = `
        <div class="dock" style="position:static;padding:0 0 12px;background:none">${ui.btn('Paper PDF', 'data-pdf="paper"', 'primary', 'download')}${ui.btn('Full (with key)', 'data-pdf="full"', 'soft', 'check')}</div>
        <div class="list" style="margin-bottom:14px;gap:8px">${ui.btn('Answer key only', 'data-pdf="answers-only"', 'ghost wide', 'paper')}${ui.btn('Blueprint only', 'data-pdf="blueprint-only"', 'ghost wide', 'grid')}</div>
        <div class="doc print-area"><style>${styles}</style>${LG.clean(doc.body.innerHTML)}</div>`
      LG.hydrateIcons(ctx.body)
      ctx.on('click', '[data-pdf]', async (b) => {
        const l = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Preparing…'
        try { await LG.downloadApi(`/assessments/${id}/pdf?mode=${encodeURIComponent(b.dataset.pdf)}`, null, { sourcePath: '/assessments' }) } catch (e) { LG.toast(e.status === 402 ? 'This assessment is for Premium members' : e.message) }
        b.disabled = false; b.innerHTML = l; LG.hydrateIcons(b)
      })
    },
  })

  // ================================================================ QUESTION BANK
  const qaList = () => LG.cached('qa-list', () => LG.api('/qa-worksheets').then(d => d.items || []), 5 * 60 * 1000)
  LG.page('qb-home', {
    paths: ['/qbank'], title: 'Question Bank', subtitle: 'ପ୍ରଶ୍ନ ଭଣ୍ଡାର', tone: 'teal',
    async render(ctx) {
      const st = { tool: ctx.params.tool || 'qbank', cls: '', q: '' }
      ctx.body.innerHTML = ui.skeleton(6)
      const items = await qaList()
      const draw = () => {
        const pool = items.filter(it => (st.tool === 'qbank') === (it.source === 'qbank-import'))
        const classes = [...new Set(pool.map(i => i.className).filter(Boolean))]
        const q = st.q.toLowerCase()
        const list = pool.filter(it => (!st.cls || it.className === st.cls) && (!q || [it.className, it.bookName, it.chapterName, it.title].join(' ').toLowerCase().includes(q)))
        const groups = {}
        list.forEach(it => { const k = (it.className || '') + ' · ' + (it.bookName || ''); (groups[k] = groups[k] || []).push(it) })
        ctx.body.innerHTML = `
          <div class="seg">${[['qbank', '🏦 Question Bank'], ['qa', '📗 Books Q&A Solved']].map(([k, l]) => `<button class="tap ${st.tool === k ? 'on' : ''}" data-tool="${k}">${l}</button>`).join('')}</div>
          <div class="sbox">${icon('search', 20)}<input id="q" type="search" placeholder="Search chapter or book…" value="${esc(st.q)}"></div>
          ${chips([['', 'All classes'], ...classes.map(c => [c, c])], st.cls, 'data-fcls')}
          <div id="ql">${Object.keys(groups).length ? Object.entries(groups).map(([k, arr]) => `${label(k, arr.length + ' chapters')}<div class="list">${arr.map((it, i) => ui.row({ ic: st.tool === 'qbank' ? 'bank' : 'book', g: g(i), t: it.chapterName || it.title, s: [it.questionCount ? it.questionCount + ' questions' : '', it.pageCount ? it.pageCount + ' pages' : ''].filter(Boolean).join(' · '), badge: it.heroTag, attrs: `data-qa="${esc(it.id)}"` })).join('')}</div>`).join('') : ui.empty('🔍', 'Nothing found', 'Try another class or search word.')}</div>`
        LG.hydrateIcons(ctx.body)
      }
      ctx.on('click', '[data-tool]', (b) => { st.tool = b.dataset.tool; st.cls = ''; draw() })
      ctx.on('click', '[data-fcls]', (b) => { st.cls = b.dataset.fcls; draw() })
      ctx.on('click', '[data-qa]', (b) => ctx.push('qb-view', { id: b.dataset.qa }))
      let t; ctx.body.addEventListener('input', (e) => { if (e.target.id !== 'q') return; clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; const pos = e.target.selectionStart; draw(); const n = ctx.body.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos) }, 250) })
      draw()
    },
  })
  LG.page('qb-view', {
    title: 'Questions', tone: 'teal',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const { item } = await ctx.api('/qa-worksheets/' + encodeURIComponent(ctx.params.id))
      ctx.title(item.title || item.chapterName || 'Questions', [item.className, item.bookName].filter(Boolean).join(' · '))
      ctx.actions(`<button data-print aria-label="Print">${icon('download', 22)}</button>`)
      const doc = new DOMParser().parseFromString(item.htmlContent || '', 'text/html')
      const styles = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n').replace(/(^|})\s*(body|html)\b/g, '$1 .doc')
      ctx.body.innerHTML = `<div class="doc print-area"><style>${styles}</style>${LG.clean(doc.body.innerHTML)}</div>`
      ctx.on('click', '[data-print]', () => LG.printNow(item.title))
    },
  })

  // ================================================================ LO CODES
  const SUBJ_G = ['violet', 'teal', 'sunset', 'rose', 'blue', 'amber', 'green', 'fuchsia']
  LG.page('lo-home', {
    paths: ['/learning-outcomes', '/lo-codes'], title: 'Learning Outcomes', subtitle: 'ଶିକ୍ଷଣ ଫଳାଫଳ · LO codes', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const meta = await ctx.api('/lo-codes/meta')
      const classes = (meta.classes || []).slice().sort((a, b) => a - b)
      if (!classes.length) { ctx.body.innerHTML = ui.empty('🎯', 'No LO codes yet', 'Learning outcomes are being added.'); return }
      const st = { cls: LG.LS.get('lgapp_lo_cls', classes[0]), subject: '', q: '' }
      if (!classes.includes(st.cls)) st.cls = classes[0]
      const subjColor = (s) => SUBJ_G[Math.abs([...String(s)].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % SUBJ_G.length]
      ctx.body.innerHTML = `
        <div class="sbox">${icon('search', 20)}<input id="q" type="search" placeholder="Search code or outcome…"></div>
        <div id="cl"></div><div id="sj"></div><div id="res"></div>`
      const res = ctx.body.querySelector('#res')
      let seq = 0
      const run = async () => {
        const my = ++seq
        ctx.body.querySelector('#cl').innerHTML = chips(classes.map(c => [String(c), c === 0 ? 'Balvatika' : 'Class ' + c]), String(st.cls), 'data-c')
        const subs = (meta.byClass && meta.byClass[st.cls]) || meta.subjects || []
        ctx.body.querySelector('#sj').innerHTML = chips([['', 'All subjects'], ...subs.map(s => [s, s])], st.subject, 'data-s')
        res.innerHTML = ui.skeleton(4)
        try {
          const d = await ctx.api('/lo-codes', { query: { class: String(st.cls), subject: st.subject, q: st.q } })
          if (my !== seq) return
          const items = (d.items || []).filter(x => String(x.class) === String(st.cls))
          res.innerHTML = items.length ? `${label(items.length + ' outcomes')}<div class="list">${items.slice(0, 400).map(x => `
            <div class="card lo-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="lo-code" style="${LG.gStyle(subjColor(x.subject))}">${esc(x.code)}</span><small style="color:var(--muted)">${esc(x.subject || '')}</small></div><p class="od" style="margin:0;font-size:14.5px;line-height:1.6">${esc(x.description || '')}</p></div>`).join('')}</div>`
            : ui.empty('🔍', 'No outcomes found', 'Try another subject or word.')
        } catch (e) { LG.showError(res, e, run) }
      }
      ctx.on('click', '[data-c]', (b) => { st.cls = +b.dataset.c; st.subject = ''; LG.LS.set('lgapp_lo_cls', st.cls); run() })
      ctx.on('click', '[data-s]', (b) => { st.subject = b.dataset.s; run() })
      let t; ctx.body.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); run() }, 250) })
      run()
    },
  })
})()
