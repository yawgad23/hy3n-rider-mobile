import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider location search Android Back behavior', () => {
  it('uses the same safe dismissal for Android system Back and the visible back arrow', () => {
    const modalStart = screen.indexOf('{/* Search Modal */}');
    const modalEnd = screen.indexOf('{/* Schedule Modal */}', modalStart);
    const locationSearchModal = screen.slice(modalStart, modalEnd);

    expect(locationSearchModal).toContain('onRequestClose={dismissLocationSearch}');
    expect(locationSearchModal).toContain('onPress={dismissLocationSearch}');
  });

  it('removes an unused provisional stop before closing the route editor', () => {
    expect(screen).toContain("locationSearchMode === 'stop' && editingStopIndex !== null && stops[editingStopIndex] === null");
    expect(screen).toContain('handleRemoveStop(editingStopIndex);');
    expect(screen).toContain('setSearchOpen(false);');
  });
});
