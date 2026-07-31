import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

type ChartData = {
  month_start: string;
  total_income: number;
  total_expenses: number;
};

interface IncomeExpenseChartProps {
  data: ChartData[];
}

const IncomeExpenseChart = ({ data }: IncomeExpenseChartProps) => {
  const formattedData = data.map(item => ({
    ...item,
    month: format(new Date(item.month_start), 'MMM yyyy'),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={formattedData}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(value) => `R${value / 1000}k`} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
        />
        <Legend />
        {/* Recharts animates each series by re-rendering it every frame for
            1.5 s. On a dashboard with four charts that produced a measured 92
            React commits per load (vs ~16 on non-charting workspaces) and kept
            the page visually unstable long after the data had arrived. Values,
            axes, colours and tooltips are unchanged — only the entry animation
            is skipped, so the final rendering is identical. */}
        <Bar dataKey="total_income" fill="#16a34a" name="Income" isAnimationActive={false} />
        <Bar dataKey="total_expenses" fill="#dc2626" name="Expenses" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default IncomeExpenseChart;