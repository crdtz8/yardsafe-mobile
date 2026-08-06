import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { templateToSections, defaultSections } from '@/constants/inspectionSections';

type Inspection = {
  id: string; title: string | null; date: string | null;
  location: string | null; status: string | null; score: number | null;
  profiles: { name: string } | null;
};

const STATUS_COLOR: Record<string, string> = {
  draft: colors.muted, in_progress: '#F59E0B', complete: colors.greenMd, completed: colors.greenMd, failed: colors.red,
};

// New inspections always start as a draft (the DB allows only 'draft'/'complete';
// you complete it from the detail screen).
const blankDraft = () => ({
  title: '', date: new Date().toISOString().split('T')[0], location: '', status: 'draft',
});

export default function InspectionsScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Inspection[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [draft,      setDraft]      = useState(blankDraft);
  const [pickField,  setPickField]  = useState<string | null>(null);
  const [templates,  setTemplates]  = useState<{ id: string; name: string; sections: any }[]>([]);
  const [templateId, setTemplateId] = useState<string>('');

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
      .from('inspections')
      .select('id, title, date, location, status, score, profiles(name)')
      .order('date', { ascending: false });
    setItems((data as any[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh when returning from the detail screen so a just-completed inspection
  // shows its updated status immediately.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Load custom inspection templates (RLS returns global + own-company) when the
  // create sheet opens, so a new inspection can start from a company template.
  useEffect(() => {
    if (!showCreate) return;
    setTemplateId('');
    supabase.from('inspection_templates').select('id, name, sections').order('name')
      .then(({ data }) => setTemplates((data as any[]) ?? []));
  }, [showCreate]);

  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter an inspection title.');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
    const chosen = templates.find(t => t.id === templateId);
    const { data: newRow, error } = await supabase.from('inspections').insert({
      title:        draft.title.trim(),
      date:         draft.date || null,
      location:     draft.location || null,
      status:       draft.status,
      inspector_id: user!.id,
      company_id:   prof?.company_id,
      // Bake the checklist into the inspection as answer-shape sections (never
      // null — the column is NOT NULL). A chosen template's definition-shape
      // sections are converted; otherwise the built-in default checklist is used.
      sections:     chosen ? templateToSections(chosen.sections) : defaultSections(),
    }).select('id').single();
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setShowCreate(false);
    load();
    if (newRow?.id) router.push(`/(tabs)/inspection/${newRow.id}` as any);
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
        ListEmptyComponent={<Empty icon="clipboard-outline" label="No inspections recorded" hint="Tap + to start one" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => router.push(`/(tabs)/inspection/${item.id}` as any)} activeOpacity={0.7}>
            <View style={s.body}>
              <Text style={s.title}>{item.title ?? 'Inspection'}</Text>
              <Text style={s.sub}>
                {item.profiles?.name ? `${item.profiles.name} · ` : ''}
                {item.date ? new Date(item.date).toLocaleDateString() : '—'}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
            </View>
            <View style={s.right}>
              {item.score != null && <Text style={s.score}>{item.score}%</Text>}
              {item.status && (
                <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? colors.muted) + '22' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? colors.muted }]}>
                    {item.status.replace('_', ' ')}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>New Inspection</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Starting…' : 'Start'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>INSPECTION TITLE *</Text>
              <TextInput style={f.inp} value={draft.title} onChangeText={set('title')}
                placeholder="e.g. Weekly Yard Walkthrough" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>DATE</Text>
              <TextInput style={f.inp} value={draft.date} onChangeText={set('date')}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={f.lbl}>LOCATION / AREA</Text>
              <TextInput style={f.inp} value={draft.location} onChangeText={set('location')}
                placeholder="e.g. Main Yard, Processing Area" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>CHECKLIST TEMPLATE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'tpl' ? null : 'tpl')}>
                <Text style={f.selVal}>{templates.find(t => t.id === templateId)?.name ?? 'Default checklist'}</Text>
                <Ionicons name={pickField === 'tpl' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'tpl' && (
                <View style={f.opts}>
                  <TouchableOpacity style={f.opt} onPress={() => { setTemplateId(''); setPickField(null); }}>
                    <Text style={f.optTxt}>Default checklist</Text>
                    {templateId === '' && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                  {templates.map((t, i) => (
                    <TouchableOpacity key={t.id} style={[f.opt, i === templates.length - 1 && f.optLast]}
                      onPress={() => { setTemplateId(t.id); setPickField(null); }}>
                      <Text style={f.optTxt}>{t.name}</Text>
                      {templateId === t.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
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
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  right:     { alignItems: 'flex-end', gap: 4, marginLeft: 10 },
  score:     { fontSize: 16, fontWeight: '800', color: colors.greenMd },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
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
  opts:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:  { borderBottomWidth: 0 },
  optTxt:   { fontSize: 15, color: colors.text, flex: 1 },
  note:     { flexDirection: 'row', alignItems: 'center', marginTop: 28, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  noteTxt:  { fontSize: 13, color: colors.muted, flex: 1 },
});
