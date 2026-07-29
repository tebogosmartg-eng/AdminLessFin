import { buildValidationResult, mergeIssues } from '../../../../returns/snapshot';
import type { GenerateReturnInput, StatutoryReturn, StatutoryValidationResult } from '../../../../../lib/statutoryReturns/types';

export function validateIrp5(
  ret: StatutoryReturn,
  _input?: GenerateReturnInput
): StatutoryValidationResult {
  const issues = mergeIssues(ret.validationResult?.issues ?? []);

  if (ret.returnType !== 'IRP5' && ret.returnType !== 'TAX_CERTIFICATE') {
    issues.push({
      code: 'IRP5_TYPE_MISMATCH',
      severity: 'error',
      message: `Expected IRP5/TAX_CERTIFICATE, received ${ret.returnType}.`,
    });
  }

  const certificates = ret.declarationData.certificates as
    | Array<{ employeeName: string; taxReference: string | null }>
    | undefined;

  if (!certificates) {
    issues.push({
      code: 'IRP5_MISSING_CERTIFICATES',
      severity: 'error',
      message: 'IRP5 declaration missing certificates.',
    });
  } else {
    for (const cert of certificates) {
      if (!cert.taxReference) {
        issues.push({
          code: 'IRP5_MISSING_TAX_REFERENCE',
          severity: 'warning',
          message: `Employee ${cert.employeeName} has no tax reference on source payslips.`,
          field: 'taxReference',
        });
      }
    }
  }

  return buildValidationResult(issues);
}
