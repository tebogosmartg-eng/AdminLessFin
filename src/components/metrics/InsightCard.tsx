import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export type InsightItem = {
  id: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
};

type Props = {
  insights: InsightItem[];
  title?: string;
  subtitle?: string;
};

const TONE: Record<InsightItem['tone'], string> = {
  danger: 'border-destructive/30 bg-destructive/5',
  warning: 'border-warning/30 bg-warning/5',
  info: 'border-primary/20 bg-primary/[0.03]',
  success: 'border-success/30 bg-success/5',
};

/** Practical, plain-language insight list. */
const InsightCard = ({
  insights,
  title = 'What needs attention',
  subtitle = 'Simple tips based on your invoices and customers.',
}: Props) => (
  <Card className="border-primary/20">
    <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </span>
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </div>
    </CardHeader>
    <CardContent>
      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">No action required today.</p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight) => (
            <li key={insight.id} className={cn('rounded-lg border p-3', TONE[insight.tone])}>
              <p className="text-sm">{insight.message}</p>
              {insight.onAction && insight.actionLabel ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0"
                  onClick={insight.onAction}
                >
                  {insight.actionLabel}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              ) : insight.actionTo && insight.actionLabel ? (
                <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0">
                  <Link to={insight.actionTo}>
                    {insight.actionLabel}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default InsightCard;
