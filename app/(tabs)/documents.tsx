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

type Doc = { id: string; title: string; category: string | null; version: string | null; created_at: string };

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  pdf: 'document-text-outline', docx: 'document-outline', xlsx: 'grid-outline',
  png: 'image-outline', jpg: 'image-outline',
};

const CATEGORIES = ['Safety Policy','SOP','MSDS / SDS','Training Material','Form','Report','Certificate','Emergency Plan','Other'];

const blankDraft = () => ({ title:'', category:'', version:'', description:'' });

export default function DocumentsScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Doc[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<Doc | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [draft,      setDraft]      = useState(blankDraft);
  const [pickField,  setPickField]  = useState<string | null>(null);

  const showModal = showCreate || editItem !== null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => { setDraft(blankDraft()); setPickField(null); setEditItem(null); setShowCreate(true); }} style={{ paddingHorizontal: 8 }}>
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const set = (key: string) => (val: string) => setDraft(d => ({ ...d, [key]: val }));

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, title, category, version, created_at')
      .eq('is_active', true)
      .order('title');
    setItems((data as Doc[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item: Doc) => {
    setDraft({ title: item.title || '', category: item.category || '', version: item.version || '', description: '' });
    setPickField(null);
    setEditItem(item);
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    setPickField(null);
  };

  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter a document title.');
    setSaving(true);
    if (editItem) {
      const { error } = await supabase.from('documents').update({
        title:       draft.title.trim(),
        category:    draft.category || null,
        description: draft.description || null,
      }).eq('id', editItem.id);
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      setEditItem(null);
      load();
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const { error } = await supabase.from('documents').insert({
        title:       draft.title.trim(),
        category:    draft.category || null,
        version:     draft.version || null,
        description: draft.description || null,
        company_id:  prof?.company_id,
        is_active:   true,
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
      'Remove Document',
      `Remove "${editItem.title}" from the list? This will hide it from all users.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('documents').update({ is_active: false }).eq('id', editItem.id);
            if (error) return Alert.alert('Error', error.message);
            setEditItem(null);
            load();
          },
        },
      ],
    );
  };

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
        ListEmptyComponent={<Empty icon="document-text-outline" label="No documents uploaded" hint="Tap + to add a document" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={22} color={colors.greenMd} style={s.icon} />
            <View style={s.body}>
              <Text style={s.title}>{item.title}</Text>
              <View style={s.meta}>
                {item.category && <Text style={s.cat}>{item.category}</Text>}
                {item.version  && <Text style={s.ver}>v{item.version}</Text>}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
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
              <Text style={f.hdrTitle}>{editItem ? 'Edit Document' : 'Add Document'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>DOCUMENT TITLE *</Text>
              <TextInput style={f.inp} value={draft.title} onChangeText={set('title')}
                placeholder="e.g. Forklift Safety SOP" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>CATEGORY</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'cat' ? null : 'cat')}>
                <Text style={draft.category ? f.selVal : f.selPh}>{draft.category || 'Select category…'}</Text>
                <Ionicons name={pickField === 'cat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'cat' && (
                <View style={f.opts}>
                  {CATEGORIES.map((c, i) => (
                    <TouchableOpacity key={c} style={[f.opt, i === CATEGORIES.length - 1 && f.optLast]}
                      onPress={() => { set('category')(c); setPickField(null); }}>
                      <Text style={f.optTxt}>{c}</Text>
                      {draft.category === c && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!editItem && (
                <>
                  <Text style={f.lbl}>VERSION</Text>
                  <TextInput style={f.inp} value={draft.version} onChangeText={set('version')}
                    placeholder="e.g. 1.0" placeholderTextColor={colors.muted} />
                </>
              )}

              <Text style={f.lbl}>DESCRIPTION</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.description} onChangeText={set('description')}
                placeholder="Brief description of this document…" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

              {!editItem && (
                <View style={f.note}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={f.noteTxt}>File upload is available in the web app. Add the document record here, then upload the file from your desktop.</Text>
                </View>
              )}

              {editItem && (
                <TouchableOpacity style={f.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color="#d9534f" style={{ marginRight: 8 }} />
                  <Text style={f.deleteTxt}>Remove Document</Text>
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
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  icon:      { marginRight: 12 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  meta:      { flexDirection: 'row', gap: 8 },
  cat:       { fontSize: 11, color: colors.muted },
  ver:       { fontSize: 11, color: colors.greenMd, fontWeight: '600' },
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
