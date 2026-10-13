import { readFileSync } from 'node:fs';
import path from 'node:path';
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

  it('keeps the same live request when the Rider asks to replace a slow Driver', () => {
    const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
    const redispatchStart = screen.indexOf('if (cancellation?.redispatched)');
    const terminalCancellation = screen.indexOf('removeActiveRide(cancelledRide.id);', redispatchStart);
    const redispatchBlock = screen.slice(redispatchStart, terminalCancellation);

    expect(redispatchStart).toBeGreaterThan(-1);
    expect(redispatchBlock).toContain("status: 'searching'");
    expect(redispatchBlock).toContain("assignmentReleaseActor: 'rider'");
    expect(redispatchBlock).toContain('return;');
    expect(redispatchBlock).not.toContain('setQuoteRefreshNonce');
    expect(redispatchBlock).not.toContain('resetBookingState');
  });
});
