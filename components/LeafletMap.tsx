import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
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
  return Boolean(value && Number.isFinite(value[0]) && Number.isFinite(value[1]));
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
 * Native Apple/Google map renderer for Rider. It deliberately avoids WebView,
 * Leaflet, and third-party tile scripts so an external CDN outage cannot leave
 * the booking screen as a blank panel on a production iPhone.
 */
const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    style,
    colorScheme = "dark",
    center = FALLBACK_CENTER,
    userLocation,
    destination = null,
    driverLocation = null,
    driverBearing = null,
    driverColourHex = null,
    driverVehicle = null,
    driverServiceType = null,
    driverEtaMinutes = null,
    driverDistanceKm = null,
    driverTracking = false,
    driverTrackingTarget = null,
    tripStatus = null,
    safetySignal = "clear",
    nearbyDrivers = [],
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const initialCenter = isCoordinate(userLocation) ? userLocation : (isCoordinate(center) ? center : FALLBACK_CENTER);

  const nearby = useMemo(
    () => nearbyDrivers
      .filter((driver) => Number.isFinite(driver.lat) && Number.isFinite(driver.lng))
      .slice(0, 4),
    [nearbyDrivers],
  );

  const focusPoint = driverTracking && isCoordinate(driverLocation)
    ? driverLocation
    : isCoordinate(userLocation)
      ? userLocation
      : initialCenter;

  useEffect(() => {
    mapRef.current?.animateToRegion(regionFor(focusPoint), 450);
  }, [focusPoint[0], focusPoint[1]]);

  useImperativeHandle(ref, () => ({
    panTo(latitude: number, longitude: number) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      mapRef.current?.animateToRegion(regionFor([latitude, longitude]), 350);
    },
    fitBounds(points: [number, number][]) {
      const coordinates = points.filter(isCoordinate).map(point);
      if (coordinates.length === 1) {
        mapRef.current?.animateToRegion(regionFor([coordinates[0].latitude, coordinates[0].longitude]), 350);
        return;
      }
      if (coordinates.length > 1) {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 96, right: 56, bottom: 300, left: 56 },
          animated: true,
        });
      }
    },
  }));

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
        showsBuildings={false}
        showsIndoors={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        userInterfaceStyle={colorScheme === "dark" ? "dark" : "light"}
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
            rotation={Number.isFinite(driverBearing) ? Number(driverBearing) : 0}
            flat
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
            rotation={Number.isFinite(driver.heading) ? Number(driver.heading) : 0}
            flat
          />
        ))}
        {routeCoordinates.length === 2 && (
          <Polyline coordinates={routeCoordinates} strokeColor={routeColor} strokeWidth={5} lineDashPattern={[10, 8]} />
        )}
      </MapView>
    </View>
  );
});

export default LeafletMap;
