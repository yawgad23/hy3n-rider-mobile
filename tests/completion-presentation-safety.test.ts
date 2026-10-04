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
    const start = source.indexOf('const presentCompletedRide = useCallback');
    const end = source.indexOf('  useEffect(() => {', start);
    const completionBlock = source.slice(start, end);

    expect(completionBlock).toContain('setTerminalRide(terminal)');
    expect(completionBlock).toContain('setShowPostRideModal(false)');
    expect(completionBlock).toContain('setActiveRides((previous) => removeRide(previous, trackedRide.id))');
    expect(completionBlock).not.toContain('setShowRatingModal(true)');
    expect(completionBlock).not.toContain('setCompletedRideData({');
  });

  it('uses a rating-first completion view with an explicit mobile-network lost-item contact action', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
    const start = source.indexOf('const renderTerminalRide = () => {');
    const end = source.indexOf('  const renderActiveRide = () => {', start);
    const terminalView = source.slice(start, end);

    expect(terminalView).toContain('How was your ride?');
    expect(terminalView).toContain('Medaase');
    expect(terminalView).toContain('Thank you');
    expect(terminalView).not.toContain('Your feedback is anonymous.');
    expect(source).not.toContain('Your feedback is anonymous.');
    expect(terminalView).toContain('Left something behind?');
    expect(terminalView).toContain('Contact driver');
    expect(terminalView).toContain('handleContactCompletedDriver');
    expect(terminalView).not.toContain('Rate {terminalRide.driverName}');
  });

  it('uses Medaase and Thank you in the detailed post-trip rating sheet', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'components/post-ride-modal.tsx'), 'utf8');

    expect(source).toContain('Medaase');
    expect(source).toContain('Thank you');
    expect(source).not.toContain('Your feedback is anonymous.');
  });

  it('uses the authenticated status fallback to clear a completed ride when the Firestore listener is paused', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
    const start = source.indexOf('const reconcileStatuses = async () => {');
    const end = source.indexOf('  // A message becomes delivered', start);
    const fallbackBlock = source.slice(start, end);

    expect(fallbackBlock).toContain('riderTerminalStatus(ride.status)');
    expect(fallbackBlock).toContain("if (terminalStatus === 'completed') presentCompletedRide(trackedRide, ride)");
    expect(fallbackBlock).toContain('else removeActiveRide(trackedRide.id)');
    expect(fallbackBlock).toContain('!riderTerminalStatus(ride.status)');
  });
});
