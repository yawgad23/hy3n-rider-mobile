import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Switch,
  Share,
  Platform,
  Clipboard,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import * as LocalAuthentication from 'expo-local-authentication';
import { Notifications } from '@/lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GOLD = "#D4AF37";
const GREEN = "#006B3F";
const RED = "#CE1126";
const BG = "#0A0A0A";
const SURFACE = "#111111";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

const LOYALTY_TIERS = [
  { name: "Bronze", minPoints: 0, maxPoints: 499, color: "#CD7F32" },
  { name: "Silver", minPoints: 500, maxPoints: 1499, color: "#C0C0C0" },
  { name: "Gold", minPoints: 1500, maxPoints: 2999, color: "#D4AF37" },
  { name: "Platinum", minPoints: 3000, maxPoints: Infinity, color: "#E5E4E2" },
];

const GHC = "GH₵"; // Ghana Cedis symbol — always use this constant, never \u20B5 in JSX strings

const REWARDS = [
  { id: "r1", name: "Free Standard Ride", points: 200, description: `Get one free Standard ride up to ${GHC}40`, icon: "directions-car" as const },
  { id: "r2", name: "10% Discount", points: 100, description: "10% off your next 3 rides", icon: "local-offer" as const },
  { id: "r3", name: "Priority Matching", points: 150, description: "Get matched with top-rated drivers for 7 days", icon: "star" as const },
  { id: "r4", name: `${GHC}20 Wallet Credit`, points: 250, description: `Add ${GHC}20 directly to your wallet`, icon: "account-balance-wallet" as const },
];

const FAQ_ITEMS = [
  { q: "How do I book a ride?", a: "Tap 'Where to?' on the home screen, enter your destination, select a ride category, and tap 'Request HY3N'. A driver will be matched to you within minutes." },
  { q: "What payment methods are accepted?", a: "We accept Cash, Mobile Money (MoMo), HY3N Wallet, and Debit/Credit Cards. You can change your payment method before requesting a ride." },
  { q: "How do I cancel a ride?", a: "You can cancel a ride before a driver is assigned for free. After a driver accepts, a cancellation fee may apply depending on how long they've been waiting." },
  { q: "What is the HY3N Wallet?", a: "The HY3N Wallet is a digital balance you can top up and use to pay for rides. It's the fastest and most convenient payment method on the platform." },
  { q: "How does the loyalty program work?", a: "Earn points on every completed ride. Points accumulate to unlock Bronze, Silver, Gold, and Platinum tiers, each with exclusive benefits and rewards." },
  { q: "What is Kantanka?", a: "Kantanka is our Ghana-made vehicle category featuring locally manufactured Kantanka cars. Choose Kantanka to support Ghanaian innovation!" },
  { q: "How do I report a safety issue?", a: "Go to Account \u2192 Safety Center, or use the SOS button during an active ride. Our safety team is available 24/7." },
  { q: "Can I schedule a ride in advance?", a: "Yes! When booking, tap 'Schedule' instead of 'Now' to pick a date and time up to 7 days in advance." },
];

const SAVED_PLACES_DEFAULT = [
  { id: "home", label: "Home", address: "Nmai Dzorm, Accra", icon: "home" as const },
  { id: "work", label: "Work", address: "Not set", icon: "work" as const },
];

export default function AccountScreen() {
  const router = useRouter();
  const { user, riderProfile, signOut, deleteAccount, updateProfile } = useAuth();
  const userPoints = riderProfile?.loyalty_points ?? 0;

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [name, setName] = useState(riderProfile?.full_name || user?.displayName || 'Rider');
  const [phone, setPhone] = useState(riderProfile?.phone || user?.phoneNumber || '');
  const [email, setEmail] = useState(riderProfile?.email || user?.email || '');
  const [editName, setEditName] = useState(name);
  const [editPhone, setEditPhone] = useState(phone);
  const [editEmail, setEditEmail] = useState(email);

  useEffect(() => {
    if (riderProfile) {
      setName(riderProfile.full_name || user?.displayName || 'Rider');
      setPhone(riderProfile.phone || user?.phoneNumber || '');
      setEmail(riderProfile.email || user?.email || '');
    }
  }, [riderProfile]);

  const [showSavedPlaces, setShowSavedPlaces] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState(SAVED_PLACES_DEFAULT);
  const [editingPlace, setEditingPlace] = useState<typeof SAVED_PLACES_DEFAULT[0] | null>(null);
  const [placeAddress, setPlaceAddress] = useState("");

  const [showLoyalty, setShowLoyalty] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showRefer, setShowRefer] = useState(false);
  const referCode = riderProfile?.referral_code || 'HY3N-' + (user?.uid?.slice(0, 6).toUpperCase() || 'RIDER');

  const [notifications, setNotifications] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);
  const [darkMode, setDarkMode] = useState(true); // HY3N is always dark — this is a visual toggle for future light mode
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Load biometric state
  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
      const saved = await AsyncStorage.getItem('biometric_enabled');
      setBiometricEnabled(saved === 'true');
    })();
  }, []);

  // Wire notification toggle to OS permission
  const handleNotificationToggle = async (val: boolean) => {
    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotifications(status === 'granted');
    } else {
      setNotifications(false);
    }
  };

  const handleBiometricToggle = async (val: boolean) => {
    if (val) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable biometric login',
        fallbackLabel: 'Use passcode',
      });
      if (result.success) {
        setBiometricEnabled(true);
        await AsyncStorage.setItem('biometric_enabled', 'true');
        Alert.alert('Biometric Enabled', 'You can now log in with Face ID or fingerprint.');
      }
    } else {
      setBiometricEnabled(false);
      await AsyncStorage.setItem('biometric_enabled', 'false');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all ride history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/login' as any);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  const currentTier = LOYALTY_TIERS.find(t => userPoints >= t.minPoints && userPoints <= t.maxPoints) || LOYALTY_TIERS[0];
  const nextTier = LOYALTY_TIERS[LOYALTY_TIERS.indexOf(currentTier) + 1];
  const progressToNext = nextTier ? (userPoints - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints) : 1;

  const handleSaveProfile = async () => {
    setName(editName);
    setPhone(editPhone);
    setEmail(editEmail);
    setShowEditProfile(false);
    try {
      await updateProfile({ full_name: editName, phone: editPhone, email: editEmail });
      Alert.alert('Saved', 'Profile updated successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to save profile');
    }
  };

  const handleSavePlace = () => {
    if (!placeAddress.trim()) { Alert.alert("Required", "Please enter an address"); return; }
    setSavedPlaces(prev => prev.map(p => p.id === editingPlace?.id ? { ...p, address: placeAddress } : p));
    setEditingPlace(null);
    Alert.alert("Saved", "Place updated successfully");
  };

  const handleRedeemReward = (reward: typeof REWARDS[0]) => {
    if (userPoints < reward.points) {
      Alert.alert("Not enough points", `You need ${reward.points - userPoints} more points to redeem this reward`);
      return;
    }
    Alert.alert("Redeem Reward", `Redeem "${reward.name}" for ${reward.points} points?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Redeem", onPress: () => Alert.alert("Redeemed!", `${reward.name} has been added to your account`) },
    ]);
  };

  const handleShare = async () => {
    try {
      await Share.share({
          message: `Join HY3N – Ghana's premier ride-hailing app! Use my referral code ${referCode} to get ${GHC}10 off your first ride. Download: https://hy3n.app`,
        title: "Join HY3N",
      });
    } catch (e) {}
  };

  const MenuItem = ({ icon, label, value, onPress, color, showArrow = true }: { icon: any; label: string; value?: string; onPress?: () => void; color?: string; showArrow?: boolean }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color ? `${color}1A` : CARD, alignItems: "center", justifyContent: "center" }}>
        <MaterialIcons name={icon} size={18} color={color || MUTED} />
      </View>
      <Text style={{ color: TEXT, fontSize: 14, fontWeight: "500", flex: 1 }}>{label}</Text>
      {value && <Text style={{ color: MUTED, fontSize: 13 }}>{value}</Text>}
      {showArrow && <MaterialIcons name="chevron-right" size={18} color={MUTED} />}
    </TouchableOpacity>
  );

  return (
    <ScreenContainer containerClassName="bg-[#0A0A0A]" safeAreaClassName="bg-[#0A0A0A]">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
          <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22 }}>Account</Text>
        </View>

        {/* Profile Card */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: CARD, borderRadius: 20, padding: 16, borderWidth: 0.5, borderColor: BORDER }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${GOLD}33`, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: GOLD }}>
              <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 22 }}>{name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 17 }}>{name}</Text>
              <Text style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>{phone}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: `${currentTier.color}1A`, borderWidth: 1, borderColor: `${currentTier.color}4D` }}>
                  <Text style={{ color: currentTier.color, fontSize: 11, fontWeight: "700" }}>{currentTier.name} Member</Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 11 }}>{userPoints} pts</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { setEditName(name); setEditPhone(phone); setEditEmail(email); setShowEditProfile(true); }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: BORDER }}
            >
              <MaterialIcons name="edit" size={16} color={GOLD} />
            </TouchableOpacity>
          </View>
          {nextTier && (
            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: BORDER }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ color: MUTED, fontSize: 11 }}>{currentTier.name}</Text>
                <Text style={{ color: MUTED, fontSize: 11 }}>{nextTier.name} ({nextTier.minPoints} pts)</Text>
              </View>
              <View style={{ height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${progressToNext * 100}%`, backgroundColor: currentTier.color, borderRadius: 3 }} />
              </View>
              <Text style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>{nextTier.minPoints - userPoints} points to {nextTier.name}</Text>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={{ flexDirection: "row", marginHorizontal: 16, gap: 8, marginBottom: 16 }}>
          {[
            { label: "Total Rides", value: riderProfile?.total_rides != null ? `${riderProfile.total_rides}` : '0', icon: "directions-car" as const, color: GREEN },
            { label: "Loyalty Points", value: `${userPoints}`, icon: "star" as const, color: GOLD },
            { label: "Rating", value: riderProfile?.rating != null ? riderProfile.rating.toFixed(1) : '—', icon: "thumb-up" as const, color: "#4A90E2" },
          ].map((stat, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 0.5, borderColor: BORDER }}>
              <MaterialIcons name={stat.icon} size={18} color={stat.color} />
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16, marginTop: 4 }}>{stat.value}</Text>
              <Text style={{ color: MUTED, fontSize: 10, textAlign: "center" }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Account Section */}
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: CARD, borderRadius: 16, overflow: "hidden", borderWidth: 0.5, borderColor: BORDER }}>
          <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Account</Text>
          <MenuItem icon="place" label="Saved Places" color={GREEN} onPress={() => setShowSavedPlaces(true)} />
          <MenuItem icon="emoji-events" label="Loyalty Rewards" value={`${userPoints} pts`} color={GOLD} onPress={() => setShowLoyalty(true)} />
          <MenuItem icon="history" label="Ride History" color="#4A90E2" onPress={() => router.push("/activity")} />
          <MenuItem icon="schedule" label="Scheduled Trips" color="#9B59B6" onPress={() => router.push("/scheduled")} />
        </View>

        {/* Safety & Support */}
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: CARD, borderRadius: 16, overflow: "hidden", borderWidth: 0.5, borderColor: BORDER }}>
          <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Safety & Support</Text>
          <MenuItem icon="security" label="Safety Center" color={RED} onPress={() => router.push("/safety")} />
          <MenuItem icon="help-outline" label="Help Center" color="#4A90E2" onPress={() => setShowHelp(true)} />
          <MenuItem icon="support-agent" label="Contact Support" color={GREEN} onPress={() => router.push("/support")} />
          <MenuItem icon="people" label="Refer a Friend" value={`Earn ${GHC}10`} color={GOLD} onPress={() => setShowRefer(true)} />
        </View>

        {/* Settings */}
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: CARD, borderRadius: 16, overflow: "hidden", borderWidth: 0.5, borderColor: BORDER }}>
          <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Settings</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${GOLD}1A`, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="notifications" size={18} color={GOLD} />
            </View>
            <Text style={{ color: TEXT, fontSize: 14, fontWeight: "500", flex: 1 }}>Push Notifications</Text>
            <Switch value={notifications} onValueChange={setNotifications} trackColor={{ false: BORDER, true: `${GREEN}80` }} thumbColor={notifications ? GREEN : MUTED} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="location-on" size={18} color={GREEN} />
            </View>
            <Text style={{ color: TEXT, fontSize: 14, fontWeight: "500", flex: 1 }}>Location Sharing</Text>
            <Switch value={locationSharing} onValueChange={setLocationSharing} trackColor={{ false: BORDER, true: `${GREEN}80` }} thumbColor={locationSharing ? GREEN : MUTED} />
          </View>
          {biometricAvailable && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: biometricEnabled ? `${GREEN}1A` : `${MUTED}1A`, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="fingerprint" size={18} color={biometricEnabled ? GREEN : MUTED} />
              </View>
              <Text style={{ color: TEXT, fontSize: 14, fontWeight: "500", flex: 1 }}>Biometric Login</Text>
              <Switch value={biometricEnabled} onValueChange={handleBiometricToggle} trackColor={{ false: BORDER, true: `${GREEN}80` }} thumbColor={biometricEnabled ? GREEN : MUTED} />
            </View>
          )}
          <MenuItem icon="privacy-tip" label="Privacy Policy & Terms" color={MUTED} onPress={() => router.push('/privacy' as any)} />
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={() => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login' as any); } }])}
          style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: `${RED}1A`, borderRadius: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: `${RED}4D` }}
        >
          <MaterialIcons name="logout" size={18} color={RED} />
          <Text style={{ color: RED, fontWeight: "bold", fontSize: 15 }}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          onPress={handleDeleteAccount}
          style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: 'transparent', borderRadius: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: `${RED}33` }}
        >
          <MaterialIcons name="delete-forever" size={18} color={`${RED}99`} />
          <Text style={{ color: `${RED}99`, fontWeight: "600", fontSize: 14 }}>Delete Account</Text>
        </TouchableOpacity>

        <Text style={{ color: MUTED, fontSize: 11, textAlign: "center", marginBottom: 8 }}>HY3N Rider v1.0.0 \u2022 Made in Ghana</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowEditProfile(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Edit Profile</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${GOLD}33`, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: GOLD, marginBottom: 8 }}>
                <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 30 }}>{editName.charAt(0)}</Text>
              </View>
              <TouchableOpacity><Text style={{ color: GOLD, fontSize: 13, fontWeight: "600" }}>Change Photo</Text></TouchableOpacity>
            </View>
            {[
              { label: "Full Name", value: editName, onChange: setEditName, icon: "person", keyboard: "default" as const },
              { label: "Phone Number", value: editPhone, onChange: setEditPhone, icon: "phone", keyboard: "phone-pad" as const },
              { label: "Email Address", value: editEmail, onChange: setEditEmail, icon: "email", keyboard: "email-address" as const },
            ].map((field) => (
              <View key={field.label} style={{ marginBottom: 14 }}>
                <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 6 }}>{field.label}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14 }}>
                  <MaterialIcons name={field.icon as any} size={18} color={MUTED} style={{ marginRight: 8 }} />
                  <TextInput
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType={field.keyboard}
                    style={{ flex: 1, color: TEXT, fontSize: 14, paddingVertical: 14 }}
                  />
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={handleSaveProfile} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Save Changes</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Saved Places Modal */}
      <Modal visible={showSavedPlaces} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => { setShowSavedPlaces(false); setEditingPlace(null); }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Saved Places</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {editingPlace ? (
              <>
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16, marginBottom: 16 }}>Edit {editingPlace.label}</Text>
                <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Address</Text>
                <TextInput
                  value={placeAddress}
                  onChangeText={setPlaceAddress}
                  placeholder={`Enter ${editingPlace.label} address...`}
                  placeholderTextColor="#4A4A4A"
                  style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 16 }}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity onPress={() => setEditingPlace(null)} style={{ flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                    <Text style={{ color: MUTED, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSavePlace} style={{ flex: 1, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "bold" }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {savedPlaces.map((place) => (
                  <View key={place.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: BORDER }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={place.icon} size={20} color={GREEN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14 }}>{place.label}</Text>
                      <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{place.address}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setEditingPlace(place); setPlaceAddress(place.address === "Not set" ? "" : place.address); }}
                      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center" }}
                    >
                      <MaterialIcons name="edit" size={16} color={GOLD} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => Alert.alert("Add Place", "Custom saved places coming soon!")}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: `${GOLD}4D`, borderRadius: 14, padding: 14 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${GOLD}1A`, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="add" size={20} color={GOLD} />
                  </View>
                  <Text style={{ color: GOLD, fontWeight: "600", fontSize: 14 }}>Add New Place</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Loyalty Rewards Modal */}
      <Modal visible={showLoyalty} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowLoyalty(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Loyalty Rewards</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ backgroundColor: `${GOLD}1A`, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: `${GOLD}4D`, alignItems: "center" }}>
              <MaterialIcons name="emoji-events" size={32} color={GOLD} />
              <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 28, marginTop: 8 }}>{userPoints} Points</Text>
              <Text style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>{currentTier.name} Member</Text>
              {nextTier && (
                <>
                  <View style={{ width: "100%", height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
                    <View style={{ height: "100%", width: `${progressToNext * 100}%`, backgroundColor: GOLD, borderRadius: 3 }} />
                  </View>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>{nextTier.minPoints - userPoints} pts to {nextTier.name}</Text>
                </>
              )}
            </View>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Membership Tiers</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {LOYALTY_TIERS.map((tier) => {
                const isActive = tier.name === currentTier.name;
                return (
                  <View key={tier.name} style={{ flex: 1, backgroundColor: isActive ? `${tier.color}1A` : CARD, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: isActive ? tier.color : BORDER }}>
                    <MaterialIcons name="emoji-events" size={20} color={tier.color} />
                    <Text style={{ color: tier.color, fontWeight: "bold", fontSize: 11, marginTop: 4 }}>{tier.name}</Text>
                    <Text style={{ color: MUTED, fontSize: 9, textAlign: "center", marginTop: 2 }}>{tier.minPoints}+ pts</Text>
                  </View>
                );
              })}
            </View>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Redeem Rewards</Text>
            <View style={{ gap: 10 }}>
              {REWARDS.map((reward) => {
                const canRedeem = userPoints >= reward.points;
                return (
                  <View key={reward.id} style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${GOLD}1A`, alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={reward.icon} size={22} color={GOLD} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13 }}>{reward.name}</Text>
                      <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{reward.description}</Text>
                      <Text style={{ color: GOLD, fontSize: 11, fontWeight: "600", marginTop: 4 }}>{reward.points} points</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRedeemReward(reward)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: canRedeem ? GREEN : SURFACE, borderWidth: 1, borderColor: canRedeem ? GREEN : BORDER }}
                    >
                      <Text style={{ color: canRedeem ? "#fff" : MUTED, fontWeight: "600", fontSize: 12 }}>Redeem</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Help Center Modal */}
      <Modal visible={showHelp} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowHelp(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Help Center</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ backgroundColor: `${GREEN}1A`, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: `${GREEN}4D`, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <MaterialIcons name="support-agent" size={22} color={GREEN} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13 }}>Need more help?</Text>
                <Text style={{ color: MUTED, fontSize: 12 }}>Our support team is available 24/7</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowHelp(false); router.push("/support"); }} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: GREEN, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Contact</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 10 }}>Frequently Asked Questions</Text>
            {FAQ_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
                style={{ backgroundColor: CARD, borderRadius: 12, marginBottom: 8, overflow: "hidden", borderWidth: 0.5, borderColor: expandedFaq === i ? `${GOLD}66` : BORDER }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}>
                  <Text style={{ color: TEXT, fontWeight: "600", fontSize: 13, flex: 1 }}>{item.q}</Text>
                  <MaterialIcons name={expandedFaq === i ? "expand-less" : "expand-more"} size={20} color={MUTED} />
                </View>
                {expandedFaq === i && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                    <Text style={{ color: MUTED, fontSize: 13, lineHeight: 20 }}>{item.a}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Refer a Friend Modal */}
      <Modal visible={showRefer} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowRefer(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, flex: 1 }}>Refer a Friend</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${GOLD}1A`, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <MaterialIcons name="people" size={40} color={GOLD} />
              </View>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22, marginBottom: 8 }}>{`Earn ${GHC}10 Each!`}</Text>
              <Text style={{ color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                {`Share your referral code with friends. You both get ${GHC}10 wallet credit when they complete their first ride.`}
              </Text>
            </View>
            <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 14, marginBottom: 12 }}>How it works</Text>
              {[
                { step: "1", text: "Share your unique referral code" },
                { step: "2", text: "Friend signs up using your code" },
                { step: "3", text: "Friend completes their first ride" },
                { step: "4", text: `You both get ${GHC}10 wallet credit!` },
              ].map((item) => (
                <View key={item.step} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${GOLD}1A`, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 13 }}>{item.step}</Text>
                  </View>
                  <Text style={{ color: MUTED, fontSize: 13, flex: 1 }}>{item.text}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Your Referral Code</Text>
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: `${GOLD}4D`, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 18, flex: 1, letterSpacing: 1 }}>{referCode}</Text>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Clipboard.setString(referCode);
                  }
                  Alert.alert("Copied!", `Referral code ${referCode} copied to clipboard`);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: `${GOLD}1A`, borderRadius: 8, borderWidth: 1, borderColor: `${GOLD}4D` }}
              >
                <Text style={{ color: GOLD, fontWeight: "600", fontSize: 12 }}>Copy</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleShare}
              style={{ backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <MaterialIcons name="share" size={20} color="#000" />
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 16 }}>Share with Friends</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
