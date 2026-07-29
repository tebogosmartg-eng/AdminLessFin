/**
 * V16.0 — Generic Movement Schedule Engine.
 *
 * Asset-agnostic roll-forward engine supporting PPE, investment property,
 * intangibles, biological assets, goodwill, equity, borrowings, lease
 * liabilities, deferred tax, inventory, and future frameworks.
 */
import type {
  MovementColumnRole,
  MovementSchedule,
  MovementScheduleRow,
} from './types';

export type MovementScheduleDefinition = {
  scheduleCode: string;
  title: string;
  categoryKey: string;
  /** Column roles in presentation order. */
  columns: MovementColumnRole[];
  rowDefinitions: Array<{ rowCode: string; label: string; isTotal?: boolean }>;
};

/** Registry of movement schedule definitions — extensible without asset-specific code. */
export const MOVEMENT_SCHEDULE_DEFINITIONS: MovementScheduleDefinition[] = [
  {
    scheduleCode: 'SCH.PPE.MOVEMENT',
    title: 'Reconciliation of property, plant and equipment',
    categoryKey: 'ppe',
    columns: ['opening', 'additions', 'disposals', 'depreciation', 'closing'],
    rowDefinitions: [
      { rowCode: 'ppe.land', label: 'Land' },
      { rowCode: 'ppe.buildings', label: 'Buildings' },
      { rowCode: 'ppe.plant', label: 'Plant and machinery' },
      { rowCode: 'ppe.motor', label: 'Motor vehicles' },
      { rowCode: 'ppe.office', label: 'Office equipment' },
      { rowCode: 'ppe.total', label: 'Total', isTotal: true },
    ],
  },
  {
    scheduleCode: 'SCH.INVPROP.MOVEMENT',
    title: 'Reconciliation of investment property',
    categoryKey: 'investment_property',
    columns: ['opening', 'additions', 'disposals', 'revaluation', 'closing'],
    rowDefinitions: [{ rowCode: 'invprop.total', label: 'Investment property', isTotal: true }],
  },
  {
    scheduleCode: 'SCH.INTANGIBLES.MOVEMENT',
    title: 'Reconciliation of intangible assets',
    categoryKey: 'intangibles',
    columns: ['opening', 'additions', 'disposals', 'depreciation', 'closing'],
    rowDefinitions: [
      { rowCode: 'intang.software', label: 'Software' },
      { rowCode: 'intang.patents', label: 'Patents and licences' },
      { rowCode: 'intang.total', label: 'Total', isTotal: true },
    ],
  },
  {
    scheduleCode: 'SCH.BIOLOGICAL.MOVEMENT',
    title: 'Reconciliation of biological assets',
    categoryKey: 'biological',
    columns: ['opening', 'additions', 'disposals', 'other_movements', 'closing'],
    rowDefinitions: [{ rowCode: 'bio.total', label: 'Biological assets', isTotal: true }],
  },
  {
    scheduleCode: 'SCH.GOODWILL.MOVEMENT',
    title: 'Reconciliation of goodwill',
    categoryKey: 'goodwill',
    columns: ['opening', 'additions', 'impairment', 'closing'],
    rowDefinitions: [{ rowCode: 'gw.total', label: 'Goodwill', isTotal: true }],
  },
  {
    scheduleCode: 'SCH.EQUITY.MOVEMENT',
    title: 'Reconciliation of equity',
    categoryKey: 'equity',
    columns: ['opening', 'additions', 'other_movements', 'closing'],
    rowDefinitions: [
      { rowCode: 'eq.share_capital', label: 'Share capital' },
      { rowCode: 'eq.retained', label: 'Retained earnings' },
      { rowCode: 'eq.total', label: 'Total equity', isTotal: true },
    ],
  },
  {
    scheduleCode: 'SCH.BORROWINGS.MOVEMENT',
    title: 'Reconciliation of borrowings',
    categoryKey: 'borrowings',
    columns: ['opening', 'additions', 'disposals', 'other_movements', 'closing'],
    rowDefinitions: [{ rowCode: 'bor.total', label: 'Borrowings', isTotal: true }],
  },
  {
    scheduleCode: 'SCH.LEASE.MOVEMENT',
    title: 'Reconciliation of lease liabilities',
    categoryKey: 'lease_liabilities',
    columns: ['opening', 'additions', 'disposals', 'other_movements', 'closing'],
    rowDefinitions: [{ rowCode: 'lease.total', label: 'Lease liabilities', isTotal: true }],
  },
  {
    scheduleCode: 'SCH.DEFTAX.MOVEMENT',
    title: 'Reconciliation of deferred tax',
    categoryKey: 'deferred_tax',
    columns: ['opening', 'additions', 'other_movements', 'closing'],
    rowDefinitions: [
      { rowCode: 'dtx.asset', label: 'Deferred tax asset' },
      { rowCode: 'dtx.liability', label: 'Deferred tax liability' },
    ],
  },
  {
    scheduleCode: 'SCH.INVENTORY.MOVEMENT',
    title: 'Reconciliation of inventories',
    categoryKey: 'inventory',
    columns: ['opening', 'additions', 'disposals', 'closing'],
    rowDefinitions: [{ rowCode: 'inv.total', label: 'Inventories', isTotal: true }],
  },
];

export type FactLookup = Map<string, number>;

function parseNumericCell(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Validate opening + movements = closing for a movement row. */
export function validateMovementRow(
  row: MovementScheduleRow,
  columns: MovementColumnRole[],
): { passed: boolean; message: string | null } {
  const closing = row.values.closing ?? null;
  if (closing == null) return { passed: true, message: null };

  const hasMovementData = columns.some(
    (col) => col !== 'opening' && col !== 'closing' && row.values[col] != null,
  );
  const hasOpening = row.values.opening != null;
  if (!hasMovementData && !hasOpening) return { passed: true, message: null };

  const opening = row.values.opening ?? 0;
  let movements = 0;
  for (const col of columns) {
    if (col === 'opening' || col === 'closing') continue;
    movements += row.values[col] ?? 0;
  }
  const expected = opening + movements;
  const tolerance = 0.01;
  if (Math.abs(expected - closing) <= tolerance) {
    return { passed: true, message: null };
  }
  return {
    passed: false,
    message: `${row.label}: opening (${opening}) + movements (${movements}) ≠ closing (${closing})`,
  };
}

/** Build movement schedule from table rows or fact lookup. */
export function buildMovementSchedule(
  def: MovementScheduleDefinition,
  source: { tableRows?: string[][]; facts?: FactLookup; closingLineCode?: string },
): MovementSchedule {
  const rows: MovementScheduleRow[] = def.rowDefinitions.map((rd) => {
    const values: Partial<Record<MovementColumnRole, number | null>> = {};
    for (const col of def.columns) values[col] = null;

    if (source.tableRows?.length) {
      const header = source.tableRows[0]?.map((h) => h.toLowerCase()) || [];
      const dataRows = source.tableRows.slice(1);
      const matchRow = dataRows.find((r) =>
        r[0]?.toLowerCase().includes(rd.label.toLowerCase().slice(0, 8)),
      );
      if (matchRow) {
        for (let i = 1; i < matchRow.length && i < def.columns.length + 1; i++) {
          const colRole = def.columns[i - 1];
          if (colRole) values[colRole] = parseNumericCell(matchRow[i] || '');
        }
      }
    }

    if (source.facts && rd.isTotal && source.closingLineCode) {
      const closing = source.facts.get(source.closingLineCode);
      if (closing != null) values.closing = closing;
    }

    return { rowCode: rd.rowCode, label: rd.label, values, isTotal: rd.isTotal };
  });

  let validated = true;
  let validationMessage: string | null = null;
  for (const row of rows) {
    const result = validateMovementRow(row, def.columns);
    if (!result.passed) {
      validated = false;
      validationMessage = result.message;
      break;
    }
  }

  return {
    id: `movement:${def.scheduleCode}`,
    scheduleCode: def.scheduleCode,
    title: def.title,
    categoryKey: def.categoryKey,
    columns: def.columns,
    rows,
    validated,
    validationMessage,
    comparativeRows: null,
  };
}

/** Resolve movement schedules linked to a disclosure. */
export function resolveMovementSchedules(
  scheduleCodes: string[],
  context: {
    tableRowsBySchedule?: Record<string, string[][]>;
    facts?: FactLookup;
    closingLineBySchedule?: Record<string, string>;
  },
): MovementSchedule[] {
  const schedules: MovementSchedule[] = [];
  for (const code of scheduleCodes) {
    const def = MOVEMENT_SCHEDULE_DEFINITIONS.find((d) => d.scheduleCode === code);
    if (!def) continue;
    schedules.push(
      buildMovementSchedule(def, {
        tableRows: context.tableRowsBySchedule?.[code],
        facts: context.facts,
        closingLineCode: context.closingLineBySchedule?.[code],
      }),
    );
  }
  return schedules;
}

export function movementScheduleToTableRows(schedule: MovementSchedule): string[][] {
  const header = ['', ...schedule.columns.map(formatColumnLabel)];
  const rows = schedule.rows.map((r) => [
    r.label,
    ...schedule.columns.map((c) => formatMovementValue(r.values[c])),
  ]);
  return [header, ...rows];
}

function formatColumnLabel(role: MovementColumnRole): string {
  const labels: Record<MovementColumnRole, string> = {
    opening: 'Opening balance',
    additions: 'Additions',
    disposals: 'Disposals',
    transfers: 'Transfers',
    depreciation: 'Depreciation',
    impairment: 'Impairment',
    revaluation: 'Revaluation',
    foreign_exchange: 'Foreign exchange',
    other_movements: 'Other movements',
    closing: 'Closing balance',
  };
  return labels[role] || role;
}

function formatMovementValue(value: number | null | undefined): string {
  if (value == null) return '[ — ]';
  return value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function findMovementDefinition(scheduleCode: string): MovementScheduleDefinition | undefined {
  return MOVEMENT_SCHEDULE_DEFINITIONS.find((d) => d.scheduleCode === scheduleCode);
}
