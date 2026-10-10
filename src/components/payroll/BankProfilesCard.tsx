import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';
import { BANK_FILE_KINDS, type BankFileKind, type MappedColumn } from '../../lib/payrollRulesEngine/bankFiles';

export type BankProfileRow = {
  id: string;
  name: string;
  kind: BankFileKind;
  paying_account_number: string;
  paying_branch_code: string;
  paying_account_name: string;
  user_code: string | null;
  abbreviated_name: string | null;
  service_type: string;
  entry_class: string;
  installation_generation: number;
  user_generation: number;
  own_reference: string;
  recipient_reference: string;
  include_hash_total: boolean;
  csv_columns: MappedColumn[];
  csv_header: boolean;
  csv_delimiter: ',' | ';';
  csv_amount_style: 'rands' | 'cents' | 'rands_no_decimals';
  csv_date_format: string;
  is_default: boolean;
  active: boolean;
};

const COLUMN_LABELS: Record<MappedColumn, string> = {
  name: 'Name', account_number: 'Account number', branch_code: 'Branch code', account_type: 'Account type (1/2/3)', amount: 'Amount',
  own_reference: 'Own reference', recipient_reference: 'Beneficiary reference', employee_number: 'Employee number', action_date: 'Payment date', blank: '(blank column)',
};

const EMPTY: Partial<BankProfileRow> = {
  name: '', kind: 'acb', paying_account_number: '', paying_branch_code: '', paying_account_name: '', user_code: '', abbreviated_name: '',
  service_type: 'SAMEDAY', entry_class: '61', own_reference: 'SALARY {period}', recipient_reference: '{company} SALARY', include_hash_total: false,
  csv_columns: ['name', 'account_number', 'branch_code', 'amount', 'recipient_reference'], csv_header: true, csv_delimiter: ',',
  csv_amount_style: 'rands', csv_date_format: 'YYYYMMDD', is_default: true, active: true,
};

export function useBankProfiles() {
  const { activeCompany } = useAuth();
  return useQuery({
    queryKey: ['bank-payment-profiles', activeCompany?.id],
    queryFn: () => invokePayroll<BankProfileRow[]>({ method: 'LIST_BANK_PROFILES', company_id: activeCompany?.id }),
    enabled: !!activeCompany?.id,
  });
}

/**
 * The accounts salaries are paid from and the file format each bank imports: ACB (all major
 * banks), FNB Online Banking Enterprise ACB or CSV, Absa BIO CSV, Capitec CSV, or a CSV
 * mapped to any bank's template.
 */
export default function BankProfilesCard() {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useBankProfiles();
  const [editing, setEditing] = useState<Partial<BankProfileRow> | null>(null);
  const set = <K extends keyof BankProfileRow>(key: K, value: BankProfileRow[K]) => setEditing((p) => ({ ...p, [key]: value }));
  const save = useMutation({
    mutationFn: () => invokePayroll({ method: 'SAVE_BANK_PROFILE', company_id: activeCompany?.id, profile: editing }),
    onSuccess: () => { showSuccess('Bank profile saved.'); setEditing(null); queryClient.invalidateQueries({ queryKey: ['bank-payment-profiles'] }); },
    onError: (e: Error) => showError(e.message),
  });
  const kind = editing?.kind ?? 'acb';
  const isAcb = kind === 'acb' || kind === 'fnb_obe_acb';
  const columns = (editing?.csv_columns ?? []) as MappedColumn[];

  return (
    <Card data-testid="bank-profiles">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Bank payment files</CardTitle>
        <CardDescription>The account salaries are paid from and the file your bank imports. The ACB format works with FNB, Standard Bank, Absa, Nedbank and Capitec business banking.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Skeleton className="h-24 w-full" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No bank profile yet. Add one to download salary payment files for your bank from each finalised run.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Format</TableHead><TableHead>Paying account</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}{p.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}{!p.active && <Badge variant="outline" className="ml-2">Off</Badge>}</TableCell>
                  <TableCell className="text-sm">{BANK_FILE_KINDS.find((k) => k.kind === p.kind)?.label}</TableCell>
                  <TableCell className="font-mono text-sm">{p.paying_branch_code} / {p.paying_account_number}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button variant="outline" onClick={() => setEditing({ ...EMPTY, is_default: !(data ?? []).length })}><Plus className="mr-1 h-4 w-4" />Add bank profile</Button>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit bank profile' : 'Add bank profile'}</DialogTitle>
            <DialogDescription>Import the first file at the bank and stop before authorising, to confirm your bank accepts it.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>File format</Label>
                <Select value={kind} onValueChange={(v) => set('kind', v as BankFileKind)}>
                  <SelectTrigger aria-label="File format"><SelectValue /></SelectTrigger>
                  <SelectContent>{BANK_FILE_KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label htmlFor="bp-name">Name</Label><Input id="bp-name" value={editing.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. FNB salaries" /></div>
              <div className="space-y-1"><Label htmlFor="bp-holder">Account name</Label><Input id="bp-holder" value={editing.paying_account_name ?? ''} onChange={(e) => set('paying_account_name', e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="bp-account">Paying account number</Label><Input id="bp-account" inputMode="numeric" value={editing.paying_account_number ?? ''} onChange={(e) => set('paying_account_number', e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="bp-branch">Branch code</Label><Input id="bp-branch" inputMode="numeric" value={editing.paying_branch_code ?? ''} onChange={(e) => set('paying_branch_code', e.target.value)} placeholder="e.g. 250655" /></div>
              {isAcb && (
                <>
                  {kind === 'acb' && <div className="space-y-1"><Label htmlFor="bp-user-code">ACB user code</Label><Input id="bp-user-code" maxLength={4} value={editing.user_code ?? ''} onChange={(e) => set('user_code', e.target.value)} placeholder="4 characters from the bank" /></div>}
                  {kind === 'acb' && <div className="space-y-1"><Label htmlFor="bp-abbrev">Abbreviated name</Label><Input id="bp-abbrev" maxLength={10} value={editing.abbreviated_name ?? ''} onChange={(e) => set('abbreviated_name', e.target.value)} placeholder="Shown on statements (10)" /></div>}
                  {kind === 'acb' && (
                    <div className="space-y-1">
                      <Label>Service</Label>
                      <Select value={editing.service_type ?? 'SAMEDAY'} onValueChange={(v) => set('service_type', v)}>
                        <SelectTrigger aria-label="Service"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="SAMEDAY">Same day</SelectItem><SelectItem value="ONE DAY">One day</SelectItem><SelectItem value="TWO DAY">Two day</SelectItem></SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
              {(kind === 'fnb_obe_acb' || kind === 'fnb_obe_csv') && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch id="bp-hash" checked={editing.include_hash_total === true} onCheckedChange={(v) => set('include_hash_total', v)} />
                  <Label htmlFor="bp-hash" className="font-normal">Hash totals are switched on for my FNB profile</Label>
                </div>
              )}
              <div className="space-y-1"><Label htmlFor="bp-own">Own statement reference</Label><Input id="bp-own" value={editing.own_reference ?? ''} onChange={(e) => set('own_reference', e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="bp-recipient">Employee statement reference</Label><Input id="bp-recipient" value={editing.recipient_reference ?? ''} onChange={(e) => set('recipient_reference', e.target.value)} /></div>
              <p className="text-xs text-muted-foreground sm:col-span-2">References may use {'{period}'}, {'{company}'} and {'{employee_number}'}; they are shortened to what the bank allows (20 characters).</p>
              {kind === 'mapped_csv' && (
                <div className="space-y-2 sm:col-span-2 rounded-md border p-3">
                  <div className="text-sm font-medium">Columns, in your bank template's order</div>
                  {columns.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                      <Select value={c} onValueChange={(v) => set('csv_columns', columns.map((x, j) => (j === i ? v as MappedColumn : x)))}>
                        <SelectTrigger className="h-8" aria-label={`Column ${i + 1}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(COLUMN_LABELS) as MappedColumn[]).map((k) => <SelectItem key={k} value={k}>{COLUMN_LABELS[k]}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => set('csv_columns', columns.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => set('csv_columns', [...columns, 'blank'])}>Add column</Button>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="flex items-center gap-2"><Switch id="bp-header" checked={editing.csv_header !== false} onCheckedChange={(v) => set('csv_header', v)} /><Label htmlFor="bp-header" className="font-normal">Heading row</Label></div>
                    <Select value={editing.csv_amount_style ?? 'rands'} onValueChange={(v) => set('csv_amount_style', v as BankProfileRow['csv_amount_style'])}>
                      <SelectTrigger className="h-8" aria-label="Amount style"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="rands">Rands (1234.50)</SelectItem><SelectItem value="cents">Cents (123450)</SelectItem><SelectItem value="rands_no_decimals">Whole rands</SelectItem></SelectContent>
                    </Select>
                    <Select value={editing.csv_date_format ?? 'YYYYMMDD'} onValueChange={(v) => set('csv_date_format', v)}>
                      <SelectTrigger className="h-8" aria-label="Date style"><SelectValue /></SelectTrigger>
                      <SelectContent>{['YYYYMMDD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'YYYY/MM/DD'].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2"><Switch id="bp-default" checked={editing.is_default === true} onCheckedChange={(v) => set('is_default', v)} /><Label htmlFor="bp-default" className="font-normal">Default profile</Label></div>
              <div className="flex items-center gap-2"><Switch id="bp-active" checked={editing.active !== false} onCheckedChange={(v) => set('active', v)} /><Label htmlFor="bp-active" className="font-normal">In use</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="save-bank-profile">{save.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
