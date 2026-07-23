/**
 * Dynamic Pricing Service
 * Calculates fare based on actual distance traveled during ride
 * Updates in real-time as rider moves
 */

import { RIDE_CATEGORIES, BOOKING_FEE } from '@/constants/rides';

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  waitingFare: number;
  bookingFee: number;
  surgeMultiplier: number;
  total: number;
}

export interface RideMetrics {
  startTime: number; // timestamp in ms
  actualDistanceKm: number; // actual distance traveled
  elapsedMinutes: number; // time elapsed
  waitingMinutes: number; // waiting time (after driver arrives)
  surgeMultiplier: number;
}

const FREE_WAITING_MINUTES = 3;

/**
 * Calculate fare based on actual distance and time traveled
 * Called periodically during active ride to update fare in real-time
 */
export function calculateDynamicFare(
  categoryId: string,
  metrics: RideMetrics
): FareBreakdown {
  const category = RIDE_CATEGORIES.find(c => c.id === categoryId);
  if (!category) {
    return {
      baseFare: 0,
      distanceFare: 0,
      timeFare: 0,
      waitingFare: 0,
      bookingFee: BOOKING_FEE,
      surgeMultiplier: 1,
      total: BOOKING_FEE,
    };
  }

  // Base fare (charged once)
  const baseFare = category.basePrice;

  // Distance fare: charge only for actual distance traveled
  const distanceFare = metrics.actualDistanceKm * category.pricePerKm;

  // Time fare: charge for elapsed time
  const timeFare = metrics.elapsedMinutes * category.pricePerMin;

  // Waiting fare: charge after free waiting period
  const freeWaitingFare = 0; // First 3 minutes are free
  const paidWaitingMinutes = Math.max(0, metrics.waitingMinutes - FREE_WAITING_MINUTES);
  const waitingFare = paidWaitingMinutes * category.waitingFeePerMin;

  // Subtotal before surge
  const subtotal = baseFare + distanceFare + timeFare + waitingFare;

  // Apply surge multiplier
  const withSurge = subtotal * metrics.surgeMultiplier;

  // Apply minimum fare
  const withMinFare = Math.max(withSurge, category.minFare);

  // Add booking fee
  const total = withMinFare + BOOKING_FEE;

  return {
    baseFare: parseFloat(baseFare.toFixed(2)),
    distanceFare: parseFloat(distanceFare.toFixed(2)),
    timeFare: parseFloat(timeFare.toFixed(2)),
    waitingFare: parseFloat(waitingFare.toFixed(2)),
    bookingFee: BOOKING_FEE,
    surgeMultiplier: metrics.surgeMultiplier,
    total: parseFloat(total.toFixed(2)),
  };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get fare breakdown for display
 * Shows itemized breakdown of charges
 */
export function getFareBreakdownText(breakdown: FareBreakdown): string[] {
  const lines: string[] = [];
  
  lines.push(`Base fare: GH₵${breakdown.baseFare.toFixed(2)}`);
  
  if (breakdown.distanceFare > 0) {
    lines.push(`Distance: GH₵${breakdown.distanceFare.toFixed(2)}`);
  }
  
  if (breakdown.timeFare > 0) {
    lines.push(`Time: GH₵${breakdown.timeFare.toFixed(2)}`);
  }
  
  if (breakdown.waitingFare > 0) {
    lines.push(`Waiting: GH₵${breakdown.waitingFare.toFixed(2)}`);
  }
  
  if (breakdown.surgeMultiplier > 1) {
    lines.push(`Surge (${(breakdown.surgeMultiplier * 100).toFixed(0)}%): Applied`);
  }
  
  lines.push(`Booking fee: GH₵${breakdown.bookingFee.toFixed(2)}`);
  lines.push(`Total: GH₵${breakdown.total.toFixed(2)}`);
  
  return lines;
}
