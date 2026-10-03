import { describe, expect, it } from 'vitest';
import {
  parseRiderStoredRebookDestination,
  parseRiderStoredSavedPlaces,
  parseRiderStoredSearchHistory,
} from '@/lib/rider-persisted-location';

describe('Rider persisted location recovery', () => {
  it('does not throw or retain corrupt JSON from a prior app session', () => {
    expect(() => parseRiderStoredSavedPlaces('{not-json')).not.toThrow();
    expect(parseRiderStoredSavedPlaces('{not-json')).toEqual([]);
    expect(parseRiderStoredSearchHistory('{not-json')).toEqual([]);
    expect(parseRiderStoredRebookDestination('{not-json')).toBeNull();
  });

  it('filters malformed stored entries before map and booking code can render them', () => {
    const raw = JSON.stringify([
      { name: 'Home', address: 'Adenta', lat: 5.7, lng: -0.2 },
      { name: '', address: 'Missing name' },
      { name: 'Out of range', address: 'Bad', lat: 123, lng: 0 },
      'not-a-place',
    ]);

    expect(parseRiderStoredSavedPlaces(raw)).toEqual([
      { name: 'Home', address: 'Adenta', lat: 5.7, lng: -0.2 },
      { name: 'Missing name', address: 'Missing name' },
    ]);
    expect(parseRiderStoredSearchHistory(raw)).toEqual([
      { name: 'Home', address: 'Adenta', lat: 5.7, lng: -0.2 },
    ]);
  });

  it('only restores a rebook destination that has safe text and coordinates', () => {
    expect(parseRiderStoredRebookDestination(JSON.stringify({
      name: 'Airport', address: 'Kotoka', lat: '5.605', lng: '-0.171', place_id: 'abc',
    }))).toEqual({ name: 'Airport', address: 'Kotoka', lat: 5.605, lng: -0.171, placeId: 'abc' });
    expect(parseRiderStoredRebookDestination(JSON.stringify({ name: 'Airport', address: 'Kotoka', lat: 0 }))).toBeNull();
  });
});
