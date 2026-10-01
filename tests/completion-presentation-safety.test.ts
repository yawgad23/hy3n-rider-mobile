import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { passiveCompletionPresentation, requiresPendingRatingBeforeBooking } from '@/lib/rider-completion-presentation';

describe('Rider completion presentation safety', () => {
  it('keeps the Driver completion transition passive while retaining a required rating', () => {
    expect(passiveCompletionPresentation({
      id: 'local-ride',
      firestoreId: 'server-ride',
      driverName: 'Kofi',
    })).toEqual({
      pendingRatingRideId: 'server-ride',
      pendingRatingDriverName: 'Kofi',
      showRatingModal: false,
      showPostRideModal: false,
      clearCompletedRidePreview: true,
    });
  });

  it('does not treat a missing completion identifier as a booking block', () => {
    expect(requiresPendingRatingBeforeBooking('server-ride')).toBe(true);
    expect(requiresPendingRatingBeforeBooking('')).toBe(false);
    expect(requiresPendingRatingBeforeBooking(null)).toBe(false);
  });

  it('does not auto-mount a native rating or receipt modal on the completion snapshot', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
    const start = source.indexOf('const presentation = passiveCompletionPresentation(activeRide);');
    const end = source.indexOf('// Rehydrate every non-final ride', start);
    const completionBlock = source.slice(start, end);

    expect(completionBlock).toContain('setShowRatingModal(presentation.showRatingModal)');
    expect(completionBlock).toContain('setShowPostRideModal(presentation.showPostRideModal)');
    expect(completionBlock).not.toContain('setShowRatingModal(true)');
    expect(completionBlock).not.toContain('setShowPostRideModal(true)');
    expect(completionBlock).not.toContain('setCompletedRideData({');
  });
});
