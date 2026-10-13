import { describe, expect, it } from 'vitest';
import { findAnotherRideOffer } from '@/lib/rider-find-another-ride';

describe('Find another ride recovery', () => {
  it('offers a fresh search when a Rider cancels after a Driver has been assigned', () => {
    expect(findAnotherRideOffer('driver_arriving', 'rider')).toMatchObject({
      cancelledBy: 'rider',
      title: 'Ride cancelled',
    });
  });

  it('offers a fresh search when the assigned Driver cancels before the trip starts', () => {
    expect(findAnotherRideOffer('matched', 'driver')).toMatchObject({
      cancelledBy: 'driver',
      title: 'Your Driver cancelled',
    });
  });

  it('does not offer a duplicate search for an unassigned, started, or completed ride', () => {
    expect(findAnotherRideOffer('searching', 'rider')).toBeNull();
    expect(findAnotherRideOffer('in_progress', 'driver')).toBeNull();
    expect(findAnotherRideOffer('completed', 'driver')).toBeNull();
  });
});
