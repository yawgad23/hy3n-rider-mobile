import { describe, expect, it } from 'vitest';
import { driverMobileCallUrl } from '../lib/driver-mobile-call';

describe('Rider mobile-network Driver calling', () => {
  it('builds a native tel URL for a verified Ghana Driver number', () => {
    expect(driverMobileCallUrl('+233 24 123 4567')).toBe('tel:+233241234567');
    expect(driverMobileCallUrl('024-123-4567')).toBe('tel:0241234567');
  });

  it('rejects an absent or malformed contact rather than opening an invalid call', () => {
    expect(driverMobileCallUrl('')).toBeNull();
    expect(driverMobileCallUrl('Driver pending')).toBeNull();
  });
});
