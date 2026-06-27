import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

export default function PdfViewerScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title: string }>();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [title, navigation]);

  if (!url) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.muted} />
        <Text style={s.muted}>No document URL provided.</Text>
      </View>
    );
  }

  // Android WebView can't render PDFs natively — route through Google Docs viewer
  const viewerUrl = Platform.OS === 'android'
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
    : url;

  return (
    <View style={s.container}>
      {loading && !error && (
        <View style={s.loader}>
          <ActivityIndicator color={colors.greenMd} size="large" />
          <Text style={s.loadTxt}>Loading document…</Text>
        </View>
      )}
      {error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.muted} />
          <Text style={s.muted}>Could not load document. Check your connection and try again.</Text>
        </View>
      ) : (
        <WebView
          source={{ uri: viewerUrl }}
          style={s.web}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          startInLoadingState={false}
          allowsInlineMediaPlayback
          // Allow PDF content type on iOS
          allowsBackForwardNavigationGestures={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  web:       { flex: 1 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.bg },
  muted:     { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  loader:    { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10, backgroundColor: colors.bg },
  loadTxt:   { fontSize: 14, color: colors.muted },
});
