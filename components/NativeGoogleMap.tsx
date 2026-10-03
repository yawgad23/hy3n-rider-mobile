import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { matchPointToServerRoute } from '@/lib/rider-route-matching';
import { isNativeMapPoint, nativeTrackingRegion, type NativeMapPoint } from '@/lib/native-map-camera';

export type NearbyDriver = {
  id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  serviceType?: string | null;
};

type NativeGoogleMapProps = {
  style?: StyleProp<ViewStyle>;
  colorScheme?: 'light' | 'dark' | null;
  center?: NativeMapPoint | null;
  zoom?: number;
  userLocation?: NativeMapPoint | null;
  destination?: NativeMapPoint | null;
  driverLocation?: NativeMapPoint | null;
  driverBearing?: number | null;
  driverColourHex?: string | null;
  driverVehicle?: string | null;
  driverServiceType?: string | null;
  driverEtaMinutes?: number | null;
  driverDistanceKm?: number | null;
  driverTracking?: boolean;
  driverTrackingTarget?: NativeMapPoint | null;
  driverRoutePoints?: NativeMapPoint[] | null;
  tripStatus?: string | null;
  safetySignal?: 'clear' | 'route_deviation' | 'long_stop';
  nearbyDrivers?: NearbyDriver[];
  onRouteMetrics?: (metrics: { distanceKm: number; durationMinutes: number; phase: 'pickup' | 'destination' }) => void;
};

export type NativeGoogleMapRef = {
  panTo: (latitude: number, longitude: number) => void;
  fitBounds: (points: NativeMapPoint[]) => void;
};

const FALLBACK_CENTER: NativeMapPoint = [5.6037, -0.187];
// The supplied 256px artwork is intentionally high-resolution. Render it at
// map-appropriate point sizes so a nearby vehicle does not cover roads or pins.
const ACTIVE_DRIVER_MARKER_SIZE = 38;
const NEARBY_DRIVER_MARKER_SIZE = 32;
const GOOGLE_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f2933' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d9e2ec' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2933' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#39424e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#222a33' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#5d6876' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
];

function coordinate(point: NativeMapPoint) {
  return { latitude: point[0], longitude: point[1] };
}

function safeColour(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

function markerAsset(serviceType?: string | null) {
  const type = String(serviceType || '').toLowerCase();
  if (type.includes('okada') || type.includes('motor') || type.includes('bike')) {
    return require('../assets/images/map-okada-marker.png');
  }
  if (type.includes('delivery') || type.includes('parcel') || type.includes('express')) {
    return require('../assets/images/map-delivery-marker.png');
  }
  return require('../assets/images/map-car-marker.png');
}

function CompactVehicleMarker({ serviceType, size }: { serviceType?: string | null; size: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={markerAsset(serviceType)} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

function initialRegion(center: NativeMapPoint): Region {
  return {
    latitude: center[0],
    longitude: center[1],
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  };
}

/**
 * The active Rider map is native Google Maps, not a browser page. GPS changes
 * animate the branded vehicle marker in place and the server-published route
 * stays visible underneath it.
 */
const NativeGoogleMap = forwardRef<NativeGoogleMapRef, NativeGoogleMapProps>(function NativeGoogleMap({
  style,
  colorScheme = 'light',
  center,
  userLocation,
  destination,
  driverLocation,
  driverBearing = null,
  driverColourHex = null,
  driverServiceType = null,
  driverTracking = false,
  driverTrackingTarget = null,
  driverRoutePoints = null,
  tripStatus = null,
  nearbyDrivers = [],
}, ref) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const userMovedMapRef = useRef(false);
  const previousDriverPointRef = useRef<NativeMapPoint | null>(null);
  const displayDriverPoint = useMemo(() => {
    const trustedRoute = (driverRoutePoints || []).filter(isNativeMapPoint);
    return matchPointToServerRoute(driverLocation, trustedRoute)?.point
      ?? (isNativeMapPoint(driverLocation) ? driverLocation : null);
  }, [driverLocation, driverRoutePoints]);
  const displayDriverBearing = useMemo(() => {
    const trustedRoute = (driverRoutePoints || []).filter(isNativeMapPoint);
    return matchPointToServerRoute(driverLocation, trustedRoute)?.bearing ?? driverBearing ?? 0;
  }, [driverBearing, driverLocation, driverRoutePoints]);
  const animatedDriverCoordinate = useRef(new AnimatedRegion(initialRegion(displayDriverPoint || FALLBACK_CENTER))).current;
  const trackedTarget = driverTracking && isNativeMapPoint(driverTrackingTarget) ? driverTrackingTarget : null;
  const routeCoordinates = useMemo(() => {
    const serverRoute = (driverRoutePoints || []).filter(isNativeMapPoint);
    if (serverRoute.length > 1) return serverRoute.map(coordinate);
    // A direct line is not a road route. The booking API and active-trip route
    // service publish the geometry that is safe to show to a Rider.
    return [];
  }, [destination, displayDriverPoint, driverRoutePoints, driverTracking, trackedTarget, userLocation]);
  const nearby = useMemo(() => nearbyDrivers
    .filter((driver) => isNativeMapPoint([driver.lat, driver.lng]))
    .slice(0, 8), [nearbyDrivers]);

  useEffect(() => {
    if (!displayDriverPoint) return;
    const nextRegion = initialRegion(displayDriverPoint);
    if (!previousDriverPointRef.current) {
      animatedDriverCoordinate.setValue(nextRegion);
    } else {
      animatedDriverCoordinate.timing({
        ...nextRegion,
        duration: 2_650,
        useNativeDriver: false,
      } as any).start();
    }
    previousDriverPointRef.current = displayDriverPoint;
  }, [animatedDriverCoordinate, displayDriverPoint]);

  useEffect(() => {
    // A completed trip unmounts this surface. On its remount, a camera command
    // issued before Google Maps reports ready is ignored by iOS, which leaves
    // the SDK's whole-world fallback viewport visible behind the home sheet.
    if (!mapReady) return;
    if (userMovedMapRef.current) return;
    if (!driverTracking && routeCoordinates.length > 1) {
      mapRef.current?.fitToCoordinates(routeCoordinates, {
        edgePadding: { top: 128, right: 32, bottom: 360, left: 32 },
        animated: true,
      });
      return;
    }
    const region = nativeTrackingRegion(
      displayDriverPoint,
      trackedTarget,
      isNativeMapPoint(userLocation) ? userLocation : (isNativeMapPoint(center) ? center : FALLBACK_CENTER),
    );
    if (!region) return;
    mapRef.current?.animateToRegion(region, displayDriverPoint && trackedTarget ? 650 : 350);
  }, [center, displayDriverPoint, driverTracking, mapReady, routeCoordinates, trackedTarget, userLocation]);

  useImperativeHandle(ref, () => ({
    panTo(latitude, longitude) {
      if (!isNativeMapPoint([latitude, longitude])) return;
      userMovedMapRef.current = true;
      mapRef.current?.animateToRegion(initialRegion([latitude, longitude]), 350);
    },
    fitBounds(points) {
      const valid = points.filter(isNativeMapPoint).map(coordinate);
      if (valid.length === 0) return;
      userMovedMapRef.current = true;
      if (valid.length === 1) mapRef.current?.animateToRegion(initialRegion(points[0]), 350);
      else mapRef.current?.fitToCoordinates(valid, { edgePadding: { top: 96, right: 32, bottom: 340, left: 32 }, animated: true });
    },
  }), []);

  const mapCenter = isNativeMapPoint(userLocation)
    ? userLocation
    : (isNativeMapPoint(center) ? center : FALLBACK_CENTER);
  const pickupPoint = driverTracking && tripStatus !== 'in_progress' ? trackedTarget : null;
  const destinationPoint = isNativeMapPoint(destination) && (!driverTracking || tripStatus === 'in_progress') ? destination : null;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion(mapCenter)}
        style={StyleSheet.absoluteFill}
        customMapStyle={colorScheme === 'dark' ? GOOGLE_DARK_STYLE : undefined}
        showsBuildings={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsScale={false}
        toolbarEnabled={false}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => { userMovedMapRef.current = true; }}
      >
        {routeCoordinates.length > 1 && <Polyline
          coordinates={routeCoordinates}
          strokeColor={driverTracking ? safeColour(driverColourHex, '#006B3F') : '#D4AF37'}
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
          zIndex={1}
        />}
        {isNativeMapPoint(userLocation) && <Marker
          coordinate={coordinate(userLocation)}
          pinColor="#006B3F"
          title="Your pickup spot"
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={2}
        />}
        {pickupPoint && <Marker
          coordinate={coordinate(pickupPoint)}
          pinColor="#006B3F"
          title="Pickup spot"
          description="Your Driver is heading here"
          zIndex={3}
        />}
        {destinationPoint && <Marker
          coordinate={coordinate(destinationPoint)}
          pinColor="#D4AF37"
          title="Destination"
          zIndex={3}
        />}
        {displayDriverPoint && <Marker.Animated
          coordinate={animatedDriverCoordinate as any}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={Number(displayDriverBearing) || 0}
          tracksViewChanges={false}
          title={tripStatus === 'in_progress' ? 'HY3N Driver en route' : 'Your HY3N Driver'}
          zIndex={8}
        >
          <CompactVehicleMarker serviceType={driverServiceType} size={ACTIVE_DRIVER_MARKER_SIZE} />
        </Marker.Animated>}
        {!driverTracking && nearby.map((driver) => <Marker
          key={`nearby-${driver.id}`}
          coordinate={{ latitude: driver.lat, longitude: driver.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={Number(driver.heading) || 0}
          opacity={0.82}
          tracksViewChanges={false}
          zIndex={4}
        >
          <CompactVehicleMarker serviceType={driver.serviceType} size={NEARBY_DRIVER_MARKER_SIZE} />
        </Marker>)}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e8edf2' },
});

export default NativeGoogleMap;
