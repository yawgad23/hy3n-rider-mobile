export type RiderMapMarkerKind = 'standard' | 'comfort' | 'kantanka' | 'okada' | 'delivery';

/**
 * Resolve the visual vehicle kind from the service/category value used by the
 * active ride and nearby-driver feeds. Car Delivery remains a car visual,
 * while Express Delivery uses the delivery rider visual.
 */
export function riderMapMarkerKind(serviceType: unknown): RiderMapMarkerKind {
  const normalized = String(serviceType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('kantanka')) return 'kantanka';
  if (normalized === 'comfort' || normalized === 'premium') return 'comfort';
  if (normalized.includes('okada') || normalized.includes('motor') || normalized.includes('bike')) return 'okada';
  if (normalized === 'delivery' || normalized === 'express_delivery' || normalized === 'expressdelivery' || normalized.includes('parcel')) return 'delivery';
  return 'standard';
}
