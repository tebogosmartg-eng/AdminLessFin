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

interface SendPODialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  po: {
    id: string;
    po_number: string;
    vendor_email: string | null;
  };
}

const SendPODialog = ({ isOpen, setIsOpen, po }: SendPODialogProps) => {
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const queryClient = useQueryClient();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (po) {
      const companyName = identity?.name || 'Your Company';
      setTo(po.vendor_email || '');
      setSubject(`Purchase Order ${po.po_number} from ${companyName}`);
      setBody(`Hi,\n\nPlease find the attached purchase order.\n\nPlease confirm receipt and expected delivery date.\n\nBest regards,\n${companyName}`);
    }
  }, [po, identity?.name, isOpen]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('send-po-email', {
        body: {
          poId: po.id,
          to,
          subject,
          body,
        },
      });
      if (error) throw new Error(`Function Error: ${error.message}`);
    },
    onSuccess: async () => {
      // Mark as Sent if draft
      const { error } = await supabase.from('purchase_orders').update({ status: 'sent' }).eq('id', po.id).eq('status', 'draft');
      if (error) console.error("Error updating status", error); // Non-blocking
      
      queryClient.invalidateQueries({ queryKey: ['po_detail', po.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      showSuccess('Purchase Order sent successfully.');
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
          <DialogTitle>Send PO {po.po_number}</DialogTitle>
          <DialogDescription>This will send an email to your vendor.</DialogDescription>
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
            {sendEmailMutation.isPending ? 'Sending...' : 'Send PO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendPODialog;