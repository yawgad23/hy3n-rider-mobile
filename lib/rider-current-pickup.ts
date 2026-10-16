export type ReverseGeocodedPickup = {
  name?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
};

/**
 * Keeps the Rider pickup label tied to the fresh GPS coordinate without
 * exposing raw coordinates as customer-facing address text.
 */
export function currentPickupLabel(results: ReverseGeocodedPickup[] | null | undefined): string {
  const first = results?.[0];
  if (!first) return 'Current location';

  const parts = [first.name, first.street, first.district, first.city]
    .map((value) => String(value ?? '').trim())
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);

  return parts.slice(0, 2).join(', ') || 'Current location';
}
