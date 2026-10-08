import { useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Download, Loader2, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { downloadCSV } from '../../lib/utils';
import { invokeImport, type CompareLine, type CompareResult } from '../api';
import { autoMapColumns, type MappableField } from '../autoMap';
import { formatMoney } from '../labels';
import { FileReadError, readImportFile, type ParsedFile } from '../parseFile';

const SKIP = '__skip__';

const STATUS_TEXT: Record<CompareLine['status'], string> = {
  match: 'Matches',
  differs: 'Differs',
  not_found: 'Account not found here',
  ambiguous: 'Unclear account',
  only_here: 'Only in AdminLess Fin',
};

/** Debit-minus-credit shown the way accountants read a trial balance. */
function side(net: number | null): string {
  if (net == null) return '—';
  if (Math.abs(net) < 0.005) return formatMoney(0);
  return `${formatMoney(Math.abs(net))} ${net > 0 ? 'Dr' : 'Cr'}`;
}

interface Props {
  companyId: string;
  asAtDate: string | null;
  fields: MappableField[];
  sourceLabel: string;
}

export function CompareCheck({ companyId, asAtDate, fields, sourceLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const p = await readImportFile(file);
      setParsed(p);
      setMapping(autoMapColumns(p.headers, fields));
    } catch (e) {
      setError(e instanceof FileReadError ? e.message : `The file could not be read: ${(e as Error).message}`);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const compare = async () => {
    if (!parsed || !asAtDate) return;
    setBusy(true);
    setError(null);
    try {
      const rows = parsed.rows.map((raw, i) => ({ row_number: parsed.lines[i], raw }));
      setResult(await invokeImport<CompareResult>(companyId, 'COMPARE_TRIAL_BALANCE', { as_at_date: asAtDate, mapping, rows }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const readyToCompare = !!parsed && !!asAtDate && !!(mapping.account || mapping.account_code) && !!(mapping.balance || mapping.debit || mapping.credit);

  return (
    <div className="space-y-4" data-testid="compare-check">
      {!asAtDate && <p className="text-sm text-muted-foreground">Choose your switch-over date above first.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx"
          className="sr-only"
          data-testid="compare-file-input"
          onChange={e => void onFile(e.target.files?.[0])}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={!asAtDate}>
          <Upload className="mr-2 h-4 w-4" aria-hidden />
          {parsed ? 'Choose a different file' : `Upload the ${sourceLabel} trial balance`}
        </Button>
        {parsed && <span className="text-sm text-muted-foreground">{parsed.fileName} · {parsed.rows.length} lines</span>}
      </div>

      {parsed && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {fields.map(field => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs">{field.label}</Label>
              <Select
                value={mapping[field.key] ?? SKIP}
                onValueChange={v => setMapping(m => {
                  const next = { ...m };
                  if (v === SKIP) delete next[field.key];
                  else next[field.key] = v;
                  return next;
                })}
              >
                <SelectTrigger aria-label={`Column for ${field.label}`} data-testid={`compare-map-${field.key}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIP}>— Not in file —</SelectItem>
                  {parsed.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {parsed && (
        <Button onClick={() => void compare()} disabled={!readyToCompare || busy} data-testid="compare-run">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Compare with AdminLess Fin as at {asAtDate}
        </Button>
      )}

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {result && (
        <section className="space-y-3" data-testid="compare-result">
          <div className={`flex items-start gap-2 font-medium ${result.all_match ? 'text-primary' : 'text-destructive'}`}>
            {result.all_match
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
            <span>
              {result.all_match
                ? `Every account matches your old system as at ${result.as_at_date} (${result.matched} accounts).`
                : `${result.matched} accounts match. ${[
                    result.differs ? `${result.differs} differ` : null,
                    result.unmatched ? `${result.unmatched} could not be matched to an account` : null,
                    result.only_here ? `${result.only_here} have a balance only here` : null,
                  ].filter(Boolean).join(', ')}.`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Old system totals: {formatMoney(result.old_total_debit)} Dr, {formatMoney(result.old_total_credit)} Cr.
          </p>
          {!result.all_match && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void downloadCSV(result.lines.filter(l => l.status !== 'match').map(l => ({
                Account: l.label,
                'Old system': side(l.old_net),
                'AdminLess Fin': side(l.new_net),
                Difference: l.difference == null ? '' : l.difference.toFixed(2),
                Status: STATUS_TEXT[l.status],
                Note: l.note ?? '',
              })), `differences-${result.as_at_date}.csv`)}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden /> Download the differences
            </Button>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Old system</TableHead>
                  <TableHead className="text-right">AdminLess Fin</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.lines.map((line, i) => (
                  <TableRow key={`${line.label}-${i}`} className={line.status === 'match' ? undefined : 'bg-destructive/5'}>
                    <TableCell>
                      <div>{line.label}</div>
                      {line.account_name && line.account_name !== line.label && <div className="text-xs text-muted-foreground">→ {line.account_name}</div>}
                      {line.note && <div className="text-xs text-muted-foreground">{line.note}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{side(line.old_net)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{side(line.new_net)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {line.difference == null || Math.abs(line.difference) < 0.005 ? '' : formatMoney(line.difference)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={line.status === 'match' ? 'default' : line.status === 'differs' ? 'destructive' : 'outline'}>
                        {STATUS_TEXT[line.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
