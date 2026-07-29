/**
 * V16.1 — Corporate Information Provider.
 *
 * Assembles the canonical Corporate Information Model from all enterprise modules.
 * The provider never owns data — it only composes from registered sources.
 */
import type { DocumentModel } from '../document/documentModel';
import {
  buildCorporateInformationNarratives,
  levelOfAssuranceLabel,
} from './formatting';
import {
  buildCorporateInformationContext,
  getCorporateInformationSources,
} from './sources';
import { validateCorporateInformation } from './validation';
import type {
  CorporateInformationField,
  CorporateInformationModel,
  CorporateInformationSlice,
  EngagementInformation,
  EntityIdentity,
  LevelOfAssurance,
} from './types';

function mergeEntityIdentity(
  base: EntityIdentity,
  partial?: Partial<EntityIdentity>,
): EntityIdentity {
  if (!partial) return base;
  return {
    registeredName: partial.registeredName ?? base.registeredName,
    tradingName: partial.tradingName ?? base.tradingName,
    registrationNumber: partial.registrationNumber ?? base.registrationNumber,
    natureOfBusiness: partial.natureOfBusiness ?? base.natureOfBusiness,
    countryOfIncorporation: partial.countryOfIncorporation ?? base.countryOfIncorporation,
    reportingFramework: partial.reportingFramework ?? base.reportingFramework,
    entityType: partial.entityType ?? base.entityType,
  };
}

function mergeEngagement(
  base: EngagementInformation,
  partial?: Partial<EngagementInformation>,
): EngagementInformation {
  if (!partial) return base;
  return {
    reportingPeriod: partial.reportingPeriod ?? base.reportingPeriod,
    comparativePeriod: partial.comparativePeriod ?? base.comparativePeriod,
    reportingCurrency: partial.reportingCurrency ?? base.reportingCurrency,
    functionalCurrency: partial.functionalCurrency ?? base.functionalCurrency,
    preparedBy: partial.preparedBy ?? base.preparedBy,
    reviewedBy: partial.reviewedBy ?? base.reviewedBy,
    partner: partial.partner ?? base.partner,
    approvalDate: partial.approvalDate ?? base.approvalDate,
    authorisationDate: partial.authorisationDate ?? base.authorisationDate,
    issueDate: partial.issueDate ?? base.issueDate,
  };
}

function emptyField<T>(
  metadata: CorporateInformationField<T>['metadata'],
  source: CorporateInformationField<T>['source'],
): CorporateInformationField<T | null> {
  return { value: null, metadata, source, formatted: null };
}

function emptyEntityIdentity(): EntityIdentity {
  return {
    registeredName: emptyField('required', 'company_profile'),
    tradingName: emptyField('optional', 'company_profile'),
    registrationNumber: emptyField('required', 'company_profile'),
    natureOfBusiness: emptyField('optional', 'company_profile'),
    countryOfIncorporation: emptyField('optional', 'company_profile'),
    reportingFramework: emptyField('required', 'financial_configuration'),
    entityType: emptyField('optional', 'company_profile'),
  };
}

function emptyEngagement(): EngagementInformation {
  return {
    reportingPeriod: emptyField('required', 'engagement'),
    comparativePeriod: emptyField('optional', 'engagement'),
    reportingCurrency: emptyField('required', 'engagement'),
    functionalCurrency: emptyField('required', 'financial_configuration'),
    preparedBy: emptyField('optional', 'engagement'),
    reviewedBy: emptyField('optional', 'engagement'),
    partner: emptyField('optional', 'engagement'),
    approvalDate: emptyField('conditional', 'approval_workflow'),
    authorisationDate: emptyField('conditional', 'approval_workflow'),
    issueDate: emptyField('derived', 'approval_workflow'),
  };
}

function mergeSlices(slices: CorporateInformationSlice[]): CorporateInformationSlice {
  const merged: CorporateInformationSlice = {};
  for (const slice of slices) {
    if (slice.entityIdentity) {
      merged.entityIdentity = { ...merged.entityIdentity, ...slice.entityIdentity };
    }
    if (slice.addresses) {
      merged.addresses = [...(merged.addresses || []), ...slice.addresses];
    }
    if (slice.governance) {
      merged.governance = [...(merged.governance || []), ...slice.governance];
    }
    if (slice.directors) {
      merged.directors = [...(merged.directors || []), ...slice.directors];
    }
    if (slice.principalBankers) {
      merged.principalBankers = [...(merged.principalBankers || []), ...slice.principalBankers];
    }
    if (slice.taxRegistrations) {
      merged.taxRegistrations = [...(merged.taxRegistrations || []), ...slice.taxRegistrations];
    }
    if (slice.engagement) {
      merged.engagement = { ...merged.engagement, ...slice.engagement };
    }
    if (slice.levelOfAssurance) {
      merged.levelOfAssurance = slice.levelOfAssurance;
    }
  }
  return merged;
}

function fingerprintModel(model: CorporateInformationModel): string {
  const lines = ['V16.1'];
  lines.push(`RN|${model.entityIdentity.registeredName.formatted}`);
  lines.push(`REG|${model.entityIdentity.registrationNumber.formatted}`);
  lines.push(`DIR|${model.directors.filter((d) => d.active).map((d) => d.name).join(',')}`);
  lines.push(`GOV|${model.governance.map((g) => `${g.role}:${g.name}`).join(',')}`);
  lines.push(`BNK|${model.principalBankers.filter((b) => b.active).map((b) => b.bankName).join(',')}`);
  lines.push(`TAX|${model.taxRegistrations.map((t) => t.number).join(',')}`);
  lines.push(`LOA|${model.levelOfAssurance.value}`);
  lines.push(`VAL|${model.validation.passed ? 1 : 0}`);
  return lines.join('\n');
}

/**
 * Provide the canonical Corporate Information Model for a document.
 * Single entry point for all publication formats.
 */
export function provideCorporateInformation(model: DocumentModel): CorporateInformationModel {
  const ctx = buildCorporateInformationContext(model);
  const sources = getCorporateInformationSources();
  const merged = mergeSlices(sources.map((s) => s.read(ctx)));

  const entityIdentity = mergeEntityIdentity(emptyEntityIdentity(), merged.entityIdentity);
  const engagement = mergeEngagement(emptyEngagement(), merged.engagement);

  const level: LevelOfAssurance = merged.levelOfAssurance ?? 'unaudited_financial_statements';
  const levelOfAssurance: CorporateInformationField<LevelOfAssurance> = {
    value: level,
    metadata: 'computed',
    source: 'engagement',
    formatted: levelOfAssuranceLabel(level),
  };

  const draft: CorporateInformationModel = {
    version: '16.1',
    entityIdentity,
    addresses: merged.addresses || [],
    governance: merged.governance || [],
    directors: merged.directors || [],
    principalBankers: merged.principalBankers || [],
    taxRegistrations: merged.taxRegistrations || [],
    engagement,
    levelOfAssurance,
    validation: { passed: true, issues: [], requiredMissing: 0, optionalMissing: 0 },
    modelFingerprint: '',
  };

  draft.validation = validateCorporateInformation(draft);
  draft.modelFingerprint = fingerprintModel(draft);
  return draft;
}

/** Convert corporate information model to composition narratives. */
export function corporateInformationToNarratives(
  corporateInfo: CorporateInformationModel,
): Array<{ id: string; kind: 'narrative'; text: string }> {
  const rows = buildCorporateInformationNarratives(corporateInfo);
  return rows.map((r, i) => ({
    id: `corp-info-${i}`,
    kind: 'narrative' as const,
    text: `${r.label}: ${r.value}`,
  }));
}
