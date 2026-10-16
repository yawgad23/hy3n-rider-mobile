import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentPickupLabel } from '@/lib/rider-current-pickup';

const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider current pickup selection', () => {
  it('uses a readable address for the fresh device location and never keeps an old typed pickup label', () => {
    expect(currentPickupLabel([{ name: 'Adenta', street: 'New Legon Road', city: 'Accra' }])).toBe('Adenta, New Legon Road');
    expect(currentPickupLabel([{ name: 'Adenta', street: 'Adenta' }])).toBe('Adenta');
    expect(currentPickupLabel([])).toBe('Current location');
  });

  it('provides a separate current-location control while retaining manual pickup search', () => {
    expect(screen).toContain('const handleUseCurrentPickupLocation = useCallback(async () =>');
    expect(screen).toContain('ExpoLocation.getCurrentPositionAsync');
    expect(screen).toContain('setUserLocation([location.coords.latitude, location.coords.longitude]);');
    expect(screen).toContain('accessibilityLabel="Use current location for pickup"');
    expect(screen).toContain('onPress={() => openLocationSearch("pickup")}');
  });

  it('refreshes an automatic pickup on foreground return and blocks booking until coordinates are fresh', () => {
    expect(screen).toContain("AppState.addEventListener('change'");
    expect(screen).toContain('shouldRefreshRiderPickupOnForeground(pickupSelectionSourceRef.current)');
    expect(screen).toContain('riderPickupIsReadyForBooking(pickupLocationReady, userLocation)');
    expect(screen).toContain("pickupSelectionSourceRef.current = 'rider-selected';");
    expect(screen).toContain('pickupRefreshGenerationRef.current += 1;');
  });
});
