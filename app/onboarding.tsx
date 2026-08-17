import { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Image,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W } = Dimensions.get("window");

const GOLD = "#D4AF37";
const GREEN = "#006B3F";
const RED = "#CE1126";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

const SLIDES = [
  {
    icon: "place" as const,
    color: GREEN,
    bg: `${GREEN}1A`,
    title: "Book a Ride Anywhere",
    description:
      "Enter your destination and get matched with nearby drivers instantly across Ghana.",
  },
  {
    icon: "gps-fixed" as const,
    color: GOLD,
    bg: `${GOLD}1A`,
    title: "Real-Time Tracking",
    description:
      "Track your driver's live location and get accurate ETAs — no surprises.",
  },
  {
    icon: "account-balance-wallet" as const,
    color: "#4A90E2",
    bg: "#4A90E21A",
    title: "Multiple Payment Options",
    description:
      "Pay with Mobile Money, Card, Cash, or your HY3N Wallet — your choice every time.",
  },
  {
    icon: "security" as const,
    color: RED,
    bg: `${RED}1A`,
    title: "Safe & Secure",
    description:
      "SOS emergency button, verified drivers, and trusted contacts for your peace of mind.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goTo = (index: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setCurrent(index);
    scrollRef.current?.scrollTo({ x: index * W, animated: true });
  };

  const handleNext = () => {
    if (current < SLIDES.length - 1) {
      goTo(current + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem("hasSeenOnboarding", "true");
    router.replace("/login");
  };

  const slide = SLIDES[current];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Skip */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 12,
          right: 20,
          zIndex: 10,
        }}
      >
        {current < SLIDES.length - 1 && (
          <TouchableOpacity onPress={handleComplete}>
            <Text style={{ color: MUTED, fontSize: 14, fontWeight: "500" }}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Logo */}
      <View
        style={{
          alignItems: "center",
          paddingTop: insets.top + 16,
          paddingBottom: 8,
        }}
      >
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: 80, height: 40, resizeMode: "contain" }}
        />
      </View>

      {/* Slide Content */}
      <Animated.View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          opacity: fadeAnim,
        }}
      >
        {/* Icon */}
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 32,
            backgroundColor: slide.bg,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
            borderWidth: 1,
            borderColor: `${slide.color}33`,
          }}
        >
          <MaterialIcons name={slide.icon} size={56} color={slide.color} />
        </View>

        {/* Text */}
        <Text
          style={{
            color: TEXT,
            fontWeight: "bold",
            fontSize: 26,
            textAlign: "center",
            marginBottom: 14,
            lineHeight: 34,
          }}
        >
          {slide.title}
        </Text>
        <Text
          style={{
            color: MUTED,
            fontSize: 15,
            textAlign: "center",
            lineHeight: 24,
          }}
        >
          {slide.description}
        </Text>
      </Animated.View>

      {/* Bottom */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* Dot indicators */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
            marginBottom: 28,
          }}
        >
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)}>
              <View
                style={{
                  height: 8,
                  width: i === current ? 28 : 8,
                  borderRadius: 4,
                  backgroundColor: i === current ? GOLD : CARD,
                  borderWidth: i === current ? 0 : 1,
                  borderColor: "#333",
                }}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          onPress={handleNext}
          style={{
            backgroundColor: current === SLIDES.length - 1 ? GREEN : GOLD,
            borderRadius: 16,
            paddingVertical: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          activeOpacity={0.85}
        >
          <Text
            style={{
              color: "#000",
              fontWeight: "bold",
              fontSize: 16,
            }}
          >
            {current === SLIDES.length - 1 ? "Get Started" : "Continue"}
          </Text>
          <MaterialIcons
            name={current === SLIDES.length - 1 ? "check" : "chevron-right"}
            size={20}
            color="#000"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
