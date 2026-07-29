/**
 * V16.1 — Level of Assurance Engine.
 *
 * Determined automatically from engagement configuration — no manual selection in publication.
 */
import type { EfsWorkspaceGeneralInformation } from '../api';
import type { LevelOfAssurance } from './types';

export function determineLevelOfAssurance(
  entity: EfsWorkspaceGeneralInformation | null,
): LevelOfAssurance {
  const engagementType = (entity as { engagement_type?: string | null })?.engagement_type;

  if (engagementType === 'audit' || engagementType === 'independent_audit') {
    return 'independent_audit';
  }
  if (engagementType === 'independent_review') {
    return 'independent_review';
  }
  if (engagementType === 'compilation') {
    return 'compilation_report';
  }
  if (engagementType === 'internal' || engagementType === 'unaudited') {
    return 'unaudited_financial_statements';
  }

  // Derived from governance configuration when engagement type not explicitly set
  const auditor = String(entity?.auditor ?? '').trim();
  const reviewer = String(
    (entity as { independent_reviewer?: string | null })?.independent_reviewer ?? '',
  ).trim();

  if (auditor) return 'independent_audit';
  if (reviewer) return 'independent_review';

  const compilationIndicator = String(
    (entity as { compilation_engagement?: boolean | null })?.compilation_engagement ?? '',
  );
  if (compilationIndicator === 'true' || compilationIndicator === '1') {
    return 'compilation_report';
  }

  return 'unaudited_financial_statements';
}
