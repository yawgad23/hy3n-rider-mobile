import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const auth = readFileSync(path.join(process.cwd(), 'lib/auth-context.tsx'), 'utf8');
const tabs = readFileSync(path.join(process.cwd(), 'app/(tabs)/_layout.tsx'), 'utf8');
const account = readFileSync(path.join(process.cwd(), 'app/(tabs)/account.tsx'), 'utf8');

describe('Rider sign-out flow', () => {
  it('uses one guarded native sign-out transition and invalidates late profile reads', () => {
    expect(auth).toContain('waitForRiderNativeUnmount');
    expect(auth).toContain('const [signingOut, setSigningOut] = useState(false);');
    expect(auth).toContain('const signOutPromiseRef = useRef<Promise<void> | null>(null);');
    expect(auth).toContain('authTransitionRef.current += 1;');
    expect(auth).toContain('if (!isCurrentSession()) return;');
  });

  it('unmounts Rider tabs during sign-out and prevents repeated guard redirects', () => {
    expect(tabs).toContain('const { user, riderProfile, loading, signingOut } = useAuth();');
    expect(tabs).toContain('if (signingOut) {');
    expect(tabs).toContain('if (!user || !onboardingChecked || !riderProfileIsComplete(riderProfile)) return null;');
  });

  it('leaves login routing to the shared tab auth guard', () => {
    expect(account).not.toContain("await signOut(); router.replace('/login' as any);");
    expect(account).not.toContain("await deleteAccount();\n              router.replace('/login' as any);");
  });
});
