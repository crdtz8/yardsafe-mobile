// Groups (teams) data layer — ported from the web app (src/lib/data.js).
// Group CRUD is direct-to-Supabase; RLS restricts writes to admin/safety_manager.
// Assigning a training to a group cascades training_assignments (source 'group')
// to every current member. group_trainings and training_assignments.group_id/
// source exist only in the live DB (no migration), so we set company_id
// explicitly on those inserts (no DB default exists for them).

import { supabase } from './supabase';

export type Group = { id: string; name: string; description: string | null; company_id?: string };

export async function fetchGroups() {
  return supabase.from('groups').select('*').order('name');
}

export async function createGroup(name: string, description: string) {
  return supabase.from('groups').insert({ name, description: description || null }).select().single();
}

export async function updateGroup(id: string, name: string, description: string) {
  return supabase.from('groups').update({ name, description: description || null }).eq('id', id).select().single();
}

export async function deleteGroup(id: string) {
  // Detach members, drop group-sourced assignments + the group's training links,
  // then delete the group itself.
  await supabase.from('profiles').update({ group_id: null }).eq('group_id', id);
  await supabase.from('training_assignments').delete().eq('group_id', id).eq('source', 'group');
  await supabase.from('group_trainings').delete().eq('group_id', id);
  return supabase.from('groups').delete().eq('id', id);
}

// Training IDs currently linked to each group → { [groupId]: Set<trainingId> }
export async function fetchGroupTrainingMap(): Promise<Record<string, string[]>> {
  const { data } = await supabase.from('group_trainings').select('group_id, training_id');
  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as any[]) {
    (map[row.group_id] ||= []).push(row.training_id);
  }
  return map;
}

// Assign a training to a group and cascade to all current members. Returns the
// member IDs so the caller can fire the training_assigned notification/email.
export async function assignTrainingToGroup(groupId: string, trainingId: string, companyId: string) {
  const { error } = await supabase
    .from('group_trainings')
    .upsert({ group_id: groupId, training_id: trainingId, company_id: companyId }, { onConflict: 'group_id,training_id' });
  if (error) return { error, memberIds: [] as string[] };

  const { data: members } = await supabase
    .from('profiles').select('id').eq('group_id', groupId).is('archived_at', null);
  const memberIds = (members ?? []).map((m: any) => m.id);
  if (memberIds.length) {
    const rows = memberIds.map(uid => ({
      training_id: trainingId, user_id: uid, group_id: groupId, source: 'group', company_id: companyId,
    }));
    await supabase.from('training_assignments').upsert(rows, { onConflict: 'training_id,user_id' });
  }
  return { error: null, memberIds };
}

export async function removeTrainingFromGroup(groupId: string, trainingId: string) {
  await supabase.from('group_trainings').delete().eq('group_id', groupId).eq('training_id', trainingId);
  await supabase.from('training_assignments').delete()
    .eq('training_id', trainingId).eq('group_id', groupId).eq('source', 'group');
  return { error: null };
}

// Put an employee in a group and give them the group's trainings (source 'group').
// (The web has this cascade written but never wired; mobile wires it.)
export async function assignEmployeeToGroup(userId: string, groupId: string, companyId: string) {
  await supabase.from('profiles').update({ group_id: groupId }).eq('id', userId);
  const { data: gts } = await supabase.from('group_trainings').select('training_id').eq('group_id', groupId);
  if (gts?.length) {
    const rows = (gts as any[]).map(gt => ({
      training_id: gt.training_id, user_id: userId, group_id: groupId, source: 'group', company_id: companyId,
    }));
    await supabase.from('training_assignments').upsert(rows, { onConflict: 'training_id,user_id' });
  }
  return { error: null };
}

// Remove an employee from a group and drop that group's group-sourced assignments.
export async function removeEmployeeFromGroup(userId: string, groupId: string) {
  await supabase.from('profiles').update({ group_id: null }).eq('id', userId);
  await supabase.from('training_assignments').delete()
    .eq('user_id', userId).eq('group_id', groupId).eq('source', 'group');
  return { error: null };
}
