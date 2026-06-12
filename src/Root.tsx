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
import App from './App'
import Login from './components/Login'
import InvestorView from './components/InvestorView'

function Root() {
  const { session, loading } = useAuth() // always called (Rules of Hooks)
  // 'pending' = looking the role up; resolves to which shell to render.
  const [role, setRole] = useState<'pending' | 'owner' | 'investor'>('pending')

  useEffect(() => {
    if (!session) {
      setRole('pending')
      return
    }
    let alive = true
    myRole().then((me) => {
      if (alive) setRole(me?.role === 'investor' ? 'investor' : 'owner')
    })
    return () => {
      alive = false
    }
  }, [session])

  if (!hasSupabase) return <App /> // no backend → local-only mode

  if (loading || (session && role === 'pending')) {
    return (
      <div className="login-wrap">
        <p className="meta">Loading…</p>
      </div>
    )
  }
  if (!session) return <Login />
  return role === 'investor' ? <InvestorView /> : <App />
}

export default Root
