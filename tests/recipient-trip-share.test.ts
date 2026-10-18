import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const client = readFileSync(resolve(process.cwd(), 'lib/trip-share.ts'), 'utf8');
const layout = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');
const home = readFileSync(resolve(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
const screen = readFileSync(resolve(process.cwd(), 'app/trip-share/[shareId].tsx'), 'utf8');

describe('private recipient trip share', () => {
  it('uses phone-based private invitation and never sends a device token from the Rider client', () => {
    expect(client).toContain('/share/recipient');
    expect(client).toContain('JSON.stringify({ phone })');
    expect(client).not.toContain('ExpoPushToken');
    expect(home).toContain('createRecipientTripShare');
    expect(home).toContain('Send private HY3N invitation');
  });

  it('routes only a valid opaque share notification to the protected live view', () => {
    expect(layout).toContain("payload.type === 'trip_share'");
    expect(layout).toContain("pathname: '/trip-share/[shareId]'");
    expect(layout).toContain('getLastNotificationResponseAsync');
  });

  it('uses the native read-only map and clears the view when the server ends access', () => {
    expect(screen).toContain('getRecipientSharedTrip');
    expect(screen).toContain('<NativeGoogleMap');
    expect(screen).toContain("setState('ended')");
    expect(screen).not.toContain('driver_presence');
    expect(screen).not.toContain('firestoreDB');
  });
});
