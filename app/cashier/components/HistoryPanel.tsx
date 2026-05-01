'use client'

import { Transaction } from '@/app/cashier/context/CartContext'
import { TransactionHistory } from './TransactionHistory'

interface HistoryPanelProps {
  open: boolean
  onClose: () => void
  recentTransactions: Transaction[]
}

export function HistoryPanel({ open, onClose, recentTransactions }: HistoryPanelProps) {
  if (!open) return null

  return (
    <div className="fixed inset-x-0 top-16 z-50 bg-white border-b border-surface-container-low shadow-lg animate-fade-in">
      <div className="max-h-96 overflow-y-scroll overscroll-contain">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-on-surface">Transaction History</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-surface-container-high rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
          <TransactionHistory transactions={recentTransactions} />
        </div>
      </div>
    </div>
  )
}