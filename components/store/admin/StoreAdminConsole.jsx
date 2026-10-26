'use client'
import React, { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { LayoutDashboard, Package, FolderTree, Gift, ShoppingCart, Ticket, Image as ImageIcon, Link2, BarChart3, Settings as Cog, FileStack } from 'lucide-react'
import { sget, getToken, requireLogin } from '@/components/store/api'
import UploadProduct from '@/components/store/admin/UploadProduct'
import ProductsList from '@/components/store/admin/ProductsList'
import { DashboardPanel, CouponsPanel, OrdersPanel, CategoriesPanel, ShareLinksPanel, AnalyticsPanel, SettingsPanel, BannersPanel } from '@/components/store/admin/panels'
import AdminUnitTestsManager from '@/components/AdminUnitTestsManager'

const IND = '#241a5e', SAFF = '#f7b32b'
const NAV = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['products', 'Products', Package],
  ['unittests', 'Unit Tests', FileStack],
  ['categories', 'Categories', FolderTree],
  ['bundles', 'Bundles', Gift],
  ['orders', 'Orders', ShoppingCart],
  ['coupons', 'Coupons', Ticket],
  ['banners', 'Banners', ImageIcon],
  ['sharelinks', 'Share links', Link2],
  ['analytics', 'Analytics', BarChart3],
  ['settings', 'Settings', Cog],
]

export default function StoreAdminConsole() {
  const [nav, setNav] = useState('dashboard')
  const [view, setView] = useState({ name: 'list' })  // products/bundles sub-view
  const [gate, setGate] = useState('checking')         // checking | ok | denied

  useEffect(() => {
    if (!getToken()) { requireLogin('/store/admin'); return }
    sget('/admin/store/settings').then(() => setGate('ok')).catch((e) => setGate(e.status === 401 ? 'login' : 'denied'))
  }, [])
  useEffect(() => { setView({ name: 'list' }) }, [nav])

  if (gate === 'checking') return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  if (gate === 'login') { requireLogin('/store/admin'); return null }
  if (gate === 'denied') return <div className="min-h-screen flex items-center justify-center text-center p-6"><div><div className="text-xl font-bold" style={{ color: IND }}>Admin only</div><div className="text-sm text-gray-500 mt-1">This area is restricted to store administrators.</div><a href="/store" className="inline-block mt-3 text-sm font-bold rounded-full px-4 py-2 text-white" style={{ background: IND }}>Go to store</a></div></div>

  const renderMain = () => {
    if (nav === 'dashboard') return <DashboardPanel />
    if (nav === 'products' || nav === 'bundles') {
      const bundlesOnly = nav === 'bundles'
      if (view.name === 'upload') return <UploadProduct productId={view.id} onBack={() => setView({ name: 'list' })} onSaved={() => {}} />
      return <ProductsList bundlesOnly={bundlesOnly} onNew={() => setView({ name: 'upload', id: null })} onEdit={(id) => setView({ name: 'upload', id })} />
    }
    if (nav === 'categories') return <CategoriesPanel />
    if (nav === 'unittests') return <AdminUnitTestsManager />
    if (nav === 'orders') return <OrdersPanel />
    if (nav === 'coupons') return <CouponsPanel />
    if (nav === 'banners') return <BannersPanel />
    if (nav === 'sharelinks') return <ShareLinksPanel />
    if (nav === 'analytics') return <AnalyticsPanel />
    if (nav === 'settings') return <SettingsPanel />
    return null
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f3fb' }}>
      <Toaster position="top-center" richColors />
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:flex-col w-60 shrink-0 min-h-screen sticky top-0 text-white" style={{ background: IND }}>
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-[#241a5e]" style={{ background: SAFF }}>LG</div>
            <div><div className="font-extrabold leading-tight">Store Admin</div><div className="text-[11px] text-white/60">LessonGuru Odisha</div></div>
          </div>
          <nav className="px-3 space-y-1 mt-2">
            {NAV.map(([k, l, Ic]) => (
              <button key={k} onClick={() => setNav(k)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-semibold transition" style={nav === k ? { background: SAFF, color: IND } : { color: 'rgba(255,255,255,0.8)' }}>
                <Ic size={18} /> {l}
              </button>
            ))}
          </nav>
          <a href="/store" className="mt-auto m-3 text-center text-[12px] rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20">← Back to store</a>
        </aside>
        {/* Mobile top nav */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex gap-1 overflow-x-auto px-2 py-2 text-white" style={{ background: IND }}>
          {NAV.map(([k, l]) => <button key={k} onClick={() => setNav(k)} className="text-[12px] font-bold rounded-full px-3 py-1.5 whitespace-nowrap" style={nav === k ? { background: SAFF, color: IND } : { color: '#fff', background: 'rgba(255,255,255,0.1)' }}>{l}</button>)}
        </div>
        {/* Main */}
        <main className="flex-1 min-w-0 p-4 md:p-7 pt-16 md:pt-7">{renderMain()}</main>
      </div>
    </div>
  )
}
