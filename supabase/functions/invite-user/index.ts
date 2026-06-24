// supabase/functions/invite-user/index.ts
//
// Admin-only "invite a teammate by email". The browser CANNOT create auth users
// (that needs the service_role key, which must never ship to the client), so the
// 👥 People screen calls this Edge Function instead. It:
//   1. verifies the CALLER is actually an admin (a valid login is NOT enough —
//      an investor has a valid JWT too; we check their app_users role),
//   2. emails the invitee a set-password link via Supabase Auth,
//   3. sets the invitee's app_users role (whitelisted — never 'admin').
//
// Deploy:   supabase functions deploy invite-user
// Secrets:  SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//           auto-injected by the platform — nothing to set.
// Requires: custom SMTP configured in Supabase Auth (so the invite email sends)
//           and the app URL added under Auth → URL Configuration → Redirect URLs.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Lock browser access to our real origins (not '*').
const ALLOWED_ORIGINS = ['https://utility-workbench.vercel.app', 'http://localhost:5173']
// Roles this function may assign. 'admin' is deliberately excluded — mint admins
// by hand in the Supabase dashboard so nobody can invite themselves to power.
const ASSIGNABLE = ['business_owner', 'project_manager', 'coworker', 'investor']

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)
  const headers = { ...cors, 'Content-Type': 'application/json' }
  const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'POST only.')

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. WHO is calling? Their JWT rides in the Authorization header (functions.invoke adds it).
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const {
    data: { user },
    error: uErr,
  } = await caller.auth.getUser()
  if (uErr || !user) return fail(401, 'Not signed in.')

  // 2. Is the caller an ADMIN? (the critical gate — verified against app_users, server-side)
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: me } = await admin.from('app_users').select('role').eq('user_id', user.id).maybeSingle()
  if (!me || me.role !== 'admin') return fail(403, 'Admins only.')

  // 3. Validate input.
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? '')
  const displayName = String(body.displayName ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'Enter a valid email address.')
  if (!ASSIGNABLE.includes(role)) return fail(400, 'That role can’t be assigned from here.')

  // 4. Send the invite (creates the auth user + emails a set-password link).
  const redirectTo = (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]) + '/'
  const { data: inv, error: iErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (iErr || !inv?.user) return fail(400, iErr?.message ?? 'Could not send the invite.')

  // 5. Set their role + name. The signup trigger already made a 'pending' row;
  //    upsert promotes it (or creates it if the trigger isn't installed).
  const { error: rErr } = await admin
    .from('app_users')
    .upsert({ user_id: inv.user.id, role, display_name: displayName || email.split('@')[0] }, { onConflict: 'user_id' })
  if (rErr) return new Response(JSON.stringify({ ok: true, warning: 'Invited, but role not set: ' + rErr.message }), { headers })

  return new Response(JSON.stringify({ ok: true, email, role }), { headers })
})
