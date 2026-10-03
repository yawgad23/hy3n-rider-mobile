export type RiderStoredLocation = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export type RiderStoredSavedPlace = {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toStoredLocation(value: unknown): RiderStoredLocation | null {
  const source = record(value);
  if (!source) return null;

  const name = text(source.name) || text(source.address);
  const address = text(source.address) || name;
  const lat = coordinate(source.lat ?? source.latitude);
  const lng = coordinate(source.lng ?? source.longitude);

  if (!name || !address || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const placeId = text(source.placeId ?? source.place_id) || undefined;
  return { name, address, lat, lng, ...(placeId ? { placeId } : {}) };
}

function toStoredSavedPlace(value: unknown): RiderStoredSavedPlace | null {
  const source = record(value);
  if (!source) return null;

  const name = text(source.name) || text(source.address);
  const address = text(source.address) || name;
  if (!name || !address) return null;

  const lat = coordinate(source.lat ?? source.latitude);
  const lng = coordinate(source.lng ?? source.longitude);
  if ((lat === null) !== (lng === null)) return null;
  if (lat !== null && lng !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) return null;

  return lat === null || lng === null ? { name, address } : { name, address, lat, lng };
}

/** Safe replacement for raw JSON.parse on persisted destination search history. */
export function parseRiderStoredSearchHistory(value: string | null): RiderStoredLocation[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.map(toStoredLocation).filter((location): location is RiderStoredLocation => Boolean(location))
    : [];
}

/** Keeps only display-safe saved places; corrupt storage is treated as empty. */
export function parseRiderStoredSavedPlaces(value: string | null): RiderStoredSavedPlace[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.map(toStoredSavedPlace).filter((place): place is RiderStoredSavedPlace => Boolean(place))
    : [];
}

/** A rebook payload needs valid coordinates before it can reopen the booking sheet. */
export function parseRiderStoredRebookDestination(value: string | null): RiderStoredLocation | null {
  return toStoredLocation(parseJson(value));
}
