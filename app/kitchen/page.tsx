'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

const STATUS_COLORS: Record<OrderStatus, string> = {
  'new':         'border-slate-200',
  'in-progress': 'border-orange-300',
  'ready':       'border-green-500',
  'served':      'border-slate-200 opacity-60',
}

const STATUS_HEADER: Record<OrderStatus, string> = {
  'new':         'bg-slate-50',
  'in-progress': 'bg-orange-50',
  'ready':       'bg-green-50',
  'served':      'bg-slate-50',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function elapsed(createdAt: number): string {
  const secs = Math.floor((Date.now() - createdAt) / 1000)
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function ElapsedTimer({ createdAt, status }: { createdAt: number; status: OrderStatus }) {
  const [time, setTime] = useState(elapsed(createdAt))
  useEffect(() => {
    if (status === 'served') return
    const id = setInterval(() => setTime(elapsed(createdAt)), 1000)
    return () => clearInterval(id)
  }, [createdAt, status])
  return <span>{time}</span>
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  // Real-time listener state (live orders + settings) — untouched
  const [orders, setOrders]     = useState<Order[]>([])
  const [view, setView]         = useState<KitchenView>('live')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const prevLiveCount           = useRef(0)

  // ── History: separate paginated state ──────────────────────────────────────
  const [historyOrders,    setHistoryOrders]    = useState<Order[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreHistory,   setHasMoreHistory]   = useState(true)
  // Whether we have loaded the first page at least once (prevents re-fetch on tab revisit)
  const historyInitialized = useRef(false)

  // Firestore pagination cursor
  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null)
  // Mirror refs so fetchHistoryOrders callback stays stable
  const loadingRef  = useRef(false)
  const hasMoreRef  = useRef(true)

  // IntersectionObserver
  const observerRef  = useRef<IntersectionObserver | null>(null)
  const sentinelRef  = useRef<HTMLDivElement | null>(null)

  // ── Real-time listener (live orders) ───────────────────────────────────────
  useEffect(() => {
    const unsubOrders   = listenToOrders(setOrders)
    const unsubSettings = listenToSettings(setSettings)
    return () => { unsubOrders(); unsubSettings() }
  }, [])

  // Live orders: everything not served
  const liveOrders = orders
    .filter(o => o.status !== 'served')
    .sort((a, b) => a.createdAt - b.createdAt)

  // Avg prep time — derived from the real-time listener (not paginated history)
  // so the stat card always reflects the current session without extra Firestore reads.
  const servedFromListener = orders.filter(o => o.status === 'served')
  const servedWithTimes    = servedFromListener.filter(o => (o as any).updatedAt > o.createdAt)
  const avgPrepMin = servedWithTimes.length > 0
    ? Math.round(
        servedWithTimes.reduce((sum, o) => sum + ((o as any).updatedAt - o.createdAt), 0)
        / servedWithTimes.length / 60000
      )
    : null

  // Alert kitchen staff when a new ticket arrives
  useEffect(() => {
    if (liveOrders.length > prevLiveCount.current) {
      new Audio('/chime.mp3').play().catch(() => {})
    }
    prevLiveCount.current = liveOrders.length
  }, [liveOrders.length])

  // ── Paginated history fetch ────────────────────────────────────────────────
  // Stable identity — reads loading/hasMore from refs, not state.
  const fetchHistoryOrders = useCallback(async (isNextPage: boolean) => {
    if (loadingRef.current || (!hasMoreRef.current && isNextPage)) return

    loadingRef.current = true
    setIsLoadingHistory(true)

    try {
      const constraints = [
        where('status', 'in', ['served', 'completed']),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
        ...(isNextPage && lastDocRef.current ? [startAfter(lastDocRef.current)] : []),
      ]

      const snap = await getDocs(query(collection(db, 'orders'), ...constraints))
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))

      const more = snap.docs.length === PAGE_SIZE
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
  }, []) // ← no volatile deps; reads from refs

  // ── Tab switch: initialize history on first visit ──────────────────────────
  useEffect(() => {
    if (view !== 'history') return
    if (historyInitialized.current) return // preserve scroll on revisit

    historyInitialized.current = true
    lastDocRef.current = null
    hasMoreRef.current = true
    setHasMoreHistory(true)
    fetchHistoryOrders(false)
  }, [view, fetchHistoryOrders])

  // ── IntersectionObserver: set up once when history tab is open ─────────────
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

  // ── Kitchen pipeline advance ───────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-background min-h-screen font-sans">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 bg-slate-50 border-r-2 border-slate-200 flex-col py-6 gap-2 z-40">
        <div className="px-6 mb-8">
          <h1 className="text-lg font-black text-slate-900">Kitchen KDS</h1>
          <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Station: {settings.stationName}</p>
        </div>
        <nav className="flex-1 space-y-1">
          {([
            { key: 'live',    icon: 'monitor_heart', label: 'Live Feed' },
            { key: 'history', icon: 'history',        label: 'Order History' },
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
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">CM</div>
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
          <h2 className="text-primary font-extrabold tracking-tight text-xl">{settings.restaurantName}</h2>
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
            { label: 'Active Tickets', value: activeCount,                               color: 'text-slate-900' },
            { label: 'Avg. Prep Time', value: avgPrepMin != null ? `${avgPrepMin}m` : '—', color: 'text-primary' },
            { label: 'Items Pending',  value: pendingItems,                              color: 'text-slate-900' },
            { label: 'Station Status', value: 'Optimal',    color: 'text-green-700', badge: true },
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

        {/* ── Live Feed ──────────────────────────────────────────────────────── */}
        {view === 'live' && (
          <>
            {/* Info banner */}
            <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-blue-500 mt-0.5 flex-shrink-0">info</span>
              <p className="text-xs text-blue-700 font-medium leading-relaxed">
                <strong>Kitchen workflow:</strong> Mark orders In Progress → Ready → Served as you cook and deliver.
                &ldquo;Served&rdquo; means food reached the table — the table stays <strong>Occupied</strong> until the customer pays at checkout.
              </p>
            </div>

            {liveOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <span className="material-symbols-outlined text-6xl mb-4">restaurant</span>
                <h3 className="text-2xl font-bold text-slate-700 mb-2">All caught up!</h3>
                <p className="text-base">No active orders right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {liveOrders.map(order => {
                  const isUrgent  = Date.now() - order.createdAt > 12 * 60 * 1000
                  const isWarning = !isUrgent && Date.now() - order.createdAt > 8 * 60 * 1000
                  return (
                    <div
                      key={order.id}
                      className={`flex flex-col bg-white rounded-xl border-2 ${
                        isUrgent  ? 'border-red-500' :
                        isWarning ? 'border-amber-400' :
                        STATUS_COLORS[order.status]
                      } overflow-hidden shadow-sm transition-all`}
                    >
                      {/* Status bar */}
                      <div className={`h-1.5 w-full ${
                        isUrgent  ? 'bg-red-500 animate-pulse' :
                        isWarning ? 'bg-amber-400' :
                        order.status === 'in-progress' ? 'bg-orange-400' :
                        order.status === 'ready'       ? 'bg-green-500' : 'bg-slate-200'
                      }`} />

                      {/* Header */}
                      <div className={`p-4 border-b border-slate-100 flex justify-between items-start ${
                        isUrgent  ? 'bg-red-50'   :
                        isWarning ? 'bg-amber-50' :
                        STATUS_HEADER[order.status]
                      }`}>
                        <div>
                          <p className="text-xl font-bold text-slate-900">Table {order.tableNumber}</p>
                          <p className={`text-xs uppercase font-semibold tracking-wide ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-400'}`}>
                            {isUrgent ? 'URGENT: ' : isWarning ? 'LATE: ' : ''}#{order.id.slice(0, 6)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-2xl tabular-nums ${isUrgent ? 'text-red-600' : 'text-slate-900'}`}>
                            <ElapsedTimer createdAt={order.createdAt} status={order.status} />
                          </p>
                          <p className="text-xs text-slate-400 uppercase">Elapsed</p>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="p-4 flex-1 space-y-3">
                        <ul className="space-y-2">
                          {order.items.map(item => (
                            <li key={item.id} className="flex gap-3 items-start">
                              <span className="bg-slate-900 text-white w-7 h-7 flex items-center justify-center font-bold rounded-lg text-sm flex-shrink-0">
                                {item.quantity}
                              </span>
                              <div>
                                <span className="font-semibold text-slate-800">{item.name}</span>
                                {item.variantName && (
                                  <span className="ml-1.5 text-xs text-slate-400">({item.variantName})</span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {order.specialInstructions && (
                          <div className="bg-amber-50 p-3 rounded-lg border-l-4 border-amber-400">
                            <p className="text-xs text-amber-700 uppercase mb-1 font-bold">Special Instructions</p>
                            <p className="text-sm text-amber-900 font-bold italic">&quot;{order.specialInstructions}&quot;</p>
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      <div className="p-3 bg-slate-50 border-t border-slate-100">
                        {order.status === 'new' && (
                          <button
                            onClick={() => advance(order)}
                            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg uppercase tracking-wider text-sm active:scale-95 transition-all"
                          >
                            Start Cooking
                          </button>
                        )}
                        {order.status === 'in-progress' && (
                          <button
                            onClick={() => advance(order)}
                            className="w-full py-3.5 bg-primary hover:bg-orange-800 text-white font-bold rounded-lg uppercase tracking-wider text-sm active:scale-95 transition-all"
                          >
                            Mark Ready
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <div className="space-y-2">
                            <button
                              onClick={() => advance(order)}
                              className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg uppercase tracking-wider text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined text-sm">check_circle</span>
                              Food Delivered ✓
                            </button>
                            <p className="text-center text-[10px] text-slate-400 font-medium">
                              Table stays occupied — customer still needs to pay
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Order History ──────────────────────────────────────────────────── */}
        {view === 'history' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">Order History</h2>

            {/*
              Scroll container — isolated from the page:
                • overflow-y-scroll   : always-visible scrollbar (no layout jump)
                • overscroll-behavior-contain : stops scroll chaining to the page
                • min-h-0             : required inside a flex parent so the child
                                        can shrink below content height
                • max-h              : fixed ceiling so this panel never pushes
                                        the rest of the page down
            */}
            <div className="overflow-y-scroll overscroll-contain max-h-[calc(100vh-280px)] min-h-0 space-y-3 pr-1">

              {/* Initial loading state (first page, no orders yet) */}
              {historyOrders.length === 0 && isLoadingHistory && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-3 animate-spin">progress_activity</span>
                  <p className="text-sm font-medium">Loading order history…</p>
                </div>
              )}

              {/* Empty state (loaded, nothing there) */}
              {historyOrders.length === 0 && !isLoadingHistory && (
                <div className="text-center py-16 text-slate-400">
                  <span className="material-symbols-outlined text-5xl mb-3 block">history</span>
                  <p>No served orders yet.</p>
                </div>
              )}

              {/* Order cards — exact same UI as before */}
              {historyOrders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-bold text-slate-900">Table {order.tableNumber} — #{order.id.slice(0, 6)}</p>
                    <p className="text-sm text-slate-500">{order.items.length} items · ₱{order.total.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase block mb-1">
                      Food Delivered
                    </span>
                    <span className="text-[10px] text-slate-400">Awaiting payment</span>
                  </div>
                </div>
              ))}

              {/*
                Sentinel — IntersectionObserver fires here.
                ref callback attaches the observer the instant this element mounts.
              */}
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
            <span className="material-symbols-outlined">{v === 'live' ? 'monitor_heart' : 'history'}</span>
            <span className="capitalize">{v === 'live' ? 'Live Feed' : 'History'}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
