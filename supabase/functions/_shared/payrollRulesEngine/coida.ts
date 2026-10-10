/**
 * COIDA Return of Earnings (ROE) worksheet. The Compensation Fund's assessment year runs
 * 1 March to the end of February and is named by the year it starts in. Employers type the
 * totals into CF Online and attach a per-employee earnings report; there is no upload file.
 *
 * Earnings (GN 6141 of 2025): salary and wages, bonuses, overtime, commission, allowances
 * (housing, travel, cell, public holiday, Sunday, shift, …) and free quarters; reimbursements
 * and ex-gratia payments are excluded. Each employee's earnings count up to the year's
 * maximum (not pro-rated for part of a year). Assessment = the larger of the minimum
 * assessment and the assessable earnings × the employer's rate.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export type CoidaYear = { startYear: number; maxEarnings: number; minAssessment: number; minAssessmentDomestic: number; source: string };

export const COIDA_YEARS: CoidaYear[] = [
  { startYear: 2024, maxEarnings: 597_328, minAssessment: 1_530, minAssessmentDomestic: 528, source: 'Compensation Fund notice, 2024/25' },
  { startYear: 2025, maxEarnings: 633_168, minAssessment: 1_621, minAssessmentDomestic: 560, source: 'Compensation Fund notice, 2025/26' },
  { startYear: 2026, maxEarnings: 668_000, minAssessment: 1_621, minAssessmentDomestic: 560, source: 'GN 3910, GG 54577 (5 May 2026)' },
];

export function coidaYear(startYear: number): CoidaYear {
  return COIDA_YEARS.find((y) => y.startYear === startYear)
    ?? [...COIDA_YEARS].sort((a, b) => b.startYear - a.startYear)[0];
}

export function coidaPeriod(startYear: number): { start: string; end: string } {
  const leap = ((startYear + 1) % 4 === 0 && (startYear + 1) % 100 !== 0) || (startYear + 1) % 400 === 0;
  return { start: `${startYear}-03-01`, end: `${startYear + 1}-02-${leap ? 29 : 28}` };
}

/**
 * IRP5 codes that are COIDA earnings: salary and wages (3601, 3615), annual payments such as
 * bonuses and leave pay (3605), commission (3606), overtime (3607), travel allowance (3701),
 * other taxable allowances (3713) and free quarters (3805). Reimbursive allowances, non-cash
 * fringe benefits and non-taxable allowances are left out.
 */
export const COIDA_EARNING_CODES = new Set(['3601', '3605', '3606', '3607', '3615', '3701', '3713', '3805']);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function coidaEarningsFromItems(items: Array<{ code: string | null; amount: number; type?: string }>): number {
  return round2(items.filter((i) => i.code && COIDA_EARNING_CODES.has(i.code) && i.type !== 'deduction').reduce((s, i) => s + (Number(i.amount) || 0), 0));
}

export type RoeEmployee = { employeeId: string; name: string; employeeNumber: string | null; idNumber: string | null; earnings: number };

export type RoeWorksheet = {
  startYear: number;
  period: { start: string; end: string };
  maxEarnings: number;
  minAssessment: number;
  ratePercent: number | null;
  employees: Array<RoeEmployee & { assessable: number; capped: boolean }>;
  totals: { employees: number; earnings: number; assessable: number };
  assessment: number | null;
  provisional: { employees: number; earnings: number; assessable: number; assessment: number | null };
};

export function buildRoeWorksheet(input: {
  startYear: number;
  employees: RoeEmployee[];
  ratePercent: number | null;
  domestic?: boolean;
  provisionalGrowthPercent?: number;
}): RoeWorksheet {
  const year = coidaYear(input.startYear);
  const nextYear = coidaYear(input.startYear + 1);
  const minAssessment = input.domestic ? year.minAssessmentDomestic : year.minAssessment;
  const employees = input.employees
    .filter((e) => e.earnings > 0)
    .map((e) => ({ ...e, earnings: round2(e.earnings), assessable: round2(Math.min(e.earnings, year.maxEarnings)), capped: e.earnings > year.maxEarnings }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totals = {
    employees: employees.length,
    earnings: round2(employees.reduce((s, e) => s + e.earnings, 0)),
    assessable: round2(employees.reduce((s, e) => s + e.assessable, 0)),
  };
  const rate = input.ratePercent != null && input.ratePercent >= 0 ? input.ratePercent : null;
  const assess = (assessable: number, min: number) => (rate === null ? null : round2(Math.max(min, (assessable * rate) / 100)));
  const growth = 1 + (input.provisionalGrowthPercent ?? 0) / 100;
  const provisionalAssessable = round2(employees.reduce((s, e) => s + Math.min(e.earnings * growth, nextYear.maxEarnings), 0));
  return {
    startYear: input.startYear,
    period: coidaPeriod(input.startYear),
    maxEarnings: year.maxEarnings,
    minAssessment,
    ratePercent: rate,
    employees,
    totals,
    assessment: assess(totals.assessable, minAssessment),
    provisional: {
      employees: employees.length,
      earnings: round2(totals.earnings * growth),
      assessable: provisionalAssessable,
      assessment: assess(provisionalAssessable, input.domestic ? nextYear.minAssessmentDomestic : nextYear.minAssessment),
    },
  };
}
