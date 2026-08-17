import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  ActivityIndicator,
  Share,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { firestoreDB, COLLECTIONS } from "@/lib/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildLostItemDescription, buildLostItemSupportMessage, validateLostItemForm, type LostItemContactMethod } from "@/lib/lost-item-support";

const GOLD = "#D4AF37";
const GREEN = "#006B3F";
const RED = "#CE1126";
const BG = "#0A0A0A";
const SURFACE = "#111111";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

interface Ride {
  id: string;
  status: "completed" | "cancelled" | "upcoming";
  category: string;
  destination_address: string;
  pickup_address: string;
  distance: number;
  duration: number;
  fare: number;
  payment: string;
  driver_name?: string;
  driver_rating?: number;
  driver_vehicle?: string;
  driver_plate?: string;
  rider_rating?: number;
  tip?: number;
  waiting_fee?: number;
  created_date: string;
  scheduled_for?: string;
  promo_code?: string;
  discount?: number;
}

const MOCK_RIDES: Ride[] = [
  { id: "r1", status: "completed", category: "Standard", destination_address: "Kotoka International Airport, Airport Rd", pickup_address: "Osu, Accra", distance: 8.2, duration: 22, fare: 50.34, payment: "MoMo", driver_name: "Kwame Asante", driver_rating: 4.9, driver_vehicle: "Toyota Camry (White)", driver_plate: "GR 1234-24", rider_rating: 5, tip: 5, created_date: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "r2", status: "completed", category: "Comfort", destination_address: "Accra Mall, Tetteh Quarshie", pickup_address: "East Legon, Accra", distance: 5.1, duration: 15, fare: 47.49, payment: "Wallet", driver_name: "Ama Owusu", driver_rating: 4.8, driver_vehicle: "Hyundai Sonata (Silver)", driver_plate: "GR 5678-23", rider_rating: 4, created_date: new Date(Date.now() - 86400000).toISOString(), promo_code: "HY3N10", discount: 4.75 },
  { id: "r3", status: "cancelled", category: "Okada", destination_address: "Osu Oxford Street, Osu", pickup_address: "Cantonments, Accra", distance: 2.3, duration: 8, fare: 12.50, payment: "Cash", created_date: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: "r4", status: "completed", category: "Executive", destination_address: "Labadi Beach, La, Accra", pickup_address: "Airport Residential", distance: 7.8, duration: 25, fare: 99.28, payment: "Card", driver_name: "Kofi Mensah", driver_rating: 4.7, driver_vehicle: "Mercedes C-Class (Black)", driver_plate: "GR 9012-24", rider_rating: 5, tip: 10, created_date: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: "r5", status: "upcoming", category: "Standard", destination_address: "University of Ghana, Legon", pickup_address: "Current Location", distance: 4.5, duration: 14, fare: 34.70, payment: "Cash", scheduled_for: "Tomorrow at 8:00 AM", created_date: new Date(Date.now() + 43200000).toISOString() },
  { id: "r6", status: "completed", category: "Kantanka", destination_address: "West Hills Mall, Weija", pickup_address: "Dansoman, Accra", distance: 6.2, duration: 20, fare: 42.84, payment: "MoMo", driver_name: "Yaa Mensah", driver_rating: 4.6, driver_vehicle: "Kantanka Onantefo (Silver)", driver_plate: "GR 3456-24", rider_rating: 4, created_date: new Date(Date.now() - 7 * 86400000).toISOString() },
];

const STATUS_COLORS: Record<string, string> = { completed: GREEN, cancelled: RED, upcoming: GOLD };
const REPORT_ISSUES = ["Driver was rude", "Wrong route taken", "Vehicle not clean", "Driver was late", "Overcharged", "Lost item in vehicle", "Safety concern", "Other"];

function formatDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const hours = diff / 3600000;
  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 48) return "Yesterday";
  return d.toLocaleDateString("en-GH", { month: "short", day: "numeric" });
}

function Row({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
      <Text style={{ color: MUTED, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: valueColor || TEXT, fontSize: 12, fontWeight: bold ? "bold" : "600" }}>{value}</Text>
    </View>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"past" | "upcoming">("past");
  const [rides, setRides] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingRides, setLoadingRides] = useState(true);

  const loadRides = useCallback(async () => {
    if (!user) return;
    setLoadingRides(true);
    try {
      // Rides are saved to the 'rides' collection by dispatch.ts using 'created_at' as the timestamp field
      let firestoreRides = await firestoreDB.list('rides', { rider_id: user.uid }, 'created_at', 'desc', 50);
      // Normalize field names so the Ride interface and UI helpers work correctly
      firestoreRides = (firestoreRides || []).map((r: any) => ({
        ...r,
        created_date: r.created_date || r.created_at || new Date().toISOString(),
        destination_address: r.destination_address ||
          (typeof r.destination === 'object' ? r.destination?.address || r.destination?.name : r.destination) || '',
        pickup_address: r.pickup_address ||
          (typeof r.pickup === 'object' ? r.pickup?.address || r.pickup?.name : r.pickup) || '',
        distance: r.distance || r.distance_km || 0,
        duration: r.duration || r.duration_min || r.duration_minutes || 0,
      }));
      setRides(firestoreRides as Ride[]);
    } catch (err) {
      setRides([]);
    } finally {
      setLoadingRides(false);
    }
  }, [user]);

  useEffect(() => { loadRides(); }, [loadRides]);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportRide, setReportRide] = useState<Ride | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [lostItemDescription, setLostItemDescription] = useState("");
  const [lostItemContactMethod, setLostItemContactMethod] = useState<LostItemContactMethod>("whatsapp");
  const [lostItemContactValue, setLostItemContactValue] = useState("");

  const pastRides = rides.filter(r => r.status !== "upcoming");
  const upcomingRides = rides.filter(r => r.status === "upcoming");
  const displayedRides = activeTab === "past" ? pastRides : upcomingRides;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRides();
    setRefreshing(false);
  }, [loadRides]);

  const handleSubmitReport = async () => {
    if (!selectedIssue) { Alert.alert("Required", "Please select an issue type"); return; }
    if (!user) { Alert.alert("Sign in required", "Please sign in again before submitting a report."); return; }

    const isLostItem = selectedIssue === "Lost item in vehicle";
    if (isLostItem) {
      const validationError = validateLostItemForm({ itemDescription: lostItemDescription });
      if (validationError) { Alert.alert("More details needed", validationError); return; }
    }

    setReportSubmitting(true);
    try {
      const rideId = reportRide?.id || selectedRide?.id || "unknown-ride";
      const description = isLostItem
        ? buildLostItemDescription({ rideId, itemDescription: lostItemDescription, contactMethod: lostItemContactMethod, contactValue: lostItemContactValue })
        : reportNote.trim();

      await firestoreDB.create(COLLECTIONS.SUPPORT_TICKETS, {
        user_id: user.uid,
        ride_id: rideId,
        category: isLostItem ? "Lost item" : "Ride issue",
        subject: selectedIssue,
        description: description || selectedIssue,
        preferred_contact_method: isLostItem ? lostItemContactMethod : undefined,
        contact_details: isLostItem ? lostItemContactValue.trim() || undefined : undefined,
        status: "open",
        source: "rider_activity",
      });

      if (isLostItem && rideId !== "unknown-ride") {
        const driverId = (reportRide as any)?.driver_id || (reportRide as any)?.driverId || null;
        await firestoreDB.create(COLLECTIONS.RIDE_REPORTS, {
          ride_id: rideId,
          driver_id: driverId,
          rider_id: user.uid,
          report_type: "lost_item",
          item_description: lostItemDescription.trim(),
          preferred_contact_method: lostItemContactMethod,
          contact_details: lostItemContactValue.trim() || null,
          description,
          status: "open",
          created_date: new Date().toISOString(),
        });
      }

      setReportSubmitted(true);
    } catch (err) {
      Alert.alert("Unable to submit", "Please try again in a moment.");
    } finally {
      setReportSubmitting(false);
    }
  };

  const openLostItemSupport = async (channel: LostItemContactMethod) => {
    const ride = reportRide || selectedRide;
    if (!ride) return;
    const message = buildLostItemSupportMessage({
      rideId: ride.id,
      itemDescription: lostItemDescription || "Lost item in vehicle",
      contactMethod: lostItemContactMethod,
      contactValue: lostItemContactValue,
    }, ride.destination_address);
    const encodedMessage = encodeURIComponent(message);
    const urls: Record<LostItemContactMethod, string> = {
      whatsapp: `https://wa.me/233200000000?text=${encodedMessage}`,
      phone: "tel:+233200000000",
      email: `mailto:hello@ridehy3n.com?subject=HY3N%20Lost%20Item%20Support&body=${encodedMessage}`,
    };
    try {
      const url = urls[channel];
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch {}
    Alert.alert("Open 24/7 support", "Choose another support channel from the HY3N Support Center.", [
      { text: "Open Support Center", onPress: () => { setShowReport(false); router.push("/support"); } },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
        <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22 }}>Activity</Text>
        <Text style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Your ride history</Text>
      </View>
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {(["past", "upcoming"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
              backgroundColor: activeTab === tab ? `${GOLD}1A` : CARD,
              borderWidth: 1, borderColor: activeTab === tab ? GOLD : BORDER,
            }}
          >
            <Text style={{ color: activeTab === tab ? GOLD : MUTED, fontWeight: "600", fontSize: 14 }}>
              {tab === "past" ? `Past (${pastRides.length})` : `Upcoming (${upcomingRides.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={displayedRides}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        renderItem={({ item }) => {
          const sc = STATUS_COLORS[item.status] || MUTED;
          return (
            <TouchableOpacity
              onPress={() => { setSelectedRide(item); setShowDetails(true); }}
              style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: BORDER, borderLeftWidth: 3, borderLeftColor: sc }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: `${sc}1A` }}>
                      <Text style={{ color: sc, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>{item.status}</Text>
                    </View>
                    <Text style={{ color: MUTED, fontSize: 11 }}>{formatDate(item.created_date)}</Text>
                  </View>
                  <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14 }} numberOfLines={1}>{item.destination_address}</Text>
                  <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.pickup_address}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 16 }}>GH₵{item.fare.toFixed(2)}</Text>
                  <Text style={{ color: MUTED, fontSize: 11 }}>{item.category}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MaterialIcons name="route" size={13} color={MUTED} />
                    <Text style={{ color: MUTED, fontSize: 12 }}>{item.distance.toFixed(1)} km</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MaterialIcons name="access-time" size={13} color={MUTED} />
                    <Text style={{ color: MUTED, fontSize: 12 }}>{item.duration} min</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MaterialIcons name="payments" size={13} color={MUTED} />
                    <Text style={{ color: MUTED, fontSize: 12 }}>{item.payment}</Text>
                  </View>
                </View>
                {item.rider_rating && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <MaterialIcons name="star" size={13} color={GOLD} />
                    <Text style={{ color: GOLD, fontSize: 12, fontWeight: "600" }}>{item.rider_rating}</Text>
                  </View>
                )}
              </View>
              {item.scheduled_for && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: `${GOLD}1A`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <MaterialIcons name="event" size={12} color={GOLD} />
                  <Text style={{ color: GOLD, fontSize: 11, fontWeight: "500" }}>{item.scheduled_for}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loadingRides ? (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={{ color: MUTED, fontSize: 13, marginTop: 16 }}>Loading your rides...</Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: CARD, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <MaterialIcons name={activeTab === "past" ? "history" : "event"} size={32} color={MUTED} />
              </View>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16, marginBottom: 6 }}>
                {activeTab === "past" ? "No past rides" : "No upcoming trips"}
              </Text>
              <Text style={{ color: MUTED, fontSize: 13, textAlign: "center" }}>
                {activeTab === "past" ? "Your completed rides will appear here" : "Schedule a ride from the home screen"}
              </Text>
            </View>
          )
        }
      />

      {/* Trip Details Modal */}
      <Modal visible={showDetails} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity
              onPress={() => setShowDetails(false)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Trip Details</Text>
          </View>
          {selectedRide && (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={{ backgroundColor: `${STATUS_COLORS[selectedRide.status]}1A`, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: `${STATUS_COLORS[selectedRide.status]}4D`, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <MaterialIcons
                  name={selectedRide.status === "completed" ? "check-circle" : selectedRide.status === "cancelled" ? "cancel" : "event"}
                  size={24}
                  color={STATUS_COLORS[selectedRide.status]}
                />
                <View>
                  <Text style={{ color: STATUS_COLORS[selectedRide.status], fontWeight: "bold", fontSize: 15, textTransform: "capitalize" }}>{selectedRide.status}</Text>
                  <Text style={{ color: MUTED, fontSize: 12 }}>{formatDate(selectedRide.created_date)}</Text>
                </View>
              </View>

              <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: BORDER }}>
                <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 12 }}>Route</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{ alignItems: "center", gap: 4, marginTop: 2 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN }} />
                    <View style={{ width: 1, height: 28, backgroundColor: BORDER }} />
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD }} />
                  </View>
                  <View style={{ flex: 1, gap: 10 }}>
                    <View>
                      <Text style={{ color: MUTED, fontSize: 10 }}>Pickup</Text>
                      <Text style={{ color: TEXT, fontSize: 13, fontWeight: "500" }}>{selectedRide.pickup_address}</Text>
                    </View>
                    <View>
                      <Text style={{ color: MUTED, fontSize: 10 }}>Destination</Text>
                      <Text style={{ color: TEXT, fontSize: 13, fontWeight: "500" }}>{selectedRide.destination_address}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {[
                  { icon: "route", label: "Distance", value: `${selectedRide.distance.toFixed(1)} km` },
                  { icon: "access-time", label: "Duration", value: `${selectedRide.duration} min` },
                  { icon: "payments", label: "Payment", value: selectedRide.payment },
                ].map((s, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 0.5, borderColor: BORDER }}>
                    <MaterialIcons name={s.icon as any} size={18} color={GOLD} />
                    <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13, marginTop: 4 }}>{s.value}</Text>
                    <Text style={{ color: MUTED, fontSize: 10 }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: BORDER }}>
                <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Fare Breakdown</Text>
                <Row label={`${selectedRide.category} Fare`} value={`GH₵${selectedRide.fare.toFixed(2)}`} />
                {selectedRide.discount && selectedRide.discount > 0 && (
                  <Row label={`Promo (${selectedRide.promo_code})`} value={`-GH₵${selectedRide.discount.toFixed(2)}`} valueColor={GREEN} />
                )}
                {selectedRide.waiting_fee && selectedRide.waiting_fee > 0 && (
                  <Row label="Waiting Fee" value={`+GH₵${selectedRide.waiting_fee.toFixed(2)}`} valueColor={RED} />
                )}
                {selectedRide.tip && selectedRide.tip > 0 && (
                  <Row label="Tip" value={`+GH₵${selectedRide.tip.toFixed(2)}`} valueColor={GREEN} />
                )}
                <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                  <Row
                    label="Total Paid"
                    value={`GH₵${(selectedRide.fare + (selectedRide.tip || 0) + (selectedRide.waiting_fee || 0) - (selectedRide.discount || 0)).toFixed(2)}`}
                    valueColor={GOLD}
                    bold
                  />
                </View>
              </View>

              {selectedRide.driver_name && (
                <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: BORDER }}>
                  <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Driver</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${GOLD}33`, alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name="person" size={24} color={GOLD} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14 }}>{selectedRide.driver_name}</Text>
                      <Text style={{ color: MUTED, fontSize: 12 }}>{selectedRide.driver_vehicle} • {selectedRide.driver_plate}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MaterialIcons name="star" size={16} color={GOLD} />
                      <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 14 }}>{selectedRide.driver_rating}</Text>
                    </View>
                  </View>
                </View>
              )}

              {selectedRide.status === "completed" && (
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const dest = {
                        name: selectedRide.destination_address,
                        address: selectedRide.destination_address,
                        lat: 5.6037,
                        lng: -0.187,
                      };
                      await AsyncStorage.setItem('rebookDestination', JSON.stringify(dest));
                      setShowDetails(false);
                      router.push('/');
                    }}
                    style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  >
                    <MaterialIcons name="replay" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Book Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const total = (selectedRide.fare + (selectedRide.tip || 0) + (selectedRide.waiting_fee || 0) - (selectedRide.discount || 0)).toFixed(2);
                      const lines = [
                        '🚗 HY3N Trip Receipt',
                        `Date: ${new Date(selectedRide.created_date).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}`,
                        `From: ${selectedRide.pickup_address}`,
                        `To: ${selectedRide.destination_address}`,
                        `Category: ${selectedRide.category}`,
                        selectedRide.distance ? `Distance: ${selectedRide.distance.toFixed(1)} km` : null,
                        selectedRide.duration ? `Duration: ${selectedRide.duration} min` : null,
                        `Payment: ${selectedRide.payment}`,
                        `Fare: GH₵${selectedRide.fare.toFixed(2)}`,
                        selectedRide.discount && selectedRide.discount > 0 ? `Promo (${selectedRide.promo_code}): -GH₵${selectedRide.discount.toFixed(2)}` : null,
                        selectedRide.waiting_fee && selectedRide.waiting_fee > 0 ? `Waiting Fee: +GH₵${selectedRide.waiting_fee.toFixed(2)}` : null,
                        selectedRide.tip && selectedRide.tip > 0 ? `Tip: +GH₵${selectedRide.tip.toFixed(2)}` : null,
                        `Total Paid: GH₵${total}`,
                        selectedRide.driver_name ? `Driver: ${selectedRide.driver_name}` : null,
                        `Trip ID: ${selectedRide.id?.slice(0, 12)}`,
                        '',
                        'Thank you for riding with HY3N!',
                      ].filter(Boolean) as string[];
                      Share.share({ message: lines.join('\n'), title: 'HY3N Trip Receipt' });
                    }}
                    style={{ backgroundColor: `${GOLD}1A`, borderWidth: 1, borderColor: `${GOLD}66`, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  >
                    <MaterialIcons name="share" size={18} color={GOLD} />
                    <Text style={{ color: GOLD, fontWeight: "600", fontSize: 15 }}>Share Receipt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowDetails(false);
                      setReportRide(selectedRide);
                      setSelectedIssue("Lost item in vehicle");
                      setReportNote("");
                      setLostItemDescription("");
                      setLostItemContactMethod("whatsapp");
                      setLostItemContactValue("");
                      setReportSubmitted(false);
                      setShowReport(true);
                    }}
                    style={{ backgroundColor: `${GOLD}14`, borderWidth: 1, borderColor: `${GOLD}66`, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  >
                    <MaterialIcons name="inventory-2" size={18} color={GOLD} />
                    <Text style={{ color: GOLD, fontWeight: "600", fontSize: 15 }}>Lost Item</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowDetails(false);
                      setReportRide(selectedRide);
                      setSelectedIssue(null);
                      setReportNote("");
                      setLostItemDescription("");
                      setLostItemContactMethod("whatsapp");
                      setLostItemContactValue("");
                      setReportSubmitted(false);
                      setShowReport(true);
                    }}
                    style={{ borderWidth: 1, borderColor: `${RED}66`, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  >
                    <MaterialIcons name="flag" size={18} color={RED} />
                    <Text style={{ color: RED, fontWeight: "600", fontSize: 15 }}>Report Issue</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedRide.status === "upcoming" && (
                <TouchableOpacity
                  onPress={() => {
                    setShowDetails(false);
                    Alert.alert("Cancel Ride", "Cancel this scheduled ride?", [
                      { text: "No", style: "cancel" },
                      { text: "Yes", style: "destructive", onPress: () => Alert.alert("Cancelled", "Your scheduled ride has been cancelled.") },
                    ]);
                  }}
                  style={{ borderWidth: 1, borderColor: `${RED}66`, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                >
                  <MaterialIcons name="event-busy" size={18} color={RED} />
                  <Text style={{ color: RED, fontWeight: "600", fontSize: 15 }}>Cancel Scheduled Ride</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Report Issue Modal */}
      <Modal visible={showReport} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity
              onPress={() => setShowReport(false)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Report Issue</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {reportSubmitted ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <MaterialIcons name="check-circle" size={40} color={GREEN} />
                </View>
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 8 }}>Report Submitted!</Text>
                <Text style={{ color: MUTED, fontSize: 13, textAlign: "center", marginBottom: 16 }}>Your case is open. Our 24/7 support team can help coordinate recovery.</Text>
                {selectedIssue === "Lost item in vehicle" && (
                  <View style={{ flexDirection: "row", gap: 8, width: "100%", marginBottom: 18 }}>
                    {([
                      { id: "whatsapp" as const, label: "WhatsApp", icon: "chat" },
                      { id: "phone" as const, label: "Call 24/7", icon: "call" },
                      { id: "email" as const, label: "Email", icon: "email" },
                    ]).map((channel) => (
                      <TouchableOpacity
                        key={channel.id}
                        onPress={() => openLostItemSupport(channel.id)}
                        style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: `${GOLD}12`, borderWidth: 1, borderColor: `${GOLD}55` }}
                      >
                        <MaterialIcons name={channel.icon as any} size={16} color={GOLD} />
                        <Text style={{ color: GOLD, fontSize: 10, fontWeight: "700" }}>{channel.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TouchableOpacity onPress={() => setShowReport(false)} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 }}>
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {reportRide && (
                  <View style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
                    <Text style={{ color: TEXT, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>{reportRide.destination_address}</Text>
                    <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{formatDate(reportRide.created_date)}</Text>
                  </View>
                )}
                {selectedIssue !== "Lost item in vehicle" ? (
                  <>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 10 }}>Select Issue Type</Text>
                    <View style={{ gap: 8, marginBottom: 16 }}>
                      {REPORT_ISSUES.map((issue) => (
                        <TouchableOpacity
                          key={issue}
                          onPress={() => setSelectedIssue(issue)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: selectedIssue === issue ? `${RED}1A` : CARD, borderWidth: 1, borderColor: selectedIssue === issue ? `${RED}66` : BORDER }}
                        >
                          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedIssue === issue ? RED : BORDER, alignItems: "center", justifyContent: "center" }}>
                            {selectedIssue === issue && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: RED }} />}
                          </View>
                          <Text style={{ color: selectedIssue === issue ? TEXT : MUTED, fontSize: 14, fontWeight: selectedIssue === issue ? "600" : "400" }}>{issue}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Additional Notes (Optional)</Text>
                    <TextInput
                      value={reportNote}
                      onChangeText={setReportNote}
                      placeholder="Describe what happened..."
                      placeholderTextColor="#4A4A4A"
                      multiline
                      numberOfLines={4}
                      style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER, minHeight: 90, textAlignVertical: "top", marginBottom: 20 }}
                    />
                  </>
                ) : (
                  <>
                    <View style={{ backgroundColor: `${GOLD}14`, borderRadius: 14, borderWidth: 1, borderColor: `${GOLD}55`, padding: 14, marginBottom: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <MaterialIcons name="support-agent" size={18} color={GOLD} />
                        <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13 }}>Lost-item recovery</Text>
                      </View>
                      <Text style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>Tell us what was lost and how we should reach you. We’ll attach this trip’s details to your support case.</Text>
                    </View>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>What did you lose?</Text>
                    <TextInput
                      value={lostItemDescription}
                      onChangeText={setLostItemDescription}
                      placeholder="Describe the item, colour, and where you left it"
                      placeholderTextColor="#4A4A4A"
                      multiline
                      numberOfLines={4}
                      accessibilityLabel="Lost item description"
                      style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER, minHeight: 100, textAlignVertical: "top", marginBottom: 16 }}
                    />
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Preferred support channel</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                      {([
                        { id: "whatsapp" as const, label: "WhatsApp", icon: "chat" },
                        { id: "phone" as const, label: "Call", icon: "call" },
                        { id: "email" as const, label: "Email", icon: "email" },
                      ]).map((channel) => {
                        const active = lostItemContactMethod === channel.id;
                        return (
                          <TouchableOpacity
                            key={channel.id}
                            onPress={() => setLostItemContactMethod(channel.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: active ? `${GREEN}1A` : CARD, borderWidth: 1, borderColor: active ? GREEN : BORDER }}
                          >
                            <MaterialIcons name={channel.icon as any} size={17} color={active ? GREEN : MUTED} />
                            <Text style={{ color: active ? GREEN : MUTED, fontSize: 11, fontWeight: "600" }}>{channel.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      value={lostItemContactValue}
                      onChangeText={setLostItemContactValue}
                      placeholder="Phone, email, or WhatsApp number (optional)"
                      placeholderTextColor="#4A4A4A"
                      autoCapitalize="none"
                      keyboardType={lostItemContactMethod === "phone" ? "phone-pad" : "default"}
                      accessibilityLabel="Preferred contact details"
                      style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER, marginBottom: 16 }}
                    />
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                      {([
                        { id: "whatsapp" as const, label: "Open WhatsApp", icon: "chat" },
                        { id: "phone" as const, label: "Call 24/7", icon: "call" },
                        { id: "email" as const, label: "Email Support", icon: "email" },
                      ]).map((channel) => (
                        <TouchableOpacity
                          key={channel.id}
                          onPress={() => openLostItemSupport(channel.id)}
                          accessibilityLabel={channel.label}
                          style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 9, borderRadius: 10, backgroundColor: `${GOLD}12`, borderWidth: 1, borderColor: `${GOLD}55` }}
                        >
                          <MaterialIcons name={channel.icon as any} size={15} color={GOLD} />
                          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "700", textAlign: "center" }}>{channel.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <TouchableOpacity
                  onPress={handleSubmitReport}
                  disabled={reportSubmitting}
                  style={{ backgroundColor: RED, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: selectedIssue ? 1 : 0.5 }}
                >
                  {reportSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="flag" size={18} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>{selectedIssue === "Lost item in vehicle" ? "Submit Lost-Item Case" : "Submit Report"}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
