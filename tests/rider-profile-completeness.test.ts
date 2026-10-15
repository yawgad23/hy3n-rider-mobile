import { describe, expect, it } from 'vitest';
import { riderProfileCompletionMessage, riderProfileIsComplete } from '../lib/rider-profile-completeness';

describe('Rider required account identity', () => {
  it('requires a real full name, an email, and a Ghana mobile number', () => {
    expect(riderProfileIsComplete({
      full_name: 'Ama Mensah',
      email: 'ama@example.com',
      phone: '0241234567',
    })).toBe(true);

    expect(riderProfileIsComplete({
      full_name: 'Unnamed account',
      email: 'ama@example.com',
      phone: '+233241234567',
    })).toBe(false);
    expect(riderProfileIsComplete({
      full_name: 'Ama Mensah',
      email: '',
      phone: '+233241234567',
    })).toBe(false);
    expect(riderProfileIsComplete({
      full_name: 'Ama Mensah',
      email: 'ama@example.com',
      phone: '05012',
    })).toBe(false);
  });

  it('explains the exact account details that a Rider must complete', () => {
    expect(riderProfileCompletionMessage()).toContain('full name, email address, and Ghana mobile number');
  });
});
