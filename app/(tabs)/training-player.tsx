import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

// Cloudflare Stream embed URL → HLS manifest so expo-video can play it natively
function resolveVideoUri(url: string): string {
  const match = url.match(/cloudflarestream\.com\/(?:embed\/)?([a-f0-9]{32,})/i);
  if (match) {
    return `https://videodelivery.net/${match[1]}/manifest/video.m3u8`;
  }
  return url;
}

export default function TrainingPlayerScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title: string }>();
  const navigation = useNavigation();

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
  return <Player uri={uri} title={title} />;
}

// Separate component so useVideoPlayer is always called with a defined URI
function Player({ uri, title }: { uri: string; title?: string }) {
  const player = useVideoPlayer(uri, p => {
    // expo-video defaults to AVAudioSessionCategoryPlayback on iOS,
    // so audio plays regardless of the ringer/silent switch.
    p.loop = false;
  });

  return (
    <View style={s.container}>
      <View style={s.videoWrap}>
        <VideoView
          player={player}
          style={s.video}
          allowsFullscreen
          allowsPictureInPicture
          nativeControls
        />
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
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  video:     { width: '100%', height: '100%' },
  info:      { padding: 20, backgroundColor: colors.bg },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
});
