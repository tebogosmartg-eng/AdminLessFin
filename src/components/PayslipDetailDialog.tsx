import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { Separator } from './ui/separator';
import { Printer } from 'lucide-react';

interface PayslipDetailDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  payslipId: string;
}

const PayslipDetailDialog = ({ isOpen, setIsOpen, payslipId }: PayslipDetailDialogProps) => {
  const { activeCompany } = useAuth();

  const { data: payslipData, isLoading } = useQuery({
    queryKey: ['payslip_detail_view', payslipId],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'GET_PAYSLIP_DETAIL',
          company_id: activeCompany.id,
          payslipId: payslipId,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!activeCompany,
  });

  const earnings = payslipData?.payslip_items.filter(i => i.type === 'earning') || [];
  const deductions = payslipData?.payslip_items.filter(i => i.type === 'deduction') || [];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          {isLoading ? <Skeleton className="h-6 w-1/2" /> : (
            <>
              <DialogTitle>Payslip</DialogTitle>
              <DialogDescription>
                For {payslipData?.employees.first_name} {payslipData?.employees.last_name}
              </DialogDescription>
            </>
          )}
        </DialogHeader>
        {isLoading ? <Skeleton className="h-96 w-full" /> : payslipData && (
          <div className="text-sm">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <img src="/logo.png" alt="SmaAcc Logo" className="h-12 w-auto mb-2" />
                <h3 className="font-bold text-base">{activeCompany?.name || 'Your Company'}</h3>
                <p className="text-muted-foreground">{activeCompany?.address}</p>
              </div>
              <div className="text-right">
                <p><span className="font-semibold">Pay Period:</span> {format(new Date(payslipData.payroll_runs.pay_period_start), 'PPP')} - {format(new Date(payslipData.payroll_runs.pay_period_end), 'PPP')}</p>
                <p><span className="font-semibold">Pay Date:</span> {format(new Date(payslipData.payroll_runs.pay_date), 'PPP')}</p>
              </div>
            </div>
            
            <Separator className="my-4" />

            <div>
              <h4 className="font-semibold mb-1">Employee Details</h4>
              <p>{payslipData.employees.first_name} {payslipData.employees.last_name}</p>
              <p>{payslipData.employees.position}</p>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold mb-2">Earnings</h4>
                {earnings.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.description}</span>
                    <span className="font-mono">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="font-semibold mb-2">Deductions</h4>
                {deductions.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.description}</span>
                    <span className="font-mono">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold">Gross Pay:</span>
                  <span className="font-semibold font-mono">{formatCurrency(payslipData.total_earnings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Total Deductions:</span>
                  <span className="font-semibold font-mono">{formatCurrency(payslipData.total_deductions)}</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-lg bg-muted p-2 rounded-md">
                  <span className="font-bold">Net Pay:</span>
                  <span className="font-bold font-mono">{formatCurrency(payslipData.net_pay)}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PayslipDetailDialog;