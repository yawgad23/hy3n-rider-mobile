function normalizedDialNumber(value: unknown): string | null {
  const source = String(value || '').trim();
  if (!source) return null;
  const compact = source.replace(/[\s().-]/g, '');
  const number = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  if (!/^\+?\d{7,15}$/.test(number)) return null;
  return number;
}

/** Builds a native phone-network URL; no WebRTC or in-app call transport is used. */
export function driverMobileCallUrl(phone: unknown): string | null {
  const number = normalizedDialNumber(phone);
  return number ? `tel:${number}` : null;
}
