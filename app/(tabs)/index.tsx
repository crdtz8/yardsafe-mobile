import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getProfile, getCompany } from '@/lib/auth';

type Profile = { name: string; role: string; company_id: string };
type Stats   = { assigned: number; completed: number; overdue: number };

export default function DashboardScreen() {
  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [company,  setCompany]  = useState<{ name: string; plan: string } | null>(null);
  const [stats,    setStats]    = useState<Stats>({ assigned: 0, completed: 0, overdue: 0 });
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { profile } = await getProfile(user.id);
    if (!profile) { setLoading(false); return; }
    setProfile(profile);

    const { company } = await getCompany(profile.company_id);
    if (company) setCompany(company);

    // Training stats
    const { data: assignments } = await supabase
      .from('training_assignments')
      .select('completed_at')
      .eq('user_id', user.id);

    if (assignments) {
      const completed = assignments.filter(a => a.completed_at).length;
      setStats({
        assigned:  assignments.length,
        completed,
        overdue:   0, // Phase 3.2 will add due dates
      });
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.greenMd} size="large" />
      </View>
    );
  }

  const remaining = stats.assigned - stats.completed;
  const pct = stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingName}>Hi, {profile?.name?.split(' ')[0] ?? 'there'}</Text>
        {company && <Text style={styles.greetingCo}>{company.name}</Text>}
      </View>

      {/* Training progress card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>TRAINING PROGRESS</Text>
        <View style={styles.progressRow}>
          <Text style={styles.pct}>{pct}%</Text>
          <Text style={styles.pctSub}>complete</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${pct}%` as any }]} />
        </View>
        <Text style={styles.progressDetail}>
          {stats.completed} of {stats.assigned} completed
          {remaining > 0 ? ` · ${remaining} remaining` : ''}
        </Text>
      </View>

      {/* Stat tiles */}
      <View style={styles.tiles}>
        <StatTile label="Assigned"  value={stats.assigned}  />
        <StatTile label="Done"      value={stats.completed} accent />
        <StatTile label="Remaining" value={remaining}       />
      </View>
    </ScrollView>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={[styles.tile, accent && styles.tileAccent]}>
      <Text style={[styles.tileValue, accent && styles.tileValueAccent]}>{value}</Text>
      <Text style={[styles.tileLabel, accent && styles.tileLabelAccent]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: 20, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  greeting:     { marginBottom: 24 },
  greetingName: { fontSize: 24, fontWeight: '800', color: colors.text },
  greetingCo:   { fontSize: 13, color: colors.muted, marginTop: 2 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel:     { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 12 },
  progressRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 12 },
  pct:           { fontSize: 40, fontWeight: '800', color: colors.greenDk },
  pctSub:        { fontSize: 14, color: colors.muted },
  progressBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginBottom: 10 },
  progressBarFill: { height: 6, backgroundColor: colors.greenMd, borderRadius: 3 },
  progressDetail:  { fontSize: 12, color: colors.muted },

  tiles:          { flexDirection: 'row', gap: 10 },
  tile:           { flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tileAccent:     { backgroundColor: colors.greenDk, borderColor: colors.greenDk },
  tileValue:      { fontSize: 26, fontWeight: '800', color: colors.text },
  tileValueAccent:{ color: colors.cream },
  tileLabel:      { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: '600' },
  tileLabelAccent:{ color: colors.greenLt },
});
