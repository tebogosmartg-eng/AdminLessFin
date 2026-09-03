import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { CheckCircle2, Circle, ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface SetupChecklistProps {
  status: {
    hasLogo: boolean;
    hasAddress: boolean;
    hasCustomer: boolean;
    hasVendor: boolean;
    hasTransaction: boolean;
    isComplete: boolean;
  };
}

/**
 * Post-setup checklist — shown only after Accounting Ready.
 * Guides owners through branding, master data, and first transactions.
 */
const SetupChecklist = ({ status }: SetupChecklistProps) => {
  if (status.isComplete) return null;

  const steps = [
    { label: 'Upload company logo', done: status.hasLogo, link: '/settings', detail: 'Optional — appears on invoices and reports.' },
    { label: 'Set company address', done: status.hasAddress, link: '/settings?tab=master-data&module=addresses', detail: 'Used on invoices and financial statements.' },
    { label: 'Add your first customer', done: status.hasCustomer, link: '/customers', detail: 'Required before you can issue an invoice.' },
    { label: 'Add your first supplier', done: status.hasVendor, link: '/vendors', detail: 'Required before you can record a supplier bill.' },
    {
      label: 'Record your first invoice or bill',
      done: status.hasTransaction,
      link: '/invoices',
      detail: 'Creates your first journal entry in the ledger.',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Getting Started Checklist</CardTitle>
            <CardDescription>
              Your accounting foundation is ready. Complete these steps to become fully operational.
            </CardDescription>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium">
              {completedCount} of {steps.length} complete
            </span>
          </div>
        </div>
        <Progress value={progress} className="mt-2 h-2" />
      </CardHeader>
      <CardContent className="grid gap-1">
        {steps.map((step, idx) => (
          <Link
            key={idx}
            to={step.link}
            className={cn(
              'flex items-start justify-between gap-3 rounded-md p-2 transition-colors hover:bg-white/50 dark:hover:bg-white/5',
              step.done ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            <div className="flex items-start gap-3">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
              )}
              <div>
                <span className={cn('block', !step.done && 'font-medium')}>{step.label}</span>
                {!step.done && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{step.detail}</span>
                )}
              </div>
            </div>
            {!step.done && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
          </Link>
        ))}
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/onboarding-guide">
              <BookOpen className="mr-2 h-4 w-4" />
              Onboarding guide
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SetupChecklist;
