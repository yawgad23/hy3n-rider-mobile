import { describe, expect, it } from 'vitest';
import { driverRedispatchCount, isDriverCancellationRedispatch } from '@/lib/rider-driver-redispatch';

describe('Driver cancellation re-dispatch state', () => {
  it('recognises only a reopened Driver-cancelled request', () => {
    expect(isDriverCancellationRedispatch({ status: 'searching', reassigned_after_driver_cancellation: true })).toBe(true);
    expect(isDriverCancellationRedispatch({ status: 'matched', reassigned_after_driver_cancellation: true })).toBe(false);
    expect(isDriverCancellationRedispatch({ status: 'searching' })).toBe(false);
  });

  it('normalises the server-owned re-dispatch count', () => {
    expect(driverRedispatchCount({ driver_reassignment_count: 2 })).toBe(2);
    expect(driverRedispatchCount({ driver_reassignment_count: -1 })).toBe(0);
    expect(driverRedispatchCount({ driver_reassignment_count: 'not-a-number' })).toBe(0);
  });
});
