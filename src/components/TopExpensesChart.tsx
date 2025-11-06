import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../lib/utils';

type ChartData = {
  account_name: string;
  total_amount: number;
};

interface TopExpensesChartProps {
  data: ChartData[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const TopExpensesChart = ({ data }: TopExpensesChartProps) => {
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8 h-[300px] flex items-center justify-center">No expense data for the current period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={100}
          fill="#8884d8"
          dataKey="total_amount"
          nameKey="account_name"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default TopExpensesChart;