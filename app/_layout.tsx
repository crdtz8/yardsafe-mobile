import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerForPush } from '@/lib/push';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready,   setReady]   = useState(false);
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setReady(true);
      if (session) registerForPush().catch(() => {});
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) registerForPush().catch(() => {});
    });

    // Tapping a push notification opens the in-app notifications feed.
    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/(tabs)/notifications');
    });

    return () => { subscription.unsubscribe(); responseSub.remove(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    if (session  &&  inAuth) router.replace('/(tabs)');
  }, [session, ready, segments]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
