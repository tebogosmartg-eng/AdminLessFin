/**
 * Pure helpers for the global company context: how a company is identified,
 * which ones were used recently, where a user lands after switching, and the
 * message other tabs listen for. No React, no network.
 */

export type SwitchableCompany = {
  id: string;
  name: string;
  tax_id?: string | null;
  user_role?: string | null;
};

/**
 * A second line that tells companies apart. Names are not unique (eight live
 * companies are called "My's Company"), so the switcher always shows one:
 * the tax number when the company has one, otherwise a short reference taken
 * from its id.
 */
export function companyIdentifier(company: Pick<SwitchableCompany, 'id' | 'tax_id'>): string {
  const tax = (company.tax_id ?? '').trim();
  if (tax) return `Tax no. ${tax}`;
  return `Ref ${company.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function companyInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return letters || '•';
}

export function roleLabel(role: string | null | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

// ---------------------------------------------------------------------------
// Recent companies (per user, this browser). A convenience only: the list is
// always intersected with the companies the server says the user belongs to.
// ---------------------------------------------------------------------------
const RECENT_PREFIX = 'adminless.recentCompanies.v1';
const RECENT_LIMIT = 5;

export function readRecentCompanyIds(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(`${RECENT_PREFIX}.${userId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecentCompany(userId: string | null | undefined, companyId: string): void {
  if (!userId) return;
  try {
    const next = [companyId, ...readRecentCompanyIds(userId).filter((id) => id !== companyId)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(`${RECENT_PREFIX}.${userId}`, JSON.stringify(next));
  } catch {
    // not remembered; nothing depends on it
  }
}

export function companyMatches(company: SwitchableCompany, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    company.name.toLowerCase().includes(q) ||
    companyIdentifier(company).toLowerCase().includes(q) ||
    (company.tax_id ?? '').toLowerCase().includes(q)
  );
}

/**
 * The switcher's groups: up to three recently used companies (never the one
 * already active), then every company in name order. Only companies from the
 * server's membership list can appear; a remembered id that is no longer in it
 * is dropped.
 */
export function groupCompaniesForSwitcher<T extends SwitchableCompany>(
  companies: T[],
  activeId: string | null | undefined,
  recentIds: string[],
): { recent: T[]; all: T[] } {
  const byId = new Map(companies.map((c) => [c.id, c]));
  const recent = recentIds
    .filter((id) => id !== activeId)
    .map((id) => byId.get(id))
    .filter((c): c is T => !!c)
    .slice(0, 3);
  const all = [...companies].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    companyIdentifier(a).localeCompare(companyIdentifier(b)),
  );
  return { recent, all };
}

/** A search box is worth showing once the list no longer fits at a glance. */
export function switcherNeedsSearch(companyCount: number): boolean {
  return companyCount > 5;
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A page for one record (an invoice, a workspace, a close) belongs to the
 * company it came from. After switching company the user goes to the list that
 * record lives in, instead of the old company's record being requested under
 * the new one. Returns null when the path names no record.
 */
export function listPathAfterSwitch(pathname: string): string | null {
  const segments = pathname.split('/');
  const idx = segments.findIndex((s) => UUID_SEGMENT.test(s));
  if (idx < 0) return null;
  const parent = segments.slice(0, idx).join('/');
  return parent || '/';
}

// ---------------------------------------------------------------------------
// Cross-tab: the active company is stored on the server (profiles), so it is
// one value for all of a user's tabs. When one tab switches, the others follow
// instead of carrying on with a company the server no longer has active.
// ---------------------------------------------------------------------------
export const CONTEXT_CHANNEL = 'adminless.context.v1';

export type ContextMessage =
  | { type: 'company-switched'; userId: string; companyId: string };

export function openContextChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CONTEXT_CHANNEL);
  } catch {
    return null;
  }
}

export function isContextMessage(value: unknown): value is ContextMessage {
  const v = value as ContextMessage | null;
  return !!v && v.type === 'company-switched' && typeof v.userId === 'string' && typeof v.companyId === 'string';
}
