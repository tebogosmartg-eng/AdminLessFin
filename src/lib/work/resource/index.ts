/** Work Resource Registry helpers (V4.1). */

import { isPayrollEligibleResourceType, type CostCategory } from '../types';

const TYPE_TO_CATEGORY: Record<string, CostCategory> = {
  permanent_employee: 'labour',
  contract_employee: 'labour',
  casual_labour: 'temporary_labour',
  temporary_labour: 'temporary_labour',
  subcontractor: 'subcontractor',
  consultant: 'subcontractor',
  equipment: 'equipment',
  vehicle: 'vehicle',
  plant: 'plant',
  tools: 'tools',
  rental_equipment: 'rental_equipment',
  materials: 'material',
  accommodation: 'accommodation',
  travel: 'travel',
  fuel: 'fuel',
  other_operational: 'other',
};

export function costCategoryForResourceType(resourceTypeId: string): CostCategory {
  return TYPE_TO_CATEGORY[resourceTypeId] ?? 'other';
}

export function assertNotPayrollPath(resourceTypeId: string | null | undefined): void {
  if (resourceTypeId && !isPayrollEligibleResourceType(resourceTypeId)) {
    throw new Error(
      `Resource type '${resourceTypeId}' must never generate payroll. Route to Accounts Payable / owning module.`,
    );
  }
}

export { isPayrollEligibleResourceType };
