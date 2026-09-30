/**
 * Statutory front-matter wording (V14.0).
 *
 * Shared professional narratives for the directors' responsibilities statement,
 * directors' report, auditor's report placeholder, supplementary schedules and
 * approval section. Used by both the PDF and DOCX renderers so the issued
 * document never diverges between formats.
 *
 * Wording is written to the standard expected of a South African CA(SA) issuing
 * IFRS / IFRS for SMEs annual financial statements — never meta, never robotic.
 */
import type { CanonicalDocumentView } from './canonicalDocumentView';

/** Join a list into a grammatical sentence fragment ("A, B and C"). */
export function formatList(items: string[]): string {
  const clean = items.map((i) => String(i).trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

/**
 * The practitioner named at the foot of the cover — the auditor, independent
 * reviewer or accounting officer the engagement records. No designations are
 * invented: only the name and what the engagement says they are.
 */
export function practitionerFirmLines(view: CanonicalDocumentView): string[] {
  const roleWords: Record<string, string> = {
    auditor: 'Registered Auditors',
    independent_reviewer: 'Independent Reviewers',
    accounting_officer: 'Accounting Officers',
  };
  for (const role of ['auditor', 'independent_reviewer', 'accounting_officer']) {
    const entry = view.corporateInformation.governance.find((g) => g.role === role && g.name.trim());
    if (!entry) continue;
    const name = entry.name.trim();
    // A firm whose recorded name already carries its designation is not
    // captioned with it a second time.
    if (name.toLowerCase().includes(roleWords[role].toLowerCase())) return [name];
    return [name, roleWords[role]];
  }
  return [];
}

/** The footer line every supplementary page carries. */
export const SUPPLEMENTARY_DISCLAIMER =
  'The supplementary information presented does not form part of the annual financial statements and is not reviewed or audited.';

/** "year ended 28 February 2027" — for use inside a sentence. */
function periodInSentence(view: CanonicalDocumentView): string {
  const label = view.presentation.reportingPeriodLabel;
  return label ? label.charAt(0).toLowerCase() + label.slice(1) : 'reporting period';
}

/** An address written into a sentence: line breaks become commas. */
function addressInline(address: string): string {
  return address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(', ');
}

export function directorsResponsibilitiesParagraphs(view: CanonicalDocumentView): string[] {
  return [
    `The directors are required by the Companies Act of South Africa to maintain adequate accounting records and are responsible for the content and integrity of the annual financial statements of ${view.companyName} and related financial information included in this report. It is their responsibility to ensure that the annual financial statements fairly present the state of affairs of the company as at the end of the financial year and the results of its operations and cash flows for the period then ended, in conformity with ${view.frameworkLabel}.`,
    'The directors acknowledge that they are ultimately responsible for the system of internal financial control established by the company and place considerable importance on maintaining a strong control environment. To enable the directors to meet these responsibilities, the board sets standards for internal control aimed at reducing the risk of error or loss in a cost-effective manner.',
    'The directors are of the opinion, based on the information and explanations given by management, that the system of internal control provides reasonable assurance that the financial records may be relied on for the preparation of the annual financial statements. However, any system of internal financial control can provide only reasonable, and not absolute, assurance against material misstatement or loss.',
    "The directors have reviewed the company's cash flow forecast for the year ahead and, in light of this review and the current financial position, they are satisfied that the company has access to adequate resources to continue in operational existence for the foreseeable future.",
  ];
}

/** A statement line's figures, by line code, as the statements state them. */
function lineFigures(view: CanonicalDocumentView, code: string): { now: number | null; then: number | null } {
  for (const s of view.statements) {
    const line = s.lines.find((l) => l.line_code === code);
    if (line) {
      const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
      return { now: num(line.amount), then: num(line.prior_amount) };
    }
  }
  return { now: null, then: null };
}

/** "R1 180 000" — a whole-Rand amount written into a sentence. */
function randInSentence(value: number): string {
  const whole = Math.round(Math.abs(value));
  return `R${whole.toLocaleString('en-ZA').replace(/,/g, ' ').replace(/\u00a0/g, ' ')}`;
}

function comparativeYear(view: CanonicalDocumentView): string {
  const end = view.period?.end_date;
  const year = end ? Number(String(end).slice(0, 4)) - 1 : null;
  return year ? String(year) : 'prior year';
}

/**
 * The directors' report, stated from the company's own records: what it does,
 * how the year went (the result the statements report), its share capital,
 * the dividends the ledger records, who its directors are, and who compiled
 * or reviewed the statements. Sections without facts behind them are left out
 * rather than filled with generic wording.
 */
export function directorsReportParagraphs(view: CanonicalDocumentView): Array<{ heading?: string; body: string }> {
  const blocks: Array<{ heading?: string; body: string }> = [
    {
      body: `The directors have pleasure in submitting their report on the annual financial statements of ${view.companyName} for the ${periodInSentence(view)}.`,
    },
  ];
  const sections: Array<{ title: string; body: string }> = [];
  const prior = comparativeYear(view);

  const nature = view.presentation.natureOfBusiness?.trim();
  if (nature) {
    const sentence = /^the\b/i.test(nature)
      ? nature.replace(/^the\b/i, 'The').replace(/\.?$/, '.')
      : `The company is engaged in ${nature.charAt(0).toLowerCase()}${nature.slice(1).replace(/\.$/, '')} and operates principally in South Africa.`;
    sections.push({
      title: 'Nature of business',
      body: `${sentence} There have been no material changes to the nature of the company's business from the prior year.`,
    });
  }

  const result = lineFigures(view, 'perf.result');
  if (result.now != null) {
    const verb = result.now >= 0 ? 'net profit after tax' : 'net loss after tax';
    const then =
      result.then != null
        ? ` (${prior}: ${result.then >= 0 ? 'profit' : 'loss'} of ${randInSentence(result.then)})`
        : '';
    sections.push({
      title: 'Review of financial results and activities',
      body: `The annual financial statements have been prepared in accordance with ${view.frameworkLabel} and the requirements of the Companies Act of South Africa. The accounting policies have been applied consistently compared to the prior year. The company recorded a ${verb} for the year of ${randInSentence(result.now)}${then}. Full details of the financial position, results of operations and cash flows of the company are set out in these annual financial statements.`,
    });
  }

  const capital = lineFigures(view, 'sfp.issued_capital');
  if (capital.now != null) {
    const changed = capital.then != null && Math.abs(capital.now - capital.then) >= 0.5;
    sections.push({
      title: 'Share capital',
      body: changed
        ? `The company's issued share capital increased during the year from ${randInSentence(capital.then!)} to ${randInSentence(capital.now)}. Refer to the note on share capital for details.`
        : 'There have been no changes to the authorised or issued share capital during the year under review.',
    });
  }

  const dividends = lineFigures(view, 'eq.dividends');
  const priorDividends = lineFigures(view, 'eq.prior_dividends');
  if (dividends.now != null || priorDividends.now != null) {
    const now = dividends.now ?? 0;
    const then = priorDividends.now;
    sections.push({
      title: 'Dividends',
      body:
        Math.abs(now) >= 0.5
          ? `The company declared and paid dividends of ${randInSentence(now)} during the year${then != null ? ` (${prior}: ${randInSentence(then)})` : ''}.`
          : `No dividends were declared or paid during the year${then != null && Math.abs(then) >= 0.5 ? ` (${prior}: ${randInSentence(then)})` : ''}.`,
    });
  }

  const directorsList = view.presentation.directors;
  sections.push({
    title: 'Directors',
    body:
      directorsList.length > 0
        ? `The directors in office at the date of this report are ${formatList(directorsList)}. There have been no changes to the directorate for the year under review.`
        : 'The directors who held office during the year, and any changes in the composition of the board, are recorded in the statutory registers of the company.',
  });

  sections.push({
    title: 'Events after the reporting period',
    body: 'The directors are not aware of any material event which occurred after the reporting date and up to the date of this report.',
  });

  sections.push({
    title: 'Going concern',
    body: 'The directors believe that the company has adequate financial resources to continue in operation for the foreseeable future and accordingly the annual financial statements have been prepared on a going concern basis. The directors have satisfied themselves that the company is in a sound financial position and that it has access to sufficient borrowing facilities to meet its foreseeable cash requirements.',
  });

  const officeRaw = view.presentation.registeredOffice || view.presentation.businessAddress;
  const office = officeRaw ? addressInline(officeRaw) : null;
  if (view.presentation.companySecretary) {
    sections.push({
      title: 'Secretary',
      body: `The company secretary is ${view.presentation.companySecretary}${office ? `, and the registered office of the company is ${office}` : ''}.`,
    });
  }

  const practitioner = practitionerFirmLines(view)[0];
  if (view.presentation.auditor) {
    sections.push({ title: 'Auditors', body: `${view.presentation.auditor} will continue in office as auditors of the company.` });
  } else if (practitioner) {
    const assurance = String(view.corporateInformation.levelOfAssurance.formatted || '');
    sections.push({
      title: /review/i.test(assurance) ? 'Independent reviewers' : 'Accounting officer',
      body: /review/i.test(assurance)
        ? `${practitioner} continued in office as independent reviewers of the company.`
        : `${practitioner} compiled the annual financial statements of the company.`,
    });
  }

  sections.forEach((sec, i) => blocks.push({ heading: `${i + 1}. ${sec.title}`, body: sec.body }));
  return blocks;
}

/**
 * The practitioner's report the level of assurance calls for. A compilation
 * report is the practitioner's standard wording under ISRS 4410 (Revised) and
 * is prepared with the statements; an auditor's or independent reviewer's
 * report is the practitioner's own and is inserted when it is issued.
 */
export function auditorsReportParagraphs(view: CanonicalDocumentView): string[] {
  const assurance = String(view.corporateInformation.levelOfAssurance.formatted || '');
  const practitioner = practitionerFirmLines(view)[0] || 'the practitioner';
  if (/compil/i.test(assurance)) {
    const end = view.presentation.reportingDateLong || 'the reporting date';
    return [
      `To the shareholders of ${view.companyName}`,
      `We have compiled the accompanying annual financial statements of ${view.companyName}, based on information you have provided. These annual financial statements comprise the statement of financial position as at ${end}, the statement of comprehensive income, the statement of changes in equity and the statement of cash flows for the year then ended, and notes, comprising a summary of significant accounting policies and other explanatory information.`,
      `We performed this compilation engagement in accordance with International Standard on Related Services 4410 (Revised), Compilation Engagements. We have applied our expertise in accounting and financial reporting to assist you in the preparation and presentation of these annual financial statements in accordance with ${view.frameworkLabel} and the requirements of the Companies Act of South Africa. We have complied with relevant ethical requirements, including principles of integrity, objectivity, professional competence and due care.`,
      'These annual financial statements and the accuracy and completeness of the information used to compile them are your responsibility.',
      `Since a compilation engagement is not an assurance engagement, we are not required to verify the accuracy or completeness of the information you provided to us to compile these annual financial statements. Accordingly, we do not express an audit opinion or a review conclusion on whether these annual financial statements are prepared in accordance with ${view.frameworkLabel}.`,
      practitioner,
      view.presentation.issueDateLong ? `${view.presentation.issueDateLong}` : '',
    ].filter(Boolean);
  }
  if (view.presentation.auditor) {
    return [
      `To the shareholders of ${view.companyName}`,
      `The independent auditors of the company are ${view.presentation.auditor}. Their report on these annual financial statements is addressed to the shareholders and is inserted here when issued upon completion of the audit engagement.`,
    ];
  }
  return [
    `To the shareholders of ${view.companyName}`,
    `The report of ${practitioner} on these annual financial statements is addressed to the shareholders and is inserted here when issued.`,
  ];
}

export function supplementaryScheduleParagraphs(): string[] {
  return [
    'The schedules set out in this section do not form part of the audited annual financial statements and are presented as supplementary information for the use of the directors and management.',
    'Where prepared, the detailed income statement and the taxation computation of the company are presented in this section. These schedules are unaudited and are provided to support the analysis of the results disclosed in the primary statements.',
  ];
}

export function approvalIntro(view?: CanonicalDocumentView): string {
  const date = view?.presentation.issueDateLong;
  return `The annual financial statements set out on the pages that follow, which have been prepared on the going concern basis, were approved by the board of directors${date ? ` on ${date}` : ''} and were signed on their behalf by:`;
}
