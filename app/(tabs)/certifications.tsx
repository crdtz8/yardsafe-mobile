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

type CertRecord = {
  id: string;
  employee: { name: string } | null;
  cert_type: { name: string; is_required: boolean } | null;
  cert_number: string | null;
  issue_date: string | null;
  expiration_date: string | null;
};

const blankDraft = () => ({
  employee_id:'', cert_type_id:'', cert_number:'', issue_date:'', expiration_date:'',
});

function certStatus(expDate: string | null): { label: string; color: string } {
  if (!expDate) return { label: 'Active', color: colors.greenMd };
  const days = Math.ceil((new Date(expDate).getTime() - Date.now()) / 86400000);
  if (days < 0)  return { label: 'Expired',       color: colors.red };
  if (days < 30) return { label: 'Expiring Soon',  color: '#F59E0B' };
  return { label: 'Active', color: colors.greenMd };
}

export default function CertificationsScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<CertRecord[]>([]);
  const [employees,  setEmployees]  = useState<{ id: string; name: string }[]>([]);
  const [certTypes,  setCertTypes]  = useState<{ id: string; name: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [draft,      setDraft]      = useState(blankDraft);
  const [pickField,  setPickField]  = useState<string | null>(null);

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
      .from('employee_certifications')
      .select(`id,
        employee:profiles!employee_certifications_employee_id_fkey(name),
        cert_type:certification_types!employee_certifications_cert_type_id_fkey(name, is_required),
        cert_number, issue_date, expiration_date`)
      .order('expiration_date', { ascending: true, nullsFirst: false });
    setItems((data as any[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showCreate) return;
    Promise.all([
      supabase.from('profiles').select('id, name').is('archived_at', null).order('name'),
      supabase.from('certification_types').select('id, name').order('name'),
    ]).then(([{ data: emps }, { data: types }]) => {
      setEmployees((emps as any[]) ?? []);
      setCertTypes((types as any[]) ?? []);
    });
  }, [showCreate]);

  const handleSave = async () => {
    if (!draft.employee_id)  return Alert.alert('Required', 'Select an employee.');
    if (!draft.cert_type_id) return Alert.alert('Required', 'Select a certification type.');
    setSaving(true);
    const { error } = await supabase.from('employee_certifications').insert({
      employee_id:     draft.employee_id,
      cert_type_id:    draft.cert_type_id,
      cert_number:     draft.cert_number || null,
      issue_date:      draft.issue_date || null,
      expiration_date: draft.expiration_date || null,
    });
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setShowCreate(false);
    load();
  };

  const empName  = (id: string) => employees.find(e => e.id === id)?.name ?? 'Select employee…';
  const typeName = (id: string) => certTypes.find(t => t.id === id)?.name ?? 'Select type…';

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
        ListEmptyComponent={<Empty icon="ribbon-outline" label="No certifications on file" hint="Tap + to add one" />}
        renderItem={({ item }) => {
          const { label, color } = certStatus(item.expiration_date);
          return (
            <View style={s.row}>
              <View style={s.iconWrap}>
                <Ionicons name="ribbon-outline" size={20} color={colors.greenMd} />
              </View>
              <View style={s.body}>
                <Text style={s.title}>
                  {item.cert_type?.name ?? '—'}
                  {item.cert_type?.is_required ? ' ★' : ''}
                </Text>
                <Text style={s.sub}>
                  {item.employee?.name ?? '—'}
                  {item.expiration_date ? ` · Exp ${new Date(item.expiration_date).toLocaleDateString()}` : ''}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: color + '22' }]}>
                <Text style={[s.badgeText, { color }]}>{label}</Text>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>Add Certification</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>EMPLOYEE *</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'emp' ? null : 'emp')}>
                <Text style={draft.employee_id ? f.selVal : f.selPh}>{draft.employee_id ? empName(draft.employee_id) : 'Select employee…'}</Text>
                <Ionicons name={pickField === 'emp' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'emp' && (
                <View style={f.opts}>
                  {employees.length === 0
                    ? <View style={f.opt}><Text style={[f.optTxt, { color: colors.muted }]}>Loading…</Text></View>
                    : employees.map((e, i) => (
                      <TouchableOpacity key={e.id} style={[f.opt, i === employees.length - 1 && f.optLast]}
                        onPress={() => { set('employee_id')(e.id); setPickField(null); }}>
                        <Text style={f.optTxt}>{e.name}</Text>
                        {draft.employee_id === e.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                      </TouchableOpacity>
                    ))
                  }
                </View>
              )}

              <Text style={f.lbl}>CERTIFICATION TYPE *</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'type' ? null : 'type')}>
                <Text style={draft.cert_type_id ? f.selVal : f.selPh}>{draft.cert_type_id ? typeName(draft.cert_type_id) : 'Select type…'}</Text>
                <Ionicons name={pickField === 'type' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'type' && (
                <View style={f.opts}>
                  {certTypes.length === 0
                    ? <View style={f.opt}><Text style={[f.optTxt, { color: colors.muted }]}>Loading…</Text></View>
                    : certTypes.map((t, i) => (
                      <TouchableOpacity key={t.id} style={[f.opt, i === certTypes.length - 1 && f.optLast]}
                        onPress={() => { set('cert_type_id')(t.id); setPickField(null); }}>
                        <Text style={f.optTxt}>{t.name}</Text>
                        {draft.cert_type_id === t.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                      </TouchableOpacity>
                    ))
                  }
                </View>
              )}

              <Text style={f.lbl}>CERT NUMBER</Text>
              <TextInput style={f.inp} value={draft.cert_number} onChangeText={set('cert_number')}
                placeholder="Certificate or license number" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>ISSUE DATE</Text>
              <TextInput style={f.inp} value={draft.issue_date} onChangeText={set('issue_date')}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={f.lbl}>EXPIRATION DATE</Text>
              <TextInput style={f.inp} value={draft.expiration_date} onChangeText={set('expiration_date')}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

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
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border },
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  iconWrap:  { width: 36, alignItems: 'center', marginRight: 10 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

const f = StyleSheet.create({
  hdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle: { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:   { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:     { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:      { opacity: 0.4 },
  scroll:   { flex: 1 },
  sc:       { padding: 20, paddingBottom: 60 },
  lbl:      { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 20 },
  inp:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  sel:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:   { fontSize: 15, color: colors.text, flex: 1 },
  selPh:    { fontSize: 15, color: colors.muted, flex: 1 },
  opts:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:  { borderBottomWidth: 0 },
  optTxt:   { fontSize: 15, color: colors.text, flex: 1 },
});
