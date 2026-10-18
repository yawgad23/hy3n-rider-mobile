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
  ending?: boolean;
};

type NativeActivityState = Parameters<typeof startActivity>[0];

const activitiesByRideId = new Map<string, ActiveActivity>();
const activitiesById = new Map<string, ActiveActivity>();
// ActivityKit can emit its APNs token immediately after startActivity resolves.
// Keep an early token briefly so it is never lost between native creation and
// insertion into the JavaScript activity map.
const pendingActivityPushTokens = new Map<string, string>();
let tokenListenerReady = false;
let fcmTokenPromise: Promise<string | null> | null = null;
const tokenRegistrationRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const liveActivityStopRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_ACTIVITY_TOKEN_REGISTRATION_ATTEMPTS = 3;
const MAX_LIVE_ACTIVITY_STOP_ATTEMPTS = 3;

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
        if (token && token.length >= 20) return token;
        fcmTokenPromise = null;
        return null;
      } catch (error) {
        console.warn('[HY3N] Live Activity FCM registration failed:', error);
        fcmTokenPromise = null;
        return null;
      }
    })();
  }
  return fcmTokenPromise;
}

function scheduleActivityTokenRegistrationRetry(activity: ActiveActivity, activityPushToken: string, attempt: number) {
  if (attempt >= MAX_ACTIVITY_TOKEN_REGISTRATION_ATTEMPTS || !activitiesById.has(activity.activityId)) return;
  const existing = tokenRegistrationRetryTimers.get(activity.activityId);
  if (existing) clearTimeout(existing);
  const delayMs = 1_500 * (attempt + 1);
  const timer = setTimeout(() => {
    tokenRegistrationRetryTimers.delete(activity.activityId);
    if (activitiesById.get(activity.activityId) === activity && !activity.ending) {
      void registerActivityToken(activity, activityPushToken, attempt + 1);
    }
  }, delayMs);
  tokenRegistrationRetryTimers.set(activity.activityId, timer);
}

async function registerActivityToken(activity: ActiveActivity, activityPushToken: string, attempt = 0) {
  const baseUrl = getApiBaseUrl();
  const fcmToken = await riderFcmToken();
  if (!baseUrl || !fcmToken || !activityPushToken) {
    scheduleActivityTokenRegistrationRetry(activity, activityPushToken, attempt);
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/live-activities/token`, {
      method: 'POST',
      headers: {
        // A retry refreshes Firebase credentials because the first registration
        // can happen during app resume with an expired cached ID token.
        Authorization: `Bearer ${await activity.user.getIdToken(attempt > 0)}`,
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
    // The on-device display remains useful. Transient launch/network timing
    // must not leave an otherwise active Lock Screen card without its first
    // remote Driver-location update, so retry twice while this activity lives.
    console.warn('[HY3N] Live Activity token registration failed:', error);
    scheduleActivityTokenRegistrationRetry(activity, activityPushToken, attempt);
  }
}

function ensureTokenListener() {
  if (tokenListenerReady || !available()) return;
  tokenListenerReady = true;
  addActivityTokenListener((event) => {
    const activity = activitiesById.get(event.activityID);
    if (activity) {
      void registerActivityToken(activity, event.activityPushToken);
    } else {
      pendingActivityPushTokens.set(event.activityID, event.activityPushToken);
    }
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
    if (previous.ending) return;
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
    const earlyPushToken = pendingActivityPushTokens.get(activityId);
    if (earlyPushToken) {
      pendingActivityPushTokens.delete(activityId);
      void registerActivityToken(activity, earlyPushToken);
    }
  } catch (error) {
    // Devices below iOS 16.2 or with Live Activities disabled still use the
    // normal in-app tracker; this must never affect a ride lifecycle action.
    console.warn('[HY3N] Live Activity start unavailable:', error);
  }
}

function scheduleLiveActivityStopRetry(activity: ActiveActivity, completed: boolean, attempt: number) {
  if (attempt >= MAX_LIVE_ACTIVITY_STOP_ATTEMPTS || activitiesById.get(activity.activityId) !== activity) return;
  const existing = liveActivityStopRetryTimers.get(activity.activityId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    liveActivityStopRetryTimers.delete(activity.activityId);
    if (activitiesById.get(activity.activityId) === activity) {
      void stopRiderLiveActivity(activity, completed, attempt + 1);
    }
  }, 1_000 * (attempt + 1));
  liveActivityStopRetryTimers.set(activity.activityId, timer);
}

async function stopRiderLiveActivity(activity: ActiveActivity, completed: boolean, attempt = 0) {
  activity.ending = true;
  try {
    await stopActivity(activity.activityId, {
      title: completed ? 'Trip complete' : 'Ride cancelled',
      subtitle: completed ? 'Medaase for riding with HY3N' : 'Open HY3N to book another ride',
      progressBar: { progress: 1 },
      imageName: 'hy3n_trip_car',
      dynamicIslandImageName: 'hy3n_trip_car',
    });
    const registrationTimer = tokenRegistrationRetryTimers.get(activity.activityId);
    if (registrationTimer) clearTimeout(registrationTimer);
    tokenRegistrationRetryTimers.delete(activity.activityId);
    const stopTimer = liveActivityStopRetryTimers.get(activity.activityId);
    if (stopTimer) clearTimeout(stopTimer);
    liveActivityStopRetryTimers.delete(activity.activityId);
    activitiesByRideId.delete(activity.rideId);
    activitiesById.delete(activity.activityId);
    pendingActivityPushTokens.delete(activity.activityId);
  } catch (error) {
    // The server terminal push is the background/terminated-app safeguard.
    // While this app is still alive, retain the Activity id and retry native
    // cleanup rather than forgetting a Lock Screen card that could be stopped.
    console.warn('[HY3N] Live Activity end unavailable:', error);
    scheduleLiveActivityStopRetry(activity, completed, attempt);
  }
}

/** Ends the local Island/Lock Screen card immediately for a terminal trip state. */
export async function endRiderLiveActivity(rideId: string, completed: boolean) {
  const activity = activitiesByRideId.get(rideId);
  if (!activity) return;
  await stopRiderLiveActivity(activity, completed);
}
