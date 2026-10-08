/**
 * Domestic subsistence allowance — SARS deemed daily rate.
 * The exempt portion is min(amount paid, days × domestic daily rate).
 * Only the excess is taxable. Foreign rates are not applied.
 */

import type { AuditStep, StatutoryRuleSet, SubsistenceInput } from '../types.ts';
import { createAuditStep, roundCurrency } from '../utils.ts';

export type SubsistenceResult = {
  amountPaid: number;
  days: number;
  deemed: number;
  exempt: number;
  excess: number;
  legislativeReference: string;
  auditTrail: AuditStep[];
};

export function calculateSubsistence(
  input: SubsistenceInput,
  ruleSet: StatutoryRuleSet
): SubsistenceResult {
  const days = input.days;
  const amountPaid = roundCurrency(input.amountPaid);
  const rate = input.incidentalOnly ? ruleSet.subsistenceIncidentalDaily : ruleSet.subsistenceDomesticDaily;
  const deemed = roundCurrency(Math.max(0, days) * rate);
  const exempt = roundCurrency(Math.min(amountPaid, deemed));
  const excess = roundCurrency(Math.max(0, amountPaid - deemed));
  const legislativeReference = input.incidentalOnly
    ? 'Income Tax Act s8(1)(c)(ii); SARS domestic deemed amount — incidental costs only'
    : 'Income Tax Act s8(1)(c)(ii); SARS domestic deemed amount — meals and incidental costs';

  return {
    amountPaid,
    days,
    deemed,
    exempt,
    excess,
    legislativeReference,
    auditTrail: [
      createAuditStep(
        'subsistence_domestic',
        'excess = max(0, amount_paid − min(amount_paid, days × domestic_daily_rate))',
        {
          days,
          amountPaid,
          domesticDailyRate: rate,
          incidentalOnly: input.incidentalOnly === true,
          deemed,
          exempt,
        },
        excess
      ),
    ],
  };
}
