export const IRP5_SCHEMA = {
  id: 'za.irp5.schema.v1',
  returnType: 'IRP5' as const,
  country: 'ZA' as const,
  requiredFields: ['certificates', 'codeCatalogue', 'sourceRunIds'],
  frequency: 'annual' as const,
};

export const IRP5_MAPPINGS = {
  id: 'za.irp5.mappings.v1',
  defaultCodes: {
    income: '3601',
    annualPayment: '3605',
    travelAllowance: '3701',
    useOfMotorVehicle: '3802',
    medicalSchemeContributions: '3810',
    paye: '4102',
    uifEmployee: '4141',
    retirementFundEmployee: '4006',
    pensionProvidentCurrent: '4001',
  },
};
