import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';
import { BANK_FILE_KINDS, type BankFileResult } from '../../lib/payrollRulesEngine/bankFiles';
import { useBankProfiles } from './BankProfilesCard';

function save(content: string, fileName: string) {
  const bytes = new Uint8Array([...content].map((c) => (c.charCodeAt(0) <= 0x7f ? c.charCodeAt(0) : 0x20)));
  const url = URL.createObjectURL(new Blob([bytes], { type: fileName.endsWith('.csv') ? 'text/csv' : 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Salary payment file for the company's bank, from a finalised run. */
export default function BankPaymentFileCard({ runId, payDate }: { runId: string; payDate: string }) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data: profiles } = useBankProfiles();
  const active = (profiles ?? []).filter((p) => p.active);
  const [profileId, setProfileId] = useState('');
  const [actionDate, setActionDate] = useState(payDate);
  const [result, setResult] = useState<(BankFileResult & { profileId: string }) | null>(null);
  useEffect(() => {
    if (!profileId && active.length) setProfileId((active.find((p) => p.is_default) ?? active[0]).id);
  }, [active, profileId]);

  const generate = useMutation({
    mutationFn: () => invokePayroll<BankFileResult>({ method: 'GENERATE_BANK_PAYMENT_FILE', company_id: activeCompany?.id, runId, profileId, actionDate }),
    onSuccess: (r) => {
      setResult({ ...r, profileId });
      if (r.content) { save(r.content, r.fileName); showSuccess(`Bank file ready: ${r.control.payments} payments, ${formatCurrency(r.control.total)}.`); }
      else showError(r.issues.find((i) => i.severity === 'error')?.message ?? 'The bank file could not be made.');
    },
    onError: (e: Error) => showError(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => invokePayroll({ method: 'CONFIRM_BANK_FILE_UPLOADED', company_id: activeCompany?.id, profileId: result?.profileId }),
    onSuccess: () => { showSuccess('Recorded: the next file uses the next generation number.'); queryClient.invalidateQueries({ queryKey: ['bank-payment-profiles'] }); setResult(null); },
    onError: (e: Error) => showError(e.message),
  });
  const profile = active.find((p) => p.id === profileId);

  return (
    <Card data-testid="bank-payment-file">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Pay through your bank</CardTitle>
        <CardDescription>A salary payment file in your bank's format, to import on the bank's business banking and authorise there.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!active.length ? (
          <p className="text-sm text-muted-foreground">
            Add your bank under <Link to="/settings" className="underline">Settings → Payroll → Bank payment files</Link> to download a file your bank imports.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Bank profile</Label>
                <Select value={profileId} onValueChange={(v) => { setProfileId(v); setResult(null); }}>
                  <SelectTrigger className="w-72" aria-label="Bank profile"><SelectValue /></SelectTrigger>
                  <SelectContent>{active.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-action-date">Payment date</Label>
                <Input id="bank-action-date" type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="w-44" />
              </div>
              <Button onClick={() => generate.mutate()} disabled={!profileId || generate.isPending} data-testid="download-bank-payment-file">
                <Download className="mr-1 h-4 w-4" />{generate.isPending ? 'Preparing…' : 'Download bank file'}
              </Button>
            </div>
            {profile && <p className="text-xs text-muted-foreground">{BANK_FILE_KINDS.find((k) => k.kind === profile.kind)?.label} · from {profile.paying_branch_code} / {profile.paying_account_number}</p>}
          </>
        )}
        {result && (
          <div className="space-y-2" data-testid="bank-file-result">
            <p className="text-sm">
              {result.control.payments} payment{result.control.payments === 1 ? '' : 's'} · {formatCurrency(result.control.total)} · payment date {result.control.actionDate}
              {result.control.hashTotal ? ` · hash total ${result.control.hashTotal}` : ''}
            </p>
            {result.issues.length > 0 && (
              <Alert variant={result.issues.some((i) => i.severity === 'error') ? 'destructive' : 'default'}>
                <AlertDescription>
                  <ul className="list-disc pl-5 text-sm">{result.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
                </AlertDescription>
              </Alert>
            )}
            {result.content && (profile?.kind === 'acb' || profile?.kind === 'fnb_obe_acb') && (
              <Button size="sm" variant="outline" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                I imported this file at the bank
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
