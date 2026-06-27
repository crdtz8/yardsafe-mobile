import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, ScrollView, Alert, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

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

export default function LibraryScreen() {
  const [items,      setItems]      = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catFilter,  setCatFilter]  = useState<string>('all');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
              {hasContent && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
            </TouchableOpacity>
          );
        }}
      />
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

  pillBar:      { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
  pillContent:  { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pill:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  pillActive:   { backgroundColor: colors.greenDk, borderColor: colors.greenDk },
  pillTxt:      { fontSize: 12, fontWeight: '600', color: colors.muted },
  pillTxtActive:{ color: colors.cream },
});
