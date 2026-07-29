/** Beta analytics dashboard access — comma-separated emails in VITE_BETA_ANALYTICS_ALLOWLIST */

export function isBetaAnalyticsAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  const raw = import.meta.env.VITE_BETA_ANALYTICS_ALLOWLIST as string | undefined;
  if (!raw?.trim()) return false;
  const allow = new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  return allow.has(email.toLowerCase());
}
