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

// ── Types & constants ────────────────────────────────────────────────────────

type Tool = {
  id: string; name: string; asset_tag: string | null; category: string | null;
  status: string; holder_id: string | null; location: string | null;
  condition: string | null; notes: string | null;
};
type Txn = {
  id: string; tool_id: string; action: string; holder_id: string | null;
  location: string | null; condition: string | null; notes: string | null;
  performed_by: string | null; created_at: string;
};
type Person = { id: string; name: string };

const CONDITIONS = ['Good', 'Fair', 'Needs Attention', 'Damaged'];

const MGR_ROLES = ['admin', 'safety_manager', 'manager'];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ToolsScreen() {
  const navigation = useNavigation();
  const [tools,      setTools]      = useState<Tool[]>([]);
  const [people,     setPeople]     = useState<Person[]>([]);
  const [myId,       setMyId]       = useState<string>('');
  const [isMgr,      setIsMgr]      = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  // detail + action + form modal state
  const [detail,  setDetail]  = useState<Tool | null>(null);
  const [history, setHistory] = useState<Txn[]>([]);
  const [action,  setAction]  = useState<{ tool: Tool; dir: 'check_out' | 'check_in' } | null>(null);
  const [formTool, setFormTool] = useState<Tool | 'new' | null>(null);

  const userName = (id: string | null) => people.find(p => p.id === id)?.name ?? 'Unknown';

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setMyId(user.id);
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setIsMgr(MGR_ROLES.includes((prof as any)?.role));
    }
    const [{ data: tl }, { data: ppl }] = await Promise.all([
      supabase.from('tools').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id, name').eq('is_active', true).order('name'),
    ]);
    setTools((tl as Tool[]) ?? []);
    setPeople((ppl as Person[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isMgr ? (
          <TouchableOpacity onPress={() => setFormTool('new')} style={{ paddingHorizontal: 8 }}>
            <Ionicons name="add" size={26} color={colors.cream} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, isMgr]);

  const openDetail = async (tool: Tool) => {
    setDetail(tool);
    setHistory([]);
    const { data } = await supabase.from('tool_transactions').select('*')
      .eq('tool_id', tool.id).order('created_at', { ascending: false }).limit(50);
    setHistory((data as Txn[]) ?? []);
  };

  const filtered = tools.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.asset_tag, t.category, userName(t.holder_id)]
      .some(v => (v ?? '').toLowerCase().includes(q));
  });

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <>
      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search tool, tag, category, or who has it…"
          placeholderTextColor={colors.muted}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        style={s.list}
        contentContainerStyle={filtered.length === 0 ? s.empty : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.greenMd} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="build-outline" size={44} color={colors.border} />
            <Text style={s.emptyText}>No tools yet</Text>
            {isMgr && <Text style={s.emptyHint}>Tap + to add one</Text>}
          </View>
        }
        renderItem={({ item }) => {
          const out = item.status === 'checked_out';
          return (
            <View style={s.row}>
              <TouchableOpacity style={s.rowMain} onPress={() => openDetail(item)} activeOpacity={0.7}>
                <View style={[s.dot, { backgroundColor: out ? '#F59E0B' : colors.greenMd }]} />
                <View style={s.body}>
                  <Text style={s.title}>{item.name}</Text>
                  <Text style={s.sub}>
                    {out ? `With ${userName(item.holder_id)}` : (item.location || 'Shop')}
                    {item.asset_tag ? ` · ${item.asset_tag}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actBtn, out ? s.actIn : s.actOut]}
                onPress={() => setAction({ tool: item, dir: out ? 'check_in' : 'check_out' })}
              >
                <Text style={[s.actTxt, out ? { color: colors.greenMd } : { color: colors.cream }]}>
                  {out ? 'Check In' : 'Check Out'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {/* Detail + history */}
      <DetailModal
        tool={detail} history={history} userName={userName} isMgr={isMgr}
        onClose={() => setDetail(null)}
        onEdit={() => { const t = detail; setDetail(null); setFormTool(t); }}
        onAction={(dir) => { const t = detail; setDetail(null); if (t) setAction({ tool: t, dir }); }}
      />

      {/* Check in / out */}
      <ActionModal
        action={action} people={people} myId={myId}
        onClose={() => setAction(null)}
        onDone={() => { setAction(null); load(); }}
      />

      {/* Add / edit tool (managers) */}
      <ToolForm
        tool={formTool}
        onClose={() => setFormTool(null)}
        onDone={() => { setFormTool(null); load(); }}
      />
    </>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ tool, history, userName, isMgr, onClose, onEdit, onAction }: {
  tool: Tool | null; history: Txn[]; userName: (id: string | null) => string; isMgr: boolean;
  onClose: () => void; onEdit: () => void; onAction: (dir: 'check_out' | 'check_in') => void;
}) {
  if (!tool) return null;
  const out = tool.status === 'checked_out';
  return (
    <Modal visible={!!tool} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
        <View style={f.hdr}>
          <TouchableOpacity onPress={onClose}><Text style={f.cancel}>Close</Text></TouchableOpacity>
          <Text style={f.hdrTitle} numberOfLines={1}>{tool.name}</Text>
          {isMgr ? <TouchableOpacity onPress={onEdit}><Text style={f.save}>Edit</Text></TouchableOpacity> : <View style={{ width: 64 }} />}
        </View>
        <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          <View style={[d.statusCard, { borderColor: out ? '#F59E0B' : colors.greenMd }]}>
            <Text style={[d.statusLabel, { color: out ? '#B45309' : colors.greenMd }]}>
              {out ? 'CHECKED OUT' : 'AVAILABLE'}
            </Text>
            {out && <Text style={d.statusLine}>With <Text style={d.bold}>{userName(tool.holder_id)}</Text></Text>}
            {tool.location ? <Text style={d.statusLine}>📍 {tool.location}</Text> : null}
            {tool.condition ? <Text style={d.statusLine}>Condition: <Text style={d.bold}>{tool.condition}</Text></Text> : null}
            {tool.asset_tag ? <Text style={d.statusLine}>Tag: {tool.asset_tag}</Text> : null}
            {tool.category ? <Text style={d.statusLine}>Category: {tool.category}</Text> : null}
            {tool.notes ? <Text style={[d.statusLine, { marginTop: 6 }]}>{tool.notes}</Text> : null}
          </View>

          <TouchableOpacity
            style={[d.bigBtn, out ? { backgroundColor: colors.surface, borderColor: colors.greenMd, borderWidth: 1 } : { backgroundColor: colors.greenMd }]}
            onPress={() => onAction(out ? 'check_in' : 'check_out')}
          >
            <Ionicons name={out ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'} size={18}
              color={out ? colors.greenMd : colors.cream} style={{ marginRight: 8 }} />
            <Text style={[d.bigBtnTxt, { color: out ? colors.greenMd : colors.cream }]}>
              {out ? 'Check In' : 'Check Out'}
            </Text>
          </TouchableOpacity>

          <Text style={d.histHdr}>HISTORY</Text>
          {history.length === 0
            ? <Text style={d.histEmpty}>No activity yet.</Text>
            : history.map(tx => {
                const isOut = tx.action === 'check_out';
                return (
                  <View key={tx.id} style={d.histRow}>
                    <Ionicons name={isOut ? 'arrow-up-circle' : 'arrow-down-circle'} size={18}
                      color={isOut ? '#F59E0B' : colors.greenMd} style={{ marginRight: 10, marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={d.histTitle}>
                        {isOut ? <>To {userName(tx.holder_id)}</> : 'Returned'}
                        {tx.location ? ` · ${tx.location}` : ''}
                      </Text>
                      <Text style={d.histSub}>
                        {new Date(tx.created_at).toLocaleString()}
                        {tx.condition ? ` · ${tx.condition}` : ''}
                      </Text>
                      {tx.notes ? <Text style={d.histNotes}>{tx.notes}</Text> : null}
                    </View>
                  </View>
                );
              })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Check in / out modal ─────────────────────────────────────────────────────

function ActionModal({ action, people, myId, onClose, onDone }: {
  action: { tool: Tool; dir: 'check_out' | 'check_in' } | null;
  people: Person[]; myId: string; onClose: () => void; onDone: () => void;
}) {
  const isOut = action?.dir === 'check_out';
  const [holder,    setHolder]    = useState('');
  const [location,  setLocation]  = useState('');
  const [condition, setCondition] = useState('Good');
  const [notes,     setNotes]     = useState('');
  const [pick,      setPick]      = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!action) return;
    setHolder(isOut ? myId : '');
    setLocation(isOut ? '' : 'Shop');
    setCondition(action.tool.condition || 'Good');
    setNotes('');
    setPick(null);
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!action) return null;

  const submit = async () => {
    if (isOut && !holder) return Alert.alert('Required', 'Choose who is taking the tool.');
    setSaving(true);
    const { error } = await supabase.rpc('tool_checkinout', {
      p_tool_id:   action.tool.id,
      p_action:    action.dir,
      p_holder:    isOut ? holder : null,
      p_location:  location || null,
      p_condition: condition || null,
      p_notes:     notes || null,
    });
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    onDone();
  };

  const holderName = people.find(p => p.id === holder)?.name ?? 'Select person…';

  return (
    <Modal visible={!!action} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={f.hdr}>
            <TouchableOpacity onPress={onClose}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={f.hdrTitle}>{isOut ? 'Check Out' : 'Check In'}</Text>
            <TouchableOpacity onPress={submit} disabled={saving}>
              <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>
            <Text style={d.toolName}>{action.tool.name}</Text>

            {isOut && (
              <>
                <Text style={f.lbl}>WHO IS TAKING IT *</Text>
                <TouchableOpacity style={f.sel} onPress={() => setPick(p => p === 'holder' ? null : 'holder')}>
                  <Text style={holder ? f.selVal : f.selPh}>{holderName}</Text>
                  <Ionicons name={pick === 'holder' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                </TouchableOpacity>
                {pick === 'holder' && (
                  <View style={f.opts}>
                    {people.map((p, i) => (
                      <TouchableOpacity key={p.id} style={[f.opt, i === people.length - 1 && f.optLast]}
                        onPress={() => { setHolder(p.id); setPick(null); }}>
                        <Text style={f.optTxt}>{p.name}{p.id === myId ? ' (me)' : ''}</Text>
                        {holder === p.id && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <Text style={f.lbl}>LOCATION</Text>
            <TextInput style={f.inp} value={location} onChangeText={setLocation}
              placeholder={isOut ? 'e.g. Jobsite — 5th & Main' : 'e.g. Shop'} placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>CONDITION</Text>
            <TouchableOpacity style={f.sel} onPress={() => setPick(p => p === 'cond' ? null : 'cond')}>
              <Text style={f.selVal}>{condition}</Text>
              <Ionicons name={pick === 'cond' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>
            {pick === 'cond' && (
              <View style={f.opts}>
                {CONDITIONS.map((c, i) => (
                  <TouchableOpacity key={c} style={[f.opt, i === CONDITIONS.length - 1 && f.optLast]}
                    onPress={() => { setCondition(c); setPick(null); }}>
                    <Text style={f.optTxt}>{c}</Text>
                    {condition === c && <Ionicons name="checkmark" size={16} color={colors.greenMd} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={f.lbl}>NOTES</Text>
            <TextInput style={[f.inp, f.ta]} value={notes} onChangeText={setNotes}
              placeholder="Anything worth noting about the tool's condition or use."
              placeholderTextColor={colors.muted} multiline numberOfLines={3} textAlignVertical="top" />

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Add / edit tool form ─────────────────────────────────────────────────────

function ToolForm({ tool, onClose, onDone }: {
  tool: Tool | 'new' | null; onClose: () => void; onDone: () => void;
}) {
  const editing = tool && tool !== 'new' ? (tool as Tool) : null;
  const [name,     setName]     = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [category, setCategory] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!tool) return;
    setName(editing?.name ?? '');
    setAssetTag(editing?.asset_tag ?? '');
    setCategory(editing?.category ?? '');
    setNotes(editing?.notes ?? '');
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tool) return null;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Enter a tool name.');
    setSaving(true);
    const payload: Record<string, any> = {
      name: name.trim(),
      asset_tag: assetTag.trim() || null,
      category: category.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from('tools').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('tools').insert({ ...payload, location: 'Shop' });
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    onDone();
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert('Delete Tool', `Remove "${editing.name}"? Its history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('tools')
            .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', editing.id);
          if (error) return Alert.alert('Error', error.message);
          onDone();
        },
      },
    ]);
  };

  return (
    <Modal visible={!!tool} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.greenDk }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={f.hdr}>
            <TouchableOpacity onPress={onClose}><Text style={f.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={f.hdrTitle}>{editing ? 'Edit Tool' : 'Add Tool'}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              <Text style={[f.save, saving && f.dim]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={f.sc}>
            <Text style={f.lbl}>TOOL NAME *</Text>
            <TextInput style={f.inp} value={name} onChangeText={setName}
              placeholder="e.g. Hilti TE 1000-AVR Breaker" placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>ASSET TAG</Text>
            <TextInput style={f.inp} value={assetTag} onChangeText={setAssetTag}
              placeholder="e.g. RCG-0142" placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>CATEGORY</Text>
            <TextInput style={f.inp} value={category} onChangeText={setCategory}
              placeholder="e.g. Demolition, Survey, Power" placeholderTextColor={colors.muted} />

            <Text style={f.lbl}>NOTES</Text>
            <TextInput style={[f.inp, f.ta]} value={notes} onChangeText={setNotes}
              placeholder="Accessories, storage location, anything crews should know."
              placeholderTextColor={colors.muted} multiline numberOfLines={3} textAlignVertical="top" />

            {editing && (
              <TouchableOpacity style={f.deleteBtn} onPress={remove}>
                <Ionicons name="trash-outline" size={16} color={colors.red} style={{ marginRight: 6 }} />
                <Text style={f.deleteTxt}>Delete Tool</Text>
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
  searchWrap:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput:{ flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  sep:       { height: 1, backgroundColor: colors.border, marginLeft: 42 },
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  rowMain:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot:       { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
  body:      { flex: 1 },
  title:     { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:       { fontSize: 12, color: colors.muted },
  actBtn:    { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 8 },
  actOut:    { backgroundColor: colors.greenMd },
  actIn:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.greenMd },
  actTxt:    { fontSize: 12, fontWeight: '700' },
});

const d = StyleSheet.create({
  statusCard:  { backgroundColor: colors.surface, borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 16 },
  statusLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  statusLine:  { fontSize: 14, color: colors.text, marginTop: 2 },
  bold:        { fontWeight: '700' },
  bigBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingVertical: 14, marginBottom: 24 },
  bigBtnTxt:   { fontSize: 15, fontWeight: '700' },
  toolName:    { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4, marginBottom: 4 },
  histHdr:     { fontSize: 11, fontWeight: '800', color: colors.greenMd, letterSpacing: 1.5, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  histEmpty:   { fontSize: 13, color: colors.muted },
  histRow:     { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  histTitle:   { fontSize: 14, color: colors.text, fontWeight: '600' },
  histSub:     { fontSize: 12, color: colors.muted, marginTop: 2 },
  histNotes:   { fontSize: 13, color: colors.text, marginTop: 4, fontStyle: 'italic' },
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
  deleteBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.red + '55', backgroundColor: colors.red + '11' },
  deleteTxt:{ fontSize: 15, fontWeight: '600', color: colors.red },
});
