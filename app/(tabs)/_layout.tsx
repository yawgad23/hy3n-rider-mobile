import { Tabs, router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type TabBarIconProps = {
  name: React.ComponentProps<typeof MaterialIcons>["name"];
  color: string;
  focused: boolean;
};

function TabBarIcon({ name, color, focused }: TabBarIconProps) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <MaterialIcons name={name} size={22} color={color} />
      {focused && (
        <View
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#D4AF37",
            marginTop: 2,
          }}
        />
      )}
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      if (!seen) {
        router.replace('/onboarding' as any);
        return;
      }
      if (!user) {
        router.replace('/login' as any);
      }
      setOnboardingChecked(true);
    })();
  }, [user, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  if (!user) return null;
  const bottomPadding = Math.max(insets.bottom, 12);
  const tabBarHeight = 70 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#D4AF37",
        tabBarInactiveTintColor: "#9CA3AF",
        headerShown: false,
        tabBarStyle: {
          paddingTop: 10,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#111111",
          borderTopColor: "#2A2A2A",
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="access-time" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="person" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: "Support",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="support-agent" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="account" options={{ href: null }} />
    </Tabs>
  );
}
