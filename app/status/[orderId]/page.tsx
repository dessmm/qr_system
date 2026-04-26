'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { listenToOrder, Order, OrderStatus } from '@/lib/data'

const STATUS_STEPS: { key: OrderStatus; label: string; icon: string; desc: string }[] = [
  { key: 'new', label: 'Order Received', icon: 'check_circle', desc: 'Your order has been sent to the kitchen.' },
  { key: 'in-progress', label: 'Preparing', icon: 'local_fire_department', desc: 'The kitchen is working on your meal.' },
  { key: 'ready', label: 'Ready!', icon: 'restaurant', desc: 'Your order is ready to be served.' },
  { key: 'served', label: 'Served', icon: 'done_all', desc: 'Enjoy your meal! 🎉' },
]

function getStepIndex(status: OrderStatus) {
  return STATUS_STEPS.findIndex(s => s.key === status)
}

export default function StatusPage() {
  const params = useParams()
  const orderId = params.orderId as string
  const [order, setOrder] = useState<Order | null>(null)
  const [waiterCalled, setWaiterCalled] = useState(false) // BUG-23: Track call state

  useEffect(() => {
    if (!orderId) return
    return listenToOrder(orderId, setOrder)
  }, [orderId])

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl animate-spin block mb-3 text-primary">progress_activity</span>
          <p>Loading order...</p>
        </div>
      </div>
    )
  }

  const currentStep = getStepIndex(order.status)

  return (
    <div className="bg-background min-h-screen pb-32">
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-100 shadow-sm flex items-center px-4 h-16 gap-4">
        <Link href={`/menu/${order.tableNumber}`} className="p-2 hover:bg-zinc-50 rounded-full active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </Link>
        <h1 className="font-bold text-lg text-primary">Order Status</h1>
        <div className="ml-auto flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-label-sm text-slate-600 uppercase">Live</span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-6 space-y-6 animate-fade-in">
        {/* Order info */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-label-sm text-outline uppercase tracking-widest mb-1">Table {order.tableNumber}</p>
              <h2 className="text-headline-md font-bold">Order #{order.id}</h2>
            </div>
            <span className={`px-3 py-1 rounded-full text-label-sm font-bold uppercase ${
              order.status === 'ready' ? 'bg-green-100 text-green-700' :
              order.status === 'in-progress' ? 'bg-orange-100 text-primary' :
              order.status === 'served' ? 'bg-secondary-container text-on-secondary-container' :
              'bg-surface-container text-on-surface-variant'
            }`}>
              {STATUS_STEPS[currentStep]?.label || order.status}
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant">{STATUS_STEPS[currentStep]?.desc}</p>
        </div>

        {/* Progress stepper */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="space-y-0">
            {STATUS_STEPS.map((step, idx) => {
              const done = idx <= currentStep
              const active = idx === currentStep
              return (
                <div key={step.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      done ? 'bg-primary text-on-primary shadow-lg shadow-primary/30' : 'bg-surface-container text-on-surface-variant'
                    } ${active ? 'ring-4 ring-primary/20' : ''}`}>
                      <span className={`${done ? 'material-symbols-filled' : 'material-symbols-outlined'} text-xl`}>{step.icon}</span>
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (<div className={`w-0.5 h-10 mt-1 transition-colors ${done ? 'bg-primary' : 'bg-outline-variant'}`} />)}
                  </div>
                  <div className="pt-2 pb-8">
                    <p className={`font-bold ${done ? 'text-on-surface' : 'text-on-surface-variant'}`}>{step.label}</p>
                    {active && <p className="text-body-md text-primary text-sm">{step.desc}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-5">
          <h3 className="font-bold text-on-surface mb-4">Your Items</h3>
          <div className="space-y-3">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover" />
                <div className="flex-1">
                  <p className="font-semibold text-on-surface">{item.quantity}x {item.name}</p>
                  <p className="text-primary font-bold text-sm">₱{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              </div>
            ))}
            <div className="pt-3 border-t border-dashed border-zinc-200 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">₱{order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* BUG-23: Call waiter button with feedback instead of being a no-op */}
        <button
          onClick={() => { setWaiterCalled(true); setTimeout(() => setWaiterCalled(false), 3000) }}
          disabled={waiterCalled}
          className={`w-full flex items-center justify-center gap-2 border-2 py-4 rounded-2xl font-bold active:scale-95 transition-all ${
            waiterCalled
              ? 'border-green-500 text-green-700 bg-green-50 cursor-default'
              : 'border-outline-variant text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-primary">{waiterCalled ? 'check_circle' : 'notifications'}</span>
          {waiterCalled ? 'Waiter has been notified!' : 'Call Waiter'}
        </button>
      </main>

      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-white/80 backdrop-blur-md rounded-t-2xl border-t border-zinc-100">
        <Link href={`/menu/${order.tableNumber}`} className="flex flex-col items-center text-slate-400 text-[11px] font-semibold active:scale-90 transition-all">
          <span className="material-symbols-outlined">restaurant_menu</span><span>Menu</span>
        </Link>
        <Link href={`/confirmation/${order.id}`} className="flex flex-col items-center text-slate-400 text-[11px] font-semibold active:scale-90 transition-all">
          <span className="material-symbols-outlined">receipt_long</span><span>Receipt</span>
        </Link>
        <div className="flex flex-col items-center text-primary bg-orange-50 rounded-xl px-4 py-1 text-[11px] font-semibold">
          <span className="material-symbols-outlined">delivery_dining</span><span>Status</span>
        </div>
      </nav>
    </div>
  )
}
