/**
 * admin.ts — data layer for the admin "People" screen (manage logins' roles
 * + project assignments). Admin-only; RLS lets is_owner()/admin read & write
 * app_users and investor_project_access. Everything fails SOFT so the screen is safe
 * to ship before the RBAC migration (0006) runs — it just shows nothing yet.
 *
 * NOTE on creating logins: the browser client (anon key + the admin's JWT)
 * can't create Supabase Auth users or read auth.users emails — that needs the
 * service key (server-side). So today the flow is: create the login in the
 * Supabase dashboard, then assign its role + projects here. A future Edge
 * Function can fold creation into this screen (see docs/rbac-plan.md).
 */
import { supabase } from './supabase'

export interface AppUserRow {
  user_id: string
  role: string
  display_name: string
}

/** The signed-in user's own id — used to stop an admin from removing themselves. */
export async function currentUserId(): Promise<string> {
  if (!supabase) return ''
  try {
    return (await supabase.auth.getUser()).data.user?.id ?? ''
  } catch {
    return ''
  }
}

/** Every login that has an app_users row (admin sees all via RLS). */
export async function listAppUsers(): Promise<AppUserRow[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('user_id, role, display_name')
      .order('display_name')
    return error ? [] : ((data as AppUserRow[]) ?? [])
  } catch {
    return []
  }
}

/** Change one user's role. */
export async function setUserRole(userId: string, role: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('app_users').update({ role }).eq('user_id', userId)
    return !error
  } catch {
    return false
  }
}

/** Rename a login — the display name shown here AND on the investor portal. */
export async function setUserName(userId: string, displayName: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('app_users').update({ display_name: displayName }).eq('user_id', userId)
    return !error
  } catch {
    return false
  }
}

/**
 * Invite a teammate by email. Calls the `invite-user` Edge Function, which does
 * the privileged work server-side (the browser can't create auth users). The
 * function verifies WE'RE an admin, emails the set-password link, and sets their
 * role. Returns a friendly result; the real server message rides in error.context.
 */
export async function inviteUser(
  email: string,
  role: string,
  displayName: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'No backend connection.' }
  try {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, role, displayName },
    })
    if (error) {
      // supabase-js puts non-2xx bodies on error.context — dig out our JSON message.
      let msg = error.message
      try {
        const j = await (error as unknown as { context?: Response }).context?.json?.()
        if (j?.error) msg = j.error
      } catch {
        /* fall back to error.message */
      }
      return { ok: false, error: msg }
    }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true, error: data?.warning }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** All project assignments (admin reads every row). Map user_id → project ids. */
export async function allProjectAccess(): Promise<Record<string, number[]>> {
  if (!supabase) return {}
  try {
    const { data, error } = await supabase.from('investor_project_access').select('user_id, project_id')
    if (error || !data) return {}
    const map: Record<string, number[]> = {}
    for (const r of data as { user_id: string; project_id: number }[]) {
      ;(map[r.user_id] ??= []).push(r.project_id)
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Remove a login from the app. Deletes their app_users row (RLS "owners manage
 * app_users" lets an admin do this); investor_project_access rows cascade away
 * via the foreign key. After this they vanish from the People list AND drop to
 * no-access — normalizeRole() maps "no app_users row" to 'pending', so if they
 * ever sign in again they land on the no-access holding screen.
 *
 * NOTE: this does NOT delete the underlying Supabase Auth login (the browser
 * can't — that needs the service key, like invite-user's Edge Function). The
 * login still exists but is powerless. A future delete-user Edge Function can
 * fold in full auth deletion; see docs/rbac-plan.md.
 */
export async function deleteUser(userId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('app_users').delete().eq('user_id', userId)
    return !error
  } catch {
    return false
  }
}

/** Replace a user's project assignments with exactly `projectIds`. */
export async function setUserProjects(userId: string, projectIds: number[]): Promise<boolean> {
  if (!supabase) return false
  try {
    const del = await supabase.from('investor_project_access').delete().eq('user_id', userId)
    if (del.error) return false
    if (projectIds.length === 0) return true
    const rows = projectIds.map((project_id) => ({ user_id: userId, project_id }))
    const ins = await supabase.from('investor_project_access').insert(rows)
    return !ins.error
  } catch {
    return false
  }
}
