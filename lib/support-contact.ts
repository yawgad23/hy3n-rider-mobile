export const SUPPORT_PHONE_E164 = "+233557278990";
export const SUPPORT_WHATSAPP_NUMBER = "233557278990";
export const SUPPORT_EMAIL = "hello@ridehy3n.com";

export function buildSupportWhatsAppUrl(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Opens the verified HY3N Support WhatsApp conversation. */
export async function openRiderSupportWhatsApp(message: string): Promise<void> {
  const { Linking } = await import('react-native');
  const url = buildSupportWhatsAppUrl(message);
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('WhatsApp is not available on this device.');
  await Linking.openURL(url);
}

export function buildSupportMailto(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
