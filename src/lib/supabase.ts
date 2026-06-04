/**
 * supabase.ts — the cloud connection (our "backend in a box").
 *
 * Supabase is a hosted Postgres database. This file makes ONE client the rest
 * of the app talks to. The URL + key live in .env.local (gitignored) and reach
 * us through Vite's `import.meta.env`. The publishable key is safe to ship in
 * the frontend — real protection comes from the database's row-level security
 * and (soon) a login.
 *
 * If the keys are missing, `supabase` is null and the app quietly runs on
 * localStorage only — so it never hard-breaks without a connection.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabase = Boolean(url && key)

export const supabase = hasSupabase ? createClient(url as string, key as string) : null
