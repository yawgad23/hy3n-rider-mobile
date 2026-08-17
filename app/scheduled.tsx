import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, Modal } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

const GREEN = "#006B3F";
const RED = "#CE1126";
const GOLD = "#D4AF37";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

interface ScheduledTrip {
  id: string;
  destination: string;
  pickupAddress: string;
  scheduledTime: string;
  rideType: string;
  fare: number;
  status: "upcoming" | "cancelled";
}

const MOCK_SCHEDULED: ScheduledTrip[] = [
  {
    id: "s1",
    destination: "Kotoka International Airport",
    pickupAddress: "Nmai Dzorm, Accra",
    scheduledTime: new Date(Date.now() + 3 * 3600000).toISOString(),
    rideType: "Executive",
    fare: 72.22,
    status: "upcoming",
  },
  {
    id: "s2",
    destination: "Accra Mall",
    pickupAddress: "East Legon, Accra",
    scheduledTime: new Date(Date.now() + 26 * 3600000).toISOString(),
    rideType: "Standard",
    fare: 34.70,
    status: "upcoming",
  },
  {
    id: "s3",
    destination: "West Hills Mall",
    pickupAddress: "Dansoman, Accra",
    scheduledTime: new Date(Date.now() - 2 * 86400000).toISOString(),
    rideType: "Comfort",
    fare: 47.49,
    status: "cancelled",
  },
];

function formatScheduledTime(iso: string) {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const hours = diff / 3600000;
  if (hours > 0 && hours < 1) return `In ${Math.round(hours * 60)} min`;
  if (hours >= 1 && hours < 24) return `In ${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  return d.toLocaleDateString("en-GH", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ScheduledTripsScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<ScheduledTrip[]>(MOCK_SCHEDULED);
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<ScheduledTrip | null>(null);
  const [selectedHoursOffset, setSelectedHoursOffset] = useState(2);

  const upcoming = trips.filter(t => t.status === "upcoming");
  const cancelled = trips.filter(t => t.status === "cancelled");

  const handleRescheduleSubmit = () => {
    if (!selectedTrip) return;
    const newTime = new Date(Date.now() + selectedHoursOffset * 3600000).toISOString();
    setTrips(prev => prev.map(t => t.id === selectedTrip.id ? { ...t, scheduledTime: newTime } : t));
    setRescheduleModalVisible(false);
    setSelectedTrip(null);
    Alert.alert("Ride Rescheduled", `Your ride to ${selectedTrip.destination} has been rescheduled successfully.`);
  };

  const handleCancel = (trip: ScheduledTrip) => {
    Alert.alert(
      "Cancel Trip",
      `Cancel your scheduled ride to ${trip.destination}?`,
      [
        { text: "Keep Trip", style: "cancel" },
        {
          text: "Cancel Trip",
          style: "destructive",
          onPress: () => setTrips(prev => prev.map(t => t.id === trip.id ? { ...t, status: "cancelled" as const } : t)),
        },
      ]
    );
  };

  const TripCard = ({ trip }: { trip: ScheduledTrip }) => {
    const isUpcoming = trip.status === "upcoming";
    const timeStr = formatScheduledTime(trip.scheduledTime);
    const isImminent = isUpcoming && new Date(trip.scheduledTime).getTime() - Date.now() < 3600000;

    return (
      <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: isImminent ? `${GOLD}66` : BORDER }}>
        {isImminent && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${GOLD}1A`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10, alignSelf: "flex-start" }}>
            <MaterialIcons name="schedule" size={14} color={GOLD} />
            <Text style={{ color: GOLD, fontSize: 11, fontWeight: "700" }}>Coming up soon</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isUpcoming ? `${GREEN}1A` : `${RED}1A`, alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="schedule" size={20} color={isUpcoming ? GREEN : RED} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14 }} numberOfLines={1}>{trip.destination}</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }} numberOfLines={1}>From: {trip.pickupAddress}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <MaterialIcons name="access-time" size={13} color={isUpcoming ? GOLD : MUTED} />
              <Text style={{ color: isUpcoming ? GOLD : MUTED, fontSize: 12, fontWeight: "600" }}>{timeStr}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 15 }}>GH₵{trip.fare.toFixed(2)}</Text>
            <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{trip.rideType}</Text>
          </View>
        </View>

        {isUpcoming && (
          <View style={{ flexDirection: "row", gap: 8, borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 12 }}>
            <TouchableOpacity
              onPress={() => handleCancel(trip)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: `${RED}1A`, borderWidth: 1, borderColor: `${RED}4D` }}
            >
              <MaterialIcons name="cancel" size={16} color={RED} />
              <Text style={{ color: RED, fontWeight: "600", fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSelectedTrip(trip);
                setRescheduleModalVisible(true);
              }}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: `${GREEN}1A`, borderWidth: 1, borderColor: `${GREEN}4D` }}
            >
              <MaterialIcons name="edit" size={16} color={GREEN} />
              <Text style={{ color: GREEN, fontWeight: "600", fontSize: 13 }}>Reschedule</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isUpcoming && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 10 }}>
            <MaterialIcons name="cancel" size={14} color={RED} />
            <Text style={{ color: RED, fontSize: 12 }}>Cancelled</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Scheduled Trips</Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: `${GREEN}1A` }}>
          <Text style={{ color: GREEN, fontWeight: "700", fontSize: 12 }}>{upcoming.length} upcoming</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {upcoming.length > 0 && (
          <>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 12 }}>Upcoming</Text>
            {upcoming.map(trip => <TripCard key={trip.id} trip={trip} />)}
          </>
        )}

        {upcoming.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <MaterialIcons name="schedule" size={36} color={GREEN} />
            </View>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 8 }}>No Upcoming Trips</Text>
            <Text style={{ color: MUTED, fontSize: 14, textAlign: "center", marginBottom: 20 }}>Schedule a ride from the home screen by tapping &quot;Where to?&quot; and selecting &quot;Schedule&quot;.</Text>
            <TouchableOpacity onPress={() => router.push("/")} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Book a Ride</Text>
            </TouchableOpacity>
          </View>
        )}

        {cancelled.length > 0 && (
          <>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 12, marginTop: 8 }}>Cancelled</Text>
            {cancelled.map(trip => <TripCard key={trip.id} trip={trip} />)}
          </>
        )}
      </ScrollView>

      {/* Reschedule Modal */}
      <Modal visible={rescheduleModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG, padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingBottom: 16 }}>
            <Text style={{ color: TEXT, fontSize: 18, fontWeight: "bold" }}>Reschedule Trip</Text>
            <TouchableOpacity onPress={() => setRescheduleModalVisible(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
          </View>

          {selectedTrip && (
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 0.5, borderColor: BORDER }}>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14 }}>{selectedTrip.destination}</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>Pickup: {selectedTrip.pickupAddress}</Text>
              <Text style={{ color: GOLD, fontSize: 12, marginTop: 6, fontWeight: "600" }}>Current: {formatScheduledTime(selectedTrip.scheduledTime)}</Text>
            </View>
          )}

          <Text style={{ color: MUTED, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 12 }}>Choose New Pickup Time</Text>
          <View style={{ gap: 10, marginBottom: 24 }}>
            {[
              { label: "In 1 hour", hours: 1 },
              { label: "In 2 hours", hours: 2 },
              { label: "In 4 hours", hours: 4 },
              { label: "Tomorrow morning (8:00 AM)", hours: 14 },
              { label: "Tomorrow evening (5:00 PM)", hours: 23 },
            ].map(opt => (
              <TouchableOpacity
                key={opt.hours}
                onPress={() => setSelectedHoursOffset(opt.hours)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, backgroundColor: selectedHoursOffset === opt.hours ? `${GREEN}1A` : CARD, borderWidth: 1, borderColor: selectedHoursOffset === opt.hours ? GREEN : BORDER }}
              >
                <Text style={{ color: selectedHoursOffset === opt.hours ? TEXT : MUTED, fontWeight: selectedHoursOffset === opt.hours ? "bold" : "normal", fontSize: 14, flex: 1 }}>{opt.label}</Text>
                {selectedHoursOffset === opt.hours && <MaterialIcons name="check-circle" size={18} color={GREEN} />}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleRescheduleSubmit}
            style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: "auto" }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Confirm New Time</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
