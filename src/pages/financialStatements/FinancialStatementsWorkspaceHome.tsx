import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import {
  ensureWorkspaceForFinancialYear,
  invokeFinancialStatements,
  type EfsWorkspaceListItem,
} from '../../lib/financialStatements/api';
import { resolveCalendarYearForWorkspace } from '../../lib/financialStatements/calendarYearBinding';
import { formatYearRange } from '../../lib/reportingPeriod/selection';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { showError } from '../../utils/toast';
import { ArrowRight, Loader2 } from 'lucide-react';

/**
 * Financial Statements — the way in.
 *
 * This page answers one question: what do I do to produce my Annual Financial
 * Statements? So it says which company and year it is about, whether the
 * statements exist yet, and offers the single action that follows. It used to
 * be a register of "engagements" which, for almost every company, was an empty
 * table telling the reader to go and do something in Settings.
 *
 * When the year's statements already exist the page does not ask again — it
 * opens them.
 */
export default function FinancialStatementsWorkspaceHome() {
  const { activeCompany } = useAuth();
  const {
    financialYears,
    activeFinancialYear,
    setFinancialYear,
    isLoading: calendarLoading,
  } = useReportingPeriod();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = activeCompany?.id;

  const workspacesQuery = useQuery({
    queryKey: ['efs_workspaces', companyId],
    queryFn: () => invokeFinancialStatements<EfsWorkspaceListItem[]>(companyId!, 'LIST_WORKSPACES'),
    enabled: !!companyId,
  });

  /** The statements for the year the header is in, if they have been started. */
  const forSelectedYear = useMemo(() => {
    if (!activeFinancialYear) return null;
    return (
      (workspacesQuery.data || []).find((ws) => {
        const year = resolveCalendarYearForWorkspace(ws, financialYears);
        const yearId = year?.id ?? ws.efs_reporting_periods?.financial_year_id ?? null;
        return yearId === activeFinancialYear.id;
      }) ?? null
    );
  }, [workspacesQuery.data, financialYears, activeFinancialYear]);

  // Already prepared: go straight in rather than showing a page about a page.
  useEffect(() => {
    if (forSelectedYear) {
      navigate(`/financial-statements-workspace/${forSelectedYear.id}`, { replace: true });
    }
  }, [forSelectedYear, navigate]);

  const prepare = useMutation({
    mutationFn: async () => {
      if (!companyId || !activeFinancialYear) throw new Error('Select a financial year first.');
      return ensureWorkspaceForFinancialYear(companyId, activeFinancialYear.id);
    },
    onSuccess: async (ensured) => {
      await queryClient.invalidateQueries({ queryKey: ['efs_workspaces', companyId] });
      navigate(`/financial-statements-workspace/${ensured.workspace.id}`);
    },
    onError: (e: unknown) => showError(e instanceof Error ? e.message : String(e)),
  });

  const loading = calendarLoading || workspacesQuery.isLoading;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Financial Statements
      </h1>
      <p className="mt-2 text-3xl font-semibold tracking-tight" data-testid="afs-context">
        {activeCompany?.name ?? 'Company'}
      </p>
      <p className="mt-1 text-lg text-muted-foreground">
        {loading
          ? 'Loading…'
          : activeFinancialYear
            ? `${activeFinancialYear.yearCode} · ${formatYearRange(activeFinancialYear)}`
            : 'No financial year yet'}
      </p>

      <div className="mt-10">
        {loading && <Skeleton className="h-11 w-72" />}

        {!loading && !activeFinancialYear && (
          <>
            <p className="mb-4 text-muted-foreground">
              Annual Financial Statements are prepared for a financial year. This company does not
              have one yet.
            </p>
            <Button asChild size="lg">
              <Link to="/settings?tab=accounting">Set up the financial year</Link>
            </Button>
          </>
        )}

        {!loading && activeFinancialYear && !forSelectedYear && (
          <>
            <p className="mb-4 text-muted-foreground">
              Your {activeFinancialYear.yearCode} statements have not been started. Preparing them
              builds the statements from your accounting records — nothing is posted to the ledger.
            </p>
            <Button
              size="lg"
              onClick={() => prepare.mutate()}
              disabled={prepare.isPending}
              data-testid="afs-prepare"
            >
              {prepare.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Prepare Financial Statements
              {!prepare.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </>
        )}

        {!loading && forSelectedYear && (
          <Button
            size="lg"
            onClick={() => navigate(`/financial-statements-workspace/${forSelectedYear.id}`)}
          >
            Open Financial Statements
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Earlier years, as plain links — not a register to be administered. */}
      {!loading && (workspacesQuery.data || []).length > 0 && (
        <div className="mt-12 border-t pt-6">
          <p className="mb-2 text-sm text-muted-foreground">Other years</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(workspacesQuery.data || [])
              .filter((ws) => ws.id !== forSelectedYear?.id)
              .map((ws) => {
                const year = resolveCalendarYearForWorkspace(ws, financialYears);
                // Changing the year changes it for the whole app, which then
                // opens that year's statements — rather than linking straight
                // to a document the header does not agree with.
                return year ? (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => setFinancialYear(year.id)}
                    className="text-sm underline underline-offset-4 hover:text-foreground"
                    data-testid="afs-other-year"
                  >
                    {year.yearCode}
                  </button>
                ) : (
                  <Link
                    key={ws.id}
                    to={`/financial-statements-workspace/${ws.id}`}
                    className="text-sm underline underline-offset-4 hover:text-foreground"
                    data-testid="afs-other-year"
                  >
                    {ws.efs_reporting_periods?.label || 'Earlier year'}
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
