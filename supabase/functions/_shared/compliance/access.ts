/**
 * Access rules for the compliance module (ADR-0004, decision 3).
 *
 * Version 1 is owner and admin only, enforced here on the server — not only
 * by the route guard. Every row the service role touches is checked against
 * the company taken from the verified request, never from the body alone.
 */
import type { EvidenceSourceTable, ObligationRow } from './types.ts';
import { EVIDENCE_SOURCE_TABLES } from './types.ts';

export class ComplianceAccessError extends Error {}

export const COMPLIANCE_ROLES = ['owner', 'admin'] as const;

export function isComplianceRole(role: unknown): boolean {
  return typeof role === 'string' && (COMPLIANCE_ROLES as readonly string[]).includes(role);
}

/**
 * `membership` is the caller's company_users row for the requested company,
 * or null when they have none. A member, or a user of another company, is
 * refused with the same message so the response does not reveal which.
 */
export function assertComplianceAccess(membership: { role?: unknown } | null | undefined): void {
  if (!membership || !isComplianceRole(membership.role)) {
    throw new ComplianceAccessError('Permission denied.');
  }
}

export function assertSameCompany(
  row: { company_id?: unknown } | null | undefined,
  companyId: string,
  what = 'record',
): void {
  if (!row || row.company_id !== companyId) {
    throw new ComplianceAccessError(`That ${what} was not found.`);
  }
}

export function assertEvidenceSourceTable(table: unknown): asserts table is EvidenceSourceTable {
  if (!(EVIDENCE_SOURCE_TABLES as readonly unknown[]).includes(table)) {
    throw new ComplianceAccessError('That kind of record cannot be linked as proof.');
  }
}

export const EVIDENCE_BUCKET = 'compliance-evidence';
export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;
export const EVIDENCE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'text/plain',
] as const;

export function assertEvidenceFile(input: { mimeType: unknown; sizeBytes: unknown; fileName: unknown }): void {
  if (!(EVIDENCE_MIME_TYPES as readonly unknown[]).includes(input.mimeType)) {
    throw new ComplianceAccessError('Upload a PDF, image, Word, Excel or text file.');
  }
  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) throw new ComplianceAccessError('The file is empty.');
  if (size > EVIDENCE_MAX_BYTES) throw new ComplianceAccessError('Files must be 20 MB or smaller.');
  if (typeof input.fileName !== 'string' || !input.fileName.trim() || input.fileName.length > 200) {
    throw new ComplianceAccessError('The file needs a name under 200 characters.');
  }
}

/** Object keys are never reused: company / cycle / random id. */
export function evidenceObjectPath(companyId: string, cycleId: string, objectId: string): string {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (![companyId, cycleId, objectId].every((v) => uuid.test(v))) {
    throw new ComplianceAccessError('Invalid evidence location.');
  }
  return `${companyId}/${cycleId}/${objectId}`;
}

export function assertEvidencePathBelongs(path: string, companyId: string, cycleId: string): void {
  if (!path.startsWith(`${companyId}/${cycleId}/`)) {
    throw new ComplianceAccessError('That file does not belong to this record.');
  }
}

export type CompanyMember = { user_id: string; role: string };

/**
 * Who receives a reminder: the responsible person while they are still an
 * owner or admin; otherwise every owner. `fallback` says the responsible
 * person no longer qualifies (the scheduler then clears the assignment and
 * records an event).
 */
export function reminderRecipients(
  obligation: Pick<ObligationRow, 'responsible_user_id'>,
  members: CompanyMember[],
): { recipients: string[]; fallback: boolean } {
  const responsible = obligation.responsible_user_id;
  if (responsible) {
    const m = members.find((x) => x.user_id === responsible);
    if (m && isComplianceRole(m.role)) return { recipients: [responsible], fallback: false };
  }
  const owners = members.filter((m) => m.role === 'owner').map((m) => m.user_id).sort();
  return { recipients: owners, fallback: !!responsible };
}

export function eligibleResponsibleUsers(members: CompanyMember[]): string[] {
  return members.filter((m) => isComplianceRole(m.role)).map((m) => m.user_id);
}
