export type RiderVehicleArtworkKey = 'standard' | 'comfort' | 'kantanka' | 'okada' | 'delivery';

/** Shared premium vehicle artwork used by service cards and live map markers. */
export const RIDER_VEHICLE_ARTWORK = {
  standard: require('../assets/images/hy3n-standard-vehicle-512.png'),
  comfort: require('../assets/images/hy3n-comfort-vehicle-512.png'),
  kantanka: require('../assets/images/hy3n-kantanka-vehicle-512.png'),
  okada: require('../assets/images/hy3n-okada-vehicle-512.png'),
  delivery: require('../assets/images/hy3n-delivery-vehicle-512.png'),
} as const;

/** Compact silhouettes for live maps; intentionally separate from card renders. */
export const RIDER_MAP_MARKER_ARTWORK = {
  // Preserve the original HY3N map car for the standard vehicle marker.
  standard: require('../assets/images/map-car-marker.png'),
  comfort: require('../assets/images/map-comfort-vehicle-256.png'),
  kantanka: require('../assets/images/map-kantanka-vehicle-256.png'),
  okada: require('../assets/images/map-okada-vehicle-256.png'),
  delivery: require('../assets/images/map-delivery-vehicle-256.png'),
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
