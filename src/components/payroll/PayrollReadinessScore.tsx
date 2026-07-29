import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { ReadinessResult } from '../../lib/payrollIntelligence';

type Props = {
  readiness: ReadinessResult;
  onEmployeeClick?: (employeeId: string) => void;
};

const STATUS_META = {
  ready: { icon: CheckCircle2, label: 'Ready', ring: 'text-success', bg: 'bg-success/10 border-success/30' },
  attention: { icon: AlertTriangle, label: 'Needs attention', ring: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
  blocked: { icon: XCircle, label: 'Not ready', ring: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
};

const PayrollReadinessScore = ({ readiness, onEmployeeClick }: Props) => {
  const navigate = useNavigate();
  const meta = STATUS_META[readiness.status];
  const Icon = meta.icon;

  return (
    <Card className={cn('border', meta.bg)}>
      <CardHeader className="pb-2">
        <CardDescription>Payroll Readiness Score</CardDescription>
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-4xl font-bold tabular-nums">{readiness.score}%</CardTitle>
            <span className={cn('text-sm font-semibold flex items-center gap-1', meta.ring)}>
              <Icon className="h-4 w-4" />
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {readiness.passedChecks}/{readiness.totalChecks} checks passed
          </p>
        </div>
      </CardHeader>
      {readiness.issues.length > 0 && (
        <CardContent className="pt-0">
          <p className="text-xs font-medium text-muted-foreground mb-2">Issues preventing payroll:</p>
          <ul className="space-y-1.5 max-h-32 overflow-y-auto">
            {readiness.issues.map((issue) => (
              <li key={issue.id} className="flex items-start justify-between gap-2 text-sm">
                <span>
                  <span className={cn(
                    'inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle',
                    issue.severity === 'critical' ? 'bg-destructive' : issue.severity === 'warning' ? 'bg-warning' : 'bg-muted-foreground'
                  )} />
                  <span className="font-medium">{issue.label}</span>
                  <span className="text-muted-foreground"> — {issue.detail}</span>
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 shrink-0"
                  onClick={() => {
                    if (issue.employeeId && onEmployeeClick) onEmployeeClick(issue.employeeId);
                    else navigate(issue.actionPath);
                  }}
                >
                  Fix
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
};

export default PayrollReadinessScore;
