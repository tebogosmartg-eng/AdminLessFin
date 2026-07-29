import type { StatutoryReturnPlugin } from '../../../../returns/contracts';
import { generateEmp201 } from './generator';
import { validateEmp201 } from './validator';
import { exportEmp201 } from './exporter';
import { transmitEmp201 } from './transmission';
import { EMP201_MAPPINGS } from './mappings';
import { EMP201_SCHEMA } from './schema';

function withValidation(generate: typeof generateEmp201): typeof generateEmp201 {
  return (input) => {
    const built = generate(input);
    const validation = validateEmp201(built, input);
    return {
      ...built,
      validationResult: validation,
      status: validation.ok ? 'validated' : 'draft',
    };
  };
}

export const zaEmp201Plugin: StatutoryReturnPlugin = {
  country: 'ZA',
  returnType: 'EMP201',
  label: 'EMP201',
  description: 'Monthly employer declaration (PAYE, UIF, SDL) from finalized payroll.',
  frequency: 'monthly',
  generate: withValidation(generateEmp201),
  validate: validateEmp201,
  exportReturn: exportEmp201,
  transmit: transmitEmp201,
  mappingsId: EMP201_MAPPINGS.id,
  schemaId: EMP201_SCHEMA.id,
};

export { generateEmp201, validateEmp201, exportEmp201, transmitEmp201 };
