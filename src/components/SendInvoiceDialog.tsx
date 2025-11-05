import { useState, useEffect } from 'react';
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
import { useAuth } from '../contexts/AuthContext';

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
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (invoice) {
      setTo(invoice.customer_email || '');
      setSubject(`Invoice ${invoice.invoice_number} from ${profile?.company_name || 'Your Company'}`);
      setBody(`Hi,\n\nPlease find your invoice details below.\n\nThank you for your business!\n\nBest regards,\n${profile?.company_name || 'Your Company'}`);
    }
  }, [invoice, profile, isOpen]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: {
          invoiceId: invoice.id,
          to,
          subject,
          body,
        },
      });
      if (error) throw new Error(`Function Error: ${error.message}`);
    },
    onSuccess: async () => {
      const { error } = await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoice.id);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['invoice_detail', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Invoice sent successfully and marked as sent.');
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const handleSend = () => {
    sendEmailMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Invoice {invoice.invoice_number}</DialogTitle>
          <DialogDescription>This will send an email to your customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sendEmailMutation.isPending}>
            {sendEmailMutation.isPending ? 'Sending...' : 'Send Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendInvoiceDialog;