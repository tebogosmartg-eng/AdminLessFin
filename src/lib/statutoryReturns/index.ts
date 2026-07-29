/**
 * Statutory Returns public API (V3.6.1)
 *
 * Stable facade for UI/tests. Country plugins live under
 * src/statutory/countries/<slug>/returns/.
 */

import {
  getSouthAfricaPluginBundle,
  SOUTH_AFRICA_RETURN_PLUGINS,
  zaEmp201Plugin,
  zaEmp501Plugin,
  zaIrp5Plugin,
  zaTaxCertificatePlugin,
} from '../../statutory/countries/south-africa/returns';
import { registerCountryPluginBundle, getStatutoryReturnPlugin } from '../../statutory/registry/countryPlugins';
import {
  getStatutoryReturnPackage,
  listRegisteredCountries,
  listStatutoryReturnPackages,
  registerStatutoryReturn,
} from './registry';
import type {
  GenerateReturnInput,
  StatutoryReturn,
  StatutoryReturnCountry,
  StatutoryReturnPackage,
  StatutoryReturnType,
} from './types';

let bootstrapped = false;

function bootstrapCountryPlugins(): void {
  if (bootstrapped) return;
  const bundle = getSouthAfricaPluginBundle();
  registerCountryPluginBundle(bundle);
  for (const plugin of SOUTH_AFRICA_RETURN_PLUGINS) {
    registerStatutoryReturn(plugin);
  }
  bootstrapped = true;
}

bootstrapCountryPlugins();

export type {
  StatutoryReturn,
  StatutoryReturnCountry,
  StatutoryReturnType,
  StatutoryReturnStatus,
  StatutoryValidationIssue,
  StatutoryValidationResult,
  FinalizedPayslipSource,
  FinalizedPayrollRunSource,
  GenerateReturnInput,
  StatutoryReturnPackage,
} from './types';

export {
  registerStatutoryReturn,
  getStatutoryReturnPackage,
  listStatutoryReturnPackages,
  listRegisteredCountries,
} from './registry';

export {
  assertFinalizedRuns,
  engineResultsFromSnapshot,
  resolvePaye,
  resolveUifEmployee,
  resolveUifEmployer,
  resolveSdl,
  resolveGross,
  filterRunsByPeriod,
} from './source';

export {
  buildValidationResult,
  validateGenerateInput,
  validateSourcePayrollIntegrity,
  mergeIssues,
} from './validate';

/** Plugin generate entrypoints (include isolated validation pass). */
export const generateEmp201 = zaEmp201Plugin.generate;
export const generateEmp501 = zaEmp501Plugin.generate;
export const generateIrp5 = zaIrp5Plugin.generate;
export const generateTaxCertificate = zaTaxCertificatePlugin.generate;

export { validateEmp201 } from '../../statutory/countries/south-africa/returns/emp201';
export { validateEmp501 } from '../../statutory/countries/south-africa/returns/emp501';
export { validateIrp5 } from '../../statutory/countries/south-africa/returns/irp5';

export {
  runStatutoryReturnPipeline,
  exportStatutoryReturn,
  transmitStatutoryExport,
  freezeStatutoryReturn,
  assertCanRegenerate,
  markReturnSubmitted,
  listSubmissionLedgerEvents,
  hashStatutoryReturn,
  clearSubmissionLedgerForTests,
} from '../../statutory/returns';

export {
  resolveCountryCapabilities,
  getCountryPluginBundle,
  getStatutoryReturnPlugin,
} from '../../statutory/registry/countryPlugins';

export const STATUTORY_RETURNS_CATALOGUE = [
  { id: 'EMP201', label: 'EMP201', description: 'Monthly employer declaration' },
  { id: 'EMP501', label: 'EMP501', description: 'Annual employer reconciliation' },
  { id: 'IRP5', label: 'IRP5', description: 'Employee tax certificates' },
  { id: 'TAX_CERTIFICATE', label: 'Tax Certificates', description: 'Per-employee certificate view' },
  { id: 'SUBMISSION_HISTORY', label: 'Submission History', description: 'Generated and submitted returns' },
  { id: 'VALIDATION', label: 'Validation', description: 'Statutory validation results' },
] as const;

export function generateStatutoryReturn(
  country: StatutoryReturnCountry,
  returnType: StatutoryReturnType,
  input: Omit<GenerateReturnInput, 'country'>
): StatutoryReturn {
  bootstrapCountryPlugins();
  const plugin = getStatutoryReturnPlugin(country, returnType);
  const pkg = plugin ?? getStatutoryReturnPackage(country, returnType);
  if (!pkg) {
    throw new Error(
      `No statutory return package registered for ${country}/${returnType}. ` +
        `Create the country package, register the country, add generators/validators/exporters/transmission.`
    );
  }
  return pkg.generate({ ...input, country });
}

export function getReturnCatalogue(country: StatutoryReturnCountry = 'ZA'): StatutoryReturnPackage[] {
  bootstrapCountryPlugins();
  return listStatutoryReturnPackages(country);
}

export function supportedStatutoryCountries(): string[] {
  bootstrapCountryPlugins();
  return listRegisteredCountries();
}
