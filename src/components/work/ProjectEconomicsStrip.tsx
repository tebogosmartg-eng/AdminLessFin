import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { formatCurrency } from '../../lib/utils';

export type ProjectEconomics = {
  contractValue?: number;
  revenueEarnedGl?: number;
  revenueRemaining?: number;
  actualCostsGl?: number;
  operationalBurn?: number;
  labourCost?: number;
  resourceBurn?: number;
  forecastCost?: number;
  forecastProfit?: number;
  forecastMargin?: number;
  budgetRemaining?: number;
  operationalMargin?: number;
  billableValue?: number;
  cashReceived?: number;
  outstandingDebtors?: number;
};

const METRICS: Array<{ key: keyof ProjectEconomics; label: string; format?: 'currency' | 'percent' }> = [
  { key: 'contractValue', label: 'Contract Value' },
  { key: 'revenueEarnedGl', label: 'Revenue Earned (GL)' },
  { key: 'revenueRemaining', label: 'Revenue Remaining' },
  { key: 'actualCostsGl', label: 'Actual Costs GL' },
  { key: 'operationalBurn', label: 'Operational Burn' },
  { key: 'labourCost', label: 'Labour Cost' },
  { key: 'resourceBurn', label: 'Resource Burn' },
  { key: 'forecastCost', label: 'Forecast Cost' },
  { key: 'forecastProfit', label: 'Forecast Profit' },
  { key: 'forecastMargin', label: 'Forecast Margin', format: 'percent' },
  { key: 'budgetRemaining', label: 'Budget Remaining' },
  { key: 'operationalMargin', label: 'Operational Margin' },
];

type Props = {
  economics?: ProjectEconomics | null;
  className?: string;
};

export default function ProjectEconomicsStrip({ economics, className }: Props) {
  const e = economics || {};

  return (
    <div className={className ?? 'grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'}>
      {METRICS.map(({ key, label, format }) => {
        const raw = Number(e[key] ?? 0);
        const value = format === 'percent' ? `${raw.toFixed(1)}%` : formatCurrency(raw);
        return (
          <Card key={key}>
            <CardHeader className="space-y-0 pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-lg font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
