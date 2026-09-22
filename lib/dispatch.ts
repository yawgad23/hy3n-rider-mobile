/**
 * HY3N Dispatch Service
 * Handles real ride creation, driver matching, and live status updates via Firestore.
 *
 * Firestore Collections:
 *   rides/          — ride requests (created by rider, updated by driver/system)
 *   drivers/        — driver profiles with live location and availability
 *   wallets/        — rider wallet balances
 *   wallet_transactions/ — wallet top-ups and ride payments
 */

import {
  db,
  COLLECTIONS,
} from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RideStatus =
  | 'searching'      // Looking for a driver
  | 'matched'        // Driver assigned, not yet arrived
  | 'driver_arriving'// Driver is on the way to pickup
  | 'driver_arrived' // Driver at pickup location
  | 'in_progress'    // Trip started
  | 'completed'      // Trip finished
  | 'cancelled';     // Cancelled by rider or driver

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RideLocation extends GeoPoint {
  name: string;
  address: string;
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  photo_url?: string;
  rating: number;
  total_trips: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_colour: string;       // e.g. "Black", "White", "Silver", "Red", "Blue"
  vehicle_colour_hex: string;   // e.g. "#1A1A1A"
  plate: string;
  category: string;             // matches ride category
  is_available: boolean;
  location: GeoPoint;
  last_seen: string;
}

export interface RideRequest {
  id?: string;
  rider_id: string;
  rider_name: string;
  rider_phone: string;
  rider_email?: string;
  driver_id?: string;
  driver?: DriverProfile;
  status: RideStatus;
  category: string;
  pickup: RideLocation;
  destination: RideLocation;
  stops?: RideLocation[];       // Multi-stop
  payment: string;
  fare: number;
  base_fare: number;
  surge_multiplier: number;
  distance: number;
  duration: number;
  promo_code?: string;
  discount?: number;
  tip?: number;
  waiting_fee?: number;
  ride_pin: string;             // 4-digit PIN for verification
  cancel_reason?: string;
  rider_rating?: number;
  driver_rating?: number;
  ride_options?: {
    ac: boolean;
    pet_friendly: boolean;
    extra_luggage: boolean;
    wheelchair_accessible: boolean;
  };
  created_at: string;
  matched_at?: string;
  started_at?: string;
  completed_at?: string;
  cancelled_at?: string;
}

// ─── Vehicle Colour Map ───────────────────────────────────────────────────────

export const VEHICLE_COLOURS: Record<string, { name: string; hex: string }> = {
  black:   { name: 'Black',   hex: '#1A1A1A' },
  white:   { name: 'White',   hex: '#F5F5F5' },
  silver:  { name: 'Silver',  hex: '#C0C0C0' },
  grey:    { name: 'Grey',    hex: '#808080' },
  red:     { name: 'Red',     hex: '#CE1126' },
  blue:    { name: 'Blue',    hex: '#1D4ED8' },
  green:   { name: 'Green',   hex: '#006B3F' },
  gold:    { name: 'Gold',    hex: '#D4AF37' },
  brown:   { name: 'Brown',   hex: '#92400E' },
  orange:  { name: 'Orange',  hex: '#EA580C' },
  maroon:  { name: 'Maroon',  hex: '#7F1D1D' },
  yellow:  { name: 'Yellow',  hex: '#FBBF24' },
};

// ─── Mock Driver Pool (used when no real drivers in Firestore) ────────────────
// In production, drivers register via the Driver App and appear in Firestore.

const MOCK_DRIVERS: DriverProfile[] = [
  {
    id: 'driver_001',
    name: 'Kwame Asante',
    phone: '+233244000001',
    rating: 4.9,
    total_trips: 1243,
    vehicle_make: 'Toyota',
    vehicle_model: 'Camry',
    vehicle_colour: 'Black',
    vehicle_colour_hex: '#1A1A1A',
    plate: 'GR 1234-24',
    category: 'Standard',
    is_available: true,
    location: { lat: 5.6037, lng: -0.187 },
    last_seen: new Date().toISOString(),
  },
  {
    id: 'driver_002',
    name: 'Ama Owusu',
    phone: '+233244000002',
    rating: 4.8,
    total_trips: 876,
    vehicle_make: 'Hyundai',
    vehicle_model: 'Sonata',
    vehicle_colour: 'Silver',
    vehicle_colour_hex: '#C0C0C0',
    plate: 'GR 5678-23',
    category: 'Comfort',
    is_available: true,
    location: { lat: 5.6045, lng: -0.188 },
    last_seen: new Date().toISOString(),
  },
  {
    id: 'driver_003',
    name: 'Kofi Mensah',
    phone: '+233244000003',
    rating: 4.7,
    total_trips: 2104,
    vehicle_make: 'Mercedes',
    vehicle_model: 'C-Class',
    vehicle_colour: 'Black',
    vehicle_colour_hex: '#1A1A1A',
    plate: 'GR 9012-24',
    category: 'Executive',
    is_available: true,
    location: { lat: 5.6020, lng: -0.185 },
    last_seen: new Date().toISOString(),
  },
  {
    id: 'driver_004',
    name: 'Yaa Mensah',
    phone: '+233244000004',
    rating: 4.6,
    total_trips: 654,
    vehicle_make: 'Kantanka',
    vehicle_model: 'Onantefo',
    vehicle_colour: 'White',
    vehicle_colour_hex: '#F5F5F5',
    plate: 'GR 3456-24',
    category: 'Kantanka',
    is_available: true,
    location: { lat: 5.6055, lng: -0.190 },
    last_seen: new Date().toISOString(),
  },
  {
    id: 'driver_005',
    name: 'Abena Boateng',
    phone: '+233244000005',
    rating: 4.5,
    total_trips: 432,
    vehicle_make: 'Honda',
    vehicle_model: 'Accord',
    vehicle_colour: 'Red',
    vehicle_colour_hex: '#CE1126',
    plate: 'GR 7890-23',
    category: 'Standard',
    is_available: true,
    location: { lat: 5.6030, lng: -0.186 },
    last_seen: new Date().toISOString(),
  },
  {
    id: 'driver_006',
    name: 'Kojo Asare',
    phone: '+233244000006',
    rating: 4.8,
    total_trips: 1567,
    vehicle_make: 'Toyota',
    vehicle_model: 'Prado',
    vehicle_colour: 'Gold',
    vehicle_colour_hex: '#D4AF37',
    plate: 'GR 2345-24',
    category: 'Executive',
    is_available: true,
    location: { lat: 5.6010, lng: -0.184 },
    last_seen: new Date().toISOString(),
  },
];

// ─── Surge Pricing ────────────────────────────────────────────────────────────

export function getSurgeMultiplier(): number {
  const hour = new Date().getHours();
  // Peak hours: 7-9am, 5-8pm, Friday/Saturday nights
  const day = new Date().getDay();
  const isMorningPeak = hour >= 7 && hour <= 9;
  const isEveningPeak = hour >= 17 && hour <= 20;
  const isWeekendNight = (day === 5 || day === 6) && hour >= 21;
  if (isWeekendNight) return 1.8;
  if (isEveningPeak) return 1.4;
  if (isMorningPeak) return 1.2;
  return 1.0;
}

// ─── Ride PIN Generator ───────────────────────────────────────────────────────

export function generateRidePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ─── ETA Calculator ───────────────────────────────────────────────────────────

export function calculateETA(driverLocation: GeoPoint, pickupLocation: GeoPoint): number {
  // Haversine distance in km
  const R = 6371;
  const dLat = ((pickupLocation.lat - driverLocation.lat) * Math.PI) / 180;
  const dLng = ((pickupLocation.lng - driverLocation.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((driverLocation.lat * Math.PI) / 180) *
      Math.cos((pickupLocation.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  // Assume 20 km/h average in Accra traffic
  const etaMinutes = Math.max(1, Math.round((distanceKm / 20) * 60));
  return etaMinutes;
}

// ─── Dispatch Service ─────────────────────────────────────────────────────────

export const dispatchService = {

  /**
   * Create a new ride request in Firestore.
   * Returns the ride ID immediately so the rider can listen for updates.
   */
  async createRide(params: {
    riderId: string;
    riderName: string;
    riderPhone: string;
    riderEmail?: string;
    category: string;
    pickup: RideLocation;
    destination: RideLocation;
    stops?: RideLocation[];
    payment: string;
    fare: number;
    baseFare: number;
    surgeMultiplier: number;
    distance: number;
    duration: number;
    promoCode?: string;
    discount?: number;
    rideOptions?: RideRequest['ride_options'];
  }): Promise<string> {
    const pin = generateRidePin();
    const rideData: Omit<RideRequest, 'id'> = {
      rider_id: params.riderId,
      rider_name: params.riderName,
      rider_phone: params.riderPhone,
      rider_email: params.riderEmail || '',
      status: 'searching',
      category: params.category,
      pickup: params.pickup,
      destination: params.destination,
      stops: params.stops || [],
      payment: params.payment,
      fare: params.fare,
      base_fare: params.baseFare,
      surge_multiplier: params.surgeMultiplier,
      distance: params.distance,
      duration: params.duration,
      promo_code: params.promoCode,
      discount: params.discount,
      ride_pin: pin,
      ride_options: params.rideOptions || {
        ac: true,
        pet_friendly: false,
        extra_luggage: false,
        wheelchair_accessible: false,
      },
      created_at: new Date().toISOString(),
    };

    try {
      const colRef = collection(db, COLLECTIONS.RIDES);
      const docRef = await addDoc(colRef, rideData);
      // Trigger driver matching after a short delay (simulates dispatch algorithm)
      setTimeout(() => dispatchService.matchDriver(docRef.id, params.category), 3000);
      return docRef.id;
    } catch (err) {
      // A local placeholder cannot be seen by a Driver app, so it must never
      // be presented as a real request. Let the Rider screen show a retryable
      // error instead.
      console.error('[Dispatch] Firestore ride creation failed:', err);
      throw err;
    }
  },

  /**
   * Match the nearest available driver to a ride request.
   * In production, this would be a Cloud Function triggered by the ride creation.
   */
  async matchDriver(rideId: string, category: string): Promise<void> {
    if (rideId.startsWith('local_')) return; // Local simulation — skip Firestore

    try {
      // Try to find a real driver in Firestore
      const driversRef = collection(db, 'drivers');
      const q = query(
        driversRef,
        where('is_available', '==', true),
        where('category', '==', category),
        limit(1)
      );
      const snap = await getDocs(q);

      let driver: DriverProfile;

      if (!snap.empty) {
        const d = snap.docs[0];
        driver = { id: d.id, ...d.data() } as DriverProfile;
      } else {
        // Fallback to mock driver pool
        const mockDrivers = MOCK_DRIVERS.filter(d => d.category === category || category === 'Standard');
        driver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];
      }

      // Update ride with matched driver
      const rideRef = doc(db, COLLECTIONS.RIDES, rideId);
      await updateDoc(rideRef, {
        status: 'matched',
        driver_id: driver.id,
        driver: driver,
        matched_at: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });

      // Simulate driver progression: arriving → arrived → in_progress → completed
      setTimeout(() => dispatchService.updateRideStatus(rideId, 'driver_arriving'), 8000);
      setTimeout(() => dispatchService.updateRideStatus(rideId, 'driver_arrived'), 20000);
      setTimeout(() => dispatchService.updateRideStatus(rideId, 'in_progress'), 30000);
      setTimeout(() => dispatchService.updateRideStatus(rideId, 'completed'), 90000);

    } catch (err) {
      console.warn('[Dispatch] matchDriver error:', err);
    }
  },

  /**
   * Update the status of a ride.
   */
  async updateRideStatus(rideId: string, status: RideStatus, extra?: Record<string, any>): Promise<void> {
    if (rideId.startsWith('local_')) return;
    try {
      const rideRef = doc(db, COLLECTIONS.RIDES, rideId);
      const update: Record<string, any> = {
        status,
        updated_date: new Date().toISOString(),
        ...extra,
      };
      if (status === 'in_progress') update.started_at = new Date().toISOString();
      if (status === 'completed') update.completed_at = new Date().toISOString();
      if (status === 'cancelled') update.cancelled_at = new Date().toISOString();
      await updateDoc(rideRef, update);
    } catch (err) {
      console.warn('[Dispatch] updateRideStatus error:', err);
    }
  },

  /**
   * Cancel a ride with a reason.
   */
  async cancelRide(rideId: string, reason: string, cancellationFee = 0): Promise<void> {
    const extra: any = { cancel_reason: reason };
    if (cancellationFee > 0) extra.cancellation_fee = cancellationFee;
    await dispatchService.updateRideStatus(rideId, 'cancelled', extra);
  },

  /**
   * Listen to a ride document in real-time.
   * Returns an unsubscribe function.
   */
  listenToRide(rideId: string, onUpdate: (ride: RideRequest) => void): Unsubscribe {
    if (rideId.startsWith('local_')) {
      // Return a no-op unsubscribe for local simulation
      return () => {};
    }
    const rideRef = doc(db, COLLECTIONS.RIDES, rideId);
    return onSnapshot(rideRef, (snap) => {
      if (snap.exists()) {
        onUpdate({ id: snap.id, ...snap.data() } as RideRequest);
      }
    });
  },

  /**
   * Get a rider's wallet balance from Firestore.
   * Returns 0 if no wallet document exists yet.
   */
  async getWalletBalance(riderId: string): Promise<number> {
    try {
      const walletRef = doc(db, COLLECTIONS.WALLET, riderId);
      const snap = await getDoc(walletRef);
      if (snap.exists()) {
        return snap.data().balance ?? 0;
      }
      return 0;
    } catch {
      return 0;
    }
  },

  /**
   * Get a rider's trip history from Firestore.
   */
  async getRideHistory(riderId: string, limitNum = 20): Promise<RideRequest[]> {
    try {
      const ridesRef = collection(db, COLLECTIONS.RIDES);
      const q = query(
        ridesRef,
        where('rider_id', '==', riderId),
        orderBy('created_at', 'desc'),
        limit(limitNum)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as RideRequest));
    } catch {
      return [];
    }
  },

  /**
   * Submit a driver rating after a completed trip.
   * Also recalculates and updates the driver's average rating in DriverProfile.
   */
  async rateDriver(rideId: string, rating: number, comment?: string): Promise<void> {
    if (rideId.startsWith('local_')) return;
    try {
      const rideRef = doc(db, COLLECTIONS.RIDES, rideId);
      // Get the ride first to find driver_id
      const rideSnap = await getDoc(rideRef);
      const rideData = rideSnap.exists() ? rideSnap.data() : null;
      await updateDoc(rideRef, {
        rider_rating: rating,
        rider_comment: comment || '',
        updated_date: new Date().toISOString(),
      });
      // Recalculate driver's average rating from all their rated rides
      const driverId = rideData?.driver_id;
      if (driverId) {
        try {
          const ridesRef = collection(db, COLLECTIONS.RIDES);
          const q = query(ridesRef, where('driver_id', '==', driverId));
          const snap = await getDocs(q);
          const allRides = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
          // Merge in the just-submitted rating in case Firestore hasn't propagated yet
          const ratedRides = allRides
            .map(r => r.id === rideId ? { ...r, rider_rating: rating } : r)
            .filter(r => r.rider_rating && r.rider_rating > 0);
          if (ratedRides.length > 0) {
            const avg = ratedRides.reduce((sum: number, r: any) => sum + r.rider_rating, 0) / ratedRides.length;
            const avgRounded = parseFloat(avg.toFixed(2));
            // Try direct doc ID first (driver_id may be the DriverProfile Firestore doc ID)
            const dpRef = doc(db, COLLECTIONS.DRIVER_PROFILES, driverId);
            const dpSnap = await getDoc(dpRef);
            if (dpSnap.exists()) {
              await updateDoc(dpRef, { rating: avgRounded });
            } else {
              // Fallback: search DriverProfile by user_id
              const dpQuery = query(
                collection(db, COLLECTIONS.DRIVER_PROFILES),
                where('user_id', '==', driverId)
              );
              const dpQuerySnap = await getDocs(dpQuery);
              if (!dpQuerySnap.empty) {
                await updateDoc(dpQuerySnap.docs[0].ref, { rating: avgRounded });
              }
            }
          }
        } catch (ratingErr) {
          console.warn('[Dispatch] Failed to update driver average rating:', ratingErr);
        }
      }
    } catch (err) {
      console.warn('[Dispatch] rateDriver error:', err);
    }
  },

  /**
   * Add a tip to a completed ride.
   */
  async addTip(rideId: string, tipAmount: number): Promise<void> {
    if (rideId.startsWith('local_')) return;
    try {
      const rideRef = doc(db, COLLECTIONS.RIDES, rideId);
      await updateDoc(rideRef, {
        tip: tipAmount,
        updated_date: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Dispatch] addTip error:', err);
    }
  },
};
