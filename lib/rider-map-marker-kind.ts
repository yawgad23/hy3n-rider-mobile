export type RiderMapMarkerKind = 'car' | 'okada' | 'delivery';

/**
 * Resolve the visual vehicle kind from the service/category value used by the
 * active ride and nearby-driver feeds. Car Delivery is a car service, while
 * Express Delivery is the bike-with-box service.
 */
export function riderMapMarkerKind(serviceType: unknown): RiderMapMarkerKind {
  const normalized = String(serviceType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'car_delivery') return 'car';
  if (normalized.includes('okada') || normalized.includes('motor') || normalized.includes('bike')) return 'okada';
  if (normalized === 'delivery' || normalized === 'express_delivery' || normalized === 'expressdelivery' || normalized.includes('parcel')) return 'delivery';
  return 'car';
}
