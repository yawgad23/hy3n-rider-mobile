export type RiderRideOptions = {
  ac: boolean;
  pet_friendly: boolean;
  extra_luggage: boolean;
  wheelchair_accessible: boolean;
};

export const DEFAULT_RIDE_OPTIONS: RiderRideOptions = {
  ac: false,
  pet_friendly: false,
  extra_luggage: false,
  wheelchair_accessible: false,
};

export const RIDE_OPTION_DEFINITIONS: Array<{
  key: keyof RiderRideOptions;
  label: string;
  description: string;
  icon: string;
}> = [
  { key: "ac", label: "Air conditioning", description: "Request a cooled vehicle", icon: "ac-unit" },
  { key: "pet_friendly", label: "Pet friendly", description: "Travel with a small pet", icon: "pets" },
  { key: "extra_luggage", label: "Extra luggage", description: "Bring additional bags", icon: "luggage" },
  { key: "wheelchair_accessible", label: "Wheelchair accessible", description: "Request an accessible vehicle", icon: "accessible" },
];

export function selectedRideOptionLabels(options: RiderRideOptions): string[] {
  return RIDE_OPTION_DEFINITIONS.filter(({ key }) => options[key]).map(({ label }) => label);
}

export function getCancellationPolicy(
  status: string,
  matchedAt?: string,
  now = Date.now(),
  freeWindowMs = 2 * 60 * 1000,
  cancellationFee = 5,
): { isFree: boolean; fee: number; message: string } {
  // The server permits cancellation only before Start Trip and records no fare,
  // waiting fee, or cancellation fee. These retained arguments preserve call
  // compatibility with older UI code without giving the device fee authority.
  void matchedAt;
  void now;
  void freeWindowMs;
  void cancellationFee;
  if (status === "in_progress") {
    return { isFree: true, fee: 0, message: "Trips cannot be cancelled after Start Trip. Contact support for a fare dispute." };
  }
  return { isFree: true, fee: 0, message: "Cancel before Start Trip without a charge." };
}

/** A reason is collected only after the request is connected to a Driver. */
export function requiresCancellationReason(status: string, driverId?: string): boolean {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return Boolean(String(driverId || '').trim())
    || ['matched', 'driver_arriving', 'driver_arrived', 'driver_queued'].includes(normalizedStatus);
}

export type SafetySignal = "clear" | "route_deviation" | "long_stop";

export function getSafetySignal({
  status,
  distanceFromRouteKm = 0,
  stoppedSeconds = 0,
  routeThresholdKm = 0.5,
  longStopThresholdSeconds = 180,
}: {
  status: string;
  distanceFromRouteKm?: number;
  stoppedSeconds?: number;
  routeThresholdKm?: number;
  longStopThresholdSeconds?: number;
}): SafetySignal {
  if (status !== "in_progress") return "clear";
  if (distanceFromRouteKm >= routeThresholdKm) return "route_deviation";
  if (stoppedSeconds >= longStopThresholdSeconds) return "long_stop";
  return "clear";
}

export function buildEmergencyAssistMessage(input: {
  rideId?: string;
  pickup: string;
  destination: string;
  driverName?: string;
  driverPlate?: string;
  driverVehicle?: string;
  latitude?: number;
  longitude?: number;
}): string {
  const location = input.latitude !== undefined && input.longitude !== undefined
    ? `\nLive location: https://maps.google.com/?q=${input.latitude},${input.longitude}`
    : "";

  return [
    "HY3N emergency assist request",
    input.rideId ? `Ride: ${input.rideId}` : undefined,
    `Pickup: ${input.pickup}`,
    `Destination: ${input.destination}`,
    `Driver: ${input.driverName || "Searching..."}`,
    input.driverVehicle ? `Vehicle: ${input.driverVehicle}` : undefined,
    input.driverPlate ? `Plate: ${input.driverPlate}` : undefined,
    location.trim(),
  ].filter(Boolean).join("\n");
}
