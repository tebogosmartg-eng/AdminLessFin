/**
 * Tax certificates — catalogue plugin over IRP5 declaration data.
 */

import type { StatutoryReturnPlugin } from '../../../../returns/contracts';
import { generateIrp5 } from '../irp5/generator';
import { validateIrp5 } from '../irp5/validator';
import { exportIrp5 } from '../irp5/exporter';
import { transmitIrp5 } from '../irp5/transmission';
import type { GenerateReturnInput, StatutoryReturn } from '../../../../../lib/statutoryReturns/types';

export const TAX_CERTIFICATE_SCHEMA = {
  id: 'za.tax_certificate.schema.v1',
  returnType: 'TAX_CERTIFICATE' as const,
};

export const TAX_CERTIFICATE_MAPPINGS = {
  id: 'za.tax_certificate.mappings.v1',
};

export function generateTaxCertificate(input: GenerateReturnInput): StatutoryReturn {
  const base = generateIrp5({ ...input, employeeId: input.employeeId });
  const validation = validateIrp5(
    {
      ...base,
      returnType: 'TAX_CERTIFICATE',
    },
    input
  );
  return {
    ...base,
    id: base.id.replace(/^IRP5_/, 'TAXCERT_'),
    returnType: 'TAX_CERTIFICATE',
    validationResult: validation,
    status: validation.ok ? 'validated' : 'draft',
    declarationData: {
      ...base.declarationData,
      returnType: 'TAX_CERTIFICATE',
      mappingsId: TAX_CERTIFICATE_MAPPINGS.id,
    },
    contentHash: null,
    immutable: false,
  };
}

export const zaTaxCertificatePlugin: StatutoryReturnPlugin = {
  country: 'ZA',
  returnType: 'TAX_CERTIFICATE',
  label: 'Tax Certificates',
  description: 'Per-employee tax certificate view over IRP5 declaration data.',
  frequency: 'per_employee',
  generate: generateTaxCertificate,
  validate: validateIrp5,
  exportReturn: exportIrp5,
  transmit: transmitIrp5,
  mappingsId: TAX_CERTIFICATE_MAPPINGS.id,
  schemaId: TAX_CERTIFICATE_SCHEMA.id,
};
