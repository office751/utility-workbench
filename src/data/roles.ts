/**
 * roles.ts — the ROLE MODEL for multi-user access (pure config).
 *
 * Iron Shield's workbench is moving from "two owner logins" to real
 * role-based access: office@ is the admin, and other people get their own
 * login scoped to only what they need. This file is the single source of
 * truth for WHO sees WHAT — every UI gate reads from here, and the database
 * RLS policies (supabase/migrations-PROPOSED/0006…) mirror it server-side.
 *
 * Two tiers of separation, by trust level:
 *   • INTERNAL roles (admin / business owner / project manager / coworker)
 *     read the workbench itself; the app hides tabs + sensitive fields per
 *     role. (Frontend gating — fine for trusted staff. Truly sensitive data
 *     like financials can be split out of the blob later if needed.)
 *   • EXTERNAL role (investor) NEVER reads the workbench — it only sees the
 *     curated projection (shared_files / snapshots / comments), enforced by
 *     RLS. This is the already-shipped investor portal; do not weaken it.
 *
 * NOTE: the existing admin row (office@) currently has role 'owner' in the DB.
 * Migration 0006 renames it to 'admin'; until that runs, treat 'owner' as
 * 'admin' (see normalizeRole below) so nothing breaks mid-rollout.
 */

/** Every login is exactly one of these. */
export type AppRole = 'admin' | 'business_owner' | 'project_manager' | 'coworker' | 'investor'

/** The main workbench tabs (mirror of App's View keys, minus settings which
 *  is its own capability flag). Used to gate the top nav per role. */
export type WorkbenchTab = 'today' | 'tasks' | 'projects' | 'models' | 'inspections'

export interface RoleConfig {
  label: string
  /** One-line, plain-English description shown when assigning a role. */
  description: string
  /** External investor uses its own scoped portal, not the workbench tabs. */
  usesInvestorPortal: boolean
  /** Which workbench tabs this role sees (ignored for the investor portal). */
  tabs: WorkbenchTab[]
  /** true = sees ONLY projects explicitly assigned to them (project_access);
   *  false = sees every project (internal staff). */
  scopedToAssignedProjects: boolean
  /** Can see money — job cost, financing, anything dollar-denominated. */
  canSeeFinancials: boolean
  /** Can open ⚙️ Settings / edit templates / app configuration. */
  canManageSettings: boolean
  /** Can create/assign other users and their roles (admin only). */
  canManageUsers: boolean
}

/**
 * The permission matrix. These are sensible STARTING defaults — Adam can
 * retune any cell; the UI and the 0006 policies both follow this table.
 */
export const ROLES: Record<AppRole, RoleConfig> = {
  admin: {
    label: 'Admin',
    description: 'Full control — every project, financials, settings, and user management. (office@)',
    usesInvestorPortal: false,
    tabs: ['today', 'tasks', 'projects', 'models', 'inspections'],
    scopedToAssignedProjects: false,
    canSeeFinancials: true,
    canManageSettings: true,
    canManageUsers: true,
  },
  business_owner: {
    label: 'Business owner',
    description: 'Sees everything across the company, including financials — but does not manage logins.',
    usesInvestorPortal: false,
    tabs: ['today', 'tasks', 'projects', 'models', 'inspections'],
    scopedToAssignedProjects: false,
    canSeeFinancials: true,
    canManageSettings: false,
    canManageUsers: false,
  },
  project_manager: {
    label: 'Project manager',
    description: 'Full operational detail on the projects assigned to them — no financials, no settings.',
    usesInvestorPortal: false,
    tabs: ['today', 'tasks', 'projects', 'models', 'inspections'],
    scopedToAssignedProjects: true,
    canSeeFinancials: false,
    canManageSettings: false,
    canManageUsers: false,
  },
  coworker: {
    label: 'Coworker',
    description: 'Day-to-day operations across all jobs (tasks, project progress, inspections) — no financials.',
    usesInvestorPortal: false,
    tabs: ['today', 'tasks', 'projects', 'inspections'],
    scopedToAssignedProjects: false,
    canSeeFinancials: false,
    canManageSettings: false,
    canManageUsers: false,
  },
  investor: {
    label: 'Investor',
    description: 'External — sees ONLY their assigned project(s): progress, shared photos, and comments.',
    usesInvestorPortal: true,
    tabs: [],
    scopedToAssignedProjects: true,
    canSeeFinancials: false,
    canManageSettings: false,
    canManageUsers: false,
  },
}

/** Order roles are offered in the "assign a role" UI (admin first, investor last). */
export const ROLE_ORDER: AppRole[] = ['admin', 'business_owner', 'project_manager', 'coworker', 'investor']

/**
 * Normalize a raw DB role string to an AppRole. The legacy admin value
 * 'owner' maps to 'admin'; an unknown/missing role falls back to 'admin'
 * (back-compat — today's logins predate this system and are trusted).
 */
export function normalizeRole(raw: string | null | undefined): AppRole {
  if (raw === 'owner' || raw == null || raw === '') return 'admin'
  if (raw in ROLES) return raw as AppRole
  return 'admin'
}

/** Convenience: the config for a (possibly legacy) raw role string. */
export function roleConfig(raw: string | null | undefined): RoleConfig {
  return ROLES[normalizeRole(raw)]
}
