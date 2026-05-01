'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  listenToOrders,
  listenToSettings,
  listenToTables,
  updateOrderStatus,
  markOrderServed,
  Order,
  OrderStatus,
  AppSettings,
  DEFAULT_SETTINGS,
  Table,
  TableStatus,
} from '@/lib/data'

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

// ─── Global tick (single interval for all timers) ────────────────────────────
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function elapsed(createdAt: number, now: number): string {
  const secs = Math.floor((now - createdAt) / 1000)
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── Undo Toast ───────────────────────────────────────────────────────────────
type ToastItem = { id: string; message: string; onUndo: () => void }

function UndoToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [progress, setProgress] = useState(100)
  useEffect(() => {
    const start = Date.now()
    const duration = 4000
    const tick = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / duration) * 100)
      setProgress(pct)
      if (pct === 0) { clearInterval(tick); onDismiss(toast.id) }
    }, 50)
    return () => clearInterval(tick)
  }, [toast.id, onDismiss])

  return (
    <div className="flex items-center gap-3 bg-slate-900 text-white rounded-xl px-4 py-3 shadow-xl min-w-[280px] overflow-hidden relative">
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-orange-400 transition-none"
        style={{ width: `${progress}%` }}
      />
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        onClick={() => { toast.onUndo(); onDismiss(toast.id) }}
        className="text-orange-400 font-bold text-sm hover:text-orange-300 transition-colors"
      >
        Undo
      </button>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-400 hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  )
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col gap-2 items-end">
      {toasts.map(t => <UndoToast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  )
}

// ─── Hold-to-confirm button (improved for mobile) ───────────────────────────────────────────────────
function HoldToConfirm({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)
  const holdDuration = 1200

  const startHold = useCallback(() => {
    setHolding(true)
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startRef.current) / holdDuration) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(timerRef.current!)
        setHolding(false)
        setProgress(0)
        onConfirm()
      }
    }, 30)
  }, [onConfirm])

  const cancelHold = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setHolding(false)
    setProgress(0)
  }, [])

  // Add haptic feedback for mobile
  useEffect(() => {
    if (holding && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }
  }, [holding])

  return (
    <div className="space-y-2">
      <button
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={(e) => { e.preventDefault(); startHold() }}
        onTouchEnd={(e) => { e.preventDefault(); cancelHold() }}
        onTouchCancel={cancelHold}
        className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg uppercase tracking-wider text-sm transition-all relative overflow-hidden select-none active:scale-[0.98]"
        style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        aria-label={`Hold to confirm: ${label}`}
      >
        {/* Fill bar */}
        <div
          className="absolute inset-0 bg-green-400 origin-left transition-none"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
        <span className="relative flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-sm">
            {holding ? 'radio_button_checked' : 'check_circle'}
          </span>
          {holding ? `Hold to confirm… (${Math.round(progress)}%)` : `${label} — Hold to confirm`}
        </span>
      </button>
      <p className="text-center text-[10px] text-slate-400 font-medium">
        Table stays occupied — customer still needs to pay
      </p>
    </div>
  )
}

// ─── Connection status banner ─────────────────────────────────────────────────
function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-red-600 text-white text-sm font-semibold text-center py-2 flex items-center justify-center gap-2">
      <span className="material-symbols-outlined text-base">wifi_off</span>
      Connection lost — orders may be out of date. Reconnecting…
    </div>
  )
}

// ─── Live clock ───────────────────────────────────────────────────────────────
function LiveClock({ now }: { now: number }) {
  const d = new Date(now)
  return (
    <div className="text-right">
      <p className="text-primary leading-none text-2xl font-black">
        {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-sm text-slate-400">
        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

type KitchenView = 'live' | 'history' | 'tables'

export default function KitchenPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [view, setView]         = useState<KitchenView>('live')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [toasts, setToasts]     = useState<ToastItem[]>([])
  const [offline, setOffline]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'time' | 'table' | 'urgent'>('time')
  const [tables, setTables] = useState<Table[]>([])

  // Single global tick — shared by all timers and urgent checks
  const now = useNow(1000)

  // Track previous order count to detect new arrivals
  const prevCountRef = useRef(0)

  // ── Sound cue for new orders ───────────────────────────────────────────────
  const playNewOrderSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch (_) { /* audio unavailable */ }
  }, [])

  useEffect(() => {
    let unsubOrders: (() => void) | undefined
    let unsubSettings: (() => void) | undefined
    let unsubTables: (() => void) | undefined
    try {
      unsubOrders = listenToOrders((incoming) => {
        setOffline(false)
        // Detect truly new orders (new status, not seen before)
        const newCount = incoming.filter(o => o.status === 'new').length
        if (newCount > prevCountRef.current) playNewOrderSound()
        prevCountRef.current = newCount
        setOrders(incoming)
      })
      unsubSettings = listenToSettings(setSettings)
      unsubTables = listenToTables(setTables)
    } catch (err) {
      console.error('Listener error:', err)
      setOffline(true)
    }

    // Browser online/offline events as a fallback signal
    const handleOffline = () => setOffline(true)
    const handleOnline  = () => setOffline(false)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.key.toLowerCase()) {
        case 'b':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setBulkActionMode(prev => !prev)
          }
          break
        case 'escape':
          if (bulkActionMode) {
            clearSelection()
          }
          break
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            // Focus search input
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
            searchInput?.focus()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      unsubOrders?.()
      unsubSettings?.()
      unsubTables?.()
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [playNewOrderSound])

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, onUndo: () => void) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, onUndo }])
  }, [])

  // ── Order advancement with undo ────────────────────────────────────────────
  const advance = useCallback(async (order: Order) => {
    const next: Record<OrderStatus, OrderStatus> = {
      'new':         'in-progress',
      'in-progress': 'ready',
      'ready':       'served',
      'served':      'served',
    }
    const nextStatus = next[order.status]
    const prevStatus = order.status

    const statusLabels: Record<OrderStatus, string> = {
      'new':         'New',
      'in-progress': 'In Progress',
      'ready':       'Ready',
      'served':      'Served',
    }

    // Optimistic update
    if (nextStatus === 'served') {
      await markOrderServed(order.id)
    } else {
      await updateOrderStatus(order.id, nextStatus)
    }

    // Show undo toast (except served→served which is a no-op)
    if (nextStatus !== prevStatus) {
      addToast(
        `Table ${order.tableNumber} → ${statusLabels[nextStatus]}`,
        async () => {
          // Revert
          await updateOrderStatus(order.id, prevStatus)
        }
      )
    }
  }, [addToast])

  const liveOrders = useMemo(() => {
    let filtered = orders.filter(o => o.status !== 'served')
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(order => 
        order.id.toLowerCase().includes(query) ||
        order.tableNumber.toString().includes(query) ||
        order.items.some(item => item.name.toLowerCase().includes(query))
      )
    }
    
    // Apply status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(order => order.status === selectedStatus)
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'urgent') {
        const aUrgent = now - a.createdAt > 15 * 60 * 1000
        const bUrgent = now - b.createdAt > 15 * 60 * 1000
        if (aUrgent && !bUrgent) return -1
        if (!aUrgent && bUrgent) return 1
      }
      if (sortBy === 'table') {
        return a.tableNumber - b.tableNumber
      }
      // Default: time (oldest first)
      return a.createdAt - b.createdAt
    })
    
    return filtered
  }, [orders, searchQuery, selectedStatus, sortBy, now])

  const historyOrders = useMemo(() => {
    let filtered = orders.filter(o => o.status === 'served')
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(order => 
        order.id.toLowerCase().includes(query) ||
        order.tableNumber.toString().includes(query) ||
        order.items.some(item => item.name.toLowerCase().includes(query))
      )
    }
    
    return filtered.sort((a, b) => b.createdAt - a.createdAt)
  }, [orders, searchQuery])

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkActionMode, setBulkActionMode] = useState(false)

  const toggleOrderSelection = useCallback((orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedOrders(new Set())
    setBulkActionMode(false)
  }, [])

  const bulkAdvance = useCallback(async (targetStatus: OrderStatus) => {
    const selectedOrderObjects = liveOrders.filter(order => selectedOrders.has(order.id))
    if (selectedOrderObjects.length === 0) return

    const statusLabels: Record<OrderStatus, string> = {
      'new': 'New',
      'in-progress': 'In Progress', 
      'ready': 'Ready',
      'served': 'Served',
    }

    // Optimistic updates
    const updates = selectedOrderObjects.map(async (order) => {
      if (targetStatus === 'served') {
        await markOrderServed(order.id)
      } else {
        await updateOrderStatus(order.id, targetStatus)
      }
    })

    await Promise.all(updates)

    addToast(
      `${selectedOrderObjects.length} orders → ${statusLabels[targetStatus]}`,
      async () => {
        // Bulk revert
        const reverts = selectedOrderObjects.map(order => 
          updateOrderStatus(order.id, order.status)
        )
        await Promise.all(reverts)
      }
    )

    clearSelection()
  }, [liveOrders, selectedOrders, addToast, clearSelection])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.key.toLowerCase()) {
        case 'b':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setBulkActionMode(prev => !prev)
          }
          break
        case 'escape':
          if (bulkActionMode) {
            clearSelection()
          }
          break
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            // Focus search input
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
            searchInput?.focus()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bulkActionMode, clearSelection])

  // Compute avg prep time from history
  const avgPrepTime = (() => {
    const served = historyOrders.filter(o => o.status === 'served')
    if (served.length === 0) return '—'
    const avg = served.reduce((sum, o) => sum + (o.updatedAt - o.createdAt), 0) / served.length
    return `${Math.round(avg / 60000)}m`
  })()

  const activeCount = liveOrders.length
  const pendingItems = liveOrders.reduce((sum, order) => sum + order.items.length, 0)

  return (
    <div className="bg-background min-h-screen font-sans">
      <OfflineBanner show={offline} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
            { key: 'tables',  icon: 'table_restaurant', label: 'Table Status' },
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
              {settings.stationName?.slice(0, 2).toUpperCase() ?? 'KD'}
            </div>
            <div>
              <p className="font-bold text-slate-900">{settings.stationName ?? 'Kitchen'}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Active Station</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="md:ml-64 sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3 flex justify-between items-center z-30">
        <div className="flex items-center gap-4">
          <h2 className="text-primary font-extrabold tracking-tight text-xl">{settings.restaurantName}</h2>
          <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
            <div className={`w-2 h-2 rounded-full ${offline ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
            <span className="text-sm text-slate-600 uppercase tracking-wide">{offline ? 'Offline' : 'Live'}</span>
          </div>
        </div>
        <LiveClock now={now} />
      </header>

      <main className="md:ml-64 p-4 md:p-8">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders, tables, or items..."
                className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-slate-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OrderStatus | 'all')}
              className="px-4 py-3 bg-white rounded-xl border border-slate-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Statuses</option>
              <option value="new">New Orders</option>
              <option value="in-progress">In Progress</option>
              <option value="ready">Ready</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'time' | 'table' | 'urgent')}
              className="px-4 py-3 bg-white rounded-xl border border-slate-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="time">Sort by Time</option>
              <option value="table">Sort by Table</option>
              <option value="urgent">Urgent First</option>
            </select>

            {/* Bulk Actions Toggle */}
            <button
              onClick={() => setBulkActionMode(!bulkActionMode)}
              className={`px-4 py-3 rounded-xl font-medium transition-all ${
                bulkActionMode 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Toggle bulk actions mode (Ctrl+B)"
            >
              {bulkActionMode ? 'Exit Bulk Mode' : 'Bulk Actions'}
            </button>
          </div>

          {/* Bulk Actions */}
          {bulkActionMode && selectedOrders.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600">checklist</span>
                  <span className="font-semibold text-blue-900">
                    {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  onClick={clearSelection}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex gap-3">
                <HoldToConfirm
                  onConfirm={() => bulkAdvance('in-progress')}
                  label="Start Cooking"
                />
                <HoldToConfirm
                  onConfirm={() => bulkAdvance('ready')}
                  label="Mark Ready"
                />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Tickets', value: activeCount,  color: 'text-slate-900' },
            { label: 'Avg. Prep Time', value: avgPrepTime,  color: 'text-primary' },
            { label: 'Items Pending',  value: pendingItems, color: 'text-slate-900' },
            { label: 'Station Status', value: offline ? 'Offline' : 'Optimal', color: offline ? 'text-red-700' : 'text-green-700', badge: true, badgeClass: offline ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700' },
          ].map(stat => (
            <div key={stat.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <p className="text-xs text-slate-400 uppercase mb-1 tracking-wide">{stat.label}</p>
              {stat.badge
                ? <span className={`px-2 py-1 text-xs rounded uppercase font-bold ${stat.badgeClass}`}>{stat.value}</span>
                : <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              }
            </div>
          ))}
        </div>

        {/* Live Feed */}
        {view === 'live' && (
          <>
            <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-blue-500 mt-0.5 flex-shrink-0">info</span>
              <p className="text-xs text-blue-700 font-medium leading-relaxed">
                <strong>Kitchen workflow:</strong> Mark orders In Progress → Ready → Served as you cook and deliver.
                &ldquo;Served&rdquo; means food reached the table — the table stays <strong>Occupied</strong> until the customer pays at checkout.
                Tap any action button, then use the <strong>Undo</strong> toast if you mis-tapped.
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
                  const isUrgent = now - order.createdAt > 15 * 60 * 1000
                  const isSelected = selectedOrders.has(order.id)
                  return (
                    <div
                      key={order.id}
                      className={`flex flex-col bg-white rounded-xl border-2 ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 
                        isUrgent ? 'border-red-500' : STATUS_COLORS[order.status]
                      } overflow-hidden shadow-sm transition-all ${isUrgent ? 'shadow-red-100' : ''} cursor-pointer`}
                      onClick={() => bulkActionMode && toggleOrderSelection(order.id)}
                    >
                      {/* Status bar */}
                      <div className={`h-1.5 w-full ${
                        order.status === 'new'         ? 'bg-slate-200' :
                        order.status === 'in-progress' ? 'bg-orange-400' : 'bg-green-500'
                      } ${isUrgent ? 'bg-red-500 animate-pulse' : ''}`} />

                      {/* Header */}
                      <div className={`p-4 border-b border-slate-100 flex justify-between items-start ${STATUS_HEADER[order.status]} ${isUrgent ? 'bg-red-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          {bulkActionMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOrderSelection(order.id)}
                              className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <div>
                            <p className="text-xl font-bold text-slate-900">Table {order.tableNumber}</p>
                            <p className={`text-xs uppercase font-semibold tracking-wide ${isUrgent ? 'text-red-600' : 'text-slate-400'}`}>
                              {isUrgent ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-xs">warning</span>
                                  Urgent ·
                                </span>
                              ) : ''}
                              #{order.id.slice(0, 6)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {/* aria-hidden so screen readers don't announce every second */}
                          <p
                            className={`font-black text-2xl tabular-nums ${isUrgent ? 'text-red-600' : 'text-slate-900'}`}
                            aria-hidden="true"
                          >
                            {order.status === 'served' ? elapsed(order.createdAt, order.createdAt) : elapsed(order.createdAt, now)}
                          </p>
                          <p className="text-xs text-slate-400 uppercase">Elapsed</p>
                          {/* Screen-reader-friendly static label */}
                          <span className="sr-only">
                            Order placed {new Date(order.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="p-4 flex-1 space-y-3">
                        <ul className="space-y-2">
                          {order.items.map(item => (
                            <li key={item.id} className="flex gap-3 items-start">
                              <span className={`w-8 h-8 flex items-center justify-center font-bold rounded-lg text-sm flex-shrink-0 ${
                                item.quantity >= 3
                                  ? 'bg-orange-500 text-white'
                                  : item.quantity === 2
                                  ? 'bg-amber-400 text-amber-900'
                                  : 'bg-slate-900 text-white'
                              }`}>
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
                            aria-label={`Start cooking — Table ${order.tableNumber}, order #${order.id.slice(0, 6)}`}
                            className={`w-full py-3.5 text-white font-bold rounded-lg uppercase tracking-wider text-sm active:scale-95 transition-all ${
                              isUrgent
                                ? 'bg-red-500 hover:bg-red-600 ring-2 ring-red-300 ring-offset-1 animate-pulse'
                                : 'bg-orange-500 hover:bg-orange-600'
                            }`}
                          >
                            {isUrgent ? '⚠ Start Cooking — Urgent' : 'Start Cooking'}
                          </button>
                        )}
                        {order.status === 'in-progress' && (
                          <button
                            onClick={() => advance(order)}
                            aria-label={`Mark ready — Table ${order.tableNumber}, order #${order.id.slice(0, 6)}`}
                            className={`w-full py-3.5 text-white font-bold rounded-lg uppercase tracking-wider text-sm active:scale-95 transition-all ${
                              isUrgent
                                ? 'bg-red-500 hover:bg-red-600 ring-2 ring-red-300 ring-offset-1'
                                : 'bg-primary hover:bg-orange-800'
                            }`}
                          >
                            {isUrgent ? '⚠ Mark Ready — Urgent' : 'Mark Ready'}
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <HoldToConfirm
                            onConfirm={() => advance(order)}
                            label="Food Delivered"
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* History */}
        {view === 'history' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">Order History</h2>
            {historyOrders.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-3 block">history</span>
                <p>No served orders yet.</p>
              </div>
            ) : (
              historyOrders.map(order => (
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
              ))
            )}
          </div>
        )}

        {/* Tables */}
        {view === 'tables' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Table Status</h2>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                  <span className="text-slate-600">Available ({tables.filter(t => t.status === 'available').length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-slate-600">Occupied ({tables.filter(t => t.status === 'occupied').length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-slate-600">Reserved ({tables.filter(t => t.status === 'reserved').length})</span>
                </div>
              </div>
            </div>

            {tables.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-3 block">table_restaurant</span>
                <p>No tables configured yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {tables.map(table => (
                  <div key={table.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-slate-900">Table {table.tableNumber}</h3>
                        <p className="text-xs text-slate-500">{table.name}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                        table.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                        table.status === 'occupied' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {table.status.toUpperCase()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">group</span>
                        <span>{table.capacity}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">{table.shape === 'round' ? 'circle' : 'square'}</span>
                        <span className="capitalize">{table.shape ?? 'square'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 flex justify-around items-center px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
        {(['live', 'history', 'tables'] as KitchenView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex flex-col items-center text-[11px] font-semibold transition-all active:scale-90 ${
              view === v ? 'text-primary bg-orange-50 rounded-xl px-3 py-1' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined">{
              v === 'live' ? 'monitor_heart' : 
              v === 'history' ? 'history' : 
              'table_restaurant'
            }</span>
            <span className="capitalize">{
              v === 'live' ? 'Live Feed' : 
              v === 'history' ? 'History' : 
              'Tables'
            }</span>
          </button>
        ))}
      </nav>
    </div>
  )
}