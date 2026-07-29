/**
 * VIP Report facade (V3.6.6) — delegates to dedicated audit VIP working paper.
 */

export {
  buildVipWorkingPaperFromFacts,
  buildVipReportFromFacts as buildVipAnnualReport,
  vipReportToRows,
  vipReportToDetailRows,
  vipReportSections,
  vipWorkingPaperToDetailRows,
  VIP_ANNUAL_TOTAL_COLUMN,
  VIP_ITEM_COLUMN,
  exportVipWorkingPaper,
  exportVipWorkingPaperAsync,
  createVipExportBranding,
  buildVipReportId,
  validateVipWorkingPaper,
  listVipEmployees,
  renderVipIdentityRows,
  type VipWorkingPaperReport,
  type VipAnnualReport,
  type VipReportRow,
  type VipEmployeeSection,
  type VipExportFormat,
} from '../reporting/audit/VIP';

export { VIP_ITEM_CODES as VIP_COMPONENT_CODES } from '../reporting/facts/PayrollItemRegistry';

/** @deprecated Prefer VIP audit section catalogue */
export const VIP_COMPONENTS = [
  { id: 'basic_salary', label: 'Basic Salary' },
  { id: 'overtime', label: 'Overtime' },
  { id: 'bonus', label: 'Bonus' },
  { id: 'commission', label: 'Commission' },
  { id: 'allowances', label: 'Allowances' },
  { id: 'fringe_benefits', label: 'Fringe Benefits' },
  { id: 'paye', label: 'PAYE' },
  { id: 'uif_employee', label: 'UIF Employee' },
  { id: 'uif_employer', label: 'UIF Employer' },
  { id: 'sdl', label: 'SDL' },
  { id: 'retirement_contributions', label: 'Retirement Contributions' },
  { id: 'medical_aid', label: 'Medical Aid' },
  { id: 'net_pay', label: 'Net Pay' },
  { id: 'cost_to_company', label: 'Cost to Company' },
] as const;
