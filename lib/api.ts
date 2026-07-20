import { supabase } from './supabase';

// The admin/notification serverless functions are deployed with the web app.
// Override with EXPO_PUBLIC_API_URL if you point the mobile app at a different
// environment; otherwise it uses production.
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://yardsafe.app';

type ApiResult<T = any> = { data: T | null; error: { message: string } | null };

async function authedPost(path: string, body: any): Promise<ApiResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { data: null, error: { message: 'Your session has expired. Please sign in again.' } };
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: { message: json.error || `Request failed (${res.status})` } };
    return { data: json, error: null };
  } catch {
    return { data: null, error: { message: 'Could not reach the server. Check your connection.' } };
  }
}

// Secure admin operations (create/delete employee, assign training, resend
// invite, reset password) — mirrors the web app's callAdminApi.
export function callAdminApi(action: string, payload: any): Promise<ApiResult> {
  return authedPost('/api/admin-users', { action, payload });
}

// Notification actions (reminders, custom messages) — mirrors callNotificationsApi.
export function callNotificationsApi(action: string, extra: Record<string, any> = {}): Promise<ApiResult> {
  return authedPost('/api/send-notifications', { action, ...extra });
}

// Public password-reset request (no session required) — sends the branded
// reset email via Resend, same endpoint the web login uses.
export async function requestPasswordReset(email: string): Promise<ApiResult> {
  try {
    const res = await fetch(`${API_BASE}/api/admin-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_reset', payload: { email } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: { message: json.error || 'Could not send the reset email.' } };
    return { data: json, error: null };
  } catch {
    return { data: null, error: { message: 'Could not reach the server. Check your connection.' } };
  }
}

// Random temp password for invite-based account creation (user sets their own
// via the emailed link). Matches the web app's approach.
export function genTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
