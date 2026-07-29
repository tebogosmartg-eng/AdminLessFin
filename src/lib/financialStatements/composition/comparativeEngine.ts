/**
 * V16.0 — Comparative Information Engine.
 *
 * Every disclosure automatically supports current year, prior year,
 * restatements, reclassifications, first-time adoption, and comparative tables.
 */
import type { DocStatementNode } from '../document/documentModel';
import type {
  ComparativePeriodInfo,
  CompositionNarrative,
  CompositionTable,
  EnterpriseDisclosureObject,
} from './types';

export type ComparativeContext = {
  currentPeriodLabel: string;
  priorPeriodLabel: string | null;
  hasRestatement: boolean;
  hasReclassification: boolean;
  isFirstTimeAdoption: boolean;
  statements: DocStatementNode[];
};

function hasPriorAmounts(statements: DocStatementNode[]): boolean {
  for (const stmt of statements) {
    for (const line of stmt.lines || []) {
      const prior = (line as { prior_amount?: number | null }).prior_amount;
      if (prior != null && prior !== 0) return true;
    }
  }
  return false;
}

function detectRestatement(statements: DocStatementNode[]): boolean {
  for (const stmt of statements) {
    for (const line of stmt.lines || []) {
      const code = String(line.line_code || '').toLowerCase();
      if (/restate|prior.?period.?error|policy.?change/.test(code)) return true;
    }
  }
  return false;
}

function detectFirstTimeAdoption(statements: DocStatementNode[], notes: { disclosure_code: string }[]): boolean {
  if (notes.some((n) => /transition|first.?time|fta/i.test(n.disclosure_code))) return true;
  for (const stmt of statements) {
    for (const line of stmt.lines || []) {
      if (/transition|first.?time|fta/i.test(String(line.line_code || ''))) return true;
    }
  }
  return false;
}

/** Build comparative period metadata for the document. */
export function buildComparativeContext(
  statements: DocStatementNode[],
  notes: { disclosure_code: string }[],
  period: { label?: string; comparative_label?: string },
): ComparativeContext {
  return {
    currentPeriodLabel: period.label || 'Current year',
    priorPeriodLabel: period.comparative_label || (hasPriorAmounts(statements) ? 'Prior year' : null),
    hasRestatement: detectRestatement(statements),
    hasReclassification: statements.some((s) =>
      (s.lines || []).some((l) => /reclassif/i.test(String(l.line_code || ''))),
    ),
    isFirstTimeAdoption: detectFirstTimeAdoption(statements, notes),
    statements,
  };
}

/** Attach comparative information to an enterprise disclosure. */
export function buildDisclosureComparatives(
  disclosure: Pick<EnterpriseDisclosureObject, 'sections' | 'movementSchedules'>,
  ctx: ComparativeContext,
): ComparativePeriodInfo {
  const comparativeNarratives: CompositionNarrative[] = [];
  const comparativeTables: CompositionTable[] = [];

  if (ctx.hasRestatement) {
    comparativeNarratives.push({
      id: 'comp:restatement',
      kind: 'narrative',
      text: 'Comparative information has been restated where applicable.',
      bold: true,
    });
  }
  if (ctx.hasReclassification) {
    comparativeNarratives.push({
      id: 'comp:reclass',
      kind: 'narrative',
      text: 'Comparative figures have been reclassified to conform with current period presentation.',
    });
  }
  if (ctx.isFirstTimeAdoption) {
    comparativeNarratives.push({
      id: 'comp:fta',
      kind: 'narrative',
      text: 'First-time adoption adjustments are reflected in the comparative information.',
      bold: true,
    });
  }

  for (const section of disclosure.sections) {
    for (const table of section.tables) {
      if (table.rows[0]?.length >= 3) {
        comparativeTables.push({
          ...table,
          id: `${table.id}:comparative`,
          title: `${table.title} — comparative`,
          componentKind: 'analysis_table',
        });
      }
    }
  }

  for (const schedule of disclosure.movementSchedules) {
    if (schedule.comparativeRows?.length) {
      comparativeTables.push({
        id: `${schedule.id}:comparative`,
        kind: 'table',
        title: `${schedule.title} — prior year`,
        rows: [
          ['', ...schedule.columns.map((c) => c.replace(/_/g, ' '))],
          ...schedule.comparativeRows.map((r) => [
            r.label,
            ...schedule.columns.map((c) => String(r.values[c] ?? '[ — ]')),
          ]),
        ],
        componentKind: 'movement_schedule',
      });
    }
  }

  return {
    currentPeriodLabel: ctx.currentPeriodLabel,
    priorPeriodLabel: ctx.priorPeriodLabel,
    hasRestatement: ctx.hasRestatement,
    hasReclassification: ctx.hasReclassification,
    isFirstTimeAdoption: ctx.isFirstTimeAdoption,
    comparativeNarratives,
    comparativeTables,
  };
}

/** Enhance table column headers with comparative period labels. */
export function comparativeColumnHeaders(
  baseColumns: string[],
  ctx: ComparativeContext,
): string[] {
  if (baseColumns.length < 2) return baseColumns;
  const out = [...baseColumns];
  if (out.length >= 2 && ctx.currentPeriodLabel) {
    out[1] = ctx.currentPeriodLabel;
  }
  if (out.length >= 3 && ctx.priorPeriodLabel) {
    out[2] = ctx.priorPeriodLabel;
  }
  return out;
}
