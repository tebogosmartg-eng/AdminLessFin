// Governance Foundation — Tax service (Phase G3.1).
//
// Proxies the EXISTING `tax-rates` edge function (`GET` method, per
// src/lib/queries.ts::taxRatesQuery and src/pages/TaxRates.tsx — today's
// only caller). No new backend behaviour is introduced.

import { supabase } from '@/integrations/supabase/client';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import { validateTaxRate, type TaxRateDomainModel } from './model';

export interface TaxReadAPI {
  getTaxRates(companyId: string): Promise<TaxRateDomainModel[]>;
}

export interface TaxMutationAPI {
  upsertTaxRate(companyId: string, taxRate: Partial<TaxRateDomainModel>): Promise<GovernanceMutationResult>;
}

type RawTaxRateRow = {
  id: string;
  company_id: string;
  name: string;
  rate: number;
  is_default: boolean;
};

export class TaxService implements TaxReadAPI, TaxMutationAPI {
  async getTaxRates(companyId: string): Promise<TaxRateDomainModel[]> {
    assertGovernanceDomainActive('tax');
    const { data, error } = await supabase.functions.invoke('tax-rates', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    const rows = (data as RawTaxRateRow[] | null) ?? [];
    return rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      rate: row.rate,
      isDefault: row.is_default,
    }));
  }

  async upsertTaxRate(companyId: string, taxRate: Partial<TaxRateDomainModel>): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('tax');
    const validation = validateTaxRate(taxRate);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    // Verified against supabase/functions/tax-rates/index.ts: GET/POST/PUT/DELETE,
    // taking `taxRateData`/`taxRateId` — not a guessed payload shape.
    const { error } = await supabase.functions.invoke('tax-rates', {
      body: {
        method: taxRate.id ? 'PUT' : 'POST',
        company_id: companyId,
        taxRateId: taxRate.id,
        taxRateData: {
          name: taxRate.name,
          rate: taxRate.rate,
          is_default: taxRate.isDefault ?? false,
        },
      },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }
}

export function createTaxService(): TaxService {
  return new TaxService();
}
