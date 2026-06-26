import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Training = {
  id: string;
  training_id: string;
  completed_at: string | null;
  title: string;
  type: string;
  duration: string | null;
};

export default function TrainingScreen() {
  const [trainings,  setTrainings]  = useState<Training[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<'all' | 'todo' | 'done'>('all');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('training_assignments')
      .select(`
        id,
        training_id,
        completed_at,
        trainings ( title, type, duration )
      `)
      .eq('user_id', user.id)
      .order('completed_at', { ascending: true, nullsFirst: true });

    if (data) {
      setTrainings(data.map((a: any) => ({
        id:           a.id,
        training_id:  a.training_id,
        completed_at: a.completed_at,
        title:        a.trainings?.title ?? 'Untitled',
        type:         a.trainings?.type  ?? 'doc',
        duration:     a.trainings?.duration ?? null,
      })));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const visible = trainings.filter(t =>
    filter === 'all'  ? true :
    filter === 'todo' ? !t.completed_at :
                         !!t.completed_at
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.greenMd} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter pills */}
      <View style={styles.pills}>
        {(['all', 'todo', 'done'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && styles.pillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, filter === f && styles.pillTextActive]}>
              {f === 'all' ? 'All' : f === 'todo' ? 'To Do' : 'Completed'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenMd} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No trainings here</Text>
          </View>
        }
        renderItem={({ item }) => <TrainingRow item={item} />}
      />
    </View>
  );
}

function TrainingRow({ item }: { item: Training }) {
  const done = !!item.completed_at;
  return (
    <View style={styles.row}>
      <View style={[styles.statusDot, done && styles.statusDotDone]}>
        {done && <Ionicons name="checkmark" size={12} color={colors.cream} />}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, done && styles.rowTitleDone]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.badge}>{item.type.toUpperCase()}</Text>
          {item.duration && <Text style={styles.duration}>{item.duration}</Text>}
          {done && <Text style={styles.doneLabel}>COMPLETE</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  pills:         { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  pill:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive:    { backgroundColor: colors.greenDk, borderColor: colors.greenDk },
  pillText:      { fontSize: 12, fontWeight: '600', color: colors.muted },
  pillTextActive:{ color: colors.cream },

  list:      { padding: 16, paddingTop: 8, gap: 10 },
  empty:     { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: colors.muted, fontSize: 14 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot:     { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  statusDotDone: { backgroundColor: colors.greenMd, borderColor: colors.greenMd },
  rowBody:       { flex: 1 },
  rowTitle:      { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  rowTitleDone:  { color: colors.muted },
  rowMeta:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge:         { fontSize: 9, fontWeight: '700', color: colors.muted, letterSpacing: 1, backgroundColor: colors.surface2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  duration:      { fontSize: 11, color: colors.muted },
  doneLabel:     { fontSize: 9, fontWeight: '700', color: colors.greenMd, letterSpacing: 1 },
});
