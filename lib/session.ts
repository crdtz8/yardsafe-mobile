// Who is signed in, answered once and shared by every screen.
//
// Screens used to ask the server "who is logged in?" and then look up that
// person's company and role every time they loaded. Both answers are already
// on the phone (the saved login) or rarely change (company, role), so:
//   currentUser()  reads the saved login: no network request.
//   myProfile()    looks up company + role once and remembers it for a while.

import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Me = { id: string; role: string; company_id: string };

const PROFILE_MAX_AGE_MS = 5 * 60 * 1000;   // pick up a role change within 5 minutes

let cached: { me: Me; at: number } | null = null;
let inFlight: { userId: string; promise: Promise<Me | null> } | null = null;

/** The signed-in user from the login saved on the phone (null if signed out). */
export async function currentUser(): Promise<User | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user's company and role, shaped like a Supabase result
 * ({ data }) so it drops in where screens used to query `profiles` themselves.
 */
export async function myProfile(): Promise<{ data: Me | null }> {
  const user = await currentUser();
  if (!user) return { data: null };

  if (cached && cached.me.id === user.id && Date.now() - cached.at < PROFILE_MAX_AGE_MS) {
    return { data: cached.me };
  }
  if (!inFlight || inFlight.userId !== user.id) {
    const promise = (async (): Promise<Me | null> => {
      const { data } = await supabase
        .from('profiles')
        .select('id, role, company_id')
        .eq('id', user.id)
        .single();
      return (data as Me | null) ?? null;
    })()
      .catch(() => null)
      .then((me) => {
        if (me) cached = { me, at: Date.now() };   // a failed lookup is not remembered
        inFlight = null;
        return me;
      });
    inFlight = { userId: user.id, promise };
  }
  return { data: await inFlight.promise };
}

/**
 * Run a screen's loader and ALWAYS call `done` afterwards, so a failed or
 * abandoned request can never leave the loading spinner on screen.
 */
export async function guardedLoad(loader: () => Promise<unknown>, done: () => void): Promise<void> {
  try {
    await loader();
  } catch (e) {
    console.warn('Screen failed to load:', e);
  } finally {
    done();
  }
}

// Forget the remembered profile when someone signs out or a different person
// signs in. (Nothing is awaited in here: Supabase waits for this callback.)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || (cached && session?.user?.id !== cached.me.id)) {
    cached = null;
    inFlight = null;
  }
});
