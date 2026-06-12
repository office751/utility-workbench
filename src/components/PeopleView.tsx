/**
 * PeopleView.tsx — the admin "People" screen (👥). Admin-only.
 *
 * Lists every login, lets the admin set each one's ROLE and — for roles that
 * are scoped to assigned projects (project manager, investor) — pick exactly
 * which projects they can see. Writes go straight to app_users / project_access
 * (RLS lets the admin do this). Everything fails soft, so before the RBAC
 * migration runs this simply shows an empty list.
 *
 * Creating the actual login still happens in the Supabase dashboard for now
 * (the browser can't mint Auth users) — once created, the person appears here
 * to assign. See docs/rbac-plan.md.
 */
import { useEffect, useState } from 'react'
import type { Project } from '../types'
import { ROLES, ROLE_ORDER, normalizeRole } from '../data/roles'
import { allProjectAccess, listAppUsers, setUserProjects, setUserRole, type AppUserRow } from '../lib/admin'

function PeopleView({ roster }: { roster: Project[] }) {
  const [users, setUsers] = useState<AppUserRow[]>([])
  const [access, setAccess] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState('')

  async function reload() {
    const [u, a] = await Promise.all([listAppUsers(), allProjectAccess()])
    setUsers(u)
    setAccess(a)
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  function note(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash((m) => (m === msg ? '' : m)), 2500)
  }

  async function changeRole(u: AppUserRow, role: string) {
    if (await setUserRole(u.user_id, role)) {
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, role } : x)))
      note(`${u.display_name || 'User'} is now ${ROLES[normalizeRole(role)].label}.`)
    } else {
      note('Could not save the role (is the RBAC migration in place?).')
    }
  }

  async function toggleProject(u: AppUserRow, pid: number) {
    const current = access[u.user_id] ?? []
    const next = current.includes(pid) ? current.filter((x) => x !== pid) : [...current, pid]
    setAccess((prev) => ({ ...prev, [u.user_id]: next })) // optimistic
    if (!(await setUserProjects(u.user_id, next))) {
      note('Could not save project access.')
      reload()
    }
  }

  // Active projects make the assignment list manageable (skip C.O./Hold).
  const assignable = roster.filter((p) => p.listStatus !== 'CO' && p.listStatus !== 'Hold')

  return (
    <section className="detail people-view">
      <h2 className="detail-title">👥 People &amp; access</h2>
      <p className="meta">
        Set each login's role and — for project managers and investors — which projects they can see.
        Changes save automatically.
      </p>
      {flash && <div className="banner duke-next">{flash}</div>}

      {loading ? (
        <p className="summary">Loading people…</p>
      ) : users.length === 0 ? (
        <p className="summary">
          No logins to manage yet. Create a login in the Supabase dashboard (Authentication → Add user),
          then it'll appear here to assign a role.
        </p>
      ) : (
        <div className="people-list">
          {users.map((u) => {
            const cfg = ROLES[normalizeRole(u.role)]
            return (
              <div key={u.user_id} className="person card">
                <div className="person-head">
                  <span className="person-name">{u.display_name || '(unnamed login)'}</span>
                  <label className="person-role">
                    Role
                    <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                      {ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {ROLES[r].label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="person-desc muted">{cfg.description}</p>

                {cfg.scopedToAssignedProjects && (
                  <div className="person-projects">
                    <div className="tpl-preview-h">Assigned projects</div>
                    <div className="person-proj-grid">
                      {assignable.map((p) => {
                        const on = (access[u.user_id] ?? []).includes(p.id)
                        return (
                          <label key={p.id} className={'person-proj' + (on ? ' on' : '')}>
                            <input type="checkbox" checked={on} onChange={() => toggleProject(u, p.id)} />
                            {p.address}
                          </label>
                        )
                      })}
                    </div>
                    {(access[u.user_id] ?? []).length === 0 && (
                      <p className="muted">No projects assigned — this person sees nothing until you pick at least one.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="people-add card">
        <div className="tpl-preview-h">Add a person</div>
        <p className="meta">
          1. In Supabase → Authentication → <b>Add user</b>, create their email + password.<br />
          2. Add their <code>app_users</code> row (role + name) — or they'll appear here once seeded.<br />
          3. Set their role and projects above.
        </p>
        <p className="muted">A one-click in-app invite is on the roadmap (needs a small server function).</p>
      </div>
    </section>
  )
}

export default PeopleView
