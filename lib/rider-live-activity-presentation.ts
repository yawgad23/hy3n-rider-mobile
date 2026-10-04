export type RiderLiveActivityStatus = 'matched' | 'driver_arriving' | 'driver_arrived' | 'in_progress';

export type RiderLiveActivityRide = {
  id: string;
  status: RiderLiveActivityStatus;
  driverName?: string;
  destination: { name?: string; address?: string };
  pickupLocation: { name?: string; address?: string };
  eta?: number;
  routeDurationMinutes?: number;
};

export type RiderLiveActivityPresentation = {
  title: string;
  subtitle: string;
  etaMinutes: number;
  arrivalAt: number;
  progress: number;
};

const safeText = (value: unknown, fallback: string) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 80) : fallback;
};

export function riderLiveActivityEligible(status: string | null | undefined): status is RiderLiveActivityStatus {
  return ['matched', 'driver_arriving', 'driver_arrived', 'in_progress'].includes(String(status));
}

export function riderLiveActivityPresentation(
  ride: RiderLiveActivityRide,
  currentTime = Date.now(),
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
      progress: 1,
    };
  }

  return {
    title: onTrip ? `Arrival in ${etaMinutes} min` : `Pickup in ${etaMinutes} min`,
    subtitle: onTrip ? `Heading to ${destination}` : `${driver} is heading to ${pickup}`,
    etaMinutes,
    arrivalAt: currentTime + etaMinutes * 60_000,
    progress: onTrip ? 0.5 : 0.15,
  };
}
