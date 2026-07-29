/**
 * Pivot Engine — arbitrary row × column pivots over Payroll Facts
 */

import { buildMatrix, type GenericMatrix } from './matrixEngine';
import type { PayrollFact } from '../facts/PayrollFact';
import {
  resolveDimensionValue,
  saMonthColumnOrder,
  taxYearStartFromFacts,
  type ReportDimension,
} from './DimensionEngine';
import { extractMeasureValue, measureToAggregationFn, type ReportMeasureKind } from './MeasureEngine';
import { measureFactItemAmount } from '../facts/adapters';
import { getPayrollItem } from '../facts/PayrollItemRegistry';

export type PivotConfig = {
  rowDimension: ReportDimension;
  columnDimension: ReportDimension;
  measure?: ReportMeasureKind;
  itemCodes?: string[];
  taxYearStartYear?: number;
  includeTotalColumn?: boolean;
};

export type PivotResult = GenericMatrix & {
  config: PivotConfig;
};

/**
 * Build a pivot. When rowDimension is payroll_item, expands itemCodes as matrix rows.
 */
export function buildPayrollFactPivot(facts: PayrollFact[], config: PivotConfig): PivotResult {
  const taxYearStartYear = config.taxYearStartYear ?? taxYearStartFromFacts(facts);
  const itemCodes = config.itemCodes?.length
    ? config.itemCodes
    : ['gross_pay']; // fallback single measure via totals

  if (config.rowDimension === 'payroll_item') {
    const columnOrder =
      config.columnDimension === 'month' ? saMonthColumnOrder(taxYearStartYear) : undefined;

    const matrix = buildMatrix<PayrollFact>({
      data: facts,
      measures: itemCodes.map((code) => ({
        id: code,
        label: getPayrollItem(code)?.description ?? code,
        value: (fact) => measureFactItemAmount(fact, code),
        aggregation: measureToAggregationFn(config.measure ?? 'amount'),
      })),
      columns: {
        key: (fact) => resolveDimensionValue(fact, config.columnDimension),
        order: columnOrder,
      },
      includeTotalColumn: config.includeTotalColumn !== false,
      totalColumnLabel: config.columnDimension === 'month' ? 'Annual Total' : 'Total',
    });

    return { ...matrix, config };
  }

  // Generic: one amount measure, row key from dimension
  const columnOrder =
    config.columnDimension === 'month' ? saMonthColumnOrder(taxYearStartYear) : undefined;

  const matrix = buildMatrix<PayrollFact>({
    data: facts,
    measures: [
      {
        id: 'amount',
        label: 'Amount',
        value: (fact) =>
          extractMeasureValue(fact, {
            kind: config.measure ?? 'amount',
            itemCode: itemCodes[0],
          }),
        aggregation: measureToAggregationFn(config.measure ?? 'amount'),
      },
    ],
    columns: {
      key: (fact) => resolveDimensionValue(fact, config.columnDimension),
      order: columnOrder,
    },
    includeTotalColumn: config.includeTotalColumn !== false,
  });

  return { ...matrix, config };
}

export { buildMatrix };
