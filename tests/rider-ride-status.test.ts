import { describe, expect, it } from 'vitest';
import { nonRegressiveRideStatus } from '@/lib/rider-ride-status';

describe('Rider status ordering', () => {
  it('does not regress an accepted trip back to searching from an out-of-order snapshot', () => {
    expect(nonRegressiveRideStatus('matched', 'searching')).toBe('matched');
    expect(nonRegressiveRideStatus('driver_arriving', 'matched')).toBe('driver_arriving');
  });

  it('allows legitimate forward status transitions', () => {
    expect(nonRegressiveRideStatus('searching', 'matched')).toBe('matched');
    expect(nonRegressiveRideStatus('driver_arrived', 'in_progress')).toBe('in_progress');
  });
});
