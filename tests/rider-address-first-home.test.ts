import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider address-first home flow', () => {
  it('moves the exact welcome block to a non-map address-first home surface', () => {
    expect(screen).toContain('const renderAddressFirstHome = () => (');
    expect(screen).toContain('Akwaaba{riderProfile?.full_name');
    expect(screen).toContain('Wo ho te sɛn?');
    expect(screen).toContain('const HY3N_CAR_WORDMARK = require("@/assets/images/hy3n-car-wordmark-transparent.png");');
    expect(screen).toContain('const showAddressFirstHome = !terminalRide && !activeRide && !destination;');
    expect(screen).toContain('showAddressFirstHome ? renderAddressFirstHome()');
  });

  it('uses the transparent car-and-wordmark logo on both the map and the address-first home', () => {
    expect((screen.match(/source=\{HY3N_CAR_WORDMARK\}/g) || [])).toHaveLength(2);
    expect(screen).toContain('accessibilityLabel="HY3N car logo"');
    expect(screen).not.toContain("source={require('@/assets/images/icon.png')}");
  });

  it('does not mount the map or the empty request panel before a destination is chosen', () => {
    expect(screen).toContain('{!showAddressFirstHome && <NativeGoogleMap');
    expect(screen).not.toContain('const renderDefaultSheet = () =>');
    expect(screen).toContain('Choose your destination to see live prices and available Drivers.');
  });

  it('keeps service choices visible on the address-first page and selects a category before address search', () => {
    expect(screen).toContain('const homeServiceCategories = RIDE_CATEGORIES;');
    expect(screen).toContain('isDeliveryCategory(cat.id)');
    expect(screen).toContain('Choose a HY3N service');
    expect(screen).toContain('setSelectedCategory(category);');
    expect(screen).toContain('openLocationSearch("destination");');
  });

  it('shows Car Delivery as a HY3N car carrying a box on both service-card stages', () => {
    expect(screen).toContain('const HY3N_CAR_DELIVERY = require("@/assets/images/hy3n-car-delivery.png");');
    expect(screen).toContain('cat.id === "car_delivery"');
    expect(screen).toContain('category.id === \'car_delivery\'');
    expect(screen).toContain('accessibilityLabel="HY3N car with delivery box"');
  });

  it('retains server-owned pricing only after a destination is available', () => {
    expect(screen).toContain('if (!destination || !user || !quoteRouteKey)');
    expect(screen).toContain('requestAuthoritativeRideQuotes<ServerRideQuote>');
    expect(screen).toContain('const renderBookingSheet = () => (');
  });
});
