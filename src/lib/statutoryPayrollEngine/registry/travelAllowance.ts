/**
 * Travel allowance — §8(1)(b) Income Tax Act and SARS Interpretation Note 14.
 */

import type { StatutoryRuleSet, TravelAllowanceInput } from '../types';
import { createAuditStep, roundCurrency } from '../utils';
import type { AuditStep } from '../types';

export type TravelAllowanceResult = {
  taxablePortion: number;
  nonTaxablePortion: number;
  method: string;
  legislativeReference: string;
  auditTrail: AuditStep[];
};

export function calculateTravelAllowance(
  input: TravelAllowanceInput,
  ruleSet: StatutoryRuleSet
): TravelAllowanceResult {
  const allowance = input.monthlyAllowance;
  const method = input.method ?? 'deemed_80';
  const auditTrail: AuditStep[] = [];

  if (method === 'logbook') {
    const businessKm = input.businessKilometres ?? 0;
    const deemedBusiness = roundCurrency(businessKm * ruleSet.travelPrescribedRatePerKm);
    const taxable = roundCurrency(Math.max(0, allowance - deemedBusiness));
    auditTrail.push(
      createAuditStep(
        'travel_logbook',
        'max(0, allowance − (business_km × prescribed_rate))',
        { allowance, businessKm, prescribedRate: ruleSet.travelPrescribedRatePerKm },
        taxable,
        { deemedBusiness, nonTaxable: allowance - taxable }
      )
    );
    return {
      taxablePortion: taxable,
      nonTaxablePortion: roundCurrency(allowance - taxable),
      method: 'logbook',
      legislativeReference: '§8(1)(b); SARS IN14 — logbook method',
      auditTrail,
    };
  }

  if (method === 'deemed_20') {
    const taxablePercent =
      input.businessUsePercent != null
        ? roundCurrency(1 - input.businessUsePercent)
        : ruleSet.travelDeemedTaxableMainlyBusiness;
    const taxable = roundCurrency(allowance * taxablePercent);
    auditTrail.push(
      createAuditStep(
        'travel_deemed_20',
        'allowance × (1 − business_use_percent) — mainly business vehicle',
        { allowance, businessUsePercent: input.businessUsePercent ?? null, taxablePercent },
        taxable
      )
    );
    return {
      taxablePortion: taxable,
      nonTaxablePortion: roundCurrency(allowance - taxable),
      method: 'deemed_20',
      legislativeReference: '§8(1)(b); SARS IN14 — 20% inclusion (mainly business)',
      auditTrail,
    };
  }

  const pct = ruleSet.travelDeemedTaxableNoLogbook;
  const taxable = roundCurrency(allowance * pct);
  auditTrail.push(
    createAuditStep(
      'travel_deemed_80',
      'allowance × 80% (no logbook — default inclusion)',
      { allowance, taxablePercent: pct },
      taxable
    )
  );
  return {
    taxablePortion: taxable,
    nonTaxablePortion: roundCurrency(allowance - taxable),
    method: 'deemed_80',
    legislativeReference: '§8(1)(b); SARS IN14 — 80% inclusion (no logbook)',
    auditTrail,
  };
}
