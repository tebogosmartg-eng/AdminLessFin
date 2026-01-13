import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, ArrowRightLeft } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { showError, showSuccess } from '../utils/toast';
import VendorCreditForm from '../components/VendorCreditForm';
import AllocateVendorCreditDialog from '../components/AllocateVendorCreditDialog';

const VendorCredits = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [selectedVC, setSelectedVC] = useState<any>(null);
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);

  const { data: vendorCredits, isLoading } = useQuery({
    queryKey: ['vendor_credits', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'GET_ALL', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'DELETE', company_id: activeCompany!.id, id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor_credits'] });
      showSuccess('Vendor Credit deleted.');
    },
    onError: (e: any) => showError(e.message),
  });

  const handleAllocate = (vc: any) => {
    setSelectedVC(vc);
    setIsAllocateOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Vendor Credits</CardTitle>
              <CardDescription>Manage refunds and returns to vendors.</CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Vendor Credit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : vendorCredits && vendorCredits.length > 0 ? (
                vendorCredits.map((vc: any) => (
                  <TableRow key={vc.id}>
                    <TableCell className="font-medium">{vc.credit_number}</TableCell>
                    <TableCell>{vc.vendors?.name}</TableCell>
                    <TableCell>{format(new Date(vc.credit_date), 'PPP')}</TableCell>
                    <TableCell>{vc.reason}</TableCell>
                    <TableCell><Badge variant="outline">{vc.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleAllocate(vc)}>
                             <ArrowRightLeft className="mr-2 h-4 w-4" /> Allocate to Bill
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(vc.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="text-center">No vendor credits found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <VendorCreditForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      {selectedVC && (
        <AllocateVendorCreditDialog
          isOpen={isAllocateOpen}
          setIsOpen={setIsAllocateOpen}
          vendorCredit={selectedVC}
        />
      )}
    </>
  );
};

export default VendorCredits;