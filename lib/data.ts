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

// SETTINGS
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

// BUG-18: Removed alert() — callers handle errors via try/catch
export async function saveSettings(settings: AppSettings): Promise<void> {
  console.log("Saving settings to Firestore:", settings);
  await setDoc(doc(db, SETTINGS_COL, 'general'), settings);
  console.log("Settings successfully saved!");
}

// MENU ITEMS
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

// BUG-06: Added 'Sides' to match the MenuItem type union
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

// BUG-17: Use updateDoc for existing items to preserve unknown fields
export async function saveMenuItem(item: Partial<MenuItem>) {
  try {
    if (item.id) {
      const { id, ...data } = item;
      await updateDoc(doc(db, MENU_COL, id), data); // BUG-17: updateDoc instead of setDoc
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

// ORDERS
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
    const docSnap = await getDoc(doc(db, ORDERS_COL, id)); // BUG-02: direct pattern
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Order;
    }
    return null;
  } catch (error) {
    console.error("Error fetching order:", error);
    return null;
  }
}

// BUG-02: Removed private docRef helper — was only used once and shadowed imports

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

// REAL-TIME LISTENERS (React hooks would be better, but these are simple observers)
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

// BUG-03: Removed generateOrderId() — dead code with collision risk.
// Firestore addDoc auto-generates collision-safe IDs.
