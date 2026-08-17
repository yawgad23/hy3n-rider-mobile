/**
 * Firebase configuration for HY3N Rider Mobile App
 * Project: hy3n26
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  PhoneAuthProvider,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  deleteUser,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';
// getReactNativePersistence is only available on native — import conditionally
let AsyncStorage: any = null;
let getReactNativePersistence: any = null;
if (Platform.OS !== 'web') {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
  getReactNativePersistence = require('firebase/auth').getReactNativePersistence;
}
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

// ─── Firebase Config ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDYUm2xv_8er3oGwk6qVXzAT51hoS4N4dE",
  authDomain: "hy3n26.firebaseapp.com",
  projectId: "hy3n26",
  storageBucket: "hy3n26.firebasestorage.app",
  messagingSenderId: "362594902321",
  appId: "1:362594902321:web:9387b08590e7660216d010",
  measurementId: "G-WH7JZPLP0L"
};

// Initialize Firebase (avoid re-initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth using standard getAuth on Web (includes popup resolver),
// and initializeAuth with AsyncStorage on Native.
let auth: ReturnType<typeof getAuth>;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    const persistence = getReactNativePersistence(AsyncStorage);
    auth = initializeAuth(app, { persistence });
  } catch (e: any) {
    // Fallback if already initialized
    auth = getAuth(app);
  }
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };

// ─── Firestore Collection Names (matching web app) ────────────────────────────
export const COLLECTIONS = {
  RIDER_PROFILES: 'rider_profiles',
  RIDES: 'rides',
  WALLET: 'wallets',
  WALLET_TRANSACTIONS: 'wallet_transactions',
  SCHEDULED_RIDES: 'scheduled_rides',
  SUPPORT_TICKETS: 'support_tickets',
  LOYALTY_POINTS: 'loyalty_points',
  LOYALTY_REDEMPTIONS: 'loyalty_redemptions',
  SAVED_PLACES: 'saved_places',
  REFERRALS: 'referrals',
  SOS_INCIDENTS: 'sos_incidents',
  PROMO_CODES: 'promo_codes',
  PAYMENTS: 'payments',
  RIDE_REPORTS: 'ride_reports',
  DRIVER_PROFILES: 'driver_profiles',
  DAILY_COMMISSION: 'daily_commissions',
};

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

export const firebaseAuth = {
  async loginWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  },

  async register(email: string, password: string, fullName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    return cred.user;
  },

  async logout() {
    await signOut(auth);
  },

  async resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  },

  getCurrentUser(): User | null {
    return auth.currentUser;
  },

  onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  async deleteAccount() {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No user logged in');
    await deleteUser(currentUser);
  },
};

// ─── Firestore Helpers ────────────────────────────────────────────────────────

function docToObj(docSnap: any) {
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

function snapshotToArray(querySnap: any) {
  return querySnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

export const firestoreDB = {
  async get(collectionName: string, id: string) {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    return docToObj(docSnap);
  },

  async list(collectionName: string, filters: Record<string, any> = {}, orderByField = 'created_date', orderDir: 'asc' | 'desc' = 'desc', limitNum?: number) {
    const colRef = collection(db, collectionName);
    const constraints: any[] = [];
    for (const [field, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        constraints.push(where(field, '==', value));
      }
    }
    constraints.push(orderBy(orderByField, orderDir));
    if (limitNum) constraints.push(firestoreLimit(limitNum));
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);
    return snapshotToArray(snap);
  },

  async create(collectionName: string, data: Record<string, any>) {
    const payload = {
      ...data,
      created_date: data.created_date || new Date().toISOString(),
      updated_date: new Date().toISOString(),
    };
    const colRef = collection(db, collectionName);
    const docRef = await addDoc(colRef, payload);
    return { id: docRef.id, ...payload };
  },

  async update(collectionName: string, id: string, data: Record<string, any>) {
    const docRef = doc(db, collectionName, id);
    const payload = { ...data, updated_date: new Date().toISOString() };
    await updateDoc(docRef, payload);
    return { id, ...payload };
  },

  async delete(collectionName: string, id: string) {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
    return { id };
  },

  subscribe(collectionName: string, filters: Record<string, any>, callback: (data: any[]) => void) {
    const colRef = collection(db, collectionName);
    const constraints: any[] = [];
    for (const [field, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        constraints.push(where(field, '==', value));
      }
    }
    const q = query(colRef, ...constraints);
    return onSnapshot(q, (snap) => {
      callback(snapshotToArray(snap));
    });
  },

  /** Subscribe to a single document by ID. Calls callback with data or null if deleted. */
  subscribeDoc(collectionName: string, id: string, callback: (data: any | null) => void) {
    const docRef = doc(db, collectionName, id);
    return onSnapshot(docRef, (snap) => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  },

  /** Set (overwrite) a document by ID. */
  async set(collectionName: string, id: string, data: Record<string, any>) {
    const { setDoc: fsSetDoc } = await import('firebase/firestore');
    const docRef = doc(db, collectionName, id);
    const payload = { ...data, updated_date: new Date().toISOString() };
    await fsSetDoc(docRef, payload);
    return { id, ...payload };
  },
};

// ─── Storage Helpers ──────────────────────────────────────────────────────────

export const firebaseStorage = {
  async uploadFile(file: Blob, path: string): Promise<string> {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  },
};
