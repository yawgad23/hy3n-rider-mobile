import { describe, expect, it } from 'vitest';
import type { MapStyleElement } from 'react-native-maps';
import {
  RIDER_IOS_DARK_MAP_STYLE,
  RIDER_IOS_LIGHT_MAP_STYLE,
  riderMapPresentation,
} from '@/lib/rider-map-presentation';

type StyleRule = MapStyleElement;

const SUPPORTED_FEATURE_TYPES = new Set([
  'all',
  'administrative',
  'administrative.country',
  'administrative.land_parcel',
  'administrative.locality',
  'administrative.neighborhood',
  'administrative.province',
  'landscape',
  'landscape.man_made',
  'landscape.natural',
  'landscape.natural.landcover',
  'landscape.natural.terrain',
  'poi',
  'poi.business',
  'poi.government',
  'poi.medical',
  'poi.park',
  'poi.place_of_worship',
  'poi.school',
  'poi.sports_complex',
  'road',
  'road.arterial',
  'road.highway',
  'road.local',
  'transit',
  'transit.line',
  'transit.station',
  'water',
]);
const SUPPORTED_ELEMENT_TYPES = new Set([
  'all',
  'geometry',
  'geometry.fill',
  'geometry.stroke',
  'labels',
  'labels.icon',
  'labels.text',
  'labels.text.fill',
  'labels.text.stroke',
]);
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

function styleValue(styler: object, key: string): unknown {
  return (styler as Record<string, unknown>)[key];
}

function rulesFor(style: readonly StyleRule[], featureType: string, elementType: string): StyleRule[] {
  return style.filter((rule) => rule.featureType === featureType && rule.elementType === elementType);
}

function hasVisibility(style: readonly StyleRule[], featureType: string, elementType: string, visibility: string) {
  return rulesFor(style, featureType, elementType).some((rule) =>
    rule.stylers?.some((styler) => styleValue(styler, 'visibility') === visibility),
  );
}

function hasColor(style: readonly StyleRule[], featureType: string, elementType: string) {
  return rulesFor(style, featureType, elementType).some((rule) =>
    rule.stylers?.some((styler) => {
      const color = styleValue(styler, 'color');
      return typeof color === 'string' && HEX_COLOR.test(color);
    }),
  );
}

function expectValidGoogleStyle(style: readonly StyleRule[]) {
  expect(Array.isArray(style)).toBe(true);
  for (const rule of style) {
    expect(rule).toEqual(expect.objectContaining({ stylers: expect.any(Array) }));
    if (rule.featureType !== undefined) expect(SUPPORTED_FEATURE_TYPES.has(rule.featureType)).toBe(true);
    if (rule.elementType !== undefined) expect(SUPPORTED_ELEMENT_TYPES.has(rule.elementType)).toBe(true);
    for (const styler of rule.stylers ?? []) {
      for (const [key, value] of Object.entries(styler)) {
        expect(['color', 'visibility', 'weight', 'gamma', 'lightness', 'saturation', 'hue', 'invert_lightness']).toContain(key);
        if (key === 'color') expect(value).toMatch(HEX_COLOR);
        if (key === 'visibility') expect(['on', 'off', 'simplified']).toContain(value);
      }
    }
  }
}

function expectReadableRiderStyle(style: readonly StyleRule[]) {
  expectValidGoogleStyle(style);

  // Both base styles keep the road network and nearby names/buildings readable.
  expect(hasVisibility(style, 'road', 'labels.text', 'on')).toBe(true);
  expect(hasVisibility(style, 'poi', 'labels.text', 'on')).toBe(true);
  expect(hasVisibility(style, 'poi.business', 'labels.text', 'on')).toBe(true);
  expect(hasColor(style, 'landscape.man_made', 'geometry')).toBe(true);
  expect(hasColor(style, 'road', 'geometry')).toBe(true);
  expect(hasColor(style, 'road', 'geometry.stroke')).toBe(true);
  expect(hasColor(style, 'road', 'labels.text.fill')).toBe(true);
  expect(hasColor(style, 'road', 'labels.text.stroke')).toBe(true);
  expect(hasColor(style, 'poi', 'labels.text.fill')).toBe(true);
  expect(hasColor(style, 'poi', 'labels.text.stroke')).toBe(true);

  // Declutter only business icons; do not hide road/POI/building geometry or text.
  for (const rule of style) {
    const featureType = rule.featureType ?? '';
    const elementType = rule.elementType ?? '';
    const visibility = rule.stylers?.map((styler) => styleValue(styler, 'visibility')).find((value) => value !== undefined);
    if (visibility !== 'off') continue;
    expect(elementType).toBe('labels.icon');
    expect(featureType).toBe('poi.business');
  }
  for (const featureType of ['road', 'poi', 'building', 'landscape.man_made']) {
    for (const elementType of ['geometry', 'geometry.fill', 'geometry.stroke', 'labels.text', 'labels.text.fill', 'labels.text.stroke']) {
      expect(hasVisibility(style, featureType, elementType, 'off')).toBe(false);
    }
  }
  expect(hasVisibility(style, 'poi.business', 'labels.icon', 'off')).toBe(true);
}

describe('Rider iOS map presentation', () => {
  it('selects the light and dark iOS styles and keeps iOS map content visible', () => {
    expect(riderMapPresentation('ios', 'light', [])).toEqual({
      customMapStyle: RIDER_IOS_LIGHT_MAP_STYLE,
      showsBuildings: true,
      showsPointsOfInterest: true,
    });
    expect(riderMapPresentation('ios', 'dark', [])).toEqual({
      customMapStyle: RIDER_IOS_DARK_MAP_STYLE,
      showsBuildings: true,
      showsPointsOfInterest: true,
    });
    expect(riderMapPresentation('ios', null, []).customMapStyle).toBe(RIDER_IOS_LIGHT_MAP_STYLE);
    expect(riderMapPresentation('ios', undefined, []).customMapStyle).toBe(RIDER_IOS_LIGHT_MAP_STYLE);
  });

  it('preserves Android legacy behavior and the exact dark-style array identity without mutation', () => {
    const legacyDarkStyle = [{ featureType: 'road', stylers: [{ visibility: 'simplified' }] }];
    const before = JSON.stringify(legacyDarkStyle);
    expect(riderMapPresentation('android', 'dark', legacyDarkStyle)).toEqual({
      customMapStyle: legacyDarkStyle,
      showsBuildings: false,
      showsPointsOfInterest: false,
    });
    expect(riderMapPresentation('android', 'dark', legacyDarkStyle).customMapStyle).toBe(legacyDarkStyle);
    expect(JSON.stringify(legacyDarkStyle)).toBe(before);
    expect(riderMapPresentation('android', 'light', legacyDarkStyle).customMapStyle).toBeUndefined();
    expect(riderMapPresentation('android', null, legacyDarkStyle).customMapStyle).toBeUndefined();
    expect(riderMapPresentation('android', undefined, legacyDarkStyle).customMapStyle).toBeUndefined();
  });

  it('contains serializable, valid, readable neutral styles for both iOS themes', () => {
    expect(() => JSON.stringify(RIDER_IOS_LIGHT_MAP_STYLE)).not.toThrow();
    expect(() => JSON.stringify(RIDER_IOS_DARK_MAP_STYLE)).not.toThrow();
    expectReadableRiderStyle(RIDER_IOS_LIGHT_MAP_STYLE);
    expectReadableRiderStyle(RIDER_IOS_DARK_MAP_STYLE);
  });
});
