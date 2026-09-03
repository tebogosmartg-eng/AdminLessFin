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
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';

interface SendQuoteDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  quote: {
    id: string;
    quote_number: string;
    customer_email: string | null;
  };
}

const SendQuoteDialog = ({ isOpen, setIsOpen, quote }: SendQuoteDialogProps) => {
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const queryClient = useQueryClient();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (quote) {
      const companyName = identity?.name || 'Your Company';
      setTo(quote.customer_email || '');
      setSubject(`Quote ${quote.quote_number} from ${companyName}`);
      setBody(`Hi,\n\nPlease find the quote details below.\n\nLet us know if you have any questions.\n\nBest regards,\n${companyName}`);
    }
  }, [quote, identity?.name, isOpen]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('send-quote-email', {
        body: {
          quoteId: quote.id,
          to,
          subject,
          body,
        },
      });
      if (error) throw new Error(`Function Error: ${error.message}`);
    },
    onSuccess: async () => {
      const { error } = await supabase.from('quotes').update({ status: 'sent' }).eq('id', quote.id);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['quote_detail', quote.id] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      showSuccess('Quote sent successfully and marked as sent.');
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
          <DialogTitle>Send Quote {quote.quote_number}</DialogTitle>
          <DialogDescription>
            This will send an email to your customer
            {identity?.email ? ` from ${identity.email}.` : '. Set a company email under Settings → Company so replies come back to you.'}
          </DialogDescription>
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
            {sendEmailMutation.isPending ? 'Sending...' : 'Send Quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendQuoteDialog;