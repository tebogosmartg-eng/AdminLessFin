import { AlertTriangle, CheckCircle2, Clock, HelpCircle, MinusCircle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { APPLICABILITY_LABEL, SIGNAL_LABEL, statusLabel } from '../labels';
import type { Applicability, CycleView, TimeSignal } from '../types';

export function SignalBadge({ signal }: { signal: TimeSignal }) {
  if (signal === 'none') return null;
  return (
    <Badge
      variant={signal === 'due_soon' ? 'secondary' : 'destructive'}
      className={cn('gap-1', signal === 'due_soon' && 'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200')}
    >
      {signal === 'due_soon' ? <Clock className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {SIGNAL_LABEL[signal]}
    </Badge>
  );
}

export function CycleStatusBadge({ cycle }: { cycle: Pick<CycleView, 'status' | 'kind'> }) {
  const done = cycle.status === 'completed';
  const withdrawn = cycle.status === 'cancelled';
  return (
    <Badge variant={done ? 'default' : 'outline'} className={cn('gap-1', withdrawn && 'text-muted-foreground')}>
      {done && <CheckCircle2 className="h-3 w-3" />}
      {statusLabel(cycle.status, cycle.kind)}
    </Badge>
  );
}

export function ApplicabilityBadge({ value }: { value: Applicability }) {
  if (value === 'applicable') return null;
  return (
    <Badge variant="outline" className="gap-1">
      {value === 'needs_information' ? <HelpCircle className="h-3 w-3" /> : <MinusCircle className="h-3 w-3" />}
      {APPLICABILITY_LABEL[value]}
    </Badge>
  );
}
