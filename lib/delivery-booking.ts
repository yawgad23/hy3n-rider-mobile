export type DeliveryBookingDetails = {
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  packageDescription: string;
  pickupInstructions?: string;
  dropoffInstructions?: string;
};

function normalizedPhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

function isGhanaPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^0\d{9}$/.test(digits) || /^233\d{9}$/.test(digits);
}

/**
 * Keeps delivery contact validation at the booking boundary. The server repeats
 * the validation before persisting any ride, so this only improves feedback.
 */
export function validateDeliveryBookingDetails(input: DeliveryBookingDetails): string | null {
  if (input.senderName.trim().length < 2 || !isGhanaPhone(normalizedPhone(input.senderPhone))) {
    return 'Enter the sender’s full name and a valid Ghana phone number.';
  }
  if (input.recipientName.trim().length < 2 || !isGhanaPhone(normalizedPhone(input.recipientPhone))) {
    return 'Enter the recipient’s full name and a valid Ghana phone number.';
  }
  if (input.packageDescription.trim().length < 3) {
    return 'Describe the package so the Driver knows what to collect.';
  }
  return null;
}

export function deliveryRequestDetails(input: DeliveryBookingDetails) {
  return {
    sender: {
      name: input.senderName.trim(),
      phone: normalizedPhone(input.senderPhone),
    },
    recipient: {
      name: input.recipientName.trim(),
      phone: normalizedPhone(input.recipientPhone),
    },
    packageDescription: input.packageDescription.trim(),
    pickupInstructions: input.pickupInstructions?.trim() || undefined,
    dropoffInstructions: input.dropoffInstructions?.trim() || undefined,
  };
}
