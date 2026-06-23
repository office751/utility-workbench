/**
 * Root.tsx — the auth gate that sits in front of the whole app.
 *
 * With a backend configured: show the Login screen until you're signed in,
 * then route by ROLE — owners get the full Workbench, investors get ONLY
 * their scoped InvestorView (no tabs, no project list; RLS on the server is
 * the real wall, this just picks the right shell). Logins with no app_users
 * row — including today's accounts until the investor-portal migrations run
 * — are treated as owners, so nothing changes ahead of the schema.
 *
 * Without a backend (no keys, e.g. a bare local checkout): just run the app
 * — so development never gets locked out.
 */
import { useEffect, useState } from 'react'
import { hasSupabase } from './lib/supabase'
import { useAuth } from './hooks/useAuth'
import { myRole } from './lib/investor'
import { normalizeRole, ROLES, type AppRole } from './data/roles'
import App from './App'
import Login from './components/Login'
import InvestorView from './components/InvestorView'

function Root() {
  const { session, loading } = useAuth() // always called (Rules of Hooks)
  // null = still looking up the role; otherwise the resolved AppRole.
  const [role, setRole] = useState<AppRole | null>(null)
  // The signed-in person's display name (app_users via myRole). Personalizes the
  // greeting and scopes "my queue" task filtering. '' until resolved / unknown.
  const [me, setMe] = useState<string>('')

  useEffect(() => {
    if (!session) {
      setRole(null)
      setMe('')
      return
    }
    let alive = true
    myRole().then((prof) => {
      if (!alive) return
      setRole(normalizeRole(prof?.role)) // missing/legacy 'owner' → admin
      setMe(prof?.name ?? '')
    })
    return () => {
      alive = false
    }
  }, [session])

  if (!hasSupabase) return <App /> // no backend → local-only mode (admin)

  if (loading || (session && role === null)) {
    return (
      <div className="login-wrap">
        <p className="meta">Loading…</p>
      </div>
    )
  }
  if (!session) return <Login />
  // Past the guards above, role is resolved. External investors get their own
  // scoped portal; every internal role gets the workbench, gated by its config.
  const r = role as AppRole
  return ROLES[r].usesInvestorPortal ? <InvestorView /> : <App role={r} me={me} />
}

export default Root
