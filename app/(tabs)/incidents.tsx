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

type Incident = {
  id: string; title: string | null; incident_type: string | null;
  incident_date: string | null; severity: string | null; status: string | null;
};

const SEVERITY_COLOR: Record<string, string> = {
  minor: '#F59E0B', moderate: '#EF4444', severe: '#7F1D1D', critical: '#7F1D1D',
};
const STATUS_COLOR: Record<string, string> = {
  open: colors.red, investigating: '#F59E0B', resolved: colors.greenMd, closed: colors.muted,
};

const INC_TYPES  = ['Near Miss','First Aid','Property Damage','Recordable Injury','Environmental','Fire / Explosion','Other'];
const SEV_OPTS   = [{ label:'Minor', value:'minor' },{ label:'Moderate', value:'moderate' },{ label:'Severe', value:'severe' },{ label:'Critical', value:'critical' }];
const STAT_OPTS  = [{ label:'Open', value:'open' },{ label:'Investigating', value:'investigating' },{ label:'Resolved', value:'resolved' },{ label:'Closed', value:'closed' }];

const blankDraft = () => ({
  title:'', incident_type:'', incident_date: new Date().toISOString().split('T')[0],
  location:'', severity:'minor', description:'', status:'open',
  injured_party:'', action_taken:'',
});

export default function IncidentsScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Incident[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<Incident | null>(null);
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

  const openEdit = (item: Incident) => {
    setDraft({
      title:          item.title          ?? '',
      incident_type:  item.incident_type  ?? '',
      incident_date:  item.incident_date  ?? new Date().toISOString().split('T')[0],
      location:       (item as any).location       ?? '',
      severity:       item.severity       ?? 'minor',
      description:    (item as any).description    ?? '',
      status:         item.status         ?? 'open',
      injured_party:  (item as any).injured_party  ?? '',
      action_taken:   (item as any).action_taken   ?? '',
    });
    setEditItem(item);
    setPickField(null);
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('incidents')
      .select('id, title, incident_type, incident_date, severity, status')
      .order('incident_date', { ascending: false });
    setItems((data as Incident[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter an incident title.');
    setSaving(true);

    if (editItem) {
      const { error } = await supabase.from('incidents').update({
        title:         draft.title,
        incident_type: draft.incident_type,
        severity:      draft.severity,
        location:      draft.location,
        description:   draft.description,
        injured_party: draft.injured_party,
        action_taken:  draft.action_taken,
        status:        draft.status,
      }).eq('id', editItem.id);
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setEditItem(null);
      load();
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const { error } = await supabase.from('incidents').insert({
        ...draft,
        company_id:  prof?.company_id,
        reported_by: user!.id,
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
      'Delete Incident',
      'Are you sure you want to delete this incident? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('incidents').delete().eq('id', editItem.id);
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
        ListEmptyComponent={<Empty icon="warning-outline" label="No incidents recorded" hint="Tap + to report one" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={[s.dot, { backgroundColor: SEVERITY_COLOR[item.severity ?? ''] ?? colors.muted }]} />
            <View style={s.body}>
              <Text style={s.title}>{item.title ?? item.incident_type ?? 'Incident'}</Text>
              <Text style={s.sub}>
                {item.incident_type ? `${item.incident_type} · ` : ''}
                {item.incident_date ? new Date(item.incident_date).toLocaleDateString() : '—'}
              </Text>
            </View>
            {item.status && (
              <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? colors.muted) + '22' }]}>
                <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? colors.muted }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
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
              <Text style={f.hdrTitle}>{editItem ? 'Edit Incident' : 'Report Incident'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>TITLE *</Text>
              <TextInput style={f.inp} value={draft.title} onChangeText={set('title')}
                placeholder="Brief description of what happened" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>DATE</Text>
              <TextInput style={f.inp} value={draft.incident_date} onChangeText={set('incident_date')}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={f.lbl}>INCIDENT TYPE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'type' ? null : 'type')}>
                <Text style={draft.incident_type ? f.selVal : f.selPh}>{draft.incident_type || 'Select type…'}</Text>
                <Ionicons name={pickField === 'type' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'type' && (
                <View style={f.opts}>
                  {INC_TYPES.map((t, i) => (
                    <TouchableOpacity key={t} style={[f.opt, i === INC_TYPES.length - 1 && f.optLast]}
                      onPress={() => { set('incident_type')(t); setPickField(null); }}>
                      <Text style={f.optTxt}>{t}</Text>
                      {draft.incident_type === t && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>SEVERITY</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'sev' ? null : 'sev')}>
                <Text style={f.selVal}>{labelFor(SEV_OPTS, draft.severity)}</Text>
                <Ionicons name={pickField === 'sev' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'sev' && (
                <View style={f.opts}>
                  {SEV_OPTS.map((o, i) => (
                    <TouchableOpacity key={o.value} style={[f.opt, i === SEV_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('severity')(o.value); setPickField(null); }}>
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.severity === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>LOCATION</Text>
              <TextInput style={f.inp} value={draft.location} onChangeText={set('location')}
                placeholder="Where did it occur?" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>WHAT HAPPENED *</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.description} onChangeText={set('description')}
                placeholder="Describe the incident…" placeholderTextColor={colors.muted}
                multiline numberOfLines={4} textAlignVertical="top" />

              <Text style={f.lbl}>INJURED PARTY</Text>
              <TextInput style={f.inp} value={draft.injured_party} onChangeText={set('injured_party')}
                placeholder="Name of injured person (if any)" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>ACTION TAKEN</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.action_taken} onChangeText={set('action_taken')}
                placeholder="What was done in response?" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

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
                  <Ionicons name="trash-outline" size={16} color={colors.red} style={{ marginRight: 6 }} />
                  <Text style={f.deleteTxt}>Delete Incident</Text>
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
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 42 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  dot:       { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
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
  ta:        { minHeight: 96, paddingTop: 12 },
  sel:       { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:    { fontSize: 15, color: colors.text, flex: 1 },
  selPh:     { fontSize: 15, color: colors.muted, flex: 1 },
  opts:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:   { borderBottomWidth: 0 },
  optTxt:    { fontSize: 15, color: colors.text, flex: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red + '55', backgroundColor: colors.red + '11' },
  deleteTxt: { fontSize: 15, fontWeight: '600', color: colors.red },
});
