'use client'

import { useState, useCallback } from 'react'
import { useCart, CartItem } from '@/app/cashier/context/CartContext'
import { Table } from '@/lib/data'

const TAX_RATE = 0.08
const SERVICE_FEE = 2.50

interface QuickOrderPanelProps {
  open: boolean
  onClose: () => void
  tables: Table[]
}

export function QuickOrderPanel({ open, onClose, tables }: QuickOrderPanelProps) {
  const { items, updateQuantity, removeItem, clearCart, getSubtotal } = useCart()
  const [selectedTableId, setSelectedTableId] = useState<string>('')
  const [discount, setDiscount] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)

  const subtotal = getSubtotal()
  const discountAmt = parseFloat(discount) || 0
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax + SERVICE_FEE - discountAmt

  // "Send to Kitchen" — writes a note and clears the cart
  const handleSendToKitchen = useCallback(async () => {
    if (items.length === 0) return
    setSending(true)
    try {
      // In a real integration this would call addOrder() with the selected table
      // and items. For now we simulate the async write with a short delay.
      await new Promise(res => setTimeout(res, 800))
      setSentSuccess(true)
      setTimeout(() => {
        setSentSuccess(false)
        clearCart()
        setSelectedTableId('')
        setDiscount('')
        onClose()
      }, 1200)
    } finally {
      setSending(false)
    }
  }, [items, clearCart, onClose])

  const handleClearCart = () => {
    clearCart()
    setSelectedTableId('')
    setDiscount('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      )}

      {/* Slide-out panel */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-container-low">
          <div>
            <h2 className="font-bold text-on-surface text-lg">Quick Order</h2>
            <p className="text-xs text-on-surface-variant">
              {items.length === 0 ? 'Cart is empty' : `${items.length} item type${items.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* Table Assign */}
        <div className="px-5 py-3 border-b border-surface-container-low bg-surface-container-low">
          <label className="text-xs font-medium text-on-surface-variant block mb-1.5">Assign to Table</label>
          <select
            value={selectedTableId}
            onChange={e => setSelectedTableId(e.target.value)}
            className="w-full py-2 px-3 bg-white rounded-xl border border-surface-container-high focus:border-primary focus:outline-none text-sm"
          >
            <option value="">— Walk-in / No table —</option>
            {tables
              .filter(t => t.status !== 'available' || true) // show all tables
              .sort((a, b) => a.tableNumber - b.tableNumber)
              .map(t => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber} ({t.status})
                </option>
              ))}
          </select>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <span className="material-symbols-outlined text-on-surface-variant mb-3" style={{ fontSize: 48 }}>
                shopping_cart
              </span>
              <p className="font-medium text-on-surface-variant">Cart is empty</p>
              <p className="text-sm text-outline mt-1">Add products from the menu grid</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item: CartItem) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl border border-surface-container-high"
                >
                  {/* Name & price */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{item.name}</p>
                    {item.variantName && (
                      <p className="text-[11px] text-on-surface-variant truncate">{item.variantName}</p>
                    )}
                    <p className="text-xs text-primary font-semibold">₱{item.price.toFixed(2)}</p>
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center transition-colors"
                    >
                      <span className="material-symbols-outlined text-on-surface" style={{ fontSize: 16 }}>remove</span>
                    </button>
                    <span className="w-7 text-center text-sm font-bold text-on-surface">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-full bg-primary text-white hover:bg-primary-container flex items-center justify-center transition-colors"
                    >
                      <span className="material-symbols-outlined text-on-primary" style={{ fontSize: 16 }}>add</span>
                    </button>
                  </div>

                  {/* Line total */}
                  <span className="text-sm font-bold text-on-surface w-16 text-right">
                    ₱{(item.price * item.quantity).toFixed(2)}
                  </span>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-7 h-7 rounded-full hover:bg-error-container flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-error" style={{ fontSize: 16 }}>close</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — Totals + Actions */}
        {items.length > 0 && (
          <div className="border-t border-surface-container-low px-5 py-4 space-y-3">
            {/* Discount input */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-on-surface-variant whitespace-nowrap">Discount (₱)</label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="0.00"
                className="flex-1 py-2 px-3 bg-surface-container-low rounded-xl border border-surface-container-high focus:border-primary focus:outline-none text-sm"
              />
            </div>

            {/* Breakdown */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-on-surface-variant">
                <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Tax (8%)</span><span>₱{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Service Fee</span><span>₱{SERVICE_FEE.toFixed(2)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span><span>−₱{discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-on-surface text-base pt-1 border-t border-outline-variant mt-1">
                <span>Total</span><span className="text-primary">₱{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={handleSendToKitchen}
              disabled={sending || sentSuccess}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-container transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {sentSuccess ? (
                <>
                  <span className="material-symbols-outlined">check_circle</span>
                  Sent to Kitchen!
                </>
              ) : sending ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  Sending…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">send</span>
                  Send to Kitchen
                </>
              )}
            </button>

            <button
              onClick={handleClearCart}
              className="w-full py-2 text-error text-sm font-medium hover:bg-error-container rounded-xl transition-colors"
            >
              Clear Cart / Void Order
            </button>
          </div>
        )}
      </div>
    </>
  )
}
