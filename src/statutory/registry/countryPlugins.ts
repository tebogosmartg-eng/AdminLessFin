/**
 * Country plugin registry for statutory returns capabilities (V3.6.1).
 * Kept separate from legislation countryRegistry to avoid circular imports
 * (return generators resolve legislation read-only).
 */

import type { CountryCode } from './types';
import type { CountryPluginBundle, StatutoryReturnPlugin } from '../returns/contracts';
import { getPackagesForCountry, getCountryRegistration } from './countryRegistry';
import { legislationToStatutoryRuleSet } from './toStatutoryRuleSet';

const bundles = new Map<string, CountryPluginBundle>();

export function registerCountryPluginBundle(bundle: CountryPluginBundle): void {
  bundles.set(bundle.countryCode.toUpperCase(), bundle);
}

export function getCountryPluginBundle(countryCode: CountryCode): CountryPluginBundle | undefined {
  return bundles.get(String(countryCode).toUpperCase());
}

export function listCountryPluginBundles(): CountryPluginBundle[] {
  return Array.from(bundles.values());
}

export type CountryCapabilities = {
  countryCode: CountryCode;
  countryName: string | null;
  legislation: ReturnType<typeof getPackagesForCountry>;
  /** Payroll rule sets derived from legislation — engine remains country-agnostic consumer. */
  payrollRules: ReturnType<typeof legislationToStatutoryRuleSet>[];
  statutoryReturns: readonly StatutoryReturnPlugin[];
  validators: CountryPluginBundle['validators'];
  exporters: CountryPluginBundle['exporters'];
  transmissionProviders: CountryPluginBundle['transmissionProviders'];
  certificates: CountryPluginBundle['certificates'];
};

/**
 * Resolve full country capabilities for enterprise plugin architecture.
 * Payroll Engine must remain country-agnostic — it consumes payrollRules only.
 */
export function resolveCountryCapabilities(countryCode: CountryCode): CountryCapabilities {
  const reg = getCountryRegistration(countryCode);
  const plugins = getCountryPluginBundle(countryCode);
  const legislation = getPackagesForCountry(countryCode);
  return {
    countryCode,
    countryName: reg?.countryName ?? null,
    legislation,
    payrollRules: legislation.map((pkg) => legislationToStatutoryRuleSet(pkg)),
    statutoryReturns: plugins?.returns ?? [],
    validators: plugins?.validators ?? [],
    exporters: plugins?.exporters ?? [],
    transmissionProviders: plugins?.transmissionProviders ?? [],
    certificates: plugins?.certificates ?? [],
  };
}

export function getStatutoryReturnPlugin(
  countryCode: CountryCode,
  returnType: string
): StatutoryReturnPlugin | undefined {
  return getCountryPluginBundle(countryCode)?.returns.find((p) => p.returnType === returnType);
}
