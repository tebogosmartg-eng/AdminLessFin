import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';
import { formatCurrency } from '../../lib/utils';
import { employeePayrollHistoryQuery, employeeTimelineQuery } from '../../lib/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useEnterpriseIdentity } from '../../hooks/useEnterpriseIdentity';
import { EmployeeIdentity } from '../hr/EmployeeIdentity';
import { EmployeeCodes } from '../hr/EmployeeCodes';
import { EmployeeTimeline } from '../hr/EmployeeTimeline';
import type { EmployeeTimelineRecord } from '../hr/EmployeeTimeline';
import type { Employee } from '../../pages/Employees';

type Claim = {
  id: string;
  claim_number: string;
  submission_date: string;
  total_amount: number;
  status: string;
  employee_id?: string;
};

type Asset = {
  id: string;
  name: string;
  status: string;
  assigned_to_employee_id?: string | null;
};

type PayrollHistoryItem = {
  id: string;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  email_sent_at?: string | null;
  payment_status?: string;
  payroll_runs: {
    id: string;
    pay_period_start: string;
    pay_period_end: string;
    pay_date: string;
    status: string;
    journal_entry_id?: string | null;
  };
};

type Props = {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  claims?: Claim[];
  assets?: Asset[];
  onEdit?: (employee: Employee) => void;
};

const EmployeePreviewDialog = ({
  employee,
  isOpen,
  onClose,
  claims = [],
  assets = [],
  onEdit,
}: Props) => {
  const navigate = useNavigate();
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);

  const { data: payrollHistory, isLoading: historyLoading } = useQuery<PayrollHistoryItem[]>({
    ...employeePayrollHistoryQuery(activeCompany?.id ?? '', employee?.id ?? ''),
    enabled: isOpen && !!employee && !!activeCompany,
  });

  const { data: timelineEvents, isLoading: timelineLoading } = useQuery<EmployeeTimelineRecord[]>({
    ...employeeTimelineQuery(activeCompany?.id ?? '', employee?.id ?? ''),
    enabled: isOpen && !!employee && !!activeCompany,
  });

  const employeeClaims = useMemo(
    () => (employee ? claims.filter((c) => c.employee_id === employee.id) : []),
    [claims, employee]
  );

  const employeeAssets = useMemo(
    () => (employee ? assets.filter((a) => a.assigned_to_employee_id === employee.id) : []),
    [assets, employee]
  );

  const upcomingActions = useMemo(() => {
    if (!employee) return [];
    const actions: string[] = [];
    if (!employee.salary_amount) actions.push('Configure salary structure');
    if (!employee.bank_account_number) actions.push('Add banking details');
    if (!employee.tax_number) actions.push('Add tax number');
    if (!employee.email) actions.push('Add email for payslip distribution');
    if (!employee.department) actions.push('Assign department / cost centre');
    return actions;
  }, [employee]);

  if (!employee) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Employee Profile</DialogTitle>
          <DialogDescription>Official business identity and employment record.</DialogDescription>
        </DialogHeader>

        <EmployeeIdentity
          employee={employee}
          variant="card"
          size="lg"
          showDepartment
          showBranch
          showPosition
          showStatus
          companyName={identity?.name}
          showCompany
        />

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Identity Codes</h4>
          <EmployeeCodes employeeNumber={employee.employee_number} size="sm" />
        </section>

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Identification</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Employee Number</span><p className="font-mono font-medium">{employee.employee_number}</p></div>
            <div><span className="text-muted-foreground">ID Number</span><p>{employee.id_number || '—'}</p></div>
          </div>
        </section>

        <Separator />
        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Employment</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Position</span><p>{employee.position || '—'}</p></div>
            <div><span className="text-muted-foreground">Department</span><p>{employee.department || '—'}</p></div>
            <div><span className="text-muted-foreground">Branch</span><p>{employee.branch || '—'}</p></div>
            <div><span className="text-muted-foreground">Type</span><p className="capitalize">{employee.employment_type}</p></div>
            <div>
              <span className="text-muted-foreground">Salary</span>
              <p>{employee.salary_amount ? `${formatCurrency(employee.salary_amount)} / ${employee.salary_period}` : 'Not set'}</p>
            </div>
            <div><span className="text-muted-foreground">Start</span><p>{format(new Date(employee.start_date), 'PPP')}</p></div>
            <div><span className="text-muted-foreground">Email</span><p className="truncate">{employee.email || '—'}</p></div>
          </div>
        </section>

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Employee Timeline</h4>
          <EmployeeTimeline events={timelineEvents ?? []} isLoading={timelineLoading} maxItems={8} />
        </section>

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Payroll History</h4>
          {historyLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : payrollHistory && payrollHistory.length > 0 ? (
            <ul className="space-y-2">
              {payrollHistory.slice(0, 6).map((item) => (
                <li key={item.id} className="text-sm border rounded-md p-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium">
                        {format(new Date(item.payroll_runs.pay_period_start), 'MMM yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pay date {format(new Date(item.payroll_runs.pay_date), 'PPP')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-medium">{formatCurrency(item.net_pay)}</p>
                      <Badge variant="outline" className="text-xs capitalize mt-1">
                        {item.payment_status ?? item.payroll_runs.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => { onClose(); navigate(`/payroll-runs/${item.payroll_runs.id}`); }}
                    >
                      View Run
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No payslips on record yet.</p>
          )}
        </section>

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Expense Claims</h4>
          {employeeClaims.length > 0 ? (
            <ul className="space-y-1.5">
              {employeeClaims.slice(0, 4).map((claim) => (
                <li key={claim.id} className="flex justify-between text-sm">
                  <span>{claim.claim_number}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{formatCurrency(claim.total_amount)}</span>
                    <Badge variant="outline" className="text-xs capitalize">{claim.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No expense claims on record.</p>
          )}
        </section>

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Assigned Assets</h4>
          {employeeAssets.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {employeeAssets.map((asset) => (
                <li key={asset.id} className="flex justify-between">
                  <span>{asset.name}</span>
                  <Badge variant="outline" className="text-xs capitalize">{asset.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No fixed assets assigned.</p>
          )}
        </section>

        <Separator />

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Upcoming Actions</h4>
          {upcomingActions.length > 0 ? (
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              {upcomingActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">Employee profile complete for payroll.</p>
          )}
        </section>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {onEdit && (
            <Button onClick={() => { onEdit(employee); onClose(); }}>Edit Employee</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeePreviewDialog;
