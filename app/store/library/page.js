'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Eye, X, Lock, ShoppingCart } from 'lucide-react'
import { sget, spost, getToken, requireLogin, secureDownload, viewImageUrl, addToCartSmart, COLORS } from '@/components/store/api'
import { StoreHeader, WhatsAppHelp } from '@/components/store/ui'

const OD = '୦୧୨୩୪୫୬୭୮୯'
const odNum = (n) => String(n ?? '').replace(/[0-9]/g, d => OD[+d])
const IND = COLORS.indigo, CORAL = COLORS.coral, GREEN = COLORS.green

export default function LibraryPage() {
  const router = useRouter()
  const [tree, setTree] = useState(null)       // { classes: [...] }
  const [others, setOthers] = useState([])
  const [activeCls, setActiveCls] = useState('all')
  const [busy, setBusy] = useState({})
  const [menu, setMenu] = useState(null)        // { productId, fileId, setNo }
  const [viewer, setViewer] = useState(null)    // { productId, fileId, page, pages }

  const load = async () => {
    if (!getToken()) return requireLogin('/store/library')
    try {
      const [t, lib] = await Promise.all([
        sget('/store/unit-tests/library').catch(() => ({ classes: [] })),
        sget('/store/library').catch(() => ({ items: [] })),
      ])
      setTree(t)
      setOthers((lib.items || []).filter(it => !it.unitTest && !['unit_test', 'unit_test_set', 'unit_test_pack'].includes(it.product.type)))
    } catch (e) { if (e.status === 401) return requireLogin('/store/library'); setTree({ classes: [] }) }
  }
  useEffect(() => { if (!getToken()) return requireLogin('/store/library'); load() }, []) // eslint-disable-line

  const doDownload = async (productId, fileId) => {
    if (!fileId) return
    setBusy(b => ({ ...b, [fileId]: true })); setMenu(null)
    try { await secureDownload(productId, fileId); toast.success('Downloaded'); load() }
    catch (e) { toast.error((e?.message && e.message !== 'Not found') ? e.message : 'ଅସୁବିଧା ହେଲେ ଉପରେ “ସାହାଯ୍ୟ” ବଟନ୍‌ରେ WhatsApp କରନ୍ତୁ') }
    finally { setBusy(b => ({ ...b, [fileId]: false })) }
  }
  const addBundle = async (ch) => {
    try { await addToCartSmart({ id: ch.id, titleOdia: ch.title, price: ch.remainingPrice }); toast.success('କାର୍ଟରେ ଯୋଡାଗଲା'); router.push('/store/cart') } catch (e) { toast.error(e.message) }
  }

  const classes = tree?.classes || []
  const shown = useMemo(() => activeCls === 'all' ? classes : classes.filter(c => String(c.class) === String(activeCls)), [classes, activeCls])
  const limitFor = (p) => p.downloadLimit || 5
  const totalOther = (it) => Object.values(it.downloadsUsed || {}).reduce((a, n) => a + (Number(n) || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* header */}
      <div className="text-white px-4 pt-4 pb-5" style={{ background: IND }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[22px] font-extrabold leading-none">ମୋ ଲାଇବ୍ରେରୀ</div>
            <div className="text-[12px] opacity-75 mt-1">ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ</div>
          </div>
          <WhatsAppHelp context="library" />
        </div>
        {classes.length > 0 && (
          <div className="max-w-3xl mx-auto flex gap-2 mt-3 overflow-x-auto">
            {classes.map(c => (
              <button key={c.class} onClick={() => setActiveCls(c.class)} className="text-[12px] font-bold rounded-full px-4 py-1.5 whitespace-nowrap" style={{ background: activeCls === c.class ? COLORS.saffron : 'rgba(255,255,255,.14)', color: activeCls === c.class ? IND : '#fff' }}>ଶ୍ରେଣୀ {odNum(c.class)}</button>
            ))}
            <button onClick={() => setActiveCls('all')} className="text-[12px] font-bold rounded-full px-4 py-1.5 whitespace-nowrap" style={{ background: activeCls === 'all' ? COLORS.saffron : 'rgba(255,255,255,.14)', color: activeCls === 'all' ? IND : '#fff' }}>ସବୁ</button>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-3 -mt-2">
        {tree === null && <div className="h-24 bg-gray-100 rounded-2xl animate-pulse mt-4" />}
        {tree && classes.length === 0 && others.length === 0 && <div className="text-center text-gray-400 py-12">Nothing here yet.<br /><button onClick={() => router.push('/store/unit-tests')} className="mt-3 font-bold text-white rounded-full px-5 py-2" style={{ background: CORAL }}>Browse store</button></div>}

        {shown.map(cg => (
          <div key={cg.class} className="mt-4">
            {cg.subjects.map(sg => <SubjectBlock key={cg.class + sg.subjectKey} sg={sg} busy={busy} limitFor={limitFor} onMenu={setMenu} onLocked={(s) => router.push(`/store/p/${s.slug}`)} onBundlePdf={(ch) => doDownload(ch.id, ch.bundleFileId)} onAddBundle={addBundle} router={router} />)}
          </div>
        ))}

        {/* hint */}
        {classes.length > 0 && <div className="mt-4 rounded-xl p-3 text-[12px]" style={{ background: `${GREEN}10`, color: '#2a6b48' }}>ସେଟ୍ ଉପରେ ଚାପ କରି ଦେଖନ୍ତୁ ବା ଡାଉନଲୋଡ କରନ୍ତୁ। ନୀଳ ସଂଖ୍ୟା = ବାକି ଡାଉନଲୋଡ।</div>}

        {/* others */}
        {others.length > 0 && (
          <div className="mt-5">
            <div className="text-[12px] font-bold text-gray-500 mb-2">ଅନ୍ୟାନ୍ୟ · Other items</div>
            <div className="space-y-3">
              {others.map(it => {
                const p = it.product
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-3">
                    <div className="flex items-start gap-3">
                      {p.coverThumbUrl && <img src={p.coverThumbUrl} alt="" className="w-14 rounded-lg object-cover shrink-0" style={{ height: 70 }} loading="lazy" />}
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-gray-800">{p.titleOdia || p.titleEnglish}</div>
                        <div className="text-[11px] text-gray-400 mb-2">{p.classes?.join(', ') ? `Class ${p.classes.join(', ')} • ` : ''}{p.subject}</div>
                      </div>
                      {totalOther(it) > 0 && <span className="shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: `${GREEN}18`, color: GREEN }}>⬇ {odNum(totalOther(it))} ଥର</span>}
                    </div>
                    <div className="space-y-1.5 mt-1">
                      {(p.files || []).map(f => {
                        const used = (it.downloadsUsed || {})[f.id] || 0; const left = Math.max(0, limitFor(p) - used)
                        return (
                          <div key={f.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                            <span className="text-[12px] flex-1 text-gray-700">{f.name}</span>
                            <span className="text-[10px] text-gray-400">{left} left</span>
                            <button disabled={busy[f.id] || left <= 0} onClick={() => doDownload(p.id, f.id)} className="text-[11px] font-bold rounded-full px-3 py-1 text-white disabled:opacity-40" style={{ background: CORAL }}><Download className="w-3.5 h-3.5 inline" /> {busy[f.id] ? '…' : 'Get'}</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* owned-set action menu */}
      {menu && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" onClick={() => setMenu(null)}>
          <div className="bg-white rounded-2xl p-3 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-[14px] mb-2" style={{ color: IND }}>ସେଟ୍ {odNum(menu.setNo)}</div>
            <button onClick={() => { setViewer({ productId: menu.productId, fileId: menu.fileId, page: 1, pages: 1 }); setMenu(null) }} className="w-full flex items-center gap-2 rounded-xl px-3 py-3 mb-2 border text-[14px] font-bold" style={{ borderColor: COLORS.sky, color: COLORS.sky }}><Eye className="w-4 h-4" /> ଦେଖନ୍ତୁ</button>
            <button onClick={() => doDownload(menu.productId, menu.fileId)} className="w-full flex items-center gap-2 rounded-xl px-3 py-3 text-white text-[14px] font-bold" style={{ background: CORAL }}><Download className="w-4 h-4" /> ଡାଉନଲୋଡ</button>
          </div>
        </div>
      )}
      {/* viewer */}
      {viewer && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onContextMenu={e => e.preventDefault()}>
          <div className="flex items-center justify-end p-3 text-white"><button onClick={() => setViewer(null)}><X className="w-6 h-6" /></button></div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-2" style={{ userSelect: 'none' }}>
            <img src={viewImageUrl(viewer.productId, viewer.fileId, viewer.page)} alt="" className="max-w-full max-h-full pointer-events-none select-none" draggable={false} />
          </div>
        </div>
      )}
    </div>
  )
}

function SubjectBlock({ sg, busy, limitFor, onMenu, onLocked, onBundlePdf, onAddBundle, router }) {
  const [showAll, setShowAll] = useState(false)
  const chapters = sg.viaPack && !showAll ? sg.chapters.slice(0, 2) : sg.chapters
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${sg.color || COLORS.sky}18` }}>{sg.icon}</div>
        <div className="flex-1">
          <div className="font-extrabold text-[15px]" style={{ color: IND }}>{sg.odia}</div>
          <div className="text-[11px] text-gray-400">{odNum(sg.chapterCount)}ଟି ଅଧ୍ୟାୟ · {odNum(sg.setCount)}ଟି ସେଟ୍</div>
        </div>
        {sg.viaPack && <span className="text-[10px] font-bold rounded-full px-2.5 py-1" style={{ background: COLORS.saffron, color: IND }}>ବିଷୟ ପ୍ୟାକ୍</span>}
      </div>
      <div className="space-y-2.5">
        {chapters.map(ch => (
          <div key={ch.id} className="bg-white rounded-2xl border border-gray-100 p-3">
            <div className="font-bold text-[14px]" style={{ color: IND }}>{ch.title}</div>
            <div className="text-[11px] text-gray-400 mb-2">{ch.fullChapterOwned ? (ch.viaPack ? 'ବିଷୟ ପ୍ୟାକ୍ ମାଧ୍ୟମରେ' : 'ପୂରା ଅଧ୍ୟାୟ') : `${odNum(ch.sets.filter(s => s.owned).length)}ଟି ସେଟ୍`}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {ch.sets.map(s => s.owned ? (
                <button key={s.setNo} onClick={() => onMenu({ productId: s.productId, fileId: s.fileId, setNo: s.setNo })} className="rounded-xl py-2 text-center border" style={{ background: '#fff', borderColor: `${IND}33` }}>
                  <div className="text-[10px] font-bold leading-none" style={{ color: IND }}>ସେଟ୍</div>
                  <div className="text-[14px] font-extrabold leading-tight" style={{ color: IND }}>{odNum(s.setNo)}</div>
                  <div className="text-[9px] font-bold mt-0.5 flex items-center justify-center gap-0.5" style={{ color: COLORS.sky }}><Download className="w-2.5 h-2.5" />{odNum(s.left)} ବାକି</div>
                </button>
              ) : (
                <button key={s.setNo} onClick={() => onLocked(s)} className="rounded-xl py-2 text-center border border-dashed" style={{ background: '#f8f8fb', borderColor: '#cbd2e0' }}>
                  <Lock className="w-3 h-3 mx-auto text-gray-400" />
                  <div className="text-[13px] font-extrabold leading-tight text-gray-400 mt-0.5">{odNum(s.setNo)}</div>
                  <div className="text-[9px] font-bold text-gray-400">₹{s.pricing?.price ?? 2}</div>
                </button>
              ))}
            </div>
            {ch.fullChapterOwned ? (
              <button onClick={() => onBundlePdf(ch)} disabled={busy[ch.bundleFileId]} className="w-full mt-2.5 rounded-xl py-2.5 text-center font-bold text-white text-[13px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: IND }}>
                <Download className="w-4 h-4" /> ପୂରା ଅଧ୍ୟାୟ PDF ({odNum(ch.sets.length)}ଟି ସେଟ୍)
              </button>
            ) : ch.remaining > 0 && (
              <button onClick={() => onAddBundle(ch)} className="w-full mt-2.5 rounded-xl py-2.5 text-center font-bold text-[13px] border-2" style={{ borderColor: CORAL, color: CORAL }}>
                ବାକି {odNum(ch.remaining)}ଟି ସେଟ୍ — ₹{ch.remainingPrice} ରେ ନିଅନ୍ତୁ
              </button>
            )}
          </div>
        ))}
      </div>
      {sg.viaPack && sg.chapters.length > 2 && !showAll && (
        <button onClick={() => setShowAll(true)} className="w-full text-center text-[13px] font-bold mt-2.5" style={{ color: IND }}>ସବୁ {odNum(sg.chapterCount)}ଟି ଅଧ୍ୟାୟ ଦେଖନ୍ତୁ →</button>
      )}
    </div>
  )
}
