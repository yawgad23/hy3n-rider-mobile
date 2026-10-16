export type RiderPickupSelectionSource = 'device' | 'rider-selected';

/**
 * A fresh app open or foreground return must refresh an automatic device pickup.
 * A Rider-selected map address remains intentional for the current session.
 */
export function shouldRefreshRiderPickupOnForeground(source: RiderPickupSelectionSource) {
  return source === 'device';
}

/**
 * Coordinates must be freshly confirmed by the phone or deliberately selected
 * by the Rider before a quote or booking can be issued.
 */
export function riderPickupIsReadyForBooking(ready: boolean, point: readonly [number, number]) {
  const [latitude, longitude] = point;
  return ready
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180;
}
