/**
 * Auditor provenance reverse-lookup.
 */

import type { CountryLegislationPackage, StatutoryConstant } from './types';
import { resolveLegislation } from './resolveLegislation';

function isConstant(v: unknown): v is StatutoryConstant<unknown> {
  return typeof v === 'object' && v !== null && 'value' in v && 'checksum' in v;
}

export function lookupProvenance(
  path: string,
  legislation: CountryLegislationPackage
): {
  path: string;
  value: unknown;
  provenance: Omit<StatutoryConstant<unknown>, 'value'>;
  taxYear: string;
  ruleVersion: string;
  countryCode: string;
} {
  const parts = path.split('.');
  let current: unknown = legislation;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`Provenance path not found: ${path}`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (!isConstant(current)) {
    throw new Error(`Path ${path} is not a StatutoryConstant`);
  }
  const { value, ...provenance } = current;
  return {
    path,
    value,
    provenance,
    taxYear: legislation.metadata.taxYear,
    ruleVersion: legislation.metadata.ruleVersion,
    countryCode: legislation.metadata.countryCode,
  };
}

export function lookupProvenanceForPayDate(
  path: string,
  payDate: string,
  countryCode = 'ZA'
) {
  return lookupProvenance(path, resolveLegislation({ countryCode, payDate }));
}
