/**
 * Compliance & Governance feature flags (ADR-0004). Off by default.
 *
 * Same conventions as the Financial Statements and Financial Close flags:
 * static import.meta.env access so Vite can inline them.
 *
 *  - VITE_COMPLIANCE_MODULE       master switch (routes)
 *  - VITE_COMPLIANCE_NAV_SIDEBAR  sidebar entry
 *  - VITE_COMPLIANCE_ALLOWLIST    optional pilot list of user emails or ids;
 *                                 empty means every owner and admin
 *
 * Unlike the other modules, the allowlist narrows access and never widens
 * it: a member is refused even when listed, because the server refuses them.
 */

export type ComplianceAccessOpts = {
  role?: string | null;
  userEmail?: string | null;
  userId?: string | null;
};

function readEnv(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === '') return false;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

function allowlist(): string[] {
  const raw = import.meta.env.VITE_COMPLIANCE_ALLOWLIST as string | undefined;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const complianceFlags = {
  module: () => readEnv(import.meta.env.VITE_COMPLIANCE_MODULE),
  navSidebar: () => readEnv(import.meta.env.VITE_COMPLIANCE_NAV_SIDEBAR),
};

export function isComplianceRole(role: string | null | undefined): boolean {
  const r = (role || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

export function canAccessCompliance(opts: ComplianceAccessOpts): boolean {
  if (!complianceFlags.module()) return false;
  if (!isComplianceRole(opts.role)) return false;
  const list = allowlist();
  if (!list.length) return true;
  const email = (opts.userEmail || '').toLowerCase();
  const id = (opts.userId || '').toLowerCase();
  return list.includes(email) || list.includes(id);
}

export function shouldShowComplianceNav(opts: ComplianceAccessOpts): boolean {
  return complianceFlags.navSidebar() && canAccessCompliance(opts);
}
