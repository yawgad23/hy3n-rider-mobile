import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import { firestoreDB, COLLECTIONS } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";

const GOLD = "#D4AF37";
const GREEN = "#006B3F";
const RED = "#CE1126";
const BG = "#0A0A0A";
const SURFACE = "#111111";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

const MOMO_NETWORKS = [
  { id: "mtn-gh", label: "MTN MoMo", color: "#FFD700" },
  { id: "vodafone-gh", label: "Telecel Cash", color: "#E60000" },
  { id: "tigo-gh", label: "AirtelTigo Money", color: "#FF6600" },
];

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

interface Transaction {
  id: string;
  type: "credit" | "debit" | "refund";
  amount: number;
  description: string;
  date: string;
  reference: string;
  status?: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const hours = diff / 3600000;
  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 48) return "Yesterday";
  return d.toLocaleDateString("en-GH", { month: "short", day: "numeric" });
}

type TopUpStage = "idle" | "processing" | "ussd_sent" | "success" | "failed";

export default function WalletScreen() {
  const { user, riderProfile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Top-up modal state
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [momoNumber, setMomoNumber] = useState("");
  const [momoNetwork, setMomoNetwork] = useState("mtn-gh");
  const [topUpStage, setTopUpStage] = useState<TopUpStage>("idle");
  const [topUpMessage, setTopUpMessage] = useState("");
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Transaction detail modal
  const [showTxDetail, setShowTxDetail] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // tRPC mutation
  const topupMutation = trpc.wallet.topup.useMutation();

  // Load balance from Firestore (real-time)
  useEffect(() => {
    if (!user) return;
    setBalanceLoading(true);
    const unsub = firestoreDB.subscribeDoc(COLLECTIONS.WALLET, user.uid, (data) => {
      setBalance(data?.balance ?? 0);
      setBalanceLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Load transactions from Firestore
  const loadTransactions = useCallback(async () => {
    if (!user) return;
    try {
      const txns = await firestoreDB.list(
        COLLECTIONS.WALLET_TRANSACTIONS,
        { user_id: user.uid },
        "date",
        "desc",
        30,
      );
      setTransactions(txns as Transaction[]);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  }, [loadTransactions]);

  // Poll Firestore for transaction status after USSD sent
  const startPolling = useCallback((txId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const tx = await firestoreDB.get(COLLECTIONS.WALLET_TRANSACTIONS, txId);
        if (tx?.status === "completed") {
          clearInterval(pollRef.current!);
          setTopUpStage("success");
          setTopUpMessage(`GH₵${tx.amount} has been added to your wallet!`);
          loadTransactions();
        } else if (tx?.status === "failed") {
          clearInterval(pollRef.current!);
          setTopUpStage("failed");
          setTopUpMessage("Payment was declined. Please try again.");
        }
      } catch { /* ignore */ }
      // Stop polling after 3 minutes (36 × 5s)
      if (attempts >= 36) {
        clearInterval(pollRef.current!);
        setTopUpStage("failed");
        setTopUpMessage("Payment timed out. If you approved the prompt, please contact support.");
      }
    }, 5000);
  }, [loadTransactions]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount < 5) { Alert.alert("Invalid Amount", "Minimum top-up is GH₵5.00"); return; }
    if (amount > 5000) { Alert.alert("Invalid Amount", "Maximum top-up is GH₵5,000.00"); return; }
    if (!momoNumber.trim() || momoNumber.replace(/\D/g, "").length < 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit MoMo number");
      return;
    }
    if (!user) return;

    setTopUpStage("processing");
    setTopUpMessage("Contacting Hubtel...");

    try {
      const result = await topupMutation.mutateAsync({
        riderId: user.uid,
        riderName: riderProfile?.full_name || user.displayName || "Rider",
        momoNumber: momoNumber.trim(),
        momoNetwork,
        amount,
      });

      if (result.success) {
        setPendingTxId(result.txId);
        setTopUpStage("ussd_sent");
        setTopUpMessage("A USSD prompt has been sent to your phone. Enter your MoMo PIN to approve.");
        startPolling(result.txId);
      } else {
        setTopUpStage("failed");
        setTopUpMessage(result.message || "Top-up failed. Please try again.");
      }
    } catch (err: any) {
      setTopUpStage("failed");
      setTopUpMessage(err?.message || "Something went wrong. Please try again.");
    }
  };

  const resetTopUp = () => {
    setTopUpStage("idle");
    setTopUpMessage("");
    setTopUpAmount("");
    setPendingTxId(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const closeTopUp = () => {
    resetTopUp();
    setShowTopUp(false);
  };

  const totalCredits = transactions.filter(t => t.type === "credit" || t.type === "refund").reduce((s, t) => s + t.amount, 0);
  const totalDebits = transactions.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const totalRides = transactions.filter(t => t.type === "debit").length;

  const txColor = (t: Transaction) => t.type === "credit" ? GREEN : t.type === "refund" ? "#4A90E2" : RED;
  const txSign = (t: Transaction) => t.type === "debit" ? "-" : "+";
  const txIconName = (t: Transaction): any =>
    t.type === "credit" ? "add-circle" : t.type === "refund" ? "replay" : "remove-circle";

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
          <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22 }}>Wallet</Text>
          <Text style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Manage your HY3N balance</Text>
        </View>

        {/* Balance Card */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, borderRadius: 20, overflow: "hidden" }}>
          <View style={{ backgroundColor: GREEN, padding: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="account-balance-wallet" size={18} color="#fff" />
                </View>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" }}>HY3N Wallet</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Active</Text>
              </View>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginBottom: 4 }}>Available Balance</Text>
            {balanceLoading ? (
              <ActivityIndicator color="#fff" size="large" style={{ marginVertical: 8 }} />
            ) : (
              <Text style={{ color: "#fff", fontSize: 38, fontWeight: "bold", letterSpacing: -1 }}>
                GH₵{balance.toFixed(2)}
              </Text>
            )}
          </View>
          {/* Stats Row */}
          <View style={{ flexDirection: "row", backgroundColor: CARD }}>
            {[
              { label: "Total Loaded", value: `GH₵${totalCredits.toFixed(0)}`, icon: "trending-up" as const, color: GREEN },
              { label: "Total Spent", value: `GH₵${totalDebits.toFixed(0)}`, icon: "trending-down" as const, color: RED },
              { label: "Total Rides", value: `${totalRides}`, icon: "directions-car" as const, color: GOLD },
            ].map((stat, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRightWidth: i < 2 ? 0.5 : 0, borderRightColor: BORDER }}>
                <MaterialIcons name={stat.icon} size={16} color={stat.color} />
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14, marginTop: 4 }}>{stat.value}</Text>
                <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top Up Button */}
        <TouchableOpacity
          onPress={() => setShowTopUp(true)}
          style={{ marginHorizontal: 16, marginBottom: 20, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <MaterialIcons name="add-circle" size={22} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Top Up Wallet</Text>
        </TouchableOpacity>

        {/* Transaction History */}
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16 }}>Transactions</Text>
            <Text style={{ color: MUTED, fontSize: 12 }}>{transactions.length} total</Text>
          </View>
          {transactions.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <MaterialIcons name="receipt-long" size={40} color={MUTED} />
              <Text style={{ color: MUTED, marginTop: 10, fontSize: 14 }}>No transactions yet</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>Top up your wallet to get started</Text>
            </View>
          )}
          {transactions.map((tx) => (
            <TouchableOpacity
              key={tx.id}
              onPress={() => { setSelectedTx(tx); setShowTxDetail(true); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: BORDER }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${txColor(tx)}1A`, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name={txIconName(tx)} size={20} color={txColor(tx)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>{tx.description}</Text>
                <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{formatDate(tx.date)} • {tx.reference?.slice(-8)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: txColor(tx), fontWeight: "bold", fontSize: 15 }}>
                  {txSign(tx)}GH₵{tx.amount.toFixed(2)}
                </Text>
                {tx.status === "processing" && (
                  <Text style={{ color: GOLD, fontSize: 10, marginTop: 2 }}>Pending</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ── Top Up Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={showTopUp} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={closeTopUp} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Top Up Wallet</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

            {/* ── IDLE / FORM ── */}
            {topUpStage === "idle" && (
              <>
                {/* Amount */}
                <Text style={styles.label}>Amount (GH₵)</Text>
                <View style={styles.inputRow}>
                  <MaterialIcons name="attach-money" size={20} color={MUTED} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter amount"
                    placeholderTextColor={MUTED}
                    value={topUpAmount}
                    onChangeText={setTopUpAmount}
                    keyboardType="decimal-pad"
                  />
                </View>
                {/* Quick amounts */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {QUICK_AMOUNTS.map(amt => (
                    <TouchableOpacity
                      key={amt}
                      onPress={() => setTopUpAmount(String(amt))}
                      style={[styles.chip, topUpAmount === String(amt) && { backgroundColor: GREEN, borderColor: GREEN }]}
                    >
                      <Text style={{ color: topUpAmount === String(amt) ? "#fff" : MUTED, fontSize: 13, fontWeight: "600" }}>
                        GH₵{amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* MoMo Number */}
                <Text style={styles.label}>MoMo Number</Text>
                <View style={styles.inputRow}>
                  <MaterialIcons name="smartphone" size={20} color={MUTED} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 0244123456"
                    placeholderTextColor={MUTED}
                    value={momoNumber}
                    onChangeText={setMomoNumber}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>

                {/* Network selector */}
                <Text style={styles.label}>Network</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 28 }}>
                  {MOMO_NETWORKS.map(net => (
                    <TouchableOpacity
                      key={net.id}
                      onPress={() => setMomoNetwork(net.id)}
                      style={[styles.networkBtn, momoNetwork === net.id && { borderColor: net.color, backgroundColor: `${net.color}18` }]}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: net.color, marginBottom: 4 }} />
                      <Text style={{ color: momoNetwork === net.id ? net.color : MUTED, fontSize: 11, fontWeight: "600", textAlign: "center" }}>
                        {net.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Pay button */}
                <TouchableOpacity
                  onPress={handleTopUp}
                  style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
                    Pay GH₵{topUpAmount || "0"} via MoMo
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: MUTED, fontSize: 12, textAlign: "center", marginTop: 10 }}>
                  You will receive a USSD prompt on your phone to approve the payment.
                </Text>
              </>
            )}

            {/* ── PROCESSING ── */}
            {topUpStage === "processing" && (
              <View style={styles.centeredStage}>
                <ActivityIndicator size="large" color={GOLD} style={{ marginBottom: 20 }} />
                <Text style={styles.stageTitle}>Processing...</Text>
                <Text style={styles.stageMsg}>{topUpMessage}</Text>
              </View>
            )}

            {/* ── USSD SENT ── */}
            {topUpStage === "ussd_sent" && (
              <View style={styles.centeredStage}>
                <View style={styles.iconCircle}>
                  <MaterialIcons name="smartphone" size={44} color={GOLD} />
                </View>
                <Text style={styles.stageTitle}>Check Your Phone</Text>
                <Text style={styles.stageMsg}>{topUpMessage}</Text>
                <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, width: "100%", marginTop: 20, borderWidth: 1, borderColor: BORDER }}>
                  <Text style={{ color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                    Waiting for your approval...{"\n"}This may take up to 2 minutes.
                  </Text>
                  <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} />
                </View>
                <TouchableOpacity onPress={resetTopUp} style={{ marginTop: 20 }}>
                  <Text style={{ color: MUTED, fontSize: 13 }}>Cancel and try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── SUCCESS ── */}
            {topUpStage === "success" && (
              <View style={styles.centeredStage}>
                <View style={[styles.iconCircle, { backgroundColor: `${GREEN}22`, borderColor: `${GREEN}44` }]}>
                  <MaterialIcons name="check-circle" size={52} color={GREEN} />
                </View>
                <Text style={[styles.stageTitle, { color: GREEN }]}>Top-Up Successful!</Text>
                <Text style={styles.stageMsg}>{topUpMessage}</Text>
                <TouchableOpacity
                  onPress={closeTopUp}
                  style={{ marginTop: 28, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── FAILED ── */}
            {topUpStage === "failed" && (
              <View style={styles.centeredStage}>
                <View style={[styles.iconCircle, { backgroundColor: `${RED}22`, borderColor: `${RED}44` }]}>
                  <MaterialIcons name="error" size={52} color={RED} />
                </View>
                <Text style={[styles.stageTitle, { color: RED }]}>Payment Failed</Text>
                <Text style={styles.stageMsg}>{topUpMessage}</Text>
                <TouchableOpacity
                  onPress={resetTopUp}
                  style={{ marginTop: 28, backgroundColor: CARD, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48, borderWidth: 1, borderColor: BORDER }}
                >
                  <Text style={{ color: TEXT, fontWeight: "700", fontSize: 15 }}>Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeTopUp} style={{ marginTop: 12 }}>
                  <Text style={{ color: MUTED, fontSize: 13 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Transaction Detail Modal ──────────────────────────────────────────── */}
      <Modal visible={showTxDetail} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowTxDetail(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Transaction Details</Text>
          </View>
          {selectedTx && (
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${txColor(selectedTx)}1A`, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <MaterialIcons name={txIconName(selectedTx)} size={32} color={txColor(selectedTx)} />
                </View>
                <Text style={{ color: txColor(selectedTx), fontSize: 28, fontWeight: "bold" }}>
                  {txSign(selectedTx)}GH₵{selectedTx.amount.toFixed(2)}
                </Text>
                <Text style={{ color: TEXT, fontWeight: "600", fontSize: 16, marginTop: 8 }}>{selectedTx.description}</Text>
              </View>
              {[
                { label: "Date", value: new Date(selectedTx.date).toLocaleString("en-GH") },
                { label: "Reference", value: selectedTx.reference },
                { label: "Type", value: selectedTx.type.charAt(0).toUpperCase() + selectedTx.type.slice(1) },
                { label: "Status", value: selectedTx.status || "Completed" },
              ].map(({ label, value }) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
                  <Text style={{ color: MUTED, fontSize: 14 }}>{label}</Text>
                  <Text style={{ color: TEXT, fontSize: 14, fontWeight: "600", maxWidth: "60%", textAlign: "right" }}>{value}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { color: MUTED, fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 16, height: 52 },
  input: { flex: 1, color: TEXT, fontSize: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  networkBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD },
  centeredStage: { alignItems: "center", paddingTop: 40, paddingBottom: 20 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: `${GOLD}1A`, alignItems: "center", justifyContent: "center", marginBottom: 24, borderWidth: 1.5, borderColor: `${GOLD}44` },
  stageTitle: { color: TEXT, fontWeight: "800", fontSize: 22, marginBottom: 10, textAlign: "center" },
  stageMsg: { color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22, maxWidth: 280 },
});
