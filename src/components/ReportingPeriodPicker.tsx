/**
 * Shared Reporting Period picker.
 * Preset list is primary; calendar appears only for Custom Range.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { useReportingPeriod } from '@/contexts/ReportingPeriodContext';
import {
  REPORTING_PERIOD_PRESET_LABELS,
  REPORTING_PERIOD_PRESET_ORDER,
  type ReportingPeriodPreset,
} from '@/lib/reportingPeriod/presets';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type ReportingPeriodPickerProps = {
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** Called after a period change (e.g. reset pagination). */
  onPeriodChange?: () => void;
  showLabel?: boolean;
  triggerClassName?: string;
};

export function ReportingPeriodPicker({
  className,
  align = 'end',
  onPeriodChange,
  showLabel = true,
  triggerClassName,
}: ReportingPeriodPickerProps) {
  const {
    currentReportingPeriod,
    selectedPreset,
    setPreset,
    setCustomRange,
    isReady,
  } = useReportingPeriod();
  const [customOpen, setCustomOpen] = useState(false);

  const rangeLabel = currentReportingPeriod
    ? `${format(currentReportingPeriod.from, 'LLL dd, y')} – ${format(currentReportingPeriod.to, 'LLL dd, y')}`
    : 'Loading period…';

  const handlePresetChange = (value: string) => {
    const preset = value as ReportingPeriodPreset;
    if (preset === 'custom') {
      setPreset('custom');
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setPreset(preset);
    onPeriodChange?.();
  };

  const handleCustomSelect = (range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return;
    setCustomRange({ from: range.from, to: range.to });
    onPeriodChange?.();
    setCustomOpen(false);
  };

  return (
    <div className={cn('flex flex-col items-stretch gap-1 sm:items-end', className)}>
      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground">
          Reporting Period
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedPreset}
          onValueChange={handlePresetChange}
          disabled={!isReady}
        >
          <SelectTrigger
            className={cn('w-full min-w-[220px] sm:w-[240px]', triggerClassName)}
            aria-label="Reporting period preset"
          >
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {REPORTING_PERIOD_PRESET_ORDER.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {REPORTING_PERIOD_PRESET_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedPreset === 'custom' ? (
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start text-left font-normal sm:w-[260px]',
                  !currentReportingPeriod && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{rangeLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align={align}>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={currentReportingPeriod?.from}
                selected={
                  currentReportingPeriod
                    ? { from: currentReportingPeriod.from, to: currentReportingPeriod.to }
                    : undefined
                }
                onSelect={handleCustomSelect}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <div
            className="hidden items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:flex"
            title={rangeLabel}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{rangeLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportingPeriodPicker;
