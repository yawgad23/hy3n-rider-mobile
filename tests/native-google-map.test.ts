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
    expect(component).toContain('googleRenderer="LEGACY"');
    expect(component).toContain('Marker.Animated');
    expect(component).toContain('animatedDriverCoordinate.timing');
    expect(component).toContain('ACTIVE_DRIVER_MARKER_SIZE = 38');
    expect(component).toContain('NEARBY_DRIVER_MARKER_SIZE = 32');
    expect(component).toContain('CompactVehicleMarker');
    expect(component).toContain("require('../assets/images/hy3n-standard-ride-3d.png')");
    expect(component).toContain('HY3N\'s branded fleet artwork');
    expect(component).not.toContain("return require('../assets/images/map-car-marker.png')");
    expect(component).not.toContain('tintColor: safeColour');
    expect(component).toContain('Do not tint the realistic 3D car');
    expect(component).not.toContain('react-native-webview');
  });

  it('moves the active vehicle through fresh server road turns and cancels stale native queues', () => {
    expect(component).toContain('planRiderRouteAnimation');
    expect(component).toContain('driverRouteUpdatedAt');
    expect(component).toContain('animatedDriverCoordinate.stopAnimation');
    expect(component).toContain('animationGenerationRef');
    expect(component).toContain('previousFreshRouteRef');
    expect(component).toContain('rotation={visualDriverBearing}');
    expect(component).toContain('Stop at the exact in-flight native coordinate');
    expect(component).toContain('riderDriverMarkerMotionDuration');
    expect(component).toContain('without estimating a');
    expect(component).toContain('previousDriverUpdatedAtRef.current = nextUpdatedAt');
    expect(component).toContain('prior native animation completes');
    expect(screen).toContain('driverRouteUpdatedAt: reassignedAfterDriverCancellation ? undefined : (hasCurrentServerRoute');
    expect(screen).toContain('driverRouteUpdatedAt={activeRide?.driverRouteUpdatedAt ?? null}');
  });

  it('shows only the Driver vehicle on the Rider map after a trip starts', () => {
    expect(component).toContain("!bookingPreview && !driverTracking && tripStatus !== 'in_progress' && isNativeMapPoint(userLocation)");
    expect(component).toContain('overlapping green pins');
    expect(component).toContain('{pickupPoint && <Marker');
    expect(component).toContain("title={tripStatus === 'in_progress' ? 'HY3N Driver en route' : 'Your HY3N Driver'}");
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

  it('renders a green booking route with pickup-focused camera and time callouts', () => {
    expect(component).toContain("const HY3N_ROUTE_GREEN = '#007E4F';");
    expect(component).toContain('strokeColor={HY3N_ROUTE_GREEN}');
    expect(component).toContain('strokeColors={routeCoordinates.map(() => HY3N_ROUTE_GREEN)}');
    expect(component).toContain('bookingPickupTimeLabel');
    expect(component).toContain('bookingDropoffTimeLabel');
    expect(component).toContain('BookingEndpointMarker');
    expect(component).toContain('bookingPreviewRegion');
    expect(component).toContain('Do not fit a city-wide pickup-to-drop-off route automatically');
    expect(component).toContain('mapRef.current?.animateToRegion(region, 420);');
    expect(component).not.toContain('routeFrameCoordinates');
    expect(screen).toContain('bookingMapTimeLabels');
  });

  it('lets the Rider switch to full server-route details without changing tracking', () => {
    expect(component).toContain('routeOverview?: boolean;');
    expect(component).toContain('authoritativeRouteOverviewPoints(driverRoutePoints)');
    expect(component).toContain('if (routeOverview) return;');
    expect(component).toContain('mapRef.current?.fitToCoordinates(routeOverviewPoints.map(coordinate)');
    expect(component).toContain('routeOverviewFitRef.current = true;');
    expect(screen).toContain('const [routeOverview, setRouteOverview] = useState(false);');
    expect(screen).toContain('accessibilityLabel={routeOverview ? "Return to close live map" : "Show full route details"}');
    expect(screen).toContain('ROUTE DETAILS');
    expect(screen).toContain('routeOverview={routeOverview}');
  });

  it('keeps trunk artwork in service cards and uses the delivery bike marker on maps', () => {
    expect(component).toContain("require('../assets/images/map-delivery-marker.png')");
    expect(component).not.toContain("require('../assets/images/hy3n-car-delivery-open-trunk-card.png')");
    expect(screen).toContain('isDeliveryCategory(activeRide?.categoryId) ? activeRide?.categoryId');
  });

  it('keeps server-projected anonymous eligible vehicles visible before a Driver is assigned', () => {
    expect(screen).toContain('nearbyDrivers={!activeRide ? (currentSelectedQuote?.nearbyVehicles ?? []) : []}');
    expect(screen).toContain('eligibleDriverCount');
    expect(component).toContain('vehicleColourHex?: string | null;');
    expect(screen).not.toContain('firestoreDB.subscribe(COLLECTIONS.DRIVER_PRESENCE');
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
