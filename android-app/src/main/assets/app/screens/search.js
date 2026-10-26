/* Search (lessons by title/topic) and the Daily Plan maker. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui, od } = LG

  // ================================================================ SEARCH
  LG.page('search', {
    paths: ['/search', '/instant-search'], title: 'Search', subtitle: 'ଶିକ୍ଷଣ ଯୋଜନା ଖୋଜନ୍ତୁ', tone: 'teal',
    render(ctx) {
      const recent = LG.LS.get('lgapp_recent_q', [])
      ctx.body.innerHTML = `
        <div class="sbox">${icon('search', 20)}<input id="q" type="search" placeholder="Lesson, topic, chapter or class…" autocomplete="off" enterkeyhint="search"></div>
        <div id="res"></div>`
      const res = ctx.body.querySelector('#res'), inp = ctx.body.querySelector('#q')
      const idle = () => {
        const r = LG.LS.get('lgapp_recent_q', [])
        res.innerHTML = `
          ${r.length ? `<div class="sec-t"><h3>Recent searches</h3><button class="link-btn" data-clear>Clear</button></div><div class="chips" style="flex-wrap:wrap">${r.map(q => `<button class="chip tap" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
          <div class="sec-t"><h3>Try</h3></div>
          <div class="chips" style="flex-wrap:wrap">${['ଭଗ୍ନାଂଶ', 'Fractions', 'ପଞ୍ଚପଦୀ', 'Photosynthesis', 'ଓଡ଼ିଆ ବ୍ୟାକରଣ', 'Class 5 Science'].map(q => `<button class="chip tap od" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          ${ui.empty('🔎', 'Find any lesson plan', 'Type a few letters in English or Odia.')}`
      }
      let t, seq = 0
      const run = async (q) => {
        const my = ++seq
        if (q.length < 2) return idle()
        res.innerHTML = ui.skeleton(5)
        try {
          const d = await ctx.api('/search', { query: { q } })
          if (my !== seq || !ctx.alive()) return
          const items = d.results || []
          const words = q.split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          const hl = (s) => words.length ? esc(s).replace(new RegExp('(' + words.join('|') + ')', 'gi'), '<mark class="hl">$1</mark>') : esc(s)
          res.innerHTML = items.length ? `<div class="sec-t"><h3>${items.length} result${items.length > 1 ? 's' : ''}</h3></div><div class="list">${items.map((r, i) => `
            <button class="row tap" data-lid="${esc(r.id)}" style="animation-delay:${Math.min(i, 10) * 25}ms">
              <span class="row-ic" style="${LG.gStyle(['violet', 'teal', 'sunset', 'rose', 'blue'][i % 5])}"><em>P${esc(r.period || '')}</em></span>
              <span class="row-t"><b>${hl(r.title || 'Lesson')}</b><small>${esc([r.className, r.bookName, r.chapterName].filter(Boolean).join(' · '))}</small></span>
              <span class="row-chev">${icon('chev', 18, 2.4)}</span></button>`).join('')}</div>`
            : ui.empty('🤔', 'No lessons found', 'Try another word, or browse by class.', ui.btn('Browse by class', 'data-pg-open="/lessons"', 'soft', 'book'))
          LG.hydrateIcons(res)
        } catch (e) { if (my === seq) LG.showError(res, e, () => run(q)) }
      }
      const remember = (q) => { if (q.length < 2) return; const r = LG.LS.get('lgapp_recent_q', []).filter(x => x !== q); r.unshift(q); LG.LS.set('lgapp_recent_q', r.slice(0, 8)) }
      inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(inp.value.trim()), 300) })
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { inp.blur(); remember(inp.value.trim()) } })
      ctx.on('click', '[data-q]', (b) => { inp.value = b.dataset.q; run(b.dataset.q); remember(b.dataset.q) })
      ctx.on('click', '[data-clear]', () => { LG.LS.set('lgapp_recent_q', []); idle() })
      ctx.on('click', '[data-lid]', (b) => { remember(inp.value.trim()); ctx.push('lesson', { id: b.dataset.lid }) })
      if (ctx.params.q) { inp.value = ctx.params.q; run(ctx.params.q) } else idle()
      setTimeout(() => inp.focus(), 380)
      return () => clearTimeout(t)
    },
  })

  // ================================================================ DAILY PLAN
  const CLASS_TYPES = [['single', 'Single class', 1], ['double', 'Two classes', 2], ['tini', 'Three classes', 3], ['multi', 'Multigrade (up to 7)', 7]]
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  function nextSchoolDay() { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return ymd(d) }

  async function pickLesson() {
    const r = await LG.pick({ to: 'lesson' })
    return r && { id: r.lesson.id, title: r.lesson.name, label: `${r.class.name} · ${r.book.name} · P${r.lesson.period}` }
  }

  function planHtml(p) {
    const STEPS = [['prastabana', 'ଅଧୀତି'], ['anweshana', 'ବୋଧ'], ['alochana', 'ଅଭ୍ୟାସ'], ['prayoga', 'ପ୍ରୟୋଗ'], ['mulyayana', 'ପ୍ରସାର']]
    const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return `
      <div class="glow-card card" style="margin-bottom:14px">
        <div style="position:relative;z-index:1"><small style="opacity:.9">${esc(p.day || '')}</small>
        <h2 style="margin:2px 0 4px;font-size:22px">${esc(new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}</h2>
        <div style="opacity:.92;font-size:13.5px">${esc(p.schoolName || '')}</div></div>
      </div>
      ${(p.timetable || []).length ? `<div class="card" style="padding:12px 14px;margin-bottom:12px"><b style="font-size:14px">⏰ Timetable</b><div class="tt">${p.timetable.map(t => `<div class="${t.kind === 'break' ? 'brk' : ''}"><small>${esc(t.time || '')}</small><span>${esc(t.name || '')}</span></div>`).join('')}</div></div>` : ''}
      ${(p.periods || []).map(x => x.error ? `<div class="xbox"><h3>Period ${od(x.periodNum)} · ${esc(x.time || '')}</h3><p style="color:#BE123C">${esc(x.error)}</p></div>` : `
        <div class="xbox period">
          <div class="per-h"><span class="per-n">${od(x.periodNum)}</span><div><b>${esc(x.title || x.topic || '')}</b><small>${esc([x.className, x.subject, x.chapterName].filter(Boolean).join(' · '))} · ${esc(x.time || '')}</small></div></div>
          ${x.loCode || (x.loCodes || []).length ? `<div class="meta-chips">${[x.loCode, ...(x.loCodes || [])].filter(Boolean).slice(0, 4).map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
          ${x.loDescription ? `<p style="font-size:13.5px;color:var(--ink-2);margin:0 0 8px">🎯 ${esc(x.loDescription)}</p>` : ''}
          ${x.panchapadi ? `<div class="mini-steps">${STEPS.map(([k, t]) => { const s = x.panchapadi[k] || {}; const ta = strip(s.teacherActivity || s.teacherActivityText), sa = strip(s.studentActivity || s.studentActivityText); return ta || sa ? `<div><b class="od">${t}</b>${ta ? `<p>👩‍🏫 ${esc(ta)}</p>` : ''}${sa ? `<p>🧒 ${esc(sa)}</p>` : ''}</div>` : '' }).join('')}</div>` : ''}
          ${(x.tlm || []).length ? `<p style="font-size:13px;margin:8px 0 0"><b>🧰 TLM:</b> ${esc(x.tlm.join(', '))}</p>` : ''}
          ${x.homework ? `<p style="font-size:13px;margin:6px 0 0"><b>🏠 Homework:</b> ${esc(x.homework)}</p>` : ''}
        </div>`).join('')}`
  }

  LG.page('daily-plan', {
    paths: ['/daily-plan'], title: 'Daily Plan', subtitle: 'ଆଜିର ଶିକ୍ଷଣ ଯୋଜନା', tone: 'sunset', login: true,
    render(ctx) {
      const st = Object.assign({ date: nextSchoolDay(), schoolName: '', classType: 'single', slots: [] }, LG.LS.get('lgapp_daily_draft', {}))
      if (st.date < ymd(new Date())) st.date = nextSchoolDay()
      const max = () => (CLASS_TYPES.find(c => c[0] === st.classType) || CLASS_TYPES[0])[2]
      const save = () => LG.LS.set('lgapp_daily_draft', st)
      const form = () => {
        if (st.slots.length > max()) st.slots = st.slots.slice(0, max())
        ctx.actions('')
        ctx.body.innerHTML = `
          <div class="glow-card card" style="margin-bottom:16px"><div style="position:relative;z-index:1"><b style="font-size:18px">Plan your day in 30 seconds ⚡</b><p style="margin:4px 0 0;opacity:.92;font-size:13.5px">Pick today's lessons. We prepare the full Panchapadi plan for every period.</p></div></div>
          <div class="form-err"></div>
          ${ui.field({ id: 'date', label: 'Date', type: 'date', value: st.date, attrs: `min="${ymd(new Date())}"` })}
          ${ui.field({ id: 'school', label: 'School name', ph: 'e.g. Govt. UP School, Cuttack', value: st.schoolName })}
          <label class="fld"><span>How many classes do you teach together?</span></label>
          <div class="chips" style="flex-wrap:wrap;margin:-6px 0 16px">${CLASS_TYPES.map(([k, l]) => `<button class="chip tap ${k === st.classType ? 'on' : ''}" data-ct="${k}">${l}</button>`).join('')}</div>
          <div class="sec-t"><h3>Lessons (${st.slots.length}/${max()})</h3><small>In teaching order</small></div>
          <div class="list">${st.slots.map((s, i) => `
            <div class="row"><span class="row-ic" style="${LG.gStyle(['sunset', 'violet', 'teal', 'rose', 'blue', 'amber', 'green'][i])}"><em>${i + 1}</em></span>
            <span class="row-t"><b>${esc(s.title)}</b><small>${esc(s.label)}</small></span>
            <button class="tap" data-rm="${i}" style="color:var(--muted);padding:6px">${icon('x', 20)}</button></div>`).join('')}
            ${st.slots.length < max() ? `<button class="row tap" data-add style="border-style:dashed;justify-content:center;color:var(--violet);font-weight:600">${icon('spark', 20)} Add lesson</button>` : ''}
          </div>
          <div style="margin-top:20px">${ui.btn('Make my daily plan', 'data-gen', 'primary wide', 'bolt')}</div>`
        LG.hydrateIcons(ctx.body)
      }
      const show = (plan) => {
        LG.openDiary({ ...plan, activityMode: 'both', layoutStyle: 'detailed' }, 'daily', 'Daily plan', 'Daily-Lesson-Plan-' + plan.date)
        ctx.actions(`<button data-print aria-label="Print">${icon('download', 22)}</button>`)
        ctx.body.innerHTML = `<div class="print-area">${planHtml(plan)}</div>
          <div class="dock">${ui.btn('Save / print PDF', 'data-print', 'primary', 'download')}${ui.btn('New plan', 'data-new', 'soft', 'edit')}</div>`
        LG.hydrateIcons(ctx.body)
        ctx.body.scrollTop = 0
      }
      ctx.body.addEventListener('change', (e) => {
        if (e.target.id === 'date') { st.date = e.target.value; save() }
        if (e.target.id === 'school') { st.schoolName = e.target.value; save() }
      })
      ctx.on('click', '[data-ct]', (b) => { st.classType = b.dataset.ct; save(); LG.native.haptic('tap'); form() })
      ctx.on('click', '[data-rm]', (b) => { st.slots.splice(+b.dataset.rm, 1); save(); form() })
      ctx.on('click', '[data-add]', async () => { const l = await pickLesson(); if (l && ctx.alive()) { st.slots.push(l); save(); form() } })
      ctx.on('click', '[data-new]', () => form())
      const doPrint = () => LG.printNow('Daily plan ' + st.date)
      ctx.on('click', '[data-print]', () => doPrint())
      ctx.on('click', '[data-gen]', async (b) => {
        st.schoolName = (ctx.body.querySelector('#school') || {}).value || st.schoolName
        st.date = (ctx.body.querySelector('#date') || {}).value || st.date
        save()
        const e = ctx.body.querySelector('.form-err')
        const fail = (m) => { e.textContent = m; e.classList.add('on'); LG.native.haptic('error') }
        if (!st.date) return fail('Choose a date')
        if (new Date(st.date + 'T00:00').getDay() === 0) return fail('That date is a Sunday. Please choose a school day.')
        if (!st.schoolName.trim()) return fail('Enter your school name')
        if (!st.slots.length) return fail('Add at least one lesson')
        b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Preparing your plan…'
        try {
          const plan = await ctx.api('/daily-plan/generate', { method: 'POST', body: { date: st.date, schoolName: st.schoolName.trim(), classType: st.classType, slots: st.slots.map(s => ({ lessonId: s.id })) } })
          LG.native.haptic('success'); show(plan)
        } catch (err) {
          b.disabled = false; b.innerHTML = icon('bolt', 19, 2.3) + 'Make my daily plan'
          fail(err.status === 402 ? 'Daily plans are for Premium members. Your account does not have an active plan.' : err.message)
        }
      })
      form()
    },
  })
})()
