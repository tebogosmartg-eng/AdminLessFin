import { describe, expect, it } from 'vitest';
import {
  categoryDefaultsForAsset,
  nextVerificationDueFromFrequency,
} from '../../src/lib/assets/categoryDefaults';
import { isEnterpriseAssetCode, normalizeRegisterPageRequest } from '../../src/lib/assets/assetRegisterQuery';
import { computeAssetRegisterKpis } from '../../src/lib/assets/eamTypes';
import { resolveEamCertificationCompany } from '../../src/lib/assets/resolveEamCertificationCompany';

describe('EAM V16.4 category defaults', () => {
  it('maps category intelligence onto asset form fields', () => {
    const defaults = categoryDefaultsForAsset(
      {
        id: 'c1',
        name: 'IT',
        useful_life_years: 5,
        residual_value_pct: 10,
        depreciation_method: 'straight-line',
        gl_asset_account_id: 'a1',
        accumulated_depreciation_account_id: 'a2',
        depreciation_expense_account_id: 'e1',
        capitalisation_threshold: 5000,
        component_accounting_enabled: true,
        default_verification_frequency_months: 12,
      },
      25000,
    );
    expect(defaults.useful_life_years).toBe(5);
    expect(defaults.residual_value).toBe(2500);
    expect(defaults.depreciation_method).toBe('straight-line');
    expect(defaults.asset_account_id).toBe('a1');
    expect(defaults.capitalisation_threshold).toBe(5000);
    expect(defaults.component_accounting_enabled).toBe(true);
  });

  it('computes next verification due from frequency', () => {
    const due = nextVerificationDueFromFrequency('2026-01-15', 6);
    expect(due).toBe('2026-07-15');
  });
});

describe('EAM V16.4 asset numbering', () => {
  it('recognises enterprise asset codes', () => {
    expect(isEnterpriseAssetCode('AST-2026-000001')).toBe(true);
    expect(isEnterpriseAssetCode('FA-001')).toBe(false);
  });
});

describe('EAM V16.5 certification tenant resolution', () => {
  const members = [
    {
      company_id: '26014bd5-f03f-44ae-93bd-64b5add2e09f',
      role: 'owner',
      companies: { id: '26014bd5-f03f-44ae-93bd-64b5add2e09f', name: "My's Company" },
    },
    {
      company_id: '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752',
      role: 'owner',
      companies: { id: '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752', name: 'Spaceman' },
    },
  ];

  it('prefers Spaceman by default over first membership', () => {
    const prevCert = process.env.EAM_CERT_COMPANY_ID;
    const prevE2e = process.env.E2E_COMPANY_ID;
    const prevName = process.env.EAM_CERT_COMPANY_NAME;
    delete process.env.EAM_CERT_COMPANY_ID;
    delete process.env.E2E_COMPANY_ID;
    delete process.env.EAM_CERT_COMPANY_NAME;
    const r = resolveEamCertificationCompany(members);
    expect(r.companyId).toBe('3cbfd4eb-a095-43f3-837a-0b4f1e2c1752');
    if (prevCert) process.env.EAM_CERT_COMPANY_ID = prevCert;
    if (prevE2e) process.env.E2E_COMPANY_ID = prevE2e;
    if (prevName) process.env.EAM_CERT_COMPANY_NAME = prevName;
  });

  it('honours explicit EAM_CERT_COMPANY_ID', () => {
    const prev = process.env.EAM_CERT_COMPANY_ID;
    process.env.EAM_CERT_COMPANY_ID = '26014bd5-f03f-44ae-93bd-64b5add2e09f';
    const r = resolveEamCertificationCompany(members);
    expect(r.companyId).toBe('26014bd5-f03f-44ae-93bd-64b5add2e09f');
    if (prev) process.env.EAM_CERT_COMPANY_ID = prev;
    else delete process.env.EAM_CERT_COMPANY_ID;
  });
});

describe('EAM V16.4 register paging', () => {
  it('normalises page request bounds', () => {
    const req = normalizeRegisterPageRequest({ page: 0, pageSize: 500, companyId: 'x' });
    expect(req.page).toBe(1);
    expect(req.pageSize).toBe(100);
  });

  it('computes register KPIs consistently', () => {
    const kpis = computeAssetRegisterKpis([
      {
        id: '1',
        asset_code: 'A',
        description: 'x',
        purchase_date: '2026-01-01',
        purchase_cost: 100,
        accumulated_depreciation: 20,
        net_book_value: 80,
        status: 'active',
        depreciation_ytd: 5,
        impairment_amount: 0,
        verification_status: 'unverified',
      },
    ]);
    expect(kpis.totalAssets).toBe(1);
    expect(kpis.netBookValue).toBe(80);
    expect(kpis.awaitingVerification).toBe(1);
  });
});
