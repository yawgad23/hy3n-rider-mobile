import { describe, expect, it } from 'vitest';
import { RIDER_STATUS_RECONCILIATION_INTERVAL_MS } from '@/lib/rider-status-reconciliation';

describe('Rider status reconciliation cadence', () => {
  it('keeps the server fallback bounded instead of polling continuously', () => {
    expect(RIDER_STATUS_RECONCILIATION_INTERVAL_MS).toBe(4_000);
  });
});
