import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const ExpoSecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// A request that was in the air when the phone went to sleep, or that starts
// before the signal is back, can sit forever without failing. Give every
// request a time limit so it fails cleanly and the screen can recover.
// Photo and file transfers get longer because they are much bigger.
const REQUEST_TIMEOUT_MS  = 30_000;
const TRANSFER_TIMEOUT_MS = 120_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input as any)?.url ?? String(input);
  const limit = url.includes('/storage/v1/') ? TRANSFER_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort());
  }
  const timer = setTimeout(() => controller.abort(), limit);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage:           ExpoSecureStoreAdapter,
      autoRefreshToken:  true,
      persistSession:    true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchWithTimeout },
  }
);

// Keep the login fresh only while the app is on screen. Timers do not run
// reliably in the background, so when the app comes back to the front this
// renews the login right away instead of waiting for a request to fail.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
