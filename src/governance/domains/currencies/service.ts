// Governance Foundation — Currencies service (Phase G3.1).
//
// Genuinely greenfield: G1's audit found no single authoritative
// company-level currency setting exists anywhere in this codebase today.
// There is nothing to proxy. Every method throws a clear "not implemented"
// error rather than fabricating a fake currency value.

import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import { validateCurrencyConfig, type CurrencyConfigDomainModel } from './model';

export interface CurrenciesReadAPI {
  getCurrencyConfig(companyId: string): Promise<CurrencyConfigDomainModel | null>;
}

export interface CurrenciesMutationAPI {
  setCurrencyConfig(companyId: string, config: Partial<CurrencyConfigDomainModel>): Promise<GovernanceMutationResult>;
}

const NOT_IMPLEMENTED =
  'No company-level currency configuration exists yet (confirmed by the G1 audit — ' +
  'no currency column on `companies`, no exchange_rates table). This is scaffolding ' +
  'for a future implementation phase, per Volume I §3.6.';

export class CurrenciesService implements CurrenciesReadAPI, CurrenciesMutationAPI {
  async getCurrencyConfig(_companyId: string): Promise<CurrencyConfigDomainModel | null> {
    assertGovernanceDomainActive('currencies');
    throw new Error(NOT_IMPLEMENTED);
  }

  async setCurrencyConfig(
    _companyId: string,
    config: Partial<CurrencyConfigDomainModel>
  ): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('currencies');
    const validation = validateCurrencyConfig(config);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };
    throw new Error(NOT_IMPLEMENTED);
  }
}

export function createCurrenciesService(): CurrenciesService {
  return new CurrenciesService();
}
