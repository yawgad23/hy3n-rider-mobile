import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { auth, app } from '@/lib/firebase';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
// FirebaseRecaptchaVerifierModal crashes on web — only import on native
const FirebaseRecaptchaVerifierModal = Platform.OS !== 'web'
  ? require('expo-firebase-recaptcha').FirebaseRecaptchaVerifierModal
  : null;

const GOLD = '#D4AF37';
const GREEN = '#006B3F';
const BG = '#0A0A0A';
const CARD = '#1A1A1A';
const BORDER = '#2A2A2A';
const TEXT = '#FAFAFA';
const MUTED = '#9CA3AF';

type LoginTab = 'phone' | 'email';

// Google "G" SVG-style coloured letter using Text spans
function GoogleIcon() {
  return (
    <View style={styles.googleIconWrap}>
      {/* Render the Google G using coloured segments via a background image approach */}
      <Text style={styles.googleIconText}>
        <Text style={{ color: '#4285F4' }}>G</Text>
      </Text>
    </View>
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [tab, setTab] = useState<LoginTab>('phone');

  // Recaptcha ref for phone auth (typed as any to avoid web build type error)
  const recaptchaVerifier = useRef<any>(null);

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  // ── Phone OTP ──────────────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    setPhoneError('');
    const digits = phone.trim().replace(/\s/g, '');
    const fullNumber = '+233' + digits.replace(/^\+?233/, '').replace(/^0/, '');
    if (digits.length < 9) {
      setPhoneError('Please enter your 9-digit Ghana mobile number (e.g. 241234567)');
      return;
    }
    if (Platform.OS === 'web') {
      setPhoneError('Phone OTP is not available on web. Please use the Email tab to log in.');
      return;
    }
    if (!recaptchaVerifier.current) {
      setPhoneError('Recaptcha not ready. Please try again.');
      return;
    }
    setPhoneLoading(true);
    try {
      const provider = new PhoneAuthProvider(auth);
      const vid = await provider.verifyPhoneNumber(fullNumber, recaptchaVerifier.current);
      setVerificationId(vid);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/operation-not-supported-in-this-environment') {
        setPhoneError('Phone OTP works on real iOS/Android devices. Please use the Email tab to log in.');
      } else {
        setPhoneError(err.message || 'Failed to send OTP. Please try again.');
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setPhoneError('');
    if (!otp.trim() || otp.length < 6) {
      setPhoneError('Please enter the 6-digit verification code');
      return;
    }
    if (!verificationId) return;
    setOtpLoading(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp.trim());
      await signInWithCredential(auth, credential);
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      setPhoneError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Email Login ────────────────────────────────────────────────────────────
  const handleEmailLogin = async () => {
    setEmailError('');
    if (!email.trim() || !password.trim()) {
      setEmailError('Please enter your email and password');
      return;
    }
    setEmailLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setEmailError('Incorrect email or password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        setEmailError('Account temporarily locked. Please reset your password or try again later.');
      } else {
        setEmailError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Firebase Recaptcha Verifier — invisible, required for phone OTP on native only */}
      {Platform.OS !== 'web' && FirebaseRecaptchaVerifierModal && (
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifier}
          firebaseConfig={app.options}
          attemptInvisibleVerification={true}
          title="Verify you're human"
          cancelLabel="Cancel"
        />
      )}

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={{ width: 180, height: 180, resizeMode: 'contain' }}
          />
        </View>
        <Text style={styles.title}>Akwaaba to HY3N</Text>
        <Text style={styles.subtitle}>Ghana&apos;s premium ride-hailing app</Text>

        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          {(['phone', 'email'] as LoginTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            >
              <MaterialIcons
                name={t === 'phone' ? 'phone' : 'email'}
                size={16}
                color={tab === t ? GOLD : MUTED}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'phone' ? 'Phone' : 'Email'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Phone OTP Tab ── */}
        {tab === 'phone' && (
          <View>
            {!verificationId ? (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.inputWrap}>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 12, borderRightWidth: 1, borderRightColor: BORDER, justifyContent: 'center' }}>
                    <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>🇬🇭 +233</Text>
                  </View>
                  <TextInput
                    style={[styles.input, { flex: 1, borderWidth: 0 }]}
                    placeholder="24 123 4567"
                    placeholderTextColor={MUTED}
                    value={phone}
                    onChangeText={(val) => {
                      const stripped = val.replace(/^\+?233/, '').replace(/^0/, '');
                      setPhone(stripped);
                    }}
                    keyboardType="number-pad"
                    autoComplete="tel"
                    maxLength={9}
                  />
                </View>
                <Text style={styles.hint}>Enter your Ghana mobile number (e.g. 24 123 4567)</Text>
                {!!phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
                <TouchableOpacity
                  style={[styles.btn, phoneLoading && styles.btnDisabled]}
                  onPress={handleSendOTP}
                  disabled={phoneLoading}
                >
                  {phoneLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnText}>Send Verification Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.otpSentBanner}>
                  <MaterialIcons name="check-circle" size={18} color={GREEN} />
                  <Text style={styles.otpSentText}>Code sent to +233{phone}</Text>
                </View>
                <Text style={styles.label}>Verification Code</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="sms" size={20} color={MUTED} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit code"
                    placeholderTextColor={MUTED}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.btn, otpLoading && styles.btnDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={otpLoading}
                >
                  {otpLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnText}>Verify & Log In</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setVerificationId(null)} style={styles.resendRow}>
                  <Text style={styles.resendText}>Didn&apos;t receive it? </Text>
                  <Text style={[styles.resendText, { color: GOLD, fontWeight: '700' }]}>Resend</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── Email Tab ── */}
        {tab === 'email' && (
          <View>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrap}>
              <MaterialIcons name="email" size={20} color={MUTED} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={MUTED}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <MaterialIcons name="lock" size={20} color={MUTED} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={MUTED} />
              </TouchableOpacity>
            </View>

            {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
            <TouchableOpacity onPress={() => router.push('/forgot-password' as any)} style={styles.forgotRow}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, emailLoading && styles.btnDisabled]}
              onPress={handleEmailLogin}
              disabled={emailLoading}
            >
              {emailLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Log In</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign-In — proper multicolour G logo */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={() => Alert.alert(
            'Google Sign-In',
            'Google Sign-In is available in the published app. Please use Phone or Email login for now.',
            [{ text: 'OK' }]
          )}
          activeOpacity={0.85}
        >
          {/* Proper Google G logo using SVG-style coloured text on white circle */}
          <View style={styles.googleLogoCircle}>
            <Text style={styles.googleLogoG}>
              <Text style={{ color: '#4285F4' }}>G</Text>
            </Text>
            {/* Colour bar under the G to simulate Google's multicolour */}
            <View style={styles.googleColorBar}>
              <View style={[styles.googleColorDot, { backgroundColor: '#4285F4' }]} />
              <View style={[styles.googleColorDot, { backgroundColor: '#EA4335' }]} />
              <View style={[styles.googleColorDot, { backgroundColor: '#FBBC05' }]} />
              <View style={[styles.googleColorDot, { backgroundColor: '#34A853' }]} />
            </View>
          </View>
          <Text style={styles.googleText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* Register link */}
        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Don&apos;t have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/register' as any)}>
            <Text style={styles.registerLink}>Create one</Text>
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing, you agree to HY3N&apos;s{' '}
          <Text style={{ color: GOLD }}>Terms of Service</Text> and{' '}
          <Text style={{ color: GOLD }}>Privacy Policy</Text>
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoRow: { alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 6, color: TEXT },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 28, color: MUTED },
  tabRow: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 24, borderWidth: 1, borderColor: BORDER },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: `${GOLD}1A`, borderWidth: 1, borderColor: GOLD },
  tabText: { color: MUTED, fontSize: 16, fontWeight: '600' },
  tabTextActive: { color: GOLD },
  label: { color: MUTED, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, marginBottom: 16, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 54, fontSize: 17, color: TEXT },
  eyeBtn: { padding: 4 },
  hint: { color: MUTED, fontSize: 13, marginTop: -10, marginBottom: 16 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: GREEN },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  forgotRow: { alignItems: 'flex-end', marginBottom: 20, marginTop: -8 },
  forgotText: { fontSize: 15, fontWeight: '600', color: GOLD },
  otpSentBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${GREEN}1A`, borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: `${GREEN}4D` },
  otpSentText: { color: GREEN, fontSize: 14, fontWeight: '600', flex: 1 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  resendText: { color: MUTED, fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: BORDER },
  dividerText: { color: MUTED, fontSize: 14 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 52, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    backgroundColor: CARD, marginBottom: 20, gap: 12,
  },
  googleLogoCircle: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  googleLogoG: {
    fontSize: 17, fontWeight: '900', lineHeight: 22,
  },
  googleColorBar: {
    flexDirection: 'row', position: 'absolute', bottom: 2, gap: 1,
  },
  googleColorDot: {
    width: 5, height: 2, borderRadius: 1,
  },
  googleIconWrap: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  googleIconText: { fontSize: 16, fontWeight: '900' },
  googleText: { color: TEXT, fontSize: 16, fontWeight: '600' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  registerText: { color: MUTED, fontSize: 15 },
  registerLink: { color: GOLD, fontSize: 15, fontWeight: '700' },
  terms: { textAlign: 'center', color: MUTED, fontSize: 12, lineHeight: 18 },
  errorText: { color: '#EF4444', fontSize: 13, marginBottom: 8, textAlign: 'center' },
});
