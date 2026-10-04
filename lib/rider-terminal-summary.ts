import { getFinalRideFare } from './fare';

export type RiderTerminalSummary = {
  id: string;
  firestoreId: string;
  finalFare: number;
  waitingFee: number;
  payment: string;
  paymentId: string;
  category: string;
  pickup: string;
  destination: string;
  driverName: string;
  driverRating: number;
  driverVehicle: string;
  driverPlate: string;
  driverPhone: string;
  distanceKm: number;
  durationMinutes: number;
};

type PreviousRide = {
  id: string;
  firestoreId?: string;
  fare?: unknown;
  waitingFee?: unknown;
  payment?: unknown;
  paymentId?: unknown;
  category?: unknown;
  pickup?: unknown;
  destination?: { name?: unknown };
  driverName?: unknown;
  driverRating?: unknown;
  driverVehicle?: unknown;
  driverPlate?: unknown;
  driverPhone?: unknown;
  distance?: unknown;
  duration?: unknown;
};

/**
 * Converts a final server snapshot into the only data the completion screen
 * may render. It intentionally excludes all live subscriptions, map points,
 * user-generated nested values, and native-module inputs.
 */
export function buildRiderTerminalSummary(
  previous: PreviousRide,
  serverRide: Record<string, unknown>,
): RiderTerminalSummary {
  const serverDriver = record(serverRide.driver);
  const serverVehicle = record(serverRide.vehicle);

  return {
    id: text(previous.id, 'completed-ride'),
    firestoreId: text(serverRide.id ?? previous.firestoreId ?? previous.id, previous.id),
    // The server final fare always wins. If an eventual-consistency snapshot
    // has not populated it yet, retain the last previously accepted quote for
    // display only; settlement remains server-owned.
    finalFare: money(getFinalRideFare({ ...serverRide, fare: serverRide.fare ?? previous.fare })),
    waitingFee: money(serverRide.waiting_fee ?? previous.waitingFee),
    payment: text(serverRide.payment_method ?? serverRide.payment ?? previous.payment, 'Selected method'),
    paymentId: text(serverRide.payment_method_id ?? serverRide.payment_id ?? previous.paymentId, ''),
    category: text(serverRide.category ?? serverRide.service_type ?? previous.category, 'Ride'),
    pickup: text(serverRide.pickup_address ?? serverRide.pickup ?? previous.pickup, 'Pickup location'),
    destination: text(
      serverRide.destination_address
        ?? serverRide.destination_name
        ?? serverRide.destination
        ?? previous.destination?.name,
      'Destination',
    ),
    driverName: text(serverDriver.name ?? serverRide.driver_name ?? previous.driverName, 'Driver'),
    driverRating: rating(serverDriver.rating ?? serverRide.driver_rating ?? previous.driverRating),
    driverVehicle: text(
      serverDriver.vehicle ?? serverRide.driver_vehicle ?? serverVehicle.name ?? previous.driverVehicle,
      'HY3N vehicle',
    ),
    driverPlate: text(serverDriver.plate ?? serverRide.driver_plate ?? previous.driverPlate, 'Not available'),
    // A Rider can use this only through the native phone dialer after the
    // completed ride. It never participates in pricing or settlement.
    driverPhone: text(serverDriver.phone ?? serverRide.driver_phone ?? previous.driverPhone, ''),
    distanceKm: nonNegative(serverRide.actual_distance_km ?? previous.distance),
    durationMinutes: whole(serverRide.actual_duration_minutes ?? serverRide.duration_minutes ?? previous.duration),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const result = String(value).trim().replace(/\s+/g, ' ');
  return result ? result.slice(0, 160) : fallback;
}

function nonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function money(value: unknown): number {
  return Math.round(nonNegative(value) * 100) / 100;
}

function rating(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? Math.round(parsed * 10) / 10 : 5;
}

function whole(value: unknown): number {
  return Math.max(0, Math.round(nonNegative(value)));
}
