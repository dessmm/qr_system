'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage' // BUG-09
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth' // BUG-10
import { auth, storage } from '@/lib/firebase' // BUG-09/10
import { 
  listenToOrders, 
  listenToMenu, 
  listenToSettings, 
  saveMenuItem, 
  deleteMenuItem, 
  saveSettings,
  Order, 
  MenuItem, 
  CATEGORIES, 
  AppSettings, 
  DEFAULT_SETTINGS 
} from '@/lib/data'

type AdminView = 'insights' | 'menu' | 'qr' | 'settings'

// BUG-20: Accept settings as props instead of creating duplicate Firestore listener
function SettingsView({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null) // BUG-18: Error state

  // BUG-20: No local listener — parent already subscribes

  // BUG-18: try/catch instead of alert() in data.ts
  const handleSave = async () => {
    try {
      await saveSettings(settings)
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(`Failed to save: ${(err as Error).message}`)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-3xl font-bold text-zinc-900 mb-6">System Settings</h2>
      <div className="space-y-4">
        <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Restaurant Name</label>
          <input
            value={settings.restaurantName}
            onChange={e => setSettings({ ...settings, restaurantName: e.target.value })}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
          />
        </div>
        <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Station Name</label>
          <input
            value={settings.stationName}
            onChange={e => setSettings({ ...settings, stationName: e.target.value })}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
          />
        </div>
        <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Tax Rate (%)</label>
          <input
            value={settings.taxRate}
            onChange={e => setSettings({ ...settings, taxRate: e.target.value })}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
          />
        </div>
        <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Service Fee (₱)</label>
          <input
            value={settings.serviceFee}
            onChange={e => setSettings({ ...settings, serviceFee: e.target.value })}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
          />
        </div>
        <div className="bg-orange-50 rounded-xl p-5 border border-orange-200 shadow-sm">
          <label className="block text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">link</span>
            System Base URL (Local IP)
          </label>
          <input
            value={settings.baseUrl}
            placeholder="e.g. http://192.168.1.5:3000"
            onChange={e => setSettings({ ...settings, baseUrl: e.target.value })}
            className="w-full bg-white border border-orange-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
          />
          <p className="text-[10px] text-orange-600 mt-2 italic font-medium leading-relaxed">
            * Set this to your computer's local IP address so phones can access the menu after scanning the QR code. If empty, it defaults to the current browser URL.
          </p>
        </div>
        <button 
          onClick={handleSave}
          className="bg-primary text-white px-8 py-3 rounded-xl font-bold active:scale-95 transition-all shadow-md flex items-center gap-2"
        >
          {saved ? <><span className="material-symbols-outlined text-sm">check</span> Saved!</> : 'Save Changes'}
        </button>
        {/* BUG-18: Show error from try/catch */}
        {error && <p className="text-red-600 text-sm font-medium mt-2">{error}</p>}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [view, setView] = useState<AdminView>('insights')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [printTable, setPrintTable] = useState<number | null>(null)
  const [copies, setCopies] = useState(1)
  const [qrTableCount, setQrTableCount] = useState(10)
  const [user, setUser] = useState<User | null>(null) // BUG-10: Auth state
  const [authLoading, setAuthLoading] = useState(true) // BUG-10
  const [loginEmail, setLoginEmail] = useState('') // BUG-10
  const [loginPassword, setLoginPassword] = useState('') // BUG-10
  const [loginError, setLoginError] = useState('') // BUG-10
  const [mobileSidebar, setMobileSidebar] = useState(false) // BUG-22

  // BUG-10: Auth listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false) })
    return () => unsubAuth()
  }, [])

  useEffect(() => {
    if (!user) return
    const unsubOrders = listenToOrders(setOrders)
    const unsubMenu = listenToMenu(setMenuItems)
    const unsubSettings = listenToSettings(setSettings)
    return () => { unsubOrders(); unsubMenu(); unsubSettings() }
  }, [user])

  const totalRevenue = orders.filter(o => o.status === 'served').reduce((sum, o) => sum + o.total, 0)
  // BUG-13: Use served orders only for avg calculation
  const servedOrders = orders.filter(o => o.status === 'served')
  const avgOrderValue = servedOrders.length > 0 ? servedOrders.reduce((s, o) => s + o.total, 0) / servedOrders.length : 0
  const activeOrders = orders.filter(o => o.status !== 'served').length
  const topTable = orders.length > 0
    ? orders.reduce((acc, o) => {
        acc[o.tableNumber] = (acc[o.tableNumber] || 0) + 1
        return acc
      }, {} as Record<number, number>)
    : {}
  const busiestTable = Object.entries(topTable).sort(([, a], [, b]) => b - a)[0]

  const filteredMenu = menuItems.filter(item =>
    !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleAvailability = async (id: string) => {
    const item = menuItems.find(m => m.id === id)
    if (item) {
      await saveMenuItem({ ...item, available: !item.available })
    }
  }

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingItem({
      name: '',
      price: 0,
      description: '',
      category: 'Appetizers',
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
      available: true
    })
    setShowModal(true)
  }

  const handleSaveItem = async () => {
    if (!editingItem) return
    await saveMenuItem(editingItem)
    setShowModal(false)
    setEditingItem(null)
  }

  const handleDelete = (id: string) => {
    setItemToDelete(id);
  }

  // BUG-09: Upload to Firebase Storage instead of storing base64 in Firestore
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const storageRef = ref(storage, `menu/${Date.now()}_${file.name}`)
      const snapshot = await uploadBytes(storageRef, file)
      const url = await getDownloadURL(snapshot.ref)
      setEditingItem(prev => prev ? { ...prev, image: url } : null)
    } catch (err) {
      console.error('Image upload failed:', err)
      alert('Failed to upload image. Please try again or use a URL instead.')
    }
  }

  const recentActivity = orders.slice(0, 5)

  // BUG-16: Compute from order data so deleted menu items still appear
  const salesMap: Record<string, { name: string; sold: number }> = {}
  orders.flatMap(o => o.items).forEach(i => {
    if (!salesMap[i.id]) salesMap[i.id] = { name: i.name, sold: 0 }
    salesMap[i.id].sold += i.quantity
  })
  const itemSales = Object.values(salesMap).sort((a, b) => b.sold - a.sold).slice(0, 5)
  const maxSold = Math.max(...itemSales.map(i => i.sold), 1)

  // BUG-12: Compute weekly data from real served orders
  const weeklyData = Array(7).fill(0) as number[]
  servedOrders.forEach(o => {
    const day = new Date(o.createdAt).getDay() // 0=Sun
    weeklyData[(day + 6) % 7] += o.total // Shift so MON=0
  })
  const weekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const maxVal = Math.max(...weeklyData, 1)

  // BUG-10: Auth gate — block unauthenticated access
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword)
    } catch (err) {
      setLoginError((err as Error).message)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="material-symbols-outlined animate-spin text-primary text-5xl">progress_activity</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl border border-zinc-100 p-8 w-full max-w-sm space-y-5">
          <div className="text-center mb-2">
            <span className="material-symbols-outlined text-primary text-4xl">admin_panel_settings</span>
            <h1 className="text-xl font-bold text-zinc-900 mt-2">Admin Login</h1>
            <p className="text-sm text-zinc-500">Sign in to access the management portal</p>
          </div>
          <input type="email" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required className="w-full border border-zinc-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
          <input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="w-full border border-zinc-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
          {loginError && <p className="text-red-600 text-xs">{loginError}</p>}
          <button type="submit" className="w-full bg-primary text-white py-3 rounded-lg font-bold active:scale-95 transition-transform">Sign In</button>
        </form>
      </div>
    )
  }

  return (
    <>
      <div className="bg-background min-h-screen font-sans">
      {/* Sidebar */}
      {/* BUG-22: Mobile overlay sidebar */}
      {mobileSidebar && <div className="fixed inset-0 bg-black/40 z-[55] md:hidden" onClick={() => setMobileSidebar(false)} />}
      <aside className={`h-screen w-64 fixed left-0 top-0 border-r border-zinc-200 bg-zinc-50 flex flex-col py-6 z-[60] transition-transform duration-300 ${mobileSidebar ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold text-zinc-900">{settings.restaurantName}</h2>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Management Portal</p>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {([
            { key: 'insights', icon: 'analytics', label: 'Insights' },
            { key: 'menu', icon: 'restaurant_menu', label: 'Menu Manager' },
            { key: 'qr', icon: 'qr_code_2', label: 'Table QR Codes' },
            { key: 'settings', icon: 'settings', label: 'System Settings' },
          ] as { key: AdminView; icon: string; label: string }[]).map(item => (
            <button
              key={item.key}
              onClick={() => { setView(item.key); setMobileSidebar(false) }}
              className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-all rounded-lg ${
                view === item.key
                  ? 'text-primary bg-orange-50'
                  : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-6 mt-auto">
          {/* BUG-10: Show user email and sign out button */}
          <div className="flex items-center gap-3 p-2 bg-white rounded-lg shadow-sm border border-zinc-100">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">{user.email?.[0]?.toUpperCase() || 'A'}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-zinc-900 truncate">{user.email}</p>
              <button onClick={() => signOut(auth)} className="text-[10px] text-red-500 hover:text-red-700 font-medium">Sign Out</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="md:ml-64 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-50 flex justify-between items-center px-6 py-3 w-full bg-white border-b border-zinc-200 shadow-sm">
          <div className="flex items-center gap-4">
            {/* BUG-22: Hamburger button for mobile */}
            <button onClick={() => setMobileSidebar(true)} className="md:hidden p-2 hover:bg-zinc-100 rounded-lg">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-xl font-extrabold tracking-tight text-primary">{settings.restaurantName} Admin</span>
            <div className="relative flex items-center ml-4">
              <span className="material-symbols-outlined absolute left-3 text-zinc-400 text-sm">search</span>
              <input
                className="bg-zinc-50 border-none rounded-full py-2 pl-10 pr-4 text-sm w-64 focus:ring-2 focus:ring-primary transition-all outline-none"
                placeholder="Search data, menu..."
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
        </header>

        {/* Insights */}
        {view === 'insights' && (
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {[
                { label: 'TOTAL REVENUE', value: `₱${totalRevenue.toFixed(2)}`, icon: 'payments', trend: '+12.4%' },
                { label: 'AVG ORDER VALUE', value: `₱${avgOrderValue.toFixed(2)}`, icon: 'shopping_basket', trend: '+3.1%' },
                { label: 'ACTIVE ORDERS', value: activeOrders, icon: 'receipt_long', sub: 'right now' },
                { label: 'BUSIEST TABLE', value: busiestTable ? `Table ${busiestTable[0]}` : '—', icon: 'table_restaurant', sub: busiestTable ? `${busiestTable[1]} orders` : 'No data' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white p-6 rounded-xl shadow-sm border border-zinc-100 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{kpi.label}</span>
                    <span className="material-symbols-outlined text-primary bg-orange-50 p-2 rounded-lg">{kpi.icon}</span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-bold text-zinc-900">{kpi.value}</h3>
                    {kpi.trend && <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-1"><span className="material-symbols-outlined text-sm">trending_up</span>{kpi.trend} vs last week</p>}
                    {kpi.sub && <p className="text-xs text-zinc-500 mt-1">{kpi.sub}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="col-span-3 bg-white p-6 rounded-xl shadow-sm border border-zinc-100">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900">Revenue Trends</h2>
                    <p className="text-sm text-zinc-500">Weekly performance</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs font-bold bg-orange-50 text-primary rounded-full">Weekly</button>
                    <button className="px-3 py-1 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-full">Monthly</button>
                  </div>
                </div>
                <div className="h-48 flex items-end gap-3">
                  {weeklyData.map((val, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${idx === 5 ? 'bg-primary' : 'bg-primary/20'}`}
                        style={{ height: `${(val / maxVal) * 160}px` }}
                      />
                      <span className={`text-[10px] font-bold ${idx === 5 ? 'text-primary' : 'text-zinc-400'}`}>{weekDays[idx]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border border-zinc-100 flex flex-col">
                <h2 className="text-xl font-bold text-zinc-900 mb-6">Recent Activity</h2>
                <div className="space-y-4 flex-1">
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-zinc-500">No orders yet.</p>
                  ) : (
                    recentActivity.map(o => (
                      <div key={o.id} className="flex gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${o.status === 'served' ? 'bg-green-500' : o.status === 'ready' ? 'bg-blue-500' : 'bg-primary'}`} />
                        <div>
                          <p className="text-sm font-bold text-zinc-900">Order #{o.id} — Table {o.tableNumber}</p>
                          <p className="text-xs text-zinc-500">{o.items.length} items · ₱{o.total.toFixed(2)}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{new Date(o.createdAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Menu Manager */}
        {view === 'menu' && (
          <div className="p-8">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-3xl font-bold text-zinc-900 mb-1">Menu Manager</h2>
                <p className="text-sm text-zinc-500">Manage your dishes, availability and pricing.</p>
              </div>
              <button
                onClick={handleAdd}
                className="bg-primary hover:bg-orange-800 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg active:scale-95"
              >
                <span className="material-symbols-outlined">add</span>
                ADD NEW ITEM
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredMenu.map(item => (
                <div key={item.id} className={`bg-white rounded-2xl overflow-hidden border border-zinc-200 hover:shadow-xl transition-all group ${!item.available ? 'opacity-75' : ''}`}>
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.name}
                      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${!item.available ? 'grayscale' : ''}`}
                    />
                    <div className="absolute top-4 left-4">
                      <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-primary shadow-sm uppercase tracking-wider">
                        {item.category}
                      </span>
                    </div>
                    {!item.available && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="bg-red-600 text-white font-black px-4 py-1 rounded-md transform -rotate-12 border-2 border-white text-xs">SOLD OUT</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className={`font-bold text-lg ${!item.available ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{item.name}</h3>
                        <p className="text-xs text-zinc-500 line-clamp-1">{item.description}</p>
                      </div>
                      <span className={`font-bold ${!item.available ? 'text-zinc-400' : 'text-primary'}`}>₱{item.price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 pt-4 mt-2">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold ${item.available ? 'text-zinc-500' : 'text-red-600'}`}>
                          {item.available ? 'AVAILABLE' : 'OFF MENU'}
                        </span>
                        <button
                          onClick={() => toggleAvailability(item.id)}
                          className={`w-10 h-5 rounded-full relative p-1 cursor-pointer transition-colors ${item.available ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                        >
                          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${item.available ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="flex items-center justify-center p-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Item"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                        <button 
                          onClick={() => handleEdit(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold hover:bg-zinc-50 transition-colors"
                        >
                          <span className="material-symbols-outlined text-xs">edit</span>
                          EDIT
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR Codes */}
        {view === 'qr' && (
          <div className="p-8 max-w-5xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
              <div>
                <h2 className="text-3xl font-bold text-zinc-900 mb-2">Table QR Codes</h2>
                <p className="text-sm text-zinc-500">Print these QR codes and place them on your tables.</p>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-zinc-200 shadow-sm">
                <span className="text-sm font-bold text-zinc-600 pl-2">Number of Tables:</span>
                <input 
                  type="number" 
                  min="1" 
                  max="100"
                  value={qrTableCount}
                  onChange={(e) => setQrTableCount(parseInt(e.target.value) || 1)}
                  className="w-20 h-10 text-center bg-zinc-100 rounded-lg border-none text-sm font-bold focus:ring-primary focus:bg-orange-50 outline-none"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {Array.from({ length: qrTableCount }, (_, i) => i + 1).map(table => {
                const base = settings.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
                const url = `${base}/menu/${table}`;
                return (
                  <div key={table} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center text-center">
                    <h3 className="text-xl font-bold text-zinc-900 mb-4">Table {table}</h3>
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-zinc-100 mb-4">
                      {url && <QRCodeSVG value={url} size={120} />}
                    </div>
                    <button 
                      onClick={() => setPrintTable(table)}
                      className="mt-4 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors w-full active:scale-95 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">print</span>
                      Print QR
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Settings */}
        {view === 'settings' && (
          <SettingsView initialSettings={settings} />
        )}
      </main>

      {/* Modal for Add/Edit */}
      {showModal && editingItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-zinc-900">{menuItems.find(m => m.id === editingItem.id) ? 'Edit Dish' : 'New Dish'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Dish Name</label>
                <input 
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none" 
                  value={editingItem.name}
                  onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Price (₱)</label>
                  <input 
                    type="number"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none" 
                    value={editingItem.price}
                    onChange={e => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Category</label>
                  <select 
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none" 
                    value={editingItem.category}
                    onChange={e => setEditingItem({ ...editingItem, category: e.target.value as any })}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Description</label>
                <textarea 
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none resize-none" 
                  rows={3} 
                  value={editingItem.description}
                  onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Image</label>
                <div className="flex items-center gap-4">
                  {editingItem.image && (
                    <img src={editingItem.image} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-zinc-200" />
                  )}
                  <div className="flex-1 space-y-2">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">OR URL:</span>
                      <input 
                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 text-zinc-900 focus:ring-2 focus:ring-primary outline-none text-xs font-medium" 
                        value={editingItem.image || ''}
                        onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSaveItem}
                className="w-full bg-primary text-white py-4 rounded-2xl font-bold active:scale-95 transition-all shadow-lg hover:bg-orange-800"
              >
                {menuItems.find(m => m.id === editingItem.id) ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {printTable !== null && (
        <div className="fixed inset-0 bg-zinc-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {/* Print container that hides everything else when printing */}
          {/* BUG-21: Print styles moved to globals.css — no more dangerouslySetInnerHTML */}
          
          <div className="bg-white rounded-3xl w-full max-w-4xl h-[80vh] flex overflow-hidden shadow-2xl print-root">
            {/* Left side: Preview Canvas */}
            <div className="flex-1 bg-zinc-100 p-8 overflow-y-auto print:bg-white print:p-0 print:overflow-visible">
              <div className="max-w-[800px] mx-auto print:max-w-none print:w-full">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 print:grid-cols-2 print:gap-8 print:p-8 items-start">
                  {Array.from({ length: copies }).map((_, i) => {
                    const base = settings.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
                    const url = `${base}/menu/${printTable}`;
                    return (
                      <div key={i} className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200 flex flex-col items-center text-center print:shadow-none print:border-2 print:border-zinc-800 print:break-inside-avoid">
                        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-6 print:bg-black">
                          <span className="material-symbols-outlined text-white text-3xl">restaurant</span>
                        </div>
                        <h2 className="text-xl font-bold text-zinc-900 mb-2 uppercase tracking-widest">{settings.restaurantName}</h2>
                        <h3 className="text-3xl font-black text-primary mb-8 print:text-black">TABLE {printTable}</h3>
                        
                        <div className="bg-white p-3 rounded-2xl border-4 border-zinc-900 mb-6">
                          {url && <QRCodeSVG value={url} size={160} />}
                        </div>
                        
                        <div className="flex items-center gap-2 text-zinc-900 font-bold mb-2">
                          <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
                          <span>SCAN TO ORDER</span>
                        </div>
                        <p className="text-xs text-zinc-500 font-medium">No app download required</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right side: Controls */}
            <div className="w-80 bg-white border-l border-zinc-200 p-6 flex flex-col print-hide">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Print setup</h3>
                  <p className="text-sm text-zinc-500">Table {printTable} QR Code</p>
                </div>
                <button onClick={() => setPrintTable(null)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-zinc-700 mb-3">Number of Copies</label>
                <div className="flex items-center bg-zinc-50 rounded-xl p-2 gap-4">
                  <button onClick={() => setCopies(Math.max(1, copies - 1))} className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition-all">
                    <span className="material-symbols-outlined">remove</span>
                  </button>
                  <span className="flex-1 text-center font-black text-2xl">{copies.toString().padStart(2, '0')}</span>
                  <button onClick={() => setCopies(copies + 1)} className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition-all">
                    <span className="material-symbols-outlined">add</span>
                  </button>
                </div>
              </div>
              
              <div className="mt-auto pt-6 border-t border-zinc-100 grid grid-cols-2 gap-4">
                <button onClick={() => setPrintTable(null)} className="py-3 px-4 border-2 border-zinc-200 font-bold text-sm rounded-xl hover:bg-zinc-50 transition-colors">Cancel</button>
                <button onClick={() => { window.print() }} className="py-3 px-4 bg-primary text-white font-bold text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-orange-800">
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  Print Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center animate-fade-in">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-600 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">Delete Dish?</h3>
            <p className="text-sm text-zinc-500 mb-8">Are you sure you want to permanently delete this item? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setItemToDelete(null)} 
                className="flex-1 py-3 border-2 border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors rounded-xl font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (itemToDelete) {
                    await deleteMenuItem(itemToDelete);
                    setItemToDelete(null);
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 transition-colors text-white rounded-xl font-bold shadow-lg shadow-red-600/20 active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
