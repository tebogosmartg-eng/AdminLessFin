/**
 * Country-agnostic statutory return registry (V3.6).
 *
 * Adding a new return or country:
 * 1. Create the return package under countries/<slug>/
 * 2. Register it here via registerStatutoryReturn()
 * 3. Implement country-specific mappings in the package
 *
 * No Payroll Engine, Payroll Reports, Accounting, or Legislation changes required.
 */

import type { StatutoryReturnCountry, StatutoryReturnPackage, StatutoryReturnType } from './types';

const packages = new Map<string, StatutoryReturnPackage>();

function key(country: StatutoryReturnCountry, returnType: StatutoryReturnType): string {
  return `${country.toUpperCase()}::${returnType}`;
}

export function registerStatutoryReturn(pkg: StatutoryReturnPackage): void {
  packages.set(key(pkg.country, pkg.returnType), pkg);
}

export function getStatutoryReturnPackage(
  country: StatutoryReturnCountry,
  returnType: StatutoryReturnType
): StatutoryReturnPackage | undefined {
  return packages.get(key(country, returnType));
}

export function listStatutoryReturnPackages(
  country?: StatutoryReturnCountry
): StatutoryReturnPackage[] {
  const all = Array.from(packages.values());
  if (!country) return all;
  const c = country.toUpperCase();
  return all.filter((p) => p.country.toUpperCase() === c);
}

export function listRegisteredCountries(): string[] {
  return Array.from(new Set(Array.from(packages.values()).map((p) => p.country.toUpperCase()))).sort();
}

export function clearStatutoryReturnRegistryForTests(): void {
  packages.clear();
}
