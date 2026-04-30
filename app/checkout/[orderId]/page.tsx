'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { listenToOrder, listenToSettings, updateOrderStatus, Order, AppSettings, DEFAULT_SETTINGS, clearTableAfterPayment } from '@/lib/data'

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string

  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [tipPercent, setTipPercent] = useState<number>(18)
  const [paymentMethod, setPaymentMethod] = useState<'qrph' | 'card' | 'cash'>('qrph')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true) // BUG-04: Added loading state

  useEffect(() => {
    const unsubSettings = listenToSettings(setSettings)
    // BUG-04: Set isLoading to false once data arrives
    const unsubOrder = listenToOrder(orderId, (data) => {
      setOrder(data)
      setIsLoading(false)
    })
    
    return () => {
      unsubSettings()
      unsubOrder()
    }
  }, [orderId])

  // BUG-04: Show spinner during initial load instead of "Order Not Found"
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined animate-spin text-primary text-5xl mb-4">progress_activity</span>
        <p className="text-on-surface-variant">Loading order...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">error</span>
        <h1 className="text-xl font-bold mb-2">Order Not Found</h1>
        <Link href="/" className="text-primary font-bold">Return Home</Link>
      </div>
    )
  }

  const subtotal = order.total
  const taxRate = parseFloat(settings.taxRate) || 0
  const tax = subtotal * (taxRate / 100)
  const serviceFee = parseFloat(settings.serviceFee) || 0
  
  const tipAmount = (subtotal * tipPercent) / 100
  const grandTotal = subtotal + tax + serviceFee + tipAmount

  // BUG-08: handlePay now calls updateOrderStatus and redirects to /confirmation
  const handlePay = async () => {
    setIsProcessing(true)
    try {
      // TODO: Integrate real payment gateway here
      await new Promise(r => setTimeout(r, 1500))
      // Only update kitchen status if this order has not already been served.
      // A served order means food was delivered, but the table stays occupied
      // until payment is confirmed. Clearing the table is handled below.
      if (order?.status && order.status !== 'served') {
        await updateOrderStatus(orderId, 'in-progress')
      }

      // Clear table after payment is completed
      if (order?.tableNumber) {
        const { getTables } = await import('@/lib/data')
        const tables = await getTables()
        const table = tables.find(t => t.tableNumber === order.tableNumber)
        if (table) {
          await clearTableAfterPayment(table.id)
        }
      }
      // BUG-08: Redirect to confirmation page (not status)
      router.push(`/confirmation/${orderId}`)
    } catch {
      setIsProcessing(false)
      alert('Payment failed. Please try again.')
    }
  }

  return (
    <div className="bg-background text-on-background min-h-screen pb-32">
      {/* TopAppBar */}
      <header className="bg-white/90 backdrop-blur-md border-b border-stone-100 shadow-sm docked full-width top-0 sticky z-50 flex items-center justify-between px-4 h-16 w-full">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="active:scale-95 transition-transform duration-200 hover:bg-stone-50 p-2 rounded-full">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <h1 className="font-['Plus_Jakarta_Sans'] text-lg font-bold text-primary">Checkout</h1>
        </div>
        <div className="text-xl font-black text-stone-900">{settings.restaurantName}</div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-2 space-y-6 pt-4">
        {/* Order Summary Section */}
        <section className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-xl font-semibold text-zinc-900 mb-4">Order Summary</h2>
          <div className="space-y-4">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-100">
                  {item.image ? (
                    <img alt={item.name} className="w-full h-full object-cover" src={item.image} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                      <span className="material-symbols-outlined">restaurant</span>
                    </div>
                  )}
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-zinc-900">{item.quantity}x {item.name}</h3>
                    <span className="font-semibold text-primary">₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  {item.notes && <p className="text-zinc-500 text-xs mt-1">&ldquo;{item.notes}&rdquo;</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-stone-100 space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Subtotal</span>
              <span className="text-zinc-900 text-sm">₱{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Tax ({settings.taxRate}%)</span>
              <span className="text-zinc-900 text-sm">₱{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Service Fee</span>
              <span className="text-zinc-900 text-sm">₱{serviceFee.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {/* Tip Selection */}
        <section className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wider">Add a Tip</h2>
          <div className="grid grid-cols-4 gap-2">
            {[15, 18, 20].map(pct => (
              <button 
                key={pct}
                onClick={() => setTipPercent(pct)}
                className={`py-3 rounded-lg flex flex-col items-center transition-colors border ${tipPercent === pct ? 'bg-primary border-primary text-white shadow-md' : 'border-stone-200 text-zinc-900 hover:bg-orange-50'}`}
              >
                <span className="font-bold">{pct}%</span>
                <span className={`text-xs mt-1 ${tipPercent === pct ? 'opacity-90 text-white' : 'text-zinc-500'}`}>₱{((subtotal * pct) / 100).toFixed(2)}</span>
              </button>
            ))}
            <button 
              onClick={() => setTipPercent(0)}
              className={`py-3 border rounded-lg flex flex-col items-center transition-colors ${tipPercent === 0 ? 'bg-primary border-primary text-white shadow-md' : 'border-stone-200 text-zinc-900 hover:bg-orange-50'}`}
            >
              <span className="font-bold">None</span>
              <span className={`text-xs mt-1 ${tipPercent === 0 ? 'opacity-90 text-white' : 'text-zinc-500'}`}>₱0.00</span>
            </button>
          </div>
        </section>

        {/* Payment Methods */}
        <section className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider">Payment Method</h2>
          <div className="space-y-3">
            {[
              { key: 'qrph', label: 'QR PH', description: 'Scan our QR PH code to pay instantly with your banking app.', icon: 'qr_code_scanner' },
              { key: 'card', label: 'Card', description: 'Pay securely with credit or debit card.', icon: 'credit_card' },
              { key: 'cash', label: 'Cash (Pay when served)', description: 'Settle your bill in cash when your order is served.', icon: 'payments' },
            ].map((method) => (
              <button
                key={method.key}
                type="button"
                onClick={() => setPaymentMethod(method.key as 'qrph' | 'card' | 'cash')}
                className={`w-full text-left rounded-3xl border px-4 py-4 flex items-center justify-between transition ${paymentMethod === method.key ? 'border-primary bg-primary/10 shadow-sm' : 'border-stone-200 bg-white hover:border-stone-300'}`}
              >
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-2xl text-zinc-700">{method.icon}</span>
                  <div>
                    <div className={`font-semibold ${paymentMethod === method.key ? 'text-primary' : 'text-zinc-900'}`}>{method.label}</div>
                    <p className="text-xs text-zinc-500 mt-1">{method.description}</p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-lg ${paymentMethod === method.key ? 'text-primary' : 'text-zinc-300'}`}>check_circle</span>
              </button>
            ))}
          </div>
          <div className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-zinc-600 mt-4">
            {paymentMethod === 'qrph' && 'Scan the restaurant QR PH code and confirm payment in your mobile banking app.'}
            {paymentMethod === 'card' && 'Card payments are processed securely. Enter your card details at the next step.'}
            {paymentMethod === 'cash' && 'Pay in cash when your server brings your order. This confirms your order and keeps the table occupied until checkout.'}
          </div>
        </section>

        {/* Secure Badge */}
        <div className="flex items-center justify-center gap-1.5 text-zinc-400 py-4">
          <span className="material-symbols-outlined text-sm">lock</span>
          <span className="text-[10px] uppercase tracking-widest font-bold">Secure encrypted checkout</span>
        </div>
      </main>

      {/* Bottom Action Sheet / Pay Now Bar */}
      <div className="fixed bottom-0 w-full z-50 bg-white border-t border-stone-100 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] px-4 pb-8 pt-4">
        <div className="max-w-xl mx-auto">
          <div className="flex justify-between items-end mb-4 px-2">
            <div>
              <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Total Amount</span>
              <div className="text-3xl font-black text-primary">₱{grandTotal.toFixed(2)}</div>
            </div>
            <span className="text-zinc-400 text-sm mb-1 italic">
              {paymentMethod === 'cash' ? 'Cash due when served' : paymentMethod === 'qrph' ? 'QR PH payment selected' : 'Card payment selected'}
            </span>
          </div>
          <button 
            onClick={handlePay}
            disabled={isProcessing}
            className="w-full h-16 bg-primary text-white rounded-full text-xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                Processing...
              </>
            ) : (
              <>
                <span>{paymentMethod === 'qrph' ? 'Pay with QR PH' : paymentMethod === 'card' ? 'Pay with Card' : 'Confirm Cash Payment'}</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
