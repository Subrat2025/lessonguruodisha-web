/* Phase 3 tools: Ajira Pathya Jojana, Annual Plan (ABP), Multigrade, Instant Plan, AI Wallet. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui, od } = LG
  const GR = ['sunset', 'violet', 'teal', 'rose', 'blue', 'amber', 'green', 'fuchsia', 'indigo']
  const g = (i) => GR[i % GR.length]
  const label = (t, sub) => `<div class="sec-t" style="margin:8px 2px 10px"><h3>${esc(t)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`
  const chips = (list, val, attr) => `<div class="chips" style="flex-wrap:wrap;margin:-4px 0 16px">${list.map(([k, l]) => `<button class="chip tap ${String(k) === String(val) ? 'on' : ''}" ${attr}="${esc(k)}">${esc(l)}</button>`).join('')}</div>`
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d) }
  const nice = (iso) => new Date(iso + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const busy = (b, on) => { if (on) { b.dataset.l = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Please wait…' } else { b.disabled = false; b.innerHTML = b.dataset.l; LG.hydrateIcons(b) } }

  /** Shows a lesson-diary HTML document (from /instant-plan/html) with PDF + print. */
  async function diaryView(ctx, plan, mode, fileName) {
    ctx.body.innerHTML = ui.skeleton(4)
    const d = await ctx.api('/instant-plan/html', { method: 'POST', body: { plan, mode, showWatermark: true } })
    const doc = new DOMParser().parseFromString(d.html || '', 'text/html')
    const styles = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n').replace(/(^|})\s*(body|html)\b/g, '$1 .doc').replace(/@page[^{]*\{[^}]*\}/g, '')
    ctx.actions(`<button data-print aria-label="Print">${icon('download', 22)}</button>`)
    ctx.body.innerHTML = `<div class="dock" style="position:static;padding:0 0 12px;background:none">${ui.btn('Download PDF', 'data-pdf', 'primary', 'download')}${ui.btn('Print', 'data-print', 'soft', 'paper')}</div>
      <div class="doc print-area" style="overflow-x:auto"><style>${styles}</style>${LG.clean(doc.body.innerHTML)}</div>`
    LG.hydrateIcons(ctx.body)
    ctx.el.onclick = async (e) => {
      if (e.target.closest('[data-print]')) LG.printNow(fileName)
      const b = e.target.closest('[data-pdf]')
      if (b) { busy(b, true); try { await LG.downloadApi('/instant-plan/pdf', fileName + '.pdf', { method: 'POST', body: { plan, mode, showWatermark: true }, sourcePath: '/' + mode }) } catch (err) { LG.toast(err.message) } busy(b, false) }
    }
  }

  // ================================================================ AJIRA PATHYA JOJANA
  LG.page('ajira', {
    paths: ['/ajira-pathya-jojana', '/ajira'], title: 'Ajira Pathya Jojana', subtitle: 'ଆଜିର ପାଠ୍ୟ ଯୋଜନା', tone: 'sunset', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(4)
      const status = await ctx.api('/ajira-addon/status')
      if (!status.hasAccess) {
        ctx.body.innerHTML = `<div class="gate"><div class="gate-ic">🌅</div><b>Ajira Pathya Jojana is an add-on</b>
          <p>It is not active on your account${status.source === 'disabled' ? ' (the feature is paused right now)' : ''}.${LG.noBuy()}</p>
          ${status.source !== 'disabled' ? LG.buyBtn('/ajira-pathya-jojana', 'Get Ajira add-on') : ''}
          <button class="btn btn-soft tap" data-pg-open="/daily-plan" style="margin-top:8px">Make a Daily Plan instead</button></div>`
        return
      }
      const range = await ctx.api('/ajira-pathya-jojana/range').catch(() => ({}))
      let date = ymd(new Date()), cls = null
      if (range.firstDate && range.lastDate && (date < range.firstDate || date > range.lastDate)) date = range.firstDate
      const load = async () => {
        ctx.body.innerHTML = ui.skeleton(4)
        let d
        try { d = await ctx.api('/ajira-pathya-jojana', { query: { date } }) } catch (e) {
          const code = e.data && e.data.code
          if (code === 'DATE_OUT_OF_WINDOW') { LG.toast('Plans are available for yesterday, today and tomorrow'); date = ymd(new Date()); return load() }
          throw e
        }
        if (!ctx.alive()) return
        date = d.dateISO || date
        const classes = d.classes || []
        if (cls == null || !classes.some(c => String(c.classCode) === String(cls))) cls = classes.length ? classes[0].classCode : null
        const c = classes.find(x => String(x.classCode) === String(cls))
        const today = d.todayISO || ymd(new Date())
        ctx.body.innerHTML = `
          <div class="seg">${[[addDays(today, -1), 'Yesterday'], [today, 'Today'], [addDays(today, 1), 'Tomorrow']].map(([v, l]) => `<button class="tap ${v === date ? 'on' : ''}" data-day="${v}">${l}</button>`).join('')}</div>
          <div class="glow-card card" style="margin-bottom:14px"><div style="position:relative;z-index:1"><small style="opacity:.9">${esc(c ? c.dayName || '' : '')}</small><h2 style="margin:2px 0;font-size:21px">${esc(nice(date))}</h2>
            <small style="opacity:.9">${c ? esc([c.weekNo ? 'Week ' + c.weekNo : '', c.teachingDayNo ? 'Teaching day ' + c.teachingDayNo : ''].filter(Boolean).join(' · ')) : ''}</small></div></div>
          ${classes.length ? chips(classes.map(x => [x.classCode, String(x.classCode) === '0' ? 'Balvatika' : 'Class ' + x.classCode]), cls, 'data-acls') : ''}
          ${!c ? ui.empty('📅', 'No plan for this day', d.rolledForward ? 'This is the next available school day.' : 'It may be a holiday.') : `
            ${c.note ? `<div class="card" style="background:#FFFBEB;border-color:#FDE68A;margin-bottom:12px;font-size:13.5px">📌 ${esc(c.note)}</div>` : ''}
            <div class="print-area">${(c.periods || []).map((p, i) => `
              <div class="xbox period">
                <div class="per-h"><span class="per-n" style="${LG.gStyle(g(i))}">${od(p.periodNo || i + 1)}</span><div><b class="od">${esc(p.subject || '')}</b><small>${esc(p.time || '')}</small></div></div>
                ${(p.lessonLines || []).length ? `<p class="od" style="margin:0 0 8px;font-size:14.5px;font-weight:600">${p.lessonLines.map(esc).join('<br>')}</p>` : ''}
                <div class="meta-chips">${[p.loCode, ...(p.cgCodes || [])].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
                ${(p.panchapadi || []).length ? `<div class="mini-steps">${p.panchapadi.map(s => { const m = String(s).match(/^\s*\d+\.\s*([^:]+):\s*([\s\S]*)$/); return `<div>${m ? `<b class="od">${esc(m[1])}</b><p class="od">${esc(m[2])}</p>` : `<p class="od">${esc(s)}</p>`}</div>` }).join('')}</div>` : ''}
                ${p.tlm ? `<p class="od" style="font-size:13px;margin:8px 0 0"><b>🧰 TLM:</b> ${esc(p.tlm)}</p>` : ''}
                ${p.assessment ? `<p class="od" style="font-size:13px;margin:6px 0 0"><b>✅ ମୂଲ୍ୟାୟନ:</b> ${esc(p.assessment)}</p>` : ''}
                ${p.homework ? `<p class="od" style="font-size:13px;margin:6px 0 0"><b>🏠 ଗୃହକାର୍ଯ୍ୟ:</b> ${esc(p.homework)}</p>` : ''}
              </div>`).join('')}</div>
            <div class="dock">${ui.btn('Print / Save PDF', 'data-print', 'primary', 'download')}</div>`}`
        LG.hydrateIcons(ctx.body)
      }
      ctx.on('click', '[data-day]', (b) => { date = b.dataset.day; load() })
      ctx.on('click', '[data-acls]', (b) => { cls = b.dataset.acls; load() })
      ctx.on('click', '[data-print]', () => LG.printNow('Ajira ' + date, { lesson: true }))
      await load()
    },
  })

  // ================================================================ ANNUAL PLAN (ABP)
  const CLASS_LABEL = (c) => String(c) === '0' ? 'Balvatika' : 'Class ' + c
  LG.page('abp', {
    paths: ['/abp'], title: 'Annual Plan', subtitle: 'ବାର୍ଷିକ ପାଠ୍ୟ ଖସଡ଼ା', tone: 'rose',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const cfg = await ctx.api('/abp/config').catch(() => ({}))
      if (!cfg.enabled) { ctx.body.innerHTML = ui.empty('🗓️', 'Coming soon', 'The Annual Plan is being prepared.'); return }
      const { classes = [] } = await ctx.api('/abp/classes')
      ctx.body.innerHTML = `<div class="glow-card card" style="margin-bottom:16px"><div style="position:relative;z-index:1"><b style="font-size:17px">Activity-based Panchapadi 📘</b><p style="margin:4px 0 0;opacity:.92;font-size:13.5px">Chapter-wise period plans for the whole year</p></div></div>
        <div class="tiles">${classes.map((c, i) => `<button class="tile tap" data-c="${esc(c.class)}" style="${LG.gStyle(g(i))}"><span class="t-big">${String(c.class) === '0' ? '🧸' : esc(c.class)}</span><b>${CLASS_LABEL(c.class)}</b><small>${c.chapters || 0} chapters · ${c.periods || 0} periods</small></button>`).join('')}</div>`
      ctx.on('click', '[data-c]', (b) => ctx.push('abp-courses', { cls: b.dataset.c }))
    },
  })
  LG.page('abp-courses', {
    title: 'Annual Plan', tone: 'rose',
    async render(ctx) {
      ctx.title(CLASS_LABEL(ctx.params.cls), 'ବିଷୟ ବାଛନ୍ତୁ')
      ctx.body.innerHTML = ui.skeleton(4)
      const { courses = [] } = await ctx.api('/abp/courses', { query: { class: ctx.params.cls } })
      ctx.body.innerHTML = `<div class="list">${courses.map((c, i) => ui.row({ ic: 'book', g: g(i + 2), t: c.book || c.subject, s: `${c.subject && c.book ? c.subject + ' · ' : ''}${c.chapters || 0} chapters · ${c.periods || 0} periods`, badge: c.hasYearPlan ? 'Year plan' : '', attrs: `data-i="${i}"` })).join('')}</div>`
      ctx.on('click', '[data-i]', (b) => { const c = courses[+b.dataset.i]; ctx.push('abp-chapters', { cls: ctx.params.cls, subject: c.subject, book: c.book }) })
    },
  })
  LG.page('abp-chapters', {
    title: 'Chapters', tone: 'teal',
    async render(ctx) {
      const { cls, subject, book } = ctx.params
      ctx.title(book || subject, CLASS_LABEL(cls))
      ctx.body.innerHTML = ui.skeleton(6)
      const d = await ctx.api('/abp/chapters', { query: { class: cls, subject, book } })
      ctx.body.innerHTML = `
        ${d.hasYearPlan ? `<button class="card glow-card tap" data-yp style="width:100%;text-align:left;margin-bottom:14px"><div style="position:relative;z-index:1;display:flex;gap:12px;align-items:center"><span style="font-size:30px">🗓️</span><span><b>Year plan</b><small style="display:block;opacity:.9">Month-wise chapters for the whole year</small></span></div></button>` : ''}
        <div class="list">${(d.chapters || []).map((c, i) => ui.row({ ic: String(c.number || i + 1), g: g(i), t: c.titleFull || c.title, s: [c.genre, c.periodCount ? c.periodCount + ' periods' : ''].filter(Boolean).join(' · '), attrs: `data-ch="${esc(c.id)}"` })).join('')}</div>`
      ctx.on('click', '[data-ch]', (b) => ctx.push('abp-chapter', { id: b.dataset.ch }))
      ctx.on('click', '[data-yp]', () => ctx.push('abp-yearplan', { cls, subject, book }))
    },
  })
  LG.page('abp-chapter', {
    title: 'Chapter', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const d = await ctx.api('/abp/chapters/' + encodeURIComponent(ctx.params.id))
      const c = d.chapter || {}, taught = new Set((d.progress && d.progress.taught) || [])
      ctx.title(c.title || 'Chapter', [c.classLabel || CLASS_LABEL(c.class), c.book || c.subject].filter(Boolean).join(' · '))
      const periods = d.periods || []
      const draw = () => {
        ctx.body.innerHTML = `
          <div class="card" style="margin-bottom:12px"><b>${esc(c.genre || '')}</b>${c.theme ? `<p class="od" style="margin:6px 0 0;font-size:14px;color:var(--ink-2)">${esc(c.theme)}</p>` : ''}
            <div class="meter" style="background:#EDE9FE;max-width:100%;margin-top:10px"><i style="width:${periods.length ? Math.round(taught.size / periods.length * 100) : 0}%;background:var(--sunrise)"></i></div>
            <small style="color:var(--muted)">${taught.size} of ${periods.length} periods taught</small></div>
          ${d.download && d.download.ok ? ui.btn('Download chapter PDF', 'data-pdf', 'primary wide', 'download') : d.download && d.download.reason === 'PREMIUM_REQUIRED' ? '<p style="text-align:center;color:var(--muted);font-size:13px">👑 Chapter PDF is for Premium members</p>' : ''}
          ${label('Periods')}
          <div class="list">${periods.map((p, i) => ui.row({ ic: 'P' + (p.number || i + 1), g: g(i + 1), t: p.title, s: p.locked ? '🔒 Premium' : (taught.has(p.id) ? '✅ Taught' : (p.loCodes || []).map(x => x.code || x).slice(0, 2).join(' · ')), lock: p.locked, attrs: `data-p="${esc(p.id)}"` })).join('')}</div>`
        LG.hydrateIcons(ctx.body)
      }
      ctx.on('click', '[data-p]', (b) => {
        const p = periods.find(x => x.id === b.dataset.p)
        if (p.locked) { LG.toast(p.lockReason === 'LOGIN_REQUIRED' ? 'Please log in to open this period' : 'This period is for Premium members'); return }
        ctx.push('abp-period', { chapterId: ctx.params.id, periodId: p.id })
      })
      ctx.on('click', '[data-pdf]', async (b) => { busy(b, true); try { await LG.downloadApi(`/abp/chapters/${encodeURIComponent(ctx.params.id)}/pdf`, null, { sourcePath: '/abp' }) } catch (e) { LG.toast(e.status === 429 ? 'Download limit reached for this chapter' : e.message) } busy(b, false) })
      draw()
    },
    onResume(ctx) { ctx.refresh() },
  })
  LG.page('abp-period', {
    title: 'Period', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const d = await ctx.api('/abp/chapters/' + encodeURIComponent(ctx.params.chapterId))
      const periods = (d.periods || []).filter(p => !p.locked)
      const at = periods.findIndex(p => p.id === ctx.params.periodId)
      const p = periods[at] || {}
      const taught = new Set((d.progress && d.progress.taught) || [])
      ctx.title('Period ' + (p.number || ''), p.title || '')
      ctx.api('/abp/chapters/' + encodeURIComponent(ctx.params.chapterId) + '/period-view', { method: 'POST', body: { periodId: p.id } }).catch(() => {})
      const kv = (t, v) => v ? `<div class="xbox"><h3>${t}</h3><div class="reader-in od"><p>${esc(typeof v === 'string' ? v : (v.text || ''))}</p></div></div>` : ''
      const SG = ['sunset', 'violet', 'teal', 'blue', 'rose']
      ctx.body.innerHTML = `<div class="print-area">
        <div class="meta-chips">${(p.loCodes || []).map(x => `<span>${esc(x.code || x)}</span>`).join('')}</div>
        ${p.objective ? kv('🎯 Objective', p.objective) : ''}
        ${p.curricularGoal ? kv('🧭 Curricular goal', `${(p.curricularGoal.codes || []).join(', ')} ${p.curricularGoal.text || ''}`) : ''}
        ${(p.competencies || []).length ? kv('💡 Competencies', p.competencies.map(c => `${(c.codes || []).join(', ')} ${c.text || ''}`).join(' · ')) : ''}
        ${kv('📈 Learning outcome', p.learningOutcome)}
        ${(p.stages || []).map((s, i) => `<div class="step"><div class="step-h" style="${LG.gStyle(SG[i % 5])}"><span class="step-n">${esc(s.num || i + 1)}</span><b class="od">${esc(s.odia || '')} <small>(${esc(s.en || '')})</small></b></div>
          <div class="step-b"><div class="reader-in od"><ol>${(s.activities || []).map(a => `<li>${esc(a.text || a)}</li>`).join('')}</ol></div></div></div>`).join('')}
        ${kv('🧰 TLM', p.tlm)}${kv('🔀 Differentiation', p.differentiation)}${kv('👥 Multigrade', p.multigrade)}${kv('✅ Assessment', p.assessment)}${kv('🏠 Homework', p.homework)}
        </div>
        <div class="dock">${ui.btn(taught.has(p.id) ? 'Taught ✓' : 'Mark as taught', 'data-taught', taught.has(p.id) ? 'soft' : 'primary', 'check')}${ui.btn('Print', 'data-print', 'soft', 'paper')}</div>
        <div class="pn">${at > 0 ? `<button class="tap" data-go="${esc(periods[at - 1].id)}"><small>← Previous</small><b>P${esc(periods[at - 1].number)} · ${esc(periods[at - 1].title)}</b></button>` : '<span></span>'}${at < periods.length - 1 ? `<button class="tap nx" data-go="${esc(periods[at + 1].id)}"><small>Next →</small><b>P${esc(periods[at + 1].number)} · ${esc(periods[at + 1].title)}</b></button>` : '<span></span>'}</div>`
      ctx.on('click', '[data-go]', (b) => ctx.push('abp-period', { chapterId: ctx.params.chapterId, periodId: b.dataset.go }, { replace: true }))
      ctx.on('click', '[data-print]', () => LG.printNow(p.title, { lesson: true }))
      ctx.on('click', '[data-taught]', async (b) => {
        const now = !taught.has(p.id)
        try { await ctx.api('/abp/chapters/' + encodeURIComponent(ctx.params.chapterId) + '/taught', { method: 'POST', body: { periodId: p.id, taught: now } }); LG.native.haptic('success'); LG.toast(now ? 'Marked as taught ✅' : 'Unmarked'); ctx.refresh() } catch (e) { LG.toast(e.message) }
      })
    },
  })
  LG.page('abp-yearplan', {
    title: 'Year plan', tone: 'rose',
    async render(ctx) {
      const { cls, subject, book } = ctx.params
      ctx.body.innerHTML = ui.skeleton(4)
      const { yearPlan: y } = await ctx.api('/abp/yearplan', { query: { class: cls, subject, book } })
      ctx.title(y.title || 'Year plan', CLASS_LABEL(cls))
      ctx.body.innerHTML = `
        ${(y.stats || []).length ? `<div class="kpis" style="margin-bottom:12px">${y.stats.slice(0, 3).map(s => `<div class="kpi"><b>${esc(s.value)}</b><small>${esc(s.label)}</small></div>`).join('')}</div>` : ''}
        ${ui.btn('Download year plan PDF', 'data-pdf', 'primary wide', 'download')}
        <div class="doc print-area" style="margin-top:14px;overflow-x:auto">${(y.tables || []).map(t => `<h3 style="margin:10px 0 6px">${esc(t.caption || '')}</h3><table><tr>${(t.headers || []).map(h => `<th>${esc(h)}</th>`).join('')}</tr>${(t.rows || []).map(r => `<tr>${r.map(c => `<td ${c.colspan ? `colspan="${+c.colspan}"` : ''} ${c.span ? `rowspan="${+c.span}"` : ''}>${esc(c.text)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}</div>`
      LG.hydrateIcons(ctx.body)
      ctx.on('click', '[data-pdf]', async (b) => { busy(b, true); try { await LG.downloadApi('/abp/yearplan/pdf?' + new URLSearchParams({ class: cls, subject, book }), null, { sourcePath: '/abp' }) } catch (e) { LG.toast(e.message) } busy(b, false) })
    },
  })

  // ================================================================ MULTIGRADE
  const MODES = [['both', 'Teacher + students'], ['teacher', 'Teacher only'], ['student', 'Students only']]
  LG.page('multigrade', {
    paths: ['/multigrade'], title: 'Multigrade', subtitle: 'ବହୁ ଶ୍ରେଣୀ ଶିକ୍ଷଣ ଯୋଜନା', tone: 'teal', login: true,
    render(ctx) {
      const st = Object.assign({ date: ymd(new Date()), period: 1, school: '', mode: 'both', layout: 'detailed', slots: [null, null] }, LG.LS.get('lgapp_mg_draft', {}))
      if (st.date < ymd(new Date())) st.date = ymd(new Date())
      const save = () => LG.LS.set('lgapp_mg_draft', st)
      const draw = () => {
        ctx.body.innerHTML = `
          <div class="glow-card card" style="margin-bottom:16px"><div style="position:relative;z-index:1"><b style="font-size:17px">2–5 classes, one period 👥</b><p style="margin:4px 0 0;opacity:.92;font-size:13.5px">One plan with common and class-wise activities</p></div></div>
          <div class="form-err"></div>
          ${ui.field({ id: 'date', label: 'Date', type: 'date', value: st.date })}
          ${label('Period')}${chips([1, 2, 3, 4, 5, 6, 7].map(n => [n, 'P' + n]), st.period, 'data-per')}
          ${label('Classes in this period', st.slots.length + ' classes')}
          <div class="list">${st.slots.map((s, i) => s ? `<div class="row"><span class="row-ic" style="${LG.gStyle(g(i))}"><em>${i + 1}</em></span><span class="row-t"><b>${esc(s.lesson.name || 'Lesson')}</b><small>${esc(s.label)}</small></span><button class="tap" data-rm="${i}" style="color:var(--muted);padding:6px">${icon('x', 20)}</button></div>`
            : `<button class="row tap" data-set="${i}" style="border-style:dashed;color:var(--violet);font-weight:600">${icon('spark', 20)} Choose lesson for class ${i + 1}</button>`).join('')}
            ${st.slots.length < 5 ? `<button class="link-btn" data-more style="align-self:flex-start">+ Add another class</button>` : ''}</div>
          <div style="margin-top:14px">${ui.field({ id: 'school', label: 'School name (optional)', value: st.school })}</div>
          ${label('Activities')}${chips(MODES, st.mode, 'data-mode')}
          ${label('Layout')}${chips([['detailed', 'Detailed'], ['compact', 'Compact']], st.layout, 'data-lay')}
          ${ui.btn('Make multigrade plan', 'data-gen', 'primary wide', 'bolt')}`
        LG.hydrateIcons(ctx.body)
      }
      ctx.body.addEventListener('change', (e) => { if (e.target.id === 'date') st.date = e.target.value; if (e.target.id === 'school') st.school = e.target.value; save() })
      ctx.on('click', '[data-per]', (b) => { st.period = +b.dataset.per; save(); draw() })
      ctx.on('click', '[data-mode]', (b) => { st.mode = b.dataset.mode; save(); draw() })
      ctx.on('click', '[data-lay]', (b) => { st.layout = b.dataset.lay; save(); draw() })
      ctx.on('click', '[data-more]', () => { st.slots.push(null); draw() })
      ctx.on('click', '[data-rm]', (b) => { st.slots.length > 2 ? st.slots.splice(+b.dataset.rm, 1) : (st.slots[+b.dataset.rm] = null); save(); draw() })
      ctx.on('click', '[data-set]', async (b) => { const r = await LG.pick({ to: 'lesson', title: 'Class ' + (+b.dataset.set + 1) }); if (r && ctx.alive()) { st.slots[+b.dataset.set] = r; save(); draw() } })
      ctx.on('click', '[data-gen]', async (b) => {
        const err = ctx.body.querySelector('.form-err'), fail = (m) => { err.textContent = m; err.classList.add('on'); LG.native.haptic('error'); ctx.body.scrollTop = 0 }
        const slots = st.slots.filter(Boolean)
        if (new Date(st.date + 'T00:00').getDay() === 0) return fail('That date is a Sunday. Please choose a school day.')
        if (slots.length < 2) return fail('Choose lessons for at least 2 classes')
        busy(b, true)
        try {
          const r = await ctx.api('/multigrade/generate', { method: 'POST', body: { date: st.date, periodNumber: st.period, schoolName: st.school, activityMode: st.mode, layoutStyle: st.layout,
            slots: slots.map(s => ({ classId: s.class.id, bookId: s.book.id, chapterId: s.chapter.id, lessonId: s.lesson.id })) } })
          ctx.push('diary', { kind: 'multigrade', key: stash({ ...r, activityMode: st.mode, layoutStyle: st.layout }), title: 'Multigrade plan', file: 'Multigrade-Lesson-' + st.date })
        } catch (e) { fail(e.status === 402 ? 'Multigrade plans are for Premium members. Your account does not have an active plan.' : e.message) }
        busy(b, false)
      })
      draw()
    },
  })
  const stashed = {}
  const stash = (v) => { const k = 'p' + Date.now(); stashed[k] = v; return k }
  /** Opens a generated plan as the official one-page-per-sheet diary (PDF + print). */
  LG.openDiary = (plan, kind, title, file) => LG.push('diary', { kind, key: stash(plan), title, file })
  LG.page('diary', {
    title: 'Lesson plan', tone: 'teal', login: true,
    async render(ctx) {
      const plan = stashed[ctx.params.key]
      if (!plan) { ctx.back(); return }
      ctx.title(ctx.params.title || 'Lesson plan', plan.date ? nice(plan.date) : '')
      await diaryView(ctx, plan, ctx.params.kind, ctx.params.file)
    },
  })

  // ================================================================ INSTANT PLAN
  LG.page('instant', {
    paths: ['/instant-plan'], title: 'Instant Plan', subtitle: 'ମାତ୍ର ୩୦ ସେକେଣ୍ଡରେ', tone: 'night', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(4)
      const { timetable: tt0 } = await ctx.api('/me/timetable')
      if (!tt0 || !tt0.setupComplete) {
        ctx.body.innerHTML = `<div class="pg-empty"><div class="e-em">⚡</div><b>Set up your timetable once</b><p>Instant Plan uses your weekly timetable to prepare every day's full lesson plan in one tap. Set it up once on the website (5 minutes), then use it here every day.</p></div>
          <div class="list">${ui.webLink('/instant-plan', 'Set up my timetable', 'Weekly periods, classes and lessons')}${ui.row({ ic: 'calendar', g: 'sunset', t: 'Use Daily Plan for today', s: 'Pick today\'s lessons by hand', attrs: 'data-pg-open="/daily-plan"' })}</div>`
        LG.hydrateIcons(ctx.body); return
      }
      let date = ymd(new Date()); if (new Date().getDay() === 0) date = addDays(date, 1)
      const st = { school: LG.LS.get('lgapp_school', ''), mode: 'both', layout: 'detailed' }
      const lessonInfo = {}
      const load = async () => {
        ctx.body.innerHTML = ui.skeleton(5)
        const s = await ctx.api('/me/timetable/sync-to-date', { method: 'POST', body: { date } }).catch(() => ({ timetable: tt0 }))
        const tt = s.timetable || tt0
        const wd = new Date(date + 'T00:00').getDay()
        const periods = ((tt.weekly || {})[wd] || []).filter(p => p && p.lessonId)
        const holiday = (tt.holidays || []).includes(date)
        await Promise.all(periods.filter(p => !lessonInfo[p.lessonId]).map(p => ctx.api('/lessons/' + encodeURIComponent(p.lessonId)).then(d => { lessonInfo[p.lessonId] = d }).catch(e => { lessonInfo[p.lessonId] = e.data || {} })))
        if (!ctx.alive()) return
        ctx.body.innerHTML = `
          <div class="form-err"></div>
          ${ui.field({ id: 'date', label: 'Date', type: 'date', value: date })}
          ${holiday ? `<div class="gate"><div class="gate-ic">🏖️</div><b>Marked as a holiday</b><p>No plan is needed for this day.</p><button class="btn btn-soft tap" data-hol="0">Not a holiday</button></div>` : `
          ${label(new Date(date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long' }) + ' periods', periods.length + ' periods')}
          ${periods.length ? `<div class="list">${periods.map((p, i) => { const L = (lessonInfo[p.lessonId] || {}).lesson || {}; const c = (lessonInfo[p.lessonId] || {}).class || {}; return ui.row({ ic: 'P' + (p.periodNumber || i + 1), g: g(i), t: L.title || 'Lesson', s: [p.time, c.name, L.period ? 'Period ' + L.period : ''].filter(Boolean).join(' · '), right: '', attrs: '' }) }).join('')}</div>` : ui.empty('📭', 'No periods on this day', 'Edit your timetable on the website to add periods.')}
          <div style="margin-top:14px">${ui.field({ id: 'school', label: 'School name', value: st.school })}</div>
          ${label('Activities')}${chips(MODES, st.mode, 'data-mode')}
          ${periods.length ? ui.btn('Make today\'s plan', 'data-gen', 'primary wide', 'bolt') : ''}
          <div style="margin-top:10px">${ui.btn('Mark as holiday', 'data-hol="1"', 'ghost wide', 'calendar')}</div>`}
          <div style="margin-top:14px">${ui.webLink('/instant-plan', 'Edit my timetable', 'Change periods, classes or lessons')}</div>`
        LG.hydrateIcons(ctx.body)
        ctx.periods = periods; ctx.tt = tt
      }
      ctx.body.addEventListener('change', (e) => { if (e.target.id === 'date') { date = e.target.value; load() } if (e.target.id === 'school') { st.school = e.target.value; LG.LS.set('lgapp_school', st.school) } })
      ctx.on('click', '[data-mode]', (b) => { st.mode = b.dataset.mode; ctx.body.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)) })
      ctx.on('click', '[data-hol]', async (b) => { try { await ctx.api('/me/timetable/holiday', { method: 'POST', body: { date, mark: b.dataset.hol === '1' } }); load() } catch (e) { LG.toast(e.message) } })
      ctx.on('click', '[data-gen]', async (b) => {
        const err = ctx.body.querySelector('.form-err'), fail = (m) => { err.textContent = m; err.classList.add('on'); ctx.body.scrollTop = 0 }
        if (new Date(date + 'T00:00').getDay() === 0) return fail('That date is a Sunday.')
        busy(b, true)
        try {
          const plan = await ctx.api('/daily-plan/generate', { method: 'POST', body: { date, schoolName: st.school, classType: ctx.tt.classType || 'single', slots: ctx.periods.map(p => ({ lessonId: p.lessonId })), activityMode: st.mode, layoutStyle: st.layout } })
          ctx.push('diary', { kind: 'instant', key: stash({ ...plan, activityMode: st.mode, layoutStyle: st.layout }), title: 'Instant plan', file: 'Instant-Daily-Lesson-Plan-' + date })
        } catch (e) { fail(e.status === 402 ? 'Instant plans are for Premium members. Your account does not have an active plan.' : e.message) }
        busy(b, false)
      })
      await load()
    },
  })

  // ================================================================ AI WALLET
  LG.page('wallet', {
    paths: ['/ai-wallet'], title: 'AI Wallet', subtitle: 'AI କ୍ରେଡିଟ୍', tone: 'night', login: true, hero: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const [w, t] = await Promise.all([ctx.api('/ai-credits/wallet'), ctx.api('/ai-credits/transactions', { query: { limit: 100 } }).catch(() => ({ transactions: [] }))])
      const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
      const rows = (t.transactions || []).map((x, i) => {
        const credit = x.type === 'credit', refund = x.type === 'refund'
        const title = credit ? 'Credits added' : refund ? 'Refund' + (x.reason ? ' · ' + x.reason : '') : String([x.zone, x.generationType].filter(Boolean).join(' · ')).replace(/_/g, ' ') + (x.cacheHit ? ' (cached)' : '')
        return `<div class="row"><span class="row-ic" style="${LG.gStyle(credit ? 'green' : refund ? 'amber' : x.cacheHit ? 'blue' : 'violet')}">${icon(credit ? 'gift' : refund ? 'refund' : 'spark', 20)}</span>
          <span class="row-t"><b style="text-transform:capitalize">${esc(title)}</b><small>${esc(new Date(x.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}${x.balanceAfter != null ? ' · balance ' + fmt(x.balanceAfter) : ''}</small></span>
          <b style="color:${(credit || refund) ? '#059669' : 'var(--ink)'}">${(credit || refund) && x.credits > 0 ? '+' : ''}${fmt(x.credits)}</b></div>`
      })
      ctx.body.innerHTML = `
        <div class="card glow-card" style="text-align:center"><div style="position:relative;z-index:1"><small style="opacity:.9">Available credits</small><div style="font-size:44px;font-weight:800;line-height:1.1">${fmt(w.balance)}</div><small style="opacity:.9">💎 Used for AI question papers, assessments & worksheets</small></div></div>
        ${LG.direct ? `<div style="margin-top:12px">${LG.buyBtn('/ai-wallet', 'Buy more credits')}</div>` : ''}
        <div class="kpis" style="margin-top:12px"><div class="kpi"><b>${fmt(w.lifetimePurchased)}</b><small>Added</small></div><div class="kpi"><b>${fmt(Math.abs(w.lifetimeSpent || 0))}</b><small>Used</small></div><div class="kpi"><b>${fmt(w.lifetimeRefunded)}</b><small>Refunded</small></div></div>
        ${label('History')}${rows.length ? `<div class="list">${rows.join('')}</div>` : ui.empty('💎', 'No activity yet', 'Credits you use and receive will appear here.')}`
      LG.hydrateIcons(ctx.body)
    },
  })
})()
