import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rider runtime crash safety', () => {
  it('uses safe persisted-data parsers instead of raw JSON.parse in the Home restore effect', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
    const start = source.indexOf('  useEffect(() => {\n    AsyncStorage.getItem("savedPlaces")');
    const end = source.indexOf('  // Pending rating check:', start);
    const restoreBlock = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(restoreBlock).toContain('parseRiderStoredSavedPlaces(value)');
    expect(restoreBlock).toContain('parseRiderStoredSearchHistory(value)');
    expect(restoreBlock).toContain('parseRiderStoredRebookDestination(value)');
    expect(restoreBlock).not.toContain('JSON.parse');
  });

  it('wraps the native Rider route tree in an error recovery boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');
    expect(source).toContain('import { RiderErrorBoundary }');
    expect(source).toContain('<RiderErrorBoundary>');
    expect(source).toContain('</RiderErrorBoundary>');
  });
});
