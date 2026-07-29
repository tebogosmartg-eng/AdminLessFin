/**
 * VIP audit layout constants — spacing / presentation (V3.6.6)
 */

export const VIP_LAYOUT = {
  identityFields: [
    { key: 'employeeNumber', label: 'Employee Number' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'employeeSurname', label: 'Employee Surname' },
    { key: 'department', label: 'Department' },
    { key: 'position', label: 'Position' },
    { key: 'costCentre', label: 'Cost Centre' },
    { key: 'employmentStatus', label: 'Employment Status' },
    { key: 'taxNumber', label: 'Tax Number' },
    { key: 'employmentDate', label: 'Employment Date' },
    { key: 'terminationDate', label: 'Termination Date' },
  ] as const,
  sectionDivider: '============================================================',
  lineDivider: '------------------------------------------------------------',
  /** UI / PDF spacing tokens */
  sectionGapPx: 24,
  blockGapPx: 16,
  identityColumns: 2,
} as const;

export type VipIdentityFieldKey = (typeof VIP_LAYOUT.identityFields)[number]['key'];
