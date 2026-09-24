import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { User } from 'firebase/auth';
import { getApiBaseUrl } from '@/constants/oauth';
import { Notifications, registerForPushNotificationsAsync } from './notifications';

type AccountRole = 'rider' | 'driver';

async function sendTokenToBackend(user: User, role: AccountRole, token: string) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl || !token) return;

  const idToken = await user.getIdToken();
  const response = await fetch(`${baseUrl}/api/notifications/push-device`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role,
      token,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || Constants.nativeAppVersion || undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(`Push-device registration failed with ${response.status}`);
  }
}

/** Registers this physical app install and keeps the backend in sync on token rotation. */
export async function registerAuthenticatedPushDevice(user: User, role: AccountRole) {
  if (Platform.OS === 'web') return;
  const token = await registerForPushNotificationsAsync();
  if (!token) return;
  await sendTokenToBackend(user, role, token);
}

export function listenForPushTokenRotation(user: User, role: AccountRole) {
  if (Platform.OS === 'web' || typeof Notifications.addPushTokenListener !== 'function') return undefined;
  return Notifications.addPushTokenListener((event: { data?: string }) => {
    const token = event?.data;
    if (token) {
      sendTokenToBackend(user, role, token).catch((error) => {
        console.warn('[HY3N] Push token refresh registration failed:', error);
      });
    }
  });
}
