import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Alert, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Assignment = {
  training_id: string;
  trainings: {
    id: string;
    title: string;
    type: string;
    duration: string | null;
    due_date: string | null;
    video_url: string | null;
    doc_url: string | null;
  } | null;
};

export default function MyTrainingsScreen() {
  const [items,      setItems]      = useState<Assignment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Load all assignments for this user
    const { data: assignments, error } = await supabase
      .from('training_assignments')
      .select('training_id, trainings(id, title, type, duration, due_date, video_url, doc_url)')
      .eq('user_id', user.id);

    if (error) { console.warn('training_assignments error:', error.message); }

    // Load completions separately (training_completions is a separate table from training_assignments)
    const { data: completions } = await supabase
      .from('training_completions')
      .select('training_id')
      .eq('user_id', user.id);

    const completedIds = new Set((completions ?? []).map((c: any) => c.training_id));

    // Show only assignments that have no completion record
    const pending = (assignments ?? []).filter((a: any) => !completedIds.has(a.training_id));

    // Sort by due_date ascending (nulls last)
    pending.sort((a: any, b: any) => {
      const da = a.trainings?.due_date;
      const db = b.trainings?.due_date;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da).getTime() - new Date(db).getTime();
    });

    setItems(pending as Assignment[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openTraining = useCallback((item: Assignment) => {
    const t = item.trainings;
    if (t?.type === 'video' && t?.video_url) {
      router.push({ pathname: '/(tabs)/training-player', params: { url: t.video_url, title: t.title ?? '' } } as any);
    } else if (t?.doc_url) {
      Linking.openURL(t.doc_url).catch(() => Alert.alert('Error', 'Could not open document.'));
    } else {
      Alert.alert('No content', 'This training has no linked video or document yet.');
    }
  }, []);

  const markComplete = useCallback((item: Assignment) => {
    const t = item.trainings;
    Alert.alert(
      'Mark Complete',
      `Mark "${t?.title ?? 'this training'}" as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete',
          style: 'default',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            // Insert into training_completions (separate table from training_assignments)
            const { error } = await supabase
              .from('training_completions')
              .insert({ training_id: item.training_id, user_id: user.id, completed_at: new Date().toISOString() });
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            load();
          },
        },
      ],
    );
  }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <FlatList
      data={items}
      keyExtractor={i => i.training_id}
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
        const t = item.trainings;
        const dueDate = t?.due_date ? new Date(t.due_date) : null;
        const overdue = dueDate && dueDate < new Date();
        const hasContent = !!(t?.type === 'video' ? t?.video_url : t?.doc_url);
        return (
          <TouchableOpacity style={s.row} onPress={() => openTraining(item)} activeOpacity={0.7}>
            <Ionicons
              name={t?.type === 'video' ? 'play-circle-outline' : 'document-text-outline'}
              size={22}
              color={hasContent ? colors.greenMd : colors.muted}
              style={s.icon}
            />
            <View style={s.body}>
              <Text style={s.title}>{t?.title ?? '—'}</Text>
              {dueDate && (
                <Text style={[s.due, overdue ? s.overdue : null]}>
                  {overdue ? 'Overdue · ' : 'Due '}
                  {dueDate.toLocaleDateString()}
                </Text>
              )}
            </View>
            {t?.duration && <Text style={s.dur}>{t.duration}</Text>}
            <TouchableOpacity style={s.checkBtn} onPress={() => markComplete(item)} activeOpacity={0.7}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
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
  overdue:   { color: colors.danger, fontWeight: '600' },
  dur:       { fontSize: 11, color: colors.muted, marginRight: 8 },
  checkBtn:  { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.greenMd, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});
