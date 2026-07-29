import type { DocumentCatalogueEntry, LegislationPackageMetadata } from '../../../../registry/types';

export const DOCUMENT_CATALOGUE: DocumentCatalogueEntry[] = [
  {
    "id": "budget",
    "title": "Budget Tax Guide",
    "filename": "Budget Tax Guide.pdf",
    "authority": "National Treasury",
    "required": true
  },
  {
    "id": "paye-gen",
    "title": "PAYE-GEN",
    "filename": "PAYE-GEN.pdf",
    "authority": "SARS",
    "required": true
  },
  {
    "id": "ita",
    "title": "Income Tax Act",
    "filename": "Income Tax Act.pdf",
    "authority": "SARS",
    "required": true
  },
  {
    "id": "7th",
    "title": "Seventh Schedule",
    "filename": "Seventh Schedule.pdf",
    "authority": "SARS",
    "required": true
  },
  {
    "id": "uif",
    "title": "UIF Act",
    "filename": "UIF Act.pdf",
    "authority": "DoEL",
    "required": true
  },
  {
    "id": "sdl",
    "title": "SDL Act",
    "filename": "SDL Act.pdf",
    "authority": "SARS",
    "required": true
  },
  {
    "id": "irp5",
    "title": "IRP5 Guide",
    "filename": "IRP5 Guide.pdf",
    "authority": "SARS",
    "required": true
  },
  {
    "id": "emp201",
    "title": "EMP201 Guide",
    "filename": "EMP201 Guide.pdf",
    "authority": "SARS",
    "required": true
  },
  {
    "id": "gazette",
    "title": "Government Gazette",
    "filename": "Government Gazette.pdf",
    "authority": "SARS",
    "required": true
  }
];

export const PACKAGE_METADATA_BASE = {
  country: 'South Africa',
  countryCode: 'ZA' as const,
  taxYear: '2025/2026',
  ruleVersion: '2025.2.0',
  effectiveFrom: '2025-03-01',
  effectiveTo: '2026-02-28',
  authority: 'SARS / National Treasury',
  status: 'implemented' as const,
  certifiedDate: null as string | null,
  implementedBy: 'AdminLess Fin Legislative Governance',
  gazetteReference: 'GG 2025/2026',
  budgetReference: 'Budget Tax Guide 2025',
  documentCatalogue: DOCUMENT_CATALOGUE,
};

export function withChecksum(checksum: string): LegislationPackageMetadata {
  return { ...PACKAGE_METADATA_BASE, checksum };
}
