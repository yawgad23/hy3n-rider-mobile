/**
 * HY3N Hubtel Payment Service
 *
 * Handles automatic daily commission deduction via Hubtel Direct Receive Money API.
 *
 * API endpoint:
 *   POST https://rmp.hubtel.com/merchantaccount/merchants/{POS_SALES_NUMBER}/receive/mobilemoney
 *
 * Auth: Basic base64(API_ID:API_KEY)
 *
 * POS Sales Number: 5809 (from bo.hubtel.com/money)
 * API ID:  9glAYO8
 * API Key: 08910e8a08234a2aa98a756776f60a8f
 *
 * IMPORTANT: The "Receive Money" scope must be enabled on the API key by Hubtel.
 * Email retail@hubtel.com to request this scope. Also provide your server IP for whitelisting.
 *
 * Commission rates:
 *   - Car drivers (Standard/Comfort/Kantanka/Executive): GH₵50/day
 *   - Okada / Delivery drivers: GH₵30/day
 */

export interface HubtelChargeRequest {
  /** Driver's MoMo phone number (e.g. "0244123456") */
  customerMsisdn: string;
  /** Amount in GH₵ (50 for cars, 30 for okada/delivery) */
  amount: number;
  /** Driver's full name */
  customerName: string;
  /** Description shown on USSD prompt */
  description: string;
  /** Unique reference for idempotency (e.g. "hy3n-commission-{driverId}-{date}") */
  clientReference: string;
  /** MoMo network channel: "mtn-gh" | "vodafone-gh" | "tigo-gh" */
  channel: 'mtn-gh' | 'vodafone-gh' | 'tigo-gh';
}

export interface HubtelChargeResponse {
  success: boolean;
  /** Hubtel transaction reference */
  transactionId?: string;
  /** "pending" | "success" | "failed" */
  status?: string;
  message?: string;
  /** Raw response from Hubtel for debugging */
  raw?: any;
}

const HUBTEL_POS_NUMBER = process.env.HUBTEL_POS_NUMBER || '5809';
const HUBTEL_API_ID = process.env.HUBTEL_API_ID || '9glAYO8';
const HUBTEL_API_KEY = process.env.HUBTEL_API_KEY || '08910e8a08234a2aa98a756776f60a8f';

function getBasicAuth(): string {
  const credentials = `${HUBTEL_API_ID}:${HUBTEL_API_KEY}`;
  return 'Basic ' + Buffer.from(credentials).toString('base64');
}

/**
 * Initiate a direct MoMo charge via Hubtel.
 * The driver receives a USSD prompt on their phone to approve the payment.
 */
export async function chargeDriverCommission(req: HubtelChargeRequest): Promise<HubtelChargeResponse> {
  const url = `https://rmp.hubtel.com/merchantaccount/merchants/${HUBTEL_POS_NUMBER}/receive/mobilemoney`;

  const body = {
    CustomerMsisdn: req.customerMsisdn,
    Amount: req.amount,
    CustomerName: req.customerName,
    Description: req.description,
    ClientReference: req.clientReference,
    Channel: req.channel,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getBasicAuth(),
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Common error codes from Hubtel:
      // 401 = bad credentials or missing "Receive Money" scope
      // 403 = IP not whitelisted
      // 400 = invalid phone number or channel
      const errorMsg = data?.Message || data?.message || `HTTP ${response.status}`;
      console.error('[Hubtel] Charge failed:', response.status, errorMsg, data);
      return {
        success: false,
        status: 'failed',
        message: errorMsg,
        raw: data,
      };
    }

    // Hubtel returns ResponseCode "0000" for success
    const isSuccess = data?.ResponseCode === '0000' || data?.Status === 'Success' || response.status === 200;
    const transactionId = data?.Data?.TransactionId || data?.TransactionId || data?.ClientReference;

    return {
      success: isSuccess,
      transactionId,
      status: isSuccess ? 'pending' : 'failed',
      message: data?.Message || data?.message || (isSuccess ? 'Charge initiated' : 'Charge failed'),
      raw: data,
    };
  } catch (err: any) {
    console.error('[Hubtel] Network error:', err?.message);
    return {
      success: false,
      status: 'failed',
      message: err?.message || 'Network error contacting Hubtel',
    };
  }
}

/**
 * Determine commission amount based on driver service type.
 */
export function getCommissionAmount(serviceType: string): number {
  const lower = (serviceType || '').toLowerCase();
  if (lower.includes('okada') || lower.includes('motor') || lower.includes('delivery') || lower.includes('bike')) {
    return 30;
  }
  return 50; // All car types: standard, comfort, kantanka, executive
}

/**
 * Determine Hubtel channel from MoMo network name.
 */
export function getMomoChannel(network: string): 'mtn-gh' | 'vodafone-gh' | 'tigo-gh' {
  const lower = (network || '').toLowerCase();
  if (lower.includes('vodafone') || lower.includes('telecel')) return 'vodafone-gh';
  if (lower.includes('tigo') || lower.includes('airtel') || lower.includes('airteltigo') || lower.includes('at')) return 'tigo-gh';
  return 'mtn-gh'; // Default to MTN (most common in Ghana)
}

/**
 * Generate a unique idempotency reference for a driver's daily commission.
 * Format: hy3n-commission-{driverId}-{YYYY-MM-DD}
 */
export function getCommissionReference(driverId: string, date?: string): string {
  const d = date || new Date().toISOString().split('T')[0];
  return `hy3n-commission-${driverId}-${d}`;
}
