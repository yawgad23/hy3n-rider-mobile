import { describe, expect, it } from 'vitest';
import { passengerFromDeviceContact } from '../lib/rider-passenger-contact';

describe('Rider passenger contact selection', () => {
  it('uses a primary Ghana number from the contact and keeps the local input digits', () => {
    expect(passengerFromDeviceContact({
      name: 'Gettys Mum',
      phoneNumbers: [
        { number: '+44 7700 900123' },
        { number: '+233 27 735 7033', isPrimary: true },
        { number: '024 111 2233' },
      ],
    })).toEqual({ name: 'Gettys Mum', localPhone: '277357033' });
  });

  it('uses the first valid Ghana number when no contact number is marked primary', () => {
    expect(passengerFromDeviceContact({
      name: 'Jessica',
      phoneNumbers: [
        { digits: '0550507574' },
        { number: '0241112233' },
      ],
    })).toEqual({ name: 'Jessica', localPhone: '550507574' });
  });

  it('rejects contacts without a name or valid Ghana mobile number', () => {
    expect(passengerFromDeviceContact({ name: 'A', phoneNumbers: [{ number: '0241112233' }] })).toBeNull();
    expect(passengerFromDeviceContact({ name: 'Abena', phoneNumbers: [{ number: '+44 7700 900123' }] })).toBeNull();
  });
});
