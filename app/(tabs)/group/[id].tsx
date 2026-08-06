import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { callNotificationsApi } from '@/lib/api';
import {
  updateGroup, deleteGroup, assignTrainingToGroup, removeTrainingFromGroup,
  assignEmployeeToGroup, removeEmployeeFromGroup,
} from '@/lib/groups';

type Emp = { id: string; name: string; role: string; group_id: string | null };
type Trn = { id: string; title: string; category_id: string | null; categories: { name: string } | null };

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = id as string;
  const navigation = useNavigation();

  const [name,      setName]      = useState('');
  const [desc,      setDesc]      = useState('');
  const [companyId, setCompanyId] = useState('');
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [trainings, setTrainings] = useState<Trn[]>([]);
  const [assigned,  setAssigned]  = useState<Set<string>>(new Set()); // group_trainings training ids
  const [tab,       setTab]       = useState<'members' | 'trainings'>('members');
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState<string | null>(null);      // id being toggled
  const [showEdit,  setShowEdit]  = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
    const cid = prof?.company_id as string;
    setCompanyId(cid);

    const [{ data: g }, { data: emps }, { data: trns }, { data: gts }] = await Promise.all([
      supabase.from('groups').select('name, description').eq('id', gid).single(),
      supabase.from('profiles').select('id, name, role, group_id').eq('company_id', cid).is('archived_at', null).order('name'),
      supabase.from('trainings').select('id, title, category_id, categories(name)').eq('company_id', cid).order('title'),
      supabase.from('group_trainings').select('training_id').eq('group_id', gid),
    ]);
    if (g) { setName(g.name ?? ''); setDesc(g.description ?? ''); }
    setEmployees((emps as Emp[]) ?? []);
    setTrainings((trns as any as Trn[]) ?? []);
    setAssigned(new Set(((gts as any[]) ?? []).map(r => r.training_id)));
    setLoading(false);
  }, [gid]);

  useEffect(() => { load(); }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: name || 'Group',
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowEdit(true)} style={{ paddingHorizontal: 8 }}>
          <Ionicons name="create-outline" size={22} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, name]);

  const memberCount = employees.filter(e => e.group_id === gid).length;

  const toggleMember = async (emp: Emp) => {
    setBusy(emp.id);
    const inGroup = emp.group_id === gid;
    if (inGroup) await removeEmployeeFromGroup(emp.id, gid);
    else         await assignEmployeeToGroup(emp.id, gid, companyId);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, group_id: inGroup ? null : gid } : e));
    setBusy(null);
  };

  const toggleTraining = async (t: Trn) => {
    setBusy(t.id);
    if (assigned.has(t.id)) {
      await removeTrainingFromGroup(gid, t.id);
      setAssigned(prev => { const n = new Set(prev); n.delete(t.id); return n; });
    } else {
      const { error, memberIds } = await assignTrainingToGroup(gid, t.id, companyId);
      if (error) { Alert.alert('Error', error.message); setBusy(null); return; }
      setAssigned(prev => new Set(prev).add(t.id));
      // Email + push every current member that they've been assigned this training.
      if (memberIds.length) {
        callNotificationsApi('training_assigned', { trainingId: t.id, userIds: memberIds }).catch(() => {});
      }
    }
    setBusy(null);
  };

  const saveEdit = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Group name is required.');
    setSavingEdit(true);
    const { error } = await updateGroup(gid, name.trim(), desc.trim());
    setSavingEdit(false);
    if (error) return Alert.alert('Error', error.message);
    setShowEdit(false);
  };

  const confirmDelete = () =>
    Alert.alert('Delete Group', `Delete "${name}"? Members are kept but removed from the group, and this group's training assignments are cleared. This cannot be undone.`,
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await deleteGroup(gid);
          if (error) return Alert.alert('Error', error.message);
          router.back();
       } }]);

  if (loading) return <View style={st.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <View style={st.container}>
      {desc ? <Text style={st.desc}>{desc}</Text> : null}

      {/* Tab switch */}
      <View style={st.tabs}>
        {(['members', 'trainings'] as const).map(k => (
          <TouchableOpacity key={k} style={[st.tab, tab === k && st.tabOn]} onPress={() => setTab(k)}>
            <Text style={[st.tabTxt, tab === k && st.tabTxtOn]}>
              {k === 'members' ? `Members (${memberCount})` : `Trainings (${assigned.size})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {tab === 'members' ? (
          <>
            <Text style={st.hint}>Tap an employee to add or remove them. Adding gives them this group's trainings.</Text>
            {employees.map(emp => {
              const inGroup = emp.group_id === gid;
              const otherGroup = !inGroup && !!emp.group_id;
              return (
                <TouchableOpacity key={emp.id} style={st.pickRow} onPress={() => toggleMember(emp)} disabled={busy === emp.id} activeOpacity={0.7}>
                  <Ionicons name={inGroup ? 'checkbox' : 'square-outline'} size={22} color={inGroup ? colors.greenMd : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.pickName}>{emp.name}</Text>
                    <Text style={st.pickSub}>{emp.role?.replace('_', ' ')}{otherGroup ? ' · in another group' : ''}</Text>
                  </View>
                  {busy === emp.id && <ActivityIndicator size="small" color={colors.greenMd} />}
                </TouchableOpacity>
              );
            })}
            {employees.length === 0 && <Text style={st.empty}>No employees yet.</Text>}
          </>
        ) : (
          <>
            <Text style={st.hint}>Tap a training to assign or remove it for the whole group. Assigning notifies every member.</Text>
            {trainings.map(t => {
              const on = assigned.has(t.id);
              return (
                <TouchableOpacity key={t.id} style={st.pickRow} onPress={() => toggleTraining(t)} disabled={busy === t.id} activeOpacity={0.7}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.greenMd : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.pickName}>{t.title}</Text>
                    <Text style={st.pickSub}>{t.categories?.name ?? 'Uncategorized'}</Text>
                  </View>
                  {busy === t.id && <ActivityIndicator size="small" color={colors.greenMd} />}
                </TouchableOpacity>
              );
            })}
            {trainings.length === 0 && <Text style={st.empty}>No trainings in the library yet.</Text>}
          </>
        )}

        <TouchableOpacity style={st.deleteBtn} onPress={confirmDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.red} />
          <Text style={st.deleteTxt}>Delete Group</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit group info */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={ed.hdr}>
              <TouchableOpacity onPress={() => setShowEdit(false)}><Text style={ed.cancel}>Cancel</Text></TouchableOpacity>
              <Text style={ed.hdrTitle}>Edit Group</Text>
              <TouchableOpacity onPress={saveEdit} disabled={savingEdit}>
                <Text style={[ed.save, savingEdit && { opacity: 0.4 }]}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={ed.lbl}>GROUP NAME *</Text>
              <TextInput style={ed.inp} value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.muted} />
              <Text style={[ed.lbl, { marginTop: 20 }]}>DESCRIPTION</Text>
              <TextInput style={[ed.inp, { minHeight: 80, paddingTop: 12 }]} value={desc} onChangeText={setDesc}
                placeholder="Optional" placeholderTextColor={colors.muted} multiline textAlignVertical="top" />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  desc:      { fontSize: 13, color: colors.muted, paddingHorizontal: 16, paddingTop: 12, lineHeight: 19 },
  tabs:      { flexDirection: 'row', margin: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tab:       { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabOn:     { backgroundColor: colors.greenMd },
  tabTxt:    { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTxtOn:  { color: colors.cream },
  hint:      { fontSize: 12, color: colors.muted, paddingHorizontal: 16, paddingBottom: 8, lineHeight: 17 },
  pickRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  pickName:  { fontSize: 14, fontWeight: '600', color: colors.text },
  pickSub:   { fontSize: 12, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  empty:     { fontSize: 13, color: colors.muted, padding: 24, textAlign: 'center' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, marginHorizontal: 16, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.red + '55' },
  deleteTxt: { fontSize: 14, fontWeight: '700', color: colors.red },
});

const ed = StyleSheet.create({
  hdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle: { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:   { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:     { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  lbl:      { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6 },
  inp:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
});
