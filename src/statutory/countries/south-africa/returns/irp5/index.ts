import type { StatutoryReturnPlugin } from '../../../../returns/contracts';
import { generateIrp5 } from './generator';
import { validateIrp5 } from './validator';
import { exportIrp5 } from './exporter';
import { transmitIrp5 } from './transmission';
import { IRP5_MAPPINGS } from './mappings';
import { IRP5_SCHEMA } from './schema';

function withValidation(generate: typeof generateIrp5): typeof generateIrp5 {
  return (input) => {
    const built = generate(input);
    const validation = validateIrp5(built, input);
    return {
      ...built,
      validationResult: validation,
      status: validation.ok ? 'validated' : 'draft',
    };
  };
}

export const zaIrp5Plugin: StatutoryReturnPlugin = {
  country: 'ZA',
  returnType: 'IRP5',
  label: 'IRP5',
  description: 'Employee tax certificates aggregated from finalized payroll for the tax year.',
  frequency: 'annual',
  generate: withValidation(generateIrp5),
  validate: validateIrp5,
  exportReturn: exportIrp5,
  transmit: transmitIrp5,
  mappingsId: IRP5_MAPPINGS.id,
  schemaId: IRP5_SCHEMA.id,
};

export { generateIrp5, validateIrp5, exportIrp5, transmitIrp5 };
