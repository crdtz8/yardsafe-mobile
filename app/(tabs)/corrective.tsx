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

type Action = {
  id: string; title: string; status: string | null; priority: string | null;
  due_date: string | null; assignee: { name: string } | null;
};

const PRIORITY_COLOR: Record<string, string> = {
  low: colors.muted, medium: '#F59E0B', high: colors.red, critical: '#7F1D1D',
};
const STATUS_COLOR: Record<string, string> = {
  open: colors.red, in_progress: '#F59E0B', completed: colors.greenMd, closed: colors.muted,
};

const PRI_OPTS  = [{ label:'Low', value:'low' },{ label:'Medium', value:'medium' },{ label:'High', value:'high' },{ label:'Critical', value:'critical' }];
const STAT_OPTS = [{ label:'Open', value:'open' },{ label:'In Progress', value:'in_progress' },{ label:'Completed', value:'completed' },{ label:'Closed', value:'closed' }];

const blankDraft = () => ({ title:'', description:'', assigned_to:'', due_date:'', priority:'medium', status:'open' });

export default function CorrectiveScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Action[]>([]);
  const [employees,  setEmployees]  = useState<{ id: string; name: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<Action | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [draft,      setDraft]      = useState(blankDraft);
  const [pickField,  setPickField]  = useState<string | null>(null);

  const showModal = showCreate || editItem !== null;

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
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

  const openEdit = (item: Action) => {
    setDraft({
      title:       item.title ?? '',
      description: '',
      assigned_to: '',
      due_date:    item.due_date ?? '',
      priority:    item.priority ?? 'medium',
      status:      item.status ?? 'open',
    });
    setPickField(null);
    setEditItem(item);
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('corrective_actions')
      .select('id, title, status, priority, due_date, assignee:profiles!assigned_to(name)')
      .order('due_date', { ascending: true, nullsFirst: false });
    setItems((data as any[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showModal) return;
    supabase.from('profiles').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setEmployees((data as any[]) ?? []));
  }, [showModal]);

  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter a title.');
    setSaving(true);
    if (editItem) {
      const { error } = await supabase.from('corrective_actions').update({
        title:       draft.title.trim(),
        description: draft.description || null,
        assigned_to: draft.assigned_to || null,
        due_date:    draft.due_date || null,
        priority:    draft.priority,
        status:      draft.status,
      }).eq('id', editItem.id);
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setEditItem(null);
      load();
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const { error } = await supabase.from('corrective_actions').insert({
        title:       draft.title.trim(),
        description: draft.description || null,
        assigned_to: draft.assigned_to || null,
        due_date:    draft.due_date || null,
        priority:    draft.priority,
        status:      draft.status,
        assigned_by: user!.id,
        company_id:  prof?.company_id,
      });
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setShowCreate(false);
      load();
    }
  };

  const handleDelete = () => {
    if (!editItem) return;
    Alert.alert(
      'Delete Action',
      `Delete "${editItem.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('corrective_actions').delete().eq('id', editItem.id);
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
  const empName = (id: string) => employees.find(e => e.id === id)?.name ?? 'Select employee…';

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
        ListEmptyComponent={<Empty icon="checkmark-circle-outline" label="No corrective actions" hint="Tap + to add one" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={[s.bar, { backgroundColor: PRIORITY_COLOR[item.priority ?? ''] ?? colors.border }]} />
            <View style={s.body}>
              <Text style={s.title}>{item.title}</Text>
              <Text style={s.sub}>
                {item.assignee?.name ? `${item.assignee.name} · ` : ''}
                {item.due_date ? `Due ${new Date(item.due_date).toLocaleDateString()}` : 'No due date'}
              </Text>
            </View>
            {item.status && (
              <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? colors.muted) + '22' }]}>
                <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? colors.muted }]}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
            )}
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
              <Text style={f.hdrTitle}>{editItem ? 'Edit Action' : 'New Action'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>TITLE *</Text>
              <TextInput style={f.inp} value={draft.title} onChangeText={set('title')}
                placeholder="What needs to be corrected?" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>DESCRIPTION</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.description} onChangeText={set('description')}
                placeholder="Details about the corrective action…" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <Text style={f.lbl}>ASSIGNED TO</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'emp' ? null : 'emp')}>
                <Text style={draft.assigned_to ? f.selVal : f.selPh}>{draft.assigned_to ? empName(draft.assigned_to) : 'Select employee…'}</Text>
                <Ionicons name={pickField === 'emp' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'emp' && (
                <View style={f.opts}>
                  {employees.length === 0
                    ? <View style={f.opt}><Text style={[f.optTxt, { color: colors.muted }]}>Loading…</Text></View>
                    : employees.map((e, i) => (
                      <TouchableOpacity key={e.id} style={[f.opt, i === employees.length - 1 && f.optLast]}
                        onPress={() => { set('assigned_to')(e.id); setPickField(null); }}>
                        <Text style={f.optTxt}>{e.name}</Text>
                        {draft.assigned_to === e.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                      </TouchableOpacity>
                    ))
                  }
                </View>
              )}

              <Text style={f.lbl}>DUE DATE</Text>
              <TextInput style={f.inp} value={draft.due_date} onChangeText={set('due_date')}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={f.lbl}>PRIORITY</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'pri' ? null : 'pri')}>
                <Text style={f.selVal}>{labelFor(PRI_OPTS, draft.priority)}</Text>
                <Ionicons name={pickField === 'pri' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'pri' && (
                <View style={f.opts}>
                  {PRI_OPTS.map((o, i) => (
                    <TouchableOpacity key={o.value} style={[f.opt, i === PRI_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('priority')(o.value); setPickField(null); }}>
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.priority === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>STATUS</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'stat' ? null : 'stat')}>
                <Text style={f.selVal}>{labelFor(STAT_OPTS, draft.status)}</Text>
                <Ionicons name={pickField === 'stat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'stat' && (
                <View style={f.opts}>
                  {STAT_OPTS.map((o, i) => (
                    <TouchableOpacity key={o.value} style={[f.opt, i === STAT_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('status')(o.value); setPickField(null); }}>
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.status === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {editItem && (
                <TouchableOpacity style={f.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.red} />
                  <Text style={f.deleteTxt}>Delete Action</Text>
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
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border },
  sep:       { height: 1, backgroundColor: colors.border },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  bar:       { width: 4, height: 36, borderRadius: 2, marginRight: 14, flexShrink: 0 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

const f = StyleSheet.create({
  hdr:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle:  { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:    { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:      { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:       { opacity: 0.4 },
  scroll:    { flex: 1 },
  sc:        { padding: 20, paddingBottom: 60 },
  lbl:       { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 20 },
  inp:       { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  ta:        { minHeight: 80, paddingTop: 12 },
  sel:       { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:    { fontSize: 15, color: colors.text, flex: 1 },
  selPh:     { fontSize: 15, color: colors.muted, flex: 1 },
  opts:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:   { borderBottomWidth: 0 },
  optTxt:    { fontSize: 15, color: colors.text, flex: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red + '55', backgroundColor: colors.red + '11' },
  deleteTxt: { fontSize: 15, fontWeight: '600', color: colors.red },
});
