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
import BillForm from '../components/BillForm';
import { useNavigate } from 'react-router-dom';

type BillEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  vendors: { name: string }[] | null;
  total: number;
};

const Bills = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const navigate = useNavigate();

  const fetchBills = async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        vendors ( name ),
        journal_entry_items ( type, amount )
      `)
      .not('vendor_id', 'is', null)
      .order('entry_date', { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];

    return data.map(entry => ({
      ...entry,
      total: entry.journal_entry_items
        .filter(item => item.type === 'credit')
        .reduce((sum, item) => sum + item.amount, 0),
    }));
  };

  const { data: bills, isLoading } = useQuery<BillEntry[]>({
    queryKey: ['bills'],
    queryFn: fetchBills,
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Bills</CardTitle>
              <CardDescription>A record of all bills received from vendors.</CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Record New Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading bills...</TableCell>
                </TableRow>
              ) : bills && bills.length > 0 ? (
                bills.map((bill) => (
                  <TableRow key={bill.id} className="cursor-pointer" onClick={() => navigate(`/journal-entries`)}>
                    <TableCell>{new Date(bill.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{bill.vendors?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{bill.description}</TableCell>
                    <TableCell className="text-right">${bill.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No bills recorded yet. Add one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BillForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
      />
    </>
  );
};

export default Bills;