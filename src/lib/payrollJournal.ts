/**
 * Payroll journal accounting — V3.0.4 lockdown.
 *
 * Canonical GL posting model (LOCKED): consolidated 3-line journal per PAYROLL_STABILIZATION_REPORT.
 * - Debit: Wages expense (gross)
 * - Credit: Bank (net pay)
 * - Credit: Payroll liabilities (employee deductions)
 *
 * Granular statutory lines from the statutory engine live in calculation_snapshot.journal_lines
 * for audit, register reconciliation, and trial balance verification — not separate GL postings.
 */

import type { JournalLine } from './statutoryPayrollEngine/types';

export type ConsolidatedJournalPosting = {
  wagesDebit: number;
  bankCredit: number;
  liabilityCredit: number;
};

export type JournalIntegrityResult = {
  balanced: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
  granularBalanced: boolean;
  consolidatedMatchesGranular: boolean;
  statutoryBreakdown: {
    payeLiability: number;
    uifLiability: number;
    sdlExpense: number;
    sdlLiability: number;
    otherDeductions: number;
    employerUif: number;
  };
  errors: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildConsolidatedJournalPosting(
  grossEarnings: number,
  netPay: number,
  totalDeductions: number
): ConsolidatedJournalPosting {
  return {
    wagesDebit: round2(grossEarnings),
    bankCredit: round2(netPay),
    liabilityCredit: round2(totalDeductions),
  };
}

export function verifyConsolidatedJournalPosting(posting: ConsolidatedJournalPosting): boolean {
  return round2(posting.wagesDebit) === round2(posting.bankCredit + posting.liabilityCredit);
}

export function summarizeStatutoryJournalLines(lines: JournalLine[]) {
  let payeLiability = 0;
  let uifLiability = 0;
  let sdlExpense = 0;
  let otherDeductions = 0;
  let employerUif = 0;
  let wagesDebit = 0;
  let bankCredit = 0;

  for (const line of lines) {
    if (line.accountRole === 'wages') wagesDebit += line.debit;
    if (line.accountRole === 'bank') bankCredit += line.credit;
    if (line.accountRole === 'paye_liability') payeLiability += line.credit;
    if (line.accountRole === 'uif_liability') {
      if (line.sourceEngine === 'uif_employer') employerUif += line.credit;
      else if (line.sourceEngine === 'uif') uifLiability += line.credit;
      else if (line.debit > 0) employerUif += line.debit;
      else uifLiability += line.credit;
    }
    if (line.accountRole === 'sdl_expense') sdlExpense += line.debit;
    if (line.accountRole === 'other_deduction') otherDeductions += line.credit;
  }

  return {
    payeLiability: round2(payeLiability),
    uifLiability: round2(uifLiability),
    sdlExpense: round2(sdlExpense),
    sdlLiability: 0,
    otherDeductions: round2(otherDeductions),
    employerUif: round2(employerUif),
    wagesDebit: round2(wagesDebit),
    bankCredit: round2(bankCredit),
  };
}

export function verifyJournalIntegrity(
  journalLines: JournalLine[],
  consolidated?: ConsolidatedJournalPosting
): JournalIntegrityResult {
  const errors: string[] = [];
  const breakdown = summarizeStatutoryJournalLines(journalLines);

  const employeeLiabilityCredits = round2(
    breakdown.payeLiability + breakdown.uifLiability + breakdown.otherDeductions
  );

  // Granular statutory lines balance employee-facing postings: gross = net + employee liabilities.
  // Employer SDL/UIF employer are CTC accruals (expense/liability) outside consolidated GL posting.
  const granularEmployeeBalanced =
    round2(breakdown.wagesDebit) === round2(breakdown.bankCredit + employeeLiabilityCredits);

  if (!granularEmployeeBalanced) {
    errors.push(
      `Granular employee journal imbalance: wages ${breakdown.wagesDebit} ≠ bank ${breakdown.bankCredit} + liabilities ${employeeLiabilityCredits}`
    );
  }

  let consolidatedMatchesGranular = true;
  if (consolidated) {
    if (!verifyConsolidatedJournalPosting(consolidated)) {
      errors.push('Consolidated GL posting does not balance');
    }
    if (round2(consolidated.wagesDebit) !== breakdown.wagesDebit) {
      consolidatedMatchesGranular = false;
      errors.push('Consolidated wages debit does not match granular wages line');
    }
    if (round2(consolidated.bankCredit) !== breakdown.bankCredit) {
      consolidatedMatchesGranular = false;
      errors.push('Consolidated bank credit does not match granular bank line');
    }
    if (round2(consolidated.liabilityCredit) !== employeeLiabilityCredits) {
      consolidatedMatchesGranular = false;
      errors.push(
        `Consolidated liability credit ${consolidated.liabilityCredit} ≠ employee liabilities ${employeeLiabilityCredits}`
      );
    }
  }

  const totalDebits = round2(journalLines.reduce((s, l) => s + l.debit, 0));
  const totalCredits = round2(journalLines.reduce((s, l) => s + l.credit, 0));

  return {
    balanced: granularEmployeeBalanced && (consolidated ? verifyConsolidatedJournalPosting(consolidated) : true),
    totalDebits,
    totalCredits,
    difference: round2(totalDebits - totalCredits),
    granularBalanced: granularEmployeeBalanced,
    consolidatedMatchesGranular,
    statutoryBreakdown: breakdown,
    errors,
  };
}

export function verifyTrialBalanceLines(
  lines: JournalLine[],
): { balanced: boolean; totalDebits: number; totalCredits: number } {
  const breakdown = summarizeStatutoryJournalLines(lines);
  const employeeLiabilityCredits = round2(
    breakdown.payeLiability + breakdown.uifLiability + breakdown.otherDeductions
  );
  return {
    balanced: round2(breakdown.wagesDebit) === round2(breakdown.bankCredit + employeeLiabilityCredits),
    totalDebits: breakdown.wagesDebit,
    totalCredits: round2(breakdown.bankCredit + employeeLiabilityCredits),
  };
}
