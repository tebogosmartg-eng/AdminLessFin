import { Link } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { OperationalAlert } from '../../lib/payrollIntelligence';

type Props = { alerts: OperationalAlert[] };

const TONE = {
  danger: { icon: AlertTriangle, style: 'bg-destructive/10 text-destructive' },
  warning: { icon: AlertCircle, style: 'bg-warning/15 text-warning-foreground' },
  info: { icon: Info, style: 'bg-primary/10 text-primary' },
};

const PayrollAlerts = ({ alerts }: Props) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">Operational Alerts</CardTitle>
      <CardDescription>Prioritised by business risk.</CardDescription>
    </CardHeader>
    <CardContent>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No active alerts — payroll operations look healthy.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.slice(0, 5).map((alert) => {
            const meta = TONE[alert.tone];
            const Icon = meta.icon;
            return (
              <li key={alert.id} className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.style)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link to={alert.actionPath}>{alert.actionLabel}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default PayrollAlerts;
