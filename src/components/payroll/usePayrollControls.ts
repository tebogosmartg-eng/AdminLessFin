import { useQuery } from '@tanstack/react-query';
import { invokePayroll } from '../../lib/payrollOperations';

export type PayrollControls = {
  allow_self_approval: boolean;
  self_approval_reason: string | null;
  updated_by: string | null;
  updated_at: string | null;
  can_change: boolean;
};

export const payrollControlsQueryKey = (companyId: string) => ['payroll-controls', companyId];

/** The company's payroll approval controls (separation of duties). */
export function usePayrollControls(companyId: string | undefined) {
  return useQuery({
    queryKey: payrollControlsQueryKey(companyId ?? ''),
    queryFn: () => invokePayroll<PayrollControls>({ method: 'GET_PAYROLL_CONTROLS', company_id: companyId }),
    enabled: !!companyId,
  });
}
