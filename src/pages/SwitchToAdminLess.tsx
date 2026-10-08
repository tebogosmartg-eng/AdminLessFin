import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
import { BRAND } from '../config/brand';
import { useAuth } from '../contexts/AuthContext';
import { CompareCheck } from '../imports/components/CompareCheck';
import { useImportHistory, useImportSpec } from '../imports/queries';
import {
  SOURCES,
  SWITCH_STEPS,
  dayBefore,
  loadSwitchPlan,
  saveSwitchPlan,
  stepProgress,
  type SwitchPlan,
} from '../imports/switchPlan';

function resultLine(totals: { imported?: number; updated?: number; skipped?: number } | undefined, when: string | null): string {
  const t = totals ?? {};
  const parts = [
    t.imported ? `${t.imported} imported` : null,
    t.updated ? `${t.updated} updated` : null,
    t.skipped ? `${t.skipped} skipped` : null,
  ].filter(Boolean).join(', ');
  const date = when ? new Date(when).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return [parts || 'Imported', date].filter(Boolean).join(' · ');
}

const SwitchToAdminLess = () => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const history = useImportHistory(companyId);
  const spec = useImportSpec(companyId);
  const [plan, setPlan] = useState<SwitchPlan>({ source: null, switchDate: null });

  useEffect(() => {
    if (companyId) setPlan(loadSwitchPlan(companyId));
  }, [companyId]);

  const update = (next: Partial<SwitchPlan>) => {
    const merged = { ...plan, ...next };
    setPlan(merged);
    if (companyId) saveSwitchPlan(companyId, merged);
  };

  if (!companyId) return <p className="text-muted-foreground">Choose the company you are moving to {BRAND.product}.</p>;

  const sourceLabel = SOURCES.find(s => s.id === plan.source)?.label ?? 'your old system';
  const takeOnDate = plan.switchDate ? dayBefore(plan.switchDate) : null;
  const importSteps = SWITCH_STEPS.filter(s => s.entity);
  const required = importSteps.filter(s => !s.optional);
  const doneCount = required.filter(s => stepProgress(s, history.data?.runs).done).length;
  const nextStep = SWITCH_STEPS.find(s => s.entity && !s.optional && !stepProgress(s, history.data?.runs).done);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/import"><ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Import data</Link>
        </Button>
        <h1 className="text-3xl font-bold">Switch to {BRAND.product}</h1>
        <p className="text-muted-foreground">
          Bring your books across in the right order. Every file is checked before anything is saved, and the last step proves every balance matches your old system.
        </p>
      </div>

      <section className="grid gap-6 rounded-lg border p-5 sm:grid-cols-2" aria-label="Your switch">
        <div className="space-y-2">
          <Label>Moving from</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Moving from">
            {SOURCES.map(source => (
              <Button
                key={source.id}
                type="button"
                size="sm"
                role="radio"
                aria-checked={plan.source === source.id}
                variant={plan.source === source.id ? 'default' : 'outline'}
                onClick={() => update({ source: source.id })}
                data-testid={`switch-source-${source.id}`}
              >
                {source.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="switch-date">First day in {BRAND.product}</Label>
          <Input
            id="switch-date"
            type="date"
            className="max-w-xs"
            value={plan.switchDate ?? ''}
            onChange={e => update({ switchDate: e.target.value || null })}
          />
          <p className="text-xs text-muted-foreground">
            {takeOnDate
              ? `Balances are brought across as at ${takeOnDate}. Usually the first day of a month or financial year.`
              : 'Usually the first day of a month or financial year.'}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{doneCount} of {required.length} steps done</span>
          {nextStep && <span className="text-muted-foreground">Next: {nextStep.title}</span>}
        </div>
        <Progress value={(doneCount / required.length) * 100} aria-label="Switch progress" />
      </section>

      {history.isLoading || spec.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <ol className="space-y-3" data-testid="switch-steps">
          {SWITCH_STEPS.map((step, index) => {
            const progress = stepProgress(step, history.data?.runs);
            const needsDate = step.entity === 'opening_balances' && !takeOnDate;
            const params = new URLSearchParams({ type: step.entity ?? '', from: 'switch' });
            if (step.entity === 'opening_balances' && takeOnDate) params.set('as_at', takeOnDate);
            return (
              <li key={step.id} className="rounded-lg border p-4" data-testid={`switch-step-${step.id}`}>
                <div className="flex items-start gap-4">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    progress.done ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground'
                  }`}>
                    {progress.done ? <Check className="h-4 w-4" aria-label="Done" /> : index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{step.title}</h2>
                      {step.optional && <span className="text-xs text-muted-foreground">Optional</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{step.why}</p>
                    <p className="text-sm">{step.export(sourceLabel)}</p>
                    {progress.done && progress.lastRun && (
                      <p className="text-sm text-primary">Done — {resultLine(progress.lastRun.totals, progress.lastRun.committed_at)}</p>
                    )}
                  </div>
                  {step.entity && (
                    <div className="shrink-0">
                      {needsDate ? (
                        <span className="text-xs text-muted-foreground">Set the date above</span>
                      ) : (
                        <Button asChild size="sm" variant={progress.done ? 'outline' : 'default'}>
                          <Link to={`/import?${params.toString()}`}>{progress.done ? 'Import more' : 'Import'}</Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {!step.entity && spec.data && (
                  <div className="mt-4 border-t pt-4">
                    <CompareCheck
                      companyId={companyId}
                      asAtDate={takeOnDate}
                      fields={spec.data.compare_fields}
                      sourceLabel={sourceLabel}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default SwitchToAdminLess;
