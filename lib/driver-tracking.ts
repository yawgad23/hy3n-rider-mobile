/**
 * Real-Time Driver Tracking Service
 * Handles live driver location updates, ETA calculation, and distance tracking
 */

import { calculateDistance } from './dynamic-pricing';

export interface DriverLocation {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number; // km/h
}

export interface TrackingMetrics {
  driverLat: number;
  driverLng: number;
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  riderLat: number;
  riderLng: number;
}

/**
 * Calculate distance from driver to pickup location
 */
export function getDistanceToPickup(metrics: TrackingMetrics): number {
  return calculateDistance(
    metrics.driverLat,
    metrics.driverLng,
    metrics.pickupLat,
    metrics.pickupLng
  );
}

/**
 * Calculate distance from pickup to destination
 */
export function getDistanceToDestination(metrics: TrackingMetrics): number {
  return calculateDistance(
    metrics.pickupLat,
    metrics.pickupLng,
    metrics.destinationLat,
    metrics.destinationLng
  );
}

/**
 * Calculate total distance traveled so far
 * Used for dynamic pricing
 */
export function getTotalDistanceTraveled(
  startLat: number,
  startLng: number,
  currentLat: number,
  currentLng: number
): number {
  return calculateDistance(startLat, startLng, currentLat, currentLng);
}

/**
 * Estimate ETA in minutes based on distance and average speed
 * Average city speed: 30 km/h
 */
export function estimateETA(distanceKm: number, averageSpeedKmh: number = 30): number {
  if (distanceKm <= 0) return 0;
  return Math.ceil((distanceKm / averageSpeedKmh) * 60); // return minutes
}

/**
 * Format ETA as readable string (e.g., "5 min", "15 min")
 */
export function formatETA(minutes: number): string {
  if (minutes <= 0) return 'Arriving';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
}

/**
 * Format distance as readable string (e.g., "0.5 km", "2.3 km")
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 0.1) return '< 0.1 km';
  if (distanceKm < 1) return `${(distanceKm * 1000).toFixed(0)} m`;
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Determine if driver is close to pickup (within 500m)
 */
export function isDriverNearPickup(distanceToPickupKm: number): boolean {
  return distanceToPickupKm < 0.5;
}

/**
 * Determine if driver has arrived at pickup
 */
export function hasDriverArrivedAtPickup(distanceToPickupKm: number): boolean {
  return distanceToPickupKm < 0.05; // 50 meters
}

/**
 * Calculate bearing (direction) from point A to point B
 * Returns angle in degrees (0-360)
 */
export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  const bearing = Math.atan2(y, x) * (180 / Math.PI);
  return (bearing + 360) % 360;
}

/**
 * Interpolate position between two points (for smooth animation)
 */
export function interpolatePosition(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  progress: number // 0 to 1
): { lat: number; lng: number } {
  return {
    lat: lat1 + (lat2 - lat1) * progress,
    lng: lng1 + (lng2 - lng1) * progress,
  };
}
