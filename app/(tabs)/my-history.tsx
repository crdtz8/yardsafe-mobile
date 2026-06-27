import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Completion = {
  id: string;
  completed_at: string;
  score: number | null;
  trainings: { title: string; type: string } | null;
};

export default function MyHistoryScreen() {
  const [items,      setItems]      = useState<Completion[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    // training_completions is the correct table — separate from training_assignments
    const { data } = await supabase
      .from('training_completions')
      .select('id, completed_at, score, trainings(title, type)')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false });
    setItems((data as any[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <FlatList
      data={items}
      keyExtractor={i => i.id}
      style={s.list}
      contentContainerStyle={items.length === 0 ? s.empty : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
      ItemSeparatorComponent={() => <View style={s.sep} />}
      ListEmptyComponent={
        <View style={s.emptyWrap}>
          <Ionicons name="time-outline" size={44} color={colors.border} />
          <Text style={s.emptyText}>No completed trainings yet</Text>
          <Text style={s.emptyHint}>Courses you finish will appear here</Text>
        </View>
      }
      renderItem={({ item }) => {
        const t = item.trainings as any;
        return (
          <View style={s.row}>
            <View style={s.check}>
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
            <View style={s.body}>
              <Text style={s.title}>{t?.title ?? '—'}</Text>
              <Text style={s.date}>Completed {new Date(item.completed_at).toLocaleDateString()}</Text>
            </View>
            {item.score != null && (
              <Text style={[s.score, item.score >= 80 ? s.scorePass : s.scoreFail]}>
                {item.score}%
              </Text>
            )}
            <Ionicons
              name={t?.type === 'video' ? 'play-circle-outline' : 'document-text-outline'}
              size={18}
              color={colors.muted}
            />
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border, textAlign: 'center' },
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 56 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  check:     { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.greenMd, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  date:      { fontSize: 12, color: colors.muted },
  score:     { fontSize: 13, fontWeight: '700', marginRight: 4 },
  scorePass: { color: colors.greenMd },
  scoreFail: { color: colors.danger },
});
