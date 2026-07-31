import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../lib/utils';
import { safeFormatDate } from '../lib/dates';

type ForecastData = {
  date: string;
  balance: number;
  type: string;
};

interface CashFlowForecastChartProps {
  data: ForecastData[];
}

const CashFlowForecastChart = ({ data }: CashFlowForecastChartProps) => {
  if (!data || data.length === 0) return null;

  const formattedData = data.map(item => ({
    ...item,
    formattedDate: safeFormatDate(item.date, 'MMM d'),
  }));

  const minBalance = Math.min(...data.map(d => d.balance));
  const yAxisMin = minBalance < 0 ? minBalance * 1.1 : 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={formattedData}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="formattedDate" />
        <YAxis 
          domain={[yAxisMin, 'auto']} 
          tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`} 
        />
        <Tooltip 
          formatter={(value: number) => [formatCurrency(value), 'Projected Balance']}
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="#10b981"
          fillOpacity={1}
          fill="url(#colorBalance)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default CashFlowForecastChart;