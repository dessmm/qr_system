import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy,
  addDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type OrderStatus = 'new' | 'in-progress' | 'ready' | 'served'

export interface AppSettings {
  [key: string]: string | undefined;
  restaurantName: string;
  stationName: string;
  taxRate: string;
  serviceFee: string;
  baseUrl?: string;
  imgbbApiKey?: string;
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  cloudinaryApiKey?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  restaurantName: 'Terracotta Kitchen',
  stationName: 'Main Line',
  taxRate: '8',
  serviceFee: '2.50',
  baseUrl: '',
  imgbbApiKey: '',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  cloudinaryApiKey: ''
}

const SETTINGS_COL = 'settings'
const MENU_COL     = 'menu'
const ORDERS_COL   = 'orders'
const TABLES_COL   = 'tables'

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type TableStatus = 'available' | 'occupied' | 'reserved'

export interface Table {
  id: string
  tableNumber: number
  name: string
  status: TableStatus
  qrCode: string
  capacity: number
  positionX: number
  positionY: number
  shape?: 'square' | 'round'
  currentOrderId?: string
  createdAt: number
  updatedAt: number
}

export async function getTables(): Promise<Table[]> {
  try {
    const q = query(collection(db, TABLES_COL), orderBy('tableNumber'))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Table))
  } catch (error) {
    console.error('Error fetching tables:', error)
    return []
  }
}

export async function createTable(table: Omit<Table, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const docRef = await addDoc(collection(db, TABLES_COL), {
      ...table,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    return docRef.id
  } catch (error) {
    console.error('Error creating table:', error)
    return null
  }
}

export async function updateTableStatus(tableId: string, status: TableStatus, orderId?: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status,
      currentOrderId: orderId ?? null,
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error('Error updating table status:', error)
  }
}

export async function deleteTable(tableId: string) {
  try {
    await deleteDoc(doc(db, TABLES_COL, tableId))
  } catch (error) {
    console.error('Error deleting table:', error)
  }
}

export async function updateTable(tableId: string, updates: Partial<Table>) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), { ...updates, updatedAt: Date.now() })
  } catch (error) {
    console.error('Error updating table:', error)
  }
}

export async function getTableByQrCode(qrCode: string): Promise<Table | null> {
  try {
    const snap = await getDocs(collection(db, TABLES_COL))
    const match = snap.docs.find(d => d.data().qrCode === qrCode)
    return match ? ({ id: match.id, ...match.data() } as Table) : null
  } catch (error) {
    console.error('Error fetching table by QR code:', error)
    return null
  }
}

export async function linkOrderToTable(tableId: string, orderId: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status: 'occupied',
      currentOrderId: orderId,
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error('Error linking order to table:', error)
  }
}

/**
 * ─── THE ONLY PLACE A TABLE GOES BACK TO 'available' ───────────────────────
 * Called exclusively from the checkout page after the customer pays.
 *
 * Full lifecycle:
 *   Customer orders  →  table: occupied   (set atomically in addOrder)
 *   Kitchen serves   →  table: still occupied  (guests still seated/eating)
 *   Customer pays    →  table: available   ← clearTableAfterPayment()
 */
export async function clearTableAfterPayment(tableId: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status: 'available',
      currentOrderId: null,
      updatedAt: Date.now()
    })
    console.log('[clearTableAfterPayment] table freed:', tableId)
  } catch (error) {
    console.error('Error clearing table after payment:', error)
  }
}

export function listenToTables(callback: (tables: Table[]) => void) {
  const q = query(collection(db, TABLES_COL), orderBy('tableNumber'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Table))),
    error => console.error('[listenToTables] Firestore error:', error)
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getSettings(): Promise<AppSettings> {
  try {
    const snap = await getDoc(doc(db, SETTINGS_COL, 'general'))
    return snap.exists() ? (snap.data() as AppSettings) : DEFAULT_SETTINGS
  } catch (error) {
    console.error('Error fetching settings:', error)
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await setDoc(doc(db, SETTINGS_COL, 'general'), settings)
}

export function listenToSettings(callback: (settings: AppSettings) => void) {
  return onSnapshot(doc(db, SETTINGS_COL, 'general'),
    snap => callback(snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() as AppSettings } : DEFAULT_SETTINGS),
    error => console.error('[listenToSettings] Firestore error:', error)
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

export interface MenuItemVariant {
  name: string
  price: number
}

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  category: 'Appetizers' | 'Mains' | 'Drinks' | 'Desserts' | 'Sides' | 'Snacks'
  image: string
  badge?: string
  tags?: string[]
  variants?: MenuItemVariant[]
  available: boolean
}

export const CATEGORIES = ['Appetizers', 'Mains', 'Drinks', 'Desserts', 'Sides', 'Snacks'] as const

export async function getMenuItems(): Promise<MenuItem[]> {
  try {
    const q = query(collection(db, MENU_COL), orderBy('name'))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem))
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return []
  }
}

export async function saveMenuItem(item: Partial<MenuItem>) {
  try {
    if (item.id) {
      const { id, ...data } = item
      await updateDoc(doc(db, MENU_COL, id), data)
    } else {
      await addDoc(collection(db, MENU_COL), { ...item, available: true })
    }
  } catch (error) {
    console.error('Error saving menu item:', error)
  }
}

export async function deleteMenuItem(id: string) {
  try {
    await deleteDoc(doc(db, MENU_COL, id))
  } catch (error) {
    console.error('Error deleting menu item:', error)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CartItem {
  id: string
  baseId?: string
  name: string
  price: number
  quantity: number
  image: string
  variantName?: string
  notes?: string
}

export interface Order {
  id: string
  tableNumber: number
  items: CartItem[]
  status: OrderStatus
  specialInstructions?: string
  createdAt: number
  updatedAt: number
  total: number
  orderType: 'dine-in' | 'takeout'
}

/**
 * Creates a new order and atomically marks the table as 'occupied'
 * in a single Firestore batch write — eliminates the race condition
 * where navigation away from the page could abort the table update.
 */
export async function addOrder(
  order: Omit<Order, 'id'>,
  tableId?: string
): Promise<string | null> {
  try {
    const now = Date.now()
    const batch = writeBatch(db)

    const orderRef = doc(collection(db, ORDERS_COL))
    batch.set(orderRef, { ...order, createdAt: now, updatedAt: now })

    if (tableId) {
      batch.update(doc(db, TABLES_COL, tableId), {
        status: 'occupied',
        currentOrderId: orderRef.id,
        updatedAt: now
      })
    }

    await batch.commit()
    console.log('[addOrder] batch committed — orderId:', orderRef.id, '| tableId:', tableId ?? 'none')
    return orderRef.id
  } catch (error) {
    console.error('Error adding order:', error)
    return null
  }
}

export async function getOrder(id: string): Promise<Order | null> {
  try {
    const snap = await getDoc(doc(db, ORDERS_COL, id))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null
  } catch (error) {
    console.error('Error fetching order:', error)
    return null
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  try {
    await updateDoc(doc(db, ORDERS_COL, orderId), { status, updatedAt: Date.now() })
  } catch (error) {
    console.error('Error updating order status:', error)
  }
}

/**
 * Kitchen "Mark Served" — marks the ORDER as served and ensures the table is occupied.
 * The table is occupied when the order is placed, but this ensures it's occupied when served.
 *
 * Lifecycle summary:
 *   new  →  in-progress  →  ready  →  served   (kitchen pipeline)
 *   occupied  ──────────────────────────────→  available  (payment only)
 */
export async function markOrderServed(orderId: string): Promise<void> {
  try {
    // First, find the table associated with this order
    const tablesSnap = await getDocs(collection(db, TABLES_COL))
    const tableDoc = tablesSnap.docs.find(doc => doc.data().currentOrderId === orderId)
    
    const batch = writeBatch(db)
    batch.update(doc(db, ORDERS_COL, orderId), {
      status: 'served',
      updatedAt: Date.now()
    })
    
    // Ensure table is occupied
    if (tableDoc) {
      batch.update(doc(db, TABLES_COL, tableDoc.id), {
        status: 'occupied',
        updatedAt: Date.now()
      })
    }
    
    await batch.commit()
    console.log('[markOrderServed] order served and table occupied')
  } catch (error) {
    console.error('Error marking order served:', error)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

export function listenToOrders(callback: (orders: Order[]) => void) {
  const q = query(collection(db, ORDERS_COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
    error => console.error('[listenToOrders] Firestore error — check security rules:', error)
  )
}

export function listenToMenu(callback: (items: MenuItem[]) => void) {
  const q = query(collection(db, MENU_COL), orderBy('name'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem))),
    error => console.error('[listenToMenu] Firestore error — check security rules:', error)
  )
}

export function listenToOrder(id: string, callback: (order: Order | null) => void) {
  return onSnapshot(
    doc(db, ORDERS_COL, id),
    snap => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null),
    error => console.error('[listenToOrder] Firestore error — check security rules:', error)
  )
}