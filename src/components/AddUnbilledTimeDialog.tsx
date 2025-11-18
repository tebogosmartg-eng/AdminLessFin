import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { Skeleton } from './ui/skeleton';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

interface AddUnbilledTimeDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  customerId: string;
  onAdd: (items: any[]) => void;
}

const AddUnbilledTimeDialog = ({ isOpen, setIsOpen, customerId, onAdd }: AddUnbilledTimeDialogProps) => {
  const { activeCompany } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: unbilledTime, isLoading } = useQuery({
    queryKey: ['unbilled_time', customerId, activeCompany?.id],
    queryFn: async () => {
      if (!customerId || !activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('timesheets', {
        body: {
          method: 'GET_UNBILLED_TIME',
          company_id: activeCompany.id,
          customer_id: customerId,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!customerId && !!activeCompany,
  });

  const handleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(id);
      else newSet.delete(id);
      return newSet;
    });
  };

  const handleAddSelected = () => {
    const selectedItems = unbilledTime?.filter(item => selectedIds.has(item.id)) || [];
    onAdd(selectedItems);
    setIsOpen(false);
    setSelectedIds(new Set());
  };

  const totalSelectedHours = useMemo(() => {
    return unbilledTime
      ?.filter(item => selectedIds.has(item.id))
      .reduce((sum, item) => sum + item.hours, 0) || 0;
  }, [unbilledTime, selectedIds]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Unbilled Time</DialogTitle>
          <DialogDescription>Select the time entries you want to add to this invoice.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox onCheckedChange={(checked) => {
                  const allIds = unbilledTime?.map(i => i.id) || [];
                  if (checked) setSelectedIds(new Set(allIds));
                  else setSelectedIds(new Set());
                }} /></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(3)].map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>)
              ) : unbilledTime && unbilledTime.length > 0 ? (
                unbilledTime.map(item => (
                  <TableRow key={item.id}>
                    <TableCell><Checkbox checked={selectedIds.has(item.id)} onCheckedChange={(checked) => handleSelect(item.id, !!checked)} /></TableCell>
                    <TableCell>{format(new Date(item.date), 'PPP')}</TableCell>
                    <TableCell>{item.projects.name}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                    <TableCell className="text-right font-mono">{item.hours.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.projects.billable_rate || 0)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="text-center h-24">No unbilled time found for this customer.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <div className="mr-auto text-sm text-muted-foreground">
            Total selected hours: <strong>{totalSelectedHours.toFixed(2)}</strong>
          </div>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleAddSelected} disabled={selectedIds.size === 0}>
            Add {selectedIds.size} Item(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddUnbilledTimeDialog;