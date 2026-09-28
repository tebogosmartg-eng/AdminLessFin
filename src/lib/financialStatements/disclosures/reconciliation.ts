/**
 * A note must agree with the statement line it explains.
 *
 * The statements and the notes are built from one sealed snapshot, by two
 * engines — one lays out the statements, the other the notes — and they drifted
 * apart without anyone being told: revenue printed at 5 571 000 in its note
 * against 3 421 000 on the income statement, and "Total equity" in the equity
 * note was the share capital alone. This is the check that stops that
 * happening quietly again. Each generated note names the total that must equal
 * a statement line, for both years, and any difference is reported.
 */
import type { DocumentModel } from '../document/documentModel';
import type { EfsStatementLine } from '../api';
import { asGeneratedTable } from './assemble';

export type NoteReconciliationRule = {
  /** The note, by disclosure code. */
  disclosure: string;
  /** The table in it, by table code. */
  table: string;
  /** The row whose figures must agree, by its key (a total row's key is its label). */
  row: string;
  /** The statement line it must agree with. */
  line: string;
};

/** Which note total explains which statement line. Declared once, here. */
export const NOTE_RECONCILIATIONS: NoteReconciliationRule[] = [
  { disclosure: 'DISC.PPE', table: 'PPE.CARRYING', row: 'Carrying amount', line: 'sfp.ppe' },
  { disclosure: 'DISC.INTANGIBLES', table: 'INTANGIBLES.CARRYING', row: 'Carrying amount', line: 'sfp.intangibles' },
  { disclosure: 'DISC.INVENTORIES', table: 'INVENTORIES.ANALYSIS', row: 'Total inventories', line: 'sfp.inventory' },
  { disclosure: 'DISC.RECEIVABLES', table: 'RECEIVABLES.ANALYSIS', row: 'Net receivables', line: 'sfp.receivables' },
  { disclosure: 'DISC.CASH', table: 'CASH.ANALYSIS', row: 'Cash and cash equivalents', line: 'sfp.cash' },
  { disclosure: 'DISC.SHARECAPITAL', table: 'EQUITY.ANALYSIS', row: 'Total equity', line: 'sfp.total_equity' },
  { disclosure: 'DISC.BORROWINGS', table: 'BORROWINGS.ANALYSIS', row: 'Total borrowings', line: 'sfp.borrowings' },
  { disclosure: 'DISC.PAYABLES', table: 'PAYABLES.ANALYSIS', row: 'Total trade and other payables', line: 'sfp.payables' },
  { disclosure: 'DISC.PROVISIONS', table: 'PROVISIONS.ANALYSIS', row: 'Total provisions', line: 'sfp.provisions' },
  { disclosure: 'DISC.REVENUE', table: 'REVENUE.DISAGGREGATION', row: 'Total revenue', line: 'perf.revenue' },
  { disclosure: 'DISC.OTHERINCOME', table: 'OTHERINCOME.ANALYSIS', row: 'Total other income', line: 'perf.other_income' },
  { disclosure: 'DISC.COSTOFSALES', table: 'COSTOFSALES.ANALYSIS', row: 'Total cost of sales', line: 'perf.cost_of_sales' },
  { disclosure: 'DISC.EMPLOYEE', table: 'EMPLOYEE.ANALYSIS', row: 'Total employee costs', line: 'perf.employee_costs' },
  { disclosure: 'DISC.OPERATINGEXPENSES', table: 'OPEX.ANALYSIS', row: 'Total operating expenses', line: 'perf.operating_expenses' },
];

export type NoteDisagreement = {
  noteId: string;
  noteTitle: string;
  disclosure: string;
  statementId: string;
  statementLabel: string;
  line: string;
  year: 'current' | 'comparative';
  noteFigure: number;
  statementFigure: number;
};

const TOLERANCE = 0.01;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Every place a note's total disagrees with the statement line it explains. */
export function reconcileNotesToStatements(model: DocumentModel): NoteDisagreement[] {
  const lines = new Map<string, { line: EfsStatementLine; statementId: string }>();
  for (const s of model.statements) {
    for (const line of s.lines) lines.set(String(line.line_code), { line, statementId: s.id });
  }

  const out: NoteDisagreement[] = [];
  for (const rule of NOTE_RECONCILIATIONS) {
    const statement = lines.get(rule.line);
    if (!statement) continue;
    const note = model.notes.find(
      (n) => String(n.disclosure_code).toUpperCase() === rule.disclosure && n.status !== 'superseded',
    );
    const stored = note?.tables.find((t) => t.table_code === rule.table);
    if (!note || !stored) continue;
    const table = asGeneratedTable(stored);
    const row = table.rows.find((r) => r.key === rule.row || r.cells[0]?.value === rule.row);
    if (!row) continue;

    const pairs: Array<['current' | 'comparative', number | null, number | null]> = [
      ['current', num(row.cells[1]?.value), num(statement.line.amount)],
      ['comparative', num(row.cells[2]?.value), num(statement.line.prior_amount)],
    ];
    for (const [year, noteFigure, statementFigure] of pairs) {
      if (noteFigure == null || statementFigure == null) continue;
      if (Math.abs(noteFigure - statementFigure) <= TOLERANCE) continue;
      out.push({
        noteId: note.id,
        noteTitle: note.title,
        disclosure: rule.disclosure,
        statementId: statement.statementId,
        statementLabel: statement.line.label,
        line: rule.line,
        year,
        noteFigure,
        statementFigure,
      });
    }
  }
  return out;
}
