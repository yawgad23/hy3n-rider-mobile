import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { riderProfileIsComplete } from '../lib/rider-profile-completeness';

const account = readFileSync(path.join(process.cwd(), 'app/(tabs)/account.tsx'), 'utf8');

describe('Rider account profile edits', () => {
  it('does not allow saved contact changes to remove the required identity fields', () => {
    expect(riderProfileIsComplete({ full_name: 'Ama Mensah', email: 'ama@example.com', phone: '0241234567' })).toBe(true);
    expect(riderProfileIsComplete({ full_name: 'Ama Mensah', email: '', phone: '0241234567' })).toBe(false);
    expect(account).toContain('riderProfileIsComplete({ full_name: editName, email: editEmail, phone: editPhone })');
    expect(account).toContain('Profile details required');
  });
});
