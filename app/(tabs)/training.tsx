import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Course = { id: string; title: string; type: string; duration: string | null; video_url: string | null; doc_url: string | null };
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
    const url = item.type === 'video' ? item.video_url : item.doc_url;
    if (!url) {
      Alert.alert('No content', 'This course has no linked video or document yet.');
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open course content.'));
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
});
