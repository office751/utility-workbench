/**
 * useAuth.ts — tracks whether you're signed in (the Supabase session).
 *
 * `session` is null when logged out, an object when logged in. `loading` is
 * true only for the brief moment we're checking on first load. The listener
 * keeps it live, so signing in/out anywhere updates the whole app instantly.
 *
 * `recovery` is true when the user arrived via an INVITE or PASSWORD-RESET link
 * — they have a temporary session but still need to choose a password before
 * using the app. Root renders the SetPassword screen while it's true. We detect
 * it two ways (belt + suspenders): the URL the link lands on carries
 * `type=invite|recovery` in its hash, and Supabase also fires a
 * 'PASSWORD_RECOVERY' auth event once it processes that hash.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Read synchronously at module load, BEFORE Supabase strips the hash from the URL.
const arrivedViaLink =
  typeof window !== 'undefined' && /[#&?]type=(invite|recovery|signup)/.test(window.location.hash)

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(arrivedViaLink)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading, recovery, clearRecovery: () => setRecovery(false) }
}
