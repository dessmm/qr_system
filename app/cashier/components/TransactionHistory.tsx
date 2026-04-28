'use client'

import { useState } from 'react'
import { Transaction } from '@/app/cashier/context/CartContext'

interface TransactionHistoryProps {
  transactions: Transaction[]
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [filter, setFilter] = useState<'all' | 'cash' | 'card' | 'digital'>('all')

  const filteredTransactions = transactions.filter(
    t => filter === 'all' || t.paymentMethod === filter
  )

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-surface-container-low">
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-3">receipt_long</span>
          <p className="text-on-surface-variant">No transactions yet</p>
          <p className="text-sm text-outline mt-1">Completed sales will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-surface-container-low overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-surface-container-low">
        <h3 className="font-semibold text-on-surface mb-3">Recent Transactions</h3>
        
        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'cash', 'card', 'digital'] as const).map(method => (
            <button
              key={method}
              onClick={() => setFilter(method)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === method
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {method === 'all' ? 'All' : method.charAt(0).toUpperCase() + method.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredTransactions.map(transaction => (
          <button
            key={transaction.id}
            onClick={() => setSelectedTransaction(transaction)}
            className="w-full p-4 border-b border-surface-container-low hover:bg-surface-container-low text-left transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-on-surface text-sm">{transaction.id}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {transaction.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">${transaction.total.toFixed(2)}</p>
                <p className="text-xs text-on-surface-variant capitalize">{transaction.paymentMethod}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-on-surface-variant">
                {transaction.items.length} item{transaction.items.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-on-surface-variant">•</span>
              <span className="text-xs text-on-surface-variant">
                {transaction.items.reduce((sum, item) => sum + item.quantity, 0)} units
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTransaction(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-4 border-b border-surface-container-low flex items-center justify-between">
              <div>
                <h3 className="font-bold text-on-surface">Transaction Details</h3>
                <p className="text-sm text-on-surface-variant">{selectedTransaction.id}</p>
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Timestamp & Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-low rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant mb-1">Date & Time</p>
                  <p className="text-sm font-medium text-on-surface">
                    {selectedTransaction.timestamp.toLocaleString()}
                  </p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant mb-1">Payment Method</p>
                  <p className="text-sm font-medium text-on-surface capitalize">
                    {selectedTransaction.paymentMethod}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-medium text-on-surface-variant mb-2">Items</p>
                <div className="space-y-2">
                  {selectedTransaction.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-on-surface">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="text-on-surface font-medium">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-outline-variant pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Subtotal</span>
                  <span className="text-on-surface">${selectedTransaction.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Tax</span>
                  <span className="text-on-surface">${selectedTransaction.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
                  <span className="text-on-surface">Total</span>
                  <span className="text-primary">${selectedTransaction.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Amount Received</span>
                  <span className="text-on-surface">${selectedTransaction.paymentReceived.toFixed(2)}</span>
                </div>
                {selectedTransaction.change > 0 && (
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-on-surface">Change Given</span>
                    <span className="text-primary">${selectedTransaction.change.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Customer Info */}
              {selectedTransaction.customer && (
                <div className="bg-surface-container-low rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant mb-1">Customer</p>
                  <p className="text-sm font-medium text-on-surface">{selectedTransaction.customer.name}</p>
                  {selectedTransaction.customer.phone && (
                    <p className="text-xs text-on-surface-variant">{selectedTransaction.customer.phone}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}