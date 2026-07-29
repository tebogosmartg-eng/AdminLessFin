/**
 * V16.1 — Corporate Information Presentation Builder.
 *
 * Transforms CorporateInformationModel into professional publication layout rows.
 * All formatting rules live here — renderers only position pre-formatted content.
 */
import { formatBanker, formatDirectorName, levelOfAssuranceLabel } from './formatting';
import type { CorporateInformationModel } from './types';
import type {
  CorporateInformationPresentation,
  CorporateInformationPresentationRow,
} from './presentationTypes';

function splitAddressLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function fingerprint(rows: CorporateInformationPresentationRow[]): string {
  const lines = ['V16.1-PRES'];
  for (const row of rows) {
    switch (row.kind) {
      case 'group_header':
        lines.push(`GH|${row.label}`);
        break;
      case 'single':
        lines.push(`S|${row.label}|${row.value}`);
        break;
      case 'paragraph':
        lines.push(`P|${row.label}|${row.value}`);
        break;
      case 'address_block':
        lines.push(`A|${row.label}|${row.lines.join('|')}`);
        break;
      case 'person_list':
        lines.push(`PL|${row.label}|${row.people.map((p) => p.name).join(',')}`);
        break;
      case 'banker_list':
        lines.push(`BL|${row.label}|${row.bankers.map((b) => b.name).join(',')}`);
        break;
      case 'tax_list':
        lines.push(`TL|${row.label}|${row.items.map((t) => t.number).join(',')}`);
        break;
      case 'spacer':
        lines.push(`SP|${row.height}`);
        break;
    }
  }
  return lines.join('\n');
}

function pushSingle(
  rows: CorporateInformationPresentationRow[],
  id: string,
  label: string,
  value: string | null | undefined,
): void {
  const v = String(value ?? '').trim();
  if (v) rows.push({ kind: 'single', id, label, value: v });
}

function buildEntitySection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const rows: CorporateInformationPresentationRow[] = [];
  rows.push({ kind: 'group_header', id: 'grp-entity', label: 'Entity Identity' });
  pushSingle(rows, 'reg-name', 'Registered name', model.entityIdentity.registeredName.formatted);
  pushSingle(rows, 'reg-no', 'Registration number', model.entityIdentity.registrationNumber.formatted);
  pushSingle(rows, 'trading', 'Trading name', model.entityIdentity.tradingName.formatted);
  pushSingle(rows, 'nob', 'Nature of business', model.entityIdentity.natureOfBusiness.formatted);
  pushSingle(rows, 'country', 'Country of incorporation', model.entityIdentity.countryOfIncorporation.formatted);
  pushSingle(rows, 'etype', 'Entity type', model.entityIdentity.entityType.formatted);
  pushSingle(rows, 'framework', 'Reporting framework', model.entityIdentity.reportingFramework.formatted);
  return rows;
}

function buildAddressSection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const rows: CorporateInformationPresentationRow[] = [];
  const addressLabels: Record<string, string> = {
    registered_office: 'Registered office',
    business_address: 'Business address',
    postal_address: 'Postal address',
    physical_address: 'Physical address',
    website: 'Website',
    email: 'Email',
    telephone: 'Telephone',
  };
  const addresses = model.addresses.filter((a) => a.value.trim());
  if (!addresses.length) return rows;

  rows.push({ kind: 'group_header', id: 'grp-addresses', label: 'Addresses' });
  for (const addr of addresses) {
    const label = addressLabels[addr.kind] || addr.kind;
    const lines = splitAddressLines(addr.value);
    if (lines.length <= 1 && ['website', 'email', 'telephone'].includes(addr.kind)) {
      pushSingle(rows, `addr-${addr.kind}`, label, addr.value);
    } else {
      rows.push({
        kind: 'address_block',
        id: `addr-${addr.kind}`,
        label,
        lines: lines.length ? lines : [addr.value.trim()],
      });
    }
  }
  return rows;
}

function buildGovernanceSection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const rows: CorporateInformationPresentationRow[] = [];
  if (!model.governance.length) return rows;

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

  rows.push({ kind: 'group_header', id: 'grp-governance', label: 'Governance' });
  for (const gov of model.governance) {
    pushSingle(rows, `gov-${gov.role}`, governanceLabels[gov.role] || gov.role, gov.name);
  }
  return rows;
}

function buildDirectorsSection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const active = model.directors.filter((d) => d.active);
  if (!active.length) return [];
  return [
    { kind: 'group_header', id: 'grp-directors', label: 'Directors' },
    {
      kind: 'person_list',
      id: 'directors-list',
      label: 'Directors',
      people: active.map((d) => ({
        name: formatDirectorName(d),
        detail: d.appointmentDate ? `Appointed ${d.appointmentDate}` : null,
      })),
    },
  ];
}

function buildBankersSection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const active = model.principalBankers.filter((b) => b.active);
  if (!active.length) return [];
  return [
    { kind: 'group_header', id: 'grp-bankers', label: 'Principal Bankers' },
    {
      kind: 'banker_list',
      id: 'bankers-list',
      label: 'Principal bankers',
      bankers: active.map((b) => ({
        name: b.bankName,
        detail: formatBanker(b).replace(b.bankName, '').replace(/^,\s*/, '') || null,
      })),
    },
  ];
}

function buildTaxSection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const applicable = model.taxRegistrations.filter((t) => t.applicable && t.number.trim());
  if (!applicable.length) return [];
  return [
    { kind: 'group_header', id: 'grp-tax', label: 'Tax Registrations' },
    {
      kind: 'tax_list',
      id: 'tax-list',
      label: 'Tax registrations',
      items: applicable.map((t) => ({ label: t.label, number: t.number })),
    },
  ];
}

function buildEngagementSection(model: CorporateInformationModel): CorporateInformationPresentationRow[] {
  const rows: CorporateInformationPresentationRow[] = [];
  const e = model.engagement;
  const hasEngagement =
    e.reportingPeriod.formatted ||
    e.comparativePeriod.formatted ||
    e.reportingCurrency.formatted ||
    e.functionalCurrency.formatted ||
    model.levelOfAssurance.formatted ||
    e.preparedBy.formatted ||
    e.reviewedBy.formatted ||
    e.partner.formatted ||
    e.approvalDate.formatted ||
    e.authorisationDate.formatted ||
    e.issueDate.formatted;

  if (!hasEngagement) return rows;

  rows.push({ kind: 'group_header', id: 'grp-engagement', label: 'Engagement Information' });
  pushSingle(rows, 'rep-period', 'Reporting period', e.reportingPeriod.formatted);
  pushSingle(rows, 'comp-period', 'Comparative period', e.comparativePeriod.formatted);
  pushSingle(rows, 'rep-currency', 'Reporting currency', e.reportingCurrency.formatted);
  pushSingle(rows, 'func-currency', 'Functional currency', e.functionalCurrency.formatted);
  pushSingle(rows, 'loa', 'Level of assurance', model.levelOfAssurance.formatted);
  pushSingle(rows, 'prepared', 'Prepared by', e.preparedBy.formatted);
  pushSingle(rows, 'reviewed', 'Reviewed by', e.reviewedBy.formatted);
  pushSingle(rows, 'partner', 'Partner', e.partner.formatted);
  pushSingle(rows, 'approval', 'Approval date', e.approvalDate.formatted);
  pushSingle(rows, 'auth', 'Authorisation date', e.authorisationDate.formatted);
  pushSingle(rows, 'issue', 'Issue date', e.issueDate.formatted);
  return rows;
}

/** Build professional corporate information presentation from canonical model. */
export function buildCorporateInformationPresentation(
  model: CorporateInformationModel,
): CorporateInformationPresentation {
  const sectionBuilders = [
    { id: 'entity', title: 'Entity Identity', build: buildEntitySection },
    { id: 'addresses', title: 'Addresses', build: buildAddressSection },
    { id: 'governance', title: 'Governance', build: buildGovernanceSection },
    { id: 'directors', title: 'Directors', build: buildDirectorsSection },
    { id: 'bankers', title: 'Principal Bankers', build: buildBankersSection },
    { id: 'tax', title: 'Tax Registrations', build: buildTaxSection },
    { id: 'engagement', title: 'Engagement Information', build: buildEngagementSection },
  ];

  const sections: CorporateInformationPresentation['sections'] = [];
  const rows: CorporateInformationPresentationRow[] = [];

  for (const sb of sectionBuilders) {
    const sectionRows = sb.build(model);
    if (sectionRows.length) {
      sections.push({ id: sb.id, title: sb.title, rows: sectionRows });
      if (rows.length) rows.push({ kind: 'spacer', id: `sp-${sb.id}`, height: 6 });
      rows.push(...sectionRows);
    }
  }

  return {
    version: '16.1',
    title: 'Corporate Information',
    sections,
    rows,
    presentationFingerprint: fingerprint(rows),
  };
}

/** Legacy narrative compatibility — derived from presentation rows. */
export function presentationToNarratives(
  presentation: CorporateInformationPresentation,
): Array<{ id: string; kind: 'narrative'; text: string }> {
  const out: Array<{ id: string; kind: 'narrative'; text: string }> = [];
  let idx = 0;
  for (const row of presentation.rows) {
    switch (row.kind) {
      case 'group_header':
        out.push({ id: `corp-n-${idx++}`, kind: 'narrative', text: row.label, bold: true } as never);
        break;
      case 'single':
        out.push({ id: `corp-n-${idx++}`, kind: 'narrative', text: `${row.label}: ${row.value}` });
        break;
      case 'paragraph':
        out.push({ id: `corp-n-${idx++}`, kind: 'narrative', text: `${row.label}: ${row.value}` });
        break;
      case 'address_block':
        out.push({
          id: `corp-n-${idx++}`,
          kind: 'narrative',
          text: `${row.label}:\n${row.lines.join('\n')}`,
        });
        break;
      case 'person_list':
        out.push({
          id: `corp-n-${idx++}`,
          kind: 'narrative',
          text: `${row.label}:\n${row.people.map((p) => p.name).join('\n')}`,
        });
        break;
      case 'banker_list':
        out.push({
          id: `corp-n-${idx++}`,
          kind: 'narrative',
          text: `${row.label}:\n${row.bankers.map((b) => (b.detail ? `${b.name}, ${b.detail}` : b.name)).join('\n')}`,
        });
        break;
      case 'tax_list':
        out.push({
          id: `corp-n-${idx++}`,
          kind: 'narrative',
          text: row.items.map((t) => `${t.label}: ${t.number}`).join('\n'),
        });
        break;
      default:
        break;
    }
  }
  return out;
}

export type { CorporateInformationPresentation, CorporateInformationPresentationRow };
