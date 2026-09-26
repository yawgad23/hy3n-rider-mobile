import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/hooks/use-colors';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { normalizeGhanaMobilePhone, toGhanaLocalPhoneInput } from '@/lib/ghana-phone';

export default function RegisterScreen() {
  const colors = useColors();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  const handleRegister = async () => {
    const normalizedPhone = normalizeGhanaMobilePhone(phone);
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!normalizedPhone) {
      Alert.alert('Phone number', 'Enter a valid 9-digit Ghana mobile number.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await signUp(
        email.trim(),
        password,
        fullName.trim(),
        normalizedPhone,
        inviteCode.trim().toUpperCase() || undefined,
      );
      router.replace('/(tabs)');
    } catch (err: any) {
      if (String(err?.code || '') === 'auth/email-already-in-use') {
        Alert.alert(
          'Account already exists',
          'This email already has a HY3N account. Please enter your password on the Log in page.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log in', onPress: () => router.replace('/login' as any) },
          ],
        );
      } else {
        Alert.alert('Registration Failed', err.message || 'Could not create account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={[styles.logoCircle, { backgroundColor: '#D4AF37' }]}>
            <Text style={styles.logoText}>H</Text>
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>HY3N</Text>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Create account</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Join HY3N today</Text>

        {/* Full Name */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="person" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Full Name"
            placeholderTextColor={colors.muted}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
        </View>

        {/* Email */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="email" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Ghana phone number */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.phonePrefix}>
            <Text style={[styles.phonePrefixText, { color: colors.foreground }]}>🇬🇭 +233</Text>
          </View>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="24 123 4567"
            placeholderTextColor={colors.muted}
            value={phone}
            onChangeText={(value) => setPhone(toGhanaLocalPhoneInput(value))}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={9}
          />
        </View>

        {/* Password */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="lock" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Confirm Password */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="lock-outline" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Confirm password"
            placeholderTextColor={colors.muted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
          />
        </View>

        {/* Invite Code */}
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="card-giftcard" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Invite Code (optional)"
            placeholderTextColor={colors.muted}
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            returnKeyType="done"
          />
        </View>
        <Text style={[styles.bonusHint, { color: '#22C55E' }]}>🎁 Get GH₵10 bonus on your first trip with an invite code</Text>

        {/* Register button */}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#006B3F' }, loading && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Login link */}
        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.muted }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/login' as any)}>
            <Text style={[styles.loginLink, { color: '#D4AF37' }]}>Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  logoCircle: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  logoText: { fontSize: 24, fontWeight: '900', color: '#000' },
  appName: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 32 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, marginBottom: 14, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 50, fontSize: 15 },
  phonePrefix: { borderRightWidth: 1, borderRightColor: '#2A2A2A', paddingRight: 10, marginRight: 10 },
  phonePrefixText: { fontSize: 14, fontWeight: '700' },
  eyeBtn: { padding: 4 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginText: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },
  bonusHint: { fontSize: 12, textAlign: 'center', marginBottom: 20, marginTop: -8 },
});
