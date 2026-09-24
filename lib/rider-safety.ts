import * as Location from 'expo-location';
import { auth } from '@/lib/firebase';
import { getApiBaseUrl } from '@/constants/oauth';

export type RiderSafetyLocation = {
  latitude: number;
  longitude: number;
};

export type RiderSosSubmission = {
  incidentId: string;
  supportTicketId: string;
  receivedAt: string;
};

let pendingAlertId: string | null = null;

function createAlertId() {
  return `rider-sos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function captureLocation(): Promise<RiderSafetyLocation | undefined> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return undefined;

    const recent = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 500,
    });
    if (recent) {
      return {
        latitude: recent.coords.latitude,
        longitude: recent.coords.longitude,
      };
    }

    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    if (!position) return undefined;

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return undefined;
  }
}

/**
 * Sends a Rider SOS through Firebase ID-token authentication. The server derives
 * the Rider identity from the token and verifies ride ownership where a ride ID
 * is available, so the client never controls the reported account identity.
 */
export async function submitRiderSos(input: {
  rideId?: string;
  message?: string;
}): Promise<RiderSosSubmission> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in again before sending an SOS alert.');
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error('HY3N Safety is temporarily unavailable. Please call emergency services.');
  }

  const idToken = await currentUser.getIdToken();
  const clientAlertId = pendingAlertId || createAlertId();
  pendingAlertId = clientAlertId;
  const location = await captureLocation();

  const response = await fetch(`${apiBaseUrl}/api/rider/sos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientAlertId,
      rideId: input.rideId || undefined,
      message: input.message || 'Emergency alert initiated from the Rider app.',
      location,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new Error(body.message || 'HY3N Safety could not confirm your SOS report. Please call emergency services.');
  }

  pendingAlertId = null;
  return {
    incidentId: String(body.incidentId || ''),
    supportTicketId: String(body.supportTicketId || ''),
    receivedAt: String(body.receivedAt || ''),
  };
}
