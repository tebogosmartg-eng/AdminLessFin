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

export function directorsResponsibilitiesParagraphs(view: CanonicalDocumentView): string[] {
  return [
    `The directors are required by the Companies Act of South Africa to maintain adequate accounting records and are responsible for the content and integrity of the annual financial statements of ${view.companyName} and related financial information included in this report. It is their responsibility to ensure that the annual financial statements fairly present the state of affairs of the company as at the end of the financial year and the results of its operations and cash flows for the period then ended, in conformity with ${view.frameworkLabel}.`,
    'The directors acknowledge that they are ultimately responsible for the system of internal financial control established by the company and place considerable importance on maintaining a strong control environment. To enable the directors to meet these responsibilities, the board sets standards for internal control aimed at reducing the risk of error or loss in a cost-effective manner.',
    'The directors are of the opinion, based on the information and explanations given by management, that the system of internal control provides reasonable assurance that the financial records may be relied on for the preparation of the annual financial statements. However, any system of internal financial control can provide only reasonable, and not absolute, assurance against material misstatement or loss.',
    "The directors have reviewed the company's cash flow forecast for the year ahead and, in light of this review and the current financial position, they are satisfied that the company has access to adequate resources to continue in operational existence for the foreseeable future.",
    'The annual financial statements set out on the pages that follow, which have been prepared on the going concern basis, were approved by the board of directors and are signed on its behalf by the directors whose signatures appear in the approval section of this report.',
  ];
}

export function directorsReportParagraphs(view: CanonicalDocumentView): Array<{ heading?: string; body: string }> {
  const nature =
    view.presentation.natureOfBusiness ||
    'The principal activities of the company are described in the general information to these annual financial statements and remained unchanged during the year under review.';
  const natureSentence = /^the\b/i.test(nature.trim())
    ? nature.trim().replace(/^the\b/i, 'The')
    : `The company is engaged in ${nature.trim().replace(/\.$/, '')}.`;

  const directorsList = view.presentation.directors;
  const directorsBody =
    directorsList.length > 0
      ? `The directors in office at the date of this report are ${formatList(directorsList)}.`
      : 'The directors who held office during the year, and any changes in the composition of the board, are recorded in the statutory registers of the company.';

  const office = view.presentation.registeredOffice || view.presentation.businessAddress;
  const blocks: Array<{ heading?: string; body: string }> = [
    {
      body: `The directors have pleasure in submitting their report on the annual financial statements of ${view.companyName} for the ${view.presentation.reportingPeriodLabel.toLowerCase()}.`,
    },
    { heading: '1. Nature of business', body: natureSentence },
    {
      heading: '2. Review of financial results and activities',
      body: 'The financial results and position of the company are fully set out in the annual financial statements and require no further comment. The directors consider that the statements fairly present the financial affairs of the company.',
    },
    {
      heading: '3. Going concern',
      body: 'The directors believe that the company has adequate financial resources to continue in operation for the foreseeable future and accordingly the annual financial statements have been prepared on a going concern basis. The directors have satisfied themselves that the company is in a sound financial position and that it has access to sufficient borrowing facilities to meet its foreseeable cash requirements.',
    },
    {
      heading: '4. Events after the reporting period',
      body: 'The directors are not aware of any material event which occurred after the reporting date and up to the date of this report that would require adjustment to, or disclosure in, the annual financial statements, other than those disclosed in the notes.',
    },
    { heading: '5. Directors', body: directorsBody },
  ];

  if (view.presentation.companySecretary) {
    blocks.push({
      heading: '6. Company secretary',
      body: `The company secretary is ${view.presentation.companySecretary}${office ? `, and the registered office of the company is ${office}` : ''}.`,
    });
  } else if (office) {
    blocks.push({
      heading: '6. Registered office',
      body: `The registered office of the company is ${office}.`,
    });
  }

  if (view.presentation.auditor) {
    blocks.push({
      heading: `${view.presentation.companySecretary || office ? '7' : '6'}. Auditors`,
      body: `The company's auditors are ${view.presentation.auditor}.`,
    });
  }

  return blocks;
}

export function auditorsReportParagraphs(view: CanonicalDocumentView): string[] {
  if (view.presentation.auditor) {
    return [
      `To the shareholders of ${view.companyName}`,
      `The independent auditors of the company are ${view.presentation.auditor}. Their report on these annual financial statements is addressed to the shareholders and will be issued upon completion of the audit engagement.`,
      'Pending receipt of the signed auditor\'s report, this page is reserved for the independent auditor\'s report expressing an opinion on whether the annual financial statements present fairly, in all material respects, the financial position of the company as at the reporting date and its financial performance and cash flows for the year then ended, in accordance with the applicable financial reporting framework and the requirements of the Companies Act of South Africa.',
    ];
  }
  return [
    `To the shareholders of ${view.companyName}`,
    'Where the company is subject to audit, the report of the independent auditor is addressed to the shareholders and is issued upon completion of the audit engagement. Where the company is not subject to statutory audit, an independent review or compilation report is presented in accordance with the applicable professional requirements.',
  ];
}

export function supplementaryScheduleParagraphs(): string[] {
  return [
    'The schedules set out in this section do not form part of the audited annual financial statements and are presented as supplementary information for the use of the directors and management.',
    'Where prepared, the detailed income statement and the taxation computation of the company are presented in this section. These schedules are unaudited and are provided to support the analysis of the results disclosed in the primary statements.',
  ];
}

export function approvalIntro(): string {
  return 'The annual financial statements were approved by the board of directors and are signed on its behalf by:';
}
