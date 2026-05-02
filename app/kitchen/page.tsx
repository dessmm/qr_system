'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { db } from '@/lib/firebase'
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, QueryDocumentSnapshot
} from 'firebase/firestore'
import {
  listenToOrders,
  listenToSettings,
  updateOrderStatus,
  markOrderServed,
  Order,
  OrderStatus,
  AppSettings,
  DEFAULT_SETTINGS,
} from '@/lib/data'

// --- Constants ----------------------------------------------------------------
const LIVE_PAGE_SIZE    = 9
const HISTORY_PAGE_SIZE = 20

const STATUS_COLORS: Record<OrderStatus, string> = {
  'new':         'border-slate-200',
  'in-progress': 'border-blue-400',
  'ready':       'border-green-400',
  'served':      'border-slate-200 opacity-60',
}

const STATUS_HEADER: Record<OrderStatus, string> = {
  'new':         'bg-slate-50',
  'in-progress': 'bg-blue-50',
  'ready':       'bg-green-50',
  'served':      'bg-slate-50',
}

const STATUS_BG: Record<OrderStatus, string> = {
  'new':         'bg-white',
  'in-progress': 'bg-[#eff6ff]',
  'ready':       'bg-[#f0fdf4]',
  'served':      'bg-white',
}

// --- Helpers ------------------------------------------------------------------
type UrgencyLevel = 'all' | 'urgent' | 'warning' | 'normal'

function getUrgency(createdAt: number, targetMs: number): 'urgent' | 'warning' | 'normal' {
  const ms = Date.now() - createdAt
  if (ms > targetMs) return 'urgent'
  if (ms > targetMs * 0.75) return 'warning'
  return 'normal'
}

function TargetTimer({ createdAt, status, targetMs, isUrgent }: { createdAt: number; status: OrderStatus; targetMs: number; isUrgent: boolean }) {
  const [timeStr, setTimeStr] = useState('')
  useEffect(() => {
    if (status === 'served') return
    const update = () => {
      const elapsed = Date.now() - createdAt
      const left = targetMs - elapsed
      const absLeft = Math.abs(left)
      const m = Math.floor(absLeft / 60000).toString().padStart(2, '0')
      const s = Math.floor((absLeft % 60000) / 1000).toString().padStart(2, '0')
      setTimeStr(`${left < 0 ? '-' : ''}${m}:${s}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [createdAt, status, targetMs])
  return <span className={isUrgent ? 'text-red-600 font-black' : ''}>{timeStr}</span>
}

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right">
      <p className="text-primary leading-none text-2xl font-black">
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-sm text-slate-400">
        {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

type KitchenView = 'live' | 'history'

// --- Page ---------------------------------------------------------------------
export default function KitchenPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [view, setView]         = useState<KitchenView>('live')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const prevLiveCount           = useRef(0)

  const [tableFilter,   setTableFilter]   = useState<string>('')
  const [statusFilter,  setStatusFilter]  = useState<string>('all')
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyLevel>('all')

  const [historyOrders,    setHistoryOrders]    = useState<Order[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreHistory,   setHasMoreHistory]   = useState(true)
  const historyInitialized = useRef(false)

  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)

  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const [visibleCount,   setVisibleCount]   = useState(LIVE_PAGE_SIZE)
  const [isLoadingMore,  setIsLoadingMore]  = useState(false)
  const [newTicketCount, setNewTicketCount] = useState(0)
  const liveSentinelRef  = useRef<HTMLDivElement | null>(null)
  const liveObserverRef  = useRef<IntersectionObserver | null>(null)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const prevFilterKeyRef = useRef('')

  const [checkedItems, setCheckedItems] = useState<Record<string, Record<string, boolean>>>({})
  const [flashingOrders, setFlashingOrders] = useState<Set<string>>(new Set())
  const prevLiveIdsRef = useRef<Set<string>>(new Set())

  const targetPrepTimeMs = parseInt(settings.targetPrepTime || '15') * 60 * 1000

  // Real-time listeners
  useEffect(() => {
    const unsubOrders   = listenToOrders(setOrders)
    const unsubSettings = listenToSettings(setSettings)
    return () => { unsubOrders(); unsubSettings() }
  }, [])

  const liveOrders = orders
    .filter(o => o.status !== 'served')
    .sort((a, b) => a.createdAt - b.createdAt)

  const filteredOrders = useMemo(() => {
    return liveOrders.filter(o => {
      if (tableFilter.trim() !== '' && String(o.tableNumber) !== tableFilter.trim()) return false
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (urgencyFilter !== 'all' && getUrgency(o.createdAt, targetPrepTimeMs) !== urgencyFilter) return false
      return true
    })
  }, [liveOrders, tableFilter, statusFilter, urgencyFilter, targetPrepTimeMs])

  const hasActiveFilter = tableFilter.trim() !== '' || statusFilter !== 'all' || urgencyFilter !== 'all'

  const clearFilters = () => {
    setTableFilter('')
    setStatusFilter('all')
    setUrgencyFilter('all')
  }

  const visibleOrders = filteredOrders.slice(0, visibleCount)
  const allLoaded     = visibleCount >= filteredOrders.length

  // Reset scroll + visible window whenever filters change
  useEffect(() => {
    const key = `${tableFilter}|${statusFilter}|${urgencyFilter}`
    if (key === prevFilterKeyRef.current) return
    prevFilterKeyRef.current = key
    setVisibleCount(LIVE_PAGE_SIZE)
    setNewTicketCount(0)
    gridContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [tableFilter, statusFilter, urgencyFilter])

  // New-ticket arrival pill
  useEffect(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    if (scrollTop < 100) {
      setNewTicketCount(0)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setNewTicketCount(c => c + 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOrders.length])

  // Live-feed IntersectionObserver — re-attach whenever visibleCount changes
  useEffect(() => {
    if (view !== 'live') return

    liveObserverRef.current?.disconnect()

    if (allLoaded || isLoadingMore) {
      liveObserverRef.current = null
      return
    }

    liveObserverRef.current = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setIsLoadingMore(true)
        setTimeout(() => {
          setVisibleCount(c => c + LIVE_PAGE_SIZE)
          setIsLoadingMore(false)
        }, 300)
      },
      { root: null, rootMargin: '0px 0px 200px 0px', threshold: 0.1 }
    )

    if (liveSentinelRef.current) {
      liveObserverRef.current.observe(liveSentinelRef.current)
    }

    return () => {
      liveObserverRef.current?.disconnect()
      liveObserverRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, allLoaded, isLoadingMore, view])

  const avgPrepMin = useMemo(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const recentServed = orders.filter(o => o.status === 'served' && (o as any).updatedAt > twoHoursAgo)
    if (recentServed.length === 0) return null
    return Math.round(
      recentServed.reduce((sum, o) => sum + ((o as any).updatedAt - o.createdAt), 0) / recentServed.length / 60000
    )
  }, [orders])

  useEffect(() => {
    const currentIds = new Set(liveOrders.map(o => o.id))
    const newIds = liveOrders.filter(o => !prevLiveIdsRef.current.has(o.id) && prevLiveIdsRef.current.size > 0).map(o => o.id)
    
    if (newIds.length > 0) {
      new Audio('/chime.mp3').play().catch(() => {})
      setFlashingOrders(new Set(newIds))
      setTimeout(() => setFlashingOrders(new Set()), 3000)
    }
    prevLiveIdsRef.current = currentIds
  }, [liveOrders])

  const fetchHistoryOrders = useCallback(async (isNextPage: boolean) => {
    if (loadingRef.current || (!hasMoreRef.current && isNextPage)) return

    loadingRef.current = true
    setIsLoadingHistory(true)

    try {
      const constraints = [
        where('status', 'in', ['served', 'completed']),
        orderBy('createdAt', 'desc'),
        limit(HISTORY_PAGE_SIZE),
        ...(isNextPage && lastDocRef.current ? [startAfter(lastDocRef.current)] : []),
      ]

      const snap = await getDocs(query(collection(db, 'orders'), ...constraints))
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))

      const more = snap.docs.length === HISTORY_PAGE_SIZE
      hasMoreRef.current = more
      setHasMoreHistory(more)

      if (snap.docs.length > 0) {
        lastDocRef.current = snap.docs[snap.docs.length - 1]
      }

      setHistoryOrders(prev => isNextPage ? [...prev, ...fetched] : fetched)
    } catch (err) {
      console.error('[KitchenHistory] fetch error:', err)
    } finally {
      loadingRef.current = false
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    if (view !== 'history') return
    if (historyInitialized.current) return

    historyInitialized.current = true
    lastDocRef.current = null
    hasMoreRef.current = true
    setHasMoreHistory(true)
    fetchHistoryOrders(false)
  }, [view, fetchHistoryOrders])

  useEffect(() => {
    if (view !== 'history') {
      observerRef.current?.disconnect()
      observerRef.current = null
      return
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchHistoryOrders(true)
      },
      { root: null, rootMargin: '40px', threshold: 0 }
    )

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [view, fetchHistoryOrders])

  const advance = async (order: Order) => {
    const next: Record<OrderStatus, OrderStatus> = {
      'new':         'in-progress',
      'in-progress': 'ready',
      'ready':       'served',
      'served':      'served',
    }
    const nextStatus = next[order.status]
    if (nextStatus === 'served') {
      await markOrderServed(order.id)
    } else {
      await updateOrderStatus(order.id, nextStatus)
    }
  }

  const activeCount  = liveOrders.length
  const pendingItems = liveOrders.reduce((acc, o) => acc + o.items.reduce((s, i) => s + i.quantity, 0), 0)

  // --- Render -----------------------------------------------------------------
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
          border-radius: 4px;
        }
      `}</style>

      <div className="bg-background min-h-screen font-sans">

        {/* Sidebar */}
        <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 bg-slate-50 border-r-2 border-slate-200 flex-col py-6 gap-2 z-40">
          <div className="px-6 mb-8">
            <h1 className="text-lg font-black text-slate-900">Kitchen KDS</h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">
              Station: {settings.stationName}
            </p>
          </div>
          <nav className="flex-1 space-y-1">
            {([
              { key: 'live',    icon: 'monitor_heart', label: 'Live Feed' },
              { key: 'history', icon: 'history',       label: 'Order History' },
            ] as { key: KitchenView; icon: string; label: string }[]).map(item => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`flex items-center gap-3 w-full px-6 py-3 text-sm font-medium transition-all duration-200 ${
                  view === item.key
                    ? 'bg-white text-primary border-r-4 border-primary shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:pl-8'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="px-6 mt-auto">
            <div className="flex items-center gap-3 p-3 bg-slate-200/50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                CM
              </div>
              <div>
                <p className="font-bold text-slate-900">Chef Marco</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Head Chef</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Top bar */}
        <header className="md:ml-64 sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3 flex justify-between items-center z-30">
          <div className="flex items-center gap-4">
            <h2 className="text-primary font-extrabold tracking-tight text-xl">
              {settings.restaurantName}
            </h2>
            <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-slate-600 uppercase tracking-wide">Live</span>
            </div>
          </div>
          <LiveClock />
        </header>

        <main className="md:ml-64 p-4 md:p-8">

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Active Tickets', value: activeCount,                                 color: 'text-slate-900' },
              { label: 'Avg. Prep Time', value: avgPrepMin != null ? `${avgPrepMin}m` : '—', color: 'text-primary'   },
              { label: 'Items Pending',  value: pendingItems,                                color: 'text-slate-900' },
              { label: 'Station Status', value: 'Optimal', color: 'text-green-700', badge: true },
            ].map(stat => (
              <div key={stat.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs text-slate-400 uppercase mb-1 tracking-wide">{stat.label}</p>
                {stat.badge
                  ? <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded uppercase font-bold">{stat.value}</span>
                  : <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                }
              </div>
            ))}
          </div>

          {/* ── Live Feed ─────────────────────────────────────────────────────── */}
          {view === 'live' && (
            <div ref={gridContainerRef} className="relative">

              {/* Info banner */}
              <div className="mb-4 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-blue-500 mt-0.5 flex-shrink-0">info</span>
                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                  <strong>Kitchen workflow:</strong> Mark orders In Progress → Ready → Served as you cook and deliver.
                  &ldquo;Served&rdquo; means food reached the table — the table stays{' '}
                  <strong>Occupied</strong> until the customer pays at checkout.
                </p>
              </div>

              {/*
                Filter bar
                - sticky top-[61px]: locks just below the header (header height = ~61px)
                - z-20: above ticket cards, below sidebar (z-40) and header (z-30)
                - shadow-md: adds depth so cards visually slide under the bar
              */}
              <div className="sticky top-[61px] z-20 mb-6 flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-md">

                {/* Table number */}
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold select-none">
                    Table
                  </span>
                  <input
                    id="kitchen-table-filter"
                    type="text"
                    inputMode="numeric"
                    placeholder="#"
                    value={tableFilter}
                    onChange={e => setTableFilter(e.target.value.replace(/\D/g, ''))}
                    className="pl-12 pr-2 py-1.5 w-24 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>

                <div className="h-7 w-px bg-slate-200" />

                {/* Status pills */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Status</span>
                  {(['all', 'new', 'in-progress', 'ready'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
                        statusFilter === s
                          ? s === 'all'         ? 'bg-slate-800 text-white'
                          : s === 'new'         ? 'bg-orange-500 text-white'
                          : s === 'in-progress' ? 'bg-blue-600 text-white'
                          :                       'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="h-7 w-px bg-slate-200" />

                {/* Urgency pills */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Urgency</span>
                  {(['all', 'urgent', 'warning', 'normal'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => setUrgencyFilter(u as UrgencyLevel)}
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
                        urgencyFilter === u
                          ? u === 'all'     ? 'bg-slate-800 text-white'
                          : u === 'urgent'  ? 'bg-red-500 text-white'
                          : u === 'warning' ? 'bg-amber-500 text-white'
                          :                   'bg-slate-500 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {u === 'urgent' ? '🔴 Urgent' : u === 'warning' ? '🟡 Warning' : u === 'normal' ? '🟢 Normal' : 'All'}
                    </button>
                  ))}
                </div>

                {hasActiveFilter && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                    Clear all
                  </button>
                )}
              </div>

              {/* ── Ticket grid states ────────────────────────────────────────── */}
              {liveOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                  <span className="material-symbols-outlined text-6xl mb-4">restaurant</span>
                  <h3 className="text-2xl font-bold text-slate-700 mb-2">All caught up!</h3>
                  <p className="text-base">No active orders right now.</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                  <span className="material-symbols-outlined text-5xl mb-4">filter_list_off</span>
                  <p className="text-base font-medium text-slate-600">No orders match your filters.</p>
                  <button
                    onClick={clearFilters}
                    className="mt-3 text-sm text-primary hover:underline font-semibold"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  {/* Ticket cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {visibleOrders.map(order => {
                      const isUrgent  = getUrgency(order.createdAt, targetPrepTimeMs) === 'urgent'
                      const isWarning = getUrgency(order.createdAt, targetPrepTimeMs) === 'warning'
                      const isInProg  = order.status === 'in-progress'
                      const isReady   = order.status === 'ready'
                      const isFlashing = flashingOrders.has(order.id)

                      const cardBorder = isUrgent  ? 'border-red-500'
                                       : isWarning ? 'border-amber-400'
                                       : STATUS_COLORS[order.status]

                      const cardBg = isFlashing ? 'bg-orange-100 animate-pulse'
                                   : isUrgent || isWarning ? 'bg-white' : STATUS_BG[order.status]

                      const headerBg = isFlashing ? 'bg-orange-200'
                                     : isUrgent  ? 'bg-red-50'
                                     : isWarning ? 'bg-amber-50'
                                     : STATUS_HEADER[order.status]

                      const statusBarColor = isUrgent  ? 'bg-red-500 animate-pulse'
                                           : isWarning ? 'bg-amber-400'
                                           : isInProg  ? 'bg-blue-400'
                                           : isReady   ? 'bg-green-400'
                                           : 'bg-slate-200'

                      return (
                        <div
                          key={order.id}
                          className={`flex flex-col ${cardBg} rounded-lg border-2 ${cardBorder} overflow-hidden shadow-sm transition-all`}
                        >
                          <div className={`h-1.5 w-full ${statusBarColor}`} />

                          <div className={`p-3 border-b border-slate-100 flex justify-between items-start ${headerBg}`}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-lg font-bold text-slate-900 leading-none">T{order.tableNumber}</p>
                                {isInProg && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded uppercase tracking-wide">
                                    👨‍🍳 Prep
                                  </span>
                                )}
                                {isReady && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded uppercase tracking-wide">
                                    ✓ Ready
                                  </span>
                                )}
                              </div>
                              <p className={`text-[10px] uppercase font-semibold mt-1 tracking-wider ${
                                isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-400'
                              }`}>
                                {isUrgent ? 'URGENT ' : isWarning ? 'LATE ' : ''}#{order.id.slice(0, 5)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-xl tabular-nums leading-none mb-0.5">
                                <TargetTimer createdAt={order.createdAt} status={order.status} targetMs={targetPrepTimeMs} isUrgent={isUrgent} />
                              </p>
                              <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Remaining</p>
                            </div>
                          </div>

                          <div className="p-3 flex-1 space-y-2">
                            <ul className="space-y-1.5">
                              {order.items.map(item => {
                                const isChecked = checkedItems[order.id]?.[item.id] || false
                                return (
                                  <li 
                                    key={item.id} 
                                    className="flex gap-2 items-start cursor-pointer group"
                                    onClick={() => {
                                      setCheckedItems(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || {}),
                                          [item.id]: !isChecked
                                        }
                                      }))
                                    }}
                                  >
                                    <button className={`w-5 h-5 mt-0.5 flex items-center justify-center rounded transition-all flex-shrink-0 ${
                                      isChecked 
                                        ? 'bg-green-500 text-white' 
                                        : 'bg-slate-100 border border-slate-300 group-hover:border-slate-400'
                                    }`}>
                                      {isChecked && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex gap-1.5 items-baseline">
                                        <span className={`font-bold text-sm ${isChecked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                          {item.quantity}x
                                        </span>
                                        <span className={`font-semibold text-sm truncate ${isChecked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                          {item.name}
                                        </span>
                                      </div>
                                      {item.variantName && (
                                        <span className={`block text-xs ${isChecked ? 'text-slate-300' : 'text-slate-500'}`}>
                                          ({item.variantName})
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                            {order.specialInstructions && (
                              <div className="bg-amber-50 p-2.5 rounded-lg border-l-4 border-amber-400 mt-3">
                                <p className="text-[10px] text-amber-700 uppercase mb-0.5 font-bold">Special Instructions</p>
                                <p className="text-xs text-amber-900 font-bold italic">
                                  &quot;{order.specialInstructions}&quot;
                                </p>
                              </div>
                            )}
                          </div>

                          <div className={`p-2 border-t border-slate-100 ${
                            isInProg ? 'bg-blue-50' : isReady ? 'bg-green-50' : 'bg-slate-50'
                          }`}>
                            {order.status === 'new' && (
                              <button
                                onClick={() => advance(order)}
                                className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded uppercase tracking-wider text-xs active:scale-95 transition-all"
                              >
                                Start Cooking
                              </button>
                            )}
                            {order.status === 'in-progress' && (
                              <button
                                onClick={() => advance(order)}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded uppercase tracking-wider text-xs active:scale-95 transition-all"
                              >
                                Mark Ready
                              </button>
                            )}
                            {order.status === 'ready' && (
                              <button
                                onClick={() => advance(order)}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded uppercase tracking-wider text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                              >
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Mark Served
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Skeleton cards — shown while next batch loads */}
                  {isLoadingMore && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="flex flex-col bg-white rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm"
                          style={{ minHeight: 280 }}
                        >
                          <div className="h-1.5 w-full skeleton-shimmer" />
                          <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div className="space-y-2 flex-1">
                              <div className="skeleton-shimmer h-5 w-2/5" />
                              <div className="skeleton-shimmer h-3 w-1/4" />
                            </div>
                            <div className="skeleton-shimmer h-8 w-1/5 ml-4" />
                          </div>
                          <div className="p-4 flex-1 space-y-3">
                            {[0, 1, 2].map(j => (
                              <div key={j} className="flex gap-3 items-center">
                                <div className="skeleton-shimmer w-7 h-7 flex-shrink-0 rounded-lg" />
                                <div
                                  className="skeleton-shimmer h-4 flex-1"
                                  style={{ width: `${60 + j * 10}%` }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="p-3 bg-slate-50 border-t border-slate-100">
                            <div className="skeleton-shimmer h-11 w-full rounded-lg" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scroll sentinel — invisible div watched by IntersectionObserver */}
                  {!allLoaded && !isLoadingMore && (
                    <div ref={liveSentinelRef} className="h-1 w-full" aria-hidden="true" />
                  )}

                  {/* End-of-feed message */}
                  {allLoaded && filteredOrders.length > LIVE_PAGE_SIZE && (
                    <p className="text-center text-xs text-slate-400 py-6">
                      All active tickets loaded · {filteredOrders.length} total
                    </p>
                  )}
                </>
              )}

              {/* New-ticket floating pill */}
              {newTicketCount > 0 && (
                <button
                  onClick={() => {
                    setNewTicketCount(0)
                    setVisibleCount(LIVE_PAGE_SIZE)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="sticky bottom-6 mx-auto flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-full shadow-lg transition-all active:scale-95 z-20"
                  style={{ width: 'fit-content', display: 'flex' }}
                >
                  ↑ {newTicketCount} new ticket{newTicketCount !== 1 ? 's' : ''} — tap to go to top
                </button>
              )}

            </div>
          )}

          {/* ── Order History ──────────────────────────────────────────────────── */}
          {view === 'history' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-slate-900">Order History</h2>

              <div className="overflow-y-scroll overscroll-contain max-h-[calc(100vh-280px)] min-h-0 space-y-3 pr-1">

                {historyOrders.length === 0 && isLoadingHistory && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-3 animate-spin">progress_activity</span>
                    <p className="text-sm font-medium">Loading order history…</p>
                  </div>
                )}

                {historyOrders.length === 0 && !isLoadingHistory && (
                  <div className="text-center py-16 text-slate-400">
                    <span className="material-symbols-outlined text-5xl mb-3 block">history</span>
                    <p>No served orders yet.</p>
                  </div>
                )}

                {historyOrders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between shadow-sm"
                  >
                    <div>
                      <p className="font-bold text-slate-900">
                        Table {order.tableNumber} — #{order.id.slice(0, 6)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {order.items.length} items · ₱{order.total.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase block mb-1">
                        Food Delivered
                      </span>
                      <span className="text-[10px] text-slate-400">Awaiting payment</span>
                    </div>
                  </div>
                ))}

                <div
                  ref={el => {
                    sentinelRef.current = el
                    if (el && observerRef.current) observerRef.current.observe(el)
                  }}
                  className="flex items-center justify-center h-12"
                  aria-hidden="true"
                >
                  {isLoadingHistory && historyOrders.length > 0 && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                      <span className="text-sm">Loading more…</span>
                    </div>
                  )}
                  {!hasMoreHistory && historyOrders.length > 0 && (
                    <p className="text-xs text-slate-400">All orders loaded</p>
                  )}
                </div>

              </div>
            </div>
          )}

        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 flex justify-around items-center px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
          {(['live', 'history'] as KitchenView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex flex-col items-center text-[11px] font-semibold transition-all active:scale-90 ${
                view === v ? 'text-primary bg-orange-50 rounded-xl px-3 py-1' : 'text-slate-400'
              }`}
            >
              <span className="material-symbols-outlined">
                {v === 'live' ? 'monitor_heart' : 'history'}
              </span>
              <span className="capitalize">{v === 'live' ? 'Live Feed' : 'History'}</span>
            </button>
          ))}
        </nav>

      </div>
    </>
  )
}