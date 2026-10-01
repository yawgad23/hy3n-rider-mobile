import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { Marker, Polyline, type LatLng, type Region } from "react-native-maps";

interface NearbyDriver {
  id: string;
  lat: number;
  lng: number;
  etaMinutes?: number;
  heading?: number;
  vehicleColourHex?: string;
  vehicleLabel?: string;
  serviceType?: string;
}

interface LeafletMapProps {
  style?: object;
  colorScheme?: "light" | "dark";
  center?: [number, number];
  zoom?: number;
  userLocation?: [number, number];
  destination?: [number, number] | null;
  driverLocation?: [number, number] | null;
  driverBearing?: number | null;
  driverColourHex?: string | null;
  driverVehicle?: string | null;
  driverServiceType?: string | null;
  driverEtaMinutes?: number | null;
  driverDistanceKm?: number | null;
  driverTracking?: boolean;
  driverTrackingTarget?: [number, number] | null;
  tripStatus?: string | null;
  safetySignal?: "clear" | "route_deviation" | "long_stop";
  nearbyDrivers?: NearbyDriver[];
  onRouteMetrics?: (metrics: { distanceKm: number; durationMinutes: number; phase: "pickup" | "destination" }) => void;
}

export interface LeafletMapRef {
  panTo: (lat: number, lng: number) => void;
  fitBounds: (points: [number, number][]) => void;
}

const FALLBACK_CENTER: [number, number] = [5.6037, -0.187];
const DEFAULT_DELTA = 0.035;

function isCoordinate(value: [number, number] | null | undefined): value is [number, number] {
  return Boolean(
    value
      && Number.isFinite(value[0])
      && Number.isFinite(value[1])
      && Math.abs(value[0]) <= 90
      && Math.abs(value[1]) <= 180,
  );
}

function point(value: [number, number]): LatLng {
  return { latitude: value[0], longitude: value[1] };
}

function regionFor(value: [number, number]): Region {
  return {
    ...point(value),
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  };
}

function normaliseColour(value?: string | null, fallback = "#F5F5F5") {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value! : fallback;
}

/**
 * Rider's native map surface.
 *
 * Keep this view intentionally conservative: the prior implementation mounted
 * react-native-maps through Fabric with Android-only/advanced native props and
 * moved the camera before the iOS map was ready. TestFlight crash reports for
 * builds 63 and 64 showed an ObjC TurboModule abort during that rollout.
 *
 * This component now uses only the cross-platform native MapView contract and
 * performs camera work only after onMapReady. The app configuration keeps this
 * package on React Native's stable legacy renderer until the upstream Fabric
 * path is proven safe on the supported iOS devices.
 */
const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    style,
    colorScheme = "dark",
    center = FALLBACK_CENTER,
    userLocation,
    destination = null,
    driverLocation = null,
    driverColourHex = null,
    driverVehicle = null,
    driverServiceType = null,
    driverEtaMinutes = null,
    driverDistanceKm = null,
    driverTracking = false,
    driverTrackingTarget = null,
    tripStatus = null,
    nearbyDrivers = [],
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const initialCenter = isCoordinate(userLocation) ? userLocation : (isCoordinate(center) ? center : FALLBACK_CENTER);

  const nearby = useMemo(
    () => nearbyDrivers
      .filter((driver) => Number.isFinite(driver.lat) && Number.isFinite(driver.lng)
        && Math.abs(driver.lat) <= 90 && Math.abs(driver.lng) <= 180)
      .slice(0, 4),
    [nearbyDrivers],
  );

  const focusPoint = driverTracking && isCoordinate(driverLocation)
    ? driverLocation
    : isCoordinate(userLocation)
      ? userLocation
      : initialCenter;

  const moveTo = useCallback((coordinate: [number, number], duration = 350) => {
    if (!mapReady || !isCoordinate(coordinate)) return;
    mapRef.current?.animateToRegion(regionFor(coordinate), duration);
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const timer = setTimeout(() => moveTo(focusPoint, 450), 0);
    return () => clearTimeout(timer);
  }, [focusPoint, mapReady, moveTo]);

  useImperativeHandle(ref, () => ({
    panTo(latitude: number, longitude: number) {
      moveTo([latitude, longitude]);
    },
    fitBounds(points: [number, number][]) {
      if (!mapReady) return;
      const coordinates = points.filter(isCoordinate).map(point);
      if (coordinates.length === 1) {
        moveTo([coordinates[0].latitude, coordinates[0].longitude]);
        return;
      }
      if (coordinates.length > 1) {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 96, right: 56, bottom: 300, left: 56 },
          animated: true,
        });
      }
    },
  }), [mapReady, moveTo]);

  const routeTarget = driverTracking && isCoordinate(driverLocation) && isCoordinate(driverTrackingTarget)
    ? driverTrackingTarget
    : !driverLocation && isCoordinate(userLocation) && isCoordinate(destination)
      ? destination
      : null;
  const routeStart = driverTracking && isCoordinate(driverLocation)
    ? driverLocation
    : isCoordinate(userLocation)
      ? userLocation
      : null;
  const routeCoordinates = routeStart && routeTarget ? [point(routeStart), point(routeTarget)] : [];
  const routeColor = driverTracking ? "#006B3F" : "#D4AF37";
  const driverTitle = driverVehicle || (driverServiceType ? `${driverServiceType} Driver` : "HY3N Driver");
  const metric = Number.isFinite(driverDistanceKm) && Number(driverDistanceKm) > 0
    ? `${Number(driverDistanceKm).toFixed(1)} km away`
    : Number.isFinite(driverEtaMinutes)
      ? `${Math.max(1, Math.round(Number(driverEtaMinutes)))} min away`
      : "Driver location";

  return (
    <View style={[{ flex: 1, backgroundColor: colorScheme === "dark" ? "#18232F" : "#E7EEF2" }, style]}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={regionFor(initialCenter)}
        mapType="standard"
        showsCompass={false}
        showsTraffic={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onMapReady={() => setMapReady(true)}
      >
        {isCoordinate(userLocation) && (
          <Marker coordinate={point(userLocation)} title="Your pickup location" pinColor="#006B3F" />
        )}
        {isCoordinate(destination) && (!driverTracking || tripStatus === "in_progress") && (
          <Marker coordinate={point(destination)} title="Destination" pinColor="#D4AF37" />
        )}
        {isCoordinate(driverLocation) && (
          <Marker
            coordinate={point(driverLocation)}
            title={driverTitle}
            description={metric}
            pinColor={normaliseColour(driverColourHex, "#006B3F")}
          />
        )}
        {driverTracking && isCoordinate(driverTrackingTarget) && tripStatus !== "in_progress" && (
          <Marker coordinate={point(driverTrackingTarget)} title="Pickup" pinColor="#006B3F" />
        )}
        {!driverTracking && nearby.map((driver) => (
          <Marker
            key={driver.id}
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            title={driver.vehicleLabel || "Nearby HY3N vehicle"}
            description={`${Math.max(1, Math.round(driver.etaMinutes || 1))} min away`}
            pinColor={normaliseColour(driver.vehicleColourHex, "#D4AF37")}
          />
        ))}
        {routeCoordinates.length === 2 && (
          <Polyline coordinates={routeCoordinates} strokeColor={routeColor} strokeWidth={5} />
        )}
      </MapView>
    </View>
  );
});

export default LeafletMap;
