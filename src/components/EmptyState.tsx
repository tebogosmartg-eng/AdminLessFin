import { LucideIcon, Inbox } from 'lucide-react';
import { cn } from '../lib/utils';

interface EmptyStateProps {
  /** Icon shown in the tinted circle. Defaults to an inbox. */
  icon?: LucideIcon;
  /** Short, human headline — e.g. "No invoices yet". */
  title: string;
  /** One supporting sentence explaining what to do next. */
  description?: string;
  /** Primary call-to-action (usually a <Button>). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Premium empty state — icon in a tinted circle, headline, supporting copy and
 * an optional primary action. Replaces the app's old one-line "No X found" dead
 * ends. Safe to drop inside a table cell (full width) or any container.
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center animate-fade-in', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
