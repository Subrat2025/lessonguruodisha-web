'use client'
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Search, ArrowLeft, ShoppingCart } from 'lucide-react'
import { sget, addToCartSmart, money } from '@/components/store/api'

const IND = '#241a5e', CORAL = '#e8452c', SAFF = '#f7b32b', GREEN = '#2a9d5c'
const BG = '#f5f3fb', BORDER = '#d6d1ee'
const CARD = 'bg-white rounded-[18px]'
const SHADOW = { boxShadow: '0 2px 10px rgba(36,26,94,0.07)' }
const OD = '୦୧୨୩୪୫୬୭୮୯'
const odNum = (n) => String(n ?? '').replace(/[0-9]/g, d => OD[+d])
const LETTER = { math: 'ଗ', odia: 'ଓ', english: 'E', hindi: 'हि', sanskrit: 'सं', science: 'ଜି', social: 'ସା', art: 'କ', kaushal: 'କୌ' }
const letterFor = (s) => LETTER[s.subjectKey] || (s.nameOdia || '?').slice(0, 1)

export default function UnitTestsBrowse() {
  return (<Suspense fallback={<div className="min-h-screen" style={{ background: BG }} />}><Inner /></Suspense>)
}

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  const cls = sp.get('cls') || ''
  const subjectKey = sp.get('subject') || ''
  const [setsLive, setSetsLive] = useState(null)
  useEffect(() => { sget('/store/config').then(r => setSetsLive(r.setsLive === true)).catch(() => setSetsLive(false)) }, [])
  const go = (p) => { const u = new URLSearchParams(); Object.entries(p).forEach(([k, v]) => v && u.set(k, v)); router.push(`/store/unit-tests${u.toString() ? '?' + u.toString() : ''}`) }
  if (setsLive === null) return <div className="min-h-screen" style={{ background: BG }} />
  return (
    <div className="min-h-screen pb-28" style={{ background: BG }}>
      {!subjectKey
        ? <ClassSubjects cls={cls} setsLive={setsLive} onClass={(c) => go({ cls: c })} onSubject={(c, s) => go({ cls: c, subject: s })} />
        : (setsLive
          ? <ChapterSets cls={cls} subjectKey={subjectKey} onBack={() => go({ cls })} />
          : <ChapterLegacy cls={cls} subjectKey={subjectKey} onBack={() => go({ cls })} />)}
    </div>
  )
}

function TopBar({ title, onBack }) {
  const router = useRouter()
  return (
    <div className="sticky top-0 z-20 bg-white border-b" style={{ borderColor: '#ece9f6' }}>
      <div className="max-w-[1200px] mx-auto px-3 h-12 flex items-center gap-2">
        <button onClick={onBack || (() => router.push('/store'))} className="p-1 -ml-1"><ArrowLeft size={20} style={{ color: IND }} /></button>
        <div className="flex-1 text-center font-bold text-[16px] font-baloo" style={{ color: IND }}>{title}</div>
        <button onClick={() => router.push('/store/cart')} className="p-1"><ShoppingCart size={20} style={{ color: IND }} /></button>
      </div>
    </div>
  )
}

// ========================= SCREEN 09 · Class + Subjects =========================
function ClassSubjects({ cls, setsLive, onClass, onSubject }) {
  const router = useRouter()
  const [classes, setClasses] = useState(null)
  const [data, setData] = useState(null)
  const effective = cls || (classes && classes[0]?.class) || ''
  useEffect(() => { sget('/store/unit-tests/classes').then(r => setClasses(r.classes || [])).catch(() => setClasses([])) }, [])
  useEffect(() => { if (!effective) return; setData(null); sget(`/store/unit-tests/subjects?cls=${effective}`).then(setData).catch(() => setData({ subjects: [] })) }, [effective])

  const subjects = data?.subjects || []
  const subjCount = subjects.length
  const totalCh = subjects.reduce((a, s) => a + (s.chapters || 0), 0)
  // Auto class-range for the banner (from published classes), e.g. "ଶ୍ରେଣୀ ୧–୮".
  const numClasses = (classes || []).map(c => parseInt(c.class, 10)).filter(n => !isNaN(n))
  const classRangeOdia = numClasses.length
    ? `ଶ୍ରେଣୀ ${odNum(Math.min(...numClasses))}–${odNum(Math.max(...numClasses))}`
    : 'ଶ୍ରେଣୀ'
  const addClassPack = async () => {
    const p = data?.classPack; if (!p) return
    try { await addToCartSmart({ id: p.id, titleOdia: p.titleOdia, price: p.pricing.price }); toast.success('କାର୍ଟରେ ଯୋଡାଗଲା'); router.push('/store/cart') } catch (e) { toast.error(e.message) }
  }

  return (
    <div>
      <TopBar title="ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ" onBack={() => router.push('/store')} />
      <div className="max-w-[1200px] mx-auto px-3 pt-3">
        {/* flat saffron banner */}
        <div className="relative rounded-[18px] overflow-hidden p-4 mb-4" style={{ background: SAFF }}>
          <div className="absolute -right-6 -top-8 w-36 h-36 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <div className="font-extrabold font-baloo leading-tight text-[22px] sm:text-[26px]" style={{ color: IND }}>ପ୍ରତି ଅଧ୍ୟାୟ ୫ଟି ପରୀକ୍ଷା</div>
              <div className="text-[13px] font-medium mt-1" style={{ color: '#5a4a12' }}>{setsLive ? `${classRangeOdia} · ସେଟ୍ ପ୍ରତି ମାତ୍ର ₹୨ · A4 ପ୍ରିଣ୍ଟ ପାଇଁ ପ୍ରସ୍ତୁତ` : `${classRangeOdia} · ସବୁ ବିଷୟ · A4 ପ୍ରିଣ୍ଟ ପାଇଁ ପ୍ରସ୍ତୁତ`}</div>
            </div>
            <div className="shrink-0 w-[70px] h-[70px] rounded-full flex flex-col items-center justify-center text-white font-baloo" style={{ background: CORAL, transform: 'rotate(-8deg)', boxShadow: '0 4px 10px rgba(232,69,44,.35)' }}>
              <span className="text-[11px] font-bold -mb-1 leading-tight text-center">{setsLive ? 'ସେଟ୍ ପ୍ରତି ମାତ୍ର' : 'ମାତ୍ର'}</span>
              <span className="text-[24px] font-extrabold leading-none">₹୨</span>
            </div>
          </div>
        </div>

        {/* class picker */}
        <div className="font-bold text-[18px] font-baloo mb-2" style={{ color: IND }}>ଶ୍ରେଣୀ ବାଛନ୍ତୁ</div>
        <div className="grid grid-cols-7 gap-2 mb-4">
          {(classes || []).map(c => {
            const on = String(c.class) === String(effective)
            return (
              <button key={c.class} onClick={() => onClass(c.class)} className="rounded-[14px] py-2 flex flex-col items-center justify-center border-2 transition" style={{ background: on ? IND : '#fff', borderColor: on ? IND : BORDER }}>
                <span className="text-[20px] font-extrabold font-baloo leading-none" style={{ color: on ? '#fff' : IND }}>{odNum(c.class)}</span>
                <span className="text-[9px] mt-0.5" style={{ color: on ? 'rgba(255,255,255,.8)' : '#8b86a3' }}>ଶ୍ରେଣୀ</span>
              </button>
            )
          })}
          {!classes && <div className="col-span-7 text-sm text-gray-400">Loading…</div>}
        </div>

        {/* class pack card */}
        {data?.classPack && (
          <div className="relative rounded-[18px] overflow-hidden p-4 mb-4 text-white" style={{ background: IND }}>
            <div className="absolute -right-8 -bottom-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="relative inline-block text-[11px] font-bold rounded-full px-2.5 py-1 mb-2" style={{ background: SAFF, color: IND }}>ଶ୍ରେଣୀ ପ୍ୟାକ୍</span>
            <div className="relative font-extrabold font-baloo text-[20px] leading-tight">ଶ୍ରେଣୀ {odNum(effective)} — ସବୁ {odNum(subjCount)}ଟି ବିଷୟର {odNum(totalCh)}ଟି ଅଧ୍ୟାୟ</div>
            <div className="relative flex items-center gap-2 mt-2">
              <span className="text-[32px] font-extrabold font-baloo leading-none" style={{ color: SAFF }}>{money(data.classPack.pricing.price)}</span>
              {data.classSeparately > data.classPack.pricing.price && <span className="text-[13px] line-through opacity-70">ଅଲଗା କିଣିଲେ {money(data.classSeparately)}</span>}
            </div>
            <div className="relative flex items-center gap-3 mt-3">
              {data.classSeparately - data.classPack.pricing.price > 0 && <span className="text-[12px] font-bold rounded-full px-3 py-1" style={{ background: GREEN }}>₹{data.classSeparately - data.classPack.pricing.price} ସଞ୍ଚୟ</span>}
              <button onClick={addClassPack} className="ml-auto font-bold text-[14px] rounded-[12px] px-5 py-2.5 font-baloo" style={{ background: SAFF, color: IND }}>କମ୍ବୋ ନିଅନ୍ତୁ</button>
            </div>
          </div>
        )}

        {/* subjects */}
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-[18px] font-baloo" style={{ color: IND }}>ଶ୍ରେଣୀ {odNum(effective)}ର ବିଷୟ</div>
          <div className="text-[12px]" style={{ color: '#8b86a3' }}>ବିଷୟ ପ୍ୟାକ୍ ପ୍ରାୟ 25% ଶସ୍ତା</div>
        </div>
        {!data && <div className="text-sm text-gray-400 py-6">Loading…</div>}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {subjects.map(s => (
            <button key={s.subjectKey} onClick={() => onSubject(effective, s.subjectKey)} className={`${CARD} p-3 text-left`} style={SHADOW}>
              <div className="flex items-center gap-2.5">
                <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center font-baloo text-[20px] font-extrabold shrink-0" style={{ background: `${s.color}1a`, color: s.color }}>{letterFor(s)}</div>
                <div className="min-w-0">
                  <div className="font-bold text-[14.5px] font-baloo truncate" style={{ color: IND }}>{s.nameOdia}</div>
                  <div className="text-[11.5px] truncate" style={{ color: '#8b86a3' }}>{s.nameEnglish}</div>
                </div>
              </div>
              <div className="text-[12px] mt-2" style={{ color: '#6b6684' }}>{odNum(s.chapters)} ଅଧ୍ୟାୟ · {odNum((s.chapters || 0) * 5)} ପରୀକ୍ଷା</div>
              <div className="border-t border-dashed my-2" style={{ borderColor: '#e6e2f2' }} />
              <div className="flex items-center gap-2">
                {s.pack ? <>
                  <span className="text-[19px] font-extrabold font-baloo" style={{ color: CORAL }}>{money(s.pack.pricing.price)}</span>
                  {s.separately > s.pack.pricing.price && <span className="text-[12px] line-through" style={{ color: '#b7b2c7' }}>{money(s.separately)}</span>}
                  {s.separately - s.pack.pricing.price > 0 && <span className="ml-auto text-[11px] font-bold" style={{ color: GREEN }}>₹{s.separately - s.pack.pricing.price} ସଞ୍ଚୟ</span>}
                </> : <span className="text-[13px]" style={{ color: '#8b86a3' }}>ଦେଖନ୍ତୁ →</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ========================= SCREEN 10 · Chapter list with Set tiles =========================
function SetTile({ set, selected, owned, onToggle }) {
  const base = 'relative rounded-[14px] h-[66px] flex flex-col items-center justify-center border-2 transition'
  if (owned) return (
    <div className={base} style={{ background: '#e6f4ec', borderColor: `${GREEN}66` }}>
      <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: GREEN }}><Check size={12} className="text-white" strokeWidth={3} /></span>
      <span className="text-[11px] font-bold font-odia leading-none" style={{ color: GREEN }}>ସେଟ୍</span>
      <span className="text-[17px] font-extrabold font-baloo leading-tight" style={{ color: GREEN }}>{odNum(set.setNo)}</span>
      <span className="text-[10px] font-bold font-odia" style={{ color: GREEN }}>କିଣିଛନ୍ତି</span>
    </div>
  )
  return (
    <button onClick={onToggle} className={base} style={{ background: selected ? IND : '#fff', borderColor: selected ? IND : BORDER }}>
      {selected && <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: CORAL }}><Check size={12} className="text-white" strokeWidth={3} /></span>}
      <span className="text-[11px] font-bold font-odia leading-none" style={{ color: selected ? 'rgba(255,255,255,.85)' : IND }}>ସେଟ୍</span>
      <span className="text-[20px] font-extrabold font-baloo leading-tight" style={{ color: selected ? '#fff' : IND }}>{odNum(set.setNo)}</span>
      <span className="text-[12px] font-bold font-baloo" style={{ color: selected ? SAFF : CORAL }}>{money(set.pricing.price)}</span>
    </button>
  )
}

function ChapterCard({ c, idx, sel, toggle, onBundle, router }) {
  const selCount = c.sets.filter(s => sel.has(s.id)).length
  const buyable = c.sets.filter(s => !s.owned).length
  const fullyOwned = c.bundle?.fullyOwned || c.owned
  const partiallyOwned = !fullyOwned && (c.bundle?.ownedSetCount || 0) > 0
  const allSel = buyable > 0 && selCount === buyable
  return (
    <div className={`${CARD} p-3.5`} style={SHADOW}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[18px] font-extrabold font-baloo shrink-0" style={{ background: '#efecfb', color: IND }}>{odNum(idx)}</span>
        <div className="min-w-0">
          <div className="font-bold text-[15px] font-baloo truncate" style={{ color: IND }}>{c.chapterTitle}</div>
          <div className="text-[12px]" style={{ color: '#8b86a3' }}>{odNum(c.setCount)}ଟି ସେଟ୍ · ପ୍ରତିଟି {odNum(c.fullMarks)} ନମ୍ବର · A4</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {c.sets.map(s => <SetTile key={s.id} set={s} owned={s.owned} selected={sel.has(s.id)} onToggle={() => toggle(s.id)} />)}
      </div>
      {fullyOwned ? (
        <div className="mt-3 flex items-center justify-between rounded-[12px] px-3.5 py-3" style={{ background: '#e6f4ec' }}>
          <span className="text-[13px] font-bold font-baloo" style={{ color: GREEN }}>ପୂରା ଅଧ୍ୟାୟ କିଣିସାରିଛନ୍ତି</span>
          <button onClick={() => router.push('/store/library')} className="text-[13px] font-bold font-baloo" style={{ color: GREEN }}>ଖୋଲନ୍ତୁ →</button>
        </div>
      ) : partiallyOwned ? (
        <button onClick={() => onBundle(c)} className="w-full mt-3 rounded-[12px] py-3 text-center font-bold text-[14px] font-baloo border-2" style={{ borderColor: CORAL, color: CORAL }}>
          ବାକି {odNum(c.bundle.remaining)}ଟି ସେଟ୍ — {money(c.bundle.price)} <span className="text-[12px] font-semibold">(₹{c.bundle.credit} ଆଗରୁ ଦେଇଛନ୍ତି)</span>
        </button>
      ) : selCount >= 3 && !allSel ? (
        <div className="mt-3 rounded-[12px] p-3 flex items-center gap-3" style={{ background: '#fdf1d6' }}>
          <div className="flex-1 text-[13px] leading-snug font-odia" style={{ color: IND }}>{odNum(selCount)}ଟି ସେଟ୍ ବାଛିଛନ୍ତି ({money(selCount * 2)}) — ଆଉ {money(Math.max(0, c.bundle.full - selCount * 2))} ଦେଇ ସବୁ {odNum(c.setCount)}ଟି ସେଟ୍ ନିଅନ୍ତୁ</div>
          <button onClick={() => onBundle(c)} className="shrink-0 text-white font-bold text-[13px] rounded-full px-4 py-2.5 font-baloo" style={{ background: IND }}>ସବୁ {odNum(c.setCount)}ଟି ନିଅନ୍ତୁ</button>
        </div>
      ) : (
        <button onClick={() => onBundle(c)} className="w-full mt-3 rounded-[12px] py-3 text-center font-bold text-[14px] font-baloo border-2" style={{ borderColor: CORAL, color: CORAL }}>ସବୁ {odNum(c.setCount)}ଟି ସେଟ୍ — {money(c.bundle.full)}</button>
      )}
    </div>
  )
}

function ChapterSets({ cls, subjectKey, onBack }) {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  useEffect(() => { const t = setTimeout(() => sget(`/store/unit-tests/chapters?cls=${cls}&subjectKey=${subjectKey}${search ? '&search=' + encodeURIComponent(search) : ''}`).then(setData).catch(() => setData({ chapters: [] })), 250); return () => clearTimeout(t) }, [cls, subjectKey, search])
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const { selCount, total } = useMemo(() => {
    let count = 0, tot = 0
    for (const c of (data?.chapters || [])) {
      const chosen = c.sets.filter(s => sel.has(s.id)); if (!chosen.length) continue
      count += chosen.length
      const buyable = c.sets.filter(s => !s.owned)
      tot += (chosen.length === buyable.length && !c.bundle?.fullyOwned) ? c.bundle.price : chosen.length * 2
    }
    return { selCount: count, total: tot }
  }, [data, sel])
  const addSelected = async () => {
    if (!selCount || adding) return; setAdding(true)
    try {
      for (const c of (data?.chapters || [])) {
        const chosen = c.sets.filter(s => sel.has(s.id)); if (!chosen.length) continue
        const buyable = c.sets.filter(s => !s.owned)
        if (chosen.length === buyable.length && !c.bundle?.fullyOwned) await addToCartSmart({ id: c.id, titleOdia: c.chapterTitle, price: c.bundle.price })
        else for (const s of chosen) await addToCartSmart({ id: s.id, titleOdia: `${c.chapterTitle} — ସେଟ୍ ${s.setNo}`, price: s.pricing.price })
      }
      toast.success(`${odNum(selCount)} ଟି ସେଟ୍ କାର୍ଟରେ ଯୋଡାଗଲା`); setSel(new Set()); window.dispatchEvent(new Event('cartupd'))
    } catch (e) { toast.error(e.message) } finally { setAdding(false) }
  }
  const addBundle = async (c) => { try { await addToCartSmart({ id: c.id, titleOdia: c.chapterTitle, price: c.bundle.price }); toast.success('ପୂରା ଅଧ୍ୟାୟ କାର୍ଟରେ ଯୋଡାଗଲା'); setSel(s => { const n = new Set(s); c.sets.forEach(x => n.delete(x.id)); return n }); router.push('/store/cart') } catch (e) { toast.error(e.message) } }
  const addPack = async () => { const p = data?.subjectPack; if (!p) return; try { await addToCartSmart({ id: p.id, titleOdia: p.titleOdia, price: p.pricing.price }); toast.success('ବିଷୟ ପ୍ୟାକ୍ କାର୍ଟରେ ଯୋଡାଗଲା'); router.push('/store/cart') } catch (e) { toast.error(e.message) } }

  const sp = data?.subjectPack
  return (
    <div>
      <TopBar title="ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ" onBack={onBack} />
      <div className="max-w-[1200px] mx-auto px-3 pt-3">
        <div className="mb-3">
          <div className="font-extrabold text-[18px] font-baloo" style={{ color: IND }}>ଶ୍ରେଣୀ {odNum(cls)} · {data?.subjectOdia || ''}</div>
          <div className="text-[12px]" style={{ color: '#8b86a3' }}>{odNum(data?.chapterCount || 0)}ଟି ଅଧ୍ୟାୟ · ପ୍ରତି ଅଧ୍ୟାୟରେ ୫ଟି ସେଟ୍</div>
        </div>
        {sp && !sp.owned && (
          <div className="relative rounded-[18px] overflow-hidden p-4 mb-4 text-white" style={{ background: IND }}>
            <div className="absolute -right-8 -bottom-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="relative inline-block text-[11px] font-bold rounded-full px-2.5 py-1 mb-2" style={{ background: SAFF, color: IND }}>ବିଷୟ ପ୍ୟାକ୍</span>
            <div className="relative font-extrabold font-baloo text-[18px] leading-tight">ସବୁ {odNum(data.chapterCount)}ଟି ଅଧ୍ୟାୟ · {odNum(data.totalSets)}ଟି ସେଟ୍</div>
            <div className="relative flex items-center gap-2 mt-2">
              <span className="text-[28px] font-extrabold font-baloo leading-none" style={{ color: SAFF }}>{money(sp.pricing.price)}</span>
              {data.separately > sp.pricing.price && <span className="text-[13px] line-through opacity-70">ଅଲଗା କିଣିଲେ {money(data.separately)}</span>}
            </div>
            <div className="relative flex items-center gap-3 mt-3">
              {data.separately - sp.pricing.price > 0 && <span className="text-[12px] font-bold rounded-full px-3 py-1" style={{ background: GREEN }}>₹{data.separately - sp.pricing.price} ସଞ୍ଚୟ</span>}
              <button onClick={addPack} className="ml-auto font-bold text-[14px] rounded-[12px] px-5 py-2.5 font-baloo" style={{ background: SAFF, color: IND }}>ବିଷୟ ପ୍ୟାକ୍ ନିଅନ୍ତୁ</button>
            </div>
          </div>
        )}
        <div className="relative mb-3"><Search size={16} className="absolute left-3 top-3 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ଅଧ୍ୟାୟ ଖୋଜନ୍ତୁ…" className="w-full rounded-[12px] pl-9 pr-3 py-2.5 text-[14px] bg-white border-2" style={{ borderColor: BORDER }} /></div>
        {!data && <div className="text-sm text-gray-400 py-6">Loading…</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {(data?.chapters || []).map((c, i) => <ChapterCard key={c.id} c={c} idx={i + 1} sel={sel} toggle={toggle} onBundle={addBundle} router={router} />)}
        </div>
        {data?.chapters?.length === 0 && <div className="text-sm text-gray-400 py-4">No chapters found.</div>}
      </div>

      <div className={`fixed bottom-0 left-0 right-0 bg-white border-t z-30 transition-transform duration-200 ${selCount > 0 ? 'translate-y-0' : 'translate-y-full'}`} style={{ borderColor: '#e1ddf3', boxShadow: '0 -4px 16px rgba(36,26,94,.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-[1200px] mx-auto px-3 py-2.5 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[13px] font-odia" style={{ color: '#5d5878' }}>{odNum(selCount)} ଟି ସେଟ୍ ବାଛିଲେ</div>
            <div className="text-[24px] font-extrabold font-baloo leading-none" style={{ color: CORAL }}>{money(total)}</div>
          </div>
          <button onClick={addSelected} disabled={adding} className="flex items-center gap-2 text-white font-bold rounded-[16px] px-5 font-baloo disabled:opacity-60" style={{ background: CORAL, height: 54 }}><ShoppingCart size={18} /> କାର୍ଟରେ ଯୋଡନ୍ତୁ</button>
        </div>
      </div>
    </div>
  )
}

// ========================= LEGACY (setsLive off → LIVE stays as-is) =========================
function ChapterLegacy({ cls, subjectKey, onBack }) {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [search, setSearch] = useState('')
  useEffect(() => { const t = setTimeout(() => sget(`/store/unit-tests/chapters?cls=${cls}&subjectKey=${subjectKey}${search ? '&search=' + encodeURIComponent(search) : ''}`).then(setData).catch(() => setData({ chapters: [] })), 250); return () => clearTimeout(t) }, [cls, subjectKey, search])
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selTotal = (data?.chapters || []).filter(c => sel.has(c.id)).reduce((a, c) => a + (c.bundle?.full || 2), 0)
  const addSelected = async () => { const chosen = (data?.chapters || []).filter(c => sel.has(c.id)); if (!chosen.length) return; try { for (const c of chosen) await addToCartSmart({ id: c.id, titleOdia: c.chapterTitle, price: c.bundle?.full || 2 }); toast.success('କାର୍ଟରେ ଯୋଡ଼ାଗଲା'); router.push('/store/cart') } catch (e) { toast.error(e.message) } }
  return (
    <div>
      <TopBar title="ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ" onBack={onBack} />
      <div className="max-w-[1200px] mx-auto px-3 pt-3">
        <div className="relative mb-3"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ଅଧ୍ୟାୟ ଖୋଜନ୍ତୁ…" className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" /></div>
        <div className="space-y-2">
          {(data?.chapters || []).map(c => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl p-3 bg-white border border-gray-100">
              {c.owned ? <Check size={20} style={{ color: GREEN }} /> : <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="w-5 h-5 accent-[#e8452c]" />}
              <div className="flex-1 min-w-0"><div className="font-semibold text-[13px] truncate" style={{ color: IND }}>{c.chapterTitle}</div><div className="text-[11px] text-gray-400">{odNum(c.assessmentsCount)}ଟି ପରୀକ୍ଷା · {odNum(c.fullMarks)} ନମ୍ବର</div></div>
              {c.owned ? <button onClick={() => router.push(`/store/p/${c.slug}`)} className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: `${GREEN}18`, color: GREEN }}>ଖୋଲନ୍ତୁ</button> : <span className="font-extrabold text-[14px]" style={{ color: CORAL }}>{money(c.bundle?.full || 2)}</span>}
            </div>
          ))}
          {data?.chapters?.length === 0 && <div className="text-sm text-gray-400">No chapters found.</div>}
        </div>
      </div>
      {sel.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3 z-30"><div className="max-w-[1200px] mx-auto flex items-center gap-3"><div className="flex-1 text-[13px]"><b>{odNum(sel.size)}</b> ଟି ବାଛିଲେ · <b style={{ color: CORAL }}>{money(selTotal)}</b></div><button onClick={addSelected} className="font-bold text-white rounded-full px-6 py-2.5" style={{ background: CORAL }}>କାର୍ଟରେ ଯୋଡନ୍ତୁ</button></div></div>
      )}
    </div>
  )
}
