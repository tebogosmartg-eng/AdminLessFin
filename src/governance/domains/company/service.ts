// Governance Foundation — Company service.
//
// Proxies the EXISTING `settings` edge function (`UPDATE_COMPANY`) and the
// existing `company-management` edge function (`CREATE`/`DELETE`).
// Phase G3.5 completes consumer migration: CreateCompany CREATE now routes
// here alongside CompanySettings UPDATE/DELETE. No new backend behaviour.

import { supabase } from '@/integrations/supabase/client';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import { validateCompanyProfile, type CompanyDomainModel } from './model';

export interface CompanyReadAPI {
  // Company profile is already resolved app-wide via AuthContext's
  // `activeCompany`; this Foundation phase does not introduce a second
  // fetch path for it. A future migration phase decides whether
  // AuthContext itself should be re-pointed at this service.
  getCompanyProfile(companyId: string): Promise<CompanyDomainModel | null>;
}

export interface CompanyMutationAPI {
  createCompany(name: string): Promise<{ id: string }>;
  updateCompanyProfile(
    companyId: string,
    changes: Partial<Omit<CompanyDomainModel, 'id' | 'ownerId'>>
  ): Promise<GovernanceMutationResult>;
  deleteCompany(companyId: string): Promise<GovernanceMutationResult>;
}

type RawCompanyRow = {
  id: string;
  name: string;
  owner_id: string | null;
  address: string | null;
  logo_url: string | null;
  tax_id: string | null;
  default_invoice_notes: string | null;
};

export class CompanyService implements CompanyReadAPI, CompanyMutationAPI {
  async getCompanyProfile(companyId: string): Promise<CompanyDomainModel | null> {
    assertGovernanceDomainActive('company');
    const { data, error } = await supabase.functions.invoke('settings', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    const row = data as RawCompanyRow | null;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      address: row.address,
      logoUrl: row.logo_url,
      taxId: row.tax_id,
      defaultInvoiceNotes: row.default_invoice_notes,
    };
  }

  /**
   * Pass-through of company-management CREATE — identical payload to the
   * pre-G3.5 CreateCompany pages.
   */
  async createCompany(name: string): Promise<{ id: string }> {
    assertGovernanceDomainActive('company');
    const { data, error } = await supabase.functions.invoke('company-management', {
      body: {
        method: 'CREATE',
        companyData: { name },
      },
    });
    if (error) throw new Error(error.message);
    return data as { id: string };
  }

  async updateCompanyProfile(
    companyId: string,
    changes: Partial<Omit<CompanyDomainModel, 'id' | 'ownerId'>>
  ): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('company');
    const validation = validateCompanyProfile(changes);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    // Only send fields the caller provided — do not null out identity columns
    // on branding-only updates (G3.6C: identity is Master Data).
    const companyData: Record<string, unknown> = {};
    if ('name' in changes) companyData.name = changes.name;
    if ('address' in changes) companyData.address = changes.address ?? null;
    if ('taxId' in changes) companyData.tax_id = changes.taxId ?? null;
    if ('defaultInvoiceNotes' in changes) {
      companyData.default_invoice_notes = changes.defaultInvoiceNotes ?? null;
    }
    if ('logoUrl' in changes) companyData.logo_url = changes.logoUrl;

    const { error } = await supabase.functions.invoke('settings', {
      body: {
        method: 'UPDATE_COMPANY',
        company_id: companyId,
        companyData,
      },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async deleteCompany(companyId: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('company');
    const { error } = await supabase.functions.invoke('company-management', {
      body: { method: 'DELETE', company_id: companyId },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }
}

export function createCompanyService(): CompanyService {
  return new CompanyService();
}

// Shared singleton — stateless façade (each method is a fresh network
// request), consumed directly the same way the existing `accountingApi`
// singleton is, matching the pattern established for financialCalendarService
// in Phase G3.2.
export const companyService = createCompanyService();
