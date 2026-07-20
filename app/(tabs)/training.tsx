import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Linking, Alert,
  Modal, ScrollView, TextInput, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { callAdminApi } from '@/lib/api';

type Course = { id: string; title: string; type: string; duration: string | null; video_url: string | null; doc_url: string | null };

const defaultDue = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
};
type Section = { title: string; data: Course[] };

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  video:    'play-circle-outline',
  document: 'document-text-outline',
};

export default function TrainingScreen() {
  const [sections,   setSections]   = useState<Section[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<'all' | 'video' | 'document'>('all');

  // ── Assignment ──────────────────────────────────────────────────────────
  const [assignFor,  setAssignFor]  = useState<Course | null>(null);
  const [employees,  setEmployees]  = useState<{ id: string; name: string }[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [dueDate,    setDueDate]    = useState('');
  const [assigning,  setAssigning]  = useState(false);

  const openAssign = (course: Course) => {
    setSelected(new Set());
    setDueDate(defaultDue());
    setAssignFor(course);
  };
  const toggleEmp = (id: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  useEffect(() => {
    if (!assignFor) return;
    supabase.from('profiles').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setEmployees((data as any[]) ?? []));
  }, [assignFor]);

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
    setAssignFor(null);
    Alert.alert(
      fail === 0 ? 'Training assigned' : 'Partly assigned',
      `${assignFor.title} assigned to ${ok} employee${ok !== 1 ? 's' : ''}${fail ? ` · ${fail} failed` : ''}.`,
    );
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('trainings')
      .select('id, title, type, duration, video_url, doc_url, categories(name)')
      .order('title');

    if (data) {
      const grouped: Record<string, Course[]> = {};
      (data as any[]).forEach(t => {
        const cat = (t.categories as any)?.name ?? 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ id: t.id, title: t.title, type: t.type ?? 'document', duration: t.duration, video_url: t.video_url ?? null, doc_url: t.doc_url ?? null });
      });

      const built: Section[] = Object.entries(grouped)
        .sort(([a], [b]) => {
          if (a === 'Uncategorized') return 1;
          if (b === 'Uncategorized') return -1;
          return a.localeCompare(b);
        })
        .map(([title, courses]) => ({ title, data: courses }));

      setSections(built);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const openCourse = (item: Course) => {
    if (item.type === 'video' && item.video_url) {
      router.push({ pathname: '/(tabs)/training-player', params: { url: item.video_url, title: item.title } } as any);
    } else if (item.doc_url) {
      Linking.openURL(item.doc_url).catch(() => Alert.alert('Error', 'Could not open document.'));
    } else {
      Alert.alert('No content', 'This course has no linked video or document yet.');
    }
  };

  const filteredSections: Section[] = filter === 'all'
    ? sections
    : sections
        .map(s => ({ ...s, data: s.data.filter(c => c.type === filter) }))
        .filter(s => s.data.length > 0);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Filter pills */}
      <View style={styles.pills}>
        {(['all', 'video', 'document'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && styles.pillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, filter === f && styles.pillTextActive]}>
              {f === 'all' ? 'All' : f === 'video' ? 'Videos' : 'Documents'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionList
        sections={filteredSections}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenMd} />}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={filteredSections.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={44} color={colors.border} />
            <Text style={styles.emptyTitle}>No trainings found</Text>
            <Text style={styles.emptyHint}>Add courses in the web app or tap the Training Library</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const hasContent = !!(item.type === 'video' ? item.video_url : item.doc_url);
          return (
            <TouchableOpacity
              style={[
                styles.row,
                index === 0 && styles.rowFirst,
                index === section.data.length - 1 && styles.rowLast,
              ]}
              onPress={() => openCourse(item)}
              activeOpacity={0.7}
            >
              <Ionicons name={TYPE_ICON[item.type] ?? 'document-outline'} size={20} color={hasContent ? colors.greenMd : colors.muted} style={styles.rowIcon} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {item.duration && <Text style={styles.rowDur}>{item.duration}</Text>}
              </View>
              <TouchableOpacity style={styles.assignBtn} onPress={() => openAssign(item)} hitSlop={8}>
                <Ionicons name="person-add-outline" size={18} color={colors.greenMd} />
              </TouchableOpacity>
              <View style={[styles.typeBadge, item.type === 'video' && styles.typeBadgeVideo]}>
                <Text style={[styles.typeText, item.type === 'video' && styles.typeTextVideo]}>
                  {item.type.toUpperCase()}
                </Text>
              </View>
              {hasContent && <Ionicons name="chevron-forward" size={14} color={colors.muted} style={{ marginLeft: 6 }} />}
            </TouchableOpacity>
          );
        }}
        SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      {/* Assign modal */}
      <Modal visible={assignFor !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.mHdr}>
              <TouchableOpacity onPress={() => setAssignFor(null)}><Text style={styles.mCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.mTitle} numberOfLines={1}>Assign Training</Text>
              <TouchableOpacity onPress={doAssign} disabled={assigning}>
                <Text style={[styles.mSave, assigning && { opacity: 0.4 }]}>{assigning ? 'Assigning…' : 'Assign'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.mCourse}>{assignFor?.title}</Text>

              <Text style={styles.mLbl}>DUE DATE</Text>
              <TextInput style={styles.mInp} value={dueDate} onChangeText={setDueDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={styles.mLbl}>RECIPIENTS ({selected.size} selected)</Text>
              <View style={styles.mOpts}>
                {employees.length === 0
                  ? <View style={styles.mOpt}><Text style={{ color: colors.muted, fontSize: 15 }}>Loading…</Text></View>
                  : employees.map((e, i) => {
                    const on = selected.has(e.id);
                    return (
                      <TouchableOpacity key={e.id} style={[styles.mOpt, i === employees.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => toggleEmp(e.id)}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.greenMd : colors.muted} />
                        <Text style={styles.mOptTxt}>{e.name}</Text>
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

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  pills:          { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  pill:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive:     { backgroundColor: colors.greenDk, borderColor: colors.greenDk },
  pillText:       { fontSize: 12, fontWeight: '600', color: colors.muted },
  pillTextActive: { color: colors.cream },

  listContent:    { padding: 16, paddingTop: 8, paddingBottom: 32 },
  emptyContainer: { flex: 1 },

  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle:     { fontSize: 14, fontWeight: '600', color: colors.muted },
  emptyHint:      { fontSize: 12, color: colors.border, textAlign: 'center' },

  sectionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle:   { fontSize: 11, fontWeight: '800', color: colors.greenMd, letterSpacing: 1, textTransform: 'uppercase' },
  sectionCount:   { fontSize: 11, fontWeight: '700', color: colors.muted },

  row:            { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 13, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  rowFirst:       { borderTopLeftRadius: 8, borderTopRightRadius: 8, borderTopWidth: 1 },
  rowLast:        { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderBottomWidth: 1 },
  rowIcon:        { marginRight: 12, flexShrink: 0 },
  rowBody:        { flex: 1 },
  rowTitle:       { fontSize: 14, fontWeight: '600', color: colors.text },
  rowDur:         { fontSize: 11, color: colors.muted, marginTop: 2 },
  typeBadge:      { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: colors.surface2 },
  typeBadgeVideo: { backgroundColor: colors.greenMd + '22' },
  typeText:       { fontSize: 9, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  typeTextVideo:  { color: colors.greenMd },

  sep:            { height: 1, backgroundColor: colors.border },

  assignBtn:      { padding: 6, marginRight: 4 },

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
