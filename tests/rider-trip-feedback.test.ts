import { describe, expect, it } from 'vitest';
import { destinationArrivalReminder, shouldPromptForDestinationArrival } from '../lib/rider-trip-feedback';

describe('Rider destination-arrival reminder', () => {
  it('only prompts during a near-complete active trip', () => {
    expect(shouldPromptForDestinationArrival({ tripStatus: 'driver_arriving', routeDistanceKm: 0.1, routeDurationMinutes: 1 })).toBe(false);
    expect(shouldPromptForDestinationArrival({ tripStatus: 'in_progress', routeDistanceKm: 0.39, routeDurationMinutes: 4 })).toBe(true);
    expect(shouldPromptForDestinationArrival({ tripStatus: 'in_progress', routeDistanceKm: 1.2, routeDurationMinutes: 2 })).toBe(true);
    expect(shouldPromptForDestinationArrival({ tripStatus: 'in_progress', routeDistanceKm: 1.2, routeDurationMinutes: 4 })).toBe(false);
  });

  it('uses a practical belongings reminder without claiming arrival early', () => {
    expect(destinationArrivalReminder('Kotoka Airport')).toContain('Kotoka Airport');
    expect(destinationArrivalReminder('Kotoka Airport')).toContain('belongings');
  });
});
