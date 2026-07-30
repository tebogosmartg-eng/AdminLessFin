import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Link2, ShieldAlert } from 'lucide-react';
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';
import {
  acknowledgeLegacyKeep,
  formatCalendarYearDisplay,
  formatLegacyEngagementDateRange,
  isSealedEngagementWorkspaceStatus,
  suggestCalendarYearByDates,
  suggestedHistoricalYearCode,
  type EngagementPeriodLike,
} from '@/lib/financialStatements/calendarYearBinding';
import { migrateLegacyReportingPeriod } from '@/lib/financialStatements/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showError, showSuccess } from '@/utils/toast';

type MigrationMode = 'create_and_link' | 'link_existing' | 'keep_legacy';

type Props = {
  companyId: string;
  workspaceId: string;
  workspaceStatus: string;
  period: EngagementPeriodLike | null | undefined;
  financialYears: FinancialYearDomainModel[];
  /** When true, card is hidden after Keep as legacy. */
  dismissed?: boolean;
  onDismissed?: () => void;
  onMigrated?: () => void;
};

/**
 * Professional migration card for engagements created before the Enterprise Financial Calendar.
 * Never auto-binds — user must explicitly create, link, or keep legacy.
 */
export default function LegacyEngagementMigrationCard({
  companyId,
  workspaceId,
  workspaceStatus,
  period,
  financialYears,
  dismissed = false,
  onDismissed,
  onMigrated,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const sealed = isSealedEngagementWorkspaceStatus(workspaceStatus);
  const dateRange = formatLegacyEngagementDateRange(period?.start_date, period?.end_date);
  const suggestedMatch = useMemo(
    () => suggestCalendarYearByDates(period, financialYears),
    [period, financialYears],
  );
  const createCode =
    period?.end_date != null ? suggestedHistoricalYearCode(period.end_date) : null;

  if (dismissed) return null;

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-amber-600/50 text-amber-900 dark:text-amber-200">
              Legacy Financial Statement Engagement
            </Badge>
            {sealed ? (
              <Badge variant="secondary">Historically fixed</Badge>
            ) : null}
          </div>
          <CardTitle className="text-base pt-1">
            Not linked to the Enterprise Financial Calendar
          </CardTitle>
          <CardDescription className="text-sm text-foreground/80 space-y-2">
            <p>
              This engagement was created before Financial Statements consumed the Enterprise
              Financial Calendar. Its reporting period is stored as a legacy snapshot
              {dateRange ? (
                <>
                  {' '}
                  (<span className="font-medium tabular-nums">{dateRange}</span>)
                </>
              ) : null}
              , without an explicit <code className="text-xs">financial_year_id</code> link.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Cover titles and headings use the engagement&apos;s stored period dates until you
                migrate.
              </li>
              <li>
                Changing the Current Financial Year in Settings will not rewrite this engagement.
              </li>
              <li>
                Recommended: create a matching historical Financial Year, or link an existing one,
                so labels stay aligned with the calendar.
              </li>
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {sealed ? (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Published engagements are immutable</AlertTitle>
              <AlertDescription>
                Migration cannot change published or archived engagements. Sealed PDFs and review
                history remain historically fixed. You may continue viewing this legacy engagement as
                read-only metadata.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Button type="button" onClick={() => setWizardOpen(true)}>
                Resolve calendar link
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (period?.id) acknowledgeLegacyKeep(period.id);
                  onDismissed?.();
                }}
              >
                Keep as legacy engagement
              </Button>
            </>
          )}
          {suggestedMatch ? (
            <p className="w-full text-xs text-muted-foreground">
              Suggested match already on the calendar:{' '}
              <span className="font-medium text-foreground">
                {formatCalendarYearDisplay(suggestedMatch)}
              </span>
            </p>
          ) : createCode && dateRange ? (
            <p className="w-full text-xs text-muted-foreground">
              Creating a matching year would add{' '}
              <span className="font-medium text-foreground">
                {createCode} · {dateRange}
              </span>{' '}
              to the Enterprise Financial Calendar.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!sealed && (
        <LegacyMigrationWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          companyId={companyId}
          workspaceId={workspaceId}
          period={period}
          financialYears={financialYears}
          suggestedMatch={suggestedMatch}
          onMigrated={() => {
            setWizardOpen(false);
            onMigrated?.();
          }}
          onKeepLegacy={() => {
            if (period?.id) acknowledgeLegacyKeep(period.id);
            setWizardOpen(false);
            onDismissed?.();
          }}
        />
      )}
    </>
  );
}

function LegacyMigrationWizard({
  open,
  onOpenChange,
  companyId,
  workspaceId,
  period,
  financialYears,
  suggestedMatch,
  onMigrated,
  onKeepLegacy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  workspaceId: string;
  period: EngagementPeriodLike | null | undefined;
  financialYears: FinancialYearDomainModel[];
  suggestedMatch: FinancialYearDomainModel | null;
  onMigrated: () => void;
  onKeepLegacy: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<MigrationMode>(
    suggestedMatch ? 'link_existing' : 'create_and_link',
  );
  const [selectedYearId, setSelectedYearId] = useState<string>(
    suggestedMatch?.id ?? financialYears[0]?.id ?? '',
  );

  const dateRange = formatLegacyEngagementDateRange(period?.start_date, period?.end_date);
  const createCode =
    period?.end_date != null ? suggestedHistoricalYearCode(period.end_date) : '—';

  const migrate = useMutation({
    mutationFn: async () => {
      if (mode === 'keep_legacy') return { keep: true as const };
      return migrateLegacyReportingPeriod(companyId, {
        workspaceId,
        mode,
        financialYearId: mode === 'link_existing' ? selectedYearId : undefined,
      });
    },
    onSuccess: async (result) => {
      if (result && 'keep' in result) {
        onKeepLegacy();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['financial_years'] });
      await queryClient.invalidateQueries({ queryKey: ['efs_dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['efs_workspaces'] });
      await queryClient.invalidateQueries({ queryKey: ['efs_doc_model'] });
      showSuccess('Engagement linked to the Enterprise Financial Calendar');
      onMigrated();
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Migrate legacy engagement</DialogTitle>
          <DialogDescription>
            Choose how this engagement relates to the Enterprise Financial Calendar. Nothing is
            changed until you confirm. Journals and published PDFs are never modified.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CalendarRange className="h-4 w-4" />
            Engagement period
          </div>
          <div className="mt-1 tabular-nums text-muted-foreground">
            {dateRange || 'Dates unavailable'}
          </div>
        </div>

        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as MigrationMode)}
          className="space-y-3"
        >
          <label className="flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-muted/40">
            <RadioGroupItem value="create_and_link" id="mig-create" className="mt-1" />
            <div className="space-y-1">
              <Label htmlFor="mig-create" className="cursor-pointer font-medium">
                Create matching historical Financial Year
              </Label>
              <p className="text-xs text-muted-foreground">
                Adds {createCode}
                {dateRange ? ` (${dateRange})` : ''} to the calendar, then links this engagement.
                Does not rewrite other years or journal data.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-muted/40">
            <RadioGroupItem value="link_existing" id="mig-link" className="mt-1" />
            <div className="w-full space-y-2">
              <Label htmlFor="mig-link" className="cursor-pointer font-medium">
                Link to existing historical Financial Year
              </Label>
              <p className="text-xs text-muted-foreground">
                Bind this engagement to a year already on the calendar. Period labels sync from that
                year (calendar remains master).
              </p>
              {mode === 'link_existing' && (
                <Select value={selectedYearId} onValueChange={setSelectedYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Financial Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {financialYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {formatCalendarYearDisplay(y)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-muted/40">
            <RadioGroupItem value="keep_legacy" id="mig-keep" className="mt-1" />
            <div className="space-y-1">
              <Label htmlFor="mig-keep" className="cursor-pointer font-medium">
                Keep as legacy engagement
              </Label>
              <p className="text-xs text-muted-foreground">
                No automatic binding. The engagement stays unbound until you choose to migrate later.
              </p>
            </div>
          </label>
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              migrate.isPending ||
              (mode === 'link_existing' && !selectedYearId) ||
              (mode === 'create_and_link' && (!period?.start_date || !period?.end_date))
            }
            onClick={() => migrate.mutate()}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {migrate.isPending ? 'Working…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
