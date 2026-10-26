/* Lesson Guru Odisha — native screens framework.
 * A stack of full-screen pages that slide over the hub tabs. Each screen is registered with
 * LG.page(name, def) in screens/*.js and talks to the same backend as the website (/api/*, same
 * login token), so teachers keep their accounts, Premium and data.
 */
(function () {
  'use strict'
  const LG = window.LG
  const { $, esc, icon, native, LS, toast } = LG

  // ------------------------------------------------------------ backend
  class ApiError extends Error {
    constructor(status, data) {
      super((data && (data.error || data.message)) || (status === 0 ? 'No internet connection' : 'Something went wrong (' + status + ')'))
      this.status = status; this.data = data || {}
    }
  }
  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers)
    const t = LG.token()
    if (t) headers.Authorization = 'Bearer ' + t
    let body = opts.body
    if (body && !(body instanceof FormData) && typeof body !== 'string') { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body) }
    let url = '/api' + path
    if (opts.query) {
      const q = new URLSearchParams()
      Object.entries(opts.query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v) })
      const qs = q.toString(); if (qs) url += (url.includes('?') ? '&' : '?') + qs
    }
    let r
    try { r = await fetch(url, { method: opts.method || 'GET', headers, body, cache: 'no-store' }) } catch (e) { throw new ApiError(0) }
    if (opts.raw) { if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => ({}))); return r }
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      if (r.status === 401 && t && !opts.noAuthRedirect && !data.preview) {
        if (data.code === 'SESSION_REPLACED') { try { localStorage.setItem('em_session_kicked', '1') } catch (e) {} }
        sessionExpired()
      }
      throw new ApiError(r.status, data)
    }
    return data
  }
  let expiredShown = false
  function sessionExpired() {
    if (expiredShown) return
    expiredShown = true
    LS.del('em_token'); LS.del('lgapp_user'); LG.state.user = null
    toast('Please log in again')
    setTimeout(() => { expiredShown = false; open('/login', { replace: true }) }, 300)
  }

  // ------------------------------------------------------------ registry & routes
  const PAGES = {}
  const ROUTES = [] // [regex, name, paramNames]
  function page(name, def) {
    PAGES[name] = def
    ;(def.paths || []).forEach(p => {
      const names = []
      const rx = new RegExp('^' + p.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)' }) + '/?$')
      ROUTES.push([rx, name, names])
    })
  }
  function match(path) {
    const [p, qs] = String(path).split('?')
    for (const [rx, name, names] of ROUTES) {
      const m = p.match(rx)
      if (m) {
        const params = Object.fromEntries(new URLSearchParams(qs || ''))
        names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]) })
        return { name, params }
      }
    }
    return null
  }

  // ------------------------------------------------------------ stack
  const stack = []
  let host
  function ensureHost() {
    if (host) return host
    host = document.createElement('div'); host.id = 'pages'
    document.body.appendChild(host)
    return host
  }

  /** Opens a path as a native screen. Returns false when no screen handles it (caller loads the web page). */
  function open(path, opts = {}) {
    const m = match(path)
    if (!m) return false
    push(m.name, m.params, opts)
    return true
  }

  function push(name, params = {}, opts = {}) {
    const def = PAGES[name]
    if (!def) return false
    if (def.login && !LG.token()) {
      toast('Please log in first')
      return push('login', { next: def.loginNext !== false ? pathOf(name, params) : '' }, opts)
    }
    ensureHost()
    if (opts.replace && stack.length) { const old = stack.pop(); old.el.remove(); old.cleanup && old.cleanup() }
    const el = document.createElement('section')
    el.className = 'pg' + (def.tone ? ' tone-' + def.tone : '') + (stack.length || opts.replace ? '' : ' first')
    el.innerHTML = `
      <header class="pg-h${def.hero ? ' hero-h' : ''}">
        <button class="pg-back tap" data-pg-back aria-label="Back">${icon('chev', 24, 2.4)}</button>
        <div class="pg-tt"><b></b><small class="od"></small></div>
        <div class="pg-act"></div>
        <button class="pg-menu tap" data-pg-menu aria-label="All pages">${icon('grid', 21)}</button>
      </header>
      <div class="pg-body"></div>`
    host.appendChild(el)
    const body = el.querySelector('.pg-body')
    const handlers = []
    const ctx = {
      name, params, el, body,
      api, LG,
      title(t, sub) { el.querySelector('.pg-tt b').textContent = t || ''; el.querySelector('.pg-tt small').textContent = sub || '' },
      actions(html) { el.querySelector('.pg-act').innerHTML = html || '' },
      push: (n, p, o) => push(n, p, o),
      open: (path, o) => LG.open(path, o) || (LG.native.haptic('tap'), (location.href = path), true),
      back: () => pop(),
      refresh: () => run(),
      on(type, sel, fn) { // removed again when the screen re-renders (refresh / retry)
        const h = (e) => { const t = e.target.closest(sel); if (t && el.contains(t)) fn(t, e) }
        el.addEventListener(type, h); handlers.push([type, h])
      },
      alive: () => stack.includes(entry),
    }
    const entry = { name, params, el, ctx, def }
    stack.push(entry)
    ctx.title(def.title || '', def.subtitle || '')
    el.addEventListener('scroll', () => {}, { passive: true })
    const watchScroll = (b) => b.addEventListener('scroll', () => el.classList.toggle('scrolled', b.scrollTop > 8), { passive: true })
    watchScroll(body)
    async function run() {
      // a re-render starts clean: no duplicate tap handlers, timers or body listeners from the last one
      handlers.splice(0).forEach(([t, h]) => el.removeEventListener(t, h))
      if (entry.cleanup) { try { entry.cleanup() } catch (e) {} entry.cleanup = null }
      if (rendered) {
        const fresh = document.createElement('div'); fresh.className = 'pg-body'; fresh.innerHTML = ctx.body.innerHTML
        ctx.body.replaceWith(fresh); ctx.body = fresh; watchScroll(fresh)
      }
      rendered = true
      try { entry.cleanup = await def.render(ctx) } catch (e) { showError(ctx.body, e, run) }
      LG.hydrateIcons(el)
    }
    let rendered = false
    requestAnimationFrame(() => el.classList.add('in'))
    navSync()
    native.haptic('tap')
    native.statusBar(def.lightBar ? 'dark' : 'light')
    run()
    return true
  }

  function pop() {
    const top = stack.pop()
    if (!top) return false
    top.cleanup && top.cleanup()
    top.el.classList.remove('in'); top.el.classList.add('out')
    setTimeout(() => top.el.remove(), 260)
    const prev = stack[stack.length - 1]
    navSync()
    if (prev) {
      native.statusBar(prev.def.lightBar ? 'dark' : 'light')
      prev.def.onResume && prev.def.onResume(prev.ctx)
    } else {
      native.statusBar('light'); LG.render(LG.tab)
    }
    return true
  }
  function popAll() { while (stack.length) pop() }
  function back() { return pop() }
  function pathOf(name, params) {
    const def = PAGES[name]; const p = def && def.paths && def.paths[0]
    if (!p) return ''
    const rest = Object.assign({}, params)
    const path = p.replace(/:([a-zA-Z]+)/g, (_, n) => { const v = rest[n]; delete rest[n]; return encodeURIComponent(v) })
    const qs = new URLSearchParams(rest).toString()
    return path + (qs ? '?' + qs : '')
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pg-back]')
    if (b && b.closest('.pg')) { native.haptic('tap'); pop() }
    if (e.target.closest('[data-pg-menu]')) menu()
  })

  // ---- bottom bar stays on every screen; highlight the section the open screen belongs to
  const LESSON_PAGES = /^(classes|books|chapters|periods|lesson|daily-plan|pp-|ajira|abp|multigrade|instant|diary|search|lessons-hub)/
  function navSync() {
    const top = stack[stack.length - 1]
    const group = !top ? null : top.name === 'daily-plan' ? 'today' : LESSON_PAGES.test(top.name) ? 'lessons' : 'explore'
    document.querySelectorAll('#nav .nb').forEach(n => {
      const on = group ? (n.dataset.nav === group || (group === 'explore' && n.dataset.tab === 'explore')) : n.dataset.tab === LG.tab
      n.classList.toggle('on', on)
    })
  }

  /** "All pages" sheet: every section of the app, grouped, reachable from any screen. */
  function menu() {
    const groups = LG.CATS.slice(1).map(([k, l]) => ({ k, l, items: LG.TOOLS.filter(t => t.cat === k) })).filter(g => g.items.length)
    const bg = LG.sheet(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:18px">All pages</b><button class="tap" data-act="home" style="color:var(--violet);font-weight:600;font-size:14px">${icon('home', 18)} Home</button></div>
      <div class="menu-scroll">${groups.map(g => `<div class="mgroup"><h4>${esc(g.l)} <small class="od">${esc(LG.CAT_SUB[g.k] || '')}</small></h4>
        <div class="mgrid">${g.items.map(t => `<button class="mitem tap" data-act="go:${esc(t.path)}"><span style="${LG.gStyle(t.g)}">${icon(t.i, 20)}</span>${esc(t.t)}</button>`).join('')}</div></div>`).join('')}</div>`,
    (act, el) => {
      el.remove()
      if (act === 'home') { popAll(); LG.setTab('home'); return }
      const path = act.slice(3)
      popAll()
      if (path.charAt(0) === '#') return LG.setTab(path.slice(1))
      if (!LG.open(path)) location.href = path
    })
    bg.querySelector('.sheet').style.maxHeight = '86vh'
    LG.hydrateIcons(bg)
  }

  // ------------------------------------------------------------ the two app versions
  // Play Store version: nothing is sold in the app (Google Play Payments policy).
  // Direct version (APK from the website): buying works through the website's Razorpay/UPI checkout.
  LG.direct = !!(native.info().direct)
  LG.noBuy = (text) => LG.direct ? '' : ' ' + (text || 'Purchases are not available in the app.')
  LG.buyBtn = (path, label, kind) => LG.direct
    ? `<button class="btn btn-${kind || 'primary'} tap" data-web="${esc(path)}" style="margin-top:6px">${icon('crown', 19)} ${esc(label)}</button>` : ''

  // ------------------------------------------------------------ UI kit
  const EMPTY_SVG = icon('__none__', 22)
  const isIcon = (name) => !!name && /^[a-z][a-zA-Z]*$/.test(name) && icon(name, 22) !== EMPTY_SVG.replace('__none__', name)
  const ui = {
    skeleton(n = 5, kind = 'row') {
      return `<div class="skl">${Array.from({ length: n }, (_, i) => `<div class="sk-${kind}" style="animation-delay:${i * 80}ms"><i></i><div><b></b><s></s></div></div>`).join('')}</div>`
    },
    empty(emoji, title, text, btn) {
      return `<div class="pg-empty"><div class="e-em">${emoji}</div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${btn || ''}</div>`
    },
    btn(label, attrs = '', kind = 'primary', ic = '') {
      return `<button class="btn btn-${kind} tap" ${attrs}>${ic ? icon(ic, 19, 2.3) : ''}${label}</button>`
    },
    row({ ic, g, t, s, right, attrs = '', lock, badge }) {
      return `<button class="row tap" ${attrs}>
        <span class="row-ic" style="${g ? LG.gStyle(g) : ''}">${isIcon(ic) ? icon(ic, 22) : ic ? `<em>${esc(ic)}</em>` : icon('book', 22)}</span>
        <span class="row-t"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span>
        ${badge ? `<em class="row-badge">${esc(badge)}</em>` : ''}
        ${lock ? `<span class="row-lock">${icon('lock', 16, 2.4)}</span>` : ''}
        ${right != null ? right : `<span class="row-chev">${icon('chev', 18, 2.4)}</span>`}
      </button>`
    },
    field({ id, label, type = 'text', ph = '', value = '', attrs = '', prefix = '', hint = '' }) {
      return `<label class="fld"><span>${esc(label)}</span><div class="fld-in">${prefix ? `<i>${esc(prefix)}</i>` : ''}<input id="${id}" type="${type}" placeholder="${esc(ph)}" value="${esc(value)}" ${attrs}></div>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`
    },
    chips(items, active, attr) {
      return `<div class="chips pg-chips">${items.map(([k, l]) => `<button class="chip tap ${k === active ? 'on' : ''}" ${attr}="${esc(k)}">${esc(l)}</button>`).join('')}</div>`
    },
    gate(kind) { // premium / login gate card
      const prem = kind === 'premium'
      return `<div class="gate">
        <div class="gate-ic">${prem ? '👑' : '🔐'}</div>
        <b>${prem ? 'This lesson is for Premium members' : 'Log in to continue'}</b>
        <p>${prem ? 'Your account does not have an active Premium plan.' + LG.noBuy() : 'Use the same mobile number and password as on the website.'}</p>
        ${prem ? (LG.direct ? LG.buyBtn('/plans', 'Get Premium') : `<button class="btn btn-soft tap" data-pg-open="/my-plan">My Plan</button>`) : `<button class="btn btn-primary tap" data-pg-open="/login">${icon('login', 19)} Login</button>`}
      </div>`
    },
  }
  function showError(body, e, retry) {
    const offline = e && e.status === 0
    body.innerHTML = ui.empty(offline ? '📡' : '😕', offline ? 'You are offline' : 'Could not load this', offline ? 'Check your internet connection and try again.' : (e && e.message) || '', ui.btn('Try again', 'data-retry', 'primary', 'refund'))
    const b = body.querySelector('[data-retry]')
    if (b) b.onclick = () => { body.innerHTML = ui.skeleton(); retry() }
    LG.hydrateIcons(body)
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pg-open]')
    if (!t) return
    e.preventDefault(); e.stopPropagation()
    const path = t.dataset.pgOpen
    if (!LG.open(path)) { native.haptic('tap'); location.href = path }
  }, true)

  // ------------------------------------------------------------ content helpers
  /** Lesson HTML comes from the admin panel; keep its formatting but drop scripts and handlers. */
  function clean(html) {
    const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html')
    doc.querySelectorAll('script,style,link,meta,object,embed,form,input,button').forEach(n => n.remove())
    doc.querySelectorAll('*').forEach(n => {
      Array.from(n.attributes).forEach(a => {
        const v = a.value.trim().toLowerCase()
        if (/^on/i.test(a.name) || ((a.name === 'href' || a.name === 'src') && v.startsWith('javascript:'))) n.removeAttribute(a.name)
      })
      if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener') }
      if (n.tagName === 'IFRAME' && !/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|drive\.google\.com)\//.test(n.getAttribute('src') || '')) n.remove()
    })
    return doc.body.firstChild.innerHTML
  }
  const LO_RE = /((?:OD|EN|SS|SCI|CD|LLD|PD|SED|ACD|PLH|CG|BV\d)[\s-]?\d+(?:\.\d+){0,3})|((?:M|E)\s\d{2,4})|(C\d+-[A-Z]{1,4}-[\d.]+)|(C-\d+(?:\.\d+)?|CG-?\d+)/g
  const loPills = (escapedText) => String(escapedText).replace(LO_RE, (m) => `<span class="lo-pill">${m}</span>`)

  /** Saves a downloaded file on the phone (Downloads/LessonGuru) and backs it up to the Cloud Library. */
  function saveBlob(blob, name, { open: openIt = true, sourcePath = '' } = {}) {
    return new Promise((resolve) => {
      const fr = new FileReader()
      fr.onloadend = () => {
        const N = window.LGApp
        if (N) { try { openIt ? N.openFile(fr.result, name, blob.type || '') : N.saveFile(fr.result, name, blob.type || '') } catch (e) {} }
        else { const a = document.createElement('a'); a.href = fr.result; a.download = name; document.body.appendChild(a); a.click(); a.remove() }
        resolve()
      }
      fr.readAsDataURL(blob)
      if (LG.token() && LG.LS.raw('lgapp_cloud_auto') !== '0') {
        const fd = new FormData()
        fd.append('file', blob, name); fd.append('name', name); fd.append('source', 'app-auto'); fd.append('sourcePath', sourcePath)
        fetch('/api/cloud/files', { method: 'POST', headers: { Authorization: 'Bearer ' + LG.token() }, body: fd })
          .then(r => r.json().then(j => ({ ok: r.ok, j })))
          .then(x => { if (window.LGApp) LGApp.cloudStatus(x.ok ? (x.j.duplicate ? 'duplicate' : 'ok') : (x.j && x.j.code === 'QUOTA_EXCEEDED' ? 'quota' : 'error'), name) })
          .catch(() => {})
      }
    })
  }

  // cached reference lists (classes, books per class, chapters per book)
  const memo = new Map()
  function cached(key, fn, ttl = 10 * 60 * 1000) {
    const hit = memo.get(key)
    if (hit && Date.now() - hit.t < ttl) return hit.p
    const p = fn().catch(e => { memo.delete(key); throw e })
    memo.set(key, { t: Date.now(), p })
    return p
  }

  Object.assign(LG, { clean, loPills, saveBlob, cached, api, ApiError, page, open, push, pop, popAll, back, match, ui, showError, pathOf })
  Object.defineProperty(LG, 'stackDepth', { get: () => stack.length, configurable: true }) // live value, not a copy
})()
