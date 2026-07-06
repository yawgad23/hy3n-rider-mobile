import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, View, Image, Animated } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { Notifications, registerForPushNotificationsAsync, setupNotificationChannels } from '@/lib/notifications';
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

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const opacity = useState(new Animated.Value(1))[0];
  const logoScale = useState(new Animated.Value(0.8))[0];
  const logoOpacity = useState(new Animated.Value(0))[0];
  const barWidth = useState(new Animated.Value(0))[0];

  useEffect(() => {
    // Logo animation
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();

    // Loading bar starts after 1s
    setTimeout(() => {
      Animated.timing(barWidth, { toValue: 1, duration: 1400, useNativeDriver: false }).start();
    }, 1100);

    // Fade out after 2.5s
    setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
        onComplete();
      });
    }, 2500);
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#000000",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      {/* Radial glow */}
      <View
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: "rgba(212,175,55,0.06)",
        }}
      />
      {/* Logo */}
      <Animated.View
        style={{
          width: 256,
          height: 256,
          alignItems: "center",
          justifyContent: "center",
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
        }}
      >
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: 256, height: 256, resizeMode: "contain" }}
        />
      </Animated.View>
      {/* Akwaaba subtitle */}
      <Animated.Text
        style={{
          color: "#D4AF37",
          fontSize: 20,
          fontWeight: "700",
          letterSpacing: 4,
          textTransform: "uppercase",
          marginTop: 16,
          opacity: logoOpacity,
        }}
      >
        Akwaaba
      </Animated.Text>

      {/* Loading bar */}
      <View
        style={{
          position: "absolute",
          bottom: 64,
          width: 64,
          height: 2,
          backgroundColor: "rgba(255,255,255,0.1)",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            height: "100%",
            backgroundColor: "#D4AF37",
            borderRadius: 1,
            width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          }}
        />
      </View>
    </Animated.View>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;
  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  const [splashDone, setSplashDone] = useState(false);
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    initManusRuntime();
  }, []);

  // Set up push notifications
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setupNotificationChannels();
    registerForPushNotificationsAsync();

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notification) => {
      console.log('[HY3N] Notification received:', notification.request.content.title);
    });

    // Listen for user tapping a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      console.log('[HY3N] Notification tapped:', data);
    });

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
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="privacy" options={{ presentation: "modal" }} />
              <Stack.Screen name="login" />
              <Stack.Screen name="register" />
              <Stack.Screen name="forgot-password" />
              <Stack.Screen name="oauth/callback" />
              <Stack.Screen name="safety" options={{ presentation: "modal" }} />
              <Stack.Screen name="scheduled" options={{ presentation: "modal" }} />
              <Stack.Screen name="support" options={{ presentation: "modal" }} />

            </Stack>
            <StatusBar style="light" />
            {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
          </AuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
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
