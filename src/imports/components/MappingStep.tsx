import { useMemo } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import type { EntitySpec } from '../api';
import { missingRequired } from '../autoMap';
import type { ParsedFile } from '../parseFile';

const SKIP = '__skip__';

interface Props {
  spec: EntitySpec;
  parsed: ParsedFile;
  mapping: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>) => void;
  options: Record<string, unknown>;
  onOptionsChange: (options: Record<string, unknown>) => void;
}

function sampleFor(parsed: ParsedFile, header: string | undefined): string {
  if (!header) return '';
  const values: string[] = [];
  for (const row of parsed.rows) {
    const v = row[header];
    if (v != null && String(v).trim() !== '') values.push(String(v));
    if (values.length === 3) break;
  }
  return values.join(', ');
}

export function MappingStep({ spec, parsed, mapping, onMappingChange, options, onOptionsChange }: Props) {
  const missing = useMemo(() => missingRequired(mapping, spec.fields), [mapping, spec.fields]);
  const usedBy = useMemo(() => {
    const used = new Map<string, string>();
    for (const [field, header] of Object.entries(mapping)) if (header) used.set(header, field);
    return used;
  }, [mapping]);
  const unmappedHeaders = parsed.headers.filter(h => !usedBy.has(h));
  const hasDates = spec.fields.some(f => f.type === 'date');
  const set = (key: string, value: unknown) => onOptionsChange({ ...options, [key]: value });

  const choose = (fieldKey: string, header: string) => {
    const next = { ...mapping };
    if (header === SKIP) {
      delete next[fieldKey];
    } else {
      // One column feeds one field: take it away from wherever it was.
      for (const [k, v] of Object.entries(next)) if (v === header) delete next[k];
      next[fieldKey] = header;
    }
    onMappingChange(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="font-medium">{parsed.fileName}</span>
          {parsed.sheetName && <span className="text-muted-foreground"> · sheet "{parsed.sheetName}"</span>}
          <span className="text-muted-foreground"> · {parsed.rows.length.toLocaleString()} rows</span>
        </span>
        {missing.length === 0 ? (
          <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="h-4 w-4" aria-hidden /> All required fields are matched</span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <CircleAlert className="h-4 w-4" aria-hidden /> Still needed: {missing.map(f => f.label).join(', ')}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="import-mapping">
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">{spec.label} field</TableHead>
              <TableHead className="w-1/3">Column in your file</TableHead>
              <TableHead>Example values</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spec.fields.map(field => {
              const header = mapping[field.key];
              return (
                <TableRow key={field.key}>
                  <TableCell>
                    <div className="font-medium">
                      {field.label}
                      {field.required && <span className="ml-1 text-destructive" aria-label="required">*</span>}
                    </div>
                    {field.help && <div className="text-xs text-muted-foreground">{field.help}</div>}
                  </TableCell>
                  <TableCell>
                    <Select value={header ?? SKIP} onValueChange={v => choose(field.key, v)}>
                      <SelectTrigger aria-label={`Column for ${field.label}`} data-testid={`map-${field.key}`}
                        className={field.required && !header ? 'border-destructive' : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>{field.required ? '— Choose a column —' : "— Don't import —"}</SelectItem>
                        {parsed.headers.map(h => (
                          <SelectItem key={h} value={h}>
                            {h}{usedBy.has(h) && usedBy.get(h) !== field.key ? ' (in use)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="max-w-[18rem] truncate text-sm text-muted-foreground" title={sampleFor(parsed, header)}>
                    {sampleFor(parsed, header) || '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {unmappedHeaders.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Not imported: {unmappedHeaders.join(', ')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {hasDates && (
          <div className="space-y-2">
            <Label htmlFor="import-date-format">Dates in this file</Label>
            <Select value={(options.date_format as string) ?? 'auto'} onValueChange={v => set('date_format', v)}>
              <SelectTrigger id="import-date-format" className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Work it out from the file</SelectItem>
                <SelectItem value="dmy">Day first (31/01/2026)</SelectItem>
                <SelectItem value="mdy">Month first (01/31/2026)</SelectItem>
                <SelectItem value="ymd">Year first (2026-01-31)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {spec.optionKeys.includes('on_duplicate') && (
          <div className="space-y-2">
            <Label htmlFor="import-duplicates">When a record already exists</Label>
            <Select value={(options.on_duplicate as string) ?? 'skip'} onValueChange={v => set('on_duplicate', v)}>
              <SelectTrigger id="import-duplicates" className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Leave it as it is</SelectItem>
                <SelectItem value="update">Update it with the file's values</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {spec.optionKeys.includes('auto_create_parties') && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="import-auto-create"
              checked={options.auto_create_parties === true}
              onCheckedChange={v => set('auto_create_parties', v)}
            />
            <Label htmlFor="import-auto-create" className="font-normal">
              Add {spec.entity === 'invoices' ? 'customers' : 'suppliers'} that don't exist yet
            </Label>
          </div>
        )}
      </div>
    </div>
  );
}
