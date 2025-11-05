import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { showError, showSuccess } from '../utils/toast';

interface SendInvoiceDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    customer_email: string | null;
  };
}

const SendInvoiceDialog = ({ isOpen, setIsOpen, invoice }: SendInvoiceDialogProps) => {
  const queryClient = useQueryClient();

  const subject = `Invoice ${invoice.invoice_number} from Your Company`;
  const body = `Dear Customer,\n\nPlease find attached your invoice ${invoice.invoice_number}.\n\nThank you for your business!\n\nBest regards,\nYour Company`;

  const updateStatusMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_detail', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Invoice marked as sent.');
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const handleSend = () => {
    // In a real app, this would trigger an email service.
    // Here, we'll just update the status.
    updateStatusMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Invoice {invoice.invoice_number}</DialogTitle>
          <DialogDescription>This will mark the invoice as sent. An email will not actually be sent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" value={invoice.customer_email || 'No email on file'} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" value={body} readOnly rows={8} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={updateStatusMutation.isPending}>
            {updateStatusMutation.isPending ? 'Sending...' : 'Send and Mark as Sent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendInvoiceDialog;