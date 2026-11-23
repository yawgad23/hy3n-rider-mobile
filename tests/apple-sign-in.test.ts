import { describe, expect, it, vi } from 'vitest';
import { signInWithNativeApple, type NativeAppleSignInDependencies } from '../lib/apple-sign-in';

function setup() {
  const user = { uid: 'firebase-user', displayName: null as string | null, email: 'rider@privaterelay.appleid.com' };
  const result = {
    identityToken: 'apple-identity-token',
    fullName: { givenName: 'Nana', familyName: 'Yaw' },
    email: 'rider@privaterelay.appleid.com',
  } as Awaited<ReturnType<typeof import('expo-apple-authentication')['signInAsync']>>;
  const AppleAuthentication = {
    isAvailableAsync: vi.fn().mockResolvedValue(true),
    signInAsync: vi.fn().mockResolvedValue(result),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 } as typeof import('expo-apple-authentication')['AppleAuthenticationScope'],
  };
  const Crypto = {
    randomUUID: vi.fn().mockReturnValue('fresh-raw-nonce'),
    digestStringAsync: vi.fn().mockResolvedValue('sha256-hashed-nonce'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' } as typeof import('expo-crypto')['CryptoDigestAlgorithm'],
  };
  const modules = { nativeModuleAvailable: true, AppleAuthentication, Crypto };
  const dependencies = {
    platform: 'ios',
    loadModules: vi.fn(() => modules),
    exchangeIdentityToken: vi.fn().mockResolvedValue(user),
    updateDisplayName: vi.fn().mockResolvedValue(undefined),
  } satisfies NativeAppleSignInDependencies<typeof user>;
  return { dependencies, modules, AppleAuthentication, Crypto, result, user };
}

describe('native Apple sign-in execution', () => {
  it('rejects Android before importing native Apple modules', async () => {
    const { dependencies } = setup();
    dependencies.platform = 'android';
    await expect(signInWithNativeApple(dependencies)).rejects.toMatchObject({ code: 'apple/unsupported-platform' });
    expect(dependencies.loadModules).not.toHaveBeenCalled();
  });

  it('identifies missing native integration instead of blaming the device, without opening a sheet', async () => {
    const { dependencies, modules, AppleAuthentication, Crypto } = setup();
    modules.nativeModuleAvailable = false;
    await expect(signInWithNativeApple(dependencies)).rejects.toMatchObject({
      code: 'apple/native-module-unavailable',
      message: expect.stringContaining('HY3N app build'),
    });
    expect(AppleAuthentication.isAvailableAsync).not.toHaveBeenCalled();
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    expect(Crypto.randomUUID).not.toHaveBeenCalled();
    expect(dependencies.exchangeIdentityToken).not.toHaveBeenCalled();
  });

  it('retains the availability guard and never forces an unsafe native request', async () => {
    const { dependencies, AppleAuthentication, Crypto } = setup();
    AppleAuthentication.isAvailableAsync.mockResolvedValue(false);
    await expect(signInWithNativeApple(dependencies)).rejects.toMatchObject({ code: 'apple/unavailable' });
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    expect(Crypto.randomUUID).not.toHaveBeenCalled();
    expect(dependencies.exchangeIdentityToken).not.toHaveBeenCalled();
  });

  it('does not continue if the native availability lookup rejects', async () => {
    const { dependencies, AppleAuthentication } = setup();
    const error = new Error('native lookup failed');
    AppleAuthentication.isAvailableAsync.mockRejectedValue(error);
    await expect(signInWithNativeApple(dependencies)).rejects.toBe(error);
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });

  it('sends a SHA-256 nonce to Apple, the raw nonce to Firebase, and returns the same session user', async () => {
    const { dependencies, AppleAuthentication, Crypto, user } = setup();
    await expect(signInWithNativeApple(dependencies)).resolves.toBe(user);
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', 'fresh-raw-nonce');
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'sha256-hashed-nonce' });
    expect(dependencies.exchangeIdentityToken).toHaveBeenCalledWith('apple-identity-token', 'fresh-raw-nonce');
    expect(dependencies.updateDisplayName).toHaveBeenCalledWith(user, 'Nana Yaw');
  });

  it('creates a fresh nonce for each attempt rather than reusing a previous credential', async () => {
    const { dependencies, AppleAuthentication, Crypto } = setup();
    Crypto.randomUUID.mockReturnValueOnce('nonce-one').mockReturnValueOnce('nonce-two');
    Crypto.digestStringAsync.mockResolvedValueOnce('hash-one').mockResolvedValueOnce('hash-two');
    await signInWithNativeApple(dependencies);
    await signInWithNativeApple(dependencies);
    expect(AppleAuthentication.signInAsync.mock.calls.map(([options]) => options.nonce)).toEqual(['hash-one', 'hash-two']);
    expect(dependencies.exchangeIdentityToken.mock.calls.map(([, nonce]) => nonce)).toEqual(['nonce-one', 'nonce-two']);
  });

  it('never opens Apple authorization when nonce hashing fails', async () => {
    const { dependencies, AppleAuthentication, Crypto } = setup();
    const error = new Error('nonce hashing failed');
    Crypto.digestStringAsync.mockRejectedValue(error);
    await expect(signInWithNativeApple(dependencies)).rejects.toBe(error);
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });

  it('never exchanges an absent identity token or updates a profile', async () => {
    const { dependencies, AppleAuthentication, result } = setup();
    AppleAuthentication.signInAsync.mockResolvedValue({ ...result, identityToken: null });
    await expect(signInWithNativeApple(dependencies)).rejects.toMatchObject({ code: 'apple/missing-identity-token' });
    expect(dependencies.exchangeIdentityToken).not.toHaveBeenCalled();
    expect(dependencies.updateDisplayName).not.toHaveBeenCalled();
  });

  it('propagates cancellation unchanged so the existing UI silently dismisses it', async () => {
    const { dependencies, AppleAuthentication } = setup();
    const cancelled = Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
    AppleAuthentication.signInAsync.mockRejectedValue(cancelled);
    await expect(signInWithNativeApple(dependencies)).rejects.toBe(cancelled);
    expect(dependencies.exchangeIdentityToken).not.toHaveBeenCalled();
  });

  it('propagates Firebase account/linking errors without creating another identity', async () => {
    const { dependencies } = setup();
    const conflict = Object.assign(new Error('existing email'), { code: 'auth/account-exists-with-different-credential' });
    dependencies.exchangeIdentityToken.mockRejectedValue(conflict);
    await expect(signInWithNativeApple(dependencies)).rejects.toBe(conflict);
    expect(dependencies.exchangeIdentityToken).toHaveBeenCalledTimes(1);
    expect(dependencies.updateDisplayName).not.toHaveBeenCalled();
  });

  it('accepts returning Apple credentials without name/email and preserves the existing user', async () => {
    const { dependencies, AppleAuthentication, result, user } = setup();
    user.displayName = 'Existing Rider';
    AppleAuthentication.signInAsync.mockResolvedValue({ ...result, fullName: null, email: null });
    await expect(signInWithNativeApple(dependencies)).resolves.toBe(user);
    expect(user.email).toBe('rider@privaterelay.appleid.com');
    expect(user.displayName).toBe('Existing Rider');
    expect(dependencies.updateDisplayName).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing display name with first-consent Apple data', async () => {
    const { dependencies, user } = setup();
    user.displayName = 'Existing Rider';
    await signInWithNativeApple(dependencies);
    expect(dependencies.updateDisplayName).not.toHaveBeenCalled();
  });

  it('does not fabricate an empty Apple name; mandatory account completion remains necessary', async () => {
    const { dependencies, AppleAuthentication, result } = setup();
    AppleAuthentication.signInAsync.mockResolvedValue({ ...result, fullName: { givenName: null, familyName: null } });
    await signInWithNativeApple(dependencies);
    expect(dependencies.updateDisplayName).not.toHaveBeenCalled();
  });
});
