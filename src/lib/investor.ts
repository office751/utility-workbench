/**
 * investor.ts — everything the INVESTOR PORTAL reads and writes.
 *
 * The investor world is a set of real Postgres tables (shared_files,
 * project_status_snapshot, comments, app_users, investor_project_access)
 * protected by Row Level Security — see supabase/migrations-PROPOSED/.
 * Investors NEVER read the workbench blob.
 *
 * FEATURE-GATED: until those migrations run, every query here hits a table
 * that doesn't exist. Every function catches that and returns a safe default
 * (null / empty), so this code can ship and deploy BEFORE the schema — the
 * portal UI simply stays invisible. No call in this file can break the app.
 *
 * Pure-ish logic — no React. Uses the shared supabase client (anon key +
 * the signed-in user's JWT; RLS does the real enforcement server-side).
 */
import { supabase } from './supabase'

export interface SharedFile {
  id: string
  project_id: number
  storage_path: string
  name: string
  caption: string
  investor_visible: boolean
  created_at: string
}

export interface InvestorComment {
  id: string
  project_id: number
  shared_file_id: string | null
  author_user_id: string
  author_name: string
  body: string
  read_by_owner: boolean
  created_at: string
}

export interface StatusSnapshot {
  project_id: number
  address: string
  permitting: string
  electric: string
  water: string
  septic: string
  updated_at?: string
}

/** Wrap a query so missing tables / missing policies fail SOFT.
 *  (PromiseLike, not Promise — Supabase's query builder is a thenable.) */
async function soft<T>(fallback: T, run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  if (!supabase) return fallback
  try {
    const { data, error } = await run()
    if (error) return fallback
    return (data as T) ?? fallback
  } catch {
    return fallback
  }
}

/** Who am I? null = portal schema absent OR no app_users row → the app
 *  treats that as "owner" for back-compat (today's two logins are owners). */
export async function myRole(): Promise<{ role: 'owner' | 'investor'; name: string } | null> {
  if (!supabase) return null
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return null
  const row = await soft<{ role: 'owner' | 'investor'; display_name: string } | null>(null, () =>
    supabase!.from('app_users').select('role, display_name').eq('user_id', uid).maybeSingle(),
  )
  return row ? { role: row.role, name: row.display_name } : null
}

/** The signed-in INVESTOR's granted project ids (RLS returns only their own). */
export async function myGrantedProjects(): Promise<number[]> {
  const rows = await soft<{ project_id: number }[]>([], () =>
    supabase!.from('investor_project_access').select('project_id'),
  )
  return rows.map((r) => r.project_id)
}

/** OWNER: every grant, for gating the curation UI (projectId → granted?). */
export async function grantedProjectIds(): Promise<Set<number>> {
  const rows = await soft<{ project_id: number }[]>([], () =>
    supabase!.from('investor_project_access').select('project_id'),
  )
  return new Set(rows.map((r) => r.project_id))
}

/** Curated files for one project. RLS scopes: owners see all rows; investors
 *  see only investor_visible rows of granted projects. */
export async function sharedFilesFor(projectId: number): Promise<SharedFile[]> {
  return soft<SharedFile[]>([], () =>
    supabase!.from('shared_files').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  )
}

/**
 * OWNER: share one Files-box document with the investor.
 * Copies the bytes project-files → investor-files/<projectId>/… (so nothing
 * outside the investor bucket is ever reachable by them), then inserts the
 * shared_files row, visible immediately (Adam just chose it, after all).
 */
export async function shareFileToInvestor(
  projectId: number,
  doc: { name: string; path?: string },
  caption: string,
): Promise<SharedFile | null> {
  if (!supabase || !doc.path) return null
  try {
    const dl = await supabase.storage.from('project-files').download(doc.path)
    if (dl.error || !dl.data) return null
    const destPath = `${projectId}/${crypto.randomUUID()}/${doc.path.split('/').pop()}`
    const up = await supabase.storage.from('investor-files').upload(destPath, dl.data, { upsert: false })
    if (up.error) return null
    const ins = await supabase
      .from('shared_files')
      .insert({ project_id: projectId, storage_path: destPath, name: doc.name, caption, investor_visible: true })
      .select()
      .single()
    return ins.error ? null : (ins.data as SharedFile)
  } catch {
    return null
  }
}

/** OWNER: flip a shared photo's visibility / edit its caption. */
export async function updateSharedFile(id: string, patch: { investor_visible?: boolean; caption?: string }): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('shared_files').update(patch).eq('id', id)
  return !error
}

/** The conversation on one project (project-level + per-photo together). */
export async function commentsFor(projectId: number): Promise<InvestorComment[]> {
  return soft<InvestorComment[]>([], () =>
    supabase!.from('comments').select('*').eq('project_id', projectId).order('created_at'),
  )
}

/** Post a comment (either role; RLS limits investors to their project, and
 *  to photos that are actually visible to them). */
export async function addComment(
  projectId: number,
  body: string,
  opts: { sharedFileId?: string; authorName?: string; asOwner?: boolean } = {},
): Promise<boolean> {
  if (!supabase) return false
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return false
  const { error } = await supabase.from('comments').insert({
    project_id: projectId,
    shared_file_id: opts.sharedFileId ?? null,
    author_user_id: uid,
    author_name: opts.authorName ?? '',
    body,
    // the OWNER's own replies shouldn't show up as "unread for the owner"
    read_by_owner: opts.asOwner ?? false,
  })
  return !error
}

/** OWNER: investor comments awaiting a look — drives the Today section. */
export async function unreadComments(): Promise<InvestorComment[]> {
  return soft<InvestorComment[]>([], () =>
    supabase!.from('comments').select('*').eq('read_by_owner', false).order('created_at'),
  )
}

export async function markCommentRead(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('comments').update({ read_by_owner: true }).eq('id', id)
  return !error
}

/** OWNER: publish/update the Current Progress card for one shared project. */
export async function publishSnapshot(snap: StatusSnapshot): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('project_status_snapshot')
    .upsert({ ...snap, updated_at: new Date().toISOString() })
  return !error
}

/** INVESTOR: their project's Current Progress card. */
export async function snapshotFor(projectId: number): Promise<StatusSnapshot | null> {
  return soft<StatusSnapshot | null>(null, () =>
    supabase!.from('project_status_snapshot').select('*').eq('project_id', projectId).maybeSingle(),
  )
}

/** Download an investor-bucket photo into an object URL for <img>/<a>.
 *  (RLS on storage.objects decides whether the caller may have it.) */
export async function investorFileUrl(path: string): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.storage.from('investor-files').download(path)
    if (error || !data) return null
    return URL.createObjectURL(data)
  } catch {
    return null
  }
}
