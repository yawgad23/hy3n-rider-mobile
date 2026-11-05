import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { getRiderHistory } from "@/lib/rider-history-api";
import { useAuth } from "@/lib/auth-context";

const GREEN = "#006B3F";
const RED = "#CE1126";
const GOLD = "#D4AF37";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

type ScheduledTrip = {
  id: string;
  destination: string;
  pickupAddress: string;
  scheduledTime: string;
  rideType: string;
  fare: number | null;
  status: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function locationLabel(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const place = value as Record<string, unknown>;
    const label = text(place.address) || text(place.name) || text(place.label);
    if (label) return label;
  }
  return text(fallback) || "Address unavailable";
}

function scheduledTripFromRecord(value: Record<string, unknown>): ScheduledTrip | null {
  const scheduledTime = text(value.scheduled_for);
  const timestamp = Date.parse(scheduledTime);
  if (!scheduledTime || !Number.isFinite(timestamp)) return null;
  const status = text(value.status).toLowerCase();
  if (["cancelled", "canceled", "completed", "complete", "finished", "rejected"].includes(status)) return null;
  if (timestamp < Date.now()) return null;

  const rawFare = Number(value.final_fare ?? value.quoted_fare ?? value.fare);
  return {
    id: text(value.id ?? value.ride_id),
    destination: locationLabel(value.destination, value.destination_address),
    pickupAddress: locationLabel(value.pickup, value.pickup_address),
    scheduledTime,
    rideType: text(value.category) || "Ride",
    fare: Number.isFinite(rawFare) && rawFare >= 0 ? rawFare : null,
    status: status || "scheduled",
  };
}

function formatScheduledTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("en-GH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScheduledTripsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [trips, setTrips] = useState<ScheduledTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = useCallback(async () => {
    if (!user?.uid) {
      setTrips([]);
      setError("Please sign in again to view your scheduled rides.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const records = await getRiderHistory(50);
      const scheduled = records
        .map(scheduledTripFromRecord)
        .filter((trip): trip is ScheduledTrip => Boolean(trip && trip.id))
        .sort((a, b) => Date.parse(a.scheduledTime) - Date.parse(b.scheduledTime));
      setTrips(scheduled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scheduled rides are temporarily unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loadTrips();
  }, [loadTrips]);

  const contactSupport = () => {
    Alert.alert(
      "Change a scheduled ride",
      "HY3N cannot safely change or cancel a reservation from this screen until the server confirms the change. Contact support for assistance.",
      [
        { text: "Close", style: "cancel" },
        { text: "Open Support", onPress: () => router.push("/support") },
      ],
    );
  };

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Scheduled Trips</Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: `${GREEN}1A` }}>
          <Text style={{ color: GREEN, fontWeight: "700", fontSize: 12 }}>{trips.length} upcoming</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GOLD} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 30, flexGrow: 1 }}
      >
        {loading ? (
          <View style={{ flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={GREEN} size="large" />
            <Text style={{ color: MUTED, marginTop: 12 }}>Loading your scheduled rides…</Text>
          </View>
        ) : error ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <MaterialIcons name="cloud-off" size={42} color={RED} />
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 17, marginTop: 12 }}>Could not load scheduled rides</Text>
            <Text style={{ color: MUTED, textAlign: "center", marginTop: 8, lineHeight: 20 }}>{error}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setLoading(true); void loadTrips(); }} style={{ marginTop: 18, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "bold" }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : trips.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <MaterialIcons name="schedule" size={36} color={GREEN} />
            </View>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 8 }}>No Upcoming Trips</Text>
            <Text style={{ color: MUTED, fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 21 }}>Your upcoming scheduled rides will appear here after they are saved by HY3N.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/")} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: 15 }}>Schedule a Ride</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 12 }}>Upcoming reservations</Text>
            {trips.map((trip) => (
              <View key={trip.id} style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: BORDER }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="schedule" size={20} color={GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14 }} numberOfLines={2}>{trip.destination}</Text>
                    <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }} numberOfLines={2}>From: {trip.pickupAddress}</Text>
                    <Text style={{ color: GOLD, fontSize: 12, marginTop: 8, fontWeight: "600" }}>{formatScheduledTime(trip.scheduledTime)}</Text>
                    <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{trip.rideType}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 15 }}>{trip.fare === null ? "Fare pending" : `GH₵${trip.fare.toFixed(2)}`}</Text>
                  </View>
                </View>
                <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 12, marginTop: 12 }}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Contact support about scheduled ride to ${trip.destination}`} onPress={contactSupport} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: `${GOLD}1A`, borderWidth: 1, borderColor: `${GOLD}4D` }}>
                    <MaterialIcons name="support-agent" size={16} color={GOLD} />
                    <Text style={{ color: GOLD, fontWeight: "600", fontSize: 13 }}>Need to change this ride? Contact support</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
