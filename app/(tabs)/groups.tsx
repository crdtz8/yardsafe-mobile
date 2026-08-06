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
import { fetchGroups, createGroup, type Group } from '@/lib/groups';

export default function GroupsScreen() {
  const navigation = useNavigation();
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [counts,     setCounts]     = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [name,       setName]       = useState('');
  const [desc,       setDesc]       = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => { setName(''); setDesc(''); setShowCreate(true); }} style={{ paddingHorizontal: 8 }}>
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const { data } = await fetchGroups();
    const gs = (data as Group[]) ?? [];
    setGroups(gs);
    // Member counts per group
    const entries = await Promise.all(gs.map(async g => {
      const { count } = await supabase.from('profiles')
        .select('id', { count: 'exact', head: true }).eq('group_id', g.id).is('archived_at', null);
      return [g.id, count ?? 0] as [string, number];
    }));
    setCounts(Object.fromEntries(entries));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh counts when returning from the detail screen.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Enter a group name.');
    setSaving(true);
    const { data, error } = await createGroup(name.trim(), desc.trim());
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setShowCreate(false);
    load();
    if (data?.id) router.push(`/(tabs)/group/${data.id}` as any);
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <>
      <FlatList
        data={groups}
        keyExtractor={g => g.id}
        style={s.list}
        contentContainerStyle={groups.length === 0 ? s.empty : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="people-outline" size={44} color={colors.border} />
            <Text style={s.emptyText}>No groups yet</Text>
            <Text style={s.emptyHint}>Tap + to create a team</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => router.push(`/(tabs)/group/${item.id}` as any)} activeOpacity={0.7}>
            <View style={s.avatar}><Ionicons name="people" size={18} color={colors.greenDk} /></View>
            <View style={s.body}>
              <Text style={s.title}>{item.name}</Text>
              {item.description ? <Text style={s.sub} numberOfLines={1}>{item.description}</Text> : null}
            </View>
            <Text style={s.count}>{counts[item.id] ?? 0} {counts[item.id] === 1 ? 'member' : 'members'}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={() => setShowCreate(false)}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
              <Text style={f.hdrTitle}>New Group</Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>
              <Text style={f.lbl}>GROUP NAME *</Text>
              <TextInput style={f.inp} value={name} onChangeText={setName}
                placeholder="e.g. Yard Crew, Torch Team" placeholderTextColor={colors.muted} />
              <Text style={f.lbl}>DESCRIPTION</Text>
              <TextInput style={[f.inp, { minHeight: 80, paddingTop: 12 }]} value={desc} onChangeText={setDesc}
                placeholder="Optional" placeholderTextColor={colors.muted} multiline textAlignVertical="top" />
              <Text style={f.note}>After creating, you can add members and assign trainings — assigning a training to the group assigns it to every member and notifies them.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
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
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  avatar:    { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenLt + '44', alignItems: 'center', justifyContent: 'center' },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text },
  sub:       { fontSize: 12, color: colors.muted, marginTop: 2 },
  count:     { fontSize: 12, color: colors.muted, marginRight: 4 },
});

const f = StyleSheet.create({
  hdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle: { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:   { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:     { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:      { opacity: 0.4 },
  sc:       { padding: 20, paddingBottom: 60 },
  lbl:      { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 20 },
  inp:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  note:     { fontSize: 12, color: colors.muted, marginTop: 24, lineHeight: 18 },
});
