import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const firebase = readFileSync(path.join(root, 'lib/firebase.ts'), 'utf8');
const apple = readFileSync(path.join(root, 'lib/apple-sign-in.ts'), 'utf8');
const account = readFileSync(path.join(root, 'app/(tabs)/account.tsx'), 'utf8');
const config = readFileSync(path.join(root, 'app.config.ts'), 'utf8');

describe('Apple review rejection fixes', () => {
  it('guards native Apple Sign-In availability before opening the native sheet', () => {
    expect(firebase).toContain("requireOptionalNativeModule('ExpoAppleAuthentication')");
    expect(firebase).toContain('return signInWithNativeApple({');
    expect(apple).toContain('const available = await AppleAuthentication.isAvailableAsync();');
    expect(apple).toContain("if (!available) {");
    expect(apple).toContain('AppleAuthentication.signInAsync({');
    expect(apple.indexOf('isAvailableAsync();')).toBeLessThan(apple.indexOf('signInAsync({'));
  });

  it('uses a SHA-256 nonce and validates the Apple identity token before Firebase exchange', () => {
    expect(apple).toContain('const rawNonce = Crypto.randomUUID();');
    expect(apple).toContain('Crypto.CryptoDigestAlgorithm.SHA256');
    expect(apple).toContain('nonce: hashedNonce');
    expect(apple).toContain("if (!result.identityToken)");
    expect(apple).toContain('dependencies.exchangeIdentityToken(result.identityToken, rawNonce)');
    expect(firebase).toContain('provider.credential({ idToken, rawNonce })');
  });
});

describe('Profile photo rejection fixes', () => {
  it('wires Change Photo to the picker and handles denied and cancelled selection', () => {
    expect(account).toContain('onPress={handleChangePhoto}');
    expect(account).toContain('requestMediaLibraryPermissionsAsync');
    expect(account).toContain("if (!permission.granted)");
    expect(account).toContain('launchImageLibraryAsync');
    expect(account).toContain('if (result.canceled || !result.assets?.[0]?.uri) return;');
  });

  it('previews, uploads, and persists the selected profile photo', () => {
    expect(account).toContain('source={{ uri: profilePhoto }}');
    expect(account).toContain('firebaseStorage.uploadFile');
    expect(account).toContain('await updateProfile({ profile_picture: url });');
    expect(account).toContain("setPhotoLoading(false)");
  });

  it('declares iOS photo permission and Apple entitlement in generated and native config', () => {
    expect(config).toContain('NSPhotoLibraryUsageDescription');
    expect(config).toContain('usesAppleSignIn: true');
    expect(config).toContain('"com.apple.developer.applesignin": ["Default"]');
    expect(config).toContain('supportsTablet: true');
  });
});
