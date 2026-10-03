import { getFinalRideFare, getQuotedRideFare } from "@/lib/fare";

export type RiderHistoryRide = {
  id: string;
  status: string;
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
export function normalizeRiderHistoryRide(record: Record<string, unknown>): RiderHistoryRide {
  const destination = record.destination;
  const pickup = record.pickup;
  const finalFare = getFinalRideFare(record);
  const quotedFare = getQuotedRideFare(record);
  const status = text(record.status, "completed").toLowerCase();

  return {
    id: text(record.id, text(record.ride_id, "unknown-ride")),
    status,
    category: text(record.category, "Ride"),
    destination_address: text(record.destination_address)
      || (destination && typeof destination === "object"
        ? text((destination as Record<string, unknown>).address) || text((destination as Record<string, unknown>).name)
        : text(destination))
      || "Destination not recorded",
    pickup_address: text(record.pickup_address)
      || (pickup && typeof pickup === "object"
        ? text((pickup as Record<string, unknown>).address) || text((pickup as Record<string, unknown>).name)
        : text(pickup))
      || "Pickup not recorded",
    distance: nonNegativeNumber(record.actual_distance_km ?? record.distance_km ?? record.distance),
    duration: nonNegativeNumber(record.actual_duration_min ?? record.duration_minutes ?? record.duration_min ?? record.duration),
    fare: nonNegativeNumber(finalFare),
    quoted_fare: nonNegativeNumber(quotedFare),
    final_fare: nonNegativeNumber(record.final_fare ?? record.finalFare ?? finalFare),
    payment: text(record.payment ?? record.payment_method, "Not recorded"),
    driver_name: text(record.driver_name ?? record.driverName) || undefined,
    driver_rating: nonNegativeNumber(record.driver_rating ?? record.driverRating) || undefined,
    driver_vehicle: text(record.driver_vehicle ?? record.driverVehicle) || undefined,
    driver_plate: text(record.driver_plate ?? record.driverPlate) || undefined,
    rider_rating: nonNegativeNumber(record.rider_rating ?? record.riderRating) || undefined,
    tip: nonNegativeNumber(record.tip ?? record.tip_amount),
    waiting_fee: nonNegativeNumber(record.waiting_fee ?? record.waitingFee),
    created_date: safeDate(record.created_date ?? record.created_at ?? record.completed_at ?? record.updated_date),
    scheduled_for: text(record.scheduled_for) || undefined,
    promo_code: text(record.promo_code) || undefined,
    discount: nonNegativeNumber(record.discount) || undefined,
    driver_id: text(record.driver_id ?? record.driverId) || undefined,
  };
}
