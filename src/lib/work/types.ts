/** Enterprise Work Management — shared types (V4.0 + V4.1 additive). */

export type EwmTimeStatus = 'draft' | 'submitted' | 'approved' | 'locked' | 'historical';

export type EwmProjectStatus = 'pipeline' | 'active' | 'on_hold' | 'completed' | 'archived';

export type CaptureChannel = 'manual' | 'clock' | 'import' | 'system';

export type CostCategory =
  | 'labour'
  | 'temporary_labour'
  | 'subcontractor'
  | 'material'
  | 'equipment'
  | 'vehicle'
  | 'travel'
  | 'accommodation'
  | 'fuel'
  | 'plant'
  | 'tools'
  | 'rental_equipment'
  | 'other'
  | 'total';

export const PAYROLL_FORBIDDEN_RESOURCE_TYPES = new Set([
  'subcontractor',
  'consultant',
  'equipment',
  'vehicle',
  'plant',
  'tools',
  'rental_equipment',
  'materials',
  'accommodation',
  'travel',
  'fuel',
  'other_operational',
]);

export function isPayrollEligibleResourceType(resourceTypeId: string | null | undefined): boolean {
  if (!resourceTypeId) return true; // employee-linked entries without explicit type default eligible
  return !PAYROLL_FORBIDDEN_RESOURCE_TYPES.has(resourceTypeId);
}
