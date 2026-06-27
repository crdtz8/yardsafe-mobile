import { useEffect, useState, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type SdsDoc = {
  id: string;
  product_name: string;
  manufacturer: string | null;
  chemical_family: string | null;
  hazard_classes: string[] | null;
  signal_word: string | null;
  cas_number: string | null;
  un_number: string | null;
  file_url: string | null;
  file_name: string | null;
  locations: string | null;
  revision_date: string | null;
  is_active: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────

const SIGNAL_COLOR: Record<string, string>  = { danger: '#dc2626', warning: '#d97706', none: colors.muted };
const SIGNAL_LABEL: Record<string, string>  = { danger: 'DANGER',  warning: 'WARNING',  none: 'No Signal Word' };

const HAZARD_CLASSES: Record<string, { label: string; color: string }> = {
  flammable_liquid:   { label: 'Flammable Liquid',   color: '#ef4444' },
  flammable_gas:      { label: 'Flammable Gas',       color: '#ef4444' },
  flammable_aerosol:  { label: 'Flammable Aerosol',  color: '#ef4444' },
  oxidizer:           { label: 'Oxidizer',            color: '#f59e0b' },
  compressed_gas:     { label: 'Compressed Gas',      color: '#3b82f6' },
  corrosive:          { label: 'Corrosive',           color: '#8b5cf6' },
  acute_toxicity:     { label: 'Acute Toxicity',      color: '#dc2626' },
  carcinogen:         { label: 'Carcinogen',          color: '#7c3aed' },
  aspiration_hazard:  { label: 'Aspiration Hazard',  color: '#0891b2' },
  skin_sensitizer:    { label: 'Skin Sensitizer',     color: '#d97706' },
  respiratory_hazard: { label: 'Respiratory Hazard', color: '#0284c7' },
  environmental:      { label: 'Environmental',       color: '#16a34a' },
};

// ── Main Screen ────────────────────────────────────────────────────────────

export default function SdsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [item,    setItem]    = useState<SdsDoc | null>(null);
  const [role,    setRole]    = useState('employee');
  const [loading, setLoading] = useState(true);

  const isManager = role === 'admin' || role === 'safety_manager' || role === 'manager';

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (prof) setRole(prof.role);
    })();
  }, []);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('sds_documents')
      .select('id, product_name, manufacturer, chemical_family, hazard_classes, signal_word, cas_number, un_number, file_url, file_name, locations, revision_date, is_active')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setItem(data as SdsDoc);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (item) navigation.setOptions({ title: item.product_name });
  }, [item, navigation]);

  useLayoutEffect(() => {
    if (!isManager || !item) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleDelete} style={{ paddingHorizontal: 8 }}>
          <Ionicons name="trash-outline" size={22} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [isManager, item, navigation]);

  const handleDelete = () => {
    if (!item) return;
    Alert.alert('Remove SDS', `Remove "${item.product_name}" from the library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('sds_documents').update({ is_active: false }).eq('id', item.id);
          router.back();
        },
      },
    ]);
  };

  const openPdf = () => {
    if (!item?.file_url) return;
    router.push({
      pathname: '/(tabs)/pdf-viewer',
      params: { url: item.file_url, title: `${item.product_name} — SDS` },
    } as any);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;
  }

  if (!item) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.muted} />
        <Text style={s.muted}>Chemical not found.</Text>
      </View>
    );
  }

  const sig = item.signal_word ?? 'none';
  const sigColor = SIGNAL_COLOR[sig] ?? colors.muted;
  const hazards = (item.hazard_classes ?? []).filter(h => HAZARD_CLASSES[h]);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>

      {/* Signal word banner */}
      <View style={[s.signalBanner, { backgroundColor: sigColor + '15', borderColor: sigColor + '40' }]}>
        <Ionicons
          name={sig === 'danger' ? 'warning' : sig === 'warning' ? 'alert-circle' : 'checkmark-circle'}
          size={28}
          color={sigColor}
        />
        <Text style={[s.signalTxt, { color: sigColor }]}>{SIGNAL_LABEL[sig]}</Text>
      </View>

      {/* Core info */}
      <View style={s.card}>
        <Row label="Product / Chemical" value={item.product_name} bold />
        {item.manufacturer   && <Row label="Manufacturer"   value={item.manufacturer} />}
        {item.chemical_family && <Row label="Chemical Family" value={item.chemical_family} />}
        {item.cas_number     && <Row label="CAS Number"     value={item.cas_number} mono />}
        {item.un_number      && <Row label="UN / DOT Number" value={item.un_number} mono />}
        {item.revision_date  && <Row label="Revision Date"  value={new Date(item.revision_date).toLocaleDateString()} />}
      </View>

      {/* Locations */}
      {item.locations && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>ON-SITE LOCATIONS</Text>
          <View style={s.locBox}>
            <Ionicons name="location-outline" size={16} color={colors.greenMd} style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={s.locTxt}>{item.locations}</Text>
          </View>
        </View>
      )}

      {/* Hazard classifications */}
      {hazards.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>GHS HAZARD CLASSIFICATIONS</Text>
          <View style={s.hazardWrap}>
            {hazards.map(h => {
              const m = HAZARD_CLASSES[h];
              return (
                <View key={h} style={[s.hazardChip, { backgroundColor: m.color + '18', borderColor: m.color + '40' }]}>
                  <Text style={[s.hazardTxt, { color: m.color }]}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* SDS Document */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>SAFETY DATA SHEET</Text>
        {item.file_url ? (
          <TouchableOpacity style={s.viewBtn} onPress={openPdf} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={20} color="#fff" style={{ marginRight: 10 }} />
            <Text style={s.viewBtnTxt}>View SDS Document</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.missingBox}>
            <Ionicons name="alert-outline" size={16} color="#f59e0b" style={{ marginRight: 8 }} />
            <Text style={s.missingTxt}>No SDS file uploaded yet.{isManager ? ' Upload it from the web app.' : ''}</Text>
          </View>
        )}
      </View>

      {/* OSHA note */}
      <View style={s.oshaNote}>
        <Ionicons name="information-circle-outline" size={14} color="#3b82f6" style={{ marginRight: 6 }} />
        <Text style={s.oshaTxt}>OSHA HazCom 29 CFR 1910.1200 requires SDS to be readily accessible to employees during each work shift.</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && s.rowBold, mono && s.rowMono]}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: colors.bg },
  content:      { padding: 16 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  muted:        { fontSize: 14, color: colors.muted },

  signalBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 16 },
  signalTxt:    { fontSize: 20, fontWeight: '800', letterSpacing: 1 },

  card:         { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 },
  row:          { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel:     { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  rowValue:     { fontSize: 14, color: colors.text },
  rowBold:      { fontWeight: '700' },
  rowMono:      { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },

  section:      { marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 8 },

  locBox:       { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 12 },
  locTxt:       { fontSize: 14, color: colors.text, flex: 1, lineHeight: 20 },

  hazardWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hazardChip:   { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  hazardTxt:    { fontSize: 12, fontWeight: '600' },

  viewBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenDk, borderRadius: 10, paddingVertical: 14 },
  viewBtnTxt:   { fontSize: 15, fontWeight: '700', color: '#fff' },

  missingBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b15', borderRadius: 8, borderWidth: 1, borderColor: '#f59e0b40', padding: 12 },
  missingTxt:   { fontSize: 13, color: '#d97706', flex: 1 },

  oshaNote:     { flexDirection: 'row', alignItems: 'flex-start', padding: 12, backgroundColor: '#3b82f615', borderRadius: 8, borderWidth: 1, borderColor: '#3b82f630' },
  oshaTxt:      { fontSize: 12, color: '#3b82f6', flex: 1, lineHeight: 17 },
});
