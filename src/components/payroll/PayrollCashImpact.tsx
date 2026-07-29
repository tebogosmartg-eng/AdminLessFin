import { Wallet, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { cn, formatCurrency } from '../../lib/utils';
import type { CashImpact } from '../../lib/payrollIntelligence';

type Props = { cash: CashImpact };

const HEALTH_STYLES = {
  healthy: { icon: TrendingUp, color: 'text-success', border: 'border-success/30 bg-success/5' },
  caution: { icon: Minus, color: 'text-warning', border: 'border-warning/30 bg-warning/5' },
  critical: { icon: TrendingDown, color: 'text-destructive', border: 'border-destructive/30 bg-destructive/5' },
};

const PayrollCashImpact = ({ cash }: Props) => {
  const meta = HEALTH_STYLES[cash.health];
  const Icon = meta.icon;

  const rows = [
    { label: 'Current Cash', value: cash.currentCash, sign: null },
    { label: 'Estimated Payroll', value: -cash.estimatedPayroll, sign: '−' as const },
    { label: 'Upcoming Bills', value: -cash.upcomingBills, sign: '−' as const },
    ...(cash.upcomingTax > 0 ? [{ label: 'Upcoming Tax', value: -cash.upcomingTax, sign: '−' as const }] : []),
  ];

  return (
    <Card className={cn('border', meta.border)}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" />
          Cash Impact Preview
        </CardDescription>
        <CardTitle className={cn('text-base flex items-center gap-2', meta.color)}>
          <Icon className="h-4 w-4" />
          {cash.healthLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-mono">
              {row.sign}{formatCurrency(Math.abs(row.value))}
            </span>
          </div>
        ))}
        <div className="border-t pt-2 flex justify-between font-semibold">
          <span>Remaining Cash</span>
          <span className={cn('font-mono', cash.remainingCash < 0 ? 'text-destructive' : '')}>
            {formatCurrency(cash.remainingCash)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default PayrollCashImpact;
