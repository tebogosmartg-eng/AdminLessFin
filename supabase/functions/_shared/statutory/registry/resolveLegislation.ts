/**
 * Resolve legislation by country + pay date (or tax year).
 * Fail-fast — no fallbacks.
 */

import {
  LegislationResolutionError,
  type CountryCode,
  type CountryLegislationPackage,
} from './types.ts';
import { getPackagesForCountry } from './countryRegistry.ts';

export type ResolveInput =
  | { countryCode: CountryCode; payDate: string; taxYear?: never }
  | { countryCode: CountryCode; taxYear: string; payDate?: never };

/**
 * Primary resolver — payroll engines must call with country + pay date.
 */
export function resolveLegislation(input: ResolveInput): CountryLegislationPackage {
  const packages = getPackagesForCountry(input.countryCode);
  if (!packages.length && !('taxYear' in input && input.taxYear)) {
    // still allow taxYear path to throw more specific error
  }

  if ('taxYear' in input && input.taxYear) {
    const match = packages.find((p) => p.metadata.taxYear === input.taxYear);
    if (!match) {
      throw new LegislationResolutionError(
        `No legislation package for country ${input.countryCode} tax year "${input.taxYear}". Silent fallback prohibited.`
      );
    }
    return match;
  }

  const date = input.payDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new LegislationResolutionError(`Invalid pay date "${input.payDate}". Expected YYYY-MM-DD.`);
  }

  if (!packages.length) {
    throw new LegislationResolutionError(
      `No legislation packages registered for country ${input.countryCode}. Register a country/year package before payroll runs.`
    );
  }

  const matches = packages.filter(
    (p) => date >= p.metadata.effectiveFrom && date <= p.metadata.effectiveTo
  );

  if (matches.length === 0) {
    const registered = packages
      .map((p) => `${p.metadata.taxYear} (${p.metadata.effectiveFrom}–${p.metadata.effectiveTo})`)
      .join('; ');
    throw new LegislationResolutionError(
      `No legislation for country ${input.countryCode} pay date ${date}. Registered: ${registered}. Silent fallback prohibited.`
    );
  }
  if (matches.length > 1) {
    throw new LegislationResolutionError(
      `Overlapping packages for ${input.countryCode} on ${date}: ${matches.map((m) => m.metadata.taxYear).join(', ')}`
    );
  }
  return matches[0];
}

/** SA compatibility — defaults countryCode to ZA. */
export function resolveSouthAfricanLegislation(
  input: string | { payDate: string } | { taxYear: string }
): CountryLegislationPackage {
  if (typeof input === 'string') {
    return resolveLegislation({ countryCode: 'ZA', payDate: input });
  }
  if ('taxYear' in input && input.taxYear) {
    return resolveLegislation({ countryCode: 'ZA', taxYear: input.taxYear });
  }
  if ('payDate' in input && input.payDate) {
    return resolveLegislation({ countryCode: 'ZA', payDate: input.payDate });
  }
  throw new LegislationResolutionError(
    'resolveSouthAfricanLegislation requires payDate or taxYear.'
  );
}

export function requireLegislationByTaxYear(taxYear: string): CountryLegislationPackage {
  return resolveLegislation({ countryCode: 'ZA', taxYear });
}

export function getLegislationByTaxYear(
  taxYear: string
): CountryLegislationPackage | undefined {
  return getPackagesForCountry('ZA').find((p) => p.metadata.taxYear === taxYear);
}

export function getAllRegisteredLegislation(): readonly CountryLegislationPackage[] {
  return getPackagesForCountry('ZA');
}
