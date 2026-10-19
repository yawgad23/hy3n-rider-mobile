import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('server-owned booking pickup ETA', () => {
  it('renders booking pickup time and nearby vehicle icons from the protected quote, never local Driver presence coordinates', () => {
    expect(screen).toContain('pickupEtaMinutes: currentSelectedQuote?.pickupEtaMinutes');
    expect(screen).toContain('nearbyDrivers={!activeRide ? (currentSelectedQuote?.nearbyVehicles ?? []) : []}');
    expect(screen).not.toContain('const closestVehicleEta = nearbyVehiclesForSelectedCategory[0]?.etaMinutes ?? null;');
    expect(screen).not.toContain('firestoreDB.subscribe(COLLECTIONS.DRIVER_PRESENCE');
  });
});
