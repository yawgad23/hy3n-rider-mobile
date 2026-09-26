import { isExpiredRiderSearch } from './rider-search-expiry';

export const ACTIVE_RIDE_STATUSES = [
  'searching',
  'matched',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
] as const;

export type ActiveRideStatus = (typeof ACTIVE_RIDE_STATUSES)[number];

export type RecoveredRideLocation = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type RecoveredActiveRide = {
  id: string;
  firestoreId: string;
  status: ActiveRideStatus;
  category: string;
  categoryId: string;
  pickup: string;
  pickupLocation: RecoveredRideLocation;
  destination: RecoveredRideLocation;
  distance: number;
  duration: number;
  fare: number;
  quotedFare: number;
  payment: string;
  paymentId: string;
  scheduled: string | null;
  ridePin?: string;
  surgeMultiplier?: number;
  driverId?: string;
  driverName?: string;
  driverRating?: number;
  driverVehicle?: string;
  driverServiceType?: string;
  driverPlate?: string;
  driverColour?: string;
  driverColourHex?: string;
  driverPhoto?: string;
  driverPhone?: string;
  driverLocation?: { lat: number; lng: number };
  driverBearing?: number;
  driverLocationUpdatedAt?: string;
  driverMomoNumber?: string;
  driverMomoNetwork?: string;
  matchedAt?: string;
  actualDistanceKm?: number;
  waitingFee?: number;
};

const finiteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const nonEmptyText = (value: unknown, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const activeStatus = (value: unknown): ActiveRideStatus | null => {
  const status = String(value ?? '').trim().toLowerCase();
  return (ACTIVE_RIDE_STATUSES as readonly string[]).includes(status)
    ? status as ActiveRideStatus
    : null;
};

const locationFrom = (
  value: unknown,
  fallbackName: string,
): RecoveredRideLocation => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const name = nonEmptyText(source.name ?? source.address ?? source.label, fallbackName);
  return {
    name,
    address: nonEmptyText(source.address ?? source.name ?? source.label, name),
    lat: finiteNumber(source.lat ?? source.latitude),
    lng: finiteNumber(source.lng ?? source.longitude),
  };
};

const driverPoint = (value: unknown): { lat: number; lng: number } | undefined => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const lat = finiteNumber(source.lat ?? source.latitude, Number.NaN);
  const lng = finiteNumber(source.lng ?? source.longitude, Number.NaN);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : undefined;
};

const driverPhoto = (value: unknown): string | undefined => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const candidates = [source.photo_url, source.photoUrl, source.avatar_url, source.avatarUrl, source.driver_photo, source.driverPhoto];
  return candidates
    .map((candidate) => String(candidate ?? '').trim())
    .find((candidate) => /^https?:\/\//i.test(candidate));
};

/**
 * Rebuilds an active trip entirely from its authoritative Firestore document.
 * This makes an accepted or in-progress ride reappear after an app force-close
 * instead of relying on the previous in-memory booking screen.
 */
export function recoverActiveRide(rawRide: Record<string, any>): RecoveredActiveRide | null {
  const status = activeStatus(rawRide.status);
  const id = nonEmptyText(rawRide.id);
  if (!status || !id) return null;
  // A new search can survive an app relaunch within its short dispatch window,
  // but an old, unaccepted search must never make the home screen look as if a
  // fresh Driver search began on login.
  if (status === 'searching' && isExpiredRiderSearch(rawRide)) return null;

  const pickupLocation = locationFrom(rawRide.pickup ?? rawRide.pickup_location, 'Pickup location');
  const destination = locationFrom(rawRide.destination ?? rawRide.destination_location, 'Destination');
  const driver = rawRide.driver && typeof rawRide.driver === 'object' ? rawRide.driver as Record<string, any> : {};
  const driverLocation = driverPoint(driver.location ?? rawRide.driver_location);
  const vehicle = nonEmptyText(rawRide.driver_vehicle, [driver.vehicle_make, driver.vehicle_model].filter(Boolean).join(' '));
  const quote = finiteNumber(rawRide.quoted_fare ?? rawRide.fare ?? rawRide.estimated_fare ?? rawRide.price);
  const ridePin = nonEmptyText(rawRide.pickup_code ?? rawRide.ride_pin);

  return {
    id,
    firestoreId: id,
    status,
    category: nonEmptyText(rawRide.category_name ?? rawRide.category, 'Standard'),
    categoryId: nonEmptyText(rawRide.category_id ?? rawRide.category, 'standard'),
    pickup: pickupLocation.name,
    pickupLocation,
    destination,
    distance: finiteNumber(rawRide.distance_km ?? rawRide.distance),
    duration: finiteNumber(rawRide.duration_minutes ?? rawRide.duration),
    fare: quote,
    quotedFare: quote,
    payment: nonEmptyText(rawRide.payment_display_name ?? rawRide.payment_label ?? rawRide.payment_method ?? rawRide.payment, 'Cash'),
    paymentId: nonEmptyText(rawRide.payment_method ?? rawRide.payment, 'cash'),
    scheduled: rawRide.scheduled_for ? String(rawRide.scheduled_for) : null,
    ridePin: ridePin || undefined,
    surgeMultiplier: finiteNumber(rawRide.surge_multiplier, 1),
    driverId: nonEmptyText(driver.id ?? rawRide.driver_id) || undefined,
    driverName: nonEmptyText(driver.name ?? rawRide.driver_name) || undefined,
    driverRating: optionalFiniteNumber(driver.rating ?? rawRide.driver_rating),
    driverVehicle: vehicle || undefined,
    driverServiceType: nonEmptyText(driver.service_type ?? driver.serviceType ?? rawRide.driver_service_type) || undefined,
    driverPlate: nonEmptyText(driver.plate ?? rawRide.driver_plate) || undefined,
    driverColour: nonEmptyText(driver.vehicle_colour ?? rawRide.driver_colour) || undefined,
    driverColourHex: nonEmptyText(driver.vehicle_colour_hex ?? rawRide.driver_colour_hex) || undefined,
    driverPhoto: driverPhoto(driver) ?? driverPhoto(rawRide),
    driverPhone: nonEmptyText(driver.phone ?? rawRide.driver_phone) || undefined,
    driverLocation,
    driverBearing: optionalFiniteNumber(driver.location?.heading ?? rawRide.driver_location?.heading),
    driverLocationUpdatedAt: nonEmptyText(driver.location?.recorded_at ?? rawRide.driver_location_updated_at) || undefined,
    driverMomoNumber: nonEmptyText(rawRide.driver_momo_number ?? driver.momo_number) || undefined,
    driverMomoNetwork: nonEmptyText(rawRide.driver_momo_network ?? driver.momo_network) || undefined,
    matchedAt: nonEmptyText(rawRide.matched_at ?? rawRide.accepted_at) || undefined,
    actualDistanceKm: optionalFiniteNumber(rawRide.actual_distance_km ?? rawRide.trip_meter?.distance_km),
    waitingFee: optionalFiniteNumber(rawRide.waiting_fee),
  };
}

export function recoverActiveRides(rawRides: Record<string, any>[]): RecoveredActiveRide[] {
  const deduplicated = new Map<string, RecoveredActiveRide>();
  rawRides.forEach((rawRide) => {
    const recovered = recoverActiveRide(rawRide);
    if (recovered) deduplicated.set(recovered.id, recovered);
  });
  return [...deduplicated.values()];
}
