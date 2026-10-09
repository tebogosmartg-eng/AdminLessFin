/**
 * Warnings for a payroll run, so nobody is left out silently and missing SARS details
 * surface while they can still be fixed, not at IRP5 time. Warnings never stop a run.
 * They are worked out from the current employee records each time the run is shown,
 * so fixing an employee clears the warning; a snapshot is also kept on the run when
 * payslips are generated.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export type RunWarningCode =
  | 'NO_SALARY'
  | 'NOT_ON_RUN'
  | 'INPUTS_NOT_APPLIED'
  | 'MISSING_TAX_NUMBER'
  | 'INVALID_TAX_NUMBER'
  | 'MISSING_IDENTITY'
  | 'INVALID_ID_NUMBER'
  | 'MISSING_RESIDENTIAL_ADDRESS'
  | 'MISSING_BANK_ACCOUNT_TYPE';

export type RunWarning = {
  code: RunWarningCode;
  /** 'pay' warnings mean someone was not paid as expected; 'sars' warnings are missing employee details. */
  category: 'pay' | 'sars';
  employee_id: string;
  employee_name: string;
  message: string;
};

export type RunWarningEmployee = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  salary_amount?: number | null;
  salary_period?: string | null;
  tax_number?: string | null;
  id_number?: string | null;
  passport_number?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  residential_street_name?: string | null;
  residential_complex?: string | null;
  residential_city?: string | null;
  residential_suburb?: string | null;
  residential_postal_code?: string | null;
};

/** SARS income tax reference: 10 digits starting with 0, 1, 2, 3 or 9. */
export function isPlausibleTaxNumber(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/\s/g, '');
  return /^[01239]\d{9}$/.test(digits);
}

/**
 * A 13-digit South African ID number with a real birth date (YYMMDD) and a valid
 * check digit. The same rule as the employee form; non-13-digit values are treated
 * as passport or foreign numbers and not checked here.
 */
export function isValidSaIdNumber(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/\s/g, '');
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(digits[12 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10 !== 0) return false;
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const date = new Date(Date.UTC(2000 + Number(digits.slice(0, 2)), mm - 1, dd));
  return date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd;
}

/** True for a 13-digit value that is not a valid SA ID (other values are passports). */
export function isInvalidSaIdNumber(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/\s/g, '');
  return /^\d{13}$/.test(digits) && !isValidSaIdNumber(digits);
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function nameOf(employee: RunWarningEmployee): string {
  return [employee.first_name, employee.last_name].filter(hasText).join(' ') || employee.id;
}

export function payrollRunWarnings(input: {
  /** Employees on the run's pay frequency who were employed during the period. */
  candidates: RunWarningEmployee[];
  /** Employees who received a payslip. */
  paidEmployeeIds: Set<string>;
  /** Every employee of the company, to name those with run inputs who were left out. */
  allEmployees: RunWarningEmployee[];
  /** Run inputs entered for this run. */
  periodInputs: Array<{ employee_id: string; component_code: string }>;
  payFrequency: string;
}): RunWarning[] {
  const warnings: RunWarning[] = [];
  const candidateIds = new Set(input.candidates.map((e) => e.id));

  for (const employee of input.candidates) {
    if (input.paidEmployeeIds.has(employee.id)) continue;
    if (!Number(employee.salary_amount)) {
      warnings.push({
        code: 'NO_SALARY', category: 'pay', employee_id: employee.id, employee_name: nameOf(employee),
        message: `${nameOf(employee)} was not paid: no salary amount is set on the employee.`,
      });
    } else {
      // The employee was changed after payslips were generated (salary set, dates or frequency changed).
      warnings.push({
        code: 'NOT_ON_RUN', category: 'pay', employee_id: employee.id, employee_name: nameOf(employee),
        message: `${nameOf(employee)} has no payslip on this run yet. Regenerate payslips to include them.`,
      });
    }
  }

  const byId = new Map(input.allEmployees.map((e) => [e.id, e]));
  const notApplied = new Map<string, string[]>();
  for (const row of input.periodInputs) {
    if (input.paidEmployeeIds.has(row.employee_id)) continue;
    const list = notApplied.get(row.employee_id) ?? [];
    list.push(row.component_code);
    notApplied.set(row.employee_id, list);
  }
  for (const [employeeId, codes] of notApplied) {
    const employee = byId.get(employeeId) ?? { id: employeeId };
    const frequency = employee.salary_period ?? 'monthly';
    const reason = frequency !== input.payFrequency
      ? `the employee is paid ${frequency}, and this is a ${input.payFrequency} run`
      : !candidateIds.has(employeeId)
        ? 'the employee was not employed during this pay period'
        : !Number(employee.salary_amount)
          ? 'the employee has no salary amount'
          : 'the employee has no payslip on this run yet; regenerate payslips';
    warnings.push({
      code: 'INPUTS_NOT_APPLIED', category: 'pay', employee_id: employeeId, employee_name: nameOf(employee),
      message: `Run inputs for ${nameOf(employee)} (${codes.join(', ')}) were not applied: ${reason}.`,
    });
  }

  for (const employee of input.candidates) {
    if (!input.paidEmployeeIds.has(employee.id)) continue;
    const name = nameOf(employee);
    const add = (code: RunWarningCode, message: string) =>
      warnings.push({ code, category: 'sars', employee_id: employee.id, employee_name: name, message });
    if (!hasText(employee.tax_number)) {
      add('MISSING_TAX_NUMBER', `${name} has no income tax number. SARS needs it on the IRP5.`);
    } else if (!isPlausibleTaxNumber(employee.tax_number)) {
      add('INVALID_TAX_NUMBER', `${name}'s income tax number is not 10 digits starting with 0, 1, 2, 3 or 9.`);
    }
    if (!hasText(employee.id_number) && !hasText(employee.passport_number)) {
      add('MISSING_IDENTITY', `${name} has no ID or passport number.`);
    } else if (isInvalidSaIdNumber(employee.id_number)) {
      add('INVALID_ID_NUMBER', `${name}'s ID number is not a valid South African ID (check digit or birth date is wrong).`);
    }
    const street = hasText(employee.residential_street_name) || hasText(employee.residential_complex);
    const place = hasText(employee.residential_city) || hasText(employee.residential_suburb);
    if (!street || !place || !hasText(employee.residential_postal_code)) {
      add('MISSING_RESIDENTIAL_ADDRESS', `${name}'s residential address is incomplete (street, suburb or city, and postal code).`);
    }
    if (hasText(employee.bank_account_number) && !hasText(employee.bank_account_type)) {
      add('MISSING_BANK_ACCOUNT_TYPE', `${name}'s bank account type (current, savings, …) is not set.`);
    }
  }

  return warnings;
}
