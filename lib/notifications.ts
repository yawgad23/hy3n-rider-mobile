import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let expoNotifications: any = null;
let isExpoGo = false;

try {
  // In Expo Go SDK 53/54 on Android, importing expo-notifications crashes/throws on load.
  // We check Constants to see if we are in the store client (Expo Go).
  isExpoGo = Constants?.executionEnvironment === 'storeClient';
  if (Platform.OS !== 'android' || !isExpoGo) {
    expoNotifications = require('expo-notifications');
  }
} catch (e) {
  console.warn('[HY3N] Failed to load expo-notifications module:', e);
}

// AndroidImportance mock matches expo-notifications definitions
const AndroidImportanceMock = {
  UNSPECIFIED: 0,
  NONE: 1,
  MIN: 2,
  LOW: 3,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};

// Stub implementation for environment where expo-notifications is unavailable (like Android Expo Go)
const NotificationsStub = {
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' }),
  getExpoPushTokenAsync: async () => ({ data: '' }),
  scheduleNotificationAsync: async () => '',
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  AndroidImportance: AndroidImportanceMock,
};

export const Notifications = expoNotifications || NotificationsStub;

// ── Foreground handler: always show alerts when app is open ──────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Android notification channels ────────────────────────────────────────────
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('rides', {
    name: 'Ride Updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#D4AF37',
    sound: 'default',
    description: 'Notifications about your HY3N rides',
  });

  await Notifications.setNotificationChannelAsync('promos', {
    name: 'Promotions & Offers',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Special offers and promo codes from HY3N',
  });

  await Notifications.setNotificationChannelAsync('wallet', {
    name: 'Wallet & Payments',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Wallet top-ups and payment confirmations',
  });
}

// ── Request permission & get push token ──────────────────────────────────────
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators/emulators don't support push — local notifications still work
    return null;
  }

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch {
    return null;
  }
}

// ── Ride-event local notifications ───────────────────────────────────────────

export async function notifyDriverFound(driverName: string, eta: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚗 Driver Found!',
      body: `${driverName} is on the way — arriving in ~${eta} min`,
      data: { type: 'driver_found' },
      sound: 'default',
    },
    trigger: null, // immediate
    ...(Platform.OS === 'android' ? { channelId: 'rides' } : {}),
  } as any);
}

export async function notifyDriverArriving(driverName: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📍 Driver is Arriving!',
      body: `${driverName} is almost at your pickup location`,
      data: { type: 'driver_arriving' },
      sound: 'default',
    },
    trigger: null,
    ...(Platform.OS === 'android' ? { channelId: 'rides' } : {}),
  } as any);
}

export async function notifyTripStarted(destination: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🟢 Trip Started',
      body: `On the way to ${destination}. Enjoy your ride!`,
      data: { type: 'trip_started' },
      sound: 'default',
    },
    trigger: null,
    ...(Platform.OS === 'android' ? { channelId: 'rides' } : {}),
  } as any);
}

export async function notifyTripCompleted(fare: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Trip Complete!',
      body: `You've arrived! Total fare: GH₵${fare.toFixed(2)}. Medaase for riding with HY3N 🙏`,
      data: { type: 'trip_completed' },
      sound: 'default',
    },
    trigger: null,
    ...(Platform.OS === 'android' ? { channelId: 'rides' } : {}),
  } as any);
}

export async function notifyWalletTopUp(amount: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💰 Wallet Topped Up',
      body: `GH₵${amount.toFixed(2)} has been added to your HY3N wallet`,
      data: { type: 'wallet_topup' },
    },
    trigger: null,
    ...(Platform.OS === 'android' ? { channelId: 'wallet' } : {}),
  } as any);
}

export async function notifyPromo(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'promo' },
    },
    trigger: null,
    ...(Platform.OS === 'android' ? { channelId: 'promos' } : {}),
  } as any);
}
