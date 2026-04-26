'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { listenToOrder, Order } from '@/lib/data'

export default function ConfirmationPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    if (!orderId) return
    return listenToOrder(orderId, setOrder)
  }, [orderId])

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-on-surface-variant">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-100 shadow-sm flex justify-between items-center w-full px-4 h-16">
        <button onClick={() => router.push(`/menu/${order.tableNumber}`)} className="p-2 active:scale-95 transition-transform text-primary hover:bg-zinc-50 rounded-full">
          <span className="material-symbols-outlined">close</span>
        </button>
        <h1 className="font-bold text-lg text-primary">Order Confirmed</h1>
        <div className="w-10" />
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8 space-y-6 animate-fade-in">
        {/* Success hero */}
        <section className="flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/10 rounded-full scale-150 blur-3xl" />
            <div className="relative w-24 h-24 bg-primary text-white rounded-full flex items-center justify-center shadow-xl shadow-primary/20">
              <span className="material-symbols-filled text-5xl">check_circle</span>
            </div>
          </div>
          <h2 className="text-headline-lg text-on-background mb-2">Order Placed Successfully!</h2>
          <p className="text-body-lg text-on-surface-variant">
            Your delicious meal is being prepared at Table {order.tableNumber}.
          </p>
        </section>

        {/* Order meta */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center">
            <span className="text-label-sm text-outline uppercase tracking-widest mb-1">Order Number</span>
            <span className="text-headline-md text-primary font-bold">#{order.id}</span>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center">
            <span className="text-label-sm text-outline uppercase tracking-widest mb-1">Est. Time</span>
            <span className="text-headline-md text-primary font-bold">15-20 min</span>
          </div>
        </section>

        {/* Order summary */}
        <section className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
          <div className="p-5 border-b border-zinc-50 flex justify-between items-center">
            <h3 className="text-headline-md font-bold">Order Summary</h3>
            <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-label-sm font-bold">
              {order.items.length} Item{order.items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center gap-4">
                <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-grow">
                  <div className="flex justify-between">
                    <span className="font-semibold text-on-surface">{item.quantity}x {item.name}</span>
                    <span className="text-outline font-medium">₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
            {order.specialInstructions && (
              <div className="bg-tertiary-fixed p-3 rounded-xl border-l-4 border-tertiary mt-2">
                <p className="text-label-sm text-on-tertiary-fixed uppercase mb-1">Special Instructions</p>
                <p className="text-body-md text-on-tertiary-fixed font-medium italic">&quot;{order.specialInstructions}&quot;</p>
              </div>
            )}
            <div className="pt-4 border-t border-dashed border-zinc-200">
              <div className="flex justify-between items-center">
                <span className="text-headline-md font-bold">Total</span>
                <span className="text-headline-md text-primary font-bold">₱{order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="space-y-3">
          <Link
            href={`/status/${order.id}`}
            className="w-full bg-primary text-white py-4 rounded-full font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined">delivery_dining</span>
            Track My Order
          </Link>
          <Link
            href={`/menu/${order.tableNumber}`}
            className="w-full bg-surface-container-high text-on-surface py-4 rounded-full font-bold text-lg flex items-center justify-center active:scale-95 transition-all"
          >
            Order More
          </Link>
        </section>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-white/80 backdrop-blur-md rounded-t-2xl border-t border-zinc-100 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <Link href={`/menu/${order.tableNumber}`} className="flex flex-col items-center text-slate-400 hover:text-primary text-[11px] font-semibold active:scale-90 transition-all">
          <span className="material-symbols-outlined">restaurant_menu</span>
          <span>Menu</span>
        </Link>
        <div className="flex flex-col items-center text-primary bg-orange-50 rounded-xl px-4 py-1 text-[11px] font-semibold">
          <span className="material-symbols-outlined">receipt_long</span>
          <span>Orders</span>
        </div>
        <Link href={`/status/${order.id}`} className="flex flex-col items-center text-slate-400 hover:text-primary text-[11px] font-semibold active:scale-90 transition-all">
          <span className="material-symbols-outlined">delivery_dining</span>
          <span>Status</span>
        </Link>
      </nav>
    </div>
  )
}
