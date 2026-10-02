import { describe, expect, it } from 'vitest';
import { deliveryRequestDetails, validateDeliveryBookingDetails } from '../lib/delivery-booking';

const validDetails = {
  senderName: 'Yaw Mensah',
  senderPhone: '050 123 4567',
  recipientName: 'Ama Boateng',
  recipientPhone: '+233 24 123 4567',
  packageDescription: 'Small sealed document envelope',
  pickupInstructions: 'Ask for Yaw at reception',
  dropoffInstructions: 'Call when you arrive at the gate',
};

describe('Express Delivery booking details', () => {
  it('requires both delivery contacts and a package description', () => {
    expect(validateDeliveryBookingDetails({ ...validDetails, senderPhone: '123' })).toMatch(/sender/i);
    expect(validateDeliveryBookingDetails({ ...validDetails, recipientName: '' })).toMatch(/recipient/i);
    expect(validateDeliveryBookingDetails({ ...validDetails, packageDescription: '  ' })).toMatch(/package/i);
  });

  it('normalizes delivery details before they are sent to the protected API', () => {
    expect(validateDeliveryBookingDetails(validDetails)).toBeNull();
    expect(deliveryRequestDetails(validDetails)).toEqual({
      sender: { name: 'Yaw Mensah', phone: '0501234567' },
      recipient: { name: 'Ama Boateng', phone: '+233241234567' },
      packageDescription: 'Small sealed document envelope',
      pickupInstructions: 'Ask for Yaw at reception',
      dropoffInstructions: 'Call when you arrive at the gate',
    });
  });
});
