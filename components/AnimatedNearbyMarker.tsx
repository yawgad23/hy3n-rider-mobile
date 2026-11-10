import React, { useEffect, useRef, useState } from 'react';
import { Easing } from 'react-native';
import { AnimatedRegion, Marker } from 'react-native-maps';

type Props = {
  latitude: number;
  longitude: number;
  /** Heading from the server, if any. When missing, direction of travel is used. */
  heading?: number | null;
  zIndex?: number;
  children: React.ReactNode;
};

const MIN_DURATION_MS = 1_500;
const MAX_DURATION_MS = 8_000;
const MIN_MOVE_METERS = 2;
// A car that "teleports" farther than this (new session, long gap) is placed
// directly instead of gliding across the city.
const MAX_GLIDE_METERS = 600;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const y = Math.sin(toRad(bLng - aLng)) * Math.cos(toRad(bLat));
  const x = Math.cos(toRad(aLat)) * Math.sin(toRad(bLat))
    - Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng - aLng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Adds the shortest signed turn so 350° -> 10° rotates 20°, not -340°. */
function unwrapAngle(previous: number, next: number) {
  const delta = ((next - previous + 540) % 360) - 180;
  return previous + delta;
}

/**
 * A nearby-car marker that glides to each new position instead of jumping,
 * and turns the car to face its direction of travel (Uber/Bolt style).
 * The animation lasts about as long as the gap between server updates, so the
 * car keeps moving until the next position arrives.
 */
export default function AnimatedNearbyMarker({ latitude, longitude, heading = null, zIndex = 9, children }: Props) {
  const region = useRef(
    new AnimatedRegion({ latitude, longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 }),
  ).current;
  const lastPointRef = useRef({ latitude, longitude });
  const lastUpdateAtRef = useRef<number>(Date.now());
  const rotationRef = useRef(Number(heading) || 0);
  const [rotation, setRotation] = useState(rotationRef.current);

  useEffect(() => {
    const last = lastPointRef.current;
    const moved = distanceMeters(last.latitude, last.longitude, latitude, longitude);
    const now = Date.now();
    const elapsed = now - lastUpdateAtRef.current;

    // Face the direction of travel; prefer the real heading when provided.
    const hasHeading = Number.isFinite(Number(heading)) && heading !== null;
    if (!hasHeading && moved < MIN_MOVE_METERS) return; // GPS jitter: keep the car still
    const movementHeading = moved >= MIN_MOVE_METERS
      ? bearingDegrees(last.latitude, last.longitude, latitude, longitude)
      : null;
    // While moving, the bearing between authenticated GPS samples is the most
    // stable direction for the visual car. Raw compass headings can fluctuate
    // by many degrees between samples and make a smoothly gliding marker shake
    // or rotate back and forth. Use the raw heading only while stationary,
    // when there is no reliable movement bearing to derive.
    const targetHeading = movementHeading ?? Number(heading);
    rotationRef.current = unwrapAngle(rotationRef.current, targetHeading);
    setRotation(rotationRef.current);

    // A stopped or slow-moving vehicle can still turn its heading. Apply that
    // rotation without animating GPS jitter as visible map movement.
    if (moved < MIN_MOVE_METERS) return;

    lastPointRef.current = { latitude, longitude };
    lastUpdateAtRef.current = now;

    if (moved > MAX_GLIDE_METERS) {
      region.setValue({ latitude, longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 });
      return;
    }

    const duration = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, elapsed));
    (region as any).timing({
      latitude,
      longitude,
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
      duration,
      // Constant speed reads as a car driving; ease-in/out looks like it stops.
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [latitude, longitude, heading, region]);

  return (
    <Marker.Animated
      coordinate={region as any}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={rotation}
      tracksViewChanges={false}
      zIndex={zIndex}
    >
      {children}
    </Marker.Animated>
  );
}

