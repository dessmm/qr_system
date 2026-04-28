'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCart, CartItem as CartItemType, Transaction } from '@/app/cashier/context/CartContext'

// Default tax rate — override via prop from settings
const DEFAULT_TAX_RATE = 8

// Quick cash amount presets (in PHP)
const QUICK_AMOUNTS = [100, 200, 500, 1000]

interface CartSummaryProps {
  taxRate?: number
  onComplete?: (transaction: Transaction) => void
}

export function CartSummary({ taxRate = DEFAULT_TAX_RATE, onComplete }: CartSummaryProps) {
  const { items, getSubtotal, getTax, getTotal, clearCart, customerInfo } = useCart()
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'digital'>('cash')
  const [paymentReceived, setPaymentReceived] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null)

  const subtotal = getSubtotal()
  const tax = getTax(taxRate)
  const discount = 0
  const total = getTotal(taxRate, discount)
  const payment = parseFloat(paymentReceived) || 0
  const change = payment - total

  // Fix #2: change due state derived from payment vs total
  const changeDue = payment - total
  const hasCashInput = paymentReceived !== ''

  // Fix #3: button disabled conditions
  const cartEmpty = items.length === 0
  const cashInsufficient = paymentMethod === 'cash' && payment < total
  const isDisabled = cartEmpty || cashInsufficient

  // Hint message shown below Complete Sale button when disabled
  const disabledHint = cartEmpty
    ? 'Add items to the cart first'
    : cashInsufficient
    ? 'Cash received is less than the total'
    : ''

  // Fix #9: keyboard shortcut ref — only active when cash is selected
  const cartPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (paymentMethod !== 'cash') return // remove bindings for non-cash

    const handler = (e: KeyboardEvent) => {
      // Only fire if focus is inside cart panel or on the body (global fallback)
      const target = e.target as HTMLElement
      const inPanel = cartPanelRef.current?.contains(target) ?? false
      const isBody = target === document.body || target.tagName === 'DIV'
      if (!inPanel && !isBody) return

      // Don't override normal typing inside inputs (except Escape)
      if (target.tagName === 'INPUT' && e.key !== 'Escape' && e.key !== 'Enter') return

      switch (e.key) {
        case '1': e.preventDefault(); setPaymentReceived(String(QUICK_AMOUNTS[0])); break
        case '2': e.preventDefault(); setPaymentReceived(String(QUICK_AMOUNTS[1])); break
        case '3': e.preventDefault(); setPaymentReceived(String(QUICK_AMOUNTS[2])); break
        case '4': e.preventDefault(); setPaymentReceived(String(QUICK_AMOUNTS[3])); break
        case 'Enter':
          e.preventDefault()
          if (!isDisabled) handleCheckout()
          break
        case 'Escape':
          e.preventDefault()
          setPaymentReceived('')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, isDisabled, payment, total])

  const handleCheckout = useCallback(() => {
    // Fix #3: card/digital bypass cash validation; cash must have sufficient funds
    if (cartEmpty) return
    if (paymentMethod === 'cash' && payment < total) return

    const effectivePayment = paymentMethod === 'cash' ? payment : total
    const transaction: Transaction = {
      id: `TXN-${Date.now()}`,
      items: [...items],
      subtotal,
      tax,
      discount,
      total,
      paymentReceived: effectivePayment,
      change: paymentMethod === 'cash' && change > 0 ? change : 0,
      customer: customerInfo.name ? customerInfo : undefined,
      timestamp: new Date(),
      paymentMethod
    }

    setLastTransaction(transaction)
    setShowReceipt(true)
    onComplete?.(transaction)
  }, [cartEmpty, payment, total, items, subtotal, tax, discount, customerInfo, paymentMethod, change, onComplete])

  const handleNewTransaction = () => {
    setShowReceipt(false)
    setLastTransaction(null)
    setPaymentReceived('')
    clearCart()
  }

  // ── Empty cart state ────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-surface-container-low">
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-3">shopping_cart</span>
          <p className="text-on-surface-variant">Cart is empty</p>
          <p className="text-sm text-outline mt-1">Add items to start a sale</p>
        </div>
      </div>
    )
  }

  // ── Receipt view ────────────────────────────────────────────────────────────
  if (showReceipt && lastTransaction) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-surface-container-low overflow-hidden">
        {/* Receipt Header */}
        <div className="bg-primary text-white p-4 text-center">
          <span className="material-symbols-outlined text-3xl mb-1">check_circle</span>
          <h3 className="font-bold text-lg">Transaction Complete</h3>
          <p className="text-sm opacity-90">{lastTransaction.id}</p>
        </div>

        {/* Receipt Details */}
        <div className="p-4 space-y-3">
          <div className="text-center border-b border-outline-variant pb-3 mb-3">
            <p className="text-xs text-on-surface-variant">{lastTransaction.timestamp.toLocaleString()}</p>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {lastTransaction.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-on-surface">{item.quantity}x {item.name}</span>
                <span className="text-on-surface">₱{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-outline-variant pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="text-on-surface">₱{lastTransaction.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
              <span className="text-on-surface">₱{lastTransaction.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
              <span className="text-on-surface">Total</span>
              <span className="text-primary">₱{lastTransaction.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Payment Method</span>
              <span className="text-on-surface capitalize">{lastTransaction.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Received</span>
              <span className="text-on-surface">₱{lastTransaction.paymentReceived.toFixed(2)}</span>
            </div>
            {lastTransaction.change > 0 && (
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-on-surface">Change</span>
                <span className="text-primary">₱{lastTransaction.change.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* New Transaction Button */}
        <div className="p-4 border-t border-surface-container-low">
          <button
            onClick={handleNewTransaction}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">add</span>
            New Transaction
          </button>
        </div>
      </div>
    )
  }

  // ── Main cart/payment view ─────────────────────────────────────────────────
  return (
    <div ref={cartPanelRef} className="bg-white rounded-2xl shadow-sm border border-surface-container-low">
      {/* Cart Items */}
      <div className="p-4 border-b border-surface-container-low">
        <h3 className="font-semibold text-on-surface mb-3">Order Items ({items.length})</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.map(item => (
            <CartItemRow key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Subtotal</span>
          <span className="text-on-surface">₱{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
          <span className="text-on-surface">₱{tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
          <span className="text-on-surface">Total</span>
          <span className="text-primary">₱{total.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Section */}
      <div className="p-4 border-t border-surface-container-low space-y-3">
        {/* Payment Method */}
        <div>
          <label className="text-sm font-medium text-on-surface-variant block mb-2">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'digital'] as const).map(method => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${
                  paymentMethod === method
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* Cash Input — only shown for cash method */}
        {paymentMethod === 'cash' && (
          <div>
            <label className="text-sm font-medium text-on-surface-variant block mb-2">Cash Received</label>
            <div className="relative">
              {/* Philippine Peso symbol */}
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-medium">₱</span>
              <input
                type="number"
                value={paymentReceived}
                onChange={e => setPaymentReceived(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 bg-surface-container-low rounded-xl border border-surface-container-high focus:border-primary focus:outline-none text-lg font-semibold"
              />
            </div>

            {/* Quick amounts — updated to PHP denominations */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              {QUICK_AMOUNTS.map(amount => (
                <button
                  key={amount}
                  onClick={() => setPaymentReceived(String(amount))}
                  className="py-2 bg-surface-container-high rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors"
                >
                  ₱{amount}
                </button>
              ))}
            </div>

            {/* Fix #9: keyboard hint row */}
            <p className="text-xs text-on-surface-variant text-center mt-1.5 opacity-70">
              Press 1–4 for quick amounts · Enter to complete · Esc to clear
            </p>

            {/* Fix #2: Change Due display — always visible once input has a value */}
            {hasCashInput && (
              <div className={`mt-3 p-3 rounded-xl flex justify-between items-center ${
                changeDue >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <span className={`font-medium text-sm ${changeDue >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {changeDue >= 0 ? 'Change Due' : 'Insufficient Cash'}
                </span>
                <span className={`text-2xl font-bold ${changeDue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {changeDue >= 0
                    ? `₱${changeDue.toFixed(2)}`
                    : `-₱${Math.abs(changeDue).toFixed(2)}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Fix #3: Complete Sale button with validation */}
        <div>
          <button
            onClick={handleCheckout}
            disabled={isDisabled}
            style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">payments</span>
            Complete Sale
          </button>

          {/* Inline hint when disabled */}
          {isDisabled && disabledHint && (
            <p className="text-xs text-on-surface-variant text-center mt-2">{disabledHint}</p>
          )}
        </div>

        {/* Clear Cart */}
        <button
          onClick={clearCart}
          className="w-full py-2 text-error text-sm font-medium hover:bg-error-container rounded-lg transition-colors"
        >
          Clear Cart
        </button>
      </div>
    </div>
  )
}

// ── Inline CartItemRow (compact list inside the cart panel) ───────────────────
function CartItemRow({ item }: { item: CartItemType }) {
  const { updateQuantity, removeItem } = useCart()

  return (
    <div className="flex items-center gap-2 py-2">
      {/* Fix #1: qty controls in the compact row */}
      <button
        onClick={() => updateQuantity(item.id, item.quantity - 1)}
        aria-label="Decrease"
        className="w-6 h-6 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center transition-colors flex-shrink-0"
      >
        <span className="material-symbols-outlined text-on-surface" style={{ fontSize: '14px' }}>remove</span>
      </button>
      <span className="text-sm text-on-surface-variant w-5 text-center">{item.quantity}</span>
      <button
        onClick={() => updateQuantity(item.id, item.quantity + 1)}
        aria-label="Increase"
        className="w-6 h-6 rounded-full bg-primary text-white hover:bg-primary-container flex items-center justify-center transition-colors flex-shrink-0"
      >
        <span className="material-symbols-outlined text-on-primary" style={{ fontSize: '14px' }}>add</span>
      </button>

      <span className="flex-1 text-sm text-on-surface truncate">{item.name}</span>
      <span className="text-sm font-medium text-on-surface">₱{(item.price * item.quantity).toFixed(2)}</span>
      <button onClick={() => removeItem(item.id)} className="p-1 hover:bg-error-container rounded" aria-label="Remove">
        <span className="material-symbols-outlined text-error text-sm">close</span>
      </button>
    </div>
  )
}