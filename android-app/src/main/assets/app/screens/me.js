/* Teacher's own space: dashboard, favourites, history. My Plan is the hub's status tab. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui } = LG

  // /my-plan and /plans are the hub's "My Plan" tab (nothing is sold in the app)
  const baseOpen = LG.open
  LG.open = function (path, opts) {
    if (/^\/(my-plan|plans)(\/|\?|$)/.test(String(path)) && !(LG.direct && /^\/plans/.test(String(path)))) { LG.popAll(); LG.setTab('premium'); return true }
    return baseOpen(path, opts)
  }

  const lessonRows = (items, empty) => items.length ? `<div class="list">${items.map((l, i) => ui.row({
    ic: 'P' + (l.period || ''), g: ['violet', 'sunset', 'teal', 'rose', 'blue'][i % 5], t: l.title || 'Lesson plan',
    s: [l.className, l.bookName].filter(Boolean).join(' · '), attrs: `data-lid="${esc(l.id)}" style="animation-delay:${Math.min(i, 10) * 25}ms"`,
  })).join('')}</div>` : empty

  function lessonList(name, path, title, sub, endpoint, emptyHtml, tone) {
    LG.page(name, {
      paths: [path], title, subtitle: sub, tone, login: true,
      async render(ctx) {
        ctx.body.innerHTML = ui.skeleton(6)
        const d = await ctx.api(endpoint)
        ctx.body.innerHTML = lessonRows(d.lessons || [], emptyHtml)
        ctx.on('click', '[data-lid]', (b) => ctx.push('lesson', { id: b.dataset.lid }))
      },
      onResume(ctx) { ctx.refresh() },
    })
  }
  lessonList('favorites', '/favorites', 'Favourites', 'ପସନ୍ଦର ଶିକ୍ଷଣ ଯୋଜନା', '/me/favorites',
    ui.empty('💜', 'No favourites yet', 'Tap the ♥ on any lesson plan to keep it here.', ui.btn('Browse lesson plans', 'data-pg-open="/lessons"', 'primary', 'book')), 'rose')
  lessonList('history', '/history', 'History', 'ସଦ୍ୟ ଦେଖିଥିବା', '/me/recent',
    ui.empty('🕘', 'Nothing here yet', 'Lesson plans you open will appear here.', ui.btn('Browse lesson plans', 'data-pg-open="/lessons"', 'primary', 'book')), 'night')

  LG.page('dashboard', {
    paths: ['/dashboard'], title: 'My Dashboard', subtitle: 'ମୋ ଡ୍ୟାସବୋର୍ଡ', login: true, hero: true,
    async render(ctx) {
      ctx.body.innerHTML = ui.skeleton(5)
      await LG.refreshUser()
      const u = LG.state.user || {}
      const sub = LG.subInfo(u)
      const [recent, favs] = await Promise.all([
        ctx.api('/me/recent').catch(() => ({ lessons: [] })),
        ctx.api('/me/favorites').catch(() => ({ lessons: [] })),
      ])
      const days = new Set(LG.LS.get('lgapp_days', []))
      let streak = 0; const d = new Date()
      const key = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
      while (days.has(key(d))) { streak++; d.setDate(d.getDate() - 1) }
      const exp = u.subscription && u.subscription.expiryDate
      ctx.body.innerHTML = `
        <div class="card dash-me">
          <div class="dm-av">${esc(LG.initials(u))}</div>
          <div style="flex:1;min-width:0"><b>${esc(u.name || 'Teacher')}</b><small>+91 ${esc(String(u.mobile || '').replace(/^(\d{2})\d{6}/, '$1••••••'))}</small></div>
          <span class="pill-plan ${sub.active ? 'on' : ''}">${sub.active ? (sub.lifetime ? '👑 Lifetime' : '👑 Premium') : 'Free'}</span>
        </div>
        <div class="card ${sub.active ? 'glow-card' : ''}" style="margin-top:12px">
          <div style="position:relative;z-index:1">
            <small style="opacity:.85">${sub.active ? 'Your plan' : 'Plan'}</small>
            <h2 style="margin:2px 0 6px;font-size:20px">${sub.active ? (sub.lifetime ? 'Lifetime Premium' : 'Premium · ' + sub.days + ' days left') : 'Free plan'}</h2>
            ${sub.active && !sub.lifetime ? `<div class="meter" style="background:rgba(255,255,255,.25)"><i style="width:${sub.pct}%;background:#fff"></i></div><small style="opacity:.9;display:block;margin-top:6px">Valid until ${esc(new Date(exp).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}</small>` : ''}
            ${!sub.active ? `<p style="margin:0;color:var(--ink-2);font-size:13.5px">Free tools are ready to use.${LG.noBuy()}</p>${LG.buyBtn('/plans', 'Get Premium')}` : ''}
          </div>
        </div>
        <div class="kpis" style="margin-top:12px">
          <div class="kpi"><b>${streak}</b><small>🔥 Day streak</small></div>
          <div class="kpi"><b>${(recent.lessons || []).length}</b><small>📖 Recent</small></div>
          <div class="kpi"><b>${(favs.lessons || []).length}</b><small>💜 Favourites</small></div>
        </div>
        <div class="sec-t"><h3>Continue teaching</h3>${(recent.lessons || []).length > 5 ? '<button class="link-btn" data-pg-open="/history">See all</button>' : ''}</div>
        ${lessonRows((recent.lessons || []).slice(0, 5), ui.empty('📚', 'Start your first lesson', '', ui.btn('Browse lesson plans', 'data-pg-open="/lessons"', 'primary', 'book')))}
        <div class="sec-t"><h3>Favourites</h3>${(favs.lessons || []).length > 5 ? '<button class="link-btn" data-pg-open="/favorites">See all</button>' : ''}</div>
        ${lessonRows((favs.lessons || []).slice(0, 5), `<div class="card" style="text-align:center;color:var(--ink-2);font-size:13.5px">Tap ♥ on a lesson plan to save it here.</div>`)}
        <div class="sec-t"><h3>Quick actions</h3></div>
        <div class="list">
          ${ui.row({ ic: 'calendar', g: 'sunset', t: 'Make today\'s daily plan', s: 'Full Panchapadi for every period', attrs: 'data-pg-open="/daily-plan"' })}
          ${ui.row({ ic: 'cloud', g: 'teal', t: 'Cloud Library', s: 'Your saved PDFs', attrs: 'data-tabgo="cloud"' })}
          ${ui.row({ ic: 'shield', g: 'indigo', t: 'Account & security', s: 'Password, recovery, delete account', attrs: 'data-tabgo="profile"' })}
        </div>`
      ctx.on('click', '[data-lid]', (b) => ctx.push('lesson', { id: b.dataset.lid }))
      ctx.on('click', '[data-tabgo]', (b) => { LG.popAll(); LG.setTab(b.dataset.tabgo) })
    },
    onResume(ctx) { ctx.refresh() },
  })
})()
