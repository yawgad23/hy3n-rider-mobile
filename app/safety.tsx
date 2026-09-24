import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Linking } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { COLLECTIONS, firestoreDB } from "@/lib/firebase";
import { submitRiderSos } from "@/lib/rider-safety";
import { openRiderSupportWhatsApp, SUPPORT_PHONE_E164 } from "@/lib/support-contact";

const GREEN = "#006B3F";
const RED = "#CE1126";
const GOLD = "#D4AF37";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

const EMERGENCY_NUMBERS = [
  { name: "Police", number: "191", icon: "local-police" as const, color: "#1E40AF", usesWhatsApp: false },
  { name: "Ambulance", number: "193", icon: "local-hospital" as const, color: RED, usesWhatsApp: false },
  { name: "Fire Service", number: "192", icon: "local-fire-department" as const, color: "#EA580C", usesWhatsApp: false },
  { name: "HY3N Safety", number: "+233 55 727 8990", icon: "security" as const, color: GREEN, usesWhatsApp: true },
];

const SAFETY_TIPS = [
  { title: "Verify Your Driver", tip: "Always check the driver's name, photo, and vehicle plate before getting in.", icon: "verified-user" as const },
  { title: "Share Your Trip", tip: "Use the Share Trip feature to let trusted contacts track your ride in real-time.", icon: "share-location" as const },
  { title: "Sit in the Back", tip: "For your safety and comfort, always sit in the back seat of the vehicle.", icon: "airline-seat-recline-normal" as const },
  { title: "Trust Your Instincts", tip: "If something feels wrong, ask the driver to stop in a safe public location and exit.", icon: "psychology" as const },
  { title: "Keep Valuables Hidden", tip: "Keep your phone and valuables out of sight, especially when windows are down.", icon: "visibility-off" as const },
];

interface TrustedContact {
  id: string;
  name: string;
  phone: string;
}

const STORAGE_KEY = 'hy3n_trusted_contacts';

export default function SafetyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [sendingSos, setSendingSos] = useState(false);

  // Load persisted contacts on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        setTrustedContacts(JSON.parse(val));
      } else {
        // Default contact on first launch
        setTrustedContacts([{ id: "1", name: "Ama Mensah", phone: "+233 24 111 2222" }]);
      }
    });
  }, []);

  const saveContacts = async (contacts: TrustedContact[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  };

  const sendSos = async () => {
    if (!user) {
      Alert.alert("Sign in required", "Please sign in again before sending an SOS alert.");
      return;
    }
    setSendingSos(true);
    try {
      let activeRide: any = null;
      try {
        const rides = await firestoreDB.list(COLLECTIONS.RIDES, { rider_id: user.uid });
        activeRide = rides.find((ride: any) => ["searching", "driver_arriving", "in_progress"].includes(String(ride.status || "")));
      } catch {
        // An SOS must still be deliverable when the optional ride lookup fails.
      }
      const result = await submitRiderSos({ rideId: activeRide?.id });
      const locationText = activeRide?.pickup_address || activeRide?.pickup?.address || "Current location";
      const whatsappMessage = [
        "HY3N Rider SOS — I need urgent safety assistance.",
        `Reference: ${result.incidentId || "Pending"}`,
        `Trip: ${activeRide?.id || "No active trip"}`,
        `Location: ${locationText}`,
      ].join("\n");
      Alert.alert(
        "SOS received",
        "HY3N Safety has recorded your alert. You can now open WhatsApp to reach the support team immediately.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open WhatsApp", onPress: () => openRiderSupportWhatsApp(whatsappMessage).catch(() => Alert.alert("WhatsApp unavailable", "Please call HY3N Support on 055 727 8990.")) },
        ],
      );
    } catch (error: any) {
      Alert.alert("SOS not sent", error?.message || "Please call emergency services or try again.");
    } finally {
      setSendingSos(false);
    }
  };

  const handleSOS = () => {
    Alert.alert(
      "Emergency SOS",
      "This will send your current location and active trip details to HY3N Safety. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send SOS", style: "destructive", onPress: sendSos },
      ]
    );
  };

  const handleCall = (number: string) => {
    Linking.openURL("tel:" + number).catch(() => Alert.alert("Cannot Call", "Please call " + number + " manually"));
  };

  const handleEmergencyContact = (contact: (typeof EMERGENCY_NUMBERS)[number]) => {
    if (contact.usesWhatsApp) {
      openRiderSupportWhatsApp("HY3N Rider Safety Centre — I need support.").catch(() => {
        handleCall(SUPPORT_PHONE_E164);
      });
      return;
    }
    handleCall(contact.number);
  };

  const handleAddContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) { Alert.alert("Required", "Please enter both name and phone number"); return; }
    const updated = [...trustedContacts, { id: Date.now().toString(), name: contactName, phone: contactPhone }];
    setTrustedContacts(updated);
    saveContacts(updated);
    setContactName("");
    setContactPhone("");
    setShowAddContact(false);
    Alert.alert("Added", contactName + " added as a trusted contact");
  };

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Safety Center</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <TouchableOpacity disabled={sendingSos} onPress={handleSOS} style={{ backgroundColor: RED, borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 20, opacity: sendingSos ? 0.7 : 1 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <MaterialIcons name="sos" size={36} color="#fff" />
          </View>
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 20 }}>{sendingSos ? "Sending SOS…" : "Emergency SOS"}</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4, textAlign: "center" }}>Tap to alert HY3N Safety with your location and active trip</Text>
        </TouchableOpacity>

        <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Emergency Numbers</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {EMERGENCY_NUMBERS.map((contact) => (
            <TouchableOpacity key={contact.name} onPress={() => handleEmergencyContact(contact)} accessibilityRole="button" accessibilityLabel={contact.usesWhatsApp ? "Message HY3N Safety on WhatsApp" : `Call ${contact.name}`} style={{ flex: 1, minWidth: "45%", backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 0.5, borderColor: BORDER, gap: 6 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: contact.color + "1A", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name={contact.icon} size={22} color={contact.color} />
              </View>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13 }}>{contact.name}</Text>
              <Text style={{ color: contact.color, fontSize: 12, fontWeight: "600" }}>{contact.number}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}>Trusted Contacts</Text>
          <TouchableOpacity onPress={() => setShowAddContact(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="add" size={16} color={GOLD} />
            <Text style={{ color: GOLD, fontSize: 12, fontWeight: "600" }}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={{ marginBottom: 20 }}>
          {trustedContacts.map((contact) => (
            <View key={contact.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: BORDER }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GREEN + "1A", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: GREEN, fontWeight: "bold", fontSize: 16 }}>{contact.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13 }}>{contact.name}</Text>
                <Text style={{ color: MUTED, fontSize: 12 }}>{contact.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => handleCall(contact.phone)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN + "1A", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="call" size={18} color={GREEN} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert("Remove", "Remove " + contact.name + "?", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => setTrustedContacts(prev => prev.filter(c => c.id !== contact.id)) }])}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: RED + "1A", alignItems: "center", justifyContent: "center" }}
              >
                <MaterialIcons name="delete" size={18} color={RED} />
              </TouchableOpacity>
            </View>
          ))}
          {trustedContacts.length === 0 && (
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 20, alignItems: "center", borderWidth: 0.5, borderColor: BORDER }}>
              <MaterialIcons name="person-add" size={28} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 13, marginTop: 8, textAlign: "center" }}>No trusted contacts yet.</Text>
            </View>
          )}
        </View>

        <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Safety Tips</Text>
        <View style={{ gap: 8 }}>
          {SAFETY_TIPS.map((tip, i) => (
            <View key={i} style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, flexDirection: "row", gap: 12, borderWidth: 0.5, borderColor: BORDER }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GREEN + "1A", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MaterialIcons name={tip.icon} size={20} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>{tip.title}</Text>
                <Text style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>{tip.tip}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showAddContact} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowAddContact(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Add Trusted Contact</Text>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 6 }}>Full Name</Text>
            <TextInput value={contactName} onChangeText={setContactName} placeholder="Enter contact name" placeholderTextColor="#4A4A4A" style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 14 }} />
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 6 }}>Phone Number</Text>
            <TextInput value={contactPhone} onChangeText={setContactPhone} placeholder="+233 XX XXX XXXX" placeholderTextColor="#4A4A4A" keyboardType="phone-pad" style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 20 }} />
            <TouchableOpacity onPress={handleAddContact} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
