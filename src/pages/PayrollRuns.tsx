import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle } from 'lucide-react';
import NewPayrollRunDialog from '../components/NewPayrollRunDialog';
import { Badge } from '../components/ui/badge';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type PayrollRun = {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  status: string;
};

const PayrollRuns = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const navigate = useNavigate();
  const { activeCompany } = useAuth();

  const { data: payrollRuns, isLoading } = useQuery<PayrollRun[]>({
    queryKey: ['payroll_runs', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'GET_RUNS',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Payroll Runs</CardTitle>
              <CardDescription>Manage and process payroll for your employees.</CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Payroll Run
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pay Period</TableHead>
                <TableHead>Pay Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading payroll runs...</TableCell>
                </TableRow>
              ) : payrollRuns && payrollRuns.length > 0 ? (
                payrollRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      {format(new Date(run.pay_period_start), 'PPP')} - {format(new Date(run.pay_period_end), 'PPP')}
                    </TableCell>
                    <TableCell>{format(new Date(run.pay_date), 'PPP')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{run.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/payroll-runs/${run.id}`)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No payroll runs found. Create one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <NewPayrollRunDialog
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
      />
    </>
  );
};

export default PayrollRuns;