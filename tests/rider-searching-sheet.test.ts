import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider searching request sheet', () => {
  it('keeps the cancellation control outside the scrolling request details', () => {
    const searchingBlockStart = screen.indexOf('{isSearching && (', screen.indexOf('const renderActiveRide'));
    const staticCancel = screen.indexOf('accessibilityLabel="Cancel ride request"', searchingBlockStart);
    const activeScrollClose = screen.indexOf('</ScrollView>', searchingBlockStart);

    expect(searchingBlockStart).toBeGreaterThan(-1);
    expect(activeScrollClose).toBeGreaterThan(searchingBlockStart);
    expect(staticCancel).toBeGreaterThan(activeScrollClose);
  });

  it('keeps a protected booking route visible after the request is created', () => {
    expect(screen).toContain('bookingRoutePoints: Array.isArray(createdRide.booking_route_points)');
    expect(screen).toContain('activeRide?.bookingRoutePoints');
  });
});
