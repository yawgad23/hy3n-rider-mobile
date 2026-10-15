import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { firebaseAuth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { normalizeGhanaMobilePhone, toGhanaLocalPhoneInput } from '@/lib/ghana-phone';
import { riderProfileIsComplete } from '@/lib/rider-profile-completeness';
import { useColors } from '@/hooks/use-colors';

const GREEN = '#006B3F';
const GOLD = '#D4AF37';

export default function CompleteProfileScreen() {
  const colors = useColors();
  const { user, riderProfile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const sessionEmail = useMemo(() => user?.email?.trim().toLowerCase() || '', [user?.email]);
  const emailLockedToSession = Boolean(sessionEmail);

  useEffect(() => {
    setFullName(String(riderProfile?.full_name || user?.displayName || '').trim());
    setEmail(String(riderProfile?.email || sessionEmail || '').trim().toLowerCase());
    setPhone(toGhanaLocalPhoneInput(String(riderProfile?.phone || user?.phoneNumber || '')));
  }, [riderProfile?.full_name, riderProfile?.email, riderProfile?.phone, sessionEmail, user?.displayName, user?.phoneNumber]);

  useEffect(() => {
    if (!user) router.replace('/login' as never);
  }, [user]);

  useEffect(() => {
    if (riderProfileIsComplete(riderProfile)) router.replace('/(tabs)' as never);
  }, [riderProfile]);

  const saveProfile = async () => {
    const normalizedName = fullName.trim().replace(/\s+/g, ' ');
    const normalizedEmail = (sessionEmail || email).trim().toLowerCase();
    const normalizedPhone = normalizeGhanaMobilePhone(phone);

    if (normalizedName.length < 2) {
      Alert.alert('Full name required', 'Enter your first and last name to continue.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Email required', 'Enter a valid email address to continue.');
      return;
    }
    if (!normalizedPhone) {
      Alert.alert('Phone number required', 'Enter a valid 9-digit Ghana mobile number to continue.');
      return;
    }

    setSaving(true);
    try {
      await firebaseAuth.syncRiderProfile({
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
      });
      await refreshProfile();
      router.replace('/(tabs)' as never);
    } catch (error: any) {
      Alert.alert('Profile not saved', error?.message || 'Please check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.iconCircle, { backgroundColor: `${GOLD}1F` }]}>
          <MaterialIcons name="verified-user" size={34} color={GOLD} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Complete your HY3N profile</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Your full name, email address, and Ghana mobile number are required before you can request a ride.</Text>

        <Text style={[styles.label, { color: colors.muted }]}>FULL NAME</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="person" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            autoComplete="name"
          />
        </View>

        <Text style={[styles.label, { color: colors.muted }]}>EMAIL ADDRESS</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, opacity: emailLockedToSession ? 0.76 : 1 }]}>
          <MaterialIcons name="email" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={email}
            onChangeText={setEmail}
            editable={!emailLockedToSession}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>
        {emailLockedToSession && <Text style={[styles.helper, { color: colors.muted }]}>This email is verified by your sign-in.</Text>}

        <Text style={[styles.label, { color: colors.muted }]}>GHANA MOBILE NUMBER</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.phonePrefix, { color: colors.foreground }]}>🇬🇭 +233</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={phone}
            onChangeText={(value) => setPhone(toGhanaLocalPhoneInput(value))}
            placeholder="24 123 4567"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={9}
          />
        </View>

        <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={saveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save and continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={async () => {
            await signOut();
            router.replace('/login' as never);
          }}
          disabled={saving}
        >
          <Text style={[styles.signOutText, { color: colors.muted }]}>Use a different account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 22 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 30 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, minHeight: 54, paddingHorizontal: 14, marginBottom: 16 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, minHeight: 52 },
  phonePrefix: { paddingRight: 10, marginRight: 10, borderRightWidth: 1, borderRightColor: '#404040', fontSize: 14, fontWeight: '700' },
  helper: { fontSize: 12, marginTop: -10, marginBottom: 16 },
  saveButton: { height: 54, backgroundColor: GREEN, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  signOutButton: { alignItems: 'center', paddingVertical: 20 },
  signOutText: { fontSize: 14, fontWeight: '600' },
});
