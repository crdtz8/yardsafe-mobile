import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Assignment = {
  id: string;
  due_date: string | null;
  trainings: { title: string; type: string; duration: string | null } | null;
};

export default function MyTrainingsScreen() {
  const [items,      setItems]      = useState<Assignment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('training_assignments')
      .select('id, due_date, trainings(title, type, duration)')
      .eq('user_id', user.id)
      .is('completed_at', null)
      .order('due_date', { ascending: true, nullsFirst: false });
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
          <Ionicons name="shield-checkmark-outline" size={44} color={colors.border} />
          <Text style={s.emptyText}>No trainings assigned</Text>
          <Text style={s.emptyHint}>Your manager will assign courses when ready</Text>
        </View>
      }
      renderItem={({ item }) => {
        const t = item.trainings as any;
        const overdue = item.due_date && new Date(item.due_date) < new Date();
        return (
          <View style={s.row}>
            <Ionicons
              name={t?.type === 'video' ? 'play-circle-outline' : 'document-text-outline'}
              size={22}
              color={colors.greenMd}
              style={s.icon}
            />
            <View style={s.body}>
              <Text style={s.title}>{t?.title ?? '—'}</Text>
              {item.due_date && (
                <Text style={[s.due, overdue && s.overdue]}>
                  {overdue ? 'Overdue · ' : 'Due '}
                  {new Date(item.due_date).toLocaleDateString()}
                </Text>
              )}
            </View>
            {t?.duration && <Text style={s.dur}>{t.duration}</Text>}
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
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  icon:      { marginRight: 12 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  due:       { fontSize: 12, color: colors.muted },
  overdue:   { color: colors.red, fontWeight: '600' },
  dur:       { fontSize: 11, color: colors.muted },
});
