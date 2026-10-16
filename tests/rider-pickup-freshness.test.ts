import { describe, expect, it } from 'vitest';
import {
  riderPickupIsReadyForBooking,
  shouldRefreshRiderPickupOnForeground,
} from '@/lib/rider-pickup-freshness';

describe('Rider pickup freshness', () => {
  it('refreshes automatic device pickup when the Rider returns to HY3N', () => {
    expect(shouldRefreshRiderPickupOnForeground('device')).toBe(true);
    expect(shouldRefreshRiderPickupOnForeground('rider-selected')).toBe(false);
  });

  it('blocks a quote or booking until the pickup has been freshly confirmed', () => {
    expect(riderPickupIsReadyForBooking(false, [5.6037, -0.187])).toBe(false);
    expect(riderPickupIsReadyForBooking(true, [5.6037, -0.187])).toBe(true);
    expect(riderPickupIsReadyForBooking(true, [200, -0.187])).toBe(false);
  });
});
