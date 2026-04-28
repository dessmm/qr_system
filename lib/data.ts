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
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';

// Shared app state stored in Firebase
export type OrderStatus = 'new' | 'in-progress' | 'ready' | 'served'

export interface AppSettings {
  restaurantName: string;
  stationName: string;
  taxRate: string;
  serviceFee: string;
  baseUrl?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  restaurantName: 'Terracotta Kitchen',
  stationName: 'Main Line',
  taxRate: '8',
  serviceFee: '2.50',
  baseUrl: ''
}

// Firestore collection names
const SETTINGS_COL = 'settings';
const MENU_COL = 'menu';
const ORDERS_COL = 'orders';
const TABLES_COL = 'tables';

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
    const q = query(collection(db, TABLES_COL), orderBy('tableNumber'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table));
  } catch (error) {
    console.error("Error fetching tables:", error);
    return [];
  }
}

export async function createTable(table: Omit<Table, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const docRef = await addDoc(collection(db, TABLES_COL), {
      ...table,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    console.log('Table created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating table:", error);
    return null;
  }
}

export async function updateTableStatus(tableId: string, status: TableStatus, orderId?: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status,
      currentOrderId: orderId || null,
      updatedAt: Date.now()
    });
    console.log('Table status updated:', tableId, status);
  } catch (error) {
    console.error("Error updating table status:", error);
  }
}

// ✅ NEW: Delete table function
export async function deleteTable(tableId: string) {
  try {
    await deleteDoc(doc(db, TABLES_COL, tableId));
    console.log('Table deleted:', tableId);
  } catch (error) {
    console.error("Error deleting table:", error);
  }
}

export async function getTableByQrCode(qrCode: string): Promise<Table | null> {
  try {
    const q = query(collection(db, TABLES_COL));
    const querySnapshot = await getDocs(q);
    const table = querySnapshot.docs.find(doc => doc.data().qrCode === qrCode);
    if (table) {
      return { id: table.id, ...table.data() } as Table;
    }
    return null;
  } catch (error) {
    console.error("Error fetching table by QR code:", error);
    return null;
  }
}

export async function linkOrderToTable(tableId: string, orderId: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status: 'occupied',
      currentOrderId: orderId,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error("Error linking order to table:", error);
  }
}

export async function clearTableAfterPayment(tableId: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status: 'available',
      currentOrderId: null,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error("Error clearing table after payment:", error);
  }
}

export function listenToTables(callback: (tables: Table[]) => void) {
  const q = query(collection(db, TABLES_COL), orderBy('tableNumber'));
  return onSnapshot(q, 
    (snapshot) => {
      const tables = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table));
      callback(tables);
    },
    (error) => console.error('[listenToTables] Firestore error:', error)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getSettings(): Promise<AppSettings> {
  try {
    const docRef = doc(db, SETTINGS_COL, 'general');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppSettings;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  console.log("Saving settings to Firestore:", settings);
  await setDoc(doc(db, SETTINGS_COL, 'general'), settings);
  console.log("Settings successfully saved!");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  category: 'Appetizers' | 'Mains' | 'Drinks' | 'Desserts' | 'Sides'
  image: string
  badge?: string
  tags?: string[]
  available: boolean
}

export const CATEGORIES = ['Appetizers', 'Mains', 'Drinks', 'Desserts', 'Sides'] as const

export async function getMenuItems(): Promise<MenuItem[]> {
  try {
    const q = query(collection(db, MENU_COL), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
  } catch (error) {
    console.error("Error fetching menu items:", error);
    return [];
  }
}

export async function saveMenuItem(item: Partial<MenuItem>) {
  try {
    if (item.id) {
      const { id, ...data } = item;
      await updateDoc(doc(db, MENU_COL, id), data);
    } else {
      await addDoc(collection(db, MENU_COL), { ...item, available: true });
    }
  } catch (error) {
    console.error("Error saving menu item:", error);
  }
}

export async function deleteMenuItem(id: string) {
  try {
    await deleteDoc(doc(db, MENU_COL, id));
  } catch (error) {
    console.error("Error deleting menu item:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  image: string
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

export async function addOrder(order: Omit<Order, 'id'>) {
  try {
    const docRef = await addDoc(collection(db, ORDERS_COL), {
      ...order,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding order:", error);
    return null;
  }
}

// BUG-02: Replaced private docRef helper with direct doc() call for consistency
export async function getOrder(id: string): Promise<Order | null> {
  try {
    const docSnap = await getDoc(doc(db, ORDERS_COL, id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Order;
    }
    return null;
  } catch (error) {
    console.error("Error fetching order:", error);
    return null;
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  try {
    const ref = doc(db, ORDERS_COL, orderId);
    await updateDoc(ref, {
      status,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error("Error updating order status:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

export function listenToOrders(callback: (orders: Order[]) => void) {
  const q = query(collection(db, ORDERS_COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, 
    (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      callback(orders);
    },
    (error) => console.error('[listenToOrders] Firestore error — check security rules:', error)
  );
}

export function listenToMenu(callback: (items: MenuItem[]) => void) {
  const q = query(collection(db, MENU_COL), orderBy('name'));
  return onSnapshot(q, 
    (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      callback(items);
    },
    (error) => console.error('[listenToMenu] Firestore error — check security rules:', error)
  );
}

export function listenToSettings(callback: (settings: AppSettings) => void) {
  return onSnapshot(
    doc(db, SETTINGS_COL, 'general'),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        console.log('Received settings update from Firestore:', data);
        callback(data);
      } else {
        console.log('Settings document does not exist — using defaults.');
        callback(DEFAULT_SETTINGS);
      }
    },
    (error) => console.error('[listenToSettings] Firestore error — check security rules:', error)
  );
}

export function listenToOrder(id: string, callback: (order: Order | null) => void) {
  return onSnapshot(
    doc(db, ORDERS_COL, id),
    (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() } as Order);
      } else {
        callback(null);
      }
    },
    (error) => console.error('[listenToOrder] Firestore error — check security rules:', error)
  );
}