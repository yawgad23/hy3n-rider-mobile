import { describe, expect, it } from "vitest";
import { normalizeRiderHistoryRide, riderHistoryStatus, riderHistoryStatusLabel } from "@/lib/rider-history";

describe("Rider history normalization", () => {
  it("converts legacy string amounts and route metrics before detail rendering", () => {
    const ride = normalizeRiderHistoryRide({
      id: "ride-legacy",
      status: "completed",
      category: "Standard",
      pickup: { address: "Adenta" },
      destination: { name: "Kotoka Airport" },
      final_fare: "5.00",
      fare_estimate: "4.50",
      distance_km: "10.1",
      duration_minutes: "40",
      tip_amount: "2.50",
      waiting_fee: "0.75",
      payment_method: "wallet",
      created_at: { seconds: 1_790_992_000 },
    });

    expect(ride.fare).toBe(5);
    expect(ride.quoted_fare).toBe(4);
    expect(ride.distance).toBe(10.1);
    expect(ride.duration).toBe(40);
    expect(ride.tip).toBe(2.5);
    expect(ride.waiting_fee).toBe(0.75);
    expect(ride.fare.toFixed(2)).toBe("5.00");
    expect(ride.distance.toFixed(1)).toBe("10.1");
    expect(ride.pickup_address).toBe("Adenta");
    expect(ride.destination_address).toBe("Kotoka Airport");
  });

  it("provides safe detail values for incomplete or malformed historical records", () => {
    const ride = normalizeRiderHistoryRide({
      id: "ride-incomplete",
      status: null,
      final_fare: "not-a-number",
      distance: "unknown",
      duration: null,
      tip: "bad",
      waiting_fee: -20,
      created_date: "not-a-date",
    });

    expect(ride.status).toBe("completed");
    expect(ride.fare).toBe(0);
    expect(ride.distance).toBe(0);
    expect(ride.duration).toBe(0);
    expect(ride.tip).toBe(0);
    expect(ride.waiting_fee).toBe(0);
    expect(ride.created_date).toBe(new Date(0).toISOString());
    expect(() => ride.fare.toFixed(2)).not.toThrow();
    expect(() => ride.distance.toFixed(1)).not.toThrow();
  });

  it("normalizes again safely at the detail boundary, including unsupported statuses", () => {
    const ride = normalizeRiderHistoryRide({
      id: 42,
      status: "ride_ended",
      final_fare: { unexpected: true },
      tip: Infinity,
      pickup: ["not", "a", "location"],
      destination: null,
      created_at: { seconds: "not-a-number" },
    });

    expect(ride.id).toBe("unknown-ride");
    expect(ride.status).toBe("other");
    expect(riderHistoryStatus(ride.status)).toBe("other");
    expect(riderHistoryStatusLabel(ride.status)).toBe("Ride recorded");
    expect(ride.fare).toBe(0);
    expect(ride.tip).toBe(0);
    expect(ride.created_date).toBe(new Date(0).toISOString());
    expect(() => ride.fare.toFixed(2)).not.toThrow();
  });

  it("does not throw when an invalid history payload reaches the detail boundary", () => {
    expect(() => normalizeRiderHistoryRide(null)).not.toThrow();
    expect(normalizeRiderHistoryRide(null)).toMatchObject({
      id: "unknown-ride",
      status: "completed",
      fare: 0,
      distance: 0,
    });
  });
});
