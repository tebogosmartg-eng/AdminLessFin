/**
 * V17.0 — Disclosure Decision Engine.
 *
 * Determines whether each disclosure should exist, expand, simplify, merge, or suppress.
 */
import type { DocumentModel } from '../document/documentModel';
import type { DocNoteNode } from '../document/documentModel';
import type { DisclosureConditionMap } from '../framework/knowledgeRepository/types';
import { tableToCompositionRows } from '../composition/disclosureComponents';
import { extractStatementFacts } from './facts';
import type {
  DisclosureDecision,
  EntityProfile,
  MaterialityAssessment,
  MaterialityAction,
} from './types';

/**
 * Notes whose content belongs inside the accounting policies section of a
 * published set — the basis of preparation is policy 1, judgements are
 * policy 1.1 — and which would otherwise print the same words twice.
 */
const PRESENTED_IN_POLICIES = new Set(['DISC.BASIS', 'DISC.JUDGEMENTS', 'DISC.BORROWINGCOST']);

const PLACEHOLDER_CELL = /^\[\s*[—–-]?\s*\]$/;

/**
 * Whether any table of this note carries a filled-in figure. A framework note
 * arrives with every line the framework might ask for, all reading "[ — ]";
 * a note whose tables hold nothing but placeholders and blanks has nothing to
 * say yet, and a published set does not print a heading over an empty form.
 * A note without tables is narrative by design and is never judged here.
 */
function hasFilledFigure(note: DocNoteNode): boolean | null {
  const tables = note.tables || [];
  if (!tables.length) return null;
  for (const table of tables) {
    const rows = tableToCompositionRows(table.columns_json, table.rows_json);
    for (const row of rows.slice(1)) {
      for (const cell of row.slice(1)) {
        const v = String(cell ?? '').trim();
        if (v && /\d/.test(v) && !PLACEHOLDER_CELL.test(v)) return true;
      }
    }
  }
  return false;
}

const SUPPRESS_WHEN_ABSENT: Array<{ code: string; factCheck: (facts: ReturnType<typeof extractStatementFacts>) => boolean; reason: string }> = [
  {
    code: 'DISC.PPE',
    factCheck: (f) => f.ppeBalance <= 0,
    reason: 'No PPE — suppress PPE disclosure',
  },
  {
    code: 'DISC.LEASES',
    factCheck: (f) => f.leaseBalance <= 0,
    reason: 'No leases — suppress lease disclosures',
  },
  {
    code: 'DISC.TAX',
    factCheck: (f) => f.taxExpense <= 0,
    reason: 'No tax — suppress tax reconciliation',
  },
  {
    code: 'DISC.DEFERREDTAX',
    factCheck: (f) => !f.lookup.has('sfp.deferred_tax') && !f.lookup.has('sfp.deferred_tax_asset'),
    reason: 'No deferred tax — suppress deferred tax disclosure',
  },
  {
    code: 'DISC.RELATED',
    factCheck: () => false,
    reason: 'No related parties — suppress related party disclosures',
  },
  {
    code: 'DISC.RELATEDPARTY',
    factCheck: () => false,
    reason: 'No related parties — suppress related party disclosures',
  },
  {
    code: 'DISC.RELATEDPARTIES',
    factCheck: () => false,
    reason: 'No related parties — suppress related party disclosures',
  },
  {
    code: 'DISC.BIOLOGICAL',
    factCheck: (f) => !f.lookup.has('sfp.biological') || Math.abs(f.lookup.get('sfp.biological') || 0) <= 0,
    reason: 'No biological assets — suppress biological disclosure',
  },
  {
    code: 'DISC.INVENTORIES',
    factCheck: (f) => f.inventoryBalance <= 0,
    reason: 'No inventories — suppress inventory disclosure',
  },
];

function shouldExpandPpe(facts: ReturnType<typeof extractStatementFacts>): boolean {
  return facts.ppeCategories > 1 || facts.ppeBalance > facts.totalAssets * 0.15;
}

function shouldSimplifyPpe(facts: ReturnType<typeof extractStatementFacts>): boolean {
  return facts.ppeBalance > 0 && facts.ppeCategories <= 1;
}

/** Make disclosure decisions from materiality assessments and entity facts. */
export function makeDisclosureDecisions(
  model: DocumentModel,
  profile: EntityProfile,
  materiality: MaterialityAssessment[],
  conditions: DisclosureConditionMap,
  /** Codes where the preparer switched a line on: never withheld as unfilled. */
  forcedOnCodes: Set<string> = new Set(),
): DisclosureDecision[] {
  const facts = extractStatementFacts(model);
  const materialityByCode = new Map(materiality.map((m) => [m.disclosureCode, m]));
  const decisions: DisclosureDecision[] = [];

  for (const note of model.notes) {
    const code = note.disclosure_code;
    const mat = materialityByCode.get(code);
    const action: MaterialityAction = mat?.action ?? 'present';
    const materialityClass = mat?.materiality ?? 'conditional';

    let exists = action !== 'suppress';
    let shouldSuppress = action === 'suppress';
    let shouldExpand = action === 'expand' || action === 'highlight';
    let shouldSimplify = action === 'collapse';
    const shouldMerge = action === 'merge';
    let reason = mat?.reason ?? 'Default presentation';
    let mergedWith: string | undefined;

    const suppressRule = SUPPRESS_WHEN_ABSENT.find((r) => r.code === code);
    if (suppressRule && note.requirement_level !== 'mandatory' && note.requirement_level !== 'required') {
      if (code.startsWith('DISC.RELATED') && conditions.hasRelatedParties === false) {
        exists = false;
        shouldSuppress = true;
        reason = suppressRule.reason;
      } else if (suppressRule.factCheck(facts)) {
        exists = false;
        shouldSuppress = true;
        reason = suppressRule.reason;
      }
    }

    if (code === 'DISC.PPE' && exists) {
      if (facts.ppeBalance <= 0) {
        shouldSimplify = true;
        reason = 'No PPE balance — simplified narrative disclosure only';
      } else if (shouldExpandPpe(facts)) {
        shouldExpand = true;
        reason = 'Multiple PPE categories — produce movement schedule';
      } else if (shouldSimplifyPpe(facts)) {
        shouldSimplify = true;
        reason = 'One PPE category — produce simplified disclosure';
      }
    }

    if (code === 'DISC.BORROWINGS' && exists && facts.borrowingsBalance <= 0) {
      shouldSimplify = true;
      reason = 'No borrowings balance — simplified narrative disclosure only';
    }

    if (profile.size === 'micro_entity' || profile.size === 'dormant_entity') {
      if (materialityClass === 'immaterial' && note.requirement_level !== 'required') {
        exists = false;
        shouldSuppress = true;
        reason = 'Micro entity — immaterial disclosure suppressed';
      }
    }

    if (profile.industry === 'npo' && /DISC.TAX|DISC.DEFERREDTAX/.test(code)) {
      if (facts.taxExpense <= 0) {
        exists = false;
        shouldSuppress = true;
        reason = 'NPO — no tax disclosure required';
      }
    }

    if (shouldMerge && code === 'DISC.PAYABLES') {
      mergedWith = 'DISC.FININST';
    }

    // The basis of preparation and the significant judgements are presented
    // inside the accounting policies (1 and 1.1); the same words are not
    // printed a second time as numbered notes.
    if (PRESENTED_IN_POLICIES.has(String(code || '').toUpperCase())) {
      exists = false;
      shouldSuppress = true;
      reason = 'Presented within the accounting policies';
    }

    // A note whose tables hold nothing but "[ — ]" placeholders is a form
    // nobody has filled in. It is withheld from the printed document — still
    // in the editor, still switchable on line by line — rather than printed
    // as a heading over boilerplate that promises a table that is not there.
    if (exists && hasFilledFigure(note) === false && !forcedOnCodes.has(String(code || '').toUpperCase())) {
      exists = false;
      shouldSuppress = true;
      reason =
        'Nothing filled in yet — the note prints once a figure is entered or one of its lines is switched on';
    }

    decisions.push({
      disclosureCode: code,
      exists,
      shouldExpand,
      shouldSimplify,
      shouldMerge,
      shouldSuppress,
      action: shouldSuppress ? 'suppress' : shouldExpand ? 'expand' : shouldSimplify ? 'collapse' : shouldMerge ? 'merge' : 'present',
      materiality: materialityClass,
      reason,
      mergedWith,
    });
  }

  return decisions;
}
