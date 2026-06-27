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

type Permit = {
  id: string;
  permit_type: string | null;
  title: string | null;
  location: string | null;
  work_description: string | null;
  hazards: string | null;
  precautions: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status: string | null;
  issued_by: string | null;
  company_id: string | null;
  created_at: string | null;
};

type PermitAck = {
  id: string;
  permit_id: string;
  employee_id: string;
  acknowledged_at: string;
};

const PERMIT_TYPE_OPTS = [
  { label: 'Hot Work',       value: 'hot_work' },
  { label: 'Confined Space', value: 'confined_space' },
  { label: 'LOTO',           value: 'loto' },
  { label: 'Excavation',     value: 'excavation' },
  { label: 'General',        value: 'general' },
];

const STATUS_OPTS = [
  { label: 'Draft',     value: 'draft' },
  { label: 'Active',    value: 'active' },
  { label: 'Closed',    value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_COLOR: Record<string, string> = {
  draft:     colors.muted,
  active:    colors.greenMd,
  closed:    colors.muted,
  cancelled: colors.danger,
};

const PERMIT_TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  hot_work:       'flame-outline',
  confined_space: 'enter-outline',
  loto:           'lock-closed-outline',
  excavation:     'layers-outline',
  general:        'document-text-outline',
};

const MANAGER_ROLES = ['admin', 'safety_manager', 'manager'];

type FilterTab = 'active' | 'all';

type Draft = {
  permit_type: string;
  title: string;
  location: string;
  work_description: string;
  hazards: string;
  precautions: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
};

const blankDraft = (): Draft => ({
  permit_type:     'general',
  title:           '',
  location:        '',
  work_description:'',
  hazards:         '',
  precautions:     '',
  start_datetime:  '',
  end_datetime:    '',
  status:          'draft',
});

function labelFor(opts: { label: string; value: string }[], val: string): string {
  return opts.find(o => o.value === val)?.label ?? val;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateRange(start: string | null, end: string | null): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s === '—' && e === '—') return '—';
  if (e === '—') return s;
  return `${s} – ${e}`;
}

export default function PermitsScreen() {
  const navigation = useNavigation();

  const [items,      setItems]      = useState<Permit[]>([]);
  const [acks,       setAcks]       = useState<PermitAck[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role,       setRole]       = useState<string>('employee');
  const [userId,     setUserId]     = useState<string>('');
  const [companyId,  setCompanyId]  = useState<string>('');
  const [filterTab,  setFilterTab]  = useState<FilterTab>('active');

  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<Permit | null>(null);
  const [draft,      setDraft]      = useState<Draft>(blankDraft);
  const [saving,     setSaving]     = useState(false);
  const [pickField,  setPickField]  = useState<string | null>(null);

  const [ackingId,   setAckingId]   = useState<string | null>(null);

  const isManager = MANAGER_ROLES.includes(role);
  const showModal = showCreate || editItem !== null;

  useLayoutEffect(() => {
    if (!isManager) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => { setDraft(blankDraft()); setPickField(null); setShowCreate(true); setEditItem(null); }}
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isManager]);

  const set = (key: keyof Draft) => (val: string) => setDraft(d => ({ ...d, [key]: val }));

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    const { data: prof } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single();

    const cid  = prof?.company_id ?? '';
    const r    = prof?.role ?? 'employee';
    setUserId(user.id);
    setCompanyId(cid);
    setRole(r);

    const isMgr = MANAGER_ROLES.includes(r);

    let query = supabase
      .from('permits')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: false });

    if (!isMgr) {
      query = query.eq('status', 'active');
    }

    const { data: permits } = await query;
    setItems((permits as Permit[]) ?? []);

    const { data: ackData } = await supabase
      .from('permit_acknowledgments')
      .select('*')
      .eq('employee_id', user.id);
    setAcks((ackData as PermitAck[]) ?? []);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    setDraft(blankDraft());
    setPickField(null);
  };

  const openEdit = (item: Permit) => {
    setDraft({
      permit_type:      item.permit_type ?? 'general',
      title:            item.title ?? '',
      location:         item.location ?? '',
      work_description: item.work_description ?? '',
      hazards:          item.hazards ?? '',
      precautions:      item.precautions ?? '',
      start_datetime:   item.start_datetime ?? '',
      end_datetime:     item.end_datetime ?? '',
      status:           item.status ?? 'draft',
    });
    setPickField(null);
    setShowCreate(false);
    setEditItem(item);
  };

  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter a permit title.');
    setSaving(true);

    const payload = {
      permit_type:      draft.permit_type || null,
      title:            draft.title.trim(),
      location:         draft.location || null,
      work_description: draft.work_description || null,
      hazards:          draft.hazards || null,
      precautions:      draft.precautions || null,
      start_datetime:   draft.start_datetime || null,
      end_datetime:     draft.end_datetime || null,
      status:           draft.status,
    };

    let error: { message: string } | null = null;

    if (editItem) {
      const res = await supabase.from('permits').update(payload).eq('id', editItem.id);
      error = res.error;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await supabase.from('permits').insert({
        ...payload,
        issued_by:  user!.id,
        company_id: companyId,
      });
      error = res.error;
    }

    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    closeModal();
    load();
  };

  const handleDelete = () => {
    if (!editItem) return;
    Alert.alert('Delete Permit', 'Are you sure you want to delete this permit? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('permits').delete().eq('id', editItem.id);
          if (error) return Alert.alert('Error', error.message);
          closeModal();
          load();
        },
      },
    ]);
  };

  const handleAcknowledge = async (permit: Permit) => {
    setAckingId(permit.id);
    const { error } = await supabase.from('permit_acknowledgments').insert({
      permit_id:   permit.id,
      employee_id: userId,
    });
    setAckingId(null);
    if (error) return Alert.alert('Error', error.message);
    load();
  };

  const displayedItems = isManager
    ? (filterTab === 'active' ? items.filter(p => p.status === 'active') : items)
    : items;

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;
  }

  return (
    <>
      {isManager && (
        <View style={s.tabs}>
          {(['active', 'all'] as FilterTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tab, filterTab === tab && s.tabActive]}
              onPress={() => setFilterTab(tab)}
            >
              <Text style={[s.tabText, filterTab === tab && s.tabTextActive]}>
                {tab === 'active' ? 'Active' : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={displayedItems}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={displayedItems.length === 0 ? s.empty : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />
        }
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <Empty icon="clipboard-outline" label="No permits found" hint={isManager ? 'Tap + to create a permit' : 'No active permits at this time'} />
        }
        renderItem={({ item }) => {
          const isAcked = acks.some(a => a.permit_id === item.id);
          const typeLabel = labelFor(PERMIT_TYPE_OPTS, item.permit_type ?? '');
          const typeIcon  = PERMIT_TYPE_ICON[item.permit_type ?? ''] ?? 'document-text-outline';

          if (isManager) {
            return (
              <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
                <View style={s.iconWrap}>
                  <Ionicons name={typeIcon} size={20} color={colors.greenMd} />
                </View>
                <View style={s.body}>
                  <View style={s.rowTop}>
                    <View style={s.typeBadge}>
                      <Text style={s.typeBadgeText}>{typeLabel}</Text>
                    </View>
                    {item.status && (
                      <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? colors.muted) + '22' }]}>
                        <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? colors.muted }]}>
                          {labelFor(STATUS_OPTS, item.status)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.title} numberOfLines={1}>{item.title ?? 'Untitled Permit'}</Text>
                  <Text style={s.sub}>
                    {item.location ? `${item.location}` : ''}
                    {item.created_at ? `${item.location ? ' · ' : ''}${formatDate(item.created_at)}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            );
          }

          return (
            <View style={s.row}>
              <View style={s.iconWrap}>
                <Ionicons name={typeIcon} size={20} color={colors.greenMd} />
              </View>
              <View style={s.body}>
                <View style={s.rowTop}>
                  <View style={s.typeBadge}>
                    <Text style={s.typeBadgeText}>{typeLabel}</Text>
                  </View>
                </View>
                <Text style={s.title} numberOfLines={1}>{item.title ?? 'Untitled Permit'}</Text>
                <Text style={s.sub}>
                  {item.location ? `${item.location} · ` : ''}
                  {formatDateRange(item.start_datetime, item.end_datetime)}
                </Text>
              </View>
              {isAcked ? (
                <View style={s.ackWrap}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.greenMd} />
                  <Text style={s.ackText}>Signed</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.ackBtn}
                  onPress={() => handleAcknowledge(item)}
                  disabled={ackingId === item.id}
                >
                  {ackingId === item.id
                    ? <ActivityIndicator size="small" color={colors.cream} />
                    : <Text style={s.ackBtnText}>Acknowledge</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeModal}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>{editItem ? 'Edit Permit' : 'New Permit'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>PERMIT TYPE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'type' ? null : 'type')}>
                <Text style={f.selVal}>{labelFor(PERMIT_TYPE_OPTS, draft.permit_type)}</Text>
                <Ionicons name={pickField === 'type' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'type' && (
                <View style={f.opts}>
                  {PERMIT_TYPE_OPTS.map((o, i) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[f.opt, i === PERMIT_TYPE_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('permit_type')(o.value); setPickField(null); }}
                    >
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.permit_type === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>TITLE *</Text>
              <TextInput
                style={f.inp}
                value={draft.title}
                onChangeText={set('title')}
                placeholder="e.g. Welding on Processing Line A"
                placeholderTextColor={colors.muted}
              />

              <Text style={f.lbl}>LOCATION</Text>
              <TextInput
                style={f.inp}
                value={draft.location}
                onChangeText={set('location')}
                placeholder="e.g. Main Yard, Bay 3"
                placeholderTextColor={colors.muted}
              />

              <Text style={f.lbl}>WORK DESCRIPTION</Text>
              <TextInput
                style={[f.inp, f.ta]}
                value={draft.work_description}
                onChangeText={set('work_description')}
                placeholder="Describe the work to be performed…"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={f.lbl}>HAZARDS</Text>
              <TextInput
                style={[f.inp, f.ta]}
                value={draft.hazards}
                onChangeText={set('hazards')}
                placeholder="Identify potential hazards…"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={f.lbl}>PRECAUTIONS</Text>
              <TextInput
                style={[f.inp, f.ta]}
                value={draft.precautions}
                onChangeText={set('precautions')}
                placeholder="List required precautions and PPE…"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={f.lbl}>START DATE/TIME (ISO)</Text>
              <TextInput
                style={f.inp}
                value={draft.start_datetime}
                onChangeText={set('start_datetime')}
                placeholder="2025-01-15T08:00:00"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={f.lbl}>END DATE/TIME (ISO)</Text>
              <TextInput
                style={f.inp}
                value={draft.end_datetime}
                onChangeText={set('end_datetime')}
                placeholder="2025-01-15T17:00:00"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={f.lbl}>STATUS</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'stat' ? null : 'stat')}>
                <Text style={f.selVal}>{labelFor(STATUS_OPTS, draft.status)}</Text>
                <Ionicons name={pickField === 'stat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'stat' && (
                <View style={f.opts}>
                  {STATUS_OPTS.map((o, i) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[f.opt, i === STATUS_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('status')(o.value); setPickField(null); }}
                    >
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.status === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {editItem && (
                <TouchableOpacity style={f.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={f.deleteTxt}>Delete Permit</Text>
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
  list:         { flex: 1, backgroundColor: colors.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:        { flex: 1 },
  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText:    { fontSize: 14, color: colors.muted },
  emptyHint:    { fontSize: 12, color: colors.border },
  sep:          { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  tabs:         { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: colors.greenMd },
  tabText:      { fontSize: 14, fontWeight: '500', color: colors.muted },
  tabTextActive:{ fontSize: 14, fontWeight: '700', color: colors.greenMd },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  iconWrap:     { width: 36, alignItems: 'center', marginRight: 10 },
  body:         { flex: 1, minWidth: 0 },
  rowTop:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  title:        { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:          { fontSize: 12, color: colors.muted },
  typeBadge:    { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.greenDk + '18' },
  typeBadgeText:{ fontSize: 10, fontWeight: '700', color: colors.greenDk, letterSpacing: 0.5 },
  badge:        { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:    { fontSize: 10, fontWeight: '700' },
  ackWrap:      { alignItems: 'center', gap: 2, marginLeft: 8 },
  ackText:      { fontSize: 10, fontWeight: '600', color: colors.greenMd },
  ackBtn:       { backgroundColor: colors.greenMd, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, marginLeft: 8, minWidth: 88, alignItems: 'center' },
  ackBtnText:   { fontSize: 12, fontWeight: '700', color: colors.cream },
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
  opts:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:   { borderBottomWidth: 0 },
  optTxt:    { fontSize: 15, color: colors.text, flex: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '44', backgroundColor: colors.danger + '0d' },
  deleteTxt: { fontSize: 14, fontWeight: '600', color: colors.danger },
});
