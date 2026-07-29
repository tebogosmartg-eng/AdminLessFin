import { Link } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ArrowRight,
  FileText,
  Receipt,
  Scale,
  Settings2,
  Building2,
  Landmark,
} from 'lucide-react';
import { BRAND } from '@/config/brand';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ONBOARDING_STEPS } from '@/lib/onboarding/copy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

const OnboardingGuide = () => {
  useDocumentTitle('Onboarding Guide');

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <BookOpen className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">Private Beta</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding Guide</h1>
        <p className="text-muted-foreground">
          Everything a finance professional needs to go from sign-up to first financial statements
          in {BRAND.product} — without developer assistance.
        </p>
      </header>

      <Alert>
        <AlertTitle>Recommended path</AlertTitle>
        <AlertDescription>
          Complete steps in order. Accounting Setup must reach <strong>Accounting Ready</strong>{' '}
          before you can invoice, post journals, or generate financial statements.
        </AlertDescription>
      </Alert>

      {/* Journey overview */}
      <Card>
        <CardHeader>
          <CardTitle>Your onboarding journey</CardTitle>
          <CardDescription>Five stages from account creation to operational accounting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ONBOARDING_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3 text-sm">
              <Badge variant="outline" className="h-6 w-6 shrink-0 justify-center rounded-full p-0">
                {i + 1}
              </Badge>
              <span>{step}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Phase 1: Account & company */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Phase 1 — Account & company</h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" /> Create account and company
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Go to <Link to="/auth" className="font-medium text-foreground underline">Sign in</Link>{' '}
                and create your account (or sign in if you already have one).
              </li>
              <li>Verify your email if prompted by the sign-up confirmation message.</li>
              <li>
                Enter your company name at{' '}
                <Link to="/create-company" className="font-medium text-foreground underline">
                  Create company
                </Link>
                . You are redirected automatically to Accounting Setup.
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Phase 2: Accounting Setup */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Phase 2 — Accounting Setup</h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5" /> Complete all six setup steps
            </CardTitle>
            <CardDescription>
              Open{' '}
              <Link to="/accounting-setup" className="underline">
                Accounting Setup
              </Link>{' '}
              from the dashboard or sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {[
              {
                title: 'Financial Calendar',
                body: 'Set your financial year end date and save. An active financial year is created automatically.',
              },
              {
                title: 'Chart of Accounts',
                body: 'Click Generate Standard (recommended). This creates all ledger accounts and control accounts required for posting.',
              },
              {
                title: 'Tax',
                body: 'Add at least one tax rate — e.g. VAT at 15%. Go to Tax Rates, add the rate, then return to Accounting Setup.',
              },
              {
                title: 'Banking',
                body: 'Add a bank account or click Skip banking for now if you will configure this later.',
              },
              {
                title: 'Opening Balances',
                body: 'For a new company, click Confirm opening balances are zero. For migrations, post opening balances on each bank account first.',
              },
              {
                title: 'Validation',
                body: 'Review all checks. When every rule shows Complete, Accounting Ready is granted.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* First day checklist */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">First-day checklist</h2>
        <Card>
          <CardHeader>
            <CardTitle>After Accounting Ready</CardTitle>
            <CardDescription>Use the dashboard Getting Started Checklist to track progress.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              'Add your first customer (Sales → Customers)',
              'Add your first supplier (Purchasing → Suppliers)',
              'Create your first invoice',
              'Record your first supplier bill',
              'View the Trial Balance to verify balances',
              'Generate Financial Statements (Income Statement, Balance Sheet, Cash Flow)',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Walkthroughs */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Walkthroughs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Receipt className="h-5 w-5" /> First invoice
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Ensure Accounting Ready is complete.</li>
                <li>
                  Go to <Link to="/customers" className="underline">Customers</Link> and add a customer.
                </li>
                <li>
                  Go to <Link to="/invoices" className="underline">Invoices</Link> → New Invoice.
                </li>
                <li>Select the customer, add line items, and apply a tax rate.</li>
                <li>Save — a journal entry posts automatically to Accounts Receivable and revenue.</li>
                <li>
                  Check <Link to="/trial-balance" className="underline">Trial Balance</Link> to see updated balances.
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Landmark className="h-5 w-5" /> First journal entry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Most activity starts with invoices or bills — use manual journals for adjustments only.</li>
                <li>
                  Go to <Link to="/journal-entries" className="underline">Journal Entries</Link> → New Entry.
                </li>
                <li>Enter the date, description, and balanced debit/credit lines.</li>
                <li>Select accounts from your Chart of Accounts for each line.</li>
                <li>Save — the entry posts through the certified posting engine.</li>
                <li>Verify in Trial Balance and General Ledger.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Troubleshooting</h2>
        <Card>
          <CardContent className="space-y-4 pt-6 text-sm">
            {[
              {
                q: 'Invoices or journals are blocked',
                a: 'Accounting Setup is incomplete. Open Accounting Setup from the dashboard and resolve any pending steps — especially Tax (at least one rate required).',
              },
              {
                q: 'Bill save fails with an error',
                a: 'Complete Accounting Setup first. Bills are accessible before setup but posting requires a validated chart, tax, and financial year.',
              },
              {
                q: 'Trial Balance is empty',
                a: 'No transactions have posted yet. Create an invoice or bill after Accounting Ready, then refresh the Trial Balance.',
              },
              {
                q: 'Tax step will not complete',
                a: 'Add at least one tax rate at Tax Rates (e.g. VAT 15%), then click Refresh on Accounting Setup.',
              },
              {
                q: 'Chart of Accounts step fails validation',
                a: 'Use Generate Standard. If importing, ensure mandatory control accounts exist (Trade Debtors, Trade Creditors, VAT, Bank, Retained Earnings).',
              },
            ].map((item) => (
              <div key={item.q} className="border-b pb-4 last:border-0">
                <p className="font-medium text-foreground">{item.q}</p>
                <p className="mt-1 text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/accounting-setup">
            Start Accounting Setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/manual">Full user manual</Link>
        </Button>
      </div>
    </div>
  );
};

export default OnboardingGuide;
