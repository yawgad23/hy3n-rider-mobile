export const SUPPORT_PHONE_E164 = "+233557278990";
export const SUPPORT_WHATSAPP_NUMBER = "233557278990";
export const SUPPORT_EMAIL = "hello@ridehy3n.com";

export function buildSupportWhatsAppUrl(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function buildSupportMailto(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
