/**
 * files.ts — the project-files locker (Supabase Storage).
 *
 * Real files (PDFs, photos, plan sets) can't live in our JSON blob — they'd
 * blow past the browser's storage limit and make every cloud sync huge and
 * slow. So the BYTES live here, in a PRIVATE Supabase Storage bucket called
 * 'project-files', and the JSON blob keeps only a tiny pointer (name + path).
 *
 * This is the ONLY file that talks to `supabase.storage` — same idea as
 * supabase.ts owning the database client. If we ever switch file hosts, this
 * is the one file we rewrite.
 *
 * PRIVACY: the bucket is private, so files are NOT openly on the web. To share
 * one we mint a "signed URL" — a long, unguessable link that works for a set
 * time (~1 year) and then expires. We generate a fresh one every time you hit
 * Share, so whatever you send is always live.
 */
import { supabase } from './supabase'
import type { ProjectDoc } from '../types'

/** The private bucket you create once in Supabase (see the setup SQL). */
const BUCKET = 'project-files'

/** How long a shared link stays valid: ~1 year, expressed in seconds. */
const LINK_TTL_SECONDS = 60 * 60 * 24 * 365

/** Strip characters that don't belong in a storage path; cap the length. */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
}

/**
 * Upload ONE file for a project. Returns the pointer we save in app state.
 * Throws if there's no cloud connection or the upload fails (the caller shows
 * the message). The storage path is `<projectId>/<random>-<filename>` — the
 * random prefix means two files with the same name never collide.
 */
export async function uploadProjectFile(projectId: number, file: File): Promise<ProjectDoc> {
  if (!supabase) throw new Error('No cloud connection — files need the Supabase backend.')
  const path = `${projectId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return {
    name: file.name,
    addedAt: new Date().toLocaleDateString(),
    path,
    size: file.size,
    type: file.type || undefined,
  }
}

/** Delete a file from the locker. No-op without a connection. */
export async function deleteProjectFile(path: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

/**
 * Mint a fresh, time-limited link to view/download a private file. This is the
 * URL we hand to the OS share sheet, or drop into an email / text.
 */
export async function getShareUrl(path: string): Promise<string> {
  if (!supabase) throw new Error('No cloud connection.')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}
