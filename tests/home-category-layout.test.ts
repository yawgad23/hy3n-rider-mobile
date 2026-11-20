import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const home = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider Android pre-booking home layout', () => {
  it('keeps all service cards in a compact wrapping grid', () => {
    expect(home).toContain('flexDirection: "row", flexWrap: "wrap"');
    expect(home).toContain('minHeight: 92');
    expect(home).toContain('width: "31%"');
  });

  it('keeps the destination-first service selection above the booking flow', () => {
    expect(home).toContain('Choose a HY3N service');
    expect(home).toContain('openLocationSearch("destination")');
    expect(home).toContain('live prices and available Drivers');
  });
});
