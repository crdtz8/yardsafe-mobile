import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// Cloudflare Stream embed URL → HLS manifest so expo-video can play it natively
function resolveVideoUri(url: string): string {
  const match = url.match(/cloudflarestream\.com\/(?:embed\/)?([a-f0-9]{32,})/i);
  if (match) return `https://videodelivery.net/${match[1]}/manifest/video.m3u8`;
  return url;
}

type Question = {
  id: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'acknowledgment';
  options: string[] | null;
  correct: string | null;
  explanation: string | null;
  sort_order: number;
};

type Training = {
  id: string;
  title: string;
  quiz_enabled: boolean;
  quiz_pass_pct: number | null;
  quiz_max_attempts: number | null;
  quiz_questions: Question[];
};

type Phase = 'video' | 'quiz' | 'done';

export default function TrainingPlayerScreen() {
  const { id, url, title } = useLocalSearchParams<{ id: string; url: string; title: string }>();
  const navigation = useNavigation();

  const [training, setTraining] = useState<Training | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [phase,    setPhase]    = useState<Phase>('video');
  const [watchedEnough, setWatchedEnough] = useState(false); // gates the continue button — no skipping

  // Quiz state
  const [answers,   setAnswers]   = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score,     setScore]     = useState<number | null>(null);
  const [passed,    setPassed]    = useState(false);
  const [attempts,  setAttempts]  = useState(0);
  const [saving,    setSaving]    = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0); // bump to re-randomize option order

  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [title, navigation]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('trainings')
        .select('id, title, quiz_enabled, quiz_pass_pct, quiz_max_attempts, quiz_questions(id, question, type, options, correct, explanation, sort_order)')
        .eq('id', id)
        .single();
      if (!active) return;
      if (error) console.warn('training fetch error:', error.message);
      if (data) {
        const qs = (data.quiz_questions ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
        setTraining({ ...(data as any), quiz_questions: qs });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  const questions   = training?.quiz_questions ?? [];
  const hasQuiz     = !!training?.quiz_enabled && questions.length > 0;
  const passPct     = training?.quiz_pass_pct ?? 80;
  const maxAttempts = training?.quiz_max_attempts ?? 3;
  const gradeable   = useMemo(() => questions.filter(q => q.type !== 'acknowledgment'), [questions]);
  const ackQs       = useMemo(() => questions.filter(q => q.type === 'acknowledgment'), [questions]);
  const lockedOut   = !passed && submitted && attempts >= maxAttempts;

  // Randomize the multiple-choice option order for each attempt. Grading is
  // text-based (answers[q.id] vs q.correct) so shuffling positions is safe.
  const quizOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const q of questions) {
      if (q.type !== 'multiple_choice' || !q.options) continue;
      const opts = [...q.options];
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      map[q.id] = opts;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffleKey, training?.id]);

  const recordCompletion = async (pct: number | null, quizAnswers: Record<string, string | null> | null, sig: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !id) return { error: 'Not signed in' };
    const { error } = await supabase.from('training_completions').upsert({
      training_id:   id,
      user_id:       user.id,
      completed_at:  new Date().toISOString(),
      score:         pct,
      attempts:      attempts + 1,
      ack_signature: sig,
      answers:       quizAnswers,
    }, { onConflict: 'training_id,user_id' });
    return { error: error?.message ?? null };
  };

  // Video finished → either go to the quiz or complete a quiz-less training
  const handleVideoDone = async () => {
    if (hasQuiz) { setPhase('quiz'); return; }
    setSaving(true);
    const { error } = await recordCompletion(null, null, null);
    setSaving(false);
    if (error) { Alert.alert('Error', error); return; }
    setPhase('done');
  };

  const submitQuiz = async () => {
    // Acknowledgment questions require a typed signature
    for (const q of ackQs) {
      if (!answers[q.id]?.trim()) { Alert.alert('Signature required', 'Please type your name to acknowledge.'); return; }
    }
    let correct = 0;
    gradeable.forEach(q => {
      if (String(answers[q.id] || '').trim().toLowerCase() === String(q.correct || '').trim().toLowerCase()) correct++;
    });
    const pct  = gradeable.length ? Math.round((correct / gradeable.length) * 100) : 100;
    const pass = pct >= passPct;
    setScore(pct); setPassed(pass); setSubmitted(true); setAttempts(a => a + 1);

    if (pass) {
      const sig = ackQs.length ? answers[ackQs[ackQs.length - 1].id] : null;
      const quizAnswers: Record<string, string | null> = {};
      gradeable.forEach(q => { quizAnswers[q.id] = answers[q.id] ?? null; });
      setSaving(true);
      const { error } = await recordCompletion(pct, quizAnswers, sig);
      setSaving(false);
      if (error) { Alert.alert('Error', error); return; }
      setPhase('done');
    }
  };

  const retake = () => { setAnswers({}); setSubmitted(false); setScore(null); setPassed(false); setShuffleKey(k => k + 1); };
  const rewatch = () => {
    setAnswers({}); setSubmitted(false); setScore(null); setPassed(false); setAttempts(0); setWatchedEnough(false); setPhase('video'); setShuffleKey(k => k + 1);
  };

  if (!url && !id) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.muted} />
        <Text style={s.errText}>No training content provided.</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.greenMd} size="large" /></View>;
  }

  // ── VIDEO PHASE ────────────────────────────────────────────────────────────
  if (phase === 'video') {
    return (
      <View style={s.container}>
        {url ? <VideoBlock uri={resolveVideoUri(url)} onWatchedEnough={() => setWatchedEnough(true)} /> : null}
        <ScrollView contentContainerStyle={s.videoFooter}>
          {title ? <Text style={s.infoTitle}>{title}</Text> : null}
          <Text style={s.hint}>
            {watchedEnough
              ? (hasQuiz ? 'Video complete — continue to the required knowledge check.' : 'Video complete — mark this training complete.')
              : 'Watch the full video to continue. Skipping ahead is disabled.'}
          </Text>
          <TouchableOpacity
            style={[s.primaryBtn, !watchedEnough && s.primaryBtnDisabled]}
            onPress={handleVideoDone}
            disabled={saving || !watchedEnough}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={colors.cream} />
              : <>
                  <Ionicons name={!watchedEnough ? 'lock-closed' : hasQuiz ? 'shield-checkmark' : 'checkmark-circle'} size={18} color={colors.cream} />
                  <Text style={s.primaryBtnTxt}>{hasQuiz ? 'Continue to Quiz' : 'Mark Complete'}</Text>
                </>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── QUIZ PHASE ─────────────────────────────────────────────────────────────
  if (phase === 'quiz') {
    return (
      <ScrollView style={s.quizScroll} contentContainerStyle={s.quizContent} keyboardShouldPersistTaps="handled">
        <View style={s.quizHeader}>
          <Ionicons name="shield-checkmark" size={20} color={colors.greenMd} />
          <View style={{ flex: 1 }}>
            <Text style={s.quizHeaderTitle}>Knowledge Check</Text>
            <Text style={s.quizHeaderSub}>
              {questions.length} question{questions.length !== 1 ? 's' : ''} · {passPct}% to pass
              {attempts > 0 ? ` · Attempt ${attempts + 1} of ${maxAttempts}` : ''}
            </Text>
          </View>
        </View>

        {!submitted ? (
          <>
            {questions.map((q, i) => (
              <View key={q.id} style={s.qCard}>
                <Text style={s.qText}><Text style={s.qNum}>{i + 1}. </Text>{q.question}</Text>

                {q.type === 'multiple_choice' && (quizOptions[q.id] ?? q.options ?? []).map((opt, oi) => {
                  const sel = answers[q.id] === opt;
                  return (
                    <TouchableOpacity key={oi} style={[s.opt, sel && s.optSel]} onPress={() => setAnswers(a => ({ ...a, [q.id]: opt }))} activeOpacity={0.7}>
                      <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.greenMd : colors.muted} />
                      <Text style={[s.optTxt, sel && s.optTxtSel]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}

                {q.type === 'true_false' && ['True', 'False'].map(val => {
                  const sel = answers[q.id] === val;
                  return (
                    <TouchableOpacity key={val} style={[s.opt, sel && s.optSel]} onPress={() => setAnswers(a => ({ ...a, [q.id]: val }))} activeOpacity={0.7}>
                      <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? colors.greenMd : colors.muted} />
                      <Text style={[s.optTxt, sel && s.optTxtSel]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}

                {q.type === 'acknowledgment' && (
                  <>
                    {q.options?.[0] ? <Text style={s.ackPrompt}>{q.options[0]}</Text> : null}
                    <TextInput
                      style={s.ackInput}
                      placeholder="Type your full name"
                      placeholderTextColor={colors.muted}
                      value={answers[q.id] || ''}
                      onChangeText={txt => setAnswers(a => ({ ...a, [q.id]: txt }))}
                      autoCapitalize="words"
                    />
                  </>
                )}
              </View>
            ))}

            <TouchableOpacity style={s.primaryBtn} onPress={submitQuiz} disabled={saving} activeOpacity={0.8}>
              {saving ? <ActivityIndicator color={colors.cream} /> : <>
                <Ionicons name="checkmark-done" size={18} color={colors.cream} />
                <Text style={s.primaryBtnTxt}>Submit Quiz</Text>
              </>}
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={() => setPhase('video')} activeOpacity={0.7}>
              <Text style={s.ghostBtnTxt}>Back to Video</Text>
            </TouchableOpacity>
          </>
        ) : (
          // Failed result (passing jumps straight to 'done')
          <View style={s.resultWrap}>
            <View style={[s.scoreRing, { borderColor: colors.red }]}>
              <Text style={[s.scorePct, { color: colors.red }]}>{score}%</Text>
              <Text style={[s.scoreLbl, { color: colors.red }]}>NOT PASSED</Text>
            </View>
            <Text style={s.resultTitle}>Not quite there</Text>
            <Text style={s.resultMsg}>
              {lockedOut
                ? `You've used all ${maxAttempts} attempts. Please rewatch the video and try again.`
                : `You need ${passPct}% to pass. ${maxAttempts - attempts} attempt${maxAttempts - attempts !== 1 ? 's' : ''} remaining.`}
            </Text>
            {lockedOut ? (
              <TouchableOpacity style={s.primaryBtn} onPress={rewatch} activeOpacity={0.8}>
                <Ionicons name="refresh" size={18} color={colors.cream} />
                <Text style={s.primaryBtnTxt}>Rewatch & Retake</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.primaryBtn} onPress={retake} activeOpacity={0.8}>
                <Ionicons name="shield-checkmark" size={18} color={colors.cream} />
                <Text style={s.primaryBtnTxt}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  // ── DONE PHASE ─────────────────────────────────────────────────────────────
  return (
    <View style={s.center}>
      <View style={s.doneCircle}><Ionicons name="checkmark" size={40} color={colors.greenMd} /></View>
      <Text style={s.doneTitle}>Training Complete</Text>
      {score != null ? <Text style={s.doneScore}>Score: {score}%</Text> : null}
      <Text style={s.doneMsg}>Your completion has been recorded.</Text>
      <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Text style={s.primaryBtnTxt}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

// Separate component so useVideoPlayer is always called with a defined URI.
// Native controls (and the scrubber) are disabled so the video can't be skipped;
// the viewer can only play/pause. Progress is tracked to unlock the continue button.
function VideoBlock({ uri, onWatchedEnough }: { uri: string; onWatchedEnough: () => void }) {
  const player = useVideoPlayer(uri, p => { p.loop = false; p.timeUpdateEventInterval = 1; });
  const [progress, setProgress] = useState(0);
  const [playing,  setPlaying]  = useState(true);
  const done = useRef(false);

  useEffect(() => {
    player.play();
    const markDone = () => { if (!done.current) { done.current = true; onWatchedEnough(); } };
    const s1 = player.addListener('timeUpdate', ({ currentTime }) => {
      const dur = player.duration || 0;
      if (dur > 0) {
        const pct = currentTime / dur;
        setProgress(pct);
        if (pct >= 0.95) markDone();
      }
    });
    const s2 = player.addListener('playToEnd', () => { markDone(); setPlaying(false); });
    const s3 = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => { s1?.remove?.(); s2?.remove?.(); s3?.remove?.(); };
  }, [player]);

  const toggle = () => { if (player.playing) player.pause(); else player.play(); };

  return (
    <View style={s.videoWrap}>
      <VideoView
        player={player}
        style={s.video}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="contain"
      />
      {/* Tap to play/pause — no scrubber, so no skipping */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
        {!playing && (
          <View style={s.playOverlay}>
            <Ionicons name="play-circle" size={66} color="rgba(255,255,255,0.92)" />
          </View>
        )}
      </Pressable>
      {/* Non-interactive progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#000' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg, padding: 24 },
  errText:     { fontSize: 14, color: colors.muted, textAlign: 'center' },
  videoWrap:   { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  video:       { width: '100%', height: '100%' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill:  { height: '100%', backgroundColor: colors.greenLt },
  videoFooter: { padding: 20, backgroundColor: colors.bg, flexGrow: 1, gap: 12 },
  infoTitle:   { fontSize: 17, fontWeight: '700', color: colors.text },
  hint:        { fontSize: 13, color: colors.muted, lineHeight: 19 },

  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.greenDk, paddingVertical: 14, borderRadius: 8, marginTop: 8 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnTxt: { color: colors.cream, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  ghostBtn:      { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  ghostBtnTxt:   { color: colors.muted, fontSize: 13, fontWeight: '600' },

  quizScroll:      { flex: 1, backgroundColor: colors.bg },
  quizContent:     { padding: 16, paddingBottom: 40 },
  quizHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, marginBottom: 16 },
  quizHeaderTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  quizHeaderSub:   { fontSize: 12, color: colors.muted, marginTop: 2 },

  qCard:   { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16, marginBottom: 14 },
  qText:   { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 12, lineHeight: 21 },
  qNum:    { color: colors.muted, fontWeight: '700' },
  opt:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.creamLt, marginBottom: 8 },
  optSel:  { borderColor: colors.greenMd, backgroundColor: 'rgba(66,82,62,0.10)' },
  optTxt:  { fontSize: 14, color: colors.text, flex: 1 },
  optTxtSel: { fontWeight: '600' },
  ackPrompt: { fontSize: 13, color: colors.muted, fontStyle: 'italic', marginBottom: 8 },
  ackInput:  { borderWidth: 1, borderColor: colors.border2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.creamLt },

  resultWrap: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  scoreRing:  { width: 120, height: 120, borderRadius: 60, borderWidth: 4, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  scorePct:   { fontSize: 34, fontWeight: '800' },
  scoreLbl:   { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  resultTitle:{ fontSize: 18, fontWeight: '700', color: colors.text },
  resultMsg:  { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20, marginBottom: 8 },

  doneCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.greenMd, backgroundColor: 'rgba(66,82,62,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  doneTitle:  { fontSize: 18, fontWeight: '700', color: colors.greenMd, letterSpacing: 0.5 },
  doneScore:  { fontSize: 14, color: colors.text, fontWeight: '600' },
  doneMsg:    { fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 8 },
});
