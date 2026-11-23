import type { MapStyleElement } from 'react-native-maps';

/**
 * HY3N's iOS street-map presentation, inspired by the restrained Uber/Bolt
 * map palette. These are native Google Maps styles, not a Street View panorama
 * or a replacement map provider. Road and nearby-place text stays enabled;
 * Google still chooses which labels fit the current zoom and available data.
 */
export const RIDER_IOS_LIGHT_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F1F3F5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#44525C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F9FA' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#E2E6E9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D5DCE2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FAFBFC' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#BDC8D1' }] },
  { featureType: 'road', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#44525C' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E8ECEA' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#52615B' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#F7F9FA' }] },
  // Keep business names useful for pickup identification without a wall of
  // shop icons. Medical, park and transit landmark icons are not hidden.
  { featureType: 'poi.business', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D9E7DC' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#D4DBE1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BDD3DF' }] },
];

export const RIDER_IOS_DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#202B34' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#E0E6EB' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#202B34' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#2A3741' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#435360' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#25323C' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#536674' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2E3D48' }] },
  { featureType: 'road', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#F0F4F7' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#25323C' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#293B35' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#C7D8CE' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#202B34' }] },
  { featureType: 'poi.business', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#2C4438' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#3B4B59' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#163546' }] },
];

/** Display-only selection: never changes camera, GPS, routes or native keys. */
export function riderMapPresentation(
  platform: string,
  colorScheme: 'light' | 'dark' | null | undefined,
  legacyAndroidDarkStyle: MapStyleElement[],
): {
  customMapStyle: MapStyleElement[] | undefined;
  showsBuildings: boolean;
  showsPointsOfInterest: boolean;
} {
  const isIOS = platform === 'ios';
  return {
    customMapStyle: isIOS
      ? (colorScheme === 'dark' ? RIDER_IOS_DARK_MAP_STYLE : RIDER_IOS_LIGHT_MAP_STYLE)
      : (colorScheme === 'dark' ? legacyAndroidDarkStyle : undefined),
    showsBuildings: isIOS,
    // The Google iOS SDK's POI visibility is controlled by the JSON rules
    // above. This prop alone is not relied on to reveal Google POI labels.
    showsPointsOfInterest: isIOS,
  };
}
