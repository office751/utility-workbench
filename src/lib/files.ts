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

/** PUBLIC bucket for Selections-catalog option photos (swatches/samples shown
 *  to clients). Non-sensitive → public + stable URLs. See
 *  supabase/setup-selection-images.sql. */
const SELECTION_IMAGES_BUCKET = 'selection-images'

/** How long a shared link stays valid: ~1 year, expressed in seconds. */
const LINK_TTL_SECONDS = 60 * 60 * 24 * 365

/** Strip characters that don't belong in a storage path; cap the length. */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
}

/**
 * Upload ONE file under a folder prefix. Returns the pointer we save in app
 * state. Throws if there's no cloud connection or the upload fails (the
 * caller shows the message).
 *
 * Path shape: `<prefix>/<random>/<filename>`. The random part is its OWN
 * folder, NOT a name prefix — that keeps two files with the same name from
 * colliding while leaving the LAST path segment a clean filename. So a shared
 * link previews as "Energy_Calcs.pdf", not "<long-random-id>-Energy_Calcs.pdf".
 */
async function uploadTo(prefix: string, file: File): Promise<ProjectDoc> {
  if (!supabase) throw new Error('No cloud connection — files need the Supabase backend.')
  const path = `${prefix}/${crypto.randomUUID()}/${safeName(file.name)}`
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

/** A project's file (Files box on the project pages): `<projectId>/…`. */
export function uploadProjectFile(projectId: number, file: File): Promise<ProjectDoc> {
  return uploadTo(String(projectId), file)
}

/** A model's plan file (📐 Models library): `models/<modelKey>/…`. */
export function uploadModelFile(modelKey: string, file: File): Promise<ProjectDoc> {
  return uploadTo(`models/${safeName(modelKey)}`, file)
}

/**
 * Upload ONE Selections-catalog option photo and return its STABLE public URL
 * (no signing/expiry — see the public bucket). Throws without a connection or
 * if the bucket isn't set up yet (the editor then falls back to pasting a URL).
 */
export async function uploadSelectionImage(file: File): Promise<string> {
  if (!supabase) throw new Error('No cloud connection — image uploads need the Supabase backend.')
  const path = `options/${crypto.randomUUID()}/${safeName(file.name)}`
  const { error } = await supabase.storage.from(SELECTION_IMAGES_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from(SELECTION_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
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
