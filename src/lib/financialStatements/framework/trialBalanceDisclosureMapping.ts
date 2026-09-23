/**
 * Trial Balance → Disclosure table population (V12.0 / Critical Gap 2).
 *
 * Consumes financial facts already produced by the Accounting Engine (statement
 * lines) and populates framework disclosure tables. NO Trial Balance / GL /
 * Accounting Engine logic is redefined here — this module only READS statement
 * facts and maps them into the standard tables declared by the Framework Content
 * Library. Where a fact source does not exist, a manual completion field is
 * clearly identified.
 */
import type { EfsStatementLine } from '../api';
import type { DocStatementNode, DocTable } from '../document/documentModel';
import { formatAmount } from '../publication/afsProfessionalPdf';
import type { FrameworkTableDef } from './frameworkContent';
import { resolveFact } from './lineCodeAliases';

/** Marker inserted into a cell that the accountant must complete manually. */
export const MANUAL_FIELD_TOKEN = '[ — ]';

export type ManualField = {
  noteCode: string;
  tableTitle: string;
  label: string;
  reason: string;
};

export type FactLookup = Map<string, number>;

/**
 * Build a fast line_code → amount lookup from all statement lines.
 *
 * Prior-period figures are filed under "<code>.prior", which is the name the
 * framework tables ask for in their comparative column. Without them every
 * comparative cell printed "[ — ]" and was reported as needing manual input,
 * even where last year's figure was sitting in the statement beside it.
 */
export function buildFactLookup(statements: DocStatementNode[]): FactLookup {
  const lookup: FactLookup = new Map();
  for (const statement of statements) {
    for (const line of statement.lines as EfsStatementLine[]) {
      if (!line || typeof line.line_code !== 'string') continue;
      if (line.amount != null) lookup.set(line.line_code, Number(line.amount) || 0);
      if (line.prior_amount != null) {
        lookup.set(`${line.line_code}.prior`, Number(line.prior_amount) || 0);
      }
    }
  }
  return lookup;
}

export type PopulatedTable = {
  table: DocTable;
  manualFields: ManualField[];
};

/**
 * Populate a framework table definition using available facts.
 * - Rows with a matched fact are auto-filled.
 * - Rows with an unmatched fact mapping, or declared manual rows, become manual
 *   completion fields (rendered with MANUAL_FIELD_TOKEN).
 */
export function populateFrameworkTable(
  noteCode: string,
  def: FrameworkTableDef,
  facts: FactLookup,
  tableId: string,
  tableIndex = 0,
): PopulatedTable {
  const manualFields: ManualField[] = [];
  const rows: string[][] = [];

  for (const mapping of def.factMappings || []) {
    // The engine and the framework library name the same figure differently in
    // places, so try every name this line is known by before giving up on it.
    const current = resolveFact(facts, mapping.line_code);

    const row: string[] = [
      mapping.label,
      current.found ? formatAmount(current.amount) : MANUAL_FIELD_TOKEN,
    ];
    if (def.columns.length >= 3) {
      const priorCode = mapping.comparative_line_code;
      const prior = priorCode ? resolveFact(facts, priorCode) : { found: false, amount: 0 };
      row.push(prior.found ? formatAmount(prior.amount) : MANUAL_FIELD_TOKEN);
    }
    rows.push(row);

    if (!current.found) {
      manualFields.push({
        noteCode,
        tableTitle: def.title,
        label: mapping.label,
        reason: `No financial fact mapped to '${mapping.line_code}'.`,
      });
    }
  }

  for (const manualRow of def.manualRows || []) {
    const row: string[] = [manualRow, MANUAL_FIELD_TOKEN];
    if (def.columns.length >= 3) row.push(MANUAL_FIELD_TOKEN);
    rows.push(row);
    manualFields.push({
      noteCode,
      tableTitle: def.title,
      label: manualRow,
      reason: 'No automatic fact source; requires manual completion.',
    });
  }

  const table: DocTable = {
    id: tableId,
    table_code: tableIndex === 0 ? `${noteCode}.TBL` : `${noteCode}.TBL.${tableIndex + 1}`,
    title: def.title,
    columns_json: def.columns as unknown[],
    rows_json: rows as unknown[],
    sort_order: 1,
  };

  return { table, manualFields };
}
