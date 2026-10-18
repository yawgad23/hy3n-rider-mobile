import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Notifications, setupNotificationChannels } from '@/lib/notifications';
import { listenForPushTokenRotation, registerAuthenticatedPushDevice } from '@/lib/push-device';
import type { EventSubscription, Notification, NotificationResponse } from 'expo-notifications';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { RiderErrorBoundary } from "@/components/RiderErrorBoundary";
import { riderSplashRemainingMs } from "@/lib/rider-splash";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };
const riderSplashStartedAtMs = Date.now();

// This needs to run before React renders. HY3N retains the native launch
// artwork briefly, then restores the signed-in Rider directly to Home.
if (Platform.OS !== "web") {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

export const unstable_settings = {
  anchor: "(tabs)",
};

function RiderPushDeviceRegistration() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    let disposed = false;
    registerAuthenticatedPushDevice(user, 'rider').catch((error) => {
      if (!disposed) console.warn('[HY3N] Rider push registration failed:', error);
    });
    const subscription = listenForPushTokenRotation(user, 'rider');
    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [user?.uid]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;
  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    initManusRuntime();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, riderSplashRemainingMs(riderSplashStartedAtMs));
    return () => clearTimeout(timer);
  }, []);

  // Set up push notifications
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setupNotificationChannels();

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notification) => {
      console.log('[HY3N] Notification received:', notification.request.content.title);
    });

    // A trip-share push carries only an opaque share ID. The destination
    // validates the signed-in recipient again before any trip data is shown.
    const openPrivateTripShare = (data: unknown) => {
      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      const shareId = typeof payload.shareId === 'string' ? payload.shareId.trim() : '';
      if (payload.type === 'trip_share' && /^[A-Za-z0-9_-]{24,128}$/.test(shareId)) {
        router.push({ pathname: '/trip-share/[shareId]', params: { shareId } });
      }
    };
    // Listen for user tapping a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      openPrivateTripShare(data);
    });
    // Covers an invitation tapped while the app was fully closed. Do not log
    // notification data: it can be safety-sensitive even when it is opaque.
    Notifications.getLastNotificationResponseAsync?.().then((response: NotificationResponse | null) => {
      if (response) openPrivateTripShare(response.notification.request.content.data);
    }).catch(() => {});

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RiderErrorBoundary>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RiderPushDeviceRegistration />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="privacy" options={{ presentation: "modal" }} />
                <Stack.Screen name="login" />
                <Stack.Screen name="register" />
                <Stack.Screen name="complete-profile" />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="oauth/callback" />
                <Stack.Screen name="safety" options={{ presentation: "modal" }} />
                <Stack.Screen name="scheduled" options={{ presentation: "modal" }} />
                <Stack.Screen name="support" options={{ presentation: "modal" }} />
                <Stack.Screen name="trip-share/[shareId]" />

              </Stack>
              <StatusBar style="auto" />
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </RiderErrorBoundary>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";
  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
