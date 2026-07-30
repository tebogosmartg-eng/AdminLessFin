import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Download, ShieldCheck } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { loadVipFinalizedFacts, saTaxYearDateRange } from '../lib/vipReportSources';
import { saTaxYearStartYear } from '../lib/payrollMatrixEngine';
import {
  buildVipWorkingPaperFromFacts,
  createVipExportBranding,
  exportVipWorkingPaperAsync,
  listVipComponentCodes,
  renderVipIdentityRows,
  validateVipWorkingPaper,
  VIP_ANNUAL_TOTAL_COLUMN,
  VIP_ITEM_COLUMN,
  type VipExportFormat,
} from '../reporting/audit/VIP';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

function currentSaTaxYearStart(): number {
  return saTaxYearStartYear(new Date().toISOString().slice(0, 10));
}

function taxYearOptions(around: number): number[] {
  return [around - 1, around, around + 1];
}

const AuditComplianceReports = () => {
  useDocumentTitle('Audit & Compliance Reports');
  const { activeCompany, profile, user } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const companyId = activeCompany?.id;
  const companyName = identity?.name || 'Company';

  const [taxYearStartYear, setTaxYearStartYear] = useState(currentSaTaxYearStart);
  const [exportFormat, setExportFormat] = useState<VipExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => saTaxYearDateRange(taxYearStartYear), [taxYearStartYear]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vip_working_paper_facts', companyId, taxYearStartYear],
    queryFn: () =>
      loadVipFinalizedFacts(companyId!, {
        taxYearStartYear,
        startDate: range.start,
        endDate: range.end,
      }),
    enabled: !!companyId,
    retry: 1,
  });

  const report = useMemo(() => {
    if (!data?.facts?.length) return null;
    return buildVipWorkingPaperFromFacts(data.facts, { taxYearStartYear });
  }, [data, taxYearStartYear]);

  const validation = useMemo(
    () => (report ? validateVipWorkingPaper(report) : null),
    [report]
  );

  const generatedBy =
    profile?.full_name?.trim() || user?.email || 'AdminLess Fin User';

  const handleDownload = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const branding = createVipExportBranding({
        companyName,
        companyLogoUrl: activeCompany?.logo_url ?? null,
        financialYear: report.taxYearLabel,
        payrollPeriod: `${range.start} – ${range.end}`,
        generatedBy,
        report,
      });
      await exportVipWorkingPaperAsync(report, {
        format: exportFormat,
        fileBaseName: `AdminLess-Fin-VIP-Working-Paper-${report.taxYearLabel.replace(/\s+/g, '-')}`,
        branding,
      });
    } finally {
      setExporting(false);
    }
  };

  const yearChoices = taxYearOptions(currentSaTaxYearStart());
  const componentCount = listVipComponentCodes().length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit &amp; Compliance Reports</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Dedicated audit &amp; compliance reporting family. Primary report: Enterprise VIP Payroll
            Working Paper — employee-first annual evidence for external audit, AGSA, SARS, and
            financial statements. Independent of Payroll Reports (Operational / Management /
            Statutory).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(taxYearStartYear)}
            onValueChange={(v) => setTaxYearStartYear(Number(v))}
          >
            <SelectTrigger className="w-[200px]" aria-label="Tax year">
              <SelectValue placeholder="Tax year" />
            </SelectTrigger>
            <SelectContent>
              {yearChoices.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  Tax Year {y}/{String(y + 1).slice(-2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={exportFormat}
            onValueChange={(v) => setExportFormat(v as VipExportFormat)}
          >
            <SelectTrigger className="w-[120px]" aria-label="Export format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => void handleDownload()}
            disabled={!report?.employees.length || exporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Exporting…' : 'Download'}
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Source boundary</AlertTitle>
        <AlertDescription>
          Finalized / paid payroll runs only ({range.start} – {range.end}). Consumes immutable
          Payroll Facts exclusively — never recalculates PAYE, UIF, SDL, Net Pay, or Cost to
          Company. Management Matrix and Payroll Register remain separate.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tax year</CardDescription>
            <CardTitle className="text-xl">
              {report?.taxYearLabel ??
                `Tax Year ${taxYearStartYear}/${String(taxYearStartYear + 1).slice(-2)}`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Employees</CardDescription>
            <CardTitle className="text-xl">{report?.employeeCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Finalized runs</CardDescription>
            <CardTitle className="text-xl">{data?.runCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Validation</CardDescription>
            <CardTitle className="text-xl">
              {validation ? (validation.ok ? 'Pass' : `${validation.issues.length} issue(s)`) : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enterprise VIP Payroll Working Paper</CardTitle>
          <CardDescription>
            Per-employee audit sections · {componentCount} payroll components · March–February +
            Annual Total · Classification: CONFIDENTIAL
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">
              {error instanceof Error ? error.message : 'Failed to load finalized payroll sources.'}
            </p>
          ) : !report?.employees.length ? (
            <p className="text-muted-foreground text-sm">
              No finalized payroll data for this tax year.
            </p>
          ) : (
            <div className="space-y-10 max-h-[70vh] overflow-auto pr-1">
              {report.employees.map((emp) => (
                <section
                  key={emp.identity.employeeNumber}
                  className="rounded-md border bg-background"
                  aria-label={`Employee ${emp.identity.employeeNumber}`}
                >
                  <div className="border-b bg-muted/40 px-4 py-3">
                    <h2 className="mb-3 text-sm font-semibold tracking-wide">EMPLOYEE INFORMATION</h2>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {renderVipIdentityRows(emp.identity).map((row) => (
                        <div key={row.label}>
                          <dt className="text-muted-foreground">{row.label}</dt>
                          <dd className="font-medium">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="space-y-6 p-4">
                    {emp.blocks
                      .filter((b) => b.id !== 'employee_information')
                      .map((block) => (
                        <div key={block.id}>
                          <h3 className="mb-2 text-sm font-semibold tracking-wide">{block.title}</h3>
                          <div className="overflow-auto rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="whitespace-nowrap">{VIP_ITEM_COLUMN}</TableHead>
                                  {report.monthColumns.map((col) => (
                                    <TableHead key={col} className="whitespace-nowrap text-right">
                                      {col}
                                    </TableHead>
                                  ))}
                                  <TableHead className="whitespace-nowrap text-right">
                                    {VIP_ANNUAL_TOTAL_COLUMN}
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {block.lines.map((line) => (
                                  <TableRow key={line.code}>
                                    <TableCell
                                      className={cn(
                                        'whitespace-nowrap',
                                        line.emphasis && 'font-semibold'
                                      )}
                                    >
                                      {line.label}
                                    </TableCell>
                                    {report.monthColumns.map((col) => (
                                      <TableCell
                                        key={col}
                                        className="whitespace-nowrap text-right tabular-nums"
                                      >
                                        {formatCurrency(line.months[col] ?? 0)}
                                      </TableCell>
                                    ))}
                                    <TableCell
                                      className={cn(
                                        'whitespace-nowrap text-right tabular-nums font-medium',
                                        line.emphasis === 'grand_total' && 'font-semibold'
                                      )}
                                    >
                                      {formatCurrency(line.annualTotal)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditComplianceReports;
