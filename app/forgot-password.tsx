import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { firebaseAuth } from '@/lib/firebase';
import { useColors } from '@/hooks/use-colors';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await firebaseAuth.resetPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={[styles.iconCircle, { backgroundColor: '#006B3F20' }]}>
          <MaterialIcons name="lock-reset" size={40} color="#006B3F" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Reset password</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Enter your email and we&apos;ll send you a reset link
        </Text>

        {sent ? (
          <View style={[styles.successBox, { backgroundColor: '#006B3F20' }]}>
            <MaterialIcons name="check-circle" size={24} color="#006B3F" />
            <Text style={[styles.successText, { color: '#006B3F' }]}>
              Reset email sent! Check your inbox.
            </Text>
          </View>
        ) : (
          <>
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

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#006B3F' }, loading && styles.btnDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.push('/login' as any)} style={styles.loginRow}>
          <Text style={[styles.loginText, { color: '#D4AF37' }]}>← Back to login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 60, left: 24 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, marginBottom: 20, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 50, fontSize: 15 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  successBox: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 20, gap: 10 },
  successText: { fontSize: 15, fontWeight: '600', flex: 1 },
  loginRow: { alignItems: 'center', marginTop: 8 },
  loginText: { fontSize: 14, fontWeight: '600' },
});
