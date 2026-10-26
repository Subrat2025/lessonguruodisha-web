'use client'
import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { sget } from '@/components/store/api'

// Shows the Store entry in the teacher menu ONLY when the store is visible for
// this user (master switch ON, or the user is a beta tester). Self-gating.
export default function StoreMenuCard() {
  const [show, setShow] = useState(false)
  useEffect(() => { sget('/store/config').then(c => setShow(!!c.enabled)).catch(() => setShow(false)) }, [])
  if (!show) return null
  return (
    <Card onClick={() => { window.location.href = '/store' }} className="p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-3" style={{ borderColor: '#e8452c33' }}>
      <ShoppingBag className="w-5 h-5" style={{ color: '#e8452c' }} />
      <span className="flex-1 font-semibold">ଲେସନଗୁରୁ ଷ୍ଟୋର / Store</span>
      <ChevronRight className="w-4 h-4" />
    </Card>
  )
}
