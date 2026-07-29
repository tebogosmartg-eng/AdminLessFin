/**
 * V16.1 — Corporate Information Formatting Engine.
 *
 * Formatting rules exist inside the Corporate Information Engine, not renderers.
 */
import type {
  AddressEntry,
  DirectorEntry,
  GovernanceEntry,
  PrincipalBanker,
  TaxRegistration,
} from './types';

export function formatSingleValue(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim();
  return v || null;
}

export function formatNameList(names: string[]): string | null {
  const filtered = names.map((n) => n.trim()).filter(Boolean);
  if (!filtered.length) return null;
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(', ')} and ${filtered[filtered.length - 1]}`;
}

export function formatDirectorName(director: DirectorEntry): string {
  const parts = [director.name.trim()];
  if (director.classifications.includes('chairperson')) parts.push('(Chairperson)');
  else if (director.role) parts.push(`(${director.role})`);
  return parts.join(' ');
}

export function formatDirectorsList(directors: DirectorEntry[]): string | null {
  const active = directors.filter((d) => d.active);
  if (!active.length) return null;
  return formatNameList(active.map(formatDirectorName));
}

export function formatAddress(entry: AddressEntry): string {
  return entry.value.trim();
}

export function formatBanker(banker: PrincipalBanker): string {
  const parts = [banker.bankName.trim()];
  if (banker.branch) parts.push(banker.branch.trim());
  if (banker.branchCode) parts.push(`(${banker.branchCode.trim()})`);
  if (banker.accountType) parts.push(`— ${banker.accountType.trim()}`);
  if (banker.swift) parts.push(`SWIFT: ${banker.swift.trim()}`);
  return parts.join(', ');
}

export function formatBankersList(bankers: PrincipalBanker[]): string | null {
  const active = bankers.filter((b) => b.active);
  if (!active.length) return null;
  return active.map(formatBanker).join('; ');
}

export function formatTaxRegistration(reg: TaxRegistration): string {
  return `${reg.label}: ${reg.number}`;
}

export function formatTaxRegistrations(regs: TaxRegistration[]): string | null {
  const applicable = regs.filter((r) => r.applicable && r.number.trim());
  if (!applicable.length) return null;
  return applicable.map(formatTaxRegistration).join('; ');
}

export function formatGovernanceRole(entry: GovernanceEntry): string {
  return entry.name.trim();
}

export function levelOfAssuranceLabel(
  level: 'independent_audit' | 'independent_review' | 'compilation_report' | 'unaudited_financial_statements',
): string {
  switch (level) {
    case 'independent_audit':
      return 'Independent Audit';
    case 'independent_review':
      return 'Independent Review';
    case 'compilation_report':
      return 'Compilation Report';
    case 'unaudited_financial_statements':
      return 'Unaudited Financial Statements';
  }
}

export type CorporateInformationNarrativeRow = {
  label: string;
  value: string;
};

/**
 * Build publication-ready narrative rows from the canonical model.
 * Only populated fields are included — never "Missing Information".
 */
export function buildCorporateInformationNarratives(model: {
  entityIdentity: {
    registeredName: { formatted: string | null };
    registrationNumber: { formatted: string | null };
    tradingName: { formatted: string | null };
    natureOfBusiness: { formatted: string | null };
    countryOfIncorporation: { formatted: string | null };
    reportingFramework: { formatted: string | null };
    entityType: { formatted: string | null };
  };
  addresses: AddressEntry[];
  governance: GovernanceEntry[];
  directors: DirectorEntry[];
  principalBankers: PrincipalBanker[];
  taxRegistrations: TaxRegistration[];
  engagement: {
    reportingPeriod: { formatted: string | null };
    comparativePeriod: { formatted: string | null };
    reportingCurrency: { formatted: string | null };
    functionalCurrency: { formatted: string | null };
    preparedBy: { formatted: string | null };
    reviewedBy: { formatted: string | null };
    partner: { formatted: string | null };
    approvalDate: { formatted: string | null };
    authorisationDate: { formatted: string | null };
    issueDate: { formatted: string | null };
  };
  levelOfAssurance: { formatted: string | null };
}): CorporateInformationNarrativeRow[] {
  const rows: CorporateInformationNarrativeRow[] = [];

  const push = (label: string, value: string | null | undefined) => {
    const v = formatSingleValue(value);
    if (v) rows.push({ label, value: v });
  };

  push('Registered name', model.entityIdentity.registeredName.formatted);
  push('Registration number', model.entityIdentity.registrationNumber.formatted);
  push('Trading name', model.entityIdentity.tradingName.formatted);
  push('Nature of business', model.entityIdentity.natureOfBusiness.formatted);
  push('Country of incorporation', model.entityIdentity.countryOfIncorporation.formatted);
  push('Entity type', model.entityIdentity.entityType.formatted);
  push('Reporting framework', model.entityIdentity.reportingFramework.formatted);

  const addressLabels: Record<string, string> = {
    registered_office: 'Registered office',
    business_address: 'Business address',
    postal_address: 'Postal address',
    physical_address: 'Physical address',
    website: 'Website',
    email: 'Email',
    telephone: 'Telephone',
  };
  for (const addr of model.addresses) {
    push(addressLabels[addr.kind] || addr.kind, addr.value);
  }

  const governanceLabels: Record<string, string> = {
    company_secretary: 'Company secretary',
    auditor: 'Auditor',
    independent_reviewer: 'Independent reviewer',
    accounting_officer: 'Accounting officer',
    partner: 'Partner',
    manager: 'Manager',
    reviewer: 'Reviewer',
    preparer: 'Preparer',
    authorised_representative: 'Authorised representative',
  };
  for (const gov of model.governance) {
    push(governanceLabels[gov.role] || gov.role, gov.name);
  }

  const directorsFormatted = formatDirectorsList(model.directors);
  if (directorsFormatted) rows.push({ label: 'Directors', value: directorsFormatted });

  const bankersFormatted = formatBankersList(model.principalBankers);
  if (bankersFormatted) rows.push({ label: 'Principal bankers', value: bankersFormatted });

  const taxFormatted = formatTaxRegistrations(model.taxRegistrations);
  if (taxFormatted) rows.push({ label: 'Tax registrations', value: taxFormatted });

  push('Reporting period', model.engagement.reportingPeriod.formatted);
  push('Comparative period', model.engagement.comparativePeriod.formatted);
  push('Reporting currency', model.engagement.reportingCurrency.formatted);
  push('Functional currency', model.engagement.functionalCurrency.formatted);
  push('Level of assurance', model.levelOfAssurance.formatted);
  push('Prepared by', model.engagement.preparedBy.formatted);
  push('Reviewed by', model.engagement.reviewedBy.formatted);
  push('Partner', model.engagement.partner.formatted);
  push('Approval date', model.engagement.approvalDate.formatted);
  push('Authorisation date', model.engagement.authorisationDate.formatted);
  push('Issue date', model.engagement.issueDate.formatted);

  return rows;
}
