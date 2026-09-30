import { BookOpen, ExternalLink, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../../components/ui/sheet';
import { formatDate } from '../labels';
import type { ObligationDetail } from '../types';

/**
 * The educational guidance for one obligation. All wording comes from the
 * published content via the API; none lives in components.
 */
export function GuidanceSheet({ detail }: { detail: ObligationDetail }) {
  const g = detail.guidance;
  const rule = detail.rule;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <BookOpen className="mr-2 h-4 w-4" /> Guidance
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{rule?.title ?? 'Guidance'}</SheetTitle>
          <SheetDescription>{rule?.due_rule}</SheetDescription>
        </SheetHeader>
        {!g ? (
          <p className="mt-6 text-sm text-muted-foreground">No guidance has been published for this obligation yet.</p>
        ) : (
          <div className="mt-6 space-y-5 text-sm">
            {rule && !rule.reviewed && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>This guidance has not yet been reviewed by a qualified professional. Confirm it before relying on it.</p>
              </div>
            )}
            <section>
              <h3 className="font-semibold">What is this?</h3>
              <p className="mt-1 text-muted-foreground">{g.what_is_this}</p>
            </section>
            <section>
              <h3 className="font-semibold">Why it matters</h3>
              <p className="mt-1 text-muted-foreground">{g.why_it_matters}</p>
            </section>
            <section>
              <h3 className="font-semibold">How to do it</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                {g.how_to_comply.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </section>
            {g.documents_needed.length > 0 && (
              <section>
                <h3 className="font-semibold">What you will need</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {g.documents_needed.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </section>
            )}
            <section>
              <h3 className="font-semibold">If it is not done</h3>
              <p className="mt-1 text-muted-foreground">{g.if_you_dont}</p>
            </section>
            <Button asChild variant="secondary" className="w-full">
              <a href={g.where_to_complete.url} target="_blank" rel="noopener noreferrer">
                {g.where_to_complete.label} <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">{g.disclaimer}</p>
            {rule?.provenance && (
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <p>
                  Source:{' '}
                  {rule.provenance.source_url ? (
                    <a className="underline" href={rule.provenance.source_url} target="_blank" rel="noopener noreferrer">
                      {rule.provenance.source_title}
                    </a>
                  ) : (
                    rule.provenance.source_title
                  )}
                </p>
                <p>
                  Guidance version {rule.version}
                  {rule.provenance.reviewed_by
                    ? ` · reviewed by ${rule.provenance.reviewed_by} on ${formatDate(rule.provenance.last_reviewed)}`
                    : ' · not yet reviewed'}
                  {rule.provenance.review_due ? ` · next review ${formatDate(rule.provenance.review_due)}` : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
