import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { PayrollInsight } from '../../lib/payrollIntelligence';

type Props = { insights: PayrollInsight[] };

const TONE_STYLES: Record<PayrollInsight['tone'], string> = {
  danger: 'border-destructive/30',
  warning: 'border-warning/30',
  info: 'border-primary/20',
  success: 'border-success/30',
};

const PayrollAiInsights = ({ insights }: Props) => (
  <Card className="border-primary/20">
    <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </span>
      <div>
        <CardTitle className="text-base">Payroll Insights</CardTitle>
        <CardDescription>AI-assisted analysis — insights only, no data changes.</CardDescription>
      </div>
    </CardHeader>
    <CardContent>
      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">No insights to surface right now.</p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className={cn('rounded-lg border p-3', TONE_STYLES[insight.tone])}
            >
              <p className="text-sm font-medium">{insight.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{insight.message}</p>
              {insight.actionPath && insight.actionLabel && (
                <Button asChild variant="link" size="sm" className="h-auto p-0 mt-1">
                  <Link to={insight.actionPath}>
                    {insight.actionLabel}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default PayrollAiInsights;
