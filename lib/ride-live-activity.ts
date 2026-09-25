import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LiveActivity from 'expo-live-activity';
import { getMessaging, getToken, isDeviceRegisteredForRemoteMessages, registerDeviceForRemoteMessages } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import type { User } from 'firebase/auth';
import { getApiBaseUrl } from '@/constants/oauth';

export type RiderLiveRide = {
  id: string;
  status: string;
  pickup: string;
  destination: { name: string };
  driverName?: string;
  driverVehicle?: string;
  eta?: number;
  etaSeconds?: number;
  routeDurationMinutes?: number;
};

const ACTIVITY_KEY_PREFIX = 'hy3n:rider:live-activity:';
const ACTIVITY_RIDE_PREFIX = 'hy3n:rider:live-activity-ride:';
const LIVE_ACTIVITY_CONFIG: LiveActivity.LiveActivityConfig = {
  backgroundColor: '#080808',
  titleColor: '#FFFFFF',
  subtitleColor: '#D1D5DB',
  progressViewTint: '#D4AF37',
  progressViewLabelColor: '#FFFFFF',
  deepLinkUrl: 'manusrider://ride',
  timerType: 'digital',
  padding: { horizontal: 16, top: 12, bottom: 12 },
  // The car asset is intentionally small and contained, never a blown-up
  // map marker. It should look like a clean vehicle glyph at Lock Screen size.
  imageSize: { width: 44, height: 44 },
  imageAlign: 'center',
  contentFit: 'contain',
};

function isSupportedPlatform() {
  return Platform.OS === 'ios';
}

function estimatedMinutes(ride: RiderLiveRide) {
  const fromRoute = Number(ride.routeDurationMinutes);
  if (Number.isFinite(fromRoute) && fromRoute > 0) return Math.max(1, Math.ceil(fromRoute));
  const fromSeconds = Number(ride.etaSeconds);
  if (Number.isFinite(fromSeconds) && fromSeconds > 0) return Math.max(1, Math.ceil(fromSeconds / 60));
  const fromEta = Number(ride.eta);
  return Number.isFinite(fromEta) && fromEta > 0 ? Math.max(1, Math.ceil(fromEta)) : 5;
}

function timeLabel(time: number) {
  return new Intl.DateTimeFormat('en-GH', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Accra',
  }).format(new Date(time));
}

function liveActivityState(ride: RiderLiveRide): LiveActivity.LiveActivityState {
  const minutes = estimatedMinutes(ride);
  const arrivalAt = Date.now() + minutes * 60_000;
  const onTrip = ride.status === 'in_progress';
  const hasArrived = ride.status === 'driver_arrived';
  const title = onTrip
    ? `Dropoff at ${timeLabel(arrivalAt)}`
    : hasArrived
      ? 'Your driver has arrived'
      : `Pickup in ${minutes} min`;
  const vehicle = [ride.driverName, ride.driverVehicle].filter(Boolean).join(' · ');
  const subtitle = onTrip
    ? `Heading to ${ride.destination.name}`
    : hasArrived
      ? `Meet at ${ride.pickup}`
      : `${vehicle || 'Your HY3N driver'} is heading to ${ride.pickup}`;

  return {
    title,
    subtitle,
    progressBar: { date: arrivalAt },
    imageName: 'hy3n_car',
    dynamicIslandImageName: 'hy3n_car',
  };
}

async function activityIdForRide(rideId: string) {
  return AsyncStorage.getItem(`${ACTIVITY_KEY_PREFIX}${rideId}`);
}

async function saveActivityMapping(rideId: string, activityId: string) {
  await AsyncStorage.multiSet([
    [`${ACTIVITY_KEY_PREFIX}${rideId}`, activityId],
    [`${ACTIVITY_RIDE_PREFIX}${activityId}`, rideId],
  ]);
}

async function getFcmToken() {
  const messaging = getMessaging();
  if (!isDeviceRegisteredForRemoteMessages(messaging)) {
    await registerDeviceForRemoteMessages(messaging);
  }
  return getToken(messaging);
}

async function registerActivityToken(user: User, rideId: string, activityId: string, activityPushToken: string) {
  if (!activityPushToken || !isSupportedPlatform()) return;
  const fcmToken = await getFcmToken();
  const response = await fetch(`${getApiBaseUrl()}/api/live-activities/token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rideId, activityId, fcmToken, activityPushToken }),
  });
  if (!response.ok) throw new Error(`Live Activity token registration failed with ${response.status}`);
}

/** Start or update the local activity while the Rider has the app open. */
export async function syncRiderLiveActivity(user: User, ride: RiderLiveRide) {
  if (!isSupportedPlatform()) return;
  const state = liveActivityState(ride);
  const existingId = await activityIdForRide(ride.id);
  if (existingId) {
    await LiveActivity.updateActivity(existingId, state);
    return;
  }

  const activityId = LiveActivity.startActivity(state, LIVE_ACTIVITY_CONFIG);
  if (!activityId) return;
  await saveActivityMapping(ride.id, activityId);
}

/** End and retire the Live Activity after cancellation or completed drop-off. */
export async function endRiderLiveActivity(user: User, ride: RiderLiveRide) {
  if (!isSupportedPlatform()) return;
  const activityId = await activityIdForRide(ride.id);
  if (!activityId) return;
  await LiveActivity.stopActivity(activityId, {
    title: ride.status === 'completed' ? 'Trip complete' : 'Ride cancelled',
    subtitle: ride.status === 'completed' ? 'Thank you for riding with HY3N' : 'Open HY3N to book another ride',
  });
  await AsyncStorage.multiRemove([
    `${ACTIVITY_KEY_PREFIX}${ride.id}`,
    `${ACTIVITY_RIDE_PREFIX}${activityId}`,
  ]);

  fetch(`${getApiBaseUrl()}/api/live-activities/token/${encodeURIComponent(ride.id)}/${encodeURIComponent(activityId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  }).catch(() => {});
}

/**
 * ActivityKit can rotate the per-activity push token. Keep the backend current
 * whenever the Rider app is running; the native activity retains the last good
 * token while the app is backgrounded or terminated.
 */
export function listenForRiderLiveActivityTokens(user: User) {
  if (!isSupportedPlatform()) return undefined;
  return LiveActivity.addActivityTokenListener((event) => {
    AsyncStorage.getItem(`${ACTIVITY_RIDE_PREFIX}${event.activityID}`)
      .then((rideId) => {
        if (!rideId) return;
        return registerActivityToken(user, rideId, event.activityID, event.activityPushToken);
      })
      .catch((error) => console.warn('[HY3N] Live Activity token refresh failed:', error));
  });
}
