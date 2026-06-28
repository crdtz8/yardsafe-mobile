import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { signIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Tab = 'email' | 'phone' | 'username';

export default function LoginScreen() {
  const [tab, setTab] = useState<Tab>('email');

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [showPw,     setShowPw]     = useState(false);

  const [phone,      setPhone]      = useState('');
  const [phonePw,    setPhonePw]    = useState('');
  const [showPhonePw, setShowPhonePw] = useState(false);

  const [username,   setUsername]   = useState('');
  const [unPassword, setUnPassword] = useState('');
  const [showUnPw,   setShowUnPw]   = useState(false);

  const [loading, setLoading] = useState(false);

  // ── Email ──────────────────────────────────────────────────────────────

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) return Alert.alert('Missing fields', 'Enter your email and password.');
    setLoading(true);
    const { error } = await signIn(email.toLowerCase().trim(), password);
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
  };

  // ── Phone (look up email by phone → sign in with password) ────────────

  const normalizePhone = (p: string) => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };

  const handlePhoneLogin = async () => {
    const normalized = normalizePhone(phone);
    if (normalized.length < 10) return Alert.alert('Invalid number', 'Enter a valid 10-digit phone number.');
    if (!phonePw) return Alert.alert('Missing password', 'Enter your password.');
    setLoading(true);
    const { data: email, error: lookupErr } = await supabase.rpc('lookup_email_by_phone', { p_phone: normalized });
    if (lookupErr || !email) {
      setLoading(false);
      return Alert.alert('Not found', 'No account found with that phone number. Try signing in with email.');
    }
    const { error } = await signIn(email, phonePw);
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
  };

  // ── Username (look up email by username → sign in with password) ──────

  const handleUsernameLogin = async () => {
    if (!username.trim() || !unPassword) return Alert.alert('Missing fields', 'Enter your username and password.');
    setLoading(true);
    const { data: email, error: lookupErr } = await supabase.rpc('lookup_email_by_username', { p_username: username.trim() });
    if (lookupErr || !email) {
      setLoading(false);
      return Alert.alert('Not found', 'No account matches that username. Try signing in with email.');
    }
    const { error } = await signIn(email, unPassword);
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.logoWrap}>
          <Image source={require('@/assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>SAFETY TRAINING PORTAL</Text>
        </View>

        <View style={styles.card}>
          {/* Tabs */}
          <View style={styles.tabs}>
            {(['email', 'phone', 'username'] as Tab[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Email ── */}
          {tab === 'email' && (
            <>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@premierscrap.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.pwRow}>
                <TextInput
                  style={[styles.input, styles.pwInput]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(v => !v)}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.btn} onPress={handleEmailLogin} disabled={loading}>
                <Text style={styles.btnText}>{loading ? 'SIGNING IN…' : 'SIGN IN'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkRow}>
                <Text style={styles.linkText}>Forgot password? <Text style={styles.linkBold}>Reset via email</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Phone ── */}
          {tab === 'phone' && (
            <>
              <Text style={styles.label}>PHONE NUMBER</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="(555) 000-0000"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
              />
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.pwRow}>
                <TextInput
                  style={[styles.input, styles.pwInput]}
                  value={phonePw}
                  onChangeText={setPhonePw}
                  secureTextEntry={!showPhonePw}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPhonePw(v => !v)}>
                  <Ionicons name={showPhonePw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.btn} onPress={handlePhoneLogin} disabled={loading}>
                <Text style={styles.btnText}>{loading ? 'SIGNING IN…' : 'SIGN IN'}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Username ── */}
          {tab === 'username' && (
            <>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Your username"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.pwRow}>
                <TextInput
                  style={[styles.input, styles.pwInput]}
                  value={unPassword}
                  onChangeText={setUnPassword}
                  secureTextEntry={!showUnPw}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowUnPw(v => !v)}>
                  <Ionicons name={showUnPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.btn} onPress={handleUsernameLogin} disabled={loading}>
                <Text style={styles.btnText}>{loading ? 'SIGNING IN…' : 'SIGN IN'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.linkRow}>
          <Text style={styles.linkText}>New to YardSafe? <Text style={styles.linkBold}>Start a free trial →</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 48 },

  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logo:     { width: 180, height: 48 },
  tagline:  { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 2.5, marginTop: 8 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },

  tabs:          { flexDirection: 'row', marginBottom: 24, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  tabBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surface },
  tabBtnActive:  { backgroundColor: colors.greenDk },
  tabText:       { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1 },
  tabTextActive: { color: colors.cream },

  label: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 16,
  },

  pwRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  pwInput: { flex: 1, marginBottom: 0 },
  eyeBtn:  { padding: 12, marginLeft: 4 },

  btn:     { backgroundColor: colors.greenDk, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: colors.cream, fontWeight: '800', fontSize: 14, letterSpacing: 1.5 },

  linkRow:  { alignItems: 'center', marginTop: 12 },
  linkText: { fontSize: 13, color: colors.muted },
  linkBold: { color: colors.greenDk, fontWeight: '600' },
});
