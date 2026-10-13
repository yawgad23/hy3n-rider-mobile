export type FindAnotherRideOffer = {
  cancelledBy: 'rider' | 'driver';
  title: string;
  message: string;
};

/**
 * A replacement booking is only appropriate after an assigned Driver's
 * pre-trip ride ends. Searching requests still use the normal cancellation
 * path, and an in-progress trip must never expose a replacement flow here.
 */
export function findAnotherRideOffer(
  previousStatus: unknown,
  cancelledBy: unknown,
): FindAnotherRideOffer | null {
  const status = String(previousStatus || '').trim().toLowerCase();
  const actor = String(cancelledBy || '').trim().toLowerCase();
  const driverWasAssigned = ['matched', 'driver_arriving', 'driver_arrived', 'driver_queued'].includes(status);

  if (!driverWasAssigned) return null;

  if (actor === 'driver') {
    return {
      cancelledBy: 'driver',
      title: 'Your Driver cancelled',
      message: 'No fare was charged. Your pickup and destination are saved so you can find another ride.',
    };
  }

  return {
    cancelledBy: 'rider',
    title: 'Ride cancelled',
    message: 'No fare was charged. Your pickup and destination are saved so you can find another ride.',
  };
}
