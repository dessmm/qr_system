'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { listenToOrders, listenToSettings, updateOrderStatus, Order, OrderStatus, AppSettings, DEFAULT_SETTINGS } from '@/lib/data'

const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'border-slate-200',
  'in-progress': 'border-primary-container',
  ready: 'border-green-500',
  served: 'border-slate-200 opacity-60',
}

const STATUS_HEADER: Record<OrderStatus, string> = {
  new: 'bg-slate-50',
  'in-progress': 'bg-orange-50',
  ready: 'bg-green-50',
  served: 'bg-slate-50',
}

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

// BUG-11: LiveClock component — updates every second instead of rendering once
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right">
      <p className="text-kitchen-timer text-primary leading-none text-2xl font-black">
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-label-sm text-slate-400">
        {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

type KitchenView = 'live' | 'history'

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [view, setView] = useState<KitchenView>('live')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const unsubOrders = listenToOrders(setOrders)
    const unsubSettings = listenToSettings(setSettings)
    return () => { unsubOrders(); unsubSettings() }
  }, [])

  const liveOrders = orders.filter(o => o.status !== 'served').sort((a, b) => a.createdAt - b.createdAt)
  const historyOrders = orders.filter(o => o.status === 'served').sort((a, b) => b.createdAt - a.createdAt)

  const advance = async (order: Order) => {
    const map: Record<OrderStatus, OrderStatus> = { new: 'in-progress', 'in-progress': 'ready', ready: 'served', served: 'served' }
    await updateOrderStatus(order.id, map[order.status])
  }

  const activeCount = liveOrders.length
  const pendingItems = liveOrders.reduce((acc, o) => acc + o.items.reduce((s, i) => s + i.quantity, 0), 0)

  return (
    <div className="bg-background min-h-screen font-sans">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 bg-slate-50 border-r-2 border-slate-200 flex-col py-6 gap-2 z-40">
        <div className="px-6 mb-8">
          <h1 className="text-lg font-black text-slate-900">Kitchen KDS</h1>
          <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Station: Main Line</p>
        </div>
        <nav className="flex-1 space-y-1">
          {([
            { key: 'live', icon: 'monitor_heart', label: 'Live Feed' },
            { key: 'history', icon: 'history', label: 'Order History' },
          ] as { key: KitchenView; icon: string; label: string }[]).map(item => (
            <button key={item.key} onClick={() => setView(item.key)} className={`flex items-center gap-3 w-full px-6 py-3 text-sm font-medium transition-all duration-200 ${view === item.key ? 'bg-white text-primary border-r-4 border-primary shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:pl-8'}`}>
              <span className="material-symbols-outlined">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-6 mt-auto">
          <div className="flex items-center gap-3 p-3 bg-slate-200/50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">CM</div>
            <div><p className="text-label-lg text-slate-900">Chef Marco</p><p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Head Chef</p></div>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="md:ml-64 sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3 flex justify-between items-center z-30">
        <div className="flex items-center gap-4">
          <h2 className="text-primary font-extrabold tracking-tight text-xl">{settings.restaurantName}</h2>
          <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-label-sm text-slate-600 uppercase">Live Connection</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* BUG-11: Replaced static Date() calls with LiveClock component */}
          <LiveClock />
        </div>
      </header>

      <main className="md:ml-64 p-4 md:p-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Tickets', value: activeCount, color: 'text-slate-900' },
            { label: 'Avg. Prep Time', value: '12m', color: 'text-primary' },
            { label: 'Items Pending', value: pendingItems, color: 'text-slate-900' },
            { label: 'Station Status', value: 'Optimal', color: 'text-green-700', badge: true },
          ].map(stat => (
            <div key={stat.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <p className="text-label-sm text-slate-400 uppercase mb-1">{stat.label}</p>
              {stat.badge ? (<span className="px-2 py-1 bg-green-100 text-green-700 text-label-sm rounded uppercase">{stat.value}</span>) : (<p className={`text-headline-lg font-bold ${stat.color}`}>{stat.value}</p>)}
            </div>
          ))}
        </div>

        {/* Live Feed */}
        {view === 'live' && (
          <div>
            {liveOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant">
                <span className="material-symbols-outlined text-6xl mb-4 text-outline">restaurant</span>
                <h3 className="text-headline-md font-bold text-on-surface mb-2">All caught up!</h3>
                <p className="text-body-md">No active orders right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {liveOrders.map(order => {
                  const isUrgent = Date.now() - order.createdAt > 15 * 60 * 1000
                  return (
                    <div key={order.id} className={`flex flex-col bg-white rounded-lg border-2 ${isUrgent ? 'border-error' : STATUS_COLORS[order.status]} overflow-hidden shadow-sm relative transition-all`}>
                      <div className={`h-2 w-full ${order.status === 'new' ? 'bg-slate-100' : order.status === 'in-progress' ? 'bg-primary-container' : 'bg-green-500'} ${isUrgent ? 'bg-error animate-pulse' : ''}`} />
                      <div className={`p-4 border-b border-slate-100 flex justify-between items-start ${STATUS_HEADER[order.status]} ${isUrgent ? 'bg-error-container/20' : ''}`}>
                        <div>
                          <p className="text-headline-md text-slate-900 font-bold">Table {order.tableNumber}</p>
                          <p className={`text-label-sm uppercase ${isUrgent ? 'text-error' : 'text-slate-500'}`}>{isUrgent ? 'Urgent • ' : ''}Order #{order.id}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-kitchen-timer font-black text-2xl ${isUrgent ? 'text-error animate-timer' : 'text-slate-900'}`}><ElapsedTimer createdAt={order.createdAt} status={order.status} /></p>
                          <p className="text-label-sm text-slate-500 uppercase">Elapsed</p>
                        </div>
                      </div>
                      <div className="p-4 flex-1 space-y-3">
                        <ul className="space-y-2">
                          {order.items.map(item => (
                            <li key={item.id} className="flex gap-3 items-start">
                              <span className="bg-slate-900 text-white w-7 h-7 flex items-center justify-center font-bold rounded-lg text-sm flex-shrink-0">{item.quantity}</span>
                              <span className="font-semibold text-slate-800">{item.name}</span>
                            </li>
                          ))}
                        </ul>
                        {order.specialInstructions && (
                          <div className="bg-tertiary-fixed p-3 rounded-lg border-l-4 border-tertiary">
                            <p className="text-label-sm text-on-tertiary-fixed uppercase mb-1">Special Instructions</p>
                            <p className="text-body-md text-on-tertiary-fixed font-bold italic">&quot;{order.specialInstructions}&quot;</p>
                          </div>
                        )}
                      </div>
                      <div className="p-2 bg-slate-50 flex flex-col gap-2 border-t border-slate-100">
                        {order.status !== 'ready' ? (
                          <button onClick={() => advance(order)} className="w-full py-4 bg-primary text-white font-bold rounded-lg uppercase tracking-wider text-label-lg active:scale-95 transition-transform">{order.status === 'new' ? 'Mark In Progress' : 'Mark Ready'}</button>
                        ) : (
                          <button onClick={() => advance(order)} className="w-full py-4 bg-green-600 text-white font-bold rounded-lg uppercase tracking-wider text-label-lg active:scale-95 transition-transform">Mark Served ✓</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* History */}
        {view === 'history' && (
          <div className="space-y-4">
            <h2 className="text-headline-md font-bold text-on-surface">Order History</h2>
            {historyOrders.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant"><span className="material-symbols-outlined text-5xl mb-3 block text-outline">history</span><p>No served orders yet.</p></div>
            ) : (
              historyOrders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-bold text-on-surface">Table {order.tableNumber} — Order #{order.id}</p>
                    <p className="text-body-md text-on-surface-variant">{order.items.length} items • ₱{order.total.toFixed(2)}</p>
                    <p className="text-label-sm text-slate-400">{new Date(order.createdAt).toLocaleTimeString()}</p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-label-sm font-bold rounded-full uppercase">Served</span>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 flex justify-around items-center px-4 py-3 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
        {(['live', 'history'] as KitchenView[]).map(v => (
          <button key={v} onClick={() => setView(v)} className={`flex flex-col items-center text-[11px] font-semibold transition-all active:scale-90 ${view === v ? 'text-primary bg-orange-50 rounded-xl px-3 py-1' : 'text-slate-400'}`}>
            <span className="material-symbols-outlined">{v === 'live' ? 'monitor_heart' : 'history'}</span>
            <span className="capitalize">{v === 'live' ? 'Live Feed' : 'History'}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
