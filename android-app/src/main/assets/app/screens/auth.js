/* Login, registration, WhatsApp OTP, password recovery and the mandatory security setup.
 * Same endpoints as the website, so every existing account works unchanged. */
(function () {
  'use strict'
  const LG = window.LG
  const { esc, icon, ui } = LG

  const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10)
  const validMobile = (m) => /^[6-9]\d{9}$/.test(m)

  function setToken(t) { try { localStorage.setItem('em_token', t); localStorage.removeItem('em_session_kicked') } catch (e) {} }

  /** After any successful login: store the session, then security setup / admin / where the teacher was going. */
  async function signedIn(ctx, d, next) {
    setToken(d.token)
    LG.state.user = d.user; LG.LS.set('lgapp_user', d.user)
    LG.native.haptic('success')
    const u = d.user || {}
    if (['admin', 'section_uploader', 'books_uploader'].includes(u.role)) { location.href = '/admin'; return }
    if (u.mustChangePassword) { location.href = '/account/change-password'; return }
    LG.popAll()
    LG.toast('Welcome' + (u.name ? ', ' + LG.firstName(u) : '') + '! 🎉')
    LG.setTab('home', true)
    if (!u.securitySetupCompleted) { LG.push('security-setup', { next: next || '' }); return }
    if (next) LG.open(next)
  }

  function busy(btn, on, label) {
    if (!btn) return
    if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin-s"></span>${label || 'Please wait…'}` }
    else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l }
  }
  function err(ctx, msg) {
    const e = ctx.body.querySelector('.form-err')
    if (!e) return LG.toast(msg)
    e.textContent = msg; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on')
    LG.native.haptic('error')
  }
  const hideErr = (ctx) => { const e = ctx.body.querySelector('.form-err'); if (e) e.classList.remove('on') }
  const val = (ctx, id) => (ctx.body.querySelector('#' + id) || {}).value || ''
  function eyeToggle(ctx) {
    ctx.on('click', '[data-eye]', (b) => {
      const inp = ctx.body.querySelector('#' + b.dataset.eye)
      inp.type = inp.type === 'password' ? 'text' : 'password'
      b.innerHTML = icon(inp.type === 'password' ? 'eye' : 'x', 20)
    })
  }
  const pwField = (id, label, ph) => `<label class="fld"><span>${label}</span><div class="fld-in"><input id="${id}" type="password" placeholder="${ph || ''}" autocomplete="current-password"><button type="button" class="fld-eye" data-eye="${id}">${icon('eye', 20)}</button></div></label>`
  const mobileField = (value) => ui.field({ id: 'mob', label: 'Mobile number', type: 'tel', ph: '10-digit number', prefix: '+91', value: value || '', attrs: 'inputmode="numeric" maxlength="10" autocomplete="tel"' })

  // ================================================================ LOGIN
  LG.page('login', {
    paths: ['/login'], title: 'Login', subtitle: 'ଲଗଇନ୍ କରନ୍ତୁ', tone: 'night',
    render(ctx) {
      const kicked = (() => { try { return localStorage.getItem('em_session_kicked') === '1' } catch (e) { return false } })()
      ctx.body.innerHTML = `
        <div class="auth-hero"><div class="logo">📚</div><h2>Welcome back, teacher!</h2><p class="od">ସ୍ୱାଗତ, ଶିକ୍ଷକ ବନ୍ଧୁ!</p></div>
        ${kicked ? `<div class="card" style="background:#FFFBEB;border-color:#FDE68A;margin-bottom:14px;font-size:13.5px">🔐 You were logged out because your account was opened on another device. Please log in again.</div>` : ''}
        <button class="btn btn-primary wide wa-btn tap" data-wa-login>${icon('chat', 20)} Login with WhatsApp OTP</button>
        <p style="text-align:center;color:var(--muted);font-size:12.5px;margin:8px 0 0">No password needed · new teachers can sign up the same way</p>
        <div class="or">or with password</div>
        <div class="form-err"></div>
        ${mobileField(LG.LS.get('lgapp_last_mobile', ''))}
        ${pwField('pw', 'Password', 'Your password')}
        <div style="text-align:right;margin:-6px 0 14px"><button class="link-btn" data-forgot>Forgot password?</button></div>
        ${ui.btn('Login', 'data-login', 'primary wide', 'login')}
        <p style="text-align:center;margin-top:20px;font-size:14px;color:var(--ink-2)">New to Lesson Guru? <button class="link-btn" data-reg>Create account</button></p>`
      eyeToggle(ctx)
      ctx.on('click', '[data-wa-login]', () => ctx.push('otp-login', { next: ctx.params.next || '', mobile: digits(val(ctx, 'mob')) }))
      ctx.on('click', '[data-forgot]', () => ctx.push('forgot', { mobile: digits(val(ctx, 'mob')) }))
      ctx.on('click', '[data-reg]', () => ctx.push('register', { next: ctx.params.next || '' }))
      ctx.on('click', '[data-login]', async (b) => {
        hideErr(ctx)
        const mobile = digits(val(ctx, 'mob')), password = val(ctx, 'pw')
        if (!validMobile(mobile)) return err(ctx, 'Enter your 10-digit mobile number')
        if (!password) return err(ctx, 'Enter your password')
        busy(b, true, 'Logging in…')
        try {
          const d = await LG.api('/auth/login', { method: 'POST', body: { mobile, password }, noAuthRedirect: true })
          LG.LS.set('lgapp_last_mobile', mobile)
          await signedIn(ctx, d, ctx.params.next)
        } catch (e) {
          busy(b, false)
          err(ctx, e.status === 401 ? 'Wrong mobile number or password' : e.message)
        }
      })
      ctx.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'pw') ctx.body.querySelector('[data-login]').click() })
    },
  })

  // ================================================================ WHATSAPP OTP (login + sign-up)
  function otpBoxes() {
    return `<div class="otp">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="${i ? 1 : 6}" data-otp="${i}" autocomplete="${i ? 'off' : 'one-time-code'}">`).join('')}</div>`
  }
  function wireOtp(ctx, onFull) {
    const boxes = () => Array.from(ctx.body.querySelectorAll('[data-otp]'))
    ctx.body.addEventListener('input', (e) => {
      const t = e.target; if (!t.dataset || t.dataset.otp == null) return
      const v = t.value.replace(/\D/g, '')
      if (v.length > 1) { // pasted / autofilled code (first box accepts all 6 digits)
        v.slice(0, 6).split('').forEach((c, i) => { if (boxes()[i]) boxes()[i].value = c })
        const last = boxes()[Math.min(v.length, 6) - 1]; if (last) last.focus()
      } else t.value = v
      const i = +t.dataset.otp
      if (v && boxes()[i + 1] && v.length === 1) boxes()[i + 1].focus()
      const code = boxes().map(b => b.value).join('')
      if (code.length === 6) onFull(code)
    })
    ctx.body.addEventListener('keydown', (e) => {
      const t = e.target; if (!t.dataset || t.dataset.otp == null) return
      if (e.key === 'Backspace' && !t.value) { const p = boxes()[+t.dataset.otp - 1]; if (p) p.focus() }
    })
    return () => boxes().map(b => b.value).join('')
  }
  function countdown(ctx, btn, secs) {
    let n = secs
    btn.disabled = true
    const tick = () => {
      if (!ctx.alive()) return clearInterval(h)
      if (n <= 0) { btn.disabled = false; btn.textContent = 'Resend code'; return clearInterval(h) }
      btn.textContent = 'Resend in ' + n-- + 's'
    }
    const h = setInterval(tick, 1000); tick()
    return () => clearInterval(h)
  }

  LG.page('otp-login', {
    title: 'WhatsApp login', subtitle: 'WhatsApp OTP ରେ ଲଗଇନ୍', tone: 'teal',
    render(ctx) {
      let mobile = ctx.params.mobile && validMobile(ctx.params.mobile) ? ctx.params.mobile : ''
      let stop = null
      const step1 = () => {
        ctx.body.innerHTML = `
          <div class="auth-hero"><div class="logo" style="background:linear-gradient(135deg,#22C55E,#059669)">💬</div><h2>Login with WhatsApp</h2><p>We'll send a 6-digit code to your WhatsApp</p></div>
          <div class="form-err"></div>
          ${mobileField(mobile)}
          ${ui.btn('Send code on WhatsApp', 'data-send', 'primary wide wa-btn', 'chat')}
          <p style="text-align:center;color:var(--muted);font-size:12.5px;margin-top:14px">New number? You'll create your account right after the code.</p>`
        LG.hydrateIcons(ctx.body)
        const inp = ctx.body.querySelector('#mob'); setTimeout(() => inp.focus(), 350)
      }
      const step2 = (info) => {
        ctx.body.innerHTML = `
          <div class="auth-hero"><div class="logo" style="background:linear-gradient(135deg,#22C55E,#059669)">🔑</div><h2>Enter the code</h2><p>Sent on WhatsApp to <b>${esc(info.mobile || '+91 ' + mobile)}</b></p></div>
          <div class="form-err"></div>
          ${otpBoxes()}
          ${ui.btn('Verify & continue', 'data-verify', 'primary wide', 'check')}
          <div style="display:flex;justify-content:space-between;margin-top:14px"><button class="link-btn" data-change>Change number</button><button class="link-btn" data-resend></button></div>
          <p style="text-align:center;color:var(--muted);font-size:12.5px;margin-top:10px">Didn't get it? Check WhatsApp on this number, or <button class="link-btn" data-pw style="font-size:12.5px;padding:0">use your password</button>.</p>`
        LG.hydrateIcons(ctx.body)
        const get = wireOtp(ctx, (code) => verify(code))
        setTimeout(() => { const f = ctx.body.querySelector('[data-otp="0"]'); f && f.focus() }, 350)
        stop && stop(); stop = countdown(ctx, ctx.body.querySelector('[data-resend]'), info.resendInSec || 30)
        ctx.body.querySelector('[data-verify]').onclick = () => verify(get())
      }
      let verifying = false
      async function verify(code) {
        if (verifying) return
        hideErr(ctx)
        if (!/^\d{6}$/.test(code)) return err(ctx, 'Enter the 6-digit code')
        const b = ctx.body.querySelector('[data-verify]'); busy(b, true, 'Checking…'); verifying = true
        try {
          const d = await LG.api('/auth/verify-login-otp', { method: 'POST', body: { mobile, code }, noAuthRedirect: true })
          LG.LS.set('lgapp_last_mobile', mobile)
          if (d.needsProfile) { ctx.push('complete-profile', { signupToken: d.signupToken, mobile, next: ctx.params.next || '' }, { replace: true }); return }
          await signedIn(ctx, d, ctx.params.next)
        } catch (e) {
          busy(b, false); verifying = false
          err(ctx, e.status === 429 ? 'Too many wrong attempts. Please request a new code.' : (e.message || 'Wrong code'))
          ctx.body.querySelectorAll('[data-otp]').forEach(x => { x.value = '' })
          const f = ctx.body.querySelector('[data-otp="0"]'); f && f.focus()
        }
      }
      async function send(btn) {
        hideErr(ctx)
        const m = digits(val(ctx, 'mob') || mobile)
        if (!validMobile(m)) return err(ctx, 'Enter a valid 10-digit mobile number')
        mobile = m
        busy(btn, true, 'Sending…')
        try {
          const d = await LG.api('/auth/send-login-otp', { method: 'POST', body: { mobile }, noAuthRedirect: true })
          LG.toast('Code sent on WhatsApp ✅')
          step2(d)
        } catch (e) {
          busy(btn, false)
          err(ctx, e.status === 429 ? (e.message || 'Please wait a moment before asking for another code.') : (e.message || 'Could not send the code'))
        }
      }
      ctx.on('click', '[data-send]', (b) => send(b))
      ctx.on('click', '[data-resend]', (b) => send(b))
      ctx.on('click', '[data-change]', () => { stop && stop(); step1() })
      ctx.on('click', '[data-pw]', () => ctx.back())
      step1()
      return () => stop && stop()
    },
  })

  LG.page('complete-profile', {
    title: 'Create your account', subtitle: 'ନୂଆ ଆକାଉଣ୍ଟ', tone: 'teal',
    render(ctx) {
      ctx.body.innerHTML = `
        <div class="auth-hero"><div class="logo">🎉</div><h2>Almost done!</h2><p>Your number +91 ${esc(ctx.params.mobile)} is verified</p></div>
        <div class="form-err"></div>
        ${ui.field({ id: 'name', label: 'Your full name', ph: 'e.g. Sasmita Das', attrs: 'autocomplete="name"' })}
        ${ui.field({ id: 'alt', label: 'Alternate mobile (optional)', type: 'tel', prefix: '+91', attrs: 'inputmode="numeric" maxlength="10"' })}
        ${pwField('pw', 'Create a password', 'At least 6 characters')}
        ${pwField('pw2', 'Confirm password', 'Type it again')}
        <label style="display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--ink-2);margin:4px 0 18px"><input type="checkbox" id="wa" checked style="width:20px;height:20px;accent-color:#7C3AED"> Send me lesson updates on WhatsApp</label>
        ${ui.btn('Create account', 'data-go-create', 'primary wide', 'spark')}`
      eyeToggle(ctx)
      ctx.on('click', '[data-go-create]', async (b) => {
        hideErr(ctx)
        const name = val(ctx, 'name').trim(), password = val(ctx, 'pw'), confirm = val(ctx, 'pw2')
        if (name.length < 2) return err(ctx, 'Please enter your name')
        if (password.length < 6) return err(ctx, 'Password must be at least 6 characters')
        if (password !== confirm) return err(ctx, 'Passwords do not match')
        busy(b, true, 'Creating account…')
        try {
          const d = await LG.api('/auth/wa/complete-profile', { method: 'POST', noAuthRedirect: true, body: {
            signupToken: ctx.params.signupToken, name, altMobile: digits(val(ctx, 'alt')), password, confirm,
            waOptIn: ctx.body.querySelector('#wa').checked, ref: refCode() } })
          await signedIn(ctx, d, ctx.params.next)
        } catch (e) { busy(b, false); err(ctx, e.message) }
      })
    },
  })
  function refCode() { try { return localStorage.getItem('em_ref') || '' } catch (e) { return '' } }

  // ================================================================ REGISTER (password)
  LG.page('register', {
    paths: ['/register'], title: 'Create account', subtitle: 'ନୂଆ ଆକାଉଣ୍ଟ', tone: 'sunset',
    render(ctx) {
      ctx.body.innerHTML = `
        <div class="auth-hero"><div class="logo">✨</div><h2>Join 17,000+ teachers</h2><p>Ready lesson plans for every class, every day</p></div>
        <button class="btn btn-primary wide wa-btn tap" data-wa-reg>${icon('chat', 20)} Sign up with WhatsApp OTP</button>
        <div class="or">or fill in</div>
        <div class="form-err"></div>
        ${ui.field({ id: 'name', label: 'Your full name', ph: 'e.g. Sasmita Das', attrs: 'autocomplete="name"' })}
        ${mobileField('')}
        ${pwField('pw', 'Create a password', 'At least 6 characters')}
        <label style="display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--ink-2);margin:4px 0 18px"><input type="checkbox" id="wa" checked style="width:20px;height:20px;accent-color:#7C3AED"> Send me lesson updates on WhatsApp</label>
        ${ui.btn('Create account', 'data-reg', 'primary wide', 'spark')}
        <p style="text-align:center;margin-top:20px;font-size:14px;color:var(--ink-2)">Already registered? <button class="link-btn" data-login>Login</button></p>`
      eyeToggle(ctx)
      ctx.on('click', '[data-wa-reg]', () => ctx.push('otp-login', { next: ctx.params.next || '' }))
      ctx.on('click', '[data-login]', () => ctx.push('login', { next: ctx.params.next || '' }, { replace: true }))
      ctx.on('click', '[data-reg]', async (b) => {
        hideErr(ctx)
        const name = val(ctx, 'name').trim(), mobile = digits(val(ctx, 'mob')), password = val(ctx, 'pw')
        if (name.length < 2) return err(ctx, 'Please enter your name')
        if (!validMobile(mobile)) return err(ctx, 'Enter a valid 10-digit mobile number')
        if (password.length < 6) return err(ctx, 'Password must be at least 6 characters')
        busy(b, true, 'Creating account…')
        try {
          const d = await LG.api('/auth/register', { method: 'POST', noAuthRedirect: true, body: { name, mobile, password, waOptIn: ctx.body.querySelector('#wa').checked, ref: refCode() || undefined } })
          LG.LS.set('lgapp_last_mobile', mobile)
          await signedIn(ctx, d, ctx.params.next)
        } catch (e) {
          busy(b, false)
          err(ctx, /already registered/i.test(e.message) ? 'This number already has an account. Please log in.' : e.message)
        }
      })
    },
  })

  // ================================================================ FORGOT PASSWORD
  LG.page('forgot', {
    paths: ['/forgot-password'], title: 'Forgot password', subtitle: 'ପାସୱାର୍ଡ ଭୁଲିଗଲେ', tone: 'rose',
    render(ctx) {
      let mobile = validMobile(ctx.params.mobile || '') ? ctx.params.mobile : ''
      const start = () => {
        ctx.body.innerHTML = `
          <div class="auth-hero"><div class="logo">🔑</div><h2>Reset your password</h2><p>Choose how to verify it's you</p></div>
          <div class="form-err"></div>
          ${mobileField(mobile)}
          <div class="list">
            ${ui.row({ ic: 'chat', g: 'green', t: 'Code on WhatsApp', s: 'Fastest: we send a 6-digit code', attrs: 'data-m="wa"' })}
            ${ui.row({ ic: 'shield', g: 'violet', t: 'Security number & picture', s: 'The ones you chose when you set up recovery', attrs: 'data-m="sec"' })}
          </div>`
        LG.hydrateIcons(ctx.body)
      }
      const getMobile = () => { const m = digits(val(ctx, 'mob') || mobile); if (!validMobile(m)) { err(ctx, 'Enter your 10-digit mobile number'); return null } mobile = m; return m }

      const newPassword = (resetToken) => {
        ctx.body.innerHTML = `
          <div class="auth-hero"><div class="logo">🛡️</div><h2>Set a new password</h2><p>For +91 ${esc(mobile)}</p></div>
          <div class="form-err"></div>
          ${pwField('pw', 'New password', 'At least 6 characters')}
          ${pwField('pw2', 'Confirm new password', 'Type it again')}
          ${ui.btn('Save new password', 'data-save', 'primary wide', 'check')}`
        LG.hydrateIcons(ctx.body)
        ctx.body.querySelector('[data-save]').onclick = async function () {
          hideErr(ctx)
          const p = val(ctx, 'pw'), p2 = val(ctx, 'pw2')
          if (p.length < 6) return err(ctx, 'Password must be at least 6 characters')
          if (p !== p2) return err(ctx, 'Passwords do not match')
          busy(this, true, 'Saving…')
          try {
            await LG.api('/password-reset/complete', { method: 'POST', body: { resetToken, newPassword: p }, noAuthRedirect: true })
            LG.toast('Password changed. Please log in ✅'); LG.native.haptic('success')
            ctx.push('login', {}, { replace: true })
          } catch (e) { busy(this, false); err(ctx, e.message) }
        }
      }

      const viaWa = async (btn) => {
        const m = getMobile(); if (!m) return
        busy(btn, true, 'Sending…')
        try {
          const d = await LG.api('/auth/forgot-password', { method: 'POST', body: { mobile: m }, noAuthRedirect: true })
          ctx.body.innerHTML = `
            <div class="auth-hero"><div class="logo" style="background:linear-gradient(135deg,#22C55E,#059669)">💬</div><h2>Enter the code</h2><p>Sent on WhatsApp to <b>${esc(d.mobile || m)}</b></p></div>
            <div class="form-err"></div>${otpBoxes()}${ui.btn('Verify', 'data-v', 'primary wide', 'check')}`
          LG.hydrateIcons(ctx.body)
          const go = async (code) => {
            hideErr(ctx)
            if (!/^\d{6}$/.test(code)) return err(ctx, 'Enter the 6-digit code')
            try { const r = await LG.api('/auth/verify-otp', { method: 'POST', body: { mobile: m, code }, noAuthRedirect: true }); newPassword(r.resetToken) } catch (e) { err(ctx, e.message) }
          }
          const get = wireOtp(ctx, go)
          ctx.body.querySelector('[data-v]').onclick = () => go(get())
        } catch (e) {
          busy(btn, false)
          err(ctx, e.status === 404 ? 'No account found with this number' : e.message)
        }
      }

      const viaSecurity = async (btn) => {
        const m = getMobile(); if (!m) return
        busy(btn, true, 'Loading…')
        try {
          const d = await LG.api('/password-reset/init', { method: 'POST', body: { mobile: m }, noAuthRedirect: true })
          let num = null, img = null
          ctx.body.innerHTML = `
            <div class="auth-hero"><div class="logo">🛡️</div><h2>Hello${d.name ? ', ' + esc(d.name.split(' ')[0]) : ''}!</h2><p>Pick your security number and picture</p></div>
            <div class="form-err"></div>
            <div class="sec-t"><h3>Your security number</h3></div>
            <div class="tiles three">${(d.numbers || []).map(n => `<button class="tile tap" data-num="${n}" style="${LG.gStyle('violet')};min-height:72px;justify-content:center;align-items:center"><b style="font-size:24px">${n}</b></button>`).join('')}</div>
            <div class="sec-t"><h3>Your security picture</h3></div>
            <div class="tiles three">${(d.images || []).map(i => `<button class="tile tap" data-img="${esc(i.id)}" style="background:${esc(i.gradient || 'var(--sunrise)')};min-height:88px;align-items:center;justify-content:center">${i.url ? `<img src="${esc(i.url)}" alt="" style="width:46px;height:46px;object-fit:contain">` : `<span style="font-size:34px">${esc(i.emoji || '⭐')}</span>`}<small style="margin-top:4px">${esc(i.label || '')}</small></button>`).join('')}</div>
            <div style="margin-top:18px">${ui.btn('Verify', 'data-v', 'primary wide', 'check')}</div>`
          LG.hydrateIcons(ctx.body)
          const pick = (sel, attr, v) => ctx.body.querySelectorAll(sel).forEach(x => { x.style.outline = x.dataset[attr] === String(v) ? '3px solid #FFC93C' : ''; x.style.transform = x.dataset[attr] === String(v) ? 'scale(1.04)' : '' })
          ctx.body.onclick = async (e) => {
            const n = e.target.closest('[data-num]'), i = e.target.closest('[data-img]'), v = e.target.closest('[data-v]')
            if (n) { num = +n.dataset.num; pick('[data-num]', 'num', num); LG.native.haptic('tap') }
            if (i) { img = i.dataset.img; pick('[data-img]', 'img', img); LG.native.haptic('tap') }
            if (v) {
              hideErr(ctx)
              if (num == null || !img) return err(ctx, 'Choose your number and your picture')
              try { const r = await LG.api('/password-reset/verify', { method: 'POST', body: { mobile: m, securityNumber: num, securityImageId: img }, noAuthRedirect: true }); ctx.body.onclick = null; newPassword(r.resetToken) } catch (e2) { err(ctx, e2.message) }
            }
          }
        } catch (e) {
          busy(btn, false)
          err(ctx, e.status === 400 ? 'Security recovery is not set up for this account. Use the WhatsApp code instead.' : e.status === 404 ? 'No account found with this number' : e.message)
        }
      }
      ctx.on('click', '[data-m]', (b) => { hideErr(ctx); b.dataset.m === 'wa' ? viaWa(b) : viaSecurity(b) })
      start()
    },
  })

  // ================================================================ MANDATORY SECURITY SETUP
  LG.page('security-setup', {
    title: 'Secure your account', subtitle: 'ପାସୱାର୍ଡ ପୁନରୁଦ୍ଧାର ସେଟଅପ୍', tone: 'night', login: true,
    async render(ctx) {
      ctx.el.querySelector('.pg-back').style.visibility = 'hidden' // required once, like on the website
      ctx.body.innerHTML = ui.skeleton(3)
      const { images = [] } = await ctx.api('/security/images')
      const nums = []
      while (nums.length < 3) { const n = Math.floor(Math.random() * 1000); if (!nums.includes(n)) nums.push(n) }
      let num = null, img = null
      ctx.body.innerHTML = `
        <div class="auth-hero"><div class="logo">🛡️</div><h2>One-time safety step</h2><p>If you ever forget your password, you'll pick this number and picture to reset it.</p></div>
        <div class="form-err"></div>
        <div class="sec-t"><h3>1. Pick ONE number</h3><small>Remember it!</small></div>
        <div class="tiles three">${nums.map(n => `<button class="tile tap" data-num="${n}" style="${LG.gStyle('violet')};min-height:72px;justify-content:center;align-items:center"><b style="font-size:24px">${n}</b></button>`).join('')}</div>
        <div class="sec-t"><h3>2. Pick ONE picture</h3></div>
        <div class="tiles three">${images.filter(i => i.active !== false).map(i => `<button class="tile tap" data-img="${esc(i.id)}" style="background:${esc(i.gradient || 'var(--sunrise)')};min-height:88px;align-items:center;justify-content:center">${i.url ? `<img src="${esc(i.url)}" alt="" style="width:46px;height:46px;object-fit:contain">` : `<span style="font-size:34px">${esc(i.emoji || '⭐')}</span>`}<small style="margin-top:4px">${esc(i.label || '')}</small></button>`).join('')}</div>
        <div style="margin-top:18px">${ui.btn('Save & continue', 'data-save', 'primary wide', 'check')}</div>`
      const pick = (sel, attr, v) => ctx.body.querySelectorAll(sel).forEach(x => { const on = x.dataset[attr] === String(v); x.style.outline = on ? '3px solid #FFC93C' : ''; x.style.transform = on ? 'scale(1.04)' : '' })
      ctx.on('click', '[data-num]', (b) => { num = +b.dataset.num; pick('[data-num]', 'num', num); LG.native.haptic('tap') })
      ctx.on('click', '[data-img]', (b) => { img = b.dataset.img; pick('[data-img]', 'img', img); LG.native.haptic('tap') })
      ctx.on('click', '[data-save]', async (b) => {
        hideErr(ctx)
        if (num == null || !img) return err(ctx, 'Pick one number and one picture')
        busy(b, true, 'Saving…')
        try {
          await ctx.api('/me/security-setup', { method: 'POST', body: { securityNumber: num, securityImageId: img } })
          await LG.refreshUser()
          LG.toast(`Saved! Remember: number ${num} 🔐`); LG.native.haptic('success')
          ctx.back()
          if (ctx.params.next) LG.open(ctx.params.next)
        } catch (e) { busy(b, false); err(ctx, e.message) }
      })
    },
  })

  // Teachers who still need the security setup get it as soon as the app opens.
  LG.requireSecuritySetup = function () {
    const u = LG.state.user
    if (u && LG.token() && u.role !== 'admin' && u.securitySetupCompleted === false && !LG.stackDepth) LG.push('security-setup')
  }
  LG.signedIn = signedIn
})()
