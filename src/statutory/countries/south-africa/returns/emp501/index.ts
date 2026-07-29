import type { StatutoryReturnPlugin } from '../../../../returns/contracts';
import { generateEmp501 } from './generator';
import { validateEmp501 } from './validator';
import { exportEmp501 } from './exporter';
import { transmitEmp501 } from './transmission';
import { EMP501_MAPPINGS } from './mappings';
import { EMP501_SCHEMA } from './schema';

function withValidation(generate: typeof generateEmp501): typeof generateEmp501 {
  return (input) => {
    const built = generate(input);
    const validation = validateEmp501(built, input);
    return {
      ...built,
      validationResult: validation,
      status: validation.ok ? 'validated' : 'draft',
    };
  };
}

export const zaEmp501Plugin: StatutoryReturnPlugin = {
  country: 'ZA',
  returnType: 'EMP501',
  label: 'EMP501',
  description: 'Annual employer reconciliation from finalized payroll runs in the tax year.',
  frequency: 'annual',
  generate: withValidation(generateEmp501),
  validate: validateEmp501,
  exportReturn: exportEmp501,
  transmit: transmitEmp501,
  mappingsId: EMP501_MAPPINGS.id,
  schemaId: EMP501_SCHEMA.id,
};

export { generateEmp501, validateEmp501, exportEmp501, transmitEmp501 };
