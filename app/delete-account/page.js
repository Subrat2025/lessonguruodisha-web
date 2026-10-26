'use client'
// Public account-deletion page (Google Play: apps with accounts must offer deletion in-app AND on the web).
// Logged-in teachers can submit the request here; everyone else is told how.
import { useEffect, useState } from 'react'
import Link from 'next/link'

const SUPPORT_WA = '918093414633'

const api = async (path, opts = {}) => {
  const token = localStorage.getItem('em_token')
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status })
  return data
}

export default function DeleteAccountPage() {
  const [state, setState] = useState('loading') // loading | guest | form | pending | done
  const [existing, setExisting] = useState(null)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('em_token')) { setState('guest'); return }
    api('/account/deletion')
      .then(r => { if (r.request) { setExisting(r.request); setState('pending') } else setState('form') })
      .catch(() => setState('guest'))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api('/account/deletion', { method: 'POST', body: { confirm, reason } })
      setExisting(r.request)
      try { localStorage.removeItem('em_token') } catch (_) {}
      setState('done')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const due = existing ? new Date(new Date(existing.requestedAt).getTime() + 30 * 864e5).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div className="max-w-2xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Delete account</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-slate-700 to-slate-900 shadow-xl">
        <div className="text-5xl">🗑️</div>
        <h1 className="text-3xl font-black mt-3">Delete your account</h1>
        <p className="text-sm mt-2 opacity-90">ଆପଣଙ୍କ ଆକାଉଣ୍ଟ ଡିଲିଟ୍ କରନ୍ତୁ · Lesson Guru Odisha</p>
      </header>

      <section className="mt-6 rounded-2xl border-2 p-5 text-sm leading-relaxed space-y-2">
        <p className="font-bold text-base">What gets deleted</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your profile: name, mobile number, email, school and password</li>
          <li>All files in your Cloud Library</li>
          <li>Favourites, history and app preferences linked to your account</li>
        </ul>
        <p className="font-bold text-base pt-2">What we keep, and why</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Payment and invoice records, without your name or number, as Indian tax law requires.</li>
          <li>Copies of files you already downloaded stay on your own phone.</li>
        </ul>
        <p>We complete every request within <b>30 days</b>. You are signed out on all devices right away. Any remaining subscription ends and is not refunded (see our <Link href="/refund" className="underline">refund policy</Link>).</p>
      </section>

      {state === 'loading' && <p className="mt-6 text-center text-muted-foreground">Loading…</p>}

      {state === 'guest' && (
        <section className="mt-6 rounded-2xl bg-violet-50 dark:bg-violet-950/30 p-5 text-sm space-y-3">
          <p className="font-bold text-base">How to request deletion</p>
          <p><b>In the app or on this website:</b> log in, then open this page again (Profile → Delete account) and confirm.</p>
          <Link href="/login" className="inline-block rounded-xl bg-violet-700 text-white font-bold px-5 py-3">Log in to continue</Link>
          <p className="pt-2"><b>Can't log in?</b> Send us a WhatsApp message from your registered number. We verify it and delete the account.</p>
          <a className="inline-block rounded-xl bg-emerald-600 text-white font-bold px-5 py-3"
            href={`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent('Please delete my Lesson Guru Odisha account linked to this number.')}`}>Request on WhatsApp</a>
        </section>
      )}

      {state === 'form' && (
        <form onSubmit={submit} className="mt-6 rounded-2xl border-2 border-rose-200 p-5 space-y-4">
          <label className="block text-sm font-semibold">Why are you leaving? (optional)
            <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={3}
              className="mt-1 w-full rounded-xl border p-3 font-normal bg-background" placeholder="Your feedback helps us improve" />
          </label>
          <label className="block text-sm font-semibold">Type <b>DELETE</b> to confirm
            <input value={confirm} onChange={e => setConfirm(e.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border p-3 font-mono bg-background" />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" disabled={busy || confirm !== 'DELETE'}
            className="w-full rounded-xl bg-rose-600 disabled:opacity-40 text-white font-bold py-3">{busy ? 'Sending…' : 'Request account deletion'}</button>
        </form>
      )}

      {(state === 'pending' || state === 'done') && existing && (
        <section className="mt-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-5 text-sm space-y-2">
          <p className="font-bold text-base">✅ Deletion request received</p>
          <p>Requested on {new Date(existing.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. Your account and data will be deleted by <b>{due}</b>.</p>
          <p>You have been signed out. Changed your mind? Message us on WhatsApp before then and we'll cancel the request.</p>
        </section>
      )}
    </div>
  )
}
