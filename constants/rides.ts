/**
 * Ride categories - EXACT from web app constants.js
 * Updated June 2026 - 10% fare increase
 */

export interface RideCategory {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  pricePerKm: number;
  pricePerMin: number;
  waitingFeePerMin: number;
  minFare: number;
  seats: number;
  icon: string;
}

export const RIDE_CATEGORIES: RideCategory[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Affordable everyday rides",
    basePrice: 11.00,
    pricePerKm: 4.18,
    pricePerMin: 0.44,
    waitingFeePerMin: 0.55,
    minFare: 16.50,
    seats: 4,
    icon: "directions-car",
  },
  {
    id: "comfort",
    name: "Comfort",
    description: "Comfortable rides with extra amenities",
    basePrice: 16.50,
    pricePerKm: 5.06,
    pricePerMin: 0.66,
    waitingFeePerMin: 0.88,
    minFare: 27.50,
    seats: 4,
    icon: "star",
  },
  {
    id: "kantanka",
    name: "Kantanka",
    description: "Proudly Ghanaian-made mini SUVs",
    basePrice: 13.20,
    pricePerKm: 4.62,
    pricePerMin: 0.55,
    waitingFeePerMin: 0.66,
    minFare: 22.00,
    seats: 4,
    icon: "directions-car",
  },
  {
    id: "executive",
    name: "Executive",
    description: "Luxury travel for special occasions",
    basePrice: 27.50,
    pricePerKm: 6.60,
    pricePerMin: 1.10,
    waitingFeePerMin: 1.65,
    minFare: 44.00,
    seats: 4,
    icon: "verified-user",
  },
  {
    id: "okada",
    name: "Okada",
    description: "Fast bike rides to beat traffic",
    basePrice: 5.50,
    pricePerKm: 1.65,
    pricePerMin: 0.33,
    waitingFeePerMin: 0.33,
    minFare: 8.80,
    seats: 1,
    icon: "two-wheeler",
  },
  {
    id: "express_delivery",
    name: "Express Delivery",
    description: "Fast package delivery across the city",
    basePrice: 16.50,
    pricePerKm: 2.20,
    pricePerMin: 0.55,
    waitingFeePerMin: 0.55,
    minFare: 22.00,
    seats: 0,
    icon: "inventory",
  }
];

export const FREE_WAITING_MINUTES = 3;
export const BOOKING_FEE = 2.50; // GH₵2.50 booking fee (like Uber)

export const PAYMENT_METHODS = [
  { id: "cash", name: "Cash", icon: "payments" as const },
  { id: "mobile_money", name: "MoMo", icon: "phone-android" as const },
  { id: "wallet", name: "Wallet", icon: "account-balance-wallet" as const },
  { id: "card", name: "Card", icon: "credit-card" as const },
];

export const POPULAR_DESTINATIONS = [
  { name: "Kotoka International Airport", address: "Airport Rd, Accra", lat: 5.6052, lng: -0.1668 },
  { name: "Accra Mall", address: "Tetteh Quarshie Interchange, Accra", lat: 5.6362, lng: -0.1769 },
  { name: "University of Ghana", address: "Legon, Accra", lat: 5.6502, lng: -0.1869 },
  { name: "Labadi Beach", address: "La, Accra", lat: 5.5558, lng: -0.1469 },
  { name: "Osu Oxford Street", address: "Osu, Accra", lat: 5.5558, lng: -0.1769 },
  { name: "Tema Station", address: "Accra Central", lat: 5.5502, lng: -0.2069 },
  { name: "West Hills Mall", address: "Weija, Accra", lat: 5.5752, lng: -0.3169 },
  { name: "Achimota Mall", address: "Achimota, Accra", lat: 5.6252, lng: -0.2269 },
  { name: "Makola Market", address: "Accra Central", lat: 5.5502, lng: -0.2169 },
  { name: "Cantonments", address: "Cantonments, Accra", lat: 5.5752, lng: -0.1769 },
  { name: "East Legon", address: "East Legon, Accra", lat: 5.6402, lng: -0.1469 },
  { name: "Dansoman", address: "Dansoman, Accra", lat: 5.5552, lng: -0.2469 },
];

export const PROMO_CODES: Record<string, { type: "percent" | "fixed"; value: number; maxDiscount?: number }> = {
  FIRSTRIDE: { type: "percent", value: 50, maxDiscount: 20 },
  HY3N10: { type: "percent", value: 10 },
  FREERIDE: { type: "fixed", value: 30 },
  WELCOME: { type: "percent", value: 20, maxDiscount: 15 },
  WEEKEND: { type: "percent", value: 15 },
};

export function calculateFare(
  categoryId: string,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier: number = 1.0
): number {
  const category = RIDE_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return 0;

  const distanceFare = category.basePrice + (distanceKm * category.pricePerKm);
  const timeFare = durationMinutes * category.pricePerMin;
  const subtotal = distanceFare + timeFare;
  const withSurge = subtotal * surgeMultiplier;
  const withMinFare = Math.max(withSurge, category.minFare);
  const final = withMinFare + BOOKING_FEE;
  
  return parseFloat(final.toFixed(2));
}

export function calculateDiscount(code: string, fare: number): number {
  const promo = PROMO_CODES[code.toUpperCase()];
  if (!promo) return 0;
  if (promo.type === "percent") {
    const discount = fare * (promo.value / 100);
    return promo.maxDiscount ? Math.min(discount, promo.maxDiscount) : discount;
  }
  return Math.min(promo.value, fare);
}

export function getFareBreakdown(
  categoryId: string,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier: number = 1.0
) {
  const category = RIDE_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return { baseFare: 0, distanceFare: 0, timeFare: 0, bookingFee: 0, total: 0 };

  const baseFare = category.basePrice;
  const distanceFare = distanceKm * category.pricePerKm;
  const timeFare = durationMinutes * category.pricePerMin;
  const subtotal = baseFare + distanceFare + timeFare;
  const withSurge = subtotal * surgeMultiplier;
  const withMinFare = Math.max(withSurge, category.minFare);
  const total = withMinFare + BOOKING_FEE;

  return {
    baseFare: parseFloat(baseFare.toFixed(2)),
    distanceFare: parseFloat(distanceFare.toFixed(2)),
    timeFare: parseFloat(timeFare.toFixed(2)),
    bookingFee: BOOKING_FEE,
    total: parseFloat(total.toFixed(2)),
  };
}
