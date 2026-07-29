/**
 * EMP201 validator — isolated from generation (V3.6.1).
 */

import { buildValidationResult, mergeIssues } from '../../../../returns/snapshot';
import type { GenerateReturnInput, StatutoryReturn, StatutoryValidationResult } from '../../../../../lib/statutoryReturns/types';
import { EMP201_SCHEMA } from './schema';

export function validateEmp201(
  ret: StatutoryReturn,
  _input?: GenerateReturnInput
): StatutoryValidationResult {
  const issues = mergeIssues(ret.validationResult?.issues ?? []);

  if (ret.returnType !== 'EMP201') {
    issues.push({
      code: 'EMP201_TYPE_MISMATCH',
      severity: 'error',
      message: `Expected EMP201, received ${ret.returnType}.`,
    });
  }

  const totals = ret.declarationData.totals as
    | { paye?: number; uifTotal?: number; sdl?: number }
    | undefined;

  for (const field of EMP201_SCHEMA.requiredFields) {
    const [root, child] = field.split('.');
    const rootVal = ret.declarationData[root];
    if (child) {
      if (!rootVal || typeof rootVal !== 'object' || (rootVal as Record<string, unknown>)[child] == null) {
        issues.push({
          code: 'EMP201_MISSING_FIELD',
          severity: 'error',
          message: `Missing required field ${field}`,
          field,
        });
      }
    } else if (ret.declarationData[root] == null || ret.declarationData[root] === '') {
      issues.push({
        code: 'EMP201_MISSING_FIELD',
        severity: 'error',
        message: `Missing required field ${field}`,
        field,
      });
    }
  }

  if (
    totals &&
    (totals.paye ?? 0) <= 0 &&
    (totals.uifTotal ?? 0) <= 0 &&
    (totals.sdl ?? 0) <= 0 &&
    !issues.some((i) => i.severity === 'error')
  ) {
    issues.push({
      code: 'ZERO_LIABILITY',
      severity: 'warning',
      message: 'EMP201 totals are zero for the selected period.',
    });
  }

  return buildValidationResult(issues);
}
