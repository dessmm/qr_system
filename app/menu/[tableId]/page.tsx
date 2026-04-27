'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { listenToMenu, listenToSettings, MenuItem, CATEGORIES, CartItem, addOrder, AppSettings, DEFAULT_SETTINGS, linkOrderToTable, getTableByQrCode, createTable } from '@/lib/data'

export default function MenuPage() {
  const params = useParams()
  const router = useRouter()
  const tableQrCode = params.tableId as string // QR code from URL
  const tableNumber = Number(tableQrCode)

  const [activeCategory, setActiveCategory] = useState<string>('Appetizers')
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [tableId, setTableId] = useState<string | null>(null)

  useEffect(() => {
    const unsubMenu = listenToMenu(setMenuItems)
    const unsubSettings = listenToSettings(setSettings)
    const stored = sessionStorage.getItem('lastOrderId')
    if (stored) setLastOrderId(stored)
    
    // Auto-create table if it doesn't exist when QR is scanned
    async function ensureTableExists() {
      const table = await getTableByQrCode(tableQrCode)
      if (!table) {
        const newTableId = await createTable({
          tableNumber: Number(tableQrCode) || 1,
          name: `Table ${tableQrCode}`,
          status: 'available',
          qrCode: tableQrCode,
          capacity: 4,
          positionX: 0,
          positionY: 0,
          shape: 'square',
        })
        setTableId(newTableId)
      } else {
        setTableId(table.id)
      }
    }
    ensureTableExists()
    
    return () => { unsubMenu(); unsubSettings() }
  }, [tableQrCode])

  // BUG-14: Hard validation for invalid table numbers
  if (!tableNumber || tableNumber <= 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">error</span>
        <h1 className="text-xl font-bold mb-2 text-on-surface">Invalid Table</h1>
        <p className="text-on-surface-variant mb-4">Please scan your table&apos;s QR code again.</p>
        <Link href="/" className="text-primary font-bold">Return Home</Link>
      </div>
    )
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const filteredItems = menuItems.filter(item => {
    const matchCat = activeCategory === 'All' || item.category === activeCategory
    const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch && item.available
  })

  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1, image: item.image }]
    })
  }, [])

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === id)
      if (existing && existing.quantity > 1) return prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c)
      return prev.filter(c => c.id !== id)
    })
  }, [])

  const placeOrder = async () => {
    if (cart.length === 0) return
    setIsPlacing(true)
    
    // Create the order
    const orderId = await addOrder({ tableNumber, items: cart, status: 'new', specialInstructions, createdAt: Date.now(), updatedAt: Date.now(), total: cartTotal, orderType: 'dine-in' })
    
    if (orderId) {
      // Link order to table and update table status to occupied
      const table = await getTableByQrCode(tableQrCode)
      if (table) {
        await linkOrderToTable(table.id, orderId)
      }
      
      sessionStorage.setItem('lastOrderId', orderId) // BUG-07
      setLastOrderId(orderId) // BUG-07
      setCart([]) // BUG-15: Clear cart
      setSpecialInstructions('') // BUG-15
      router.push(`/checkout/${orderId}`)
    } else {
      setIsPlacing(false)
      alert("Failed to place order. Please try again.")
    }
  }

  const getCartQty = (id: string) => cart.find(c => c.id === id)?.quantity || 0

  return (
    <div className="bg-background min-h-screen pb-36">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm sticky top-0 z-50">
        <div className="flex justify-between items-center px-4 md:px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm">restaurant</span>
            </div>
            <span className="text-lg font-extrabold tracking-tight text-primary">{settings.restaurantName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCart(true)} className="relative hover:bg-slate-50 transition-colors p-2 rounded-full active:scale-95 duration-200">
              <span className="material-symbols-outlined text-slate-500">shopping_cart</span>
              {cartCount > 0 && (<span className="absolute top-0 right-0 bg-primary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{cartCount}</span>)}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-5 space-y-6">
        <section>
          <h1 className="text-2xl text-primary font-black">Welcome! You&apos;re at Table {tableNumber}</h1>
          <p className="text-base text-zinc-500">Order your favorites directly from your phone.</p>
        </section>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input type="text" placeholder="Search menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-zinc-100 border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
        </div>

        <nav className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 sticky top-[68px] bg-background py-2 z-40">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-shrink-0 px-4 py-2 rounded-full text-sm transition-all ${activeCategory === cat ? 'bg-primary text-white shadow-md font-bold' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{cat}</button>
          ))}
        </nav>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="col-span-full"><h2 className="text-xl font-bold border-l-4 border-primary pl-3">{activeCategory}</h2></div>
          {filteredItems.length === 0 && (<div className="col-span-full text-center py-16 text-zinc-400"><span className="material-symbols-outlined text-5xl mb-3 block">search_off</span><p className="text-lg font-semibold">No items found</p></div>)}
          {filteredItems.map(item => {
            const qty = getCartQty(item.id)
            return (
              <div key={item.id} className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-zinc-100 flex flex-col">
                <div className="h-48 overflow-hidden relative">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  {item.badge && (<span className="absolute top-3 right-3 bg-tertiary-fixed text-on-tertiary-fixed px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">{item.badge}</span>)}
                </div>
                <div className="p-4 flex-grow flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-lg text-zinc-900">{item.name}</h3>
                      <span className="font-bold text-lg text-primary ml-2">₱{item.price.toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-zinc-500 mb-3">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.tags?.map(tag => (<span key={tag} className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-lg text-[10px] font-bold">{tag}</span>))}
                    <div className="ml-auto flex items-center gap-2">
                      {qty > 0 ? (<><button onClick={() => removeFromCart(item.id)} className="w-9 h-9 bg-zinc-100 rounded-full flex items-center justify-center active:scale-90 transition-transform font-bold text-zinc-900"><span className="material-symbols-outlined text-sm">remove</span></button><span className="font-bold text-zinc-900 w-5 text-center">{qty}</span></>) : null}
                      <button onClick={() => addToCart(item)} className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform"><span className="material-symbols-outlined">add</span></button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-3 pb-safe bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-2xl z-50">
        <div className="flex flex-col items-center justify-center text-primary bg-orange-50 rounded-xl px-4 py-1.5 text-[11px] font-semibold">
          <span className="material-symbols-outlined">restaurant_menu</span><span>Menu</span>
        </div>
        <button onClick={() => setShowCart(true)} className="flex flex-col items-center justify-center text-slate-400 text-[11px] font-semibold active:scale-90 transition-transform">
          <span className="material-symbols-outlined">receipt_long</span><span>Cart {cartCount > 0 ? `(${cartCount})` : ''}</span>
        </button>
        {/* BUG-07: Conditional link — only active when a real order exists */}
        {lastOrderId ? (
          <Link href={`/status/${lastOrderId}`} className="flex flex-col items-center justify-center text-slate-400 text-[11px] font-semibold active:scale-90 transition-transform">
            <span className="material-symbols-outlined">delivery_dining</span><span>Order</span>
          </Link>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-200 text-[11px] font-semibold cursor-not-allowed">
            <span className="material-symbols-outlined">delivery_dining</span><span>Order</span>
          </div>
        )}
      </nav>

      {/* Sticky cart bar */}
      {cartCount > 0 && !showCart && (
        <div onClick={() => setShowCart(true)} className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-2xl bg-primary text-white p-4 rounded-2xl shadow-xl flex items-center justify-between z-[45] cursor-pointer active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 w-10 h-10 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined">shopping_cart</span></div>
            <div><p className="text-xs leading-tight">{cartCount} Item{cartCount !== 1 ? 's' : ''} in Cart</p><p className="font-bold text-lg">₱{cartTotal.toFixed(2)}</p></div>
          </div>
          <span className="bg-white text-primary px-5 py-2 rounded-xl text-xs shadow-sm font-bold">View Cart</span>
        </div>
      )}

      {/* Cart Drawer */}
      {showCart && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative bg-white rounded-t-3xl p-6 max-h-[85vh] flex flex-col shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold">Your Cart — Table {tableNumber}</h2>
              <button onClick={() => setShowCart(false)} className="p-1 hover:bg-zinc-100 rounded-full"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {cart.length === 0 ? (
                <div className="text-center py-10 text-zinc-400"><span className="material-symbols-outlined text-5xl block mb-2">shopping_cart</span><p>Your cart is empty</p></div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1"><p className="font-bold text-zinc-900">{item.name}</p><p className="text-primary font-bold">₱{(item.price * item.quantity).toFixed(2)}</p></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center active:scale-90 transition-transform"><span className="material-symbols-outlined text-sm">remove</span></button>
                      <span className="font-bold w-4 text-center">{item.quantity}</span>
                      {/* BUG-05: Null-safe check instead of non-null assertion */}
                      <button onClick={() => { const mi = menuItems.find(m => m.id === item.id); if (mi) addToCart(mi) }} className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center active:scale-90 transition-transform"><span className="material-symbols-outlined text-sm">add</span></button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 && (
              <>
                <textarea className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm resize-none mb-4 focus:outline-none focus:ring-2 focus:ring-primary" rows={2} placeholder="Special instructions, allergies..." value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} />
                <div className="flex justify-between items-center mb-4 font-bold text-lg"><span>Total</span><span className="text-primary">₱{cartTotal.toFixed(2)}</span></div>
                <button onClick={placeOrder} disabled={isPlacing} className="w-full h-14 bg-primary text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-60">
                  {isPlacing ? (<><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>Placing Order...</>) : (<>Place Order <span className="material-symbols-outlined">arrow_forward</span></>)}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
