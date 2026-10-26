'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Brain, Trophy, Clock, ChevronLeft, ChevronRight, Download, Share2, CheckCircle2, XCircle, ArrowLeft, History, Sparkles } from 'lucide-react'

const SITE_URL = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BASE_URL)
  ? process.env.NEXT_PUBLIC_BASE_URL
  : (typeof window !== 'undefined' ? window.location.origin : '')

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// ---- Full self-contained certificate HTML (for print / download) ----
function certificateHtml(c) {
  const dt = c.submittedAt ? new Date(c.submittedAt) : new Date()
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const verifyUrl = `${SITE_URL}/verify-mcm?id=${encodeURIComponent(c.certificateId)}`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Certificate ${c.certificateId}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Noto+Sans+Oriya&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Noto Sans Oriya','Cormorant Garamond',serif;background:#eef2ff;padding:24px;display:flex;justify-content:center}
    .cert{width:900px;max-width:100%;background:#fffdf8;border:14px solid #4f46e5;border-radius:18px;padding:44px 48px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.15)}
    .cert:before{content:"";position:absolute;inset:12px;border:2px solid #c7b37a;border-radius:8px;pointer-events:none}
    .brand{text-align:center;color:#4f46e5;font-weight:800;letter-spacing:2px;font-size:15px}
    .ttl{text-align:center;font-family:'Cormorant Garamond',serif;font-size:44px;font-weight:700;color:#1e293b;margin:6px 0 2px}
    .sub{text-align:center;color:#7c3aed;font-weight:700;font-size:16px;margin-bottom:18px}
    .line{text-align:center;color:#475569;font-size:15px;margin:6px 0}
    .name{text-align:center;font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:700;color:#4f46e5;margin:10px 0 4px;border-bottom:2px dashed #c7b37a;display:inline-block;padding:0 30px 6px}
    .namewrap{text-align:center}
    .stats{display:flex;justify-content:center;gap:18px;margin:22px 0 8px;flex-wrap:wrap}
    .stat{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:10px 22px;text-align:center;min-width:120px}
    .stat b{display:block;font-size:26px;color:#4f46e5}
    .stat span{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px}
    .foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px;font-size:12px;color:#475569}
    .seal{width:84px;height:84px;border-radius:50%;background:radial-gradient(circle,#7c3aed,#4f46e5);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;font-weight:800;line-height:1.2;margin:0 auto;box-shadow:0 6px 16px rgba(79,70,229,.4)}
    .cid{font-family:monospace;font-size:11px;color:#7c3aed}
    @media print{body{background:#fff;padding:0}.cert{box-shadow:none;border-width:12px}.noprint{display:none}}
  </style></head><body>
  <div class="cert">
    <div class="brand">🎓 LESSON GURU ODISHA</div>
    <div class="ttl">Certificate of Achievement</div>
    <div class="sub">${c.certificateTitle || 'MCM Knowledge Test'} · ${c.monthEn || c.monthLabel || ''}</div>
    <div class="line">This is proudly presented to</div>
    <div class="namewrap"><div class="name">${(c.userName || 'Teacher')}</div></div>
    <div class="line">for successfully passing the <b>${c.certificateTitle || 'MCM Knowledge Test'}</b> (${c.monthLabel || c.monthEn || ''})</div>
    <div class="stats">
      <div class="stat"><b>${c.percentage}%</b><span>Score</span></div>
      <div class="stat"><b>${c.correctCount}/${c.total}</b><span>Correct</span></div>
      <div class="stat"><b>PASS</b><span>Result</span></div>
    </div>
    <div class="seal">MCM<br>VERIFIED</div>
    <div class="foot">
      <div>Date: <b>${dateStr}</b></div>
      <div style="text-align:center"><div class="cid">${c.certificateId}</div><div style="font-size:10px">Verify: ${verifyUrl}</div></div>
      <div style="text-align:right">Lesson Guru Odisha</div>
    </div>
  </div>
  <div class="noprint" style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:10px 26px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px">⬇️ Print / Save as PDF</button></div>
  </body></html>`
}

const McmTestView = ({ go, user, api }) => {
  const [loading, setLoading] = useState(true)
  const [test, setTest] = useState(null)
  const [existing, setExisting] = useState(null)
  const [screen, setScreen] = useState('intro') // intro | quiz | result
  const [answers, setAnswers] = useState({})
  const [idx, setIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState(null)
  const [showLb, setShowLb] = useState(false)
  const [lb, setLb] = useState(null)
  const startedAtRef = useRef(null)
  const timerRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    api('/mcm-test/active')
      .then(r => { setTest(r.test); setExisting(r.attempt || null) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [api])
  useEffect(() => { load() }, [load])

  const submit = useCallback(async (auto = false) => {
    if (submitting) return
    setSubmitting(true); setConfirm(false)
    try {
      const r = await api('/mcm-test/submit', { method: 'POST', body: { testId: test.id, answers, startedAt: startedAtRef.current } })
      setResult(r.result); setScreen('result')
      if (timerRef.current) clearInterval(timerRef.current)
      window.scrollTo({ top: 0 })
    } catch (e) {
      if (String(e.message || '').includes('already')) { toast.error('You have already taken this month\'s test'); load(); setScreen('intro') }
      else toast.error(e.message)
    } finally { setSubmitting(false) }
  }, [api, test, answers, submitting, load])

  // countdown timer
  useEffect(() => {
    if (screen !== 'quiz') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); submit(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => timerRef.current && clearInterval(timerRef.current)
  }, [screen, submit])

  const startTest = () => {
    setAnswers({}); setIdx(0)
    setTimeLeft((test.durationMinutes || 20) * 60)
    startedAtRef.current = new Date().toISOString()
    setScreen('quiz')
    window.scrollTo({ top: 0 })
  }

  const openHistory = () => {
    setShowHistory(true); setHistory(null)
    api('/mcm-test/history').then(r => setHistory(r.attempts || [])).catch(e => { setHistory([]); toast.error(e.message) })
  }

  const openLeaderboard = () => {
    setShowLb(true); setLb(null)
    api('/mcm-test/leaderboard').then(r => setLb(r)).catch(e => { setLb({ board: [] }); toast.error(e.message) })
  }
  const shareLeaderboard = () => {
    const msg = `🏆 MCM Knowledge Test Leaderboard — ${lb?.test?.monthEn || ''}\nମୁଁ MCM ଜ୍ଞାନ ପରୀକ୍ଷାରେ ଅଂଶ ନେଇଛି! ଆପଣ ମଧ୍ୟ ନିଜ ର୍ୟାଙ୍କ ଦେଖନ୍ତୁ 🧠✨\n👉 Test Your MCM Knowledge\n🌐 Lesson Guru Odisha\n${SITE_URL}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const downloadCert = (c) => {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Please allow pop-ups to download your certificate'); return }
    w.document.write(certificateHtml(c)); w.document.close()
  }
  const shareWhatsApp = (c) => {
    const verifyUrl = `${SITE_URL}/verify-mcm?id=${encodeURIComponent(c.certificateId)}`
    const msg = `🎉 ମୁଁ MCM Knowledge Test ସଫଳତାର ସହ ପାସ୍ କରିଛି!\n🏆 ମୋର ସ୍କୋର: ${c.percentage}%\n📜 ମୁଁ ମୋର Certificate ମଧ୍ୟ ପାଇଛି।\n\nଆପଣ ମଧ୍ୟ ନିଜ MCM ଜ୍ଞାନ ପରୀକ୍ଷା କରନ୍ତୁ! 🧠✨\n👉 Test Your MCM Knowledge\n🌐 Lesson Guru Odisha\n${SITE_URL}\n✅ Verify: ${verifyUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ---------- RENDER ----------
  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-violet-600" /></div>
  }

  // Header bar
  const Header = ({ title, onBack }) => (
    <div className="sticky top-0 z-20 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white px-4 py-3 flex items-center gap-3 shadow-md">
      <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
      <p className="font-black text-sm flex-1 truncate">{title}</p>
    </div>
  )

  // Leaderboard overlay
  if (showLb) {
    const medal = (r) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`
    return (
      <div className="min-h-screen bg-background">
        <Header title="🏆 Monthly Leaderboard" onBack={() => setShowLb(false)} />
        <div className="p-4 max-w-lg mx-auto space-y-3">
          {lb === null && <div className="py-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>}
          {lb && (
            <>
              <Card className="rounded-2xl border-0 p-4 text-center text-white bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 shadow-lg">
                <Trophy className="w-8 h-8 mx-auto" />
                <p className="font-black text-lg mt-1">{lb.test?.monthEn || 'MCM Test'} · Top Scorers</p>
                <p className="text-[12px] opacity-95">{lb.totalParticipants || 0} teachers took this test</p>
              </Card>

              {lb.you && (
                <Card className="rounded-2xl border-2 border-violet-300 bg-violet-50 dark:bg-violet-950/30 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center font-black text-sm">{lb.you.rank <= 3 ? medal(lb.you.rank) : '#' + lb.you.rank}</div>
                  <div className="flex-1 min-w-0"><p className="font-bold text-sm">Your rank</p><p className="text-[11px] text-muted-foreground">{lb.you.percentage}% · {lb.you.correctCount}/{lb.you.total} correct</p></div>
                  <Button size="sm" className="rounded-lg bg-[#25D366] text-white text-[11px]" onClick={shareLeaderboard}><Share2 className="w-3.5 h-3.5 mr-1" />Share</Button>
                </Card>
              )}

              {lb.board && lb.board.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No participants yet — be the first to take the test! 🚀</p>}
              <div className="space-y-2">
                {(lb.board || []).map(r => (
                  <Card key={r.rank} className={`rounded-2xl p-3 flex items-center gap-3 border-2 ${r.isYou ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' : r.rank <= 3 ? 'border-amber-200' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${r.rank === 1 ? 'bg-amber-100 text-amber-700' : r.rank === 2 ? 'bg-slate-100 text-slate-600' : r.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>{medal(r.rank)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{r.name}{r.isYou && <span className="ml-1 text-[9px] font-black text-violet-600">(You)</span>}</p>
                      <p className="text-[11px] text-muted-foreground">{r.correctCount}/{r.total} correct · {r.passed ? '✅ Passed' : '❌'}</p>
                    </div>
                    <div className="text-right"><p className="font-black text-violet-600">{r.percentage}%</p></div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // History overlay
  if (showHistory) {
    return (
      <div className="min-h-screen bg-background">
        <Header title="🧠 My Test History" onBack={() => setShowHistory(false)} />
        <div className="p-4 space-y-2 max-w-lg mx-auto">
          {history === null && <div className="py-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>}
          {history && history.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">No attempts yet. Take a test to see it here.</p>}
          {history && history.map(a => (
            <Card key={a.id} className="p-3 rounded-2xl border-2 flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white font-black ${a.passed ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-rose-500 to-red-600'}`}>
                <span className="text-sm">{a.percentage}%</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{a.monthEn || a.monthLabel}</p>
                <p className="text-[11px] text-muted-foreground">{a.correctCount}/{a.total} correct · {a.passed ? '✅ Passed' : '❌ Failed'} · {new Date(a.submittedAt).toLocaleDateString()}</p>
              </div>
              {a.passed && a.certificateId && (
                <Button size="sm" variant="outline" className="rounded-lg text-[11px]" onClick={() => downloadCert({ ...a, userName: user?.name, certificateTitle: a.certificateTitle })}><Download className="w-3.5 h-3.5 mr-1" />Cert</Button>
              )}
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // RESULT screen
  if (screen === 'result' && result) {
    const passed = result.passed
    return (
      <div className="min-h-screen bg-background">
        <Header title="🧠 Test Result" onBack={() => { setScreen('intro'); load() }} />
        <div className="p-4 max-w-lg mx-auto space-y-4">
          <Card className={`rounded-3xl border-0 p-6 text-center text-white shadow-xl ${passed ? 'bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600' : 'bg-gradient-to-br from-rose-500 via-red-500 to-orange-500'}`}>
            <div className="text-5xl mb-2">{passed ? '🎉' : '💪'}</div>
            <p className="text-4xl font-black">{result.percentage}%</p>
            <p className="font-bold mt-1">{passed ? 'ଅଭିନନ୍ଦନ! PASS' : 'FAIL'}</p>
            <p className="text-[13px] opacity-95 mt-2 leading-snug">
              {passed
                ? 'ଆପଣ MCM ଜ୍ଞାନ ପରୀକ୍ଷା ସଫଳତାର ସହ ପାସ୍ କରିଛନ୍ତି। ଆପଣଙ୍କ ଜ୍ଞାନ ଓ ପ୍ରସ୍ତୁତି ନିଶ୍ଚୟ ପ୍ରଶଂସନୀୟ!'
                : 'ଆଉ ଥରେ ଚେଷ୍ଟା କରନ୍ତୁ — ଆପଣଙ୍କ ସଫଳତା ନିଶ୍ଚିତ ଭାବେ ନିକଟରେ ଅଛି!'}
            </p>
          </Card>
          <div className="grid grid-cols-3 gap-2">
            <Card className="rounded-2xl p-3 text-center border-2"><p className="text-xl font-black">{result.total}</p><p className="text-[10px] text-muted-foreground">Questions</p></Card>
            <Card className="rounded-2xl p-3 text-center border-2 border-emerald-200"><p className="text-xl font-black text-emerald-600">{result.correctCount}</p><p className="text-[10px] text-muted-foreground">Correct</p></Card>
            <Card className="rounded-2xl p-3 text-center border-2 border-rose-200"><p className="text-xl font-black text-rose-600">{result.wrongCount}</p><p className="text-[10px] text-muted-foreground">Wrong</p></Card>
          </div>

          {passed && result.certificateId && (
            <Card className="rounded-2xl p-4 border-2 border-violet-200 bg-violet-50 dark:bg-violet-950/30 text-center space-y-2">
              <p className="font-black text-violet-700 dark:text-violet-300">📜 Your Certificate is ready!</p>
              <p className="text-[11px] text-muted-foreground">ID: <span className="font-mono">{result.certificateId}</span></p>
              <div className="flex gap-2">
                <Button onClick={() => downloadCert({ ...result, userName: result.userName || user?.name })} className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-bold"><Download className="w-4 h-4 mr-1" /> Download</Button>
                <Button onClick={() => shareWhatsApp(result)} className="flex-1 rounded-xl bg-[#25D366] hover:bg-[#1da851] font-bold text-white"><Share2 className="w-4 h-4 mr-1" /> WhatsApp</Button>
              </div>
            </Card>
          )}

          {/* Review */}
          <p className="font-bold text-sm mt-2">📖 Answer Review</p>
          <div className="space-y-2">
            {(result.review || []).map((r, i) => (
              <Card key={r.id} className={`rounded-xl p-3 border-2 ${r.isCorrect ? 'border-emerald-200' : 'border-rose-200'}`}>
                <p className="text-[12px] font-bold flex gap-1.5">
                  {r.isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                  <span>{i + 1}. {r.q}</span>
                </p>
                <div className="mt-1.5 ml-5 space-y-1">
                  {r.options.map((o, oi) => (
                    <div key={oi} className={`text-[11px] px-2 py-1 rounded-lg ${oi === r.correctIndex ? 'bg-emerald-100 dark:bg-emerald-900/40 font-bold' : oi === r.selectedIndex ? 'bg-rose-100 dark:bg-rose-900/40' : ''}`}>
                      {oi === r.correctIndex ? '✅ ' : oi === r.selectedIndex ? '❌ ' : '• '}{o}
                    </div>
                  ))}
                  {r.explanation && <p className="text-[10px] text-violet-700 dark:text-violet-300 mt-1">💡 {r.explanation}</p>}
                </div>
              </Card>
            ))}
          </div>
          <Button variant="outline" className="w-full rounded-xl" onClick={openLeaderboard}><Trophy className="w-4 h-4 mr-1" />View Leaderboard</Button>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => { setScreen('intro'); load() }}>Back to MCM Test Home</Button>
        </div>
      </div>
    )
  }

  // QUIZ screen
  if (screen === 'quiz' && test) {
    const q = test.questions[idx]
    const answered = Object.keys(answers).length
    const low = timeLeft <= 60
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-20 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white px-4 py-3 shadow-md">
          <div className="flex items-center justify-between">
            <p className="font-black text-sm">Question {idx + 1} of {test.questionCount}</p>
            <span className={`flex items-center gap-1 font-black text-sm px-2.5 py-1 rounded-full ${low ? 'bg-red-500 animate-pulse' : 'bg-white/20'}`}><Clock className="w-3.5 h-3.5" />{fmtTime(timeLeft)}</span>
          </div>
          <div className="h-1.5 bg-white/25 rounded-full mt-2 overflow-hidden"><div className="h-full bg-white transition-all" style={{ width: `${((idx + 1) / test.questionCount) * 100}%` }} /></div>
          <p className="text-[10px] opacity-90 mt-1">{answered}/{test.questionCount} answered</p>
        </div>

        <div className="p-4 max-w-lg mx-auto">
          <Card className="rounded-2xl p-4 border-2 mb-4">
            <p className="font-bold text-[15px] leading-snug mb-3">{q.q}</p>
            <div className="space-y-2">
              {q.options.map((o, oi) => {
                const sel = answers[q.id] === oi
                return (
                  <button key={oi} onClick={() => setAnswers(a => ({ ...a, [q.id]: oi }))}
                    className={`w-full text-left px-3 py-3 rounded-xl border-2 text-[14px] transition flex items-center gap-2 ${sel ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 font-bold' : 'border-border hover:border-violet-300'}`}>
                    <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black ${sel ? 'bg-violet-600 text-white' : 'bg-muted'}`}>{[' କ', 'ଖ', 'ଗ', 'ଘ'][oi] || (oi + 1)}</span>
                    <span>{o}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))} className="flex-1 rounded-xl"><ChevronLeft className="w-4 h-4 mr-1" />Previous</Button>
            {idx < test.questionCount - 1
              ? <Button onClick={() => setIdx(i => Math.min(test.questionCount - 1, i + 1))} className="flex-1 rounded-xl bg-violet-600">Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
              : <Button onClick={() => setConfirm(true)} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 font-bold">Submit Test</Button>}
          </div>

          {/* question jump grid */}
          <div className="grid grid-cols-8 gap-1.5 mt-4">
            {test.questions.map((qq, i) => (
              <button key={qq.id} onClick={() => setIdx(i)}
                className={`aspect-square rounded-lg text-[11px] font-bold ${i === idx ? 'bg-violet-600 text-white' : answers[qq.id] !== undefined ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{i + 1}</button>
            ))}
          </div>
        </div>

        {confirm && (
          <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirm(false)}>
            <Card className="rounded-2xl p-5 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
              <p className="font-black text-base mb-1">Submit Test?</p>
              <p className="text-[13px] text-muted-foreground mb-4">You answered <b>{answered}</b> of <b>{test.questionCount}</b>. This cannot be changed after submitting.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirm(false)}>Keep Going</Button>
                <Button disabled={submitting} className="flex-1 rounded-xl bg-emerald-600 font-bold" onClick={() => submit(false)}>{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Submit'}</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    )
  }

  // INTRO screen
  return (
    <div className="min-h-screen bg-background pb-16">
      <Header title="🧠 Test Your MCM Knowledge" onBack={() => go('resource-library')} />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Card className="rounded-3xl border-0 p-6 text-center text-white bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 shadow-xl relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-yellow-300/20 rounded-full blur-2xl" />
          <Brain className="w-12 h-12 mx-auto mb-2" />
          <p className="text-2xl font-black">🧠 Test Your MCM Knowledge</p>
          <p className="text-[13px] opacity-95 mt-2 leading-snug">ମାସିକ କ୍ଲଷ୍ଟର ସ୍ତରୀୟ ବୈଠକ (MCM) ଉପରେ ଆଧାରିତ ଏକ mock ପରୀକ୍ଷା। ନିଜ ଜ୍ଞାନ ପରଖନ୍ତୁ ଏବଂ ପାସ୍ କଲେ Certificate ପାଆନ୍ତୁ!</p>
          <p className="text-[14px] font-bold mt-3 bg-white/20 rounded-xl py-2 px-3">"ପରୀକ୍ଷା ଦେଇସାରିଛନ୍ତି? ନିଜ ଜ୍ଞାନକୁ ଥରେ ପରୀକ୍ଷା କରନ୍ତୁ!"</p>
        </Card>

        {!test ? (
          <Card className="rounded-2xl p-6 text-center border-2 border-dashed">
            <p className="text-3xl mb-2">🗓️</p>
            <p className="font-bold text-sm">No active test right now</p>
            <p className="text-[12px] text-muted-foreground mt-1">A fresh monthly test will appear here soon. Check back later!</p>
          </Card>
        ) : (
          <Card className="rounded-2xl p-4 border-2">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-gradient-to-r from-orange-500 to-red-500 border-0 text-white text-[10px]"><Sparkles className="w-3 h-3 mr-0.5" />🔥 NEW · {test.monthEn}</Badge>
            </div>
            <p className="font-black text-base">{test.title}</p>
            <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{test.instructions}</p>
            <div className="grid grid-cols-3 gap-2 my-3 text-center">
              <div className="bg-muted rounded-xl py-2"><p className="font-black text-violet-600">{test.questionCount}</p><p className="text-[9px] text-muted-foreground uppercase">Questions</p></div>
              <div className="bg-muted rounded-xl py-2"><p className="font-black text-violet-600">{test.durationMinutes}m</p><p className="text-[9px] text-muted-foreground uppercase">Time</p></div>
              <div className="bg-muted rounded-xl py-2"><p className="font-black text-violet-600">{test.passingPercentage}%</p><p className="text-[9px] text-muted-foreground uppercase">To Pass</p></div>
            </div>

            {existing ? (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <p className="text-[13px] font-bold">✅ You already took this month's test</p>
                <p className="text-[12px] text-muted-foreground">Score: <b>{existing.percentage}%</b> · {existing.passed ? 'Passed 🎉' : 'Failed'}</p>
                {existing.passed && existing.certificateId && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="flex-1 rounded-lg bg-violet-600" onClick={() => downloadCert({ ...existing, monthLabel: test.monthLabel, monthEn: test.monthEn, certificateTitle: test.certificateTitle, userName: user?.name })}><Download className="w-3.5 h-3.5 mr-1" />Certificate</Button>
                    <Button size="sm" className="flex-1 rounded-lg bg-[#25D366] text-white" onClick={() => shareWhatsApp({ ...existing, monthLabel: test.monthLabel, monthEn: test.monthEn })}><Share2 className="w-3.5 h-3.5 mr-1" />Share</Button>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2">🔒 Only one attempt per month is allowed.</p>
              </div>
            ) : (
              <Button onClick={startTest} className="w-full rounded-xl h-12 text-base font-black bg-gradient-to-r from-violet-600 to-fuchsia-600"><Brain className="w-5 h-5 mr-2" />Start Test</Button>
            )}
          </Card>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={openLeaderboard}><Trophy className="w-4 h-4 mr-1" />Leaderboard</Button>
          <Button variant="outline" className="flex-1 rounded-xl" onClick={openHistory}><History className="w-4 h-4 mr-1" />My History</Button>
        </div>
      </div>
    </div>
  )
}

export default McmTestView
