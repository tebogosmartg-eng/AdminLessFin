/**
 * Country registry — registers every country that may have legislation packages.
 * Adding a country: create countries/<slug>/ and register here.
 *
 * V3.6.1: Statutory returns / validators / exporters / transmission are resolved via
 * `resolveCountryCapabilities()` in countryPlugins.ts (avoids circular imports with
 * return generators that read legislation). Legislation packages below remain LOCKED.
 */

import type { CountryCode, CountryLegislationPackage } from './types';
import { SOUTH_AFRICA_PACKAGES } from '../countries/south-africa/registry';
import { NAMIBIA_PACKAGES } from '../countries/namibia/registry';
import { BOTSWANA_PACKAGES } from '../countries/botswana/registry';

export type CountryRegistration = {
  countryCode: CountryCode;
  countrySlug: string;
  countryName: string;
  packages: readonly CountryLegislationPackage[];
};

export const COUNTRY_REGISTRY: readonly CountryRegistration[] = [
  {
    countryCode: 'ZA',
    countrySlug: 'south-africa',
    countryName: 'South Africa',
    packages: SOUTH_AFRICA_PACKAGES,
  },
  {
    countryCode: 'NA',
    countrySlug: 'namibia',
    countryName: 'Namibia',
    packages: NAMIBIA_PACKAGES,
  },
  {
    countryCode: 'BW',
    countrySlug: 'botswana',
    countryName: 'Botswana',
    packages: BOTSWANA_PACKAGES,
  },
] as const;

export function getCountryRegistration(
  countryCode: CountryCode
): CountryRegistration | undefined {
  return COUNTRY_REGISTRY.find((c) => c.countryCode === countryCode);
}

export function getPackagesForCountry(
  countryCode: CountryCode
): readonly CountryLegislationPackage[] {
  return getCountryRegistration(countryCode)?.packages ?? [];
}

export function getAllRegisteredPackages(): readonly CountryLegislationPackage[] {
  return COUNTRY_REGISTRY.flatMap((c) => c.packages);
}
