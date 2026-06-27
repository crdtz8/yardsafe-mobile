import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Video, Audio, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

// Cloudflare Stream embed URL → HLS manifest so expo-av can play it natively
function resolveVideoUri(url: string): string {
  // Patterns: https://iframe.cloudflarestream.com/{uid}
  //           https://cloudflarestream.com/embed/{uid}
  //           https://{customer}.cloudflarestream.com/{uid}/iframe
  const match = url.match(/cloudflarestream\.com\/(?:embed\/)?([a-f0-9]{32,})/i);
  if (match) {
    return `https://videodelivery.net/${match[1]}/manifest/video.m3u8`;
  }
  return url; // already a direct mp4 / m3u8 / etc.
}

export default function TrainingPlayerScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title: string }>();
  const navigation = useNavigation();
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Allow audio to play on iOS regardless of the ringer/silent switch
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [title, navigation]);

  if (!url) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.muted} />
        <Text style={s.errText}>No video URL provided.</Text>
      </View>
    );
  }

  const uri = resolveVideoUri(url);

  const isPlaying = (status as any)?.isPlaying ?? false;

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  return (
    <View style={s.container}>
      <View style={s.videoWrap}>
        {loading && !error && (
          <View style={s.loader}>
            <ActivityIndicator color={colors.cream} size="large" />
            <Text style={s.loadTxt}>Loading video…</Text>
          </View>
        )}

        {error ? (
          <View style={s.loader}>
            <Ionicons name="alert-circle-outline" size={44} color={colors.cream} />
            <Text style={s.loadTxt}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setError(null); setLoading(true); videoRef.current?.loadAsync({ uri }, {}, false); }}>
              <Text style={s.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Video
            ref={videoRef}
            style={s.video}
            source={{ uri }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={(st) => {
              setStatus(st);
              if (st.isLoaded) setLoading(false);
            }}
            onError={(err) => {
              setLoading(false);
              setError('Could not load video. Please check your connection and try again.');
              console.warn('Video error:', err);
            }}
          />
        )}
      </View>

      {title && (
        <View style={s.info}>
          <Text style={s.infoTitle}>{title}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  errText:   { fontSize: 14, color: colors.muted, textAlign: 'center' },

  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', justifyContent: 'center' },
  video:     { width: '100%', height: '100%' },
  loader:    { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadTxt:   { fontSize: 14, color: colors.cream, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn:  { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.greenMd },
  retryTxt:  { fontSize: 14, fontWeight: '700', color: '#fff' },

  info:      { padding: 20, backgroundColor: colors.bg },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
});
