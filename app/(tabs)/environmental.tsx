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

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTS = [
  { value: 'waste_disposal',  label: 'Waste Disposal' },
  { value: 'air_quality',     label: 'Air Quality' },
  { value: 'stormwater',      label: 'Stormwater' },
  { value: 'spill_prevention',label: 'Spill Prevention' },
  { value: 'permit_renewal',  label: 'Permit Renewal' },
  { value: 'reporting',       label: 'Reporting' },
  { value: 'training',        label: 'Training' },
  { value: 'pcb',             label: 'PCB' },
  { value: 'general',         label: 'General' },
];

const FREQUENCY_OPTS = [
  { value: 'daily',       label: 'Daily' },
  { value: 'weekly',      label: 'Weekly' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual',      label: 'Annual' },
  { value: 'one_time',    label: 'One-Time' },
];

const CATEGORY_COLOR: Record<string, string> = {
  waste_disposal:   '#6B7280',
  air_quality:      '#3B82F6',
  stormwater:       '#0EA5E9',
  spill_prevention: '#F59E0B',
  permit_renewal:   '#8B5CF6',
  reporting:        '#10B981',
  training:         '#F97316',
  pcb:              '#DC2626',
  general:          '#9CA3AF',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplianceItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  frequency: string;
  assigned_to: string | null;
  next_due_date: string | null;
  regulatory_reference: string | null;
  notes: string | null;
  is_active: boolean;
  company_id: string;
  assignee?: { name: string } | null;
};

type Employee = { id: string; name: string };

type Draft = {
  title: string;
  category: string;
  frequency: string;
  next_due_date: string;
  assigned_to: string;
  description: string;
  regulatory_reference: string;
  notes: string;
};

type CompletionDraft = {
  completed_date: string;
  notes: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

function labelFor(opts: { value: string; label: string }[], val: string): string {
  return opts.find(o => o.value === val)?.label ?? val;
}

function dueDateColor(dateStr: string | null): string {
  if (!dateStr) return colors.muted;
  const diff = Math.ceil(
    (new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000,
  );
  if (diff < 0)  return colors.danger;
  if (diff <= 7) return '#F59E0B';
  return colors.text;
}

function calcNextDue(current: string | null, frequency: string): string | null {
  if (frequency === 'one_time') return current;
  const base = current ? new Date(current) : new Date();
  switch (frequency) {
    case 'daily':       base.setDate(base.getDate() + 1); break;
    case 'weekly':      base.setDate(base.getDate() + 7); break;
    case 'monthly':     base.setMonth(base.getMonth() + 1); break;
    case 'quarterly':   base.setMonth(base.getMonth() + 3); break;
    case 'semi_annual': base.setMonth(base.getMonth() + 6); break;
    case 'annual':      base.setFullYear(base.getFullYear() + 1); break;
  }
  return base.toISOString().split('T')[0];
}

const blankDraft = (): Draft => ({
  title: '', category: 'general', frequency: 'monthly', next_due_date: '',
  assigned_to: '', description: '', regulatory_reference: '', notes: '',
});

const blankCompletion = (): CompletionDraft => ({ completed_date: today(), notes: '' });

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EnvironmentalScreen() {
  const navigation = useNavigation();

  // List state
  const [items,      setItems]      = useState<ComplianceItem[]>([]);
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [companyId,  setCompanyId]  = useState<string | null>(null);
  const [userId,     setUserId]     = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // CRUD modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<ComplianceItem | null>(null);
  const [draft,      setDraft]      = useState<Draft>(blankDraft);
  const [saving,     setSaving]     = useState(false);
  const [pickField,  setPickField]  = useState<string | null>(null);

  // Completion modal state
  const [completionItem,  setCompletionItem]  = useState<ComplianceItem | null>(null);
  const [completionDraft, setCompletionDraft] = useState<CompletionDraft>(blankCompletion);
  const [completionSaving,setCompletionSaving]= useState(false);

  const showModal = showCreate || editItem !== null;

  // ── Header button ──
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => { setDraft(blankDraft()); setPickField(null); setShowCreate(true); }}
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.cream} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // ── Field setter ──
  const set = (key: keyof Draft) => (val: string) => setDraft(d => ({ ...d, [key]: val }));

  // ── Load items ──
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }
    setUserId(user.id);

    const { data: prof } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const cid = prof?.company_id ?? null;
    setCompanyId(cid);

    if (!cid) { setLoading(false); setRefreshing(false); return; }

    const { data } = await supabase
      .from('compliance_items')
      .select(`
        id, title, description, category, frequency, assigned_to,
        next_due_date, regulatory_reference, notes, is_active, company_id,
        assignee:profiles!compliance_items_assigned_to_fkey(name)
      `)
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('next_due_date', { ascending: true, nullsFirst: false });

    setItems((data as any[]) ?? []);

    // Load employees for pickers
    const { data: emps } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('company_id', cid)
      .order('name');
    setEmployees((emps as Employee[]) ?? []);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Open edit modal ──
  const openEdit = (item: ComplianceItem) => {
    setDraft({
      title:                item.title,
      category:             item.category,
      frequency:            item.frequency,
      next_due_date:        item.next_due_date ?? '',
      assigned_to:          item.assigned_to ?? '',
      description:          item.description ?? '',
      regulatory_reference: item.regulatory_reference ?? '',
      notes:                item.notes ?? '',
    });
    setPickField(null);
    setEditItem(item);
  };

  // ── Close modal ──
  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    setDraft(blankDraft());
    setPickField(null);
  };

  // ── Save (create or update) ──
  const handleSave = async () => {
    if (!draft.title.trim()) return Alert.alert('Required', 'Enter a title for this compliance item.');
    setSaving(true);

    const payload = {
      title:                draft.title.trim(),
      category:             draft.category,
      frequency:            draft.frequency,
      next_due_date:        draft.next_due_date || null,
      assigned_to:          draft.assigned_to || null,
      description:          draft.description.trim() || null,
      regulatory_reference: draft.regulatory_reference.trim() || null,
      notes:                draft.notes.trim() || null,
    };

    let error: any = null;

    if (editItem) {
      ({ error } = await supabase
        .from('compliance_items')
        .update(payload)
        .eq('id', editItem.id));
    } else {
      ({ error } = await supabase
        .from('compliance_items')
        .insert({ ...payload, company_id: companyId, is_active: true }));
    }

    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    closeModal();
    load();
  };

  // ── Soft delete ──
  const handleDelete = () => {
    if (!editItem) return;
    Alert.alert(
      'Delete Item',
      `Remove "${editItem.title}" from your compliance list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('compliance_items')
              .update({ is_active: false })
              .eq('id', editItem.id);
            if (error) return Alert.alert('Error', error.message);
            closeModal();
            load();
          },
        },
      ],
    );
  };

  // ── Record completion ──
  const openCompletion = (item: ComplianceItem) => {
    setCompletionItem(item);
    setCompletionDraft(blankCompletion());
  };

  const handleCompletion = async () => {
    if (!completionItem || !userId) return;
    setCompletionSaving(true);

    const { error: insErr } = await supabase
      .from('compliance_completions')
      .insert({
        item_id:        completionItem.id,
        completed_by:   userId,
        completed_date: completionDraft.completed_date || today(),
        notes:          completionDraft.notes.trim() || null,
      });

    if (insErr) {
      setCompletionSaving(false);
      return Alert.alert('Error', insErr.message);
    }

    // Update next_due_date (skip for one_time)
    if (completionItem.frequency !== 'one_time') {
      const nextDue = calcNextDue(
        completionDraft.completed_date || today(),
        completionItem.frequency,
      );
      await supabase
        .from('compliance_items')
        .update({ next_due_date: nextDue })
        .eq('id', completionItem.id);
    }

    setCompletionSaving(false);
    setCompletionItem(null);
    load();
  };

  // ─── Name helpers ──────────────────────────────────────────────────────────
  const empName = (id: string) =>
    employees.find(e => e.id === id)?.name ?? 'Select employee…';

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.greenMd} size="large" />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={items.length === 0 ? s.empty : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.greenMd}
          />
        }
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <Empty
            icon="leaf-outline"
            label="No compliance items"
            hint="Tap + to add your first item"
          />
        }
        renderItem={({ item }) => {
          const dateColor = dueDateColor(item.next_due_date);
          const catColor  = CATEGORY_COLOR[item.category] ?? colors.muted;
          const assigneeName = (item as any).assignee?.name ?? null;
          return (
            <TouchableOpacity style={s.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
              <View style={s.body}>
                {/* Top row: category badge + title */}
                <View style={s.titleRow}>
                  <View style={[s.catBadge, { backgroundColor: catColor + '22' }]}>
                    <Text style={[s.catText, { color: catColor }]}>
                      {labelFor(CATEGORY_OPTS, item.category)}
                    </Text>
                  </View>
                </View>
                <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                <Text style={s.sub}>
                  {labelFor(FREQUENCY_OPTS, item.frequency)}
                  {assigneeName ? ` · ${assigneeName}` : ''}
                </Text>
              </View>
              <View style={s.rightCol}>
                {item.next_due_date ? (
                  <Text style={[s.dueDate, { color: dateColor }]}>
                    {new Date(item.next_due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                  </Text>
                ) : (
                  <Text style={[s.dueDate, { color: colors.muted }]}>No date</Text>
                )}
                <TouchableOpacity
                  style={s.completeBtn}
                  onPress={() => openCompletion(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.greenMd} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── CRUD Modal ────────────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={f.hdr}>
              <TouchableOpacity onPress={closeModal}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>{editItem ? 'Edit Item' : 'New Item'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={f.scroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={f.sc}
            >
              {/* Title */}
              <Text style={f.lbl}>TITLE *</Text>
              <TextInput
                style={f.inp}
                value={draft.title}
                onChangeText={set('title')}
                placeholder="e.g. Monthly Waste Manifest Review"
                placeholderTextColor={colors.muted}
              />

              {/* Category */}
              <Text style={f.lbl}>CATEGORY</Text>
              <TouchableOpacity
                style={f.sel}
                onPress={() => setPickField(p => p === 'category' ? null : 'category')}
              >
                <Text style={f.selVal}>{labelFor(CATEGORY_OPTS, draft.category)}</Text>
                <Ionicons
                  name={pickField === 'category' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.muted}
                />
              </TouchableOpacity>
              {pickField === 'category' && (
                <View style={f.opts}>
                  {CATEGORY_OPTS.map((o, i) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[f.opt, i === CATEGORY_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('category')(o.value); setPickField(null); }}
                    >
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.category === o.value && (
                        <Ionicons name="checkmark" size={16} color={colors.greenMd} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Frequency */}
              <Text style={f.lbl}>FREQUENCY</Text>
              <TouchableOpacity
                style={f.sel}
                onPress={() => setPickField(p => p === 'frequency' ? null : 'frequency')}
              >
                <Text style={f.selVal}>{labelFor(FREQUENCY_OPTS, draft.frequency)}</Text>
                <Ionicons
                  name={pickField === 'frequency' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.muted}
                />
              </TouchableOpacity>
              {pickField === 'frequency' && (
                <View style={f.opts}>
                  {FREQUENCY_OPTS.map((o, i) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[f.opt, i === FREQUENCY_OPTS.length - 1 && f.optLast]}
                      onPress={() => { set('frequency')(o.value); setPickField(null); }}
                    >
                      <Text style={f.optTxt}>{o.label}</Text>
                      {draft.frequency === o.value && (
                        <Ionicons name="checkmark" size={16} color={colors.greenMd} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Next Due Date */}
              <Text style={f.lbl}>NEXT DUE DATE</Text>
              <TextInput
                style={f.inp}
                value={draft.next_due_date}
                onChangeText={set('next_due_date')}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />

              {/* Assigned To */}
              <Text style={f.lbl}>ASSIGNED TO</Text>
              <TouchableOpacity
                style={f.sel}
                onPress={() => setPickField(p => p === 'assigned_to' ? null : 'assigned_to')}
              >
                <Text style={draft.assigned_to ? f.selVal : f.selPh}>
                  {draft.assigned_to ? empName(draft.assigned_to) : 'Select employee…'}
                </Text>
                <Ionicons
                  name={pickField === 'assigned_to' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.muted}
                />
              </TouchableOpacity>
              {pickField === 'assigned_to' && (
                <View style={f.opts}>
                  <TouchableOpacity
                    style={f.opt}
                    onPress={() => { set('assigned_to')(''); setPickField(null); }}
                  >
                    <Text style={[f.optTxt, { color: colors.muted }]}>None</Text>
                    {!draft.assigned_to && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                  {employees.length === 0 ? (
                    <View style={[f.opt, f.optLast]}>
                      <Text style={[f.optTxt, { color: colors.muted }]}>No employees found</Text>
                    </View>
                  ) : (
                    employees.map((e, i) => (
                      <TouchableOpacity
                        key={e.id}
                        style={[f.opt, i === employees.length - 1 && f.optLast]}
                        onPress={() => { set('assigned_to')(e.id); setPickField(null); }}
                      >
                        <Text style={f.optTxt}>{e.name}</Text>
                        {draft.assigned_to === e.id && (
                          <Ionicons name="checkmark" size={16} color={colors.greenMd} />
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* Description */}
              <Text style={f.lbl}>DESCRIPTION</Text>
              <TextInput
                style={[f.inp, f.multiline]}
                value={draft.description}
                onChangeText={set('description')}
                placeholder="What does this compliance task involve?"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Regulatory Reference */}
              <Text style={f.lbl}>REGULATORY REFERENCE</Text>
              <TextInput
                style={f.inp}
                value={draft.regulatory_reference}
                onChangeText={set('regulatory_reference')}
                placeholder="e.g. 40 CFR Part 262, RCRA"
                placeholderTextColor={colors.muted}
              />

              {/* Notes */}
              <Text style={f.lbl}>NOTES</Text>
              <TextInput
                style={[f.inp, f.multiline]}
                value={draft.notes}
                onChangeText={set('notes')}
                placeholder="Additional notes or instructions"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Delete button (edit only) */}
              {editItem && (
                <TouchableOpacity style={f.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={f.deleteTxt}>Delete Item</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Record Completion Modal ────────────────────────────────────────── */}
      <Modal
        visible={completionItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCompletionItem(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={f.hdr}>
              <TouchableOpacity onPress={() => setCompletionItem(null)}>
                <Text style={f.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={f.hdrTitle}>Record Completion</Text>
              <TouchableOpacity onPress={handleCompletion} disabled={completionSaving}>
                <Text style={[f.save, completionSaving && f.dim]}>
                  {completionSaving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={f.scroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={f.sc}
            >
              {completionItem && (
                <View style={m.itemCard}>
                  <View style={[m.catDot, { backgroundColor: CATEGORY_COLOR[completionItem.category] ?? colors.muted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={m.itemTitle}>{completionItem.title}</Text>
                    <Text style={m.itemSub}>{labelFor(CATEGORY_OPTS, completionItem.category)}</Text>
                  </View>
                </View>
              )}

              <Text style={f.lbl}>COMPLETION DATE</Text>
              <TextInput
                style={f.inp}
                value={completionDraft.completed_date}
                onChangeText={v => setCompletionDraft(d => ({ ...d, completed_date: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={f.lbl}>NOTES</Text>
              <TextInput
                style={[f.inp, f.multiline]}
                value={completionDraft.notes}
                onChangeText={v => setCompletionDraft(d => ({ ...d, notes: v }))}
                placeholder="What was completed, any observations…"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {completionItem && completionItem.frequency !== 'one_time' && (
                <View style={m.nextDueNote}>
                  <Ionicons name="calendar-outline" size={15} color={colors.greenMd} style={{ marginRight: 6 }} />
                  <Text style={m.nextDueTxt}>
                    Next due date will advance to{' '}
                    <Text style={{ fontWeight: '700' }}>
                      {calcNextDue(
                        completionDraft.completed_date || today(),
                        completionItem.frequency,
                      ) ?? '—'}
                    </Text>
                  </Text>
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function Empty({
  icon, label, hint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
}) {
  return (
    <View style={s.emptyWrap}>
      <Ionicons name={icon} size={44} color={colors.border} />
      <Text style={s.emptyText}>{label}</Text>
      {hint && <Text style={s.emptyHint}>{hint}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  list:      { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty:     { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.border },
  sep:       { height: 1, backgroundColor: colors.border },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  body:      { flex: 1 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  rightCol:  { alignItems: 'flex-end', gap: 6, marginLeft: 12, minWidth: 72 },
  dueDate:   { fontSize: 12, fontWeight: '600', textAlign: 'right' },

  catBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 6,
    alignSelf: 'flex-start',
  },
  catText: { fontSize: 10, fontWeight: '700' },

  completeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  multiline:{ minHeight: 80, paddingTop: 12 },
  sel:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  selVal:   { fontSize: 15, color: colors.text, flex: 1 },
  selPh:    { fontSize: 15, color: colors.muted, flex: 1 },
  opts:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 2, overflow: 'hidden' },
  opt:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optLast:  { borderBottomWidth: 0 },
  optTxt:   { fontSize: 15, color: colors.text, flex: 1 },
  deleteBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '66', backgroundColor: colors.danger + '0D' },
  deleteTxt:{ fontSize: 14, fontWeight: '600', color: colors.danger },
});

const m = StyleSheet.create({
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  catDot:    { width: 10, height: 10, borderRadius: 5 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  itemSub:   { fontSize: 12, color: colors.muted },
  nextDueNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    padding: 12,
    backgroundColor: colors.greenMd + '11',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.greenMd + '33',
  },
  nextDueTxt: { fontSize: 13, color: colors.greenDk, flex: 1, lineHeight: 18 },
});
