/**
 * South Africa EMP201 — schema (V3.6.1)
 */

export const EMP201_SCHEMA = {
  id: 'za.emp201.schema.v1',
  returnType: 'EMP201' as const,
  country: 'ZA' as const,
  requiredFields: ['totals.paye', 'totals.uifTotal', 'totals.sdl', 'periodStart', 'periodEnd', 'sourceRunIds'],
  frequency: 'monthly' as const,
};
