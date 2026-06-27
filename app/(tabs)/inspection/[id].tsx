import { useEffect, useState, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type QResult = 'pass' | 'fail' | 'na' | null;
type IQuestion = { id: string; text: string; result: QResult; note: string; photos: string[] };
type ISection  = { id: string; name: string; enabled: boolean; notes: string; photos: string[]; questions: IQuestion[] };

const DEFAULTS: ISection[] = [
  {
    id: 's1', name: 'General Site Conditions', enabled: true, notes: '', photos: [],
    questions: [
      { id: 's1_q0', text: 'Walkways and aisles are clear and properly marked', result: null, note: '', photos: [] },
      { id: 's1_q1', text: 'Adequate lighting in all work areas', result: null, note: '', photos: [] },
      { id: 's1_q2', text: 'Safety signage is posted and visible', result: null, note: '', photos: [] },
      { id: 's1_q3', text: 'Housekeeping standards are maintained', result: null, note: '', photos: [] },
    ],
  },
  {
    id: 's2', name: 'Personal Protective Equipment', enabled: true, notes: '', photos: [],
    questions: [
      { id: 's2_q0', text: 'Required PPE is available and in good condition', result: null, note: '', photos: [] },
      { id: 's2_q1', text: 'Employees are wearing appropriate PPE for their tasks', result: null, note: '', photos: [] },
      { id: 's2_q2', text: 'PPE storage areas are organized and accessible', result: null, note: '', photos: [] },
    ],
  },
  {
    id: 's3', name: 'Equipment & Machinery', enabled: true, notes: '', photos: [],
    questions: [
      { id: 's3_q0', text: 'Equipment is in good working condition', result: null, note: '', photos: [] },
      { id: 's3_q1', text: 'Guards and safety devices are in place and functional', result: null, note: '', photos: [] },
      { id: 's3_q2', text: 'Pre-operation inspections are being completed', result: null, note: '', photos: [] },
      { id: 's3_q3', text: 'No unauthorized modifications to equipment', result: null, note: '', photos: [] },
    ],
  },
  {
    id: 's4', name: 'Fire Prevention', enabled: true, notes: '', photos: [],
    questions: [
      { id: 's4_q0', text: 'Fire extinguishers are accessible, charged, and not expired', result: null, note: '', photos: [] },
      { id: 's4_q1', text: 'Emergency exits are clear and properly marked', result: null, note: '', photos: [] },
      { id: 's4_q2', text: 'Electrical panels are unobstructed (36" clearance)', result: null, note: '', photos: [] },
      { id: 's4_q3', text: 'No combustible materials stored near heat sources', result: null, note: '', photos: [] },
    ],
  },
  {
    id: 's5', name: 'Material Handling & Storage', enabled: true, notes: '', photos: [],
    questions: [
      { id: 's5_q0', text: 'Scrap piles are within safe height limits and stable', result: null, note: '', photos: [] },
      { id: 's5_q1', text: 'No overhead hazards from unstable materials', result: null, note: '', photos: [] },
      { id: 's5_q2', text: 'Crushing and shearing zones are properly guarded', result: null, note: '', photos: [] },
      { id: 's5_q3', text: 'Vehicle traffic routes are clearly marked', result: null, note: '', photos: [] },
    ],
  },
  {
    id: 's6', name: 'Environmental Compliance', enabled: false, notes: '', photos: [],
    questions: [
      { id: 's6_q0', text: 'Spill containment equipment is in place', result: null, note: '', photos: [] },
      { id: 's6_q1', text: 'Fluids and hazardous materials are properly stored', result: null, note: '', photos: [] },
      { id: 's6_q2', text: 'No visible oil or fuel leaks on ground', result: null, note: '', photos: [] },
      { id: 's6_q3', text: 'Waste disposal procedures are being followed', result: null, note: '', photos: [] },
    ],
  },
];

function calcScore(sections: ISection[]): number | null {
  const qs = sections.filter(s => s.enabled).flatMap(s => s.questions);
  const answered = qs.filter(q => q.result === 'pass' || q.result === 'fail');
  if (!answered.length) return null;
  return Math.round(answered.filter(q => q.result === 'pass').length / answered.length * 100);
}

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [title,     setTitle]     = useState('');
  const [date,      setDate]      = useState('');
  const [location,  setLocation]  = useState('');
  const [status,    setStatus]    = useState<'draft' | 'complete'>('draft');
  const [sections,  setSections]  = useState<ISection[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('inspections')
        .select('title, date, location, status, sections')
        .eq('id', id as string)
        .single();
      if (data) {
        setTitle(data.title ?? '');
        setDate(data.date ?? '');
        setLocation(data.location ?? '');
        setStatus((data.status ?? 'draft') as 'draft' | 'complete');
        const secs = data.sections;
        setSections(Array.isArray(secs) && secs.length > 0 ? (secs as ISection[]) : DEFAULTS);
      }
      setLoading(false);
    })();
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => handleSave()} style={{ paddingHorizontal: 8 }} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={colors.cream} />
            : <Text style={{ color: colors.cream, fontWeight: '700', fontSize: 15 }}>Save</Text>}
        </TouchableOpacity>
      ),
    });
  }, [navigation, saving, title, date, location, sections]);

  const score       = calcScore(sections);
  const totalQ      = sections.filter(s => s.enabled).flatMap(s => s.questions).length;
  const answeredQ   = sections.filter(s => s.enabled).flatMap(s => s.questions)
    .filter(q => q.result === 'pass' || q.result === 'fail').length;

  const toggleSection = (sId: string) =>
    setSections(p => p.map(s => s.id === sId ? { ...s, enabled: !s.enabled } : s));

  const setSectionNote = (sId: string, note: string) =>
    setSections(p => p.map(s => s.id === sId ? { ...s, notes: note } : s));

  const setResult = (sId: string, qId: string, r: QResult) =>
    setSections(p => p.map(s => s.id !== sId ? s : {
      ...s,
      questions: s.questions.map(q => q.id !== qId ? q : { ...q, result: q.result === r ? null : r }),
    }));

  const setQNote = (sId: string, qId: string, note: string) =>
    setSections(p => p.map(s => s.id !== sId ? s : {
      ...s,
      questions: s.questions.map(q => q.id !== qId ? q : { ...q, note }),
    }));

  const toggleNote = (qId: string) =>
    setOpenNotes(p => { const n = new Set(p); n.has(qId) ? n.delete(qId) : n.add(qId); return n; });

  const pickPhoto = async (sId: string, qId: string) => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo', onPress: async () => {
          const { status: ps } = await ImagePicker.requestCameraPermissionsAsync();
          if (ps !== 'granted') return Alert.alert('Permission Required', 'Camera access is needed to take photos.');
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.7 });
          if (!res.canceled && res.assets[0]) uploadPhoto(sId, qId, res.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library', onPress: async () => {
          const { status: ls } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (ls !== 'granted') return Alert.alert('Permission Required', 'Photo library access is needed.');
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.7 });
          if (!res.canceled && res.assets[0]) uploadPhoto(sId, qId, res.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (sId: string, qId: string, uri: string) => {
    setUploading(qId);
    try {
      const ext  = (uri.split('.').pop() ?? 'jpg').split('?')[0];
      const rand = Math.random().toString(36).slice(-6);
      const path = `inspections/${id}/${Date.now()}-${rand}.${ext}`;
      const blob = await (await fetch(uri)).blob();
      const { error } = await supabase.storage.from('inspection-photos').upload(path, blob, { contentType: `image/${ext}` });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(path);
      setSections(p => p.map(s => s.id !== sId ? s : {
        ...s,
        questions: s.questions.map(q => q.id !== qId ? q : { ...q, photos: [...q.photos, publicUrl] }),
      }));
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    }
    setUploading(null);
  };

  const handleSave = async (complete?: boolean) => {
    setSaving(true);
    const sc = calcScore(sections);
    const updates: Record<string, any> = { title, date: date || null, location: location || null, sections, score: sc };
    if (complete) { updates.status = 'complete'; updates.completed_at = new Date().toISOString(); }
    const { error } = await supabase.from('inspections').update(updates).eq('id', id as string);
    setSaving(false);
    if (error) return Alert.alert('Error', error.message);
    if (complete) {
      Alert.alert('Inspection Complete', `Saved with a score of ${sc ?? '—'}%`);
      router.back();
    }
  };

  if (loading) return <View style={st.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;

  return (
    <ScrollView style={st.container} keyboardShouldPersistTaps="handled" contentContainerStyle={st.content}>

      {/* Score banner */}
      {score !== null && (
        <View style={[st.scoreBanner, { backgroundColor: score >= 80 ? colors.greenMd : score >= 60 ? '#F59E0B' : colors.red }]}>
          <Text style={st.scoreNum}>{score}%</Text>
          <Text style={st.scoreSub}>{answeredQ} of {totalQ} answered</Text>
        </View>
      )}

      {/* Metadata */}
      <View style={st.metaCard}>
        <Text style={st.metaLbl}>TITLE</Text>
        <TextInput style={st.metaInp} value={title} onChangeText={setTitle}
          placeholder="Inspection title" placeholderTextColor={colors.muted} />
        <Text style={[st.metaLbl, { marginTop: 12 }]}>DATE</Text>
        <TextInput style={st.metaInp} value={date} onChangeText={setDate}
          placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation" />
        <Text style={[st.metaLbl, { marginTop: 12 }]}>LOCATION</Text>
        <TextInput style={st.metaInp} value={location} onChangeText={setLocation}
          placeholder="Location or area" placeholderTextColor={colors.muted} />
      </View>

      {/* Sections */}
      {sections.map(section => (
        <SectionCard
          key={section.id}
          section={section}
          openNotes={openNotes}
          uploadingQId={uploading}
          onToggle={() => toggleSection(section.id)}
          onSetResult={(qId, r) => setResult(section.id, qId, r)}
          onSetNote={(qId, n) => setQNote(section.id, qId, n)}
          onToggleNote={toggleNote}
          onPickPhoto={qId => pickPhoto(section.id, qId)}
          onSectionNote={n => setSectionNote(section.id, n)}
        />
      ))}

      {/* Complete / done */}
      {status === 'complete' ? (
        <View style={st.doneBanner}>
          <Ionicons name="checkmark-circle" size={20} color={colors.greenMd} />
          <Text style={st.doneTxt}>Inspection completed</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={st.completeBtn}
          onPress={() => Alert.alert(
            'Complete Inspection',
            `Mark as complete with score ${score !== null ? score + '%' : '—'}?`,
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Complete', onPress: () => handleSave(true) }],
          )}
        >
          <Text style={st.completeTxt}>Mark as Complete</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

type SCProps = {
  section: ISection;
  openNotes: Set<string>;
  uploadingQId: string | null;
  onToggle: () => void;
  onSetResult: (qId: string, r: QResult) => void;
  onSetNote: (qId: string, n: string) => void;
  onToggleNote: (qId: string) => void;
  onPickPhoto: (qId: string) => void;
  onSectionNote: (n: string) => void;
};

function SectionCard({ section, openNotes, uploadingQId, onToggle, onSetResult, onSetNote, onToggleNote, onPickPhoto, onSectionNote }: SCProps) {
  const [showSNoteInput, setShowSNoteInput] = useState(false);
  const pass = section.questions.filter(q => q.result === 'pass').length;
  const fail = section.questions.filter(q => q.result === 'fail').length;

  return (
    <View style={st.sectionCard}>
      <TouchableOpacity style={st.sectionHdr} onPress={onToggle} activeOpacity={0.7}>
        <Ionicons
          name={section.enabled ? 'checkbox' : 'square-outline'}
          size={22}
          color={section.enabled ? colors.greenMd : colors.muted}
        />
        <Text style={[st.sectionName, !section.enabled && st.sectionOff]}>{section.name}</Text>
        {section.enabled && (pass > 0 || fail > 0) && (
          <View style={st.secCounts}>
            {pass > 0 && <Text style={st.passCount}>{pass}✓</Text>}
            {fail > 0 && <Text style={st.failCount}>{fail}✗</Text>}
          </View>
        )}
        <Ionicons name={section.enabled ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </TouchableOpacity>

      {section.enabled && (
        <>
          {section.questions.map((q, idx) => (
            <QuestionRow
              key={q.id}
              question={q}
              isLast={idx === section.questions.length - 1 && !section.notes}
              noteOpen={openNotes.has(q.id)}
              uploading={uploadingQId === q.id}
              onResult={r => onSetResult(q.id, r)}
              onNote={n => onSetNote(q.id, n)}
              onToggleNote={() => onToggleNote(q.id)}
              onPickPhoto={() => onPickPhoto(q.id)}
            />
          ))}

          <TouchableOpacity
            style={st.sNoteToggle}
            onPress={() => setShowSNoteInput(v => !v)}
          >
            <Ionicons
              name={section.notes ? 'chatbubble' : 'chatbubble-outline'}
              size={14}
              color={section.notes ? colors.greenMd : colors.muted}
            />
            <Text style={[st.sNoteLbl, section.notes && { color: colors.greenMd }]}>
              {section.notes ? 'Section note' : 'Add section note'}
            </Text>
          </TouchableOpacity>

          {(showSNoteInput || section.notes.length > 0) && (
            <TextInput
              style={st.sNoteInp}
              value={section.notes}
              onChangeText={onSectionNote}
              placeholder="Notes for this section…"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          )}
        </>
      )}
    </View>
  );
}

// ─── QuestionRow ─────────────────────────────────────────────────────────────

type QRProps = {
  question: IQuestion;
  isLast: boolean;
  noteOpen: boolean;
  uploading: boolean;
  onResult: (r: QResult) => void;
  onNote: (n: string) => void;
  onToggleNote: () => void;
  onPickPhoto: () => void;
};

const RESULT_BTNS: { label: string; value: QResult; bg: string }[] = [
  { label: '✓ Pass', value: 'pass', bg: colors.greenMd },
  { label: '✗ Fail', value: 'fail', bg: '#EF4444' },
  { label: 'N/A',   value: 'na',   bg: colors.muted },
];

function QuestionRow({ question, isLast, noteOpen, uploading, onResult, onNote, onToggleNote, onPickPhoto }: QRProps) {
  const { result, note, photos } = question;

  return (
    <View style={[st.qRow, !isLast && st.qDivider]}>
      <Text style={st.qText}>{question.text}</Text>

      <View style={st.resultRow}>
        {RESULT_BTNS.map(btn => {
          const active = result === btn.value;
          return (
            <TouchableOpacity
              key={btn.value as string}
              style={[st.rBtn, active && { backgroundColor: btn.bg, borderColor: btn.bg }]}
              onPress={() => onResult(btn.value)}
              activeOpacity={0.75}
            >
              <Text style={[st.rTxt, active && { color: '#fff', fontWeight: '700' }]}>{btn.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={st.qActions}>
        <TouchableOpacity style={st.qActBtn} onPress={onToggleNote}>
          <Ionicons
            name={(noteOpen || note) ? 'chatbubble' : 'chatbubble-outline'}
            size={15}
            color={note ? colors.greenMd : colors.muted}
          />
          <Text style={[st.qActTxt, note && { color: colors.greenMd }]}>Note</Text>
        </TouchableOpacity>

        <TouchableOpacity style={st.qActBtn} onPress={onPickPhoto} disabled={uploading}>
          {uploading
            ? <ActivityIndicator size="small" color={colors.greenMd} style={{ width: 15 }} />
            : <Ionicons
                name={photos.length ? 'camera' : 'camera-outline'}
                size={15}
                color={photos.length ? colors.greenMd : colors.muted}
              />}
          <Text style={[st.qActTxt, photos.length > 0 && { color: colors.greenMd }]}>
            {photos.length > 0 ? `${photos.length} Photo${photos.length > 1 ? 's' : ''}` : 'Photo'}
          </Text>
        </TouchableOpacity>
      </View>

      {(noteOpen || !!note) && (
        <TextInput
          style={st.noteInp}
          value={note}
          onChangeText={onNote}
          placeholder="Add note…"
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />
      )}

      {photos.length > 0 && (
        <ScrollView horizontal style={st.photosRow} showsHorizontalScrollIndicator={false}>
          {photos.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={st.thumb} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content:     { padding: 16, paddingBottom: 40 },

  scoreBanner: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreNum:    { fontSize: 28, fontWeight: '800', color: '#fff' },
  scoreSub:    { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

  metaCard:    { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 },
  metaLbl:     { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  metaInp:     { fontSize: 15, color: colors.text, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },

  sectionCard: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  sectionHdr:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  sectionName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  sectionOff:  { color: colors.muted },
  secCounts:   { flexDirection: 'row', gap: 8 },
  passCount:   { fontSize: 11, fontWeight: '800', color: colors.greenMd },
  failCount:   { fontSize: 11, fontWeight: '800', color: '#EF4444' },

  sNoteToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  sNoteLbl:    { fontSize: 12, color: colors.muted },
  sNoteInp:    { marginHorizontal: 14, marginBottom: 14, backgroundColor: colors.bg, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, fontSize: 13, color: colors.text, minHeight: 52 },

  qRow:        { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qDivider:    {},
  qText:       { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 10 },

  resultRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  rBtn:        { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingVertical: 7, alignItems: 'center' },
  rTxt:        { fontSize: 12, fontWeight: '600', color: colors.muted },

  qActions:    { flexDirection: 'row', gap: 18 },
  qActBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  qActTxt:     { fontSize: 12, color: colors.muted },

  noteInp:     { marginTop: 10, backgroundColor: colors.bg, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, fontSize: 13, color: colors.text, minHeight: 52 },

  photosRow:   { marginTop: 10 },
  thumb:       { width: 80, height: 60, borderRadius: 6, marginRight: 8 },

  completeBtn: { backgroundColor: colors.greenDk, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 6 },
  completeTxt: { fontSize: 15, fontWeight: '700', color: colors.cream },

  doneBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.greenMd + '18', borderRadius: 10, padding: 14, marginTop: 6, borderWidth: 1, borderColor: colors.greenMd + '44' },
  doneTxt:     { fontSize: 14, fontWeight: '600', color: colors.greenMd },
});
