import { describe, expect, it } from "vitest";

import { calculateDynamicFare, calculateDistance } from "@/lib/dynamic-pricing";
import { calculateBearing, estimateETA, interpolatePosition } from "@/lib/driver-tracking";
import { countActiveRides, removeRide, updateRide, upsertRide, type RideStateRecord } from "@/lib/rider-ride-state";
import { buildEmergencyAssistMessage, getCancellationPolicy, getSafetySignal, selectedRideOptionLabels } from "@/lib/rider-parity";
import { buildLostItemDescription, buildLostItemSupportMessage, validateLostItemForm } from "@/lib/lost-item-support";
import { normalizeTicketStatus, ticketProgress, ticketStatusLabel } from "@/lib/support-ticket";
import { buildReceiptEmailPayload, receiptRequestKey } from "@/lib/receipt-email";

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

  it("formats rider parity safety and preference state deterministically", () => {
    expect(selectedRideOptionLabels({ ac: true, pet_friendly: false, extra_luggage: true, wheelchair_accessible: false })).toEqual(["Air conditioning", "Extra luggage"]);
    expect(getSafetySignal({ status: "in_progress", distanceFromRouteKm: 0.7 })).toBe("route_deviation");
    expect(getSafetySignal({ status: "in_progress", stoppedSeconds: 180 })).toBe("long_stop");
    expect(getSafetySignal({ status: "matched" })).toBe("clear");
  });

  it("applies the rider cancellation policy and creates a shareable emergency handoff", () => {
    const matchedAt = new Date(1_000_000).toISOString();
    expect(getCancellationPolicy("matched", matchedAt, 1_000_000 + 30_000).isFree).toBe(true);
    expect(getCancellationPolicy("matched", matchedAt, 1_000_000 + 180_000).fee).toBe(5);
    const message = buildEmergencyAssistMessage({
      rideId: "ride-123",
      pickup: "Osu",
      destination: "Airport",
      driverName: "Kwame",
      driverPlate: "GR 1234-24",
      latitude: 5.56,
      longitude: -0.18,
    });
    expect(message).toContain("HY3N emergency assist request");
    expect(message).toContain("maps.google.com/?q=5.56,-0.18");
  });

  it("validates lost-item details and builds a support handoff with ride context", () => {
    expect(validateLostItemForm({ itemDescription: "" })).toBe("Please describe the item you lost.");
    expect(validateLostItemForm({ itemDescription: "Black wallet" })).toBeNull();
    const form = { rideId: "ride-123", itemDescription: "Black wallet under the rear seat", contactMethod: "whatsapp" as const, contactValue: "0501234567" };
    expect(buildLostItemDescription(form)).toContain("Preferred contact: whatsapp");
    expect(buildLostItemSupportMessage(form, "Airport")).toContain("Destination: Airport");
  });

  it("normalizes backend ticket states and renders a deterministic progress timeline", () => {
    expect(normalizeTicketStatus("assigned")).toBe("in_progress");
    expect(normalizeTicketStatus("awaiting_rider")).toBe("pending_user");
    expect(ticketStatusLabel("closed")).toBe("Closed");
    expect(ticketProgress("pending_user").map((step) => [step.key, step.complete, step.current])).toEqual([
      ["open", true, false],
      ["in_progress", false, true],
      ["resolved", false, false],
    ]);
  });

  it("builds a sanitized receipt payload and stable request key", () => {
    const payload = buildReceiptEmailPayload({
      riderEmail: "  RIDER@EXAMPLE.COM ",
      riderName: "  Ama  ",
      driverName: "  Kojo ",
      driverVehicle: "  Toyota Prius ",
      driverPlate: "  GR 1234-24 ",
      pickup: "  Osu ",
      destination: " Airport ",
      fare: 42.5,
      paymentMethod: " Card ",
      tripId: " trip-123 ",
      completedAt: "2026-08-17T12:00:00.000Z",
      category: "comfort",
    });
    expect(payload.riderEmail).toBe("rider@example.com");
    expect(payload.riderName).toBe("Ama");
    expect(payload.driverPlate).toBe("GR 1234-24");
    expect(payload.tripId).toBe("trip-123");
    expect(receiptRequestKey("trip-123")).toBe("hy3n_receipt_email_requested_trip-123");
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
