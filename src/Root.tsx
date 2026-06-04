/**
 * Root.tsx — the auth gate that sits in front of the whole app.
 *
 * With a backend configured: show the Login screen until you're signed in,
 * then the app. Without a backend (no keys, e.g. a bare local checkout): just
 * run the app — so development never gets locked out.
 */
import { hasSupabase } from './lib/supabase'
import { useAuth } from './hooks/useAuth'
import App from './App'
import Login from './components/Login'

function Root() {
  const { session, loading } = useAuth() // always called (Rules of Hooks)

  if (!hasSupabase) return <App /> // no backend → local-only mode

  if (loading) {
    return (
      <div className="login-wrap">
        <p className="meta">Loading…</p>
      </div>
    )
  }
  if (!session) return <Login />
  return <App />
}

export default Root
