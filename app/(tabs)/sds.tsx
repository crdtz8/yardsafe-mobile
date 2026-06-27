import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform,
  KeyboardAvoidingView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type SdsDocument = {
  id: string;
  product_name: string;
  manufacturer: string | null;
  chemical_family: string | null;
  signal_word: 'danger' | 'warning' | 'none' | null;
  cas_number: string | null;
  un_number: string | null;
  locations: string | null;
  hazard_classes: string[] | null;
  revision_date: string | null;
  file_url: string | null;
  file_name: string | null;
  is_active: boolean;
  company_id: string;
  created_at: string;
};

type DraftFields = {
  product_name: string;
  manufacturer: string;
  chemical_family: string;
  signal_word: string;
  cas_number: string;
  un_number: string;
  locations: string;
  revision_date: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNAL_WORD_OPTS = [
  { label: 'DANGER',        value: 'danger'  },
  { label: 'WARNING',       value: 'warning' },
  { label: 'No Signal Word', value: 'none'   },
];

const SIGNAL_WORD_COLORS: Record<string, string> = {
  danger:  colors.danger,
  warning: '#D97706',
  none:    colors.muted,
};

const SIGNAL_WORD_LABELS: Record<string, string> = {
  danger:  'DANGER',
  warning: 'WARNING',
  none:    'No Signal Word',
};

const blankDraft = (): DraftFields => ({
  product_name:    '',
  manufacturer:    '',
  chemical_family: '',
  signal_word:     '',
  cas_number:      '',
  un_number:       '',
  locations:       '',
  revision_date:   '',
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function SdsScreen() {
  const navigation = useNavigation();

  const [items,      setItems]      = useState<SdsDocument[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [companyId,  setCompanyId]  = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<SdsDocument | null>(null);
  const [draft,      setDraft]      = useState<DraftFields>(blankDraft);
  const [saving,     setSaving]     = useState(false);
  const [pickField,  setPickField]  = useState<string | null>(null);

  const showModal = showCreate || editItem !== null;

  // ── Header add button ──────────────────────────────────────────────────────

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={openCreate}
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const set = (key: keyof DraftFields) => (val: string) =>
    setDraft(d => ({ ...d, [key]: val }));

  const openCreate = () => {
    setDraft(blankDraft());
    setPickField(null);
    setEditItem(null);
    setShowCreate(true);
  };

  const openEdit = (item: SdsDocument) => {
    setDraft({
      product_name:    item.product_name ?? '',
      manufacturer:    item.manufacturer ?? '',
      chemical_family: item.chemical_family ?? '',
      signal_word:     item.signal_word ?? '',
      cas_number:      item.cas_number ?? '',
      un_number:       item.un_number ?? '',
      locations:       item.locations ?? '',
      revision_date:   item.revision_date ?? '',
    });
    setPickField(null);
    setEditItem(item);
    setShowCreate(false);
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    setDraft(blankDraft());
    setPickField(null);
  };

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    const { data: prof } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single();

    const cid = prof?.company_id ?? null;
    setCompanyId(cid);

    if (!cid) { setLoading(false); setRefreshing(false); return; }

    const { data } = await supabase
      .from('sds_documents')
      .select('*')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('product_name');

    setItems((data as SdsDocument[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Client-side search filter ──────────────────────────────────────────────

  const filtered = items.filter(i =>
    i.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.manufacturer?.toLowerCase().includes(search.toLowerCase())
  );

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!draft.product_name.trim()) {
      return Alert.alert('Required', 'Product name is required.');
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      product_name:    draft.product_name.trim(),
      manufacturer:    draft.manufacturer.trim()    || null,
      chemical_family: draft.chemical_family.trim() || null,
      signal_word:     draft.signal_word            || null,
      cas_number:      draft.cas_number.trim()      || null,
      un_number:       draft.un_number.trim()       || null,
      locations:       draft.locations.trim()       || null,
      revision_date:   draft.revision_date.trim()   || null,
      company_id:      companyId,
    };

    let error;

    if (editItem) {
      ({ error } = await supabase
        .from('sds_documents')
        .update(payload)
        .eq('id', editItem.id));
    } else {
      payload.is_active = true;
      ({ error } = await supabase
        .from('sds_documents')
        .insert(payload));
    }

    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    closeModal();
    load();
  };

  const handleDelete = () => {
    if (!editItem) return;
    Alert.alert(
      'Delete SDS',
      `Remove "${editItem.product_name}" from the library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('sds_documents')
              .update({ is_active: false })
              .eq('id', editItem.id);
            if (error) return Alert.alert('Error', error.message);
            closeModal();
            load();
          },
        },
      ]
    );
  };

  const handleViewFile = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Unable to open the file URL.')
    );
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const signalWordLabel = (sw: string | null | undefined) =>
    sw ? (SIGNAL_WORD_LABELS[sw] ?? sw) : '';

  const signalWordColor = (sw: string | null | undefined) =>
    sw ? (SIGNAL_WORD_COLORS[sw] ?? colors.muted) : colors.muted;

  const pickerLabel = (val: string) =>
    SIGNAL_WORD_OPTS.find(o => o.value === val)?.label ?? 'Select…';

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.greenMd} size="large" />
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.muted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by product or manufacturer…"
          placeholderTextColor={colors.muted}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={filtered.length === 0 ? s.empty : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.greenMd}
          />
        }
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <Empty
            icon="flask-outline"
            label="No SDS documents"
            hint={search ? 'No results match your search.' : 'Tap + to add a safety data sheet.'}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
            {/* Signal word badge */}
            <View style={s.iconWrap}>
              {item.signal_word && item.signal_word !== 'none' ? (
                <View style={[s.signalBadge, { backgroundColor: signalWordColor(item.signal_word) + '22' }]}>
                  <Text style={[s.signalText, { color: signalWordColor(item.signal_word) }]}>
                    {signalWordLabel(item.signal_word)}
                  </Text>
                </View>
              ) : (
                <Ionicons name="flask-outline" size={20} color={colors.greenMd} />
              )}
            </View>

            <View style={s.body}>
              <Text style={s.title}>{item.product_name}</Text>
              <Text style={s.sub}>
                {[item.manufacturer, item.chemical_family].filter(Boolean).join(' · ')}
              </Text>
              {(item.cas_number || item.locations) ? (
                <Text style={s.meta}>
                  {[
                    item.cas_number ? `CAS ${item.cas_number}` : null,
                    item.locations  ? item.locations              : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>

            <View style={s.rowRight}>
              {item.file_url ? (
                <TouchableOpacity
                  style={s.viewBtn}
                  onPress={() => handleViewFile(item.file_url!)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="document-text-outline" size={14} color={colors.greenMd} />
                  <Text style={s.viewBtnText}>View SDS</Text>
                </TouchableOpacity>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          </TouchableOpacity>
        )}
      />

      {/* ── Create / Edit Modal ── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Modal header */}
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeModal}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>{editItem ? 'Edit SDS' : 'New SDS'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={f.scroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={f.sc}
            >
              {/* Product Name */}
              <Text style={f.lbl}>PRODUCT NAME *</Text>
              <TextInput
                style={f.inp}
                value={draft.product_name}
                onChangeText={set('product_name')}
                placeholder="e.g. Hydraulic Fluid 46"
                placeholderTextColor={colors.muted}
              />

              {/* Manufacturer */}
              <Text style={f.lbl}>MANUFACTURER</Text>
              <TextInput
                style={f.inp}
                value={draft.manufacturer}
                onChangeText={set('manufacturer')}
                placeholder="e.g. Shell, Mobil"
                placeholderTextColor={colors.muted}
              />

              {/* Chemical Family */}
              <Text style={f.lbl}>CHEMICAL FAMILY</Text>
              <TextInput
                style={f.inp}
                value={draft.chemical_family}
                onChangeText={set('chemical_family')}
                placeholder="e.g. Petroleum distillate"
                placeholderTextColor={colors.muted}
              />

              {/* Signal Word */}
              <Text style={f.lbl}>SIGNAL WORD</Text>
              <TouchableOpacity
                style={f.sel}
                onPress={() => setPickField(p => p === 'signal_word' ? null : 'signal_word')}
              >
                <Text style={draft.signal_word ? f.selVal : f.selPh}>
                  {draft.signal_word ? pickerLabel(draft.signal_word) : 'Select signal word…'}
                </Text>
                <Ionicons
                  name={pickField === 'signal_word' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.muted}
                />
              </TouchableOpacity>
              {pickField === 'signal_word' && (
                <View style={f.opts}>
                  {SIGNAL_WORD_OPTS.map((o, i) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[f.opt, i === SIGNAL_WORD_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('signal_word')(o.value); setPickField(null); }}
                    >
                      <Text style={[
                        f.optTxt,
                        o.value !== 'none' && { color: SIGNAL_WORD_COLORS[o.value], fontWeight: '700' },
                      ]}>
                        {o.label}
                      </Text>
                      {draft.signal_word === o.value && (
                        <Ionicons name="checkmark" size={16} color={colors.greenMd} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* CAS Number */}
              <Text style={f.lbl}>CAS NUMBER</Text>
              <TextInput
                style={f.inp}
                value={draft.cas_number}
                onChangeText={set('cas_number')}
                placeholder="e.g. 64742-65-0"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              {/* UN Number */}
              <Text style={f.lbl}>UN NUMBER</Text>
              <TextInput
                style={f.inp}
                value={draft.un_number}
                onChangeText={set('un_number')}
                placeholder="e.g. UN1268"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
              />

              {/* Locations */}
              <Text style={f.lbl}>LOCATIONS</Text>
              <TextInput
                style={f.inp}
                value={draft.locations}
                onChangeText={set('locations')}
                placeholder="e.g. Maintenance shop, Equipment bay"
                placeholderTextColor={colors.muted}
              />

              {/* Revision Date */}
              <Text style={f.lbl}>REVISION DATE</Text>
              <TextInput
                style={f.inp}
                value={draft.revision_date}
                onChangeText={set('revision_date')}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              {/* File upload note */}
              <View style={f.note}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={16}
                  color={colors.muted}
                  style={{ marginRight: 6, marginTop: 1 }}
                />
                <Text style={f.noteTxt}>
                  File upload is available in the web app. Add the SDS record here, then upload the PDF from your desktop.
                </Text>
              </View>

              {/* Delete button — edit only */}
              {editItem && (
                <TouchableOpacity style={f.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={f.deleteTxt}>Delete SDS</Text>
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty({
  icon,
  label,
  hint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
}) {
  return (
    <View style={s.emptyWrap}>
      <Ionicons name={icon} size={44} color={colors.border} />
      <Text style={s.emptyText}>{label}</Text>
      {hint && <Text style={s.emptyHint}>{hint}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  list:        { flex: 1, backgroundColor: colors.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:       { flex: 1 },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText:   { fontSize: 14, color: colors.muted },
  emptyHint:   { fontSize: 12, color: colors.border },
  sep:         { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  iconWrap:    { width: 56, alignItems: 'flex-start', justifyContent: 'center', marginRight: 4 },
  signalBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  signalText:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  body:        { flex: 1 },
  title:       { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:         { fontSize: 12, color: colors.muted, marginBottom: 1 },
  meta:        { fontSize: 11, color: colors.muted },
  rowRight:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  viewBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenMd + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: colors.greenMd },
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
  sel:       { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:    { fontSize: 15, color: colors.text, flex: 1 },
  selPh:     { fontSize: 15, color: colors.muted, flex: 1 },
  opts:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:   { borderBottomWidth: 0 },
  optTxt:    { fontSize: 15, color: colors.text, flex: 1 },
  note:      { flexDirection: 'row', alignItems: 'flex-start', marginTop: 28, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  noteTxt:   { fontSize: 13, color: colors.muted, flex: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '0D' },
  deleteTxt: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
