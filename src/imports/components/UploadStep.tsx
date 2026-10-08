import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { BRAND } from '../../config/brand';
import type { EntitySpec, ImportReferences } from '../api';
import { downloadTemplate } from '../labels';
import { FileReadError, readImportFile, type ParsedFile } from '../parseFile';

const NONE = '__none__';

interface Props {
  spec: EntitySpec;
  references: ImportReferences | undefined;
  options: Record<string, unknown>;
  onOptionsChange: (options: Record<string, unknown>) => void;
  onParsed: (file: File, parsed: ParsedFile) => void;
  /** Set when a required setting above is still missing; the upload waits for it. */
  blockedReason?: string | null;
}

/** Settings that apply to the whole file, asked before the upload. */
function EntitySettings({ spec, references, options, onOptionsChange }: Omit<Props, 'onParsed' | 'blockedReason'>) {
  const set = (key: string, value: unknown) => onOptionsChange({ ...options, [key]: value });
  const assetAccounts = (references?.accounts ?? []).filter(a => a.type === 'Asset' && !a.account_role);
  const equityAccounts = (references?.accounts ?? []).filter(a => a.type === 'Equity');
  const accountLabel = (a: { name: string; account_code: string | null }) => (a.account_code ? `${a.account_code} · ${a.name}` : a.name);

  if (spec.entity === 'bank_transactions') {
    const banks = references?.bank_accounts ?? [];
    return (
      <div className="space-y-2">
        <Label htmlFor="import-bank-account">Bank account</Label>
        {banks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a bank account under Banking first.</p>
        ) : (
          <Select value={(options.bank_account_id as string) || undefined} onValueChange={v => set('bank_account_id', v)}>
            <SelectTrigger id="import-bank-account" className="max-w-sm"><SelectValue placeholder="Choose the account this statement is for" /></SelectTrigger>
            <SelectContent>
              {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  }

  if (spec.entity === 'customer_payments' || spec.entity === 'supplier_payments') {
    const key = spec.entity === 'customer_payments' ? 'default_deposit_account_id' : 'default_payment_account_id';
    return (
      <div className="space-y-2">
        <Label htmlFor="import-money-account">
          {spec.entity === 'customer_payments' ? 'Deposited into' : 'Paid from'} <span className="font-normal text-muted-foreground">(when the file does not say)</span>
        </Label>
        <Select value={(options[key] as string) || NONE} onValueChange={v => set(key, v === NONE ? null : v)}>
          <SelectTrigger id="import-money-account" className="max-w-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Named on each row</SelectItem>
            {assetAccounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (spec.entity === 'opening_balances') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="import-as-at">Balances as at</Label>
          <Input
            id="import-as-at"
            type="date"
            className="max-w-xs"
            value={(options.as_at_date as string) ?? ''}
            onChange={e => set('as_at_date', e.target.value || null)}
          />
          <p className="text-xs text-muted-foreground">Usually the day before you started using {BRAND.product}.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-balancing">If debits and credits differ, post the difference to</Label>
          <Select value={(options.balancing_account_id as string) || NONE} onValueChange={v => set('balancing_account_id', v === NONE ? null : v)}>
            <SelectTrigger id="import-balancing" className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>A new "Opening Balance Equity" account</SelectItem>
              {equityAccounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Upload your old system's trial balance exactly as it is. Import your unpaid invoices and bills, and set each bank account's opening balance, first — this step then posts only what those have not already put in the books, so nothing is counted twice.
        </p>
      </div>
    );
  }
  return null;
}

export function UploadStep({ spec, references, options, onOptionsChange, onParsed, blockedReason }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || blockedReason) return;
    setError(null);
    setReading(true);
    try {
      onParsed(file, await readImportFile(file));
    } catch (e) {
      setError(e instanceof FileReadError ? e.message : `The file could not be read: ${(e as Error).message}`);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <EntitySettings spec={spec} references={references} options={options} onOptionsChange={onOptionsChange} />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void handleFile(e.dataTransfer.files?.[0]); }}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}
      >
        {reading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        ) : (
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden />
        )}
        <div>
          <p className="font-medium">{reading ? 'Reading your file…' : 'Drag a file here, or browse'}</p>
          <p className="text-sm text-muted-foreground">CSV or Excel (.xlsx), up to 20 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          id="import-file"
          data-testid="import-file-input"
          onChange={e => void handleFile(e.target.files?.[0])}
        />
        {blockedReason && <p className="text-sm text-muted-foreground">{blockedReason}</p>}
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={reading || !!blockedReason}>
          <Upload className="mr-2 h-4 w-4" aria-hidden />
          Browse
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Don't have a file ready?</span>
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => void downloadTemplate(spec)}>
          <Download className="mr-1 h-4 w-4" aria-hidden />
          Download a template
        </Button>
        <span>— any column order or names work; you'll match them in the next step.</span>
      </div>
    </div>
  );
}
