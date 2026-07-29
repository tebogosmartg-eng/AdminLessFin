/**
 * VIP Working Paper UI renderer helpers (V3.6.6)
 * Independent of Management Matrix renderer.
 */

import { VIP_LAYOUT } from './layout';
import type { VipEmployeeIdentity, VipEmployeeWorkingPaper, VipWorkingPaperReport } from './types';

export type VipRenderedIdentityRow = { label: string; value: string };

export function renderVipIdentityRows(identity: VipEmployeeIdentity): VipRenderedIdentityRow[] {
  return VIP_LAYOUT.identityFields.map((f) => ({
    label: f.label,
    value: identity[f.key] || '—',
  }));
}

export function renderVipEmployeeBlocks(emp: VipEmployeeWorkingPaper) {
  return emp.blocks.filter((b) => b.id !== 'employee_information' || b.lines.length > 0);
}

export function listVipEmployees(report: VipWorkingPaperReport): VipEmployeeWorkingPaper[] {
  return report.employees;
}

export function formatVipAmount(n: number): string {
  return n.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
