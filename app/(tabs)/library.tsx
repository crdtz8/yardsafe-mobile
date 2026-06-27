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

type Course = { id: string; title: string; type: string; duration: string | null; categories: { name: string } | null };

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  video: 'play-circle-outline', document: 'document-text-outline',
};

const TYPE_OPTS = [{ label:'Video', value:'video' },{ label:'Document', value:'document' }];

const blankDraft = () => ({ title:'', category_id:'', type:'video', duration:'', description:'' });

export default function LibraryScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Course[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
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
      .from('trainings')
      .select('id, title, type, duration, categories(name)')
      .order('title');
    setItems((data as any[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showCreate) return;
    supabase.from('categories').select('id, name').order('name')
      .then(({ data }) => setCategories((data as any[]) ?? []));
  }, [showCreate]);

  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter a course title.');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
    const { error } = await supabase.from('trainings').insert({
      title:       draft.title.trim(),
      category_id: draft.category_id || null,
      type:        draft.type,
      duration:    draft.duration || null,
      description: draft.description || null,
      company_id:  prof?.company_id,
    });
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setShowCreate(false);
    load();
  };

  const labelFor  = (opts: {label:string;value:string}[], val: string) => opts.find(o => o.value === val)?.label ?? val;
  const catName   = (id: string) => categories.find(c => c.id === id)?.name ?? 'Select category…';

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
        ListEmptyComponent={<Empty icon="folder-open-outline" label="No courses in the library" hint="Tap + to add a course" />}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Ionicons name={TYPE_ICON[item.type] ?? 'document-outline'} size={22} color={colors.greenMd} style={s.icon} />
            <View style={s.body}>
              <Text style={s.title}>{item.title}</Text>
              <View style={s.meta}>
                {item.categories?.name && <Text style={s.tag}>{item.categories.name}</Text>}
                {item.duration && <Text style={s.dur}>{item.duration}</Text>}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </View>
        )}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>Add Course</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>TITLE *</Text>
              <TextInput style={f.inp} value={draft.title} onChangeText={set('title')}
                placeholder="e.g. Forklift Safety Training" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>CATEGORY</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'cat' ? null : 'cat')}>
                <Text style={draft.category_id ? f.selVal : f.selPh}>{draft.category_id ? catName(draft.category_id) : 'Select category…'}</Text>
                <Ionicons name={pickField === 'cat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'cat' && (
                <View style={f.opts}>
                  {categories.length === 0
                    ? <View style={f.opt}><Text style={[f.optTxt, { color: colors.muted }]}>Loading…</Text></View>
                    : categories.map((c, i) => (
                      <TouchableOpacity key={c.id} style={[f.opt, i === categories.length - 1 && f.optLast]}
                        onPress={() => { set('category_id')(c.id); setPickField(null); }}>
                        <Text style={f.optTxt}>{c.name}</Text>
                        {draft.category_id === c.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                      </TouchableOpacity>
                    ))
                  }
                </View>
              )}

              <Text style={f.lbl}>TYPE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'type' ? null : 'type')}>
                <Text style={f.selVal}>{labelFor(TYPE_OPTS, draft.type)}</Text>
                <Ionicons name={pickField === 'type' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'type' && (
                <View style={f.opts}>
                  {TYPE_OPTS.map((o, i) => (
                    <TouchableOpacity key={o.value} style={[f.opt, i === TYPE_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('type')(o.value); setPickField(null); }}>
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.type === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {draft.type === 'video' && (
                <>
                  <Text style={f.lbl}>DURATION</Text>
                  <TextInput style={f.inp} value={draft.duration} onChangeText={set('duration')}
                    placeholder="e.g. 15 min" placeholderTextColor={colors.muted} />
                </>
              )}

              <Text style={f.lbl}>DESCRIPTION</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.description} onChangeText={set('description')}
                placeholder="What will employees learn?" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <View style={f.note}>
                <Ionicons name="information-circle-outline" size={16} color={colors.muted} style={{ marginRight: 6 }} />
                <Text style={f.noteTxt}>Video URL, quiz, and employee assignment are managed in the web app.</Text>
              </View>

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
  meta:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tag:       { fontSize: 10, fontWeight: '700', color: colors.greenMd, backgroundColor: colors.greenMd + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dur:       { fontSize: 11, color: colors.muted },
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
  ta:       { minHeight: 80, paddingTop: 12 },
  sel:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:   { fontSize: 15, color: colors.text, flex: 1 },
  selPh:    { fontSize: 15, color: colors.muted, flex: 1 },
  opts:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:  { borderBottomWidth: 0 },
  optTxt:   { fontSize: 15, color: colors.text, flex: 1 },
  note:     { flexDirection: 'row', alignItems: 'flex-start', marginTop: 28, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  noteTxt:  { fontSize: 13, color: colors.muted, flex: 1 },
});
