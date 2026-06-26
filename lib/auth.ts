import { supabase } from './supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { session: data.session, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, company_id, must_change_password')
    .eq('id', userId)
    .single();
  return { profile: data, error };
}

export async function getCompany(companyId: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, plan, status, trial_ends_at')
    .eq('id', companyId)
    .single();
  return { company: data, error };
}
