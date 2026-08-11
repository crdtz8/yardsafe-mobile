// Shows a prompt when push notifications are not enabled, so users can turn
// them on without you walking each person through it.
//   - "ask"    → permission undetermined: tapping requests it in-app.
//   - "blocked"→ previously denied (iOS won't re-ask): deep-link to Settings.
// Re-checks whenever the app returns to the foreground, so enabling in Settings
// and switching back makes the banner disappear and registers the device.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { colors } from '@/constants/theme';
import { registerForPush } from '@/lib/push';

type Mode = 'hidden' | 'ask' | 'blocked';
const AMBER = '#F59E0B';

export default function NotificationPermissionBanner() {
  const [mode, setMode] = useState<Mode>('hidden');
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (!Device.isDevice) { setMode('hidden'); return; }
    const perm = await Notifications.getPermissionsAsync();
    const granted =
      perm.granted ||
      perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (granted) {
      setMode('hidden');
      registerForPush().catch(() => {}); // make sure the token is on file
    } else {
      setMode(perm.canAskAgain ? 'ask' : 'blocked');
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  const onPress = useCallback(async () => {
    if (mode === 'ask') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.granted) { await registerForPush().catch(() => {}); setMode('hidden'); }
      else { check(); } // may now be 'blocked'
    } else {
      Linking.openSettings().catch(() => {});
    }
  }, [mode, check]);

  if (mode === 'hidden' || dismissed) return null;

  const blocked = mode === 'blocked';

  return (
    <View style={s.card}>
      <View style={s.iconWrap}>
        <Ionicons name="notifications-off-outline" size={20} color={AMBER} />
      </View>
      <View style={s.body}>
        <Text style={s.title}>Turn on push notifications</Text>
        <Text style={s.sub}>
          {blocked
            ? 'Notifications are off. Enable them in Settings to get alerts for new trainings and messages.'
            : 'Get alerted on this phone for new trainings, reminders, and messages.'}
        </Text>
        <TouchableOpacity style={s.btn} onPress={onPress} activeOpacity={0.8}>
          <Ionicons name={blocked ? 'settings-outline' : 'notifications-outline'} size={14} color={colors.cream} />
          <Text style={s.btnTxt}>{blocked ? 'Open Settings' : 'Enable'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => setDismissed(true)} style={s.close} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: AMBER,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17, marginTop: 1,
    backgroundColor: AMBER + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  body:  { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text },
  sub:   { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: colors.greenMd,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginTop: 10,
  },
  btnTxt: { fontSize: 12, fontWeight: '700', color: colors.cream },
  close:  { padding: 2 },
});
