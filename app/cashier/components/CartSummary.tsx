'use client'

import { useState } from 'react'
import { useCart, CartItem as CartItemType, Transaction } from '@/app/cashier/context/CartContext'

// Default tax rate from settings
const DEFAULT_TAX_RATE = 8

interface CartSummaryProps {
  taxRate?: number
  onComplete?: (transaction: Transaction) => void
}

export function CartSummary({ taxRate = DEFAULT_TAX_RATE, onComplete }: CartSummaryProps) {
  const { items, getSubtotal, getTax, getTotal, clearCart, customerInfo, setCustomerInfo } = useCart()
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

  const handleCheckout = () => {
    if (payment < total) return

    const transaction: Transaction = {
      id: `TXN-${Date.now()}`,
      items: [...items],
      subtotal,
      tax,
      discount,
      total,
      paymentReceived: payment,
      change: change > 0 ? change : 0,
      customer: customerInfo.name ? customerInfo : undefined,
      timestamp: new Date(),
      paymentMethod
    }

    setLastTransaction(transaction)
    setShowReceipt(true)
    onComplete?.(transaction)
  }

  const handleNewTransaction = () => {
    setShowReceipt(false)
    setLastTransaction(null)
    setPaymentReceived('')
    clearCart()
  }

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
            <p className="text-xs text-on-surface-variant">
              {lastTransaction.timestamp.toLocaleString()}
            </p>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {lastTransaction.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-on-surface">{item.quantity}x {item.name}</span>
                <span className="text-on-surface">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-outline-variant pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="text-on-surface">${lastTransaction.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
              <span className="text-on-surface">${lastTransaction.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
              <span className="text-on-surface">Total</span>
              <span className="text-primary">${lastTransaction.total.toFixed(2)}</span>
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
              <span className="text-on-surface">${lastTransaction.paymentReceived.toFixed(2)}</span>
            </div>
            {lastTransaction.change > 0 && (
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-on-surface">Change</span>
                <span className="text-primary">${lastTransaction.change.toFixed(2)}</span>
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-surface-container-low">
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
          <span className="text-on-surface">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
          <span className="text-on-surface">${tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
          <span className="text-on-surface">Total</span>
          <span className="text-primary">${total.toFixed(2)}</span>
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

        {/* Cash Input */}
        {paymentMethod === 'cash' && (
          <div>
            <label className="text-sm font-medium text-on-surface-variant block mb-2">Cash Received</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
              <input
                type="number"
                value={paymentReceived}
                onChange={e => setPaymentReceived(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-4 py-3 bg-surface-container-low rounded-xl border border-surface-container-high focus:border-primary focus:outline-none text-lg font-semibold"
              />
            </div>
            {/* Quick amounts */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[10, 20, 50, 100].map(amount => (
                <button
                  key={amount}
                  onClick={() => setPaymentReceived(String(amount))}
                  className="py-2 bg-surface-container-high rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors"
                >
                  ${amount}
                </button>
              ))}
            </div>
            {payment >= total && change > 0 && (
              <div className="mt-3 p-3 bg-primary-fixed rounded-xl flex justify-between items-center">
                <span className="font-medium text-on-primary-fixed">Change Due</span>
                <span className="text-2xl font-bold text-on-primary-fixed">${change.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Complete Button */}
        <button
          onClick={handleCheckout}
          disabled={paymentMethod !== 'cash' || payment < total}
          className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined">payments</span>
          Complete Sale
        </button>

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

// Inline CartItemRow for simplicity
function CartItemRow({ item }: { item: CartItemType }) {
  const { updateQuantity, removeItem } = useCart()

  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-sm text-on-surface-variant w-6">{item.quantity}x</span>
      <span className="flex-1 text-sm text-on-surface truncate">{item.name}</span>
      <span className="text-sm font-medium text-on-surface">${(item.price * item.quantity).toFixed(2)}</span>
      <button onClick={() => removeItem(item.id)} className="p-1 hover:bg-error-container rounded">
        <span className="material-symbols-outlined text-error text-sm">close</span>
      </button>
    </div>
  )
}