/**
 * SetPassword.tsx — shown when someone lands via an INVITE link (a new teammate
 * finishing setup) or a PASSWORD-RESET link. They choose a password, which we
 * save with supabase.auth.updateUser({ password }); then onDone() hands them
 * back to the normal app (which routes by their role).
 *
 * No password is ever set by the admin or sent in plaintext — the user picks
 * their own here, over TLS. This is the back half of the invite flow.
 */
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { APP_ICON, APP_NAME } from '../lib/brand'

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Those passwords don't match.")
      return
    }
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>You're all set ✓</h1>
          <p className="meta">Your password is saved. Continue to your workspace.</p>
          <button className="primary" onClick={onDone}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>
          {APP_ICON} {APP_NAME}
        </h1>
        <p className="meta">Welcome! Choose a password to finish setting up your account.</p>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !password || !confirm}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}

export default SetPassword
