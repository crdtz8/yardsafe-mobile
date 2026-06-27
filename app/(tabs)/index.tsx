import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getProfile, getCompany, signOut } from '@/lib/auth';

type Profile = { name: string; role: string; company_id: string };

type TileDef = {
  id:    string;
  label: string;
  icon:  React.ComponentProps<typeof Ionicons>['name'];
  unit:  string;
  route: string;
  roles: string[];
  count: (companyId: string, userId: string) => Promise<number>;
};

const TILES: TileDef[] = [
  // ── Employee-only tiles ──────────────────────────────────────────────────
  {
    id: 'my_trainings', label: 'MY TRAININGS', icon: 'school-outline', unit: 'assigned', route: '/(tabs)/my-trainings',
    roles: ['employee'],
    count: async (_cid, uid) => {
      const { count } = await supabase.from('training_assignments').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('completed_at', null);
      return count ?? 0;
    },
  },
  {
    id: 'my_history', label: 'MY HISTORY', icon: 'time-outline', unit: 'completed', route: '/(tabs)/my-history',
    roles: ['employee'],
    count: async (_cid, uid) => {
      const { count } = await supabase.from('training_assignments').select('id', { count: 'exact', head: true }).eq('user_id', uid).not('completed_at', 'is', null);
      return count ?? 0;
    },
  },
  // ── Admin / manager tiles ────────────────────────────────────────────────
  {
    id: 'trainings', label: 'ALL TRAININGS', icon: 'shield-outline', unit: 'trainings', route: '/(tabs)/training',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('trainings').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  {
    id: 'employees', label: 'EMPLOYEES', icon: 'people-outline', unit: 'employees', route: '/(tabs)/employees',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', cid).is('archived_at', null);
      return count ?? 0;
    },
  },
  {
    id: 'library', label: 'TRAINING LIBRARY', icon: 'folder-open-outline', unit: 'courses', route: '/(tabs)/library',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('trainings').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  {
    id: 'inspections', label: 'SAFETY INSPECTIONS', icon: 'clipboard-outline', unit: 'total', route: '/(tabs)/inspections',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('inspections').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  {
    id: 'incidents', label: 'INCIDENTS', icon: 'warning-outline', unit: 'total', route: '/(tabs)/incidents',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  {
    id: 'corrective', label: 'CORRECTIVE ACTIONS', icon: 'checkmark-circle-outline', unit: 'actions', route: '/(tabs)/corrective',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('corrective_actions').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  {
    id: 'certifications', label: 'CERTIFICATIONS', icon: 'ribbon-outline', unit: 'types', route: '/(tabs)/certifications',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('certification_types').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  // ── Shared tiles (all roles) ─────────────────────────────────────────────
  {
    id: 'documents', label: 'DOCUMENTS', icon: 'document-text-outline', unit: 'docs', route: '/(tabs)/documents',
    roles: ['admin', 'safety_manager', 'manager', 'employee'],
    count: async (cid) => {
      const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_active', true);
      return count ?? 0;
    },
  },
  {
    id: 'equipment', label: 'EQUIPMENT', icon: 'construct-outline', unit: 'items', route: '/(tabs)/equipment',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('equipment').select('id', { count: 'exact', head: true }).eq('company_id', cid);
      return count ?? 0;
    },
  },
  {
    id: 'permits', label: 'SAFETY PERMITS', icon: 'document-lock-outline', unit: 'active', route: '/(tabs)/permits',
    roles: ['admin', 'safety_manager', 'manager', 'employee'],
    count: async (cid) => {
      const { count } = await supabase.from('permits').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'active');
      return count ?? 0;
    },
  },
  {
    id: 'environmental', label: 'ENVIRONMENTAL', icon: 'leaf-outline', unit: 'items', route: '/(tabs)/environmental',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('compliance_items').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_active', true);
      return count ?? 0;
    },
  },
  {
    id: 'sds', label: 'SDS LIBRARY', icon: 'flask-outline', unit: 'sheets', route: '/(tabs)/sds',
    roles: ['admin', 'safety_manager', 'manager'],
    count: async (cid) => {
      const { count } = await supabase.from('sds_documents').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_active', true);
      return count ?? 0;
    },
  },
  {
    id: 'notifications', label: 'NOTIFICATIONS', icon: 'notifications-outline', unit: 'unread', route: '/(tabs)/notifications',
    roles: ['admin', 'safety_manager', 'manager', 'employee'],
    count: async (_cid, uid) => {
      const { count } = await supabase.from('notification_log').select('id', { count: 'exact', head: true }).eq('recipient_id', uid).eq('read', false);
      return count ?? 0;
    },
  },
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [company,    setCompany]    = useState<{ name: string } | null>(null);
  const [counts,     setCounts]     = useState<Record<string, number>>({});
  const [empCount,   setEmpCount]   = useState(0);
  const [overdue,    setOverdue]    = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { profile } = await getProfile(user.id);
    if (!profile) { setLoading(false); return; }
    setProfile(profile);

    const { company } = await getCompany(profile.company_id);
    if (company) setCompany(company);

    const cid = profile.company_id;
    const role = profile.role;

    // Employee count for header
    const { count: ec } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', cid)
      .is('archived_at', null);
    setEmpCount(ec ?? 0);

    // Overdue training assignments
    const today = new Date().toISOString().split('T')[0];
    const { count: oc } = await supabase
      .from('training_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', cid)
      .is('completed_at', null)
      .lt('due_date', today);
    setOverdue(oc ?? 0);

    // Tile counts (only for visible tiles)
    const visible = TILES.filter(t => t.roles.includes(role));
    const results = await Promise.all(
      visible.map(async (t) => {
        const n = await t.count(cid, user.id).catch(() => 0);
        return [t.id, n] as [string, number];
      })
    );
    setCounts(Object.fromEntries(results));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const role = profile?.role ?? 'employee';
  const visibleTiles = TILES.filter(t => t.roles.includes(role));

  const handleSignOut = () =>
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.greenMd} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenMd} />}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Image source={require('@/assets/logo-light.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.welcome}>WELCOME BACK</Text>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile?.name ?? '—'}</Text>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={22} color={colors.greenLt} />
          </TouchableOpacity>
        </View>
        <Text style={styles.meta}>
          {empCount} {empCount === 1 ? 'EMPLOYEE' : 'EMPLOYEES'}
          {overdue > 0 ? ` · ${overdue} OVERDUE` : ''}
        </Text>
      </View>

      {/* Tile list */}
      <View style={styles.list}>
        {visibleTiles.map((tile, i) => (
          <TouchableOpacity
            key={tile.id}
            style={[styles.tile, i < visibleTiles.length - 1 && styles.tileBorder]}
            activeOpacity={0.6}
            onPress={() => router.push(tile.route as any)}
          >
            <Ionicons name={tile.icon} size={20} color={colors.greenDk} style={styles.tileIcon} />
            <View style={styles.tileBody}>
              <Text style={styles.tileLabel}>{tile.label}</Text>
              <Text style={styles.tileSub}>{counts[tile.id] ?? 0} {tile.unit}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.greenDk,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  logo:       { width: 160, height: 40, alignSelf: 'center', marginBottom: 20 },
  welcome:    { fontSize: 11, fontWeight: '700', color: colors.greenLt, letterSpacing: 2, marginBottom: 4 },
  nameRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name:       { fontSize: 28, fontWeight: '800', color: colors.cream },
  signOutBtn: { padding: 4 },
  meta:       { fontSize: 12, fontWeight: '600', color: colors.greenLt, letterSpacing: 1 },

  list: {
    backgroundColor: colors.surface,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  tileBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tileIcon: { marginRight: 14 },
  tileBody: { flex: 1 },
  tileLabel:{ fontSize: 13, fontWeight: '700', color: colors.text, letterSpacing: 0.5 },
  tileSub:  { fontSize: 12, color: colors.muted, marginTop: 2 },
});
