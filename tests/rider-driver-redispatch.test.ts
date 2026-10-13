import { describe, expect, it } from 'vitest';
import { assignmentReleaseActor, driverRedispatchCount, isAssignmentReleaseRedispatch } from '@/lib/rider-driver-redispatch';

describe('Assignment release re-dispatch state', () => {
  it('recognises only a reopened assigned-Driver request', () => {
    expect(isAssignmentReleaseRedispatch({ status: 'searching', reassigned_after_assignment_release: true })).toBe(true);
    expect(isAssignmentReleaseRedispatch({ status: 'matched', reassigned_after_assignment_release: true })).toBe(false);
    expect(isAssignmentReleaseRedispatch({ status: 'searching' })).toBe(false);
  });

  it('reports who released the previous Driver assignment', () => {
    expect(assignmentReleaseActor({ assignment_release_actor: 'rider' })).toBe('rider');
    expect(assignmentReleaseActor({ assignment_release_actor: 'driver' })).toBe('driver');
    expect(assignmentReleaseActor({ assignment_release_actor: 'system' })).toBeNull();
  });

  it('normalises the server-owned re-dispatch count', () => {
    expect(driverRedispatchCount({ driver_reassignment_count: 2 })).toBe(2);
    expect(driverRedispatchCount({ driver_reassignment_count: -1 })).toBe(0);
    expect(driverRedispatchCount({ driver_reassignment_count: 'not-a-number' })).toBe(0);
  });
});
