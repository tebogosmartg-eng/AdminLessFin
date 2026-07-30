import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import { loadPayrollFacts } from '../reporting/facts';
import { buildOperationalReportsFromFacts } from '../reporting/operational/PayrollRegister';
import { buildManagementReportsFromFacts } from '../reporting/management';
import {
  downloadReportCsv,
  PAYROLL_REPORT_CATALOG,
  type PayrollReportType,
  type PayrollPeriodReports,
} from '../lib/payrollReports';
import {
  MANAGEMENT_REPORT_CATALOG,
  STATUTORY_REPORT_CATALOG,
  managementReportToRows,
  statutoryReportToRows,
  type ManagementReportId,
  type ManagementReportsBundle,
  type ReportCategory,
  type StatutoryReportId,
} from '../lib/payrollManagementReports';
import {
  exportPayrollReportRows,
  type PayrollExportFormat,
} from '../lib/payrollReportExport';
import { buildReportId } from '../reporting/export';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  operational: 'Operational',
  management: 'Management',
  statutory: 'Statutory',
};

const PayrollReports = () => {
  useDocumentTitle('Payroll Reports');
  const { activeCompany, profile, user } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const { dateFrom, dateTo, isReady, currentReportingPeriod } = useReportingPeriod();
  const [category, setCategory] = useState<ReportCategory>('operational');
  const [activeTab, setActiveTab] = useState<PayrollReportType>('register');
  const [managementTab, setManagementTab] = useState<ManagementReportId>('payroll_matrix');
  const [statutoryTab, setStatutoryTab] = useState<StatutoryReportId>('paye_summary');
  const [exportFormat, setExportFormat] = useState<PayrollExportFormat>('csv');

  const startStr = dateFrom ?? '';
  const endStr = dateTo ?? '';
  const fromDate = currentReportingPeriod?.from ?? new Date();
  const toDate = currentReportingPeriod?.to ?? new Date();

  const companyId = activeCompany?.id;
  const companyName = identity?.name || 'Company';
  const generatedBy =
    profile?.full_name?.trim() || user?.email || 'AdminLess Fin User';

  const { data: periodData, isLoading } = useQuery({
    queryKey: ['payroll_facts_reports', companyId, startStr, endStr],
    queryFn: () =>
      loadPayrollFacts({
        companyId: companyId!,
        startDate: startStr,
        endDate: endStr,
      }),
    enabled: !!companyId && isReady,
    retry: 1,
  });

  const reports: PayrollPeriodReports | null = useMemo(() => {
    if (!periodData?.facts?.length) return null;
    return buildOperationalReportsFromFacts(periodData.facts, { start: startStr, end: endStr });
  }, [periodData, startStr, endStr]);

  const management: ManagementReportsBundle | null = useMemo(() => {
    if (!periodData?.facts?.length) return null;
    return buildManagementReportsFromFacts(periodData.facts, { companyName });
  }, [periodData, companyName]);

  const periodLabel = `${startStr}_to_${endStr}`;

  const handleCategoryChange = (next: string) => {
    const value = next as ReportCategory;
    setCategory(value);
    if (value === 'operational') setActiveTab('register');
    if (value === 'management') setManagementTab('payroll_matrix');
    if (value === 'statutory') setStatutoryTab('paye_summary');
  };

  const handleDownload = () => {
    const period = `${format(fromDate, 'PPP')} – ${format(toDate, 'PPP')}`;

    if (category === 'operational') {
      if (!reports) return;
      if (exportFormat === 'csv') {
        downloadReportCsv(activeTab, reports, periodLabel);
        return;
      }
      const catalog = PAYROLL_REPORT_CATALOG.find((r) => r.id === activeTab);
      const title = catalog?.label ?? 'Payroll Report';
      const rows = operationalRows(activeTab, reports);
      exportPayrollReportRows(rows, {
        format: exportFormat,
        fileBaseName: `AdminLess-Fin-payroll-${activeTab}-${periodLabel}`,
        branding: {
          companyName,
          companyLogoUrl: activeCompany?.logo_url ?? null,
          reportTitle: title,
          period,
          generatedBy,
          reportId: buildReportId(`payroll.operational.${activeTab}`),
        },
      });
      return;
    }

    if (!management) return;

    if (category === 'management') {
      const catalog = MANAGEMENT_REPORT_CATALOG.find((r) => r.id === managementTab);
      const title = catalog?.label ?? 'Management Report';
      const rows = managementReportToRows(managementTab, management);
      exportPayrollReportRows(rows, {
        format: exportFormat,
        fileBaseName: `AdminLess-Fin-payroll-${managementTab}-${management.taxYearLabel.replace(/\s+/g, '-')}`,
        branding: {
          companyName,
          companyLogoUrl: activeCompany?.logo_url ?? null,
          reportTitle: title,
          financialYear: management.taxYearLabel,
          period: `${management.taxYearLabel} - Finalized runs only`,
          generatedBy,
          reportId: buildReportId(`payroll.management.${managementTab}`, management.taxYearLabel),
        },
      });
      return;
    }

    const catalog = STATUTORY_REPORT_CATALOG.find((r) => r.id === statutoryTab);
    const title = catalog?.label ?? 'Statutory Report';
    const rows = statutoryReportToRows(statutoryTab, management);
    exportPayrollReportRows(rows, {
      format: exportFormat,
      fileBaseName: `AdminLess-Fin-payroll-${statutoryTab}-${periodLabel}`,
      branding: {
        companyName,
        companyLogoUrl: activeCompany?.logo_url ?? null,
        reportTitle: title,
        period: `${period} - Finalized snapshots`,
        generatedBy,
        reportId: buildReportId(`payroll.statutory.${statutoryTab}`),
      },
    });
  };

  const renderLineItems = (items: { description: string; amount: number }[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.description}>
            <TableCell>{item.description}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const renderMatrix = () => {
    if (!management) return null;
    const matrix = management.payrollMatrix;
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10">Payroll Item</TableHead>
              {matrix.columns.map((col) => (
                <TableHead key={col} className="text-right whitespace-nowrap">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.metrics.map((metric) => (
              <TableRow key={metric}>
                <TableCell className="sticky left-0 bg-background z-10 font-medium">
                  {matrix.rowLabels[metric]}
                </TableCell>
                {matrix.columns.map((col) => (
                  <TableCell key={col} className="text-right font-mono whitespace-nowrap">
                    {formatCurrency(matrix.cells[metric][col] ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const hasOperationalData = !!reports && reports.register.length > 0;
  const hasManagementData = !!management && management.payrollMatrix.factCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-3xl font-bold">Payroll Reports</h1>
          <p className="text-muted-foreground text-sm">
            Operational, management matrix, and statutory reporting — finalized payroll only
          </p>
        </div>
        <ReportingPeriodPicker />
      </div>

      {reports && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="p-3"><CardDescription className="text-xs">Gross Pay</CardDescription><CardTitle className="text-lg font-mono">{formatCurrency(reports.totals.gross_pay)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3"><CardDescription className="text-xs">Net Pay</CardDescription><CardTitle className="text-lg font-mono">{formatCurrency(reports.totals.net_pay)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3"><CardDescription className="text-xs">PAYE</CardDescription><CardTitle className="text-lg font-mono">{formatCurrency(reports.totals.paye)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3"><CardDescription className="text-xs">Cost to Company</CardDescription><CardTitle className="text-lg font-mono">{formatCurrency(reports.totals.cost_to_company)}</CardTitle></CardHeader></Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>
              {category === 'operational' && PAYROLL_REPORT_CATALOG.find((r) => r.id === activeTab)?.label}
              {category === 'management' && MANAGEMENT_REPORT_CATALOG.find((r) => r.id === managementTab)?.label}
              {category === 'statutory' && STATUTORY_REPORT_CATALOG.find((r) => r.id === statutoryTab)?.label}
            </CardTitle>
            <CardDescription>
              {format(fromDate, 'PPP')} – {format(toDate, 'PPP')}
              {periodData?.runCount != null && ` · ${periodData.runCount} finalized run(s)`}
              {management?.taxYearLabel && category === 'management' && ` · ${management.taxYearLabel}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CATEGORY_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as PayrollExportFormat)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={category === 'operational' ? !reports : !management}
            >
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {category === 'operational' && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PayrollReportType)}>
              <TabsList className="flex flex-wrap h-auto gap-1">
                {PAYROLL_REPORT_CATALOG.map((r) => (
                  <TabsTrigger key={r.id} value={r.id} className="text-xs sm:text-sm">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {isLoading ? (
                <Skeleton className="h-64 w-full mt-4" />
              ) : !hasOperationalData ? (
                <p className="text-center text-muted-foreground py-12">No finalized payroll data for the selected period.</p>
              ) : (
                <>
                  <TabsContent value="register" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp. No.</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">PAYE</TableHead>
                          <TableHead className="text-right">UIF</TableHead>
                          <TableHead className="text-right">SDL</TableHead>
                          <TableHead className="text-right">Employer</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">CTC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports!.register.map((r, idx) => (
                          <TableRow key={`${r.employee_number ?? 'emp'}-${r.employee}-${r.status}-${idx}`}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{r.employee_number ?? '—'}</TableCell>
                            <TableCell>{r.employee}</TableCell>
                            <TableCell>{r.department}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.gross_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.paye)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.uif)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.sdl)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.employer_contributions)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.net_salary)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.cost_to_company)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="font-bold">
                          <TableCell colSpan={3}>Totals ({reports!.totals.employees} employees)</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.gross_pay)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.paye)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.uif)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.sdl)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.employer_contributions)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.net_pay)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(reports!.totals.cost_to_company)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </TabsContent>

                  <TabsContent value="earnings" className="mt-4">{renderLineItems(reports!.earnings)}</TabsContent>
                  <TabsContent value="deductions" className="mt-4">{renderLineItems(reports!.deductions)}</TabsContent>
                  <TabsContent value="employer_contributions" className="mt-4">{renderLineItems(reports!.employer_contributions)}</TabsContent>
                  <TabsContent value="uif_summary" className="mt-4">{renderLineItems(reports!.uif_summary)}</TabsContent>
                  <TabsContent value="paye_summary" className="mt-4">{renderLineItems(reports!.paye_summary)}</TabsContent>

                  <TabsContent value="employee_cost" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Cost to Company</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports!.employee_cost.map((r, idx) => (
                          <TableRow key={`${r.employee}-${r.department}-${idx}`}>
                            <TableCell>{r.employee}</TableCell>
                            <TableCell>{r.department}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </>
              )}
            </Tabs>
          )}

          {category === 'management' && (
            <Tabs value={managementTab} onValueChange={(v) => setManagementTab(v as ManagementReportId)}>
              <TabsList className="flex flex-wrap h-auto gap-1">
                {MANAGEMENT_REPORT_CATALOG.map((r) => (
                  <TabsTrigger key={r.id} value={r.id} className="text-xs sm:text-sm">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {isLoading ? (
                <Skeleton className="h-64 w-full mt-4" />
              ) : !hasManagementData ? (
                <p className="text-center text-muted-foreground py-12">
                  No finalized payroll facts for management matrix in the selected period.
                </p>
              ) : (
                <>
                  <TabsContent value="payroll_matrix" className="mt-4">{renderMatrix()}</TabsContent>

                  <TabsContent value="monthly_analysis" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">PAYE</TableHead>
                          <TableHead className="text-right">UIF</TableHead>
                          <TableHead className="text-right">SDL</TableHead>
                          <TableHead className="text-right">Employer</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">CTC</TableHead>
                          <TableHead className="text-right">Emps</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {management!.monthlyAnalysis.map((r) => (
                          <TableRow key={r.month}>
                            <TableCell>{r.month}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.gross_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.paye)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.uif_employee)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.sdl)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.employer_contributions)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.net_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.cost_to_company)}</TableCell>
                            <TableCell className="text-right font-mono">{r.employees}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="department_analysis" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">PAYE</TableHead>
                          <TableHead className="text-right">UIF</TableHead>
                          <TableHead className="text-right">SDL</TableHead>
                          <TableHead className="text-right">Employer</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">CTC</TableHead>
                          <TableHead className="text-right">Emps</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {management!.departmentAnalysis.map((r) => (
                          <TableRow key={r.dimension}>
                            <TableCell>{r.dimension}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.gross_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.paye)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.uif)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.sdl)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.employer_contributions)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.net_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.cost_to_company)}</TableCell>
                            <TableCell className="text-right font-mono">{r.employees}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="cost_centre_analysis" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cost Centre</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">PAYE</TableHead>
                          <TableHead className="text-right">UIF</TableHead>
                          <TableHead className="text-right">SDL</TableHead>
                          <TableHead className="text-right">Employer</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">CTC</TableHead>
                          <TableHead className="text-right">Emps</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {management!.costCentreAnalysis.map((r) => (
                          <TableRow key={r.dimension}>
                            <TableCell>{r.dimension}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.gross_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.paye)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.uif)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.sdl)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.employer_contributions)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.net_pay)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.cost_to_company)}</TableCell>
                            <TableCell className="text-right font-mono">{r.employees}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="payroll_variance" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead className="text-right">Variance %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {management!.variance.map((r, idx) => (
                          <TableRow key={`${r.metric}-${r.column}-${idx}`}>
                            <TableCell>{r.metric}</TableCell>
                            <TableCell>{r.column}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(r.amount)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {r.variance == null ? '—' : formatCurrency(r.variance)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {r.variance_pct == null ? '—' : `${r.variance_pct.toFixed(1)}%`}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </>
              )}
            </Tabs>
          )}

          {category === 'statutory' && (
            <Tabs value={statutoryTab} onValueChange={(v) => setStatutoryTab(v as StatutoryReportId)}>
              <TabsList className="flex flex-wrap h-auto gap-1">
                {STATUTORY_REPORT_CATALOG.map((r) => (
                  <TabsTrigger key={r.id} value={r.id} className="text-xs sm:text-sm">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {isLoading ? (
                <Skeleton className="h-64 w-full mt-4" />
              ) : !hasManagementData ? (
                <p className="text-center text-muted-foreground py-12">No finalized statutory totals for the selected period.</p>
              ) : (
                <>
                  {(Object.keys(management!.statutory) as StatutoryReportId[]).map((id) => (
                    <TabsContent key={id} value={id} className="mt-4">
                      {renderLineItems(management!.statutory[id])}
                    </TabsContent>
                  ))}
                </>
              )}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function operationalRows(
  reportType: PayrollReportType,
  reports: PayrollPeriodReports
): Record<string, string | number>[] {
  switch (reportType) {
    case 'register':
      return reports.register.map((r) => ({
        'Employee Number': r.employee_number ?? '',
        Employee: r.employee,
        Department: r.department,
        'Gross Pay': Number(r.gross_pay.toFixed(2)),
        Deductions: Number(r.deductions.toFixed(2)),
        PAYE: Number(r.paye.toFixed(2)),
        UIF: Number(r.uif.toFixed(2)),
        SDL: Number(r.sdl.toFixed(2)),
        'Employer Contributions': Number(r.employer_contributions.toFixed(2)),
        'Net Salary': Number(r.net_salary.toFixed(2)),
        'Cost to Company': Number(r.cost_to_company.toFixed(2)),
        Status: r.status,
      }));
    case 'earnings':
      return reports.earnings.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'deductions':
      return reports.deductions.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'employer_contributions':
      return reports.employer_contributions.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'uif_summary':
      return reports.uif_summary.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'paye_summary':
      return reports.paye_summary.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'employee_cost':
      return reports.employee_cost.map((r) => ({
        Employee: r.employee,
        Department: r.department,
        'Cost to Company': Number(r.amount.toFixed(2)),
      }));
    default:
      return [];
  }
}

export default PayrollReports;
