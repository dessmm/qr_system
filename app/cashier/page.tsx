'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { CartProvider, useCart } from '@/app/cashier/context/CartContext'
import { ProductCard } from '@/app/cashier/components/ProductCard'
import { CartSummary } from '@/app/cashier/components/CartSummary'
import { TransactionHistory } from '@/app/cashier/components/TransactionHistory'
import { listenToMenu, listenToTables, listenToOrders, MenuItem, CATEGORIES, Table, TableStatus, updateTableStatus, Order } from '@/lib/data'

function CashierContent() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [activeTab, setActiveTab] = useState<'cart' | 'history' | 'tables'>('cart')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<Order[]>([])

  // FIX 1 & 3: Store only the selected table ID instead of the full object.
  // This prevents stale state — the UI always derives the current table from
  // the live `tables` array rather than a snapshot taken at click-time.
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)

  // FIX 4: Optimistic status map — keyed by tableId, holds the status that was
  // applied locally before Firebase confirms the write.  Merged during render so
  // the UI updates instantly and reverts automatically once real data arrives.
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, TableStatus>>({})

  const { addTransaction, recentTransactions } = useCart()

  useEffect(() => {
    const unsubMenu = listenToMenu(setMenuItems)
    const unsubTables = listenToTables((incoming: Table[]) => {
      setTables(incoming)
      // FIX 5: When Firebase confirms a status, drop it from the optimistic map
      // so the confirmed value (same as the optimistic one) takes over cleanly —
      // zero flicker, no double-update visible to the user.
      setOptimisticStatuses(prev => {
        const next = { ...prev }
        let changed = false
        incoming.forEach(t => {
          if (next[t.id] !== undefined && next[t.id] === t.status) {
            delete next[t.id]
            changed = true
          }
        })
        return changed ? next : prev
      })
    })
    const unsubOrders = listenToOrders(setOrders)
    return () => { unsubMenu(); unsubTables(); unsubOrders() }
  }, [])

  // FIX 2: Derive the selected table via useMemo so it is always the freshest
  // version from the live `tables` array.  Merging optimisticStatuses here means
  // every re-render reflects both real-time Firebase data AND any in-flight
  // optimistic updates, keeping the detail panel perfectly in sync.
  const tablesWithOptimistic = useMemo<Table[]>(() => {
    if (Object.keys(optimisticStatuses).length === 0) return tables
    return tables.map(t =>
      optimisticStatuses[t.id] !== undefined
        ? { ...t, status: optimisticStatuses[t.id] }
        : t
    )
  }, [tables, optimisticStatuses])

  const selectedTable = useMemo<Table | null>(
    () => tablesWithOptimistic.find(t => t.id === selectedTableId) ?? null,
    [tablesWithOptimistic, selectedTableId]
  )

  // Filter products from Firebase
  const filteredProducts = useMemo(() => {
    return menuItems.filter(product => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        selectedCategory === 'All' || product.category === selectedCategory
      return matchesSearch && matchesCategory && product.available
    })
  }, [menuItems, searchQuery, selectedCategory])

  const handleTransactionComplete = (transaction: any) => {
    addTransaction(transaction)
  }

  // FIX 4: Apply optimistic status immediately, then fire the async Firebase
  // write.  If Firebase fails the optimistic entry stays visible until the next
  // real update, keeping the UX snappy rather than frozen on a pending spinner.
  const handleTableStatusChange = useCallback(
    async (tableId: string, status: TableStatus) => {
      setOptimisticStatuses(prev => ({ ...prev, [tableId]: status }))
      try {
        await updateTableStatus(tableId, status)
      } catch (err) {
        // On failure, remove the optimistic entry so Firebase's true value
        // is shown on the next listener callback.
        console.error('Failed to update table status:', err)
        setOptimisticStatuses(prev => {
          const next = { ...prev }
          delete next[tableId]
          return next
        })
      }
    },
    []
  )

  const getStatusColor = (status: TableStatus) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700 border-green-200'
      case 'occupied':  return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'reserved':  return 'bg-blue-100 text-blue-700 border-blue-200'
    }
  }

  const getStatusIcon = (status: TableStatus) => {
    switch (status) {
      case 'available': return 'check_circle'
      case 'occupied':  return 'restaurant'
      case 'reserved':  return 'event_seat'
    }
  }

  const tableStats = useMemo(() => ({
    available: tablesWithOptimistic.filter(t => t.status === 'available').length,
    occupied:  tablesWithOptimistic.filter(t => t.status === 'occupied').length,
    reserved:  tablesWithOptimistic.filter(t => t.status === 'reserved').length,
  }), [tablesWithOptimistic])

  // FIX 6: Guard against undefined — orders may not have loaded yet.
  const getOrderById = (orderId: string | undefined): Order | undefined => {
    if (!orderId) return undefined
    return orders.find(o => o.id === orderId)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-surface-container-low sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-white">point_of_sale</span>
            </div>
            <div>
              <h1 className="font-bold text-on-surface text-lg">Cashier POS</h1>
              <p className="text-xs text-on-surface-variant">Terracotta Kitchen</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
            </button>
            <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">settings</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        {/* Left Panel - Products */}
        <div className="flex-1 p-4 lg:p-6">
          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-surface-container-high focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Category Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
              {['All', ...CATEGORIES].map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    selectedCategory === category
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'bg-white text-on-surface-variant hover:bg-surface-container-high border border-surface-container-high'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-3">
                search_off
              </span>
              <p className="text-on-surface-variant">No products found</p>
              <p className="text-sm text-outline mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </div>

        {/* Right Panel - Cart/History/Tables */}
        <div className="w-full lg:w-96 xl:w-[440px] bg-surface-container-low p-4 lg:p-6 lg:border-l border-surface-container-low">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('cart')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'cart'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-transparent text-on-surface-variant hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">shopping_cart</span>
                Cart
              </span>
            </button>
            <button
              onClick={() => setActiveTab('tables')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'tables'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-transparent text-on-surface-variant hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">table_restaurant</span>
                Tables
                {tableStats.occupied > 0 && (
                  <span className="bg-amber-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {tableStats.occupied}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-transparent text-on-surface-variant hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">history</span>
                History
              </span>
            </button>
          </div>

          {/* Content */}
          {activeTab === 'cart' ? (
            <CartSummary onComplete={handleTransactionComplete} />
          ) : activeTab === 'tables' ? (
            <div className="space-y-4">
              {/* Table Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                  <p className="text-2xl font-bold text-green-600">{tableStats.available}</p>
                  <p className="text-xs text-green-700">Available</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                  <p className="text-2xl font-bold text-amber-600">{tableStats.occupied}</p>
                  <p className="text-xs text-amber-700">Occupied</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                  <p className="text-2xl font-bold text-blue-600">{tableStats.reserved}</p>
                  <p className="text-xs text-blue-700">Reserved</p>
                </div>
              </div>

              {/* FIX 7: Responsive grid — 1 col on very small screens, 2 cols from
                  xs upward.  Uses min-w-0 so text truncates instead of overflowing
                  on narrow viewports. */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                {tablesWithOptimistic.map(table => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTableId(table.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left min-w-0 ${
                      selectedTableId === table.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-white/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="font-bold text-lg truncate">Table {table.tableNumber}</p>
                        <p className="text-xs text-on-surface-variant">Capacity: {table.capacity}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(table.status)}`}>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">{getStatusIcon(table.status)}</span>
                          {table.status}
                        </span>
                      </span>
                    </div>
                    {/* FIX 6: Guard currentOrderId before rendering */}
                    {table.currentOrderId && (
                      <div className="mt-2 pt-2 border-t border-outline-variant">
                        <p className="text-xs text-on-surface-variant truncate">
                          Order:{' '}
                          <span className="font-mono text-primary">
                            {table.currentOrderId.slice(0, 8)}
                          </span>
                        </p>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {tablesWithOptimistic.length === 0 && (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-2">
                    table_restaurant
                  </span>
                  <p className="text-on-surface-variant">No tables configured</p>
                  <p className="text-sm text-outline mt-1">Add tables in the admin panel</p>
                </div>
              )}

              {/* Selected Table Actions — derived from live data, never stale */}
              {selectedTable && (
                <div className="bg-white rounded-xl p-4 border border-surface-container-low">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Table {selectedTable.tableNumber}</h3>
                    <button
                      onClick={() => setSelectedTableId(null)}
                      className="text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  {/* Table Info */}
                  <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-on-surface-variant">Capacity</span>
                      <span className="font-medium">{selectedTable.capacity} guests</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-on-surface-variant">QR Code</span>
                      <span className="font-mono text-xs truncate max-w-[140px]">
                        {selectedTable.qrCode}
                      </span>
                    </div>
                  </div>

                  {/* Active Orders for this Table — FIX 6: safe optional access */}
                  {selectedTable.currentOrderId && (() => {
                    const order = getOrderById(selectedTable.currentOrderId)
                    return (
                      <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-sm font-semibold text-amber-800 mb-2">Active Order</p>
                        {order ? (
                          <div className="space-y-1">
                            <p className="text-xs text-amber-700">
                              <span className="font-mono">{order.id.slice(0, 8)}</span>
                              {' '}• {order.status}
                            </p>
                            <p className="text-xs text-amber-600">
                              {order.items.length} items • ${order.total.toFixed(2)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600">Loading order…</p>
                        )}
                      </div>
                    )
                  })()}

                  <div className="space-y-2">
                    {selectedTable.status === 'available' && (
                      <button
                        onClick={() => handleTableStatusChange(selectedTable.id, 'occupied')}
                        className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">restaurant</span>
                        Seat Table
                      </button>
                    )}
                    {selectedTable.status === 'occupied' && (
                      <>
                        <button
                          onClick={() => handleTableStatusChange(selectedTable.id, 'available')}
                          className="w-full py-2 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined">check_circle</span>
                          Clear Table (Payment Done)
                        </button>
                        <button
                          onClick={() => handleTableStatusChange(selectedTable.id, 'reserved')}
                          className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined">event_seat</span>
                          Reserve Table
                        </button>
                      </>
                    )}
                    {selectedTable.status === 'reserved' && (
                      <button
                        onClick={() => handleTableStatusChange(selectedTable.id, 'occupied')}
                        className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">restaurant</span>
                        Seat Reserved Guest
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <TransactionHistory transactions={recentTransactions} />
          )}
        </div>
      </div>
    </div>
  )
}

export default function CashierPage() {
  return (
    <CartProvider>
      <CashierContent />
    </CartProvider>
  )
}