import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import {
  addActivityTokenListener,
  startActivity,
  stopActivity,
  updateActivity,
} from 'expo-live-activity';
import type { User } from 'firebase/auth';
import { getApiBaseUrl } from '@/constants/oauth';
import {
  riderLiveActivityEligible,
  riderLiveActivityPresentation,
  type RiderLiveActivityRide,
} from '@/lib/rider-live-activity-presentation';

type ActiveActivity = {
  activityId: string;
  rideId: string;
  user: User;
};

const activitiesByRideId = new Map<string, ActiveActivity>();
const activitiesById = new Map<string, ActiveActivity>();
let tokenListenerReady = false;
let fcmTokenPromise: Promise<string | null> | null = null;

function available() {
  return Platform.OS === 'ios';
}

async function riderFcmToken() {
  if (!available()) return null;
  if (!fcmTokenPromise) {
    fcmTokenPromise = (async () => {
      try {
        await messaging().registerDeviceForRemoteMessages().catch(() => undefined);
        const token = await messaging().getToken();
        return token && token.length >= 20 ? token : null;
      } catch (error) {
        console.warn('[HY3N] Live Activity FCM registration failed:', error);
        return null;
      }
    })();
  }
  return fcmTokenPromise;
}

async function registerActivityToken(activity: ActiveActivity, activityPushToken: string) {
  const baseUrl = getApiBaseUrl();
  const fcmToken = await riderFcmToken();
  if (!baseUrl || !fcmToken || !activityPushToken) return;

  try {
    const response = await fetch(`${baseUrl}/api/live-activities/token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await activity.user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rideId: activity.rideId,
        activityId: activity.activityId,
        fcmToken,
        activityPushToken,
      }),
    });
    if (!response.ok) {
      throw new Error(`Live Activity token registration returned ${response.status}`);
    }
  } catch (error) {
    // The on-device countdown remains useful. The next token rotation or ride
    // update retries remote registration without blocking the trip UI.
    console.warn('[HY3N] Live Activity token registration failed:', error);
  }
}

function ensureTokenListener() {
  if (tokenListenerReady || !available()) return;
  tokenListenerReady = true;
  addActivityTokenListener((event) => {
    const activity = activitiesById.get(event.activityID);
    if (activity) void registerActivityToken(activity, event.activityPushToken);
  });
}

function stateForRide(ride: RiderLiveActivityRide) {
  const presentation = riderLiveActivityPresentation(ride);
  return {
    title: presentation.title,
    subtitle: presentation.subtitle,
    progressBar: { date: presentation.arrivalAt },
    imageName: 'hy3n_wordmark',
    dynamicIslandImageName: 'hy3n_wordmark',
  };
}

const activityConfig = {
  backgroundColor: '#0A0A0A',
  titleColor: '#FAFAFA',
  subtitleColor: '#D1D5DB',
  progressViewTint: '#D4AF37',
  progressViewLabelColor: '#D4AF37',
  timerType: 'digital' as const,
  imagePosition: 'right' as const,
  imageSize: { width: '22%' as const, height: '78%' as const },
  contentFit: 'contain' as const,
};

/** Starts or refreshes the one native Live Activity for the Rider's active trip. */
export async function syncRiderLiveActivity(user: User | null | undefined, ride: RiderLiveActivityRide) {
  if (!available() || !user || !riderLiveActivityEligible(ride.status)) return;
  ensureTokenListener();

  const previous = activitiesByRideId.get(ride.id);
  const state = stateForRide(ride);
  if (previous) {
    try {
      await updateActivity(previous.activityId, state);
      return;
    } catch {
      activitiesByRideId.delete(ride.id);
      activitiesById.delete(previous.activityId);
    }
  }

  try {
    const activityId = await startActivity(state, activityConfig);
    if (!activityId) return;
    const activity = { activityId, rideId: ride.id, user };
    activitiesByRideId.set(ride.id, activity);
    activitiesById.set(activityId, activity);
  } catch (error) {
    // Devices below iOS 16.2 or with Live Activities disabled still use the
    // normal in-app tracker; this must never affect a ride lifecycle action.
    console.warn('[HY3N] Live Activity start unavailable:', error);
  }
}

/** Ends the local Island/Lock Screen card immediately for a terminal trip state. */
export async function endRiderLiveActivity(rideId: string, completed: boolean) {
  const activity = activitiesByRideId.get(rideId);
  if (!activity) return;
  activitiesByRideId.delete(rideId);
  activitiesById.delete(activity.activityId);
  try {
    await stopActivity(activity.activityId, {
      title: completed ? 'Trip complete' : 'Ride cancelled',
      subtitle: completed ? 'Medaase for riding with HY3N' : 'Open HY3N to book another ride',
      progressBar: { progress: 1 },
      imageName: 'hy3n_wordmark',
      dynamicIslandImageName: 'hy3n_wordmark',
    });
  } catch (error) {
    console.warn('[HY3N] Live Activity end unavailable:', error);
  }
}
