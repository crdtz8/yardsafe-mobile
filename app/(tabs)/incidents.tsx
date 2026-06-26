import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

export default function IncidentsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="warning-outline" size={48} color={colors.greenMd} style={styles.icon} />
        <Text style={styles.title}>Incident Reporting</Text>
        <Text style={styles.body}>
          Field incident capture with camera, GPS location, and offline support is coming in Phase 3.2.
        </Text>
        <Text style={styles.note}>
          Incidents logged on the web are still visible to managers in real time.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon:  { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 10, textAlign: 'center' },
  body:  { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  note:  { fontSize: 12, color: colors.greenMd, textAlign: 'center', lineHeight: 18, fontStyle: 'italic' },
});
