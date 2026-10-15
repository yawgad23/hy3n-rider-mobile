import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider book-for-someone flow', () => {
  it('offers a native single-contact picker without collecting the contact book', () => {
    expect(screen).toContain('import * as Contacts from "expo-contacts";');
    expect(screen).toContain('const handleChoosePassengerFromContacts = async () => {');
    expect(screen).toContain('Contacts.presentContactPickerAsync()');
    expect(screen).toContain('Choose from contacts');
    expect(screen).toContain('does not upload your contact list');
  });

  it('keeps manual passenger entry available with Ghana +233 prefill', () => {
    expect(screen).toContain('Passenger name');
    expect(screen).toContain('🇬🇭 +233');
    expect(screen).toContain('placeholder="24 123 4567"');
    expect(screen).toContain('toGhanaLocalPhoneInput(value)');
  });

  it('normalizes the selected passenger number before the authenticated ride request', () => {
    expect(screen).toContain("bookForSomeone ? (normalizeGhanaMobilePhone(recipientPhone) || '')");
    expect(screen).toContain('passengerPhone,');
    expect(screen).toContain('bookingForOther: bookForSomeone');
  });
});
