// Keep a list screen current without the user pulling down to refresh.
//
// Runs `load`:
//   - when the screen opens,
//   - every time you come back to it from another screen, and
//   - when the app returns to the front (phone unlocked, switched back from
//     another app) while this screen is showing.
//
// Use it only on screens whose loader just replaces list data. Do NOT use it
// on a form screen whose loader fills in the fields (profile, a checklist in
// progress): a refresh there would overwrite what the person is typing.

import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

// iOS reports "back to the front" for small things too (closing Control
// Center, a permission prompt), so don't reload more often than this for
// those. Coming back from another screen always reloads.
const FOREGROUND_MIN_GAP_MS = 30_000;

export function useRefreshOnFocus(load: () => unknown): void {
  const lastLoadAt = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const run = () => { lastLoadAt.current = Date.now(); load(); };
      run();

      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active' && Date.now() - lastLoadAt.current > FOREGROUND_MIN_GAP_MS) run();
      });
      return () => sub.remove();
    }, [load]),
  );
}
