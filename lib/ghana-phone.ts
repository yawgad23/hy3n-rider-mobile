/** Normalizes a Ghana mobile number to E.164 for HY3N account and ride records. */
export function normalizeGhanaMobilePhone(input: string): string | null {
  let digits = String(input ?? '').replace(/\D/g, '');

  if (digits.startsWith('00233')) digits = digits.slice(2);
  if (digits.startsWith('233')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);

  return /^\d{9}$/.test(digits) ? `+233${digits}` : null;
}

/** Keeps only the local nine-digit part for the Ghana phone input. */
export function toGhanaLocalPhoneInput(input: string): string {
  const normalized = normalizeGhanaMobilePhone(input);
  if (normalized) return normalized.slice(4);

  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('00233')) digits = digits.slice(5);
  else if (digits.startsWith('233')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
}
