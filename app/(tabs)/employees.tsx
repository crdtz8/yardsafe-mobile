import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Employee = { id: string; name: string; email: string; role: string; phone?: string };

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', safety_manager: 'Safety Manager', manager: 'Manager', employee: 'Employee',
};

const ROLE_OPTS = [
  { label:'Employee',       value:'employee' },
  { label:'Manager',        value:'manager' },
  { label:'Safety Manager', value:'safety_manager' },
  { label:'Admin',          value:'admin' },
];

const blankDraft = () => ({ name:'', email:'', role:'employee', phone:'' });

export default function EmployeesScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Employee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<Employee | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [draft,      setDraft]      = useState(blankDraft);
  const [pickField,  setPickField]  = useState<string | null>(null);

  const showModal = showCreate || editItem !== null;

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    setPickField(null);
  };

  const openEdit = (item: Employee) => {
    setDraft({ name: item.name || '', email: item.email || '', role: item.role || 'employee', phone: item.phone || '' });
    setEditItem(item);
    setPickField(null);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => { setDraft(blankDraft()); setPickField(null); setShowCreate(true); }} style={{ paddingHorizontal: 8 }}>
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const set = (key: string) => (val: string) => setDraft(d => ({ ...d, [key]: val }));

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, phone')
      .is('archived_at', null)
      .order('name');
    setItems((data as Employee[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!draft.name.trim()) return Alert.alert('Required', 'Enter the employee\'s name.');

    setSaving(true);

    if (editItem) {
      // Edit existing employee
      const { error } = await supabase
        .from('profiles')
        .update({ name: draft.name.trim(), role: draft.role, phone: draft.phone.trim() || null })
        .eq('id', editItem.id);

      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setEditItem(null);
      load();
      return;
    }

    // Create new employee
    if (!draft.email.trim()) return (setSaving(false), Alert.alert('Required', 'Enter the employee\'s email.'));
    const emailLower = draft.email.toLowerCase().trim();

    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();

    // Sign up the new employee — Supabase creates the auth user and triggers profile creation
    const { error: signUpError } = await supabase.auth.signUp({
      email:    emailLower,
      password: Math.random().toString(36).slice(-10) + 'A1!', // temporary random password
      options:  {
        data: { name: draft.name.trim(), role: draft.role },
      },
    });

    if (signUpError) {
      setSaving(false);
      // If the user already exists, try updating their profile instead
      if (signUpError.message.includes('already registered')) {
        return Alert.alert('Already exists', 'An account with that email already exists.');
      }
      return Alert.alert('Error', signUpError.message);
    }

    // Update the profile with company_id and role (the trigger may have created it)
    await supabase.from('profiles')
      .update({ name: draft.name.trim(), role: draft.role, company_id: prof?.company_id })
      .eq('email', emailLower);

    setSaving(false);
    Alert.alert(
      'Invite sent',
      `${draft.name} will receive a confirmation email at ${emailLower}. They can set their password from that link.`,
    );
    setShowCreate(false);
    load();
  };

  const handleArchive = () => {
    if (!editItem) return;
    Alert.alert(
      'Archive Employee',
      `Archive ${editItem.name}? They will no longer appear in the employee list and will lose access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('profiles')
              .update({ archived_at: new Date().toISOString() })
              .eq('id', editItem.id);
            if (error) return Alert.alert('Error', error.message);
            setEditItem(null);
            load();
          },
        },
      ],
    );
  };

  const labelFor = (opts: {label:string;value:string}[], val: string) =>
    opts.find(o => o.value === val)?.label ?? val;

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={items.length === 0 ? s.empty : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={<Empty icon="people-outline" label="No employees yet" hint="Tap + to add one" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {item.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={s.body}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.email}>{item.email}</Text>
            </View>
            <Text style={s.role}>{ROLE_LABEL[item.role] ?? item.role}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeModal}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>{editItem ? 'Edit Employee' : 'Invite Employee'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? (editItem ? 'Saving…' : 'Sending…') : (editItem ? 'Save' : 'Send Invite')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>FULL NAME *</Text>
              <TextInput style={f.inp} value={draft.name} onChangeText={set('name')}
                placeholder="Employee's full name" placeholderTextColor={colors.muted}
                autoCapitalize="words" />

              <Text style={f.lbl}>EMAIL{editItem ? '' : ' *'}</Text>
              {editItem ? (
                <View style={[f.inp, f.inpDisabled]}>
                  <Text style={f.inpDisabledText}>{draft.email}</Text>
                </View>
              ) : (
                <TextInput style={f.inp} value={draft.email} onChangeText={set('email')}
                  placeholder="employee@email.com" placeholderTextColor={colors.muted}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              )}

              <Text style={f.lbl}>PHONE</Text>
              <TextInput style={f.inp} value={draft.phone} onChangeText={set('phone')}
                placeholder="(optional)" placeholderTextColor={colors.muted}
                keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false} />

              <Text style={f.lbl}>ROLE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'role' ? null : 'role')}>
                <Text style={f.selVal}>{labelFor(ROLE_OPTS, draft.role)}</Text>
                <Ionicons name={pickField === 'role' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'role' && (
                <View style={f.opts}>
                  {ROLE_OPTS.map((o, i) => (
                    <TouchableOpacity key={o.value} style={[f.opt, i === ROLE_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('role')(o.value); setPickField(null); }}>
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.role === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!editItem && (
                <View style={f.note}>
                  <Ionicons name="mail-outline" size={16} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={f.noteTxt}>The employee will receive an email to confirm their account and set a password before they can log in.</Text>
                </View>
              )}

              {editItem && (
                <TouchableOpacity style={f.archiveBtn} onPress={handleArchive}>
                  <Ionicons name="archive-outline" size={16} color={colors.red} style={{ marginRight: 8 }} />
                  <Text style={f.archiveTxt}>Archive Employee</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function Empty({ icon, label, hint }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; hint?: string }) {
  return (
    <View style={s.emptyWrap}>
      <Ionicons name={icon} size={44} color={colors.border} />
      <Text style={s.emptyText}>{label}</Text>
      {hint && <Text style={s.emptyHint}>{hint}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  list:       { flex: 1, backgroundColor: colors.bg },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:      { flex: 1 },
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText:  { fontSize: 14, color: colors.muted },
  emptyHint:  { fontSize: 12, color: colors.border },
  sep:        { height: 1, backgroundColor: colors.border, marginLeft: 72 },
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenMd, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText: { color: colors.cream, fontWeight: '700', fontSize: 14 },
  body:       { flex: 1 },
  name:       { fontSize: 14, fontWeight: '700', color: colors.text },
  email:      { fontSize: 12, color: colors.muted, marginTop: 1 },
  role:       { fontSize: 11, fontWeight: '600', color: colors.greenMd },
});

const f = StyleSheet.create({
  hdr:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle:        { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:          { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:            { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:             { opacity: 0.4 },
  scroll:          { flex: 1 },
  sc:              { padding: 20, paddingBottom: 60 },
  lbl:             { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 20 },
  inp:             { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  inpDisabled:     { justifyContent: 'center' },
  inpDisabledText: { fontSize: 15, color: colors.muted },
  sel:             { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:          { fontSize: 15, color: colors.text, flex: 1 },
  opts:            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:         { borderBottomWidth: 0 },
  optTxt:          { fontSize: 15, color: colors.text, flex: 1 },
  note:            { flexDirection: 'row', alignItems: 'flex-start', marginTop: 28, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  noteTxt:         { fontSize: 13, color: colors.muted, flex: 1 },
  archiveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 36, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red },
  archiveTxt:      { fontSize: 15, fontWeight: '600', color: colors.red },
});
