import { getFinalRideFare, getQuotedRideFare } from "@/lib/fare";

export type RiderHistoryStatus = 'completed' | 'cancelled' | 'upcoming' | 'other';

export type RiderHistoryRide = {
  id: string;
  status: RiderHistoryStatus;
  category: string;
  destination_address: string;
  pickup_address: string;
  distance: number;
  duration: number;
  fare: number;
  quoted_fare?: number;
  final_fare?: number;
  payment: string;
  driver_name?: string;
  driver_rating?: number;
  driver_vehicle?: string;
  driver_plate?: string;
  rider_rating?: number;
  tip?: number;
  waiting_fee?: number;
  created_date: string;
  scheduled_for?: string;
  promo_code?: string;
  discount?: number;
  driver_id?: string;
};

type TimestampLike = {
  toDate?: () => Date;
  seconds?: unknown;
  nanoseconds?: unknown;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, finiteNumber(value));
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** The detail sheet must always receive one of its supported visual statuses. */
export function riderHistoryStatus(value: unknown): RiderHistoryStatus {
  const status = text(value, 'completed').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'upcoming' || status === 'scheduled') return 'upcoming';
  if (status === 'completed' || status === 'complete' || status === 'ended') return 'completed';
  return 'other';
}

export function riderHistoryStatusLabel(status: RiderHistoryStatus): string {
  return status === 'other' ? 'Ride recorded' : status;
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === "function") {
      const parsed = timestamp.toDate();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    const seconds = finiteNumber(timestamp.seconds, Number.NaN);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

function safeDate(value: unknown): string {
  return (dateFrom(value) || new Date(0)).toISOString();
}

/**
 * Converts older Firestore ride records into a detail-safe UI model. Historical
 * data can contain numeric fields stored as strings, missing route fields, and
 * Firestore timestamps. Every rendered total and distance is normalized here
 * before a user taps a past trip, preventing `.toFixed` runtime crashes.
 */
export function normalizeRiderHistoryRide(value: unknown): RiderHistoryRide {
  const source = record(value);
  const destination = source.destination;
  const pickup = source.pickup;
  const finalFare = getFinalRideFare(source);
  const quotedFare = getQuotedRideFare(source);
  const status = riderHistoryStatus(source.status);

  return {
    id: text(source.id, text(source.ride_id, "unknown-ride")),
    status,
    category: text(source.category, "Ride"),
    destination_address: text(source.destination_address)
      || (destination && typeof destination === "object"
        ? text((destination as Record<string, unknown>).address) || text((destination as Record<string, unknown>).name)
        : text(destination))
      || "Destination not recorded",
    pickup_address: text(source.pickup_address)
      || (pickup && typeof pickup === "object"
        ? text((pickup as Record<string, unknown>).address) || text((pickup as Record<string, unknown>).name)
        : text(pickup))
      || "Pickup not recorded",
    distance: nonNegativeNumber(source.actual_distance_km ?? source.distance_km ?? source.distance),
    duration: nonNegativeNumber(source.actual_duration_min ?? source.duration_minutes ?? source.duration_min ?? source.duration),
    fare: nonNegativeNumber(finalFare),
    quoted_fare: nonNegativeNumber(quotedFare),
    final_fare: nonNegativeNumber(source.final_fare ?? source.finalFare ?? finalFare),
    payment: text(source.payment ?? source.payment_method, "Not recorded"),
    driver_name: text(source.driver_name ?? source.driverName) || undefined,
    driver_rating: nonNegativeNumber(source.driver_rating ?? source.driverRating) || undefined,
    driver_vehicle: text(source.driver_vehicle ?? source.driverVehicle) || undefined,
    driver_plate: text(source.driver_plate ?? source.driverPlate) || undefined,
    rider_rating: nonNegativeNumber(source.rider_rating ?? source.riderRating) || undefined,
    tip: nonNegativeNumber(source.tip ?? source.tip_amount),
    waiting_fee: nonNegativeNumber(source.waiting_fee ?? source.waitingFee),
    created_date: safeDate(source.created_date ?? source.created_at ?? source.completed_at ?? source.updated_date),
    scheduled_for: text(source.scheduled_for) || undefined,
    promo_code: text(source.promo_code) || undefined,
    discount: nonNegativeNumber(source.discount) || undefined,
    driver_id: text(source.driver_id ?? source.driverId) || undefined,
  };
}
