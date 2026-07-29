/**
 * Reporting permissions — Enterprise Reporting Platform (V3.6.3)
 *
 * Lightweight gate. Does not replace app auth; evaluates report definition permissions.
 */

import type { ReportDefinition, ReportPermission } from '../registry/reportDefinition';

export type PermissionContext = {
  roles?: string[];
  permissions?: string[];
};

export function canAccessReport(
  definition: Pick<ReportDefinition, 'permissions'>,
  ctx: PermissionContext = {}
): boolean {
  return evaluatePermissions(definition.permissions, ctx);
}

export function evaluatePermissions(
  required: ReportPermission | undefined,
  ctx: PermissionContext = {}
): boolean {
  if (!required) return true;
  const needRoles = required.roles ?? [];
  const needPerms = required.permissions ?? [];

  if (needRoles.length === 0 && needPerms.length === 0) return true;

  const roles = new Set((ctx.roles ?? []).map((r) => r.toLowerCase()));
  const perms = new Set((ctx.permissions ?? []).map((p) => p.toLowerCase()));

  // Grant when any required role OR any required permission matches.
  const roleOk = needRoles.some((r) => roles.has(r.toLowerCase()));
  const permOk = needPerms.some((p) => perms.has(p.toLowerCase()));
  return roleOk || permOk;
}
