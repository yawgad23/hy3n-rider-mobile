export type RiderLiveActivityStatus = 'matched' | 'driver_arriving' | 'driver_arrived' | 'in_progress';

export type RiderLiveActivityRide = {
  id: string;
  status: RiderLiveActivityStatus;
  driverName?: string;
  destination: { name?: string; address?: string };
  pickupLocation: { name?: string; address?: string };
  eta?: number;
  routeDurationMinutes?: number;
  /** Server-quoted trip distance at booking. Display-only in this module. */
  distance?: number;
  /** Server-published road distance still remaining to the active target. */
  routeDistanceKm?: number;
  routePhase?: 'pickup' | 'destination';
};

export type RiderLiveActivityPresentation = {
  title: string;
  subtitle: string;
  etaMinutes: number;
  arrivalAt: number;
  /** Numeric, display-only journey progress used by the native HY3N car line. */
  progress: number;
};

const MAX_ACTIVE_TRIP_PROGRESS = 0.98;

const safeText = (value: unknown, fallback: string) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 80) : fallback;
};

function finiteNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function progressFloor(value: unknown) {
  const number = finiteNonNegative(value);
  return number === null ? 0 : Math.min(MAX_ACTIVE_TRIP_PROGRESS, number);
}

function accraClockTime(timestamp: number) {
  return new Intl.DateTimeFormat('en-GH', {
    timeZone: 'Africa/Accra',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * Returns display-only trip progress from the server quote distance and the
 * latest server-published distance remaining. It never affects route pricing,
 * the trip meter, wallet, or settlement. Progress is monotonic during an
 * active trip so a route refresh cannot make the car jump backward.
 */
export function riderLiveTripProgress(
  ride: Pick<RiderLiveActivityRide, 'status' | 'distance' | 'routeDistanceKm' | 'routePhase'>,
  previousProgress = 0,
) {
  const previous = progressFloor(previousProgress);
  if (ride.status !== 'in_progress') return 0;
  if (ride.routePhase && ride.routePhase !== 'destination') return previous;

  const tripDistanceKm = finiteNonNegative(ride.distance);
  const remainingDistanceKm = finiteNonNegative(ride.routeDistanceKm);
  if (tripDistanceKm === null || tripDistanceKm <= 0 || remainingDistanceKm === null) return previous;

  // Keep the final small segment for the server-confirmed terminal update.
  // That means a delayed or briefly inaccurate route refresh can never show a
  // completed trip before the Driver and backend have completed it.
  const measured = Math.min(
    MAX_ACTIVE_TRIP_PROGRESS,
    Math.max(0, 1 - (remainingDistanceKm / tripDistanceKm)),
  );
  return Math.max(previous, measured);
}

export function riderLiveActivityEligible(status: string | null | undefined): status is RiderLiveActivityStatus {
  return ['matched', 'driver_arriving', 'driver_arrived', 'in_progress'].includes(String(status));
}

export function riderLiveActivityPresentation(
  ride: RiderLiveActivityRide,
  currentTime = Date.now(),
  previousProgress = 0,
): RiderLiveActivityPresentation {
  const rawEta = Number(ride.routeDurationMinutes ?? ride.eta ?? 5);
  const etaMinutes = Math.max(1, Math.min(180, Math.ceil(Number.isFinite(rawEta) ? rawEta : 5)));
  const destination = safeText(ride.destination?.name || ride.destination?.address, 'your destination');
  const pickup = safeText(ride.pickupLocation?.name || ride.pickupLocation?.address, 'your pickup point');
  const driver = safeText(ride.driverName, 'Your HY3N driver');
  const onTrip = ride.status === 'in_progress';
  const arrived = ride.status === 'driver_arrived';

  if (arrived) {
    return {
      title: 'Your driver has arrived',
      subtitle: `Meet ${driver} at ${pickup}`,
      etaMinutes: 1,
      arrivalAt: currentTime + 60_000,
      // The destination line must not appear complete while the vehicle is
      // still at pickup.
      progress: 0,
    };
  }

  const arrivalAt = currentTime + etaMinutes * 60_000;
  return {
    title: onTrip ? `Drop-off at ${accraClockTime(arrivalAt)}` : `Pickup in ${etaMinutes} min`,
    subtitle: onTrip ? `Heading to ${destination}` : `${driver} is heading to ${pickup}`,
    etaMinutes,
    arrivalAt,
    progress: riderLiveTripProgress(ride, previousProgress),
  };
}
