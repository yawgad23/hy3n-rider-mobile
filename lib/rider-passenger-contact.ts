import { normalizeGhanaMobilePhone, toGhanaLocalPhoneInput } from './ghana-phone';

export type DeviceContactPhone = {
  number?: string;
  digits?: string;
  isPrimary?: boolean;
};

export type DevicePassengerContact = {
  name?: string | null;
  phoneNumbers?: DeviceContactPhone[] | null;
};

export type SelectedPassengerContact = {
  name: string;
  /** Ghana local nine-digit input, displayed beside the fixed +233 prefix. */
  localPhone: string;
};

/**
 * Selects one usable Ghana number from a device contact without persisting the
 * contact book. A primary number is preferred, then the first valid number.
 */
export function passengerFromDeviceContact(contact: DevicePassengerContact): SelectedPassengerContact | null {
  const name = String(contact.name ?? '').trim();
  if (name.length < 2) return null;

  const phones = [...(contact.phoneNumbers ?? [])]
    .sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)));

  for (const phone of phones) {
    const normalized = normalizeGhanaMobilePhone(phone.number || phone.digits || '');
    if (normalized) {
      return { name, localPhone: toGhanaLocalPhoneInput(normalized) };
    }
  }

  return null;
}
