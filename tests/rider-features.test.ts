import { describe, expect, it } from "vitest";

import { calculateDynamicFare, calculateDistance } from "@/lib/dynamic-pricing";
import { calculateBearing, estimateETA, interpolatePosition } from "@/lib/driver-tracking";
import { countActiveRides, removeRide, updateRide, upsertRide, type RideStateRecord } from "@/lib/rider-ride-state";

type TestRide = RideStateRecord & { fare: number };

const ride = (id: string, status: RideStateRecord["status"] = "searching", fare = 20): TestRide => ({ id, status, fare });

describe("HY3N Rider App feature math", () => {
  it("charges dynamic distance from actual GPS movement instead of the estimate distance", () => {
    const breakdown = calculateDynamicFare("standard", {
      startTime: Date.now(),
      actualDistanceKm: 2,
      elapsedMinutes: 5,
      waitingMinutes: 0,
      surgeMultiplier: 1,
    });

    expect(breakdown.distanceFare).toBeGreaterThan(0);
    expect(breakdown.total).toBeGreaterThan(breakdown.baseFare + breakdown.bookingFee);
  });

  it("calculates stable GPS distance, ETA, bearing, and interpolation values", () => {
    expect(calculateDistance(5.6037, -0.187, 5.6047, -0.187)).toBeGreaterThan(0.1);
    expect(estimateETA(1, 30)).toBe(2);
    expect(calculateBearing(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(interpolatePosition(0, 0, 10, 20, 0.5)).toEqual({ lat: 5, lng: 10 });
  });

  it("keeps simultaneous rides isolated when one ride is added, updated, or removed", () => {
    const first = ride("ride-1");
    const second = ride("ride-2", "in_progress", 35);
    let rides = upsertRide([first], second);

    expect(rides.map((item) => item.id)).toEqual(["ride-1", "ride-2"]);
    rides = updateRide(rides, "ride-2", (item) => ({ ...item, fare: 42 }));
    expect(rides.find((item) => item.id === "ride-1")?.fare).toBe(20);
    expect(rides.find((item) => item.id === "ride-2")?.fare).toBe(42);
    expect(countActiveRides(rides)).toBe(2);

    rides = removeRide(rides, "ride-1");
    expect(rides).toHaveLength(1);
    expect(rides[0].id).toBe("ride-2");
  });
});
