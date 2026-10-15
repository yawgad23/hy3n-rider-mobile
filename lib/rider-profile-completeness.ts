export type RiderAccountProfile = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined;

const PLACEHOLDER_NAMES = new Set([
  'rider',
  'hy3n rider',
  'unknown',
  'unknown account',
  'unnamed',
  'unnamed account',
]);

function hasRequiredName(value: unknown): boolean {
  const fullName = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return fullName.length >= 2 && !PLACEHOLDER_NAMES.has(fullName.toLowerCase());
}

function hasRequiredEmail(value: unknown): boolean {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasRequiredGhanaPhone(value: unknown): boolean {
  const raw = String(value ?? '').trim().replace(/[^\d+]/g, '');
  const normalized = raw.startsWith('+233')
    ? raw
    : raw.startsWith('00233')
      ? `+${raw.slice(2)}`
      : raw.startsWith('233')
        ? `+${raw}`
        : raw.startsWith('0')
          ? `+233${raw.slice(1)}`
          : `+233${raw}`;
  return /^\+233\d{9}$/.test(normalized);
}

/** A Rider cannot use HY3N services until all operational identity fields exist. */
export function riderProfileIsComplete(profile: RiderAccountProfile): boolean {
  return hasRequiredName(profile?.full_name)
    && hasRequiredEmail(profile?.email)
    && hasRequiredGhanaPhone(profile?.phone);
}

export function riderProfileCompletionMessage(): string {
  return 'Add your full name, email address, and Ghana mobile number to continue.';
}
