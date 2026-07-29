/**
 * V16.1 — Corporate Information display accessors.
 *
 * All UI and publication metadata reads shall route through the provider.
 */
import type { EfsWorkspaceGeneralInformation } from '../api';
import type { DocumentModel } from '../document/documentModel';
import { provideCorporateInformation } from './provider';

export type CorporateDisplayValues = {
  registeredName: string;
  tradingName: string;
  registrationNumber: string;
  natureOfBusiness: string;
  reportingFramework: string;
  reportingCurrency: string;
  functionalCurrency: string;
  preparedBy: string;
  reviewedBy: string;
  partner: string;
  companySecretary: string;
  auditor: string;
};

function buildStubModel(
  entity: EfsWorkspaceGeneralInformation | null | undefined,
  opts?: {
    companyId?: string;
    workspaceId?: string;
    workspaceName?: string;
    frameworkLabel?: string;
    periodLabel?: string;
  },
): DocumentModel {
  return {
    companyId: opts?.companyId || '',
    workspaceId: opts?.workspaceId || '',
    workspaceName: opts?.workspaceName || '',
    frameworkPackId: null,
    frameworkKey: null,
    frameworkLabel: opts?.frameworkLabel || entity?.reporting_framework || 'IFRS for SMEs',
    entity: entity ?? null,
    period: { label: opts?.periodLabel || entity?.financial_year_end || undefined },
    statements: [],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: false,
  };
}

/** Resolve canonical corporate display values from a DocumentModel. */
export function corporateDisplayFromModel(model: DocumentModel): CorporateDisplayValues {
  const corp = provideCorporateInformation(model);
  return {
    registeredName:
      corp.entityIdentity.registeredName.formatted || model.workspaceName || 'Reporting Entity',
    tradingName: corp.entityIdentity.tradingName.formatted || '',
    registrationNumber: corp.entityIdentity.registrationNumber.formatted || '',
    natureOfBusiness: corp.entityIdentity.natureOfBusiness.formatted || '',
    reportingFramework: corp.entityIdentity.reportingFramework.formatted || model.frameworkLabel || '',
    reportingCurrency: corp.engagement.reportingCurrency.formatted || 'ZAR',
    functionalCurrency: corp.engagement.functionalCurrency.formatted || 'ZAR',
    preparedBy: corp.engagement.preparedBy.formatted || '',
    reviewedBy: corp.engagement.reviewedBy.formatted || '',
    partner: corp.engagement.partner.formatted || '',
    companySecretary:
      corp.governance.find((g) => g.role === 'company_secretary')?.name || '',
    auditor: corp.governance.find((g) => g.role === 'auditor')?.name || '',
  };
}

/** Resolve canonical corporate display values from hydrated engagement information. */
export function corporateDisplayFromEntity(
  entity: EfsWorkspaceGeneralInformation | null | undefined,
  opts?: {
    companyId?: string;
    workspaceId?: string;
    workspaceName?: string;
    frameworkLabel?: string;
    periodLabel?: string;
  },
): CorporateDisplayValues {
  return corporateDisplayFromModel(buildStubModel(entity, opts));
}

/** Safe filename slug from corporate information. */
export function corporateFilenameSlug(model: DocumentModel): string {
  const name = corporateDisplayFromModel(model).registeredName;
  return (
    name.replace(/[^\w-]+/g, '-').slice(0, 60) || 'Annual-Financial-Statements'
  );
}
