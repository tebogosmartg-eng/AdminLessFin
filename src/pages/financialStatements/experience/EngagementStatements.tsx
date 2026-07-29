import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  invokeFinancialStatements,
  type EfsWorkspaceGeneralInformation,
  type EfsStatementInstance,
} from '../../../lib/financialStatements/api';
import { statementTitle } from '../../../lib/financialStatements/presentation';
import { corporateDisplayFromEntity } from '../../../lib/financialStatements/corporateInformation/accessors';
import {
  GENERATION_COPY,
  resolveGenerationMode,
} from '../../../lib/financialStatements/generationExperience';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Skeleton } from '../../../components/ui/skeleton';
import { cn, formatCurrency } from '../../../lib/utils';
import { FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';

/**
 * V6.10.1 Financial Statements workspace — accountant generation experience.
 * Generate / Refresh orchestrate certified APIs silently via parent callbacks.
 * Never exposes Reporting Snapshot / version / lineage terminology.
 */
export default function WorkspaceStatements({
  companyId,
  workspaceId,
  generalInfo,
  periodLabel,
  onGenerate,
  onRefresh,
  preparing = false,
  accountingChanged = false,
  onOpenSupportingSchedules,
  onOpenReviewNotes,
  onOpenPublication,
}: {
  companyId: string;
  workspaceId: string;
  generalInfo?: EfsWorkspaceGeneralInformation | null;
  periodLabel?: string | null;
  onGenerate?: () => void;
  onRefresh?: () => void;
  preparing?: boolean;
  /** Platform-detected: journals after last statement preparation */
  accountingChanged?: boolean;
  onOpenSupportingSchedules?: () => void;
  onOpenReviewNotes?: () => void;
  onOpenPublication?: () => void;
}) {
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const [viewWhileRefreshPending, setViewWhileRefreshPending] = useState(false);

  const statementsQuery = useQuery({
    queryKey: ['efs_statements', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<{ statements: EfsStatementInstance[] }>(
        companyId,
        'GET_STATEMENTS',
        { workspace_id: workspaceId },
      ),
  });

  if (statementsQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const statements = statementsQuery.data?.statements || [];
  const corporateDisplay = corporateDisplayFromEntity(generalInfo);
  const companyName = corporateDisplay.registeredName || corporateDisplay.tradingName || 'Annual Financial Statements';

  const mode = resolveGenerationMode({
    hasStatements: statements.length > 0,
    accountingChanged: accountingChanged && !refreshDismissed,
  });

  if (mode === 'generate_required') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annual Financial Statements</CardTitle>
          <CardDescription>{GENERATION_COPY.notPrepared}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled={preparing || !onGenerate} onClick={() => onGenerate?.()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {preparing ? GENERATION_COPY.preparingGenerate : GENERATION_COPY.generateAction}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === 'refresh_required' && !viewWhileRefreshPending) {
    return (
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="text-base">Annual Financial Statements</CardTitle>
          <CardDescription className="space-y-2 text-amber-950 dark:text-amber-100">
            <span className="block">{GENERATION_COPY.alreadyPrepared}</span>
            <span className="block">{GENERATION_COPY.accountingChanged}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={preparing || !onRefresh} onClick={() => onRefresh?.()}>
            <RefreshCw className={cn('mr-2 h-4 w-4', preparing && 'animate-spin')} />
            {preparing ? GENERATION_COPY.preparingRefresh : GENERATION_COPY.refreshAction}
          </Button>
          <Button
            variant="outline"
            disabled={preparing}
            onClick={() => setRefreshDismissed(true)}
          >
            {GENERATION_COPY.cancelAction}
          </Button>
          <Button
            variant="ghost"
            disabled={preparing}
            onClick={() => setViewWhileRefreshPending(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            {GENERATION_COPY.viewAction}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {mode === 'up_to_date' && (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">{GENERATION_COPY.upToDate}</p>
        </div>
      )}

      {mode === 'refresh_required' && viewWhileRefreshPending && (
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-950 dark:text-amber-100">
              {GENERATION_COPY.requireRefresh}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={preparing || !onRefresh} onClick={() => onRefresh?.()}>
                <RefreshCw className={cn('mr-2 h-4 w-4', preparing && 'animate-spin')} />
                {preparing ? GENERATION_COPY.preparingRefresh : GENERATION_COPY.refreshAction}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={preparing}
                onClick={() => setRefreshDismissed(true)}
              >
                {GENERATION_COPY.cancelAction}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="rounded-md border bg-background p-6 text-center sm:flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{companyName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Annual Financial Statements</p>
          {periodLabel && <p className="text-sm text-muted-foreground">{periodLabel}</p>}
          {corporateDisplay.reportingFramework && (
            <p className="mt-1 text-xs text-muted-foreground">{corporateDisplay.reportingFramework}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {onOpenSupportingSchedules && (
          <Button variant="outline" size="sm" onClick={onOpenSupportingSchedules}>
            {GENERATION_COPY.openSchedules}
          </Button>
        )}
        {onOpenReviewNotes && (
          <Button variant="outline" size="sm" onClick={onOpenReviewNotes}>
            {GENERATION_COPY.reviewNotes}
          </Button>
        )}
        {onOpenPublication && (
          <>
            <Button variant="outline" size="sm" onClick={onOpenPublication}>
              {GENERATION_COPY.downloadPdf}
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenPublication}>
              {GENERATION_COPY.downloadWord}
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenPublication}>
              {GENERATION_COPY.downloadExcel}
            </Button>
          </>
        )}
      </div>

      <Tabs defaultValue={statements[0].statement_type}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {statements.map((s) => (
            <TabsTrigger key={s.statement_type} value={s.statement_type} className="text-xs">
              {statementTitle(s.statement_type, s.title)}
            </TabsTrigger>
          ))}
        </TabsList>
        {statements.map((s) => (
          <TabsContent key={s.statement_type} value={s.statement_type} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {statementTitle(s.statement_type, s.title)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.lines || []).map((ln, idx) => (
                        <tr
                          key={`${ln.line_code}-${idx}`}
                          className={cn(
                            'border-b last:border-0',
                            ln.is_total && 'bg-muted/20 font-semibold',
                          )}
                        >
                          <td className="px-3 py-2">{ln.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(ln.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
