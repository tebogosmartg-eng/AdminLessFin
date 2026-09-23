import { CheckCircle2, ChevronRight, CircleAlert, OctagonAlert, TriangleAlert } from 'lucide-react';
import {
  assessReadiness,
  READINESS_LABEL,
  type ReadinessIssue,
  type ReadinessLocation,
  type ReadinessState,
} from '../../../lib/financialStatements/readiness';
import type { DocumentModel } from '../../../lib/financialStatements/document/documentModel';
import { cn } from '../../../lib/utils';

const TONE: Record<ReadinessState, { icon: typeof CheckCircle2; className: string }> = {
  ready: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  warning: { icon: TriangleAlert, className: 'text-amber-600 dark:text-amber-400' },
  action_required: { icon: CircleAlert, className: 'text-amber-700 dark:text-amber-300' },
  blocked: { icon: OctagonAlert, className: 'text-destructive' },
};

const HEADLINE: Record<ReadinessState, string> = {
  ready: 'Nothing outstanding that we can detect.',
  warning: 'These can be issued, but a reviewer will ask about the following.',
  action_required: 'These need something from you before they are complete.',
  blocked: 'These cannot be issued as they stand.',
};

function IssueRow({
  issue,
  onOpen,
}: {
  issue: ReadinessIssue;
  onOpen?: (location: ReadinessLocation) => void;
}) {
  const tone = TONE[issue.state];
  const Icon = tone.icon;
  const clickable = !!issue.location && !!onOpen;
  return (
    <li>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => issue.location && onOpen?.(issue.location)}
        data-testid="afs-readiness-issue"
        className={cn(
          'flex w-full items-start gap-3 rounded-md border p-3 text-left',
          clickable && 'hover:border-foreground/30 hover:bg-muted/40',
          !clickable && 'cursor-default',
        )}
      >
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.className)} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{issue.title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{issue.detail}</span>
        </span>
        {clickable && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
    </li>
  );
}

/**
 * Whether these statements are fit to issue, and what to do about it.
 *
 * One state, one sentence, and a list you can click into — rather than a score
 * out of a hundred and four tiles of counts, which told a preparer that
 * something was wrong somewhere but never where.
 */
export default function ReadinessReview({
  model,
  onOpen,
}: {
  model: DocumentModel;
  onOpen?: (location: ReadinessLocation) => void;
}) {
  const readiness = assessReadiness(model);
  const tone = TONE[readiness.state];
  const Icon = tone.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="afs-readiness">
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-1 h-6 w-6 shrink-0', tone.className)} />
        <div className="min-w-0">
          <h2
            className={cn('text-xl font-semibold tracking-tight', tone.className)}
            data-testid="afs-readiness-state"
          >
            {READINESS_LABEL[readiness.state]}
          </h2>
          <p className="text-sm text-muted-foreground">{HEADLINE[readiness.state]}</p>
        </div>
      </div>

      {readiness.issues.length > 0 && (
        <ul className="space-y-2">
          {readiness.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onOpen={onOpen} />
          ))}
        </ul>
      )}

      <p className="border-t pt-4 text-xs text-muted-foreground">
        These checks read the statements on screen: that the balance sheet balances, that the result
        agrees between statements, that every account reaches a heading, that comparatives are
        present and that the framework&rsquo;s required notes are written. They are not an audit, and
        passing them is not an opinion on the financial statements.
      </p>
    </div>
  );
}
