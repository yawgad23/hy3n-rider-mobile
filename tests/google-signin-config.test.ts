import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const firebase = readFileSync(path.join(root, 'lib/firebase.ts'), 'utf8');
const config = readFileSync(path.join(root, 'app.config.ts'), 'utf8');
const plist = readFileSync(path.join(root, 'firebase/GoogleService-Info.plist'), 'utf8');

describe('Rider Google Sign-In native configuration', () => {
  it('pins the iOS client and web client during native configuration', () => {
    expect(firebase).toContain('iosClientId: GOOGLE_IOS_CLIENT_ID');
    expect(firebase).toContain('webClientId: googleWebClientId()');
    expect(firebase).toContain('offlineAccess: true');
  });

  it('keeps the Expo callback scheme aligned with GoogleService-Info.plist', () => {
    const scheme = 'com.googleusercontent.apps.362594902321-tesfioc66munsekhq8ghb5jvkkhk94m5';
    expect(config).toContain(`iosUrlScheme: "${scheme}"`);
    expect(plist).toContain(`<string>${scheme}</string>`);
  });

  it('uses the Rider iOS bundle identifier in the Firebase native file', () => {
    expect(plist).toContain('<key>BUNDLE_ID</key>');
    expect(plist).toContain('<string>com.hy3n.rider</string>');
  });
});
