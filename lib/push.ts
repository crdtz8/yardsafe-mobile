// Expo push notifications: request permission, obtain the device's Expo push
// token, and store it in device_push_tokens so the server can deliver pushes
// alongside the existing email alerts. Safe to call repeatedly (upsert by token).

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Foreground behavior: show a banner + play a sound (don't touch the app badge).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<void> {
  // Push tokens only exist on physical devices, never simulators.
  if (!Device.isDevice) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Ask for permission only if not already decided.
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted && current.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;
  if (!projectId) return;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return; // e.g. no APNs entitlement yet in a dev build — fail quietly
  }

  await supabase.from('device_push_tokens').upsert(
    { user_id: user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  );
}
