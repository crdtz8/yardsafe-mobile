import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getProfile, getCompany, signOut } from '@/lib/auth';

type Profile = { name: string; email: string; role: string; company_id: string };
type Company = { name: string; plan: string };

const PLAN_LABEL: Record<string, string> = {
  trial:      'Free Trial',
  starter:    'Starter',
  growth:     'Growth',
  pro:        'Pro',
  enterprise: 'Enterprise',
};

export default function MoreScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { profile } = await getProfile(user.id);
      if (profile) {
        setProfile(profile);
        const { company } = await getCompany(profile.company_id);
        if (company) setCompany(company);
      }
    })();
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.name ?? '—'}</Text>
          <Text style={styles.profileEmail}>{profile?.email ?? '—'}</Text>
          <Text style={styles.profileRole}>{profile?.role?.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>

      {/* Company */}
      {company && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>COMPANY</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Name</Text>
            <Text style={styles.infoVal}>{company.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Plan</Text>
            <Text style={styles.infoVal}>{PLAN_LABEL[company.plan] ?? company.plan}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <TouchableOpacity style={styles.actionRow} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={styles.actionText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>YardSafe v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: 20, paddingBottom: 40 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.greenDk,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  avatar:      { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.greenMd, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: colors.cream, fontSize: 20, fontWeight: '800' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.cream },
  profileEmail:{ fontSize: 12, color: colors.greenLt, marginTop: 2 },
  profileRole: { fontSize: 10, fontWeight: '700', color: colors.greenLt, letterSpacing: 1.5, marginTop: 6 },

  section:      { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 12 },

  infoRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoKey:  { fontSize: 13, color: colors.muted },
  infoVal:  { fontSize: 13, fontWeight: '600', color: colors.text },

  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.red },

  version: { textAlign: 'center', fontSize: 11, color: colors.muted, marginTop: 8 },
});
