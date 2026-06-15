/**
 * Login.tsx — the sign-in screen, shown until you're authenticated.
 *
 * Email + password against Supabase Auth. There's no public "sign up" here on
 * purpose — accounts are created in the Supabase dashboard, so randoms can't
 * register themselves into your data. Once signed in, Supabase remembers you
 * on this device until you sign out.
 */
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useBrand } from '../hooks/useBrand'
import { BRAND_TOOLTIP } from '../lib/brand'

function Login() {
  const brand = useBrand()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={signIn}>
        <h1 title={BRAND_TOOLTIP}>
          {brand.icon} {brand.name}
        </h1>
        <p className="meta">Sign in to your command center.</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default Login
