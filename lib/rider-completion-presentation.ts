export interface CompletionPresentationRide {
  id?: string | null;
  firestoreId?: string | null;
  driverName?: string | null;
}

/**
 * A Driver completion arrives while the live map and booking sheet are
 * reconfiguring. This keeps that state change passive: no native Modal or
 * receipt view should mount until the Rider explicitly chooses to rate or view
 * their completed trip.
 */
export function passiveCompletionPresentation(ride: CompletionPresentationRide) {
  const rideId = String(ride.firestoreId || ride.id || '').trim() || null;
  return {
    pendingRatingRideId: rideId,
    pendingRatingDriverName: String(ride.driverName || 'Your Driver').trim() || 'Your Driver',
    showRatingModal: false,
    showPostRideModal: false,
    clearCompletedRidePreview: true,
  } as const;
}

/** Rating remains required, but it is shown only after the Rider requests another trip. */
export function requiresPendingRatingBeforeBooking(rideId: string | null | undefined) {
  return Boolean(String(rideId || '').trim());
}
