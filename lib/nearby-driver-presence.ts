export type NearbyVehicle = {
  id: string;
  lat: number;
  lng: number;
  heading?: number;
  vehicleColourHex?: string;
  vehicleLabel?: string;
  serviceType: 'car' | 'okada' | 'delivery';
  rideCategories: string[];
};

export const LIVE_DRIVER_LOCATION_MAX_AGE_MS = 3 * 60 * 1000;

const VEHICLE_COLOUR_HEX: Record<string, string> = {
  black: '#1A1A1A', white: '#F5F5F5', silver: '#C0C0C0', grey: '#808080',
  red: '#CE1126', blue: '#1D4ED8', green: '#006B3F', gold: '#D4AF37',
  brown: '#92400E', orange: '#EA580C', maroon: '#7F1D1D', yellow: '#FBBF24',
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const timestampToMilliseconds = (value: unknown): number | null => {
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!value || typeof value !== 'object') return null;
  const timestamp = value as {
    toMillis?: () => number;
    seconds?: number;
    _seconds?: number;
    nanoseconds?: number;
    _nanoseconds?: number;
  };
  if (typeof timestamp.toMillis === 'function') {
    const parsed = timestamp.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }
  const seconds = Number(timestamp.seconds ?? timestamp._seconds);
  if (!Number.isFinite(seconds)) return null;
  const nanoseconds = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0);
  return seconds * 1000 + (Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : 0);
};

const vehicleServiceType = (profile: Record<string, any>): NearbyVehicle['serviceType'] => {
  const explicit = String(profile.service_type || profile.serviceType || '').toLowerCase();
  const categories = Array.isArray(profile.ride_categories)
    ? profile.ride_categories.map((value: unknown) => String(value).toLowerCase())
    : [];
  if (explicit.includes('deliver') || categories.includes('express_delivery') || categories.includes('delivery')) return 'delivery';
  if (explicit.includes('okada') || explicit.includes('moto') || categories.includes('okada')) return 'okada';
  return 'car';
};

/** Converts one live Driver profile into the Rider map marker, or hides it. */
export const nearbyVehicleFromProfile = (
  profile: Record<string, any>,
  referenceMs = Date.now(),
): NearbyVehicle | null => {
  const availability = String(profile.availability_status || '').toLowerCase();
  const markedOnline = profile.is_online === true || availability === 'online';
  // Older installed Driver versions only wrote availability_status. Keep them
  // visible after a fresh GPS update, while never showing offline or busy cars.
  if (!markedOnline || profile.is_available === false || availability === 'offline' || availability === 'busy') return null;

  const location = profile.current_location || profile.location || {};
  const lat = toFiniteNumber(location.latitude ?? location.lat ?? profile.latitude ?? profile.current_lat);
  const lng = toFiniteNumber(location.longitude ?? location.lng ?? profile.longitude ?? profile.current_lng);
  if (lat === null || lng === null) return null;

  const locationUpdatedAtMs = timestampToMilliseconds(location.recorded_at ?? profile.last_location_update);
  // Availability is not a GPS heartbeat. Hide a marker without a recent
  // location timestamp so an offline or force-closed Driver does not remain
  // parked on the Rider map.
  if (locationUpdatedAtMs === null || locationUpdatedAtMs > referenceMs + 60_000) return null;
  if (referenceMs - locationUpdatedAtMs > LIVE_DRIVER_LOCATION_MAX_AGE_MS) return null;

  const colourName = String(profile.vehicle_colour || profile.vehicle_color || '').trim().toLowerCase();
  const vehicleColourHex = /^#[0-9a-fA-F]{6}$/.test(String(profile.vehicle_colour_hex || profile.vehicle_color_hex || ''))
    ? String(profile.vehicle_colour_hex || profile.vehicle_color_hex)
    : VEHICLE_COLOUR_HEX[colourName] || '#F5F5F5';
  const rideCategories = Array.isArray(profile.ride_categories)
    ? profile.ride_categories.map((value: unknown) => String(value).toLowerCase())
    : [];
  const heading = toFiniteNumber(location.heading ?? profile.heading);

  return {
    id: String(profile.user_id || profile.id),
    lat,
    lng,
    heading: heading ?? undefined,
    vehicleColourHex,
    vehicleLabel: `${profile.vehicle_make || profile.make || 'HY3N'} ${profile.vehicle_model || profile.model || 'vehicle'}`.trim(),
    serviceType: vehicleServiceType(profile),
    rideCategories,
  };
};

export const vehicleServesRideCategory = (vehicle: NearbyVehicle, categoryId: string) => {
  const category = String(categoryId || 'standard').toLowerCase();
  if (category === 'okada') return vehicle.serviceType === 'okada';
  if (category === 'express_delivery') return vehicle.serviceType === 'delivery';
  if (vehicle.serviceType !== 'car') return false;
  if (vehicle.rideCategories.length === 0) return true;
  if (category === 'standard') return vehicle.rideCategories.some((value) => ['standard', 'comfort', 'kantanka', 'executive'].includes(value));
  if (category === 'comfort') return vehicle.rideCategories.some((value) => ['comfort', 'kantanka', 'executive'].includes(value));
  return vehicle.rideCategories.includes(category);
};
