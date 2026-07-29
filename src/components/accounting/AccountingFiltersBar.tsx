import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '../../lib/utils';
import { MODULE_OPTIONS, STATUS_OPTIONS, type AccountingFilters } from '../../lib/accountingWorkspace';
import { useAccountingContext } from '../../lib/accountingQueries';
import { useAuth } from '../../contexts/AuthContext';

type Props = {
  value: AccountingFilters;
  onChange: (next: AccountingFilters) => void;
  accounts?: { id: string; account_number: number; name: string }[];
  showAccount?: boolean;
  showSearch?: boolean;
  className?: string;
};

export default function AccountingFiltersBar({
  value,
  onChange,
  accounts,
  showAccount = true,
  showSearch = false,
  className,
}: Props) {
  const { activeCompany } = useAuth();
  const { data: ctx } = useAccountingContext(activeCompany?.id);

  const date: DateRange | undefined = value.date_from || value.date_to
    ? {
        from: value.date_from ? new Date(value.date_from) : undefined,
        to: value.date_to ? new Date(value.date_to) : undefined,
      }
    : undefined;

  const set = (patch: Partial<AccountingFilters>) => onChange({ ...value, ...patch });

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {showSearch && (
        <Input
          placeholder="Search reference, journal, description…"
          className="w-[220px]"
          value={value.search || ''}
          onChange={(e) => set({ search: e.target.value })}
        />
      )}

      <Select value={value.financial_year_id || 'all'} onValueChange={(v) => set({ financial_year_id: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Financial Year" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All years</SelectItem>
          {(ctx as any)?.financial_years?.map((y: any) => (
            <SelectItem key={y.id} value={y.id}>{y.year_code}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.accounting_period_id || 'all'} onValueChange={(v) => set({ accounting_period_id: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Period" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All periods</SelectItem>
          {(ctx as any)?.accounting_periods?.map((p: any) => (
            <SelectItem key={p.id} value={p.id}>P{p.period_number} · {p.status}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.module || 'all'} onValueChange={(v) => set({ module: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Module" /></SelectTrigger>
        <SelectContent>
          {MODULE_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={value.status || 'all'} onValueChange={(v) => set({ status: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {showAccount && accounts && (
        <Select value={value.account_id || 'all'} onValueChange={(v) => set({ account_id: v })}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.account_number} — {a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('w-[240px] justify-start text-left font-normal', !date && 'text-muted-foreground')}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? `${format(date.from, 'LLL dd, y')} – ${format(date.to, 'LLL dd, y')}` : format(date.from, 'LLL dd, y')
            ) : 'Date range'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            selected={date}
            onSelect={(range) => set({
              date_from: range?.from ? format(range.from, 'yyyy-MM-dd') : undefined,
              date_to: range?.to ? format(range.to, 'yyyy-MM-dd') : undefined,
            })}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
