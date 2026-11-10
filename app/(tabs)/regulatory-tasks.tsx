import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { promptForPhoto } from '@/lib/photos';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { uploadImageBase64 } from '@/lib/storage';

// ── Domain constants (mirror the web RegulatoryTasks page) ─────────────────────

const CATEGORIES: Record<string, { label: string; color: string }> = {
  waste_disposal:   { label: 'Waste Disposal',   color: '#ef4444' },
  air_quality:      { label: 'Air Quality',      color: '#3b82f6' },
  stormwater:       { label: 'Stormwater',       color: '#06b6d4' },
  spill_prevention: { label: 'Spill Prevention', color: '#f59e0b' },
  permit_renewal:   { label: 'Permit Renewal',   color: '#8b5cf6' },
  reporting:        { label: 'Reporting',        color: '#ec4899' },
  training:         { label: 'Training',         color: '#22c55e' },
  pcb:              { label: 'PCB',              color: '#dc2626' },
  general:          { label: 'General',          color: '#6b7280' },
};

const FREQUENCIES: Record<string, { label: string; days: number | null }> = {
  daily:       { label: 'Daily',       days: 1 },
  weekly:      { label: 'Weekly',      days: 7 },
  monthly:     { label: 'Monthly',     days: 30 },
  quarterly:   { label: 'Quarterly',   days: 90 },
  semi_annual: { label: 'Semi-Annual', days: 182 },
  annual:      { label: 'Annual',      days: 365 },
  one_time:    { label: 'One-Time',    days: null },
};

const REMINDER_OPTIONS = [1, 3, 7, 14, 30, 60, 90];

const freqMeta = (id: string) => FREQUENCIES[id] || FREQUENCIES.annual;

type Item = {
  id: string; title: string; description: string | null; category: string;
  frequency: string; assigned_to: string | null; next_due_date: string | null;
  regulatory_reference: string | null; notes: string | null; location: string | null;
  reminder_days: number[] | null;
};
type Completion = {
  id: string; item_id: string; completed_by: string | null; completed_date: string;
  notes: string | null; next_due_date: string | null; attachments: any[] | null;
};
type Person = { id: string; name: string };
type Attachment = { url: string; path: string; name: string };

const DUE_META: Record<string, { label: string; color: string; priority: number }> = {
  overdue:  { label: 'Overdue',  color: '#ef4444', priority: 0 },
  due_soon: { label: 'Due Soon', color: '#f59e0b', priority: 1 },
  upcoming: { label: 'Upcoming', color: '#3b82f6', priority: 2 },
  ok:       { label: 'On Track', color: '#22c55e', priority: 3 },
  no_date:  { label: 'No Date',  color: '#6b7280', priority: 4 },
};

const dueStatus = (item: Item): string => {
  if (!item.next_due_date) return 'no_date';
  const days = Math.floor((new Date(item.next_due_date).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'due_soon';
  if (days <= 30) return 'upcoming';
  return 'ok';
};

const nextDueDate = (freq: string, fromDate: string): string | null => {
  const days = freqMeta(freq).days;
  if (!days) return null;
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (s: string | null) => (s ? new Date(s + 'T12:00:00').toLocaleDateString() : '—');

const MGR_ROLES = ['admin', 'safety_manager', 'manager'];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function RegulatoryTasksScreen() {
  const navigation = useNavigation();
  const [items,       setItems]       = useState<Item[]>([]);
  const [people,      setPeople]      = useState<Person[]>([]);
  const [myId,        setMyId]        = useState('');
  const [isMgr,       setIsMgr]       = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const [detail,   setDetail]   = useState<Item | null>(null);
  const [comps,    setComps]    = useState<Completion[]>([]);
  const [completing, setCompleting] = useState<Item | null>(null);
  const [formItem, setFormItem] = useState<Item | 'new' | null>(null);

  const userName = (id: string | null) => people.find(p => p.id === id)?.name ?? '—';

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setMyId(user.id);
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setIsMgr(MGR_ROLES.includes((prof as any)?.role));
    }
    const [{ data: it }, { data: ppl }] = await Promise.all([
      supabase.from('compliance_items').select('*').eq('is_active', true),
      supabase.from('profiles').select('id, name').eq('is_active', true).order('name'),
    ]);
    const sorted = ((it as Item[]) ?? []).sort((a, b) => {
      const pa = DUE_META[dueStatus(a)].priority, pb = DUE_META[dueStatus(b)].priority;
      if (pa !== pb) return pa - pb;
      return (a.next_due_date || '9999') < (b.next_due_date || '9999') ? -1 : 1;
    });
    setItems(sorted);
    setPeople((ppl as Person[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isMgr ? (
          <TouchableOpacity onPress={() => setFormItem('new')} style={{ paddingHorizontal: 8 }}>
            <Ionicons name="add" size={26} color={colors.cream} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, isMgr]);

  const openDetail = async (item: Item) => {
    setDetail(item);
    setComps([]);
    const { data } = await supabase.from('compliance_completions').select('*')
      .eq('item_id', item.id).order('completed_date', { ascending: false }).limit(50);
    setComps((data as Completion[]) ?? []);
  };

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
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="calendar-outline" size={44} color={colors.border} />
            <Text style={s.emptyText}>No regulatory tasks</Text>
            {isMgr && <Text style={s.emptyHint}>Tap + to add one</Text>}
          </View>
        }
        renderItem={({ item }) => {
          const cat = CATEGORIES[item.category] || CATEGORIES.general;
          const due = DUE_META[dueStatus(item)];
          return (
            <TouchableOpacity style={s.row} onPress={() => openDetail(item)} activeOpacity={0.7}>
              <View style={[s.catBar, { backgroundColor: cat.color }]} />
              <View style={s.body}>
                <Text style={s.title}>{item.title}</Text>
                <Text style={s.sub}>
                  {cat.label} · {freqMeta(item.frequency).label}
                  {item.next_due_date ? ` · Due ${fmt(item.next_due_date)}` : ''}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: due.color + '22' }]}>
                <Text style={[s.badgeText, { color: due.color }]}>{due.label}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <DetailModal
        item={detail} comps={comps} userName={userName} isMgr={isMgr}
        onClose={() => setDetail(null)}
        onEdit={() => { const it = detail; setDetail(null); setFormItem(it); }}
        onComplete={() => { const it = detail; setDetail(null); if (it) setCompleting(it); }}
      />

      <CompleteModal
        item={completing} myId={myId}
        onClose={() => setCompleting(null)}
        onDone={() => { setCompleting(null); load(); }}
      />

      <ItemForm
        item={formItem} people={people}
        onClose={() => setFormItem(null)}
        onDone={() => { setFormItem(null); load(); }}
      />
    </>
  );
}

// ── Detail + history ─────────────────────────────────────────────────────────

function DetailModal({ item, comps, userName, isMgr, onClose, onEdit, onComplete }: {
  item: Item | null; comps: Completion[]; userName: (id: string | null) => string; isMgr: boolean;
  onClose: () => void; onEdit: () => void; onComplete: () => void;
}) {
  if (!item) return null;
  const cat = CATEGORIES[item.category] || CATEGORIES.general;
  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
        <View style={f.hdr}>
          <TouchableOpacity onPress={onClose}><Text style={f.cancel}>Close</Text></TouchableOpacity>
          <Text style={f.hdrTitle} numberOfLines={1}>{item.title}</Text>
          {isMgr ? <TouchableOpacity onPress={onEdit}><Text style={f.save}>Edit</Text></TouchableOpacity> : <View style={{ width: 64 }} />}
        </View>
        <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          <View style={d.card}>
            <View style={[d.chip, { backgroundColor: cat.color + '22' }]}>
              <Text style={[d.chipTxt, { color: cat.color }]}>{cat.label}</Text>
            </View>
            <Text style={d.line}>Frequency: <Text style={d.bold}>{freqMeta(item.frequency).label}</Text></Text>
            <Text style={d.line}>Next due: <Text style={d.bold}>{fmt(item.next_due_date)}</Text></Text>
            {item.location ? <Text style={d.line}>Location: {item.location}</Text> : null}
            {item.assigned_to ? <Text style={d.line}>Owner: {userName(item.assigned_to)}</Text> : null}
            {item.regulatory_reference ? <Text style={d.line}>Reference: {item.regulatory_reference}</Text> : null}
            {item.description ? <Text style={[d.line, { marginTop: 6 }]}>{item.description}</Text> : null}
          </View>

          <TouchableOpacity style={d.bigBtn} onPress={onComplete}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.cream} style={{ marginRight: 8 }} />
            <Text style={d.bigBtnTxt}>Mark Complete</Text>
          </TouchableOpacity>

          <Text style={d.histHdr}>COMPLETION HISTORY</Text>
          {comps.length === 0
            ? <Text style={d.histEmpty}>No completions recorded yet.</Text>
            : comps.map(c => (
                <View key={c.id} style={d.histRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.greenMd} style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={d.histTitle}>{fmt(c.completed_date)} · {userName(c.completed_by)}</Text>
                    {c.notes ? <Text style={d.histSub}>{c.notes}</Text> : null}
                    {Array.isArray(c.attachments) && c.attachments.length > 0 && (
                      <Text style={d.histAtt}>📎 {c.attachments.length} attachment{c.attachments.length === 1 ? '' : 's'}</Text>
                    )}
                  </View>
                </View>
              ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Mark complete ────────────────────────────────────────────────────────────

function CompleteModal({ item, myId, onClose, onDone }: {
  item: Item | null; myId: string; onClose: () => void; onDone: () => void;
}) {
  const [date,      setDate]      = useState(todayStr());
  const [notes,     setNotes]     = useState('');
  const [atts,      setAtts]      = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!item) return;
    setDate(todayStr()); setNotes(''); setAtts([]);
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const nextDue = nextDueDate(item.frequency, date);

  const addPhoto = () => promptForPhoto(upload, { title: 'Add Attachment', onBusy: setUploading });

  const upload = async (base64: string) => {
    setUploading(true);
    try {
      const rand = Math.random().toString(36).slice(-6);
      const path = `compliance/${Date.now()}-${rand}.jpg`;
      const url = await uploadImageBase64('incident-photos', path, base64);
      setAtts(a => [...a, { url, path, name: `photo-${rand}.jpg` }]);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    }
    setUploading(false);
  };

  const removeAtt = (path: string) => {
    setAtts(a => a.filter(x => x.path !== path));
    supabase.storage.from('incident-photos').remove([path]);
  };

  const submit = async () => {
    if (!date) return Alert.alert('Required', 'Enter the completion date.');
    setSaving(true);
    const { error } = await supabase.from('compliance_completions').insert({
      item_id:        item.id,
      completed_by:   myId || null,
      completed_date: date,
      notes:          notes || null,
      next_due_date:  nextDue,
      attachments:    atts,
    });
    if (!error && nextDue) {
      await supabase.from('compliance_items')
        .update({ next_due_date: nextDue, updated_at: new Date().toISOString() }).eq('id', item.id);
    }
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    onDone();
  };

  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={f.hdr}>
            <TouchableOpacity onPress={onClose}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={f.hdrTitle}>Mark Complete</Text>
            <TouchableOpacity onPress={submit} disabled={saving}>
              <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>
            <Text style={d.toolName}>{item.title}</Text>

            <Text style={f.lbl}>COMPLETION DATE *</Text>
            <TextInput style={f.inp} value={date} onChangeText={setDate}
              placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

            <Text style={f.lbl}>NOTES</Text>
            <TextInput style={[f.inp, f.ta]} value={notes} onChangeText={setNotes}
              placeholder="What was done, reference numbers, who signed off…"
              placeholderTextColor={colors.muted} multiline numberOfLines={3} textAlignVertical="top" />

            <Text style={f.lbl}>ATTACHMENTS</Text>
            {atts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {atts.map(a => (
                  <View key={a.path} style={f.thumbWrap}>
                    <Image source={{ uri: a.url }} style={f.thumb} resizeMode="cover" />
                    <TouchableOpacity style={f.thumbRemove} onPress={() => removeAtt(a.path)}>
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

            <Text style={d.nextNote}>
              {nextDue
                ? `Next occurrence will be auto-set to ${fmt(nextDue)} (${freqMeta(item.frequency).label.toLowerCase()}).`
                : 'One-time task — no further occurrence will be scheduled.'}
            </Text>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Create / edit item ───────────────────────────────────────────────────────

function ItemForm({ item, people, onClose, onDone }: {
  item: Item | 'new' | null; people: Person[]; onClose: () => void; onDone: () => void;
}) {
  const editing = item && item !== 'new' ? (item as Item) : null;
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState('reporting');
  const [frequency, setFrequency] = useState('annual');
  const [nextDue,  setNextDue]  = useState('');
  const [location, setLocation] = useState('');
  const [assigned, setAssigned] = useState('');
  const [ref,      setRef]      = useState('');
  const [reminders, setReminders] = useState<number[]>([30, 7, 1]);
  const [description, setDescription] = useState('');
  const [pick,     setPick]     = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(editing?.title ?? '');
    setCategory(editing?.category ?? 'reporting');
    setFrequency(editing?.frequency ?? 'annual');
    setNextDue(editing?.next_due_date ?? '');
    setLocation(editing?.location ?? '');
    setAssigned(editing?.assigned_to ?? '');
    setRef(editing?.regulatory_reference ?? '');
    setReminders(editing?.reminder_days ?? [30, 7, 1]);
    setDescription(editing?.description ?? '');
    setPick(null);
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const toggleReminder = (n: number) =>
    setReminders(r => r.includes(n) ? r.filter(x => x !== n) : [...r, n].sort((a, b) => a - b));

  const save = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Enter a task title.');
    setSaving(true);
    const payload: Record<string, any> = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      frequency,
      assigned_to: assigned || null,
      next_due_date: nextDue || null,
      regulatory_reference: ref.trim() || null,
      location: location.trim() || null,
      reminder_days: reminders.length ? reminders : [30, 7, 1],
    };
    const { error } = editing
      ? await supabase.from('compliance_items').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('compliance_items').insert({ ...payload, is_active: true });
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    onDone();
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert('Delete Task', `Remove "${editing.title}"? Its completion history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('compliance_items')
            .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', editing.id);
          if (error) return Alert.alert('Error', error.message);
          onDone();
        },
      },
    ]);
  };

  const catName  = CATEGORIES[category]?.label ?? category;
  const freqName = freqMeta(frequency).label;
  const ownerName = people.find(p => p.id === assigned)?.name ?? 'Unassigned';

  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={f.hdr}>
            <TouchableOpacity onPress={onClose}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={f.hdrTitle}>{editing ? 'Edit Task' : 'New Task'}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>
            <Text style={f.lbl}>TASK TITLE *</Text>
            <TextInput style={f.inp} value={title} onChangeText={setTitle}
              placeholder="e.g. OSHA 300A posting, SPCC inspection" placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>CATEGORY</Text>
            <TouchableOpacity style={f.sel} onPress={() => setPick(p => p === 'cat' ? null : 'cat')}>
              <Text style={f.selVal}>{catName}</Text>
              <Ionicons name={pick === 'cat' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>
            {pick === 'cat' && (
              <View style={f.opts}>
                {Object.entries(CATEGORIES).map(([k, v], i, arr) => (
                  <TouchableOpacity key={k} style={[f.opt, i === arr.length - 1 && f.optLast]}
                    onPress={() => { setCategory(k); setPick(null); }}>
                    <Text style={f.optTxt}>{v.label}</Text>
                    {category === k && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={f.lbl}>FREQUENCY</Text>
            <TouchableOpacity style={f.sel} onPress={() => setPick(p => p === 'freq' ? null : 'freq')}>
              <Text style={f.selVal}>{freqName}</Text>
              <Ionicons name={pick === 'freq' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>
            {pick === 'freq' && (
              <View style={f.opts}>
                {Object.entries(FREQUENCIES).map(([k, v], i, arr) => (
                  <TouchableOpacity key={k} style={[f.opt, i === arr.length - 1 && f.optLast]}
                    onPress={() => { setFrequency(k); setPick(null); }}>
                    <Text style={f.optTxt}>{v.label}</Text>
                    {frequency === k && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={f.lbl}>NEXT DUE DATE</Text>
            <TextInput style={f.inp} value={nextDue} onChangeText={setNextDue}
              placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />

            <Text style={f.lbl}>LOCATION</Text>
            <TextInput style={f.inp} value={location} onChangeText={setLocation}
              placeholder="Yard / location (blank = all)" placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>OWNER</Text>
            <TouchableOpacity style={f.sel} onPress={() => setPick(p => p === 'owner' ? null : 'owner')}>
              <Text style={assigned ? f.selVal : f.selPh}>{ownerName}</Text>
              <Ionicons name={pick === 'owner' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>
            {pick === 'owner' && (
              <View style={f.opts}>
                <TouchableOpacity style={f.opt} onPress={() => { setAssigned(''); setPick(null); }}>
                  <Text style={[f.optTxt, { color: colors.muted }]}>Unassigned</Text>
                  {!assigned && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                </TouchableOpacity>
                {people.map((p, i) => (
                  <TouchableOpacity key={p.id} style={[f.opt, i === people.length - 1 && f.optLast]}
                    onPress={() => { setAssigned(p.id); setPick(null); }}>
                    <Text style={f.optTxt}>{p.name}</Text>
                    {assigned === p.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={f.lbl}>REMINDERS (DAYS BEFORE DUE)</Text>
            <View style={f.chips}>
              {REMINDER_OPTIONS.map(n => {
                const on = reminders.includes(n);
                return (
                  <TouchableOpacity key={n} style={[f.chip, on && f.chipOn]} onPress={() => toggleReminder(n)}>
                    <Text style={[f.chipTxt, on && f.chipTxtOn]}>{n}d</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={f.lbl}>REGULATORY REFERENCE</Text>
            <TextInput style={f.inp} value={ref} onChangeText={setRef}
              placeholder="e.g. 40 CFR 112, permit #" placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>DESCRIPTION / NOTES</Text>
            <TextInput style={[f.inp, f.ta]} value={description} onChangeText={setDescription}
              placeholder="What this task covers…" placeholderTextColor={colors.muted}
              multiline numberOfLines={3} textAlignVertical="top" />

            {editing && (
              <TouchableOpacity style={f.deleteBtn} onPress={remove}>
                <Ionicons name="trash-outline" size={16} color={colors.red} style={{ marginRight: 6 }} />
                <Text style={f.deleteTxt}>Delete Task</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border },
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 16 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingRight: 16, paddingVertical: 14 },
  catBar:    { width: 4, alignSelf: 'stretch', marginRight: 12 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

const d = StyleSheet.create({
  card:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, marginBottom: 16 },
  chip:      { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  chipTxt:   { fontSize: 12, fontWeight: '700' },
  line:      { fontSize: 14, color: colors.text, marginTop: 2 },
  bold:      { fontWeight: '700' },
  bigBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingVertical: 14, marginBottom: 24, backgroundColor: colors.greenMd },
  bigBtnTxt: { fontSize: 15, fontWeight: '700', color: colors.cream },
  toolName:  { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4, marginBottom: 4 },
  histHdr:   { fontSize: 11, fontWeight: '800', color: colors.greenMd, letterSpacing: 1.5, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  histEmpty: { fontSize: 13, color: colors.muted },
  histRow:   { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  histTitle: { fontSize: 14, color: colors.text, fontWeight: '600' },
  histSub:   { fontSize: 13, color: colors.muted, marginTop: 2 },
  histAtt:   { fontSize: 12, color: colors.greenMd, marginTop: 3 },
  nextNote:  { fontSize: 12, color: colors.muted, marginTop: 16, fontStyle: 'italic' },
});

const f = StyleSheet.create({
  hdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.greenDk, paddingHorizontal: 16, paddingVertical: 14 },
  hdrTitle: { fontSize: 15, fontWeight: '700', color: colors.cream, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  cancel:   { fontSize: 15, color: colors.greenLt, minWidth: 64 },
  save:     { fontSize: 15, fontWeight: '700', color: colors.cream, textAlign: 'right', minWidth: 64 },
  dim:      { opacity: 0.4 },
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
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surface },
  chipOn:   { backgroundColor: colors.greenMd, borderColor: colors.greenMd },
  chipTxt:  { fontSize: 13, fontWeight: '600', color: colors.muted },
  chipTxtOn:{ color: colors.cream },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.greenMd, borderRadius: 8, paddingVertical: 12, backgroundColor: colors.greenMd + '10' },
  photoBtnTxt: { fontSize: 14, fontWeight: '600', color: colors.greenMd },
  thumbWrap:   { position: 'relative', marginRight: 8 },
  thumb:       { width: 90, height: 70, borderRadius: 6 },
  thumbRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10 },
  deleteBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red + '55', backgroundColor: colors.red + '11' },
  deleteTxt:{ fontSize: 15, fontWeight: '600', color: colors.red },
});
