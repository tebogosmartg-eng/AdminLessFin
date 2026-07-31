import { Link } from 'react-router-dom';
import { ArrowLeftRight, Landmark, FileCheck2 } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { SectionErrorBoundary } from '../../components/ErrorBoundary';
import ReportingPeriodPicker from '../../components/ReportingPeriodPicker';
import SubLedgerReconciliationPanel from '../../components/accounting/SubLedgerReconciliationPanel';

/**
 * Reconciliation Centre — navigation hub only.
 * Does NOT redesign Banking or book reconciliation engines.
 */
const ReconciliationCentre = () => {
  useDocumentTitle('Reconciliation Centre');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileCheck2 className="h-7 w-7" /> Reconciliation Centre
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connected entry points to book and bank reconciliation — engines unchanged.
          </p>
        </div>
        {/* Period comes from the canonical reporting authority, so the controls
            below are evaluated over the same window as every other module. */}
        <ReportingPeriodPicker />
      </div>

      {/* Read-only controls: they expose sub-ledger vs GL differences and
          change no accounting figure. Boundaried so a feed failure degrades
          this panel rather than the page. */}
      <SectionErrorBoundary
        title="Reconciliation controls unavailable"
        description="One of the ledger or sub-ledger feeds could not be loaded. Accounting figures elsewhere are unaffected."
      >
        <SubLedgerReconciliationPanel />
      </SectionErrorBoundary>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Book Reconciliation
            </CardTitle>
            <CardDescription>Clear journal lines against statements for GL accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/reconciliation">Open Book Reconcile</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Bank Reconciliation
            </CardTitle>
            <CardDescription>Banking domain reconciliation (frozen module — open existing workspace)</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/banking/reconciliation">Open Bank Reconciliation</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReconciliationCentre;
