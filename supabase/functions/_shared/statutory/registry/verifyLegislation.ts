/**
 * Enterprise legislation validation (V3.4.2)
 * Fails startup on structural, provenance, date, document, or duplicate issues.
 */

import {
  LegislationValidationError,
  type CountryLegislationPackage,
  type StatutoryConstant,
  computePayloadChecksum,
} from './types.ts';
import { COUNTRY_REGISTRY, getAllRegisteredPackages } from './countryRegistry.ts';

export type VerificationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function isConstant(v: unknown): v is StatutoryConstant<unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    'value' in v &&
    'checksum' in v &&
    'authority' in v &&
    'sourceDocument' in v &&
    'pageNumber' in v &&
    'sectionReference' in v &&
    'effectiveFrom' in v &&
    'effectiveTo' in v &&
    'legislationVersion' in v
  );
}

function walkConstants(
  node: unknown,
  path: string,
  out: { path: string; constant: StatutoryConstant<unknown> }[]
): void {
  if (isConstant(node)) {
    out.push({ path, constant: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkConstants(item, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'metadata') continue;
      walkConstants(v, path ? `${path}.${k}` : k, out);
    }
  }
}

function validateProvenance(
  pkg: CountryLegislationPackage,
  errors: string[]
): void {
  const constants: { path: string; constant: StatutoryConstant<unknown> }[] = [];
  walkConstants(pkg, '', constants);
  const label = `${pkg.metadata.countryCode}/${pkg.metadata.taxYear}`;

  if (!constants.length) {
    errors.push(`${label}: no statutory constants found`);
  }

  const valueFingerprints = new Map<string, string>();
  for (const { path, constant } of constants) {
    const required = [
      'authority',
      'sourceDocument',
      'pageNumber',
      'sectionReference',
      'effectiveFrom',
      'effectiveTo',
      'legislationVersion',
      'checksum',
    ] as const;
    for (const key of required) {
      if (constant[key] == null || constant[key] === '') {
        errors.push(`${label}: ${path} missing provenance.${key}`);
      }
    }
    const expected = computePayloadChecksum({
      value: constant.value,
      authority: constant.authority,
      sourceDocument: constant.sourceDocument,
      pageNumber: constant.pageNumber,
      sectionReference: constant.sectionReference,
      effectiveFrom: constant.effectiveFrom,
      effectiveTo: constant.effectiveTo,
      legislationVersion: constant.legislationVersion,
    });
    if (constant.checksum !== expected) {
      errors.push(`${label}: ${path} constant checksum mismatch`);
    }

    const fp = `${path}::${JSON.stringify(constant.value)}`;
    // Within-package path uniqueness is inherent; cross-check duplicate IRP5/EMP201 below
    void valueFingerprints;
    void fp;
  }

  // Duplicate IRP5 codes within package
  const irp5Values = Object.entries(pkg.irp5).map(([k, c]) => ({
    key: k,
    code: String(c.value),
  }));
  const irp5Seen = new Map<string, string>();
  for (const { key, code } of irp5Values) {
    if (irp5Seen.has(code)) {
      errors.push(
        `${label}: duplicate IRP5 code ${code} (${irp5Seen.get(code)} and ${key})`
      );
    }
    irp5Seen.set(code, key);
  }

  // Duplicate EMP201 codes within package
  const empValues = Object.entries(pkg.emp201).map(([k, c]) => ({
    key: k,
    code: String(c.value),
  }));
  const empSeen = new Map<string, string>();
  for (const { key, code } of empValues) {
    if (empSeen.has(code)) {
      errors.push(
        `${label}: duplicate EMP201 code ${code} (${empSeen.get(code)} and ${key})`
      );
    }
    empSeen.set(code, key);
  }
}

function validatePackageMeta(pkg: CountryLegislationPackage, errors: string[]): void {
  const m = pkg.metadata;
  const label = `${m.countryCode}/${m.taxYear}`;
  for (const key of [
    'country',
    'countryCode',
    'taxYear',
    'ruleVersion',
    'effectiveFrom',
    'effectiveTo',
    'authority',
    'status',
    'implementedBy',
    'checksum',
    'gazetteReference',
    'budgetReference',
  ] as const) {
    if (m[key] == null || m[key] === '') {
      errors.push(`${label}: metadata.${key} incomplete`);
    }
  }
  if (!m.documentCatalogue?.length) {
    errors.push(`${label}: document catalogue empty`);
  }
  const requiredDocs = [
    'Budget Tax Guide.pdf',
    'PAYE-GEN.pdf',
    'Income Tax Act.pdf',
    'Seventh Schedule.pdf',
    'UIF Act.pdf',
    'SDL Act.pdf',
    'IRP5 Guide.pdf',
    'EMP201 Guide.pdf',
    'Government Gazette.pdf',
  ];
  const filenames = new Set(m.documentCatalogue.map((d) => d.filename));
  for (const f of requiredDocs) {
    if (!filenames.has(f)) {
      errors.push(`${label}: document catalogue missing ${f}`);
    }
  }

  const { metadata: _meta, ...payload } = pkg;
  void _meta;
  const expected = computePayloadChecksum(payload);
  if (m.checksum !== expected) {
    errors.push(`${label}: package checksum mismatch (expected ${expected})`);
  }

  if (!pkg.taxBrackets?.length) errors.push(`${label}: taxBrackets empty`);
}

function validateCountryDates(
  countryCode: string,
  packages: readonly CountryLegislationPackage[],
  errors: string[]
): void {
  if (!packages.length) return;
  const sorted = [...packages].sort((a, b) =>
    a.metadata.effectiveFrom.localeCompare(b.metadata.effectiveFrom)
  );
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.metadata.effectiveFrom >= cur.metadata.effectiveTo) {
      errors.push(`${countryCode}/${cur.metadata.taxYear}: invalid effective window`);
    }
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      const overlap =
        cur.metadata.effectiveFrom <= other.metadata.effectiveTo &&
        other.metadata.effectiveFrom <= cur.metadata.effectiveTo;
      if (overlap) {
        errors.push(
          `${countryCode}: overlapping ${cur.metadata.taxYear} and ${other.metadata.taxYear}`
        );
      }
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevEnd = new Date(prev.metadata.effectiveTo + 'T00:00:00Z');
      const next = new Date(prevEnd);
      next.setUTCDate(next.getUTCDate() + 1);
      const expectedStart = next.toISOString().slice(0, 10);
      if (cur.metadata.effectiveFrom !== expectedStart) {
        errors.push(
          `${countryCode}: gap between ${prev.metadata.taxYear} and ${cur.metadata.taxYear}`
        );
      }
    }
  }
}

/**
 * verifyLegislation — enterprise startup gate.
 */
export function verifyLegislation(
  packages: readonly CountryLegislationPackage[] = getAllRegisteredPackages()
): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!COUNTRY_REGISTRY.length) {
    errors.push('Country registry is empty');
  }

  for (const country of COUNTRY_REGISTRY) {
    validateCountryDates(country.countryCode, country.packages, errors);
    if (!country.packages.length) {
      warnings.push(
        `${country.countryCode} (${country.countryName}): registered with zero packages`
      );
    }
  }

  // Cross-package duplicate constant fingerprint (same country + same path + same value across overlapping years is OK;
  // detect identical checksum for different paths within one package already covered.
  // Detect duplicate IRP5 codes across fields already done per package.

  for (const pkg of packages) {
    validatePackageMeta(pkg, errors);
    validateProvenance(pkg, errors);
    if (pkg.metadata.status === 'certified') {
      warnings.push(
        `${pkg.metadata.countryCode}/${pkg.metadata.taxYear}: ensure PDF binaries exist under documents/`
      );
    } else {
      warnings.push(
        `${pkg.metadata.countryCode}/${pkg.metadata.taxYear}: document PDFs may be pending (status=${pkg.metadata.status})`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function assertLegislationRepositoryValid(): void {
  const result = verifyLegislation();
  if (!result.ok) {
    throw new LegislationValidationError(
      `Legislation verification failed:\n- ${result.errors.join('\n- ')}`
    );
  }
}

/** Alias used by older call sites */
export const validateLegislationRepository = verifyLegislation;
