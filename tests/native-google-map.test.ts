import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const component = readFileSync(path.join(process.cwd(), 'components/NativeGoogleMap.tsx'), 'utf8');
const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
const metroConfig = readFileSync(path.join(process.cwd(), 'metro.config.js'), 'utf8');
const appConfig = readFileSync(path.join(process.cwd(), 'app.config.ts'), 'utf8');

describe('Rider native Google Maps migration', () => {
  it('uses Google Maps with an animated branded driver marker, not a WebView', () => {
    expect(component).toContain('provider={PROVIDER_GOOGLE}');
    expect(component).toContain('Marker.Animated');
    expect(component).toContain('animatedDriverCoordinate.timing');
    expect(component).toContain('ACTIVE_DRIVER_MARKER_SIZE = 38');
    expect(component).toContain('NEARBY_DRIVER_MARKER_SIZE = 32');
    expect(component).toContain('CompactVehicleMarker');
    expect(component).not.toContain('react-native-webview');
  });

  it('renders the active Rider screen with the native renderer', () => {
    expect(screen).toContain('NativeGoogleMap');
    expect(screen).not.toContain('import LeafletMap from');
  });

  it('waits for the remounted native surface before applying the post-trip camera', () => {
    expect(component).toContain('const [mapReady, setMapReady] = useState(false)');
    expect(component).toContain('if (!mapReady) return;');
    expect(component).toContain('onMapReady={() => setMapReady(true)}');
    expect(component).toContain('animateToRegion(region');
  });

  it('renders a green, fully framed booking route with pickup and drop-off times', () => {
    expect(component).toContain("const HY3N_ROUTE_GREEN = '#007E4F';");
    expect(component).toContain('strokeColor={HY3N_ROUTE_GREEN}');
    expect(component).toContain('strokeColors={routeCoordinates.map(() => HY3N_ROUTE_GREEN)}');
    expect(component).toContain('bookingPickupTimeLabel');
    expect(component).toContain('bookingDropoffTimeLabel');
    expect(component).toContain('BookingEndpointMarker');
    expect(component).toContain('routeFrameCoordinates');
    expect(component).toContain('Keep the entire booking route and both time callouts above the sheet');
    expect(screen).toContain('bookingMapTimeLabels');
  });

  it('keeps a fresh online Driver visible on the map while the Rider compares another category', () => {
    expect(screen).toContain('const nearbyVehiclesForMap = nearbyDrivers');
    expect(screen).toContain('nearbyDrivers={(!activeRide || activeRide.status === "searching")');
    expect(screen).toContain('? nearbyVehiclesForMap.slice(0, 4)');
    expect(screen).toContain('Drivers nearby for another ride type');
    expect(screen).toContain('choose a matching type');
  });

  it('keeps the Maps stub web-only and resolves native SDK keys for both stores', () => {
    expect(metroConfig).toContain('moduleName === "react-native-maps" && platform === "web"');
    expect(metroConfig).not.toContain('if (moduleName === "react-native-maps") {');
    expect(appConfig).toContain('GOOGLE_MAPS_IOS_API_KEY');
    expect(appConfig).toContain('GOOGLE_MAPS_ANDROID_API_KEY');
    expect(appConfig).toContain('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS');
    expect(appConfig).toContain('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID');
    expect(appConfig).toContain('googleMapsApiKey');
    expect(appConfig).toContain('googleMaps: { apiKey');
  });
});
