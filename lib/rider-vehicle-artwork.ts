export type RiderVehicleArtworkKey = 'standard' | 'comfort' | 'kantanka' | 'okada' | 'delivery';

/** Shared premium vehicle artwork used by service cards and live map markers. */
export const RIDER_VEHICLE_ARTWORK = {
  standard: require('../assets/images/hy3n-standard-vehicle-512.png'),
  comfort: require('../assets/images/hy3n-comfort-vehicle-512.png'),
  kantanka: require('../assets/images/hy3n-kantanka-vehicle-512.png'),
  okada: require('../assets/images/hy3n-okada-vehicle-512.png'),
  delivery: require('../assets/images/hy3n-delivery-vehicle-512.png'),
} as const;

export function riderVehicleArtworkKey(value: unknown): RiderVehicleArtworkKey {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('kantanka')) return 'kantanka';
  if (normalized === 'comfort' || normalized === 'premium') return 'comfort';
  if (normalized.includes('okada') || normalized.includes('motor') || normalized.includes('bike')) return 'okada';
  if (normalized === 'delivery' || normalized === 'express_delivery' || normalized === 'expressdelivery' || normalized.includes('parcel')) return 'delivery';
  return 'standard';
}

export function riderVehicleArtworkFor(value: unknown) {
  return RIDER_VEHICLE_ARTWORK[riderVehicleArtworkKey(value)];
}
