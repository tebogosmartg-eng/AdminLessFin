import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import { format } from 'date-fns';

interface SendStatementDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  entity: {
    id: string;
    name: string;
    email: string | null;
  };
  type: 'customer' | 'vendor';
  dateFrom: string;
  dateTo: string;
}

const SendStatementDialog = ({ isOpen, setIsOpen, entity, type, dateFrom, dateTo }: SendStatementDialogProps) => {
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (entity && activeCompany) {
      const companyName = identity?.name || 'Your Company';
      setTo(entity.email || '');
      setSubject(`Statement of Account: ${companyName}`);
      setBody(`Dear ${entity.name},\n\nPlease find attached your statement of account for the period ${format(new Date(dateFrom), 'PP')} to ${format(new Date(dateTo), 'PP')}.\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards,\n${companyName}`);
    }
  }, [entity, activeCompany, identity?.name, dateFrom, dateTo, isOpen]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('send-statement-email', {
        body: {
          company_id: activeCompany.id,
          entityId: entity.id,
          type,
          date_from: dateFrom,
          date_to: dateTo,
          to,
          subject,
          body,
        },
      });
      if (error) throw new Error(`Function Error: ${error.message}`);
    },
    onSuccess: () => {
      showSuccess('Statement sent successfully.');
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
          <DialogTitle>Email Statement</DialogTitle>
          <DialogDescription>Send the statement of account to {entity.name}.</DialogDescription>
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
            {sendEmailMutation.isPending ? 'Sending...' : 'Send Statement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendStatementDialog;