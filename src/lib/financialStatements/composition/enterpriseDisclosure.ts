/**
 * V16.0 — Enterprise Disclosure Composition Engine.
 *
 * Transforms document-model notes into structured enterprise disclosure objects.
 * Every disclosure is metadata-driven — no plain-text paragraphs.
 */
import type { DocNoteNode } from '../document/documentModel';
import type { DocumentModel } from '../document/documentModel';
import { buildFactLookup } from '../framework/trialBalanceDisclosureMapping';
import { buildDisclosureCrossReferences } from './crossReferences';
import { buildDisclosureComparatives, buildComparativeContext } from './comparativeEngine';
import { inferDisclosureArchetype } from './conditionalDisclosureEngine';
import {
  buildDisclosureLibraryComponents,
  libraryToCompositionComponents,
  tableToCompositionRows,
} from './disclosureComponents';
import { emptyDisclosureLinks, linksForDisclosure } from './disclosureLinking';
import { isDisclosureNote } from './disclosureNotes';
import {
  movementScheduleToTableRows,
  resolveMovementSchedules,
} from './movementScheduleEngine';
import { validateEnterpriseDisclosure } from './disclosureValidation';
import type {
  AccountingEstimateBlock,
  DisclosureCategoryMeta,
  EnterpriseDisclosureObject,
  EnterpriseDisclosureSection,
  JudgementBlock,
  ReconciliationSchedule,
} from './types';

const CLOSING_LINE_BY_SCHEDULE: Record<string, string> = {
  'SCH.PPE.MOVEMENT': 'sfp.ppe',
  'SCH.INTANGIBLES.MOVEMENT': 'sfp.intangibles',
  'SCH.BORROWINGS.MOVEMENT': 'sfp.borrowings',
  'SCH.EQUITY.MOVEMENT': 'sfp.retained_earnings',
  'SCH.INVENTORY.MOVEMENT': 'sfp.inventories',
  'SCH.DEFTAX.MOVEMENT': 'sfp.deferred_tax',
};

function extractEstimates(library: ReturnType<typeof buildDisclosureLibraryComponents>): AccountingEstimateBlock[] {
  return library
    .filter((c) => c.componentKind === 'estimate')
    .map((c, i) => ({
      id: c.id || `est:${i}`,
      label: c.title || 'Accounting estimate',
      narrative: c.text || '',
      sensitivityRef: null,
    }));
}

function extractJudgements(library: ReturnType<typeof buildDisclosureLibraryComponents>): JudgementBlock[] {
  return library
    .filter((c) => c.componentKind === 'judgement')
    .map((c, i) => ({
      id: c.id || `jud:${i}`,
      label: c.title || 'Significant judgement',
      narrative: c.text || '',
      frameworkSection: c.frameworkSection,
    }));
}

function buildReconciliations(
  note: DocNoteNode,
  scheduleCodes: string[],
): ReconciliationSchedule[] {
  const reconciliations: ReconciliationSchedule[] = [];
  for (const table of note.tables || []) {
    const hay = `${table.table_code} ${table.title}`.toLowerCase();
    if (!/reconcil/.test(hay)) continue;
    const rows = tableToCompositionRows(table.columns_json, table.rows_json);
    const items = rows.slice(1).map((r, i) => ({
      label: r[0] || `Item ${i + 1}`,
      amount: parseFloat(String(r[1] || '').replace(/[^\d.-]/g, '')) || null,
    }));
    reconciliations.push({
      id: `recon:${table.id}`,
      scheduleCode: scheduleCodes[0] || `RECON.${note.disclosure_code}`,
      title: table.title,
      openingBalance: items[0]?.amount ?? null,
      closingBalance: items[items.length - 1]?.amount ?? null,
      reconcilingItems: items.slice(1, -1),
      validated: true,
      validationMessage: null,
    });
  }
  return reconciliations;
}

function buildCategoryMeta(
  disclosureCode: string,
  links: ReturnType<typeof linksForDisclosure>,
  sortOrder: number,
): DisclosureCategoryMeta {
  return {
    accountCategories: links.accountCategories,
    financialStatementLine: links.statementLines[0] || null,
    disclosureCategory: disclosureCode.replace(/^DISC\./, ''),
    frameworkSection: links.frameworkSections[0] || null,
    presentationPriority: sortOrder,
    supportingScheduleCodes: links.scheduleCodes,
    sourceLedgerAccounts: links.statementLines,
  };
}

/** Build a single enterprise disclosure object from a document note. */
export function toEnterpriseDisclosure(
  note: DocNoteNode,
  opts: {
    noteNumber: number | null;
    title: string;
    allLineLinks?: Array<{ statementType: string; lineCode: string; links: import('./types').DisclosureLinkSet }>;
    model: DocumentModel;
    active?: boolean;
  },
): EnterpriseDisclosureObject | null {
  if (!isDisclosureNote(note)) return null;

  const links =
    opts.allLineLinks
      ? linksForDisclosure(note.disclosure_code, opts.allLineLinks)
      : emptyDisclosureLinks();

  const library = buildDisclosureLibraryComponents(note);
  const { grouped } = libraryToCompositionComponents(library, note.id);

  const sections: EnterpriseDisclosureSection[] = grouped.map((g, idx) => ({
    id: g.id,
    title: g.title,
    sortOrder: idx + 1,
    libraryComponents: g.libraryComponents,
    narratives: g.narratives,
    tables: g.tables,
  }));

  const tableRowsBySchedule: Record<string, string[][]> = {};
  for (const table of note.tables || []) {
    const hay = `${table.table_code} ${table.title}`.toLowerCase();
    if (/movement|roll.?forward/.test(hay)) {
      const code = links.scheduleCodes[0] || 'SCH.PPE.MOVEMENT';
      tableRowsBySchedule[code] = tableToCompositionRows(table.columns_json, table.rows_json);
    }
  }

  const facts = buildFactLookup(opts.model.statements);
  const movementSchedules = resolveMovementSchedules(links.scheduleCodes, {
    tableRowsBySchedule,
    facts,
    closingLineBySchedule: CLOSING_LINE_BY_SCHEDULE,
  });

  const reconciliations = buildReconciliations(note, links.scheduleCodes);
  const hasMovement = movementSchedules.length > 0;
  const hasRecon = reconciliations.length > 0;
  const archetype = inferDisclosureArchetype(note.disclosure_code, hasMovement, hasRecon);

  const comparativeCtx = buildComparativeContext(
    opts.model.statements,
    opts.model.notes,
    opts.model.period || {},
  );

  const heading =
    opts.noteNumber != null ? `Note ${opts.noteNumber}. ${opts.title}` : null;

  const partial: EnterpriseDisclosureObject = {
    id: note.id,
    disclosureCode: note.disclosure_code,
    archetype,
    title: opts.title,
    noteNumber: opts.noteNumber,
    heading,
    status: note.status,
    requirementLevel: note.requirement_level,
    sortOrder: note.sort_order,
    source: note.source || 'framework',
    links,
    sections,
    movementSchedules,
    reconciliations,
    accountingEstimates: extractEstimates(library),
    judgements: extractJudgements(library),
    crossReferences: [],
    validationRules: [],
    comparatives: {
      currentPeriodLabel: comparativeCtx.currentPeriodLabel,
      priorPeriodLabel: comparativeCtx.priorPeriodLabel,
      hasRestatement: comparativeCtx.hasRestatement,
      hasReclassification: comparativeCtx.hasReclassification,
      isFirstTimeAdoption: comparativeCtx.isFirstTimeAdoption,
      comparativeNarratives: [],
      comparativeTables: [],
    },
    category: buildCategoryMeta(note.disclosure_code, links, note.sort_order),
    active: opts.active !== false,
  };

  partial.comparatives = buildDisclosureComparatives(partial, comparativeCtx);

  const policyTitles: Record<string, string> = {};
  for (const ps of opts.model.policySets) {
    for (const p of ps.policies || []) {
      policyTitles[p.policy_code] = p.title;
    }
  }

  partial.crossReferences = buildDisclosureCrossReferences(partial, {
    noteNumberByCode: {},
    policyTitlesByCode: policyTitles,
    disclosureTitlesByCode: {},
  });

  partial.validationRules = validateEnterpriseDisclosure(partial, {
    noteNumberByCode: {},
    requiredDisclosureCodes: [],
  });

  return partial;
}

/** Build all enterprise disclosure objects for a document. */
export function buildEnterpriseDisclosures(
  model: DocumentModel,
  numberedNotes: Array<{ note: DocNoteNode; noteNumber: number; title: string }>,
  disclosureLinks: Array<{ statementType: string; lineCode: string; links: import('./types').DisclosureLinkSet }>,
): EnterpriseDisclosureObject[] {
  return numberedNotes
    .map((n) =>
      toEnterpriseDisclosure(n.note, {
        noteNumber: n.noteNumber,
        title: n.title,
        allLineLinks: disclosureLinks,
        model,
        active: true,
      }),
    )
    .filter((d): d is EnterpriseDisclosureObject => !!d);
}

/** Flatten enterprise disclosure into publication-ready component blocks. */
export function enterpriseDisclosureToBlocks(
  disclosure: EnterpriseDisclosureObject,
): Array<
  | { type: 'paragraph'; text: string; bold?: boolean; componentKind?: string }
  | { type: 'table'; title: string; rows: string[][]; componentKind?: string }
> {
  const blocks: Array<
    | { type: 'paragraph'; text: string; bold?: boolean; componentKind?: string }
    | { type: 'table'; title: string; rows: string[][]; componentKind?: string }
  > = [];

  for (const section of disclosure.sections) {
    for (const n of section.narratives) {
      blocks.push({ type: 'paragraph', text: n.text, bold: n.bold, componentKind: 'narrative' });
    }
    for (const t of section.tables) {
      blocks.push({
        type: 'table',
        title: t.title,
        rows: t.rows,
        componentKind: t.componentKind,
      });
    }
  }

  for (const schedule of disclosure.movementSchedules) {
    blocks.push({
      type: 'table',
      title: schedule.title,
      rows: movementScheduleToTableRows(schedule),
      componentKind: 'movement_schedule',
    });
  }

  for (const recon of disclosure.reconciliations) {
    const rows: string[][] = [
      ['', 'Amount'],
      ...recon.reconcilingItems.map((i) => [i.label, String(i.amount ?? '[ — ]')]),
    ];
    if (recon.closingBalance != null) {
      rows.push(['Closing balance', String(recon.closingBalance)]);
    }
    blocks.push({
      type: 'table',
      title: recon.title,
      rows,
      componentKind: 'reconciliation',
    });
  }

  for (const n of disclosure.comparatives.comparativeNarratives) {
    blocks.push({ type: 'paragraph', text: n.text, bold: n.bold, componentKind: 'narrative' });
  }
  for (const t of disclosure.comparatives.comparativeTables) {
    blocks.push({
      type: 'table',
      title: t.title,
      rows: t.rows,
      componentKind: t.componentKind,
    });
  }

  for (const est of disclosure.accountingEstimates) {
    blocks.push({
      type: 'paragraph',
      text: `${est.label}: ${est.narrative}`,
      componentKind: 'estimate',
    });
  }

  for (const jud of disclosure.judgements) {
    blocks.push({
      type: 'paragraph',
      text: `${jud.label}: ${jud.narrative}`,
      bold: true,
      componentKind: 'judgement',
    });
  }

  return blocks;
}
