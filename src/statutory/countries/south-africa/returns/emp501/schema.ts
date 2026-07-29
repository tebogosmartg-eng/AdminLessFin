export const EMP501_SCHEMA = {
  id: 'za.emp501.schema.v1',
  returnType: 'EMP501' as const,
  country: 'ZA' as const,
  requiredFields: ['reconciliation.payeDeclared', 'monthlyBreakdown', 'sourceRunIds'],
  frequency: 'annual' as const,
};

export const EMP501_MAPPINGS = {
  id: 'za.emp501.mappings.v1',
  engines: {
    paye: ['paye', 'directors_paye', 'bonus_tax', 'termination_tax'] as const,
    uifEmployee: ['uif'] as const,
    uifEmployer: ['uif_employer'] as const,
    sdl: ['sdl'] as const,
  },
};
