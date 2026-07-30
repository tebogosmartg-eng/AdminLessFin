import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import {
  invokeFinancialStatements,
  type EfsWorkspaceListItem,
} from '../../lib/financialStatements/api';
import { workspaceStatusLabel } from '../../lib/financialStatements/presentation';
import {
  formatCalendarYearDisplay,
  resolveCalendarYearForWorkspace,
  resolveEngagementReportingPeriod,
} from '../../lib/financialStatements/calendarYearBinding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { FileSignature } from 'lucide-react';

/**
 * Financial Statements module landing — engagement list.
 * Financial Year labels come from ReportingPeriodContext (Settings calendar only).
 */
export default function FinancialStatementsWorkspaceHome() {
  const { activeCompany } = useAuth();
  const { financialYears, activeFinancialYear } = useReportingPeriod();
  const navigate = useNavigate();
  const companyId = activeCompany?.id;

  const workspacesQuery = useQuery({
    queryKey: ['efs_workspaces', companyId],
    queryFn: () => invokeFinancialStatements<EfsWorkspaceListItem[]>(companyId!, 'LIST_WORKSPACES'),
    enabled: !!companyId,
  });

  const rows = useMemo(() => {
    const years = financialYears;
    const workspaces = workspacesQuery.data || [];
    return workspaces.map((ws) => {
      const calendarYear = resolveCalendarYearForWorkspace(ws, years);
      const resolved = resolveEngagementReportingPeriod(
        ws.efs_reporting_periods,
        years,
        activeFinancialYear,
      );
      const framework =
        ws.efs_framework_bindings?.efs_framework_packs?.efs_frameworks?.name ||
        ws.efs_framework_bindings?.efs_framework_packs?.label ||
        '—';
      // Never fall back to frozen efs_reporting_periods.label (e.g. "Financial Year 2025/26").
      const yearLabel = calendarYear
        ? formatCalendarYearDisplay(calendarYear)
        : resolved.displayLabel;
      return {
        workspace: ws,
        financialYear: yearLabel,
        isHistorical: resolved.isHistorical,
        isLegacyUnbound: resolved.isLegacyUnbound,
        framework,
        status: workspaceStatusLabel(ws.status),
        progress: Number(ws.progress_pct || 0),
        updatedAt: ws.updated_at,
      };
    });
  }, [workspacesQuery.data, financialYears, activeFinancialYear]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileSignature className="h-6 w-6" />
            Financial Statements
          </h1>
          <p className="text-sm text-muted-foreground">
            Prepare Annual Financial Statements engagements. Live operational reports remain under
            Reports.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Engagements</CardTitle>
          <CardDescription>
            One engagement per Enterprise Financial Calendar year. Selecting a row opens the
            existing engagement.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {workspacesQuery.isLoading && (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {workspacesQuery.isError && (
            <p className="p-4 text-sm text-destructive">
              {(workspacesQuery.error as Error).message}
            </p>
          )}
          {!workspacesQuery.isLoading && rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No engagements yet. Open Financial Statements from the current Financial Year in
              Settings, or create an engagement for a calendar year from the Financial Statements
              home once a year is selected.
            </p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Financial Year</th>
                    <th className="px-4 py-3 font-medium">Reporting Framework</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.workspace.id}
                      className="cursor-pointer border-b transition-colors hover:bg-muted/40"
                      onClick={() =>
                        navigate(`/financial-statements-workspace/${row.workspace.id}`)
                      }
                    >
                      <td className="px-4 py-3 font-medium">
                        {row.isLegacyUnbound ? (
                          <>
                            Legacy Financial Statement Engagement
                            <span className="mt-0.5 block text-xs font-normal text-amber-800 dark:text-amber-300">
                              {row.financialYear.includes('·')
                                ? row.financialYear.split('·').slice(1).join('·').trim()
                                : 'Not linked to Enterprise Financial Calendar'}
                              {' · open to migrate'}
                            </span>
                          </>
                        ) : (
                          <>
                            {row.financialYear}
                            {row.isHistorical ? (
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                Not current Financial Year
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.framework}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{row.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.progress.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.updatedAt
                          ? format(new Date(row.updatedAt), 'dd MMM yyyy HH:mm')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
