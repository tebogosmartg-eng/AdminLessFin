import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { PlusCircle, MoreHorizontal, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { showError, showSuccess } from '../utils/toast';
import TaxRateForm from '../components/TaxRateForm';
import { EmptyState } from '../components/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useAuth } from '../contexts/AuthContext';
import { taxRatesQuery } from '../lib/queries';

export type TaxRate = {
  id: string;
  name: string;
  rate: number;
};

const TaxRates = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTaxRate, setSelectedTaxRate] = useState<TaxRate | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: taxRates, isLoading } = useQuery<TaxRate[]>({
    ...taxRatesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('tax-rates', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          taxRateId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax_rates', activeCompany?.id] });
      showSuccess('Tax rate deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting tax rate: ${error.message}`);
    },
  });

  const handleEdit = (taxRate: TaxRate) => {
    setSelectedTaxRate(taxRate);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedTaxRate(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this tax rate?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Alert className="mb-4 border-amber-200/70 bg-amber-50/20 dark:border-amber-900/40">
        <AlertTitle>Required for Accounting Setup</AlertTitle>
        <AlertDescription>
          At least one tax rate is needed before Accounting Ready is granted. Add VAT or other
          rates used on invoices and bills, then return to{' '}
          <Link to="/accounting-setup" className="font-medium underline underline-offset-2">
            Accounting Setup
          </Link>{' '}
          to continue.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tax Rates</CardTitle>
              <CardDescription>
                Define tax rates applied to invoice and bill line items when posting to the ledger.
              </CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Tax Rate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Rate (%)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">Loading tax rates...</TableCell>
                </TableRow>
              ) : taxRates && taxRates.length > 0 ? (
                taxRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.name}</TableCell>
                    <TableCell className="text-right font-mono">{rate.rate}%</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(rate)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(rate.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      title="No tax rates yet"
                      description="Add at least one rate — for example, VAT at 15%. This step is required to complete Accounting Setup."
                      action={
                        <Button onClick={handleAddNew}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add your first tax rate
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <TaxRateForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        taxRate={selectedTaxRate}
      />
    </>
  );
};

export default TaxRates;