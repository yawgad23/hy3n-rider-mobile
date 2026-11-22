// Keep native imports in the caller's lazy loader so Android/web never load
// Apple's iOS-only module. Dependency injection also lets tests exercise the
// actual flow without pretending that a Linux test runner is an iPhone.
type AppleAuthenticationModule = Pick<
  typeof import('expo-apple-authentication'),
  'isAvailableAsync' | 'signInAsync' | 'AppleAuthenticationScope'
>;
type CryptoModule = Pick<
  typeof import('expo-crypto'),
  'randomUUID' | 'digestStringAsync' | 'CryptoDigestAlgorithm'
>;

interface AppleUser {
  displayName: string | null;
}

export interface NativeAppleSignInDependencies<TUser extends AppleUser> {
  platform: string;
  loadModules: () => {
    nativeModuleAvailable: boolean;
    AppleAuthentication: AppleAuthenticationModule;
    Crypto: CryptoModule;
  };
  exchangeIdentityToken: (idToken: string, rawNonce: string) => Promise<TUser>;
  updateDisplayName: (user: TUser, displayName: string) => Promise<void>;
}

function appleSignInError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export async function signInWithNativeApple<TUser extends AppleUser>(
  dependencies: NativeAppleSignInDependencies<TUser>,
): Promise<TUser> {
  if (dependencies.platform !== 'ios') {
    throw appleSignInError(
      'apple/unsupported-platform',
      'Apple Sign-In in the mobile app is supported on iPhone and iPad only.',
    );
  }

  const { nativeModuleAvailable, AppleAuthentication, Crypto } = dependencies.loadModules();
  if (!nativeModuleAvailable) {
    // Expo's optional-module fallback resolves availability to false when the
    // native binding is absent. This is a build issue, not a faulty iPhone.
    throw appleSignInError(
      'apple/native-module-unavailable',
      'Apple Sign-In support is missing from this HY3N app build. Please use email or Google sign-in for now.',
    );
  }
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw appleSignInError(
      'apple/unavailable',
      'Apple Sign-In is currently unavailable. Please try again with HY3N in the foreground, or use email or Google sign-in.',
    );
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  const result = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!result.identityToken) {
    throw appleSignInError(
      'apple/missing-identity-token',
      'Apple Sign-In did not return an identity token. Please try again.',
    );
  }

  // Firebase must receive the original nonce, not the SHA-256 nonce sent to Apple.
  // Propagate cancellation and Firebase errors unchanged to the existing UI.
  const user = await dependencies.exchangeIdentityToken(result.identityToken, rawNonce);
  if (result.fullName && !user.displayName) {
    const displayName = [result.fullName.givenName, result.fullName.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (displayName) await dependencies.updateDisplayName(user, displayName);
  }
  // Returning Apple users may receive no name/email; their existing Firebase
  // identity and server-owned profile must not be replaced or recreated.
  return user;
}
