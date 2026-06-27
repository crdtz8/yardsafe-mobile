import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type Doc = { id: string; title: string; category: string | null; version: string | null; file_url?: string | null; created_at: string };
type SdsDoc = { id: string; product_name: string; manufacturer: string | null; chemical_family: string | null; signal_word: string | null; cas_number: string | null; locations: string | null; file_url: string | null; created_at: string };

type Tab = 'documents' | 'sds';

// ── Constants ──────────────────────────────────────────────────────────────

const DOC_CATEGORIES = ['Safety Policy','SOP','MSDS / SDS','Training Material','Form','Report','Certificate','Emergency Plan','Other'];
const SIGNAL_WORDS   = ['danger', 'warning', 'none'];
const SIGNAL_LABEL: Record<string, string>  = { danger: 'DANGER', warning: 'WARNING', none: 'No Signal Word' };
const SIGNAL_COLOR: Record<string, string>  = { danger: '#dc2626', warning: '#d97706', none: colors.muted };

const blankDoc = () => ({ title: '', category: '', version: '', description: '' });
const blankSds = () => ({ product_name: '', manufacturer: '', chemical_family: '', signal_word: 'none', cas_number: '', locations: '' });

const isMgr = (role: string) => role === 'admin' || role === 'safety_manager' || role === 'manager';

// ── Main Screen ────────────────────────────────────────────────────────────

export default function DocumentsScreen() {
  const navigation = useNavigation();

  const [tab,        setTab]        = useState<Tab>('documents');
  const [role,       setRole]       = useState('employee');
  const [companyId,  setCompanyId]  = useState<string | null>(null);

  // Documents state
  const [docs,        setDocs]        = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);

  // SDS state
  const [sdsItems,    setSdsItems]    = useState<SdsDoc[]>([]);
  const [sdsLoading,  setSdsLoading]  = useState(true);
  const [sdsSearch,   setSdsSearch]   = useState('');

  // Shared modal state
  const [showCreate,  setShowCreate]  = useState(false);
  const [editDoc,     setEditDoc]     = useState<Doc | null>(null);
  const [editSds,     setEditSds]     = useState<SdsDoc | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [docDraft,    setDocDraft]    = useState(blankDoc);
  const [sdsDraft,    setSdsDraft]    = useState(blankSds);
  const [pickField,   setPickField]   = useState<string | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);

  const showDocModal = showCreate && tab === 'documents' || editDoc !== null;
  const showSdsModal = showCreate && tab === 'sds'       || editSds !== null;
  const isManager = isMgr(role);

  // ── Load user identity ────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('role, company_id').eq('id', user.id).single();
      if (prof) { setRole(prof.role); setCompanyId(prof.company_id); }
    })();
  }, []);

  // ── Header + button ────────────────────────────────────────────────────

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: isManager ? () => (
        <TouchableOpacity
          onPress={() => {
            if (tab === 'documents') { setDocDraft(blankDoc()); setEditDoc(null); setPickField(null); setShowCreate(true); }
            else                     { setSdsDraft(blankSds()); setEditSds(null); setPickField(null); setShowCreate(true); }
          }}
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ) : undefined,
    });
  }, [navigation, tab, isManager]);

  // ── Load documents ────────────────────────────────────────────────────

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, title, category, version, file_url, created_at')
      .eq('is_active', true)
      .order('title');
    setDocs((data as Doc[]) ?? []);
    setDocsLoading(false);
    setRefreshing(false);
  }, []);

  // ── Load SDS ──────────────────────────────────────────────────────────

  const loadSds = useCallback(async () => {
    const { data } = await supabase
      .from('sds_documents')
      .select('id, product_name, manufacturer, chemical_family, signal_word, cas_number, locations, file_url, created_at')
      .eq('is_active', true)
      .order('product_name');
    setSdsItems((data as SdsDoc[]) ?? []);
    setSdsLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadDocs(); loadSds(); }, [loadDocs, loadSds]);

  const onRefresh = () => { setRefreshing(true); loadDocs(); loadSds(); };

  // ── Document CRUD ─────────────────────────────────────────────────────

  const openEditDoc = (item: Doc) => {
    setDocDraft({ title: item.title || '', category: item.category || '', version: item.version || '', description: '' });
    setPickField(null); setEditDoc(item); setShowCreate(false);
  };

  const closeDocModal = () => { setShowCreate(false); setEditDoc(null); setPickField(null); };

  const saveDoc = async () => {
    if (!docDraft.title.trim()) return Alert.alert('Required', 'Enter a document title.');
    setSaving(true);
    if (editDoc) {
      const { error } = await supabase.from('documents').update({ title: docDraft.title.trim(), category: docDraft.category || null, description: docDraft.description || null }).eq('id', editDoc.id);
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setEditDoc(null); loadDocs();
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const { error } = await supabase.from('documents').insert({ title: docDraft.title.trim(), category: docDraft.category || null, version: docDraft.version || null, description: docDraft.description || null, company_id: prof?.company_id, is_active: true });
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setShowCreate(false); loadDocs();
    }
  };

  const deleteDoc = () => {
    if (!editDoc) return;
    Alert.alert('Remove Document', `Remove "${editDoc.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('documents').update({ is_active: false }).eq('id', editDoc.id);
        setEditDoc(null); loadDocs();
      }},
    ]);
  };

  // ── SDS CRUD ──────────────────────────────────────────────────────────

  const openEditSds = (item: SdsDoc) => {
    setSdsDraft({ product_name: item.product_name || '', manufacturer: item.manufacturer || '', chemical_family: item.chemical_family || '', signal_word: item.signal_word || 'none', cas_number: item.cas_number || '', locations: item.locations || '' });
    setPickField(null); setEditSds(item); setShowCreate(false);
  };

  const closeSdsModal = () => { setShowCreate(false); setEditSds(null); setPickField(null); };

  const saveSds = async () => {
    if (!sdsDraft.product_name.trim()) return Alert.alert('Required', 'Enter a product name.');
    setSaving(true);
    const payload = { product_name: sdsDraft.product_name.trim(), manufacturer: sdsDraft.manufacturer || null, chemical_family: sdsDraft.chemical_family || null, signal_word: sdsDraft.signal_word || null, cas_number: sdsDraft.cas_number || null, locations: sdsDraft.locations || null };
    if (editSds) {
      const { error } = await supabase.from('sds_documents').update(payload).eq('id', editSds.id);
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setEditSds(null); loadSds();
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const { error } = await supabase.from('sds_documents').insert({ ...payload, company_id: prof?.company_id, is_active: true });
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setShowCreate(false); loadSds();
    }
  };

  const deleteSds = () => {
    if (!editSds) return;
    Alert.alert('Remove SDS', `Remove "${editSds.product_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('sds_documents').update({ is_active: false }).eq('id', editSds.id);
        setEditSds(null); loadSds();
      }},
    ]);
  };

  // ── SDS filtered list ─────────────────────────────────────────────────

  const filteredSds = sdsSearch.trim()
    ? sdsItems.filter(i =>
        i.product_name.toLowerCase().includes(sdsSearch.toLowerCase()) ||
        (i.manufacturer ?? '').toLowerCase().includes(sdsSearch.toLowerCase())
      )
    : sdsItems;

  // ── Loading state ─────────────────────────────────────────────────────

  if (docsLoading && sdsLoading) {
    return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Tab selector */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'documents' && s.tabActive]} onPress={() => setTab('documents')}>
          <Text style={[s.tabTxt, tab === 'documents' && s.tabTxtActive]}>Documents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'sds' && s.tabActive]} onPress={() => setTab('sds')}>
          <Text style={[s.tabTxt, tab === 'sds' && s.tabTxtActive]}>SDS Library</Text>
        </TouchableOpacity>
      </View>

      {/* ── DOCUMENTS TAB ── */}
      {tab === 'documents' && (
        <FlatList
          data={docs}
          keyExtractor={i => i.id}
          style={s.list}
          contentContainerStyle={docs.length === 0 ? s.empty : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenMd} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="document-text-outline" size={44} color={colors.border} />
              <Text style={s.emptyText}>No documents uploaded</Text>
              {isManager && <Text style={s.emptyHint}>Tap + to add a document</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => isManager ? openEditDoc(item) : item.file_url ? Linking.openURL(item.file_url) : null} activeOpacity={0.7}>
              <Ionicons name="document-text-outline" size={22} color={colors.greenMd} style={s.icon} />
              <View style={s.body}>
                <Text style={s.title}>{item.title}</Text>
                <View style={s.meta}>
                  {item.category && <Text style={s.cat}>{item.category}</Text>}
                  {item.version  && <Text style={s.ver}>v{item.version}</Text>}
                </View>
              </View>
              {item.file_url
                ? <Ionicons name="open-outline" size={16} color={colors.greenMd} />
                : <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              }
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── SDS TAB ── */}
      {tab === 'sds' && (
        <View style={{ flex: 1 }}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.muted} style={s.searchIcon} />
            <TextInput
              style={s.search}
              value={sdsSearch}
              onChangeText={setSdsSearch}
              placeholder="Search products or manufacturers…"
              placeholderTextColor={colors.muted}
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={filteredSds}
            keyExtractor={i => i.id}
            style={s.list}
            contentContainerStyle={filteredSds.length === 0 ? s.empty : undefined}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenMd} />}
            ItemSeparatorComponent={() => <View style={s.sep} />}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="flask-outline" size={44} color={colors.border} />
                <Text style={s.emptyText}>{sdsSearch ? 'No results found' : 'No SDS documents'}</Text>
                {isManager && !sdsSearch && <Text style={s.emptyHint}>Tap + to add a safety data sheet</Text>}
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={s.row} onPress={() => isManager ? openEditSds(item) : item.file_url ? Linking.openURL(item.file_url) : null} activeOpacity={0.7}>
                {item.signal_word && item.signal_word !== 'none' ? (
                  <View style={[s.signalBadge, { backgroundColor: SIGNAL_COLOR[item.signal_word] + '20', borderColor: SIGNAL_COLOR[item.signal_word] + '60' }]}>
                    <Text style={[s.signalTxt, { color: SIGNAL_COLOR[item.signal_word] }]}>{SIGNAL_LABEL[item.signal_word]}</Text>
                  </View>
                ) : (
                  <Ionicons name="flask-outline" size={22} color={colors.muted} style={s.icon} />
                )}
                <View style={s.body}>
                  <Text style={s.title}>{item.product_name}</Text>
                  <Text style={s.cat}>
                    {[item.manufacturer, item.chemical_family].filter(Boolean).join(' · ')}
                    {item.cas_number ? `  CAS: ${item.cas_number}` : ''}
                  </Text>
                  {item.locations && <Text style={s.cat}>📍 {item.locations}</Text>}
                </View>
                {item.file_url
                  ? <Ionicons name="open-outline" size={16} color={colors.greenMd} />
                  : <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                }
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* ── DOCUMENT MODAL ── */}
      <Modal visible={showDocModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeDocModal}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
              <Text style={f.hdrTitle}>{editDoc ? 'Edit Document' : 'Add Document'}</Text>
              <TouchableOpacity onPress={saveDoc} disabled={saving}><Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>DOCUMENT TITLE *</Text>
              <TextInput style={f.inp} value={docDraft.title} onChangeText={v => setDocDraft(d => ({ ...d, title: v }))}
                placeholder="e.g. Forklift Safety SOP" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>CATEGORY</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'cat' ? null : 'cat')}>
                <Text style={docDraft.category ? f.selVal : f.selPh}>{docDraft.category || 'Select category…'}</Text>
                <Ionicons name={pickField === 'cat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'cat' && (
                <View style={f.opts}>
                  {DOC_CATEGORIES.map((c, i) => (
                    <TouchableOpacity key={c} style={[f.opt, i === DOC_CATEGORIES.length - 1 && f.optLast]} onPress={() => { setDocDraft(d => ({ ...d, category: c })); setPickField(null); }}>
                      <Text style={f.optTxt}>{c}</Text>
                      {docDraft.category === c && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!editDoc && (
                <>
                  <Text style={f.lbl}>VERSION</Text>
                  <TextInput style={f.inp} value={docDraft.version} onChangeText={v => setDocDraft(d => ({ ...d, version: v }))} placeholder="e.g. 1.0" placeholderTextColor={colors.muted} />
                </>
              )}

              <Text style={f.lbl}>DESCRIPTION</Text>
              <TextInput style={[f.inp, f.ta]} value={docDraft.description} onChangeText={v => setDocDraft(d => ({ ...d, description: v }))} placeholder="Brief description…" placeholderTextColor={colors.muted} multiline numberOfLines={3} textAlignVertical="top" />

              {!editDoc && (
                <View style={f.note}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={f.noteTxt}>File upload is available in the web app. Add the record here, then upload the file from your desktop.</Text>
                </View>
              )}

              {editDoc && (
                <TouchableOpacity style={f.deleteBtn} onPress={deleteDoc}>
                  <Ionicons name="trash-outline" size={16} color="#d9534f" style={{ marginRight: 8 }} />
                  <Text style={f.deleteTxt}>Remove Document</Text>
                </TouchableOpacity>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── SDS MODAL ── */}
      <Modal visible={showSdsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeSdsModal}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
              <Text style={f.hdrTitle}>{editSds ? 'Edit SDS' : 'Add SDS'}</Text>
              <TouchableOpacity onPress={saveSds} disabled={saving}><Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>PRODUCT NAME *</Text>
              <TextInput style={f.inp} value={sdsDraft.product_name} onChangeText={v => setSdsDraft(d => ({ ...d, product_name: v }))} placeholder="e.g. Hydraulic Oil 46" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>MANUFACTURER</Text>
              <TextInput style={f.inp} value={sdsDraft.manufacturer} onChangeText={v => setSdsDraft(d => ({ ...d, manufacturer: v }))} placeholder="e.g. Shell" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>CHEMICAL FAMILY</Text>
              <TextInput style={f.inp} value={sdsDraft.chemical_family} onChangeText={v => setSdsDraft(d => ({ ...d, chemical_family: v }))} placeholder="e.g. Petroleum distillate" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>SIGNAL WORD</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'sig' ? null : 'sig')}>
                <Text style={f.selVal}>{SIGNAL_LABEL[sdsDraft.signal_word] ?? 'Select…'}</Text>
                <Ionicons name={pickField === 'sig' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'sig' && (
                <View style={f.opts}>
                  {SIGNAL_WORDS.map((sw, i) => (
                    <TouchableOpacity key={sw} style={[f.opt, i === SIGNAL_WORDS.length - 1 && f.optLast]} onPress={() => { setSdsDraft(d => ({ ...d, signal_word: sw })); setPickField(null); }}>
                      <Text style={[f.optTxt, { color: SIGNAL_COLOR[sw] }]}>{SIGNAL_LABEL[sw]}</Text>
                      {sdsDraft.signal_word === sw && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>CAS NUMBER</Text>
              <TextInput style={f.inp} value={sdsDraft.cas_number} onChangeText={v => setSdsDraft(d => ({ ...d, cas_number: v }))} placeholder="e.g. 64742-54-7" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>ON-SITE LOCATIONS</Text>
              <TextInput style={f.inp} value={sdsDraft.locations} onChangeText={v => setSdsDraft(d => ({ ...d, locations: v }))} placeholder="e.g. Maintenance Bay, Yard Office" placeholderTextColor={colors.muted} />

              {!editSds && (
                <View style={f.note}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={f.noteTxt}>Upload the SDS PDF file from the web app after adding this record.</Text>
                </View>
              )}

              {editSds && (
                <TouchableOpacity style={f.deleteBtn} onPress={deleteSds}>
                  <Ionicons name="trash-outline" size={16} color="#d9534f" style={{ marginRight: 8 }} />
                  <Text style={f.deleteTxt}>Remove SDS</Text>
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

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  list:        { flex: 1, backgroundColor: colors.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:       { flex: 1 },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText:   { fontSize: 14, color: colors.muted },
  emptyHint:   { fontSize: 12, color: colors.border },
  sep:         { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  icon:        { marginRight: 12 },
  body:        { flex: 1 },
  title:       { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  meta:        { flexDirection: 'row', gap: 8 },
  cat:         { fontSize: 11, color: colors.muted },
  ver:         { fontSize: 11, color: colors.greenMd, fontWeight: '600' },

  tabs:        { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:   { borderBottomColor: colors.greenMd },
  tabTxt:      { fontSize: 13, fontWeight: '600', color: colors.muted },
  tabTxtActive:{ color: colors.greenMd },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 12 },
  searchIcon:  { marginRight: 8 },
  search:      { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 },

  signalBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, marginRight: 12, alignSelf: 'center', minWidth: 66, alignItems: 'center' },
  signalTxt:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
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
  note:      { flexDirection: 'row', alignItems: 'flex-start', marginTop: 28, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  noteTxt:   { fontSize: 13, color: colors.muted, flex: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#d9534f' },
  deleteTxt: { fontSize: 15, fontWeight: '600', color: '#d9534f' },
});
