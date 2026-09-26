/** Matches the server's six-minute Driver search window. */
export const RIDER_SEARCH_TTL_MS = 6 * 60 * 1000;

function timestamp(value: unknown): number | null {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function isExpiredRiderSearch(ride: Record<string, any>, currentTime = Date.now()): boolean {
  if (String(ride.status || '').trim().toLowerCase() !== 'searching') return false;
  const expiresAt = timestamp(ride.search_expires_at)
    ?? (() => {
      const createdAt = timestamp(ride.created_at ?? ride.created_date ?? ride.date);
      return createdAt === null ? null : createdAt + RIDER_SEARCH_TTL_MS;
    })();
  return expiresAt !== null && currentTime >= expiresAt;
}
