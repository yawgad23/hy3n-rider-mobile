export type ReceiptEmailStatus = "idle" | "sending" | "sent" | "failed";

export type ReceiptEmailInput = {
  riderEmail: string;
  riderName: string;
  driverName: string;
  driverVehicle: string;
  driverPlate: string;
  pickup: string;
  destination: string;
  fare: number;
  paymentMethod: string;
  tripId: string;
  completedAt: string;
  distance?: number;
  duration?: number;
  category?: string;
};

export function buildReceiptEmailPayload(input: ReceiptEmailInput): ReceiptEmailInput {
  return {
    ...input,
    riderEmail: input.riderEmail.trim().toLowerCase(),
    riderName: input.riderName.trim() || "HY3N Rider",
    driverName: input.driverName.trim() || "Driver",
    driverVehicle: input.driverVehicle.trim() || "HY3N vehicle",
    driverPlate: input.driverPlate.trim() || "Not available",
    pickup: input.pickup.trim() || "Pickup",
    destination: input.destination.trim() || "Destination",
    paymentMethod: input.paymentMethod.trim() || "Selected method",
    tripId: input.tripId.trim(),
    completedAt: input.completedAt || new Date().toISOString(),
  };
}

export function receiptRequestKey(tripId: string): string {
  return `hy3n_receipt_email_requested_${tripId}`;
}
