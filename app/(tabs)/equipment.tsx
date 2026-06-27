import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Equipment = {
  id: string; name: string; equipment_type: string | null;
  make: string | null; model: string | null; status: string | null; location: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  active: colors.greenMd, inactive: colors.muted, maintenance: '#F59E0B', retired: colors.red,
};

const EQUIP_TYPES = ['Forklift','Crane','Shear','Baler','Conveyor','Loader','Excavator','Truck','Trailer','Skid Steer','Magnet','Scale','Other'];
const STAT_OPTS   = [{ label:'Active', value:'active' },{ label:'Needs Maintenance', value:'maintenance' },{ label:'Out of Service', value:'inactive' },{ label:'Retired', value:'retired' }];

const blankDraft = () => ({ name:'', equipment_type:'', make:'', model:'', location:'', status:'active', notes:'' });

export default function EquipmentScreen() {
  const navigation = useNavigation();
  const [items,      setItems]      = useState<Equipment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [draft,      setDraft]      = useState(blankDraft);
  const [pickField,  setPickField]  = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => { setDraft(blankDraft()); setPickField(null); setShowCreate(true); }} style={{ paddingHorizontal: 8 }}>
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const set = (key: string) => (val: string) => setDraft(d => ({ ...d, [key]: val }));

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('equipment')
      .select('id, name, equipment_type, make, model, status, location')
      .order('name');
    setItems((data as Equipment[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!draft.name.trim()) return Alert.alert('Required', 'Enter equipment name.');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof }     = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
    const { error } = await supabase.from('equipment').insert({
      name:           draft.name.trim(),
      equipment_type: draft.equipment_type || null,
      make:           draft.make || null,
      model:          draft.model || null,
      location:       draft.location || null,
      status:         draft.status,
      notes:          draft.notes || null,
      company_id:     prof?.company_id,
    });
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    setShowCreate(false);
    load();
  };

  const labelFor = (opts: {label:string;value:string}[], val: string) =>
    opts.find(o => o.value === val)?.label ?? val;

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={items.length === 0 ? s.empty : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={<Empty icon="construct-outline" label="No equipment on record" hint="Tap + to add equipment" />}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.iconWrap}>
              <Ionicons name="construct-outline" size={20} color={colors.greenMd} />
            </View>
            <View style={s.body}>
              <Text style={s.title}>{item.name}</Text>
              <Text style={s.sub}>
                {[item.equipment_type, item.make, item.model].filter(Boolean).join(' · ')}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
            </View>
            {item.status && (
              <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? colors.muted) + '22' }]}>
                <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? colors.muted }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </View>
            )}
          </View>
        )}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>Add Equipment</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              <Text style={f.lbl}>EQUIPMENT NAME *</Text>
              <TextInput style={f.inp} value={draft.name} onChangeText={set('name')}
                placeholder="e.g. Forklift #2" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>TYPE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'type' ? null : 'type')}>
                <Text style={draft.equipment_type ? f.selVal : f.selPh}>{draft.equipment_type || 'Select type…'}</Text>
                <Ionicons name={pickField === 'type' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'type' && (
                <View style={f.opts}>
                  {EQUIP_TYPES.map((t, i) => (
                    <TouchableOpacity key={t} style={[f.opt, i === EQUIP_TYPES.length - 1 && f.optLast]}
                      onPress={() => { set('equipment_type')(t); setPickField(null); }}>
                      <Text style={f.optTxt}>{t}</Text>
                      {draft.equipment_type === t && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>MAKE</Text>
              <TextInput style={f.inp} value={draft.make} onChangeText={set('make')}
                placeholder="Manufacturer" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>MODEL</Text>
              <TextInput style={f.inp} value={draft.model} onChangeText={set('model')}
                placeholder="Model number or name" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>LOCATION</Text>
              <TextInput style={f.inp} value={draft.location} onChangeText={set('location')}
                placeholder="Yard location or area" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>STATUS</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'stat' ? null : 'stat')}>
                <Text style={f.selVal}>{labelFor(STAT_OPTS, draft.status)}</Text>
                <Ionicons name={pickField === 'stat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'stat' && (
                <View style={f.opts}>
                  {STAT_OPTS.map((o, i) => (
                    <TouchableOpacity key={o.value} style={[f.opt, i === STAT_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('status')(o.value); setPickField(null); }}>
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.status === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>NOTES</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.notes} onChangeText={set('notes')}
                placeholder="Additional notes…" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function Empty({ icon, label, hint }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; hint?: string }) {
  return (
    <View style={s.emptyWrap}>
      <Ionicons name={icon} size={44} color={colors.border} />
      <Text style={s.emptyText}>{label}</Text>
      {hint && <Text style={s.emptyHint}>{hint}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border },
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  iconWrap:  { width: 36, alignItems: 'center', marginRight: 10 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

const f = StyleSheet.create({
  hdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle: { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:   { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:     { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:      { opacity: 0.4 },
  scroll:   { flex: 1 },
  sc:       { padding: 20, paddingBottom: 60 },
  lbl:      { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 20 },
  inp:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  ta:       { minHeight: 80, paddingTop: 12 },
  sel:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:   { fontSize: 15, color: colors.text, flex: 1 },
  selPh:    { fontSize: 15, color: colors.muted, flex: 1 },
  opts:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:  { borderBottomWidth: 0 },
  optTxt:   { fontSize: 15, color: colors.text, flex: 1 },
});
