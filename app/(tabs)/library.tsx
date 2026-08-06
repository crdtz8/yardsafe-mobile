import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, ScrollView, Alert, Linking,
  Modal, TextInput, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { callAdminApi } from '@/lib/api';

type Course = {
  id: string;
  title: string;
  type: string;
  duration: string | null;
  video_url: string | null;
  doc_url: string | null;
  categories: { id: string; name: string } | null;
};

type Category = { id: string; name: string };

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  video: 'play-circle-outline',
  document: 'document-text-outline',
};

const defaultDue = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
};

export default function LibraryScreen() {
  const [items,      setItems]      = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catFilter,  setCatFilter]  = useState<string>('all');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Assignment ────────────────────────────────────────────────────────────
  const [assignFor, setAssignFor] = useState<Course | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [dueDate,   setDueDate]   = useState('');
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    const [{ data: courses }, { data: cats }] = await Promise.all([
      supabase
        .from('trainings')
        .select('id, title, type, duration, video_url, doc_url, categories(id, name)')
        .order('title'),
      supabase.from('categories').select('id, name').order('name'),
    ]);
    setItems((courses as any[]) ?? []);
    setCategories((cats as Category[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!assignFor) return;
    supabase.from('profiles').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setEmployees((data as any[]) ?? []));
  }, [assignFor]);

  const openAssign = (course: Course) => {
    setSelected(new Set());
    setDueDate(defaultDue());
    setAssignFor(course);
  };
  const toggleEmp = (id: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const doAssign = async () => {
    if (!assignFor) return;
    if (selected.size === 0) return Alert.alert('Pick recipients', 'Select at least one employee.');
    setAssigning(true);
    let ok = 0, fail = 0;
    for (const userId of selected) {
      const { error } = await callAdminApi('assign_training_direct', {
        trainingId: assignFor.id, userId, dueDate: dueDate || null,
      });
      error ? fail++ : ok++;
    }
    setAssigning(false);
    const title = assignFor.title;
    setAssignFor(null);
    Alert.alert(
      fail === 0 ? 'Training assigned' : 'Partly assigned',
      `${title} assigned to ${ok} employee${ok !== 1 ? 's' : ''}${fail ? ` · ${fail} failed` : ''}.`,
    );
  };

  const openCourse = (item: Course) => {
    if (item.type === 'video' && item.video_url) {
      router.push({ pathname: '/(tabs)/training-player', params: { url: item.video_url, title: item.title } } as any);
    } else if (item.doc_url) {
      Linking.openURL(item.doc_url).catch(() => Alert.alert('Error', 'Could not open document.'));
    } else {
      Alert.alert('No content', 'This course has no linked video or document yet.');
    }
  };

  const filtered = catFilter === 'all'
    ? items
    : items.filter(i => (i.categories as any)?.id === catFilter);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.pillBar}
        contentContainerStyle={s.pillContent}
      >
        <TouchableOpacity
          style={[s.pill, catFilter === 'all' && s.pillActive]}
          onPress={() => setCatFilter('all')}
        >
          <Text style={[s.pillTxt, catFilter === 'all' && s.pillTxtActive]}>All</Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[s.pill, catFilter === cat.id && s.pillActive]}
            onPress={() => setCatFilter(cat.id)}
          >
            <Text style={[s.pillTxt, catFilter === cat.id && s.pillTxtActive]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={filtered.length === 0 ? s.empty : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="folder-open-outline" size={44} color={colors.border} />
            <Text style={s.emptyText}>{catFilter === 'all' ? 'No courses in the library' : 'No courses in this category'}</Text>
            <Text style={s.emptyHint}>Courses are added and managed in the web app</Text>
          </View>
        }
        renderItem={({ item }) => {
          const hasContent = !!(item.type === 'video' ? item.video_url : item.doc_url);
          return (
            <TouchableOpacity style={s.row} onPress={() => openCourse(item)} activeOpacity={0.7}>
              <Ionicons
                name={TYPE_ICON[item.type] ?? 'document-outline'}
                size={22}
                color={hasContent ? colors.greenMd : colors.muted}
                style={s.icon}
              />
              <View style={s.body}>
                <Text style={s.title}>{item.title}</Text>
                <View style={s.meta}>
                  {(item.categories as any)?.name && (
                    <Text style={s.tag}>{(item.categories as any).name}</Text>
                  )}
                  {item.duration && <Text style={s.dur}>{item.duration}</Text>}
                </View>
              </View>
              <TouchableOpacity style={s.assignBtn} onPress={() => openAssign(item)} hitSlop={8}>
                <Ionicons name="person-add-outline" size={18} color={colors.greenMd} />
              </TouchableOpacity>
              {hasContent && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
            </TouchableOpacity>
          );
        }}
      />

      {/* Assign modal */}
      <Modal visible={assignFor !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.mHdr}>
              <TouchableOpacity onPress={() => setAssignFor(null)}><Text style={s.mCancel}>Cancel</Text></TouchableOpacity>
              <Text style={s.mTitle} numberOfLines={1}>Assign Training</Text>
              <TouchableOpacity onPress={doAssign} disabled={assigning}>
                <Text style={[s.mSave, assigning && { opacity: 0.4 }]}>{assigning ? 'Assigning…' : 'Assign'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
              <Text style={s.mCourse}>{assignFor?.title}</Text>

              <Text style={s.mLbl}>DUE DATE</Text>
              <TextInput style={s.mInp} value={dueDate} onChangeText={setDueDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={s.mLbl}>RECIPIENTS ({selected.size} selected)</Text>
              <View style={s.mOpts}>
                {employees.length === 0
                  ? <View style={s.mOpt}><Text style={{ color: colors.muted, fontSize: 15 }}>Loading…</Text></View>
                  : employees.map((e, i) => {
                    const on = selected.has(e.id);
                    return (
                      <TouchableOpacity key={e.id} style={[s.mOpt, i === employees.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => toggleEmp(e.id)}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.greenMd : colors.muted} />
                        <Text style={s.mOptTxt}>{e.name}</Text>
                      </TouchableOpacity>
                    );
                  })
                }
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  list:         { flex: 1, backgroundColor: colors.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:        { flex: 1 },
  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText:    { fontSize: 14, color: colors.muted },
  emptyHint:    { fontSize: 12, color: colors.border, textAlign: 'center' },
  sep:          { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  icon:         { marginRight: 12 },
  body:         { flex: 1 },
  title:        { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  meta:         { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tag:          { fontSize: 10, fontWeight: '700', color: colors.greenMd, backgroundColor: colors.greenMd + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dur:          { fontSize: 11, color: colors.muted },
  assignBtn:    { padding: 6, marginRight: 4 },

  pillBar:      { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
  pillContent:  { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pill:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  pillActive:   { backgroundColor: colors.greenDk, borderColor: colors.greenDk },
  pillTxt:      { fontSize: 12, fontWeight: '600', color: colors.muted },
  pillTxtActive:{ color: colors.cream },

  mHdr:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  mTitle:  { fontSize: 15, fontWeight: '700', color: colors.cream, flex: 1, textAlign: 'center' },
  mCancel: { fontSize: 15, color: colors.greenLt, minWidth: 60 },
  mSave:   { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 60 },
  mCourse: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 },
  mLbl:    { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 20 },
  mInp:    { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  mOpts:   { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  mOpt:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  mOptTxt: { fontSize: 15, color: colors.text, flex: 1 },
});
