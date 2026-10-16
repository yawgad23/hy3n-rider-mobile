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
  /** Last numeric display position of the native HY3N trip car. */
  progress: number;
};

type NativeActivityState = Parameters<typeof startActivity>[0];

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
    // The on-device display remains useful. The next token rotation or ride
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

function stateForRide(ride: RiderLiveActivityRide, previousProgress: number) {
  const presentation = riderLiveActivityPresentation(ride, Date.now(), previousProgress);
  // expo-live-activity 0.4.2 declares its ETA date and numeric progress as
  // mutually exclusive, but its native ActivityKit content state accepts and
  // needs both: the date renders the ETA while numeric progress positions the
  // HY3N car on the actual-trip line. This is display-only state.
  const state = {
    title: presentation.title,
    subtitle: presentation.subtitle,
    progressBar: { date: presentation.arrivalAt, progress: presentation.progress },
    imageName: 'hy3n_trip_car',
    dynamicIslandImageName: 'hy3n_trip_car',
  } as unknown as NativeActivityState;
  return { state, progress: presentation.progress };
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
  const rendered = stateForRide(ride, previous?.progress ?? 0);
  if (previous) {
    try {
      await updateActivity(previous.activityId, rendered.state);
      previous.progress = rendered.progress;
      return;
    } catch {
      activitiesByRideId.delete(ride.id);
      activitiesById.delete(previous.activityId);
    }
  }

  try {
    const activityId = await startActivity(rendered.state, activityConfig);
    if (!activityId) return;
    const activity = { activityId, rideId: ride.id, user, progress: rendered.progress };
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
      imageName: 'hy3n_trip_car',
      dynamicIslandImageName: 'hy3n_trip_car',
    });
  } catch (error) {
    console.warn('[HY3N] Live Activity end unavailable:', error);
  }
}
