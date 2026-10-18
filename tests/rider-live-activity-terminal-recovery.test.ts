import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../lib/rider-live-activity.ts'), 'utf8');

describe('Rider Live Activity terminal recovery', () => {
  it('does not cache a failed FCM token forever and refreshes auth for a retry', () => {
    expect(source).toContain('fcmTokenPromise = null');
    expect(source).toContain('activity.user.getIdToken(attempt > 0)');
    expect(source).toContain('scheduleActivityTokenRegistrationRetry');
  });

  it('keeps terminal cleanup retryable until native stop succeeds', () => {
    expect(source).toContain('scheduleLiveActivityStopRetry');
    const stopHelper = source.slice(source.indexOf('async function stopRiderLiveActivity'));
    expect(stopHelper.indexOf('await stopActivity(activity.activityId')).toBeLessThan(stopHelper.indexOf('activitiesByRideId.delete(activity.rideId)'));
  });
});
