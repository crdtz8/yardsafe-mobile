import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform,
  KeyboardAvoidingView, Switch, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type Incident = {
  id: string; title: string | null; incident_type: string | null;
  incident_date: string | null; severity: string | null; status: string | null;
};

type Employee = { id: string; name: string };
type Photo    = { url: string; path: string };

// ── Constants ──────────────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  first_aid: '#F59E0B', recordable: '#EF4444', lost_time: '#B91C1C', fatality: '#7F1D1D',
};
const STATUS_BADGE: Record<string, string> = {
  open: colors.red, under_review: '#F59E0B', closed: colors.muted,
};

const INC_TYPES = [
  { label: 'Injury',           value: 'injury' },
  { label: 'Illness',          value: 'illness' },
  { label: 'Near Miss',        value: 'near_miss' },
  { label: 'Property Damage',  value: 'property_damage' },
  { label: 'Vehicle',          value: 'vehicle' },
  { label: 'Environmental',    value: 'environmental' },
];

const SEV_OPTS = [
  { label: 'First Aid',   value: 'first_aid' },
  { label: 'Recordable',  value: 'recordable' },
  { label: 'Lost Time',   value: 'lost_time' },
  { label: 'Fatality',    value: 'fatality' },
];

const STAT_OPTS = [
  { label: 'Open',         value: 'open' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Closed',       value: 'closed' },
];

const INJURY_TYPES = [
  { label: 'Laceration / Cut',       value: 'laceration' },
  { label: 'Fracture / Break',       value: 'fracture' },
  { label: 'Sprain',                 value: 'sprain' },
  { label: 'Strain',                 value: 'strain' },
  { label: 'Bruise / Contusion',     value: 'bruise' },
  { label: 'Burn (Thermal)',         value: 'burn_thermal' },
  { label: 'Burn (Chemical)',        value: 'burn_chemical' },
  { label: 'Amputation',             value: 'amputation' },
  { label: 'Foreign Body',           value: 'foreign_body' },
  { label: 'Hearing Loss',           value: 'hearing_loss' },
  { label: 'Respiratory',            value: 'respiratory' },
  { label: 'Repetitive Motion',      value: 'repetitive_motion' },
  { label: 'Allergic Reaction',      value: 'allergic_reaction' },
  { label: 'Electric Shock',         value: 'electric_shock' },
  { label: 'Concussion',             value: 'concussion' },
  { label: 'Other',                  value: 'other' },
];

const BODY_PARTS = [
  { label: 'Head',        value: 'head' },
  { label: 'Eye(s)',      value: 'eye' },
  { label: 'Ear(s)',      value: 'ear' },
  { label: 'Face',        value: 'face' },
  { label: 'Neck',        value: 'neck' },
  { label: 'Shoulder',    value: 'shoulder' },
  { label: 'Upper Arm',   value: 'arm' },
  { label: 'Elbow',       value: 'elbow' },
  { label: 'Wrist',       value: 'wrist' },
  { label: 'Hand',        value: 'hand' },
  { label: 'Finger(s)',   value: 'finger' },
  { label: 'Upper Back',  value: 'back_upper' },
  { label: 'Lower Back',  value: 'back_lower' },
  { label: 'Torso / Chest', value: 'torso' },
  { label: 'Hip',         value: 'hip' },
  { label: 'Upper Leg',   value: 'leg' },
  { label: 'Knee',        value: 'knee' },
  { label: 'Ankle',       value: 'ankle' },
  { label: 'Foot',        value: 'foot' },
  { label: 'Toe(s)',      value: 'toe' },
  { label: 'Multiple',    value: 'multiple' },
  { label: 'Internal',    value: 'internal' },
  { label: 'Other',       value: 'other' },
];

const TREATMENT_OPTS = [
  { label: 'None / Observation',  value: 'none' },
  { label: 'First Aid (on-site)', value: 'first_aid' },
  { label: 'Doctor Visit',        value: 'doctor_visit' },
  { label: 'Emergency Room',      value: 'er_visit' },
  { label: 'Hospitalization',     value: 'hospitalization' },
];

const today = () => new Date().toISOString().split('T')[0];

const blankDraft = () => ({
  title: '', incident_date: today(), incident_time: '',
  location: '', incident_type: '', severity: 'first_aid', status: 'open',
  osha_recordable: false, case_number: '',
  injured_employee_id: '', witnesses: '',
  injury_type: '', body_part: '', treatment: 'none',
  days_away: '', days_restricted: '',
  description: '', root_cause: '', immediate_action: '',
});

type Draft = ReturnType<typeof blankDraft>;

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function IncidentsScreen() {
  const navigation = useNavigation();
  const [items,       setItems]       = useState<Incident[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editItem,    setEditItem]    = useState<Incident | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [draft,       setDraft]       = useState<Draft>(blankDraft);
  const [pickField,   setPickField]   = useState<string | null>(null);
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [photos,      setPhotos]      = useState<Photo[]>([]);
  const [uploading,   setUploading]   = useState(false);

  const showModal  = showCreate || editItem !== null;
  const isInjury   = draft.incident_type === 'injury' || draft.incident_type === 'illness';

  const set = (key: keyof Draft) => (val: any) => setDraft(d => ({ ...d, [key]: val }));

  const closeModal = () => {
    setShowCreate(false); setEditItem(null); setPickField(null); setPhotos([]);
  };

  // ── Load employees when modal opens ────────────────────────────────────────

  useEffect(() => {
    if (!showModal) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      if (!prof?.company_id) return;
      const { data } = await supabase.from('profiles').select('id, name')
        .eq('company_id', prof.company_id).eq('is_active', true).order('name');
      setEmployees((data as Employee[]) ?? []);
    })();
  }, [showModal]);

  // ── Load existing photos when editing ──────────────────────────────────────

  useEffect(() => {
    if (!editItem) return;
    supabase.from('incident_photos').select('url, path').eq('incident_id', editItem.id)
      .then(({ data }) => setPhotos((data as Photo[]) ?? []));
  }, [editItem]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => { setDraft(blankDraft()); setPickField(null); setPhotos([]); setShowCreate(true); }}
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // ── Data load ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('incidents')
      .select('id, title, incident_type, incident_date, severity, status')
      .order('incident_date', { ascending: false });
    setItems((data as Incident[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item: Incident) => {
    const full: any = item;
    setDraft({
      title:               full.title               ?? '',
      incident_date:       full.incident_date        ?? today(),
      incident_time:       full.incident_time        ?? '',
      location:            full.location             ?? '',
      incident_type:       full.incident_type        ?? '',
      severity:            full.severity             ?? 'first_aid',
      status:              full.status               ?? 'open',
      osha_recordable:     full.osha_recordable      ?? false,
      case_number:         full.case_number          ?? '',
      injured_employee_id: full.injured_employee_id  ?? '',
      witnesses:           full.witnesses            ?? '',
      injury_type:         full.injury_type          ?? '',
      body_part:           full.body_part            ?? '',
      treatment:           full.treatment            ?? 'none',
      days_away:           String(full.days_away     ?? ''),
      days_restricted:     String(full.days_restricted ?? ''),
      description:         full.description          ?? '',
      root_cause:          full.root_cause           ?? '',
      immediate_action:    full.immediate_action      ?? '',
    });
    setEditItem(item);
    setPickField(null);
  };

  // ── Photo upload ───────────────────────────────────────────────────────────

  const addPhoto = () => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permission Required', 'Camera access is needed.');
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.75 });
          if (!res.canceled && res.assets[0]) uploadPhoto(res.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library', onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permission Required', 'Photo library access is needed.');
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.75 });
          if (!res.canceled && res.assets[0]) uploadPhoto(res.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (uri: string) => {
    setUploading(true);
    try {
      const ext  = (uri.split('.').pop() ?? 'jpg').split('?')[0];
      const rand = Math.random().toString(36).slice(-6);
      const path = `incidents/${Date.now()}-${rand}.${ext}`;
      const blob = await (await fetch(uri)).blob();
      const { error } = await supabase.storage.from('incident-photos').upload(path, blob, { contentType: `image/${ext}` });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('incident-photos').getPublicUrl(path);
      setPhotos(p => [...p, { url: publicUrl, path }]);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    }
    setUploading(false);
  };

  const removePhoto = (path: string) => {
    setPhotos(p => p.filter(ph => ph.path !== path));
    supabase.storage.from('incident-photos').remove([path]);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!draft.title.trim())   return Alert.alert('Required', 'Enter an incident title.');
    if (!draft.incident_type)  return Alert.alert('Required', 'Select an incident type.');
    setSaving(true);

    const payload: Record<string, any> = {
      title:               draft.title.trim(),
      incident_date:       draft.incident_date || null,
      incident_time:       draft.incident_time || null,
      location:            draft.location || null,
      incident_type:       draft.incident_type,
      severity:            draft.severity,
      status:              draft.status,
      osha_recordable:     draft.osha_recordable,
      case_number:         draft.osha_recordable ? (draft.case_number || null) : null,
      injured_employee_id: draft.injured_employee_id || null,
      witnesses:           draft.witnesses || null,
      injury_type:         isInjury ? (draft.injury_type || null) : null,
      body_part:           isInjury ? (draft.body_part || null) : null,
      treatment:           isInjury ? (draft.treatment || null) : null,
      days_away:           isInjury ? (parseInt(draft.days_away as string) || 0) : 0,
      days_restricted:     isInjury ? (parseInt(draft.days_restricted as string) || 0) : 0,
      description:         draft.description || null,
      root_cause:          draft.root_cause || null,
      immediate_action:    draft.immediate_action || null,
    };

    let incidentId = editItem?.id;

    if (editItem) {
      const { error } = await supabase.from('incidents').update(payload).eq('id', editItem.id);
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const { data, error } = await supabase.from('incidents')
        .insert({ ...payload, company_id: prof?.company_id, reported_by: user!.id })
        .select('id').single();
      setSaving(false);
      if (error) return Alert.alert('Error', error.message);
      incidentId = data?.id;
    }

    // Save new photos to incident_photos table
    if (incidentId && photos.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single();
      const existingPaths = editItem
        ? (await supabase.from('incident_photos').select('path').eq('incident_id', incidentId)).data?.map((r: any) => r.path) ?? []
        : [];
      const newPhotos = photos.filter(ph => !existingPaths.includes(ph.path));
      if (newPhotos.length > 0) {
        await supabase.from('incident_photos').insert(
          newPhotos.map(ph => ({
            incident_id:  incidentId,
            company_id:   prof?.company_id,
            url:          ph.url,
            path:         ph.path,
            uploaded_by:  user!.id,
          }))
        );
      }
    }

    closeModal();
    load();
  };

  const handleDelete = () => {
    if (!editItem) return;
    Alert.alert('Delete Incident', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('incidents').delete().eq('id', editItem.id);
          closeModal(); load();
        },
      },
    ]);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const labelFor = (opts: { label: string; value: string }[], val: string) =>
    opts.find(o => o.value === val)?.label ?? val;

  const Picker = ({ field, opts, placeholder }: { field: keyof Draft; opts: { label: string; value: string }[]; placeholder?: string }) => {
    const val = draft[field] as string;
    const open = pickField === field;
    return (
      <>
        <TouchableOpacity style={f.sel} onPress={() => setPickField(open ? null : field as string)}>
          <Text style={val ? f.selVal : f.selPh}>{val ? labelFor(opts, val) : (placeholder ?? 'Select…')}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </TouchableOpacity>
        {open && (
          <View style={f.opts}>
            {opts.map((o, i) => (
              <TouchableOpacity key={o.value} style={[f.opt, i === opts.length - 1 && f.optLast]}
                onPress={() => { set(field)(o.value); setPickField(null); }}>
                <Text style={f.optTxt}>{o.label}</Text>
                {val === o.value && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </>
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  // ── List ───────────────────────────────────────────────────────────────────

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={items.length === 0 ? s.empty : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="warning-outline" size={44} color={colors.border} />
            <Text style={s.emptyText}>No incidents recorded</Text>
            <Text style={s.emptyHint}>Tap + to report one</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={[s.dot, { backgroundColor: SEVERITY_BADGE[item.severity ?? ''] ?? colors.muted }]} />
            <View style={s.body}>
              <Text style={s.title}>{item.title ?? 'Incident'}</Text>
              <Text style={s.sub}>
                {item.incident_type ? `${labelFor(INC_TYPES, item.incident_type)} · ` : ''}
                {item.incident_date ? new Date(item.incident_date + 'T12:00:00').toLocaleDateString() : '—'}
              </Text>
            </View>
            {item.status && (
              <View style={[s.badge, { backgroundColor: (STATUS_BADGE[item.status] ?? colors.muted) + '22' }]}>
                <Text style={[s.badgeText, { color: STATUS_BADGE[item.status] ?? colors.muted }]}>
                  {labelFor(STAT_OPTS, item.status)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      {/* ── FORM MODAL ── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeModal}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
              <Text style={f.hdrTitle}>{editItem ? 'Edit Incident' : 'Report Incident'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={f.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>

              {/* ─ GENERAL INFORMATION ─ */}
              <Text style={f.sectionHdr}>GENERAL INFORMATION</Text>

              <Text style={f.lbl}>INCIDENT TITLE *</Text>
              <TextInput style={f.inp} value={draft.title} onChangeText={set('title')}
                placeholder="Brief description of what happened" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>DATE *</Text>
              <TextInput style={f.inp} value={draft.incident_date} onChangeText={set('incident_date')}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={f.lbl}>TIME OF INCIDENT</Text>
              <TextInput style={f.inp} value={draft.incident_time} onChangeText={set('incident_time')}
                placeholder="HH:MM (e.g. 14:30)" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

              <Text style={f.lbl}>LOCATION</Text>
              <TextInput style={f.inp} value={draft.location} onChangeText={set('location')}
                placeholder="Where did it occur?" placeholderTextColor={colors.muted} />

              <Text style={f.lbl}>INCIDENT TYPE *</Text>
              <Picker field="incident_type" opts={INC_TYPES} placeholder="Select type…" />

              <Text style={f.lbl}>SEVERITY *</Text>
              <Picker field="severity" opts={SEV_OPTS} />

              <Text style={f.lbl}>STATUS</Text>
              <Picker field="status" opts={STAT_OPTS} />

              {/* ─ OSHA CLASSIFICATION ─ */}
              <Text style={[f.sectionHdr, { marginTop: 28 }]}>OSHA CLASSIFICATION</Text>

              <View style={f.switchRow}>
                <View style={f.switchLabel}>
                  <Text style={f.switchTxt}>OSHA 300 Recordable</Text>
                  <Text style={f.switchSub}>Must be logged on OSHA 300 Log</Text>
                </View>
                <Switch
                  value={draft.osha_recordable}
                  onValueChange={set('osha_recordable')}
                  trackColor={{ true: colors.greenMd }}
                  thumbColor="#fff"
                />
              </View>

              {draft.osha_recordable && (
                <>
                  <Text style={f.lbl}>CASE NUMBER</Text>
                  <TextInput style={f.inp} value={draft.case_number} onChangeText={set('case_number')}
                    placeholder="OSHA case number" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
                </>
              )}

              {/* ─ INVOLVED PARTIES ─ */}
              <Text style={[f.sectionHdr, { marginTop: 28 }]}>INVOLVED PARTIES</Text>

              <Text style={f.lbl}>INJURED / INVOLVED EMPLOYEE</Text>
              <TouchableOpacity style={f.sel} onPress={() => setPickField(p => p === 'emp' ? null : 'emp')}>
                <Text style={draft.injured_employee_id ? f.selVal : f.selPh}>
                  {draft.injured_employee_id
                    ? (employees.find(e => e.id === draft.injured_employee_id)?.name ?? 'Unknown')
                    : 'Select employee (optional)…'}
                </Text>
                <Ionicons name={pickField === 'emp' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </TouchableOpacity>
              {pickField === 'emp' && (
                <View style={f.opts}>
                  <TouchableOpacity style={f.opt} onPress={() => { set('injured_employee_id')(''); setPickField(null); }}>
                    <Text style={[f.optTxt, { color: colors.muted }]}>None / External</Text>
                    {!draft.injured_employee_id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                  {employees.map((e, i) => (
                    <TouchableOpacity key={e.id} style={[f.opt, i === employees.length - 1 && f.optLast]}
                      onPress={() => { set('injured_employee_id')(e.id); setPickField(null); }}>
                      <Text style={f.optTxt}>{e.name}</Text>
                      {draft.injured_employee_id === e.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={f.lbl}>WITNESSES</Text>
              <TextInput style={f.inp} value={draft.witnesses} onChangeText={set('witnesses')}
                placeholder="Names of any witnesses" placeholderTextColor={colors.muted} />

              {/* ─ INJURY DETAILS (injury / illness only) ─ */}
              {isInjury && (
                <>
                  <Text style={[f.sectionHdr, { marginTop: 28 }]}>INJURY DETAILS</Text>

                  <Text style={f.lbl}>TYPE OF INJURY / ILLNESS</Text>
                  <Picker field="injury_type" opts={INJURY_TYPES} placeholder="Select injury type…" />

                  <Text style={f.lbl}>BODY PART AFFECTED</Text>
                  <Picker field="body_part" opts={BODY_PARTS} placeholder="Select body part…" />

                  <Text style={f.lbl}>TREATMENT RECEIVED</Text>
                  <Picker field="treatment" opts={TREATMENT_OPTS} />

                  <Text style={f.lbl}>DAYS AWAY FROM WORK</Text>
                  <TextInput style={f.inp} value={String(draft.days_away)} onChangeText={set('days_away')}
                    placeholder="0" placeholderTextColor={colors.muted} keyboardType="number-pad" />

                  <Text style={f.lbl}>DAYS RESTRICTED DUTY</Text>
                  <TextInput style={f.inp} value={String(draft.days_restricted)} onChangeText={set('days_restricted')}
                    placeholder="0" placeholderTextColor={colors.muted} keyboardType="number-pad" />
                </>
              )}

              {/* ─ DESCRIPTION & INVESTIGATION ─ */}
              <Text style={[f.sectionHdr, { marginTop: 28 }]}>DESCRIPTION & INVESTIGATION</Text>

              <Text style={f.lbl}>WHAT HAPPENED *</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.description} onChangeText={set('description')}
                placeholder="Describe the incident in detail…" placeholderTextColor={colors.muted}
                multiline numberOfLines={4} textAlignVertical="top" />

              <Text style={f.lbl}>ROOT CAUSE</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.root_cause} onChangeText={set('root_cause')}
                placeholder="What was the underlying cause?" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <Text style={f.lbl}>IMMEDIATE ACTION TAKEN</Text>
              <TextInput style={[f.inp, f.ta]} value={draft.immediate_action} onChangeText={set('immediate_action')}
                placeholder="What was done right away?" placeholderTextColor={colors.muted}
                multiline numberOfLines={3} textAlignVertical="top" />

              {/* ─ PHOTOS ─ */}
              <Text style={[f.sectionHdr, { marginTop: 28 }]}>PHOTOS</Text>

              {photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {photos.map(ph => (
                    <View key={ph.path} style={f.thumbWrap}>
                      <Image source={{ uri: ph.url }} style={f.thumb} resizeMode="cover" />
                      <TouchableOpacity style={f.thumbRemove} onPress={() => removePhoto(ph.path)}>
                        <Ionicons name="close-circle" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity style={f.photoBtn} onPress={addPhoto} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={colors.greenMd} size="small" style={{ marginRight: 8 }} />
                  : <Ionicons name="camera-outline" size={20} color={colors.greenMd} style={{ marginRight: 8 }} />}
                <Text style={f.photoBtnTxt}>{uploading ? 'Uploading…' : 'Add Photo'}</Text>
              </TouchableOpacity>

              {/* ─ DELETE ─ */}
              {editItem && (
                <TouchableOpacity style={f.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.red} style={{ marginRight: 6 }} />
                  <Text style={f.deleteTxt}>Delete Incident</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border },
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 42 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 },
  dot:       { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

const f = StyleSheet.create({
  hdr:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle:   { fontSize: 15, fontWeight: '700', color: colors.cream },
  cancel:     { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:       { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:        { opacity: 0.4 },
  scroll:     { flex: 1 },
  sc:         { padding: 20, paddingBottom: 60 },

  sectionHdr: { fontSize: 11, fontWeight: '800', color: colors.greenMd, letterSpacing: 1.5, marginBottom: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  lbl:        { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 6, marginTop: 16 },
  inp:        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  ta:         { minHeight: 96, paddingTop: 12 },
  sel:        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:     { fontSize: 15, color: colors.text, flex: 1 },
  selPh:      { fontSize: 15, color: colors.muted, flex: 1 },
  opts:       { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:    { borderBottomWidth: 0 },
  optTxt:     { fontSize: 15, color: colors.text, flex: 1 },

  switchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16, gap: 12 },
  switchLabel: { flex: 1 },
  switchTxt:   { fontSize: 15, color: colors.text, fontWeight: '600' },
  switchSub:   { fontSize: 12, color: colors.muted, marginTop: 2 },

  photoBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.greenMd, borderRadius: 8, paddingVertical: 12, backgroundColor: colors.greenMd + '10' },
  photoBtnTxt: { fontSize: 14, fontWeight: '600', color: colors.greenMd },
  thumbWrap:   { position: 'relative', marginRight: 8 },
  thumb:       { width: 90, height: 70, borderRadius: 6 },
  thumbRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10 },

  deleteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red + '55', backgroundColor: colors.red + '11' },
  deleteTxt:  { fontSize: 15, fontWeight: '600', color: colors.red },
});
