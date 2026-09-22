import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { MODULE_OPTIONS, STATUS_OPTIONS, type AccountingFilters } from '../../lib/accountingWorkspace';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import ReportingPeriodPicker from '../ReportingPeriodPicker';

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
  const {
    dateFrom,
    dateTo,
    isReady,
  } = useReportingPeriod();

  // Keep filter date range bound to the shared Reporting Period Context.
  useEffect(() => {
    if (!isReady || !dateFrom || !dateTo) return;
    if (value.date_from === dateFrom && value.date_to === dateTo && !value.financial_year_id && !value.accounting_period_id) return;
    // The range IS the year/period: drop any year or period id a caller seeded.
    onChange({ ...value, date_from: dateFrom, date_to: dateTo, financial_year_id: undefined, accounting_period_id: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when shared period changes
  }, [isReady, dateFrom, dateTo]);

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

      {/* No year or period select here. The financial year and period are the
          global context (header switcher); the dates above follow it. A second,
          local year filter was how this bar came to show a year as selected
          while filtering by none. */}

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

      <ReportingPeriodPicker showLabel={false} />
    </div>
  );
}
