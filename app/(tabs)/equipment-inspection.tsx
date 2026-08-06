import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { uploadImageBase64 } from '@/lib/storage';

type Result = 'pass' | 'fail' | 'na';
type ChkItem = { id: string; label: string; required: boolean; result: Result | null; note: string };

// Built-in pre-op checklists (mirror the web app) used when no custom template
// exists for the equipment type.
const DEFAULT_CHECKLISTS: Record<string, { id: string; label: string; required: boolean }[]> = {
  forklift: [
    { id:'fl1', label:'Horn functional', required:true },
    { id:'fl2', label:'Forks — no bends, cracks, or wear', required:true },
    { id:'fl3', label:'Hydraulics — no leaks, smooth operation', required:true },
    { id:'fl4', label:'Tires in good condition (no flats or excessive wear)', required:true },
    { id:'fl5', label:'Seatbelt functional and not frayed', required:true },
    { id:'fl6', label:'Brakes functional', required:true },
    { id:'fl7', label:'Battery charge / fuel level adequate', required:true },
    { id:'fl8', label:'Overhead guard in place and undamaged', required:true },
    { id:'fl9', label:'Warning lights and reverse alarm operational', required:false },
    { id:'fl10', label:'Fire extinguisher present and charged', required:false },
  ],
  overhead_crane: [
    { id:'oc1', label:'Hook latch operational and not deformed', required:true },
    { id:'oc2', label:'Wire rope / chain — no kinks, broken wires, or wear', required:true },
    { id:'oc3', label:'Upper and lower limit switches functional', required:true },
    { id:'oc4', label:'Controls responsive and properly labeled', required:true },
    { id:'oc5', label:'Brakes hold load without drift', required:true },
    { id:'oc6', label:'No unusual noises during test operation', required:true },
    { id:'oc7', label:'Load rating placard visible and legible', required:false },
  ],
  magnet_crane: [
    { id:'mc1', label:'Magnet energizes and holds load properly', required:true },
    { id:'mc2', label:'Magnet cable and connections in good condition', required:true },
    { id:'mc3', label:'Controls responsive', required:true },
    { id:'mc4', label:'Wire rope / chain — no kinks or damage', required:true },
    { id:'mc5', label:'Brakes hold load without drift', required:true },
    { id:'mc6', label:'Load rating placard visible', required:false },
  ],
  shear: [
    { id:'sh1', label:'Guards in place and secured', required:true },
    { id:'sh2', label:'Hydraulics — no leaks, proper pressure', required:true },
    { id:'sh3', label:'Emergency stop functional', required:true },
    { id:'sh4', label:'Blade condition — no chips or excessive wear', required:true },
    { id:'sh5', label:'Safety interlocks operational', required:true },
    { id:'sh6', label:'Operator area clear of debris', required:true },
  ],
  baler: [
    { id:'ba1', label:'Guards in place and secured', required:true },
    { id:'ba2', label:'Hydraulics — no leaks', required:true },
    { id:'ba3', label:'Emergency stop functional', required:true },
    { id:'ba4', label:'Safety interlocks operational', required:true },
    { id:'ba5', label:'Cylinder seals not leaking', required:false },
  ],
  other: [
    { id:'ot1', label:'Equipment visually inspected — no obvious damage', required:true },
    { id:'ot2', label:'Guards and safety devices in place', required:true },
    { id:'ot3', label:'Controls responsive', required:true },
    { id:'ot4', label:'No unusual noises or leaks', required:true },
    { id:'ot5', label:'Fluid levels adequate (if applicable)', required:false },
    { id:'ot6', label:'Fire extinguisher present (if applicable)', required:false },
  ],
};

function typeKey(t?: string): string {
  const s = (t || '').toLowerCase();
  if (s.includes('fork')) return 'forklift';
  if (s.includes('magnet')) return 'magnet_crane';
  if (s.includes('crane')) return 'overhead_crane';
  if (s.includes('shear')) return 'shear';
  if (s.includes('baler')) return 'baler';
  return 'other';
}

export default function EquipmentInspectionScreen() {
  const { equipmentId, equipmentName, equipmentType } =
    useLocalSearchParams<{ equipmentId: string; equipmentName: string; equipmentType: string }>();
  const navigation = useNavigation();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems]         = useState<ChkItem[]>([]);
  const [notes, setNotes]         = useState('');
  const [photos, setPhotos]       = useState<string[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Pre-Op Inspection' });
  }, [navigation]);

  const load = useCallback(async () => {
    // Prefer a custom template for this equipment type (global or company).
    const { data: tpls } = await supabase
      .from('equipment_inspection_templates')
      .select('id, items, equipment_type, is_active')
      .eq('equipment_type', equipmentType)
      .eq('is_active', true)
      .limit(1);

    let base: { id: string; label: string; required: boolean }[];
    if (tpls && tpls.length && Array.isArray((tpls[0] as any).items) && (tpls[0] as any).items.length) {
      setTemplateId((tpls[0] as any).id);
      base = (tpls[0] as any).items;
    } else {
      base = DEFAULT_CHECKLISTS[typeKey(equipmentType)] || DEFAULT_CHECKLISTS.other;
    }
    setItems(base.map(b => ({ id: b.id, label: b.label, required: !!b.required, result: null, note: '' })));
    setLoading(false);
  }, [equipmentType]);

  useEffect(() => { load(); }, [load]);

  const setResult = (id: string, result: Result) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, result: i.result === result ? null : result } : i));
  const setNote = (id: string, note: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, note } : i));

  const addPhoto = () => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Permission needed', 'Camera access is required.');
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.7, base64: true });
        if (!res.canceled && res.assets[0]?.base64) upload(res.assets[0].base64);
      }},
      { text: 'Choose from Library', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Permission needed', 'Photo library access is required.');
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.7, base64: true });
        if (!res.canceled && res.assets[0]?.base64) upload(res.assets[0].base64);
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const upload = async (base64: string) => {
    setUploading(true);
    try {
      const rand = Math.random().toString(36).slice(-6);
      const path = `equipment-inspections/${equipmentId}/${Date.now()}-${rand}.jpg`;
      const publicUrl = await uploadImageBase64('inspection-photos', path, base64);
      setPhotos(p => [...p, publicUrl]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    }
    setUploading(false);
  };

  const save = async () => {
    const unanswered = items.filter(i => i.required && i.result === null);
    if (unanswered.length) {
      return Alert.alert('Incomplete', `Answer all required items (${unanswered.length} remaining).`);
    }
    setSaving(true);
    const overall_status = items.some(i => i.required && i.result === 'fail') ? 'fail' : 'pass';
    const { data: { user } } = await supabase.auth.getUser();
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase.from('equipment_inspections').insert({
      equipment_id:    equipmentId,
      template_id:     templateId,
      inspected_by:    user!.id,
      inspection_date: today,
      overall_status,
      items_data:      items.map(({ id, label, required, result, note }) => ({ id, label, required, result, note: note || null })),
      notes:           notes || null,
      photos,
    });
    if (!error) {
      await supabase.from('equipment')
        .update({ last_inspection_at: new Date().toISOString() })
        .eq('id', equipmentId);
    }
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    Alert.alert(
      overall_status === 'pass' ? 'Inspection passed' : 'Inspection recorded — FAILED',
      overall_status === 'pass'
        ? `${equipmentName} passed its pre-op inspection.`
        : `${equipmentName} has failed items. Consider taking it out of service.`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  const failCount = items.filter(i => i.result === 'fail').length;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.equip}>{equipmentName}</Text>
        <Text style={s.equipSub}>{equipmentType || 'Equipment'} · {items.length} checks{failCount ? ` · ${failCount} failed` : ''}</Text>

        {items.map(item => (
          <View key={item.id} style={s.item}>
            <Text style={s.itemLabel}>{item.label}{item.required ? ' *' : ''}</Text>
            <View style={s.results}>
              {(['pass', 'fail', 'na'] as Result[]).map(r => {
                const on = item.result === r;
                const bg = r === 'pass' ? colors.greenMd : r === 'fail' ? colors.red : colors.muted;
                return (
                  <TouchableOpacity key={r}
                    style={[s.resBtn, on && { backgroundColor: bg, borderColor: bg }]}
                    onPress={() => setResult(item.id, r)}>
                    <Text style={[s.resTxt, on && { color: colors.white }]}>
                      {r === 'na' ? 'N/A' : r.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {item.result === 'fail' && (
              <TextInput style={s.note} value={item.note} onChangeText={t => setNote(item.id, t)}
                placeholder="Describe the issue…" placeholderTextColor={colors.muted} multiline />
            )}
          </View>
        ))}

        <Text style={s.lbl}>OVERALL NOTES</Text>
        <TextInput style={[s.note, { minHeight: 70 }]} value={notes} onChangeText={setNotes}
          placeholder="Any additional notes…" placeholderTextColor={colors.muted} multiline textAlignVertical="top" />

        <Text style={s.lbl}>PHOTOS</Text>
        <View style={s.photoRow}>
          {photos.map((p, i) => <Image key={i} source={{ uri: p }} style={s.photo} />)}
          <TouchableOpacity style={s.addPhoto} onPress={addPhoto} disabled={uploading}>
            {uploading
              ? <ActivityIndicator color={colors.greenMd} />
              : <Ionicons name="camera-outline" size={24} color={colors.greenMd} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.save, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
          <Text style={s.saveTxt}>{saving ? 'SAVING…' : 'SUBMIT INSPECTION'}</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content:    { padding: 20 },
  equip:      { fontSize: 20, fontWeight: '800', color: colors.text },
  equipSub:   { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 16 },
  item:       { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  itemLabel:  { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 10 },
  results:    { flexDirection: 'row', gap: 8 },
  resBtn:     { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.bg },
  resTxt:     { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  note:       { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, marginTop: 10 },
  lbl:        { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginTop: 22, marginBottom: 8 },
  photoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo:      { width: 64, height: 64, borderRadius: 8 },
  addPhoto:   { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  save:       { backgroundColor: colors.greenDk, borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  saveTxt:    { color: colors.cream, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});
