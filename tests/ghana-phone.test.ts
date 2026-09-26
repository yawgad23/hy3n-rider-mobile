import { describe, expect, it } from 'vitest';
import { normalizeGhanaMobilePhone, toGhanaLocalPhoneInput } from '../lib/ghana-phone';

describe('Ghana mobile number helpers', () => {
  it.each([
    ['024 122 0725', '+233241220725'],
    ['241220725', '+233241220725'],
    ['+233 24 122 0725', '+233241220725'],
    ['00233241220725', '+233241220725'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizeGhanaMobilePhone(input)).toBe(expected);
  });

  it('rejects incomplete Ghana mobile numbers', () => {
    expect(normalizeGhanaMobilePhone('024 122 072')).toBeNull();
    expect(normalizeGhanaMobilePhone('not-a-number')).toBeNull();
  });

  it('retains only the local nine digits in the signup input', () => {
    expect(toGhanaLocalPhoneInput('+233 24 122 0725')).toBe('241220725');
    expect(toGhanaLocalPhoneInput('0241220725')).toBe('241220725');
  });
});
