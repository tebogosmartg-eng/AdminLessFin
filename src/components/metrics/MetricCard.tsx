import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../../lib/utils';

type Props = {
  label: string;
  value: ReactNode;
  onClick: () => void;
  hint?: string;
  destructive?: boolean;
  className?: string;
};

/** Simple clickable KPI — one job: show a number and open a drawer. */
const MetricCard = ({ label, value, onClick, hint, destructive, className }: Props) => (
  <Card
    role="button"
    tabIndex={0}
    aria-label={`${label}. ${hint ?? 'Open details'}`}
    className={cn(
      'group cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      destructive && 'border-destructive/50',
      className,
    )}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
  >
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-2">
        <CardDescription>{label}</CardDescription>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <CardTitle className={cn('text-2xl', destructive && 'text-destructive')}>{value}</CardTitle>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </CardHeader>
  </Card>
);

export default MetricCard;
