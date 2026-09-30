/**
 * V16.1 — Corporate Information Presentation Builder.
 *
 * Transforms CorporateInformationModel into professional publication layout rows.
 * All formatting rules live here — renderers only position pre-formatted content.
 */
import { formatBanker } from './formatting';
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

/** The level of assurance written the way a general information page states it. */
function levelOfAssuranceSentence(model: CorporateInformationModel): string | null {
  const label = String(model.levelOfAssurance.formatted || '');
  if (!label) return null;
  if (/audit/i.test(label)) {
    return 'These annual financial statements have been audited in compliance with the applicable requirements of the Companies Act of South Africa.';
  }
  if (/review/i.test(label)) {
    return 'These annual financial statements have been independently reviewed in compliance with the applicable requirements of the Companies Act of South Africa.';
  }
  if (/compil/i.test(label)) {
    return 'These annual financial statements have been compiled by an accounting practitioner.';
  }
  return 'These annual financial statements are unaudited.';
}

/**
 * Build the general information page from the canonical model — one flat
 * label/value list in the order a published set of annual financial
 * statements presents it: the entity, the people, the addresses, the
 * practitioners, and how the statements were prepared. Engagement workflow
 * metadata (who reviewed, which partner, reporting currency) stays out of
 * the published page.
 */
export function buildCorporateInformationPresentation(
  model: CorporateInformationModel,
): CorporateInformationPresentation {
  const rows: CorporateInformationPresentationRow[] = [];

  pushSingle(
    rows,
    'country',
    'Country of incorporation and domicile',
    model.entityIdentity.countryOfIncorporation.formatted || 'South Africa',
  );
  pushSingle(
    rows,
    'nob',
    'Nature of business and principal activities',
    model.entityIdentity.natureOfBusiness.formatted,
  );

  const activeDirectors = model.directors.filter((d) => d.active);
  if (activeDirectors.length) {
    rows.push({
      kind: 'person_list',
      id: 'directors-list',
      label: 'Directors',
      people: activeDirectors.map((d) => ({ name: d.name, detail: null })),
    });
  }

  const addressLabels: Record<string, string> = {
    registered_office: 'Registered office',
    business_address: 'Business address',
    postal_address: 'Postal address',
    physical_address: 'Physical address',
  };
  for (const kind of ['registered_office', 'business_address', 'postal_address', 'physical_address']) {
    const addr = model.addresses.find((a) => a.kind === kind && a.value.trim());
    if (!addr) continue;
    const lines = splitAddressLines(addr.value);
    rows.push({
      kind: 'address_block',
      id: `addr-${addr.kind}`,
      label: addressLabels[kind],
      lines: lines.length ? lines : [addr.value.trim()],
    });
  }
  for (const kind of ['telephone', 'email', 'website']) {
    const addr = model.addresses.find((a) => a.kind === kind && a.value.trim());
    if (addr) pushSingle(rows, `addr-${kind}`, kind.charAt(0).toUpperCase() + kind.slice(1), addr.value);
  }

  const bankers = model.principalBankers.filter((b) => b.active);
  if (bankers.length) {
    rows.push({
      kind: 'banker_list',
      id: 'bankers-list',
      label: 'Bankers',
      bankers: bankers.map((b) => ({
        name: b.bankName,
        detail: formatBanker(b).replace(b.bankName, '').replace(/^,\s*/, '') || null,
      })),
    });
  }

  const practitionerLabels: Record<string, string> = {
    auditor: 'Auditors',
    independent_reviewer: 'Independent reviewers',
    accounting_officer: 'Accounting officer',
    company_secretary: 'Company secretary',
  };
  for (const role of ['auditor', 'independent_reviewer', 'accounting_officer', 'company_secretary']) {
    const entry = model.governance.find((g) => g.role === role && g.name.trim());
    if (entry) pushSingle(rows, `gov-${role}`, practitionerLabels[role], entry.name);
  }

  pushSingle(
    rows,
    'reg-no',
    'Company registration number',
    model.entityIdentity.registrationNumber.formatted,
  );

  const applicableTax = model.taxRegistrations.filter((t) => t.applicable && t.number.trim());
  if (applicableTax.length) {
    rows.push({
      kind: 'tax_list',
      id: 'tax-list',
      label: 'Tax registrations',
      items: applicableTax.map((t) => ({ label: t.label, number: t.number })),
    });
  }

  const assurance = levelOfAssuranceSentence(model);
  if (assurance) rows.push({ kind: 'paragraph', id: 'loa', label: 'Level of assurance', value: assurance });

  if (model.engagement.preparedBy.formatted) {
    rows.push({
      kind: 'paragraph',
      id: 'prepared',
      label: 'Preparer',
      value: `The annual financial statements were compiled by: ${model.engagement.preparedBy.formatted}`,
    });
  }
  pushSingle(rows, 'issue', 'Issued', model.engagement.issueDate.formatted);

  return {
    version: '16.1',
    title: 'General Information',
    sections: [{ id: 'general', title: 'General Information', rows }],
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
