export interface FareRecord {
  quoted_fare?: unknown;
  fare_estimate?: unknown;
  base_fare?: unknown;
  quotedFare?: unknown;
  final_fare?: unknown;
  finalFare?: unknown;
  fare?: unknown;
}

/** Matches the platform rule: .50 and below round down; above .50 round up. */
export function roundGhsFare(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  const whole = Math.floor(amount);
  return whole + (amount - whole > 0.5 ? 1 : 0);
}

/** The amount accepted by the Rider before the trip begins. */
export function getQuotedRideFare(ride: FareRecord): number {
  return roundGhsFare(
    ride.quoted_fare
      ?? ride.fare_estimate
      ?? ride.base_fare
      ?? ride.quotedFare
      ?? ride.fare
      ?? 0,
  );
}

/** The completed backend amount is authoritative for Rider receipts and wallet settlement. */
export function getFinalRideFare(ride: FareRecord): number {
  const backendFinal = Number(ride.final_fare ?? ride.finalFare);
  return Number.isFinite(backendFinal) && backendFinal >= 0
    ? roundGhsFare(backendFinal)
    : getQuotedRideFare(ride);
}
