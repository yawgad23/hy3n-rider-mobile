import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator, Linking } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { firestoreDB, COLLECTIONS } from "@/lib/firebase";
import { formatTicketTimestamp, normalizeTicketStatus, ticketProgress, ticketStatusLabel } from "@/lib/support-ticket";
import { buildSupportMailto, buildSupportWhatsAppUrl, SUPPORT_EMAIL, SUPPORT_PHONE_E164 } from "@/lib/support-contact";

const GREEN = "#006B3F";
const RED = "#CE1126";
const GOLD = "#D4AF37";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

const TICKET_CATEGORIES = [
  { id: "ride_issue", label: "Ride Issue", icon: "directions-car" as const, color: RED },
  { id: "payment", label: "Payment Problem", icon: "payment" as const, color: GOLD },
  { id: "driver", label: "Driver Complaint", icon: "person" as const, color: "#EA580C" },
  { id: "app_bug", label: "App Bug", icon: "bug-report" as const, color: "#4A90E2" },
  { id: "account", label: "Account Issue", icon: "manage-accounts" as const, color: "#9B59B6" },
  { id: "other", label: "Other", icon: "help" as const, color: MUTED },
];

type SupportTicket = {
  id: string;
  category: string;
  subject: string;
  description?: string;
  status: string;
  date?: string;
  created_date?: string;
  updated_date?: string;
  response?: string | null;
  response_date?: string | null;
};

export default function SupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  useEffect(() => {
    if (!user) {
      setTickets([]);
      setLoadingTickets(false);
      return;
    }
    setLoadingTickets(true);
    const unsubscribe = firestoreDB.subscribe(COLLECTIONS.SUPPORT_TICKETS, { user_id: user.uid }, (items) => {
      const nextTickets = (items as SupportTicket[]).sort((a, b) => {
        const aDate = new Date(a.updated_date || a.created_date || a.date || 0).getTime();
        const bDate = new Date(b.updated_date || b.created_date || b.date || 0).getTime();
        return bDate - aDate;
      });
      setTickets(nextTickets);
      setLoadingTickets(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!selectedTicket) return;
    const refreshedTicket = tickets.find((ticket) => ticket.id === selectedTicket.id);
    if (refreshedTicket && refreshedTicket !== selectedTicket) setSelectedTicket(refreshedTicket);
  }, [tickets, selectedTicket]);

  const handleSubmit = async () => {
    if (!selectedCategory) { Alert.alert("Required", "Please select a category"); return; }
    if (!subject.trim()) { Alert.alert("Required", "Please enter a subject"); return; }
    if (!description.trim() || description.length < 20) { Alert.alert("Required", "Please describe your issue in at least 20 characters"); return; }
    if (!user) { Alert.alert("Sign in required", "Please sign in again before creating a support ticket."); return; }
    setSubmitting(true);
    try {
      const newTicket = await firestoreDB.create(COLLECTIONS.SUPPORT_TICKETS, {
        user_id: user.uid,
        category: TICKET_CATEGORIES.find(c => c.id === selectedCategory)?.label || "Other",
        subject: subject.trim(),
        description: description.trim(),
        status: "open",
        source: "rider_support",
      });
      setShowNewTicket(false);
      setSelectedCategory("");
      setSubject("");
      setDescription("");
      Alert.alert("Ticket Submitted", `Your support ticket ${newTicket.id} is now open. We’ll show status updates here.`);
    } catch {
      Alert.alert("Unable to submit", "Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    resolved: { label: "Resolved", color: GREEN },
    closed: { label: "Closed", color: MUTED },
    rejected: { label: "Closed without action", color: RED },
    pending_user: { label: "Waiting for you", color: GOLD },
    in_progress: { label: "In progress", color: GOLD },
    open: { label: "Open", color: "#4A90E2" },
  } as const;
  const selectedStatus = normalizeTicketStatus(selectedTicket?.status);

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Contact Support</Text>
        <TouchableOpacity
          onPress={() => setShowNewTicket(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${GREEN}1A`, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: `${GREEN}4D` }}
        >
          <MaterialIcons name="add" size={16} color={GREEN} />
          <Text style={{ color: GREEN, fontWeight: "600", fontSize: 13 }}>New Ticket</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {/* Contact Options */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => {
              const whatsappUrl = buildSupportWhatsAppUrl("Hi HY3N Support, I need help with my ride.");
              Linking.canOpenURL(whatsappUrl).then(supported => {
                if (supported) {
                  Linking.openURL(whatsappUrl);
                } else {
                  Alert.alert("WhatsApp not found", `Please install WhatsApp or email us at ${SUPPORT_EMAIL}`);
                }
              });
            }}
          style={{ flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 0.5, borderColor: BORDER, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GREEN + "1A", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="chat" size={20} color={GREEN} />
            </View>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 12 }}>Live Chat</Text>
            <Text style={{ color: MUTED, fontSize: 10 }}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE_E164}`)}

            style={{ flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 0.5, borderColor: BORDER, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#4A90E21A", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="call" size={20} color="#4A90E2" />
            </View>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 12 }}>Call Us</Text>
            <Text style={{ color: MUTED, fontSize: 10 }}>24/7 Support</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL(buildSupportMailto("HY3N Rider Support", "Hi HY3N Support Team,\n\nI need help with:\n\n"))}
            style={{ flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 0.5, borderColor: BORDER, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD + "1A", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="email" size={20} color={GOLD} />
            </View>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 12 }}>Email</Text>
            <Text style={{ color: MUTED, fontSize: 10 }}>Within 24h</Text>
          </TouchableOpacity>
        </View>

        {/* My Tickets */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16 }}>My Tickets</Text>
          <Text style={{ color: MUTED, fontSize: 12 }}>{tickets.length} total</Text>
        </View>

        {loadingTickets ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <ActivityIndicator color={GOLD} />
            <Text style={{ color: MUTED, fontSize: 13, marginTop: 12 }}>Loading your support cases…</Text>
          </View>
        ) : tickets.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <MaterialIcons name="support-agent" size={40} color={MUTED} />
            <Text style={{ color: MUTED, fontSize: 14, marginTop: 12, textAlign: "center" }}>No support tickets yet.</Text>
          </View>
        ) : (
          tickets.map((ticket) => {
            const normalizedStatus = normalizeTicketStatus(ticket.status);
            const sc = statusConfig[normalizedStatus] || statusConfig.open;
            const updatedAt = formatTicketTimestamp(ticket.updated_date || ticket.created_date || ticket.date);
            return (
              <TouchableOpacity
                key={ticket.id}
                onPress={() => setSelectedTicket(ticket)}
                style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: BORDER }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Text style={{ color: MUTED, fontSize: 11, fontWeight: "600" }}>{ticket.id}</Text>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: sc.color + "1A" }}>
                        <Text style={{ color: sc.color, fontSize: 10, fontWeight: "700" }}>{sc.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13 }} numberOfLines={1}>{ticket.subject}</Text>
                    <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{ticket.category} • {updatedAt || "Recently created"}</Text>
                    <Text style={{ color: sc.color, fontSize: 10, marginTop: 6, fontWeight: "600" }}>{ticketStatusLabel(normalizedStatus)} · Tap to view progress</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={MUTED} />
                </View>
                {ticket.response && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: BORDER, flexDirection: "row", gap: 8 }}>
                    <MaterialIcons name="support-agent" size={14} color={GREEN} />
                    <Text style={{ color: MUTED, fontSize: 11, flex: 1 }} numberOfLines={2}>{ticket.response}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* New Ticket Modal */}
      <Modal visible={showNewTicket} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowNewTicket(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>New Support Ticket</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 10 }}>Category</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {TICKET_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: selectedCategory === cat.id ? cat.color + "1A" : CARD, borderWidth: 1, borderColor: selectedCategory === cat.id ? cat.color : BORDER }}
                >
                  <MaterialIcons name={cat.icon} size={14} color={selectedCategory === cat.id ? cat.color : MUTED} />
                  <Text style={{ color: selectedCategory === cat.id ? cat.color : MUTED, fontWeight: "600", fontSize: 12 }}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 6 }}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Brief description of your issue"
              placeholderTextColor="#4A4A4A"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 14 }}
            />

            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 6 }}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Please describe your issue in detail..."
              placeholderTextColor="#4A4A4A"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 20, minHeight: 120 }}
            />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <MaterialIcons name="send" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Submit Ticket</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Ticket Detail Modal */}
      <Modal visible={!!selectedTicket} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setSelectedTicket(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Ticket Details</Text>
          </View>
          {selectedTicket && (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
                {[
                  { label: "Ticket ID", value: selectedTicket.id },
                  { label: "Category", value: selectedTicket.category },
                  { label: "Created", value: formatTicketTimestamp(selectedTicket.created_date || selectedTicket.date) || "Recently" },
                  { label: "Last updated", value: formatTicketTimestamp(selectedTicket.updated_date) || "Not available" },
                  { label: "Status", value: ticketStatusLabel(selectedStatus) },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                    <Text style={{ color: MUTED, fontSize: 13 }}>{row.label}</Text>
                    <Text style={{ color: TEXT, fontSize: 13, fontWeight: "600" }}>{row.value}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Case Progress</Text>
              <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
                {ticketProgress(selectedStatus).map((step, index) => (
                  <View key={step.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: index === ticketProgress(selectedStatus).length - 1 ? 26 : 42 }}>
                    <View style={{ alignItems: "center", width: 20 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: step.complete || step.current ? GREEN : "transparent", borderWidth: 1.5, borderColor: step.complete || step.current ? GREEN : BORDER }}>
                        {(step.complete || step.current) && <MaterialIcons name={step.complete ? "check" : "more-horiz"} size={12} color="#fff" />}
                      </View>
                      {index < ticketProgress(selectedStatus).length - 1 && <View style={{ width: 1, flex: 1, minHeight: 22, backgroundColor: step.complete ? GREEN : BORDER, marginTop: 3 }} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 8 }}>
                      <Text style={{ color: step.current || step.complete ? TEXT : MUTED, fontWeight: step.current ? "800" : "600", fontSize: 13 }}>{step.label}</Text>
                      {step.current && <Text style={{ color: GOLD, fontSize: 10, marginTop: 2 }}>{ticketStatusLabel(selectedStatus)}</Text>}
                    </View>
                  </View>
                ))}
                {selectedStatus === "pending_user" && <Text style={{ color: GOLD, fontSize: 11, marginTop: 4 }}>HY3N Support needs more information from you. Check the case response below.</Text>}
              </View>
              <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Your Issue</Text>
              <View style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14, marginBottom: 6 }}>{selectedTicket.subject}</Text>
              </View>
              {selectedTicket.response && (
                <>
                  <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Support Response</Text>
                  <View style={{ backgroundColor: `${GREEN}1A`, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${GREEN}4D` }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <MaterialIcons name="support-agent" size={18} color={GREEN} />
                      <Text style={{ color: GREEN, fontWeight: "600", fontSize: 13 }}>HY3N Support Team</Text>
                    </View>
                    <Text style={{ color: TEXT, fontSize: 13, lineHeight: 20 }}>{selectedTicket.response}</Text>
                    {selectedTicket.response_date && <Text style={{ color: MUTED, fontSize: 10, marginTop: 8 }}>Updated {formatTicketTimestamp(selectedTicket.response_date)}</Text>}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}
