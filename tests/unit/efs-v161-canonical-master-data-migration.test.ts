/**
 * V16.1 — Canonical master data migration regression suite.
 */
import { describe, expect, it } from 'vitest';
import { composeDocument } from '../../src/lib/financialStatements/composition';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import {
  corporateDisplayFromEntity,
  corporateDisplayFromModel,
  provideCorporateInformation,
} from '../../src/lib/financialStatements/corporateInformation';
import {
  buildLegacyHydratedMasterRow,
  extractMasterDataFromEngagement,
  hydrateWorkspaceFromMasterData,
  isMasterDataEmpty,
  needsLegacyHydration,
  stripLegacyMasterFieldsFromEngagement,
} from '../../src/lib/financialStatements/masterData';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { buildRegressionScenarioModel } from '../../src/lib/financialStatements/reportingIntelligence';

const LEGACY_ENGAGEMENT = {
  registered_name: 'Legacy Holdings (Pty) Ltd',
  trading_name: 'Legacy Trading',
  registration_number: '2019/123456/07',
  nature_of_business: 'Professional services',
  registered_office: '1 Legacy Street, Johannesburg',
  business_address: '1 Legacy Street, Johannesburg',
  vat_number: '4123456789',
  income_tax_number: '9876543210',
  auditor: 'Audit Partners Inc',
  company_secretary: 'Jane Secretary',
  prepared_by: 'Preparer One',
  reviewed_by: 'Reviewer Two',
  partner: 'Partner Three',
  directors: [{ name: 'Director Alpha', role: 'Director' }],
  principal_bankers: [{ name: 'First National Bank', active: true }],
  reporting_currency: 'ZAR',
  reporting_framework: 'IFRS for SMEs',
  financial_year_end: '2025-02-28',
};

describe('V16.1 — Legacy Master Data Hydration', () => {
  it('detects empty master data', () => {
    expect(isMasterDataEmpty(null)).toBe(true);
    expect(isMasterDataEmpty({ company_profile: {}, addresses: {}, tax_registrations: {}, directors: [], governance: {}, officers: [], principal_bankers: [] })).toBe(true);
  });

  it('extracts all master modules from legacy engagement', () => {
    const extracted = extractMasterDataFromEngagement(LEGACY_ENGAGEMENT);
    expect(extracted.company_profile.registered_name).toBe('Legacy Holdings (Pty) Ltd');
    expect(extracted.addresses.registered_office).toBe('1 Legacy Street, Johannesburg');
    expect(extracted.tax_registrations.vat_number).toBe('4123456789');
    expect(extracted.governance.auditor).toBe('Audit Partners Inc');
    expect(extracted.officers).toHaveLength(3);
    expect(extracted.directors).toHaveLength(1);
    expect(extracted.principal_bankers).toHaveLength(1);
  });

  it('hydrates master data once when empty', () => {
    expect(needsLegacyHydration(null, LEGACY_ENGAGEMENT)).toBe(true);
    const row = buildLegacyHydratedMasterRow('company-1', null, LEGACY_ENGAGEMENT);
    expect(row).not.toBeNull();
    expect(row?.legacy_migration_completed_at).toBeTruthy();
    expect(row?.company_profile.registered_name).toBe('Legacy Holdings (Pty) Ltd');
  });

  it('skips hydration when migration already completed', () => {
    const master = {
      ...buildLegacyHydratedMasterRow('company-1', null, LEGACY_ENGAGEMENT)!,
    };
    expect(needsLegacyHydration(master, LEGACY_ENGAGEMENT)).toBe(false);
    expect(buildLegacyHydratedMasterRow('company-1', master, LEGACY_ENGAGEMENT)).toBeNull();
  });

  it('is idempotent on repeated hydration attempts', () => {
    const first = buildLegacyHydratedMasterRow('company-1', null, LEGACY_ENGAGEMENT);
    const second = buildLegacyHydratedMasterRow('company-1', first, LEGACY_ENGAGEMENT);
    expect(second).toBeNull();
  });

  it('merges hydrated master over legacy engagement on read', () => {
    const master = buildLegacyHydratedMasterRow('company-1', null, LEGACY_ENGAGEMENT)!;
    master.company_profile.registered_name = 'Canonical Master Name';
    const hydrated = hydrateWorkspaceFromMasterData(LEGACY_ENGAGEMENT, master);
    expect(hydrated.registered_name).toBe('Canonical Master Name');
  });

  it('strips deprecated master fields from engagement upsert payload', () => {
    const stripped = stripLegacyMasterFieldsFromEngagement({
      ...LEGACY_ENGAGEMENT,
      comparative_period: '2024',
    });
    expect(stripped).not.toHaveProperty('registered_name');
    expect(stripped.comparative_period).toBe('2024');
    expect(stripped.reporting_currency).toBe('ZAR');
  });
});

describe('V16.1 — Provider Unification', () => {
  it('compose reads company name through provider', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const composed = composeDocument(model, emptyOverrides());
    const corp = provideCorporateInformation(model);
    expect(composed.companyName).toBe(corp.entityIdentity.registeredName.formatted);
  });

  it('display accessors match provider output', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const display = corporateDisplayFromModel(model);
    const corp = provideCorporateInformation(model);
    expect(display.registeredName).toBe(corp.entityIdentity.registeredName.formatted);
    expect(display.reportingCurrency).toBe(corp.engagement.reportingCurrency.formatted);
  });

  it('signatures route through provider accessors', () => {
    const display = corporateDisplayFromEntity(LEGACY_ENGAGEMENT as never);
    const signatures = assembleSignatures(LEGACY_ENGAGEMENT as never);
    expect(signatures.find((s) => s.role === 'prepared_by')?.name).toBe(display.preparedBy);
    expect(signatures.find((s) => s.role === 'reviewed_by')?.name).toBe(display.reviewedBy);
  });
});
