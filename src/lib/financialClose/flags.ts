/**
 * Financial Close feature flags — EFCP V6.8.0
 * Same conventions as EFS flags (static import.meta.env access; additive only).
 */

export type EfcpAccessOpts = {
  role?: string | null;
  userEmail?: string | null;
  userId?: string | null;
};

function readEnv(raw: unknown, fallback = false): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

function allowlist(): string[] {
  const raw = import.meta.env.VITE_EFCP_ALLOWLIST as string | undefined;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const efcpFlags = {
  /** Master switch for the Financial Close module */
  module: () => readEnv(import.meta.env.VITE_EFCP_MODULE, false),
  /** Mount routes / pages */
  workspaceUi: () => readEnv(import.meta.env.VITE_EFCP_WORKSPACE_UI, false),
  /** Sidebar entry (kill-switch without redeploy) */
  navSidebar: () => readEnv(import.meta.env.VITE_EFCP_NAV_SIDEBAR, false),
};

function onAllowlist(opts: EfcpAccessOpts): boolean {
  const list = allowlist();
  if (!list.length) return false;
  const email = (opts.userEmail || '').toLowerCase();
  const id = (opts.userId || '').toLowerCase();
  return list.includes(email) || list.includes(id);
}

export function isFinancialCloseInternalPersona(opts: EfcpAccessOpts): boolean {
  const role = (opts.role || '').toLowerCase();
  if (role === 'owner' || role === 'admin') return true;
  return onAllowlist(opts);
}

function moduleOrWorkspaceEnabled(): boolean {
  return efcpFlags.workspaceUi() || efcpFlags.module();
}

export function canAccessFinancialClose(opts: EfcpAccessOpts): boolean {
  if (!moduleOrWorkspaceEnabled()) return false;
  return isFinancialCloseInternalPersona(opts);
}

export function shouldShowFinancialCloseNav(opts: EfcpAccessOpts): boolean {
  if (!efcpFlags.navSidebar()) return false;
  return canAccessFinancialClose(opts);
}
