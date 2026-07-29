import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { invokePayroll } from '../lib/payrollOperations';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { formatEmployeeAiContext } from '../lib/employeeIdentity';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { format } from 'date-fns';
import { Separator } from './ui/separator';
import { Printer, Mail, Download } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import { AdminLessFinMark, CompanyLogo } from './brand';
import {
  classifyPayslipItems,
  computeEmployerCost,
  downloadPayslipPdf,
  extractPayslipCertificationFromSnapshot,
  getPayslipPaymentDetails,
  hasPayslipPaymentDetails,
  type PayslipDocumentData,
} from '../lib/payrollDocuments';
import { BRAND } from '../config/brand';

type PayslipDetailData = {
  payslip_items: PayslipDocumentData['items'];
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  email_sent_at?: string | null;
  calculation_snapshot?: Record<string, unknown>;
  employees: PayslipDocumentData['employee'] & { employee_number: string; email?: string | null };
  payroll_runs: {
    id: string;
    pay_period_start: string;
    pay_period_end: string;
    pay_date: string;
  };
};

interface PayslipDetailDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  payslipId: string;
}

const PayslipDetailDialog = ({ isOpen, setIsOpen, payslipId }: PayslipDetailDialogProps) => {
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const queryClient = useQueryClient();

  const { data: payslipData, isLoading } = useQuery({
    queryKey: ['payslip_detail_view', payslipId],
    queryFn: async () => {
      if (!activeCompany) return null;
      return invokePayroll<PayslipDetailData>({
        method: 'GET_PAYSLIP_DETAIL',
        company_id: activeCompany.id,
        payslipId,
      });
    },
    enabled: isOpen && !!activeCompany,
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-payslip-email', {
        body: { payslipId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payslip_detail_view', payslipId] });
      queryClient.invalidateQueries({ queryKey: ['payroll_run_detail'] });
      showSuccess('Payslip emailed to employee.');
    },
    onError: (error: Error) => showError(error.message),
  });

  const items = payslipData?.payslip_items ?? [];
  const { earnings, deductions, employerContributions } = classifyPayslipItems(items);
  const employerCost = payslipData ? computeEmployerCost(payslipData.total_earnings, employerContributions) : 0;

  const handleDownloadPdf = async () => {
    if (!payslipData || !activeCompany) return;
    const doc: PayslipDocumentData = {
      companyName: identity?.name || 'Company',
      companyAddress: identity?.address,
      companyTaxId: identity?.taxId,
      companyLogoUrl: activeCompany.logo_url,
      employee: {
        ...payslipData.employees,
        employee_number: payslipData.employees.employee_number,
      },
      payPeriodStart: payslipData.payroll_runs.pay_period_start,
      payPeriodEnd: payslipData.payroll_runs.pay_period_end,
      payDate: payslipData.payroll_runs.pay_date,
      items,
      total_earnings: payslipData.total_earnings,
      total_deductions: payslipData.total_deductions,
      net_pay: payslipData.net_pay,
      payment_method: 'EFT',
      bank_reference: `PAY-${payslipData.payroll_runs.pay_date}`,
      audit_reference: `PSL-${payslipId.slice(0, 8)}`,
      payslip_id: payslipId,
      payroll_run_id: payslipData.payroll_runs.id,
      ...extractPayslipCertificationFromSnapshot(
        payslipData.calculation_snapshot as Record<string, unknown> | undefined
      ),
    };
    await downloadPayslipPdf(doc, `payslip-${payslipData.employees.last_name}.pdf`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl print:max-w-none">
        <DialogHeader className="print:hidden">
          {isLoading ? <Skeleton className="h-6 w-1/2" /> : (
            <>
              <DialogTitle>Payslip</DialogTitle>
              <DialogDescription>
                {payslipData ? formatEmployeeAiContext(payslipData.employees) : ''}
                {payslipData?.email_sent_at && ` · Emailed ${format(new Date(payslipData.email_sent_at), 'PPP')}`}
              </DialogDescription>
            </>
          )}
        </DialogHeader>
        {isLoading ? <Skeleton className="h-96 w-full" /> : payslipData && (
          <div className="text-sm payslip-document">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                {activeCompany?.logo_url ? (
                  <CompanyLogo src={activeCompany.logo_url} className="mb-2" />
                ) : null}
                <h3 className="font-bold text-base">{identity?.name || 'Your Company'}</h3>
                <p className="text-muted-foreground">{identity?.address}</p>
              </div>
              <div className="text-right">
                <p><span className="font-semibold">Pay Period:</span> {format(new Date(payslipData.payroll_runs.pay_period_start), 'PPP')} – {format(new Date(payslipData.payroll_runs.pay_period_end), 'PPP')}</p>
                <p><span className="font-semibold">Pay Date:</span> {format(new Date(payslipData.payroll_runs.pay_date), 'PPP')}</p>
              </div>
            </div>

            <Separator className="my-4" />

            <div>
              <h4 className="font-semibold mb-1">Employee Details</h4>
              <p className="font-mono text-xs text-muted-foreground">{payslipData.employees.employee_number}</p>
              <p>{payslipData.employees.first_name} {payslipData.employees.last_name}</p>
              {payslipData.employees.department && <p className="text-muted-foreground">Department: {payslipData.employees.department}</p>}
              <p>{payslipData.employees.position}</p>
              {payslipData.employees.tax_number && <p className="text-muted-foreground">Tax No: {payslipData.employees.tax_number}</p>}
              <p className="text-muted-foreground">{payslipData.employees.email}</p>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold mb-2">Earnings</h4>
                {earnings.map((item) => (
                  <div key={item.id ?? item.description} className="flex justify-between">
                    <span>{item.description}</span>
                    <span className="font-mono">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="font-semibold mb-2">Deductions</h4>
                {deductions.length ? deductions.map((item) => (
                  <div key={item.id ?? item.description} className="flex justify-between">
                    <span>{item.description}</span>
                    <span className="font-mono">{formatCurrency(item.amount)}</span>
                  </div>
                )) : <p className="text-muted-foreground">None</p>}
              </div>
            </div>

            {employerContributions.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h4 className="font-semibold mb-2">Employer Contributions</h4>
                  {employerContributions.map((item) => (
                    <div key={item.id ?? item.description} className="flex justify-between">
                      <span>{item.description}</span>
                      <span className="font-mono">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <div className="flex justify-between"><span className="font-semibold">Gross Earnings:</span><span className="font-mono">{formatCurrency(payslipData.total_earnings)}</span></div>
                <div className="flex justify-between"><span className="font-semibold">Total Deductions:</span><span className="font-mono">{formatCurrency(payslipData.total_deductions)}</span></div>
                <div className="flex justify-between"><span className="font-semibold">Employer Cost:</span><span className="font-mono">{formatCurrency(employerCost)}</span></div>
              </div>
              <div>
                <div className="flex justify-between text-lg bg-muted p-2 rounded-md">
                  <span className="font-bold">Net Pay:</span>
                  <span className="font-bold font-mono">{formatCurrency(payslipData.net_pay)}</span>
                </div>
              </div>
            </div>

            {hasPayslipPaymentDetails({
              payment_method: 'EFT',
              bank_reference: `PAY-${payslipData.payroll_runs.pay_date}`,
              employee: payslipData.employees,
            }) && (() => {
              const payment = getPayslipPaymentDetails({
                payment_method: 'EFT',
                bank_reference: `PAY-${payslipData.payroll_runs.pay_date}`,
                employee: payslipData.employees,
              });
              return (
                <div className="mt-4 text-xs space-y-1">
                  <h4 className="font-semibold text-sm mb-1">Payment Information</h4>
                  <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                    <span>Payment Method</span><span className="font-mono text-foreground">{payment.payment_method}</span>
                    <span>Bank Name</span><span className="font-mono text-foreground">{payment.bank_name}</span>
                    <span>Account Number</span><span className="font-mono text-foreground">{payment.account_number}</span>
                    <span>Branch Code</span><span className="font-mono text-foreground">{payment.branch_code}</span>
                    <span>Payment Reference</span><span className="font-mono text-foreground">{payment.payment_reference}</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-8 pt-3 border-t text-center text-[10px] text-muted-foreground">
              <div>Generated by</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-emerald-700">
                <AdminLessFinMark className="size-4" decorative />
                <span className="font-medium">{BRAND.product}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <Button variant="outline" onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              {payslipData.employees.email && (
                <Button onClick={() => sendEmailMutation.mutate()} disabled={sendEmailMutation.isPending}>
                  <Mail className="mr-2 h-4 w-4" />
                  {sendEmailMutation.isPending ? 'Sending…' : 'Email'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PayslipDetailDialog;
