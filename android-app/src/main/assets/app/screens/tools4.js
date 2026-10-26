/* Phase 4 tools: Resource Library, MCM Test, Teacher Observation, My Library. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui } = LG
  const GR = ['sunset', 'violet', 'teal', 'rose', 'blue', 'amber', 'green', 'fuchsia', 'indigo']
  const g = (i) => GR[i % GR.length]
  const label = (t, sub) => `<div class="sec-t" style="margin:8px 2px 10px"><h3>${esc(t)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`
  const chips = (list, val, attr) => `<div class="chips" style="flex-wrap:wrap;margin:-4px 0 14px">${list.map(([k, l]) => `<button class="chip tap ${String(k) === String(val) ? 'on' : ''}" ${attr}="${esc(k)}">${esc(l)}</button>`).join('')}</div>`
  const busy = (b, on) => { if (!b) return; if (on) { b.dataset.l = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin-s"></span>Please wait…' } else { b.disabled = false; b.innerHTML = b.dataset.l; LG.hydrateIcons(b) } }
  const docStyles = (doc) => Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n').replace(/(^|})\s*(body|html)\b/g, '$1 .doc')

  // ================================================================ RESOURCE LIBRARY
  LG.page('res-home', {
    paths: ['/resources', '/resource-library'], title: 'Resource Library', subtitle: 'ପାଠାଗାର', tone: 'teal',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(6)
      const [t, c] = await Promise.all([ctx.api('/academic-resources/types'), ctx.api('/academic-resources/counts').catch(() => ({}))])
      const counts = c.counts || {}
      const types = (t.types || []).filter(x => counts[x.id] !== 0)
      ctx.body.innerHTML = `<div class="tiles">${types.map((x, i) => `<button class="tile tap" data-t="${esc(x.id)}" data-l="${esc(x.label)}" style="${LG.gStyle(g(i))};min-height:128px"><span class="t-big" style="font-size:30px">${esc(x.emoji || '📁')}</span><b>${esc(x.label)}</b><small>${counts[x.id] != null ? counts[x.id] + ' items' : esc(x.desc || '')}</small></button>`).join('')}</div>`
      ctx.on('click', '[data-t]', (b) => ctx.push('res-list', { type: b.dataset.t, label: b.dataset.l }))
    },
  })
  LG.page('res-list', {
    title: 'Resources', tone: 'teal',
    async render(ctx) {
      ctx.title(ctx.params.label || 'Resources')
      const classes = await LG.lessonData.getClasses().catch(() => [])
      const st = { classId: '', subject: '', search: '' }
      ctx.body.innerHTML = `<div class="sbox">${icon('search', 20)}<input id="q" type="search" placeholder="Search…"></div><div id="cf"></div><div id="rl"></div>`
      const rl = ctx.body.querySelector('#rl')
      let seq = 0
      const load = async () => {
        const my = ++seq
        ctx.body.querySelector('#cf').innerHTML = chips([['', 'All classes'], ...classes.map(c => [c.id, c.name])], st.classId, 'data-c')
        rl.innerHTML = ui.skeleton(5)
        try {
          const d = await ctx.api('/academic-resources', { query: { type: ctx.params.type, limit: 200, classId: st.classId, search: st.search } })
          if (my !== seq) return
          const items = d.resources || []
          rl.innerHTML = items.length ? `<div class="list">${items.map((r, i) => ui.row({ ic: r.contentType === 'pdf' ? 'paper' : 'book', g: g(i), t: r.title, s: [r.className, r.subject, r.chapterName, r.pageCount ? r.pageCount + ' pages' : ''].filter(Boolean).join(' · '), attrs: `data-r="${esc(r.id)}"` })).join('')}</div>` : ui.empty('📂', 'Nothing here yet', 'Try another class or search word.')
          LG.hydrateIcons(rl)
        } catch (e) { LG.showError(rl, e, load) }
      }
      ctx.on('click', '[data-c]', (b) => { st.classId = b.dataset.c; load() })
      ctx.on('click', '[data-r]', (b) => ctx.push('res-view', { id: b.dataset.r }))
      let t; ctx.body.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.search = e.target.value.trim(); load() }, 300) })
      load()
    },
  })
  function schoolSheet(needPassword) {
    return new Promise((resolve) => {
      const bg = LG.sheet(`<b style="font-size:16px">Download assessment</b>
        <p style="color:var(--ink-2);font-size:13.5px;margin:6px 0 14px">Your school name is printed on the paper.</p>
        ${ui.field({ id: 'sn', label: 'School name', value: LG.LS.get('lgapp_school', '') })}
        ${needPassword ? `${ui.field({ id: 'pw1', label: 'PDF password (min 6)', type: 'password' })}${ui.field({ id: 'pw2', label: 'Confirm password', type: 'password' })}<p style="font-size:12.5px;color:var(--muted);margin:-6px 0 12px">You'll need this password to open the PDF. Keep it safe.</p>` : ''}
        <div class="form-err"></div>${ui.btn('Download PDF', 'data-ok', 'primary wide', 'download')}`, () => {})
      LG.hydrateIcons(bg)
      bg.querySelector('[data-ok]').onclick = () => {
        const sn = bg.querySelector('#sn').value.trim(), e = bg.querySelector('.form-err')
        const fail = (m) => { e.textContent = m; e.classList.add('on') }
        if (!sn) return fail('Enter your school name')
        let password
        if (needPassword) { password = bg.querySelector('#pw1').value; if (password.length < 6) return fail('Password must be at least 6 characters'); if (password !== bg.querySelector('#pw2').value) return fail('Passwords do not match') }
        LG.LS.set('lgapp_school', sn); bg.remove(); resolve({ schoolName: sn, password })
      }
    })
  }
  LG.page('res-view', {
    title: 'Resource', tone: 'teal',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(4)
      const { resource: r } = await ctx.api('/academic-resources/' + encodeURIComponent(ctx.params.id))
      ctx.title(r.title || 'Resource', [r.className, r.subject, r.chapterName].filter(Boolean).join(' · '))
      const id = encodeURIComponent(r.id)
      const slots = new Set([...(r.sections || []).map(s => s.index), ...(r.assessmentPdfs || []).map(a => a.assessmentNumber)].filter(n => n >= 1 && n <= 5))
      if (r.resourceType === 'chapter_assessments' && slots.size) {
        ctx.body.innerHTML = `<div class="glow-card card" style="margin-bottom:14px"><div style="position:relative;z-index:1"><b style="font-size:17px">Chapter assessments 📝</b><p style="margin:4px 0 0;opacity:.92;font-size:13.5px">${slots.size} ready-to-print tests for this chapter</p></div></div>
          <div class="list">${[1, 2, 3, 4, 5].filter(n => slots.has(n)).map(n => { const s = (r.sections || []).find(x => x.index === n); return ui.row({ ic: String(n), g: g(n), t: 'Assessment ' + n, s: s && s.title ? s.title : (r.passwordProtected ? '🔒 Password-protected PDF' : 'PDF with your school name'), right: r.allowPdfDownload !== false ? `<span class="row-chev">${icon('download', 20)}</span>` : '', attrs: `data-a="${n}"` }) }).join('')}</div>`
        ctx.on('click', '[data-a]', async (b) => {
          if (r.allowPdfDownload === false) return LG.toast('Download is turned off for this resource')
          const f = await schoolSheet(!!r.passwordProtected); if (!f) return
          busy(b, true)
          try { await LG.downloadApi(`/academic-resources/${id}/assessment-pdf`, null, { method: 'POST', body: { assessmentNumber: +b.dataset.a, schoolName: f.schoolName, password: f.password }, sourcePath: '/resources' }) } catch (e) { LG.toast(e.message) }
          busy(b, false)
        })
      } else if (r.contentType === 'pdf') {
        ctx.body.innerHTML = `<div class="pg-empty"><div class="e-em">📄</div><b>${esc(r.title)}</b><p>${r.allowPdfDownload !== false ? 'Save it on your phone and open it in your PDF reader. It is also kept in your Cloud Library.' : 'This PDF can only be viewed on the website.'}</p>
          ${r.allowPdfDownload !== false ? ui.btn('Download & open PDF', 'data-dl', 'primary', 'download') : ''}</div>
          ${r.allowPdfDownload === false ? ui.webLink('/resources', 'View on the website') : ''}`
        ctx.on('click', '[data-dl]', async (b) => { busy(b, true); try { await LG.downloadApi(`/academic-resources/${id}/pdf-download`, null, { sourcePath: '/resources' }) } catch (e) { LG.toast(e.status === 429 ? 'Daily download limit reached' : e.message) } busy(b, false) })
      } else {
        const doc = new DOMParser().parseFromString(r.htmlContent || '', 'text/html')
        ctx.body.innerHTML = `<div class="doc print-area"><style>${docStyles(doc)}</style>${LG.clean(doc.body.innerHTML)}</div>
          ${r.allowPrint !== false ? `<div class="dock">${ui.btn('Print / Save PDF', 'data-print', 'primary', 'download')}</div>` : ''}`
        ctx.on('click', '[data-print]', () => LG.printNow(r.title))
      }
      LG.hydrateIcons(ctx.body)
    },
  })

  // ================================================================ MCM TEST
  function certificateHtml(c) {
    const d = new Date(c.submittedAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    return `<div class="cert"><div class="cert-in">
      <div class="cert-logo">📚</div><small>Lesson Guru Odisha</small>
      <h2>${esc(c.certificateTitle || 'Certificate of Achievement')}</h2>
      <p>This is to certify that</p><h1>${esc(c.userName || LG.state.user && LG.state.user.name || 'Teacher')}</h1>
      <p>has successfully passed the <b>${esc(c.monthEn || c.monthLabel || '')} MCM Test</b><br>with a score of <b>${esc(c.percentage)}%</b> (${esc(c.correctCount)}/${esc(c.total)} correct).</p>
      <div class="cert-f"><span>${esc(d)}</span><span>ID: ${esc(c.certificateId)}</span></div>
      <small>Verify at lessonguruodisha.in/verify-mcm?id=${esc(c.certificateId)}</small></div></div>`
  }
  LG.page('mcm', {
    paths: ['/mcm-test'], title: 'MCM Test', subtitle: 'MCM ପରୀକ୍ଷା', tone: 'night', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(4)
      const { test, attempt } = await ctx.api('/mcm-test/active')
      if (!test) { ctx.body.innerHTML = ui.empty('📝', 'No test this month yet', 'The next MCM test will appear here.'); return }
      ctx.title(test.title || 'MCM Test', test.monthLabel || test.monthEn || '')
      const intro = () => {
        ctx.body.innerHTML = `
          <div class="glow-card card" style="margin-bottom:14px"><div style="position:relative;z-index:1"><small style="opacity:.9">${esc(test.monthEn || test.monthLabel || '')}</small><h2 style="margin:2px 0 6px;font-size:21px">${esc(test.title || 'MCM Test')}</h2>
            <div style="display:flex;gap:14px;font-size:13px;opacity:.95"><span>❓ ${test.questionCount} questions</span><span>⏱️ ${test.durationMinutes} min</span><span>🎯 Pass ${test.passingPercentage}%</span></div></div></div>
          ${attempt ? `<div class="card" style="text-align:center"><div style="font-size:44px">${attempt.passed ? '🏆' : '📘'}</div><b style="font-size:22px">${esc(attempt.percentage)}%</b><p style="margin:4px 0 12px;color:var(--ink-2)">${attempt.correctCount} correct · ${attempt.wrongCount} wrong · ${attempt.passed ? 'Passed 🎉' : 'Not passed this time'}</p>
              ${attempt.passed && attempt.certificateId ? ui.btn('View certificate', 'data-cert', 'primary wide', 'award') : ''}<p style="font-size:12.5px;color:var(--muted);margin-top:10px">One attempt per test. See you next month!</p></div>`
            : `${test.instructions ? `<div class="xbox"><h3>📋 Instructions</h3><div class="reader-in od"><p>${esc(test.instructions)}</p></div></div>` : ''}${ui.btn('Start test', 'data-start', 'primary wide', 'arrow')}`}
          <div style="margin-top:14px">${ui.row({ ic: 'award', g: 'gold', t: 'Leaderboard', s: 'Top teachers this month', attrs: 'data-lb' })}</div>`
        LG.hydrateIcons(ctx.body)
      }
      let timer
      const take = () => {
        const answers = {}, qs = test.questions || [], startedAt = new Date().toISOString()
        let i = 0, left = (test.durationMinutes || 10) * 60
        const tick = () => { left--; const el = ctx.body.querySelector('#tm'); if (el) el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (left <= 0) { clearInterval(timer); submit(true) } }
        const draw = () => {
          const q = qs[i]
          ctx.body.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b>Question ${i + 1} of ${qs.length}</b><span class="badge-a" style="font-size:13px">⏱️ <span id="tm">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span></span></div>
            <div class="meter" style="background:#EDE9FE;max-width:100%"><i style="width:${(Object.keys(answers).length / qs.length) * 100}%;background:var(--sunrise)"></i></div>
            <div class="card" style="margin:12px 0"><p class="od" style="margin:0;font-size:16px;line-height:1.6;font-weight:600">${esc(q.q)}</p></div>
            <div class="list">${(q.options || []).map((o, k) => `<button class="row tap opt ${answers[q.id] === k ? 'on' : ''}" data-opt="${k}"><span class="row-ic" style="${LG.gStyle(answers[q.id] === k ? 'violet' : 'slate')}"><em>${'ABCD'[k] || k + 1}</em></span><span class="row-t"><b class="od" style="font-weight:500">${esc(o)}</b></span></button>`).join('')}</div>
            <div class="dock">${ui.btn('Previous', 'data-prev' + (i === 0 ? ' disabled' : ''), 'soft', '')}${i < qs.length - 1 ? ui.btn('Next', 'data-next', 'primary', 'arrow') : ui.btn('Submit', 'data-submit', 'primary', 'check')}</div>
            <div class="qgrid-m">${qs.map((x, k) => `<button class="tap ${k === i ? 'cur' : ''} ${answers[x.id] != null ? 'ans' : ''}" data-jump="${k}">${k + 1}</button>`).join('')}</div>`
          LG.hydrateIcons(ctx.body)
        }
        ctx.body.onclick = (e) => {
          const o = e.target.closest('[data-opt]'), j = e.target.closest('[data-jump]')
          if (o) { answers[qs[i].id] = +o.dataset.opt; LG.native.haptic('tap'); if (i < qs.length - 1) setTimeout(() => { i++; draw() }, 180); else draw() }
          if (j) { i = +j.dataset.jump; draw() }
          if (e.target.closest('[data-prev]') && i > 0) { i--; draw() }
          if (e.target.closest('[data-next]')) { i++; draw() }
          if (e.target.closest('[data-submit]')) {
            const un = qs.length - Object.keys(answers).length
            if (!un) return submit(false)
            LG.confirm(`${un} question${un > 1 ? 's' : ''} not answered`, 'Submit the test anyway? You cannot take it again.', 'Submit').then(ok => ok && submit(false))
          }
        }
        const submit = async (auto) => {
          clearInterval(timer); ctx.body.onclick = null
          ctx.body.innerHTML = `<div class="pg-empty"><div class="e-em">⏳</div><b>${auto ? 'Time is up. Submitting…' : 'Submitting…'}</b></div>`
          try {
            const { result } = await ctx.api('/mcm-test/submit', { method: 'POST', body: { testId: test.id, answers, startedAt } })
            LG.native.haptic('success'); showResult(result)
          } catch (e) { if (e.status === 409) { LG.toast('You have already taken this test'); ctx.refresh() } else LG.showError(ctx.body, e, () => submit(auto)) }
        }
        timer = setInterval(tick, 1000); draw()
      }
      const showResult = (r) => {
        ctx.body.innerHTML = `
          <div class="card" style="text-align:center;margin-bottom:12px"><div style="font-size:54px">${r.passed ? '🏆' : '📘'}</div><b style="font-size:30px">${esc(r.percentage)}%</b>
            <p style="margin:4px 0 0;color:var(--ink-2)">${r.correctCount} correct · ${r.wrongCount} wrong · ${r.marksObtained}/${r.totalMarks} marks</p>
            <p style="margin:6px 0 0;font-weight:700;color:${r.passed ? '#059669' : '#B45309'}">${r.passed ? 'Congratulations, you passed! 🎉' : `Pass mark is ${r.passingPercentage}%. Keep learning!`}</p></div>
          ${r.passed && r.certificateId ? `<div class="dock" style="position:static;background:none">${ui.btn('Certificate', 'data-cert', 'primary', 'award')}${ui.btn('Share', 'data-share-c', 'soft', 'share')}</div>` : ''}
          ${label('Answer review')}${(r.review || []).map((q, i) => `<div class="qitem"><div class="qh"><span class="qn" style="${q.isCorrect ? 'background:#DCFCE7;color:#15803D' : 'background:#FFE4E6;color:#BE123C'}">${i + 1}</span><div class="qt od">${esc(q.q)}</div></div>
            <div class="opts">${(q.options || []).map((o, k) => `<span class="${k === q.correctIndex ? 'ok' : ''}" style="${k === q.selectedIndex && !q.isCorrect ? 'background:#FFE4E6;color:#BE123C' : ''}">${'ABCD'[k]}) ${esc(o)}</span>`).join('')}</div>
            ${q.explanation ? `<div class="qm"><em style="background:#EEF2FF;color:#4338CA">💡 ${esc(q.explanation)}</em></div>` : ''}</div>`).join('')}`
        LG.hydrateIcons(ctx.body)
        ctx.lastResult = r
      }
      ctx.on('click', '[data-start]', () => take())
      ctx.on('click', '[data-lb]', () => ctx.push('mcm-board'))
      ctx.on('click', '[data-cert]', () => ctx.push('mcm-cert', { key: JSON.stringify(ctx.lastResult || { ...attempt, certificateTitle: test.certificateTitle, monthEn: test.monthEn, monthLabel: test.monthLabel, total: attempt && attempt.total }) }))
      ctx.on('click', '[data-share-c]', () => { const r = ctx.lastResult; LG.native.share('MCM certificate', `🏆 I passed the ${r.monthEn || ''} MCM Test with ${r.percentage}% on Lesson Guru Odisha!\nVerify: https://lessonguruodisha.in/verify-mcm?id=${r.certificateId}`) })
      intro()
      return () => clearInterval(timer)
    },
  })
  LG.page('mcm-cert', {
    title: 'Certificate', tone: 'night',
    render(ctx) {
      const c = JSON.parse(ctx.params.key || '{}')
      ctx.body.innerHTML = `<div class="print-area">${certificateHtml(c)}</div><div class="dock">${ui.btn('Save / print PDF', 'data-print', 'primary', 'download')}${ui.btn('Share', 'data-sh', 'soft', 'share')}</div>`
      LG.hydrateIcons(ctx.body)
      ctx.on('click', '[data-print]', () => LG.printNow('MCM certificate'))
      ctx.on('click', '[data-sh]', () => LG.native.share('MCM certificate', `🏆 I passed the ${c.monthEn || ''} MCM Test with ${c.percentage}% on Lesson Guru Odisha!\nVerify: https://lessonguruodisha.in/verify-mcm?id=${c.certificateId}`))
    },
  })
  LG.page('mcm-board', {
    title: 'Leaderboard', tone: 'night', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(6)
      const d = await ctx.api('/mcm-test/leaderboard')
      ctx.title('Leaderboard', (d.test && (d.test.monthEn || d.test.monthLabel)) || '')
      ctx.body.innerHTML = `<p style="text-align:center;color:var(--muted);margin:0 0 12px">${d.totalParticipants || 0} teachers took part</p>
        <div class="list">${(d.board || []).map(b => `<div class="row" style="${b.isYou ? 'border-color:var(--violet-2);box-shadow:0 0 0 3px rgba(139,92,246,.15)' : ''}"><span class="row-ic" style="${LG.gStyle(b.rank === 1 ? 'gold' : b.rank <= 3 ? 'sunset' : 'slate')}"><em>${b.rank <= 3 ? ['🥇', '🥈', '🥉'][b.rank - 1] : b.rank}</em></span><span class="row-t"><b>${esc(b.name)}${b.isYou ? ' (you)' : ''}</b><small>${b.correctCount}/${b.total} correct</small></span><b>${esc(b.percentage)}%</b></div>`).join('')}</div>`
    },
  })

  // ================================================================ TEACHER OBSERVATION
  LG.page('tob', {
    paths: ['/tob', '/teacher-observation'], title: 'Teacher Observation', subtitle: 'ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const cfg = await ctx.api('/tob/config').catch(() => ({}))
      if (!cfg.enabled) { ctx.body.innerHTML = ui.empty('📋', 'Coming soon', 'Teacher Observation is being prepared.'); return }
      const { courses = [] } = await ctx.api('/tob/courses')
      const byClass = {}
      courses.forEach(c => { (byClass[c.class] = byClass[c.class] || []).push(c) })
      ctx.body.innerHTML = `<div class="glow-card card" style="margin-bottom:16px"><div style="position:relative;z-index:1"><b style="font-size:17px">25-mark Task & Project 📋</b><p style="margin:4px 0 0;opacity:.92;font-size:13.5px">Two terms · LO-mapped tasks, projects and checklists</p></div></div>
        ${Object.entries(byClass).map(([cl, list]) => `${label('Class ' + cl)}<div class="list">${list.map((c, i) => ui.row({ ic: 'eye', g: g(i + +cl), t: c.subject_printed || c.subject_id, s: `${c.chapters || 0} chapters · ${c.sets || 0} sets`, attrs: `data-cl="${esc(c.class)}" data-sb="${esc(c.subject_id)}" data-sn="${esc(c.subject_printed || c.subject_id)}"` })).join('')}</div>`).join('')}
        <div style="margin-top:16px">${ui.webLink('/teacher-observation', 'Class records & gradebook', 'Student marks, registers and report cards')}</div>`
      ctx.on('click', '[data-cl]', (b) => ctx.push('tob-course', { cls: b.dataset.cl, subject: b.dataset.sb, name: b.dataset.sn }))
    },
  })
  LG.page('tob-course', {
    title: 'Teacher Observation', tone: 'night',
    async render(ctx) {
      const { cls, subject } = ctx.params
      ctx.title(ctx.params.name || subject, 'Class ' + cls)
      ctx.body.innerHTML = ui.skeleton(6)
      const { items = [] } = await ctx.api('/tob/items', { query: { class: cls, subject } })
      let tab = 't1'
      const draw = () => {
        const list = tab === 'sets' ? items.filter(x => x.type === 'set') : items.filter(x => x.type === 'chapter' && String(x.term) === (tab === 't1' ? '1' : '2'))
        ctx.body.innerHTML = `<div class="seg">${[['t1', 'Term 1'], ['t2', 'Term 2'], ['sets', 'Sets A–J']].map(([k, l]) => `<button class="tap ${tab === k ? 'on' : ''}" data-ttab="${k}">${l}</button>`).join('')}</div>
          ${list.length ? `<div class="list">${list.map((x, i) => ui.row({ ic: x.type === 'set' ? x.setCode : String(x.chapterNo || i + 1), g: g(i), t: x.title || (x.type === 'set' ? 'Set ' + x.setCode : 'Chapter ' + x.chapterNo), s: [x.type === 'set' ? (x.term === 'full' ? 'Full year' : 'Term ' + x.term) : '', x.coverage ? `LO ${x.coverage.covered}/${x.coverage.total}` : ''].filter(Boolean).join(' · '), attrs: `data-it="${esc(x.id)}"` })).join('')}</div>` : ui.empty('📭', 'Nothing here', '')}`
        LG.hydrateIcons(ctx.body)
      }
      ctx.on('click', '[data-ttab]', (b) => { tab = b.dataset.ttab; draw() })
      ctx.on('click', '[data-it]', (b) => ctx.push('tob-item', { id: b.dataset.it }))
      draw()
    },
  })
  LG.page('tob-item', {
    title: 'Tasks & projects', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const it = await ctx.api('/tob/items/' + encodeURIComponent(ctx.params.id)).then(d => (d.locked ? d : (d.item || d)))
      if (it.locked) {
        const x = it.item || {}
        ctx.title(x.title || 'Teacher Observation')
        ctx.body.innerHTML = `<div class="gate"><div class="gate-ic">🔒</div><b>Not on your account</b><p>This ${x.type === 'set' ? 'set' : 'chapter'} is not included in your account.${LG.noBuy()}</p>${LG.buyBtn('/store/teacher-observation', 'Get it')}</div>`
        return
      }
      ctx.title(it.title || (it.type === 'set' ? 'Set ' + it.setCode : 'Chapter ' + it.chapterNo), 'Class ' + it.class)
      const cards = it.cards || []
      const part = (p) => cards.filter(c => c.part === p)
      const row = (c, i) => ui.row({ ic: c.part === 'A' ? 'T' + c.num : 'P' + c.num, g: c.part === 'A' ? g(i) : g(i + 4), t: c.title, s: [c.kind, (c.los || []).map(l => l.lo_code).slice(0, 2).join(', ')].filter(Boolean).join(' · '), attrs: `data-card="${c.part}|${c.num}"` })
      ctx.body.innerHTML = `${label('Part A · Tasks', part('A').length + '')}<div class="list">${part('A').map(row).join('')}</div>
        ${part('B').length ? label('Part B · Projects', part('B').length + '') + `<div class="list">${part('B').map(row).join('')}</div>` : ''}`
      ctx.on('click', '[data-card]', (b) => {
        const [p, num] = b.dataset.card.split('|')
        const q = { class: it.class, subject: it.subject_id, part: p === 'A' ? 'task' : 'project', num }
        if (it.type === 'set') { q.set = it.setCode; q.term = it.term } else q.chapter = it.chapterNo
        ctx.push('tob-detail', q)
      })
    },
  })
  LG.page('tob-detail', {
    title: 'Task', tone: 'night',
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const q = Object.assign({}, ctx.params)
      const { detail: d, viewer = {} } = await ctx.api('/tob/detail', { query: q })
      ctx.title(d.title || 'Task', [d.subject_printed, d.chapterTitle || (d.setCode ? 'Set ' + d.setCode : '')].filter(Boolean).join(' · '))
      const B = d.blocks || {}
      const sec = (em, t, k) => B[k] && B[k].html ? `<div class="xbox"><h3>${em} ${t}</h3><div class="reader-in od">${LG.clean(B[k].html)}</div></div>` : ''
      const qs = new URLSearchParams(q).toString()
      ctx.body.innerHTML = `<div class="print-area">
          <div class="meta-chips">${[d.kind, d.cognitive && d.cognitive.level, ...(d.los || []).map(l => l.lo_code)].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
          ${(d.tiles || []).length ? `<div class="kpis" style="margin-bottom:12px">${d.tiles.slice(0, 3).map(t => `<div class="kpi"><b style="font-size:16px">${esc(t.value)}</b><small>${esc(t.label)}</small></div>`).join('')}</div>` : ''}
          ${sec('🎯', 'Objective', 'objective')}${sec('📋', 'Instructions', 'instructions')}${sec('✍️', 'Task', 'task')}${sec('🧰', 'Materials', 'materials')}${sec('🔄', 'Process', 'process')}${sec('👥', 'Roles', 'roles')}${sec('🗣️', 'Oral', 'oral')}${sec('☑️', 'Checklist', 'checklist')}${sec('✅', 'Answer', 'answer')}
          ${!viewer.canSeeFull ? `<div class="gate"><div class="gate-ic">👑</div><b>Answers and teacher notes are for Premium members</b><p>${LG.noBuy() || 'Get Premium to see them.'}</p>${LG.buyBtn('/plans', 'Get Premium')}</div>` : ''}
        </div>
        ${viewer.canSeeFull ? `<div class="dock">${ui.btn('Student copy', 'data-pdf="student"', 'primary', 'download')}${ui.btn('Teacher copy', 'data-pdf="teacher"', 'soft', 'paper')}</div>` : ''}
        <div class="pn">${d.prev ? `<button class="tap" data-nav='${esc(JSON.stringify(d.prev))}'><small>← Previous</small><b>${esc(d.prev.title || '')}</b></button>` : '<span></span>'}${d.next ? `<button class="tap nx" data-nav='${esc(JSON.stringify(d.next))}'><small>Next →</small><b>${esc(d.next.title || '')}</b></button>` : '<span></span>'}</div>`
      LG.hydrateIcons(ctx.body)
      ctx.on('click', '[data-pdf]', async (b) => { busy(b, true); try { await LG.downloadApi(`/tob/task/pdf?${qs}&copy=${b.dataset.pdf}`, null, { sourcePath: '/tob' }) } catch (e) { LG.toast(e.status === 403 ? 'This download is for Premium members' : e.message) } busy(b, false) })
      ctx.on('click', '[data-nav]', (b) => {
        let n = {}; try { n = JSON.parse(b.dataset.nav) } catch (e) {}
        const nq = Object.assign({}, q, { part: n.part || q.part, num: n.num != null ? n.num : q.num })
        ctx.push('tob-detail', nq, { replace: true })
      })
    },
  })

  // ================================================================ MY LIBRARY
  LG.page('library', {
    paths: ['/store/library', '/my-library'], title: 'My Library', subtitle: 'ମୋ ପାଠାଗାର', tone: 'sunset', login: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      const [ut, lib] = await Promise.all([ctx.api('/store/unit-tests/library').catch(() => ({ classes: [] })), ctx.api('/store/library').catch(() => ({ items: [] }))])
      const owned = []
      ;(ut.classes || []).forEach(c => (c.subjects || []).forEach(s => (s.chapters || []).forEach(ch => {
        if (ch.fullChapterOwned && ch.bundleFileId) owned.push({ kind: 'bundle', t: ch.title, s: `Class ${c.class} · ${s.english || s.odia || ''} · whole chapter`, pid: ch.id, fid: ch.bundleFileId, left: ch.bundleDownloadsLeft })
        ;(ch.sets || []).filter(x => x.owned && x.fileId).forEach(x => owned.push({ kind: 'set', t: `${ch.title} · Set ${x.setNo}`, s: `Class ${c.class} · ${s.english || s.odia || ''}`, pid: x.productId, fid: x.fileId, left: x.left }))
      })))
      const other = (lib.items || []).filter(i => !i.unitTest && i.product)
      other.forEach(i => (i.product.files || []).forEach(f => owned.push({ kind: 'file', t: i.product.titleOdia || i.product.titleEnglish || f.name, s: [f.name, f.pages ? f.pages + ' pages' : ''].filter(Boolean).join(' · '), pid: i.product.id, fid: f.id, left: 5 - ((i.downloadsUsed || {})[f.id] || 0), noDl: i.product.securityLevel === 4 })))
      ctx.body.innerHTML = `
        ${owned.length ? `${label('On your account', owned.length + ' items')}<div class="list">${owned.map((o, i) => ui.row({ ic: o.kind === 'bundle' ? 'layers' : 'paper', g: g(i), t: o.t, s: o.s + (o.left != null ? ` · ${Math.max(0, o.left)} downloads left` : ''), right: o.noDl ? '<span class="badge-a">View only</span>' : `<span class="row-chev">${icon('download', 20)}</span>`, attrs: `data-o="${i}"` })).join('')}</div>`
          : ui.empty('📚', 'Nothing here yet', 'Packs and papers on your account appear here.')}
        <div style="margin-top:16px">${ui.webLink('/assessment/my', 'My assessment papers', 'FA / SA papers on your account')}</div>`
      LG.hydrateIcons(ctx.body)
      ctx.on('click', '[data-o]', async (b) => {
        const o = owned[+b.dataset.o]
        if (o.noDl) return LG.toast('This item can only be viewed on the website')
        busy(b, true)
        try {
          const t = await ctx.api(`/store/file/${encodeURIComponent(o.pid)}/${encodeURIComponent(o.fid)}/token`, { method: 'POST', query: { action: 'download' } })
          await LG.downloadApi('/store/download?token=' + encodeURIComponent(t.token), null, { sourcePath: '/store/library' })
        } catch (e) {
          const code = e.data && e.data.code
          LG.toast(code === 'LIMIT_REACHED' ? 'Download limit reached for this file' : code === 'OATH_REQUIRED' ? 'Please accept the usage terms on the website first' : e.message)
        }
        busy(b, false)
      })
    },
    onResume(ctx) { ctx.refresh() },
  })
})()
