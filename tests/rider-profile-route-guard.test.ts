import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const tabs = readFileSync(path.join(process.cwd(), 'app/(tabs)/_layout.tsx'), 'utf8');
const root = readFileSync(path.join(process.cwd(), 'app/_layout.tsx'), 'utf8');
const completion = readFileSync(path.join(process.cwd(), 'app/complete-profile.tsx'), 'utf8');

describe('Rider required identity route guard', () => {
  it('sends incomplete Google and phone sign-ins to the completion screen before tabs render', () => {
    expect(tabs).toContain('riderProfileIsComplete(riderProfile)');
    expect(tabs).toContain("router.replace('/complete-profile' as any)");
    expect(tabs).toContain('if (!user || !onboardingChecked || !riderProfileIsComplete(riderProfile)) return null;');
  });

  it('registers a completion screen with a server-owned save operation', () => {
    expect(root).toContain('<Stack.Screen name="complete-profile" />');
    expect(completion).toContain('firebaseAuth.syncRiderProfile');
    expect(completion).toContain('Save and continue');
    expect(completion).toContain('Ghana mobile number');
  });
});
