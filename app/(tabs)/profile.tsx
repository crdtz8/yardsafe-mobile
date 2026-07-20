import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', safety_manager: 'Safety Manager', manager: 'Manager', employee: 'Employee',
};

const normalizePhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
};

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string>('');
  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState('employee');

  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [savingPw,  setSavingPw]  = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase
      .from('profiles')
      .select('name, email, phone, role')
      .eq('id', user.id)
      .single();
    if (data) {
      setName(data.name ?? '');
      setEmail(data.email ?? '');
      setPhone(data.phone ?? '');
      setRole(data.role ?? 'employee');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveInfo = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Enter your name.');
    setSavingInfo(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone: phone.trim() ? normalizePhone(phone) : null })
      .eq('id', userId);
    setSavingInfo(false);
    Alert.alert(error ? 'Error' : 'Saved', error ? error.message : 'Your profile has been updated.');
  };

  const changePassword = async () => {
    if (newPw.length < 6) return Alert.alert('Too short', 'Password must be at least 6 characters.');
    if (newPw !== confirmPw) return Alert.alert('Mismatch', 'The passwords do not match.');
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) return Alert.alert('Error', error.message);
    setNewPw(''); setConfirmPw('');
    Alert.alert('Password changed', 'Your password has been updated.');
  };

  const handleSignOut = () =>
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        <View style={s.avatarWrap}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
          <Text style={s.headerName}>{name || '—'}</Text>
          <Text style={s.headerRole}>{ROLE_LABEL[role] ?? role}</Text>
        </View>

        {/* Personal info */}
        <Text style={s.section}>PERSONAL INFO</Text>
        <View style={s.card}>
          <Text style={s.lbl}>FULL NAME</Text>
          <TextInput style={s.inp} value={name} onChangeText={setName} autoCapitalize="words"
            placeholder="Your name" placeholderTextColor={colors.muted} />

          <Text style={s.lbl}>EMAIL</Text>
          <View style={[s.inp, s.inpDisabled]}><Text style={s.inpDisabledTxt}>{email}</Text></View>

          <Text style={s.lbl}>PHONE</Text>
          <TextInput style={s.inp} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
            placeholder="(optional)" placeholderTextColor={colors.muted} />

          <TouchableOpacity style={[s.btn, savingInfo && s.dim]} onPress={saveInfo} disabled={savingInfo}>
            <Text style={s.btnTxt}>{savingInfo ? 'SAVING…' : 'SAVE CHANGES'}</Text>
          </TouchableOpacity>
        </View>

        {/* Change password */}
        <Text style={s.section}>CHANGE PASSWORD</Text>
        <View style={s.card}>
          <Text style={s.lbl}>NEW PASSWORD</Text>
          <View style={s.pwRow}>
            <TextInput style={[s.inp, s.pwInp]} value={newPw} onChangeText={setNewPw} secureTextEntry={!showPw}
              placeholder="At least 6 characters" placeholderTextColor={colors.muted} autoCapitalize="none" />
            <TouchableOpacity style={s.eye} onPress={() => setShowPw(v => !v)}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <Text style={s.lbl}>CONFIRM NEW PASSWORD</Text>
          <TextInput style={s.inp} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry={!showPw}
            placeholder="Re-enter password" placeholderTextColor={colors.muted} autoCapitalize="none" />

          <TouchableOpacity style={[s.btn, savingPw && s.dim]} onPress={changePassword} disabled={savingPw}>
            <Text style={s.btnTxt}>{savingPw ? 'UPDATING…' : 'UPDATE PASSWORD'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.signOut} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={s.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content:    { padding: 20 },

  avatarWrap: { alignItems: 'center', marginBottom: 8 },
  avatar:     { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.greenMd, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarTxt:  { color: colors.cream, fontWeight: '800', fontSize: 24 },
  headerName: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerRole: { fontSize: 12, fontWeight: '600', color: colors.greenMd, marginTop: 2 },

  section:    { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginTop: 24, marginBottom: 8 },
  card:       { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16 },

  lbl:        { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 12 },
  inp:        { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  inpDisabled:{ justifyContent: 'center' },
  inpDisabledTxt: { fontSize: 15, color: colors.muted },

  pwRow:      { flexDirection: 'row', alignItems: 'center' },
  pwInp:      { flex: 1 },
  eye:        { padding: 12, marginLeft: 4 },

  btn:        { backgroundColor: colors.greenDk, borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  btnTxt:     { color: colors.cream, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  dim:        { opacity: 0.5 },

  signOut:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red },
  signOutTxt: { fontSize: 15, fontWeight: '600', color: colors.red },
});
