import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { FileCheck2, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import {
  STATUTORY_RETURNS_CATALOGUE,
  generateStatutoryReturn,
  getReturnCatalogue,
  type StatutoryReturn,
} from '../lib/statutoryReturns';
import { loadFinalizedPayrollSources } from '../lib/statutoryReturns/loadFinalizedSources';

type CatalogueTab = (typeof STATUTORY_RETURNS_CATALOGUE)[number]['id'];

const StatutoryReturns = () => {
  useDocumentTitle('Statutory Returns');
  const { activeCompany, user } = useAuth();
  const companyId = activeCompany?.id;
  const { dateFrom, dateTo, isReady, currentReportingPeriod } = useReportingPeriod();
  const [activeTab, setActiveTab] = useState<CatalogueTab>('EMP201');
  const [generated, setGenerated] = useState<StatutoryReturn | null>(null);
  const [history, setHistory] = useState<StatutoryReturn[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStr = dateFrom ?? '';
  const endStr = dateTo ?? '';

  const { data: sources, isLoading } = useQuery({
    queryKey: ['statutory_return_sources', companyId, startStr, endStr],
    queryFn: () => loadFinalizedPayrollSources(companyId!, { startDate: startStr, endDate: endStr }),
    enabled: !!companyId && isReady,
    retry: 1,
  });

  const packages = useMemo(() => getReturnCatalogue('ZA'), []);

  const taxYearGuess = useMemo(() => {
    const fromSnapshot = sources?.find((r) => r.taxYear)?.taxYear;
    if (fromSnapshot) return fromSnapshot;
    const d = currentReportingPeriod?.from ?? new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }, [sources, currentReportingPeriod]);

  const handleGenerate = async (returnType: string) => {
    if (!sources?.length) {
      setError('No finalized payroll runs in the selected period. Statutory returns consume finalized payroll only.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = generateStatutoryReturn('ZA', returnType, {
        taxYear: taxYearGuess,
        runs: sources,
        generatedBy: user?.id ?? null,
        periodStart: startStr,
        periodEnd: endStr,
      });
      setGenerated(result);
      setHistory((prev) => [result, ...prev]);
      if (returnType === 'EMP201' || returnType === 'EMP501' || returnType === 'IRP5' || returnType === 'TAX_CERTIFICATE') {
        setActiveTab(returnType as CatalogueTab);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate statutory return');
    } finally {
      setGenerating(false);
    }
  };

  const totals = generated?.declarationData?.totals as
    | { paye?: number; uifTotal?: number; sdl?: number; grossRemuneration?: number; employeeCount?: number }
    | undefined;
  const reconciliation = generated?.declarationData?.reconciliation as
    | { payeDeclared?: number; uifTotalDeclared?: number; sdlDeclared?: number; employeeCount?: number }
    | undefined;
  const certificates = generated?.declarationData?.certificates as
    | Array<{ employeeName: string; amounts: Array<{ code: string; amount: number }> }>
    | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-3xl font-bold">Statutory Returns</h1>
          <p className="text-muted-foreground text-sm">
            Government declarations from finalized payroll — never recalculated
          </p>
        </div>
        <ReportingPeriodPicker />
      </div>

      <Alert>
        <FileCheck2 className="h-4 w-4" />
        <AlertTitle>Source boundary</AlertTitle>
        <AlertDescription>
          Payroll Engine → Finalized Payroll Run → Statutory Returns. Internal Payroll Reports remain separate.
          {sources ? ` ${sources.length} finalized run(s) loaded for ${taxYearGuess}.` : null}
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Generation blocked</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {packages.map((pkg) => (
          <Card key={pkg.returnType}>
            <CardHeader className="p-4">
              <CardTitle className="text-base">{pkg.label}</CardTitle>
              <CardDescription className="text-xs">{pkg.description}</CardDescription>
              <Button
                className="mt-3"
                size="sm"
                disabled={generating || isLoading}
                onClick={() => handleGenerate(pkg.returnType)}
              >
                Generate
              </Button>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Return workspace</CardTitle>
          <CardDescription>
            EMP201 · EMP501 · IRP5 · Tax Certificates · Submission History · Validation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CatalogueTab)}>
              <TabsList className="flex flex-wrap h-auto gap-1">
                {STATUTORY_RETURNS_CATALOGUE.map((item) => (
                  <TabsTrigger key={item.id} value={item.id} className="text-xs sm:text-sm">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="EMP201" className="mt-4 space-y-3">
                {generated?.returnType === 'EMP201' && totals ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant={generated.validationResult.ok ? 'default' : 'destructive'}>
                        {generated.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{generated.id}</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>PAYE</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(totals.paye ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>UIF Total</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(totals.uifTotal ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>SDL</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(totals.sdl ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Gross remuneration</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(totals.grossRemuneration ?? 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate EMP201 for the selected period.</p>
                )}
              </TabsContent>

              <TabsContent value="EMP501" className="mt-4 space-y-3">
                {generated?.returnType === 'EMP501' && reconciliation ? (
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell>PAYE declared</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(reconciliation.payeDeclared ?? 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>UIF declared</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(reconciliation.uifTotalDeclared ?? 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>SDL declared</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(reconciliation.sdlDeclared ?? 0)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Employees</TableCell>
                        <TableCell className="text-right font-mono">{reconciliation.employeeCount ?? 0}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate EMP501 from finalized tax-year runs.</p>
                )}
              </TabsContent>

              <TabsContent value="IRP5" className="mt-4">
                {generated?.returnType === 'IRP5' && certificates ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Codes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((c) => (
                        <TableRow key={c.employeeName}>
                          <TableCell>{c.employeeName}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.amounts.map((a) => `${a.code}:${formatCurrency(a.amount)}`).join(' · ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate IRP5 certificates from finalized payroll.</p>
                )}
              </TabsContent>

              <TabsContent value="TAX_CERTIFICATE" className="mt-4">
                {generated?.returnType === 'TAX_CERTIFICATE' ? (
                  <pre className="text-xs overflow-auto max-h-80 rounded-md bg-muted p-3">
                    {JSON.stringify(generated.declarationData, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate a tax certificate view for employees.</p>
                )}
              </TabsContent>

              <TabsContent value="SUBMISSION_HISTORY" className="mt-4">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No returns generated in this session yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Tax year</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Generated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{h.returnType}</TableCell>
                          <TableCell>{h.taxYear}</TableCell>
                          <TableCell>
                            <Badge variant={h.validationResult.ok ? 'default' : 'secondary'}>{h.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{h.generatedAt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="VALIDATION" className="mt-4">
                {generated ? (
                  <div className="space-y-2">
                    <Badge variant={generated.validationResult.ok ? 'default' : 'destructive'}>
                      {generated.validationResult.ok ? 'Passed' : 'Failed'}
                    </Badge>
                    {generated.validationResult.issues.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No validation issues.</p>
                    ) : (
                      <ul className="space-y-2">
                        {generated.validationResult.issues.map((issue, idx) => (
                          <li key={`${issue.code}-${idx}`} className="text-sm">
                            <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'} className="mr-2">
                              {issue.severity}
                            </Badge>
                            <span className="font-mono text-xs mr-2">{issue.code}</span>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate a return to inspect validation results.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StatutoryReturns;
