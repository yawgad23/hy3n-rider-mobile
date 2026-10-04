import { describe, expect, it } from 'vitest';
import {
  riderLiveActivityEligible,
  riderLiveActivityPresentation,
} from '@/lib/rider-live-activity-presentation';

describe('Rider Live Activity presentation', () => {
  const ride = {
    id: 'ride-1',
    status: 'driver_arriving' as const,
    driverName: 'Kofi',
    pickupLocation: { name: 'Airport Junction' },
    destination: { name: 'Accra Mall' },
    routeDurationMinutes: 7,
  };

  it('shows a native pickup countdown with HY3N trip context', () => {
    expect(riderLiveActivityPresentation(ride, 1_000)).toEqual({
      title: 'Pickup in 7 min',
      subtitle: 'Kofi is heading to Airport Junction',
      etaMinutes: 7,
      arrivalAt: 421_000,
      progress: 0.15,
    });
  });

  it('changes to destination wording once the trip starts', () => {
    expect(riderLiveActivityPresentation({ ...ride, status: 'in_progress' }, 1_000)).toMatchObject({
      title: 'Arrival in 7 min',
      subtitle: 'Heading to Accra Mall',
      progress: 0.5,
    });
  });

  it('never starts a Live Activity while a request is merely searching', () => {
    expect(riderLiveActivityEligible('searching')).toBe(false);
    expect(riderLiveActivityEligible('driver_arriving')).toBe(true);
    expect(riderLiveActivityEligible('in_progress')).toBe(true);
  });
});
