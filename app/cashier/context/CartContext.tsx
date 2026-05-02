'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// Types
export interface CartItem {
  id: string
  baseId?: string
  name: string
  price: number
  quantity: number
  image?: string
  category?: string
  variantName?: string
  notes?: string
}

export interface CustomerInfo {
  name: string
  phone: string
  email: string
}

export interface Transaction {
  id: string
  items: CartItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  paymentReceived: number
  change: number
  customer?: CustomerInfo
  timestamp: Date
  paymentMethod: 'cash' | 'card' | 'digital'
}

// Context type
interface CartContextType {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateItemNote: (id: string, notes: string) => void
  clearCart: () => void
  getSubtotal: () => number
  getTax: (rate: number) => number
  getTotal: (taxRate: number, discount?: number) => number
  customerInfo: CustomerInfo
  setCustomerInfo: (info: CustomerInfo) => void
  recentTransactions: Transaction[]
  addTransaction: (transaction: Transaction) => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

// Provider component
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: '',
    phone: '',
    email: ''
  })
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setItems(current => {
      const existing = current.find(i => i.id === item.id)
      if (existing) {
        return current.map(i =>
          i.id === item.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...current, { ...item, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(current => current.filter(item => item.id !== id))
  }, [])

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(current => current.filter(item => item.id !== id))
    } else {
      setItems(current =>
        current.map(item =>
          item.id === id ? { ...item, quantity } : item
        )
      )
    }
  }, [])

  const updateItemNote = useCallback((id: string, notes: string) => {
    setItems(current =>
      current.map(item =>
        item.id === id ? { ...item, notes } : item
      )
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    setCustomerInfo({ name: '', phone: '', email: '' })
  }, [])

  const getSubtotal = useCallback(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, [items])

  const getTax = useCallback((rate: number) => {
    return getSubtotal() * (rate / 100)
  }, [getSubtotal])

  const getTotal = useCallback((taxRate: number, discount = 0) => {
    const subtotal = getSubtotal()
    const tax = subtotal * (taxRate / 100)
    return subtotal + tax - discount
  }, [getSubtotal])

  const addTransaction = useCallback((transaction: Transaction) => {
    setRecentTransactions(current => [transaction, ...current].slice(0, 50))
  }, [])

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        updateItemNote,
        clearCart,
        getSubtotal,
        getTax,
        getTotal,
        customerInfo,
        setCustomerInfo,
        recentTransactions,
        addTransaction
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

// Hook
export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}