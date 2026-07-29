import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { format } from 'date-fns';
import {
  PlayCircle,
  Loader2,
  CheckCircle,
  AlertCircle,
  MoreHorizontal,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import { showError, showPlatformError, showSuccess } from '../utils/toast';
import { Account } from './ChartOfAccounts';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { EmployeeIdentity } from '../components/hr/EmployeeIdentity';
import { formatEmployeeIdentityCompact } from '../lib/employeeIdentity';
import { formatCurrency } from '../lib/utils';
import { accountsQuery } from '../lib/queries';
import PayslipDialog from '../components/PayslipDialog';
import PayslipDetailDialog from '../components/PayslipDetailDialog';
import PayrollWorkflowStepper from '../components/payroll/PayrollWorkflowStepper';
import PayrollRunRulesPanel from '../components/payroll/PayrollRunRulesPanel';
import PayrollCommandCentre from '../components/payroll/PayrollCommandCentre';
import LifecycleContextBadge from '../components/boe/LifecycleContextBadge';
import { buildChatUrl } from '../lib/boe/contextualChat';
import { Link } from 'react-router-dom';
import { resolveCurrentWorkflowStep, isRunApproved, isRunFinalized } from '../lib/payrollWorkflow';
import {
  buildRegisterHtml,
  downloadPayrollRegister,
  downloadPayrollSummaryReport,
  downloadBankPaymentFile,
  downloadPayslipPdf,
  mapEmployeeToBankPaymentRow,
  openPrintDocument,
  type PayrollRegisterRow,
  type PayrollRunSummaryReport,
  type BankFileFormat,
  type BankPaymentRow,
  type PayslipDocumentData,
} from '../lib/payrollDocuments';
import { executePayrollCommand, invalidatePayrollQueries, invokePayroll } from '../lib/payrollOperations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

export type Payslip = {
  id: string;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  email_sent_at?: string | null;
  payment_status?: string;
  employees: {
    employee_number: string;
    first_name: string;
    last_name: string;
    department?: string;
    email?: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_branch_code?: string;
  };
};

type PayrollRun = {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  status: string;
  approved_at?: string | null;
  approved_by?: string | null;
  processed_at?: string | null;
  journal_entry_id?: string | null;
  output_metadata?: Record<string, unknown> | null;
};

const payrollApprovalStorageKey = (runId: string) => `payroll-approved-${runId}`;

type PayrollRunDetailData = {
  run?: PayrollRun;
  payslips?: Payslip[];
  audit_events?: unknown[];
};

const PayrollRunDetail = () => {
  const { id } = useParams();
  const { activeCompany, user, role: userRole } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const queryClient = useQueryClient();
  const [wageAccountId, setWageAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [isPayslipDialogOpen, setIsPayslipDialogOpen] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [isPayslipDetailOpen, setIsPayslipDetailOpen] = useState(false);
  const [selectedPayslipIdForDetail, setSelectedPayslipIdForDetail] = useState<string | null>(null);
  const [clientApprovedAt, setClientApprovedAt] = useState<string | null>(() => {
    if (!id) return null;
    return sessionStorage.getItem(payrollApprovalStorageKey(id));
  });

  const { data, isLoading: isLoadingRun } = useQuery({
    queryKey: ['payroll_run_detail', id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      return invokePayroll<PayrollRunDetailData>({ method: 'GET_RUN_DETAIL', company_id: activeCompany.id, runId: id });
    },
    enabled: !!activeCompany && !!id,
  });

  const { data: runSummary } = useQuery<PayrollRunSummaryReport>({
    queryKey: ['payroll_run_summary', id, activeCompany?.id],
    queryFn: async () => {
      return invokePayroll<PayrollRunSummaryReport>({ method: 'GET_RUN_SUMMARY', company_id: activeCompany!.id, runId: id });
    },
    enabled: !!activeCompany && !!id && isRunFinalized(data?.run?.status),
    retry: false,
  });

  const { data: runRegister } = useQuery<{ register?: PayrollRegisterRow[] }>({
    queryKey: ['payroll_run_register', id, activeCompany?.id],
    queryFn: async () =>
      invokePayroll<{ register?: PayrollRegisterRow[] }>({ method: 'GET_RUN_REGISTER', company_id: activeCompany!.id, runId: id }),
    enabled: !!activeCompany && !!id && isRunFinalized(data?.run?.status),
    retry: false,
  });

  const run = data?.run;
  const payslips = data?.payslips;
  const auditEvents = data?.audit_events ?? [];

  const workflowRun = useMemo<PayrollRun | undefined>(() => {
    if (!run) return undefined;
    if (run.approved_at || !clientApprovedAt) return run;
    return { ...run, approved_at: clientApprovedAt };
  }, [run, clientApprovedAt]);

  const registerRows = useMemo<PayrollRegisterRow[]>(() => {
    if (runRegister?.register?.length) return runRegister.register;
    if (!payslips || !run) return [];
    return payslips.map((p) => ({
      employee_number: p.employees.employee_number,
      employee: formatEmployeeIdentityCompact(p.employees),
      department: p.employees.department ?? '—',
      gross_pay: p.total_earnings,
      deductions: p.total_deductions,
      employer_contributions: 0,
      net_salary: p.net_pay,
      status: p.payment_status ?? (isRunFinalized(run.status) ? 'paid' : 'pending'),
    }));
  }, [runRegister, payslips, run]);

  const { data: accounts } = useQuery<Account[]>({
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const expenseAccounts = accounts?.filter((a) => a.type === 'Expense');
  const assetAccounts = accounts?.filter((a) => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter((a) => a.type === 'Liability');

  const currentStep = workflowRun
    ? resolveCurrentWorkflowStep(workflowRun, payslips?.length ?? 0)
    : 'validate';

  const invalidateRun = () => {
    if (activeCompany?.id) {
      invalidatePayrollQueries(queryClient, activeCompany.id, id);
    }
  };

  const generatePayslipsMutation = useMutation({
    mutationFn: async () => {
      const result = await executePayrollCommand({
        commandName: 'GENERATE_PAYSLIPS',
        outcomeEventId: 'payroll.payslips_generated',
        companyId: activeCompany!.id,
        userId: user?.id,
        userRole,
        entityId: id,
        executor: async () =>
          invokePayroll({ method: 'GENERATE_PAYSLIPS', company_id: activeCompany!.id, runId: id }),
      });
      return result.data;
    },
    onSuccess: () => {
      invalidateRun();
      showSuccess('Payslips generated successfully.');
    },
    onError: (error: Error) => showError(error.message),
  });

  const approveRunMutation = useMutation({
    mutationFn: async () => {
      const result = await executePayrollCommand({
        commandName: 'APPROVE_RUN',
        outcomeEventId: 'payroll.approved',
        companyId: activeCompany!.id,
        userId: user?.id,
        userRole,
        entityId: id,
        executor: async () =>
          invokePayroll<{ approved_at?: string; run?: PayrollRun }>({
            method: 'APPROVE_RUN',
            company_id: activeCompany!.id,
            runId: id,
          }),
      });
      return result.data as { approved_at?: string; run?: PayrollRun };
    },
    onSuccess: (result) => {
      const approvedAt = result?.approved_at ?? result?.run?.approved_at;
      if (approvedAt && id) {
        sessionStorage.setItem(payrollApprovalStorageKey(id), approvedAt);
        setClientApprovedAt(approvedAt);
      }
      invalidateRun();
      showSuccess('Payroll run approved.');
    },
    onError: (error: Error) => showError(error.message),
  });

  const finalizeRunMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Payroll run ID is missing.');
      const result = await executePayrollCommand({
        commandName: 'FINALIZE_RUN',
        outcomeEventId: 'payroll.processed',
        companyId: activeCompany!.id,
        userId: user?.id,
        userRole,
        entityId: id,
        executor: async () =>
          invokePayroll<{ recovered?: boolean }>({
            method: 'FINALIZE_RUN',
            company_id: activeCompany!.id,
            runId: id,
            wageAccountId,
            bankAccountId,
            liabilityAccountId,
          }),
      });
      return result.data;
    },
    onSuccess: (result) => {
      if (id) sessionStorage.removeItem(payrollApprovalStorageKey(id));
      setClientApprovedAt(null);
      invalidateRun();
      if (result?.recovered) {
        showSuccess('Payroll recovered and marked finalized (existing journal linked).');
      } else {
        showSuccess('Payroll finalized. Journal posted and outputs generated.');
      }
    },
    onError: (error: Error) => showError(error.message),
  });

  const emailAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-payslip-email', {
        body: { payrollRunId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { sent: number; failed: { payslip_id: string; reason: string }[] };
    },
    onSuccess: async (result) => {
      await invokePayroll({
        method: 'RECORD_DISTRIBUTION',
        company_id: activeCompany!.id,
        runId: id,
        emails_sent: result.sent,
        email_failures: result.failed,
      });
      invalidateRun();
      if (result.failed.length) {
        showError(`Sent ${result.sent}, failed ${result.failed.length}.`);
      } else {
        showSuccess(`All ${result.sent} payslips emailed successfully.`);
      }
    },
    onError: (error: Error) => showError(error.message),
  });

  const handleEditPayslip = (payslipId: string) => {
    setSelectedPayslipId(payslipId);
    setIsPayslipDialogOpen(true);
  };

  const handleViewPayslip = (payslipId: string) => {
    setSelectedPayslipIdForDetail(payslipId);
    setIsPayslipDetailOpen(true);
  };

  const runLabel = run
    ? `${format(new Date(run.pay_period_start), 'yyyy-MM-dd')}_${format(new Date(run.pay_period_end), 'yyyy-MM-dd')}`
    : 'run';

  const handleDownloadRegister = () => {
    if (!registerRows.length) return;
    downloadPayrollRegister(registerRows, runLabel);
    const totals = registerRows.reduce(
      (acc, r) => ({
        gross: acc.gross + r.gross_pay,
        deductions: acc.deductions + r.deductions,
        paye: acc.paye + (r.paye ?? 0),
        uif: acc.uif + (r.uif ?? 0),
        sdl: acc.sdl + (r.sdl ?? 0),
        employer: acc.employer + r.employer_contributions,
        net: acc.net + r.net_salary,
        cost: acc.cost + (r.cost_to_company ?? r.gross_pay + r.employer_contributions),
      }),
      { gross: 0, deductions: 0, paye: 0, uif: 0, sdl: 0, employer: 0, net: 0, cost: 0 }
    );
    openPrintDocument(
      buildRegisterHtml(identity?.name || 'Company', runLabel, registerRows, totals),
      'Payroll Register'
    );
  };

  const handleDownloadSummary = () => {
    const summary = runSummary ?? (run?.output_metadata?.summary as PayrollRunSummaryReport);
    if (!summary) return;
    downloadPayrollSummaryReport(summary, runLabel);
  };

  const handleDownloadBankFile = async (format: BankFileFormat = 'csv') => {
    if (!payslips?.length || !run || !activeCompany || !id) return;

    try {
      let batchResult: { bank_rows?: BankPaymentRow[] } | null = null;
      await executePayrollCommand({
        commandName: 'GENERATE_BANK_BATCH',
        outcomeEventId: 'payroll.bank_file_generated',
        companyId: activeCompany.id,
        userId: user?.id,
        userRole,
        entityId: id,
        metadata: { format },
        executor: async () => {
          const result = await invokePayroll<{ bank_rows?: BankPaymentRow[] }>({
            method: 'GENERATE_BANK_BATCH',
            company_id: activeCompany.id,
            runId: id,
            format,
          });
          batchResult = result;
          return result;
        },
      });

      // Edge Function is the authoritative source. Use bank_rows directly.
      // Rebuild from run-detail only if the Edge Function omitted them (unavailable / old deploy).
      const bankRows: BankPaymentRow[] = batchResult?.bank_rows?.length
        ? batchResult.bank_rows.map((row) => ({
            employee_name: row.employee_name,
            bank_name: row.bank_name ?? null,
            bank_branch_code: row.bank_branch_code ?? null,
            bank_account_number: row.bank_account_number ?? null,
            net_pay: row.payment_amount ?? row.net_pay,
            reference: row.payment_reference ?? row.reference,
          }))
        : payslips.map((p) =>
            mapEmployeeToBankPaymentRow({
              employee_name: formatEmployeeIdentityCompact(p.employees),
              employee: p.employees,
              net_pay: p.net_pay,
              reference: `PAY-${runLabel}`,
            })
          );

      downloadBankPaymentFile(bankRows, runLabel, run.pay_date, format);

      const statusResult = await invokePayroll<{ persisted?: boolean }>({
        method: 'UPDATE_BANK_BATCH_STATUS',
        company_id: activeCompany.id,
        runId: id,
        status: 'downloaded',
      });

      if (statusResult?.persisted === false) {
        throw new Error('Bank file downloaded but status could not be saved. Retry or refresh the run.');
      }

      invalidateRun();
      showSuccess(`Bank payment file (${format.toUpperCase()}) downloaded. Upload to your bank portal.`);
    } catch (cause) {
      showPlatformError(cause, { onRetry: () => handleDownloadBankFile(format) });
    }
  };

  const advanceBankBatchMutation = useMutation({
    mutationFn: async () => {
      const current = (run?.output_metadata?.bank_batch as { status?: string })?.status;
      const next = current === 'generated' ? 'downloaded' : current === 'downloaded' ? 'submitted' : 'paid';
      return invokePayroll({
        method: 'UPDATE_BANK_BATCH_STATUS',
        company_id: activeCompany!.id,
        runId: id,
        status: next,
      });
    },
    onSuccess: () => {
      invalidateRun();
      showSuccess('Bank batch status updated.');
    },
    onError: (error: Error) => showError(error.message),
  });

  const buildPayslipDoc = (detail: Record<string, unknown>): PayslipDocumentData => ({
    companyName: identity?.name || 'Company',
    companyAddress: identity?.address,
    companyTaxId: identity?.taxId,
    companyLogoUrl: activeCompany?.logo_url,
    employee: {
      ...(detail.employees as PayslipDocumentData['employee']),
      employee_number: (detail.employees as { employee_number?: string })?.employee_number,
    },
    payPeriodStart: (detail.payroll_runs as { pay_period_start: string }).pay_period_start,
    payPeriodEnd: (detail.payroll_runs as { pay_period_end: string }).pay_period_end,
    payDate: (detail.payroll_runs as { pay_date: string }).pay_date,
    items: (detail.payslip_items as PayslipDocumentData['items']) ?? [],
    total_earnings: detail.total_earnings as number,
    total_deductions: detail.total_deductions as number,
    net_pay: detail.net_pay as number,
    payment_method: 'EFT',
    bank_reference: `PAY-${(detail.payroll_runs as { pay_date: string }).pay_date}`,
    audit_reference: `PSL-${(detail.id as string)?.slice(0, 8)}`,
    payslip_id: detail.id as string,
    payroll_run_id: id,
  });

  const handleDownloadAllPayslips = async () => {
    if (!payslips?.length || !activeCompany) return;
    try {
      for (const p of payslips) {
        const detail = await invokePayroll<Record<string, unknown>>({
          method: 'GET_PAYSLIP_DETAIL',
          company_id: activeCompany.id,
          payslipId: p.id,
        });
        if (!detail) {
          throw new Error(`Payslip detail unavailable for employee ${p.employees.last_name}.`);
        }
        await downloadPayslipPdf(
          buildPayslipDoc(detail),
          `payslip-${(detail.employees as { last_name: string }).last_name}.pdf`
        );
      }
      await invokePayroll({
        method: 'RECORD_DISTRIBUTION',
        company_id: activeCompany.id,
        runId: id,
        emails_sent: run?.output_metadata?.emails_sent ?? 0,
        email_failures: run?.output_metadata?.email_failures ?? [],
      });
      showSuccess('All payslip PDFs downloaded.');
    } catch (cause) {
      showPlatformError(cause, { onRetry: () => handleDownloadAllPayslips() });
    }
  };

  const totalEarnings = payslips?.reduce((sum, p) => sum + p.total_earnings, 0) || 0;
  const totalDeductions = payslips?.reduce((sum, p) => sum + p.total_deductions, 0) || 0;
  const totalNetPay = payslips?.reduce((sum, p) => sum + p.net_pay, 0) || 0;
  const missingEmailCount = payslips?.filter((p) => !p.employees.email).length ?? 0;

  if (isLoadingRun) return <Skeleton className="h-96 w-full" />;
  if (!run) return <div>Payroll run not found.</div>;

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start gap-4">
              <div>
                <CardTitle>Payroll Run Command Centre</CardTitle>
                <CardDescription>
                  Pay period {format(new Date(run.pay_period_start), 'PPP')} – {format(new Date(run.pay_period_end), 'PPP')}
                  {' · '}Pay date {format(new Date(run.pay_date), 'PPP')}
                </CardDescription>
              </div>
              <Badge variant="outline" className="capitalize text-lg">{run.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <LifecycleContextBadge lifecycleId="payroll" stageId={currentStep === 'validate' ? 'validation' : currentStep === 'process' ? 'processing' : 'payslips'} />
              {id && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={buildChatUrl({ type: 'payroll_run', id, label: runLabel })}>
                    Discuss run
                  </Link>
                </Button>
              )}
            </div>
            <PayrollWorkflowStepper currentStep={currentStep} />
          </CardContent>
        </Card>

        {isRunFinalized(run.status) && (
          <PayrollCommandCentre
            run={run}
            summary={runSummary ?? (run.output_metadata?.summary as PayrollRunSummaryReport) ?? null}
            payslipCount={payslips?.length ?? 0}
            onDownloadRegister={handleDownloadRegister}
            onDownloadSummary={handleDownloadSummary}
            onDownloadBankFile={handleDownloadBankFile}
            onAdvanceBankBatch={() => advanceBankBatchMutation.mutate()}
            onDownloadAllPayslips={handleDownloadAllPayslips}
            onEmailAll={() => emailAllMutation.mutate()}
            isEmailing={emailAllMutation.isPending}
            warnings={missingEmailCount > 0 ? [`${missingEmailCount} employee(s) missing email addresses`] : []}
          />
        )}

        {run.status === 'draft' && id && (
          <PayrollRunRulesPanel runId={id} runStatus={run.status} onSaved={invalidateRun} />
        )}

        {currentStep === 'validate' && (
          <Card className="text-center p-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <ClipboardList className="h-5 w-5" /> Step 1: Validate Payroll
              </CardTitle>
              <CardDescription>
                Generate payslips for all employees with salary information for this period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="lg" onClick={() => generatePayslipsMutation.mutate()} disabled={generatePayslipsMutation.isPending}>
                {generatePayslipsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                Generate Payslips
              </Button>
            </CardContent>
          </Card>
        )}

        {payslips && payslips.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payslips ({payslips.length})</CardTitle>
              {currentStep === 'review' && (
                <CardDescription>Step 2: Review each payslip before approval.</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Gross Pay</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    {isRunFinalized(run.status) && <TableHead>Status</TableHead>}
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <EmployeeIdentity employee={p.employees} layout="stacked" showDepartment={false} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.employees.department ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.total_earnings)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.total_deductions)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.net_pay)}</TableCell>
                      {isRunFinalized(run.status) && (
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {p.email_sent_at ? 'emailed' : (p.payment_status ?? 'paid')}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewPayslip(p.id)}>View</DropdownMenuItem>
                            {run.status === 'draft' && (
                              <DropdownMenuItem onClick={() => handleEditPayslip(p.id)}>Edit</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {run.status === 'draft' && (
                <div className="mt-4 flex justify-end gap-6 text-sm font-mono">
                  <span>Gross: {formatCurrency(totalEarnings)}</span>
                  <span>Deductions: {formatCurrency(totalDeductions)}</span>
                  <span className="font-bold">Net: {formatCurrency(totalNetPay)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {currentStep === 'review' && payslips && payslips.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Step 3: Approve Payroll
              </CardTitle>
              <CardDescription>
                Confirm totals before processing. Gross {formatCurrency(totalEarnings)} · Net {formatCurrency(totalNetPay)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="lg"
                onClick={() => approveRunMutation.mutate()}
                disabled={approveRunMutation.isPending || isRunApproved(workflowRun ?? run)}
              >
                {approveRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                {isRunApproved(workflowRun ?? run) ? 'Approved' : 'Approve Payroll Run'}
              </Button>
              {isRunApproved(workflowRun ?? run) && (
                <p className="text-sm text-muted-foreground mt-2">
                  {(workflowRun ?? run)?.approved_at
                    ? `Approved ${format(new Date((workflowRun ?? run)!.approved_at!), 'PPP p')}`
                    : 'Payroll run approved — ready to process.'}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {currentStep === 'process' && isRunApproved(workflowRun ?? run) && (
          <Card>
            <CardHeader>
              <CardTitle>Step 4: Process Payroll & Post Journal</CardTitle>
              <CardDescription>Select GL accounts and finalize this payroll run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Select value={wageAccountId} onValueChange={setWageAccountId}>
                  <SelectTrigger><SelectValue placeholder="Wages/Salary Expense Account…" /></SelectTrigger>
                  <SelectContent>{expenseAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger><SelectValue placeholder="Bank/Cash Account…" /></SelectTrigger>
                  <SelectContent>{assetAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={liabilityAccountId} onValueChange={setLiabilityAccountId} disabled={totalDeductions === 0}>
                  <SelectTrigger><SelectValue placeholder="Payroll Liability Account…" /></SelectTrigger>
                  <SelectContent>{liabilityAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Journal Entry Preview</AlertTitle>
                <AlertDescription>
                  <p>Debit <strong>{accounts?.find((a) => a.id === wageAccountId)?.name || 'Wages Expense'}</strong>: {formatCurrency(totalEarnings)}</p>
                  <p>Credit <strong>{accounts?.find((a) => a.id === bankAccountId)?.name || 'Bank Account'}</strong>: {formatCurrency(totalNetPay)}</p>
                  {totalDeductions > 0 && (
                    <p>Credit <strong>{accounts?.find((a) => a.id === liabilityAccountId)?.name || 'Payroll Liabilities'}</strong>: {formatCurrency(totalDeductions)}</p>
                  )}
                </AlertDescription>
              </Alert>
              <Button
                onClick={() => finalizeRunMutation.mutate()}
                disabled={!wageAccountId || !bankAccountId || (totalDeductions > 0 && !liabilityAccountId) || finalizeRunMutation.isPending}
              >
                {finalizeRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Process Payroll & Generate Outputs
              </Button>
            </CardContent>
          </Card>
        )}

        {auditEvents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>Complete traceability for this payroll run.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEvents.map((evt: { id: string; event_type: string; event_data: Record<string, unknown>; created_at: string }) => (
                    <TableRow key={evt.id}>
                      <TableCell className="capitalize">{evt.event_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {JSON.stringify(evt.event_data)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {format(new Date(evt.created_at), 'PPP p')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedPayslipId && (
        <PayslipDialog isOpen={isPayslipDialogOpen} setIsOpen={setIsPayslipDialogOpen} payslipId={selectedPayslipId} />
      )}
      {selectedPayslipIdForDetail && (
        <PayslipDetailDialog isOpen={isPayslipDetailOpen} setIsOpen={setIsPayslipDetailOpen} payslipId={selectedPayslipIdForDetail} />
      )}
    </>
  );
};

export default PayrollRunDetail;
