import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_RIDER_ROUTE_STOPS,
  addRiderRouteStop,
  hasPendingRiderRouteStop,
  removeRiderRouteStop,
  setRiderRouteStop,
} from '../lib/rider-multi-stop';

const bookingScreen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider multi-stop route controls', () => {
  it('adds a visible empty stop row before its address is selected', () => {
    const stops = addRiderRouteStop<string>([]);
    expect(stops).toEqual([null]);
    expect(hasPendingRiderRouteStop(stops)).toBe(true);
  });

  it('fills only the stop row the Rider selected and preserves route order', () => {
    const first = addRiderRouteStop<string>([]);
    const second = addRiderRouteStop(first);
    const filled = setRiderRouteStop(setRiderRouteStop(second, 0, 'Airport'), 1, 'Osu');
    expect(filled).toEqual(['Airport', 'Osu']);
    expect(hasPendingRiderRouteStop(filled)).toBe(false);
  });

  it('lets the Rider remove an unneeded stop row with X', () => {
    const stops = ['Airport', null, 'Osu'];
    expect(removeRiderRouteStop(stops, 1)).toEqual(['Airport', 'Osu']);
  });

  it('caps the editable route at three stops and ignores invalid row mutations', () => {
    const full = ['Airport', 'Osu', 'Tema'];
    expect(addRiderRouteStop(full)).toBe(full);
    expect(removeRiderRouteStop(full, 3)).toBe(full);
    expect(setRiderRouteStop(full, -1, 'Labadi')).toBe(full);
    expect(MAX_RIDER_ROUTE_STOPS).toBe(3);
  });

  it('shows the added stop row, opens it for address entry, and exposes an X removal action', () => {
    expect(bookingScreen).toContain('setStops((previousStops) => addRiderRouteStop(previousStops));');
    expect(bookingScreen).toContain("'Add stop address'");
    expect(bookingScreen).toContain('handleEditStop(idx)');
    expect(bookingScreen).toContain('handleRemoveStop(idx)');
    expect(bookingScreen).toContain('Finish your route');
  });
});
